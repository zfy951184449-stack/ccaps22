"""
One Position Per Operation Constraint Module

Ensures that a single employee acts in at most one position within a single operation.
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set, Optional
from collections import defaultdict
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.index import AssignmentIndex
from core.context import SolverContext
import logging

class OnePositionConstraint(BaseConstraint):
    """
    One Position Constraint
    
    Logic:
    For each operation with multiple positions:
      For each employee candidate:
        Sum(AssignmentVars for this op and this employee) <= 1
    """
    
    name = "OnePosition"
    is_hard = True
    
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply One Position constraints"""
        model = ctx.model
        index = ctx.index
        
        constraints_added = 0
        
        # 1. Identify Operations with multiple positions
        multi_pos_ops = []
        for op in data.operation_demands:
            if len(op.position_qualifications) > 1:
                multi_pos_ops.append(op)
                
        if not multi_pos_ops:
            return 0
            
        # 2. Use index for efficient lookup instead of scanning assignments
        # For each op with multiple positions, check each candidate
            
        # 3. Apply constraints
        for op in multi_pos_ops:
            op_id = op.operation_plan_id
            
            # Identify all candidates involved in this op
            # We can just iterate the keys of op_emp_vars that match this op_id
            # But iterating the dict keys for every op might be slow if huge.
            # Optimization: The map (op_id, emp_id) -> vars is good.
            # But we don't know the list of emp_ids easily without iterating keys or scanning op definition.
            # Scanning Op definition is cleaner.
            
            # Get all candidates from the operation's position qualifications
            candidates_seen = set()
            for pq in op.position_qualifications:
                for emp_id in pq.candidate_employee_ids:
                    candidates_seen.add(emp_id)
            
            for emp_id in candidates_seen:
                # Use index for O(1) lookup
                vars_list = index.get_vars_for_op_emp(op_id, emp_id)
                
                if vars_list and len(vars_list) > 1:
                    # Enforce Sum <= 1
                    model.Add(sum(vars_list) <= 1)
                    constraints_added += 1
                    
        self.log(f"Total One Position constraints: {constraints_added}")
        return constraints_added
