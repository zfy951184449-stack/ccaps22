"""主管/领导覆盖约束模块"""
from __future__ import annotations
from datetime import datetime
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model

from utils.logging import get_log_path, DEBUG_ENABLED, logger


def apply_leader_coverage_constraints(
    model: cp_model.CpModel,
    leader_employees: set[int],
    days_with_ops: set[str],
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
    calendar_info: Dict[str, Dict],
    employees: List[Dict],
    leader_tier_penalty_terms: List[cp_model.IntVar],
    ratio_penalty_terms: List[cp_model.IntVar],
    enable_leader_presence: bool = True,
    config: Dict = None,
) -> None:
    """应用主管覆盖约束及相关的分级惩罚
    
    硬约束：有生产操作的日期至少要有一个主管上班
    软约束：根据非工作日的人数动态调整主管数量（分级惩罚）
    
    Args:
        model: CP-SAT模型
        leader_employees: 主管员工ID集合
        days_with_ops: 有生产操作的日期集合
        shift_vars: 班次变量字典
        day_has_production: (员工ID, 日期) -> 是否有生产的布尔变量
        calendar_info: 日历信息字典
        employees: 员工列表
        leader_tier_penalty_terms: 主管分级惩罚项列表
        ratio_penalty_terms: 比例惩罚项列表
        enable_leader_presence: 是否启用主管覆盖约束
        config: 配置字典
    """
    if config is None:
        config = {}

    # 从配置获取阈值，提供默认值
    tier1_threshold = config.get("leaderTier1Threshold", 6)
    tier2_threshold = config.get("leaderTier2Threshold", 10)
    tier3_threshold = config.get("leaderTier3Threshold", 17)
    
    logger.debug(f"Starting leader constraint check at {datetime.now()}")
    logger.debug(f"Leader thresholds: T1<={tier1_threshold}, T2<={tier2_threshold}, T3<={tier3_threshold}")
    logger.debug(f"Total employees: {len(employees)}")
    logger.debug(f"Identified leaders: {leader_employees}")

    if DEBUG_ENABLED:
        with open(get_log_path("debug_leader_constraint.log"), "a") as f:
            f.write(f"Days with operations: {sorted(list(days_with_ops))}\n")

    if enable_leader_presence and leader_employees and days_with_ops:
        for date_key in days_with_ops:
            leader_working_vars = []
            for leader_id in leader_employees:
                prod_key = (leader_id, date_key, "PRODUCTION")
                if prod_key in shift_vars:
                    leader_working_vars.append(shift_vars[prod_key])
                base_key = (leader_id, date_key, "BASE")
                if base_key in shift_vars:
                    leader_working_vars.append(shift_vars[base_key])

            if leader_working_vars:
                model.Add(sum(leader_working_vars) >= 1)
                if DEBUG_ENABLED:
                    with open(get_log_path("debug_leader_constraint.log"), "a") as f:
                        f.write(f"Added constraint for {date_key}: sum({len(leader_working_vars)} vars) >= 1\n")

                calendar_entry = calendar_info.get(date_key, {})
                is_workday = bool(calendar_entry.get("isWorkday", False))

                if not is_workday:
                    workers_on_duty_vars = []
                    for emp in employees:
                        emp_id = int(emp["employeeId"])
                        if (emp_id, date_key) in day_has_production:
                            workers_on_duty_vars.append(day_has_production[(emp_id, date_key)])

                    if workers_on_duty_vars:
                        total_workers = sum(workers_on_duty_vars)
                        leader_count = model.NewIntVar(0, len(leader_working_vars), f"leaders_count_{date_key}")
                        model.Add(leader_count == sum(leader_working_vars))

                        # Tier 1: <= T1, ideally 1 leader
                        is_tier_1 = model.NewBoolVar(f"is_tier_1_{date_key}")
                        model.Add(total_workers <= tier1_threshold).OnlyEnforceIf(is_tier_1)
                        model.Add(total_workers > tier1_threshold).OnlyEnforceIf(is_tier_1.Not())
                        short_1 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t1_{date_key}")
                        model.Add(short_1 >= 1 - leader_count).OnlyEnforceIf(is_tier_1)
                        leader_tier_penalty_terms.append(short_1)

                        # Tier 2: T1+1 to T2, ideally 1-2 leaders
                        is_tier_2 = model.NewBoolVar(f"is_tier_2_{date_key}")
                        model.Add(total_workers > tier1_threshold).OnlyEnforceIf(is_tier_2)
                        model.Add(total_workers <= tier2_threshold).OnlyEnforceIf(is_tier_2)
                        short_2 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t2_{date_key}")
                        excess_2 = model.NewIntVar(0, len(leader_working_vars), f"leader_excess_t2_{date_key}")
                        model.Add(short_2 >= 1 - leader_count).OnlyEnforceIf(is_tier_2)
                        model.Add(excess_2 >= leader_count - 2).OnlyEnforceIf(is_tier_2)
                        leader_tier_penalty_terms.extend([short_2, excess_2])

                        # Tier 3: T2+1 to T3, ideally 2 leaders
                        is_tier_3 = model.NewBoolVar(f"is_tier_3_{date_key}")
                        model.Add(total_workers > tier2_threshold).OnlyEnforceIf(is_tier_3)
                        model.Add(total_workers <= tier3_threshold).OnlyEnforceIf(is_tier_3)
                        short_3 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t3_{date_key}")
                        excess_3 = model.NewIntVar(0, len(leader_working_vars), f"leader_excess_t3_{date_key}")
                        model.Add(short_3 >= 2 - leader_count).OnlyEnforceIf(is_tier_3)
                        model.Add(excess_3 >= leader_count - 2).OnlyEnforceIf(is_tier_3)
                        leader_tier_penalty_terms.extend([short_3, excess_3])

                        # Tier 4: > T3, ideally >= 3 leaders
                        is_tier_4 = model.NewBoolVar(f"is_tier_4_{date_key}")
                        model.Add(total_workers > tier3_threshold).OnlyEnforceIf(is_tier_4)
                        short_4 = model.NewIntVar(0, len(leader_working_vars), f"leader_short_t4_{date_key}")
                        model.Add(short_4 >= 3 - leader_count).OnlyEnforceIf(is_tier_4)
                        leader_tier_penalty_terms.append(short_4)

                        if DEBUG_ENABLED:
                            with open(get_log_path("debug_leader_constraint.log"), "a") as f:
                                f.write(f"Added SOFT tiered leader penalties for {date_key}\n")

            else:
                if DEBUG_ENABLED:
                    with open(get_log_path("debug_leader_constraint.log"), "a") as f:
                        f.write(f"WARNING: No leader vars found for {date_key}!\n")

    # 已移除非工作日 Base/Prod 比例软约束
