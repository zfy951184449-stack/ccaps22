"""
夜班休息约束

确保夜班后员工得到充分休息。

约束规则：
1. 硬约束：夜班后至少休息 x 天（默认 1 天）
2. 软约束：夜班后建议休息 y 天（默认 2 天，y >= x）
   - 满足：+100 分奖励（每人次）
   - 不满足：-300 分惩罚（每人次）
3. 夜班定义：班次定义中 is_night_shift = true
4. 边界处理：读取求解区间前 y 天的历史班次数据

注意：
- 夜班后操作分配的禁止逻辑在 OperationAssignmentConstraint 中处理
- 本模块只处理班次层面的休息约束
"""

from __future__ import annotations
import logging
from typing import Dict, List, Set, Tuple
from ortools.sat.python import cp_model

from .base import BaseConstraint

logger = logging.getLogger(__name__)


class NightRestConstraint(BaseConstraint):
    """夜班休息约束
    
    硬约束：夜班后 x 天内必须休息
    软约束：夜班后 y 天内尽可能休息（奖励/惩罚）
    """
    
    name = "NightRest"
    
    def apply(self) -> None:
        """应用夜班休息约束"""
        if not self.context.config.enforce_night_rest:
            logger.info(f"[{self.name}] 夜班休息约束已禁用")
            return
        
        x = self.context.config.night_rest_hard_days  # 硬约束休息天数
        y = self.context.config.night_rest_soft_days  # 软约束休息天数
        reward = self.context.config.night_rest_reward
        penalty = self.context.config.night_rest_penalty
        
        logger.info(f"[{self.name}] 硬约束休息天数: {x}, 软约束休息天数: {y}")
        logger.info(f"[{self.name}] 满足软约束奖励: {reward}, 不满足惩罚: {penalty}")
        
        # 构建历史夜班信息
        historical_night_dates = self._build_historical_night_dates()
        logger.info(f"[{self.name}] 历史夜班员工-日期对: {len(historical_night_dates)}")
        
        for emp_id in self.context.employees.keys():
            self._apply_employee_constraint(emp_id, x, y, reward, penalty, historical_night_dates)
        
        self.log_summary()
    
    def _build_historical_night_dates(self) -> Dict[int, Set[str]]:
        """构建历史夜班日期映射
        
        Returns:
            员工ID -> 夜班日期集合
        """
        result: Dict[int, Set[str]] = {}
        
        for hs in self.context.historical_shifts:
            if hs.is_night:
                if hs.employee_id not in result:
                    result[hs.employee_id] = set()
                result[hs.employee_id].add(hs.date)
        
        return result
    
    def _apply_employee_constraint(
        self,
        emp_id: int,
        x: int,
        y: int,
        reward: int,
        penalty: int,
        historical_night_dates: Dict[int, Set[str]]
    ) -> None:
        """为单个员工应用夜班休息约束
        
        Args:
            emp_id: 员工ID
            x: 硬约束休息天数
            y: 软约束休息天数
            reward: 满足软约束的奖励分
            penalty: 不满足软约束的惩罚分
            historical_night_dates: 历史夜班日期映射
        """
        all_dates = self.context.all_dates
        
        # 处理历史夜班对求解区间第一天的影响
        self._apply_historical_night_constraints(
            emp_id, x, y, reward, penalty, historical_night_dates
        )
        
        # 处理求解区间内的夜班
        for i, date_key in enumerate(all_dates):
            night_flag = self.variables.day_is_night.get((emp_id, date_key))
            if night_flag is None:
                continue
            
            # 硬约束：夜班后 x 天内必须休息
            for offset in range(1, x + 1):
                if i + offset < len(all_dates):
                    rest_date = all_dates[i + offset]
                    self._apply_hard_rest_constraint(emp_id, night_flag, rest_date)
            
            # 软约束：夜班后第 x+1 到 y 天尽可能休息
            for offset in range(x + 1, y + 1):
                if i + offset < len(all_dates):
                    rest_date = all_dates[i + offset]
                    self._apply_soft_rest_constraint(
                        emp_id, night_flag, rest_date, reward, penalty
                    )
    
    def _apply_historical_night_constraints(
        self,
        emp_id: int,
        x: int,
        y: int,
        reward: int,
        penalty: int,
        historical_night_dates: Dict[int, Set[str]]
    ) -> None:
        """处理历史夜班对求解区间开始的影响
        
        例如：1月31日是夜班，求解区间从2月1日开始
        那么2月1日需要应用硬约束休息，2月2日需要应用软约束
        """
        if emp_id not in historical_night_dates:
            return
        
        emp_night_dates = historical_night_dates[emp_id]
        all_dates = self.context.all_dates
        
        if not all_dates:
            return
        
        from datetime import datetime, timedelta
        
        first_date = datetime.strptime(all_dates[0], "%Y-%m-%d")
        
        for night_date_str in emp_night_dates:
            night_date = datetime.strptime(night_date_str, "%Y-%m-%d")
            
            # 计算夜班日期距离求解区间第一天的天数
            days_diff = (first_date - night_date).days
            
            if days_diff <= 0:
                # 历史日期应该在求解区间之前
                continue
            
            # 硬约束：如果历史夜班后的 x 天覆盖到求解区间
            for offset in range(1, x + 1):
                target_days_from_night = offset
                if days_diff <= target_days_from_night:
                    # 这一天在求解区间内
                    target_idx = target_days_from_night - days_diff
                    if 0 <= target_idx < len(all_dates):
                        rest_date = all_dates[target_idx]
                        # 历史夜班是确定的，所以无条件应用硬约束
                        work_var = self.variables.shift_vars.get((emp_id, rest_date, "WORK"))
                        if work_var is not None:
                            self.model.Add(work_var == 0)
                            self.constraints_added += 1
                            logger.debug(
                                f"[{self.name}] 员工 {emp_id} 历史夜班 {night_date_str} 后 "
                                f"{rest_date} 必须休息（硬约束）"
                            )
            
            # 软约束：如果历史夜班后的第 x+1 到 y 天覆盖到求解区间
            for offset in range(x + 1, y + 1):
                target_days_from_night = offset
                if days_diff <= target_days_from_night:
                    target_idx = target_days_from_night - days_diff
                    if 0 <= target_idx < len(all_dates):
                        rest_date = all_dates[target_idx]
                        # 软约束：尽可能休息
                        work_var = self.variables.shift_vars.get((emp_id, rest_date, "WORK"))
                        if work_var is not None:
                            # rest_achieved = 1 当且仅当 work_var = 0
                            rest_achieved = self.model.NewBoolVar(
                                f"hist_night_rest_{emp_id}_{night_date_str}_{rest_date}"
                            )
                            self.model.Add(rest_achieved == 1 - work_var)
                            
                            # work_achieved = work_var (违规情况)
                            work_achieved = self.model.NewBoolVar(
                                f"hist_night_work_{emp_id}_{night_date_str}_{rest_date}"
                    )
                            self.model.Add(work_achieved == work_var)
                            
                            # 满足奖励，不满足惩罚
                            self.variables.add_penalty("night_rest_reward", rest_achieved)
                            self.variables.add_penalty("night_rest_penalty", work_achieved)
    
    def _apply_hard_rest_constraint(
        self,
        emp_id: int,
        night_flag: cp_model.IntVar,
        rest_date: str
    ) -> None:
        """应用硬约束：夜班后必须休息
        
        Args:
            emp_id: 员工ID
            night_flag: 夜班标记变量（0/1）
            rest_date: 需要休息的日期
        """
        # 检查锁定班次
        locked = self.context.locked_shifts.get((emp_id, rest_date))
        if locked:
            if locked.plan_category in ("WORK", "PRODUCTION", "BASE"):
                # 锁定上班，与夜班休息冲突 - 这里只能警告
                # 实际的冲突检测应该在 OperationAssignmentConstraint 预检查中处理
                logger.warning(
                    f"[{self.name}] 员工 {emp_id} 在 {rest_date} 锁定上班，"
                    f"与夜班休息硬约束可能冲突"
                )
            # 锁定休息，符合要求，无需添加约束
            return
        
        work_var = self.variables.shift_vars.get((emp_id, rest_date, "WORK"))
        if work_var is not None:
            # 如果当天是夜班，则 rest_date 必须休息
            self.model.Add(work_var == 0).OnlyEnforceIf(night_flag)
            self.constraints_added += 1
    
    def _apply_soft_rest_constraint(
        self,
        emp_id: int,
        night_flag: cp_model.IntVar,
        rest_date: str,
        reward: int,
        penalty: int
    ) -> None:
        """应用软约束：夜班后尽可能休息
        
        Args:
            emp_id: 员工ID
            night_flag: 夜班标记变量（0/1）
            rest_date: 建议休息的日期
            reward: 满足时的奖励分
            penalty: 不满足时的惩罚分
        """
        # 检查锁定班次
        locked = self.context.locked_shifts.get((emp_id, rest_date))
        if locked:
            # 有锁定班次，不添加软约束
            return
        
        work_var = self.variables.shift_vars.get((emp_id, rest_date, "WORK"))
        if work_var is None:
            return
        
        # 创建条件变量：violation = night_flag AND work_var
        # 如果夜班且上班 -> 违规，需要惩罚
        # 如果夜班且休息 -> 符合，需要奖励
        
        # 违规情况：夜班且上班
        # 使用乘法等式：night_and_work = night_flag * work_var
        night_and_work = self.model.NewBoolVar(
            f"night_work_{emp_id}_{rest_date}"
        )
        self.model.AddMultiplicationEquality(night_and_work, [night_flag, work_var])
        
        # 违规惩罚
        self.variables.add_penalty("night_rest_penalty", night_and_work)
        
        # 符合情况：夜班且休息
        # rest_var = 1 - work_var
        rest_var = self.model.NewBoolVar(f"rest_{emp_id}_{rest_date}")
        self.model.Add(rest_var == 1 - work_var)
        
        # night_and_rest = night_flag * rest_var
        night_and_rest = self.model.NewBoolVar(
            f"night_rest_{emp_id}_{rest_date}"
        )
        self.model.AddMultiplicationEquality(night_and_rest, [night_flag, rest_var])
        
        # 符合奖励
        self.variables.add_penalty("night_rest_reward", night_and_rest)
