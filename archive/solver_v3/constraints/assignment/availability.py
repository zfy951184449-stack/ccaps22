"""
H11: 不可用时间段约束

员工在设定的不可用时间段内，不能被分配任何操作。
"""

from typing import TYPE_CHECKING, List

from constraints.base import HardConstraint
from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class AvailabilityConstraint(HardConstraint):
    """
    H11: 不可用时间段硬约束
    
    确保员工在不可用期间不被分配操作。
    """
    
    constraint_id = "H11"
    constraint_name = "不可用时间段"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用不可用时间段约束
        
        对于每个员工的不可用日期，禁止分配该日期的操作。
        """
        if not self.enabled:
            return
            
        constraints_added = 0
        
        for emp_id, unavailable_dates in context.employee_unavailable_dates.items():
            if not unavailable_dates:
                continue
            
            # 遍历该员工不可用的日期
            for date_str in unavailable_dates:
                # 获取该日期的所有操作
                op_ids = context.operations_by_date.get(date_str, [])
                
                for op_id in op_ids:
                    op = context.operation_by_id.get(op_id)
                    if not op:
                        continue
                    
                    # 禁止分配此员工到此操作的任何位置
                    for pos in range(op.required_people):
                        var_key = (op_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            model.Add(context.assignment_vars[var_key] == 0)
                            constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个不可用限制")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证可用性数据"""
        errors = []
        
        # 检查是否有员工设置了不可用期间
        total_unavailable = sum(
            len(dates) for dates in context.employee_unavailable_dates.values()
        )
        debug(f"共 {total_unavailable} 个员工-日期不可用记录")
        
        return errors
