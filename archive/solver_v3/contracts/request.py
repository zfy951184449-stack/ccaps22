"""
V3 求解器请求数据契约

定义求解器输入的标准格式。
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import date, datetime


@dataclass
class OperationData:
    """操作数据"""
    id: int
    batch_id: int
    operation_name: str
    required_people: int
    planned_start: datetime
    planned_end: datetime
    duration_minutes: int
    required_qualifications: List[int] = field(default_factory=list)
    share_group_id: Optional[int] = None
    priority: str = "NORMAL"  # CRITICAL, NORMAL, LOW


@dataclass
class EmployeeData:
    """员工数据"""
    id: int
    name: str
    employee_code: str
    role: str  # OPERATOR, GROUP_LEADER, TEAM_LEADER
    qualifications: List[int] = field(default_factory=list)
    unavailable_periods: List[Dict[str, str]] = field(default_factory=list)  # [{start_date, end_date}]


@dataclass
class ShiftTypeData:
    """班次类型数据"""
    id: int
    shift_code: str
    shift_name: str
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    work_hours: float
    is_night_shift: bool = False


@dataclass
class CalendarDayData:
    """日历日期数据"""
    date: str  # YYYY-MM-DD
    is_workday: bool
    is_triple_pay: bool = False


@dataclass
class ShareGroupData:
    """共享组数据"""
    id: int
    group_name: str
    group_type: str  # SAME_TEAM, SAME_PERSON, etc.
    operation_ids: List[int] = field(default_factory=list)


@dataclass 
class BoundaryStateData:
    """边界状态数据 (用于跨日约束)"""
    employee_id: int
    last_work_date: Optional[str] = None
    consecutive_work_days: int = 0
    last_night_shift_date: Optional[str] = None
    accumulated_hours: float = 0.0


@dataclass
class SolverConfig:
    """求解器配置"""
    # 基础配置
    solver_time_limit_seconds: int = 60
    solver_improvement_timeout: int = 30
    num_workers: int = 8
    
    # 硬约束开关
    enforce_qualification: bool = True
    enforce_consecutive_limit: bool = True
    enforce_night_rest: bool = True
    enforce_monthly_hours: bool = True
    max_consecutive_workdays: int = 6
    night_rest_hard_days: int = 1
    monthly_hours_lower_offset: int = 4
    monthly_hours_upper_offset: int = 32
    
    # 软约束开关与权重
    enforce_fairness: bool = True
    skip_position_penalty: int = 1000
    sharing_violation_penalty: int = 1000
    night_rest_soft_days: int = 2
    night_rest_penalty: int = 500
    non_workday_work_penalty: int = 1000
    supervisor_night_penalty: int = 2000
    compensation_rest_penalty: int = 500
    
    @property
    def time_limit_seconds(self) -> int:
        """兼容属性"""
        return self.solver_time_limit_seconds


@dataclass
class SolverRequest:
    """
    V3 求解器请求
    
    包含求解所需的所有输入数据。
    """
    # 核心数据
    operations: List[OperationData] = field(default_factory=list)
    employees: List[EmployeeData] = field(default_factory=list)
    shift_types: List[ShiftTypeData] = field(default_factory=list)
    calendar_days: List[CalendarDayData] = field(default_factory=list)
    
    # 约束相关
    share_groups: List[ShareGroupData] = field(default_factory=list)
    boundary_states: List[BoundaryStateData] = field(default_factory=list)
    
    # 配置
    config: SolverConfig = field(default_factory=SolverConfig)
    
    # 元数据
    run_id: Optional[str] = None
    window_start: Optional[str] = None  # YYYY-MM-DD
    window_end: Optional[str] = None    # YYYY-MM-DD
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SolverRequest':
        """从字典创建请求对象"""
        # 解析操作
        operations = [
            OperationData(**op) if isinstance(op, dict) else op
            for op in data.get('operations', [])
        ]
        
        # 解析员工
        employees = [
            EmployeeData(**emp) if isinstance(emp, dict) else emp
            for emp in data.get('employees', [])
        ]
        
        # 解析班次类型
        shift_types = [
            ShiftTypeData(**st) if isinstance(st, dict) else st
            for st in data.get('shift_types', [])
        ]
        
        # 解析日历
        calendar_days = [
            CalendarDayData(**cd) if isinstance(cd, dict) else cd
            for cd in data.get('calendar_days', [])
        ]
        
        # 解析共享组
        share_groups = [
            ShareGroupData(**sg) if isinstance(sg, dict) else sg
            for sg in data.get('share_groups', [])
        ]
        
        # 解析边界状态
        boundary_states = [
            BoundaryStateData(**bs) if isinstance(bs, dict) else bs
            for bs in data.get('boundary_states', [])
        ]
        
        # 解析配置
        config_data = data.get('config', {})
        config = SolverConfig(**config_data) if config_data else SolverConfig()
        
        return cls(
            operations=operations,
            employees=employees,
            shift_types=shift_types,
            calendar_days=calendar_days,
            share_groups=share_groups,
            boundary_states=boundary_states,
            config=config,
            run_id=data.get('run_id'),
            window_start=data.get('window_start'),
            window_end=data.get('window_end'),
        )
