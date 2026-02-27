"""
strategies/symmetry.py

对称性破缺策略

原理：当多个员工对于某个操作完全等价时，会产生大量对称解。
通过添加字典序约束，可以消除这些对称解，减少搜索空间。
"""

from typing import TYPE_CHECKING, List, Dict, Set

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class SymmetryBreaking:
    """
    对称性破缺
    
    策略：对于同一操作的多个岗位，强制员工ID按升序分配。
    例如：如果岗位1分配给员工5，岗位2必须分配给ID>=5的员工。
    """
    
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.constraints_added = 0
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
    ) -> int:
        """
        应用对称性破缺约束
        
        Returns:
            添加的约束数量
        """
        if not self.enabled:
            info("[对称性] 对称性破缺已禁用")
            return 0
        
        self.constraints_added = 0
        
        for op in context.request.operations:
            if op.required_people <= 1:
                continue
            
            self._add_lexicographic_ordering(model, context, op)
        
        info(f"[对称性] 添加 {self.constraints_added} 个字典序约束")
        return self.constraints_added
    
    def _add_lexicographic_ordering(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        op,
    ) -> None:
        """
        为操作的多个岗位添加字典序约束
        
        对于岗位 i 和 i+1，如果都被分配，则:
        assigned_employee[i] <= assigned_employee[i+1]
        """
        employees = sorted(context.employee_by_id.keys())
        n_emp = len(employees)
        
        if n_emp <= 1:
            return
        
        for pos in range(op.required_people - 1):
            pos_next = pos + 1
            
            # 创建岗位的员工索引变量
            emp_idx_pos = model.NewIntVar(0, n_emp, f"emp_idx_{op.id}_{pos}")
            emp_idx_next = model.NewIntVar(0, n_emp, f"emp_idx_{op.id}_{pos_next}")
            
            # 关联分配变量与索引
            for i, emp_id in enumerate(employees):
                var_key = (op.id, pos, emp_id)
                if var_key in context.assignment_vars:
                    assign_var = context.assignment_vars[var_key]
                    # 如果分配给此员工，索引 = i
                    model.Add(emp_idx_pos >= i).OnlyEnforceIf(assign_var)
                    model.Add(emp_idx_pos <= i).OnlyEnforceIf(assign_var)
                
                var_key_next = (op.id, pos_next, emp_id)
                if var_key_next in context.assignment_vars:
                    assign_var_next = context.assignment_vars[var_key_next]
                    model.Add(emp_idx_next >= i).OnlyEnforceIf(assign_var_next)
                    model.Add(emp_idx_next <= i).OnlyEnforceIf(assign_var_next)
            
            # 添加字典序约束
            model.Add(emp_idx_pos <= emp_idx_next)
            self.constraints_added += 1
