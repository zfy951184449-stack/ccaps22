"""
Special Shift Joint Coverage Constraint

Creates explicit coverage-selection and shortage variables so the solver can jointly
decide shifts, process assignments, and which employees satisfy each special coverage
occurrence.
"""

from collections import defaultdict

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class SpecialShiftJointCoverageConstraint(BaseConstraint):
    name = "SpecialShiftJointCoverage"
    config_key = "enable_special_shift_coverage"
    default_enabled = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        if not data.special_shift_requirements:
            self.log("No special shift requirements to apply.")
            return 0

        constraints_added = 0
        cover_keys_by_emp_shift = defaultdict(list)

        for requirement in data.special_shift_requirements:
            selected_vars = []
            for candidate in requirement.candidates:
                key = (requirement.occurrence_id, candidate.employee_id)
                cover_var = ctx.special_cover_vars.get(key)
                if cover_var is None:
                    continue

                selected_vars.append(cover_var)
                shift_var = ctx.shift_assignments.get((candidate.employee_id, requirement.date, requirement.shift_id))
                if shift_var is None:
                    ctx.model.Add(cover_var == 0)
                else:
                    ctx.model.Add(cover_var <= shift_var)
                constraints_added += 1

                cover_keys_by_emp_shift[(candidate.employee_id, requirement.date, requirement.shift_id)].append(cover_var)

            shortage_var = ctx.special_shortage_vars.get(requirement.occurrence_id)
            if shortage_var is None:
                continue

            ctx.model.Add(sum(selected_vars) + shortage_var == requirement.required_people)
            constraints_added += 1

            if str(requirement.fulfillment_mode or "HARD").upper() == "HARD":
                ctx.model.Add(shortage_var == 0)
                constraints_added += 1

        for vars_for_emp_shift in cover_keys_by_emp_shift.values():
            if len(vars_for_emp_shift) <= 1:
                continue
            ctx.model.Add(sum(vars_for_emp_shift) <= 1)
            constraints_added += 1

        self.log(f"Added {constraints_added} joint special shift coverage constraints.")
        return constraints_added
