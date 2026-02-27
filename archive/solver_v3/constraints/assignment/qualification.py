"""
H1: 资质匹配约束

员工必须持有操作所需的特定资质，且等级达标。
"""

from typing import TYPE_CHECKING, List

from constraints.base import HardConstraint
from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class QualificationConstraint(HardConstraint):
    """
    H1: 资质匹配硬约束
    
    确保只有具备所需资质的员工才能被分配到操作。
    """
    
    constraint_id = "H1"
    constraint_name = "资质匹配"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用资质匹配约束
        
        实现方式: 在创建分配变量时，只为合格员工创建变量，
        不合格员工根本没有对应的分配变量（无法被分配）。
        """
        if not self.enabled:
            return
            
        constraints_added = 0
        
        for op_id, qualified_emp_ids in context.qualified_employees.items():
            op = context.operation_by_id.get(op_id)
            if not op:
                continue
                
            # 获取所有员工 ID
            all_emp_ids = set(context.employee_by_id.keys())
            
            # 不合格员工 = 所有员工 - 合格员工
            unqualified_emp_ids = all_emp_ids - qualified_emp_ids
            
            # 对于每个不合格员工，确保其分配变量为 0
            for emp_id in unqualified_emp_ids:
                for pos in range(op.required_people):
                    var_key = (op_id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        # 强制此变量为 False
                        model.Add(context.assignment_vars[var_key] == 0)
                        constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个资质限制")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证资质数据"""
        errors = []
        
        for op in context.request.operations:
            qualified = context.qualified_employees.get(op.id, set())
            if not qualified and op.required_qualifications:
                errors.append(
                    f"操作 {op.id} 需要资质 {op.required_qualifications}，但没有员工满足要求"
                )
        
        return errors
