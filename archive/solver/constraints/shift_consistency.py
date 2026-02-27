"""
班次一致性约束

确保班次变量与操作分配保持一致。
"""

from __future__ import annotations
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from ortools.sat.python import cp_model

from .base import BaseConstraint
from models.context import SolverContext
from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class ShiftConsistencyConstraint(BaseConstraint):
    """班次一致性约束
    
    硬约束：
    1. 每天只能有一种班次状态（上班/休息）
    2. 有操作任务时必须上班，且班次必须覆盖所有操作时间段
    3. 班次只能从已启用的班次定义中选择（包括 REST 休息班次）
    
    软约束：
    4. 没有操作的日子，尽可能按正常节奏工作：
       - 工作日安排休息：罚分（默认 10分/人次）
       - 非工作日安排上班：罚分（默认 1000分/人次）
    """
    
    name = "ShiftConsistency"
    
    def __init__(self, model: cp_model.CpModel, context: SolverContext, variables: ModelVariables):
        super().__init__(model, context, variables)
        
        # 缓存：REST 班次ID
        self._rest_shift_id: Optional[int] = None
        self._find_rest_shift()
    
    def _find_rest_shift(self) -> None:
        """查找 REST 班次定义"""
        for shift in self.context.shift_definitions:
            if shift.shift_code and shift.shift_code.upper() == 'REST':
                self._rest_shift_id = shift.shift_id
                logger.info(f"[{self.name}] 找到休息班次: ID={shift.shift_id}, Code={shift.shift_code}")
                return
        
        # 如果没有找到，查找 nominal_hours == 0 的班次
        for shift in self.context.shift_definitions:
            if shift.nominal_hours == 0:
                self._rest_shift_id = shift.shift_id
                logger.info(f"[{self.name}] 使用 0 工时班次作为休息班次: ID={shift.shift_id}")
                return
        
        logger.warning(f"[{self.name}] 未找到 REST 班次定义")
    
    def apply(self) -> None:
        """应用班次一致性约束"""
        # 先标记缓冲日（可用于工时补足的日期）
        self._compute_buffer_days()
        
        for emp_id in self.context.employees.keys():
            self._apply_employee_shifts(emp_id)
        
        # 记录统计信息
        self._log_statistics()
        self.log_summary()
    
    def _compute_buffer_days(self) -> None:
        """标记可用于工时补足的缓冲日
        
        缓冲日的定义：
        - 日历工作日，但当天没有操作安排
        - 员工可以在这些天上班以补足月度工时，也可以选择休息
        """
        for emp_id in self.context.employees.keys():
            for date_str in self.context.all_dates:
                is_calendar_workday = self.context.is_workday(date_str)
                has_ops = date_str in self.context.operations_by_date
                
                # 工作日但没有操作 = 缓冲日
                if is_calendar_workday and not has_ops:
                    self.variables.day_is_buffer[(emp_id, date_str)] = True
    
    def _apply_employee_shifts(self, emp_id: int) -> None:
        """为单个员工应用班次约束"""
        for date_key in self.context.all_dates:
            # 创建班次变量
            work_var = self.model.NewBoolVar(f"work_{emp_id}_{date_key}")
            rest_var = self.model.NewBoolVar(f"rest_{emp_id}_{date_key}")
            
            self.variables.shift_vars[(emp_id, date_key, "WORK")] = work_var
            self.variables.shift_vars[(emp_id, date_key, "REST")] = rest_var
            
            # 约束1：互斥（每天只能有一种班次状态）
            self.model.Add(work_var + rest_var == 1)
            self.constraints_added += 1
            
            # 约束2：有操作时必须上班
            has_work = self.variables.day_has_work.get((emp_id, date_key))
            if has_work is not None:
                self.model.Add(work_var >= has_work)
                self.constraints_added += 1
            
            # 约束3：处理锁定班次
            self._apply_locked_shift(emp_id, date_key, work_var, rest_var)
            
            # 约束4：处理没有操作的日子（软约束）
            self._apply_rhythm_preference(emp_id, date_key, work_var, rest_var)
            
            # 计算当日工时
            self._compute_daily_hours(emp_id, date_key, work_var)
    
    def _apply_locked_shift(
        self,
        emp_id: int,
        date_key: str,
        work_var: cp_model.IntVar,
        rest_var: cp_model.IntVar,
    ) -> None:
        """应用锁定班次约束"""
        locked_key = (emp_id, date_key)
        if locked_key not in self.context.locked_shifts:
            return
        
        locked = self.context.locked_shifts[locked_key]
        if locked.plan_category in ("WORK", "PRODUCTION", "BASE"):
            self.model.Add(work_var == 1)
            self.constraints_added += 1
        elif locked.plan_category == "REST":
            self.model.Add(rest_var == 1)
            self.constraints_added += 1
            
    def _apply_rhythm_preference(
        self,
        emp_id: int,
        date_key: str,
        work_var: cp_model.IntVar,
        rest_var: cp_model.IntVar,
    ) -> None:
        """应用正常节奏偏好（软约束）
        
        对于没有操作的日子：
        - 工作日尽量上班，安排休息需要罚分
        - 非工作日尽量休息，安排上班需要罚分
        """
        # 检查当天是否有操作
        has_ops_today = date_key in self.context.operations_by_date
        if has_ops_today:
            return  # 有操作的日子，班次由操作决定，不需要偏好约束
        
        # 检查是否有锁定班次
        if (emp_id, date_key) in self.context.locked_shifts:
            return  # 锁定的班次不应用偏好
        
        is_calendar_workday = self.context.is_workday(date_key)
        
        if is_calendar_workday:
            # 工作日但没有操作：鼓励上班（休息需要罚分）
            # 创建一个惩罚变量：如果休息则为1，否则为0
            penalty_var = rest_var  # rest_var=1 表示休息
            self.variables.add_penalty("workday_rest", penalty_var)
        else:
            # 非工作日且没有操作：鼓励休息（上班需要罚分）
            # 这里需要特殊处理：非工作日没有操作时，可以休息
            # 但如果为了补工时需要上班，则产生罚分
            penalty_var = work_var  # work_var=1 表示上班
            self.variables.add_penalty("non_workday_work", penalty_var)
    
    def _compute_daily_hours(
        self,
        emp_id: int,
        date_key: str,
        work_var: cp_model.IntVar,
    ) -> None:
        """计算当日排班工时"""
        is_triple = self.context.is_triple_salary(date_key)
        
        # 获取当天的操作信息
        operations = self.variables.employee_day_operations.get((emp_id, date_key), [])
        
        # 计算班次工时
        if operations:
            shift_minutes = self._get_best_shift_minutes(emp_id, date_key, operations)
        else:
            # 没有操作时使用默认班次（8小时）
            shift_minutes = 480
        
        # 当日排班工时（用于月度约束）
        billable = self.model.NewIntVar(0, 24 * 60, f"billable_{emp_id}_{date_key}")
        self.variables.day_scheduled_minutes[(emp_id, date_key)] = billable
        
        if is_triple:
            # 三倍工资日不计入排班工时统计
            self.model.Add(billable == 0)
        else:
            # 工作时计入班次工时，休息时为0
            self.model.Add(billable == work_var * shift_minutes)
        
        self.constraints_added += 1
        
        # 计算车间工时（操作工时）
        if operations:
            workshop = self.model.NewIntVar(0, 24 * 60, f"workshop_{emp_id}_{date_key}")
            self.variables.day_workshop_minutes[(emp_id, date_key)] = workshop
            
            workshop_terms = []
            for duration, var_or_const in operations:
                if isinstance(var_or_const, int):
                    workshop_terms.append(duration * var_or_const)
                else:
                    workshop_terms.append(duration * var_or_const)
            
            self.model.Add(workshop == sum(workshop_terms))
            self.constraints_added += 1
    
    def _get_best_shift_minutes(
        self,
        emp_id: int,
        date_key: str,
        operations: list,
    ) -> int:
        """获取能覆盖所有操作的最短班次工时（分钟）"""
        # 找到最早开始和最晚结束时间
        earliest_start = None
        latest_end = None
        
        for duration, var_or_const in operations:
            op_id = self._get_op_id_from_employee_day(emp_id, date_key, duration)
            if op_id and op_id in self.context.operations:
                op = self.context.operations[op_id]
                try:
                    start = datetime.fromisoformat(op.planned_start.replace("Z", "+00:00"))
                    end = datetime.fromisoformat(op.planned_end.replace("Z", "+00:00"))
                    
                    if earliest_start is None or start < earliest_start:
                        earliest_start = start
                    if latest_end is None or end > latest_end:
                        latest_end = end
                except:
                    pass
        
        if not earliest_start or not latest_end:
            return 480  # 默认8小时
        
        # 找到能覆盖的最短班次
        tolerance = self.context.config.shift_matching_tolerance_minutes
        best_hours = float('inf')
        
        for shift in self.context.shift_definitions:
            # 跳过休息班次
            if shift.nominal_hours == 0:
                continue
            if shift.shift_code and 'REST' in shift.shift_code.upper():
                continue
            
            st = shift.start_time if len(shift.start_time) >= 8 else f"{shift.start_time}:00"
            et = shift.end_time if len(shift.end_time) >= 8 else f"{shift.end_time}:00"
            
            try:
                shift_start = datetime.fromisoformat(f"{date_key}T{st}")
                shift_end = datetime.fromisoformat(f"{date_key}T{et}")
            except:
                continue
            
            if shift.is_cross_day or shift_end <= shift_start:
                shift_end += timedelta(days=1)
            
            # 检查班次是否覆盖所有操作时间
            start_ok = (shift_start - timedelta(minutes=tolerance)) <= earliest_start
            end_ok = (shift_end + timedelta(minutes=tolerance)) >= latest_end
            
            if start_ok and end_ok:
                if shift.nominal_hours < best_hours:
                    best_hours = shift.nominal_hours
        
        if best_hours < float('inf'):
            return int(best_hours * 60)
        
        return 480  # 默认8小时
    
    def _get_op_id_from_employee_day(
        self,
        emp_id: int,
        date_key: str,
        target_duration: int,
    ) -> int:
        """根据员工、日期和时长找到操作ID"""
        for op_id, op in self.context.operations.items():
            if op.planned_start[:10] != date_key:
                continue
            if op.planned_duration_minutes == target_duration:
                candidates = self.context.operation_candidates.get(op_id, [])
                if emp_id in candidates:
                    return op_id
                locked = self.context.locked_operations.get(op_id, set())
                if emp_id in locked:
                    return op_id
        return 0
    
    def _log_statistics(self) -> None:
        """记录统计信息"""
        total_days = len(self.context.all_dates)
        production_days = len(self.context.operations_by_date)
        calendar_workdays = sum(1 for d in self.context.all_dates if self.context.is_workday(d))
        
        # 计算缓冲日数量
        buffer_dates = set()
        for (emp_id, date_str), is_buffer in self.variables.day_is_buffer.items():
            if is_buffer:
                buffer_dates.add(date_str)
        
        logger.info(
            f"[{self.name}] 日期统计: 总天数={total_days}, "
            f"日历工作日={calendar_workdays}, "
            f"有操作的日期={production_days}, "
            f"缓冲日(可补工时)={len(buffer_dates)}"
        )
