"""数据结构构建工具函数"""
from __future__ import annotations
from datetime import date
from typing import Dict, List, Tuple

from .time_utils import parse_iso_date, get_quarter_key, get_quarter_bounds


def build_calendar_structs(calendar_entries: List[Dict]) -> Tuple[
    Dict[str, Dict],
    List[date],
    Dict[str, Dict[str, List[str] | int]],
    Dict[str, Dict],
]:
    """构建日历相关的数据结构
    
    Args:
        calendar_entries: 日历条目列表
        
    Returns:
        (calendar_info, calendar_date_objects, month_buckets, quarter_buckets)
    """
    calendar_info: Dict[str, Dict] = {}
    calendar_date_objects: List[date] = []
    month_buckets: Dict[str, Dict[str, List[str] | int]] = {}
    quarter_buckets: Dict[str, Dict] = {}

    for entry in calendar_entries:
        date_str = entry.get("date")
        if not date_str:
            continue
        calendar_info[date_str] = entry
        parsed_date = parse_iso_date(date_str)
        if parsed_date:
            calendar_date_objects.append(parsed_date)
            quarter_key = get_quarter_key(parsed_date)
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
        quarter_start, quarter_end = get_quarter_bounds(sample_date)
        bucket["fullCoverage"] = bool(
            global_start_date and global_end_date and global_start_date <= quarter_start and global_end_date >= quarter_end
        )

    return calendar_info, calendar_date_objects, month_buckets, quarter_buckets


def build_share_groups(shared_groups: List[Dict]) -> Tuple[Dict[int, str], Dict[int, int]]:
    """构建人员共享组查找表
    
    Args:
        shared_groups: 共享组列表
        
    Returns:
        (share_group_lookup, share_anchor_by_operation) - 操作->组ID映射, 操作->锚点操作映射
    """
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


def build_locked_operation_map(locked_operations: List[Dict]) -> Dict[int, set[int]]:
    """构建锁定操作的员工映射
    
    Args:
        locked_operations: 锁定操作列表
        
    Returns:
        操作ID -> 被锁定员工ID集合的映射
    """
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


def build_employee_lookups(employees: List[Dict]) -> Tuple[
    Dict[int, Dict[int, int]], Dict[int, Dict], Dict[int, str]
]:
    """构建员工相关的查找表
    
    Args:
        employees: 员工列表
        
    Returns:
        (qualification_lookup, employee_lookup, employee_tier_lookup)
        - qualification_lookup: 员工ID -> {资质ID -> 等级}
        - employee_lookup: 员工ID -> 员工完整信息
        - employee_tier_lookup: 员工ID -> 组织角色
    """
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


def identify_leaders(employees: List[Dict]) -> set[int]:
    """识别领导/主管员工
    
    Args:
        employees: 员工列表
        
    Returns:
        领导员工ID集合
    """
    leaders: set[int] = set()
    for emp in employees:
        role = (emp.get("orgRole") or "").upper()
        if role in ("LEADER", "MANAGER"):
            leaders.add(int(emp["employeeId"]))
    return leaders


def group_unavailability(entries: List[Dict]) -> Dict[int, List[Tuple]]:
    """将员工不可用时间段按员工分组
    
    Args:
        entries: 不可用时间段列表
        
    Returns:
        员工ID -> [(开始时间, 结束时间), ...] 的映射
    """
    from datetime import datetime
    from utils.time_utils import parse_iso_datetime
    
    grouped: Dict[int, List[Tuple]] = {}
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
        start_dt = parse_iso_datetime(start_value)
        end_dt = parse_iso_datetime(end_value)
        if not start_dt or not end_dt or end_dt <= start_dt:
            continue
        grouped.setdefault(emp_id_int, []).append((start_dt, end_dt))
    for emp_id in list(grouped.keys()):
        grouped[emp_id].sort(key=lambda item: item[0])
    return grouped


def prepare_shift_definitions(shift_definitions: List[Dict]) -> List[Dict]:
    """预处理班次定义，提取关键字段
    
    Args:
        shift_definitions: 班次定义列表
        
    Returns:
        处理后的班次定义缓存列表
    """
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


def is_employee_unavailable(
    emp_id: int,
    operation_window: Tuple,
    unavailability_lookup: Dict[int, List[Tuple]],
) -> bool:
    """检查员工是否在操作时间段内不可用
    
    Args:
        emp_id: 员工ID
        operation_window: 操作时间窗口 (开始时间, 结束时间)
        unavailability_lookup: 员工不可用时间段映射
        
    Returns:
        True如果员工不可用，否则False
    """
    from utils.time_utils import windows_overlap
    
    windows = unavailability_lookup.get(emp_id)
    if not windows:
        return False
    if not operation_window or not operation_window[0] or not operation_window[1]:
        return False
    for window in windows:
        if windows_overlap(window, operation_window):
            return True
    return False


def extract_operation_window(operation: Dict) -> Tuple:
    """提取操作的时间窗口
    
    Args:
        operation: 操作字典
        
    Returns:
        (开始时间, 结束时间)
    """
    from datetime import datetime, timedelta
    from utils.time_utils import parse_iso_datetime, calculate_duration_minutes
    
    start = parse_iso_datetime(operation.get("plannedStart"))
    end = parse_iso_datetime(operation.get("plannedEnd"))
    if not start:
        start = parse_iso_datetime(operation.get("windowStart"))
    if not end:
        end = parse_iso_datetime(operation.get("windowEnd"))
    if start and end and end > start:
        return start, end
    if start and (not end or end <= start):
        duration = max(30, calculate_duration_minutes(operation.get("plannedStart"), operation.get("plannedEnd")))
        return start, start + timedelta(minutes=duration)
    return (None, None)


def find_conflicting_operation_pairs(
    operation_windows: Dict[int, Tuple],
    share_group_lookup: Dict[int, str],
) -> List[Tuple[int, int]]:
    """查找冲突的操作对
    
    Args:
        operation_windows: 操作ID -> 时间窗口的映射
        share_group_lookup: 操作ID -> 共享组ID的映射
        
    Returns:
        冲突的操作对列表 [(op_a, op_b), ...]
    """
    from utils.time_utils import windows_overlap
    
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
            if windows_overlap(window_a, window_b):
                pairs.append((op_a, op_b))
    return pairs
