"""
core/priorities.py

优先级配置模块
- P0-P3 优先级层级定义
- 约束权重配置
"""

from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass
class PriorityConfig:
    """
    约束优先级配置
    
    优先级层级:
    - P0 (CRITICAL): 必须满足的硬约束
    - P1 (HIGH): 高优先级软约束，如最小化缺员
    - P2 (MEDIUM): 中优先级，如公平性
    - P3 (LOW): 低优先级，如偏好
    """
    
    # P0: 硬约束（必须满足）
    hard_constraints: Dict[str, bool] = field(default_factory=lambda: {
        'H1_qualification': True,
        'H2_position': True,
        'H3_mutex_same_op': True,
        'H4_mutex_time': True,
        'H5_consecutive': True,
        'H6_shift_coverage': True,
        'H7_night_rest': True,
        'H8_monthly_max': True,
        'H9_monthly_min': True,
        'H10_sharing': True,
        'H11_availability': True,
    })
    
    # 软约束权重 (值越大越重要)
    p1_weights: Dict[str, int] = field(default_factory=lambda: {
        'S1_minimize_skip': 10000,  # 最小化缺员
    })
    
    p2_weights: Dict[str, int] = field(default_factory=lambda: {
        'F1_night_fairness': 100,   # 夜班公平
        'F2_day_fairness': 50,      # 白班公平
        'F3_hours_fairness': 10,    # 工时公平
        'F4_range_penalty': 200,    # 极差惩罚
    })
    
    p3_weights: Dict[str, int] = field(default_factory=lambda: {
        'S5_night_soft_rest': 500,  # 夜班软休息
        'S6_non_workday': 1000,     # 非工作日惩罚
        'S7_supervisor_op': 500,    # 主管干活惩罚
        'S8_consecutive_rest': 500, # 连续休息补偿
        'S9_supervisor_night': 2000,# 主管夜班惩罚
    })
    
    def get_weight(self, constraint_id: str) -> int:
        """获取约束权重"""
        for weights in [self.p1_weights, self.p2_weights, self.p3_weights]:
            if constraint_id in weights:
                return weights[constraint_id]
        return 1
    
    def is_enabled(self, constraint_id: str) -> bool:
        """检查约束是否启用"""
        if constraint_id.startswith('H'):
            return self.hard_constraints.get(constraint_id, True)
        return True
    
    def update_weight(self, constraint_id: str, weight: int) -> None:
        """更新约束权重"""
        for weights in [self.p1_weights, self.p2_weights, self.p3_weights]:
            if constraint_id in weights:
                weights[constraint_id] = weight
                return
    
    def disable_constraint(self, constraint_id: str) -> None:
        """禁用约束"""
        if constraint_id in self.hard_constraints:
            self.hard_constraints[constraint_id] = False


# 默认配置
DEFAULT_PRIORITY_CONFIG = PriorityConfig()
