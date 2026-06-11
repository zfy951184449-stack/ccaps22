"""
Frozen Range Constraint Module

Pins all shift and assignment variables OUTSIDE the solve_range
to their known frozen values. This enables "interval solving" where
we only optimize a sub-range but maintain full-month constraint correctness.

Design: "Full-Month Modeling + Pin Outside Range"
- The solver receives the FULL month of data (operations, shifts, employees)
- This constraint pins variables outside the solve_range to their existing values
- All cross-boundary constraints (consecutive work days, night intervals, share groups)
  work correctly because the full timeline is modeled
"""

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class FrozenRangeConstraint(BaseConstraint):
    name = "FrozenRange"
    config_key = ""  # Always applied (no config toggle)
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        assignments = ctx.assignments

        # If no solve_range or solve_range == window, skip (full-month solve)
        solve_range = getattr(data, 'solve_range', None)
        if not solve_range:
            self.log("No solve_range specified. Full solve mode — skipping freeze.")
            return 0

        solve_start = solve_range.get('start_date')
        solve_end = solve_range.get('end_date')
        window_start = data.window.get('start_date')
        window_end = data.window.get('end_date')

        if solve_start == window_start and solve_end == window_end:
            self.log("solve_range == window. Full solve mode — skipping freeze.")
            return 0

        self.log(f"Solve range: {solve_start} ~ {solve_end} within window {window_start} ~ {window_end}")

        constraints_added = 0

        # ──────────────────────────────────────────────
        # 1. Freeze Shift Assignments outside solve_range
        # ──────────────────────────────────────────────
        frozen_shifts = getattr(data, 'frozen_shifts', [])
        if frozen_shifts and shift_assignments:
            # Build O(1) lookup: (emp_id, date) -> shift_id
            frozen_shift_map = {}
            for fs in frozen_shifts:
                frozen_shift_map[(fs.employee_id, fs.date)] = fs.shift_id

            frozen_dates = set()
            for fs in frozen_shifts:
                frozen_dates.add(fs.date)

            shift_pin_count = 0

            for (emp_id, date, shift_id), var in shift_assignments.items():
                # Only pin dates outside the solve range
                if date < solve_start or date > solve_end:
                    key = (emp_id, date)
                    if key in frozen_shift_map:
                        # Pin to known value
                        expected = 1 if shift_id == frozen_shift_map[key] else 0
                        model.Add(var == expected)
                        shift_pin_count += 1
                    else:
                        # Date is outside solve range but no frozen data exists
                        # This could mean empty schedule for that employee on that date
                        # We should not force any value — let the solver decide
                        # But to be safe for "no change" semantics, pin to 0
                        # (no shift assigned outside range if not explicitly frozen)
                        # However, this might conflict if there are operations
                        # on those dates. Better: only pin if there IS frozen data.
                        pass

            self.log(f"Pinned {shift_pin_count} shift variables (dates outside {solve_start} ~ {solve_end})")
            constraints_added += shift_pin_count

        # ──────────────────────────────────────────────
        # 2. Freeze Operation Assignments outside solve_range
        # ──────────────────────────────────────────────
        frozen_assigns = getattr(data, 'frozen_assignments', [])
        if frozen_assigns and assignments:
            # Build O(1) lookup: (op_id, pos) -> emp_id
            frozen_assign_map = {}
            for fa in frozen_assigns:
                frozen_assign_map[(fa.operation_plan_id, fa.position_number)] = fa.employee_id

            assign_pin_count = 0

            # We need to know which operations are outside the solve range
            # Build a set of operation_plan_ids that are outside the solve range
            ops_outside_range = set()
            for op in data.operation_demands:
                op_date = op.planned_start.split("T")[0]
                if op_date < solve_start or op_date > solve_end:
                    ops_outside_range.add(op.operation_plan_id)

            for (op_id, pos_num, emp_id), var in assignments.items():
                if op_id in ops_outside_range:
                    key = (op_id, pos_num)
                    if key in frozen_assign_map:
                        expected = 1 if emp_id == frozen_assign_map[key] else 0
                        model.Add(var == expected)
                        assign_pin_count += 1

            self.log(f"Pinned {assign_pin_count} assignment variables ({len(ops_outside_range)} ops outside range)")
            constraints_added += assign_pin_count

        self.log(f"Total frozen range constraints: {constraints_added}")
        return constraints_added
