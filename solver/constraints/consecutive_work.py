"""
连续工作约束

限制员工连续工作的天数，防止员工过度疲劳。

硬约束规则：
1. 员工不得连续上班超过 max_consecutive_workdays 天（不包括该天数）
   - 例如 max_consecutive_workdays = 6，则最多连续上班6天，第7天必须休息
2. 上班定义：PRODUCTION（有操作）和 BASE（无操作但上班）
   - OVERTIME（加班）不算上班
   - REST（休息）不算上班
3. 边界处理：考虑求解区间前的历史班次数据
   - 例如：1月26-31日已连续上班6天，2月1日必须休息
4. 锁定班次预检查：如果锁定班次本身就违反约束，直接报错
"""

from __future__ import annotations
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple
from ortools.sat.python import cp_model

from .base import BaseConstraint

logger = logging.getLogger(__name__)


class ConsecutiveWorkViolationError(Exception):
    """锁定班次违反连续工作约束错误"""
    pass


class ConsecutiveWorkConstraint(BaseConstraint):
    """连续工作约束
    
    硬约束：员工不得连续上班超过 max_consecutive_workdays 天
    """
    
    name = "ConsecutiveWork"
    
    def apply(self) -> None:
        """应用连续工作约束"""
        if not self.context.config.enforce_consecutive_limit:
            logger.info(f"[{self.name}] 连续工作约束已禁用")
            return
        
        max_days = self.context.config.max_consecutive_workdays
        
        logger.info(f"[{self.name}] 最大连续工作天数: {max_days}")
        logger.info(f"[{self.name}] 历史班次数量: {len(self.context.historical_shifts)}")
        
        # 步骤1：预检查 - 检测锁定班次是否违反约束
        self._precheck_locked_shifts(max_days)
        
        # 步骤2：为每个员工应用约束
        for emp_id in self.context.employees.keys():
            self._apply_employee_constraint(emp_id, max_days)
        
        self.log_summary()
    
    def _precheck_locked_shifts(self, max_days: int) -> None:
        """预检查：检测锁定班次是否违反连续工作约束
        
        如果锁定班次本身就导致连续工作超过限制，直接抛出错误。
        这样可以在求解开始前就发现问题，避免浪费计算资源。
        """
        window_size = max_days + 1  # 滑窗大小
        
        for emp_id in self.context.employees.keys():
            # 构建该员工的历史+锁定班次工作日映射
            work_dates: Set[str] = set()
            
            # 添加历史班次中的工作日
            for hs in self.context.historical_shifts:
                if hs.employee_id == emp_id and hs.is_work:
                    work_dates.add(hs.date)
            
            # 添加锁定班次中的工作日
            for (e_id, date_key), locked in self.context.locked_shifts.items():
                if e_id == emp_id and locked.plan_category in ("WORK", "PRODUCTION", "BASE"):
                    work_dates.add(date_key)
            
            if not work_dates:
                continue
            
            # 获取扩展日期范围（历史+求解窗口）
            all_dates = self._get_extended_dates(emp_id)
            
            # 滑窗检查锁定班次
            for start_idx in range(len(all_dates) - max_days):
                window_dates = all_dates[start_idx:start_idx + window_size]
                locked_work_count = sum(1 for d in window_dates if d in work_dates)
                
                if locked_work_count > max_days:
                    emp_name = self.context.employees[emp_id].employee_name
                    raise ConsecutiveWorkViolationError(
                        f"员工 {emp_name} (ID:{emp_id}) 的锁定班次违反连续工作约束: "
                        f"日期范围 {window_dates[0]} ~ {window_dates[-1]} 内连续上班 {locked_work_count} 天, "
                        f"超过最大允许 {max_days} 天。请调整锁定的班次后重试。"
                    )
    
    def _get_extended_dates(self, emp_id: int) -> List[str]:
        """获取扩展的日期范围（历史日期 + 求解窗口日期）
        
        为了正确处理边界，需要将历史日期和求解窗口日期合并。
        """
        max_days = self.context.config.max_consecutive_workdays
        
        # 获取历史日期
        history_dates: Set[str] = set()
        for hs in self.context.historical_shifts:
            if hs.employee_id == emp_id:
                history_dates.add(hs.date)
        
        # 求解窗口的所有日期
        window_dates = list(self.context.all_dates)
        
        if not history_dates:
            return window_dates
        
        # 合并并排序
        all_dates_set = history_dates.union(set(window_dates))
        all_dates = sorted(list(all_dates_set))
        
        return all_dates
    
    def _apply_employee_constraint(self, emp_id: int, max_days: int) -> None:
        """为单个员工应用连续工作约束
        
        使用滑动窗口检查，窗口大小为 max_days + 1。
        窗口内的工作天数必须 <= max_days。
        """
        window_size = max_days + 1
        
        # 获取扩展日期范围
        all_dates = self._get_extended_dates(emp_id)
        
        if len(all_dates) < window_size:
            return
        
        # 构建历史工作日映射
        historical_work_dates: Set[str] = set()
        for hs in self.context.historical_shifts:
            if hs.employee_id == emp_id and hs.is_work:
                historical_work_dates.add(hs.date)
        
        # 滑窗遍历
        for start_idx in range(len(all_dates) - max_days):
            window_dates = all_dates[start_idx:start_idx + window_size]
            
            work_vars: List[cp_model.IntVar] = []
            fixed_work_days = 0
            
            for date_key in window_dates:
                # 检查是否在求解窗口内
                if date_key not in self.context.all_dates:
                    # 历史日期 - 使用固定值
                    if date_key in historical_work_dates:
                        fixed_work_days += 1
                    continue
                
                # 检查锁定班次
                locked = self.context.locked_shifts.get((emp_id, date_key))
                if locked:
                    if locked.plan_category in ("WORK", "PRODUCTION", "BASE"):
                        fixed_work_days += 1
                    # 锁定为休息则不增加工作日计数
                    continue
                
                # 获取工作变量（非锁定日期）
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    work_vars.append(work_var)
            
            # 添加约束：窗口内总工作天数 <= max_days
            if work_vars:
                self.model.Add(sum(work_vars) + fixed_work_days <= max_days)
                self.constraints_added += 1
