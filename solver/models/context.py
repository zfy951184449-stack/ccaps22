"""
求解器上下文

管理求解过程中的所有数据和状态。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Dict, List, Set, Tuple, Optional
import logging

from contracts.request import (
    SolverRequest,
    OperationDemand,
    EmployeeProfile,
    CalendarDay,
    ShiftDefinition,
    SharedPreference,
    LockedOperation,
    LockedShift,
    HistoricalShift,
    EmployeeUnavailability,
    SolverConfig,
    PositionQualification,
)

logger = logging.getLogger(__name__)


@dataclass
class SolverContext:
    """求解器上下文
    
    包含求解过程中需要的所有预处理数据和查找表。
    """
    
    # 原始请求
    request: SolverRequest
    
    # ==================== 时间相关 ====================
    all_dates: List[str] = field(default_factory=list)  # 所有日期列表 (YYYY-MM-DD)
    date_to_index: Dict[str, int] = field(default_factory=dict)  # 日期 -> 索引
    
    # ==================== 日历信息 ====================
    calendar_info: Dict[str, CalendarDay] = field(default_factory=dict)  # 日期 -> 日历信息
    month_workdays: Dict[str, int] = field(default_factory=dict)  # 月份 -> 工作日数
    month_full_coverage: Dict[str, bool] = field(default_factory=dict)  # 月份是否完整覆盖
    quarter_workdays: Dict[str, int] = field(default_factory=dict)  # 季度 -> 工作日数
    quarter_full_coverage: Dict[str, bool] = field(default_factory=dict)  # 季度是否完整覆盖
    
    # ==================== 员工相关 ====================
    employees: Dict[int, EmployeeProfile] = field(default_factory=dict)  # 员工ID -> 员工信息
    employee_qualifications: Dict[int, Dict[int, int]] = field(default_factory=dict)  # 员工ID -> {资质ID -> 等级}
    employee_unavailability: Dict[int, List[Tuple[datetime, datetime]]] = field(default_factory=dict)  # 员工ID -> 不可用时段列表
    
    # ==================== 操作相关 ====================
    operations: Dict[int, OperationDemand] = field(default_factory=dict)  # 操作ID -> 操作信息
    operation_candidates: Dict[int, List[int]] = field(default_factory=dict)  # 操作ID -> 候选员工ID列表（兼容旧逻辑）
    operation_position_candidates: Dict[Tuple[int, int], List[int]] = field(default_factory=dict)  # (操作ID, 岗位编号) -> 候选员工ID列表
    operations_by_date: Dict[str, List[int]] = field(default_factory=dict)  # 日期 -> 操作ID列表
    
    # ==================== 共享组 ====================
    share_groups: Dict[str, List[int]] = field(default_factory=dict)  # 共享组ID -> 操作ID列表
    operation_share_group: Dict[int, str] = field(default_factory=dict)  # 操作ID -> 共享组ID
    share_anchor: Dict[str, int] = field(default_factory=dict)  # 共享组ID -> 锚点操作ID
    share_group_mode: Dict[str, str] = field(default_factory=dict)  # 共享组ID -> 模式 (SAME_TEAM/DIFFERENT)
    
    # ==================== 锁定信息 ====================
    locked_operations: Dict[int, Set[int]] = field(default_factory=dict)  # 操作ID -> 锁定的员工ID集合
    locked_shifts: Dict[Tuple[int, str], LockedShift] = field(default_factory=dict)  # (员工ID, 日期) -> 锁定班次
    
    # ==================== 历史班次（用于连续工作边界检查） ====================
    historical_shifts: List[HistoricalShift] = field(default_factory=list)  # 求解区间前的班次记录
    
    # ==================== 班次定义 ====================
    shift_definitions: List[ShiftDefinition] = field(default_factory=list)
    shift_by_id: Dict[int, ShiftDefinition] = field(default_factory=dict)
    
    # ==================== 配置 ====================
    config: SolverConfig = field(default_factory=SolverConfig)
    
    # ==================== 统计信息 ====================
    skipped_operations: List[int] = field(default_factory=list)  # 跳过的操作ID
    infeasible_operations: List[int] = field(default_factory=list)  # 无法满足的操作ID
    
    @classmethod
    def from_request(cls, request: SolverRequest) -> "SolverContext":
        """从请求创建上下文"""
        ctx = cls(request=request, config=request.config)
        
        # 构建日期列表
        ctx._build_date_list()
        
        # 构建日历信息
        ctx._build_calendar_info()
        
        # 构建员工信息
        ctx._build_employee_info()
        
        # 构建操作信息
        ctx._build_operation_info()
        
        # 构建共享组
        ctx._build_share_groups()
        
        # 构建锁定信息
        ctx._build_locked_info()
        
        # 构建班次定义
        ctx._build_shift_definitions()
        
        # 预计算候选人
        ctx._compute_candidates()
        
        logger.info(f"[上下文] 初始化完成: {len(ctx.all_dates)}天, "
                   f"{len(ctx.employees)}员工, {len(ctx.operations)}操作")
        
        return ctx
    
    def _build_date_list(self) -> None:
        """构建日期列表"""
        # 处理可能包含时间和时区的日期字符串
        start_str = self.request.window.start_date[:10]  # 只取 YYYY-MM-DD 部分
        end_str = self.request.window.end_date[:10]
        start = datetime.strptime(start_str, "%Y-%m-%d").date()
        end = datetime.strptime(end_str, "%Y-%m-%d").date()
        
        current = start
        index = 0
        while current <= end:
            date_str = current.isoformat()
            self.all_dates.append(date_str)
            self.date_to_index[date_str] = index
            current += timedelta(days=1)
            index += 1
    
    def _build_calendar_info(self) -> None:
        """构建日历信息"""
        # 首先从请求中加载日历数据
        for day in self.request.calendar:
            self.calendar_info[day.date] = day
        
        # 补充缺失的日期（使用默认值）
        for date_str in self.all_dates:
            if date_str not in self.calendar_info:
                # 默认：周一到周五是工作日
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                is_workday = dt.weekday() < 5
                self.calendar_info[date_str] = CalendarDay(
                    date=date_str,
                    is_workday=is_workday,
                    is_triple_salary=False,
                    standard_hours=8.0,
                )
        
        # 统计每月工作日数
        for date_str, day in self.calendar_info.items():
            month_key = date_str[:7]  # YYYY-MM
            if day.is_workday:
                self.month_workdays[month_key] = self.month_workdays.get(month_key, 0) + 1
        
        # 判断月份是否完整覆盖
        if self.all_dates:
            start_date = datetime.strptime(self.all_dates[0], "%Y-%m-%d")
            end_date = datetime.strptime(self.all_dates[-1], "%Y-%m-%d")
            
            for month_key in self.month_workdays.keys():
                year, month = map(int, month_key.split("-"))
                
                # 该月第一天
                month_start = datetime(year, month, 1)
                # 该月最后一天
                if month == 12:
                    month_end = datetime(year + 1, 1, 1) - timedelta(days=1)
                else:
                    month_end = datetime(year, month + 1, 1) - timedelta(days=1)
                
                # 检查是否完整覆盖
                self.month_full_coverage[month_key] = (
                    start_date.date() <= month_start.date() and
                    end_date.date() >= month_end.date()
                )
                
                if not self.month_full_coverage[month_key]:
                    logger.info(f"[日历] 月份 {month_key} 未完整覆盖（求解区间: {self.all_dates[0]} ~ {self.all_dates[-1]}）")
        
        # 统计季度工作日数
        for date_str, day in self.calendar_info.items():
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            quarter = (dt.month - 1) // 3 + 1
            quarter_key = f"{dt.year}-Q{quarter}"
            if day.is_workday:
                self.quarter_workdays[quarter_key] = self.quarter_workdays.get(quarter_key, 0) + 1
        
        # 判断季度是否完整覆盖
        if self.all_dates:
            start_date = datetime.strptime(self.all_dates[0], "%Y-%m-%d")
            end_date = datetime.strptime(self.all_dates[-1], "%Y-%m-%d")
            
            for quarter_key in self.quarter_workdays.keys():
                year, q = quarter_key.split("-Q")
                year = int(year)
                q = int(q)
                
                quarter_start = datetime(year, (q - 1) * 3 + 1, 1)
                if q == 4:
                    quarter_end = datetime(year + 1, 1, 1) - timedelta(days=1)
                else:
                    quarter_end = datetime(year, q * 3 + 1, 1) - timedelta(days=1)
                
                self.quarter_full_coverage[quarter_key] = (
                    start_date.date() <= quarter_start.date() and
                    end_date.date() >= quarter_end.date()
                )
    
    def _build_employee_info(self) -> None:
        """构建员工信息"""
        for emp in self.request.employee_profiles:
            self.employees[emp.employee_id] = emp
            
            # 构建资质查找表
            quals = {}
            for q in emp.qualifications:
                quals[q.qualification_id] = q.level
            self.employee_qualifications[emp.employee_id] = quals
        
        # 构建不可用时间段
        for unavail in self.request.employee_unavailability:
            emp_id = unavail.employee_id
            start_dt = datetime.fromisoformat(unavail.start_datetime.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(unavail.end_datetime.replace("Z", "+00:00"))
            
            if emp_id not in self.employee_unavailability:
                self.employee_unavailability[emp_id] = []
            self.employee_unavailability[emp_id].append((start_dt, end_dt))
    
    def _build_operation_info(self) -> None:
        """构建操作信息"""
        for op in self.request.operation_demands:
            self.operations[op.operation_plan_id] = op
            
            # 按日期分组
            op_date = op.planned_start[:10]  # YYYY-MM-DD
            if op_date not in self.operations_by_date:
                self.operations_by_date[op_date] = []
            self.operations_by_date[op_date].append(op.operation_plan_id)
    
    def _build_share_groups(self) -> None:
        """构建共享组"""
        for sp in self.request.shared_preferences:
            group_id = sp.share_group_id
            member_ops = [m.operation_plan_id for m in sp.members]
            
            self.share_groups[group_id] = member_ops
            self.share_group_mode[group_id] = sp.share_mode  # 记录共享模式
            
            # 记录每个操作所属的共享组
            for op_id in member_ops:
                self.operation_share_group[op_id] = group_id
            
            # 找到锚点（人数最多的操作）
            max_people = 0
            anchor_id = member_ops[0] if member_ops else None
            for m in sp.members:
                if m.required_people > max_people:
                    max_people = m.required_people
                    anchor_id = m.operation_plan_id
            
            if anchor_id:
                self.share_anchor[group_id] = anchor_id
    
    def _build_locked_info(self) -> None:
        """构建锁定信息"""
        for lo in self.request.locked_operations:
            self.locked_operations[lo.operation_plan_id] = set(lo.enforced_employee_ids)
        
        for ls in self.request.locked_shifts:
            key = (ls.employee_id, ls.date)
            self.locked_shifts[key] = ls
        
        # 存储历史班次（用于连续工作边界检查）
        self.historical_shifts = list(self.request.historical_shifts)
    
    def _build_shift_definitions(self) -> None:
        """构建班次定义"""
        self.shift_definitions = sorted(
            self.request.shift_definitions,
            key=lambda s: (s.priority, s.nominal_hours)  # 按优先级和工时排序
        )
        
        for shift in self.shift_definitions:
            self.shift_by_id[shift.shift_id] = shift
    
    def _compute_candidates(self) -> None:
        """预计算每个操作每个岗位的候选员工
        
        按岗位计算候选人，每个岗位有独立的资质要求。
        同时维护 operation_candidates 用于兼容旧的约束逻辑。
        
        注意：如果启用主管约束，TEAM_LEADER 及以上级别的员工不能参与操作（硬约束）。
        """
        # 判断是否需要排除高级别员工
        exclude_high_level = self.config.enforce_supervisor_constraints
        excluded_roles = {"TEAM_LEADER", "MANAGER"}
        
        for op_id, op in self.operations.items():
            all_candidates = set()  # 所有岗位的候选人并集
            
            # 构建岗位到资质需求的映射
            position_quals = {}
            for pos_qual in op.position_qualifications:
                position_quals[pos_qual.position_number] = pos_qual
            
            # 预计算无资质要求时的候选人列表（所有可用员工）
            default_candidates = []
            for emp_id, emp in self.employees.items():
                # 主管约束：排除 TEAM_LEADER 及以上级别
                if exclude_high_level and emp.org_role.upper() in excluded_roles:
                    continue
                
                if self.config.enforce_employee_unavailability:
                    if self._is_unavailable(emp_id, op):
                        continue
                default_candidates.append(emp_id)
            
            # 为每个岗位计算候选人
            for pos_num in range(1, op.required_people + 1):
                if pos_num in position_quals:
                    # 该岗位有资质要求
                    pos_qual = position_quals[pos_num]
                    pos_candidates = []
                    
                    for emp_id, emp in self.employees.items():
                        # 主管约束：排除 TEAM_LEADER 及以上级别
                        if exclude_high_level and emp.org_role.upper() in excluded_roles:
                            continue
                        
                        # 检查该岗位的资质要求
                        if not self._check_position_qualification(emp_id, pos_qual):
                            continue
                        
                        # 检查不可用
                        if self.config.enforce_employee_unavailability:
                            if self._is_unavailable(emp_id, op):
                                continue
                        
                        pos_candidates.append(emp_id)
                    
                    self.operation_position_candidates[(op_id, pos_num)] = pos_candidates
                    all_candidates.update(pos_candidates)
                    
                    if not pos_candidates:
                        logger.warning(f"[候选人] 操作 {op_id} 岗位 {pos_num} 无候选人（有资质要求）")
                else:
                    # 该岗位没有资质要求，所有可用员工都是候选人
                    self.operation_position_candidates[(op_id, pos_num)] = default_candidates.copy()
                    all_candidates.update(default_candidates)
                    logger.debug(f"[候选人] 操作 {op_id} 岗位 {pos_num} 无资质要求，使用全部可用员工 ({len(default_candidates)} 人)")
            
            # 添加锁定的员工到所有岗位候选人中
            if op_id in self.locked_operations:
                for emp_id in self.locked_operations[op_id]:
                    all_candidates.add(emp_id)
                    # 锁定员工需要分配到某个岗位，暂时加入所有岗位
                    for pos_num in range(1, op.required_people + 1):
                        key = (op_id, pos_num)
                        if key in self.operation_position_candidates:
                            if emp_id not in self.operation_position_candidates[key]:
                                self.operation_position_candidates[key].append(emp_id)
            
            # 兼容旧逻辑：operation_candidates 保存所有岗位候选人的并集
            self.operation_candidates[op_id] = list(all_candidates)
            
            if not all_candidates:
                self.skipped_operations.append(op_id)
                logger.warning(f"[候选人] 操作 {op_id} 所有岗位均无候选人，将被跳过")
    
    def _check_position_qualification(self, emp_id: int, pos_qual: PositionQualification) -> bool:
        """检查员工是否满足某个岗位的资质需求"""
        emp_quals = self.employee_qualifications.get(emp_id, {})
        
        for req in pos_qual.qualifications:
            emp_level = emp_quals.get(req.qualification_id, 0)
            if emp_level < req.min_level:
                return False
        
        return True
    
    def _check_qualification(self, emp_id: int, op: OperationDemand) -> bool:
        """检查员工是否满足操作的任一岗位资质需求（向后兼容）"""
        # 如果没有岗位资质要求，所有人都符合
        if not op.position_qualifications:
            return True
        
        # 只要满足任一岗位的要求即可
        for pos_qual in op.position_qualifications:
            if self._check_position_qualification(emp_id, pos_qual):
                return True
        
        return False
    
    def _is_unavailable(self, emp_id: int, op: OperationDemand) -> bool:
        """检查员工在操作时间段是否不可用"""
        unavail_periods = self.employee_unavailability.get(emp_id, [])
        if not unavail_periods:
            return False
        
        try:
            op_start = datetime.fromisoformat(op.planned_start.replace("Z", "+00:00"))
            op_end = datetime.fromisoformat(op.planned_end.replace("Z", "+00:00"))
        except:
            return False
        
        for start, end in unavail_periods:
            # 检查时间段是否重叠
            if not (op_end <= start or op_start >= end):
                return True
        
        return False
    
    def get_standard_hours(self, month: str) -> float:
        """获取指定月份的标准工时"""
        workdays = self.month_workdays.get(month, 0)
        return workdays * 8.0
    
    def get_quarter_standard_hours(self, quarter: str) -> float:
        """获取指定季度的标准工时"""
        workdays = self.quarter_workdays.get(quarter, 0)
        return workdays * 8.0
    
    def is_triple_salary(self, date_str: str) -> bool:
        """判断是否为三倍工资日"""
        day = self.calendar_info.get(date_str)
        return day.is_triple_salary if day else False
    
    def is_workday(self, date_str: str) -> bool:
        """判断是否为工作日"""
        day = self.calendar_info.get(date_str)
        return day.is_workday if day else False
    
    def get_date_month(self, date_str: str) -> str:
        """获取日期所属月份"""
        return date_str[:7]
    
    def get_date_quarter(self, date_str: str) -> str:
        """获取日期所属季度"""
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        quarter = (dt.month - 1) // 3 + 1
        return f"{dt.year}-Q{quarter}"

