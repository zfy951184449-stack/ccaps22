import unittest
from ortools.sat.python import cp_model

from constraints.locked_operations import LockedOperationsConstraint
from constraints.locked_shifts import LockedShiftsConstraint
from contracts.request import (
    LockedOperation,
    LockedShift,
    OperationDemand,
    PositionQualification,
    ShiftDefinition,
    SolverRequest,
)
from core.context import SolverContext
from core.index import AssignmentIndex, ShiftIndex


class TestLockedConstraints(unittest.TestCase):
    def _create_solver(self):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 1
        return solver

    def test_locked_operation_requires_existing_employee(self):
        model = cp_model.CpModel()

        op = OperationDemand(
            operation_plan_id=10,
            batch_id=1,
            batch_code='B1',
            operation_id=100,
            operation_name='LockedOp',
            planned_start='2026-01-01T00:00:00Z',
            planned_end='2026-01-01T08:00:00Z',
            planned_duration_minutes=480,
            required_people=2,
            position_qualifications=[
                PositionQualification(1, [], [101, 102, 103]),
                PositionQualification(2, [], [101, 102, 103]),
            ],
        )

        req = SolverRequest(
            request_id='locked_op',
            window={'start_date': '2026-01-01', 'end_date': '2026-01-01'},
            operation_demands=[op],
            employee_profiles=[],
            calendar=[],
            shift_definitions=[],
            shared_preferences=[],
            locked_operations=[LockedOperation(operation_plan_id=10, enforced_employee_ids=[102])],
        )

        assignments = {}
        for pos in (1, 2):
            for emp_id in (101, 102, 103):
                assignments[(10, pos, emp_id)] = model.NewBoolVar(f'A_{pos}_{emp_id}')

        for pos in (1, 2):
            model.AddExactlyOne(assignments[(10, pos, emp)] for emp in (101, 102, 103))
        for emp_id in (101, 102, 103):
            model.AddAtMostOne(assignments[(10, pos, emp_id)] for pos in (1, 2))

        ctx = SolverContext(
            model=model,
            assignments=assignments,
            index=AssignmentIndex(assignments),
            shift_assignments={},
            shift_index=None,
            config={},
        )

        LockedOperationsConstraint().apply(ctx, req)

        solver = self._create_solver()
        status = solver.Solve(model)

        self.assertEqual(status, cp_model.OPTIMAL)
        total_for_locked_emp = sum(solver.Value(assignments[(10, pos, 102)]) for pos in (1, 2))
        self.assertEqual(total_for_locked_emp, 1)

    def test_locked_operation_is_infeasible_when_employee_missing(self):
        model = cp_model.CpModel()

        op = OperationDemand(
            operation_plan_id=11,
            batch_id=1,
            batch_code='B1',
            operation_id=101,
            operation_name='LockedOpMissing',
            planned_start='2026-01-01T00:00:00Z',
            planned_end='2026-01-01T08:00:00Z',
            planned_duration_minutes=480,
            required_people=1,
            position_qualifications=[PositionQualification(1, [], [201])],
        )

        req = SolverRequest(
            request_id='locked_op_missing',
            window={'start_date': '2026-01-01', 'end_date': '2026-01-01'},
            operation_demands=[op],
            employee_profiles=[],
            calendar=[],
            shift_definitions=[],
            shared_preferences=[],
            locked_operations=[LockedOperation(operation_plan_id=11, enforced_employee_ids=[999])],
        )

        assignments = {(11, 1, 201): model.NewBoolVar('A_11_1_201')}
        model.Add(assignments[(11, 1, 201)] == 1)

        ctx = SolverContext(
            model=model,
            assignments=assignments,
            index=AssignmentIndex(assignments),
            shift_assignments={},
            shift_index=None,
            config={},
        )

        LockedOperationsConstraint().apply(ctx, req)

        solver = self._create_solver()
        status = solver.Solve(model)

        self.assertEqual(status, cp_model.INFEASIBLE)

    def test_locked_shift_forces_specific_shift(self):
        model = cp_model.CpModel()
        shift_defs = [
            ShiftDefinition(
                shift_id=1,
                shift_code='D',
                shift_name='Day',
                start_time='08:00',
                end_time='17:00',
                nominal_hours=8,
                is_night_shift=False,
            ),
            ShiftDefinition(
                shift_id=2,
                shift_code='N',
                shift_name='Night',
                start_time='22:00',
                end_time='06:00',
                nominal_hours=8,
                is_night_shift=True,
            ),
            ShiftDefinition(
                shift_id=99,
                shift_code='REST',
                shift_name='Rest',
                start_time='00:00',
                end_time='00:00',
                nominal_hours=0,
                is_night_shift=False,
            ),
        ]

        req = SolverRequest(
            request_id='locked_shift',
            window={'start_date': '2026-01-01', 'end_date': '2026-01-01'},
            operation_demands=[],
            employee_profiles=[],
            calendar=[],
            shift_definitions=shift_defs,
            shared_preferences=[],
            locked_shifts=[LockedShift(employee_id=301, date='2026-01-01', shift_id=2, plan_category='WORK')],
        )

        shift_assignments = {
            (301, '2026-01-01', 1): model.NewBoolVar('D'),
            (301, '2026-01-01', 2): model.NewBoolVar('N'),
            (301, '2026-01-01', 99): model.NewBoolVar('R'),
        }

        ctx = SolverContext(
            model=model,
            assignments={},
            index=AssignmentIndex({}),
            shift_assignments=shift_assignments,
            shift_index=ShiftIndex(req),
            config={},
        )

        LockedShiftsConstraint().apply(ctx, req)

        solver = self._create_solver()
        status = solver.Solve(model)

        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(solver.Value(shift_assignments[(301, '2026-01-01', 2)]), 1)
        self.assertEqual(solver.Value(shift_assignments[(301, '2026-01-01', 1)]), 0)
        self.assertEqual(solver.Value(shift_assignments[(301, '2026-01-01', 99)]), 0)


if __name__ == '__main__':
    unittest.main()
