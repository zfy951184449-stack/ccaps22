"""
S6: 非工作日惩罚 (Non-Workday Penalty)

描述：尽量避免在法定节假日或周末安排上班。
惩罚分：默认 1000/人次

实现：检查操作日期是否为非工作日，如果安排人员上班则产生惩罚。
"""

from typing import TYPE_CHECKING, List, Dict, Set, Optional
from datetime import datetime, date

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class CalendarPolicy:
    """日历策略：管理工作日/非工作日相关约束"""
    
    def __init__(self, workday_penalty: int = 0, non_workday_penalty: int = 1000):
        """
        Args:
            workday_penalty: 工作日上班惩罚（通常为0）
            non_workday_penalty: 非工作日上班惩罚
        """
        self.workday_penalty = workday_penalty
        self.non_workday_penalty = non_workday_penalty
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> int:
        """
        应用日历策略
        
        Returns:
            添加的惩罚项数量
        """
        penalty_count = 0
        
        # 获取日历信息
        calendar_map = self._build_calendar_map(context)
        
        for op in context.request.operations:
            op_date = self._get_operation_date(op)
            if op_date is None:
                continue
            
            is_workday = calendar_map.get(op_date, True)
            
            if not is_workday:
                # 非工作日操作，对所有分配添加惩罚
                for pos in range(op.required_people):
                    for emp_id in context.employee_by_id.keys():
                        var_key = (op.id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            assign_var = context.assignment_vars[var_key]
                            
                            # 创建惩罚变量
                            penalty_var = model.NewIntVar(
                                0, self.non_workday_penalty,
                                f"non_workday_penalty_{op.id}_{pos}_{emp_id}"
                            )
                            model.Add(penalty_var == self.non_workday_penalty * assign_var)
                            
                            builder.add_soft_penalty(
                                penalty_var,
                                weight=1,
                                description=f"非工作日上班惩罚: {op.operation_name}"
                            )
                            penalty_count += 1
        
        info(f"[S6] 非工作日惩罚: 添加 {penalty_count} 个惩罚项 (惩罚分={self.non_workday_penalty})")
        return penalty_count
    
    def _build_calendar_map(self, context: 'SolverContext') -> Dict[date, bool]:
        """构建日期→是否工作日映射"""
        calendar_map = {}
        
        if hasattr(context.request, 'calendar_days'):
            for day in context.request.calendar_days:
                try:
                    if isinstance(day.date, str):
                        d = datetime.strptime(day.date, '%Y-%m-%d').date()
                    else:
                        d = day.date
                    calendar_map[d] = day.is_workday
                except:
                    pass
        
        return calendar_map
    
    def _get_operation_date(self, op) -> Optional[date]:
        """获取操作日期"""
        try:
            if isinstance(op.planned_start, datetime):
                return op.planned_start.date()
            elif isinstance(op.planned_start, str):
                return datetime.fromisoformat(op.planned_start.replace('Z', '+00:00')).date()
        except:
            pass
        return None


# 别名，兼容 soft/ 目录下的命名
NonWorkdayPenalty = CalendarPolicy
