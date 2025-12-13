"""非工作日基础班/生产班比例约束模块"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model

from utils.logging import get_log_path, DEBUG_ENABLED


def apply_non_workday_base_ratio(
    model: cp_model.CpModel,
    days_with_ops: set[str],
    calendar_info: Dict[str, Dict],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    employees: List[Dict],
    ratio_penalty_terms: List[cp_model.IntVar],
    config: Dict = None,
) -> None:
    """应用非工作日的基础班/生产班比例软约束
    
    在非工作日有生产操作时，确保基础班人数与生产班人数的比例在合理范围内（默认0.3-1.0）。
    
    Args:
        model: CP-SAT模型
        days_with_ops: 有生产操作的日期集合
        calendar_info: 日历信息字典
        day_has_production: (员工ID, 日期) -> 是否有生产的布尔变量
        shift_vars: 班次变量字典
        employees: 员工列表
        ratio_penalty_terms: 比例惩罚项列表
        config: 配置字典
    """
    if not days_with_ops:
        return

    if config is None:
        config = {}

    # 从配置获取比例范围，提供默认值
    base_ratio_min = config.get("baseRatioMin", 0.3)
    base_ratio_max = config.get("baseRatioMax", 1.0)

    # 将浮点数转换为整数比例，保留一位小数精度 (x10)
    min_ratio_num = int(base_ratio_min * 10)
    max_ratio_num = int(base_ratio_max * 10)
    
    # 0.3 -> 3/10, 1.0 -> 10/10
    # shortfall: base/prod < min -> 10*base < min*prod -> min*prod - 10*base > 0
    # excess: base/prod > max -> 10*base > max*prod -> 10*base - max*prod > 0

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
                shortfall = model.NewIntVar(0, max(1, 10 * len(employees)), f"ratio_shortfall_{date_key}")
                excess = model.NewIntVar(0, max(1, 10 * len(employees)), f"ratio_excess_{date_key}")
                
                # shortfall captures when base/prod < min_ratio (e.g. 0.3)
                # base/prod < 3/10 => 10*base < 3*prod => 3*prod - 10*base > 0
                model.Add(shortfall >= min_ratio_num * total_prod - 10 * total_base)
                
                # excess captures when base/prod > max_ratio (e.g. 1.0)
                # base/prod > 10/10 => 10*base > 10*prod => 10*base - 10*prod > 0
                model.Add(excess >= 10 * total_base - max_ratio_num * total_prod)
                
                ratio_penalty_terms.append(shortfall)
                ratio_penalty_terms.append(excess)

                if DEBUG_ENABLED:
                    with open(get_log_path("debug_leader_constraint.log"), "a") as f:
                        f.write(f"Added SOFT base/prod ratio penalty vars for {date_key}\n")
