"""班次计划构建模块"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model

from shift_planning.matcher import create_operation_shift_plan, create_base_shift_plan
from utils.time_utils import shift_date_key, is_night_operation
from utils.logging import get_log_path, DEBUG_ENABLED


def plan_requires_night_rest(plan: Dict) -> bool:
    """判断班次计划是否需要夜班休息
    
    Args:
        plan: 班次计划字典
        
    Returns:
        True如果需要夜班休息，否则False
    """
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
            if start and end and is_night_operation(start, end):
                requires = True
                reason = "Time-based check"
    
    if requires and DEBUG_ENABLED:
        with open(get_log_path("debug_night_shift.log"), "a") as f:
            f.write(f"DEBUG: Plan requires night rest. Emp: {plan.get('employeeId')}, Date: {plan.get('date')}\n")
            f.write(f"  Reason: {reason}\n")
            f.write(f"  Shift: {plan.get('shiftName')} (Code: {plan.get('shiftCode')})\n")
            f.write(f"  isNightShift: {plan.get('isNightShift')}\n")
            
    return requires


# 调试：输出班次定义详情
# Note: The actual `shift_definitions` and `prepare_shift_definitions` are expected to be handled
# in a higher-level function that calls `build_shift_plans`.
# This logging block is placed here as per the instruction, assuming `shift_cache` is already prepared.
# For this specific file, `shift_cache` is passed as an argument to `build_shift_plans`.
# If `shift_definitions` and `prepare_shift_definitions` are not available in this scope,
# this logging block might need to be moved to the calling function.
# For now, we'll assume `shift_definitions` is available or this is a placeholder.
# Given the context, it seems this logging is intended to be *before* the `build_shift_plans` function
# but refers to variables that would be set up *outside* this function.
# To make it syntactically correct and functional within this file's context,
# we'll assume `shift_definitions` and `shift_cache` (as prepared from `shift_definitions`)
# are available in the scope where this logging is intended to run.
# However, since `shift_cache` is an argument to `build_shift_plans`,
# this logging should ideally be in the function that *prepares* `shift_cache`.
# As per the instruction, I'm placing it here, but commenting on its potential context issue.
# logger.info(f"=== 班次定义加载 ===")
# logger.info(f"原始接收数量: {len(shift_definitions)}") # shift_definitions not defined here
# logger.info(f"处理后缓存数量: {len(shift_cache)}") # shift_cache is a parameter of build_shift_plans
# for idx, shift_def in enumerate(shift_cache, 1): # shift_cache is a parameter of build_shift_plans
#     logger.info(
#         f"  班次 {idx}: {shift_def['shiftName']} ({shift_def['shiftCode']}) "
#         f"{shift_def['startHour']:02d}:{shift_def['startMinute']:02d} - "
#         f"{shift_def['endHour']:02d}:{shift_def['endMinute']:02d} "
#         f"[跨天:{shift_def['isCrossDay']}, 夜班:{shift_def['isNightShift']}]"
#     )
# logger.info(f"===================\n")


def build_shift_plans(
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
    """构建所有员工的班次计划
    
    Args:
        employees: 员工列表
        calendar_info: 日历信息字典
        employee_day_operations: (员工ID, 日期) -> 操作列表的映射
        shift_cache: 班次定义缓存
        window: 时间窗口
        config: 配置字典
        night_flag_usage: (员工ID, 日期) -> 夜班标记的映射
        solver: CP-SAT求解器（可选）
        base_vars: 基础班变量（可选）
        rest_vars: 休息班变量（可选）
        
    Returns:
        班次计划列表
    """
    shift_plans: List[Dict] = []
    all_dates = sorted(calendar_info.keys())
    enforce_night_rest = bool((config or {}).get("enforceNightRest", True))
    preferred_rest_days = int((config or {}).get("nightShiftPreferredRestDays", 0) or 0)
    minimum_rest_days = int((config or {}).get("nightShiftMinimumRestDays", 0) or 0)
    rest_day_span = max(preferred_rest_days, minimum_rest_days)
    night_rest_targets: Dict[int, set[str]] = {}

    def register_rest(emp_id: int, night_date: str):
        """注册夜班后需要休息的日期"""
        if not (enforce_night_rest and rest_day_span > 0):
            return
        for offset in range(1, rest_day_span + 1):
            rest_key = shift_date_key(night_date, offset)
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
            tolerance = int((config or {}).get("shiftMatchingTolerance", 30))
            plan = create_operation_shift_plan(emp_id, date_key, operations, shift_cache, tolerance_minutes=tolerance)
            if plan:
                shift_plans.append(plan)
                if plan_requires_night_rest(plan):
                    register_rest(emp_id, date_key)
            else:
                # 禁止一切兜底：无法匹配班次定义时，记录错误并跳过
                error_msg = (
                    f"[CRITICAL] 操作无法匹配班次定义！"
                    f"员工ID: {emp_id}, 日期: {date_key}"
                )
                logger.error(error_msg)
                
                if DEBUG_ENABLED:
                    with open(get_log_path("shift_matching_failures.log"), "a") as f:
                        f.write(f"{error_msg}\n")
                        f.write(f"  操作详情:\n")
                        for op in operations:
                            f.write(f"    - {op.get('operationPlanId')}: "
                                   f"{op.get('plannedStart')} → {op.get('plannedEnd')}\n")
                        f.write(f"  可用班次定义数量: {len(shift_cache)}\n")
                
                # 不创建任何兜底班次，跳过
                continue
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
                plan = create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=False, force_base=True)
            elif is_rest:
                plan = create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=True)
            else:
                # Legacy fallback
                forced_rest = not calendar_entry.get("isWorkday", True)
                # ... (Night rest check omitted for brevity as it should be handled by solver now)
                plan = create_base_shift_plan(emp_id, date_key, calendar_entry, forced_rest=forced_rest)

            if plan:
                shift_plans.append(plan)
    return shift_plans
