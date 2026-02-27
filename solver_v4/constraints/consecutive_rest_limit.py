"""
Max Consecutive Rest Days Constraint Module

Ensures that employees do not rest for more than N consecutive days.
Logic: In any window of size (limit + 1), there must be at least one working shift.
Sum(is_working_shift) >= 1 over window.
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext

class MaxConsecutiveRestDaysConstraint(BaseConstraint):
    name = "MaxConsecutiveRestDays"
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        
        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        # 1. Get Config Limit (User specified default 4)
        limit = 4
        if data.config and "max_consecutive_rest_days" in data.config:
            try:
                limit = int(data.config["max_consecutive_rest_days"])
            except (ValueError, TypeError):
                self.log("Invalid config for max_consecutive_rest_days, using default 4.", level="warning")
        
        self.log(f"Applying limit: Max {limit} consecutive rest days.")
        
        # 2. Identify Working Shifts
        # Map shift_id -> is_working (True if nominal_hours > 0.01)
        is_working_shift_map = {}
        if data.shift_definitions:
            for s in data.shift_definitions:
                is_working_shift_map[s.shift_id] = (s.nominal_hours > 0.01)
        
        # 3. Group vars by employee
        emp_date_vars = defaultdict(lambda: defaultdict(list))
        for (emp_id, date, shift_id), var in shift_assignments.items():
            if is_working_shift_map.get(shift_id, False):
                emp_date_vars[emp_id][date].append(var)
                
        # 4. Apply Window Constraint
        constraints_added = 0
        window_size = limit + 1
        
        if not data.window:
             self.log("No window defined, skipping.", level="warning")
             return 0
             
        try:
            w_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            w_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
            total_days = (w_end - w_start).days + 1
        except Exception as e:
            self.log(f"Window parse error: {e}", level="error")
            return 0

        for emp_id, date_vars in emp_date_vars.items():
            # Construct daily "is_working" indicators
            # Optimization: If OneShiftPerDay is active, Sum(vars) is 0 or 1.
            # So Sum(vars) IS the boolean "is_working" (0 or 1).
            
            daily_working_exprs = []
            
            for i in range(total_days):
                day = w_start + timedelta(days=i)
                day_str = day.strftime("%Y-%m-%d")
                
                vars_today = date_vars.get(day_str, [])
                
                if not vars_today:
                    # No working shift variables? 
                    # This implies the employee CANNOT work on this day 
                    # (maybe availability constraint removed the vars?).
                    # So working = 0.
                    daily_working_exprs.append(0)
                else:
                    daily_working_exprs.append(sum(vars_today))
            
            # Sliding Window: Sum(working) >= 1
            for i in range(len(daily_working_exprs) - window_size + 1):
                window = daily_working_exprs[i : i + window_size]
                
                # If window consists entirely of 0s (literals), it's a violation if length > limit
                # But here we are building the model.
                # Optimization: check if all are literals 0?
                
                model.Add(sum(window) >= 1)
                constraints_added += 1
                
        self.log(f"Added {constraints_added} max consecutive rest days constraints.")
        return constraints_added
