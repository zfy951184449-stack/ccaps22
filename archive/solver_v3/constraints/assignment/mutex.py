"""
H4: 时间冲突互斥约束

同一个员工不能同时处理两个时间重叠的不同操作（除非它们属于允许同一人的共享组）。
"""

from typing import TYPE_CHECKING, List

from constraints.base import HardConstraint
from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class MutexConstraint(HardConstraint):
    """
    H4: 时间冲突互斥硬约束
    
    利用预计算的冲突表，确保员工不被分配到时间冲突的操作。
    """
    
    constraint_id = "H4"
    constraint_name = "时间冲突互斥"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用时间冲突互斥约束
        
        对于每对冲突操作 (op1, op2)，每个员工:
        ∑(pos1) assigned[op1][pos1][emp] + ∑(pos2) assigned[op2][pos2][emp] <= 1
        """
        if not self.enabled:
            return
            
        constraints_added = 0
        processed_pairs = set()  # 避免重复处理
        
        for op1_id, conflict_op_ids in context.time_conflict_map.items():
            op1 = context.operation_by_id.get(op1_id)
            if not op1:
                continue
                
            for op2_id in conflict_op_ids:
                # 避免重复处理 (A-B 和 B-A)
                pair_key = tuple(sorted([op1_id, op2_id]))
                if pair_key in processed_pairs:
                    continue
                processed_pairs.add(pair_key)
                
                op2 = context.operation_by_id.get(op2_id)
                if not op2:
                    continue
                
                # 对每个员工添加互斥约束
                for emp_id in context.employee_by_id.keys():
                    vars_op1 = []
                    vars_op2 = []
                    
                    # 收集 op1 的分配变量
                    for pos in range(op1.required_people):
                        var_key = (op1_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            vars_op1.append(context.assignment_vars[var_key])
                    
                    # 收集 op2 的分配变量
                    for pos in range(op2.required_people):
                        var_key = (op2_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            vars_op2.append(context.assignment_vars[var_key])
                    
                    # 如果两个操作都有此员工的变量，添加互斥
                    if vars_op1 and vars_op2:
                        # 两个操作合计最多选 1 个
                        model.AddAtMostOne(vars_op1 + vars_op2)
                        constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个时间互斥约束")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证冲突表"""
        errors = []
        
        # 检查冲突表是否已构建
        if not context.time_conflict_map:
            debug("冲突表为空，可能没有时间冲突的操作")
        
        return errors
