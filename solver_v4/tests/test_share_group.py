import unittest
from ortools.sat.python import cp_model
from core.index import AssignmentIndex
from core.context import SolverContext
from constraints.share_group import ShareGroupConstraint
from constraints.unique_employee import UniqueEmployeeConstraint
from contracts.request import SolverRequest, OperationDemand, PositionQualification, SharedPreference
import logging

class TestShareGroupConstraint(unittest.TestCase):
    def setUp(self):
        self.model = cp_model.CpModel()
        # Suppress logging for cleaner test output
        self.logger = logging.getLogger("Test")
        self.logger.setLevel(logging.WARNING)

    def _create_solver(self):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 1
        return solver

    def test_same_team_equal(self):
        """Testing equal rule: Op1 (2 people) and Op2 (2 people) must have the EXACT SAME team."""
        # Op1: positions 1, 2. Candidates: 101, 102, 103
        op1 = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="Op1",
            planned_start="2023-10-01T10:00:00Z", planned_end="2023-10-01T12:00:00Z",
            planned_duration_minutes=120, required_people=2,
            position_qualifications=[
                PositionQualification(1, [], [101, 102, 103]),
                PositionQualification(2, [], [101, 102, 103])
            ]
        )
        # Op2: positions 1, 2. Candidates: 101, 102, 103
        op2 = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="Op2",
            planned_start="2023-10-01T13:00:00Z", planned_end="2023-10-01T15:00:00Z",
            planned_duration_minutes=120, required_people=2,
            position_qualifications=[
                PositionQualification(1, [], [101, 102, 103]),
                PositionQualification(2, [], [101, 102, 103])
            ]
        )
        
        req = SolverRequest(
            request_id="test_equal", window={"start_date": "2023-10-01", "end_date": "2023-10-01"},
            operation_demands=[op1, op2], employee_profiles=[], calendar=[], shift_definitions=[],
            shared_preferences=[
                SharedPreference(1, "Group1", [
                    {"operation_plan_id": 1, "required_people": 2},
                    {"operation_plan_id": 2, "required_people": 2}
                ])
            ]
        )

        assignments = {}
        for op_id in (1, 2):
            for pos in (1, 2):
                for emp_id in (101, 102, 103):
                    assignments[(op_id, pos, emp_id)] = self.model.NewBoolVar(f"A_{op_id}_{pos}_{emp_id}")
                    
        # Basic scheduling rules (1 person per position, 1 position per person per op)
        for op_id in (1, 2):
            for pos in (1, 2):
                self.model.AddExactlyOne(assignments[(op_id, pos, emp)] for emp in (101, 102, 103))
            for emp in (101, 102, 103):
                self.model.AddAtMostOne(assignments[(op_id, pos, emp)] for pos in (1, 2))

        idx = AssignmentIndex(assignments)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments={}, shift_index=None, config={})
        
        ShareGroupConstraint(logger=self.logger).apply(ctx, req)
        
        # Force Op1 to use 101 and 102
        self.model.Add(assignments[(1, 1, 101)] == 1)
        self.model.Add(assignments[(1, 2, 102)] == 1)
        
        solver = self._create_solver()
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.OPTIMAL)
        
        # Op2 MUST use 101 and 102, and MUST NOT use 103
        op2_101 = solver.Value(assignments[(2, 1, 101)]) + solver.Value(assignments[(2, 2, 101)])
        op2_102 = solver.Value(assignments[(2, 1, 102)]) + solver.Value(assignments[(2, 2, 102)])
        op2_103 = solver.Value(assignments[(2, 1, 103)]) + solver.Value(assignments[(2, 2, 103)])
        
        self.assertEqual(op2_101, 1)
        self.assertEqual(op2_102, 1)
        self.assertEqual(op2_103, 0)

    def test_same_team_subset(self):
        """Testing subset rule: Op1 (1 person) must be a SUBSET of Op2 (2 people)."""
        op1 = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="Op1",
            planned_start="2023-10-01T10:00:00Z", planned_end="2023-10-01T12:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101, 102, 103])]
        )
        op2 = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="Op2",
            planned_start="2023-10-01T13:00:00Z", planned_end="2023-10-01T15:00:00Z",
            planned_duration_minutes=120, required_people=2,
            position_qualifications=[
                PositionQualification(1, [], [101, 102, 103]),
                PositionQualification(2, [], [101, 102, 103])
            ]
        )
        
        req = SolverRequest(
            request_id="test_subset", window={"start_date": "2023-10-01", "end_date": "2023-10-01"},
            operation_demands=[op1, op2], employee_profiles=[], calendar=[], shift_definitions=[],
            shared_preferences=[
                SharedPreference(1, "Group1", [
                    {"operation_plan_id": 1, "required_people": 1},
                    {"operation_plan_id": 2, "required_people": 2}
                ])
            ]
        )

        assignments = {}
        for emp_id in (101, 102, 103):
            assignments[(1, 1, emp_id)] = self.model.NewBoolVar(f"A_1_1_{emp_id}")
            assignments[(2, 1, emp_id)] = self.model.NewBoolVar(f"A_2_1_{emp_id}")
            assignments[(2, 2, emp_id)] = self.model.NewBoolVar(f"A_2_2_{emp_id}")

        self.model.AddExactlyOne(assignments[(1, 1, emp)] for emp in (101, 102, 103))
        for pos in (1, 2):
            self.model.AddExactlyOne(assignments[(2, pos, emp)] for emp in (101, 102, 103))
        for emp in (101, 102, 103):
            self.model.AddAtMostOne(assignments[(2, pos, emp)] for pos in (1, 2))

        idx = AssignmentIndex(assignments)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments={}, shift_index=None, config={})
        
        ShareGroupConstraint(logger=self.logger).apply(ctx, req)
        
        # Force Op1 to use 103
        self.model.Add(assignments[(1, 1, 103)] == 1)
        
        solver = self._create_solver()
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.OPTIMAL)
        
        # Op2 MUST include 103
        op2_103 = solver.Value(assignments[(2, 1, 103)]) + solver.Value(assignments[(2, 2, 103)])
        self.assertEqual(op2_103, 1)

    def test_auto_ban_not_candidate(self):
        """Testing Auto-Ban: If an employee is candidate for Op1 but not Op2 (equal size), they cannot be used in Op1."""
        op1 = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="Op1",
            planned_start="2023-10-01T10:00:00Z", planned_end="2023-10-01T12:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101, 102, 103])] # 103 is candidate here
        )
        op2 = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="Op2",
            planned_start="2023-10-01T13:00:00Z", planned_end="2023-10-01T15:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101, 102])] # 103 is NOT candidate here
        )
        
        req = SolverRequest(
            request_id="test_ban", window={"start_date": "2023-10-01", "end_date": "2023-10-01"},
            operation_demands=[op1, op2], employee_profiles=[], calendar=[], shift_definitions=[],
            shared_preferences=[
                SharedPreference(1, "Group1", [
                    {"operation_plan_id": 1, "required_people": 1},
                    {"operation_plan_id": 2, "required_people": 1}
                ])
            ]
        )

        assignments = {}
        for emp_id in (101, 102, 103):
            assignments[(1, 1, emp_id)] = self.model.NewBoolVar(f"A_1_1_{emp_id}")
        for emp_id in (101, 102):
            assignments[(2, 1, emp_id)] = self.model.NewBoolVar(f"A_2_1_{emp_id}")

        self.model.AddExactlyOne(assignments[(1, 1, emp)] for emp in (101, 102, 103))
        self.model.AddExactlyOne(assignments[(2, 1, emp)] for emp in (101, 102))

        idx = AssignmentIndex(assignments)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments={}, shift_index=None, config={})
        
        ShareGroupConstraint(logger=self.logger).apply(ctx, req)
        
        # We try to force 103 into Op1. This should be INFEASIBLE because 103 can't do Op2.
        self.model.Add(assignments[(1, 1, 103)] == 1)
        
        solver = self._create_solver()
        status = solver.Solve(self.model)
        
        self.assertEqual(status, cp_model.INFEASIBLE)

    def test_unique_employee_exemption(self):
        """Testing that operations within the same shared group can overlap in time without violating UniqueEmployeeConstraint."""
        # Op1 and Op2 OVERLAP in time (10:00-12:00 and 11:00-13:00)
        op1 = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="Op1",
            planned_start="2023-10-01T10:00:00Z", planned_end="2023-10-01T12:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        op2 = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="Op2",
            planned_start="2023-10-01T11:00:00Z", planned_end="2023-10-01T13:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        
        req = SolverRequest(
            request_id="test_exemption", window={"start_date": "2023-10-01", "end_date": "2023-10-01"},
            operation_demands=[op1, op2], employee_profiles=[], calendar=[], shift_definitions=[],
            shared_preferences=[
                SharedPreference(1, "Group1", [
                    {"operation_plan_id": 1, "required_people": 1},
                    {"operation_plan_id": 2, "required_people": 1}
                ])
            ]
        )

        assignments = {}
        assignments[(1, 1, 101)] = self.model.NewBoolVar("A_1_1_101")
        assignments[(2, 1, 101)] = self.model.NewBoolVar("A_2_1_101")
        
        self.model.Add(assignments[(1, 1, 101)] == 1)
        self.model.Add(assignments[(2, 1, 101)] == 1)

        idx = AssignmentIndex(assignments)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments={}, shift_index=None, config={})
        
        # Apply BOTH constraints
        ShareGroupConstraint(logger=self.logger).apply(ctx, req)
        UniqueEmployeeConstraint(logger=self.logger).apply(ctx, req)
        
        solver = self._create_solver()
        status = solver.Solve(self.model)
        
        # Should be OPTIMAL because the overlap exemption applies
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(solver.Value(assignments[(1, 1, 101)]), 1)
        self.assertEqual(solver.Value(assignments[(2, 1, 101)]), 1)

    def test_unique_employee_cross_time_share_group(self):
        """
        Reproduces the over-constraint bug:
        
        Share Group G1: Op A [08:00-10:00], Op B [14:00-16:00]
        Independent:    Op C [09:00-11:00] (overlaps A, NOT B)
        
        Employee 101 assigned to Op B (via G1) and Op C.
        Before fix: INFEASIBLE (UnitActive_G1 blocks C even though only B is active)
        After fix:  OPTIMAL (B and C don't overlap → allowed)
        """
        op_a = OperationDemand(
            operation_plan_id=1, batch_id=1, batch_code="B1", operation_id=1, operation_name="OpA",
            planned_start="2023-10-01T08:00:00Z", planned_end="2023-10-01T10:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        op_b = OperationDemand(
            operation_plan_id=2, batch_id=1, batch_code="B1", operation_id=2, operation_name="OpB",
            planned_start="2023-10-01T14:00:00Z", planned_end="2023-10-01T16:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )
        op_c = OperationDemand(
            operation_plan_id=3, batch_id=2, batch_code="B2", operation_id=3, operation_name="OpC",
            planned_start="2023-10-01T09:00:00Z", planned_end="2023-10-01T11:00:00Z",
            planned_duration_minutes=120, required_people=1,
            position_qualifications=[PositionQualification(1, [], [101])]
        )

        req = SolverRequest(
            request_id="test_cross_time", window={"start_date": "2023-10-01", "end_date": "2023-10-01"},
            operation_demands=[op_a, op_b, op_c], employee_profiles=[], calendar=[], shift_definitions=[],
            shared_preferences=[
                SharedPreference(1, "Group1", [
                    {"operation_plan_id": 1, "required_people": 1},
                    {"operation_plan_id": 2, "required_people": 1}
                ])
            ]
        )

        assignments = {}
        assignments[(1, 1, 101)] = self.model.NewBoolVar("A_1_1_101")
        assignments[(2, 1, 101)] = self.model.NewBoolVar("A_2_1_101")
        assignments[(3, 1, 101)] = self.model.NewBoolVar("A_3_1_101")

        # Force: Op B assigned, Op C assigned (Op A is free)
        self.model.Add(assignments[(2, 1, 101)] == 1)
        self.model.Add(assignments[(3, 1, 101)] == 1)

        idx = AssignmentIndex(assignments)
        ctx = SolverContext(model=self.model, assignments=assignments, index=idx,
                            shift_assignments={}, shift_index=None, config={})

        # Only apply UniqueEmployee (isolating the constraint under test)
        UniqueEmployeeConstraint(logger=self.logger).apply(ctx, req)

        solver = self._create_solver()
        status = solver.Solve(self.model)

        # Op B [14-16] and Op C [09-11] do NOT overlap → should be OPTIMAL
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(solver.Value(assignments[(2, 1, 101)]), 1)
        self.assertEqual(solver.Value(assignments[(3, 1, 101)]), 1)

if __name__ == '__main__':
    unittest.main()
