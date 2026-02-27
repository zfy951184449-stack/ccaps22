"""
S5: 共享组跨天换人惩罚

当共享组内不同日期的操作使用了不同人员时，产生惩罚。
"""

from typing import TYPE_CHECKING, List, Dict, Set
from datetime import datetime

from utils.logger import debug, info

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


class ShareGroupCrossDayPenalty:
    """
    S5: 共享组跨天换人惩罚
    
    惩罚共享组内连续日期间的人员变更。
    """
    
    PENALTY = 500  # 每次换人惩罚
    
    def __init__(self, penalty: int = 500):
        self.penalty = penalty
    
    def apply(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
        builder: 'ObjectiveBuilder',
    ) -> None:
        """应用共享组跨天惩罚"""
        penalties_added = 0
        
        for sg in context.request.share_groups:
            if len(sg.operation_ids) < 2:
                continue
            
            # 按日期分组操作
            ops_by_date: Dict[str, List] = {}
            for op_id in sg.operation_ids:
                op = context.operation_by_id.get(op_id)
                if not op:
                    continue
                date_str = self._get_date(op)
                if date_str:
                    if date_str not in ops_by_date:
                        ops_by_date[date_str] = []
                    ops_by_date[date_str].append(op)
            
            # 对于连续日期，检查人员变更
            sorted_dates = sorted(ops_by_date.keys())
            for i in range(len(sorted_dates) - 1):
                date1, date2 = sorted_dates[i], sorted_dates[i + 1]
                ops1, ops2 = ops_by_date[date1], ops_by_date[date2]
                
                # 对每个员工，检查是否"换人"
                for emp_id in context.employee_by_id.keys():
                    # 员工在 date1 是否有分配
                    in_date1_vars = []
                    for op in ops1:
                        for pos in range(op.required_people):
                            var_key = (op.id, pos, emp_id)
                            if var_key in context.assignment_vars:
                                in_date1_vars.append(context.assignment_vars[var_key])
                    
                    # 员工在 date2 是否有分配
                    in_date2_vars = []
                    for op in ops2:
                        for pos in range(op.required_people):
                            var_key = (op.id, pos, emp_id)
                            if var_key in context.assignment_vars:
                                in_date2_vars.append(context.assignment_vars[var_key])
                    
                    if not in_date1_vars or not in_date2_vars:
                        continue
                    
                    # 创建"换人"变量: date1有分配但date2没有
                    in1 = model.NewBoolVar(f"in1_{sg.id}_{date1}_{emp_id}")
                    in2 = model.NewBoolVar(f"in2_{sg.id}_{date2}_{emp_id}")
                    model.AddMaxEquality(in1, in_date1_vars)
                    model.AddMaxEquality(in2, in_date2_vars)
                    
                    # 换人 = in1 AND NOT in2
                    changed = model.NewBoolVar(f"changed_{sg.id}_{date1}_{emp_id}")
                    # changed = 1 当且仅当 in1=1 且 in2=0
                    model.Add(changed <= in1)
                    model.Add(changed <= 1 - in2)
                    model.Add(changed >= in1 - in2)
                    
                    builder.add_soft_penalty(
                        changed,
                        penalty=self.penalty,
                        description=f"S5换人_{sg.id}_{date1}"
                    )
                    penalties_added += 1
        
        info(f"[S5] 共享组跨天惩罚: 添加 {penalties_added} 个惩罚项")
    
    def _get_date(self, op) -> str:
        """获取操作日期"""
        try:
            start = op.planned_start
            if isinstance(start, str):
                return start[:10]
            return start.strftime('%Y-%m-%d')
        except:
            return ""
