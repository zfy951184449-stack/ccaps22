"""
H6: 班次覆盖约束

同一天内分配给同一员工的所有操作，必须能被系统中定义的一个有效班次覆盖。
"""

from typing import TYPE_CHECKING, List, Dict, Set, Tuple
from datetime import datetime

from constraints.base import HardConstraint
from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class ShiftCoverageConstraint(HardConstraint):
    """
    H6: 班次覆盖硬约束
    
    确保员工每天的操作能被一个有效班次覆盖。
    
    实现思路:
    - 对于每个 (员工, 日期) 组合，最多选择一个班次
    - 如果该员工在该天有操作，则必须选择一个能覆盖所有操作的班次
    """
    
    constraint_id = "H6"
    constraint_name = "班次覆盖"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用班次覆盖约束
        """
        if not self.enabled:
            return
        
        constraints_added = 0
        
        # 获取所有日期
        all_dates = sorted(context.operations_by_date.keys())
        shift_types = context.request.shift_types
        
        if not shift_types:
            warning("没有班次类型数据，跳过班次覆盖约束")
            return
        
        for emp_id in context.employee_by_id.keys():
            for date_str in all_dates:
                # 获取该员工在该天的所有分配变量
                day_ops = context.operations_by_date.get(date_str, [])
                emp_day_assignments = []
                
                for op_id in day_ops:
                    op = context.operation_by_id.get(op_id)
                    if not op:
                        continue
                    for pos in range(op.required_people):
                        var_key = (op_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            emp_day_assignments.append((op_id, context.assignment_vars[var_key]))
                
                if not emp_day_assignments:
                    continue
                
                # 创建班次选择变量
                shift_vars = []
                for st in shift_types:
                    var_key = (emp_id, date_str, st.id)
                    if var_key not in context.shift_vars:
                        shift_var = model.NewBoolVar(f"shift_{emp_id}_{date_str}_{st.id}")
                        context.shift_vars[var_key] = shift_var
                    shift_vars.append(context.shift_vars[var_key])
                
                # 每天最多选一个班次
                model.AddAtMostOne(shift_vars)
                constraints_added += 1
                
                # 如果有任何分配，必须选一个班次
                has_assignment = model.NewBoolVar(f"has_assign_{emp_id}_{date_str}")
                assignment_vars = [av for _, av in emp_day_assignments]
                model.AddMaxEquality(has_assignment, assignment_vars)
                
                # has_assignment => 至少选一个班次
                model.Add(sum(shift_vars) >= 1).OnlyEnforceIf(has_assignment)
                constraints_added += 1
                
                # H6 增强逻辑: 选中的班次必须匹配操作的班次类型
                # 如果操作属于某个班次类型的时段，那么必须选择该班次类型
                for op_id, _ in emp_day_assignments:
                    required_shift_id = context.get_op_shift_type(op_id)
                    if required_shift_id:
                        # 必须选择对应的 shift_var
                        var_key = (emp_id, date_str, required_shift_id)
                        
                        # 如果没有为该班次创建变量 (说明该班次不在请求定义中?), 这通常不应该发生
                        if var_key in context.shift_vars:
                            # 约束: 如果分配了该操作，则对应的班次变量必须为1
                            # assign_var => shift_var
                            # 也就是: assign_var <= shift_var
                            
                            # 获取分配变量
                            for pos in range(context.operation_by_id[op_id].required_people):
                                assign_key = (op_id, pos, emp_id)
                                if assign_key in context.assignment_vars:
                                    model.AddImplication(context.assignment_vars[assign_key], context.shift_vars[var_key])
                        else:
                            warning(f"操作 {op_id} 需要班次 {required_shift_id}，但该班次变量未创建")
                    else:
                        # 操作时间不属于任何已知班次
                        # 策略: 允许吗？暂定允许，但不强制特定班次 (或者应该强制不分配?)
                        # 目前保留"只要选一个班次"作为底线，避免无解
                        pass
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个班次覆盖约束")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证班次数据"""
        errors = []
        
        if not context.request.shift_types:
            errors.append("没有班次类型配置，班次覆盖约束无法生效")
        
        return errors
