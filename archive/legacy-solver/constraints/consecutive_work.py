"""连续工作约束模块"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model
from utils.logging import logger

def apply_consecutive_work_constraints(
    model: cp_model.CpModel,
    emp_id: int,
    all_dates: List[str],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    locked_shift_lookup: Dict[Tuple[int, str], bool],
    config: Dict,
) -> None:
    """应用连续工作天数上限约束
    
    Args:
        model: CP-SAT模型
        emp_id: 员工ID
        all_dates: 所有日期列表
        shift_vars: 班次变量字典
        locked_shift_lookup: 锁定班次查找表
        config: 配置字典
    """
    enforce_consecutive_limit = bool(config.get("enforceConsecutiveLimit", True))
    if not enforce_consecutive_limit:
        return

    max_consecutive = int(config.get("maxConsecutiveWorkdays", 6) or 6)
    window_size = max_consecutive + 1
    consecutive_constraint_count = 0
    
    # 日志：记录该员工的连续工作约束配置
    if emp_id <= 5:  # 只记录前5个员工以避免日志过多
        logger.info(f"[连续约束] 员工 {emp_id}: max_consecutive={max_consecutive}, window_size={window_size}, all_dates数量={len(all_dates)}")
    
    for start_idx in range(len(all_dates) - max_consecutive):
        window_dates = all_dates[start_idx : start_idx + window_size]
        window_work_vars = []  # 每天的"是否工作"变量
        locked_work_days = 0  # 该窗口内已锁定的工作天数
        
        for d in window_dates:
            # 检查是否有锁定的工作班次
            if locked_shift_lookup.get((emp_id, d)):
                locked_work_days += 1
            else:
                # 获取该天的生产班和基础班变量
                p = shift_vars.get((emp_id, d, "PRODUCTION"))
                b = shift_vars.get((emp_id, d, "BASE"))
                
                # 创建"工作日"布尔变量 (工作 = 生产 OR 基础)
                # 由于互斥约束 p + b + r = 1，工作日 = p + b
                if p is not None and b is not None:
                    # 使用 p + b 作为"是否工作"的表达式
                    # 由于互斥约束，p + b 只能是 0 或 1
                    work_day_expr = p + b
                    window_work_vars.append(work_day_expr)
                elif p is not None:
                    window_work_vars.append(p)
                elif b is not None:
                    window_work_vars.append(b)
        
        # 硬约束：滑窗内工作天数（变量 + 已锁定）不得超过上限
        if window_work_vars:
            # sum(window_work_vars) 是该窗口内的工作天数
            model.Add(sum(window_work_vars) + locked_work_days <= max_consecutive)
            consecutive_constraint_count += 1
        elif locked_work_days > max_consecutive:
            # 如果仅锁定天数就超过上限，记录警告但无法强制（已锁定）
            logger.warning(f"Employee {emp_id} has {locked_work_days} locked work days in window starting {window_dates[0]}, exceeds max {max_consecutive}")
    
    # 日志：记录该员工添加的约束数量
    if emp_id <= 5:
        logger.info(f"[连续约束] 员工 {emp_id}: 添加了 {consecutive_constraint_count} 个滑窗约束")
