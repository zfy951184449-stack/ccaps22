"""
Share Group Constraint Module

Enforces that operations in the same share group use the same team of employees.
- Subset rule: smaller operations' employees must be subset of larger operations
- Equal rule: same-size operations must have exactly the same employees
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Set, Optional
from constraints.base import BaseConstraint
from contracts.request import SolverRequest, SharedPreference
from core.index import AssignmentIndex
from core.context import SolverContext
import logging

logger = logging.getLogger("Constraint.ShareGroup")


class ShareGroupConstraint(BaseConstraint):
    """
    SAME_TEAM Share Group Constraint
    
    Rules:
    - For any two operations in the same group:
      - If Op_i has fewer positions than Op_j: Employees(Op_i) ⊆ Employees(Op_j)
      - If Op_i has same positions as Op_j: Employees(Op_i) = Employees(Op_j)
    """
    
    name = "ShareGroup"
    config_key = "enable_share_group"
    default_enabled = True
    is_hard = True
    
    def __init__(self, logger=None):
        super().__init__(logger)
        # Cache for intermediate OR variables: (op_id, emp_id) -> BoolVar
        self._emp_in_op_cache: Dict[tuple, cp_model.IntVar] = {}
    
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply share group constraints"""
        
        # Clear cache for new apply call
        self._emp_in_op_cache.clear()
        
        if not data.shared_preferences:
            self.log("No share groups to process.")
            return 0
        
        constraints_added = 0
        
        for group in data.shared_preferences:
            group_constraints = self._apply_single_group(ctx.model, ctx.assignments, group, data, ctx.index)
            constraints_added += group_constraints
            self.log(f"Group [{group.share_group_name}]: Added {group_constraints} constraints")
        
        self.log(f"Total share group constraints: {constraints_added}")
        return constraints_added
    
    def _apply_single_group(
        self,
        model: cp_model.CpModel,
        assignments: Dict[tuple, cp_model.IntVar],
        group: SharedPreference,
        data: SolverRequest,
        index: Optional[AssignmentIndex] = None
    ) -> int:
        """Apply constraints for a single share group"""
        
        constraints = 0
        members = group.members  # List of {operation_plan_id, required_people}
        
        # Safety guard: filter out members whose operation is not in this solve request
        known_op_ids = {op.operation_plan_id for op in data.operation_demands}
        valid_members = [m for m in members if m["operation_plan_id"] in known_op_ids]
        orphaned = len(members) - len(valid_members)
        if orphaned > 0:
            self.log(f"[WARN] Group [{group.share_group_name}]: "
                     f"Dropped {orphaned} member(s) not in current operation_demands", level="warning")
        members = valid_members
        
        if len(members) < 2:
            return 0
        
        # Sort by required_people (smaller first)
        sorted_members = sorted(members, key=lambda m: m.get("required_people", 0))
        
        # Build candidate sets per operation for intersection
        op_candidates: Dict[int, Set[int]] = {}
        for m in sorted_members:
            op_id = m["operation_plan_id"]
            op_candidates[op_id] = self._get_operation_candidates(op_id, data)
        
        # Apply chain constraints (O(n) instead of O(n^2))
        for i in range(len(sorted_members) - 1):
            op_i = sorted_members[i]
            op_j = sorted_members[i + 1]
            
            op_id_i = op_i["operation_plan_id"]
            op_id_j = op_j["operation_plan_id"]
            size_i = op_i.get("required_people", 1)
            size_j = op_j.get("required_people", 1)
            
            candidates_i = op_candidates.get(op_id_i, set())
            candidates_j = op_candidates.get(op_id_j, set())
            
            if not candidates_i:
                continue
            
            for emp_id in candidates_i:
                assigned_i = self._get_employee_assigned_var(model, index, op_id_i, emp_id)
                if assigned_i is None:
                    continue
                    
                is_candidate_for_j = emp_id in candidates_j
                
                if is_candidate_for_j:
                    assigned_j = self._get_employee_assigned_var(model, index, op_id_j, emp_id)
                    if assigned_j is not None:
                        if size_i < size_j:
                            model.AddImplication(assigned_i, assigned_j)
                        else:
                            model.Add(assigned_i == assigned_j)
                        constraints += 1
                else:
                    # Auto-ban: if cannot be assigned to next in chain, cannot be assigned here
                    model.Add(assigned_i == 0)
                    constraints += 1
                    
        return constraints
    
    def _get_operation_candidates(self, op_id: int, data: SolverRequest) -> Set[int]:
        """Get all candidate employees for a specific operation"""
        for op in data.operation_demands:
            if op.operation_plan_id == op_id:
                candidates = set()
                for pq in op.position_qualifications:
                    candidates.update(pq.candidate_employee_ids)
                return candidates
        return set()
    
    def _get_group_candidates(self, group: SharedPreference, data: SolverRequest) -> Set[int]:
        """Get all candidate employees who could work on any operation in this group"""
        candidates = set()
        
        op_ids = {m["operation_plan_id"] for m in group.members}
        
        for op in data.operation_demands:
            if op.operation_plan_id in op_ids:
                for pq in op.position_qualifications:
                    candidates.update(pq.candidate_employee_ids)
        
        return candidates
    
    def _get_employee_assigned_var(
        self,
        model: cp_model.CpModel,
        index: AssignmentIndex,
        op_id: int,
        emp_id: int
    ) -> Optional[cp_model.IntVar]:
        """
        Get or create a variable indicating if employee is assigned to ANY position in operation.
        Uses cache to avoid creating duplicate intermediate variables.
        
        Returns: BoolVar that is 1 if employee is assigned to any position, 0 otherwise.
                 None if employee has no variables for this operation.
        """
        cache_key = (op_id, emp_id)
        if cache_key in self._emp_in_op_cache:
            return self._emp_in_op_cache[cache_key]
        
        # Use index for O(1) lookup instead of O(N) dictionary iteration
        relevant_vars = index.get_vars_for_op_emp(op_id, emp_id)
        
        if not relevant_vars:
            return None
        
        if len(relevant_vars) == 1:
            result = relevant_vars[0]
        else:
            # Create an OR variable: employee_in_op = any(positions)
            result = model.NewBoolVar(f"EmpInOp_{op_id}_{emp_id}")
            model.AddMaxEquality(result, relevant_vars)
        
        self._emp_in_op_cache[cache_key] = result
        return result
