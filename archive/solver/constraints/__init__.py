"""
约束模块

包含所有求解器约束的实现。
"""

from .base import BaseConstraint
from .operation_assignment import OperationAssignmentConstraint
from .shift_consistency import ShiftConsistencyConstraint
from .monthly_hours import MonthlyHoursConstraint
from .consecutive_work import ConsecutiveWorkConstraint
from .night_rest import NightRestConstraint
from .qualification import QualificationConstraint
from .sharing import SharingConstraint
from .supervisor import SupervisorConstraint
from .fairness import FairnessConstraint

__all__ = [
    "BaseConstraint",
    "OperationAssignmentConstraint",
    "ShiftConsistencyConstraint",
    "MonthlyHoursConstraint",
    "ConsecutiveWorkConstraint",
    "NightRestConstraint",
    "QualificationConstraint",
    "SharingConstraint",
    "SupervisorConstraint",
    "FairnessConstraint",
]

