"""
Flexible Scheduling Constraint Module

Handles tasks with `scheduling_mode == 'FLEXIBLE'`.
These tasks need to be placed within a time window [earliest_start, deadline]
and optionally restricted to preferred shifts.

For each flexible task O:
1. Creates `task_placement(O, D, S)` boolean variables for valid (Date, Shift).
   Constraint: Sum(task_placement) == 1.
2. For each assigned employee E:
   Assign(E, O) AND task_placement(O, D, S) => shift_assignments(E, D, S)
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set, Optional, Tuple
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
from utils.time_utils import get_date_range

class FlexibleSchedulingConstraint(BaseConstraint):
    name = "FlexibleScheduling"
    config_key = "enable_flexible_scheduling"
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        index = ctx.index
        shift_assignments = ctx.shift_assignments
        shift_definitions = data.shift_definitions
        
        if not shift_assignments:
            return 0
            
        constraints_added = 0
        placement_vars_created = 0

        # We need the global window dates to intersect with task windows
        global_dates = get_date_range(data.window['start_date'], data.window['end_date'])
        
        for op in data.operation_demands:
            if getattr(op, 'scheduling_mode', 'FIXED') != 'FLEXIBLE':
                continue
                
            op_id = op.operation_plan_id
            
            # 1. Determine valid (Date, Shift) combinations
            task_dates = get_date_range(op.earliest_start or data.window['start_date'], 
                                        op.deadline or data.window['end_date'])
            # Intersect with global window
            valid_dates = [d for d in task_dates if d in global_dates]
            
            preferred_shifts = getattr(op, 'preferred_shift_ids', None)
            if preferred_shifts is not None and len(preferred_shifts) > 0:
                valid_shifts = [s.shift_id for s in shift_definitions if s.shift_id in preferred_shifts]
            else:
                valid_shifts = [s.shift_id for s in shift_definitions]
                
            if not valid_dates or not valid_shifts:
                self.log(f"Flexible Task {op.operation_name} (ID: {op_id}) has no valid dates or shifts!", level="warning")
                # Block assignment
                for _, _, var in index.get_assignments_for_op(op_id):
                    model.Add(var == 0)
                continue

            # 2. Create task_placement variables
            task_placements = {}
            placement_vars_list = []
            
            for d in valid_dates:
                for s_id in valid_shifts:
                    var = model.NewBoolVar(f"TaskPlacement_{op_id}_{d}_{s_id}")
                    task_placements[(d, s_id)] = var
                    ctx.task_placements[(op_id, d, s_id)] = var
                    placement_vars_list.append(var)
                    placement_vars_created += 1
            
            # Task must be placed exactly once (if it's not vacant completely, but wait, if it's vacant?)
            # Usually tasks must be fulfilled unless allow_vacancy is true.
            # But the vacancies are applied at the assignment level.
            # However, task placement happens anyway. The task just occupies a slot, even if vacant.
            # This is fine. It just means the "empty" task occupies a shift slot conceptually.
            model.AddExactlyOne(placement_vars_list)
            constraints_added += 1
            
            # 3. Synchronize assigned employees with the chosen placement
            candidates = index.get_candidates_for_op(op_id)
            for emp_id in candidates:
                assign_vars = index.get_vars_for_op_emp(op_id, emp_id)
                if not assign_vars:
                    continue
                
                for av in assign_vars:
                    # Check if employee has shift variables for the valid combinations
                    has_valid_shift_vars = False
                    for d in valid_dates:
                        for s_id in valid_shifts:
                            shift_var = shift_assignments.get((emp_id, d, s_id))
                            place_var = task_placements.get((d, s_id))
                            if shift_var is not None and place_var is not None:
                                has_valid_shift_vars = True
                                # av AND place_var => shift_var
                                # => not(av) OR not(place_var) OR shift_var
                                model.AddBoolOr([av.Not(), place_var.Not(), shift_var])
                                constraints_added += 1
                                
                    if not has_valid_shift_vars:
                        # Employee has no overlapping shift vars, so cannot be assigned
                        model.Add(av == 0)

        self.log(f"Created {placement_vars_created} placement variables and {constraints_added} constraints for flexible tasks.")
        return constraints_added
