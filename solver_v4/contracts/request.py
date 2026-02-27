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

@dataclass
class EmployeeProfile:
    employee_id: int
    employee_code: str
    employee_name: str
    qualifications: List[Dict[str, Any]]  # {qualification_id, level}
    unavailable_periods: List[Dict[str, str]] # {start_datetime, end_datetime}

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

@dataclass
class HistoricalShift:
    """历史班次记录，用于边界约束检查"""
    employee_id: int
    date: str
    is_work: bool   # 是否上班 (PRODUCTION/BASE)
    is_night: bool  # 是否夜班
    consecutive_work_days: int = 0  # 截止该日期的连续工作天数

@dataclass
class SolverRequest:
    request_id: str
    window: Dict[str, str] # {start_date, end_date}
    operation_demands: List[OperationDemand]
    employee_profiles: List[EmployeeProfile]
    calendar: List[CalendarDay]
    shift_definitions: List[ShiftDefinition]
    shared_preferences: List[SharedPreference]
    historical_shifts: List[HistoricalShift] = field(default_factory=list)
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
                position_qualifications=pos_quals
            ))

        mps = [EmployeeProfile(**ep) for ep in data.get("employee_profiles", [])]
        cals = [CalendarDay(**c) for c in data.get("calendar", [])]
        shifts = [ShiftDefinition(**s) for s in data.get("shift_definitions", [])]
        shares = [SharedPreference(**sp) for sp in data.get("shared_preferences", [])]
        hist_shifts = [HistoricalShift(**hs) for hs in data.get("historical_shifts", [])]

        return cls(
            request_id=data.get("request_id"),
            window=data.get("window"),
            operation_demands=op_demands,
            employee_profiles=mps,
            calendar=cals,
            shift_definitions=shifts,
            shared_preferences=shares,
            historical_shifts=hist_shifts,
            config=data.get("config")
        )
