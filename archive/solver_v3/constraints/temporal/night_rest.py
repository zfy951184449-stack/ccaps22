"""
H7: 夜班强制休息约束

员工上完夜班后，随后的一定天数（通常为1天）内必须休息，不得安排任何工作。
"""

from typing import TYPE_CHECKING, List, Dict, Set
from datetime import datetime, timedelta

from constraints.base import HardConstraint
from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class NightRestConstraint(HardConstraint):
    """
    H7: 夜班强制休息硬约束
    
    确保员工夜班后有强制休息日。
    """
    
    constraint_id = "H7"
    constraint_name = "夜班强制休息"
    
    def __init__(self, enabled: bool = True, rest_days: int = 1):
        super().__init__(enabled)
        self.rest_days = rest_days
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用夜班强制休息约束
        
        实现方式: 如果员工在某天选择了夜班，则接下来 rest_days 天不能有任何分配。
        
        night_shift[emp][day] => ∑(assignments[emp][day+1..day+rest_days]) = 0
        """
        if not self.enabled:
            return
        
        constraints_added = 0
        
        # 获取所有日期并排序
        all_dates = sorted(context.operations_by_date.keys())
        night_shift_ids = context.night_shift_ids
        
        if not night_shift_ids:
            debug("没有夜班定义，跳过夜班休息约束")
            return
        
        for emp_id in context.employee_by_id.keys():
            for i, date_str in enumerate(all_dates):
                # 检查该员工该天是否有夜班变量
                night_shift_vars = []
                for shift_id in night_shift_ids:
                    var_key = (emp_id, date_str, shift_id)
                    if var_key in context.shift_vars:
                        night_shift_vars.append(context.shift_vars[var_key])
                
                if not night_shift_vars:
                    continue
                
                # 创建"该员工该天是否上夜班"汇总变量
                is_night = model.NewBoolVar(f"is_night_{emp_id}_{date_str}")
                model.AddMaxEquality(is_night, night_shift_vars)
                
                # 获取接下来 rest_days 天的日期
                rest_dates = all_dates[i + 1:i + 1 + self.rest_days]
                
                # 收集休息日的所有分配变量
                rest_assignments = []
                for rest_date in rest_dates:
                    day_ops = context.operations_by_date.get(rest_date, [])
                    for op_id in day_ops:
                        op = context.operation_by_id.get(op_id)
                        if not op:
                            continue
                        for pos in range(op.required_people):
                            var_key = (op_id, pos, emp_id)
                            if var_key in context.assignment_vars:
                                rest_assignments.append(context.assignment_vars[var_key])
                
                if rest_assignments:
                    # 如果上夜班，则休息日不能有分配
                    # is_night => ∑(rest_assignments) = 0
                    model.Add(sum(rest_assignments) == 0).OnlyEnforceIf(is_night)
                    constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个夜班休息约束 (休息 {self.rest_days} 天)")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证夜班数据"""
        errors = []
        
        if not context.night_shift_ids:
            warning("没有夜班类型定义")
        
        # 检查边界状态
        for bs in context.request.boundary_states:
            if bs.last_night_shift_date:
                debug(f"员工 {bs.employee_id} 上次夜班: {bs.last_night_shift_date}")
        
        return errors
