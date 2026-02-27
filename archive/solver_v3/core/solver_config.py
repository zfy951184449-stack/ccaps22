"""
core/solver_config.py

求解器配置模块

统一管理性能相关配置：
- 多线程配置
- 对称性破缺开关
- 搜索策略
- 时间限制
"""

from dataclasses import dataclass, field
from typing import Optional
import os


@dataclass
class SolverConfig:
    """
    求解器配置
    
    集中管理所有性能相关设置。
    """
    
    # === 时间设置 ===
    time_limit_seconds: int = 60
    """求解时间限制 (秒)"""
    
    # === 多线程设置 ===
    num_threads: int = 0
    """
    线程数设置
    - 0: 自动检测 CPU 核心数
    - 1-N: 指定线程数
    """
    
    # === 优化策略 ===
    enable_symmetry_breaking: bool = True
    """启用对称性破缺，减少对称解搜索空间"""
    
    enable_preprocessing: bool = True
    """启用预处理，包括域缩减和冲突表构建"""
    
    enable_conflict_table: bool = True
    """启用预计算冲突表，O(1) 冲突检测"""
    
    # === 搜索策略 ===
    search_strategy: str = 'DEFAULT'
    """
    搜索策略:
    - DEFAULT: 平衡策略
    - FIRST_SOLUTION: 快速找到首个可行解
    - BEST_BOUND: 追求最优边界
    """
    
    # === 日志设置 ===
    log_level: str = 'PROGRESS'
    """
    日志级别:
    - NONE: 无日志
    - PROGRESS: 进度日志
    - DETAILED: 详细日志
    """
    
    def get_effective_threads(self) -> int:
        """
        获取实际使用的线程数
        
        如果设为 0，自动检测 CPU 核心数。
        """
        if self.num_threads == 0:
            return max(1, os.cpu_count() or 4)
        return self.num_threads
    
    def to_cp_sat_params(self) -> dict:
        """
        转换为 CP-SAT 求解器参数
        
        Returns:
            可传递给 CpSolver 的参数字典
        """
        return {
            'max_time_in_seconds': self.time_limit_seconds,
            'num_search_workers': self.get_effective_threads(),
            'log_search_progress': self.log_level in ('PROGRESS', 'DETAILED'),
        }
    
    @classmethod
    def from_dict(cls, config_dict: dict) -> 'SolverConfig':
        """从字典创建配置"""
        return cls(
            time_limit_seconds=config_dict.get('timeLimitSeconds', 60),
            num_threads=config_dict.get('numThreads', 0),
            enable_symmetry_breaking=config_dict.get('enableSymmetryBreaking', True),
            enable_preprocessing=config_dict.get('enablePreprocessing', True),
            enable_conflict_table=config_dict.get('enableConflictTable', True),
            search_strategy=config_dict.get('searchStrategy', 'DEFAULT'),
            log_level=config_dict.get('logLevel', 'PROGRESS'),
        )


# 默认配置
DEFAULT_SOLVER_CONFIG = SolverConfig()


# 快速配置预设
FAST_SOLVE_CONFIG = SolverConfig(
    time_limit_seconds=30,
    num_threads=0,
    enable_symmetry_breaking=True,
    search_strategy='FIRST_SOLUTION',
)

QUALITY_SOLVE_CONFIG = SolverConfig(
    time_limit_seconds=300,
    num_threads=0,
    enable_symmetry_breaking=True,
    search_strategy='BEST_BOUND',
)
