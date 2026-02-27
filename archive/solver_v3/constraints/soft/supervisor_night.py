"""
S9: 主管避免夜班惩罚

主管(SUPERVISOR)角色被分配到夜班时产生额外惩罚。
"""

from typing import TYPE_CHECKING, List, Dict

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class SupervisorNightPenalty:
    """
    S9: 主管避免夜班惩罚
    
    主管应尽量避免夜班。
    """
    
    PENALTY = 600  # 主管夜班惩罚
    
    def __init__(self, penalty: int = 600):
        self.penalty = penalty
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用主管夜班惩罚"""
        penalties_added = 0
        
        # 找出所有主管
        supervisors = [
            emp for emp in context.request.employees
            if emp.role and emp.role.upper() in ('SUPERVISOR', '主管', 'LEAD')
        ]
        
        if not supervisors:
            debug("[S9] 主管夜班惩罚: 无主管角色员工")
            return
        
        # 对每个有夜班的操作
        for op in context.request.operations:
            if not self._is_night_operation(op):
                continue
            
            for supervisor in supervisors:
                for pos in range(op.required_people):
                    var_key = (op.id, pos, supervisor.id)
                    if var_key not in context.assignment_vars:
                        continue
                    
                    builder.add_soft_penalty(
                        context.assignment_vars[var_key],
                        penalty=self.penalty,
                        description=f"S9主管夜班_{supervisor.id}_{op.id}"
                    )
                    penalties_added += 1
        
        info(f"[S9] 主管避免夜班: 添加 {penalties_added} 个惩罚项 (主管数: {len(supervisors)})")
    
    def _is_night_operation(self, op) -> bool:
        """判断是否是夜班操作"""
        try:
            from datetime import datetime
            start = op.planned_start
            if isinstance(start, str):
                start = datetime.fromisoformat(start.replace('Z', '+00:00'))
            hour = start.hour
            return hour >= 20 or hour < 6
        except:
            return False
