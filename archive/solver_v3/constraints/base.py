"""
V3 求解器约束基类

所有约束模块的抽象基类，提供统一接口。
"""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Optional, Dict, Any, List
from dataclasses import dataclass

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


@dataclass
class ConstraintStats:
    """约束统计信息"""
    constraint_name: str
    constraint_id: str
    variables_created: int = 0
    constraints_added: int = 0
    build_time_ms: float = 0.0


class BaseConstraint(ABC):
    """
    约束基类
    
    所有硬约束和软约束都应继承此类。
    """
    
    # 约束 ID (如 H1, S1, F1)
    constraint_id: str = ""
    
    # 约束中文名称
    constraint_name: str = ""
    
    # 是否为软约束 (False = 硬约束)
    is_soft: bool = False
    
    # 默认优先级 (仅软约束有效)
    default_priority: str = "P2"
    
    # 默认惩罚权重 (仅软约束有效)
    default_penalty: int = 1000
    
    def __init__(self, enabled: bool = True, penalty: Optional[int] = None):
        """
        初始化约束
        
        Args:
            enabled: 是否启用此约束
            penalty: 惩罚权重 (仅软约束有效)
        """
        self.enabled = enabled
        self.penalty = penalty if penalty is not None else self.default_penalty
        self.stats = ConstraintStats(
            constraint_name=self.constraint_name,
            constraint_id=self.constraint_id,
        )
    
    @abstractmethod
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用约束到模型
        
        Args:
            model: OR-Tools CpModel 实例
            context: 求解上下文
        """
        pass
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """
        验证约束是否可应用
        
        Returns:
            错误消息列表 (空列表表示验证通过)
        """
        return []
    
    def get_description(self) -> str:
        """获取约束描述"""
        return f"[{self.constraint_id}] {self.constraint_name}"
    
    def __repr__(self) -> str:
        status = "启用" if self.enabled else "禁用"
        return f"<{self.__class__.__name__} {self.constraint_id}: {status}>"


class HardConstraint(BaseConstraint):
    """硬约束基类"""
    is_soft = False


class SoftConstraint(BaseConstraint):
    """软约束基类"""
    is_soft = True
    
    def get_penalty_term(self, violation_var: Any) -> tuple:
        """
        获取惩罚项
        
        Args:
            violation_var: 表示违规的布尔变量
            
        Returns:
            (变量, 系数) 用于目标函数
        """
        return (violation_var, self.penalty)
