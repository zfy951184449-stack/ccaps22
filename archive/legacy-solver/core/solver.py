"""核心求解器模块

包含主要的统一建模求解逻辑
"""
from __future__ import annotations
from datetime import datetime, timedelta, date
import json
import os
import time
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

# 导入工具函数
from utils.logging import log_lines, get_log_path, debug_log, DEBUG_ENABLED, logger
from utils.time_utils import (
    parse_iso_datetime,
    parse_iso_date,
    calculate_duration_minutes,
    get_primary_work_date,
    is_night_operation,
    get_quarter_key,
)
from utils.builders import (
    build_calendar_structs,
    build_share_groups,
    build_locked_operation_map,
    build_employee_lookups,
    identify_leaders,
    group_unavailability,
    prepare_shift_definitions,
    is_employee_unavailable,
    extract_operation_window,
    find_conflicting_operation_pairs,
)

# 导入约束模块
from constraints.pre_production import apply_pre_production_constraints
from constraints.night_rest import apply_night_rest_constraints  
from constraints.monthly_hours import apply_month_quarter_constraints
from constraints.leader_coverage import apply_leader_coverage_constraints
from constraints.night_fairness import apply_night_fairness_constraints
from constraints.consecutive_work import apply_consecutive_work_constraints
from constraints.consistency import enforce_day_has_production_consistency

# 导入核心模块
from core.config_manager import SolverConfig
from core.variable_factory import ModelVariables
from core.objective_builder import build_objective

# 导入班次规划模块
from shift_planning.builder import build_shift_plans
from shift_planning.matcher import match_shift_definition


LOG_BASE_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "logs"))


def _append_json_log(path: str, payload: Dict) -> None:
    """追加一行 JSON 便于排查"""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _report_progress(
    run_id: str | None,
    backend_url: str,
    stage: str,
    progress: int,
    objective: float | None = None,
    elapsed: float | None = None,
    message: str | None = None,
    solutions_found: int | None = None,
) -> None:
    """Report progress to backend via HTTP POST"""
    if not run_id or not run_id.startswith("run-"):
        return
    try:
        # Extract numeric run ID from "run-123-timestamp" format
        parts = run_id.split("-")
        if len(parts) >= 2:
            numeric_id = parts[1]
            import urllib.request
            import urllib.error
            
            data = json.dumps({
                "stage": stage,
                "progress": progress,
                "objective": objective,
                "elapsed": elapsed,
                "message": message,
                "solutionsFound": solutions_found,
            }).encode("utf-8")
            
            req = urllib.request.Request(
                f"{backend_url}/api/scheduling-runs/{numeric_id}/progress",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            
            with urllib.request.urlopen(req, timeout=2) as resp:
                pass  # Just fire and forget
    except Exception as e:
        # Don't let progress reporting failures affect solving
        logger.debug(f"Progress report failed: {e}")


class ImprovementStopper(cp_model.CpSolverSolutionCallback):
    """在目标无改进超过阈值后提前停止搜索，并上报进度"""

    def __init__(
        self,
        timeout_seconds: float,
        run_id: str | None = None,
        backend_url: str = "http://localhost:3001",
        total_time_limit: float = 60.0,
    ):
        super().__init__()
        self._best = None
        self._last_improve = time.time()
        self._start_time = time.time()
        self._timeout = max(0.0, float(timeout_seconds))
        self._run_id = run_id
        self._backend_url = backend_url
        self._total_time_limit = total_time_limit
        self._solutions_found = 0
        self._last_report_time = 0.0

    def OnSolutionCallback(self):
        obj = self.ObjectiveValue()
        now = time.time()
        elapsed = now - self._start_time
        self._solutions_found += 1
        
        improved = False
        if self._best is None or obj < self._best - 1e-6:
            self._best = obj
            self._last_improve = now
            improved = True
        
        # Report progress every 2 seconds or on improvement
        if improved or (now - self._last_report_time >= 2.0):
            self._last_report_time = now
            progress = min(95, int(elapsed / self._total_time_limit * 100))
            _report_progress(
                self._run_id,
                self._backend_url,
                "SOLVING",
                progress,
                objective=obj,
                elapsed=round(elapsed, 1),
                message=f"已找到 {self._solutions_found} 个解，目标值: {obj:.0f}",
                solutions_found=self._solutions_found,
            )
        
        # Check for timeout
        if self._timeout > 0 and now - self._last_improve >= self._timeout:
            self.StopSearch()





def build_assignments_unified(payload: Dict) -> Dict:
    """
    统一建模版本：操作分配和班次规划在同一个CP-SAT模型中同时优化
    """
    log_base_path = LOG_BASE_PATH
    os.makedirs(log_base_path, exist_ok=True)
    run_start = datetime.utcnow()
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

    # ==================== 配置参数 ====================
    # 使用配置管理器统一处理所有配置
    solver_config = SolverConfig.from_dict(config, legacy_options=payload.get("options", {}))
    
    # 为向后兼容保留一些变量（将来可以逐步移除）
    monthly_min_hours = solver_config.monthly_min_hours
    monthly_max_hours = solver_config.monthly_max_hours
    solver_time_limit = solver_config.solver_time_limit
    improvement_timeout = solver_config.improvement_timeout
    prefer_frontline = solver_config.prefer_frontline_employees
    enforce_monthly_hours = solver_config.enforce_monthly_hours
    enforce_night_rest = solver_config.enforce_night_rest
    enforce_consecutive_limit = solver_config.enforce_consecutive_limit
    enforce_quarter_hours = solver_config.enforce_quarter_hours
    enforce_unavailability = solver_config.enforce_employee_unavailability
    minimize_triple_headcount = solver_config.minimize_triple_headcount
    triple_holiday_weight = solver_config.triple_holiday_penalty_weight
    enable_workshop_fairness = solver_config.enable_workshop_fairness
    workshop_fairness_tolerance_minutes = solver_config.get_workshop_fairness_tolerance_minutes()
    workshop_fairness_weight = solver_config.workshop_fairness_weight
    enforce_night_fairness = solver_config.enforce_night_fairness
    max_consecutive_night_shifts = solver_config.max_consecutive_night_shifts
    night_shift_window_days = solver_config.night_shift_window_days
    max_night_shifts_per_window = solver_config.max_night_shifts_per_window
    night_shift_fairness_weight = solver_config.night_shift_fairness_weight
    night_shift_frontline_fairness_weight = solver_config.night_shift_frontline_fairness_weight
    prefer_no_leader_night = solver_config.prefer_no_leader_night
    leader_night_penalty_weight = solver_config.leader_night_penalty_weight
    leader_long_day_threshold_minutes = solver_config.get_leader_long_day_threshold_minutes()
    leader_long_day_penalty_weight = solver_config.leader_long_day_penalty_weight
    night_shift_min_gap_days = solver_config.night_shift_min_gap_days
    max_consecutive_rest_days = solver_config.max_consecutive_rest_days
    consecutive_rest_penalty_weight = solver_config.consecutive_rest_penalty_weight
    preferred_rest = solver_config.night_shift_preferred_rest_days
    minimum_rest = solver_config.night_shift_minimum_rest_days  # 保留兼容性，实际未使用

    # 记录请求概要（避免全量 JSON 过大）
    _append_json_log(
        os.path.join(log_base_path, "solver_request.log"),
        {
            "ts": datetime.utcnow().isoformat(),
            "requestId": payload.get("requestId"),
            "startTs": run_start.isoformat(),
            "window": payload.get("window"),
            "counts": {
                "operations": len(operations),
                "employees": len(employees),
                "calendarDays": len(calendar_entries),
                "unavailability": len(employee_unavailability),
                "lockedOperations": len(locked_operations),
                "lockedShifts": len(locked_shifts),
                "shiftDefinitions": len(shift_definitions),
            },
            "config": solver_config.to_log_summary(),
        },
    )

    # 1. 数据准备（模块化）
    calendar_info, calendar_date_objects, month_buckets, quarter_buckets = build_calendar_structs(calendar_entries)
    
    # 使用 window 参数生成完整的日期列表，确保约束覆盖整个排班窗口
    window = payload.get("window", {})
    window_start_str = window.get("startDate", "")
    window_end_str = window.get("endDate", "")
    
    if window_start_str and window_end_str:
        # 解析窗口日期（处理 ISO 格式）
        try:
            if "T" in window_start_str:
                window_start = datetime.fromisoformat(window_start_str.replace("Z", "+00:00")).date()
            else:
                window_start = datetime.strptime(window_start_str[:10], "%Y-%m-%d").date()
            if "T" in window_end_str:
                window_end = datetime.fromisoformat(window_end_str.replace("Z", "+00:00")).date()
            else:
                window_end = datetime.strptime(window_end_str[:10], "%Y-%m-%d").date()
            
            # 生成完整的日期列表
            all_dates = []
            current = window_start
            while current <= window_end:
                date_str = current.isoformat()
                all_dates.append(date_str)
                # 如果日历中没有这个日期，添加默认值（周一到周五是工作日）
                if date_str not in calendar_info:
                    is_workday = current.weekday() < 5  # 0-4 是周一到周五
                    calendar_info[date_str] = {
                        "date": date_str,
                        "isWorkday": is_workday,
                        "isTripleSalary": False,
                        "source": "AUTO_GENERATED",
                    }
                current += timedelta(days=1)
            
            logger.info(f"[日期范围] 使用 window 参数生成完整日期列表: {window_start} ~ {window_end}, 共 {len(all_dates)} 天")
            logger.info(f"[日期范围] 原日历数据天数: {len(calendar_date_objects)}, 填充后: {len(all_dates)}")
        except Exception as e:
            logger.warning(f"[日期范围] 解析 window 参数失败: {e}，使用日历数据")
            all_dates = sorted(calendar_info.keys())
    else:
        all_dates = sorted(calendar_info.keys())
        logger.info(f"[日期范围] 未提供 window 参数，使用日历数据: {len(all_dates)} 天")
    
    unavailability_lookup = group_unavailability(employee_unavailability)
    shift_cache = prepare_shift_definitions(shift_definitions)
    
    # 调试：输出班次定义详情
    logger.info(f"=== 班次定义加载 ===")
    logger.info(f"原始接收数量: {len(shift_definitions)}")
    logger.info(f"处理后缓存数量: {len(shift_cache)}")
    for idx, shift_def in enumerate(shift_cache, 1):
        logger.info(
            f"  班次 {idx}: {shift_def['shiftName']} ({shift_def['shiftCode']}) "
            f"{shift_def['startHour']:02d}:{shift_def['startMinute']:02d} - "
            f"{shift_def['endHour']:02d}:{shift_def['endMinute']:02d} "
            f"[跨天:{shift_def['isCrossDay']}, 夜班:{shift_def['isNightShift']}]"
        )
    logger.info(f"===================\n")
    
    share_group_lookup, share_anchor_by_operation = build_share_groups(shared_groups)
    locked_operation_map = build_locked_operation_map(locked_operations)
    qualification_lookup, employee_lookup, employee_tier_lookup = build_employee_lookups(employees)
    
    # 构建锁定班次查找表: (emp_id, date) -> True 表示该天有锁定的工作班次
    locked_shift_lookup: Dict[Tuple[int, str], bool] = {}
    for ls in locked_shifts:
        emp_id = ls.get("employeeId") or ls.get("employee_id")
        plan_date = ls.get("date") or ls.get("plan_date")
        plan_category = (ls.get("planCategory") or ls.get("plan_category") or "").upper()
        # 只有工作类班次（非REST）才计入连续工作
        if emp_id and plan_date and plan_category not in ("REST", ""):
            locked_shift_lookup[(int(emp_id), plan_date)] = True

    # 构建CP-SAT模型
    model = cp_model.CpModel()

    # ==================== 变量定义 ====================
    # 使用变量容器统一管理所有模型变量
    vars = ModelVariables()
    
    # 为向后兼容保留引用（将来可以逐步移除）
    operation_vars = vars.operation_vars
    op_candidate_vars = vars.op_candidate_vars
    skipped_ops_no_candidates = vars.skipped_ops_no_candidates
    shift_vars = vars.shift_vars
    day_has_production = vars.day_has_production
    day_night_flag = vars.day_night_flag
    day_billable_minutes = vars.day_billable_minutes
    employee_day_payloads = vars.employee_day_payloads
    manager_assignment_vars = vars.manager_assignment_vars
    triple_holiday_day_vars = vars.triple_holiday_day_vars
    fairness_penalty_terms = vars.fairness_penalty_terms
    base_shift_penalty_vars = vars.base_shift_penalty_vars
    ratio_penalty_terms = vars.ratio_penalty_terms
    leader_tier_penalty_terms = vars.leader_tier_penalty_terms
    monthly_penalty_terms = vars.monthly_penalty_terms
    night_rest_penalty_vars = vars.night_rest_penalty_vars
    consecutive_penalty_terms = vars.consecutive_penalty_terms
    night_fairness_penalty_terms = vars.night_fairness_penalty_terms
    frontline_fairness_penalty_terms = vars.frontline_fairness_penalty_terms
    leader_night_penalty_vars = vars.leader_night_penalty_vars
    leader_long_day_penalty_vars = vars.leader_long_day_penalty_vars
    rest_stretch_penalty_terms = vars.rest_stretch_penalty_terms
    
    # ==================== 一致性检查：操作-班次匹配预验证 ====================
    # 确保只有能匹配班次的操作才会被分配，保证操作分配和班次计划的一致性
    logger.info("[一致性检查] 验证操作是否能匹配班次定义")
    
    operation_can_match_shift: Dict[int, bool] = {}
    
    for operation in operations:
        op_id = int(operation["operationPlanId"])
        date_key = operation["plannedStart"][:10] if operation.get("plannedStart") else None
        
        if not date_key:
            logger.warning(f"操作 {op_id} 缺少时间信息，将禁止分配")
            operation_can_match_shift[op_id] = False
            continue
        
        start_dt = parse_iso_datetime(operation["plannedStart"])
        end_dt = parse_iso_datetime(operation["plannedEnd"])
        
        if not start_dt or not end_dt:
            logger.warning(f"操作 {op_id} 时间格式错误，将禁止分配")  
            operation_can_match_shift[op_id] = False
            continue
        
        # 尝试匹配班次
        tolerance = solver_config.shift_matching_tolerance
        matched = match_shift_definition(date_key, start_dt, end_dt, shift_cache, tolerance_minutes=tolerance)
        
        can_match = (matched is not None)
        operation_can_match_shift[op_id] = can_match
        
        if not can_match:
            logger.warning(
                f"[一致性检查] 操作 {op_id} 无法匹配班次定义 "
                f"(时间: {operation['plannedStart']} - {operation['plannedEnd']}), "
                f"将禁止分配以保证一致性"
            )
    
    skipped_ops_no_match = [op_id for op_id, can_match in operation_can_match_shift.items() if not can_match]
    matchable_ops = sum(1 for v in operation_can_match_shift.values() if v)
    
    logger.info(
        f"[一致性检查] 共 {len(operations)} 个操作, "
        f"{matchable_ops} 个可匹配班次, "
        f"{len(skipped_ops_no_match)} 个将被跳过"
    )
    
    if skipped_ops_no_match:
        logger.error(
            f"[一致性检查] {len(skipped_ops_no_match)} 个操作无法匹配班次，"
            f"建议检查班次定义是否完整。操作ID: {skipped_ops_no_match[:10]}"
        )
    
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
        
        # 一致性检查：跳过无法匹配班次的操作
        if not operation_can_match_shift.get(op_id, False):
            logger.debug(f"跳过操作 {op_id}（无法匹配班次）")
            skipped_ops_no_candidates.append(op_id)
            continue
        
        required = max(1, int(operation.get("requiredPeople") or 1))
        qualifications = operation.get("qualifications", [])
        planned_start = operation.get("plannedStart")
        planned_end = operation.get("plannedEnd")
        # 按开始时间归属日期（包括跨天夜班）
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        duration_minutes = calculate_duration_minutes(planned_start, planned_end)
        # 匹配班次定义以获取折算工时和夜班标记
        start_dt = parse_iso_datetime(planned_start)
        end_dt = parse_iso_datetime(planned_end)
        
        shift_nominal_minutes = 480  # 默认8小时
        is_night = False
        
        if start_dt and end_dt and day_key:
            tolerance = int(config.get("shiftMatchingTolerance", 30))
            matched_shift = match_shift_definition(day_key, start_dt, end_dt, shift_cache, tolerance_minutes=tolerance)
            
            # 默认值
            shift_nominal_minutes = 480  # 8 hours default
            is_night = False
            
            # 1. 尝试从匹配的班次中获取信息
            if matched_shift and matched_shift.get("shiftId"):
                # 从 shift_cache 中查找完整的班次信息
                for shift_def in shift_cache:
                    if shift_def.get("id") == matched_shift.get("shiftId"):
                        nominal_hours = shift_def.get("nominalHours") or 8
                        shift_nominal_minutes = int(nominal_hours * 60)
                        # 优先使用班次定义的夜班标记
                        is_night = bool(shift_def.get("isNightShift"))
                        break
            
            # 2. 如果没有匹配到预定义班次，使用时间逻辑回退判断夜班
            if not is_night:
                is_night = is_night_operation(planned_start, planned_end)
                
            operation_shift_hours[op_id] = shift_nominal_minutes
            
            # DEBUG: Log night shift determination
            with open(get_log_path("debug_night_shift.log"), "a") as f:
                if is_night:
                    f.write(f"DEBUG: Op {op_id} ({planned_start}-{planned_end}) marked as NIGHT.\n")
                    if matched_shift:
                        f.write(f"  Matched Shift: {matched_shift.get('shiftName')} (ID: {matched_shift.get('shiftId')})\n")
                        f.write(f"  Shift isNightShift: {matched_shift.get('isNightShift')}\n")
                    else:
                        f.write(f"  No shift matched. Fallback logic used.\n")
        else:
            operation_shift_hours[op_id] = 480  # 默认8小时
            is_night = is_night_operation(planned_start, planned_end)
            if is_night:
                with open(get_log_path("debug_night_shift.log"), "a") as f:
                    f.write(f"DEBUG: Op {op_id} ({planned_start}-{planned_end}) marked as NIGHT (Fallback, no date key).\n")
        
        operation_window = extract_operation_window(operation)
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
            log_lines(get_log_path("debug_constraints.log"), [
                f"[NO_CANDIDATES] op_id={op_id} start={operation.get('plannedStart')} end={operation.get('plannedEnd')} req={required} quals={len(qualifications)}"
            ])
            continue

        vars_for_op = []
        for emp_id in candidates:
            # 检查不可用性
            if (enforce_unavailability and operation_window and 
                is_employee_unavailable(emp_id, operation_window, unavailability_lookup)):
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
            log_lines(get_log_path("debug_constraints.log"), [
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
    leader_employees = identify_leaders(employees)
    frontline_employees = {int(emp["employeeId"]) for emp in employees if str(emp.get("orgRole", "")).upper() == "FRONTLINE"}
    leader_like_roles = {"TEAM_LEADER", "GROUP_LEADER", "LEADER", "MANAGER"}
    leader_like_employees = {
        int(emp["employeeId"])
        for emp in employees
        if str(emp.get("orgRole", "")).upper() in leader_like_roles
    }

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
    log_lines(get_log_path("debug_input.log"), input_lines + availability_lines)

    # ==================== 补充约束：day_has_production 必须有实际操作 ====================
    enforce_day_has_production_consistency(model, employee_day_payloads, day_has_production)


    # ==================== 提前识别Leaders（用于非工作日约束判断） ====================
    leader_employees = identify_leaders(employees)

    # ==================== 班次安排建模 ====================
    for emp in employees:
        emp_id = int(emp["employeeId"])
        emp_role = employee_tier_lookup.get(emp_id, "UNKNOWN")
        is_leader_like = emp_id in leader_like_employees
        
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
            
            if is_triple:
                model.Add(billable == 0)
                # 记录三倍工资日加班人次
                if minimize_triple_headcount:
                    triple_holiday_day_vars.append(prod_var)
            else:
                # billable = 生产班(实际班次工时) 或 基础班(480分钟)
                model.Add(billable == prod_shift_minutes + base_var * 480)

            # 领导夜班/长白班惩罚（软约束）
            if is_leader_like:
                night_var = day_night_flag.get((emp_id, date_key))
                if prefer_no_leader_night and night_var is not None and leader_night_penalty_weight > 0:
                    leader_night_penalty_vars.append(night_var)

                if leader_long_day_threshold_minutes > 0 and leader_long_day_penalty_weight > 0:
                    long_day_var = model.NewBoolVar(f"longday_{date_key}_{emp_id}")
                    model.Add(billable >= leader_long_day_threshold_minutes).OnlyEnforceIf(long_day_var)
                    model.Add(billable < leader_long_day_threshold_minutes).OnlyEnforceIf(long_day_var.Not())
                    leader_long_day_penalty_vars.append(long_day_var)

            # 归档到月度/季度
            month_key = date_key[:7]
            month_minute_vars.setdefault(month_key, []).append(billable)
            
            parsed_date = parse_iso_date(date_key)
            if parsed_date:
                q_key = get_quarter_key(parsed_date)
                quarter_minute_vars.setdefault(q_key, []).append(billable)

        # ==================== 周期工时约束 ====================
        apply_month_quarter_constraints(
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
        apply_consecutive_work_constraints(
            model,
            emp_id,
            all_dates,
            shift_vars,
            locked_shift_lookup,
            config,
        )

        # ==================== 夜班休息约束 ====================
        apply_night_rest_constraints(
            model,
            emp_id,
            all_dates,
            day_night_flag,
            shift_vars,
            preferred_rest,
            enforce_night_rest,
            night_rest_penalty_vars,
        )
        # ==================== 连续休息软约束 ====================
        if max_consecutive_rest_days > 0 and consecutive_rest_penalty_weight > 0 and len(all_dates) > max_consecutive_rest_days:
            window_size = max_consecutive_rest_days + 1
            for start_idx in range(len(all_dates) - max_consecutive_rest_days):
                window_dates = all_dates[start_idx : start_idx + window_size]
                rest_vars_window = []
                for d in window_dates:
                    r = shift_vars.get((emp_id, d, "REST"))
                    if r is not None:
                        rest_vars_window.append(r)
                if rest_vars_window:
                    slack = model.NewIntVar(0, len(rest_vars_window), f"slack_rest_{emp_id}_{start_idx}")
                    rest_stretch_penalty_terms.append(slack)
                    model.Add(sum(rest_vars_window) <= max_consecutive_rest_days + slack)

    # ==================== 夜班公平与健康保护约束 ====================
    apply_night_fairness_constraints(
        model,
        employees,
        all_dates,
        day_night_flag,
        enforce_night_fairness,
        max_consecutive_night_shifts,
        night_shift_window_days,
        max_night_shifts_per_window,
        night_fairness_penalty_terms,
        frontline_ids=frontline_employees,
        frontline_fairness_terms=frontline_fairness_penalty_terms,
        min_gap_days=night_shift_min_gap_days,
    )


    # ==================== 冲突与共享约束 ====================
    
    # 1. 时间冲突
    conflicting_pairs = find_conflicting_operation_pairs(operation_windows, share_group_lookup)
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

    # 按日期分组操作（用于后续 leader 覆盖和需求统计）
    operations_by_date_map: Dict[str, List[int]] = {}
    for operation in active_operations:
        op_id = int(operation["operationPlanId"])
        planned_start = operation.get("plannedStart")
        day_key = planned_start[:10] if isinstance(planned_start, str) and len(planned_start) >= 10 else None
        if day_key:
            operations_by_date_map.setdefault(day_key, []).append(op_id)

    # 3.1 同一员工同一天最多3个非共享操作（共享组内的操作不计入上限）
    for date_key, op_ids in operations_by_date_map.items():
        if len(op_ids) <= 1:
            continue
        # 按共享组分组
        ops_by_share_group: Dict[str | None, List[int]] = {}
        for op_id in op_ids:
            share_group = share_group_lookup.get(op_id)
            ops_by_share_group.setdefault(share_group, []).append(op_id)

        non_shared_ops = ops_by_share_group.get(None, [])
        if len(non_shared_ops) >= 4:  # 只有超过上限才需要约束
            # 找出所有可能被分配给这些操作的员工
            all_candidates = set()
            for op_id in non_shared_ops:
                candidates = op_candidate_vars.get(op_id, [])
                all_candidates.update(emp_id for emp_id, _ in candidates)

            for emp_id in all_candidates:
                emp_vars = []
                for op_id in non_shared_ops:
                    var = operation_vars.get((op_id, emp_id))
                    if var is not None:
                        emp_vars.append(var)
                if emp_vars:
                    model.Add(sum(emp_vars) <= 3)

    # 诊断：按日期汇总需求与日历属性，便于识别过载日期
    demand_by_date: Dict[str, int] = {}
    for operation in operations:
        day_key = operation.get("plannedStart")[:10] if isinstance(operation.get("plannedStart"), str) else None
        if not day_key:
            continue
        demand_by_date[day_key] = demand_by_date.get(day_key, 0) + int(operation.get("requiredPeople") or 1)
    if demand_by_date:
        demand_log_lines = []
        for d in sorted(demand_by_date.keys()):
            cal = calendar_info.get(d, {})
            workday = cal.get("isWorkday", False)
            demand_log_lines.append(f"{d} demand={demand_by_date[d]} (isWorkday={workday})")
        try:
            with open(get_log_path("debug_demand.log"), "a") as f:
                f.write("=== Demand summary ===\n")
                f.write("\n".join(demand_log_lines))
                f.write("\n")
        except Exception:
            pass

    # ==================== 每日Leader覆盖与比例约束 ====================
    days_with_ops = {d for d, op_ids in operations_by_date_map.items() if op_ids}
    apply_leader_coverage_constraints(
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
        config=config,
    )

    # ==================== 生产前正常班次约束 ====================
    apply_pre_production_constraints(
        model,
        employees,
        all_dates,
        calendar_info,
        shift_vars,
        config,
        days_with_ops,
    )

    # ==================== 目标函数 ====================
    # 使用目标函数构建器
    obj = build_objective(
        # 基础变量
operation_vars=operation_vars,
        base_shift_penalty_vars=base_shift_penalty_vars,
        
        # 惩罚项列表
        slack_vars=model._slack_vars if hasattr(model, '_slack_vars') else None,
        ratio_penalty_terms=ratio_penalty_terms if ratio_penalty_terms else None,
        leader_tier_penalty_terms=leader_tier_penalty_terms if leader_tier_penalty_terms else None,
        night_rest_penalty_vars=night_rest_penalty_vars if night_rest_penalty_vars else None,
        consecutive_penalty_terms=consecutive_penalty_terms if consecutive_penalty_terms else None,
        night_fairness_penalty_terms=night_fairness_penalty_terms if night_fairness_penalty_terms else None,
        frontline_fairness_penalty_terms=frontline_fairness_penalty_terms if frontline_fairness_penalty_terms else None,
        leader_night_penalty_vars=leader_night_penalty_vars if leader_night_penalty_vars else None,
        leader_long_day_penalty_vars=leader_long_day_penalty_vars if leader_long_day_penalty_vars else None,
        rest_stretch_penalty_terms=rest_stretch_penalty_terms if rest_stretch_penalty_terms else None,
        triple_holiday_day_vars=triple_holiday_day_vars if triple_holiday_day_vars else None,
        manager_assignment_vars=manager_assignment_vars if manager_assignment_vars else None,
        
        # 权重参数
        night_shift_fairness_weight=night_shift_fairness_weight,
        night_shift_frontline_fairness_weight=night_shift_frontline_fairness_weight,
        leader_night_penalty_weight=leader_night_penalty_weight,
        leader_long_day_penalty_weight=leader_long_day_penalty_weight,
        consecutive_rest_penalty_weight=consecutive_rest_penalty_weight,
        minimize_triple_headcount=minimize_triple_headcount,
        triple_holiday_weight=triple_holiday_weight,
    )
    
    model.Minimize(obj)

    # ==================== 求解 ====================
    request_id = payload.get("requestId")
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:3001")
    
    # Report solving started
    _report_progress(request_id, backend_url, "SOLVING", 5, message="开始求解...")
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit
    callback = (
        ImprovementStopper(
            improvement_timeout,
            run_id=request_id,
            backend_url=backend_url,
            total_time_limit=solver_time_limit,
        )
        if improvement_timeout > 0
        else None
    )
    if callback:
        status = solver.Solve(model, callback)
    else:
        status = solver.Solve(model)
    
    # Log solver status
    logger.info(f"Solver status = {solver.StatusName(status)}")

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
            if is_night_operation(operation.get("plannedStart"), operation.get("plannedEnd")):
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
            with open(get_log_path("debug_infeasible.log"), "a") as f:
                f.write("\n".join(diagnostic_lines))
                f.write("\n")
        except Exception:
            pass

        log_lines(get_log_path("debug_output.log"), [
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

        fail_summary = {
            "status": solver.StatusName(status),
            "totalDemand": sum(operations_by_date.values()),
            "totalEmployees": total_employees,
            "nightDemand": total_night_demand,
            "nightCapacityEstimate": total_night_capacity,
        }
        fail_resp = {
            "status": "FAILED",
            "summary": f"CP-SAT returned status {solver.StatusName(status)}",
            "details": {
                "assignments": [],
                "diagnostic": {
                    "summary": fail_summary,
                    "demandIssues": demand_issues,
                    "leaderIssues": leader_issues,
                    "availabilityIssues": availability_issues,
                    "nightIssues": night_issues,
                    "capacityIssues": capacity_issues,
                    "infeasibleOperations": infeasible_ops,
                    "note": "其他可能原因：连续工作/夜班休息/锁定班次冲突等硬约束",
                },
            },
        }
        _append_json_log(
            os.path.join(log_base_path, "solver_response.log"),
            {
                "ts": datetime.utcnow().isoformat(),
                "requestId": payload.get("requestId"),
                "startTs": run_start.isoformat(),
                "status": solver.StatusName(status),
                "summary": fail_resp.get("summary"),
                "diagnostic": fail_resp["details"]["diagnostic"],
            },
        )
        
        # Report failure
        _report_progress(
            request_id,
            backend_url,
            "FAILED",
            100,
            message=fail_resp.get("summary"),
        )
        
        return fail_resp

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
                
                if day:
                    employee_day_operations.setdefault((emp_id, day), []).append({
                        "operationPlanId": op_id,
                        "plannedStart": start,
                        "plannedEnd": end,
                        "durationMinutes": calculate_duration_minutes(start, end)
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
        unassigned_ops_summary = []
        for op_id, (slack_var, required, candidates) in model._slack_vars.items():
            slack_value = solver.Value(slack_var)
            if slack_value > 0:
                actual_assigned = required - slack_value
                # 获取操作详情
                op = operation_lookup.get(op_id)
                op_start = op.get("plannedStart", "?") if op else "?"
                op_end = op.get("plannedEnd", "?") if op else "?"
                is_night = is_night_operation(op_start, op_end) if op else False
                over_assigned_ops.append((op_id, required, actual_assigned, slack_value, op_start, op_end, is_night))
                
                # 记录未分配原因概览（哪些候选为0）
                assigned = []
                unassigned = []
                candidates_list = op_candidate_vars.get(op_id, [])
                for emp_id, var in candidates_list:
                    val = solver.Value(var)
                    if val == 1:
                        assigned.append(emp_id)
                    else:
                        unassigned.append(emp_id)
                op_day = op_start[:10] if isinstance(op_start, str) and len(op_start) >= 10 else "?"
                unassigned_ops_summary.append({
                    "opId": op_id,
                    "date": op_day,
                    "start": op_start,
                    "end": op_end,
                    "required": required,
                    "assignedCount": len(assigned),
                    "shortage": slack_value,
                    "candidateCount": len(candidates_list),
                    "assignedEmpIds": assigned,
                    "unassignedEmpIdsSample": unassigned[:10],
                })
        
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

        if unassigned_ops_summary:
            _append_json_log(
                os.path.join(log_base_path, "unassigned_ops.log"),
                {
                    "ts": datetime.utcnow().isoformat(),
                    "requestId": payload.get("requestId"),
                    "unassignedOps": unassigned_ops_summary,
                },
            )

    # 准备 base_vars 和 rest_vars 供 build_shift_plans 使用
    # 注意：build_shift_plans 需要的是 Dict[Tuple[int, str], cp_model.BoolVar]
    # 但我们现在已经解出了值，可以直接传递值，或者传递变量让它自己取值。
    # 查看 build_shift_plans 定义，它接受 cp_model.BoolVar。
    # 为了兼容，我们需要传递原始变量。
    
    base_vars_map = {}
    # 构建简单的变量映射供 build_shift_plans 使用
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

    shift_plans = build_shift_plans(
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

    # 成功/可行输出日志
    log_lines(get_log_path("debug_output.log"), [
        "=== SOLVER OUTPUT ===",
        f"status={solver.StatusName(status)}",
        f"summary_parts={' ; '.join(summary_parts)}",
        f"skipped_no_candidates={len(skipped_ops_no_candidates)} skipped_invalid_locks={len(infeasible_ops)}",
        f"assignments_count={len(assignments)} shift_plans_count={len(shift_plans)} dup_pairs={len(dup_pairs)}",
    ])

    # 诊断：检查是否有员工日期缺失班次（导致前端显示 "-"）
    expected_shift_pairs = len(employees) * len(all_dates)
    actual_pairs = set(
        (plan.get("employeeId"), plan.get("date"))
        for plan in shift_plans
        if plan.get("employeeId") and plan.get("date")
    )
    missing_pairs = []
    if expected_shift_pairs and len(actual_pairs) < expected_shift_pairs:
        for emp in employees:
            emp_id = int(emp["employeeId"])
            for d in all_dates:
                if (emp_id, d) not in actual_pairs:
                    missing_pairs.append((emp_id, d))
        # 只记录前 200 条缺口以防日志过大
        missing_summary = [f"{emp_id}:{d}" for emp_id, d in missing_pairs[:200]]
        log_lines(get_log_path("debug_missing_shifts.log"), [
            "=== MISSING SHIFT DIAGNOSTIC ===",
            f"expected_pairs={expected_shift_pairs}, actual_pairs={len(actual_pairs)}, missing={len(missing_pairs)}",
            "sample_missing_pairs=" + ", ".join(missing_summary),
        ])
        _append_json_log(
            os.path.join(log_base_path, "solver_response.log"),
            {
                "ts": datetime.utcnow().isoformat(),
                "requestId": payload.get("requestId"),
                "status": solver.StatusName(status),
                "missingShiftPairs": len(missing_pairs),
                "expectedShiftPairs": expected_shift_pairs,
                "sampleMissing": missing_pairs[:20],
            },
        )

    # ==================== 验证连续工作约束 ====================
    if enforce_consecutive_limit:
        max_consecutive = int(config.get("maxConsecutiveWorkdays", 6) or 6)
        violations = []
        
        # 按员工ID分组班次计划
        emp_shift_map: Dict[int, Dict[str, str]] = {}
        for plan in shift_plans:
            emp_id = int(plan.get("employeeId") or 0)
            plan_date = plan.get("date")
            plan_category = (plan.get("planCategory") or "").upper()
            if emp_id and plan_date:
                if emp_id not in emp_shift_map:
                    emp_shift_map[emp_id] = {}
                emp_shift_map[emp_id][plan_date] = plan_category
        
        # 使用 all_dates 检查连续工作（确保日期是连续的）
        for emp_id, date_map in emp_shift_map.items():
            consecutive_count = 0
            streak_start = None
            
            for i, d in enumerate(all_dates):
                category = date_map.get(d, "REST")  # 如果没有班次记录，默认为REST
                is_work = category in ("PRODUCTION", "BASE")
                
                if is_work:
                    if consecutive_count == 0:
                        streak_start = d
                    consecutive_count += 1
                else:
                    if consecutive_count > max_consecutive:
                        violations.append({
                            "employeeId": emp_id,
                            "startDate": streak_start,
                            "endDate": all_dates[i-1] if i > 0 else d,
                            "consecutiveDays": consecutive_count,
                        })
                    consecutive_count = 0
                    streak_start = None
            
            # 检查末尾的连续工作
            if consecutive_count > max_consecutive:
                violations.append({
                    "employeeId": emp_id,
                    "startDate": streak_start,
                    "endDate": all_dates[-1],
                    "consecutiveDays": consecutive_count,
                })
        
        if violations:
            logger.error(f"[连续工作验证] 发现 {len(violations)} 处违规! maxConsecutive={max_consecutive}")
            for v in violations[:10]:
                logger.error(f"  员工 {v['employeeId']}: {v['startDate']} ~ {v['endDate']}, 连续 {v['consecutiveDays']} 天")
            log_lines(get_log_path("debug_consecutive_violation.log"), [
                "=== CONSECUTIVE WORK VIOLATIONS ===",
                f"maxConsecutive={max_consecutive}, violations_count={len(violations)}",
                f"all_dates_count={len(all_dates)}, first={all_dates[0] if all_dates else 'N/A'}, last={all_dates[-1] if all_dates else 'N/A'}",
            ] + [f"emp={v['employeeId']} {v['startDate']}~{v['endDate']} days={v['consecutiveDays']}" for v in violations])
        else:
            logger.info(f"[连续工作验证] 通过! maxConsecutive={max_consecutive}")
    
    _append_json_log(
        os.path.join(log_base_path, "solver_response.log"),
        {
            "ts": datetime.utcnow().isoformat(),
            "requestId": payload.get("requestId"),
            "startTs": run_start.isoformat(),
            "status": solver.StatusName(status),
            "summary": "; ".join(summary_parts),
            "counts": {
                "assignments": len(assignments),
                "shiftPlans": len(shift_plans),
                "skippedOps": len(skipped_ops_no_candidates) + len(infeasible_ops),
            },
            "objectiveWeights": {
                "base": 1,
                "ratio": 10 if ratio_penalty_terms else 0,
                "leaderTier": 20 if leader_tier_penalty_terms else 0,
                "nightRest": 100 if night_rest_penalty_vars else 0,
                "consecutive": 50 if consecutive_penalty_terms else 0,
                "nightFairness": night_shift_fairness_weight if night_fairness_penalty_terms else 0,
                "frontlineFairness": night_shift_frontline_fairness_weight if frontline_fairness_penalty_terms else 0,
                "leaderNight": leader_night_penalty_weight if leader_night_penalty_vars else 0,
                "leaderLongDay": leader_long_day_penalty_weight if leader_long_day_penalty_vars else 0,
            },
        },
    )

    final_status = "COMPLETED" if status == cp_model.OPTIMAL else "RUNNING"
    status_name = solver.StatusName(status)
    final_summary = "; ".join(summary_parts)
    
    # Report completion
    _report_progress(
        request_id,
        backend_url,
        "COMPLETED",
        100,
        message=final_summary,
        solutions_found=callback._solutions_found if callback else None,
    )
    
    # 构建返回结果
    summary_parts = [
        f"Status={status_name}",
        f"Assignments={len(assignments)}/{len(operations)}",
        f"ShiftPlans={len(shift_plans)}",
    ]
    summary = " ".join(summary_parts)
    
    # 收集警告信息
    warnings_list = []
    if skipped_ops_no_match:
        warnings_list.append({
            "type": "OPERATIONS_SKIPPED_NO_SHIFT_MATCH",
            "message": f"{len(skipped_ops_no_match)} 个操作因无法匹配班次定义而未分配",
            "count": len(skipped_ops_no_match),
            "operationIds": skipped_ops_no_match[:20]  # 最多显示前20个
        })
    
    return {
        "status": status_name,
        "summary": summary,
        "details": {
            "assignments": assignments,
            "shiftPlans": shift_plans,
            "nightFlags": night_shift_markers,
        },
        "warnings": warnings_list,  # 添加警告列表
        "diagnostics": {
            "totalOperations": len(operations),
            "assignedOperations": len(assignments),
            "skippedOperations": len(skipped_ops_no_match),
            "shiftPlansCreated": len(shift_plans),
        }
    }
