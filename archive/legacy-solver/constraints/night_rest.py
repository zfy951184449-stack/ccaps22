"""夜班休息约束模块"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model


def apply_night_rest_constraints(
    model: cp_model.CpModel,
    emp_id: int,
    all_dates: List[str],
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    preferred_rest: int,
    enforce_night_rest: bool,
    night_rest_penalty_vars: List[cp_model.BoolVar],
) -> None:
    """应用夜班后的休息约束
    
    硬约束：夜班后第1天必须休息
    软约束：夜班后第2天尽可能休息（如果配置了preferred_rest >= 2）
    
    Args:
        model: CP-SAT模型
        emp_id: 员工ID
        all_dates: 所有日期列表
        day_night_flag: (emp_id, date) -> 是否夜班的布尔变量
        shift_vars: 班次变量字典
        preferred_rest: 优选休息天数
        enforce_night_rest: 是否强制夜班休息
        night_rest_penalty_vars: 夜班休息惩罚变量列表
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
