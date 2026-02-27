"""
求解器数据模型模块

包含求解器内部使用的数据模型和上下文管理。
"""

from .context import SolverContext
from .variables import ModelVariables

__all__ = [
    "SolverContext",
    "ModelVariables",
]

