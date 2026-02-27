"""V3 求解器软约束模块"""

from .share_group_cross_day import ShareGroupCrossDayPenalty
from .non_workday import NonWorkdayPenalty
from .night_soft_rest import NightSoftRestPenalty
from .consecutive_rest import ConsecutiveRestPenalty
from .supervisor_night import SupervisorNightPenalty

# 软约束注册表
SOFT_CONSTRAINT_REGISTRY = {
    "S5": ShareGroupCrossDayPenalty,
    "S6": NonWorkdayPenalty,
    "S7": NightSoftRestPenalty,
    "S8": ConsecutiveRestPenalty,
    "S9": SupervisorNightPenalty,
}

__all__ = [
    'ShareGroupCrossDayPenalty',
    'NonWorkdayPenalty',
    'NightSoftRestPenalty',
    'ConsecutiveRestPenalty',
    'SupervisorNightPenalty',
    'SOFT_CONSTRAINT_REGISTRY',
]
