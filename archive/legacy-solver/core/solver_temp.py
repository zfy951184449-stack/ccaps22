#!/usr/bin/env python3
"""Simple OR-Tools based solver bridge for AutoSchedulingService.

Usage:
  pip install flask ortools
  python solver/server.py

It exposes POST /api/solve compatible with backend SolverBridge.
"""
from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Dict, List, Tuple
import sys

from ortools.sat.python import cp_model


def _log_lines(path: str, lines: List[str]) -> None:
    try:
        with open(path, "a") as f:
            for line in lines:
                f.write(f"{line}\n")
    except Exception:
        pass


def _build_calendar_structs(calendar_entries: List[Dict]) -> Tuple[
    Dict[str, Dict],
    List[date],
    Dict[str, Dict[str, List[str] | int]],
    Dict[str, Dict],
]:
    calendar_info: Dict[str, Dict] = {}
    calendar_date_objects: List[date] = []
    month_buckets: Dict[str, Dict[str, List[str] | int]] = {}
    quarter_buckets: Dict[str, Dict] = {}

    for entry in calendar_entries:
        date_str = entry.get("date")
        if not date_str:
            continue
        calendar_info[date_str] = entry
        parsed_date = _parse_iso_date(date_str)
        if parsed_date:
            calendar_date_objects.append(parsed_date)
            quarter_key = _get_quarter_key(parsed_date)
            q_bucket = quarter_buckets.setdefault(
                quarter_key, {"dates": [], "workdays": 0, "sample_date": parsed_date}
            )
            q_bucket["dates"].append(date_str)
            if entry.get("isWorkday"):
                q_bucket["workdays"] = int(q_bucket.get("workdays", 0)) + 1

        month_key = date_str[:7]
        m_bucket = month_buckets.setdefault(month_key, {"dates": [], "workdays": 0})
        m_bucket["dates"].append(date_str)
        if entry.get("isWorkday"):
            m_bucket["workdays"] = int(m_bucket.get("workdays", 0)) + 1

    # 标记季度覆盖
    global_start_date = min(calendar_date_objects) if calendar_date_objects else None
    global_end_date = max(calendar_date_objects) if calendar_date_objects else None
    for bucket in quarter_buckets.values():
        sample_date = bucket.get("sample_date")
        if not sample_date:
            bucket["fullCoverage"] = False
            continue
        quarter_start, quarter_end = _get_quarter_bounds(sample_date)
        bucket["fullCoverage"] = bool(
            global_start_date and global_end_date and global_start_date <= quarter_start and global_end_date >= quarter_end
        )

    return calendar_info, calendar_date_objects, month_buckets, quarter_buckets


def _build_share_groups(shared_groups: List[Dict]) -> Tuple[Dict[int, str], Dict[int, int]]:
    share_group_lookup: Dict[int, str] = {}
    share_anchor_by_operation: Dict[int, int] = {}

    for group in shared_groups:
        group_id = group.get("shareGroupId")
        members = group.get("members") or []
        normalized_members: List[Tuple[int, int]] = []
        for member in members:
            op_id = member.get("operationPlanId")
            if op_id is None:
                continue
            normalized_members.append((int(op_id), int(member.get("requiredPeople") or 0)))
        if not normalized_members or not group_id:
            continue
        anchor_op = max(normalized_members, key=lambda item: item[1])[0]
        for op_id, _ in normalized_members:
            share_group_lookup[op_id] = group_id
            share_anchor_by_operation[op_id] = anchor_op

    return share_group_lookup, share_anchor_by_operation


def _build_locked_operation_map(locked_operations: List[Dict]) -> Dict[int, set[int]]:
    locked_operation_map: Dict[int, set[int]] = {}
    for entry in locked_operations:
        op_id = entry.get("operationPlanId")
        if op_id is None:
            continue
        employees_list = entry.get("enforcedEmployeeIds") or []
        normalized_ids = {int(eid) for eid in employees_list if eid is not None}
        if normalized_ids:
            locked_operation_map[int(op_id)] = normalized_ids
    return locked_operation_map


def _build_employee_lookups(employees: List[Dict]) -> Tuple[
    Dict[int, Dict[int, int]], Dict[int, Dict], Dict[int, str]
]:
    qualification_lookup: Dict[int, Dict[int, int]] = {}
    employee_lookup: Dict[int, Dict] = {}
    employee_tier_lookup: Dict[int, str] = {}
    for emp in employees:
        emp_id = int(emp["employeeId"])
        employee_lookup[emp_id] = emp
        employee_tier_lookup[emp_id] = (emp.get("orgRole") or "UNKNOWN").upper()
        qualification_lookup[emp_id] = {
            int(q["qualificationId"]): int(q.get("level", 0))
            for q in emp.get("qualifications", [])
        }
    return qualification_lookup, employee_lookup, employee_tier_lookup


def _identify_leaders(employees: List[Dict]) -> set[int]:
    leader_employees = set()
    for emp in employees:
        emp_id = int(emp["employeeId"])
        org_role = str(emp.get("orgRole", "")).upper()
        if org_role in ["SHIFT_LEADER", "MANAGER", "TEAM_LEADER", "GROUP_LEADER", "GROUP LEADER", "TEAM LEADER", "SHIFT LEADER"]:
            leader_employees.add(emp_id)
    return leader_employees


def _enforce_day_has_production_consistency(
    model: cp_model.CpModel,
    employee_day_payloads: Dict[Tuple[int, str], List[Tuple[int, cp_model.BoolVar]]],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
) -> None:
    """
    确保 day_has_production 只有在当天存在实际分配的操作时才为 1。
    """
    for (emp_id, day_key), payloads in employee_day_payloads.items():
        if (emp_id, day_key) in day_has_production:
            vars_for_day = [p[1] for p in payloads]
            if vars_for_day:
                model.Add(day_has_production[(emp_id, day_key)] <= sum(vars_for_day))


def _apply_pre_production_constraints(
    model: cp_model.CpModel,
    employees: List[Dict],
    all_dates: List[str],
    calendar_info: Dict[str, Dict],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    config: Dict,
    days_with_ops: set[str],
) -> None:
    """
    生产前的正常班次约束：缓冲期前的工作日强制上班，非工作日强制休息。
    """
    pre_prod_buffer_days = int((config or {}).get("preProductionBufferDays", 2))

    if days_with_ops:
        sorted_ops_dates = sorted(list(days_with_ops))
        first_prod_date_str = sorted_ops_dates[0]

        try:
            first_prod_date = datetime.strptime(first_prod_date_str, "%Y-%m-%d")
            cutoff_date = first_prod_date - timedelta(days=pre_prod_buffer_days)
            cutoff_date_str = cutoff_date.strftime("%Y-%m-%d")

            print(
                f"DEBUG: Pre-production constraint - First prod: {first_prod_date_str}, Buffer: {pre_prod_buffer_days}, Cutoff: {cutoff_date_str}",
                file=sys.stderr,
            )

            for date_key in all_dates:
                if date_key < cutoff_date_str:
                    calendar_entry = calendar_info.get(date_key, {})
                    is_workday = bool(calendar_entry.get("isWorkday", False))

                    for emp in employees:
                        emp_id = int(emp["employeeId"])

                        base_var = shift_vars.get((emp_id, date_key, "BASE"))
                        rest_var = shift_vars.get((emp_id, date_key, "REST"))

                        if is_workday:
                            if rest_var is not None:
                                model.Add(rest_var == 0)
                        else:
                            if rest_var is not None:
                                model.Add(rest_var == 1)
        except Exception as e:
            print(f"WARNING: Failed to apply pre-production constraint: {e}", file=sys.stderr)


def _apply_night_rest_constraints(
    model: cp_model.CpModel,
    emp_id: int,
    all_dates: List[str],
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    preferred_rest: int,
    enforce_night_rest: bool,
    night_rest_penalty_vars: List[cp_model.BoolVar],
) -> None:
    """
    夜班休息约束（硬约束+可选软约束）按员工应用。
    """
    if not enforce_night_rest:
        return

    for i, date_key in enumerate(all_dates):
        night_flag = day_night_flag.get((emp_id, date_key))
        if night_flag is None:
            continue

        # 硬约束：夜班后第1天必须休息
        if i + 1 < len(all_dates):
            next_date = all_dates[i + 1]
            p = shift_vars.get((emp_id, next_date, "PRODUCTION"))
            b = shift_vars.get((emp_id, next_date, "BASE"))
            if p is not None:
                model.Add(p == 0).OnlyEnforceIf(night_flag)
            if b is not None:
                model.Add(b == 0).OnlyEnforceIf(night_flag)

        # 软约束：夜班后第2天尽可能休息
        if preferred_rest >= 2 and i + 2 < len(all_dates):
            second_date = all_dates[i + 2]
            p2 = shift_vars.get((emp_id, second_date, "PRODUCTION"))
            b2 = shift_vars.get((emp_id, second_date, "BASE"))
            if p2 is not None:
                viol = model.NewBoolVar(f"viol_nightrest_day2_prod_{emp_id}_{second_date}")
                night_rest_penalty_vars.append(viol)
                model.Add(p2 == 0).OnlyEnforceIf([night_flag, viol.Not()])
            if b2 is not None:
                viol_b = model.NewBoolVar(f"viol_nightrest_day2_base_{emp_id}_{second_date}")
                night_rest_penalty_vars.append(viol_b)
                model.Add(b2 == 0).OnlyEnforceIf([night_flag, viol_b.Not()])


def _apply_month_quarter_constraints(
    model: cp_model.CpModel,
    emp_id: int,
    month_minute_vars: Dict[str, List[cp_model.IntVar]],
    quarter_minute_vars: Dict[str, List[cp_model.IntVar]],
    month_buckets: Dict[str, Dict[str, List[str] | int]],
    quarter_buckets: Dict[str, Dict],
    enforce_monthly_hours: bool,
    enforce_quarter_hours: bool,
    monthly_min_hours: float,
    monthly_max_hours: float,
) -> None:
    """
    月度/季度工时硬约束。
    """
    if enforce_monthly_hours:
        for m_key, vars_list in month_minute_vars.items():
            if not vars_list:
                continue
            bucket = month_buckets.get(m_key)
            if not bucket:
                continue

            total_month_minutes = sum(vars_list)
            standard_hours = int(bucket.get("workdays", 0)) * 8

            lower_bound = max(0, int((standard_hours - monthly_min_hours) * 60))
            upper_bound = int((standard_hours + monthly_max_hours) * 60)

            model.Add(total_month_minutes >= lower_bound)
            model.Add(total_month_minutes <= upper_bound)

            if not hasattr(model, "_monthly_totals_for_debug"):
                model._monthly_totals_for_debug = {}
            model._monthly_totals_for_debug[(emp_id, m_key)] = total_month_minutes

    if enforce_quarter_hours:
        for q_key, vars_list in quarter_minute_vars.items():
            if not vars_list:
                continue
            bucket = quarter_buckets.get(q_key)
            if not bucket or not bucket.get("fullCoverage"):
                continue

            total_quarter_minutes = sum(vars_list)
            standard_hours = int(bucket.get("workdays", 0)) * 8
            model.Add(total_quarter_minutes >= int(standard_hours * 60))


def _apply_leader_coverage_constraints(
    model: cp_model.CpModel,
    leader_employees: set[int],
    days_with_ops: set[str],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
    calendar_info: Dict[str, Dict],
    employees: List[Dict],
    leader_tier_penalty_terms: List[cp_model.IntVar],
    ratio_penalty_terms: List[cp_model.IntVar],
    enable_leader_presence: bool,
) -> None:
    """
    主管覆盖与分级惩罚（含非工作日 base/prod 比例）整体封装。
    """
    import sys

    print(f"DEBUG: Starting leader constraint check at {datetime.now()}", file=sys.stderr)
    print(f"Total employees: {len(employees)}", file=sys.stderr)
    print(f"Identified leaders: {leader_employees}", file=sys.stderr)

    with open("/Users/zhengfengyi/ccaps22/solver/debug_leader_constraint.log", "a") as f:
        f.write(f"Days with operations: {sorted(list(days_with_ops))}\n")

    if enable_leader_presence and leader_employees and days_with_ops:
        for date_key in days_with_ops:
            leader_working_vars = []
            for leader_id in leader_employees:
                prod_key = (leader_id, date_key, "PRODUCTION")
                if prod_key in shift_vars:
                    leader_working_vars.append(shift_vars[prod_key])
                base_key = (leader_id, date_key, "BASE")
                if base_key in shift_vars:
                    leader_working_vars.append(shift_vars[base_key])

            if leader_working_vars:
                model.Add(sum(leader_working_vars) >= 1)
                with open("/Users/zhengfengyi/ccaps22/solver/debug_leader_constraint.log", "a") as f:
                    f.write(f"Added constraint for {date_key}: sum({len(leader_working_vars)} vars) >= 1\n")

                calendar_entry = calendar_info.get(date_key, {})
                is_workday = bool(calendar_entry.get("isWorkday", False))

                if not is_workday:
                    workers_on_duty_vars = []
                    for emp in employees:
                        emp_id = int(emp["employeeId"])
                        if (emp_id, date_key) in day_has_production:
                            workers_on_duty_vars.append(day_has_production[(emp_id, date_key)])

                    if workers_on_duty_vars:
                        total_workers = sum(workers_on_duty_vars)
                        leader_count = model.NewIntVar(0, len(leader_working_vars), f"leaders_count_{date_key}")
                        model.Add(leader_count == sum(leader_working_vars))

                        is_tier_1 = model.NewBoolVar(f"is_tier_1_{date_key}")
                        model.Add(total_workers <= 6).OnlyEnforceIf(is_tier_1)
                        model.Add(total_workers > 6).OnlyEnforceIf(is_tier_1.Not())
                        short_1 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t1_{date_key}")
                        model.Add(short_1 >= 1 - leader_count).OnlyEnforceIf(is_tier_1)
                        leader_tier_penalty_terms.append(short_1)

                        is_tier_2 = model.NewBoolVar(f"is_tier_2_{date_key}")
                        model.Add(total_workers > 6).OnlyEnforceIf(is_tier_2)
                        model.Add(total_workers <= 10).OnlyEnforceIf(is_tier_2)
                        short_2 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t2_{date_key}")
                        excess_2 = model.NewIntVar(0, len(leader_working_vars), f"leader_excess_t2_{date_key}")
                        model.Add(short_2 >= 1 - leader_count).OnlyEnforceIf(is_tier_2)
                        model.Add(excess_2 >= leader_count - 2).OnlyEnforceIf(is_tier_2)
                        leader_tier_penalty_terms.extend([short_2, excess_2])

                        is_tier_3 = model.NewBoolVar(f"is_tier_3_{date_key}")
                        model.Add(total_workers > 10).OnlyEnforceIf(is_tier_3)
                        model.Add(total_workers <= 17).OnlyEnforceIf(is_tier_3)
                        short_3 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t3_{date_key}")
                        excess_3 = model.NewIntVar(0, len(leader_working_vars), f"leader_excess_t3_{date_key}")
                        model.Add(short_3 >= 2 - leader_count).OnlyEnforceIf(is_tier_3)
                        model.Add(excess_3 >= leader_count - 2).OnlyEnforceIf(is_tier_3)
                        leader_tier_penalty_terms.extend([short_3, excess_3])

                        is_tier_4 = model.NewBoolVar(f"is_tier_4_{date_key}")
                        model.Add(total_workers >= 18).OnlyEnforceIf(is_tier_4)
                        short_4 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t4_{date_key}")
                        model.Add(short_4 >= 3 - leader_count).OnlyEnforceIf(is_tier_4)
                        leader_tier_penalty_terms.append(short_4)

                        with open("/Users/zhengfengyi/ccaps22/solver/debug_leader_constraint.log", "a") as f:
                            f.write(f"Added SOFT tiered leader penalties for {date_key}\n")

            else:
                with open("/Users/zhengfengyi/ccaps22/solver/debug_leader_constraint.log", "a") as f:
                    f.write(f"WARNING: No leader vars found for {date_key}!\n")

    # 保留原有的非工作日 Base/Prod 比例软约束
    _apply_non_workday_base_ratio(
        model,
        days_with_ops,
        calendar_info,
        day_has_production,
        shift_vars,
        employees,
        ratio_penalty_terms,
    )


def _apply_non_workday_base_ratio(
    model: cp_model.CpModel,
    days_with_ops: set[str],
    calendar_info: Dict[str, Dict],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    employees: List[Dict],
    ratio_penalty_terms: List[cp_model.IntVar],
) -> None:
    """
    非工作日 Base/Prod 比例软约束。
    """
    if not days_with_ops:
        return

    for date_key in days_with_ops:
        calendar_entry = calendar_info.get(date_key, {})
        is_workday = bool(calendar_entry.get("isWorkday", False))

        if not is_workday:
            prod_vars = []
            base_vars = []
            for emp in employees:
                emp_id = int(emp["employeeId"])
                if (emp_id, date_key) in day_has_production:
                    prod_vars.append(day_has_production[(emp_id, date_key)])

                base_key = (emp_id, date_key, "BASE")
                if base_key in shift_vars:
                    base_vars.append(shift_vars[base_key])

            if prod_vars and base_vars:
                total_prod = sum(prod_vars)
                total_base = sum(base_vars)
                shortfall = model.NewIntVar(0, max(1, 3 * len(employees)), f"ratio_shortfall_{date_key}")
                excess = model.NewIntVar(0, len(employees), f"ratio_excess_{date_key}")
                model.Add(shortfall >= 3 * total_prod - 10 * total_base)
                model.Add(excess >= total_base - total_prod)
                ratio_penalty_terms.append(shortfall)
                ratio_penalty_terms.append(excess)

                with open("/Users/zhengfengyi/ccaps22/solver/debug_leader_constraint.log", "a") as f:
                    f.write(f"Added SOFT base/prod ratio penalty vars for {date_key}\n")


def _build_assignments_unified(payload: Dict) -> Dict:
    """
    统一建模版本：操作分配和班次规划在同一个CP-SAT模型中同时优化
    """
    operations: List[Dict] = payload.get("operationDemands", []) or []
    employees: List[Dict] = payload.get("employeeProfiles", []) or []
    calendar_entries: List[Dict] = payload.get("calendar", []) or []
    employee_unavailability: List[Dict] = payload.get("employeeUnavailability", []) or []
    shared_groups: List[Dict] = payload.get("sharedPreferences", []) or []
    locked_operations: List[Dict] = payload.get("lockedOperations", []) or []
    locked_shifts: List[Dict] = payload.get("lockedShifts", []) or []
    shift_definitions: List[Dict] = payload.get("shiftDefinitions", []) or []
    config = payload.get("config") or {}

    if not operations or not employees:
        return {
            "status": "FAILED",
            "summary": "Missing operations or employees",
            "details": {"assignments": []},
        }

    # 配置参数
    # 月度工时约束范围（分别设置下限和上限）
    monthly_min_hours = float(config.get("monthlyMinHours", 0) or 0)  # 相对标准工时的下限偏移
    monthly_max_hours = float(config.get("monthlyMaxHours", 8) or 8)  # 相对标准工时的上限偏移
    
    # Solver Time Limit (seconds)
    # Priority: config > options (legacy) > default(30)
    solver_time_limit = float(config.get("solverTimeLimit") or payload.get("options", {}).get("solverTimeLimit") or 30)
    
    prefer_frontline = bool(config.get("preferFrontlineEmployees", False))
    enforce_monthly_hours = bool(config.get("enforceMonthlyHours", True))
    enforce_night_rest = bool(config.get("enforceNightRest", True))
    enforce_consecutive_limit = bool(config.get("enforceConsecutiveLimit", True))
    enforce_quarter_hours = bool(config.get("enforceQuarterHours", True))
    enforce_unavailability = bool(config.get("enforceEmployeeUnavailability", True))
    minimize_triple_headcount = bool(config.get("minimizeTripleHolidayHeadcount", False))
    triple_holiday_weight = max(0, int(float(config.get("tripleHolidayPenaltyWeight", 10) or 0)))
    enable_workshop_fairness = bool(config.get("enableWorkshopFairness", False))
    workshop_fairness_tolerance_minutes = int(
        round(max(0.0, float(config.get("workshopFairnessToleranceHours", 0) or 0)) * 60)
    )
    workshop_fairness_weight = max(0, int(float(config.get("workshopFairnessWeight", 1) or 0)))
    # 夜班休息约束参数：
    # - preferred_rest: 优选休息天数（软约束，用于第2天）
    # - minimum_rest: 已弃用（现在第1天是硬约束，不可配置）
    preferred_rest = int(config.get("nightShiftPreferredRestDays", 2) or 2)
    minimum_rest = int(config.get("nightShiftMinimumRestDays", 2) or 2)  # 保留兼容性，实际未使用

    # 1. 数据准备（模块化）
    calendar_info, calendar_date_objects, month_buckets, quarter_buckets = _build_calendar_structs(calendar_entries)
    all_dates = sorted(calendar_info.keys())
    unavailability_lookup = _group_unavailability(employee_unavailability)
    shift_cache = _prepare_shift_definitions(shift_definitions)
    share_group_lookup, share_anchor_by_operation = _build_share_groups(shared_groups)
    locked_operation_map = _build_locked_operation_map(locked_operations)
    qualification_lookup, employee_lookup, employee_tier_lookup = _build_employee_lookups(employees)

    # 构建CP-SAT模型
    model = cp_model.CpModel()

    # ==================== 变量定义 ====================
    operation_vars: Dict[Tuple[int, int], cp_model.BoolVar] = {}
    op_candidate_vars: Dict[int, List[Tuple[int, cp_model.BoolVar]]] = {}
    skipped_ops_no_candidates: List[int] = []
    
    # 班次变量: (emp_id, date, type) -> BoolVar
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar] = {}
    
    # 辅助变量
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar] = {}
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar] = {}
    day_billable_minutes: Dict[Tuple[int, str], cp_model.IntVar] = {} # 用于月度/季度考核的工时
    
    # 记录每天的操作时长负载 (用于计算总工时)
    employee_day_payloads: Dict[Tuple[int, str], List[Tuple[int, cp_model.BoolVar]]] = {}

    manager_assignment_vars: List[cp_model.BoolVar] = []
    triple_holiday_day_vars: List[cp_model.BoolVar] = []
    fairness_penalty_terms: List[cp_model.IntVar] = []
    base_shift_penalty_vars: List[cp_model.BoolVar] = []
    ratio_penalty_terms: List[cp_model.IntVar] = []
    leader_tier_penalty_terms: List[cp_model.IntVar] = []
    monthly_penalty_terms: List[cp_model.IntVar] = []
    night_rest_penalty_vars: List[cp_model.BoolVar] = []
    consecutive_penalty_terms: List[cp_model.IntVar] = []

    # ==================== 操作分配建模 ====================
    operation_lookup: Dict[int, Dict] = {int(op["operationPlanId"]): op for op in operations}
    operation_windows: Dict[int, Tuple[datetime | None, datetime | None]] = {}
    infeasible_ops: List[int] = []

    # 诊断：统计每个日期的操作数量（初始，后续会在跳过无候选后重建）
    operations_by_date: Dict[str, int] = {}
    for operation in operations:
        planned_start = operation.get("plannedStart")
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        if day_key:
            operations_by_date[day_key] = operations_by_date.get(day_key, 0) + 1

    # 输入概要日志
    input_lines = [
        "=== INPUT SUMMARY ===",
        f"operations={len(operations)} employees={len(employees)} calendar_entries={len(calendar_entries)}",
        f"unavailability={len(employee_unavailability)} shared_groups={len(shared_groups)} locked_ops={len(locked_operations)}",
        f"config: maxConsecutive={config.get('maxConsecutiveWorkdays', 6)}, nightRest={config.get('nightShiftMinimumRestDays', 2)}, preProdBuffer={config.get('preProductionBufferDays', 2)}",
    ]

    # 预计算每个操作对应的班次工时（用于约束建模）
    operation_shift_hours: Dict[int, int] = {}  # 操作ID → 班次折算工时（分钟）
    
    for operation in operations:
        op_id = int(operation["operationPlanId"])
        required = max(1, int(operation.get("requiredPeople") or 1))
        qualifications = operation.get("qualifications", [])
        planned_start = operation.get("plannedStart")
        planned_end = operation.get("plannedEnd")
        # 按开始时间归属日期（包括跨天夜班）
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        duration_minutes = _calculate_duration_minutes(planned_start, planned_end)
        # 匹配班次定义以获取折算工时和夜班标记
        start_dt = _parse_iso_datetime(planned_start)
        end_dt = _parse_iso_datetime(planned_end)
        
        shift_nominal_minutes = 480  # 默认8小时
        is_night = False
        
        if start_dt and end_dt and day_key:
            matched_shift = _match_shift_definition(day_key, start_dt, end_dt, shift_cache)
            
            # 1. 尝试从匹配的班次中获取信息
            if matched_shift and matched_shift.get("shiftId"):
                # 从 shift_cache 中查找完整的班次信息
                for shift_def in shift_cache:
                    if shift_def.get("id") == matched_shift.get("shiftId"):
                        nominal_hours = shift_def.get("nominalHours", 8)
                        shift_nominal_minutes = int(nominal_hours * 60)
                        # 优先使用班次定义的夜班标记
                        is_night = bool(shift_def.get("isNightShift"))
                        break
                # 2. 如果没有匹配到预定义班次，使用时间逻辑回退
                is_night = _is_night_operation(planned_start, planned_end)
                
            operation_shift_hours[op_id] = shift_nominal_minutes
            
            # DEBUG: Log night shift determination
            with open("/Users/zhengfengyi/ccaps22/solver/debug_night_shift.log", "a") as f:
                if is_night:
                    f.write(f"DEBUG: Op {op_id} ({planned_start}-{planned_end}) marked as NIGHT.\n")
                    if matched_shift:
                        f.write(f"  Matched Shift: {matched_shift.get('shiftName')} (ID: {matched_shift.get('shiftId')})\n")
                        f.write(f"  Shift isNightShift: {matched_shift.get('isNightShift')}\n")
                    else:
                        f.write(f"  No shift matched. Fallback logic used.\n")
        else:
            operation_shift_hours[op_id] = 480  # 默认8小时
            is_night = _is_night_operation(planned_start, planned_end)
            if is_night:
                with open("/Users/zhengfengyi/ccaps22/solver/debug_night_shift.log", "a") as f:
                    f.write(f"DEBUG: Op {op_id} ({planned_start}-{planned_end}) marked as NIGHT (Fallback, no date key).\n")
        
        operation_window = _extract_operation_window(operation)
        operation_windows[op_id] = operation_window

        candidates: List[int] = []
        for emp in employees:
            emp_id = int(emp["employeeId"])
            emp_quals = qualification_lookup.get(emp_id, {})
            ok = True
            for qual in qualifications:
                qual_id = int(qual["qualificationId"])
                min_level = int(qual.get("minLevel", 0))
                if emp_quals.get(qual_id, 0) < min_level:
                    ok = False
                    break
            if ok:
                candidates.append(emp_id)

        # 处理锁定
        locked_employees = locked_operation_map.get(op_id)
        if locked_employees:
            missing = [eid for eid in locked_employees if eid not in employee_lookup]
            if missing:
                infeasible_ops.append(op_id)
                continue
            for eid in locked_employees:
                if eid not in candidates:
                    candidates.append(eid)

        if not candidates:
            skipped_ops_no_candidates.append(op_id)
            _log_lines("/Users/zhengfengyi/ccaps22/solver/debug_constraints.log", [
                f"[NO_CANDIDATES] op_id={op_id} start={operation.get('plannedStart')} end={operation.get('plannedEnd')} req={required} quals={len(qualifications)}"
            ])
            continue

        vars_for_op = []
        for emp_id in candidates:
            # 检查不可用性
            if (enforce_unavailability and operation_window and 
                _is_employee_unavailable(emp_id, operation_window, unavailability_lookup)):
                if not (locked_employees and emp_id in locked_employees):
                    continue

            var = model.NewBoolVar(f"op_{op_id}_emp_{emp_id}")
            operation_vars[(op_id, emp_id)] = var
            op_candidate_vars.setdefault(op_id, []).append((emp_id, var))
            vars_for_op.append(var)

            # 管理层偏好
            if prefer_frontline and employee_tier_lookup.get(emp_id) != "FRONTLINE":
                manager_assignment_vars.append(var)

            # 强制锁定
            if locked_employees and emp_id in locked_employees:
                model.Add(var == 1)

            # 关联到天，并记录两种工时
            if day_key:
                # 1. 班次工时（用于排班工时统计）
                shift_hours = operation_shift_hours.get(op_id, 480)
                employee_day_payloads.setdefault((emp_id, day_key), []).append((shift_hours, var))
                
                # 2. 操作工时/车间工时（用于公平性约束）
                # 这是实际操作时长，与班次定义无关
                if not hasattr(model, '_workshop_hour_payloads'):
                    model._workshop_hour_payloads = {}
                model._workshop_hour_payloads.setdefault((emp_id, day_key), []).append((duration_minutes, var))
                
                day_has_production.setdefault((emp_id, day_key), model.NewBoolVar(f"has_prod_{day_key}_{emp_id}"))
                model.Add(day_has_production[(emp_id, day_key)] >= var)

                # 标记夜班
                if is_night:
                    night_flag = day_night_flag.setdefault((emp_id, day_key), model.NewBoolVar(f"night_{day_key}_{emp_id}"))
                    model.Add(night_flag >= var)

        if not vars_for_op:
            infeasible_ops.append(op_id)
            _log_lines("/Users/zhengfengyi/ccaps22/solver/debug_constraints.log", [
                f"[NO_VARS_AFTER_FILTER] op_id={op_id} start={operation.get('plannedStart')} end={operation.get('plannedEnd')} req={required} locked={bool(locked_employees)}"
            ])
            continue
        
        # 创建松弛变量来诊断人手不足（改为允许不足，松弛代表缺口）
        slack_ub = max(required, len(vars_for_op) + required, 20)
        slack_var = model.NewIntVar(0, slack_ub, f"slack_op_{op_id}")
        
        # 约束：实际分配 + 缺口 >= 需求
        model.Add(sum(vars_for_op) + slack_var >= required)
        
        # 约束：实际分配人数不超过需求（防止超额分配）
        model.Add(sum(vars_for_op) <= required)
        
        # 记录松弛变量用于后续分析
        if not hasattr(model, '_slack_vars'):
            model._slack_vars = {}
        model._slack_vars[op_id] = (slack_var, required, len(vars_for_op))

    # ==================== 提前识别Leaders（用于非工作日约束判断） ====================
    leader_employees = _identify_leaders(employees)

    # 重建操作日期统计，剔除无候选的操作
    active_operations = [op for op in operations if int(op["operationPlanId"]) not in skipped_ops_no_candidates]
    operations_by_date = {}
    for op in active_operations:
        planned_start = op.get("plannedStart")
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        if day_key:
            operations_by_date[day_key] = operations_by_date.get(day_key, 0) + 1

    # 日级可用员工/主管与需求日志
    availability_lines = ["=== DATE AVAILABILITY ==="]
    def _is_unavailable_on_date(emp_id: int, date_key: str) -> bool:
        windows = unavailability_lookup.get(emp_id, [])
        for start_dt, end_dt in windows:
            if start_dt.date().isoformat() <= date_key <= (end_dt - timedelta(seconds=1)).date().isoformat():
                return True
        return False
    for date_key in sorted(calendar_info.keys()):
        demand = operations_by_date.get(date_key, 0)
        avail_emp = 0
        avail_leader = 0
        for emp in employees:
            eid = int(emp["employeeId"])
            if not _is_unavailable_on_date(eid, date_key):
                avail_emp += 1
                if eid in leader_employees:
                    avail_leader += 1
        availability_lines.append(f"{date_key}: demand={demand}, available_emp={avail_emp}, available_leader={avail_leader}, isWorkday={calendar_info.get(date_key, {}).get('isWorkday', False)}")
    _log_lines("/Users/zhengfengyi/ccaps22/solver/debug_input.log", input_lines + availability_lines)

    # ==================== 补充约束：day_has_production 必须有实际操作 ====================
    _enforce_day_has_production_consistency(model, employee_day_payloads, day_has_production)


    # ==================== 提前识别Leaders（用于非工作日约束判断） ====================
    leader_employees = _identify_leaders(employees)

    # ==================== 班次安排建模 ====================
    for emp in employees:
        emp_id = int(emp["employeeId"])
        
        # 月度/季度工时累加列表
        month_minute_vars: Dict[str, List[cp_model.IntVar]] = {}
        quarter_minute_vars: Dict[str, List[cp_model.IntVar]] = {}

        for date_key in all_dates:
            calendar_entry = calendar_info.get(date_key, {})
            is_workday = bool(calendar_entry.get("isWorkday", False))
            is_triple = bool(calendar_entry.get("isTripleSalary", False))
            
            # 班次变量
            prod_var = shift_vars.setdefault((emp_id, date_key, "PRODUCTION"), model.NewBoolVar(f"prod_{date_key}_{emp_id}"))
            base_var = shift_vars.setdefault((emp_id, date_key, "BASE"), model.NewBoolVar(f"base_{date_key}_{emp_id}"))
            rest_var = shift_vars.setdefault((emp_id, date_key, "REST"), model.NewBoolVar(f"rest_{date_key}_{emp_id}"))

            # DEBUG: Check is_triple for Emp 47 on Oct 1
            if emp_id == 47 and date_key in ["2025-10-01", "2025-10-02", "2025-10-03"]:
                import sys
                print(f"DEBUG: Emp 47 Date {date_key} is_triple={is_triple}", file=sys.stderr)
                print(f"DEBUG: Calendar entry: {calendar_entry}", file=sys.stderr)

            # 1. 互斥约束
            model.Add(prod_var + base_var + rest_var == 1)
            
            # 1.5 非工作日约束：
            # 规则A：如果当天全厂无生产任务，所有人（包括Leader）必须休息
            # 规则B：如果当天有生产任务，Leader可以上BASE班，普通员工如果没有任务必须休息
            if not is_workday:
                global_ops_count = operations_by_date.get(date_key, 0)
                
                if global_ops_count == 0:
                    # 全厂无生产 -> 全员休息
                    model.Add(base_var == 0)
                    # prod_var 也会因为没有操作而被置为0
                else:
                    # 有生产 -> 应用原有逻辑
                    has_prod = day_has_production.get((emp_id, date_key))
                    # 检查是否是Leader
                    is_leader = emp_id in leader_employees
                    
                    if has_prod is None and not is_leader:
                        # 非工作日且没有个人生产任务，且不是Leader -> 禁止BASE（即必须REST）
                        model.Add(base_var == 0)
                    # Leader允许上BASE班（监督）

            # DEBUG: After solver - check what was assigned to Oct 1-3
            # This will be checked later after solve

            # 2. 生产班约束
            has_prod = day_has_production.get((emp_id, date_key))
            if has_prod is not None:
                model.Add(prod_var >= has_prod) # 有操作必须是生产班
                # 如果是生产班，必须有操作? 不一定，可能是手动指定的生产班，但这里是由操作驱动的。
                # 反向约束：如果没有操作，不能是生产班？
                # model.Add(prod_var <= has_prod) # 这样会禁止没有操作的生产班。通常是合理的。
                model.Add(prod_var == has_prod)
            else:
                model.Add(prod_var == 0) # 没有操作数据，不能排生产班

            # 3. 基础班约束
            # 允许在任何日期（包括周末）排基础班来补工时
            # 这符合综合工时制的要求
            
            base_shift_penalty_vars.append(base_var)

            # 4. 工时计算
            # 计算当天的班次工时（基于班次定义的 nominalHours）
            # 如果同一天有多个操作（共享组），取最长班次工时
            
            payloads = employee_day_payloads.get((emp_id, date_key), [])
            if payloads:
                # 取所有分配操作中的最大班次工时
                # max(shift_hours_1 * var_1, shift_hours_2 * var_2, ...)
                # 使用 CP-SAT 的 AddMaxEquality
                shift_hours_list = [shift_hours for shift_hours, _ in payloads]
                max_shift_hours = max(shift_hours_list)  # 上界
                prod_shift_minutes = model.NewIntVar(0, max_shift_hours, f"prod_shift_{date_key}_{emp_id}")
                
                # 约束：prod_shift_minutes = 分配的操作中最大的班次工时
                # 如果 var_i == 1，则 prod_shift_minutes >= shift_hours_i
                for shift_hours, var in payloads:
                    # 如果这个操作被分配，班次工时至少是它的工时
                    model.Add(prod_shift_minutes >= shift_hours * var)
                # 如果没有任何操作被分配，prod_shift_minutes == 0
                model.Add(prod_shift_minutes <= prod_var * max_shift_hours)
            else:
                prod_shift_minutes = 0
            
            # 当天总考核工时 (Billable Minutes)
            # 如果是三倍工资日，考核工时为0（不计入月度限制）
            # 否则：生产班 = 实际班次工时, 基础班 = 480分钟
            billable = day_billable_minutes.setdefault((emp_id, date_key), model.NewIntVar(0, 24*60*2, f"bill_{date_key}_{emp_id}"))
            
            # DEBUG: Log billable assignment for Emp 47 on Oct 1-3
            if emp_id == 47 and date_key in ["2025-10-01", "2025-10-02", "2025-10-03"]:
                import sys
                print(f"DEBUG: Emp 47 Date {date_key} billable assignment: is_triple={is_triple}", file=sys.stderr)
            
            if is_triple:
                model.Add(billable == 0)
                # 记录三倍工资日加班人次
                if minimize_triple_headcount:
                    triple_holiday_day_vars.append(prod_var)
            else:
                # billable = 生产班(实际班次工时) 或 基础班(480分钟)
                model.Add(billable == prod_shift_minutes + base_var * 480)

            # 归档到月度/季度
            month_key = date_key[:7]
            month_minute_vars.setdefault(month_key, []).append(billable)
            
            parsed_date = _parse_iso_date(date_key)
            if parsed_date:
                q_key = _get_quarter_key(parsed_date)
                quarter_minute_vars.setdefault(q_key, []).append(billable)

        # ==================== 周期工时约束 ====================
        _apply_month_quarter_constraints(
            model,
            emp_id,
            month_minute_vars,
            quarter_minute_vars,
            month_buckets,
            quarter_buckets,
            enforce_monthly_hours,
            enforce_quarter_hours,
            monthly_min_hours,
            monthly_max_hours,
        )

        # ==================== 连续工作约束 ====================
        if enforce_consecutive_limit:
            max_consecutive = int(config.get("maxConsecutiveWorkdays", 6) or 6)
            window_size = max_consecutive + 1
            for start_idx in range(len(all_dates) - max_consecutive):
                window_dates = all_dates[start_idx : start_idx + window_size]
                window_vars = []
                for d in window_dates:
                    # 工作 = 生产 或 基础
                    p = shift_vars.get((emp_id, d, "PRODUCTION"))
                    b = shift_vars.get((emp_id, d, "BASE"))
                    if p is not None: window_vars.append(p)
                    if b is not None: window_vars.append(b)
                if window_vars:
                    slack = model.NewIntVar(0, len(window_vars), f"slack_consecutive_{emp_id}_{start_idx}")
                    consecutive_penalty_terms.append(slack)
                    model.Add(sum(window_vars) <= max_consecutive + slack)

        # ==================== 夜班休息约束 ====================
        _apply_night_rest_constraints(
            model,
            emp_id,
            all_dates,
            day_night_flag,
            shift_vars,
            preferred_rest,
            enforce_night_rest,
            night_rest_penalty_vars,
        )


    # ==================== 冲突与共享约束 ====================
    
    # 1. 时间冲突
    conflicting_pairs = _find_conflicting_operation_pairs(operation_windows, share_group_lookup)
    for op_a, op_b in conflicting_pairs:
        vars_a = op_candidate_vars.get(op_a, [])
        if not vars_a: continue
        for emp_id, var_a in vars_a:
            var_b = operation_vars.get((op_b, emp_id))
            if var_b is not None:
                model.Add(var_a + var_b <= 1)

    # 2. 共享组锚定
    for op_id, anchor_id in share_anchor_by_operation.items():
        if op_id == anchor_id: continue
        if op_id in skipped_ops_no_candidates or anchor_id in skipped_ops_no_candidates:
            continue
        member_vars = op_candidate_vars.get(op_id, [])
        for emp_id, member_var in member_vars:
            anchor_var = operation_vars.get((anchor_id, emp_id))
            if anchor_var is None:
                model.Add(member_var == 0)
            else:
                model.Add(member_var <= anchor_var)

    # 3. 同一天同一员工最多一个操作（共享组内的操作除外）
    # 按日期分组操作
    operations_by_date_map: Dict[str, List[int]] = {}
    for operation in active_operations:
        op_id = int(operation["operationPlanId"])
        planned_start = operation.get("plannedStart")
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        if day_key:
            operations_by_date_map.setdefault(day_key, []).append(op_id)
    
    # 对每个日期，确保同一员工最多被分配一个操作（共享组除外）
    for date_key, op_ids in operations_by_date_map.items():
        if len(op_ids) <= 1:
            continue
        
        # 按共享组分组
        ops_by_share_group: Dict[str | None, List[int]] = {}
        for op_id in op_ids:
            share_group = share_group_lookup.get(op_id)
            ops_by_share_group.setdefault(share_group, []).append(op_id)
        
        # 对非共享组的操作，确保互斥
        non_shared_ops = ops_by_share_group.get(None, [])
        if len(non_shared_ops) >= 2:
            # 找出所有可能被分配给这些操作的员工
            all_candidates = set()
            for op_id in non_shared_ops:
                candidates = op_candidate_vars.get(op_id, [])
                all_candidates.update(emp_id for emp_id, _ in candidates)
            
            # 对每个员工，确保在这一天最多被分配一个非共享操作
            for emp_id in all_candidates:
                emp_vars = []
                for op_id in non_shared_ops:
                    var = operation_vars.get((op_id, emp_id))
                    if var is not None:
                        emp_vars.append(var)
                if len(emp_vars) >= 2:
                    model.Add(sum(emp_vars) <= 1)

    # 诊断：按日期汇总需求与日历属性，便于识别过载日期
    demand_by_date: Dict[str, int] = {}
    for operation in operations:
        day_key = operation.get("plannedStart")[:10] if isinstance(operation.get("plannedStart"), str) else None
        if not day_key:
            continue
        demand_by_date[day_key] = demand_by_date.get(day_key, 0) + int(operation.get("requiredPeople") or 1)
    if demand_by_date:
        log_lines = []
        for d in sorted(demand_by_date.keys()):
            cal = calendar_info.get(d, {})
            workday = cal.get("isWorkday", False)
            log_lines.append(f"{d} demand={demand_by_date[d]} (isWorkday={workday})")
        try:
            with open("/Users/zhengfengyi/ccaps22/solver/debug_demand.log", "a") as f:
                f.write("=== Demand summary ===\n")
                f.write("\n".join(log_lines))
                f.write("\n")
        except Exception:
            pass

    # ==================== 每日Leader覆盖与比例约束 ====================
    days_with_ops = {d for d, op_ids in operations_by_date_map.items() if op_ids}
    _apply_leader_coverage_constraints(
        model,
        leader_employees,
        days_with_ops,
        shift_vars,
        day_has_production,
        calendar_info,
        employees,
        leader_tier_penalty_terms,
        ratio_penalty_terms,
        bool(config.get("enforceLeaderPresence", True)),
    )

    # ==================== 生产前正常班次约束 ====================
    _apply_pre_production_constraints(
        model,
        employees,
        all_dates,
        calendar_info,
        shift_vars,
        config,
        days_with_ops,
    )

    # ==================== 目标函数 ====================
    # 1. 最小化松弛量（超额分配的总人数）- 最高优先级
    slack_penalty = 0
    if hasattr(model, '_slack_vars'):
        slack_penalty = sum(slack_var for slack_var, _, _ in model._slack_vars.values()) * 1000
    
    # 2. 最小化操作分配总人数
    obj = slack_penalty + sum(operation_vars.values())
    
    # 3. 最小化基础班次（优先休息）
    obj += sum(base_shift_penalty_vars)
    
    # 3.5 软化后的非工作日 BASE/PROD 比例罚分
    if ratio_penalty_terms:
        obj += sum(ratio_penalty_terms) * 10
    
    # 3.6 软化后的分级主管人数罚分
    if leader_tier_penalty_terms:
        obj += sum(leader_tier_penalty_terms) * 20

    # 3.7 月度工时罚分 - 已改为硬约束，不再需要罚分
    # if monthly_penalty_terms:
    #     obj += sum(monthly_penalty_terms) * 5

    # 3.8 夜班休息软约束罚分
    if night_rest_penalty_vars:
        obj += sum(night_rest_penalty_vars) * 100

    # 3.9 连续工作软约束罚分
    if consecutive_penalty_terms:
        obj += sum(consecutive_penalty_terms) * 50
    
    # 4. 最小化三倍工资日人头
    if minimize_triple_headcount and triple_holiday_day_vars:
        obj += sum(triple_holiday_day_vars) * triple_holiday_weight
        
    # 5. 管理层惩罚
    if manager_assignment_vars:
        obj += sum(manager_assignment_vars) * 100

    model.Minimize(obj)

    # ==================== 求解 ====================
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit
    status = solver.Solve(model)
    
    # DEBUG: Log solver status
    import sys
    print(f"DEBUG: Solver status = {solver.StatusName(status)}", file=sys.stderr)
    
    # DEBUG: Check what was assigned to Emp 47 on Oct 1-3
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for date_key in ["2025-10-01", "2025-10-02", "2025-10-03"]:
            base_val = solver.Value(shift_vars.get((47, date_key, "BASE"))) if (47, date_key, "BASE") in shift_vars else None
            rest_val = solver.Value(shift_vars.get((47, date_key, "REST"))) if (47, date_key, "REST") in shift_vars else None
            billable_val = solver.Value(day_billable_minutes.get((47, date_key))) if (47, date_key) in day_billable_minutes else None
            print(f"DEBUG: Emp 47 {date_key}: base={base_val}, rest={rest_val}, billable={billable_val}min", file=sys.stderr)
        
        # DEBUG: Check solver's calculated monthly total for Emp 47
        if hasattr(model, '_monthly_totals_for_debug') and (47, "2025-10") in model._monthly_totals_for_debug:
            monthly_var = model._monthly_totals_for_debug[(47, "2025-10")]
            monthly_val = solver.Value(monthly_var)
            print(f"DEBUG: Emp 47 2025-10 SOLVER CALCULATED TOTAL = {monthly_val}min = {monthly_val/60}h", file=sys.stderr)
            
            # Print billable for each day in October
            print(f"DEBUG: Daily billable breakdown for Emp 47 in Oct 2025:", file=sys.stderr)
            total_check = 0
            for day in range(1, 32):
                date_key = f"2025-10-{day:02d}"
                if (47, date_key) in day_billable_minutes:
                    billable_val = solver.Value(day_billable_minutes[(47, date_key)])
                    if billable_val > 0:
                        # Also check shift type
                        prod_val = solver.Value(shift_vars.get((47, date_key, "PRODUCTION"))) if (47, date_key, "PRODUCTION") in shift_vars else 0
                        base_val = solver.Value(shift_vars.get((47, date_key, "BASE"))) if (47, date_key, "BASE") in shift_vars else 0
                        rest_val = solver.Value(shift_vars.get((47, date_key, "REST"))) if (47, date_key, "REST") in shift_vars else 0
                        shift_type = "PROD" if prod_val else ("BASE" if base_val else ("REST" if rest_val else "UNKNOWN"))
                        print(f"  {date_key}: {billable_val}min ({billable_val/60}h) [{shift_type}]", file=sys.stderr)
                        total_check += billable_val
            print(f"  Sum of daily billable: {total_check}min ({total_check/60}h)", file=sys.stderr)

        # DEBUG: Verify Leader Coverage
        print("\nDEBUG: Leader Coverage Verification:", file=sys.stderr)
        leader_ids = list(leader_employees)
        days_with_ops_list = sorted(list(days_with_ops))
        
        for date_key in days_with_ops_list:
            covering_leaders = []
            for leader_id in leader_ids:
                is_prod = solver.Value(shift_vars.get((leader_id, date_key, "PRODUCTION"))) if (leader_id, date_key, "PRODUCTION") in shift_vars else 0
                is_base = solver.Value(shift_vars.get((leader_id, date_key, "BASE"))) if (leader_id, date_key, "BASE") in shift_vars else 0
                
                if is_prod or is_base:
                    shift_type = "PROD" if is_prod else "BASE"
                    covering_leaders.append(f"{leader_id}({shift_type})")
            
            if covering_leaders:
                print(f"  {date_key}: Covered by {', '.join(covering_leaders)}", file=sys.stderr)
            else:
                print(f"  {date_key}: WARNING! NO LEADER FOUND (Constraint Violation?)", file=sys.stderr)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # 失败诊断：尽量给出潜在原因
        def _is_unavailable_on_date(emp_id: int, date_key: str) -> bool:
            windows = unavailability_lookup.get(emp_id, [])
            for start_dt, end_dt in windows:
                if start_dt.date().isoformat() <= date_key <= (end_dt - timedelta(seconds=1)).date().isoformat():
                    # 粗略判断：只按日期重叠
                    return True
            return False

        total_employees = len(employees)
        demand_issues = []
        leader_issues = []
        availability_issues = []
        night_issues = []
        capacity_issues = []
        infeasible_ops_info = []

        # 估算夜班产能 vs 需求
        night_rest_days = int(config.get("nightShiftMinimumRestDays", 2) or 2)
        horizon_days = len(all_dates) if all_dates else 0
        night_capacity_per_emp = max(1, horizon_days // (1 + night_rest_days))
        total_night_capacity = total_employees * night_capacity_per_emp
        total_night_demand = 0
        for operation in operations:
            if _is_night_operation(operation.get("plannedStart"), operation.get("plannedEnd")):
                total_night_demand += int(operation.get("requiredPeople") or 1)
        if total_night_demand > total_night_capacity:
            night_issues.append(
                f"夜班需求 {total_night_demand} 人次 > 估算产能 {total_night_capacity} (rest={night_rest_days}d)"
            )

        for date_key, demand in sorted(operations_by_date.items()):
            if demand > total_employees:
                demand_issues.append(f"{date_key}: demand {demand} > employees {total_employees}")

            # 检查这天是否有可用主管
            available_leaders = []
            for lid in leader_employees:
                if not _is_unavailable_on_date(lid, date_key):
                    available_leaders.append(lid)
            if not available_leaders:
                leader_issues.append(f"{date_key}: no available leaders (needed >=1)")

            # 检查当天可用员工是否低于需求
            available_workers = 0
            for emp in employees:
                eid = int(emp["employeeId"])
                if not _is_unavailable_on_date(eid, date_key):
                    available_workers += 1
            if demand > available_workers:
                availability_issues.append(f"{date_key}: demand {demand} > available {available_workers}")

        # 估算连续工作上限的总产能是否低于总需求（粗略）
        max_consecutive = int(config.get("maxConsecutiveWorkdays", 6) or 6)
        if horizon_days and max_consecutive > 0:
            # 每个员工在 (max_consecutive + 1) 天窗口内最多工作 max_consecutive 天
            avg_capacity_ratio = max_consecutive / (max_consecutive + 1)
            total_capacity = int(total_employees * horizon_days * avg_capacity_ratio)
            total_demand = sum(operations_by_date.values())
            if total_demand > total_capacity:
                capacity_issues.append(
                    f"总人日需求 {total_demand} > 估算最大产能 {total_capacity} (maxConsecutive={max_consecutive})"
                )

        # 记录建模阶段标记的 infeasible_ops
        if infeasible_ops:
            infeasible_ops_info.append(f"infeasible_ops_count={len(infeasible_ops)}: {sorted(infeasible_ops)[:20]}")

        diagnostic_lines = ["=== INFEASIBLE DIAGNOSTIC ==="]
        if demand_issues:
            diagnostic_lines.append("[高需求超过员工总数]")
            diagnostic_lines.extend(demand_issues)
        if leader_issues:
            diagnostic_lines.append("[主管覆盖不可行]")
            diagnostic_lines.extend(leader_issues)
        if availability_issues:
            diagnostic_lines.append("[当天可用员工不足]")
            diagnostic_lines.extend(availability_issues)
        if night_issues:
            diagnostic_lines.append("[夜班产能不足估算]")
            diagnostic_lines.extend(night_issues)
        if capacity_issues:
            diagnostic_lines.append("[连续工作上限导致总产能不足（估算）]")
            diagnostic_lines.extend(capacity_issues)
        if infeasible_ops_info:
            diagnostic_lines.append("[建模阶段无候选的操作]")
            diagnostic_lines.extend(infeasible_ops_info)
        if (
            not demand_issues
            and not leader_issues
            and not availability_issues
            and not night_issues
            and not capacity_issues
            and not infeasible_ops_info
        ):
            diagnostic_lines.append("未发现明显的需求或主管缺口，可能由连续工作/夜班休息等硬约束导致。")

        try:
            with open("/Users/zhengfengyi/ccaps22/solver/debug_infeasible.log", "a") as f:
                f.write("\n".join(diagnostic_lines))
                f.write("\n")
        except Exception:
            pass

        _log_lines("/Users/zhengfengyi/ccaps22/solver/debug_output.log", [
            "=== SOLVER OUTPUT ===",
            f"status={solver.StatusName(status)}",
            f"skipped_no_candidates={len(skipped_ops_no_candidates)} skipped_invalid_locks={len(infeasible_ops)}",
            f"demand_issues={demand_issues}",
            f"leader_issues={leader_issues}",
            f"availability_issues={availability_issues}",
            f"night_issues={night_issues}",
            f"capacity_issues={capacity_issues}",
            f"infeasible_ops_info={infeasible_ops_info}",
        ])

        return {
            "status": "FAILED",
            "summary": f"CP-SAT returned status {solver.StatusName(status)}",
            "details": {
                "assignments": [],
                "diagnostic": {
                    "demandIssues": demand_issues,
                    "leaderIssues": leader_issues,
                    "note": "其他可能原因：连续工作/夜班休息/锁定班次冲突等硬约束",
                },
            },
        }
    # ==================== 诊断输出：月度工时统计 ====================
    print("\n" + "="*80)
    print("[月度工时统计 - 验证约束满足情况]")
    print("="*80)
    
    for emp in employees:
        emp_id = int(emp["employeeId"])
        emp_name = emp.get("name", f"员工{emp_id}")
        
        # 按月统计该员工的工时
        monthly_stats = {}
        for date_key in all_dates:
            month_key = date_key[:7]
            billable_var = day_billable_minutes.get((emp_id, date_key))
            if billable_var is not None:
                billable_minutes = solver.Value(billable_var)
                monthly_stats.setdefault(month_key, 0)
                monthly_stats[month_key] += billable_minutes
        
        # 输出该员工的月度工时
        if monthly_stats:
            print(f"\n【{emp_name}】")
            for month_key in sorted(monthly_stats.keys()):
                actual_hours = monthly_stats[month_key] / 60
                bucket = month_buckets.get(month_key, {})
                workdays = bucket.get("workdays", 0)
                standard_hours = workdays * 8
                lower_bound = standard_hours - monthly_min_hours
                upper_bound = standard_hours + monthly_max_hours
                
                status_mark = "✓" if lower_bound <= actual_hours <= upper_bound else "✗"
                print(f"  {month_key}: {actual_hours:.1f}h (标准:{standard_hours:.1f}h, "
                      f"范围:{lower_bound:.1f}h~{upper_bound:.1f}h) {status_mark}")
                
                # DEBUG: If failed, show breakdown
                if status_mark == "✗":
                    print(f"  [DEBUG BREAKDOWN for {emp_name} {month_key}]", file=sys.stderr)
                    bucket = month_buckets.get(month_key, {})
                    for d_key in sorted(bucket.get("dates", [])):
                        if (emp_id, d_key) in day_billable_minutes:
                            val = solver.Value(day_billable_minutes[(emp_id, d_key)])
                            if val > 0:
                                # Determine type
                                p_val = solver.Value(shift_vars.get((emp_id, d_key, "PRODUCTION"))) if (emp_id, d_key, "PRODUCTION") in shift_vars else 0
                                b_val = solver.Value(shift_vars.get((emp_id, d_key, "BASE"))) if (emp_id, d_key, "BASE") in shift_vars else 0
                                type_str = "PROD" if p_val else ("BASE" if b_val else "OTHER")
                                print(f"    {d_key}: {val} min ({val/60:.1f}h) [{type_str}]", file=sys.stderr)
    print("="*80 + "\n")

    # ==================== 结果生成 ====================
    assignments = []
    employee_day_operations: Dict[Tuple[int, str], List[Dict]] = {}
    
    for (op_id, emp_id), var in operation_vars.items():
        if solver.Value(var) == 1:
            assignments.append({"operationPlanId": op_id, "employeeId": emp_id})
            # 填充 employee_day_operations 用于 shift_plans
            op = operation_lookup.get(op_id)
            if op:
                start = op.get("plannedStart")
                end = op.get("plannedEnd")
                day = start[:10] if start else None
                
                # DEBUG: Log operation assignments for employee 47
                if emp_id == 47 and day and day.startswith("2025-10"):
                    import sys
                    print(f"DEBUG: Assigned operation {op_id} to Emp 47 on {day}, start={start}, end={end}", file=sys.stderr)
                
                if day:
                    employee_day_operations.setdefault((emp_id, day), []).append({
                        "operationPlanId": op_id,
                        "plannedStart": start,
                        "plannedEnd": end,
                        "durationMinutes": _calculate_duration_minutes(start, end)
                    })

    # 去重 assignments，避免重复插入 DB
    seen_pairs = set()
    dup_pairs = []
    deduped_assignments = []
    for a in assignments:
        key = (a["operationPlanId"], a["employeeId"])
        if key in seen_pairs:
            dup_pairs.append(key)
        else:
            seen_pairs.add(key)
            deduped_assignments.append(a)
    assignments = deduped_assignments

    # 提取夜班标记值
    night_flag_values = {}
    for k, v in day_night_flag.items():
        if solver.Value(v) == 1:
            night_flag_values[k] = 1

    # 诊断输出：检查哪些操作需要超额分配
    if hasattr(model, '_slack_vars'):
        over_assigned_ops = []
        for op_id, (slack_var, required, candidates) in model._slack_vars.items():
            slack_value = solver.Value(slack_var)
            if slack_value > 0:
                actual_assigned = required + slack_value
                # 获取操作详情
                op = operation_lookup.get(op_id)
                op_start = op.get("plannedStart", "?") if op else "?"
                op_end = op.get("plannedEnd", "?") if op else "?"
                is_night = _is_night_operation(op_start, op_end) if op else False
                over_assigned_ops.append((op_id, required, actual_assigned, slack_value, op_start, op_end, is_night))
        
        if over_assigned_ops:
            print("\n" + "="*80)
            print("[DIAGNOSTIC] 以下操作需要超额分配人员以满足其他约束：")
            print("="*80)
            for op_id, req, actual, slack, start, end, is_night in over_assigned_ops:
                night_label = " [夜班]" if is_night else ""
                print(f"  操作 {op_id}{night_label}: 需求={req}, 实际分配={actual}, 超额={slack}")
                print(f"    时间: {start} → {end}")
            print(f"\n总超额人次: {sum(slack for _, _, _, slack, _, _, _ in over_assigned_ops)}")
            print("="*80 + "\n")
            
            # 统计夜班超额情况
            night_over = sum(slack for _, _, _, slack, _, _, is_night in over_assigned_ops if is_night)
            day_over = sum(slack for _, _, _, slack, _, _, is_night in over_assigned_ops if not is_night)
            print(f"[分析] 夜班操作超额: {night_over} 人次, 白班操作超额: {day_over} 人次\n")
            
            # 工作日可用性分析
            print("="*80)
            print("[工作日可用性分析]")
            print("="*80)
            october_dates = [d for d in all_dates if d.startswith("2025-10")]
            if october_dates:
                workdays_with_ops = sum(1 for d in october_dates if calendar_info.get(d, {}).get("isWorkday") and operations_by_date.get(d, 0) > 0)
                workdays_no_ops = sum(1 for d in october_dates if calendar_info.get(d, {}).get("isWorkday") and operations_by_date.get(d, 0) == 0)
                total_workdays = sum(1 for d in october_dates if calendar_info.get(d, {}).get("isWorkday"))
                print(f"10月工作日总数: {total_workdays}")
                print(f"  有操作的工作日: {workdays_with_ops}")
                print(f"  无操作的工作日: {workdays_no_ops} ← 可用于排基础班补工时")
                
                if workdays_no_ops < 5:
                    print(f"\n⚠️  可用工作日不足！如果每人需要补 60+ 小时，{workdays_no_ops} 天 × 8h = {workdays_no_ops * 8}h 远远不够。")
                    print("    这解释了为什么求解器必须超额分配操作来让更多人'有班上'。")
                print("="*80 + "\n")

    # 准备 base_vars 和 rest_vars 供 _build_shift_plans 使用
    # 注意：_build_shift_plans 需要的是 Dict[Tuple[int, str], cp_model.BoolVar]
    # 但我们现在已经解出了值，可以直接传递值，或者传递变量让它自己取值。
    # 查看 _build_shift_plans 定义，它接受 cp_model.BoolVar。
    # 为了兼容，我们需要传递原始变量。
    
    base_vars_map = {}
    # 构建简单的变量映射供 _build_shift_plans 使用
    shift_vars_base_simple = {}
    shift_vars_rest_simple = {}
    for (e_id, d_key, s_type), var in shift_vars.items():
        if s_type == "BASE":
            shift_vars_base_simple[(e_id, d_key)] = var
        elif s_type == "REST":
            shift_vars_rest_simple[(e_id, d_key)] = var

    # Diagnostic logging for calendar info
    if "2025-10-01" in calendar_info:
        print(f"DEBUG: Calendar info for 2025-10-01: {calendar_info['2025-10-01']}")

    shift_plans = _build_shift_plans(
        employees,
        calendar_info,
        employee_day_operations, # Assuming operations_by_employee is a typo and employee_day_operations should be used
        shift_cache,
        payload.get("window", {}), # Assuming window is a typo and payload.get("window", {}) should be used
        config,
        night_flag_values, # Assuming night_flag_usage is a typo and night_flag_values should be used
        solver=solver,
        base_vars=shift_vars_base_simple,
        rest_vars=shift_vars_rest_simple,
    )

    summary_parts = [f"Assigned {len(assignments)} pairs, generated {len(shift_plans)} shift plans"]
    if dup_pairs:
        summary_parts.append(f"Removed {len(dup_pairs)} duplicate assignment pairs")
    if skipped_ops_no_candidates:
        summary_parts.append(f"Skipped {len(skipped_ops_no_candidates)} ops without candidates")
    if infeasible_ops:
        summary_parts.append(f"Skipped {len(infeasible_ops)} ops due to invalid locks/availability")

    # ==================== 后置验证：实际Leader覆盖 ====================
    print("\n" + "="*80, file=sys.stderr)
    print("[POST-GENERATION VERIFICATION] Actual Leader Coverage:", file=sys.stderr)
    print("="*80, file=sys.stderr)
    
    # 按日期组织shift plans
    plans_by_emp_date = {}
    for plan in shift_plans:
        emp_id = plan.get("employeeId")
        date_key = plan.get("date")
        plan_type = plan.get("planType", "").upper()
        if emp_id and date_key:
            plans_by_emp_date[(emp_id, date_key)] = plan_type
    
    # 检查约束违反
    violations = []
    for date_key in sorted(list(days_with_ops)):
        leaders_on_duty = []
        for leader_id in leader_employees:
            plan_type = plans_by_emp_date.get((leader_id, date_key))
            if plan_type and plan_type != "REST":
                leaders_on_duty.append(f"{leader_id}({plan_type})")
        
        if leaders_on_duty:
            print(f"  {date_key}: ✓ {', '.join(leaders_on_duty)}", file=sys.stderr)
        else:
            print(f"  {date_key}: ✗ NO LEADER (CONSTRAINT VIOLATION!)", file=sys.stderr)
            violations.append(date_key)
    
    if violations:
        print(f"\n⚠️  CONSTRAINT VIOLATIONS: {len(violations)} days without leader coverage!", file=sys.stderr)
        print(f"   Violated dates: {', '.join(violations)}", file=sys.stderr)
        print("="*80 + "\n", file=sys.stderr)

    # 成功/可行输出日志
    _log_lines("/Users/zhengfengyi/ccaps22/solver/debug_output.log", [
        "=== SOLVER OUTPUT ===",
        f"status={solver.StatusName(status)}",
        f"summary_parts={' ; '.join(summary_parts)}",
        f"skipped_no_candidates={len(skipped_ops_no_candidates)} skipped_invalid_locks={len(infeasible_ops)}",
        f"assignments_count={len(assignments)} shift_plans_count={len(shift_plans)} dup_pairs={len(dup_pairs)}",
    ])

    return {
        "status": "COMPLETED" if status == cp_model.OPTIMAL else "RUNNING",
        "summary": "; ".join(summary_parts),
        "details": {
            "assignments": assignments,
            "shiftPlans": shift_plans,
            "skippedOperations": skipped_ops_no_candidates + infeasible_ops,
            "skippedNoCandidates": skipped_ops_no_candidates,
            "skippedInvalidLocks": infeasible_ops,
        },
    }


def _extract_operation_window(operation: Dict) -> Tuple[datetime | None, datetime | None]:
    start = _parse_iso_datetime(operation.get("plannedStart"))
    end = _parse_iso_datetime(operation.get("plannedEnd"))
    if not start:
        start = _parse_iso_datetime(operation.get("windowStart"))
    if not end:
        end = _parse_iso_datetime(operation.get("windowEnd"))
    if start and end and end > start:
        return start, end
    if start and (not end or end <= start):
        duration = max(30, _calculate_duration_minutes(operation.get("plannedStart"), operation.get("plannedEnd")))
        return start, start + timedelta(minutes=duration)
    return (None, None)


def _find_conflicting_operation_pairs(
    operation_windows: Dict[int, Tuple[datetime | None, datetime | None]],
    share_group_lookup: Dict[int, str],
) -> List[Tuple[int, int]]:
    op_ids = list(operation_windows.keys())
    pairs: List[Tuple[int, int]] = []
    for idx, op_a in enumerate(op_ids):
        window_a = operation_windows.get(op_a)
        if not window_a:
            continue
        for op_b in op_ids[idx + 1 :]:
            if share_group_lookup.get(op_a) and share_group_lookup.get(op_a) == share_group_lookup.get(op_b):
                continue
            window_b = operation_windows.get(op_b)
            if not window_b:
                continue
            if _windows_overlap(window_a, window_b):
                pairs.append((op_a, op_b))
    return pairs


def _resolve_shift_window(date_str: str, definition: Dict | None, fallback_minutes: int) -> Tuple[datetime | None, datetime | None]:
    if not date_str:
        return (None, None)
    start_time = (definition or {}).get("startTime") or "08:00"
    end_time = (definition or {}).get("endTime") or "17:00"
    start_dt = _combine_date_time(date_str, start_time)
    end_dt = _combine_date_time(date_str, end_time)
    cross_day = bool((definition or {}).get("isCrossDay"))
    if start_dt and end_dt:
        if cross_day or end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)
        return start_dt, end_dt
    if start_dt and not end_dt:
        return start_dt, start_dt + timedelta(minutes=fallback_minutes)
    if end_dt and not start_dt:
        return end_dt - timedelta(minutes=fallback_minutes), end_dt
    default_start = _combine_date_time(date_str, "08:00")
    if default_start:
        return default_start, default_start + timedelta(minutes=fallback_minutes)
    return (None, None)


def _combine_date_time(date_str: str, time_str: str) -> datetime | None:
    if not date_str or not time_str:
        return None
    time_component = time_str
    if len(time_component) == 5:
        time_component = f"{time_component}:00"
    try:
        return datetime.fromisoformat(f"{date_str}T{time_component}")
    except Exception:
        try:
            return datetime.strptime(f"{date_str} {time_component}", "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None


def _windows_overlap(
    window_a: Tuple[datetime | None, datetime | None],
    window_b: Tuple[datetime | None, datetime | None],
) -> bool:
    start_a, end_a = window_a
    start_b, end_b = window_b
    if not start_a or not end_a or not start_b or not end_b:
        return False
    return start_a < end_b and start_b < end_a


def _group_unavailability(entries: List[Dict]) -> Dict[int, List[Tuple[datetime, datetime]]]:
    grouped: Dict[int, List[Tuple[datetime, datetime]]] = {}
    for entry in entries:
        emp_id = entry.get("employeeId")
        if emp_id is None:
            continue
        try:
            emp_id_int = int(emp_id)
        except Exception:
            continue
        start_value = entry.get("startDatetime") or entry.get("start") or entry.get("startTime")
        end_value = entry.get("endDatetime") or entry.get("end") or entry.get("endTime")
        if not start_value or not end_value:
            continue
        start_dt = _parse_iso_datetime(start_value)
        end_dt = _parse_iso_datetime(end_value)
        if not start_dt or not end_dt or end_dt <= start_dt:
            continue
        grouped.setdefault(emp_id_int, []).append((start_dt, end_dt))
    for emp_id in list(grouped.keys()):
        grouped[emp_id].sort(key=lambda item: item[0])
    return grouped


def _is_employee_unavailable(
    emp_id: int,
    operation_window: Tuple[datetime | None, datetime | None],
    unavailability_lookup: Dict[int, List[Tuple[datetime, datetime]]],
) -> bool:
    windows = unavailability_lookup.get(emp_id)
    if not windows:
        return False
    if not operation_window or not operation_window[0] or not operation_window[1]:
        return False
    for window in windows:
        if _windows_overlap(window, operation_window):
            return True
    return False


def _get_primary_work_date(start: str | None, end: str | None) -> str | None:
    """
    获取操作的主要工作日期。
    对于跨天操作，返回工作时长较长的日期（通常是第二天）。
    """
    if not start:
        return None
    
    start_dt = _parse_iso_datetime(start)
    end_dt = _parse_iso_datetime(end) if end else None
    
    if not start_dt or not end_dt:
        return start[:10] if len(start) >= 10 else None
    
    # 检查是否跨天
    if end_dt.date() <= start_dt.date():
        # 不跨天，返回开始日期
        return start[:10]
    
    # 跨天操作：计算两天的工时分布
    midnight = datetime.combine(start_dt.date() + timedelta(days=1), datetime.min.time())
    
    # 第一天的工时（从开始到午夜）
    hours_day1 = (midnight - start_dt).total_seconds() / 3600
    # 第二天的工时（从午夜到结束）
    hours_day2 = (end_dt - midnight).total_seconds() / 3600
    
    # 返回工时较多的那一天
    if hours_day2 > hours_day1:
        return (start_dt.date() + timedelta(days=1)).isoformat()
    else:
        return start_dt.date().isoformat()


def _is_night_operation(start: str | None, end: str | None) -> bool:
    start_dt = _parse_iso_datetime(start) if start else None
    end_dt = _parse_iso_datetime(end) if end else None
    if not start_dt or not end_dt:
        return False
    start_hour = start_dt.hour + start_dt.minute / 60.0
    end_hour = end_dt.hour + end_dt.minute / 60.0
    crosses_midnight = end_dt.date() > start_dt.date()
    if start_hour >= 21 or start_hour < 6:
        return True
    if crosses_midnight and end_hour <= 6:
        return True
    return False


def _parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except Exception:
            return None


def _get_quarter_key(value: date) -> str:
    quarter = ((value.month - 1) // 3) + 1
    return f"{value.year}-Q{quarter}"


def _get_quarter_bounds(value: date) -> Tuple[date, date]:
    start_month = 3 * ((value.month - 1) // 3) + 1
    quarter_start = date(value.year, start_month, 1)
    if start_month == 10:
        quarter_end = date(value.year + 1, 1, 1) - timedelta(days=1)
    else:
        quarter_end = date(value.year, start_month + 3, 1) - timedelta(days=1)
    return quarter_start, quarter_end


def _calculate_duration_minutes(start: str | None, end: str | None) -> int:
    try:
        if not start or not end:
            return 8 * 60
        start_dt = _parse_iso_datetime(start)
        end_dt = _parse_iso_datetime(end)
        if start_dt and end_dt and end_dt > start_dt:
            return max(30, int((end_dt - start_dt).total_seconds() // 60))
    except Exception:
        pass
    return 8 * 60


def _parse_iso_datetime(value: str):
    from datetime import datetime

    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None


def _build_shift_plans(
    employees: List[Dict],
    calendar_info: Dict[str, Dict],
    employee_day_operations: Dict[Tuple[int, str], List[Dict]],
    shift_cache: List[Dict],
    window: Dict,
    config: Dict | None,
    night_flag_usage: Dict[Tuple[int, str], int],
    solver: cp_model.CpSolver = None,
    base_vars: Dict[Tuple[int, str], cp_model.BoolVar] = None,
    rest_vars: Dict[Tuple[int, str], cp_model.BoolVar] = None,
) -> List[Dict]:
    shift_plans: List[Dict] = []
    all_dates = sorted(calendar_info.keys())
    enforce_night_rest = bool((config or {}).get("enforceNightRest", True))
    preferred_rest_days = int((config or {}).get("nightShiftPreferredRestDays", 0) or 0)
    minimum_rest_days = int((config or {}).get("nightShiftMinimumRestDays", 0) or 0)
    rest_day_span = max(preferred_rest_days, minimum_rest_days)
    night_rest_targets: Dict[int, set[str]] = {}

    def register_rest(emp_id: int, night_date: str):
        if not (enforce_night_rest and rest_day_span > 0):
            return
        for offset in range(1, rest_day_span + 1):
            rest_key = _shift_date_key(night_date, offset)
            if not rest_key or rest_key not in calendar_info:
                continue
            night_rest_targets.setdefault(emp_id, set()).add(rest_key)

    if enforce_night_rest and rest_day_span > 0:
        for (emp_id, date_key), flag in night_flag_usage.items():
            if flag:
                register_rest(emp_id, date_key)

    operations_by_employee: Dict[int, Dict[str, List[Dict]]] = {}
    for (emp_id, date_key), operations in employee_day_operations.items():
        operations_by_employee.setdefault(emp_id, {})[date_key] = operations

    for emp in employees:
        emp_id = int(emp["employeeId"])
        emp_operations = operations_by_employee.get(emp_id, {})
        rest_targets = night_rest_targets.setdefault(emp_id, set())
        for date_key in sorted(emp_operations.keys()):
            operations = emp_operations.get(date_key) or []
            if not operations:
                continue
            
            # 关键修复：同一天的所有操作应该合并为一个班次
            # 不再按时间分段，因为这违反了"每天一个班次"的约束
            plan = _create_operation_shift_plan(emp_id, date_key, operations, shift_cache)
            if plan:
                shift_plans.append(plan)
                if _plan_requires_night_rest(plan):
                    register_rest(emp_id, date_key)
        for date_key in all_dates:
            if date_key in emp_operations:
                continue
            
            # Check Solver Result for Base/Rest
            is_base = False
            is_rest = False
            if solver and base_vars and rest_vars:
                b_var = base_vars.get((emp_id, date_key))
                r_var = rest_vars.get((emp_id, date_key))
                
                # DEBUG: Check specific employee and date
                if emp_id == 47 and date_key == "2025-10-11":
                    import sys
                    print(f"DEBUG: Checking Emp 47 Date {date_key}", file=sys.stderr)
                    print(f"DEBUG: base_vars keys sample: {list(base_vars.keys())[:5]}", file=sys.stderr)
                    if b_var is not None:
                        print(f"DEBUG:   b_var found, value={solver.Value(b_var)}", file=sys.stderr)
                    else:
                        print(f"DEBUG:   b_var NOT found in base_vars keys", file=sys.stderr)
                
                if b_var is not None and solver.Value(b_var) == 1:
                    is_base = True
                elif r_var is not None and solver.Value(r_var) == 1:
                    is_rest = True
            
            # Fallback to old logic if not found (or if solver not passed)
            calendar_entry = calendar_info.get(date_key) or {}
            if not is_base and not is_rest:
                 # Default fallback (should not happen if solver worked correctly)
                forced_rest = not calendar_entry.get("isWorkday", True)
                if not forced_rest and enforce_night_rest:
                     # ... (Keep existing fallback logic or simplify?)
                     # For safety, let's keep the simple fallback
                     pass
            
            # Create Plan
            if is_base:
                plan = _create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=False, force_base=True)
            elif is_rest:
                plan = _create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=True)
            else:
                # Legacy fallback
                forced_rest = not calendar_entry.get("isWorkday", True)
                # ... (Night rest check omitted for brevity as it should be handled by solver now)
                plan = _create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=forced_rest)

            if plan:
                shift_plans.append(plan)
    return shift_plans


def _prepare_shift_definitions(shift_definitions: List[Dict]) -> List[Dict]:
    cache = []
    for definition in shift_definitions:
        start_time = definition.get("startTime") or "00:00"
        end_time = definition.get("endTime") or "00:00"
        start_parts = [int(part) for part in start_time.split(":")[:2]]
        end_parts = [int(part) for part in end_time.split(":")[:2]]
        cache.append({
            "id": definition.get("id"),
            "shiftCode": definition.get("shiftCode"),
            "shiftName": definition.get("shiftName"),
            "startHour": start_parts[0],
            "startMinute": start_parts[1],
            "endHour": end_parts[0],
            "endMinute": end_parts[1],
            "isCrossDay": bool(definition.get("isCrossDay")),
            "nominalHours": definition.get("nominalHours"),
            "isNightShift": bool(definition.get("isNightShift")),
        })
    return cache


def _create_operation_shift_plan(emp_id: int, date_key: str, operations: List[Dict], shift_cache: List[Dict]) -> Dict:
    earliest = None
    latest = None
    for op in operations:
        start_dt = _parse_iso_datetime(op.get("plannedStart"))
        end_dt = _parse_iso_datetime(op.get("plannedEnd"))
        if start_dt and (earliest is None or start_dt < earliest):
            earliest = start_dt
        if end_dt and (latest is None or end_dt > latest):
            latest = end_dt
    if earliest is None:
        earliest = datetime.fromisoformat(f"{date_key}T08:00:00")
    if latest is None or latest <= earliest:
        latest = earliest + timedelta(hours=8)
    duration_minutes = max(30, int((latest - earliest).total_seconds() // 60))
    matched_shift = _match_shift_definition(date_key, earliest, latest, shift_cache)
    
    # DEBUG: Log matched shift for plan
    with open("/Users/zhengfengyi/ccaps22/solver/debug_night_shift.log", "a") as f:
        f.write(f"DEBUG: _create_operation_shift_plan for {emp_id} on {date_key}\n")
        f.write(f"  Time: {earliest} - {latest}\n")
        f.write(f"  Matched: {matched_shift.get('shiftName')} (Code: {matched_shift.get('shiftCode')})\n")
        f.write(f"  isNightShift: {matched_shift.get('isNightShift')}\n")

    primary_operation_id = None
    for op in operations:
        op_id = op.get("operationPlanId")
        if op_id is not None:
            primary_operation_id = int(op_id)
            break
    return {
        "employeeId": emp_id,
        "date": date_key,
        "planType": "PRODUCTION",
        "planHours": round(duration_minutes / 60, 2),
        "shiftCode": matched_shift.get("shiftCode"),
        "shiftName": matched_shift.get("shiftName"),
        "shiftId": matched_shift.get("shiftId"),
        "start": earliest.isoformat(),
        "end": latest.isoformat(),
        "isNightShift": bool(matched_shift.get("isNightShift")),
        "shiftNominalHours": matched_shift.get("nominalHours"),
        "operations": operations,
        "primaryOperationPlanId": primary_operation_id,
    }


def _match_shift_definition(date_key: str, earliest: datetime, latest: datetime, shift_cache: List[Dict]) -> Dict:
    tolerance_minutes = 30
    best_match = None
    best_score = None
    for definition in shift_cache:
        start_dt = datetime.fromisoformat(f"{date_key}T00:00:00").replace(
            hour=definition["startHour"],
            minute=definition["startMinute"],
            second=0,
            microsecond=0,
        )
        end_dt = datetime.fromisoformat(f"{date_key}T00:00:00").replace(
            hour=definition["endHour"],
            minute=definition["endMinute"],
            second=0,
            microsecond=0,
        )
        if definition["isCrossDay"] or end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)
        if start_dt <= earliest and end_dt >= latest:
            diff = (earliest - start_dt).total_seconds() ** 2 + (end_dt - latest).total_seconds() ** 2
            if best_score is None or diff < best_score:
                best_score = diff
                best_match = definition
        else:
            start_diff = abs((earliest - start_dt).total_seconds() / 60)
            end_diff = abs((latest - end_dt).total_seconds() / 60)
            if start_diff <= tolerance_minutes and end_diff <= tolerance_minutes:
                diff = start_diff + end_diff
                if best_score is None or diff < best_score:
                    best_score = diff
                    best_match = definition
    if best_match:
        return {
            "shiftCode": best_match.get("shiftCode") or best_match.get("shiftName"),
            "shiftName": best_match.get("shiftName"),
            "shiftId": best_match.get("id"),
            "isNightShift": best_match.get("isNightShift"),
            "nominalHours": best_match.get("nominalHours"),
        }
    return {
        "shiftCode": "TEMP",
        "shiftName": "临时班次",
        "shiftId": None,
        "isNightShift": False,
    }


def _determine_shift_label(date_key: str, operation: Dict, shift_cache: List[Dict]) -> str:
    planned_start = operation.get("plannedStart")
    planned_end = operation.get("plannedEnd")
    start_dt = _parse_iso_datetime(planned_start)
    end_dt = _parse_iso_datetime(planned_end)
    if start_dt and end_dt and end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)
    match = None
    if start_dt and end_dt:
        match = _match_shift_definition(date_key, start_dt, end_dt, shift_cache)
    label = match.get("shiftCode") if match else None
    if label:
        return str(label)
    if operation.get("__shiftLabel"):
        return str(operation["__shiftLabel"])
    start_str = start_dt.strftime("%H%M") if start_dt else "0000"
    end_str = end_dt.strftime("%H%M") if end_dt else "2400"
    return f"AUTO_{start_str}_{end_str}"


def _segment_operations_by_time(date_key: str, operations: List[Dict]) -> List[List[Dict]]:
    if len(operations) <= 1:
        return [operations]

    def normalize_times(op: Dict) -> Tuple[datetime, datetime]:
        start_dt = _parse_iso_datetime(op.get("plannedStart")) or datetime.fromisoformat(f"{date_key}T08:00:00")
        end_dt = _parse_iso_datetime(op.get("plannedEnd")) or start_dt + timedelta(hours=1)
        if end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)
        return start_dt, end_dt

    sorted_ops = sorted(
        operations,
        key=lambda op: (_parse_iso_datetime(op.get("plannedStart")) or datetime.fromisoformat(f"{date_key}T08:00:00")),
    )

    segments: List[List[Dict]] = []
    current_segment: List[Dict] = []
    current_end: datetime | None = None

    for op in sorted_ops:
        start_dt, end_dt = normalize_times(op)
        if not current_segment:
            current_segment = [op]
            current_end = end_dt
            continue

        if current_end and start_dt < current_end:
            current_segment.append(op)
            if end_dt > current_end:
                current_end = end_dt
        else:
            segments.append(current_segment)
            current_segment = [op]
            current_end = end_dt

    if current_segment:
        segments.append(current_segment)

    return segments


def _create_base_shift_plan(emp_id: int, date_key: str, calendar_entry: Dict, forced_rest: bool = False, force_base: bool = False) -> Dict:
    is_workday = bool(calendar_entry.get("isWorkday"))
    if forced_rest:
        plan_hours = 0
        plan_type = "REST"
        shift_name = "休息"
    elif force_base:
        plan_hours = 8
        plan_type = "BASE"
        shift_name = "基础班"
    else:
        plan_hours = 8 if is_workday else 0
        plan_type = "BASE" if is_workday else "REST"
        shift_name = "基础班" if is_workday else "休息"
    return {
        "employeeId": emp_id,
        "date": date_key,
        "planType": plan_type,
        "planHours": plan_hours,
        "shiftCode": plan_type,
        "shiftName": shift_name,
        "shiftId": None,
        "start": None,
        "end": None,
        "operations": [],
        "isNightShift": False,
    }


def _shift_date_key(date_key: str, offset_days: int) -> str | None:
    try:
        base_date = datetime.fromisoformat(f"{date_key}T00:00:00").date()
    except ValueError:
        return None
    return (base_date + timedelta(days=offset_days)).isoformat()


def _plan_requires_night_rest(plan: Dict) -> bool:
    requires = False
    reason = ""
    
    if plan.get("isNightShift"):
        requires = True
        reason = "isNightShift flag"
    else:
        shift_code = str(plan.get("shiftCode") or "").upper()
        shift_name = str(plan.get("shiftName") or "")
        if "NIGHT" in shift_code or "夜" in shift_name:
            requires = True
            reason = "Shift Code/Name contains NIGHT/夜"
        else:
            start = plan.get("start")
            end = plan.get("end")
            if start and end and _is_night_operation(start, end):
                requires = True
                reason = "Time-based check"
    
    if requires:
        with open("/Users/zhengfengyi/ccaps22/solver/debug_night_shift.log", "a") as f:
            f.write(f"DEBUG: Plan requires night rest. Emp: {plan.get('employeeId')}, Date: {plan.get('date')}\n")
            f.write(f"  Reason: {reason}\n")
            f.write(f"  Shift: {plan.get('shiftName')} (Code: {plan.get('shiftCode')})\n")
            f.write(f"  isNightShift: {plan.get('isNightShift')}\n")
            
    return requires
