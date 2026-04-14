"""
No Isolated Night Shift Constraint Module

禁止"休息-夜班"序列：如果某天排了夜班，前一天必须是工作班次（非休息）。
合法的夜班进入方式只能是"白班 → 夜班 → 休息"。

注意：
- "夜班后必须休息"已由 NightRestConstraint 覆盖，本约束只管前驱。
- 利用 ShiftAssignmentConstraint 保证的 sum==1（每人每天恰好一个班次），
  直接用 night_var[d] + rest_var[d-1] <= 1 线性约束，零额外变量。
- 边界处理：d=0 时查 historical_shifts，无记录则豁免。
"""

from typing import Set
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class NoIsolatedNightShiftConstraint(BaseConstraint):
    """禁止孤立夜班：夜班前一天必须是工作班次（非休息）"""

    name = "NoIsolatedNightShift"
    config_key = "enable_no_isolated_night_shift"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments

        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        # 1. 识别夜班 ID 集合与休息班 ID 集合
        night_shift_ids: Set[int] = set()
        rest_shift_ids: Set[int] = set()

        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.is_night_shift:
                    night_shift_ids.add(s.shift_id)
                if s.nominal_hours <= 0.01:
                    rest_shift_ids.add(s.shift_id)

        if not night_shift_ids:
            self.log("No night shifts defined. Skipping.", level="info")
            return 0

        if not rest_shift_ids:
            self.log("No rest shifts defined. Skipping.", level="info")
            return 0

        self.log(f"Night shift IDs: {night_shift_ids}, Rest shift IDs: {rest_shift_ids}")

        # 2. 日期范围
        if not data.window:
            self.log("No scheduling window. Skipping.", level="warning")
            return 0

        try:
            window_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            window_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
        except (KeyError, ValueError) as e:
            self.log(f"Invalid window format: {e}", level="error")
            return 0

        total_days = (window_end - window_start).days + 1
        all_dates = [(window_start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(total_days)]

        # 3. 收集所有员工
        all_employees: Set[int] = set()
        for (emp_id, date, shift_id) in shift_assignments.keys():
            all_employees.add(emp_id)

        # 4. 构建历史记录索引：员工 -> 前一天是否工作
        #    仅关注 window_start 前一天的记录
        prev_day_str = (window_start - timedelta(days=1)).strftime("%Y-%m-%d")
        hist_prev_day_is_work = {}  # emp_id -> True/False/None(无记录)

        if hasattr(data, 'historical_shifts') and data.historical_shifts:
            for hist in data.historical_shifts:
                if hist.date == prev_day_str:
                    hist_prev_day_is_work[hist.employee_id] = hist.is_work

        constraints_added = 0

        # 5. 对每个员工施加约束
        for emp_id in all_employees:

            # 5.1 处理 d=0（第一天）
            prev_was_work = hist_prev_day_is_work.get(emp_id)

            if prev_was_work is False:
                # 前一天确认是休息 → 禁止第一天所有夜班
                for n_sid in night_shift_ids:
                    var = shift_assignments.get((emp_id, all_dates[0], n_sid))
                    if var is not None:
                        model.Add(var == 0)
                        constraints_added += 1
                        self.log(f"[Boundary] Emp {emp_id}: d=0 night blocked (prev day was rest)")
            elif prev_was_work is None:
                # 无历史记录 → 豁免，不施加约束
                pass
            # prev_was_work is True → 允许，不需要额外约束

            # 5.2 处理 d=1 到 d=T-1（窗口内日期对）
            for d in range(1, total_days):
                today = all_dates[d]
                yesterday = all_dates[d - 1]

                for n_sid in night_shift_ids:
                    night_var = shift_assignments.get((emp_id, today, n_sid))
                    if night_var is None:
                        continue

                    for r_sid in rest_shift_ids:
                        rest_var = shift_assignments.get((emp_id, yesterday, r_sid))
                        if rest_var is None:
                            continue

                        # 核心约束：今天夜班 + 昨天休息 <= 1
                        # 即：如果今天是夜班，昨天不能是休息
                        model.Add(night_var + rest_var <= 1)
                        constraints_added += 1

        self.log(f"Total no-isolated-night-shift constraints: {constraints_added}")
        return constraints_added
