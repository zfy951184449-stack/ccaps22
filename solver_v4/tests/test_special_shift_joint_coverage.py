import unittest

from contracts.request import (
    EmployeeProfile,
    OperationDemand,
    PositionQualification,
    ShiftDefinition,
    SolverRequest,
    SpecialShiftCandidate,
    SpecialShiftRequirement,
)
from core.solver import SolverV4


class TestSpecialShiftJointCoverage(unittest.TestCase):
    def setUp(self):
        self.shift_defs = [
            ShiftDefinition(
                shift_id=1,
                shift_code="D",
                shift_name="Day",
                start_time="08:00",
                end_time="20:00",
                nominal_hours=12,
                is_night_shift=False,
                plan_category="STANDARD",
            ),
            ShiftDefinition(
                shift_id=99,
                shift_code="R",
                shift_name="Rest",
                start_time="00:00",
                end_time="00:00",
                nominal_hours=0,
                is_night_shift=False,
                plan_category="STANDARD",
            ),
        ]
        self.window = {"start_date": "2026-01-10", "end_date": "2026-01-10"}
        self.employees = [
            EmployeeProfile(employee_id=1, employee_code="E1", employee_name="Expert", qualifications=[], unavailable_periods=[]),
            EmployeeProfile(employee_id=2, employee_code="E2", employee_name="General", qualifications=[], unavailable_periods=[]),
        ]

    def _solve(self, operation_demands, special_shift_requirements, config=None):
        req = SolverRequest(
            request_id="test-special-joint",
            window=self.window,
            operation_demands=operation_demands,
            special_shift_requirements=special_shift_requirements,
            employee_profiles=self.employees,
            calendar=[],
            shift_definitions=self.shift_defs,
            shared_preferences=[],
            config=config or {
                "enable_share_group": False,
                "enable_locked_operations": False,
                "enable_locked_shifts": False,
                "enable_balance_night_shifts": False,
                "enable_minimize_special_shifts": False,
                "enable_minimize_deviation": False,
                "enable_employee_availability": False,
                "enable_flexible_scheduling": False,
                "allow_position_vacancy": False,
            },
        )
        solver = SolverV4()
        solver.solver.parameters.max_time_in_seconds = 5
        return solver.solve(req)

    def test_soft_shortage_returns_partial_solution(self):
        result = self._solve(
            operation_demands=[],
            special_shift_requirements=[
                SpecialShiftRequirement(
                    occurrence_id=10,
                    window_id=1,
                    date="2026-01-10",
                    shift_id=1,
                    required_people=3,
                    eligible_employee_ids=[1, 2],
                    fulfillment_mode="SOFT",
                    priority_level="HIGH",
                    candidates=[
                        SpecialShiftCandidate(employee_id=1, impact_cost=10),
                        SpecialShiftCandidate(employee_id=2, impact_cost=10),
                    ],
                )
            ],
        )

        self.assertIn(result["status"], ["OPTIMAL", "FEASIBLE"])
        self.assertEqual(len(result["special_shift_assignments"]), 2)
        self.assertEqual(result["special_shift_shortages"], [{"occurrence_id": 10, "shortage_people": 1}])

    def test_hard_shortage_is_infeasible(self):
        result = self._solve(
            operation_demands=[],
            special_shift_requirements=[
                SpecialShiftRequirement(
                    occurrence_id=11,
                    window_id=1,
                    date="2026-01-10",
                    shift_id=1,
                    required_people=3,
                    eligible_employee_ids=[1, 2],
                    fulfillment_mode="HARD",
                    priority_level="HIGH",
                    candidates=[
                        SpecialShiftCandidate(employee_id=1, impact_cost=10),
                        SpecialShiftCandidate(employee_id=2, impact_cost=10),
                    ],
                )
            ],
        )

        self.assertEqual(result["status"], "INFEASIBLE")

    def test_impact_objective_prefers_lower_impact_employee(self):
        operation = OperationDemand(
            operation_plan_id=100,
            batch_id=1,
            batch_code="B1",
            operation_id=1,
            operation_name="Critical Operation",
            planned_start="2026-01-10T00:30:00Z",
            planned_end="2026-01-10T02:30:00Z",
            planned_duration_minutes=120,
            required_people=1,
            position_qualifications=[
                PositionQualification(
                    position_number=1,
                    qualifications=[],
                    candidate_employee_ids=[1],
                )
            ],
        )

        result = self._solve(
            operation_demands=[operation],
            special_shift_requirements=[
                SpecialShiftRequirement(
                    occurrence_id=12,
                    window_id=1,
                    date="2026-01-10",
                    shift_id=1,
                    required_people=1,
                    eligible_employee_ids=[1, 2],
                    fulfillment_mode="HARD",
                    priority_level="HIGH",
                    candidates=[
                        SpecialShiftCandidate(employee_id=1, impact_cost=1000),
                        SpecialShiftCandidate(employee_id=2, impact_cost=0),
                    ],
                )
            ],
        )

        self.assertIn(result["status"], ["OPTIMAL", "FEASIBLE"])
        self.assertEqual(
            result["special_shift_assignments"],
            [{"occurrence_id": 12, "employee_id": 2, "date": "2026-01-10", "shift_id": 1}],
        )


if __name__ == "__main__":
    unittest.main()
