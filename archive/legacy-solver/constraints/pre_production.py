"""生产前正常班次约束模块"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import sys
from ortools.sat.python import cp_model


def apply_pre_production_constraints(
    model: cp_model.CpModel,
    employees: List[Dict],
    all_dates: List[str],
    calendar_info: Dict[str, Dict],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    config: Dict,
    days_with_ops: set[str],
) -> None:
    """应用生产前的正常班次约束
    
    在第一个生产操作之前的缓冲期内，工作日强制上班，非工作日强制休息。
    
    Args:
        model: CP-SAT模型
        employees: 员工列表
        all_dates: 所有日期列表
        calendar_info: 日历信息字典
        shift_vars: 班次变量字典 (emp_id, date, type) -> BoolVar
        config: 配置字典
        days_with_ops: 有生产操作的日期集合
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
