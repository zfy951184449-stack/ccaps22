"""
约束冲突检测器

在求解前检测并报告无法分配的操作及原因。
"""

from __future__ import annotations
import logging
from typing import TYPE_CHECKING, Dict, List, Set, Optional
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
    from core.live_logger import LiveLogger

logger = logging.getLogger(__name__)


class ConflictDetector:
    """约束冲突检测器
    
    检测类型：
    1. NO_CANDIDATES - 无候选人
    2. ALL_UNAVAILABLE - 候选人全部不可用
    3. DEMAND_OVERFLOW - 日期需求超出可用人数
    4. NIGHT_REST - 夜班休息冲突
    """
    
    def __init__(self, context: "SolverContext", live_logger: Optional["LiveLogger"] = None):
        self.context = context
        self.report = ConflictReport()
        self._live_logger = live_logger
        
        # 预计算：每日可用员工数
        self._daily_available: Dict[str, Set[int]] = {}
        self._precompute_daily_availability()
    
    def _live_log(self, message: str, level: str = "WARNING") -> None:
        """向 LiveLogger 发送日志（如果已注入）"""
        if self._live_logger:
            self._live_logger.conflict(message, level)
    
    def detect_all(self) -> ConflictReport:
        """执行所有冲突检测
        
        Returns:
            冲突报告
        """
        logger.info("[ConflictDetector] 开始约束冲突检测...")
        self._live_log("🔍 开始约束冲突检测...", "INFO")
        
        # 1. 检测无候选人的操作
        self._detect_no_candidates()
        
        # 2. 检测候选人全部不可用的操作
        self._detect_all_unavailable()
        
        # 3. 检测日期需求超出可用人数
        self._detect_daily_demand_overflow()
        
        # 4. 检测技能（操作类型）供需瓶颈
        self._detect_skill_supply_demand()
        
        # 5. 检测夜班休息冲突
        self._detect_night_rest_conflicts()
        
        # 汇总日志
        critical_count = len(self.report.critical_conflicts)
        warning_count = len(self.report.warnings)
        
        logger.info(
            f"[ConflictDetector] 检测完成: "
            f"{critical_count} 严重冲突, "
            f"{warning_count} 警告"
        )
        
        # 推送详细汇总到 LiveLog
        self._output_detailed_summary()
        
        return self.report
    
    def _output_detailed_summary(self) -> None:
        """输出详细的冲突摘要到 LiveLog"""
        critical_count = len(self.report.critical_conflicts)
        warning_count = len(self.report.warnings)
        
        if critical_count == 0 and warning_count == 0:
            self._live_log("✅ 未发现约束冲突", "SUCCESS")
            return
        
        # 按冲突类型分组
        by_type = {}
        for c in self.report.critical_conflicts + self.report.warnings:
            if c.conflict_type not in by_type:
                by_type[c.conflict_type] = []
            by_type[c.conflict_type].append(c)
        
        # 输出总览
        if critical_count > 0:
            self._live_log(f"❌ 发现 {critical_count} 个严重冲突（导致无解）", "ERROR")
        if warning_count > 0:
            self._live_log(f"⚠️ 发现 {warning_count} 个警告（可能无解）", "WARNING")
        
        # 分类型输出详情
        
        # 1. 无候选人的操作
        no_candidates = by_type.get("NO_CANDIDATES", [])
        if no_candidates:
            self._live_log(f"📋 无候选人的操作 ({len(no_candidates)} 个):", "ERROR")
            for c in no_candidates[:3]:
                self._live_log(f"  └─ {c.date} {c.op_name}", "ERROR")
                if c.details:
                    for d in c.details[:2]:
                        self._live_log(f"     {d}", "INFO")
            if len(no_candidates) > 3:
                self._live_log(f"  └─ ...还有 {len(no_candidates) - 3} 个", "INFO")
        
        # 2. 候选人不可用
        unavailable = by_type.get("ALL_UNAVAILABLE", [])
        if unavailable:
            self._live_log(f"📋 候选人不可用 ({len(unavailable)} 个):", "WARNING")
            for c in unavailable[:3]:
                self._live_log(f"  └─ {c.date} {c.op_name}: {c.reason}", "WARNING")
            if len(unavailable) > 3:
                self._live_log(f"  └─ ...还有 {len(unavailable) - 3} 个", "INFO")
        
        # 3. 日期需求溢出 - 这是用户最关心的
        overflow = by_type.get("DEMAND_OVERFLOW", [])
        if overflow:
            self._live_log(f"📅 日期人力不足 ({len(overflow)} 天):", "WARNING")
            # 按缺口大小排序
            overflow_sorted = sorted(overflow, key=lambda c: int(c.details[0].split(":")[1].strip().replace(" 人", "")) if c.details else 0, reverse=True)
            for c in overflow_sorted[:5]:
                # 提取缺口数字
                gap_str = c.details[0] if c.details else ""
                self._live_log(f"  └─ {c.date}: 需求 vs 可用 → {c.reason}", "WARNING")
            if len(overflow) > 5:
                self._live_log(f"  └─ ...还有 {len(overflow) - 5} 天", "INFO")
        
        # 4. 技能（工种）供需瓶颈
        skill_shortage = by_type.get("SKILL_SHORTAGE", [])
        if skill_shortage:
            self._live_log(f"🔧 工种/技能人力不足 ({len(skill_shortage)} 项):", "ERROR")
            for c in skill_shortage[:5]:
                # reason 是 "工种/技能人力不足 (需X/有Y)"
                # op_name 是 skill_key
                self._live_log(f"  └─ {c.date} {c.op_name}: {c.reason.split('(')[1][:-1]}", "ERROR")
            if len(skill_shortage) > 5:
                self._live_log(f"  └─ ...还有 {len(skill_shortage) - 5} 项", "INFO")
        
        # 4. 夜班休息冲突
        night_rest = by_type.get("NIGHT_REST", [])
        if night_rest:
            self._live_log(f"🌙 夜班休息冲突 ({len(night_rest)} 天):", "WARNING")
            for c in night_rest[:3]:
                self._live_log(f"  └─ {c.date}: {c.reason}", "WARNING")

    
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

    def _detect_skill_supply_demand(self) -> None:
        """检测每日每种技能（操作类型）的供需瓶颈"""
        # 1. 按日期和 Op Code 聚合需求
        daily_skill_demand: Dict[str, Dict[str, int]] = {}  # date -> {skill_key: demand}
        
        for op_id, op in self.context.operations.items():
            date_key = op.planned_start[:10] if op.planned_start else None
            if not date_key:
                continue
            
            # 使用 operation_code 作为技能标识，fallback 到 operation_name
            skill_key = op.operation_code or op.operation_name
            if not skill_key:
                continue
                
            if date_key not in daily_skill_demand:
                daily_skill_demand[date_key] = {}
            if skill_key not in daily_skill_demand[date_key]:
                daily_skill_demand[date_key][skill_key] = 0
            
            daily_skill_demand[date_key][skill_key] += op.required_people
            
        # 2. 检查每一天的每个技能
        for date_key, skills in daily_skill_demand.items():
            for skill_key, demand in skills.items():
                # 计算该技能当天的供给
                capable_employees = set()
                
                # 找到对应此 skill_key 的所有 op_id（为了获取候选人）
                target_ops_params = [
                    (oid, o) for oid, o in self.context.operations.items() 
                    if (o.operation_code == skill_key or o.operation_name == skill_key)
                    and o.planned_start[:10] == date_key
                ]
                
                # 收集所有具备该技能的候选人
                for oid, _ in target_ops_params:
                    # 注意：context.operation_candidates 存的是 op_id -> [emp_ids]
                    cands = self.context.operation_candidates.get(oid, [])
                    capable_employees.update(cands)
                
                # 过滤掉当天不可用的人
                available_supply = 0
                
                for emp_id in capable_employees:
                    # 检查锁定休息
                    locked = self.context.locked_shifts.get((emp_id, date_key))
                    if locked and locked.plan_category == "REST":
                        continue
                    
                    # 检查请假
                    if self._is_unavailable(emp_id, date_key):
                        continue
                        
                    available_supply += 1
                
                # 检查是否不足
                if demand > available_supply:
                    gap = demand - available_supply
                    self.report.add_conflict(OperationConflict(
                        op_id=0, # 聚合冲突
                        op_name=f"{skill_key}",
                        date=date_key,
                        conflict_type="SKILL_SHORTAGE", # 自定义类型
                        severity=ConflictSeverity.CRITICAL.value,
                        reason=f"工种/技能人力不足 (需{demand}/有{available_supply})",
                        details=[
                            f"缺口: {gap} 人",
                            f"技能: {skill_key}",
                            f"当天可用人数: {available_supply}"
                        ]
                    ))
