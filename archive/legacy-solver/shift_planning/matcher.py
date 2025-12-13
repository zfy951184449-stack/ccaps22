"""班次定义匹配模块"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, List

from utils.logging import get_log_path, DEBUG_ENABLED


def _normalize_dt(dt: datetime) -> datetime:
  """Strip timezone info to avoid naive/aware comparison issues."""
  if dt and dt.tzinfo:
    return dt.replace(tzinfo=None)
  return dt


def match_shift_definition(date_key: str, earliest: datetime, latest: datetime, shift_cache: List[Dict], tolerance_minutes: int = 30) -> Dict:
    """匹配最合适的班次定义
    
    根据操作的时间窗口,从班次定义缓存中找到最匹配的班次。
    如果找不到匹配的,返回临时班次。
    
    Args:
        date_key: 日期键 (YYYY-MM-DD)
        earliest: 最早开始时间
        latest: 最晚结束时间
        shift_cache: 班次定义缓存列表
        tolerance_minutes: 匹配容差（分钟），默认30
        
    Returns:
        匹配的班次信息字典
    """
    earliest = _normalize_dt(earliest)
    latest = _normalize_dt(latest)
    # tolerance_minutes = 30  <-- Removed hardcoded value
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
        # Normalize candidate windows too
        start_dt = _normalize_dt(start_dt)
        end_dt = _normalize_dt(end_dt)
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
    return None


def determine_shift_label(date_key: str, operation: Dict, shift_cache: List[Dict]) -> str:
    """确定操作的班次标签
    
    Args:
        date_key: 日期键
        operation: 操作字典
        shift_cache: 班次定义缓存
        
    Returns:
        班次标签字符串
    """
    from utils.time_utils import parse_iso_datetime
    
    planned_start = operation.get("plannedStart")
    planned_end = operation.get("plannedEnd")
    start_dt = parse_iso_datetime(planned_start)
    end_dt = parse_iso_datetime(planned_end)
    if start_dt and end_dt and end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)
    match = None
    if start_dt and end_dt:
        match = match_shift_definition(date_key, start_dt, end_dt, shift_cache)
    label = match.get("shiftCode") if match else None
    if label:
        return str(label)
    if operation.get("__shiftLabel"):
        return str(operation["__shiftLabel"])
    start_str = start_dt.strftime("%H%M") if start_dt else "0000"
    end_str = end_dt.strftime("%H%M") if end_dt else "2400"
    return f"AUTO_{start_str}_{end_str}"


def create_operation_shift_plan(emp_id: int, date_key: str, operations: List[Dict], shift_cache: List[Dict], tolerance_minutes: int = 30) -> Dict | None:
    """为员工的操作创建生产班次计划
    
    Args:
        emp_id: 员工ID
        date_key: 日期键 (YYYY-MM-DD)
        operations: 操作列表
        shift_cache: 班次定义缓存
        tolerance_minutes: 匹配容差（分钟），默认30
        
    Returns:
        班次计划字典
    """
    from utils.time_utils import parse_iso_datetime
    
    earliest = None
    latest = None
    for op in operations:
        start_dt = _normalize_dt(parse_iso_datetime(op.get("plannedStart")))
        end_dt = _normalize_dt(parse_iso_datetime(op.get("plannedEnd")))
        if start_dt and (earliest is None or start_dt < earliest):
            earliest = start_dt
        if end_dt and (latest is None or end_dt > latest):
            latest = end_dt
    if earliest is None:
        earliest = datetime.fromisoformat(f"{date_key}T08:00:00")
    if latest is None or latest <= earliest:
        latest = earliest + timedelta(hours=8)
    duration_minutes = max(30, int((latest - earliest).total_seconds() // 60))
    matched_shift = match_shift_definition(date_key, earliest, latest, shift_cache, tolerance_minutes=tolerance_minutes)
    
    if not matched_shift:
        if DEBUG_ENABLED:
            with open(get_log_path("debug_night_shift.log"), "a") as f:
                f.write(f"WARNING: No matching shift found for {emp_id} on {date_key}. Time: {earliest} - {latest}\n")
        return None
    
    # DEBUG: Log matched shift for plan
    if DEBUG_ENABLED:
        with open(get_log_path("debug_night_shift.log"), "a") as f:
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


def create_base_shift_plan(emp_id: int, date_key: str, calendar_entry: Dict, forced_rest: bool = False, force_base: bool = False) -> Dict:
    """创建基础班次或休息班次计划
    
    Args:
        emp_id: 员工ID
        date_key: 日期键 (YYYY-MM-DD)
        calendar_entry: 日历条目
        forced_rest: 是否强制休息
        force_base: 是否强制基础班
        
    Returns:
        班次计划字典
    """
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
