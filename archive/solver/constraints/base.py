"""
约束基类

定义约束模块的通用接口。
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Optional
import logging

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from models.context import SolverContext
    from models.variables import ModelVariables
    from core.live_logger import LiveLogger

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
        self._live_logger: Optional[LiveLogger] = None
    
    def set_live_logger(self, live_logger: "LiveLogger") -> None:
        """注入实时日志收集器
        
        Args:
            live_logger: LiveLogger 实例，用于将日志推送到前端
        """
        self._live_logger = live_logger
    
    def _live_log(self, message: str, level: str = "SUCCESS") -> None:
        """向 LiveLogger 发送日志（如果已注入）
        
        Args:
            message: 日志消息
            level: 日志级别 (INFO, SUCCESS, WARNING, ERROR)
        """
        if self._live_logger:
            self._live_logger.constraint(message, level)
    
    @abstractmethod
    def apply(self) -> None:
        """应用约束到模型"""
        pass
    
    def log_summary(self) -> None:
        """输出约束摘要日志"""
        summary_msg = f"[{self.name}] 添加了 {self.constraints_added} 个约束"
        logger.info(summary_msg)
        
        # 同时推送到 LiveLogger
        self._live_log(f"✅ {self.name}: {self.constraints_added} 个约束")

