"""
Solver V4 Data Contracts
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class PositionQualification:
    position_number: int
    qualifications: List[Dict[str, Any]]  # {qualification_id, min_level, is_mandatory}
    candidate_employee_ids: List[int]     # [OPTIMIZATION] Pre-filtered candidates

@dataclass
class OperationDemand:
    operation_plan_id: int
    batch_id: int
    batch_code: str
    operation_id: int
    operation_name: str
    planned_start: str
    planned_end: str
    planned_duration_minutes: int
    required_people: int
    position_qualifications: List[PositionQualification]
    
    # Task Pool / Flexible Scheduling extensions
    scheduling_mode: str = "FIXED" # "FIXED" | "FLEXIBLE"
    earliest_start: Optional[str] = None # For FLEXIBLE mode, e.g. "2026-02-01"
    deadline: Optional[str] = None       # For FLEXIBLE mode, e.g. "2026-02-07"
    source_type: str = "BATCH"           # "BATCH" | "STANDALONE"
    standalone_task_id: Optional[int] = None
    preferred_shift_ids: Optional[List[int]] = None # Preferred allowed shifts


@dataclass
class EmployeeProfile:
    employee_id: int
    employee_code: str
    employee_name: str
    qualifications: List[Dict[str, Any]]  # {qualification_id, level}
    unavailable_periods: List[Dict[str, str]] # {start_datetime, end_datetime}

@dataclass
class SpecialShiftRequirement:
    occurrence_id: int
    window_id: int
    date: str
    shift_id: int
    required_people: int
    eligible_employee_ids: List[int]
    window_code: Optional[str] = None
    fulfillment_mode: str = "HARD"
    priority_level: str = "HIGH"
    candidates: List["SpecialShiftCandidate"] = field(default_factory=list)
    plan_category: str = "BASE"
    lock_after_apply: bool = True

@dataclass
class SpecialShiftCandidate:
    employee_id: int
    impact_cost: int = 0

@dataclass
class CalendarDay:
    date: str
    is_workday: bool
    is_triple_salary: bool

@dataclass
class ShiftDefinition:
    shift_id: int
    shift_code: str
    shift_name: str
    start_time: str
    end_time: str
    nominal_hours: float
    is_night_shift: bool
    plan_category: str = "STANDARD" # STANDARD, SPECIAL, TEMPORARY

@dataclass
class SharedPreference:
    share_group_id: int
    share_group_name: str
    members: List[Dict[str, Any]] # {operation_plan_id, required_people}
    share_mode: str = "SAME_TEAM"

@dataclass
class LockedOperation:
    operation_plan_id: int
    enforced_employee_ids: List[int]

@dataclass
class LockedShift:
    employee_id: int
    date: str
    plan_category: str = "WORK"
    shift_id: Optional[int] = None

@dataclass
class HistoricalShift:
    """历史班次记录，用于边界约束检查"""
    employee_id: int
    date: str
    is_work: bool   # 是否上班 (PRODUCTION/BASE)
    is_night: bool  # 是否夜班
    consecutive_work_days: int = 0  # 截止该日期的连续工作天数

@dataclass
class Resource:
    resource_id: int
    resource_code: str
    resource_name: str
    resource_type: str
    department_code: str
    is_shared: bool
    is_schedulable: bool
    owner_org_unit_id: Optional[int] = None
    status: Optional[str] = None
    capacity: Optional[int] = None
    location: Optional[str] = None
    clean_level: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class ResourceCalendarEntry:
    resource_id: int
    start_datetime: str
    end_datetime: str
    event_type: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    notes: Optional[str] = None

@dataclass
class OperationResourceRequirement:
    operation_plan_id: int
    resource_type: str
    required_count: int
    is_mandatory: bool
    requires_exclusive_use: bool
    prep_minutes: int = 0
    changeover_minutes: int = 0
    cleanup_minutes: int = 0

@dataclass
class MaintenanceWindow:
    resource_id: int
    start_datetime: str
    end_datetime: str
    window_type: str
    is_hard_block: bool
    notes: Optional[str] = None

@dataclass
class SolverRequest:
    request_id: str
    window: Dict[str, str] # {start_date, end_date}
    operation_demands: List[OperationDemand]
    employee_profiles: List[EmployeeProfile]
    calendar: List[CalendarDay]
    shift_definitions: List[ShiftDefinition]
    shared_preferences: List[SharedPreference]
    special_shift_requirements: List[SpecialShiftRequirement] = field(default_factory=list)
    locked_operations: List[LockedOperation] = field(default_factory=list)
    locked_shifts: List[LockedShift] = field(default_factory=list)
    historical_shifts: List[HistoricalShift] = field(default_factory=list)
    resources: List[Resource] = field(default_factory=list)
    resource_calendars: List[ResourceCalendarEntry] = field(default_factory=list)
    operation_resource_requirements: List[OperationResourceRequirement] = field(default_factory=list)
    maintenance_windows: List[MaintenanceWindow] = field(default_factory=list)
    config: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SolverRequest":
        # Parsing Logic with basic validation
        op_demands = []
        for op in data.get("operation_demands", []):
            pos_quals = []
            for pq in op.get("position_qualifications", []):
                pos_quals.append(PositionQualification(
                    position_number=pq["position_number"],
                    qualifications=pq.get("qualifications", []),
                    candidate_employee_ids=pq.get("candidate_employee_ids", [])
                ))
            
            op_demands.append(OperationDemand(
                operation_plan_id=op["operation_plan_id"],
                batch_id=op["batch_id"],
                batch_code=op["batch_code"],
                operation_id=op["operation_id"],
                operation_name=op["operation_name"],
                planned_start=op["planned_start"],
                planned_end=op["planned_end"],
                planned_duration_minutes=op["planned_duration_minutes"],
                required_people=op["required_people"],
                position_qualifications=pos_quals,
                scheduling_mode=op.get("scheduling_mode", "FIXED"),
                earliest_start=op.get("earliest_start"),
                deadline=op.get("deadline"),
                source_type=op.get("source_type", "BATCH"),
                standalone_task_id=op.get("standalone_task_id"),
                preferred_shift_ids=op.get("preferred_shift_ids")
            ))

        mps = [EmployeeProfile(**ep) for ep in data.get("employee_profiles", [])]
        special_shift_requirements = [
            SpecialShiftRequirement(
                **{
                    **requirement,
                    "candidates": [
                        SpecialShiftCandidate(**candidate)
                        for candidate in requirement.get("candidates", [])
                    ],
                }
            )
            for requirement in data.get("special_shift_requirements", [])
        ]
        cals = [CalendarDay(**c) for c in data.get("calendar", [])]
        shifts = [ShiftDefinition(**s) for s in data.get("shift_definitions", [])]
        shares = [SharedPreference(**sp) for sp in data.get("shared_preferences", [])]
        locked_ops = [LockedOperation(**lo) for lo in data.get("locked_operations", [])]
        locked_shifts = [LockedShift(**ls) for ls in data.get("locked_shifts", [])]
        hist_shifts = [HistoricalShift(**hs) for hs in data.get("historical_shifts", [])]
        resources = [Resource(**resource) for resource in data.get("resources", [])]
        resource_calendars = [ResourceCalendarEntry(**entry) for entry in data.get("resource_calendars", [])]
        operation_resource_requirements = [
            OperationResourceRequirement(**requirement)
            for requirement in data.get("operation_resource_requirements", [])
        ]
        maintenance_windows = [MaintenanceWindow(**window) for window in data.get("maintenance_windows", [])]

        return cls(
            request_id=data.get("request_id"),
            window=data.get("window"),
            operation_demands=op_demands,
            special_shift_requirements=special_shift_requirements,
            employee_profiles=mps,
            calendar=cals,
            shift_definitions=shifts,
            shared_preferences=shares,
            locked_operations=locked_ops,
            locked_shifts=locked_shifts,
            historical_shifts=hist_shifts,
            resources=resources,
            resource_calendars=resource_calendars,
            operation_resource_requirements=operation_resource_requirements,
            maintenance_windows=maintenance_windows,
            config=data.get("config")
        )
