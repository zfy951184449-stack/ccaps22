"""
公平性约束模块

确保员工之间的工作分配公平性：
- 夜班数量公平
- 长白班数量公平
- 夜班间隔均匀
- 操作时长公平

所有约束都是软约束，不会阻止求解。

层级分组（按 org_role）：
- FRONTLINE / SHIFT_LEADER 为一组
- GROUP_LEADER 为一组
- TEAM_LEADER / MANAGER 通常不参与操作

约束规则：
F1. 夜班数量公平性：同层级员工夜班数量的 max-min 差值越小越好
F2. 长白班数量公平性：同层级员工长白班数量的 max-min 差值越小越好
F3. 夜班间隔均匀性：相邻夜班的间隔应尽可能接近平均间隔
F4. 操作时长公平性：同层级员工操作时长的 max-min 差值越小越好
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple, Optional
import logging
from ortools.sat.python import cp_model

from .base import BaseConstraint

logger = logging.getLogger(__name__)

# 默认罚分
PENALTY_NIGHT_SHIFT_UNFAIR = 200      # F1: 夜班不公平，每差1次
PENALTY_DAY_SHIFT_UNFAIR = 200        # F2: 长白班不公平，每差1次
PENALTY_NIGHT_INTERVAL_UNFAIR = 100   # F3: 夜班间隔不均匀，每偏离1天
PENALTY_OPERATION_TIME_UNFAIR = 50    # F4: 操作时长不公平，每差1小时


class FairnessConstraint(BaseConstraint):
    """公平性约束
    
    确保同层级员工之间的工作分配公平。
    """
    
    name = "Fairness"
    
    def __init__(self, model, context, variables):
        super().__init__(model, context, variables)
        
        # 按层级分组的员工
        self._role_groups: Dict[str, List[int]] = {}
        
        # 每个员工的夜班变量
        self._emp_night_shift_vars: Dict[int, List[cp_model.IntVar]] = {}
        
        # 每个员工的长白班变量
        self._emp_day_shift_vars: Dict[int, List[cp_model.IntVar]] = {}
        
        # 每个员工的操作时长变量（分钟）
        self._emp_operation_minutes_vars: Dict[int, List[Tuple[int, cp_model.IntVar]]] = {}
    
    def apply(self) -> None:
        """应用公平性约束"""
        if not self.context.config.enforce_fairness:
            logger.info(f"[{self.name}] 公平性约束已禁用")
            return
        
        logger.info(f"[{self.name}] 应用公平性约束...")
        
        # 步骤1: 按层级分组员工
        self._group_employees_by_role()
        
        # 步骤2: 收集每个员工的班次和操作变量
        self._collect_shift_vars()
        self._collect_operation_vars()
        
        # 步骤3: 应用各项公平性约束
        self._apply_night_shift_fairness()      # F1
        self._apply_day_shift_fairness()        # F2
        self._apply_night_interval_fairness()   # F3
        self._apply_operation_time_fairness()   # F4
        
        self.log_summary()
    
    def _group_employees_by_role(self) -> None:
        """按层级分组员工
        
        分组逻辑：
        - 'FRONTLINE_GROUP': FRONTLINE + SHIFT_LEADER
        - 'GROUP_LEADER_GROUP': GROUP_LEADER
        """
        self._role_groups = {
            'FRONTLINE_GROUP': [],
            'GROUP_LEADER_GROUP': [],
        }
        
        for emp_id, emp in self.context.employees.items():
            role = emp.org_role.upper()
            
            if role in ('FRONTLINE', 'SHIFT_LEADER'):
                self._role_groups['FRONTLINE_GROUP'].append(emp_id)
            elif role == 'GROUP_LEADER':
                self._role_groups['GROUP_LEADER_GROUP'].append(emp_id)
            # TEAM_LEADER 和 MANAGER 不参与公平性计算（通常不参与操作）
        
        for group_name, members in self._role_groups.items():
            logger.info(f"[{self.name}] {group_name}: {len(members)} 人")
    
    def _collect_shift_vars(self) -> None:
        """收集每个员工的班次变量"""
        for emp_id in self.context.employees.keys():
            self._emp_night_shift_vars[emp_id] = []
            self._emp_day_shift_vars[emp_id] = []
            
            for date_key in self.context.all_dates:
                # 检查是否为三倍工资日（不计入公平性）
                if self.context.is_triple_salary(date_key):
                    continue
                
                # 获取夜班变量
                night_var = self.variables.day_is_night.get((emp_id, date_key))
                if night_var is not None:
                    self._emp_night_shift_vars[emp_id].append(night_var)
                
                # 获取工作变量（非夜班即为长白班/常日班）
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    # 长白班 = 上班 且 不是夜班
                    if night_var is not None:
                        # 创建一个变量表示"长白班"
                        day_shift_var = self.model.NewBoolVar(
                            f"day_shift_{emp_id}_{date_key}"
                        )
                        # day_shift = work AND NOT night
                        self.model.Add(day_shift_var <= work_var)
                        self.model.Add(day_shift_var <= 1 - night_var)
                        self.model.Add(day_shift_var >= work_var - night_var)
                        self._emp_day_shift_vars[emp_id].append(day_shift_var)
                    else:
                        # 没有夜班变量，工作即为长白班
                        self._emp_day_shift_vars[emp_id].append(work_var)
    
    def _collect_operation_vars(self) -> None:
        """收集每个员工的操作时长变量"""
        for emp_id in self.context.employees.keys():
            self._emp_operation_minutes_vars[emp_id] = []
        
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            duration_minutes = op.planned_duration_minutes
            
            # 获取该操作的候选员工
            candidates = self.variables.operation_candidates.get(op_id, [])
            
            for emp_id, agg_var in candidates:
                self._emp_operation_minutes_vars[emp_id].append(
                    (duration_minutes, agg_var)
                )
    
    def _apply_night_shift_fairness(self) -> None:
        """F1: 夜班数量公平性
        
        对于每个层级组，最小化组内员工夜班数量的 max - min
        """
        logger.info(f"[{self.name}] 应用夜班数量公平性约束")
        
        for group_name, members in self._role_groups.items():
            if len(members) < 2:
                continue  # 少于2人无需比较
            
            # 过滤有夜班变量的员工
            valid_members = [
                emp_id for emp_id in members 
                if self._emp_night_shift_vars.get(emp_id)
            ]
            
            if len(valid_members) < 2:
                continue
            
            # 为每个员工创建夜班总数变量
            night_counts = []
            max_possible = len(self.context.all_dates)
            
            for emp_id in valid_members:
                night_vars = self._emp_night_shift_vars[emp_id]
                if not night_vars:
                    continue
                
                night_count = self.model.NewIntVar(
                    0, max_possible, f"night_count_{emp_id}"
                )
                self.model.Add(night_count == sum(night_vars))
                night_counts.append((emp_id, night_count))
            
            if len(night_counts) < 2:
                continue
            
            # 计算 max 和 min
            all_counts = [nc for _, nc in night_counts]
            
            max_night = self.model.NewIntVar(0, max_possible, f"max_night_{group_name}")
            min_night = self.model.NewIntVar(0, max_possible, f"min_night_{group_name}")
            
            self.model.AddMaxEquality(max_night, all_counts)
            self.model.AddMinEquality(min_night, all_counts)
            
            # 差值变量
            night_diff = self.model.NewIntVar(0, max_possible, f"night_diff_{group_name}")
            self.model.Add(night_diff == max_night - min_night)
            
            # 添加惩罚
            self.variables.add_penalty("night_shift_unfair", night_diff)
            
            logger.debug(f"[{self.name}] {group_name} 夜班公平性约束已添加")
    
    def _apply_day_shift_fairness(self) -> None:
        """F2: 长白班数量公平性
        
        对于每个层级组，最小化组内员工长白班数量的 max - min
        """
        logger.info(f"[{self.name}] 应用长白班数量公平性约束")
        
        for group_name, members in self._role_groups.items():
            if len(members) < 2:
                continue
            
            # 过滤有长白班变量的员工
            valid_members = [
                emp_id for emp_id in members 
                if self._emp_day_shift_vars.get(emp_id)
            ]
            
            if len(valid_members) < 2:
                continue
            
            # 为每个员工创建长白班总数变量
            day_counts = []
            max_possible = len(self.context.all_dates)
            
            for emp_id in valid_members:
                day_vars = self._emp_day_shift_vars[emp_id]
                if not day_vars:
                    continue
                
                day_count = self.model.NewIntVar(
                    0, max_possible, f"day_count_{emp_id}"
                )
                self.model.Add(day_count == sum(day_vars))
                day_counts.append((emp_id, day_count))
            
            if len(day_counts) < 2:
                continue
            
            # 计算 max 和 min
            all_counts = [dc for _, dc in day_counts]
            
            max_day = self.model.NewIntVar(0, max_possible, f"max_day_{group_name}")
            min_day = self.model.NewIntVar(0, max_possible, f"min_day_{group_name}")
            
            self.model.AddMaxEquality(max_day, all_counts)
            self.model.AddMinEquality(min_day, all_counts)
            
            # 差值变量
            day_diff = self.model.NewIntVar(0, max_possible, f"day_diff_{group_name}")
            self.model.Add(day_diff == max_day - min_day)
            
            # 添加惩罚
            self.variables.add_penalty("day_shift_unfair", day_diff)
            
            logger.debug(f"[{self.name}] {group_name} 长白班公平性约束已添加")
    
    def _apply_night_interval_fairness(self) -> None:
        """F3: 夜班间隔均匀性
        
        对于每个员工，相邻夜班的间隔应尽可能接近平均间隔。
        
        实现方式：
        - 假设员工有 N 次夜班，理想间隔 = 求解周期天数 / N
        - 惩罚相邻夜班间隔与理想间隔的偏差
        
        由于 N 是变量，实现较复杂。简化方案：
        - 惩罚连续或接近连续的夜班（间隔 < 3天）
        """
        logger.info(f"[{self.name}] 应用夜班间隔均匀性约束")
        
        min_interval = 3  # 最小理想间隔（天）
        
        for emp_id in self.context.employees.keys():
            night_vars = self._emp_night_shift_vars.get(emp_id, [])
            if len(night_vars) < 2:
                continue
            
            # 按日期排序
            dated_night_vars = []
            for date_key in self.context.all_dates:
                if self.context.is_triple_salary(date_key):
                    continue
                night_var = self.variables.day_is_night.get((emp_id, date_key))
                if night_var is not None:
                    dated_night_vars.append((date_key, night_var))
            
            if len(dated_night_vars) < 2:
                continue
            
            # 检查相邻日期对
            for i in range(len(dated_night_vars) - 1):
                for j in range(i + 1, min(i + min_interval, len(dated_night_vars))):
                    date_i, var_i = dated_night_vars[i]
                    date_j, var_j = dated_night_vars[j]
                    
                    # 计算间隔天数
                    try:
                        dt_i = datetime.strptime(date_i, "%Y-%m-%d")
                        dt_j = datetime.strptime(date_j, "%Y-%m-%d")
                        interval = (dt_j - dt_i).days
                    except:
                        continue
                    
                    if interval >= min_interval:
                        continue  # 间隔足够，不惩罚
                    
                    # 创建变量表示"两个夜班都被安排且间隔太近"
                    both_night = self.model.NewBoolVar(
                        f"close_nights_{emp_id}_{date_i}_{date_j}"
                    )
                    self.model.AddMultiplicationEquality(both_night, [var_i, var_j])
                    
                    # 惩罚
                    self.variables.add_penalty("night_interval_unfair", both_night)
    
    def _apply_operation_time_fairness(self) -> None:
        """F4: 操作时长公平性
        
        对于每个层级组，最小化组内员工操作时长的 max - min
        """
        logger.info(f"[{self.name}] 应用操作时长公平性约束")
        
        for group_name, members in self._role_groups.items():
            if len(members) < 2:
                continue
            
            # 过滤有操作变量的员工
            valid_members = [
                emp_id for emp_id in members 
                if self._emp_operation_minutes_vars.get(emp_id)
            ]
            
            if len(valid_members) < 2:
                continue
            
            # 为每个员工创建操作时长总变量（分钟）
            time_totals = []
            max_possible_minutes = len(self.context.all_dates) * 12 * 60  # 假设最多12小时/天
            
            for emp_id in valid_members:
                op_vars = self._emp_operation_minutes_vars[emp_id]
                if not op_vars:
                    continue
                
                # 计算加权和：sum(duration * var)
                weighted_sum = sum(duration * var for duration, var in op_vars)
                
                time_total = self.model.NewIntVar(
                    0, max_possible_minutes, f"op_time_{emp_id}"
                )
                self.model.Add(time_total == weighted_sum)
                time_totals.append((emp_id, time_total))
            
            if len(time_totals) < 2:
                continue
            
            # 计算 max 和 min
            all_times = [tt for _, tt in time_totals]
            
            max_time = self.model.NewIntVar(0, max_possible_minutes, f"max_time_{group_name}")
            min_time = self.model.NewIntVar(0, max_possible_minutes, f"min_time_{group_name}")
            
            self.model.AddMaxEquality(max_time, all_times)
            self.model.AddMinEquality(min_time, all_times)
            
            # 差值变量（分钟）
            time_diff = self.model.NewIntVar(0, max_possible_minutes, f"time_diff_{group_name}")
            self.model.Add(time_diff == max_time - min_time)
            
            # 转换为小时单位的惩罚
            # 由于 CP-SAT 只支持整数，我们用分钟数的 1/60 近似
            # 每差60分钟（1小时）罚一次
            time_diff_hours = self.model.NewIntVar(
                0, max_possible_minutes // 60, f"time_diff_hours_{group_name}"
            )
            self.model.AddDivisionEquality(time_diff_hours, time_diff, 60)
            
            # 添加惩罚
            self.variables.add_penalty("operation_time_unfair", time_diff_hours)
            
            logger.debug(f"[{self.name}] {group_name} 操作时长公平性约束已添加")

