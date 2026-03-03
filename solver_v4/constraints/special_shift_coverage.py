"""
Special Shift Coverage Constraint

Ensures each special shift occurrence has enough assigned employees on the
target date and shift, without turning the requirement into a task-duration demand.
"""

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class SpecialShiftCoverageConstraint(BaseConstraint):
    name = "SpecialShiftCoverage"
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        if not ctx.shift_assignments or not data.special_shift_requirements:
            self.log("No special shift requirements to apply.")
            return 0

        constraints_added = 0
        zero_candidate_requirements = 0

        for requirement in data.special_shift_requirements:
            candidate_shift_vars = []
            for employee_id in requirement.eligible_employee_ids:
                shift_var = ctx.shift_assignments.get((employee_id, requirement.date, requirement.shift_id))
                if shift_var is not None:
                    candidate_shift_vars.append(shift_var)

            if not candidate_shift_vars:
                zero_candidate_requirements += 1
                self.log(
                    (
                        f"Infeasible occurrence {requirement.occurrence_id}: "
                        f"date={requirement.date}, shift_id={requirement.shift_id}, "
                        f"required_people={requirement.required_people}, eligible={len(requirement.eligible_employee_ids)}"
                    ),
                    level="warning",
                )

            ctx.model.Add(sum(candidate_shift_vars) >= requirement.required_people)
            constraints_added += 1

        self.log(
            f"Added {constraints_added} special shift coverage constraints. "
            f"Zero-candidate requirements: {zero_candidate_requirements}"
        )
        return constraints_added
