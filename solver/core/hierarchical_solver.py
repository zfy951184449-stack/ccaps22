"""
分层多目标求解器

分阶段优化，保证优先级：
1. 阶段1：最大化覆盖率（最小化缺员）
2. 阶段2：锁定覆盖率，优化公平性
3. 阶段3（可选）：锁定前两者，优化其他软约束
"""

from __future__ import annotations
import time
import logging
from typing import TYPE_CHECKING, Optional, List, Tuple

from ortools.sat.python import cp_model

from contracts.response import SolverResponse, SolverStatus, SolverDiagnostics
from .result_builder import ResultBuilder

if TYPE_CHECKING:
    from contracts.request import SolverRequest
    from models.context import SolverContext
    from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class HierarchicalSolver:
    """分层多目标求解器
    
    将求解过程分为多个阶段，每个阶段优化一个目标，
    并将前一阶段的最优值作为后续阶段的约束。
    
    优先级：覆盖率 > 公平性 > 其他软约束
    """
    
    def __init__(self, context: "SolverContext"):
        self.context = context
        self.model: Optional[cp_model.CpModel] = None
        self.variables: Optional["ModelVariables"] = None
        self.cp_solver: Optional[cp_model.CpSolver] = None
        
        # 阶段结果
        self.phase1_unassigned: int = 0
        self.phase2_fairness_penalty: int = 0
        
        # 配置
        self.phase1_timeout = context.config.hierarchical_phase1_timeout
        self.phase2_timeout = context.config.hierarchical_phase2_timeout
        self.enable_phase3 = context.config.hierarchical_enable_phase3
    
    def solve(
        self, 
        request: "SolverRequest",
        model: cp_model.CpModel,
        variables: "ModelVariables",
        conflict_report=None,
    ) -> SolverResponse:
        """执行分层求解
        
        Args:
            request: 求解请求
            model: 已构建约束的 CP-SAT 模型
            variables: 变量管理器
            conflict_report: 冲突报告（可选）
            
        Returns:
            求解响应
        """
        start_time = time.time()
        self.model = model
        self.variables = variables
        
        try:
            # ========== 阶段1：最大化覆盖率 ==========
            logger.info("[HierarchicalSolver] ===== 阶段1：最大化覆盖率 =====")
            phase1_result = self._phase1_maximize_coverage()
            
            if phase1_result['status'] not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                # 无可行解，直接返回
                elapsed = time.time() - start_time
                return self._build_infeasible_response(request, phase1_result, elapsed)
            
            self.phase1_unassigned = phase1_result['unassigned_count']
            logger.info(f"[HierarchicalSolver] 阶段1完成: 最小缺员数 = {self.phase1_unassigned}")
            
            # ========== 阶段2：优化公平性 ==========
            logger.info("[HierarchicalSolver] ===== 阶段2：优化公平性 =====")
            phase2_result = self._phase2_optimize_fairness()
            
            if phase2_result['status'] not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                # 使用阶段1的结果
                logger.warning("[HierarchicalSolver] 阶段2无可行解，使用阶段1结果")
                phase2_result = phase1_result
            else:
                self.phase2_fairness_penalty = phase2_result.get('objective', 0)
                logger.info(f"[HierarchicalSolver] 阶段2完成: 公平性惩罚 = {self.phase2_fairness_penalty}")
            
            # ========== 构建最终响应 ==========
            elapsed = time.time() - start_time
            return self._build_response(request, phase2_result, elapsed, conflict_report)
            
        except Exception as e:
            logger.exception(f"[HierarchicalSolver] 求解失败: {e}")
            return SolverResponse.create_error(
                request_id=request.request_id,
                message=str(e),
            )
    
    def _phase1_maximize_coverage(self) -> dict:
        """阶段1：最小化缺员
        
        只优化覆盖率，不考虑其他软约束。
        """
        # 构建目标：最小化跳过变量的和
        skip_vars = list(self.variables.skip_vars.values())
        
        if not skip_vars:
            logger.warning("[HierarchicalSolver] 没有 skip 变量，跳过阶段1")
            return {
                'status': cp_model.OPTIMAL,
                'unassigned_count': 0,
                'objective': 0,
            }
        
        # 保存原有目标（如果有）
        # 设置新目标：最小化缺员
        self.model.Minimize(sum(skip_vars))
        
        # 求解
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.phase1_timeout
        solver.parameters.num_workers = 0  # 使用所有 CPU
        
        status = solver.Solve(self.model)
        self.cp_solver = solver
        
        # 计算缺员数
        unassigned_count = 0
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            unassigned_count = sum(
                1 for v in skip_vars if solver.Value(v) == 1
            )
        
        return {
            'status': status,
            'unassigned_count': unassigned_count,
            'objective': solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            'solver': solver,
        }
    
    def _phase2_optimize_fairness(self) -> dict:
        """阶段2：锁定覆盖率，优化公平性
        
        在不增加缺员的前提下，最小化公平性惩罚。
        """
        # 添加约束：锁定覆盖率
        skip_vars = list(self.variables.skip_vars.values())
        if skip_vars:
            self.model.Add(sum(skip_vars) <= self.phase1_unassigned)
        
        # 构建公平性目标
        fairness_terms = self._collect_fairness_terms()
        
        if not fairness_terms:
            logger.info("[HierarchicalSolver] 没有公平性项，跳过阶段2")
            return {
                'status': cp_model.OPTIMAL,
                'objective': 0,
                'solver': self.cp_solver,
            }
        
        # 设置新目标：最小化公平性惩罚
        self.model.Minimize(sum(fairness_terms))
        
        # 求解
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.phase2_timeout
        solver.parameters.num_workers = 0
        
        status = solver.Solve(self.model)
        
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            self.cp_solver = solver
        
        return {
            'status': status,
            'objective': solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
            'solver': solver if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else self.cp_solver,
        }
    
    def _collect_fairness_terms(self) -> List:
        """收集公平性相关的惩罚项"""
        terms = []
        
        # 从 variables.penalty_terms 中收集公平性相关项
        fairness_keys = [
            'night_shift_unfair',
            'day_shift_unfair', 
            'night_interval_unfair',
            'operation_time_unfair',
        ]
        
        for key in fairness_keys:
            if key in self.variables.penalty_terms:
                penalty_list = self.variables.penalty_terms[key]
                weight = self._get_penalty_weight(key)
                for item in penalty_list:
                    terms.append(item * weight)
        
        return terms
    
    def _get_penalty_weight(self, key: str) -> int:
        """获取惩罚权重"""
        config = self.context.config
        weights = {
            'night_shift_unfair': config.night_shift_unfair_penalty,
            'day_shift_unfair': config.day_shift_unfair_penalty,
            'night_interval_unfair': config.night_interval_unfair_penalty,
            'operation_time_unfair': config.operation_time_unfair_penalty,
        }
        return weights.get(key, 100)
    
    def _build_response(
        self, 
        request: "SolverRequest", 
        result: dict, 
        elapsed: float,
        conflict_report=None,
    ) -> SolverResponse:
        """构建成功响应"""
        solver = result.get('solver', self.cp_solver)
        status = result['status']
        
        # 获取状态名称
        if status == cp_model.OPTIMAL:
            status_name = SolverStatus.OPTIMAL.value
        elif status == cp_model.FEASIBLE:
            status_name = SolverStatus.FEASIBLE.value
        else:
            status_name = SolverStatus.TIMEOUT.value
        
        # 构建结果
        builder = ResultBuilder(solver, self.context, self.variables)
        
        assignments = builder.build_assignments()
        shift_plans = builder.build_shift_plans()
        hours_summaries = builder.build_hours_summaries()
        warnings = builder.build_warnings()
        
        # 构建诊断信息
        diagnostics = SolverDiagnostics(
            total_operations=len(self.context.operations),
            total_employees=len(self.context.employees),
            total_days=len(self.context.all_dates),
            assigned_operations=len(assignments),
            skipped_operations=len(self.context.skipped_operations) + self.phase1_unassigned,
            shift_plans_created=len(shift_plans),
            solve_time_seconds=round(elapsed, 2),
            solutions_found=1,
            objective_value=result.get('objective'),
            employee_utilization_rate=len(assignments) / max(1, len(self.context.employees) * len(self.context.all_dates)),
            operation_fulfillment_rate=len(assignments) / max(1, len(self.context.operations)),
        )
        
        # 添加分层求解信息到摘要
        summary = (
            f"分层求解完成: 阶段1最小缺员={self.phase1_unassigned}, "
            f"分配了 {len(assignments)}/{len(self.context.operations)} 个操作"
        )
        
        return SolverResponse(
            request_id=request.request_id,
            status=status_name,
            summary=summary,
            assignments=assignments,
            shift_plans=shift_plans,
            hours_summaries=hours_summaries,
            warnings=warnings,
            diagnostics=diagnostics,
            conflict_report=conflict_report.to_dict() if conflict_report else None,
        )
    
    def _build_infeasible_response(
        self, 
        request: "SolverRequest", 
        result: dict, 
        elapsed: float,
    ) -> SolverResponse:
        """构建无可行解响应"""
        diagnostics = SolverDiagnostics(
            total_operations=len(self.context.operations),
            total_employees=len(self.context.employees),
            total_days=len(self.context.all_dates),
            assigned_operations=0,
            skipped_operations=len(self.context.operations),
            shift_plans_created=0,
            solve_time_seconds=round(elapsed, 2),
            solutions_found=0,
        )
        
        return SolverResponse.create_infeasible(
            request_id=request.request_id,
            reason="分层求解阶段1无可行解",
            diagnostics=diagnostics,
        )
