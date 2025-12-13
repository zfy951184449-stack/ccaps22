"""目标函数构建模块

统一构建 CP-SAT 求解器的目标函数，包含所有惩罚项和权重管理。
"""
from __future__ import annotations
from typing import List, Dict
from ortools.sat.python import cp_model


def build_objective(
    # 基础变量
    operation_vars: Dict,
    base_shift_penalty_vars: List[cp_model.BoolVar],
    
    # 惩罚项列表
    slack_vars: Dict = None,
    ratio_penalty_terms: List = None,
    leader_tier_penalty_terms: List = None,
    night_rest_penalty_vars: List = None,
    consecutive_penalty_terms: List = None,
    night_fairness_penalty_terms: List = None,
    frontline_fairness_penalty_terms: List = None,
    leader_night_penalty_vars: List = None,
    leader_long_day_penalty_vars: List = None,
    rest_stretch_penalty_terms: List = None,
    triple_holiday_day_vars: List = None,
    manager_assignment_vars: List = None,
    
    # 权重参数
    night_shift_fairness_weight: int = 10,
    night_shift_frontline_fairness_weight: int = 20,
    leader_night_penalty_weight: int = 50,
    leader_long_day_penalty_weight: int = 30,
    consecutive_rest_penalty_weight: int = 50,
    minimize_triple_headcount: bool = False,
    triple_holiday_weight: int = 10,
) -> cp_model.LinearExpr:
    """构建统一的目标函数
    
    优先级（从高到低）：
    1. 最小化松弛量（超额分配）- 权重 1000
    2. 最小化操作分配总人数
    3. 最小化基础班次（优先休息）
    4. 软约束惩罚项（权重 10-100）
    
    Args:
        operation_vars: 操作分配变量
        base_shift_penalty_vars: 基础班次惩罚变量
        slack_vars: 松弛变量（超额分配）
        ratio_penalty_terms: 非工作日比例惩罚
        leader_tier_penalty_terms: 分级主管人数惩罚
        night_rest_penalty_vars: 夜班休息惩罚
        consecutive_penalty_terms: 连续工作惩罚
        night_fairness_penalty_terms: 夜班公平性惩罚
        frontline_fairness_penalty_terms: 一线夜班公平性惩罚
        leader_night_penalty_vars: 主管夜班惩罚
        leader_long_day_penalty_vars: 主管长白班惩罚
        rest_stretch_penalty_terms: 连续休息惩罚
        triple_holiday_day_vars: 三倍工资日惩罚
        manager_assignment_vars: 管理层分配惩罚
        (权重参数)
        
    Returns:
        目标函数线性表达式
    """
    obj = 0
    
    # 1. 最小化松弛量（超额分配的总人数）- 最高优先级 (权重 1000)
    slack_penalty = 0
    if slack_vars:
        slack_penalty = sum(slack_var for slack_var, _, _ in slack_vars.values()) * 1000
    
    # 2. 最小化操作分配总人数
    obj = slack_penalty + sum(operation_vars.values())
    
    # 3. 最小化基础班次（优先休息）
    if base_shift_penalty_vars:
        obj += sum(base_shift_penalty_vars)
    
    # 3.5 软化后的非工作日 BASE/PROD 比例罚分 (权重 10)
    if ratio_penalty_terms:
        obj += sum(ratio_penalty_terms) * 10
    
    # 3.6 软化后的分级主管人数罚分 (权重 20)
    if leader_tier_penalty_terms:
        obj += sum(leader_tier_penalty_terms) * 20

    # 3.7 月度工时罚分 - 已改为硬约束，不再需要罚分
    # (保留注释用于文档)

    # 3.8 夜班休息软约束罚分 (权重 100)
    if night_rest_penalty_vars:
        obj += sum(night_rest_penalty_vars) * 100

    # 3.9 连续工作软约束罚分 (权重 50)
    if consecutive_penalty_terms:
        obj += sum(consecutive_penalty_terms) * 50
    
    # 3.10 夜班公平性惩罚（极差最小化）
    if night_fairness_penalty_terms and night_shift_fairness_weight > 0:
        obj += sum(night_fairness_penalty_terms) * night_shift_fairness_weight
    
    # 3.11 一线夜班均衡惩罚
    if frontline_fairness_penalty_terms and night_shift_frontline_fairness_weight > 0:
        obj += sum(frontline_fairness_penalty_terms) * night_shift_frontline_fairness_weight
    
    # 3.12 主管夜班/长白班惩罚
    if leader_night_penalty_vars and leader_night_penalty_weight > 0:
        obj += sum(leader_night_penalty_vars) * leader_night_penalty_weight
    if leader_long_day_penalty_vars and leader_long_day_penalty_weight > 0:
        obj += sum(leader_long_day_penalty_vars) * leader_long_day_penalty_weight
    if rest_stretch_penalty_terms and consecutive_rest_penalty_weight > 0:
        obj += sum(rest_stretch_penalty_terms) * consecutive_rest_penalty_weight
    
    # 4. 最小化三倍工资日人头
    if minimize_triple_headcount and triple_holiday_day_vars:
        obj += sum(triple_holiday_day_vars) * triple_holiday_weight
        
    # 5. 管理层惩罚 (权重 100)
    if manager_assignment_vars:
        obj += sum(manager_assignment_vars) * 100

    return obj


def get_objective_summary(
    slack_vars: Dict = None,
    ratio_penalty_terms: List = None,
    leader_tier_penalty_terms: List = None,
    night_rest_penalty_vars: List = None,
    consecutive_penalty_terms: List = None,
    night_fairness_penalty_terms: List = None,
    frontline_fairness_penalty_terms: List = None,
    leader_night_penalty_vars: List = None,
    leader_long_day_penalty_vars: List = None,
    rest_stretch_penalty_terms: List = None,
    triple_holiday_day_vars: List = None,
    manager_assignment_vars: List = None,
) -> Dict[str, int]:
    """获取目标函数各项统计
    
    Returns:
        各项惩罚变量的数量统计
    """
    return {
        "slack_vars": len(slack_vars) if slack_vars else 0,
        "ratio_penalty": len(ratio_penalty_terms) if ratio_penalty_terms else 0,
        "leader_tier_penalty": len(leader_tier_penalty_terms) if leader_tier_penalty_terms else 0,
        "night_rest_penalty": len(night_rest_penalty_vars) if night_rest_penalty_vars else 0,
        "consecutive_penalty": len(consecutive_penalty_terms) if consecutive_penalty_terms else 0,
        "night_fairness": len(night_fairness_penalty_terms) if night_fairness_penalty_terms else 0,
        "frontline_fairness": len(frontline_fairness_penalty_terms) if frontline_fairness_penalty_terms else 0,
        "leader_night": len(leader_night_penalty_vars) if leader_night_penalty_vars else 0,
        "leader_long_day": len(leader_long_day_penalty_vars) if leader_long_day_penalty_vars else 0,
        "rest_stretch": len(rest_stretch_penalty_terms) if rest_stretch_penalty_terms else 0,
        "triple_holiday": len(triple_holiday_day_vars) if triple_holiday_day_vars else 0,
        "manager_assignment": len(manager_assignment_vars) if manager_assignment_vars else 0,
    }
