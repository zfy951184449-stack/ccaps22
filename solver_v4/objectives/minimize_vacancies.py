"""
Minimize Vacancies with Dynamic Priority

惩罚权重根据操作时间和日期动态调整：
- 高峰日：总需人数 (Total Personnel Demand) 多的日期权重更高
- 非工作时段：8-17点以外的操作权重更高
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional
from collections import defaultdict
from objectives.base import ObjectiveBase


class MinimizeVacanciesObjective(ObjectiveBase):
    name = "MinimizeVacancies"
    
    # 配置常量
    OFF_HOURS_START = 17  # 17:00 后算非标准时段
    OFF_HOURS_END = 8     # 08:00 前算非标准时段
    OFF_HOURS_MULTIPLIER = 1.5  # 非标准时段权重乘数
    
    def build_expression(
        self,
        model: cp_model.CpModel,
        vacancy_vars: Dict[tuple, cp_model.IntVar],
        data: any,
        op_metadata: Dict[int, dict]  # {op_id: {date, start_hour, required_people}}
    ) -> Optional[cp_model.LinearExpr]:
        
        if not vacancy_vars:
            return None
        
        config = data.config or {}
        base_weight = int(config.get("objective_weight_vacancy", 10000))
        
        # 1. 计算高峰日乘数 (基于需人数)
        date_personnel_demand = defaultdict(int)
        for op_id, meta in op_metadata.items():
            date_personnel_demand[meta['date']] += meta.get('required_people', 1)
        
        if not date_personnel_demand:
            avg_demand_per_day = 1
        else:
            avg_demand_per_day = sum(date_personnel_demand.values()) / max(len(date_personnel_demand), 1)
        
        peak_multipliers = {}
        for date, demand in date_personnel_demand.items():
            # 归一化到 0.5 ~ 2.0 范围
            ratio = demand / max(avg_demand_per_day, 1)
            peak_multipliers[date] = max(0.5, min(2.0, ratio))
        
        # 2. 构建带权重的目标表达式
        weighted_terms = []
        
        for (op_id, pos_num), var in vacancy_vars.items():
            meta = op_metadata.get(op_id, {})
            date = meta.get('date', '')
            start_hour = meta.get('start_hour', 12)
            
            # 高峰日乘数
            peak_mult = peak_multipliers.get(date, 1.0)
            
            # 非标准时段乘数
            # 假设 start_hour 是 0-23 的整数
            is_off_hours = start_hour < self.OFF_HOURS_END or start_hour >= self.OFF_HOURS_START
            
            # 从 config 获取非标准时段乘数，默认 1.5
            off_hours_mult_setting = float(config.get("off_hours_multiplier", self.OFF_HOURS_MULTIPLIER))
            off_hours_mult = off_hours_mult_setting if is_off_hours else 1.0
            
            # 最终权重
            final_weight = int(base_weight * peak_mult * off_hours_mult)
            weighted_terms.append(final_weight * var)
        
        self.log(f"Built weighted vacancy objective: {len(weighted_terms)} terms. Base: {base_weight}, Off-Hours Mult: {config.get('off_hours_multiplier', self.OFF_HOURS_MULTIPLIER)}")
        return sum(weighted_terms) if weighted_terms else None
