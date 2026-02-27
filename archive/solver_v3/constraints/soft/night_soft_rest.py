"""
S7: 夜班后软休息惩罚 (2天)

夜班后第2天仍有工作时产生惩罚（H7是第1天强制休息，S7是第2天软休息）。
"""

from typing import TYPE_CHECKING, List, Dict

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class NightSoftRestPenalty:
    """
    S7: 夜班后软休息惩罚
    
    夜班后第2天工作产生惩罚。
    """
    
    PENALTY = 400  # 夜班后第2天工作惩罚
    
    def __init__(self, penalty: int = 400):
        self.penalty = penalty
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用夜班后软休息惩罚"""
        penalties_added = 0
        
        all_dates = sorted(context.operations_by_date.keys())
        night_shift_ids = context.night_shift_ids
        
        if not night_shift_ids:
            debug("[S7] 夜班后软休息: 无夜班定义")
            return
        
        for emp_id in context.employee_by_id.keys():
            for i, date_str in enumerate(all_dates):
                # 检查该员工该天是否有夜班变量
                night_vars = []
                for shift_id in night_shift_ids:
                    var_key = (emp_id, date_str, shift_id)
                    if var_key in context.shift_vars:
                        night_vars.append(context.shift_vars[var_key])
                
                if not night_vars:
                    continue
                
                # 获取第2天的日期 (index i+2)
                if i + 2 >= len(all_dates):
                    continue
                
                day2_date = all_dates[i + 2]
                day2_ops = context.operations_by_date.get(day2_date, [])
                
                # 收集第2天的分配变量
                day2_assignments = []
                for op_id in day2_ops:
                    op = context.operation_by_id.get(op_id)
                    if not op:
                        continue
                    for pos in range(op.required_people):
                        var_key = (op_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            day2_assignments.append(context.assignment_vars[var_key])
                
                if not day2_assignments:
                    continue
                
                # 创建惩罚变量
                is_night = model.NewBoolVar(f"night_{emp_id}_{date_str}")
                model.AddMaxEquality(is_night, night_vars)
                
                has_day2_work = model.NewBoolVar(f"has_day2_{emp_id}_{date_str}")
                model.AddMaxEquality(has_day2_work, day2_assignments)
                
                # 违规 = 夜班 AND 第2天工作
                violation = model.NewBoolVar(f"s7_vio_{emp_id}_{date_str}")
                model.AddBoolAnd([is_night, has_day2_work]).OnlyEnforceIf(violation)
                model.AddBoolOr([is_night.Not(), has_day2_work.Not()]).OnlyEnforceIf(violation.Not())
                
                builder.add_soft_penalty(
                    violation,
                    penalty=self.penalty,
                    description=f"S7夜班软休息_{emp_id}_{date_str}"
                )
                penalties_added += 1
        
        info(f"[S7] 夜班后软休息惩罚: 添加 {penalties_added} 个惩罚项")
