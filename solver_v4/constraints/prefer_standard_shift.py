"""
PreferStandardShift Constraint

目标：当标准班次 (STANDARD) 已能覆盖员工当天所有任务时，禁止分配特殊班次 (SPECIAL)。
Config 开关：enable_prefer_standard_shift (默认 True)

逻辑：
  对于每个 (employee, date)：
    1. 收集该员工当天候选的所有 operation 时间区间
    2. 判断是否存在 STANDARD 班次能覆盖每个 operation
    3. 若全部可被 STANDARD 覆盖 → 禁止该员工当天选择 SPECIAL 班次
"""

from collections import defaultdict
from typing import Set, List, Tuple, Dict
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix


class PreferStandardShiftConstraint(BaseConstraint):
    """Block SPECIAL shifts when STANDARD shifts can cover all tasks."""

    name = "PreferStandardShift"
    is_hard = True

    SPECIAL_CATEGORY = "SPECIAL"
    STANDARD_CATEGORY = "STANDARD"

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        index = ctx.index
        shift_assignments = ctx.shift_assignments
        shift_index = ctx.shift_index

        if not shift_assignments or shift_index is None:
            self.log("Missing shift_assignments or shift_index. Skipping.", level="warning")
            return 0

        # 1. Classify shifts by category
        standard_shift_ids: Set[int] = set()
        special_shift_ids: Set[int] = set()

        for s in data.shift_definitions:
            if s.nominal_hours <= 0.01:
                continue  # REST shifts are irrelevant
            if s.plan_category == self.SPECIAL_CATEGORY:
                special_shift_ids.add(s.shift_id)
            else:
                standard_shift_ids.add(s.shift_id)

        if not special_shift_ids:
            self.log("No SPECIAL shifts defined. Nothing to constrain.")
            return 0

        if not standard_shift_ids:
            self.log("No STANDARD shifts defined. Cannot prefer standard. Skipping.", level="warning")
            return 0

        self.log(f"STANDARD shifts: {standard_shift_ids}, SPECIAL shifts: {special_shift_ids}")

        # 2. Pre-compute date range
        from utils.time_utils import get_date_range
        window_dates = get_date_range(data.window['start_date'], data.window['end_date'])

        # 3. Build per-employee-day operation set
        #    emp_day_ops[(emp_id, date)] = set of op_ids the employee is a candidate for
        emp_day_ops: Dict[Tuple[int, str], Set[int]] = defaultdict(set)

        op_map = {op.operation_plan_id: op for op in data.operation_demands}

        for op in data.operation_demands:
            op_start = parse_iso_to_unix(op.planned_start)
            op_end = parse_iso_to_unix(op.planned_end)

            # Determine which date(s) this operation falls on
            covering = shift_index.get_covering_shifts(op_start, op_end, window_dates)

            candidates = index.get_candidates_for_op(op.operation_plan_id)
            for emp_id in candidates:
                for date_str, _ in covering:
                    emp_day_ops[(emp_id, date_str)].add(op.operation_plan_id)

        # 4. For each (emp, date), check if ALL ops can be covered by STANDARD shifts
        constraints_added = 0

        for (emp_id, date_str), op_ids in emp_day_ops.items():
            if not op_ids:
                continue

            # Check: can every operation be covered by at least one STANDARD shift?
            all_coverable = True
            for op_id in op_ids:
                op = op_map.get(op_id)
                if not op:
                    all_coverable = False
                    break

                op_start = parse_iso_to_unix(op.planned_start)
                op_end = parse_iso_to_unix(op.planned_end)

                # Check if any STANDARD shift on this date covers the operation
                has_standard_cover = False
                for std_id in standard_shift_ids:
                    sh_start, sh_end = shift_index.get_shift_interval(date_str, std_id)
                    if sh_start <= op_start and op_end <= sh_end:
                        has_standard_cover = True
                        break

                if not has_standard_cover:
                    all_coverable = False
                    break

            if all_coverable:
                # Block all SPECIAL shift vars for this (emp, date)
                for spc_id in special_shift_ids:
                    key = (emp_id, date_str, spc_id)
                    if key in shift_assignments:
                        model.Add(shift_assignments[key] == 0)
                        constraints_added += 1

        self.log(f"Added {constraints_added} constraints (blocked SPECIAL shifts where STANDARD suffices).")
        return constraints_added
