"""求解器配置管理模块

统一管理所有求解器配置参数，包含验证和默认值处理。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Any
from utils.logging import logger


@dataclass
class SolverConfig:
    """求解器配置参数类
    
    包含所有求解器使用的配置参数，提供类型安全和默认值。
    """
    
    # ==================== 月度/季度工时约束 ====================
    monthly_min_hours: float = -16.0  # 相对标准工时的下限偏移（小时）
    monthly_max_hours: float = 16.0   # 相对标准工时的上限偏移（小时）
    enforce_monthly_hours: bool = True
    enforce_quarter_hours: bool = True
    
    # ==================== 求解器参数 ====================
    solver_time_limit: float = 30.0  # 求解器时间限制（秒）
    improvement_timeout: float = 60.0  # 改进超时（秒）
    
    # ==================== 基础约束 ====================
    max_consecutive_workdays: int = 6  # 最大连续工作天数
    enforce_consecutive_limit: bool = True
    enforce_employee_unavailability: bool = True
    
    # ==================== 夜班约束 ====================
    enforce_night_rest: bool = True
    night_shift_preferred_rest_days: int = 2  # 夜班后优选休息天数
    night_shift_minimum_rest_days: int = 2   # 夜班后最少休息天数（保留兼容性）
    
    # 夜班公平性
    enforce_night_fairness: bool = True
    max_consecutive_night_shifts: int = 1  # 最大连续夜班数
    night_shift_window_days: int = 14     # 夜班窗口天数
    max_night_shifts_per_window: int = 4  # 窗口内最大夜班数
    night_shift_min_gap_days: int = 2     # 夜班最小间隔天数
    
    # ==================== 惩罚权重 ====================
    # 夜班公平性权重
    night_shift_fairness_weight: int = 10
    night_shift_frontline_fairness_weight: int = 20
    
    # 主管约束权重
    prefer_no_leader_night: bool = True
    leader_night_penalty_weight: int = 50
    leader_long_day_threshold_hours: float = 10.0
    leader_long_day_penalty_weight: int = 30
    
    # 连续休息权重
    max_consecutive_rest_days: int = 3
    consecutive_rest_penalty_weight: int = 50
    
    # 三倍工资日权重
    minimize_triple_headcount: bool = False
    triple_holiday_penalty_weight: int = 10
    
    # 车间公平性权重
    enable_workshop_fairness: bool = False
    workshop_fairness_tolerance_hours: float = 0.0
    workshop_fairness_weight: int = 1
    
    # ==================== 人员偏好 ====================
    prefer_frontline_employees: bool = False
    
    @classmethod
    def from_dict(cls, config: Dict[str, Any], legacy_options: Dict[str, Any] = None) -> 'SolverConfig':
        """从字典创建配置对象
        
        Args:
            config: 主配置字典
            legacy_options: 旧版选项字典（可选，用于向后兼容）
            
        Returns:
            SolverConfig 实例
        """
        if legacy_options is None:
            legacy_options = {}
        
        # 辅助函数：获取配置值
        def get_float(key: str, default: float) -> float:
            value = config.get(key, default)
            if value is None:
                return default
            return float(value)
        
        def get_int(key: str, default: int) -> int:
            value = config.get(key, default)
            if value is None:
                return default
            return int(value)
        
        def get_bool(key: str, default: bool) -> bool:
            return bool(config.get(key, default))
        
        # 特殊处理：solver_time_limit 可能在 options 中
        solver_time_limit = get_float(
            "solverTimeLimit",
            legacy_options.get("solverTimeLimit", 30.0)
        )
        
        # 特殊处理：夜班窗口默认值计算
        night_shift_window_days = get_int("nightShiftWindowDays", 14)
        default_window_cap = night_shift_window_days // 7 + (1 if night_shift_window_days % 7 else 0)
        max_night_shifts_per_window = get_int("maxNightShiftsPerWindow", default_window_cap)
        
        # 创建配置实例
        instance = cls(
            # 月度工时
            monthly_min_hours=get_float("monthlyMinHours", -16.0),
            monthly_max_hours=get_float("monthlyMaxHours", 16.0),
            enforce_monthly_hours=get_bool("enforceMonthlyHours", True),
            enforce_quarter_hours=get_bool("enforceQuarterHours", True),
            
            # 求解器参数
            solver_time_limit=solver_time_limit,
            improvement_timeout=get_float("solverImprovementTimeoutSeconds", 60.0),
            
            # 基础约束
            max_consecutive_workdays=get_int("maxConsecutiveWorkdays", 6),
            enforce_consecutive_limit=get_bool("enforceConsecutiveLimit", True),
            enforce_employee_unavailability=get_bool("enforceEmployeeUnavailability", True),
            
            # 夜班约束
            enforce_night_rest=get_bool("enforceNightRest", True),
            night_shift_preferred_rest_days=get_int("nightShiftPreferredRestDays", 2),
            night_shift_minimum_rest_days=get_int("nightShiftMinimumRestDays", 2),
            
            # 夜班公平性
            enforce_night_fairness=get_bool("enforceNightFairness", True),
            max_consecutive_night_shifts=max(1, get_int("maxConsecutiveNightShifts", 1)),
            night_shift_window_days=night_shift_window_days,
            max_night_shifts_per_window=max(0, max_night_shifts_per_window),
            night_shift_min_gap_days=max(0, get_int("nightShiftMinGapDays", 2)),
            
            # 夜班权重
            night_shift_fairness_weight=max(0, get_int("nightShiftFairnessWeight", 10)),
            night_shift_frontline_fairness_weight=max(0, get_int("nightShiftFrontlineFairnessWeight", 20)),
            
            # 主管约束
            prefer_no_leader_night=get_bool("preferNoLeaderNight", True),
            leader_night_penalty_weight=max(0, get_int("leaderNightPenaltyWeight", 50)),
            leader_long_day_threshold_hours=max(0.0, get_float("leaderLongDayThresholdHours", 10.0)),
            leader_long_day_penalty_weight=max(0, get_int("leaderLongDayPenaltyWeight", 30)),
            
            # 连续休息
            max_consecutive_rest_days=max(0, get_int("maxConsecutiveRestDays", 3)),
            consecutive_rest_penalty_weight=max(0, get_int("consecutiveRestPenaltyWeight", 50)),
            
            # 三倍工资日
            minimize_triple_headcount=get_bool("minimizeTripleHolidayHeadcount", False),
            triple_holiday_penalty_weight=max(0, get_int("tripleHolidayPenaltyWeight", 10)),
            
            # 车间公平性
            enable_workshop_fairness=get_bool("enableWorkshopFairness", False),
            workshop_fairness_tolerance_hours=max(0.0, get_float("workshopFairnessToleranceHours", 0.0)),
            workshop_fairness_weight=max(0, get_int("workshopFairnessWeight", 1)),
            
            # 人员偏好
            prefer_frontline_employees=get_bool("preferFrontlineEmployees", False),
        )
        
        # 验证配置
        instance.validate()
        
        return instance
    
    def validate(self):
        """验证配置参数的合法性"""
        warnings = []
        
        # 验证月度工时偏移
        if self.monthly_min_hours > 0:
            warnings.append(f"monthlyMinHours 应为负数或0，当前值: {self.monthly_min_hours}")
        if self.monthly_max_hours < 0:
            warnings.append(f"monthlyMaxHours 应为正数或0，当前值: {self.monthly_max_hours}")
        
        # 验证连续工作天数
        if self.max_consecutive_workdays <= 0 and self.enforce_consecutive_limit:
            warnings.append(f"maxConsecutiveWorkdays 必须大于0，当前值: {self.max_consecutive_workdays}")
        
        # 验证夜班窗口
        if self.night_shift_window_days <= 0:
            warnings.append(f"nightShiftWindowDays 必须大于0，当前值: {self.night_shift_window_days}")
        
        # 验证求解器时间限制
        if self.solver_time_limit <= 0:
            warnings.append(f"solverTimeLimit 必须大于0，当前值: {self.solver_time_limit}")
        
        # 输出警告
        for warning in warnings:
            logger.warning(f"[配置验证] {warning}")
        
        return len(warnings) == 0
    
    def get_leader_long_day_threshold_minutes(self) -> int:
        """获取主管长白班阈值（分钟）"""
        return int(self.leader_long_day_threshold_hours * 60)
    
    def get_workshop_fairness_tolerance_minutes(self) -> int:
        """获取车间公平性容差（分钟）"""
        return int(round(self.workshop_fairness_tolerance_hours * 60))
    
    def to_log_summary(self) -> Dict[str, Any]:
        """生成用于日志的配置摘要"""
        return {
            "enforceMonthlyHours": self.enforce_monthly_hours,
            "enforceNightRest": self.enforce_night_rest,
            "enforceConsecutiveLimit": self.enforce_consecutive_limit,
            "enforceQuarterHours": self.enforce_quarter_hours,
            "enforceEmployeeUnavailability": self.enforce_employee_unavailability,
            "enforceNightFairness": self.enforce_night_fairness,
            "preferNoLeaderNight": self.prefer_no_leader_night,
            "maxConsecutiveWorkdays": self.max_consecutive_workdays,
            "maxConsecutiveNightShifts": self.max_consecutive_night_shifts,
            "nightShiftMinGapDays": self.night_shift_min_gap_days,
            "nightShiftWindowDays": self.night_shift_window_days,
            "maxNightShiftsPerWindow": self.max_night_shifts_per_window,
            "nightShiftFairnessWeight": self.night_shift_fairness_weight,
            "leaderNightPenaltyWeight": self.leader_night_penalty_weight,
            "leaderLongDayThresholdHours": self.leader_long_day_threshold_hours,
            "solverTimeLimit": self.solver_time_limit,
        }
