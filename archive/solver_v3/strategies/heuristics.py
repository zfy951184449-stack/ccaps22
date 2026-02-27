"""
strategies/heuristics.py

启发式策略

提供求解过程中的启发式决策支持：
- 变量选择启发式
- 值选择启发式
- 分支策略
"""

from typing import TYPE_CHECKING, List, Dict, Tuple, Callable
from dataclasses import dataclass

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


@dataclass
class HeuristicConfig:
    """启发式配置"""
    prefer_experienced: bool = True      # 优先分配有经验的员工
    prefer_low_workload: bool = True     # 优先分配当前工作量低的员工
    prefer_continuity: bool = True       # 优先保持人员连续性（共享组）
    workload_balance_weight: float = 0.3 # 工作量平衡权重


class HeuristicStrategy:
    """
    启发式策略
    
    在求解过程中提供变量/值选择的启发式建议。
    """
    
    def __init__(self, config: HeuristicConfig = None):
        self.config = config or HeuristicConfig()
        self.employee_workloads: Dict[int, float] = {}
    
    def apply_search_strategy(
        self,
        model: 'cp_model.CpModel',
        context: 'SolverContext',
    ) -> None:
        """
        应用搜索策略
        
        配置 OR-Tools 的变量选择和值选择策略。
        """
        # 收集所有分配变量
        all_vars = list(context.assignment_vars.values())
        
        if not all_vars:
            return
        
        # 添加决策变量提示
        model.AddDecisionStrategy(
            all_vars,
            cp_model.CHOOSE_FIRST,   # 变量选择: 按顺序
            cp_model.SELECT_MAX_VALUE  # 值选择: 偏好分配 (1)
        )
        
        info(f"[启发式] 配置搜索策略: {len(all_vars)} 个变量")
    
    def compute_assignment_scores(
        self,
        context: 'SolverContext',
    ) -> Dict[Tuple[int, int, int], float]:
        """
        计算分配分数
        
        为每个 (操作, 岗位, 员工) 组合计算启发式分数。
        分数越高，越应该优先尝试这个分配。
        
        Returns:
            Dict[(op_id, pos, emp_id), score]
        """
        scores = {}
        
        # 初始化员工工作量
        self._init_workloads(context)
        
        for op in context.request.operations:
            for pos in range(op.required_people):
                for emp_id in context.employee_by_id.keys():
                    score = self._compute_single_score(context, op, pos, emp_id)
                    scores[(op.id, pos, emp_id)] = score
        
        return scores
    
    def _init_workloads(self, context: 'SolverContext') -> None:
        """初始化员工工作量（从边界状态）"""
        self.employee_workloads.clear()
        
        for emp_id in context.employee_by_id.keys():
            self.employee_workloads[emp_id] = 0.0
        
        # 从边界状态加载已有工时
        if hasattr(context.request, 'boundary_states'):
            for state in context.request.boundary_states:
                if hasattr(state, 'accumulated_hours'):
                    self.employee_workloads[state.employee_id] = state.accumulated_hours
    
    def _compute_single_score(
        self,
        context: 'SolverContext',
        op,
        pos: int,
        emp_id: int,
    ) -> float:
        """计算单个分配的启发式分数"""
        score = 0.0
        
        # 1. 工作量平衡：优先分配给工作量低的员工
        if self.config.prefer_low_workload:
            workload = self.employee_workloads.get(emp_id, 0.0)
            max_workload = max(self.employee_workloads.values()) if self.employee_workloads else 1.0
            workload_score = (1 - workload / max(max_workload, 1)) * 10
            score += workload_score * self.config.workload_balance_weight
        
        # 2. 共享组连续性：优先分配给同组其他操作的员工
        if self.config.prefer_continuity and hasattr(op, 'share_group_id') and op.share_group_id:
            # 检查该员工是否在同组其他操作中
            same_group_ops = [
                o for o in context.request.operations 
                if hasattr(o, 'share_group_id') and o.share_group_id == op.share_group_id
            ]
            # 简化：同组操作数量越多，分数越高
            score += len(same_group_ops) * 2
        
        return score
    
    def rank_candidates(
        self,
        op_id: int,
        pos: int,
        candidates: List[int],
        scores: Dict[Tuple[int, int, int], float],
    ) -> List[int]:
        """
        对候选员工进行排序
        
        Args:
            op_id: 操作ID
            pos: 岗位号
            candidates: 候选员工ID列表
            scores: 分配分数字典
            
        Returns:
            按分数降序排列的候选员工列表
        """
        return sorted(
            candidates,
            key=lambda emp_id: scores.get((op_id, pos, emp_id), 0.0),
            reverse=True
        )
