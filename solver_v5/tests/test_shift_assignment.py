
import unittest
from ortools.sat.python import cp_model
from core.index import ShiftIndex, AssignmentIndex
from core.context import SolverContext
from constraints.shift_assignment import ShiftAssignmentConstraint
from contracts.request import SolverRequest, OperationDemand, EmployeeProfile, ShiftDefinition, PositionQualification
from datetime import datetime
from utils.time_utils import combine_date_time_to_unix

class TestShiftAssignmentConstraint(unittest.TestCase):
    def setUp(self):
        self.model = cp_model.CpModel()
        self.shift_defs = [
            ShiftDefinition(
                shift_id=1, shift_code="D", shift_name="Day", 
                start_time="08:00", end_time="17:00", 
                nominal_hours=8, is_night_shift=False
            ),
            ShiftDefinition(
                shift_id=2, shift_code="N", shift_name="Night", 
                start_time="22:00", end_time="06:00", 
                nominal_hours=8, is_night_shift=True
            ),
            ShiftDefinition(
                shift_id=99, shift_code="R", shift_name="Rest",
                start_time="00:00", end_time="00:00",
                nominal_hours=0, is_night_shift=False
            )
        ]
        self.emp = EmployeeProfile(
            employee_id=101, employee_code="E01", employee_name="TestEmp",
            qualifications=[], unavailable_periods=[]
        )
        self.window = {"start_date": "2023-10-01", "end_date": "2023-10-02"}

    def _create_solver(self, model):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 1
        return solver

    def test_day_shift_coverage(self):
        """Task at 10:00 should require Day Shift"""
        # Op: 10:00 - 11:00 (Day 1)
        import utils.time_utils 
        # Mock time utils to ensure deterministic testing if needed, 
        # but here we rely on the actual implementation which is pure logic.
        
        op = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="DayTask",
            planned_start="2023-10-01T02:00:00Z", planned_end="2023-10-01T03:00:00Z",
            planned_duration_minutes=60, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        
        req = SolverRequest(
            request_id="test1", window=self.window, 
            operation_demands=[op], employee_profiles=[self.emp], 
            calendar=[], shift_definitions=self.shift_defs, shared_preferences=[]
        )
        
        assignments = {}
        assignments[(1, 1, 101)] = self.model.NewBoolVar("Assign_Op1")
        
        # Shift vars for 10-01
        shift_assignments = {}
        # 10-01: Day, Night, Rest
        shift_vars = {}
        for s in self.shift_defs:
            v = self.model.NewBoolVar(f"Shift_10_01_{s.shift_code}")
            shift_assignments[(101, "2023-10-01", s.shift_id)] = v
            shift_vars[s.shift_id] = v
            
        # One shift per day constraint (usually added by Constraint, but we add simplified one here or let constraint do it)
        # ShiftAssignmentConstraint adds One-Shift-Per-Day rule.
        
        index = AssignmentIndex(assignments)
        shift_index = ShiftIndex(req)
        
        constraint = ShiftAssignmentConstraint()
        ctx = SolverContext(model=self.model, assignments=assignments, index=index,
                            shift_assignments=shift_assignments, shift_index=shift_index)
        constraint.apply(ctx, req)
        
        # Force Assignment = 1
        self.model.Add(assignments[(1, 1, 101)] == 1)
        
        solver = self._create_solver(self.model)
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.OPTIMAL)
        # If assigned, should be Day Shift (ID 1)
        self.assertEqual(solver.Value(shift_vars[1]), 1) 
        self.assertEqual(solver.Value(shift_vars[2]), 0) # Not Night

    def test_cross_day_night_shift(self):
        """Task at 02:00 Day 2 should require Night Shift from Day 1"""
        # Op: 02:00 - 05:00 (Day 2), covered by Night Shift of Day 1 (22:00 D1 - 06:00 D2)
        op = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="NightTask",
            planned_start="2023-10-01T18:00:00Z", planned_end="2023-10-01T21:00:00Z",
            planned_duration_minutes=180, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        
        req = SolverRequest(
            request_id="test2", window=self.window, 
            operation_demands=[op], employee_profiles=[self.emp], 
            calendar=[], shift_definitions=self.shift_defs, shared_preferences=[]
        )
        
        assignments = {}
        assignments[(2, 1, 101)] = self.model.NewBoolVar("Assign_Op2")
        
        shift_assignments = {}
        
        # Variables for Day 1 (Source of Night Shift)
        s1_night = self.model.NewBoolVar("Shift_D1_Night")
        shift_assignments[(101, "2023-10-01", 2)] = s1_night
        # Fill others to avoid errors if logic checks strict coverage
        shift_assignments[(101, "2023-10-01", 1)] = self.model.NewBoolVar("Shift_D1_Day") 
        shift_assignments[(101, "2023-10-01", 99)] = self.model.NewBoolVar("Shift_D1_Rest")
        
        # Variables for Day 2 (Target Day of Task)
        s2_day = self.model.NewBoolVar("Shift_D2_Day")
        s2_night = self.model.NewBoolVar("Shift_D2_Night")
        shift_assignments[(101, "2023-10-02", 1)] = s2_day
        shift_assignments[(101, "2023-10-02", 2)] = s2_night
        shift_assignments[(101, "2023-10-02", 99)] = self.model.NewBoolVar("Shift_D2_Rest")
        
        constraint = ShiftAssignmentConstraint()
        idx = AssignmentIndex(assignments)
        s_idx = ShiftIndex(req)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments=shift_assignments, shift_index=s_idx)
        constraint.apply(ctx, req)
        
        # Force Assignment
        self.model.Add(assignments[(2, 1, 101)] == 1)
        
        solver = self._create_solver(self.model)
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.OPTIMAL)
        # Must be D1 Night Shift
        self.assertEqual(solver.Value(s1_night), 1)
        # Cannot be D2 Day/Night (doesn't cover 02:00-05:00 on D2, unless D2 Night covers D3 morning)
        # Specifically, ensure D1 Night is selected.

    def test_infeasible_no_coverage(self):
        """Task not covered by any shift should be impossible"""
        # Op: 18:00 - 19:00 Beijing (Gap between Day 17:00 and Night 22:00)
        # 18:00 Beijing = 10:00 UTC
        op = OperationDemand(
            operation_plan_id=3, batch_id=1, batch_code="B1", operation_id=3, operation_name="GapTask",
            planned_start="2023-10-01T10:00:00Z", planned_end="2023-10-01T11:00:00Z",
            planned_duration_minutes=60, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        
        req = SolverRequest(
            request_id="test3", window=self.window, 
            operation_demands=[op], employee_profiles=[self.emp], 
            calendar=[], shift_definitions=self.shift_defs, shared_preferences=[]
        )
        
        assignments = {}
        assign_var = self.model.NewBoolVar("Assign_Op3")
        assignments[(3, 1, 101)] = assign_var
        
        shift_assignments = {}
        for d in ["2023-10-01", "2023-10-02"]:
            for s in self.shift_defs:
                shift_assignments[(101, d, s.shift_id)] = self.model.NewBoolVar(f"S_{d}_{s.shift_code}")

        constraint = ShiftAssignmentConstraint()
        idx = AssignmentIndex(assignments)
        s_idx = ShiftIndex(req)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments=shift_assignments, shift_index=s_idx)
        constraint.apply(ctx, req)
        
        # If we try to force assignment, it should be infeasible
        # But wait, assign_var is not forced by `apply` (only forced to 0 if NO shifts).
        # Check if assign_var is forced to 0
        
        self.model.Add(assign_var == 1)
        solver = self._create_solver(self.model)
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.INFEASIBLE)

    def test_idle_work_allowed(self):
        """User allows 'Idle Work' (Work shift without tasks)"""
        # No Ops
        req = SolverRequest(
            request_id="test4", window=self.window, 
            operation_demands=[], employee_profiles=[self.emp], 
            calendar=[], shift_definitions=self.shift_defs, shared_preferences=[]
        )
        
        assignments = {} # None
        shift_assignments = {}
        
        # Day 1 Shift Vars
        day_shift = self.model.NewBoolVar("D1_Day")
        night_shift = self.model.NewBoolVar("D1_Night")
        rest_shift = self.model.NewBoolVar("D1_Rest")
        shift_assignments[(101, "2023-10-01", 1)] = day_shift
        shift_assignments[(101, "2023-10-01", 2)] = night_shift
        shift_assignments[(101, "2023-10-01", 99)] = rest_shift
        
        constraint = ShiftAssignmentConstraint()
        idx = AssignmentIndex(assignments)
        s_idx = ShiftIndex(req)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments=shift_assignments, shift_index=s_idx)
        constraint.apply(ctx, req)
        
        # Force Day Shift (Idle Work)
        self.model.Add(day_shift == 1)
        
        solver = self._create_solver(self.model)
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(solver.Value(day_shift), 1)

if __name__ == '__main__':
    unittest.main()
