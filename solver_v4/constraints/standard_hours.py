"""
Standard Work Hours Constraint Module (标准工时约束)

Ensures that employees' scheduled work hours fall within acceptable bounds:
- H8 (Upper Limit): Total hours <= Standard Hours + Upper Offset
- H9 (Lower Limit): Total hours >= Standard Hours - Lower Offset

Standard Hours = Workdays in Window × 8 hours

Cross-month handling:
- Full months: Each month must independently satisfy constraints
- Partial months: Calculate based on workdays in that partial range
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict
from datetime import datetime, date, timedelta
from calendar import monthrange
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
import logging


class StandardHoursConstraint(BaseConstraint):
    """
    H8-H9: Standard Work Hours Hard Constraint
    
    Ensures employee monthly work hours are within [standard - lower_offset, standard + upper_offset].
    """
    
    name = "StandardHours"
    config_key = "enable_standard_hours"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply standard work hours constraints."""
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        
        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        # 1. Get Config
        config = data.config or {}
        lower_offset = float(config.get("monthly_hours_lower_offset", 4.0))
        upper_offset = float(config.get("monthly_hours_upper_offset", 32.0))
        
        self.log(f"Applying Standard Hours Constraint: offset=[{-lower_offset}h, +{upper_offset}h]")
        
        # 2. Build Shift Hours Map
        # Map shift_id -> nominal_hours (scaled to int, * 100 for precision)
        shift_hours_map = {}
        rest_shift_ids = set()
        
        for s in data.shift_definitions:
            hours_scaled = int(s.nominal_hours * 100)  # 0.01h precision
            shift_hours_map[s.shift_id] = hours_scaled
            
            # Identify REST shifts (nominal_hours ~= 0)
            if s.nominal_hours <= 0.01:
                rest_shift_ids.add(s.shift_id)
        
        # 3. Build Calendar Workday Map
        # Map date_str -> is_workday
        workday_map = {}
        for cal in data.calendar:
            workday_map[cal.date] = cal.is_workday
        
        # 4. Split Window into Month Buckets
        month_buckets = self._split_window_by_month(data.window)
        self.log(f"Window split into {len(month_buckets)} month bucket(s).")
        
        # 5. Get All Employees
        all_employees = {ep.employee_id for ep in data.employee_profiles}
        
        constraints_added = 0
        
        # 6. Apply Constraints Per Month Bucket, Per Employee
        for bucket in month_buckets:
            bucket_start, bucket_end, is_full_month = bucket
            
            # Count workdays in this bucket
            workdays = self._count_workdays(bucket_start, bucket_end, workday_map)
            
            if workdays == 0:
                self.log(f"Bucket {bucket_start}~{bucket_end}: 0 workdays, skipping.", level="debug")
                continue
            
            # Calculate limits (scaled)
            standard_hours = workdays * 8.0
            min_hours = standard_hours - lower_offset
            max_hours = standard_hours + upper_offset
            
            min_hours_scaled = int(min_hours * 100)
            max_hours_scaled = int(max_hours * 100)
            
            bucket_dates = self._get_date_range(bucket_start, bucket_end)
            bucket_label = f"{bucket_start}~{bucket_end}"
            
            self.log(
                f"Bucket {bucket_label} ({'Full' if is_full_month else 'Partial'}): "
                f"{workdays} workdays, standard={standard_hours}h, range=[{min_hours}h, {max_hours}h]"
            )
            
            for emp_id in all_employees:
                # Collect shift vars for this employee in this bucket
                # shift_assignments: (emp_id, date_str, shift_id) -> Var
                emp_shift_terms = []  # [(hours_scaled, var), ...]
                
                for date_str in bucket_dates:
                    for shift_id, hours_scaled in shift_hours_map.items():
                        # Skip REST shifts (they contribute 0 hours anyway)
                        if shift_id in rest_shift_ids:
                            continue
                        
                        key = (emp_id, date_str, shift_id)
                        if key in shift_assignments:
                            emp_shift_terms.append((hours_scaled, shift_assignments[key]))
                
                if not emp_shift_terms:
                    continue
                
                # Create total hours expression
                total_hours_expr = sum(coef * var for coef, var in emp_shift_terms)
                
                # H9: Lower Limit (Hard)
                model.Add(total_hours_expr >= min_hours_scaled)
                constraints_added += 1
                
                # H8: Upper Limit (Hard)
                model.Add(total_hours_expr <= max_hours_scaled)
                constraints_added += 1
        
        self.log(f"Added {constraints_added} standard hours constraints.")
        return constraints_added

    def _split_window_by_month(self, window: Dict[str, str]) -> List[Tuple[str, str, bool]]:
        """
        Split the scheduling window into month buckets.
        
        Returns:
            List of (start_date, end_date, is_full_month) tuples.
        """
        start_date = datetime.strptime(window['start_date'], "%Y-%m-%d").date()
        end_date = datetime.strptime(window['end_date'], "%Y-%m-%d").date()
        
        buckets = []
        current = start_date
        
        while current <= end_date:
            year, month = current.year, current.month
            _, last_day = monthrange(year, month)
            month_end = date(year, month, last_day)
            
            # Determine bucket end (min of month_end and window end)
            bucket_end = min(month_end, end_date)
            
            # Determine if this is a full month
            month_start = date(year, month, 1)
            is_full_month = (current == month_start) and (bucket_end == month_end)
            
            buckets.append((current.strftime("%Y-%m-%d"), bucket_end.strftime("%Y-%m-%d"), is_full_month))
            
            # Move to next month
            current = date(year, month, last_day) + timedelta(days=1)
            if current > end_date:
                break
        
        return buckets

    def _count_workdays(self, start_str: str, end_str: str, workday_map: Dict[str, bool]) -> int:
        """Count workdays in a date range."""
        count = 0
        for date_str in self._get_date_range(start_str, end_str):
            if workday_map.get(date_str, False):
                count += 1
        return count

    def _get_date_range(self, start_str: str, end_str: str) -> List[str]:
        """Generate list of date strings in range [start, end]."""
        from datetime import timedelta
        
        start = datetime.strptime(start_str, "%Y-%m-%d").date()
        end = datetime.strptime(end_str, "%Y-%m-%d").date()
        
        dates = []
        current = start
        while current <= end:
            dates.append(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)
        
        return dates
