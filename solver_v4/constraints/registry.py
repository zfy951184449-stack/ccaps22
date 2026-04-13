"""
Constraint Registry — Ordered list of all constraint modules.

Constraints are applied in the order listed here.
To add a new constraint:
  1. Create the constraint class in constraints/ with config_key and default_enabled
  2. Import and append it to CONSTRAINT_REGISTRY below
  3. That's it. No need to modify solver.py.

The registry is split into two phases:
  - CORE_CONSTRAINTS: Applied regardless of shift assignments
  - SHIFT_CONSTRAINTS: Require shift_assignments to be present
"""

from constraints.frozen_range import FrozenRangeConstraint
from constraints.share_group import ShareGroupConstraint
from constraints.unique_employee import UniqueEmployeeConstraint
from constraints.locked_operations import LockedOperationsConstraint
from constraints.one_position import OnePositionConstraint
from constraints.employee_availability import EmployeeAvailabilityConstraint

from constraints.locked_shifts import LockedShiftsConstraint
from constraints.shift_assignment import ShiftAssignmentConstraint
from constraints.flexible_scheduling import FlexibleSchedulingConstraint
from constraints.work_days_limit import MaxConsecutiveWorkDaysConstraint
from constraints.consecutive_rest_limit import MaxConsecutiveRestDaysConstraint
from constraints.standard_hours import StandardHoursConstraint
from constraints.night_rest import NightRestConstraint
from constraints.night_shift_interval import NightShiftIntervalConstraint
from constraints.special_shift_joint_coverage import SpecialShiftJointCoverageConstraint
from constraints.prefer_standard_shift import PreferStandardShiftConstraint
from constraints.consecutive_work_rest_pattern import ConsecutiveWorkRestPatternConstraint


# Phase 1: Core constraints (no shift dependency)
CORE_CONSTRAINTS = [
    FrozenRangeConstraint,          # MUST be first — pins variables outside solve_range
    ShareGroupConstraint,
    UniqueEmployeeConstraint,
    LockedOperationsConstraint,
    OnePositionConstraint,
    EmployeeAvailabilityConstraint,
]

# Phase 2: Shift-dependent constraints (require shift_assignments)
SHIFT_CONSTRAINTS = [
    LockedShiftsConstraint,
    ShiftAssignmentConstraint,
    FlexibleSchedulingConstraint,
    MaxConsecutiveWorkDaysConstraint,
    MaxConsecutiveRestDaysConstraint,
    StandardHoursConstraint,
    NightRestConstraint,
    NightShiftIntervalConstraint,
    SpecialShiftJointCoverageConstraint,
    PreferStandardShiftConstraint,      # Block SPECIAL when STANDARD suffices
    ConsecutiveWorkRestPatternConstraint,   # Default OFF
]

# Full ordered list
CONSTRAINT_REGISTRY = CORE_CONSTRAINTS + SHIFT_CONSTRAINTS
