"""
Input Pre-check Module (OPT-15)

Fast, pre-solve sanity checks to intercept obvious infeasibility
before launching the expensive CP-SAT solver.

Design principles:
- Pure Python, no CP-SAT dependency
- < 1ms execution time
- Config-aware (respects allow_position_vacancy, enable_standard_hours, etc.)
- Returns structured warnings/errors for user-facing feedback

Usage:
    from core.precheck import run_precheck
    issues = run_precheck(request)
    # issues = [PrecheckIssue(severity="ERROR", ...), ...]
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Set
from collections import defaultdict
from contracts.request import SolverRequest
import logging

logger = logging.getLogger("SolverV4.Precheck")


@dataclass
class PrecheckIssue:
    """A single pre-check finding."""
    severity: str          # "ERROR" (will cause INFEASIBLE) or "WARNING" (risk)
    check_name: str        # e.g. "CandidateZeroCoverage"
    message: str           # Human-readable description
    details: Optional[Dict] = None  # Machine-readable context


def run_precheck(req: SolverRequest) -> List[PrecheckIssue]:
    """
    Run all pre-checks on the solver request.
    Returns a list of issues found. Empty list = all clear.
    """
    issues: List[PrecheckIssue] = []
    config = req.config or {}

    # Check 1: Candidate Zero Coverage
    issues.extend(_check_candidate_coverage(req, config))

    # Check 2: Single Point of Failure
    issues.extend(_check_single_point_failure(req))

    # Check 3: Date Overload
    issues.extend(_check_date_overload(req))

    # Check 4: Standard Hours Feasibility
    issues.extend(_check_standard_hours_bound(req, config))

    # Summary logging
    errors = sum(1 for i in issues if i.severity == "ERROR")
    warnings = sum(1 for i in issues if i.severity == "WARNING")
    if issues:
        logger.warning(f"Precheck found {errors} errors, {warnings} warnings")
    else:
        logger.info("Precheck passed: no issues found")

    return issues


def _check_candidate_coverage(req: SolverRequest, config: dict) -> List[PrecheckIssue]:
    """
    Check 1: For each operation×position, verify at least required_people candidates exist.
    
    Behavior depends on allow_position_vacancy:
    - False (default): zero candidates → ERROR (guaranteed infeasible)
    - True: zero candidates → WARNING (will produce vacancy)
    """
    issues = []
    allow_vacancy = config.get("allow_position_vacancy", False)

    # Build employee availability set: emp_id → set of available dates
    emp_available_dates: Dict[int, Set[str]] = {}
    for emp in req.employee_profiles:
        # Start with all calendar dates
        all_dates = {day.date for day in req.calendar}
        # Remove unavailable periods
        unavail_dates = set()
        for period in emp.unavailable_periods:
            # Parse period dates and mark as unavailable
            start = period.get("start_datetime", "")[:10]
            end = period.get("end_datetime", "")[:10]
            for day in req.calendar:
                if start <= day.date <= end:
                    unavail_dates.add(day.date)
        emp_available_dates[emp.employee_id] = all_dates - unavail_dates

    for op in req.operation_demands:
        # Get the date(s) this operation spans
        op_start_date = op.planned_start[:10]
        op_end_date = op.planned_end[:10]
        op_dates = {day.date for day in req.calendar if op_start_date <= day.date <= op_end_date}

        for pos in op.position_qualifications:
            # Count candidates available on ALL days of this operation
            available_candidates = []
            for cand_id in pos.candidate_employee_ids:
                cand_dates = emp_available_dates.get(cand_id, set())
                if op_dates.issubset(cand_dates):
                    available_candidates.append(cand_id)

            if len(available_candidates) == 0:
                severity = "WARNING" if allow_vacancy else "ERROR"
                issues.append(PrecheckIssue(
                    severity=severity,
                    check_name="CandidateZeroCoverage",
                    message=(
                        f"操作 '{op.operation_name}' (批次 {op.batch_code}) "
                        f"岗位 {pos.position_number} 在 {op_start_date}~{op_end_date} "
                        f"没有可用候选人"
                        + ("。将产生空岗。" if allow_vacancy else "。将导致求解无解！")
                    ),
                    details={
                        "operation_plan_id": op.operation_plan_id,
                        "position_number": pos.position_number,
                        "dates": sorted(op_dates),
                        "total_candidates": len(pos.candidate_employee_ids),
                        "available_candidates": 0,
                    }
                ))

    return issues


def _check_single_point_failure(req: SolverRequest) -> List[PrecheckIssue]:
    """
    Check 2: Identify operations where only 1 candidate can serve a position.
    If that person gets sick or takes leave → guaranteed vacancy or infeasibility.
    """
    issues = []

    for op in req.operation_demands:
        for pos in op.position_qualifications:
            if len(pos.candidate_employee_ids) == 1:
                emp_id = pos.candidate_employee_ids[0]
                # Find employee name
                emp_name = str(emp_id)
                for emp in req.employee_profiles:
                    if emp.employee_id == emp_id:
                        emp_name = emp.employee_name
                        break

                issues.append(PrecheckIssue(
                    severity="WARNING",
                    check_name="SinglePointFailure",
                    message=(
                        f"操作 '{op.operation_name}' (批次 {op.batch_code}) "
                        f"岗位 {pos.position_number} 仅有 1 个候选人: {emp_name}。"
                        f"如果此人请假，该岗位将无法覆盖。"
                    ),
                    details={
                        "operation_plan_id": op.operation_plan_id,
                        "position_number": pos.position_number,
                        "sole_candidate_id": emp_id,
                        "sole_candidate_name": emp_name,
                    }
                ))

    return issues


def _check_date_overload(req: SolverRequest) -> List[PrecheckIssue]:
    """
    Check 3: For each date, sum up required_people across all operations.
    Compare against total available employees on that date.
    """
    issues = []

    # Available employees per date
    date_available_count: Dict[str, int] = defaultdict(int)
    for day in req.calendar:
        for emp in req.employee_profiles:
            is_available = True
            for period in emp.unavailable_periods:
                start = period.get("start_datetime", "")[:10]
                end = period.get("end_datetime", "")[:10]
                if start <= day.date <= end:
                    is_available = False
                    break
            if is_available:
                date_available_count[day.date] += 1

    # Required people per date
    date_required_count: Dict[str, int] = defaultdict(int)
    for op in req.operation_demands:
        op_start_date = op.planned_start[:10]
        op_end_date = op.planned_end[:10]
        for day in req.calendar:
            if op_start_date <= day.date <= op_end_date:
                date_required_count[day.date] += op.required_people

    # Compare
    for date_str in sorted(date_required_count.keys()):
        required = date_required_count[date_str]
        available = date_available_count.get(date_str, 0)
        if required > available:
            issues.append(PrecheckIssue(
                severity="WARNING",
                check_name="DateOverload",
                message=(
                    f"{date_str}: 需要 {required} 人，但仅 {available} 人可用。"
                    f"可能导致大量空岗或无解。"
                ),
                details={
                    "date": date_str,
                    "required": required,
                    "available": available,
                    "deficit": required - available,
                }
            ))

    return issues


def _check_standard_hours_bound(req: SolverRequest, config: dict) -> List[PrecheckIssue]:
    """
    Check 4: Loose upper-bound check for standard hours feasibility.
    
    If enable_standard_hours is OFF, skip this check entirely.
    
    For each employee:
    - Count available work days
    - Multiply by longest shift duration → max possible hours
    - Compare against standard hours lower bound
    """
    issues = []

    if not config.get("enable_standard_hours", True):
        return issues

    standard_hours = float(config.get("standard_hours", 0))
    standard_hours_delta = float(config.get("standard_hours_delta", 0))
    lower_bound = standard_hours - standard_hours_delta

    if lower_bound <= 0:
        return issues

    # Find longest shift
    max_shift_hours = 0
    for s in req.shift_definitions:
        if s.nominal_hours > max_shift_hours:
            max_shift_hours = s.nominal_hours

    if max_shift_hours <= 0:
        return issues

    for emp in req.employee_profiles:
        # Count available days
        unavail_dates = set()
        for period in emp.unavailable_periods:
            start = period.get("start_datetime", "")[:10]
            end = period.get("end_datetime", "")[:10]
            for day in req.calendar:
                if start <= day.date <= end:
                    unavail_dates.add(day.date)

        available_days = sum(1 for day in req.calendar if day.date not in unavail_dates)
        max_possible_hours = available_days * max_shift_hours

        if max_possible_hours < lower_bound:
            issues.append(PrecheckIssue(
                severity="WARNING",
                check_name="StandardHoursInfeasible",
                message=(
                    f"员工 '{emp.employee_name}' (ID:{emp.employee_id}) "
                    f"可用天数={available_days}，最大可能工时="
                    f"{available_days}×{max_shift_hours}h={max_possible_hours:.0f}h "
                    f"< 标准工时下限 {lower_bound:.0f}h。可能无法满足标准工时约束。"
                ),
                details={
                    "employee_id": emp.employee_id,
                    "employee_name": emp.employee_name,
                    "available_days": available_days,
                    "max_possible_hours": max_possible_hours,
                    "standard_hours_lower_bound": lower_bound,
                }
            ))

    return issues
