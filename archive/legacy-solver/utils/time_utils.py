"""时间和日期处理工具函数"""
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Tuple


def parse_iso_datetime(value: str) -> datetime | None:
    """解析ISO格式的日期时间字符串
    
    Args:
        value: ISO格式的日期时间字符串
        
    Returns:
        datetime对象，解析失败返回None
    """
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None


def parse_iso_date(value: str | None) -> date | None:
    """解析ISO格式的日期字符串
    
    Args:
        value: ISO格式的日期字符串 (YYYY-MM-DD)
        
    Returns:
        date对象，解析失败返回None
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except Exception:
            return None


def get_quarter_key(value: date) -> str:
    """获取日期对应的季度键
    
    Args:
        value: 日期对象
        
    Returns:
        季度键，格式为 "YYYY-QN" (例: "2025-Q1")
    """
    quarter = ((value.month - 1) // 3) + 1
    return f"{value.year}-Q{quarter}"


def get_quarter_bounds(value: date) -> Tuple[date, date]:
    """获取日期所在季度的起止日期
    
    Args:
        value: 日期对象
        
    Returns:
        (季度开始日期, 季度结束日期)
    """
    start_month = 3 * ((value.month - 1) // 3) + 1
    quarter_start = date(value.year, start_month, 1)
    if start_month == 10:
        quarter_end = date(value.year + 1, 1, 1) - timedelta(days=1)
    else:
        quarter_end = date(value.year, start_month + 3, 1) - timedelta(days=1)
    return quarter_start, quarter_end


def calculate_duration_minutes(start: str | None, end: str | None) -> int:
    """计算两个时间点之间的分钟数
    
    Args:
        start: 开始时间 (ISO格式字符串)
        end: 结束时间 (ISO格式字符串)
        
    Returns:
        持续时间(分钟)，最小30分钟，默认8小时(480分钟)
    """
    try:
        if not start or not end:
            return 8 * 60
        start_dt = parse_iso_datetime(start)
        end_dt = parse_iso_datetime(end)
        if start_dt and end_dt and end_dt > start_dt:
            return max(30, int((end_dt - start_dt).total_seconds() // 60))
    except Exception:
        pass
    return 8 * 60


def combine_date_time(date_str: str, time_str: str) -> datetime | None:
    """组合日期字符串和时间字符串为datetime对象
    
    Args:
        date_str: 日期字符串 (YYYY-MM-DD)
        time_str: 时间字符串 (HH:MM 或 HH:MM:SS)
        
    Returns:
        datetime对象，组合失败返回None
    """
    if not date_str or not time_str:
        return None
    time_component = time_str
    if len(time_component) == 5:  # HH:MM
        time_component = f"{time_component}:00"
    try:
        return datetime.fromisoformat(f"{date_str}T{time_component}")
    except Exception:
        try:
            return datetime.strptime(f"{date_str} {time_component}", "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None


def windows_overlap(
    window_a: Tuple[datetime | None, datetime | None],
    window_b: Tuple[datetime | None, datetime | None],
) -> bool:
    """判断两个时间窗口是否重叠
    
    Args:
        window_a: 时间窗口A (开始时间, 结束时间)
        window_b: 时间窗口B (开始时间, 结束时间)
        
    Returns:
        True如果重叠，否则False
    """
    start_a, end_a = window_a
    start_b, end_b = window_b
    if not start_a or not end_a or not start_b or not end_b:
        return False
    return start_a < end_b and start_b < end_a


def get_primary_work_date(start: str | None, end: str | None) -> str | None:
    """获取操作的主要工作日期
    
    对于跨天操作，返回工作时长较长的日期（通常是第二天）
    
    Args:
        start: 开始时间 (ISO格式字符串)
        end: 结束时间 (ISO格式字符串)
        
    Returns:
        主要工作日期 (YYYY-MM-DD格式), 失败返回None
    """
    if not start:
        return None
    
    start_dt = parse_iso_datetime(start)
    end_dt = parse_iso_datetime(end) if end else None
    
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


def is_night_operation(start: str | None, end: str | None) -> bool:
    """判断操作是否为夜班操作
    
    判断标准：开始时间在21:00-6:00之间，或跨午夜且结束时间在6:00前
    
    Args:
        start: 开始时间 (ISO格式字符串)
        end: 结束时间 (ISO格式字符串)
        
    Returns:
        True如果是夜班操作，否则False
    """
    start_dt = parse_iso_datetime(start) if start else None
    end_dt = parse_iso_datetime(end) if end else None
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


def resolve_shift_window(date_str: str, definition: dict | None, fallback_minutes: int) -> Tuple[datetime | None, datetime | None]:
    """解析班次时间窗口
    
    Args:
        date_str: 日期字符串 (YYYY-MM-DD)
        definition: 班次定义字典
        fallback_minutes: 默认时长(分钟)
        
    Returns:
        (开始时间, 结束时间)
    """
    if not date_str:
        return (None, None)
    start_time = (definition or {}).get("startTime") or "08:00"
    end_time = (definition or {}).get("endTime") or "17:00"
    start_dt = combine_date_time(date_str, start_time)
    end_dt = combine_date_time(date_str, end_time)
    cross_day = bool((definition or {}).get("isCrossDay"))
    if start_dt and end_dt:
        if cross_day or end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)
        return start_dt, end_dt
    if start_dt and not end_dt:
        return start_dt, start_dt + timedelta(minutes=fallback_minutes)
    if end_dt and not start_dt:
        return end_dt - timedelta(minutes=fallback_minutes), end_dt
    default_start = combine_date_time(date_str, "08:00")
    if default_start:
        return default_start, default_start + timedelta(minutes=fallback_minutes)
    return (None, None)


def shift_date_key(date_key: str, offset_days: int) -> str | None:
    """计算日期偏移
    
    Args:
        date_key: 日期键 (YYYY-MM-DD)
        offset_days: 偏移天数
        
    Returns:
        偏移后的日期键，失败返回None
    """
    try:
        base_date = datetime.fromisoformat(f"{date_key}T00:00:00").date()
    except ValueError:
        return None
    return (base_date + timedelta(days=offset_days)).isoformat()
