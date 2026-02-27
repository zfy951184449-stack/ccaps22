"""
Unique Employee Constraint Module

Ensures that a single employee is not assigned to multiple overlapping operations simultaneously,
unless those operations belong to the same Share Group.
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set, Tuple, Optional
from collections import defaultdict
from constraints.base import BaseConstraint
from contracts.request import SolverRequest, OperationDemand
from core.index import AssignmentIndex
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix
import logging

class UniqueEmployeeConstraint(BaseConstraint):
    """
    Unique Employee Constraint
    
    Logic:
    1. Group operations into "Execution Units" (Independent Op or Share Group).
    2. For each employee, identify potential Assignments.
    3. Use Sweep-line algorithm to find overlapping Execution Units.
    4. For every Maximal Clique of overlapping units, enforce Sum(UnitVars) <= 1.
    """
    
    name = "UniqueEmployee"
    is_hard = True
    
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply unique employee constraints"""
        model = ctx.model
        index = ctx.index
        
        # 1. Map Operation -> Share Group ID
        op_to_group = {}
        if data.shared_preferences:
            for group in data.shared_preferences:
                for member in group.members:
                    op_to_group[member["operation_plan_id"]] = group.share_group_id
                    
        # 2. Precompute Operation Time Intervals (Unix Timestamp)
        # Map: op_id -> (start, end)
        op_times = {}
        for op in data.operation_demands:
            start = parse_iso_to_unix(op.planned_start)
            end = parse_iso_to_unix(op.planned_end)
            if end <= start:
                self.log(f"Warning: Invalid duration for Op {op.operation_plan_id} ({start} - {end})", level="warning")
                continue
            op_times[op.operation_plan_id] = (start, end)

        # 3. Use index to get employee -> ops mapping efficiently
        # Map: emp_id -> List[op_id]
        emp_ops = defaultdict(list)
        
        # Use index for O(1) lookup instead of iterating assignments
        for emp_id in index.get_all_employees():
            for (op_id, _, _) in index.get_assignments_for_emp(emp_id):
                if op_id in op_times:
                    emp_ops[emp_id].append(op_id)
                
        constraints_added = 0
        
        # 4. Process each employee
        for emp_id, candidate_ops in emp_ops.items():
            # Deduplicate ops (employee might be candidate for multiple positions in same op)
            unique_ops = list(set(candidate_ops))
            if len(unique_ops) < 2:
                continue
                
            constraints_added += self._constrain_employee(
                model, index, emp_id, unique_ops, op_to_group, op_times
            )
            
        self.log(f"Total Unique Employee constraints: {constraints_added}")
        return constraints_added

    def _constrain_employee(
        self,
        model: cp_model.CpModel,
        index: AssignmentIndex,
        emp_id: int,
        op_ids: List[int],
        op_to_group: Dict[int, int],
        op_times: Dict[int, Tuple[int, int]]
    ) -> int:
        """
        Apply constraints for a single employee using Sweep-line.
        """
        
        # A. Build Execution Units
        # Unit Key: 'S_{group_id}' or 'O_{op_id}'
        # Value: {'intervals': [(start, end)], 'ops': [op_ids]}
        units = {}
        
        for op_id in op_ids:
            if op_id in op_to_group:
                # Share Group Unit
                group_id = op_to_group[op_id]
                key = f"S_{group_id}"
                if key not in units:
                    units[key] = {'intervals': [], 'ops': []}
                units[key]['ops'].append(op_id)
                units[key]['intervals'].append(op_times[op_id])
            else:
                # Independent Unit
                key = f"O_{op_id}"
                units[key] = {'intervals': [op_times[op_id]], 'ops': [op_id]}
        
        if len(units) < 2:
            return 0
            
        # B. Create Unit Activation Variables
        # For Independent: Var is the assignment var (or sum if multi-pos, but usually 1 pos/emp)
        # For Share Group: Var is Max(all assignments in group)
        unit_vars = {}
        
        for key, data in units.items():
            relevant_vars = []
            for op_id in data['ops']:
                # Find all vars for this emp in this op (could be multiple positions)
                # We need to search the assignments dict keys again? Or pass them better?
                # Optimization: We know op_id and emp_id, just need pos_num...
                # But we don't have pos_num handy without searching.
                # Let's filter from assignments passed in (inefficient but safe for now?)
                # BETTER: Pass a helper or improve upstream structure.
                # Given V4 structure, we have to iterate or guess.
                # Wait, `assignments` is Dict[(op, pos, emp), Var].
                # We can iterate assignments keys once in `apply` to build a lookup. 
                # Doing it here is O(N_vars). That's bad inside a loop.
                # FIX: Let's assume we use a helper `_get_employee_assigned_var` like in ShareGroup.
                pass 
                
            # Using the helper concept (implemented below essentially)
            op_vars = []
            for op_id in data['ops']:
                v = self._get_any_assignment_var(model, index, op_id, emp_id)
                if v is not None:
                    op_vars.append(v)
            
            if not op_vars:
                continue
                
            if len(op_vars) == 1:
                unit_vars[key] = op_vars[0]
            else:
                # If multiple ops in unit (ShareGroup) or multiple positions,
                # Unit is active if ANY op is active.
                # Use a cache key to avoid duplicate Max vars if possible? 
                # Names must be unique.
                v_name = f"UnitActive_{key}_{emp_id}"
                active_var = model.NewBoolVar(v_name)
                model.AddMaxEquality(active_var, op_vars)
                unit_vars[key] = active_var

        # C. Calculate Effective Unit Interval
        # For Share Groups, effective interval is Union of all member intervals.
        # But wait, if a group has gaps? 
        # Plan said: "Union(All Ops Time Ranges)". 
        # If Group has Op A (10-11) and Op B (12-13), does it block 11-12?
        # NO. It blocks [10-11] and [12-13]. 
        # So a Unit can have multiple disjoint intervals.
        
        events = [] # (time, type, unit_key) type: 1=Start, -1=End
        
        for key, data in units.items():
             if key not in unit_vars:
                 continue
             
             # Merge overlapping intervals within the unit just to be clean?
             # Or just push all intervals.
             # Pushing all is fine, sweep line handles it. 
             # Refinement: If Group covers 10-12 and 11-13, effective is 10-13.
             # Merging helps reduce events.
             merged = self._merge_intervals(data['intervals'])
             
             for (start, end) in merged:
                 events.append((start, 1, key))
                 events.append((end, -1, key))
                 
        # D. Sweep-line Algorithm
        events.sort(key=lambda x: (x[0], x[1])) # Sort by time, then type (Start before End? No, End before Start usually? 
        # If [10, 11) and [11, 12), End 11 should process before Start 11 to allow touching.
        # So Type -1 (End) < Type 1 (Start). Correct.
        
        current_active = set()
        max_cliques = []
        
        for _, type_, key in events:
            if type_ == 1: # Start
                current_active.add(key)
                if len(current_active) > 1:
                     # Record this set. But we want Maximal cliques later.
                     # Determining maximal cliques in interval graphs:
                     # A set is maximal intersection if it's active "just before" an interval ends or "just after" one starts?
                     # Actually, every time we add, we potentially form a new clique.
                     # We should collect all sets that appear.
                     # Then filter for maximality? 
                     # "Algorithm to find maximal cliques in interval graph":
                     # The set of active intervals defines a clique. We care about the "local maximums" of this set size/content.
                     pass
                
                # Snapshot current active set as a potential constraint
                if len(current_active) > 1:
                     # We store a frozenset to deduplicate
                     max_cliques.append(frozenset(current_active))
                     
            else: # End
                current_active.remove(key)
        
        # E. Post-process to keep only Maximal Cliques
        # If Set A is subset of Set B, we only need constraint on B.
        # (Constraint Sum(B) <= 1 implies Sum(A) <= 1)
        
        # Remove duplicates
        unique_cliques = list(set(max_cliques))
        
        # Filter subsets
        # Sort by size descending
        unique_cliques.sort(key=len, reverse=True)
        final_cliques = []
        
        for c in unique_cliques:
            is_subset = False
            for parent in final_cliques:
                if c.issubset(parent):
                    is_subset = True
                    break
            if not is_subset:
                final_cliques.append(c)
                
        # F. Add Constraints
        count = 0
        for clique in final_cliques:
            vars_in_clique = [unit_vars[k] for k in clique]
            model.Add(sum(vars_in_clique) <= 1)
            count += 1
            
        return count

    def _get_any_assignment_var(
        self, 
        model: cp_model.CpModel, 
        index: AssignmentIndex, 
        op_id: int, 
        emp_id: int
    ) -> Optional[cp_model.IntVar]:
        """Helper to get a variable representing if employee is assigned to op (any pos)"""
        # Use index for O(1) lookup
        relevant = index.get_vars_for_op_emp(op_id, emp_id)
        
        if not relevant:
            return None
        if len(relevant) == 1:
            return relevant[0]
            
        # If multiple positions for same op (rare but possible), OR them.
        or_var = model.NewBoolVar(f"AnyPos_{op_id}_{emp_id}")
        model.AddMaxEquality(or_var, relevant)
        return or_var

    def _merge_intervals(self, intervals: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Merge overlapping intervals"""
        if not intervals:
            return []
            
        # Sort by start time
        sorted_ints = sorted(intervals, key=lambda x: x[0])
        merged = []
        
        current_start, current_end = sorted_ints[0]
        
        for i in range(1, len(sorted_ints)):
            next_start, next_end = sorted_ints[i]
            
            if next_start < current_end: # Overlap or touch? Strict overlap needed? 
                # If 10-11 and 11-12. Touch. Not overlap. 
                # If next_start < current_end means they share time. 
                # Merge.
                current_end = max(current_end, next_end)
            else:
                merged.append((current_start, current_end))
                current_start, current_end = next_start, next_end
                
        merged.append((current_start, current_end))
        return merged
