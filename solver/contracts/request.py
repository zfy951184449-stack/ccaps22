"""
求解器输入数据结构定义

本模块定义了求解器接收的所有输入数据结构。
所有数据通过 JSON 格式从后端传递到求解器。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class QualificationMatchMode(str, Enum):
    """资质匹配模式"""
    EXACT = "EXACT"           # 精确匹配
    MINIMUM = "MINIMUM"       # 最低等级匹配（高等级向下兼容）


class PlanCategory(str, Enum):
    """班次类别"""
    WORK = "WORK"              # 工作（有班次安排）
    REST = "REST"              # 休息


@dataclass
class EmployeeQualification:
    """员工资质信息"""
    qualification_id: int       # 资质ID
    qualification_code: str     # 资质编码
    qualification_name: str     # 资质名称
    level: int                  # 资质等级（1-5，数字越大等级越高）


@dataclass
class EmployeeProfile:
    """员工档案
    
    包含员工的基本信息和资质信息。
    """
    employee_id: int                          # 员工ID
    employee_code: str                        # 员工工号
    employee_name: str                        # 员工姓名
    org_role: str                             # 组织角色: FRONTLINE, SHIFT_LEADER, GROUP_LEADER, TEAM_LEADER, MANAGER
    department_id: Optional[int] = None       # 部门ID
    team_id: Optional[int] = None             # 班组ID
    qualifications: List[EmployeeQualification] = field(default_factory=list)  # 持有的资质列表
    
    def has_qualification(self, qualification_id: int, min_level: int = 1) -> bool:
        """检查员工是否具有指定资质和最低等级"""
        for qual in self.qualifications:
            if qual.qualification_id == qualification_id and qual.level >= min_level:
                return True
        return False


@dataclass
class QualificationRequirement:
    """操作的资质需求"""
    qualification_id: int   # 资质ID
    min_level: int          # 最低等级要求


@dataclass
class PositionQualification:
    """岗位资质需求
    
    一个操作可能有多个岗位，每个岗位有不同的资质要求。
    例如：某操作需要3人，岗位1需要高级资质，岗位2/3只需要初级资质。
    """
    position_number: int                              # 岗位编号（从1开始）
    qualifications: List[QualificationRequirement] = field(default_factory=list)  # 该岗位的资质需求


@dataclass
class OperationDemand:
    """操作需求
    
    表示一个需要分配人员的操作任务。
    """
    # 必需字段（无默认值，必须放在最前面）
    operation_plan_id: int                  # 操作计划ID（主键）
    batch_id: int                           # 所属批次ID
    batch_code: str                         # 批次编号
    operation_id: int                       # 操作定义ID
    operation_code: str                     # 操作编码
    operation_name: str                     # 操作名称
    planned_start: str                      # 计划开始时间 (ISO 8601)
    planned_end: str                        # 计划结束时间 (ISO 8601)
    planned_duration_minutes: int           # 计划时长（分钟）
    
    # 可选字段（有默认值）
    stage_id: Optional[int] = None          # 阶段ID
    stage_name: Optional[str] = None        # 阶段名称
    required_people: int = 1                # 需求人数
    position_qualifications: List[PositionQualification] = field(default_factory=list)  # 按岗位的资质需求
    window_start: Optional[str] = None      # 时间窗口开始
    window_end: Optional[str] = None        # 时间窗口结束
    is_locked: bool = False                 # 是否锁定


@dataclass
class CalendarDay:
    """日历日信息
    
    包含工作日和节假日信息，来源于外部API（tianapi）。
    """
    date: str                               # 日期 (YYYY-MM-DD)
    is_workday: bool                        # 是否工作日
    is_triple_salary: bool = False          # 是否三倍工资日（法定节假日）
    holiday_name: Optional[str] = None      # 节假日名称
    holiday_type: Optional[str] = None      # 节假日类型
    
    # 统计用
    standard_hours: float = 8.0             # 标准工时（小时），通常为8


@dataclass
class ShiftDefinition:
    """班次定义
    
    定义可用的班次类型，包含时间和工时信息。
    """
    shift_id: int                           # 班次ID
    shift_code: str                         # 班次编码
    shift_name: str                         # 班次名称
    start_time: str                         # 开始时间 (HH:MM)
    end_time: str                           # 结束时间 (HH:MM)
    nominal_hours: float                    # 折算工时（小时）
    is_cross_day: bool = False              # 是否跨天
    is_night_shift: bool = False            # 是否夜班
    priority: int = 0                       # 优先级（数字越小优先级越高）


@dataclass
class SharedPreferenceMember:
    """共享组成员"""
    operation_plan_id: int                  # 操作计划ID
    required_people: int                    # 需求人数


@dataclass
class SharedPreference:
    """共享偏好（共享组）
    
    定义可以共享人员的操作组。
    同一共享组内的操作可以由同一人同时执行。
    """
    share_group_id: str                     # 共享组ID
    share_group_name: Optional[str] = None  # 共享组名称
    members: List[SharedPreferenceMember] = field(default_factory=list)  # 成员操作列表


@dataclass
class LockedOperation:
    """锁定的操作分配
    
    表示已经确定的操作-人员分配，求解器必须遵守。
    """
    operation_plan_id: int                  # 操作计划ID
    enforced_employee_ids: List[int]        # 强制分配的员工ID列表


@dataclass
class LockedShift:
    """锁定的班次
    
    表示已经确定的员工班次，求解器必须遵守。
    """
    employee_id: int                        # 员工ID
    date: str                               # 日期 (YYYY-MM-DD)
    plan_category: str                      # 班次类别: PRODUCTION, BASE, REST
    shift_id: Optional[int] = None          # 班次定义ID（可选）


@dataclass
class HistoricalShift:
    """历史班次记录
    
    用于连续工作约束和夜班休息约束的边界检查。
    存储求解区间之前的班次记录（不一定是锁定的）。
    """
    employee_id: int                        # 员工ID
    date: str                               # 日期 (YYYY-MM-DD)
    is_work: bool                           # 是否上班（PRODUCTION/BASE 为 True，REST/OVERTIME 为 False）
    is_night: bool = False                  # 是否夜班


@dataclass
class EmployeeUnavailability:
    """员工不可用时间段
    
    表示员工在指定时间段内不可安排工作。
    """
    employee_id: int                        # 员工ID
    start_datetime: str                     # 开始时间 (ISO 8601)
    end_datetime: str                       # 结束时间 (ISO 8601)
    reason_code: Optional[str] = None       # 原因代码
    reason_label: Optional[str] = None      # 原因描述


@dataclass
class SolverConfig:
    """求解器配置
    
    控制求解器的约束参数和行为。
    """
    # ==================== 月度工时约束（硬约束） ====================
    # 月度排班工时范围: [标准工时 - lower_offset, 标准工时 + upper_offset]
    monthly_hours_lower_offset: float = 4.0   # 月度工时下限偏移（小时），允许少于标准工时的小时数
    monthly_hours_upper_offset: float = 32.0  # 月度工时上限偏移（小时），允许超过标准工时的小时数
    enforce_monthly_hours: bool = True        # 是否启用月度工时约束
    
    # ==================== 季度工时约束（硬约束） ====================
    enforce_quarter_hours: bool = True        # 是否启用季度工时约束（仅完整季度）
    
    # ==================== 连续工作约束（硬约束） ====================
    max_consecutive_workdays: int = 6         # 最大连续工作天数（可在前端调整）
    enforce_consecutive_limit: bool = True    # 是否启用连续工作约束
    
    # ==================== 夜班约束 ====================
    night_rest_hard_days: int = 1             # x: 夜班后硬约束休息天数（默认1天）
    night_rest_soft_days: int = 2             # y: 夜班后软约束休息天数（默认2天，y >= x）
    night_rest_reward: int = 100              # 满足软约束奖励分（每人次）
    night_rest_penalty: int = 300             # 不满足软约束惩罚分（每人次）
    enforce_night_rest: bool = True           # 是否启用夜班休息约束
    
    # ==================== 三倍工资日约束（软约束） ====================
    minimize_triple_holiday_staff: bool = True # 是否最小化三倍工资日人数（软约束）
    
    # ==================== 缓冲期配置（已废弃） ====================
    # 注意：从 v2.1 开始，所有日历工作日都可以用于工时补足，不再需要配置缓冲期
    # 以下配置保留以保持向后兼容，但不再生效
    buffer_days_before_production: int = 0    # [已废弃] 生产期前缓冲天数
    buffer_days_after_production: int = 0     # [已废弃] 生产期后缓冲天数
    
    # ==================== 班次匹配 ====================
    shift_matching_tolerance_minutes: int = 30 # 班次匹配容差（分钟）
    
    # ==================== 求解器参数 ====================
    solver_time_limit_seconds: float = 600.0   # 求解时间限制（秒）= 10分钟
    solver_improvement_timeout: float = 120.0  # 无改进超时（秒）= 2分钟
    
    # ==================== 操作分配模块 ====================
    enable_operation_assignment: bool = True      # 是否启用操作分配模块
    skip_position_penalty: int = 50000            # 跳过位置（缺员）罚分
    sharing_violation_penalty: int = 1000         # 共享人员不满足罚分（每人次）
    
    # ==================== 班次一致性模块 ====================
    workday_rest_penalty: int = 10                # 工作日安排休息的罚分（每人次）
    non_workday_work_penalty: int = 1000          # 非工作日安排上班的罚分（每人次）
    
    # ==================== 主管约束模块 ====================
    enforce_supervisor_constraints: bool = True           # 是否启用主管约束
    group_leader_operation_penalty: int = 300             # S1a: GROUP_LEADER参与操作的罚分（每人每小时）
    no_group_leader_operation_reward: int = 100           # S1b: 操作中无GROUP_LEADER的奖励（每操作）
    no_supervisor_on_duty_penalty: int = 5000             # S2a: 有操作日无主管在岗罚分（硬约束降级，每天）
    extra_supervisor_non_workday_penalty: int = 3000      # S2b: 非工作日多余主管罚分（硬约束降级，每人次）
    team_leader_non_workday_penalty: int = 500            # S4: TEAM_LEADER非工作日上班罚分（每人次）
    rotation_violation_penalty: int = 200                 # S6: 轮流值班违规罚分（每次）
    
    # ==================== 公平性约束模块 ====================
    enforce_fairness: bool = True                         # 是否启用公平性约束
    night_shift_unfair_penalty: int = 500                 # F1: 夜班数量不公平罚分（每差1次）
    day_shift_unfair_penalty: int = 200                   # F2: 长白班数量不公平罚分（每差1次）
    night_interval_unfair_penalty: int = 300              # F3: 夜班间隔不均匀罚分（每次）
    operation_time_unfair_penalty: int = 50               # F4: 操作时长不公平罚分（每差1小时）
    
    # ==================== 随机扰动配置 ====================
    enable_random_perturbation: bool = True       # 是否启用随机扰动（增加结果多样性）
    random_seed: int = None                       # 随机种子（None则每次不同，指定值则可重现）
    perturbation_weight: int = 5                  # 扰动权重上限（1-10推荐，越大随机性越强）
    
    # ==================== 决策策略权重配置 ====================
    # 控制操作分配的优先级，权重越高的维度影响越大
    # 总和建议为 100，便于理解
    priority_weight_night: int = 30               # 夜班操作权重（夜班约束严格，优先分配）
    priority_weight_peak: int = 30                # 日期峰值权重（高峰日竞争激烈，优先分配）
    priority_weight_scarcity: int = 20            # 候选人稀缺度权重（候选少优先分配）
    priority_weight_frequency: int = 10           # 操作频率权重
    priority_weight_supervisor: int = 10          # 主管相关权重
    
    # ==================== 分层求解配置 ====================
    use_hierarchical_solving: bool = True         # 是否启用分层求解（默认开启）
    hierarchical_phase1_timeout: int = 180        # 阶段1超时（秒）：最大化覆盖率
    hierarchical_phase2_timeout: int = 240        # 阶段2超时（秒）：优化公平性
    hierarchical_enable_phase3: bool = False      # 是否启用阶段3（优化其他）
    
    # ==================== 其他 ====================
    enforce_employee_unavailability: bool = True  # 是否启用员工不可用约束


@dataclass
class SchedulingWindow:
    """求解时间窗口"""
    start_date: str                         # 开始日期 (YYYY-MM-DD)
    end_date: str                           # 结束日期 (YYYY-MM-DD)


@dataclass
class SolverRequest:
    """求解器请求
    
    包含求解器执行排班所需的所有输入数据。
    这是后端发送给求解器的完整数据包。
    """
    # 必需字段
    request_id: str                         # 请求ID（用于追踪和日志）
    window: SchedulingWindow                # 求解时间窗口
    operation_demands: List[OperationDemand] # 操作需求列表
    employee_profiles: List[EmployeeProfile] # 员工档案列表
    calendar: List[CalendarDay]             # 日历信息
    shift_definitions: List[ShiftDefinition] # 班次定义
    
    # 可选字段
    config: SolverConfig = field(default_factory=SolverConfig)  # 求解器配置
    shared_preferences: List[SharedPreference] = field(default_factory=list)  # 共享组
    locked_operations: List[LockedOperation] = field(default_factory=list)    # 锁定的操作
    locked_shifts: List[LockedShift] = field(default_factory=list)            # 锁定的班次
    employee_unavailability: List[EmployeeUnavailability] = field(default_factory=list)  # 员工不可用
    historical_shifts: List[HistoricalShift] = field(default_factory=list)    # 历史班次（用于连续工作边界检查）
    
    # 元数据
    target_batch_ids: List[int] = field(default_factory=list)  # 目标批次ID列表
    created_by: Optional[int] = None        # 创建者ID
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于JSON序列化）"""
        import dataclasses
        return dataclasses.asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SolverRequest":
        """从字典创建实例"""
        # 处理嵌套对象
        if "window" in data and isinstance(data["window"], dict):
            data["window"] = SchedulingWindow(**data["window"])
        
        if "config" in data and isinstance(data["config"], dict):
            # 确保整数字段正确转换
            cfg = data["config"]
            int_fields = [
                "max_consecutive_workdays",
                "night_shift_rest_days", 
                "buffer_days_before_production",
                "buffer_days_after_production",
                "shift_matching_tolerance_minutes",
                "solver_time_limit_seconds",
                "solver_improvement_timeout",
            ]
            for field in int_fields:
                if field in cfg and cfg[field] is not None:
                    cfg[field] = int(cfg[field])
            data["config"] = SolverConfig(**cfg)
        
        if "operation_demands" in data:
            demands = []
            for od in data["operation_demands"]:
                if isinstance(od, dict):
                    # 确保整数字段正确转换
                    int_fields = ["operation_plan_id", "batch_id", "operation_id", 
                                  "planned_duration_minutes", "stage_id", "required_people"]
                    for field in int_fields:
                        if field in od and od[field] is not None:
                            od[field] = int(od[field])
                    # 处理嵌套的 position_qualifications
                    if "position_qualifications" in od and od["position_qualifications"]:
                        parsed_positions = []
                        for pq in od["position_qualifications"]:
                            if isinstance(pq, dict):
                                # 转换岗位编号
                                if "position_number" in pq and pq["position_number"] is not None:
                                    pq["position_number"] = int(pq["position_number"])
                                # 转换该岗位的资质需求
                                if "qualifications" in pq and pq["qualifications"]:
                                    converted_quals = []
                                    for q in pq["qualifications"]:
                                        if isinstance(q, dict):
                                            if "qualification_id" in q and q["qualification_id"] is not None:
                                                q["qualification_id"] = int(q["qualification_id"])
                                            if "min_level" in q and q["min_level"] is not None:
                                                q["min_level"] = int(q["min_level"])
                                            converted_quals.append(QualificationRequirement(**q))
                                        else:
                                            converted_quals.append(q)
                                    pq["qualifications"] = converted_quals
                                parsed_positions.append(PositionQualification(**pq))
                            else:
                                parsed_positions.append(pq)
                        od["position_qualifications"] = parsed_positions
                    demands.append(OperationDemand(**od))
                else:
                    demands.append(od)
            data["operation_demands"] = demands
        
        if "employee_profiles" in data:
            profiles = []
            for ep in data["employee_profiles"]:
                if isinstance(ep, dict):
                    # 确保整数字段正确转换
                    int_fields = ["employee_id", "department_id", "team_id"]
                    for field in int_fields:
                        if field in ep and ep[field] is not None:
                            ep[field] = int(ep[field])
                    if "qualifications" in ep:
                        for q in ep["qualifications"]:
                            if isinstance(q, dict):
                                if "qualification_id" in q and q["qualification_id"] is not None:
                                    q["qualification_id"] = int(q["qualification_id"])
                                if "level" in q and q["level"] is not None:
                                    q["level"] = int(q["level"])
                        ep["qualifications"] = [
                            EmployeeQualification(**q) if isinstance(q, dict) else q
                            for q in ep["qualifications"]
                        ]
                    profiles.append(EmployeeProfile(**ep))
                else:
                    profiles.append(ep)
            data["employee_profiles"] = profiles
        
        if "calendar" in data:
            data["calendar"] = [
                CalendarDay(**cd) if isinstance(cd, dict) else cd
                for cd in data["calendar"]
            ]
        
        if "shift_definitions" in data:
            data["shift_definitions"] = [
                ShiftDefinition(**sd) if isinstance(sd, dict) else sd
                for sd in data["shift_definitions"]
            ]
        
        if "shared_preferences" in data:
            prefs = []
            for sp in data["shared_preferences"]:
                if isinstance(sp, dict):
                    # 处理嵌套的 members
                    if "members" in sp and sp["members"]:
                        sp["members"] = [
                            SharedPreferenceMember(**m) if isinstance(m, dict) else m
                            for m in sp["members"]
                        ]
                    prefs.append(SharedPreference(**sp))
                else:
                    prefs.append(sp)
            data["shared_preferences"] = prefs
        
        if "locked_operations" in data:
            data["locked_operations"] = [
                LockedOperation(**lo) if isinstance(lo, dict) else lo
                for lo in data["locked_operations"]
            ]
        
        if "locked_shifts" in data:
            data["locked_shifts"] = [
                LockedShift(**ls) if isinstance(ls, dict) else ls
                for ls in data["locked_shifts"]
            ]
        
        if "employee_unavailability" in data:
            data["employee_unavailability"] = [
                EmployeeUnavailability(**eu) if isinstance(eu, dict) else eu
                for eu in data["employee_unavailability"]
            ]
        
        if "historical_shifts" in data:
            data["historical_shifts"] = [
                HistoricalShift(**hs) if isinstance(hs, dict) else hs
                for hs in data["historical_shifts"]
            ]
        
        return cls(**data)

