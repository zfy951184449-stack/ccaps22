"""
S8: 连续工作后补偿休息惩罚

连续工作5天后无休息时产生惩罚。
"""

from typing import TYPE_CHECKING, List, Dict

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class ConsecutiveRestPenalty:
    """
    S8: 连续工作后补偿休息惩罚
    
    建议连续工作5天后安排休息。
    """
    
    PENALTY = 200  # 连续5天后无休息惩罚
    THRESHOLD_DAYS = 5  # 触发惩罚的连续天数
    
    def __init__(self, penalty: int = 200, threshold_days: int = 5):
        self.penalty = penalty
        self.threshold_days = threshold_days
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用连续工作补偿休息惩罚"""
        penalties_added = 0
        
        all_dates = sorted(context.operations_by_date.keys())
        window_size = self.threshold_days + 1  # 5天工作 + 1天检查
        
        if len(all_dates) < window_size:
            debug(f"[S8] 日期数 ({len(all_dates)}) < 窗口 ({window_size})，跳过")
            return
        
        # 为每个员工的每一天创建"是否工作"变量 (复用或创建)
        works: Dict[int, Dict[str, any]] = {}
        
        for emp_id in context.employee_by_id.keys():
            works[emp_id] = {}
            
            for date_str in all_dates:
                work_var = model.NewBoolVar(f"s8_works_{emp_id}_{date_str}")
                works[emp_id][date_str] = work_var
                
                day_ops = context.operations_by_date.get(date_str, [])
                day_vars = []
                for op_id in day_ops:
                    op = context.operation_by_id.get(op_id)
                    if not op:
                        continue
                    for pos in range(op.required_people):
                        var_key = (op_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            day_vars.append(context.assignment_vars[var_key])
                
                if day_vars:
                    model.AddMaxEquality(work_var, day_vars)
                else:
                    model.Add(work_var == 0)
        
        # 对于每个连续 (threshold + 1) 天的窗口
        for emp_id in context.employee_by_id.keys():
            for i in range(len(all_dates) - window_size + 1):
                window_dates = all_dates[i:i + window_size]
                
                # 前5天都工作
                first_5_vars = [works[emp_id][d] for d in window_dates[:-1]]
                # 第6天也工作 (没休息)
                day_6_var = works[emp_id][window_dates[-1]]
                
                # 违规 = 前5天都工作 AND 第6天也工作
                all_5_work = model.NewBoolVar(f"s8_all5_{emp_id}_{i}")
                model.AddMinEquality(all_5_work, first_5_vars)  # AND
                
                violation = model.NewBoolVar(f"s8_vio_{emp_id}_{i}")
                model.AddBoolAnd([all_5_work, day_6_var]).OnlyEnforceIf(violation)
                model.AddBoolOr([all_5_work.Not(), day_6_var.Not()]).OnlyEnforceIf(violation.Not())
                
                builder.add_soft_penalty(
                    violation,
                    penalty=self.penalty,
                    description=f"S8连续无休_{emp_id}_{i}"
                )
                penalties_added += 1
        
        info(f"[S8] 连续工作补偿休息: 添加 {penalties_added} 个惩罚项")
