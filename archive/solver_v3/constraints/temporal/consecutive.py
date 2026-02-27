"""
H5: 连续工作限制约束

员工连续工作的自然日天数不得超过设定值（默认6天）。
"""

from typing import TYPE_CHECKING, List, Dict, Set
from datetime import datetime, timedelta

from constraints.base import HardConstraint
from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class ConsecutiveConstraint(HardConstraint):
    """
    H5: 连续工作限制硬约束
    
    确保员工不会连续工作超过指定天数。
    """
    
    constraint_id = "H5"
    constraint_name = "连续工作限制"
    
    def __init__(self, enabled: bool = True, max_consecutive_days: int = 6):
        super().__init__(enabled)
        self.max_consecutive_days = max_consecutive_days
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用连续工作限制约束
        
        实现方式: 对于每个员工，在任意连续 (max+1) 天的窗口内，
        至少有一天不工作（即没有被分配任何操作）。
        
        ∑(day in window) works[emp][day] <= max_consecutive_days
        """
        if not self.enabled:
            return
        
        max_days = self.max_consecutive_days
        constraints_added = 0
        
        # 获取所有日期并排序
        all_dates = sorted(context.operations_by_date.keys())
        if len(all_dates) <= max_days:
            debug(f"操作日期数 ({len(all_dates)}) <= 最大连续天数 ({max_days})，跳过约束")
            return
        
        # 为每个员工的每一天创建"是否工作"变量
        # works[emp_id][date_str] = BoolVar
        works: Dict[int, Dict[str, any]] = {}
        
        for emp_id in context.employee_by_id.keys():
            works[emp_id] = {}
            
            for date_str in all_dates:
                # 创建"该员工该天是否工作"的布尔变量
                work_var = model.NewBoolVar(f"works_{emp_id}_{date_str}")
                works[emp_id][date_str] = work_var
                
                # 该变量为 True 当且仅当该员工在该天有任何分配
                day_ops = context.operations_by_date.get(date_str, [])
                day_assignment_vars = []
                
                for op_id in day_ops:
                    op = context.operation_by_id.get(op_id)
                    if not op:
                        continue
                    for pos in range(op.required_people):
                        var_key = (op_id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            day_assignment_vars.append(context.assignment_vars[var_key])
                
                if day_assignment_vars:
                    # work_var = 1 当且仅当至少有一个分配
                    model.AddMaxEquality(work_var, day_assignment_vars)
                else:
                    # 该天没有操作，强制 work_var = 0
                    model.Add(work_var == 0)
        
        # 添加滑动窗口约束
        for emp_id in context.employee_by_id.keys():
            # 对于每个连续 (max+1) 天的窗口
            window_size = max_days + 1
            
            for i in range(len(all_dates) - window_size + 1):
                window_dates = all_dates[i:i + window_size]
                window_vars = [works[emp_id][d] for d in window_dates]
                
                # 窗口内最多工作 max_days 天
                model.Add(sum(window_vars) <= max_days)
                constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个连续工作约束 (最大 {max_days} 天)")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证边界状态"""
        errors = []
        
        # 检查是否有员工已经接近连续工作上限
        for bs in context.request.boundary_states:
            if bs.consecutive_work_days >= self.max_consecutive_days:
                warning(f"员工 {bs.employee_id} 已连续工作 {bs.consecutive_work_days} 天，可能无解")
        
        return errors
