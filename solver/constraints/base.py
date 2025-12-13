"""
约束基类

定义约束模块的通用接口。
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING
import logging

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from models.context import SolverContext
    from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class BaseConstraint(ABC):
    """约束基类
    
    所有约束模块都应继承此类并实现 apply 方法。
    """
    
    name: str = "BaseConstraint"
    
    def __init__(self, model: cp_model.CpModel, context: SolverContext, variables: ModelVariables):
        self.model = model
        self.context = context
        self.variables = variables
        self.constraints_added = 0
    
    @abstractmethod
    def apply(self) -> None:
        """应用约束到模型"""
        pass
    
    def log_summary(self) -> None:
        """输出约束摘要日志"""
        logger.info(f"[{self.name}] 添加了 {self.constraints_added} 个约束")

