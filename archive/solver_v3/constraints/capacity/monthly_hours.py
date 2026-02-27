"""
H8-H9: 月度工时上下限约束

H8: 员工一个月的累计工时不能超过标准工时加上允许的浮动上限。
H9: 员工一个月的累计工时不能低于标准工时减去允许的浮动下限。
"""

from typing import TYPE_CHECKING, List, Dict
from datetime import datetime

from constraints.base import HardConstraint
from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class MonthlyHoursConstraint(HardConstraint):
    """
    H8-H9: 月度工时硬约束
    
    确保员工月度工时在允许范围内。
    """
    
    constraint_id = "H8-H9"
    constraint_name = "月度工时"
    
    def __init__(
        self, 
        enabled: bool = True,
        standard_hours: float = 160.0,  # 标准月度工时
        upper_offset: float = 32.0,      # 上限浮动 (H8)
        lower_offset: float = 4.0,       # 下限浮动 (H9)
    ):
        super().__init__(enabled)
        self.standard_hours = standard_hours
        self.upper_offset = upper_offset
        self.lower_offset = lower_offset
        
        self.max_hours = standard_hours + upper_offset
        self.min_hours = standard_hours - lower_offset
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用月度工时约束
        
        实现方式:
        1. 计算每个员工在求解窗口内的总操作时长
        2. 加上边界状态中的已累计工时
        3. 确保总工时在 [min_hours, max_hours] 范围内
        """
        if not self.enabled:
            return
            
        # 0. 计算时间窗口缩放系数
        scaling_ratio = 1.0
        if context.request.window_start and context.request.window_end:
            try:
                # 简单解析日期字符串 YYYY-MM-DD
                start_dt = datetime.strptime(context.request.window_start[:10], "%Y-%m-%d")
                end_dt = datetime.strptime(context.request.window_end[:10], "%Y-%m-%d")
                days = (end_dt - start_dt).days + 1
                scaling_ratio = min(1.0, max(0.0, days / 30.0))
                debug(f"[{self.constraint_id}] 时间窗口: {days}天, 缩放系数: {scaling_ratio:.2f}")
            except Exception as e:
                warning(f"[{self.constraint_id}] 日期解析失败，使用默认缩放 1.0: {e}")
        
        # 调整工时限制
        current_max_hours = self.max_hours * scaling_ratio
        current_min_hours = self.min_hours * scaling_ratio
        
        constraints_added = 0
        
        # 计算每个操作的工时 (分钟 -> 小时)
        op_hours: Dict[int, float] = {}
        for op in context.request.operations:
            op_hours[op.id] = op.duration_minutes / 60.0
        
        for emp_id in context.employee_by_id.keys():
            # 获取边界状态中的已累计工时
            accumulated = 0.0
            for bs in context.request.boundary_states:
                if bs.employee_id == emp_id:
                    accumulated = bs.accumulated_hours
                    break
            
            # 收集该员工的所有分配变量及对应工时
            emp_assignment_terms = []  # [(工时*100整数, 变量), ...]
            
            for op in context.request.operations:
                hours = op_hours.get(op.id, 0)
                hours_scaled = int(hours * 100)  # 转为整数 (0.01h 精度)
                
                for pos in range(op.required_people):
                    var_key = (op.id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        emp_assignment_terms.append(
                            (hours_scaled, context.assignment_vars[var_key])
                        )
            
            if not emp_assignment_terms:
                continue
            
            # 创建总工时变量 (scaled)
            total_hours_var = model.NewIntVar(
                0, 
                int(self.max_hours * 100) + int(accumulated * 100),
                f"total_hours_{emp_id}"
            )
            
            # 总工时 = 已累计 + 新分配
            accumulated_scaled = int(accumulated * 100)
            model.Add(
                total_hours_var == accumulated_scaled + sum(
                    coef * var for coef, var in emp_assignment_terms
                )
            )
            
            # H8: 上限约束 (同样进行缩放，虽然上限通常不会触及)
            # 注意：如果 scaling_ratio 很小，上限可能会过紧，这里通常只需缩放"增量"部分
            # 但为了简化，假设 max_hours 是总量限制
            max_limit_scaled = int(current_max_hours * 100) + int(accumulated * 100)
            model.Add(total_hours_var <= max_limit_scaled)
            constraints_added += 1
            
            # H9: 下限约束 (仅在求解完整月份时启用)
            # 如果是部分窗口求解，下限约束可能导致无解
            # 这里通过配置决定是否启用
            if context.request.config.enforce_monthly_hours:
                # H9: 下限约束
                min_limit_scaled = int(current_min_hours * 100)
                # 下限约束通常较宽松，使用软约束更合理
                # 这里暂不强制下限，留给软约束处理
                min_scaled = int(self.min_hours * 100)
                # 只有当最小限制 > 0 时才添加，避免不必要的约束
                # 只有当最小限制 > 0 且 窗口足够长(例如 > 3天) 时才添加，避免极短窗口无解
                if min_limit_scaled > 0 and scaling_ratio > 0.1:
                     model.Add(total_hours_var >= min_limit_scaled)
                     constraints_added += 1
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个工时上限约束 (max={self.max_hours}h)")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证工时数据"""
        errors = []
        
        # 检查是否有员工已经接近上限
        for bs in context.request.boundary_states:
            if bs.accumulated_hours >= self.max_hours:
                errors.append(
                    f"员工 {bs.employee_id} 已累计 {bs.accumulated_hours}h，超过上限 {self.max_hours}h"
                )
            elif bs.accumulated_hours >= self.max_hours * 0.9:
                warning(f"员工 {bs.employee_id} 已累计 {bs.accumulated_hours}h，接近上限")
        
        return errors
