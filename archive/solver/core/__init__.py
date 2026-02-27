"""
求解器核心模块
"""

from .solver import Solver
from .result_builder import ResultBuilder
from .segmented_solver import SegmentedSolver, is_apple_silicon, get_optimal_worker_count

__all__ = ["Solver", "ResultBuilder", "SegmentedSolver", "is_apple_silicon", "get_optimal_worker_count"]


