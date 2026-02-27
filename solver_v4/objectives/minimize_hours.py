"""
Minimize Total Work Hours Objective

目标：最小化所有员工在排班周期内的总工时数。
数学形式：Min Σ(shift_hours[s] × shift_var[e,d,s])

实现说明：
- 使用整数缩放（× 100）保留 0.01h 精度，符合 OR-Tools 整数约束
- 忽略 REST 班次（nominal_hours ≈ 0）
- 返回的 ObjectiveValue 需要 ÷ 100 还原为实际工时
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest
import logging


class MinimizeTotalHoursObjective(ObjectiveBase):
    """
    最小化总排班工时目标函数
    
    适用场景：
    - 降低人力成本
    - 优先使用短班次
    - 避免不必要的加班
    """
    
    name = "MinimizeTotalHours"
    
    # 缩放因子：将小数工时转为整数 (8.5h -> 850)
    SCALE_FACTOR = 100
    
    def __init__(self, logger: logging.Logger = None):
        super().__init__(logger)
    
    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest
    ) -> Optional[cp_model.LinearExpr]:
        """
        Build objective expression to minimize total hours.
        
        Returns:
            LinearExpr representing total hours (scaled by 100), or None if disabled.
        """
        
        if not shift_assignments:
            self.log("No shift assignments provided. Objective disabled.", level="warning")
            return None
        
        if not data.shift_definitions:
            self.log("No shift definitions found. Objective disabled.", level="warning")
            return None
        
        # Build shift hours map (scaled to int for precision)
        # shift_id -> hours * SCALE_FACTOR
        shift_hours_scaled: Dict[int, int] = {}
        
        for shift in data.shift_definitions:
            # 缩放: 8.00h -> 800, 10.5h -> 1050
            scaled_hours = int(shift.nominal_hours * self.SCALE_FACTOR)
            shift_hours_scaled[shift.shift_id] = scaled_hours
            
            if scaled_hours > 0:
                self.log(f"Shift {shift.shift_id} ({shift.shift_name}): {shift.nominal_hours}h -> {scaled_hours}", level="debug")
        
        # Build objective terms: Σ(hours * var)
        terms = []
        term_count_by_shift = {}
        
        for (emp_id, date, shift_id), var in shift_assignments.items():
            hours = shift_hours_scaled.get(shift_id, 0)
            
            if hours > 0:  # 忽略 REST (0h) 班次
                terms.append(hours * var)
                
                # Track term count per shift type for logging
                term_count_by_shift[shift_id] = term_count_by_shift.get(shift_id, 0) + 1
        
        if not terms:
            self.log("No valid shift hours found (all REST?). Objective disabled.", level="warning")
            return None
        
        # Sum all terms
        total_hours_expr = sum(terms)
        
        # Log summary
        self.log(
            f"Built objective: {len(terms)} terms, "
            f"{len(shift_hours_scaled)} shift types, "
            f"Scale factor: {self.SCALE_FACTOR}"
        )
        
        for sid, count in term_count_by_shift.items():
            self.log(f"  Shift {sid}: {count} variables", level="debug")
        
        return total_hours_expr
    
    @classmethod
    def unscale_value(cls, scaled_value: float) -> float:
        """
        Convert scaled objective value back to actual hours.
        
        Args:
            scaled_value: ObjectiveValue from solver (scaled)
            
        Returns:
            Actual total hours as float
        """
        return scaled_value / cls.SCALE_FACTOR
