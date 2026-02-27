"""
字典序优化 (Lexicographic Optimization)

按优先级分层求解，确保高优先级目标不会被低优先级目标破坏。

优先级层:
- P0: 硬约束满足 (由 CP-SAT 自动保证)
- P1: 缺员最小化 (最高软约束优先级)
- P2: 公平性 (次高优先级)
- P3: 其他软约束 (最低优先级)
"""

from typing import TYPE_CHECKING, List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import time

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext
    from objectives.builder import ObjectiveBuilder


@dataclass
class LexicographicResult:
    """字典序优化结果"""
    status: str
    objective_values: Dict[str, int] = field(default_factory=dict)  # {priority: value}
    solve_times: Dict[str, float] = field(default_factory=dict)     # {priority: seconds}
    total_time: float = 0.0


class LexicographicOptimizer:
    """
    字典序优化器
    
    分阶段求解，每阶段锁定上一阶段的最优值作为约束。
    """
    
    # 优先级顺序
    PRIORITIES = ["P1", "P2", "P3"]  # P0 由硬约束保证
    
    # 每阶段时间限制 (秒)
    PHASE_TIME_LIMITS = {
        "P1": 60,   # 缺员最小化
        "P2": 30,   # 公平性
        "P3": 10,   # 其他软约束
    }
    
    def __init__(
        self,
        phase_time_limits: Dict[str, int] = None,
        total_time_limit: int = 120,
    ):
        self.phase_time_limits = phase_time_limits or self.PHASE_TIME_LIMITS
        self.total_time_limit = total_time_limit
    
    def solve(
        self,
        model: 'cp_model.CpModel',
        builder: 'ObjectiveBuilder',
        solver: Optional['cp_model.CpSolver'] = None,
    ) -> LexicographicResult:
        """
        执行字典序优化
        
        Args:
            model: CP-SAT 模型
            builder: ObjectiveBuilder 包含所有目标项
            solver: 可选的预配置求解器
            
        Returns:
            LexicographicResult: 优化结果
        """
        from ortools.sat.python import cp_model as cp
        
        if solver is None:
            solver = cp.CpSolver()
            solver.parameters.num_search_workers = 8
        
        start_time = time.time()
        result = LexicographicResult(status="UNKNOWN")
        locked_constraints = []  # 锁定的约束
        
        info("=" * 50)
        info("开始字典序优化")
        info("=" * 50)
        
        for priority in self.PRIORITIES:
            phase_start = time.time()
            
            # 收集该优先级的目标项
            priority_terms = [t for t in builder.terms if t.priority == priority]
            
            if not priority_terms:
                debug(f"[{priority}] 无目标项，跳过")
                continue
            
            info(f"\n[Phase {priority}] 优化 {len(priority_terms)} 个目标项")
            
            # 创建该阶段的目标变量
            phase_objective = model.NewIntVar(0, 10_000_000, f"obj_{priority}")
            model.Add(phase_objective == sum(
                term.coefficient * term.variable for term in priority_terms
            ))
            
            # 设置最小化目标
            model.Minimize(phase_objective)
            
            # 设置时间限制
            phase_limit = self.phase_time_limits.get(priority, 30)
            remaining = self.total_time_limit - (time.time() - start_time)
            solver.parameters.max_time_in_seconds = min(phase_limit, remaining)
            
            # 求解
            status = solver.Solve(model)
            phase_time = time.time() - phase_start
            result.solve_times[priority] = phase_time
            
            if status in [cp.OPTIMAL, cp.FEASIBLE]:
                best_value = solver.Value(phase_objective)
                result.objective_values[priority] = best_value
                info(f"[{priority}] 最优值: {best_value}, 用时: {phase_time:.2f}s")
                
                # 锁定此阶段结果
                # 允许轻微放松 (1%) 以给下一阶段更多空间
                allowed_slack = max(1, int(best_value * 0.01))
                lock_constraint = model.Add(phase_objective <= best_value + allowed_slack)
                locked_constraints.append(lock_constraint)
                
            elif status == cp.INFEASIBLE:
                warning(f"[{priority}] 无解!")
                result.status = "INFEASIBLE"
                break
            else:
                warning(f"[{priority}] 超时或未知状态: {status}")
                # 继续下一阶段
        
        result.total_time = time.time() - start_time
        
        # 确定最终状态
        if result.status != "INFEASIBLE":
            if all(p in result.objective_values for p in self.PRIORITIES if builder.terms):
                result.status = "OPTIMAL"
            elif result.objective_values:
                result.status = "FEASIBLE"
            else:
                result.status = "UNKNOWN"
        
        info(f"\n字典序优化完成: {result.status}, 总用时: {result.total_time:.2f}s")
        for priority, value in result.objective_values.items():
            info(f"  {priority}: {value}")
        
        return result


class SimpleWeightedOptimizer:
    """
    简单加权优化器
    
    使用权重将所有目标合并为单一目标，一次求解。
    比字典序优化更快，但可能无法精确满足优先级。
    """
    
    def solve(
        self,
        model: 'cp_model.CpModel',
        builder: 'ObjectiveBuilder',
        time_limit: int = 120,
    ) -> LexicographicResult:
        """执行加权求解"""
        from ortools.sat.python import cp_model as cp
        
        start_time = time.time()
        result = LexicographicResult(status="UNKNOWN")
        
        # 使用 builder 的加权求和
        builder.minimize(model)
        
        solver = cp.CpSolver()
        solver.parameters.num_search_workers = 8
        solver.parameters.max_time_in_seconds = time_limit
        
        status = solver.Solve(model)
        
        result.total_time = time.time() - start_time
        
        if status == cp.OPTIMAL:
            result.status = "OPTIMAL"
        elif status == cp.FEASIBLE:
            result.status = "FEASIBLE"
        elif status == cp.INFEASIBLE:
            result.status = "INFEASIBLE"
        else:
            result.status = "TIMEOUT"
        
        # 计算每个优先级的值
        if status in [cp.OPTIMAL, cp.FEASIBLE]:
            result.objective_values = builder.get_breakdown(solver)
        
        info(f"加权优化完成: {result.status}, 用时: {result.total_time:.2f}s")
        
        return result
