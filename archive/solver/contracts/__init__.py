"""
求解器数据契约模块

定义求解器输入输出的数据结构，确保前后端与求解器之间的数据一致性。
"""

from .request import (
    SolverRequest,
    OperationDemand,
    EmployeeProfile,
    EmployeeQualification,
    CalendarDay,
    ShiftDefinition,
    SharedPreference,
    LockedOperation,
    LockedShift,
    EmployeeUnavailability,
    SolverConfig,
    SchedulingWindow,
)

from .response import (
    SolverResponse,
    OperationAssignment,
    ShiftPlan,
    ShiftPlanOperation,
    HoursSummary,
    SolverWarning,
    SolverDiagnostics,
)

__all__ = [
    # Request
    "SolverRequest",
    "OperationDemand",
    "EmployeeProfile",
    "EmployeeQualification",
    "CalendarDay",
    "ShiftDefinition",
    "SharedPreference",
    "LockedOperation",
    "LockedShift",
    "EmployeeUnavailability",
    "SolverConfig",
    "SchedulingWindow",
    # Response
    "SolverResponse",
    "OperationAssignment",
    "ShiftPlan",
    "ShiftPlanOperation",
    "HoursSummary",
    "SolverWarning",
    "SolverDiagnostics",
]

