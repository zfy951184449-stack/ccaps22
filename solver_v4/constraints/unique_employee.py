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
        Apply constraints for a single employee using per-Op Sweep-line.
        
        Shared-group exemptions are applied AFTER overlap detection:
        ops in the same group are bucketed together so they don't
        mutually exclude each other, while still blocking outsiders.
        """
        
        # A. Per-Op assignment variables (no Unit aggregation)
        op_vars: Dict[int, cp_model.IntVar] = {}
        for op_id in op_ids:
            v = self._get_any_assignment_var(model, index, op_id, emp_id)
            if v is not None:
                op_vars[op_id] = v

        if len(op_vars) < 2:
            return 0

        # B. Sweep-line on individual Op intervals
        events = []  # (time, type, op_id)  type: -1=End, 1=Start
        for op_id in op_vars:
            start, end = op_times[op_id]
            events.append((start, 1, op_id))
            events.append((end, -1, op_id))

        # End (-1) before Start (1) at same timestamp → touching intervals don't overlap
        events.sort(key=lambda x: (x[0], x[1]))

        current_active: Set[int] = set()
        raw_cliques: List[frozenset] = []

        for _, type_, op_id in events:
            if type_ == 1:
                current_active.add(op_id)
                if len(current_active) > 1:
                    raw_cliques.append(frozenset(current_active))
            else:
                current_active.discard(op_id)

        # C. Keep only Maximal Cliques (superset filter)
        unique_cliques = list(set(raw_cliques))
        unique_cliques.sort(key=len, reverse=True)
        final_cliques: List[frozenset] = []

        for c in unique_cliques:
            if not any(c.issubset(parent) for parent in final_cliques):
                final_cliques.append(c)

        # D. Add constraints with shared-group exemption
        count = 0
        for clique in final_cliques:
            # Bucket ops by group: same-group ops share a bucket (OR variable)
            # Independent ops (group=None) each get their own bucket
            buckets: Dict[Optional[int], List[cp_model.IntVar]] = defaultdict(list)
            for op_id in clique:
                group_id = op_to_group.get(op_id)  # None if independent
                buckets[group_id].append(op_vars[op_id])

            # Build one variable per bucket
            bucket_vars: List[cp_model.IntVar] = []
            for gid, vars_list in buckets.items():
                if gid is None:
                    # Independent ops: each is its own mutual-exclusion participant
                    bucket_vars.extend(vars_list)
                elif len(vars_list) == 1:
                    bucket_vars.append(vars_list[0])
                else:
                    # Same-group ops in this clique → OR into one variable
                    bv = model.NewBoolVar(f"GBucket_{gid}_{emp_id}_{count}")
                    model.AddMaxEquality(bv, vars_list)
                    bucket_vars.append(bv)

            if len(bucket_vars) < 2:
                continue  # All ops in clique belong to the same group

            model.Add(sum(bucket_vars) <= 1)
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
