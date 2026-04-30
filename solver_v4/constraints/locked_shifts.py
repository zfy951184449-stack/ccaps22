"""
Locked Shifts Constraint Module

Preserves manually locked employee-day shift selections from previous runs.
"""

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class LockedShiftsConstraint(BaseConstraint):
    name = "LockedShifts"
    config_key = "enable_locked_shifts"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        shift_index = ctx.shift_index

        if not shift_assignments or shift_index is None:
            self.log("Missing shift assignment context. Skipping.", level="warning")
            return 0

        if not getattr(data, "locked_shifts", None):
            self.log("No locked shifts to enforce.")
            return 0

        constraints_added = 0

        for locked in data.locked_shifts:
            target_shift_id = locked.shift_id

            if target_shift_id is None and locked.plan_category == "REST":
                rest_shift_ids = [shift.shift_id for shift in data.shift_definitions if shift.nominal_hours <= 0.01]
                if rest_shift_ids:
                    target_shift_id = rest_shift_ids[0]

            if target_shift_id is None:
                self.log(
                    f"Locked shift missing shift_id for Emp {locked.employee_id} on {locked.date}; skipping.",
                    level="warning",
                )
                continue

            target_key = (locked.employee_id, locked.date, target_shift_id)
            target_var = shift_assignments.get(target_key)
            if target_var is None:
                config = data.config or {}
                if config.get("strict_locked_shifts", False):
                    self.log(
                        f"[STRICT] Locked shift {target_key} not present in model; forcing infeasible.",
                        level="error",
                    )
                    model.Add(0 == 1)
                    constraints_added += 1
                else:
                    self.log(
                        f"Locked shift {target_key} not present in model; skipping (data inconsistency).",
                        level="warning",
                    )
                continue

            model.Add(target_var == 1)
            constraints_added += 1
            # NOTE: No need to explicitly zero out other shifts for the same (emp, date).
            # ShiftAssignment already ensures sum(shifts_per_day) == 1. Combined with
            # target_var == 1, all other shift vars are implicitly forced to 0.

        self.log(f"Total locked-shift constraints: {constraints_added}")
        return constraints_added
