"""
Shift Assignment Constraint Module

Ensures that:
1. Every employee has exactly one shift assigned per day.
2. Employee can ONLY be assigned to operations that their selected shift can cover.

This implements SIMULTANEOUS optimization of operations and shifts:
- If shift doesn't cover operation → employee can't be assigned to that operation while using that shift
- Constraint: shift_var + assign_var <= 1 (for non-covering pairs)
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set, Optional, Tuple
from collections import defaultdict
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.index import AssignmentIndex, ShiftIndex
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix
from datetime import datetime, timedelta
import logging

class ShiftAssignmentConstraint(BaseConstraint):
    """
    Shift Assignment with simultaneous operation-shift optimization.
    """
    
    name = "ShiftAssignment"
    is_hard = True
    
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply shift assignment constraints"""
        model = ctx.model
        index = ctx.index
        shift_assignments = ctx.shift_assignments
        shift_index = ctx.shift_index
        
        if not shift_assignments or shift_index is None:
            self.log("Missing shift_assignments or shift_index. Skipping.", level="warning")
            return 0
            
        constraints_added = 0
        
        # 1. One Shift Per Employee Per Day
        shifts_by_emp_day = defaultdict(list)
        for (emp_id, date, shift_id), var in shift_assignments.items():
            shifts_by_emp_day[(emp_id, date)].append((shift_id, var))
            
        for (emp_id, date), shift_vars in shifts_by_emp_day.items():
            model.Add(sum(var for _, var in shift_vars) == 1)
            constraints_added += 1
            
        self.log(f"Enforced One-Shift-Per-Day for {len(shifts_by_emp_day)} employee-days.")
        
        # 2. Positive Implication: Task -> Valid Shift
        # Refactored to eliminate hardcoded Beijing time logic and use Positive Constraints.
        
        # Pre-calculate date range for the window
        from utils.time_utils import get_date_range, parse_iso_to_unix
        window_dates = get_date_range(data.window['start_date'], data.window['end_date'])
        
        # Cache op coverage to avoid re-calculation for each employee candidate
        # op_id -> list of (date, shift_id) keys
        op_coverage_cache = {}
        
        implication_count = 0
        infeasible_count = 0
        
        for op in data.operation_demands:
            if getattr(op, 'scheduling_mode', 'FIXED') == 'FLEXIBLE':
                continue # Handled by FlexibleSchedulingConstraint
                
            op_id = op.operation_plan_id
            
            # 2a. Calculate valid shifts for this operation
            if op_id not in op_coverage_cache:
                op_start = parse_iso_to_unix(op.planned_start)
                op_end = parse_iso_to_unix(op.planned_end)
                
                # Use robust covering logic from ShiftIndex
                covering_shifts = shift_index.get_covering_shifts(op_start, op_end, window_dates)
                op_coverage_cache[op_id] = covering_shifts
            
            valid_shift_keys = op_coverage_cache[op_id]
            
            if not valid_shift_keys:
                self.log(f"⚠️ Operation {op_id}: No covering shifts found! ({op.planned_start} - {op.planned_end})", level="warning")
                # If no shift covers it, no one can be assigned.
                # Force all assignment vars for this op to 0.
                for _, _, var in index.get_assignments_for_op(op_id):
                     model.Add(var == 0)
                     infeasible_count += 1
                continue

            # 2b. Add Implication for each candidate
            # If Emp E assigned to Op O -> Emp E MUST have one of (Date D, Shift S) assigned
            
            # Get all candidate assignments
            # (pos_num, emp_id, var)
            processed_employees = set()
            for _, emp_id, assign_var in index.get_assignments_for_op(op_id):
                if emp_id in processed_employees:
                    continue
                # Note: An employee might have multiple position vars for same op (rare but possible if multi-skill)
                # But here we loop vars. Let's group vars by employee effectively.
                
                # Actually, index.get_assignments_for_op returns list of tuples.
                # Identify effective assignment var for (op, emp)
                
                # Check if we processed this (op, emp) pair
                # Using index.get_vars_for_op_emp(op_id, emp_id) is safer to handle multiple pos
                
                pass # Logic handled below per employee
            
            # Better loop: Iterate Candidates
            candidates = index.get_candidates_for_op(op_id)
            for emp_id in candidates:
                assign_vars = index.get_vars_for_op_emp(op_id, emp_id)
                if not assign_vars:
                    continue
                
                # Create a master assignment var = sum(assign_vars) >= 1 ?
                # Or just Sum(assign_vars) since they are mutually exclusive usually?
                # Actually, an employee can only hold 1 position in 1 op usually (OnePositionConstraint).
                # So we can imply from Each assign_var.
                
                # Collect Shift Variables for this employee corresponding to valid keys
                valid_emp_shift_vars = []
                for date, shift_id in valid_shift_keys:
                    # Check if variable exists (it should if employee is available that day)
                    if (emp_id, date, shift_id) in shift_assignments:
                        valid_emp_shift_vars.append(shift_assignments[(emp_id, date, shift_id)])
                
                if not valid_emp_shift_vars:
                    # Employee has NO valid shifts available (maybe due to availability/calendar restriction)
                    # So they cannot do this task.
                    # Force assign_vars to 0
                    for av in assign_vars:
                        model.Add(av == 0)
                        infeasible_count += 1
                    continue
                    
                # Add Constraint: Assign(E, O) => Sum(ValidShifts(E)) == 1
                # Implementation: Sum(ValidShifts) >= Assign
                # Since we enforced "At most 1 shift per day", and ValidShifts usually fall on the same day 
                # (unless op spans 24h which is rare, or we consider alternative dates),
                # Sum(ValidShifts) will be 0 or 1.
                # So Assign <= Sum(ValidShifts) is correct.
                
                sum_valid_shifts = sum(valid_emp_shift_vars)
                for av in assign_vars:
                    model.Add(av <= sum_valid_shifts)
                    implication_count += 1
        
        self.log(f"Added {implication_count} positive implication constraints.")
        if infeasible_count > 0:
            self.log(f"Blocked {infeasible_count} infeasible assignments (no covering shift).", level="warning")
            
        constraints_added += implication_count + infeasible_count
        return constraints_added
