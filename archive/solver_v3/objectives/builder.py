"""
目标函数构建器

协调多个目标函数，支持字典序优化 (Lexicographic Optimization)。
"""

from typing import TYPE_CHECKING, List, Dict, Any, Tuple
from dataclasses import dataclass, field

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


@dataclass
class ObjectiveTerm:
    """目标函数项"""
    variable: Any  # cp_model.IntVar or BoolVar
    coefficient: int
    description: str
    priority: str = "P3"  # P0, P1, P2, P3


@dataclass
class ObjectiveStats:
    """目标函数统计"""
    total_terms: int = 0
    terms_by_priority: Dict[str, int] = field(default_factory=dict)


class ObjectiveBuilder:
    """
    目标函数构建器
    
    支持多优先级目标:
    - P0: 硬约束满足 (由 CP-SAT 自动处理)
    - P1: 缺员最小化 (最高软约束优先级)
    - P2: 公平性 (次高优先级)
    - P3: 其他软约束 (最低优先级)
    """
    
    # 优先级权重 (用于加权求和)
    PRIORITY_WEIGHTS = {
        "P0": 1_000_000_000,  # 硬约束级别 (不应出现)
        "P1": 1_000_000,       # 缺员最小化
        "P2": 1_000,           # 公平性
        "P3": 1,               # 其他软约束
    }
    
    def __init__(self):
        self.terms: List[ObjectiveTerm] = []
        self.stats = ObjectiveStats()
    
    def add_term(
        self, 
        variable: Any, 
        coefficient: int, 
        description: str,
        priority: str = "P3"
    ) -> None:
        """添加目标函数项"""
        self.terms.append(ObjectiveTerm(
            variable=variable,
            coefficient=coefficient,
            description=description,
            priority=priority,
        ))
        
        # 更新统计
        self.stats.total_terms += 1
        if priority not in self.stats.terms_by_priority:
            self.stats.terms_by_priority[priority] = 0
        self.stats.terms_by_priority[priority] += 1
    
    def add_skip_penalty(
        self, 
        skip_var: Any, 
        base_penalty: int = 1000,
        priority_bonus: int = 0,
        description: str = "跳过惩罚"
    ) -> None:
        """添加跳过岗位的惩罚项"""
        total_penalty = base_penalty + priority_bonus
        self.add_term(
            variable=skip_var,
            coefficient=total_penalty,
            description=description,
            priority="P1",  # 缺员是 P1 优先级
        )
    
    def add_fairness_penalty(
        self,
        variance_var: Any,
        weight: int = 1,
        description: str = "公平性惩罚"
    ) -> None:
        """添加公平性惩罚项"""
        self.add_term(
            variable=variance_var,
            coefficient=weight,
            description=description,
            priority="P2",
        )
    
    def add_soft_penalty(
        self,
        violation_var: Any,
        penalty: int = 500,
        description: str = "软约束惩罚"
    ) -> None:
        """添加软约束惩罚项"""
        self.add_term(
            variable=violation_var,
            coefficient=penalty,
            description=description,
            priority="P3",
        )
    
    def build_weighted_sum(self, model: 'cp_model.CpModel') -> Any:
        """
        构建加权求和目标函数
        
        使用优先级权重将所有目标合并为单一目标。
        """
        if not self.terms:
            debug("没有目标函数项")
            return None
        
        # 构建加权表达式
        objective_terms = []
        for term in self.terms:
            weight = self.PRIORITY_WEIGHTS.get(term.priority, 1)
            total_coef = term.coefficient * weight
            objective_terms.append(term.variable * total_coef)
        
        # 创建目标变量
        total_objective = sum(objective_terms)
        
        info(f"目标函数: {self.stats.total_terms} 项")
        for priority, count in sorted(self.stats.terms_by_priority.items()):
            info(f"  {priority}: {count} 项")
        
        return total_objective
    
    def minimize(self, model: 'cp_model.CpModel') -> None:
        """设置最小化目标"""
        objective = self.build_weighted_sum(model)
        if objective is not None:
            model.Minimize(objective)
            info("已设置最小化目标")
    
    def get_breakdown(self, solver: Any) -> Dict[str, Dict[str, int]]:
        """
        获取目标函数分解
        
        Returns:
            {priority: {description: value}}
        """
        breakdown: Dict[str, Dict[str, int]] = {}
        
        for term in self.terms:
            if term.priority not in breakdown:
                breakdown[term.priority] = {}
            
            try:
                value = solver.Value(term.variable) * term.coefficient
                breakdown[term.priority][term.description] = value
            except:
                pass
        
        return breakdown
