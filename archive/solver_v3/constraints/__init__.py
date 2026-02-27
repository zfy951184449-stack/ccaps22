"""
V3 求解器约束模块

提供约束注册表和统一的约束加载接口。
"""

from typing import Dict, Type
from constraints.base import BaseConstraint, HardConstraint, SoftConstraint

# 约束注册表
CONSTRAINT_REGISTRY: Dict[str, Type[BaseConstraint]] = {}


def register_constraint(constraint_class: Type[BaseConstraint]) -> Type[BaseConstraint]:
    """约束注册装饰器"""
    CONSTRAINT_REGISTRY[constraint_class.constraint_id] = constraint_class
    return constraint_class


def load_all_constraints():
    """加载所有约束模块"""
    # 导入分配约束
    from constraints.assignment import (
        QualificationConstraint,
        PositionConstraint,
        MutexConstraint,
        AvailabilityConstraint,
        SharingConstraint,
    )
    
    # 导入时间约束
    from constraints.temporal import (
        ConsecutiveConstraint,
        ShiftCoverageConstraint,
        NightRestConstraint,
    )
    
    # 导入容量约束
    from constraints.capacity import (
        MonthlyHoursConstraint,
    )
    
    # 导入策略约束
    from constraints.policy import (
        CalendarPolicy,
        SupervisorPolicy,
    )
    
    # 注册分配约束
    if "H1" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H1"] = QualificationConstraint
    if "H2-H3" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H2-H3"] = PositionConstraint
    if "H4" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H4"] = MutexConstraint
    if "H11" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H11"] = AvailabilityConstraint
    if "H10" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H10"] = SharingConstraint
    
    # 注册时间约束
    if "H5" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H5"] = ConsecutiveConstraint
    if "H6" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H6"] = ShiftCoverageConstraint
    if "H7" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H7"] = NightRestConstraint
    
    # 注册容量约束
    if "H8-H9" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["H8-H9"] = MonthlyHoursConstraint
    
    # 注册策略约束 (软约束)
    if "S6" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["S6"] = CalendarPolicy
    if "S7-S9" not in CONSTRAINT_REGISTRY:
        CONSTRAINT_REGISTRY["S7-S9"] = SupervisorPolicy


__all__ = [
    'BaseConstraint',
    'HardConstraint',
    'SoftConstraint',
    'CONSTRAINT_REGISTRY',
    'register_constraint',
    'load_all_constraints',
]
