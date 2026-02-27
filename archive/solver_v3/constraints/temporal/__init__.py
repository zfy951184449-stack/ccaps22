"""V3 求解器时间约束模块"""

from .consecutive import ConsecutiveConstraint
from .shift_coverage import ShiftCoverageConstraint
from .night_rest import NightRestConstraint

__all__ = [
    'ConsecutiveConstraint',
    'ShiftCoverageConstraint',
    'NightRestConstraint',
]
