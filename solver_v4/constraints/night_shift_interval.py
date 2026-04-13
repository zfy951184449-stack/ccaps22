"""
Night Shift Interval Constraint Module

确保两次夜班之间至少间隔 N 天。

约束规则：
1. 滑动窗口：任意连续 interval 天内，夜班数 <= 1
2. interval = min_night_shift_interval (默认 7，即间隔 6 天)
3. 边界处理：使用 historical_shifts 处理求解区间前的夜班

与 NightRestConstraint 的区别：
- NightRest: 夜班后禁止所有工作（白班 + 夜班）
- NightShiftInterval: 仅限制夜班与夜班之间的间距，白班不受影响
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, Set, Optional
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class NightShiftIntervalConstraint(BaseConstraint):
    """夜班间隔约束：两次夜班之间至少间隔 N-1 天 (窗口大小 N)"""
    
    name = "NightShiftInterval"
    config_key = "enable_night_shift_interval"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        
        config = data.config or {}
        
        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        # 1. Config: 窗口大小 (默认 7 → 间隔 6 天)
        interval = int(config.get("min_night_shift_interval", 7))
        if interval < 2:
            self.log(f"Interval {interval} too small (min 2). Skipping.", level="warning")
            return 0
        
        self.log(f"Applying: Min {interval - 1} days between night shifts (window={interval})")

        # 2. 识别夜班 Shift ID
        night_shift_ids: Set[int] = set()
        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.is_night_shift:
                    night_shift_ids.add(s.shift_id)
        
        if not night_shift_ids:
            self.log("No night shifts defined. Skipping.", level="info")
            return 0
        
        self.log(f"Night shift IDs: {night_shift_ids}")

        # 3. 日期范围
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

        # 4. 收集所有涉及的员工
        all_employees: Set[int] = set()
        for (emp_id, date, shift_id) in shift_assignments.keys():
            all_employees.add(emp_id)

        constraints_added = 0

        # 5. 处理历史夜班边界
        historical_night_dates: Dict[int, Set[str]] = defaultdict(set)
        if hasattr(data, 'historical_shifts') and data.historical_shifts:
            for hist in data.historical_shifts:
                if not hist.is_night:
                    continue
                try:
                    hist_date = datetime.strptime(hist.date, "%Y-%m-%d").date()
                except ValueError:
                    continue
                days_before = (window_start - hist_date).days
                if 0 < days_before < interval:
                    historical_night_dates[hist.employee_id].add(hist.date)

        # 6. 对每个员工构建约束
        for emp_id in all_employees:
            
            # 构建每日 "is_night" 聚合表达式
            daily_night_exprs = []
            
            for date_str in all_dates:
                night_vars = [
                    shift_assignments[(emp_id, date_str, sid)]
                    for sid in night_shift_ids
                    if (emp_id, date_str, sid) in shift_assignments
                ]
                
                if not night_vars:
                    daily_night_exprs.append(0)
                elif len(night_vars) == 1:
                    daily_night_exprs.append(night_vars[0])
                else:
                    is_night = model.NewBoolVar(f"IsNight_{emp_id}_{date_str}")
                    model.Add(sum(night_vars) >= 1).OnlyEnforceIf(is_night)
                    model.Add(sum(night_vars) == 0).OnlyEnforceIf(is_night.Not())
                    daily_night_exprs.append(is_night)
            
            # 6.1 边界约束
            hist_nights = historical_night_dates.get(emp_id, set())
            if hist_nights:
                for hist_date_str in hist_nights:
                    try:
                        hist_date = datetime.strptime(hist_date_str, "%Y-%m-%d").date()
                    except ValueError:
                        continue
                    
                    for offset in range(1, interval):
                        blocked_date = hist_date + timedelta(days=offset)
                        if blocked_date < window_start or blocked_date > window_end:
                            continue
                        
                        blocked_date_str = blocked_date.strftime("%Y-%m-%d")
                        
                        day_index = (blocked_date - window_start).days
                        expr = daily_night_exprs[day_index]
                        
                        if not isinstance(expr, int):
                            for sid in night_shift_ids:
                                var = shift_assignments.get((emp_id, blocked_date_str, sid))
                                if var is not None:
                                    model.Add(var == 0)
                                    constraints_added += 1
                
                self.log(f"[Boundary] Emp {emp_id}: {len(hist_nights)} historical night(s), blocked early window days")

            # 6.2 窗口内滑动约束: sum(is_night[i : i + interval]) <= 1
            if total_days < interval:
                non_const = [expr for expr in daily_night_exprs if not isinstance(expr, int)]
                if len(non_const) > 1:
                    model.Add(sum(non_const) <= 1)
                    constraints_added += 1
                continue
            
            for i in range(total_days - interval + 1):
                window_vars = []
                for j in range(i, i + interval):
                    expr = daily_night_exprs[j]
                    if isinstance(expr, int):
                        continue  # 无夜班变量
                    window_vars.append(expr)
                
                if len(window_vars) <= 1:
                    continue  # 最多 1 个夜班变量，天然满足
                model.Add(sum(window_vars) <= 1)
                constraints_added += 1

        self.log(f"Total night shift interval constraints: {constraints_added}")
        return constraints_added
