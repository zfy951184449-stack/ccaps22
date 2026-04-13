"""
Max Consecutive Working Days Constraint Module

Ensures that employees do not work more than N consecutive days.
Working day is defined as a day with an assigned shift that is NOT of type 'REST'.
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Optional
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
import logging

class MaxConsecutiveWorkDaysConstraint(BaseConstraint):
    name = "MaxConsecutiveWorkDays"
    config_key = "enable_max_consecutive_work_days"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments
        
        # 0. Pre-check for diagnostics
        self.detect_unavoidable_conflicts(data)
        
        if not shift_assignments:
            self.log("Shift assignments not present (or empty). Skipping.", level="info")
            return 0

        # 1. Get Config Limit
        limit = 6
        if data.config and "max_consecutive_work_days" in data.config:
            try:
                limit = int(data.config["max_consecutive_work_days"])
            except (ValueError, TypeError):
                self.log("Invalid config for max_consecutive_work_days, defaulting to 6.", level="warning")
                limit = 6
        
        self.log(f"Applying limit: Max {limit} consecutive working days.")
        
        # 2. Identify REST Shift IDs
        # Map shift_id -> is_working_shift (True if NOT REST)
        is_working_shift_map = {}
        if data.shift_definitions:
            for s in data.shift_definitions:
                # REST判定：仅基于 nominal_hours (plan_category 字段不存在于数据库中)
                is_rest = (s.nominal_hours <= 0.01)
                is_working = not is_rest
                is_working_shift_map[s.shift_id] = is_working

        # [DIAGNOSTIC] Check if any REST shift exists
        has_rest_shift = any(not is_work for is_work in is_working_shift_map.values())
        if not has_rest_shift:
            self.log("[CONFLICT] No 'REST' shift defined in input! (Only checking nominal_hours <= 0.01). 'ShiftAssignmentConstraint' forces one shift per day. If all shifts are working shifts, employees count as working EVERY DAY. This guarantees INFEASIBILITY if duration > limit.", level="error")
            # We could technically return 0 here to avoid crashing solver, but it's better to fail loud?
            # Actually, let's let it run but the log is critical.

        # 2.5 Apply Historical Boundary Constraints (NEW)
        constraints_added = 0
        if hasattr(data, 'historical_shifts') and data.historical_shifts:
            boundary_constraints = self._apply_boundary_constraints(
                model, shift_assignments, data, limit, is_working_shift_map
            )
            constraints_added += boundary_constraints

        # 3. Group Shift Vars by Employee and Date
        # shift_assignments: (emp_id, date_str, shift_id) -> Var
        
        emp_date_vars = defaultdict(lambda: defaultdict(list))
        
        for (emp_id, date, shift_id), var in shift_assignments.items():
            # Only consider "working" shifts.
            # If shift definition is missing (edge case), assume it's working.
            if is_working_shift_map.get(shift_id, True): 
                emp_date_vars[emp_id][date].append(var)
        
        # 4. Apply Constraint per Employee
        for emp_id, dates_dict in emp_date_vars.items():
            # Get all dates involved for this employee
            # Note: We construct a continuous timeline from min to max date
            # to handle "gaps" (which are implicitly rest days).
            
            dates = sorted(dates_dict.keys())
            if not dates:
                continue
                
            date_objs = []
            for d in dates:
                try:
                    date_objs.append(datetime.strptime(d, "%Y-%m-%d").date())
                except ValueError:
                    self.log(f"Invalid date format: {d}, skipping.", level="warning")
                    
            if not date_objs:
                continue

            min_date = min(date_objs)
            max_date = max(date_objs)
            
            total_days = (max_date - min_date).days + 1
            
            # daily_expressions[i] is the expression for "is working" on (min_date + i)
            # Expression = Sum(working shift vars)
            # Since OneShift per day is active, this Sum should be 0 or 1.
            daily_expressions = []
            
            for i in range(total_days):
                d_date = min_date + timedelta(days=i)
                d_str = d_date.strftime("%Y-%m-%d")
                
                vars_on_day = dates_dict.get(d_str, [])
                
                if not vars_on_day:
                    daily_expressions.append(0) # Not working (Gap or Rest Shift only)
                else:
                    daily_expressions.append(sum(vars_on_day))
            
            # Sliding Window
            # If Limit = 6, we check windows of size 7.
            # Sum(window) <= 6.
            # This logic works because Gaps are 0.
            
            window_size = limit + 1
            
            if len(daily_expressions) < window_size:
                continue
                
            # [DEBUG] Pre-check for unavoidable violations (Single Candidate)
            # If this employee is the ONLY candidate for operations on > Limit consecutive days,
            # then the problem is INFEASIBLE by definition (since demands are hard).
            # We can't know for sure without checking all ops, but we can check the *candidate_lists*.
            # This is complex to do efficiently here.
            
            # Alternative: Add a 'named' boolean constraint that we can track?
            # Or just Log the constraints being added for deep debugging.
            
            for i in range(len(daily_expressions) - window_size + 1):
                window = daily_expressions[i : i + window_size]
                
                # Create a specific boolean variable for this violation? No, overhead.
                # Just add the constraint.
                c = model.Add(sum(window) <= limit)
                
                # [OPTIONAL] Name the constraint for debugging (if cp_model supports it, Proto does)
                # c.Proto().name = f"MaxWorkDays_{emp_id}_{dates[i]}" 
                
                constraints_added += 1
                
        self.log(f"Added {constraints_added} max consecutive working days constraints.")
        return constraints_added

    def detect_unavoidable_conflicts(self, data: SolverRequest):
        """
        Analyze demands to see if any employee is FORCED to work > limit days 
        because they are the ONLY candidate for consecutive operations.
        """
        limit = 6
        if data.config and "max_consecutive_work_days" in data.config:
             try:
                 limit = int(data.config["max_consecutive_work_days"])
             except: pass
             
        # Map Date -> List of Ops -> List of Candidates
        # We look for days where Emp X is the ONLY candidate for at least one Op.
        # If Emp X is "Essential" on Day D.
        
        # 1. Build Essential Map: Emp -> Set(Dates)
        essential_days = defaultdict(set)
        
        for op in data.operation_demands:
            date_str = op.planned_start.split("T")[0]
            
            # Check all positions
            for pos in op.position_qualifications:
                candidates = pos.candidate_employee_ids
                if len(candidates) == 1:
                    # Emp is ESSENTIAL for this position on this day
                    # (Assuming position must be filled -> Hard Constraint)
                    emp_id = candidates[0]
                    essential_days[emp_id].add(date_str)
                    
        # 2. Check Consecutive Essentials
        for emp_id, days in essential_days.items():
            sorted_days = sorted(list(days))
            if not sorted_days:
                continue
                
            date_objs = []
            for d in sorted_days:
                try:
                    date_objs.append(datetime.strptime(d, "%Y-%m-%d").date())
                except: pass
            
            if not date_objs:
                continue
                
            # Check consecutive sequence > limit
            # This is "Essential Work Days". The actual work might be more, but this is the lower bound.
            
            consecutive = 1
            start_seq_idx = 0
            
            for i in range(1, len(date_objs)):
                diff = (date_objs[i] - date_objs[i-1]).days
                if diff == 1:
                    consecutive += 1
                else:
                    consecutive = 1
                    start_seq_idx = i
                    
                if consecutive > limit:
                    first_day = date_objs[start_seq_idx]
                    last_day = date_objs[i]
                    self.log(f"[CONFLICT] Employee {emp_id} is the ONLY candidate for operations on {consecutive} consecutive days ({first_day} to {last_day}). This violates the limit of {limit} days. Solver will be INFEASIBLE.", level="error")
                    
        # 3. Check Aggregate Capacity (Pigeonhole Principle)
        # Total Demand (Man-Days) vs Total Supply (Man-Days with Rest)
        
        # A. Calculate Demand (Total Assignments Needed)
        # We assume 1 assignment per op (required_people=1 usually, but let's check)
        total_demand = sum(op.required_people for op in data.operation_demands)
        
        # B. Calculate Supply
        # Supply = Sum(MaxWorkDays(Emp))
        # MaxWorkDays(Emp) depends on their available window.
        # Strict Upper Bound: 
        #   total_days = (WindowEnd - WindowStart).days + 1
        #   max_work = total_days - (total_days // (limit + 1))
        #   (Every L+1 days you MUST rest 1 day)
        
        if not data.window:
            return

        try:
            w_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            w_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
            total_window_days = (w_end - w_start).days + 1
            
            # Identify active employees (those who have at least 1 qualification match?)
            # Or just all profiles.
            active_employees = len(data.employee_profiles)
            
            # Max work days per person
            # If Limit=6. Cycle=7.
            # In 7 days, max 6 work.
            # In 8 days, max 7? (6 work, 1 rest, 1 work). Yes.
            # Formula: (days // cycle) * limit + min(days % cycle, limit)
            cycle = limit + 1
            full_cycles = total_window_days // cycle
            remainder = total_window_days % cycle
            max_per_emp = (full_cycles * limit) + min(remainder, limit)
            
            total_capacity = active_employees * max_per_emp
            
            if total_demand > total_capacity:
                self.log(f"[CONFLICT] Aggregate Capacity Shortage! Total Demand ({total_demand} shifts) > Max Theoretical Capacity ({total_capacity} shifts). You have {active_employees} employees for {total_window_days} days. Max allowed work days/emp is {max_per_emp}.", level="error")
        except Exception as e:
            self.log(f"Diagnostic Error: {e}", level="warning")

    def _apply_boundary_constraints(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest,
        limit: int,
        is_working_shift_map: Dict[int, bool]
    ) -> int:
        """
        Apply historical boundary constraints.
        
        Logic: If an employee has already worked X consecutive days before the window,
        they can only work (limit - X) more days at the start of the window before needing rest.
        """
        constraints = 0
        
        # Get window start date
        if not data.window:
            return 0
            
        try:
            window_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
        except (KeyError, ValueError) as e:
            self.log(f"Invalid window format for boundary check: {e}", level="warning")
            return 0
        
        # Build history map: emp_id -> consecutive_work_days
        history_map: Dict[int, int] = {}
        for hist in data.historical_shifts:
            if hasattr(hist, 'consecutive_work_days') and hist.consecutive_work_days > 0:
                history_map[hist.employee_id] = hist.consecutive_work_days
        
        if not history_map:
            self.log("No significant historical consecutive work detected.", level="info")
            return 0
        
        self.log(f"Applying boundary constraints for {len(history_map)} employees with work history.")
        
        # For each employee with historical work days
        for emp_id, hist_consecutive in history_map.items():
            remaining_allowed = limit - hist_consecutive
            
            if remaining_allowed <= 0:
                # Historical work already at/exceeds limit -> First day MUST rest
                first_day_str = window_start.strftime("%Y-%m-%d")
                for shift_id, is_working in is_working_shift_map.items():
                    if is_working:
                        var = shift_assignments.get((emp_id, first_day_str, shift_id))
                        if var is not None:
                            model.Add(var == 0)
                            constraints += 1
                self.log(f"[Boundary] Emp {emp_id}: Hist={hist_consecutive} >= Limit={limit}, Day 1 MUST rest", level="info")
            else:
                # Limit work days in the first (remaining_allowed + 1) days
                # This ensures the sliding window constraint is effectively extended
                window_size = remaining_allowed + 1
                
                daily_work_exprs = []
                has_vars = False
                for offset in range(window_size):
                    day = window_start + timedelta(days=offset)
                    day_str = day.strftime("%Y-%m-%d")
                    
                    working_vars = [
                        shift_assignments[(emp_id, day_str, sid)]
                        for sid, is_work in is_working_shift_map.items()
                        if is_work and (emp_id, day_str, sid) in shift_assignments
                    ]
                    
                    if working_vars:
                        daily_work_exprs.extend(working_vars)
                        has_vars = True
                
                if has_vars and daily_work_exprs:
                    model.Add(sum(daily_work_exprs) <= remaining_allowed)
                    constraints += 1
                    self.log(f"[Boundary] Emp {emp_id}: Hist={hist_consecutive}, First {window_size} days <= {remaining_allowed} work", level="info")
        
        self.log(f"Historical boundary constraints added: {constraints}")
        return constraints
