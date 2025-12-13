"""月度/季度工时约束模块"""
from __future__ import annotations
from typing import Dict, List
from ortools.sat.python import cp_model


def apply_month_quarter_constraints(
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
    """应用月度和季度工时硬约束
    
    确保员工的月度/季度工时在标准工时的指定范围内。
    
    Args:
        model: CP-SAT模型
        emp_id: 员工ID
        month_minute_vars: 月度工时变量 {月份键 -> 变量列表}
        quarter_minute_vars: 季度工时变量 {季度键 -> 变量列表}
        month_buckets: 月度数据桶
        quarter_buckets: 季度数据桶
        enforce_monthly_hours: 是否强制月度工时约束
        enforce_quarter_hours: 是否强制季度工时约束
        monthly_min_hours: 相对标准工时的下限偏移(小时)
        monthly_max_hours: 相对标准工时的上限偏移(小时)
    """
    # 参数验证
    from utils.logging import logger
    
    if monthly_min_hours > 0:
        logger.warning(f"[月度工时约束] monthlyMinHours应为负数或0，当前值: {monthly_min_hours}，员工ID: {emp_id}")
    if monthly_max_hours < 0:
        logger.warning(f"[月度工时约束] monthlyMaxHours应为正数或0，当前值: {monthly_max_hours}，员工ID: {emp_id}")
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
            
            # 调试日志
            logger.debug(
                f"[月度约束] 员工 {emp_id}, 月份 {m_key}: "
                f"标准工时={standard_hours}h ({workdays}个工作日), "
                f"下限={lower_bound/60:.1f}h, 上限={upper_bound/60:.1f}h, "
                f"容差范围=[{monthly_min_hours:+.1f}h, {monthly_max_hours:+.1f}h]"
            )

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
