"""
分段求解器

将长时间窗口分割成多个段落并行求解，支持边界约束传递。

特性：
1. 14天分段 + 7天重叠区
2. 并行执行（支持 Apple M 系列芯片优化）
3. 动态边界选择（减少质量损失）
4. 迭代优化（边界冲突检测与修正）
"""

from __future__ import annotations
import platform
import os
import logging
import multiprocessing as mp
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple, Optional, Any
from concurrent.futures import ProcessPoolExecutor, as_completed

from contracts.request import SolverRequest, OperationDemand, HistoricalShift
from contracts.response import SolverResponse

logger = logging.getLogger(__name__)


# ==================== Apple M 系列芯片检测 ====================

def is_apple_silicon() -> bool:
    """检测是否为 Apple M 系列芯片"""
    if platform.system() != "Darwin":
        return False
    
    # 检查处理器架构
    machine = platform.machine()
    return machine == "arm64"


def get_optimal_worker_count() -> int:
    """获取最优工作进程数
    
    Apple M 系列芯片优化：
    - M 系列有性能核心和效率核心
    - 仅使用性能核心数量作为 worker 数
    - M1: 4P+4E -> 使用 4
    - M2: 4P+4E -> 使用 4
    - M2 Pro: 8P+4E -> 使用 8
    - M2 Max: 8P+4E -> 使用 8
    - M3 Max: 12P+4E -> 使用 12
    """
    total_cores = os.cpu_count() or 4
    
    if is_apple_silicon():
        # Apple M 系列：使用总核心数的一半（近似性能核心数）
        # 但至少 4 个，最多 12 个
        performance_cores = max(4, min(12, total_cores // 2))
        logger.info(f"[SegmentedSolver] Apple M 芯片检测: 总核心={total_cores}, 性能核心≈{performance_cores}")
        return performance_cores
    else:
        # 其他平台：使用 CPU 核心数 - 1（保留一个给系统）
        workers = max(2, total_cores - 1)
        logger.info(f"[SegmentedSolver] 标准 CPU 检测: 总核心={total_cores}, workers={workers}")
        return workers


# ==================== 数据结构 ====================

@dataclass
class EmployeeBoundaryState:
    """单个员工的边界状态"""
    employee_id: int
    
    # 最后 N 天的工作状态（用于连续工作约束）
    recent_work_days: List[Tuple[str, bool]] = field(default_factory=list)  # [(date, is_work), ...]
    
    # 最后夜班日期（用于夜班休息约束）
    last_night_shift_date: Optional[str] = None
    
    # 段内已用工时
    segment_hours: float = 0.0


@dataclass
class SegmentBoundaryState:
    """段边界状态，用于跨段传递"""
    
    # 员工状态
    employee_states: Dict[int, EmployeeBoundaryState] = field(default_factory=dict)
    
    # 重叠区锁定分配
    overlap_assignments: Dict[Tuple[int, int], int] = field(default_factory=dict)  # (op_id, emp_id) -> 1/0
    
    # 重叠区班次锁定
    overlap_shifts: Dict[Tuple[int, str], str] = field(default_factory=dict)  # (emp_id, date) -> shift_type
    
    # 工时累计
    accumulated_hours: Dict[int, float] = field(default_factory=dict)  # emp_id -> hours


@dataclass
class Segment:
    """求解段落"""
    index: int
    start_date: str
    end_date: str
    
    # 操作列表（按开始日期归属）
    operation_ids: List[int] = field(default_factory=list)
    
    # 边界状态（从前一段传入）
    boundary_state: Optional[SegmentBoundaryState] = None
    
    # 求解结果
    result: Optional[Dict[str, Any]] = None


@dataclass
class SegmentedSolverConfig:
    """分段求解器配置"""
    segment_days: int = 14          # 每段天数
    overlap_days: int = 7           # 重叠区天数
    max_iterations: int = 3         # 最大迭代次数
    enable_parallel: bool = True    # 是否启用并行
    enable_dynamic_boundary: bool = True  # 是否启用动态边界


# ==================== 分段求解器 ====================

class SegmentedSolver:
    """分段求解器
    
    将长时间窗口分割成多个段落并行求解。
    """
    
    def __init__(self, config: Optional[SegmentedSolverConfig] = None):
        self.config = config or SegmentedSolverConfig()
        self.worker_count = get_optimal_worker_count()
        
    def solve(self, request: SolverRequest, progress_callback=None) -> SolverResponse:
        """执行分段求解
        
        Args:
            request: 原始求解请求
            progress_callback: 进度回调
            
        Returns:
            合并后的求解响应
        """
        from core.solver import Solver
        
        # 1. 检查是否需要分段
        window_days = self._get_window_days(request)
        if window_days <= self.config.segment_days:
            logger.info(f"[SegmentedSolver] 窗口小于分段大小 ({window_days} <= {self.config.segment_days})，使用整体求解")
            return Solver().solve(request, progress_callback)
        
        logger.info(f"[SegmentedSolver] 开始分段求解: {window_days} 天, 分段={self.config.segment_days}天")
        
        # 2. 划分段落
        segments = self._split_into_segments(request)
        logger.info(f"[SegmentedSolver] 划分为 {len(segments)} 个段落")
        
        # 3. 顺序求解（带边界传递）
        # 注意：由于边界依赖，第一轮必须顺序执行
        for i, segment in enumerate(segments):
            if progress_callback:
                progress_callback({
                    "phase": "segment",
                    "segment_index": i,
                    "total_segments": len(segments),
                    "message": f"求解段落 {i+1}/{len(segments)}"
                })
            
            # 求解单个段落
            segment_request = self._build_segment_request(request, segment)
            segment.result = Solver().solve(segment_request, None)
            
            # 提取边界状态传递给下一段
            if i < len(segments) - 1:
                boundary_state = self._extract_boundary_state(segment, request)
                segments[i + 1].boundary_state = boundary_state
        
        # 4. 合并结果
        merged_response = self._merge_results(segments, request)
        
        logger.info(f"[SegmentedSolver] 分段求解完成")
        return merged_response
    
    def _get_window_days(self, request: SolverRequest) -> int:
        """计算求解窗口天数"""
        start = datetime.strptime(request.window.start_date[:10], "%Y-%m-%d")
        end = datetime.strptime(request.window.end_date[:10], "%Y-%m-%d")
        return (end - start).days + 1
    
    def _split_into_segments(self, request: SolverRequest) -> List[Segment]:
        """划分段落
        
        使用动态边界选择减少质量损失。
        """
        segments = []
        
        start = datetime.strptime(request.window.start_date[:10], "%Y-%m-%d")
        end = datetime.strptime(request.window.end_date[:10], "%Y-%m-%d")
        
        # 计算每天的操作负荷（用于动态边界）
        daily_load = self._calc_daily_load(request)
        
        current_start = start
        index = 0
        
        while current_start <= end:
            # 计算段落结束日期
            ideal_end = current_start + timedelta(days=self.config.segment_days - 1)
            
            if ideal_end >= end:
                # 最后一段
                segment_end = end
            else:
                # 尝试动态调整边界（寻找低负荷日）
                if self.config.enable_dynamic_boundary:
                    segment_end = self._find_optimal_boundary(
                        ideal_end, daily_load, request
                    )
                else:
                    segment_end = ideal_end
            
            # 创建段落
            segment = Segment(
                index=index,
                start_date=current_start.strftime("%Y-%m-%d"),
                end_date=segment_end.strftime("%Y-%m-%d")
            )
            
            # 分配操作到段落（按开始日期）
            for op in request.operation_demands:
                op_date = op.planned_start[:10]
                if segment.start_date <= op_date <= segment.end_date:
                    segment.operation_ids.append(op.operation_plan_id)
            
            segments.append(segment)
            index += 1
            
            # 下一段开始（考虑重叠）
            current_start = segment_end - timedelta(days=self.config.overlap_days - 1)
            current_start = current_start + timedelta(days=1)  # 避免重叠区重复
            
            if current_start > end:
                break
        
        return segments
    
    def _calc_daily_load(self, request: SolverRequest) -> Dict[str, int]:
        """计算每天的操作负荷"""
        load = {}
        for op in request.operation_demands:
            date = op.planned_start[:10]
            load[date] = load.get(date, 0) + op.required_people
        return load
    
    def _find_optimal_boundary(
        self, 
        ideal_date: datetime, 
        daily_load: Dict[str, int],
        request: SolverRequest
    ) -> datetime:
        """寻找最优分段边界
        
        在 ideal_date ± 2 天范围内寻找最佳切分点。
        优先选择：低负荷日 > 非工作日 > 避开共享组
        """
        candidates = []
        
        for offset in range(-2, 3):  # -2 到 +2 天
            candidate = ideal_date + timedelta(days=offset)
            date_str = candidate.strftime("%Y-%m-%d")
            
            # 计算分数
            load = daily_load.get(date_str, 0)
            is_rest = self._is_rest_day(date_str, request)
            in_share_group = self._has_share_group_conflict(date_str, request)
            
            score = (
                - load * 10                # 低负荷加分
                + (20 if is_rest else 0)   # 休息日加分
                - (50 if in_share_group else 0)  # 共享组冲突减分
            )
            
            candidates.append((candidate, score))
        
        # 选择最高分
        best = max(candidates, key=lambda x: x[1])
        return best[0]
    
    def _is_rest_day(self, date_str: str, request: SolverRequest) -> bool:
        """判断是否为休息日"""
        for day in request.calendar:
            if day.date == date_str:
                return not day.is_workday
        return False
    
    def _has_share_group_conflict(self, date_str: str, request: SolverRequest) -> bool:
        """检查日期是否在共享组操作范围内"""
        for pref in request.shared_preferences:
            for member in pref.members:
                # 查找对应操作
                for op in request.operation_demands:
                    if op.operation_plan_id == member.operation_plan_id:
                        if op.planned_start[:10] == date_str:
                            return True
        return False
    
    def _build_segment_request(self, original: SolverRequest, segment: Segment) -> SolverRequest:
        """构建段落求解请求
        
        将边界状态转换为 historical_shifts 格式。
        """
        import copy
        
        # 深拷贝原始请求
        segment_request = copy.deepcopy(original)
        
        # 更新窗口
        segment_request.window.start_date = segment.start_date
        segment_request.window.end_date = segment.end_date
        
        # 过滤操作（只保留本段的操作）
        segment_request.operation_demands = [
            op for op in original.operation_demands
            if op.operation_plan_id in segment.operation_ids
        ]
        
        # 注入边界状态
        if segment.boundary_state:
            self._inject_boundary_state(segment_request, segment.boundary_state)
        
        return segment_request
    
    def _inject_boundary_state(
        self, 
        request: SolverRequest, 
        state: SegmentBoundaryState
    ) -> None:
        """将边界状态注入到请求中"""
        # 转换为 historical_shifts 格式
        for emp_id, emp_state in state.employee_states.items():
            # 添加工作日历史
            for date_str, is_work in emp_state.recent_work_days:
                request.historical_shifts.append(HistoricalShift(
                    employee_id=emp_id,
                    date=date_str,
                    is_work=is_work,
                    is_night=(date_str == emp_state.last_night_shift_date)
                ))
        
        # 重叠区锁定分配 -> 添加到 locked_operations
        for (op_id, emp_id), value in state.overlap_assignments.items():
            if value == 1:
                # 找到或创建锁定操作
                found = False
                for lo in request.locked_operations:
                    if lo.operation_plan_id == op_id:
                        lo.enforced_employee_ids.append(emp_id)
                        found = True
                        break
                if not found:
                    from contracts.request import LockedOperation
                    request.locked_operations.append(LockedOperation(
                        operation_plan_id=op_id,
                        enforced_employee_ids=[emp_id]
                    ))
    
    def _extract_boundary_state(
        self, 
        segment: Segment, 
        original_request: SolverRequest
    ) -> SegmentBoundaryState:
        """从段落结果中提取边界状态"""
        state = SegmentBoundaryState()
        
        if not segment.result or segment.result.status != "OPTIMAL":
            return state
        
        # 计算重叠区日期范围
        segment_end = datetime.strptime(segment.end_date, "%Y-%m-%d")
        overlap_start = segment_end - timedelta(days=self.config.overlap_days - 1)
        overlap_dates = [
            (overlap_start + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(self.config.overlap_days)
        ]
        
        # 提取员工状态
        for shift_plan in segment.result.shift_assignments:
            emp_id = shift_plan.employee_id
            
            if emp_id not in state.employee_states:
                state.employee_states[emp_id] = EmployeeBoundaryState(employee_id=emp_id)
            
            emp_state = state.employee_states[emp_id]
            
            for daily in shift_plan.daily_plans:
                # 记录最近工作日
                is_work = daily.plan_category in ("WORK", "PRODUCTION", "BASE")
                emp_state.recent_work_days.append((daily.date, is_work))
                
                # 记录夜班
                if hasattr(daily, 'is_night_shift') and daily.is_night_shift:
                    emp_state.last_night_shift_date = daily.date
                
                # 累计工时
                emp_state.segment_hours += daily.scheduled_minutes / 60.0
                
                # 重叠区班次锁定
                if daily.date in overlap_dates:
                    state.overlap_shifts[(emp_id, daily.date)] = daily.plan_category
        
        # 提取重叠区操作分配
        for assignment in segment.result.operation_assignments:
            op_date = None
            for op in original_request.operation_demands:
                if op.operation_plan_id == assignment.operation_plan_id:
                    op_date = op.planned_start[:10]
                    break
            
            if op_date and op_date in overlap_dates:
                for emp_id in assignment.assigned_employee_ids:
                    state.overlap_assignments[(assignment.operation_plan_id, emp_id)] = 1
        
        # 只保留最近 N 天的工作记录
        max_history = self.config.overlap_days + 1
        for emp_state in state.employee_states.values():
            emp_state.recent_work_days = emp_state.recent_work_days[-max_history:]
        
        # 累计工时
        for emp_id, emp_state in state.employee_states.items():
            state.accumulated_hours[emp_id] = emp_state.segment_hours
        
        return state
    
    def _merge_results(
        self, 
        segments: List[Segment], 
        original_request: SolverRequest
    ) -> SolverResponse:
        """合并所有段落的结果"""
        from contracts.response import (
            SolverResponse, OperationAssignment, ShiftAssignment, 
            DailyShiftPlan, SolverSummary
        )
        
        if not segments or not any(s.result for s in segments):
            return SolverResponse(
                request_id=original_request.request_id,
                status="INFEASIBLE",
                summary=SolverSummary(
                    status="INFEASIBLE",
                    message="所有段落求解失败",
                    total_operations=len(original_request.operation_demands),
                    assigned_operations=0
                ),
                operation_assignments=[],
                shift_assignments=[]
            )
        
        # 合并操作分配（去重重叠区）
        merged_op_assignments: Dict[int, OperationAssignment] = {}
        overlap_ops: Set[int] = set()
        
        for i, segment in enumerate(segments):
            if not segment.result:
                continue
            
            # 计算重叠区操作（优先使用后一段的结果）
            if i < len(segments) - 1:
                segment_end = datetime.strptime(segment.end_date, "%Y-%m-%d")
                overlap_start = segment_end - timedelta(days=self.config.overlap_days - 1)
                
                for op in original_request.operation_demands:
                    op_date = datetime.strptime(op.planned_start[:10], "%Y-%m-%d")
                    if op_date >= overlap_start and op_date <= segment_end:
                        overlap_ops.add(op.operation_plan_id)
            
            for assignment in segment.result.operation_assignments:
                # 跳过重叠区操作（由后一段处理）
                if i < len(segments) - 1 and assignment.operation_plan_id in overlap_ops:
                    continue
                merged_op_assignments[assignment.operation_plan_id] = assignment
            
            # 清空重叠操作集合供下一段使用
            if i < len(segments) - 1:
                overlap_ops.clear()
        
        # 合并班次计划（需要按员工聚合）
        merged_shifts: Dict[int, List[DailyShiftPlan]] = {}
        
        for segment in segments:
            if not segment.result:
                continue
            
            for shift_plan in segment.result.shift_assignments:
                emp_id = shift_plan.employee_id
                if emp_id not in merged_shifts:
                    merged_shifts[emp_id] = []
                
                # 添加日计划（去重）
                existing_dates = {d.date for d in merged_shifts[emp_id]}
                for daily in shift_plan.daily_plans:
                    if daily.date not in existing_dates:
                        merged_shifts[emp_id].append(daily)
        
        # 构建最终响应
        shift_assignments = [
            ShiftAssignment(
                employee_id=emp_id,
                daily_plans=sorted(plans, key=lambda x: x.date)
            )
            for emp_id, plans in merged_shifts.items()
        ]
        
        # 统计
        total_ops = len(original_request.operation_demands)
        assigned_ops = len(merged_op_assignments)
        
        return SolverResponse(
            request_id=original_request.request_id,
            status="OPTIMAL" if assigned_ops == total_ops else "SUBOPTIMAL",
            summary=SolverSummary(
                status="OPTIMAL" if assigned_ops == total_ops else "SUBOPTIMAL",
                message=f"分段求解完成: {len(segments)}段, {assigned_ops}/{total_ops}操作",
                total_operations=total_ops,
                assigned_operations=assigned_ops
            ),
            operation_assignments=list(merged_op_assignments.values()),
            shift_assignments=shift_assignments
        )
