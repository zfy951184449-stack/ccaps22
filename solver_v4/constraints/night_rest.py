"""
Night Shift Rest Constraint Module

确保夜班后员工得到充分休息。

约束规则：
1. 硬约束：夜班后至少休息 x 天（默认 1 天）
2. 软约束：夜班后建议休息 y 天（默认 2 天，y >= x）
3. 夜班识别：班次定义中 is_night_shift = true
4. 边界处理：使用 historical_shifts 处理求解区间前的夜班
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
import logging


class NightRestConstraint(BaseConstraint):
    """夜班休息约束
    
    硬约束：夜班后 x 天内必须休息
    软约束：夜班后 y 天内尽可能休息（当前版本仅实现硬约束）
    """
    
    name = "NightRest"
    config_key = "enable_night_rest"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        
        # 0. Check if constraint is enabled
        config = data.config or {}
        if not config.get("enforce_night_rest", True):
            self.log("Night rest constraint is disabled.", level="info")
            return 0
        
        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        # 1. Get Config Parameters
        x = config.get("min_night_rest", 1)
        y = config.get("soft_night_rest", 2)
        
        self.log(f"Applying: Hard Rest = {x} days, Soft Rest = {y} days")

        # 2. Build Night Shift ID Set
        night_shift_ids: Set[int] = set()
        working_shift_ids: Set[int] = set()
        
        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.is_night_shift:
                    night_shift_ids.add(s.shift_id)
                # Working shift: nominal_hours > 0.01
                if s.nominal_hours > 0.01:
                    working_shift_ids.add(s.shift_id)
        
        if not night_shift_ids:
            self.log("No night shifts defined. Skipping constraint.", level="info")
            return 0
        
        self.log(f"Night shift IDs: {night_shift_ids}")

        # 3. Get Date Range
        if not data.window:
            self.log("No scheduling window defined. Skipping.", level="warning")
            return 0
            
        try:
            window_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            window_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
        except (KeyError, ValueError) as e:
            self.log(f"Invalid window format: {e}", level="error")
            return 0
        
        # Build date set for quick lookup
        window_dates: Set[str] = set()
        current = window_start
        while current <= window_end:
            window_dates.add(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)

        constraints_added = 0

        # 4. Process Historical Night Shifts (Boundary Handling)
        # Historical nights are facts, not variables - directly forbid work
        if hasattr(data, 'historical_shifts') and data.historical_shifts:
            for hist in data.historical_shifts:
                if not hist.is_night:
                    continue
                
                try:
                    night_date = datetime.strptime(hist.date, "%Y-%m-%d").date()
                except ValueError:
                    continue
                
                emp_id = hist.employee_id
                
                # Apply hard constraint: forbid work on days 1 to x after night
                for offset in range(1, x + 1):
                    rest_date = night_date + timedelta(days=offset)
                    rest_date_str = rest_date.strftime("%Y-%m-%d")
                    
                    if rest_date_str not in window_dates:
                        continue
                    
                    # Forbid all working shifts on this day for this employee
                    for shift_id in working_shift_ids:
                        var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                        if var is not None:
                            model.Add(var == 0)
                            constraints_added += 1
                            
            self.log(f"Historical night boundary constraints: {constraints_added}")

        # 5. Process Night Shifts Within Scheduling Window
        # Group shift vars by (employee, date) for night shifts
        emp_date_night_vars = defaultdict(list)
        
        for (emp_id, date, shift_id), var in shift_assignments.items():
            if shift_id in night_shift_ids:
                emp_date_night_vars[(emp_id, date)].append(var)
        
        window_constraints = 0
        
        for (emp_id, date_str), night_vars in emp_date_night_vars.items():
            if not night_vars:
                continue
            
            try:
                night_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                continue
                
            # Create an aggregated "is night on this day" variable
            # Sum(night_vars) >= 1 means employee has night shift
            is_night = model.NewBoolVar(f"IsNight_{emp_id}_{date_str}")
            model.Add(sum(night_vars) >= 1).OnlyEnforceIf(is_night)
            model.Add(sum(night_vars) == 0).OnlyEnforceIf(is_night.Not())
            
            # Apply hard constraint: if night, then rest days 1 to x must not work
            for offset in range(1, x + 1):
                rest_date = night_date + timedelta(days=offset)
                rest_date_str = rest_date.strftime("%Y-%m-%d")
                
                if rest_date_str not in window_dates:
                    continue
                
                # Forbid working shifts on rest day if night shift is assigned
                for shift_id in working_shift_ids:
                    var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                    if var is not None:
                        model.Add(var == 0).OnlyEnforceIf(is_night)
                        window_constraints += 1

        self.log(f"In-window night rest constraints: {window_constraints}")
        constraints_added += window_constraints
        
        self.log(f"Total night rest constraints added: {constraints_added}")
        return constraints_added
