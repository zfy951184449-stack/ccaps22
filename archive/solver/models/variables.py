"""
模型变量容器

管理 CP-SAT 模型中的所有决策变量。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional
from ortools.sat.python import cp_model


@dataclass
class ModelVariables:
    """模型变量容器
    
    集中管理所有 CP-SAT 决策变量，便于约束模块访问。
    """
    
    # ==================== 操作分配变量 ====================
    # (操作ID, 员工ID) -> 布尔变量（是否分配）（向后兼容）
    assignment_vars: Dict[Tuple[int, int], cp_model.IntVar] = field(default_factory=dict)
    
    # 操作ID -> [(员工ID, 变量)] 列表（向后兼容）
    operation_candidates: Dict[int, List[Tuple[int, cp_model.IntVar]]] = field(default_factory=dict)
    
    # ==================== 按岗位的分配变量 ====================
    # (操作ID, 岗位编号, 员工ID) -> 布尔变量（是否分配到该岗位）
    position_assignment_vars: Dict[Tuple[int, int, int], cp_model.IntVar] = field(default_factory=dict)
    
    # (操作ID, 岗位编号) -> [(员工ID, 变量)] 列表
    position_candidates: Dict[Tuple[int, int], List[Tuple[int, cp_model.IntVar]]] = field(default_factory=dict)
    
    # ==================== 班次变量 ====================
    # (员工ID, 日期, 类型) -> 布尔变量
    # 类型: "WORK", "REST"
    shift_vars: Dict[Tuple[int, str, str], cp_model.IntVar] = field(default_factory=dict)
    
    # (员工ID, 日期) -> 是否有工作（操作分配或缓冲期）
    day_has_work: Dict[Tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    
    # (员工ID, 日期) -> 是否为夜班
    day_is_night: Dict[Tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    
    # (员工ID, 日期) -> 是否在缓冲期（可安排工作用于工时补足）
    day_is_buffer: Dict[Tuple[int, str], bool] = field(default_factory=dict)
    
    # ==================== 工时变量 ====================
    # (员工ID, 日期) -> 当日排班工时（分钟）
    day_scheduled_minutes: Dict[Tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    
    # (员工ID, 日期) -> 当日车间工时（分钟）
    day_workshop_minutes: Dict[Tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    
    # (员工ID, 月份) -> 月度排班工时（分钟）
    month_scheduled_minutes: Dict[Tuple[int, str], cp_model.IntVar] = field(default_factory=dict)
    
    # ==================== 辅助变量 ====================
    # 员工每天参与的操作工时列表: (员工ID, 日期) -> [(工时分钟, 变量)]
    employee_day_operations: Dict[Tuple[int, str], List[Tuple[int, cp_model.IntVar]]] = field(default_factory=dict)
    
    # 操作对应的班次工时（分钟）
    operation_shift_minutes: Dict[int, int] = field(default_factory=dict)
    
    # ==================== 惩罚变量 ====================
    # 各类惩罚项变量列表（用于目标函数）
    penalty_terms: Dict[str, List[cp_model.IntVar]] = field(default_factory=dict)
    
    # ==================== 松弛变量 ====================
    # 操作ID -> (松弛变量, 需求人数, 候选人数)
    slack_vars: Dict[int, Tuple[cp_model.IntVar, int, int]] = field(default_factory=dict)
    
    # 跳过变量（用于分层求解）: (操作ID, 岗位编号) -> 跳过变量
    skip_vars: Dict[Tuple[int, int], cp_model.IntVar] = field(default_factory=dict)
    
    def add_penalty(self, category: str, var: cp_model.IntVar) -> None:
        """添加惩罚项变量"""
        if category not in self.penalty_terms:
            self.penalty_terms[category] = []
        self.penalty_terms[category].append(var)
    
    def get_penalties(self, category: str) -> List[cp_model.IntVar]:
        """获取指定类别的惩罚项"""
        return self.penalty_terms.get(category, [])
    
    def get_all_penalties(self) -> Dict[str, List[cp_model.IntVar]]:
        """获取所有惩罚项"""
        return self.penalty_terms

