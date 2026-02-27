"""
S1: 缺员惩罚目标函数

最小化未填充的岗位数量，同时应用智能优先级使重要操作优先填满。
"""

from typing import TYPE_CHECKING, List, Dict, Tuple

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class SkipPenaltyObjective:
    """
    S1: 缺员惩罚目标函数
    
    为每个未填充的岗位创建跳过变量，并添加惩罚。
    """
    
    BASE_PENALTY = 1000  # 基础跳过惩罚
    
    def __init__(self, base_penalty: int = 1000):
        self.base_penalty = base_penalty
        self.skip_vars: Dict[Tuple[int, int], any] = {}  # (op_id, pos) -> skip_var
    
    def apply(
        self, 
        model: 'cp_model.CpModel', 
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
        priority_bonuses: Dict[int, int] = None,  # op_id -> bonus
    ) -> None:
        """
        创建跳过变量并添加到目标函数
        
        Args:
            model: OR-Tools CpModel
            context: 求解上下文
            builder: ObjectiveBuilder 实例
            priority_bonuses: 操作优先级加成 {op_id: bonus}
        """
        priority_bonuses = priority_bonuses or {}
        total_positions = 0
        
        for op in context.request.operations:
            op_id = op.id
            
            for pos in range(op.required_people):
                # 创建跳过变量
                skip_var = model.NewBoolVar(f"skip_{op_id}_{pos}")
                self.skip_vars[(op_id, pos)] = skip_var
                context.skip_vars[(op_id, pos)] = skip_var
                
                # 收集该位置的所有分配变量
                position_vars = []
                for emp_id in context.employee_by_id.keys():
                    var_key = (op_id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        position_vars.append(context.assignment_vars[var_key])
                
                if position_vars:
                    # 跳过 = 没有任何分配
                    # skip_var = 1 当且仅当所有分配变量都是 0
                    # 等价于: skip_var = NOT(OR(position_vars))
                    # 即: skip_var + SUM(position_vars) >= 1  且  skip_var <= 1 - SUM(position_vars)/n
                    
                    # 使用更直接的方式:
                    # 如果有分配，skip = 0; 如果没有分配，skip = 1
                    assigned = model.NewBoolVar(f"assigned_{op_id}_{pos}")
                    model.AddMaxEquality(assigned, position_vars)
                    
                    # skip = NOT assigned
                    model.Add(skip_var + assigned == 1)
                else:
                    # 没有可分配的员工，必须跳过
                    model.Add(skip_var == 1)
                
                # 添加惩罚到目标函数
                bonus = priority_bonuses.get(op_id, 0)
                builder.add_skip_penalty(
                    skip_var=skip_var,
                    base_penalty=self.base_penalty,
                    priority_bonus=bonus,
                    description=f"跳过 op{op_id}_pos{pos}",
                )
                
                total_positions += 1
        
        info(f"[S1] 缺员惩罚: 创建 {total_positions} 个跳过变量")
    
    def get_skip_count(self, solver) -> int:
        """获取跳过的岗位数"""
        count = 0
        for skip_var in self.skip_vars.values():
            try:
                if solver.Value(skip_var):
                    count += 1
            except:
                pass
        return count
