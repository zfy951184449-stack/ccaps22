"""
Minimize Deviation from Standard Work Hours Objective

目标：最小化所有员工实际工时与标准工时的偏差总和。
数学形式：Min Σ|actual_hours[e] - standard_hours[e]|

标准工时计算：
- 标准工时 = 排班周期内工作日数 × 8h
- 偏差 = |实际工时 - 标准工时|

实现说明：
- 使用 OR-Tools 辅助变量处理绝对值：
  deviation >= actual - standard
  deviation >= standard - actual
- 数值缩放（× 100）保留 0.01h 精度
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest
import logging


class MinimizeHoursDeviationObjective(ObjectiveBase):
    """
    最小化工时偏差目标函数
    
    适用场景：
    - 工时均衡分配
    - 避免过度加班或工时不足
    - 贴近标准月度工时
    """
    
    name = "MinimizeHoursDeviation"
    
    # 缩放因子
    SCALE_FACTOR = 100
    STANDARD_DAILY_HOURS = 8.0
    
    def __init__(self, logger: logging.Logger = None):
        super().__init__(logger)
    
    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest
    ) -> Optional[cp_model.LinearExpr]:
        """
        Build objective expression to minimize deviation from standard hours.
        
        Returns:
            LinearExpr representing total deviation (scaled by 100), or None if disabled.
        """
        
        if not shift_assignments:
            self.log("No shift assignments provided. Objective disabled.", level="warning")
            return None
        
        if not data.shift_definitions:
            self.log("No shift definitions found. Objective disabled.", level="warning")
            return None
        
        if not data.window:
            self.log("No scheduling window defined. Objective disabled.", level="warning")
            return None
        
        # 1. 计算排班周期内的工作日数
        workday_count = self._count_workdays(data)
        standard_hours = workday_count * self.STANDARD_DAILY_HOURS
        standard_hours_scaled = int(standard_hours * self.SCALE_FACTOR)
        
        self.log(f"Standard hours: {workday_count} workdays × {self.STANDARD_DAILY_HOURS}h = {standard_hours}h")
        
        # 2. 构建班次工时映射
        shift_hours_scaled: Dict[int, int] = {}
        for shift in data.shift_definitions:
            scaled_hours = int(shift.nominal_hours * self.SCALE_FACTOR)
            shift_hours_scaled[shift.shift_id] = scaled_hours
        
        # 3. 获取所有员工
        all_employees = {ep.employee_id for ep in data.employee_profiles}
        
        # 4. 预分组：按员工 ID 收集班次变量（避免 O(E×N) 嵌套循环）
        from collections import defaultdict
        emp_shift_map = defaultdict(list)  # emp_id -> [(hours_scaled, var), ...]
        for (e_id, date, shift_id), var in shift_assignments.items():
            hours = shift_hours_scaled.get(shift_id, 0)
            if hours > 0:
                emp_shift_map[e_id].append((hours, var))
        
        deviation_vars = []
        
        for emp_id in all_employees:
            emp_terms = emp_shift_map.get(emp_id, [])
            
            if not emp_terms:
                continue
            
            # 实际工时表达式
            actual_hours_expr = sum(hours * var for hours, var in emp_terms)
            
            # 创建偏差辅助变量
            # deviation >= actual - standard
            # deviation >= standard - actual
            # 这等价于 deviation = |actual - standard|
            
            # 偏差上界：假设最大可能偏差不超过标准工时的 2 倍
            max_deviation = standard_hours_scaled * 2
            
            deviation_var = model.NewIntVar(0, max_deviation, f"Deviation_{emp_id}")
            
            # 约束：deviation >= actual - standard
            model.Add(deviation_var >= actual_hours_expr - standard_hours_scaled)
            
            # 约束：deviation >= standard - actual (即 deviation >= -(actual - standard))
            model.Add(deviation_var >= standard_hours_scaled - actual_hours_expr)
            
            deviation_vars.append(deviation_var)
        
        if not deviation_vars:
            self.log("No deviation variables created. Objective disabled.", level="warning")
            return None
        
        # 5. 总偏差 = Σ deviation[e]
        total_deviation_expr = sum(deviation_vars)
        
        self.log(
            f"Built objective: {len(deviation_vars)} employees, "
            f"standard={standard_hours}h, scale={self.SCALE_FACTOR}"
        )
        
        return total_deviation_expr
    
    def _count_workdays(self, data: SolverRequest) -> int:
        """计算排班周期内的工作日数"""
        
        # 优先使用 calendar 数据
        if data.calendar:
            return sum(1 for day in data.calendar if day.is_workday)
        
        # 回退：假设周一到周五是工作日
        try:
            start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
            
            count = 0
            current = start
            while current <= end:
                if current.weekday() < 5:  # 0-4 = 周一到周五
                    count += 1
                current += timedelta(days=1)
            
            return count
        except Exception as e:
            self.log(f"Failed to count workdays: {e}", level="error")
            return 0
    
    @classmethod
    def unscale_value(cls, scaled_value: float) -> float:
        """将缩放后的目标值还原为实际工时偏差"""
        return scaled_value / cls.SCALE_FACTOR
