"""
strategies/__init__.py

求解策略模块
- symmetry.py: 对称性破缺
- heuristics.py: 启发式策略
"""

from .symmetry import SymmetryBreaking
from .heuristics import HeuristicStrategy

__all__ = ['SymmetryBreaking', 'HeuristicStrategy']
