"""
V5 Solver Objective Functions Module
"""
from objectives.base import ObjectiveBase
from objectives.minimize_deviation import MinimizeHoursDeviationObjective
from objectives.minimize_special_shifts import MinimizeSpecialShiftsObjective

__all__ = [
    "ObjectiveBase",
    "MinimizeHoursDeviationObjective",
    "MinimizeSpecialShiftsObjective"
]
