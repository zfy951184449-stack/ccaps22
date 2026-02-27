"""
Minimize Special Shifts Objective

目标：最小化特殊班次（非正常班）的使用数量。
数学形式：Min Σ shift_var[e,d,s]  where s.category == 'SPECIAL'

特殊班次识别：
- plan_category == 'SPECIAL'

排除：
- STANDARD（标准班次）
- REST（通过 nominal_hours ≈ 0 识别，或 STANDARD with 0 hours）
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, Set
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest
import logging


class MinimizeSpecialShiftsObjective(ObjectiveBase):
    """
    最小化特殊班次目标函数
    
    适用场景：
    - 降低非正常班次的使用频率
    - 优先使用标准班次排班
    - 减少特殊/加班/临时班次成本
    """
    
    name = "MinimizeSpecialShifts"
    
    # 特殊班次的类别值
    SPECIAL_CATEGORY = "SPECIAL"
    
    def __init__(self, logger: logging.Logger = None):
        super().__init__(logger)
    
    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest
    ) -> Optional[cp_model.LinearExpr]:
        """
        Build objective expression to minimize special shift count.
        
        Returns:
            LinearExpr representing total count of special shifts, or None if disabled.
        """
        
        if not shift_assignments:
            self.log("No shift assignments provided. Objective disabled.", level="warning")
            return None
        
        if not data.shift_definitions:
            self.log("No shift definitions found. Objective disabled.", level="warning")
            return None
        
        # 1. 识别特殊班次 ID
        special_shift_ids: Set[int] = set()
        rest_shift_ids: Set[int] = set()  # 排除休息班
        
        for shift in data.shift_definitions:
            # 识别休息班（工时为 0 或接近 0）
            if shift.nominal_hours <= 0.01:
                rest_shift_ids.add(shift.shift_id)
                continue
            
            # 识别特殊班次
            if shift.plan_category == self.SPECIAL_CATEGORY:
                special_shift_ids.add(shift.shift_id)
                self.log(f"Identified SPECIAL shift: {shift.shift_id} ({shift.shift_name})", level="debug")
        
        if not special_shift_ids:
            self.log("No SPECIAL category shifts found. Objective returns 0.", level="info")
            # 返回一个零表达式，防止目标函数为 None
            return 0
        
        self.log(f"Found {len(special_shift_ids)} special shift types: {special_shift_ids}")
        
        # 2. 收集所有特殊班次变量
        special_vars = []
        
        for (emp_id, date, shift_id), var in shift_assignments.items():
            if shift_id in special_shift_ids:
                special_vars.append(var)
        
        if not special_vars:
            self.log("No special shift variables found. Objective returns 0.", level="info")
            return 0
        
        # 3. 目标 = Σ(special_shift_vars)
        total_special_count = sum(special_vars)
        
        self.log(
            f"Built objective: {len(special_vars)} special shift variables "
            f"from {len(special_shift_ids)} shift types"
        )
        
        return total_special_count
