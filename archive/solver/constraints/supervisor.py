"""
主管约束模块

管理员工级别相关的约束，确保合理的人员层级分配。

层级顺序（从低到高）：
FRONTLINE < SHIFT_LEADER < GROUP_LEADER < TEAM_LEADER < MANAGER

约束规则：
H1. 硬约束：禁止分配操作给 TEAM_LEADER 及以上级别（在 context._compute_candidates 实现）

S1a. 软约束：GROUP_LEADER 参与操作时罚分（300分/人/小时）
S1b. 软约束：操作中无 GROUP_LEADER 时奖励（100分/操作）

S2a. 硬→软约束：有操作日至少1名 GROUP_LEADER+ 在班（无法满足时罚 5000分/天）
S2b. 硬→软约束：非工作日有操作时最多1名 GROUP_LEADER+ 在班（多余罚 3000分/人次）

S3. 软约束：非工作日无操作时 GROUP_LEADER+ 应休息（已在 ShiftConsistency 处理）

S4. 软约束：TEAM_LEADER 非工作日上班时罚分（500分/人次）

S5. 软约束：非工作日值班优先 GROUP_LEADER 而非 TEAM_LEADER

S6. 软约束：轮流值班（同一主管多个非工作日值班时，额外罚 200分/人次）
"""

from __future__ import annotations
import logging
from typing import Dict, List, Set, Tuple
from ortools.sat.python import cp_model

from .base import BaseConstraint

logger = logging.getLogger(__name__)


# 员工级别常量
ROLE_HIERARCHY = {
    "FRONTLINE": 1,
    "SHIFT_LEADER": 2,
    "GROUP_LEADER": 3,
    "TEAM_LEADER": 4,
    "MANAGER": 5,
}

# 惩罚分值常量
PENALTY_NO_SUPERVISOR_ON_DUTY = 5000       # S2a: 有操作日无主管在班
PENALTY_EXTRA_SUPERVISOR_NON_WORKDAY = 3000  # S2b: 非工作日多余主管
PENALTY_TEAM_LEADER_NON_WORKDAY = 500      # S4: TEAM_LEADER 非工作日上班
PENALTY_ROTATION_VIOLATION = 200           # S6: 轮流值班违规


def get_role_level(role: str) -> int:
    """获取角色级别数值"""
    return ROLE_HIERARCHY.get(role.upper(), 0)


def is_group_leader_or_above(role: str) -> bool:
    """判断是否为 GROUP_LEADER 或以上级别"""
    return get_role_level(role) >= ROLE_HIERARCHY["GROUP_LEADER"]


def is_team_leader_or_above(role: str) -> bool:
    """判断是否为 TEAM_LEADER 或以上级别"""
    return get_role_level(role) >= ROLE_HIERARCHY["TEAM_LEADER"]


def is_group_leader(role: str) -> bool:
    """判断是否为 GROUP_LEADER"""
    return role.upper() == "GROUP_LEADER"


def is_team_leader(role: str) -> bool:
    """判断是否为 TEAM_LEADER"""
    return role.upper() == "TEAM_LEADER"


def is_frontline_or_shift_leader(role: str) -> bool:
    """判断是否为一线人员或 SHIFT_LEADER"""
    level = get_role_level(role)
    return level in (ROLE_HIERARCHY["FRONTLINE"], ROLE_HIERARCHY["SHIFT_LEADER"])


class SupervisorConstraint(BaseConstraint):
    """主管约束
    
    管理员工级别相关的约束。
    """
    
    name = "Supervisor"
    
    def apply(self) -> None:
        """应用主管约束"""
        if not self.context.config.enforce_supervisor_constraints:
            logger.info(f"[{self.name}] 主管约束已禁用")
            return
        
        logger.info(f"[{self.name}] 应用主管约束...")
        
        # 缓存员工角色信息
        self._emp_roles: Dict[int, str] = {}
        self._group_leaders: Set[int] = set()
        self._team_leaders: Set[int] = set()
        self._supervisors: Set[int] = set()  # GROUP_LEADER+
        
        for emp_id, emp in self.context.employees.items():
            role = emp.org_role.upper()
            self._emp_roles[emp_id] = role
            
            if is_group_leader(role):
                self._group_leaders.add(emp_id)
                self._supervisors.add(emp_id)
            elif is_team_leader_or_above(role):
                self._team_leaders.add(emp_id)
                self._supervisors.add(emp_id)
        
        # 统计各级别人数
        role_counts = {}
        for role in self._emp_roles.values():
            role_counts[role] = role_counts.get(role, 0) + 1
        logger.info(f"[{self.name}] 员工级别分布: {role_counts}")
        logger.info(f"[{self.name}] GROUP_LEADER 数量: {len(self._group_leaders)}")
        logger.info(f"[{self.name}] TEAM_LEADER+ 数量: {len(self._team_leaders)}")
        
        # 识别有操作的日期和非工作日有操作的日期
        self._operation_dates: Set[str] = set()
        self._non_workday_operation_dates: Set[str] = set()
        
        for op in self.context.operations.values():
            date_key = op.planned_start[:10]
            self._operation_dates.add(date_key)
            
            calendar_day = self.context.calendar_info.get(date_key)
            if calendar_day and not calendar_day.is_workday:
                self._non_workday_operation_dates.add(date_key)
        
        logger.info(f"[{self.name}] 有操作的日期数: {len(self._operation_dates)}")
        logger.info(f"[{self.name}] 非工作日有操作的日期数: {len(self._non_workday_operation_dates)}")
        
        # 应用约束
        # 注意：H1（禁止 TEAM_LEADER+ 参与操作）在 context._compute_candidates 中处理
        
        # S1: GROUP_LEADER 参与操作的惩罚/奖励
        self._apply_group_leader_operation_constraints()
        
        # S2a: 有操作日至少1名 GROUP_LEADER+ 在班（硬→软约束）
        self._apply_supervisor_on_duty_constraints()
        
        # S2b: 非工作日有操作时恰好1名 GROUP_LEADER+ 在班
        self._apply_non_workday_supervisor_limit_constraints()
        
        # S4: TEAM_LEADER 非工作日上班惩罚
        self._apply_team_leader_non_workday_constraints()
        
        # S6: 轮流值班
        self._apply_rotation_constraints()
        
        self.log_summary()
    
    def _apply_group_leader_operation_constraints(self) -> None:
        """S1: GROUP_LEADER 参与操作的惩罚和奖励
        
        - GROUP_LEADER 参与操作：罚分 = 300 × 时长(h)
        - 操作中无 GROUP_LEADER：奖励 100分
        """
        penalty_per_hour = self.context.config.group_leader_operation_penalty
        reward_per_op = self.context.config.no_group_leader_operation_reward
        
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            # 获取操作时长（小时）
            duration_hours = op.planned_duration_minutes / 60.0
            
            # 获取该操作的候选人
            candidates = self.variables.operation_candidates.get(op_id, [])
            
            group_leader_vars = []
            
            for emp_id, agg_var in candidates:
                role = self._emp_roles.get(emp_id, "")
                
                if role == "GROUP_LEADER":
                    group_leader_vars.append(agg_var)
                    
                    # 惩罚：GROUP_LEADER 参与操作
                    # 计算罚分（按时长）
                    penalty_points = int(penalty_per_hour * duration_hours)
                    
                    # 创建惩罚变量
                    penalty_var = self.model.NewBoolVar(
                        f"gl_op_penalty_{emp_id}_{op_id}"
                    )
                    # penalty_var = agg_var
                    self.model.Add(penalty_var == agg_var)
                    
                    # 添加到惩罚池（会乘以权重）
                    # 由于我们需要按时长计算，这里直接添加多个变量
                    for _ in range(penalty_points):
                        self.variables.add_penalty("group_leader_operation", penalty_var)
            
            # 奖励：操作中无 GROUP_LEADER
            if group_leader_vars:
                # 创建"无 GROUP_LEADER 参与"的变量
                no_gl_var = self.model.NewBoolVar(f"no_gl_op_{op_id}")
                
                # no_gl_var = 1 当且仅当所有 group_leader_vars 都为 0
                # 即 no_gl_var = 1 - max(group_leader_vars)
                if len(group_leader_vars) == 1:
                    self.model.Add(no_gl_var == 1 - group_leader_vars[0])
                else:
                    # 任一 GROUP_LEADER 被分配，则 no_gl_var = 0
                    any_gl = self.model.NewBoolVar(f"any_gl_op_{op_id}")
                    self.model.AddMaxEquality(any_gl, group_leader_vars)
                    self.model.Add(no_gl_var == 1 - any_gl)
                
                # 添加奖励
                self.variables.add_penalty("no_group_leader_operation", no_gl_var)
    
    def _apply_supervisor_on_duty_constraints(self) -> None:
        """S2a: 有操作日至少1名 GROUP_LEADER+ 在班
        
        硬约束尝试，如果无法满足则降级为软约束（5000分/天）
        """
        for date_key in self._operation_dates:
            # 获取当天所有 GROUP_LEADER+ 的工作变量
            supervisor_work_vars = []
            
            for emp_id in self._supervisors:
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    supervisor_work_vars.append(work_var)
            
            if not supervisor_work_vars:
                logger.warning(
                    f"[{self.name}] {date_key} 没有 GROUP_LEADER+ 员工可排班"
                )
                continue
            
            # 创建 slack 变量用于降级
            slack_var = self.model.NewBoolVar(f"supervisor_on_duty_slack_{date_key}")
            
            # 硬约束：至少1名主管在班，或使用 slack
            # sum(work_vars) >= 1 - slack_var  =>  sum(work_vars) + slack_var >= 1
            self.model.Add(sum(supervisor_work_vars) + slack_var >= 1)
            
            # 如果使用 slack（没有主管在班），罚分
            for _ in range(PENALTY_NO_SUPERVISOR_ON_DUTY):
                self.variables.add_penalty("no_supervisor_on_duty", slack_var)
            
            self.constraints_added += 1
            logger.debug(f"[{self.name}] {date_key} 添加至少1名主管在班约束")
    
    def _apply_non_workday_supervisor_limit_constraints(self) -> None:
        """S2b: 非工作日有操作时恰好1名 GROUP_LEADER+ 在班
        
        结合 S2a（至少1名），这里只需要确保最多1名。
        硬约束尝试，如果无法满足则降级为软约束（3000分/多余人次）
        """
        for date_key in self._non_workday_operation_dates:
            # 获取当天所有 GROUP_LEADER+ 的工作变量
            supervisor_work_vars = []
            
            for emp_id in self._supervisors:
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    supervisor_work_vars.append((emp_id, work_var))
            
            if len(supervisor_work_vars) <= 1:
                # 只有0或1个主管，无需限制
                continue
            
            # 计算在班主管总数
            total_supervisors = self.model.NewIntVar(
                0, len(supervisor_work_vars), f"total_supervisors_{date_key}"
            )
            self.model.Add(total_supervisors == sum(wv for _, wv in supervisor_work_vars))
            
            # 为每个额外的主管添加惩罚
            # 使用分层的 BoolVar 来表示 "第 i+1 个主管在班"
            for i in range(1, len(supervisor_work_vars)):
                # 当 total_supervisors >= i + 1 时触发惩罚
                extra_at_least_i = self.model.NewBoolVar(f"extra_at_least_{i}_{date_key}")
                self.model.Add(total_supervisors >= i + 1).OnlyEnforceIf(extra_at_least_i)
                self.model.Add(total_supervisors <= i).OnlyEnforceIf(extra_at_least_i.Not())
                
                # 罚分
                for _ in range(PENALTY_EXTRA_SUPERVISOR_NON_WORKDAY):
                    self.variables.add_penalty("extra_supervisor_non_workday", extra_at_least_i)
            
            self.constraints_added += 1
            logger.debug(f"[{self.name}] {date_key} 添加非工作日最多1名主管约束")
    
    def _apply_team_leader_non_workday_constraints(self) -> None:
        """S4: TEAM_LEADER 非工作日上班惩罚
        
        TEAM_LEADER 在非工作日上班时，惩罚 500分/人次
        """
        for date_key in self.context.all_dates:
            # 检查是否为非工作日
            calendar_day = self.context.calendar_info.get(date_key)
            if calendar_day is None or calendar_day.is_workday:
                continue
            
            # 遍历所有 TEAM_LEADER+
            for emp_id in self._team_leaders:
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is None:
                    continue
                
                # 创建惩罚变量
                penalty_var = self.model.NewBoolVar(
                    f"tl_nonworkday_{emp_id}_{date_key}"
                )
                self.model.Add(penalty_var == work_var)
                
                # 添加惩罚
                for _ in range(PENALTY_TEAM_LEADER_NON_WORKDAY):
                    self.variables.add_penalty("team_leader_non_workday", penalty_var)
    
    def _apply_rotation_constraints(self) -> None:
        """S6: 轮流值班
        
        同一主管在多个非工作日值班时，额外罚分（200分/次）
        目的是让不同非工作日安排不同的主管
        """
        if not self._non_workday_operation_dates:
            return
        
        # 对每个 GROUP_LEADER，统计非工作日值班次数
        for emp_id in self._group_leaders:
            non_workday_work_vars = []
            
            for date_key in sorted(self._non_workday_operation_dates):
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    non_workday_work_vars.append(work_var)
            
            if len(non_workday_work_vars) <= 1:
                continue
            
            # 计算非工作日值班总次数
            total_non_workday_work = self.model.NewIntVar(
                0, len(non_workday_work_vars), f"total_nwd_work_{emp_id}"
            )
            self.model.Add(total_non_workday_work == sum(non_workday_work_vars))
            
            # 对于超过1次的值班，每次额外罚分
            # 即：罚分 = max(0, total - 1) * 200
            for i in range(1, len(non_workday_work_vars)):
                # 第 i+1 次及以后的值班
                work_at_least_i_plus_1 = self.model.NewBoolVar(
                    f"nwd_work_at_least_{i+1}_{emp_id}"
                )
                self.model.Add(total_non_workday_work >= i + 1).OnlyEnforceIf(work_at_least_i_plus_1)
                self.model.Add(total_non_workday_work <= i).OnlyEnforceIf(work_at_least_i_plus_1.Not())
                
                # 罚分
                for _ in range(PENALTY_ROTATION_VIOLATION):
                    self.variables.add_penalty("rotation_violation", work_at_least_i_plus_1)

