"""
求解器输出数据结构定义

本模块定义了求解器返回的所有输出数据结构。
所有数据通过 JSON 格式从求解器传递到后端。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class SolverStatus(str, Enum):
    """求解器状态"""
    OPTIMAL = "OPTIMAL"           # 找到最优解
    FEASIBLE = "FEASIBLE"         # 找到可行解（可能不是最优）
    INFEASIBLE = "INFEASIBLE"     # 无可行解
    TIMEOUT = "TIMEOUT"           # 超时
    ERROR = "ERROR"               # 错误
    

class WarningType(str, Enum):
    """警告类型"""
    OPERATION_SKIPPED = "OPERATION_SKIPPED"               # 操作被跳过
    INSUFFICIENT_CANDIDATES = "INSUFFICIENT_CANDIDATES"   # 候选人不足
    SHIFT_MISMATCH = "SHIFT_MISMATCH"                     # 班次不匹配
    QUALIFICATION_MISMATCH = "QUALIFICATION_MISMATCH"     # 资质不匹配
    CAPACITY_WARNING = "CAPACITY_WARNING"                 # 产能警告
    CONSTRAINT_RELAXED = "CONSTRAINT_RELAXED"             # 约束被放松


@dataclass
class OperationAssignment:
    """操作分配结果
    
    表示一个操作的某个岗位被分配给一个员工。
    """
    operation_plan_id: int      # 操作计划ID
    position_number: int        # 岗位编号
    employee_id: int            # 员工ID


@dataclass
class ShiftPlanOperation:
    """班次计划中的操作详情"""
    operation_plan_id: int      # 操作计划ID
    planned_start: str          # 计划开始时间 (ISO 8601)
    planned_end: str            # 计划结束时间 (ISO 8601)
    duration_minutes: int       # 时长（分钟）


@dataclass
class ShiftPlan:
    """班次计划
    
    表示一个员工在某一天的排班结果。
    """
    employee_id: int                        # 员工ID
    date: str                               # 日期 (YYYY-MM-DD)
    plan_type: str                          # 计划类型: WORK, REST
    plan_hours: float                       # 计划工时（小时）
    
    # 班次信息（如果是工作日）
    shift_id: Optional[int] = None          # 班次定义ID
    shift_code: Optional[str] = None        # 班次编码
    shift_name: Optional[str] = None        # 班次名称
    shift_nominal_hours: Optional[float] = None  # 班次折算工时
    is_night_shift: bool = False            # 是否夜班
    
    # 操作信息
    operations: List[ShiftPlanOperation] = field(default_factory=list)
    
    # 车间工时（操作工时总和）
    workshop_minutes: int = 0               # 车间工时（分钟）
    
    # 是否为加班（三倍工资日排班）
    is_overtime: bool = False               # 是否加班
    
    # 是否在缓冲期（无操作但有班次，用于工时补足）
    is_buffer: bool = False                 # 是否缓冲期


@dataclass
class HoursSummary:
    """工时统计摘要
    
    按员工按月统计的工时信息。
    """
    employee_id: int                        # 员工ID
    month: str                              # 月份 (YYYY-MM)
    
    # 排班工时（用于月度/季度约束判断）
    scheduled_hours: float                  # 排班工时总计
    standard_hours: float                   # 标准工时（工作日数 × 8）
    hours_deviation: float                  # 偏差（排班工时 - 标准工时）
    
    # 车间工时（操作工时）
    workshop_hours: float                   # 车间工时总计
    
    # 加班工时（三倍工资日）
    overtime_hours: float                   # 加班工时总计
    
    # 工作天数统计
    work_days: int = 0                      # 工作天数
    rest_days: int = 0                      # 休息天数
    buffer_days: int = 0                    # 缓冲期天数（无操作但有班次）
    
    # 是否满足约束
    is_within_bounds: bool = True           # 是否在工时范围内


@dataclass
class SolverWarning:
    """求解器警告
    
    记录求解过程中的警告信息。
    """
    type: str                               # 警告类型
    message: str                            # 警告消息
    count: Optional[int] = None             # 相关数量
    operation_ids: List[int] = field(default_factory=list)  # 相关操作ID
    employee_ids: List[int] = field(default_factory=list)   # 相关员工ID


@dataclass
class SolverDiagnostics:
    """求解器诊断信息
    
    包含求解过程的详细统计和诊断信息。
    """
    # 输入统计
    total_operations: int                   # 总操作数
    total_employees: int                    # 总员工数
    total_days: int                         # 总天数
    
    # 输出统计
    assigned_operations: int                # 已分配操作数
    skipped_operations: int                 # 跳过的操作数
    shift_plans_created: int                # 创建的班次计划数
    
    # 求解统计
    solve_time_seconds: float               # 求解时间（秒）
    solutions_found: int                    # 找到的解数量
    objective_value: Optional[float] = None # 目标函数值
    
    # 约束满足情况
    monthly_hours_violations: int = 0       # 月度工时约束违规数
    consecutive_work_violations: int = 0    # 连续工作约束违规数
    night_rest_violations: int = 0          # 夜班休息约束违规数
    
    # 资源利用率
    employee_utilization_rate: float = 0.0  # 员工利用率
    operation_fulfillment_rate: float = 0.0 # 操作满足率


class RootCauseType(str, Enum):
    """根因类型"""
    NO_CANDIDATES = "NO_CANDIDATES"                 # 无候选人
    CANDIDATES_UNAVAILABLE = "CANDIDATES_UNAVAILABLE"  # 候选人不可用
    DEMAND_OVERFLOW = "DEMAND_OVERFLOW"             # 需求超出供给
    HOURS_CONFLICT = "HOURS_CONFLICT"               # 工时约束冲突
    TIME_CONFLICT = "TIME_CONFLICT"                 # 时间冲突
    CONSECUTIVE_LIMIT = "CONSECUTIVE_LIMIT"         # 连续工作限制
    NIGHT_REST = "NIGHT_REST"                       # 夜班休息冲突
    OTHER = "OTHER"                                 # 其他原因


@dataclass
class RootCause:
    """根因详情
    
    描述导致无解的具体原因。
    """
    type: str                               # 根因类型
    severity: str                           # 严重程度: CRITICAL, WARNING
    summary: str                            # 一句话描述
    affected_operations: List[int] = field(default_factory=list)   # 受影响的操作ID
    affected_employees: List[int] = field(default_factory=list)    # 受影响的员工ID
    affected_dates: List[str] = field(default_factory=list)        # 受影响的日期
    details: List[str] = field(default_factory=list)               # 详细说明
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "severity": self.severity,
            "summary": self.summary,
            "affected_operations": self.affected_operations,
            "affected_employees": self.affected_employees,
            "affected_dates": self.affected_dates,
            "details": self.details,
        }


@dataclass
class InfeasibilityReport:
    """无解诊断报告
    
    当求解器返回 INFEASIBLE 时，提供结构化的诊断信息。
    """
    summary: str                            # 一句话摘要
    root_causes: List[RootCause] = field(default_factory=list)       # 根因列表（按严重程度排序）
    suggestions: List[str] = field(default_factory=list)             # 修复建议
    constraint_stats: Dict[str, int] = field(default_factory=dict)   # 各约束模块添加的约束数
    
    # 统计信息
    critical_count: int = 0                 # 严重问题数量
    warning_count: int = 0                  # 警告数量
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "root_causes": [rc.to_dict() for rc in self.root_causes],
            "suggestions": self.suggestions,
            "constraint_stats": self.constraint_stats,
            "critical_count": self.critical_count,
            "warning_count": self.warning_count,
        }
    
    @classmethod
    def from_analysis(cls, analysis_text: str, conflict_report: Optional[Dict] = None) -> "InfeasibilityReport":
        """从分析文本和冲突报告创建结构化报告"""
        root_causes = []
        suggestions = []
        critical_count = 0
        warning_count = 0
        
        # 统计各类冲突
        type_counts = {}
        overflow_dates = []  # 人力不足的日期
        no_candidate_ops = []  # 无候选人的操作
        
        # 从冲突报告提取根因
        if conflict_report:
            for conflict in conflict_report.get("critical_conflicts", []):
                conflict_type = conflict.get("conflict_type", "OTHER")
                type_counts[conflict_type] = type_counts.get(conflict_type, 0) + 1
                
                root_causes.append(RootCause(
                    type=conflict_type,
                    severity="CRITICAL",
                    summary=conflict.get("reason", "未知原因"),
                    affected_operations=[conflict.get("op_id")] if conflict.get("op_id") else [],
                    affected_dates=[conflict.get("date")] if conflict.get("date") else [],
                    details=conflict.get("details", []),
                ))
                critical_count += 1
                
                # 收集具体信息
                if conflict_type == "NO_CANDIDATES":
                    no_candidate_ops.append(conflict.get("op_name", "未知操作"))
            
            for warning in conflict_report.get("warnings", []):
                conflict_type = warning.get("conflict_type", "OTHER")
                type_counts[conflict_type] = type_counts.get(conflict_type, 0) + 1
                
                root_causes.append(RootCause(
                    type=conflict_type,
                    severity="WARNING",
                    summary=warning.get("reason", "未知警告"),
                    affected_operations=[warning.get("op_id")] if warning.get("op_id") else [],
                    affected_dates=[warning.get("date")] if warning.get("date") else [],
                    details=warning.get("details", []),
                ))
                warning_count += 1
                
                # 收集具体日期
                if conflict_type == "DEMAND_OVERFLOW" and warning.get("date"):
                    overflow_dates.append(warning.get("date"))
        
        # 根据冲突类型生成具体建议
        if type_counts.get("NO_CANDIDATES", 0) > 0:
            if no_candidate_ops:
                suggestions.append(f"🔴 {len(no_candidate_ops)} 个操作无候选人（如: {', '.join(no_candidate_ops[:2])}），检查资质要求")
            else:
                suggestions.append("🔴 有操作无候选人，检查资质要求是否过严")
        
        if type_counts.get("ALL_UNAVAILABLE", 0) > 0:
            suggestions.append(f"🟡 {type_counts['ALL_UNAVAILABLE']} 个操作的候选人当天不可用，检查员工休假/排班")
        
        if type_counts.get("SKILL_SHORTAGE", 0) > 0:
            count = type_counts['SKILL_SHORTAGE']
            suggestions.append(f"🔴 {count} 个工种/技能出现人力缺口，请增加对应资质员工")
        
        if type_counts.get("DEMAND_OVERFLOW", 0) > 0:
            if overflow_dates:
                sorted_dates = sorted(overflow_dates)[:3]
                suggestions.append(f"🟡 {len(overflow_dates)} 天人力不足（{', '.join(sorted_dates)}...），建议增加人手或调整排班")
            else:
                suggestions.append("🟡 部分日期人力需求 > 可用人数，建议增加人手")
        
        if type_counts.get("NIGHT_REST", 0) > 0:
            suggestions.append(f"🌙 夜班休息规则导致 {type_counts['NIGHT_REST']} 天可用人数减少，考虑调整夜班安排")
        
        # 通用建议
        if not suggestions:
            suggestions.append("💡 约束组合过于严格，尝试在高级设置中临时关闭部分约束重试")
        else:
            suggestions.append("💡 可在高级设置中临时关闭部分约束（如月度工时、连续工作限制）重试")
        
        # 生成摘要
        if critical_count > 0:
            summary = f"发现 {critical_count} 个严重问题导致无解"
        elif warning_count > 0:
            summary = f"发现 {warning_count} 个警告，可能导致无解"
        else:
            summary = "约束过于严格，建议放宽条件"
        
        return cls(
            summary=summary,
            root_causes=root_causes,
            suggestions=suggestions,
            critical_count=critical_count,
            warning_count=warning_count,
        )


@dataclass
class SolverResponse:
    """求解器响应
    
    包含求解器的完整输出结果。
    这是求解器返回给后端的完整数据包。
    """
    # 状态信息
    request_id: str                         # 请求ID（对应输入的request_id）
    status: str                             # 求解状态: OPTIMAL, FEASIBLE, INFEASIBLE, TIMEOUT, ERROR
    summary: str                            # 结果摘要描述
    
    # 核心结果
    assignments: List[OperationAssignment] = field(default_factory=list)  # 操作分配
    shift_plans: List[ShiftPlan] = field(default_factory=list)            # 班次计划
    
    # 工时统计
    hours_summaries: List[HoursSummary] = field(default_factory=list)     # 工时摘要
    
    # 警告和诊断
    warnings: List[SolverWarning] = field(default_factory=list)           # 警告列表
    diagnostics: Optional[SolverDiagnostics] = None                       # 诊断信息
    
    # 约束冲突报告
    conflict_report: Optional[Dict[str, Any]] = None                      # 冲突检测报告
    
    # 无解诊断报告
    infeasibility_report: Optional[InfeasibilityReport] = None            # 结构化无解报告
    
    # 错误信息（当status为ERROR或INFEASIBLE时）
    error_message: Optional[str] = None     # 错误消息
    error_details: Optional[Dict[str, Any]] = None  # 错误详情
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于JSON序列化）"""
        import dataclasses
        
        def convert(obj):
            if dataclasses.is_dataclass(obj):
                return {k: convert(v) for k, v in dataclasses.asdict(obj).items()}
            elif isinstance(obj, list):
                return [convert(i) for i in obj]
            elif isinstance(obj, Enum):
                return obj.value
            else:
                return obj
        
        return convert(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SolverResponse":
        """从字典创建实例"""
        if "assignments" in data:
            data["assignments"] = [
                OperationAssignment(**a) if isinstance(a, dict) else a
                for a in data["assignments"]
            ]
        
        if "shift_plans" in data:
            plans = []
            for sp in data["shift_plans"]:
                if isinstance(sp, dict):
                    if "operations" in sp:
                        sp["operations"] = [
                            ShiftPlanOperation(**op) if isinstance(op, dict) else op
                            for op in sp["operations"]
                        ]
                    plans.append(ShiftPlan(**sp))
                else:
                    plans.append(sp)
            data["shift_plans"] = plans
        
        if "hours_summaries" in data:
            data["hours_summaries"] = [
                HoursSummary(**hs) if isinstance(hs, dict) else hs
                for hs in data["hours_summaries"]
            ]
        
        if "warnings" in data:
            data["warnings"] = [
                SolverWarning(**w) if isinstance(w, dict) else w
                for w in data["warnings"]
            ]
        
        if "diagnostics" in data and isinstance(data["diagnostics"], dict):
            data["diagnostics"] = SolverDiagnostics(**data["diagnostics"])
        
        return cls(**data)
    
    @classmethod
    def create_error(cls, request_id: str, message: str, details: Optional[Dict] = None) -> "SolverResponse":
        """创建错误响应"""
        return cls(
            request_id=request_id,
            status=SolverStatus.ERROR.value,
            summary=f"求解失败: {message}",
            error_message=message,
            error_details=details,
        )
    
    @classmethod
    def create_infeasible(
        cls,
        request_id: str,
        reason: str,
        diagnostics: Optional[SolverDiagnostics] = None,
        conflict_report: Optional[Dict[str, Any]] = None,
    ) -> "SolverResponse":
        """创建无可行解响应"""
        # 生成结构化的无解报告
        infeasibility_report = InfeasibilityReport.from_analysis(reason, conflict_report)
        
        return cls(
            request_id=request_id,
            status=SolverStatus.INFEASIBLE.value,
            summary=f"无可行解: {infeasibility_report.summary}",
            diagnostics=diagnostics,
            conflict_report=conflict_report,
            infeasibility_report=infeasibility_report,
            error_message=reason,
        )

