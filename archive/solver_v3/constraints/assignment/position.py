"""
H2-H3: 位置分配约束

H2: 一位一人 - 同一个操作的一个具体位置，同一时刻只能分配给一个人。
H3: 同操作互斥 - 同一个员工在同一个操作中，不能占据多个位置。
"""

from typing import TYPE_CHECKING, List

from constraints.base import HardConstraint
from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class PositionConstraint(HardConstraint):
    """
    H2-H3: 位置分配硬约束
    
    H2: 确保每个位置最多分配一个员工
    H3: 确保每个员工在同一操作中最多占一个位置
    """
    
    constraint_id = "H2-H3"
    constraint_name = "位置分配"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用位置分配约束
        
        H2: ∑(员工) assigned[op][pos][emp] <= 1  (每个位置最多1人)
        H3: ∑(位置) assigned[op][pos][emp] <= 1  (每个员工在同操作最多占1位)
        """
        if not self.enabled:
            return
            
        h2_constraints = 0
        h3_constraints = 0
        
        for op in context.request.operations:
            op_id = op.id
            
            # --- H2: 每个位置最多一人 ---
            for pos in range(op.required_people):
                # 收集此位置的所有分配变量
                pos_vars = []
                for emp_id in context.employee_by_id.keys():
                    var_key = (op_id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        pos_vars.append(context.assignment_vars[var_key])
                
                if pos_vars:
                    # 最多一个为 True
                    model.AddAtMostOne(pos_vars)
                    h2_constraints += 1
            
            # --- H3: 每个员工在同操作最多占一位 ---
            for emp_id in context.employee_by_id.keys():
                # 收集此员工在此操作的所有位置变量
                emp_op_vars = []
                for pos in range(op.required_people):
                    var_key = (op_id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        emp_op_vars.append(context.assignment_vars[var_key])
                
                if len(emp_op_vars) > 1:
                    # 最多一个为 True
                    model.AddAtMostOne(emp_op_vars)
                    h3_constraints += 1
        
        self.stats.constraints_added = h2_constraints + h3_constraints
        info(f"[{self.constraint_id}] {self.constraint_name}: H2={h2_constraints}, H3={h3_constraints}")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证位置数据"""
        errors = []
        
        for op in context.request.operations:
            if op.required_people <= 0:
                errors.append(f"操作 {op.id} 需求人数无效: {op.required_people}")
        
        return errors
