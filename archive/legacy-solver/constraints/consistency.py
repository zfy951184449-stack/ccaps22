"""一致性约束模块"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model

def enforce_day_has_production_consistency(
    model: cp_model.CpModel,
    employee_day_payloads: Dict[Tuple[int, str], List[Tuple[int, cp_model.BoolVar]]],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
) -> None:
    """
    确保 day_has_production 只有在当天存在实际分配的操作时才为 1。
    
    Args:
        model: CP-SAT模型
        employee_day_payloads: 员工每日负载字典
        day_has_production: 员工每日是否有生产任务的布尔变量字典
    """
    for (emp_id, date_key), payload_list in employee_day_payloads.items():
        if not payload_list:
            continue
        flag_var = day_has_production.get((emp_id, date_key))
        if flag_var is None:
            continue
        op_vars = [var for _, var in payload_list]
        model.Add(sum(op_vars) >= 1).OnlyEnforceIf(flag_var)
        model.Add(sum(op_vars) == 0).OnlyEnforceIf(flag_var.Not())
