"""模型变量容器模块

统一管理所有 CP-SAT 模型变量，提供类型安全和清晰的变量组织。
"""
from __future__ import annotations
from typing import Dict, List, Tuple
from ortools.sat.python import cp_model


class ModelVariables:
    """CP-SAT 模型变量容器
    
    集中管理所有模型变量，避免在主函数中分散定义。
    """
    
    def __init__(self):
        # ==================== 操作分配变量 ====================
        # (operation_id, employee_id) -> BoolVar
        self.operation_vars: Dict[Tuple[int, int], cp_model.BoolVar] = {}
        
        # operation_id -> [(employee_id, BoolVar), ...]
        self.op_candidate_vars: Dict[int, List[Tuple[int, cp_model.BoolVar]]] = {}
        
        # 被跳过的操作列表
        self.skipped_ops_no_candidates: List[int] = []
        self.infeasible_ops: List[int] = []
        
        # ==================== 班次变量 ====================
        # (employee_id, date, shift_type) -> BoolVar
        # shift_type: "PRODUCTION", "BASE", "REST"
        self.shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar] = {}
        
        # ==================== 辅助变量 ====================
        # (employee_id, date) -> BoolVar - 该天是否有生产任务
        self.day_has_production: Dict[Tuple[int, str], cp_model.BoolVar] = {}
        
        # (employee_id, date) -> BoolVar - 该天是否是夜班
        self.day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar] = {}
        
        # (employee_id, date) -> IntVar - 该天的考核工时（分钟）
        self.day_billable_minutes: Dict[Tuple[int, str], cp_model.IntVar] = {}
        
        # ==================== 工作负载记录 ====================
        # (employee_id, date) -> [(operation_duration, BoolVar), ...]
        self.employee_day_payloads: Dict[Tuple[int, str], List[Tuple[int, cp_model.BoolVar]]] = {}
        
        # ==================== 惩罚变量 ====================
        # 管理层分配惩罚
        self.manager_assignment_vars: List[cp_model.BoolVar] = []
        
        # 三倍工资日惩罚
        self.triple_holiday_day_vars: List[cp_model.BoolVar] = []
        
        # 公平性惩罚
        self.fairness_penalty_terms: List[cp_model.IntVar] = []
        
        # 基础班次惩罚（偏好休息）
        self.base_shift_penalty_vars: List[cp_model.BoolVar] = []
        
        # 非工作日比例惩罚
        self.ratio_penalty_terms: List[cp_model.IntVar] = []
        
        # 分级主管人数惩罚
        self.leader_tier_penalty_terms: List[cp_model.IntVar] = []
        
        # 月度工时惩罚（已改为硬约束，保留用于兼容）
        self.monthly_penalty_terms: List[cp_model.IntVar] = []
        
        # 夜班休息惩罚
        self.night_rest_penalty_vars: List[cp_model.BoolVar] = []
        
        # 连续工作惩罚
        self.consecutive_penalty_terms: List[cp_model.IntVar] = []
        
        # 夜班公平性惩罚
        self.night_fairness_penalty_terms: List[cp_model.IntVar] = []
        
        # 一线夜班公平性惩罚
        self.frontline_fairness_penalty_terms: List[cp_model.IntVar] = []
        
        # 主管夜班惩罚
        self.leader_night_penalty_vars: List[cp_model.BoolVar] = []
        
        # 主管长白班惩罚
        self.leader_long_day_penalty_vars: List[cp_model.BoolVar] = []
        
        # 连续休息惩罚
        self.rest_stretch_penalty_terms: List[cp_model.IntVar] = []
    
    def get_penalty_vars_summary(self) -> Dict[str, int]:
        """获取惩罚变量统计摘要"""
        return {
            "manager_assignment": len(self.manager_assignment_vars),
            "triple_holiday": len(self.triple_holiday_day_vars),
            "fairness": len(self.fairness_penalty_terms),
            "base_shift": len(self.base_shift_penalty_vars),
            "ratio": len(self.ratio_penalty_terms),
            "leader_tier": len(self.leader_tier_penalty_terms),
            "monthly": len(self.monthly_penalty_terms),
            "night_rest": len(self.night_rest_penalty_vars),
            "consecutive": len(self.consecutive_penalty_terms),
            "night_fairness": len(self.night_fairness_penalty_terms),
            "frontline_fairness": len(self.frontline_fairness_penalty_terms),
            "leader_night": len(self.leader_night_penalty_vars),
            "leader_long_day": len(self.leader_long_day_penalty_vars),
            "rest_stretch": len(self.rest_stretch_penalty_terms),
        }
    
    def get_operation_vars_count(self) -> int:
        """获取操作分配变量数量"""
        return len(self.operation_vars)
    
    def get_shift_vars_count(self) -> int:
        """获取班次变量数量"""
        return len(self.shift_vars)
    
    def get_skipped_ops_summary(self) -> Dict[str, int]:
        """获取跳过操作的摘要"""
        return {
            "no_candidates": len(self.skipped_ops_no_candidates),
            "infeasible": len(self.infeasible_ops),
            "total": len(self.skipped_ops_no_candidates) + len(self.infeasible_ops),
        }
