"""
结果构建器

从求解器结果构建响应数据。
"""

from __future__ import annotations
from typing import TYPE_CHECKING, List, Dict, Set
from datetime import datetime, timedelta
import logging

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from models.context import SolverContext
    from models.variables import ModelVariables

from contracts.response import (
    OperationAssignment,
    ShiftPlan,
    ShiftPlanOperation,
    HoursSummary,
    SolverWarning,
    WarningType,
)

logger = logging.getLogger(__name__)


class ResultBuilder:
    """结果构建器
    
    从 CP-SAT 求解结果构建响应数据结构。
    """
    
    def __init__(
        self,
        solver: cp_model.CpSolver,
        context: SolverContext,
        variables: ModelVariables,
    ):
        self.solver = solver
        self.context = context
        self.variables = variables
        
        # 缓存已分配的操作
        self._assigned_ops: Set[int] = set()
        self._employee_day_ops: Dict[tuple, List[dict]] = {}
    
    def build_assignments(self) -> List[OperationAssignment]:
        """构建操作分配结果（按岗位）"""
        assignments = []
        
        # 使用按岗位的分配变量
        for (op_id, pos_num, emp_id), var in self.variables.position_assignment_vars.items():
            if self.solver.Value(var) == 1:
                assignments.append(OperationAssignment(
                    operation_plan_id=op_id,
                    position_number=pos_num,
                    employee_id=emp_id,
                ))
                
                self._assigned_ops.add(op_id)
                self._record_employee_day_op(op_id, emp_id)
        
        # 添加锁定的操作分配（锁定分配暂时分配到岗位1，后续可优化）
        for op_id, locked_employees in self.context.locked_operations.items():
            pos_num = 1
            for emp_id in locked_employees:
                assignments.append(OperationAssignment(
                    operation_plan_id=op_id,
                    position_number=pos_num,
                    employee_id=emp_id,
                ))
                self._assigned_ops.add(op_id)
                self._record_employee_day_op(op_id, emp_id)
                pos_num += 1
        
        logger.info(f"[ResultBuilder] 生成 {len(assignments)} 个操作分配（按岗位）")
        return assignments
    
    def _record_employee_day_op(self, op_id: int, emp_id: int) -> None:
        """记录员工每天的操作"""
        op = self.context.operations.get(op_id)
        if op:
            date_key = op.planned_start[:10]
            key = (emp_id, date_key)
            
            if key not in self._employee_day_ops:
                self._employee_day_ops[key] = []
            
            self._employee_day_ops[key].append({
                "operation_plan_id": op_id,
                "planned_start": op.planned_start,
                "planned_end": op.planned_end,
                "duration_minutes": op.planned_duration_minutes,
            })
    
    def build_shift_plans(self) -> List[ShiftPlan]:
        """构建班次计划"""
        shift_plans = []
        
        for emp_id in self.context.employees.keys():
            for date_key in self.context.all_dates:
                plan = self._build_employee_day_plan(emp_id, date_key)
                if plan:
                    shift_plans.append(plan)
        
        logger.info(f"[ResultBuilder] 生成 {len(shift_plans)} 个班次计划")
        return shift_plans
    
    def _build_employee_day_plan(self, emp_id: int, date_key: str) -> ShiftPlan:
        """构建单个员工单天的班次计划"""
        # 确定班次类型
        work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
        rest_var = self.variables.shift_vars.get((emp_id, date_key, "REST"))
        
        is_work = work_var is not None and self.solver.Value(work_var) == 1
        
        if is_work:
            plan_type = "WORK"
        else:
            plan_type = "REST"
        
        # 获取操作信息
        operations = []
        workshop_minutes = 0
        key = (emp_id, date_key)
        
        if key in self._employee_day_ops:
            for op_info in self._employee_day_ops[key]:
                operations.append(ShiftPlanOperation(
                    operation_plan_id=op_info["operation_plan_id"],
                    planned_start=op_info["planned_start"],
                    planned_end=op_info["planned_end"],
                    duration_minutes=op_info["duration_minutes"],
                ))
                workshop_minutes += op_info["duration_minutes"]
        
        # 判断是否在缓冲期
        is_buffer = self.variables.day_is_buffer.get((emp_id, date_key), False)
        
        # 确定班次信息
        shift_id = None
        shift_code = None
        shift_name = None
        shift_nominal_hours = None
        is_night = False
        plan_hours = 0.0
        
        if plan_type == "WORK":
            if operations:
                # 根据操作时间匹配班次
                shift_info = self._match_shift(date_key, operations)
                if shift_info:
                    shift_id = shift_info.get("shift_id")
                    shift_code = shift_info.get("shift_code")
                    shift_name = shift_info.get("shift_name")
                    shift_nominal_hours = shift_info.get("nominal_hours")
                    is_night = shift_info.get("is_night", False)
                    plan_hours = shift_nominal_hours or 8.0
            else:
                # 缓冲期使用默认班次
                default_shift = self._get_default_shift()
                if default_shift:
                    shift_id = default_shift.shift_id
                    shift_code = default_shift.shift_code
                    shift_name = default_shift.shift_name
                    shift_nominal_hours = default_shift.nominal_hours
                    is_night = default_shift.is_night_shift
                    plan_hours = default_shift.nominal_hours
                else:
                    shift_code = "DEFAULT"
                    shift_name = "默认班次"
                    plan_hours = 8.0
        else:
            shift_code = "REST"
            shift_name = "休息"
            plan_hours = 0.0
        
        # 判断是否加班（三倍工资日）
        is_overtime = self.context.is_triple_salary(date_key) and plan_type == "WORK"
        
        return ShiftPlan(
            employee_id=emp_id,
            date=date_key,
            plan_type=plan_type,
            plan_hours=plan_hours,
            shift_id=shift_id,
            shift_code=shift_code,
            shift_name=shift_name,
            shift_nominal_hours=shift_nominal_hours,
            is_night_shift=is_night,
            operations=operations,
            workshop_minutes=workshop_minutes,
            is_overtime=is_overtime,
            is_buffer=is_buffer and not operations,
        )
    
    def _match_shift(self, date_key: str, operations: List[ShiftPlanOperation]) -> dict:
        """根据操作时间匹配班次定义
        
        选择能覆盖所有操作的最短班次
        """
        if not operations:
            return {}
        
        # 找到最早开始和最晚结束时间
        earliest_start = None
        latest_end = None
        
        for op in operations:
            try:
                # 处理各种日期时间格式
                planned_start = op.planned_start
                planned_end = op.planned_end
                
                # 移除时区后缀 Z 或 +00:00
                if planned_start.endswith("Z"):
                    planned_start = planned_start[:-1]
                if planned_end.endswith("Z"):
                    planned_end = planned_end[:-1]
                if "+00:00" in planned_start:
                    planned_start = planned_start.replace("+00:00", "")
                if "+00:00" in planned_end:
                    planned_end = planned_end.replace("+00:00", "")
                
                # 移除毫秒部分
                if "." in planned_start:
                    planned_start = planned_start.split(".")[0]
                if "." in planned_end:
                    planned_end = planned_end.split(".")[0]
                
                start = datetime.fromisoformat(planned_start)
                end = datetime.fromisoformat(planned_end)
                
                # 如果结束时间早于开始时间，说明是跨天操作，需要加一天
                if end <= start:
                    end += timedelta(days=1)
            except Exception as e:
                logger.warning(f"[_match_shift] 日期解析失败: {op.planned_start} / {op.planned_end}, error={e}")
                continue
            
            if earliest_start is None or start < earliest_start:
                earliest_start = start
            if latest_end is None or end > latest_end:
                latest_end = end
        
        if not earliest_start or not latest_end:
            logger.warning(f"[_match_shift] 无法获取操作时间范围: date={date_key}")
            return {}
        
        # 找到能覆盖的最短班次
        tolerance = self.context.config.shift_matching_tolerance_minutes
        best_match = None
        best_hours = float("inf")
        
        for shift in self.context.shift_definitions:
            # 跳过休息班次（nominal_hours == 0 或 shift_code 包含 REST）
            if shift.nominal_hours == 0:
                continue
            if shift.shift_code and 'REST' in shift.shift_code.upper():
                continue
            
            # start_time 可能是 HH:mm 或 HH:mm:ss 格式
            st = shift.start_time if len(shift.start_time) >= 8 else f"{shift.start_time}:00"
            et = shift.end_time if len(shift.end_time) >= 8 else f"{shift.end_time}:00"
            shift_start = datetime.fromisoformat(f"{date_key}T{st}")
            shift_end = datetime.fromisoformat(f"{date_key}T{et}")
            
            if shift.is_cross_day or shift_end <= shift_start:
                shift_end += timedelta(days=1)
            
            # 检查班次是否覆盖操作时间（含容差）
            start_ok = (shift_start - timedelta(minutes=tolerance)) <= earliest_start
            end_ok = (shift_end + timedelta(minutes=tolerance)) >= latest_end
            
            if start_ok and end_ok:
                if shift.nominal_hours < best_hours:
                    best_hours = shift.nominal_hours
                    best_match = shift
        
        if best_match:
            return {
                "shift_id": best_match.shift_id,
                "shift_code": best_match.shift_code,
                "shift_name": best_match.shift_name,
                "nominal_hours": best_match.nominal_hours,
                "is_night": best_match.is_night_shift,
            }
        
        # 如果没有找到覆盖所有操作的班次，尝试匹配第一个操作
        if len(operations) > 1:
            logger.info(f"[_match_shift] 无法覆盖所有操作，尝试匹配第一个操作")
            first_op_result = self._match_shift(date_key, [operations[0]])
            if first_op_result:
                return first_op_result
        
        # 仍然没有找到，选择最长的工作班次作为备选
        for shift in sorted(self.context.shift_definitions, key=lambda s: s.nominal_hours, reverse=True):
            if shift.nominal_hours > 0 and not (shift.shift_code and 'REST' in shift.shift_code.upper()):
                logger.warning(
                    f"[_match_shift] 无法精确匹配班次，使用备选班次: date={date_key}, "
                    f"op_time={earliest_start.time()}-{latest_end.time()}, "
                    f"fallback_shift={shift.shift_code}"
                )
                return {
                    "shift_id": shift.shift_id,
                    "shift_code": shift.shift_code,
                    "shift_name": shift.shift_name,
                    "nominal_hours": shift.nominal_hours,
                    "is_night": shift.is_night_shift,
                }
        
        # 最后的备选
        logger.warning(
            f"[_match_shift] 无法匹配班次: date={date_key}, "
            f"op_time={earliest_start.time()}-{latest_end.time()}, "
            f"available_shifts={[(s.shift_code, s.start_time, s.end_time) for s in self.context.shift_definitions if s.nominal_hours > 0]}"
        )
        return {}
    
    def _get_default_shift(self):
        """获取默认班次（最短的日班，排除休息班次）"""
        for shift in self.context.shift_definitions:
            # 跳过休息班次
            if shift.nominal_hours == 0:
                continue
            if shift.shift_code and 'REST' in shift.shift_code.upper():
                continue
            # 选择非夜班
            if not shift.is_night_shift:
                return shift
        # 如果没有日班，返回第一个非休息班次
        for shift in self.context.shift_definitions:
            if shift.nominal_hours > 0 and not (shift.shift_code and 'REST' in shift.shift_code.upper()):
                return shift
        return None
    
    def build_hours_summaries(self) -> List[HoursSummary]:
        """构建工时统计摘要"""
        summaries = []
        
        # 按员工和月份汇总
        emp_month_data: Dict[tuple, dict] = {}
        
        for emp_id in self.context.employees.keys():
            for date_key in self.context.all_dates:
                month_key = self.context.get_date_month(date_key)
                key = (emp_id, month_key)
                
                if key not in emp_month_data:
                    emp_month_data[key] = {
                        "scheduled_minutes": 0,
                        "workshop_minutes": 0,
                        "overtime_minutes": 0,
                        "work_days": 0,
                        "rest_days": 0,
                        "buffer_days": 0,
                    }
                
                data = emp_month_data[key]
                
                # 获取班次类型
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                is_work = work_var is not None and self.solver.Value(work_var) == 1
                is_triple = self.context.is_triple_salary(date_key)
                is_buffer = self.variables.day_is_buffer.get((emp_id, date_key), False)
                
                # 检查是否有操作
                has_ops = (emp_id, date_key) in self._employee_day_ops
                
                if is_work:
                    if has_ops:
                        data["work_days"] += 1
                    else:
                        data["buffer_days"] += 1
                    
                    # 获取班次工时
                    scheduled = self.variables.day_scheduled_minutes.get((emp_id, date_key))
                    if scheduled is not None:
                        minutes = self.solver.Value(scheduled)
                        if is_triple:
                            data["overtime_minutes"] += minutes
                        else:
                            data["scheduled_minutes"] += minutes
                    
                    # 获取车间工时
                    workshop = self.variables.day_workshop_minutes.get((emp_id, date_key))
                    if workshop is not None:
                        data["workshop_minutes"] += self.solver.Value(workshop)
                else:
                    data["rest_days"] += 1
        
        # 生成摘要
        for (emp_id, month_key), data in emp_month_data.items():
            standard_hours = self.context.get_standard_hours(month_key)
            scheduled_hours = data["scheduled_minutes"] / 60
            
            lower = self.context.config.monthly_hours_lower_offset
            upper = self.context.config.monthly_hours_upper_offset
            
            is_within = (
                scheduled_hours >= (standard_hours - lower) and
                scheduled_hours <= (standard_hours + upper)
            )
            
            summaries.append(HoursSummary(
                employee_id=emp_id,
                month=month_key,
                scheduled_hours=round(scheduled_hours, 2),
                standard_hours=round(standard_hours, 2),
                hours_deviation=round(scheduled_hours - standard_hours, 2),
                workshop_hours=round(data["workshop_minutes"] / 60, 2),
                overtime_hours=round(data["overtime_minutes"] / 60, 2),
                work_days=data["work_days"],
                rest_days=data["rest_days"],
                buffer_days=data["buffer_days"],
                is_within_bounds=is_within,
            ))
        
        return summaries
    
    def build_warnings(self) -> List[SolverWarning]:
        """构建警告列表"""
        warnings = []
        
        # 跳过的操作
        if self.context.skipped_operations:
            warnings.append(SolverWarning(
                type=WarningType.OPERATION_SKIPPED.value,
                message=f"{len(self.context.skipped_operations)} 个操作因无候选人被跳过",
                count=len(self.context.skipped_operations),
                operation_ids=self.context.skipped_operations[:20],
                employee_ids=[],
            ))
        
        # 人手不足的操作
        shortage_ops = []
        for op_id, (slack_var, required, candidates) in self.variables.slack_vars.items():
            shortage = self.solver.Value(slack_var)
            if shortage > 0:
                shortage_ops.append(op_id)
        
        if shortage_ops:
            warnings.append(SolverWarning(
                type=WarningType.INSUFFICIENT_CANDIDATES.value,
                message=f"{len(shortage_ops)} 个操作人手不足",
                count=len(shortage_ops),
                operation_ids=shortage_ops[:20],
                employee_ids=[],
            ))
        
        return warnings
