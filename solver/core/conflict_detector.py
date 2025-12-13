"""
约束冲突检测器

在求解前检测并报告无法分配的操作及原因。
"""

from __future__ import annotations
import logging
from typing import TYPE_CHECKING, Dict, List, Set
from collections import Counter
from datetime import datetime, timedelta

from contracts.conflict_report import (
    ConflictReport, 
    OperationConflict, 
    ConflictType, 
    ConflictSeverity
)

if TYPE_CHECKING:
    from models.context import SolverContext

logger = logging.getLogger(__name__)


class ConflictDetector:
    """约束冲突检测器
    
    检测类型：
    1. NO_CANDIDATES - 无候选人
    2. ALL_UNAVAILABLE - 候选人全部不可用
    3. DEMAND_OVERFLOW - 日期需求超出可用人数
    4. NIGHT_REST - 夜班休息冲突
    """
    
    def __init__(self, context: "SolverContext"):
        self.context = context
        self.report = ConflictReport()
        
        # 预计算：每日可用员工数
        self._daily_available: Dict[str, Set[int]] = {}
        self._precompute_daily_availability()
    
    def detect_all(self) -> ConflictReport:
        """执行所有冲突检测
        
        Returns:
            冲突报告
        """
        logger.info("[ConflictDetector] 开始约束冲突检测...")
        
        # 1. 检测无候选人的操作
        self._detect_no_candidates()
        
        # 2. 检测候选人全部不可用的操作
        self._detect_all_unavailable()
        
        # 3. 检测日期需求超出可用人数
        self._detect_daily_demand_overflow()
        
        # 4. 检测夜班休息冲突
        self._detect_night_rest_conflicts()
        
        logger.info(
            f"[ConflictDetector] 检测完成: "
            f"{len(self.report.critical_conflicts)} 严重冲突, "
            f"{len(self.report.warnings)} 警告"
        )
        
        return self.report
    
    def _precompute_daily_availability(self) -> None:
        """预计算每日可用员工"""
        for date_key in self.context.all_dates:
            available = set()
            for emp_id in self.context.employees.keys():
                if not self._is_unavailable(emp_id, date_key):
                    available.add(emp_id)
            self._daily_available[date_key] = available
    
    def _is_unavailable(self, emp_id: int, date_key: str) -> bool:
        """检查员工在指定日期是否不可用"""
        unavailability = self.context.employee_unavailability.get(emp_id, [])
        for period in unavailability:
            try:
                start = datetime.fromisoformat(period.start_datetime.replace('Z', '+00:00'))
                end = datetime.fromisoformat(period.end_datetime.replace('Z', '+00:00'))
                check_date = datetime.strptime(date_key, "%Y-%m-%d")
                
                # 如果日期在不可用期间内
                if start.date() <= check_date.date() <= end.date():
                    return True
            except:
                continue
        return False
    
    def _detect_no_candidates(self) -> None:
        """检测无候选人的操作"""
        for op_id, op in self.context.operations.items():
            candidates = self.context.operation_candidates.get(op_id, [])
            
            if not candidates:
                date_key = op.planned_start[:10] if op.planned_start else "未知"
                self.report.add_conflict(OperationConflict(
                    op_id=op_id,
                    op_name=op.operation_name or op.operation_code,
                    date=date_key,
                    conflict_type=ConflictType.NO_CANDIDATES.value,
                    severity=ConflictSeverity.CRITICAL.value,
                    reason="无符合资质的候选人",
                    details=self._get_no_candidate_details(op)
                ))
    
    def _get_no_candidate_details(self, op) -> List[str]:
        """获取无候选人的详细原因"""
        details = []
        details.append(f"需求人数: {op.required_people}")
        
        # 检查资质要求
        if op.position_qualifications:
            for pq in op.position_qualifications:
                if pq.qualifications:
                    qual_names = [
                        f"资质ID:{q.qualification_id} 等级≥{q.min_level}"
                        for q in pq.qualifications
                    ]
                    details.append(f"岗位{pq.position_number}资质要求: {', '.join(qual_names)}")
        
        return details
    
    def _detect_all_unavailable(self) -> None:
        """检测候选人全部不可用的操作"""
        for op_id, op in self.context.operations.items():
            # 跳过已检测为无候选人的
            if op_id in [c.op_id for c in self.report.critical_conflicts]:
                continue
            
            candidates = self.context.operation_candidates.get(op_id, [])
            if not candidates:
                continue
            
            date_key = op.planned_start[:10] if op.planned_start else None
            if not date_key:
                continue
            
            # 检查有多少候选人可用
            available_candidates = []
            unavailable_reasons = []
            
            for emp_id in candidates:
                # 检查休息
                locked = self.context.locked_shifts.get((emp_id, date_key))
                if locked and locked.plan_category == "REST":
                    unavailable_reasons.append(f"员工{emp_id}: 锁定休息")
                    continue
                
                # 检查不可用时间
                if self._is_unavailable(emp_id, date_key):
                    unavailable_reasons.append(f"员工{emp_id}: 不可用时间段")
                    continue
                
                available_candidates.append(emp_id)
            
            # 如果可用候选人不足
            if len(available_candidates) < op.required_people:
                severity = ConflictSeverity.CRITICAL if len(available_candidates) == 0 else ConflictSeverity.WARNING
                self.report.add_conflict(OperationConflict(
                    op_id=op_id,
                    op_name=op.operation_name or op.operation_code,
                    date=date_key,
                    conflict_type=ConflictType.ALL_UNAVAILABLE.value,
                    severity=severity.value,
                    reason=f"可用候选人不足 ({len(available_candidates)}/{op.required_people})",
                    details=unavailable_reasons[:5]  # 限制详情数量
                ))
    
    def _detect_daily_demand_overflow(self) -> None:
        """检测日期需求超出可用人数"""
        # 按日期统计需求
        daily_demand: Dict[str, int] = Counter()
        daily_ops: Dict[str, List[int]] = {}
        
        for op_id, op in self.context.operations.items():
            date_key = op.planned_start[:10] if op.planned_start else None
            if date_key:
                daily_demand[date_key] += op.required_people
                if date_key not in daily_ops:
                    daily_ops[date_key] = []
                daily_ops[date_key].append(op_id)
        
        # 检查每日需求是否超出可用人数
        for date_key, demand in daily_demand.items():
            available = len(self._daily_available.get(date_key, set()))
            
            if demand > available:
                overflow = demand - available
                self.report.add_conflict(OperationConflict(
                    op_id=0,  # 日期级别冲突
                    op_name=f"日期汇总 ({date_key})",
                    date=date_key,
                    conflict_type=ConflictType.DEMAND_OVERFLOW.value,
                    severity=ConflictSeverity.WARNING.value,
                    reason=f"需求 {demand} 人超出可用 {available} 人",
                    details=[
                        f"缺口: {overflow} 人",
                        f"涉及操作数: {len(daily_ops.get(date_key, []))}",
                    ]
                ))
    
    def _detect_night_rest_conflicts(self) -> None:
        """检测夜班休息导致的冲突
        
        如果某日期的大量候选人因为前一天夜班而必须休息，
        可能导致操作无法分配。
        """
        if not self.context.config.enforce_night_rest:
            return
        
        night_rest_days = self.context.config.night_rest_hard_days
        if night_rest_days <= 0:
            return
        
        # 统计每个日期因夜班休息而不可用的员工
        for date_key in self.context.all_dates:
            try:
                current_date = datetime.strptime(date_key, "%Y-%m-%d")
            except:
                continue
            
            # 检查前 night_rest_days 天的夜班
            resting_employees = set()
            for offset in range(1, night_rest_days + 1):
                prev_date = current_date - timedelta(days=offset)
                prev_date_key = prev_date.strftime("%Y-%m-%d")
                
                # 检查历史夜班
                for hs in self.context.historical_shifts:
                    if hs.date == prev_date_key and hs.is_night:
                        resting_employees.add(hs.employee_id)
            
            # 如果休息员工数量显著，添加警告
            total_employees = len(self.context.employees)
            if len(resting_employees) > total_employees * 0.3:  # 超过30%
                self.report.add_conflict(OperationConflict(
                    op_id=0,
                    op_name=f"夜班休息影响 ({date_key})",
                    date=date_key,
                    conflict_type=ConflictType.NIGHT_REST.value,
                    severity=ConflictSeverity.WARNING.value,
                    reason=f"{len(resting_employees)} 人因夜班休息不可用",
                    details=[
                        f"占员工总数 {len(resting_employees)}/{total_employees} ({len(resting_employees)*100//total_employees}%)",
                    ]
                ))
