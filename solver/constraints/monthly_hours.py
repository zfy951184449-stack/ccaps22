"""
月度/季度工时约束

确保员工的排班工时符合综合工时制要求。

工时计算规则：
1. 标准工时 = 求解区间内该周期的工作日数 × 8小时
2. 三倍工资日的班次工时不计入统计
3. 每日班次工时来自班次定义的 nominal_hours（折算工时）
4. 操作工时已包含在班次工时中，不需要额外计算
"""

from __future__ import annotations
import logging
from ortools.sat.python import cp_model

from .base import BaseConstraint
from models.context import SolverContext
from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class MonthlyHoursConstraint(BaseConstraint):
    """月度/季度工时约束
    
    硬约束：
    1. 月度排班工时范围: [标准工时 - 下限偏移, 标准工时 + 上限偏移]
       - 下限偏移 (monthly_hours_lower_offset): 默认 4 小时
       - 上限偏移 (monthly_hours_upper_offset): 默认 32 小时
    
    2. 季度排班工时下限: >= 季度标准工时
       - 仅当求解区间完整覆盖该季度时启用
       - 理论上限为 3 × 月度上限偏移，无需单独约束
    
    注意：
    - 三倍工资日的排班工时不计入统计
    - 标准工时基于求解区间内该周期的工作日数计算
    """
    
    name = "MonthlyHours"
    
    def apply(self) -> None:
        """应用月度/季度工时约束"""
        if not self.context.config.enforce_monthly_hours and not self.context.config.enforce_quarter_hours:
            logger.info(f"[{self.name}] 月度和季度工时约束均已禁用")
            return
        
        # 记录配置信息
        logger.info(
            f"[{self.name}] 配置: 月度约束={self.context.config.enforce_monthly_hours}, "
            f"季度约束={self.context.config.enforce_quarter_hours}, "
            f"下限偏移={self.context.config.monthly_hours_lower_offset}h, "
            f"上限偏移={self.context.config.monthly_hours_upper_offset}h"
        )
        
        for emp_id in self.context.employees.keys():
            # 按月汇总工时变量
            month_minutes = self._collect_monthly_minutes(emp_id)
            
            # 应用月度约束
            if self.context.config.enforce_monthly_hours:
                self._apply_monthly_constraints(emp_id, month_minutes)
            
            # 按季度汇总工时变量
            if self.context.config.enforce_quarter_hours:
                quarter_minutes = self._collect_quarterly_minutes(emp_id, month_minutes)
                self._apply_quarterly_constraints(emp_id, quarter_minutes)
        
        self.log_summary()
    
    def _collect_monthly_minutes(self, emp_id: int) -> dict:
        """收集员工每月的工时变量
        
        注意：三倍工资日的工时已在 ShiftConsistencyConstraint 中设为 0，
        这里直接使用 day_scheduled_minutes 即可。
        """
        month_vars = {}  # month_key -> [变量列表]
        
        for date_key in self.context.all_dates:
            month_key = self.context.get_date_month(date_key)
            billable = self.variables.day_scheduled_minutes.get((emp_id, date_key))
            
            if billable is not None:
                if month_key not in month_vars:
                    month_vars[month_key] = []
                month_vars[month_key].append(billable)
        
        return month_vars
    
    def _collect_quarterly_minutes(self, emp_id: int, month_minutes: dict) -> dict:
        """收集员工每季度的工时变量"""
        quarter_vars = {}  # quarter_key -> [变量列表]
        
        for month_key, vars_list in month_minutes.items():
            # 从月份推导季度
            year, month = month_key.split("-")
            quarter = (int(month) - 1) // 3 + 1
            quarter_key = f"{year}-Q{quarter}"
            
            if quarter_key not in quarter_vars:
                quarter_vars[quarter_key] = []
            quarter_vars[quarter_key].extend(vars_list)
        
        return quarter_vars
    
    def _apply_monthly_constraints(self, emp_id: int, month_minutes: dict) -> None:
        """应用月度工时约束（硬约束）
        
        月度排班工时范围: [标准工时 - 下限偏移, 标准工时 + 上限偏移]
        
        标准工时 = 求解区间内该月的工作日数 × 8小时
        
        员工通过在没有操作的日期选择 上班(BASE) 或 休息(REST) 来满足工时约束。
        """
        lower_offset = self.context.config.monthly_hours_lower_offset
        upper_offset = self.context.config.monthly_hours_upper_offset
        
        for month_key, vars_list in month_minutes.items():
            if not vars_list:
                continue
            
            # 获取该月在求解区间内的工作日数
            workdays = self.context.month_workdays.get(month_key, 0)
            if workdays <= 0:
                logger.warning(f"[{self.name}] 月份 {month_key} 无工作日，跳过约束")
                continue
            
            # 计算标准工时（小时）
            standard_hours = workdays * 8.0
            
            # 计算工时范围（转换为分钟）
            # 下限: 标准工时 - 下限偏移（可以少工作的小时数）
            # 上限: 标准工时 + 上限偏移（可以多工作的小时数）
            min_hours = max(0, standard_hours - lower_offset)
            max_hours = standard_hours + upper_offset
            
            min_minutes = int(min_hours * 60)
            max_minutes = int(max_hours * 60)
            
            # 创建月度总工时变量
            total_minutes = self.model.NewIntVar(
                0, max_minutes + 1000,  # 留余量防止边界问题
                f"month_total_{emp_id}_{month_key}"
            )
            self.model.Add(total_minutes == sum(vars_list))
            
            # 应用约束（上下限都是硬约束）
            self.model.Add(total_minutes >= min_minutes)
            self.model.Add(total_minutes <= max_minutes)
            self.constraints_added += 2
            
            # 存储月度总工时变量（供结果构建器使用）
            self.variables.month_scheduled_minutes[(emp_id, month_key)] = total_minutes
            
            logger.info(
                f"[{self.name}] 员工 {emp_id} 月份 {month_key}: "
                f"工作日数={workdays}, 标准工时={standard_hours}h, "
                f"允许范围=[{min_hours}, {max_hours}]h"
            )
    
    def _apply_quarterly_constraints(self, emp_id: int, quarter_minutes: dict) -> None:
        """应用季度工时约束（硬约束）
        
        季度排班工时 >= 季度标准工时
        
        仅当求解区间完整覆盖该季度时启用。
        理论上限为 3 × 月度上限偏移，无需单独约束。
        """
        for quarter_key, vars_list in quarter_minutes.items():
            if not vars_list:
                continue
            
            # 检查是否完整覆盖该季度
            if not self.context.quarter_full_coverage.get(quarter_key, False):
                logger.debug(f"[{self.name}] 季度 {quarter_key} 未完整覆盖，跳过约束")
                continue
            
            # 获取该季度在求解区间内的工作日数
            workdays = self.context.quarter_workdays.get(quarter_key, 0)
            if workdays <= 0:
                continue
            
            # 计算季度标准工时（小时）
            standard_hours = workdays * 8.0
            min_minutes = int(standard_hours * 60)
            
            # 应用下限约束（只有下限，无上限）
            self.model.Add(sum(vars_list) >= min_minutes)
            self.constraints_added += 1
            
            logger.info(
                f"[{self.name}] 员工 {emp_id} 季度 {quarter_key}: "
                f"工作日数={workdays}, 最低工时={standard_hours}h"
            )
