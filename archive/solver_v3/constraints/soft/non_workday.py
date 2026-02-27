"""
S6: 非工作日工作惩罚

在非工作日（节假日等）有分配时产生惩罚。
"""

from typing import TYPE_CHECKING, List, Dict, Set

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class NonWorkdayPenalty:
    """
    S6: 非工作日工作惩罚
    
    避免在非工作日安排工作。
    """
    
    PENALTY = 300  # 非工作日工作惩罚
    
    def __init__(self, penalty: int = 300):
        self.penalty = penalty
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用非工作日惩罚"""
        penalties_added = 0
        non_workdays = context.non_workdays
        
        if not non_workdays:
            info("[S6] 非工作日惩罚: 无非工作日数据")
            return
        
        for op in context.request.operations:
            op_date = self._get_date(op)
            if op_date not in non_workdays:
                continue
            
            # 对该操作的每个分配添加惩罚
            for pos in range(op.required_people):
                for emp_id in context.employee_by_id.keys():
                    var_key = (op.id, pos, emp_id)
                    if var_key not in context.assignment_vars:
                        continue
                    
                    builder.add_soft_penalty(
                        context.assignment_vars[var_key],
                        penalty=self.penalty,
                        description=f"S6非工作日_{op.id}"
                    )
                    penalties_added += 1
        
        info(f"[S6] 非工作日惩罚: 添加 {penalties_added} 个惩罚项")
    
    def _get_date(self, op) -> str:
        """获取操作日期"""
        try:
            start = op.planned_start
            if isinstance(start, str):
                return start[:10]
            return start.strftime('%Y-%m-%d')
        except:
            return ""
