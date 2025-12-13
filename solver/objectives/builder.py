"""
目标函数构建器

构建 CP-SAT 模型的目标函数。
"""

from __future__ import annotations
from typing import TYPE_CHECKING, List
import logging
import random
import time

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from models.context import SolverContext
    from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class ObjectiveBuilder:
    """目标函数构建器
    
    最小化以下目标：
    1. 操作缺口（松弛变量）- 高优先级
    2. 各类软约束违规惩罚
    3. 三倍工资日人数（软约束）
    """
    
    # 惩罚权重（部分可从 config 覆盖）
    WEIGHTS = {
        "slack": 10000,              # 操作缺口（最高优先级）- 兼容旧版
        "skip_position": None,       # 跳过位置（缺员）- 从 config 读取
        "sharing_violation": None,   # 共享人员不满足 - 从 config 读取
        "night_rest": 100,           # 夜班休息违规
        "triple_holiday": 10,        # 三倍工资日人数
    }
    
    def __init__(
        self,
        model: cp_model.CpModel,
        context: SolverContext,
        variables: ModelVariables,
    ):
        self.model = model
        self.context = context
        self.variables = variables
    
    def build(self) -> None:
        """构建目标函数"""
        terms: List = []
        
        # 1. 跳过位置（缺员）惩罚（最高优先级）
        skip_penalty = self._build_skip_position_penalty()
        if skip_penalty is not None:
            terms.append(skip_penalty)
        
        # 2. 共享人员不满足惩罚
        sharing_penalty = self._build_sharing_violation_penalty()
        if sharing_penalty is not None:
            terms.append(sharing_penalty)
        
        # 3. 工作日休息惩罚（软约束）
        workday_rest_penalty = self._build_workday_rest_penalty()
        if workday_rest_penalty is not None:
            terms.append(workday_rest_penalty)
        
        # 4. 非工作日上班惩罚（软约束）
        non_workday_work_penalty = self._build_non_workday_work_penalty()
        if non_workday_work_penalty is not None:
            terms.append(non_workday_work_penalty)
        
        # 5. 夜班休息惩罚和奖励
        night_rest_terms = self._build_night_rest_penalties()
        terms.extend(night_rest_terms)
        
        # 6. 主管约束惩罚和奖励
        supervisor_terms = self._build_supervisor_penalties()
        terms.extend(supervisor_terms)
        
        # 7. 公平性约束惩罚
        fairness_terms = self._build_fairness_penalties()
        terms.extend(fairness_terms)
        
        # 8. 三倍工资日人数惩罚（软约束）
        triple_penalty = self._build_triple_holiday_penalty()
        if triple_penalty is not None:
            terms.append(triple_penalty)
        
        # 9. 最大化分配数量（作为奖励）
        assignment_bonus = self._build_assignment_bonus()
        if assignment_bonus is not None:
            terms.append(-assignment_bonus)  # 负号表示奖励
        
        # 10. 随机扰动（增加结果多样性）
        perturbation_term = self._build_random_perturbation()
        if perturbation_term is not None:
            terms.append(perturbation_term)
        
        # 设置目标函数
        if terms:
            self.model.Minimize(sum(terms))
            logger.info(f"[ObjectiveBuilder] 目标函数包含 {len(terms)} 个项")
        else:
            logger.warning("[ObjectiveBuilder] 目标函数为空")
    
    def _build_skip_position_penalty(self):
        """构建跳过位置（缺员）惩罚"""
        penalties = self.variables.get_penalties("skip_position")
        if not penalties:
            return None
        
        # 从配置读取权重
        weight = self.context.config.skip_position_penalty
        
        logger.info(f"[ObjectiveBuilder] 跳过位置惩罚: {len(penalties)} 个变量, 权重={weight}")
        return sum(penalties) * weight
    
    def _build_sharing_violation_penalty(self):
        """构建共享人员不满足惩罚"""
        penalties = self.variables.get_penalties("sharing_violation")
        if not penalties:
            return None
        
        # 从配置读取权重
        weight = self.context.config.sharing_violation_penalty
        
        logger.info(f"[ObjectiveBuilder] 共享违规惩罚: {len(penalties)} 个变量, 权重={weight}")
        return sum(penalties) * weight
    
    def _build_workday_rest_penalty(self):
        """构建工作日休息惩罚"""
        penalties = self.variables.get_penalties("workday_rest")
        if not penalties:
            return None
        
        # 从配置读取权重
        weight = self.context.config.workday_rest_penalty
        
        logger.info(f"[ObjectiveBuilder] 工作日休息惩罚: {len(penalties)} 个变量, 权重={weight}")
        return sum(penalties) * weight
    
    def _build_non_workday_work_penalty(self):
        """构建非工作日上班惩罚"""
        penalties = self.variables.get_penalties("non_workday_work")
        if not penalties:
            return None
        
        # 从配置读取权重
        weight = self.context.config.non_workday_work_penalty
        
        logger.info(f"[ObjectiveBuilder] 非工作日上班惩罚: {len(penalties)} 个变量, 权重={weight}")
        return sum(penalties) * weight
    
    def _build_night_rest_penalties(self):
        """构建夜班休息相关的惩罚和奖励
        
        包含4个类别：
        - night_rest_penalty: 夜班后上班惩罚
        - night_rest_reward: 夜班后休息奖励（负权重）
        - night_rest_op_penalty: 夜班后分配操作惩罚
        - night_rest_op_reward: 夜班后不分配操作奖励（负权重）
        """
        terms = []
        
        penalty_weight = self.context.config.night_rest_penalty
        reward_weight = self.context.config.night_rest_reward
        
        # 夜班后上班惩罚
        penalties = self.variables.get_penalties("night_rest_penalty")
        if penalties:
            term = sum(penalties) * penalty_weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班休息惩罚: {len(penalties)} 个变量, 权重={penalty_weight}")
        
        # 夜班后休息奖励（负权重，减少目标值）
        rewards = self.variables.get_penalties("night_rest_reward")
        if rewards:
            term = sum(rewards) * (-reward_weight)  # 负权重表示奖励
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班休息奖励: {len(rewards)} 个变量, 权重=-{reward_weight}")
        
        # 夜班后分配操作惩罚（操作分配层面）
        op_penalties = self.variables.get_penalties("night_rest_op_penalty")
        if op_penalties:
            term = sum(op_penalties) * penalty_weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班操作惩罚: {len(op_penalties)} 个变量, 权重={penalty_weight}")
        
        # 夜班后不分配操作奖励（操作分配层面）
        op_rewards = self.variables.get_penalties("night_rest_op_reward")
        if op_rewards:
            term = sum(op_rewards) * (-reward_weight)
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班操作奖励: {len(op_rewards)} 个变量, 权重=-{reward_weight}")
        
        return terms
    
    def _build_supervisor_penalties(self):
        """构建主管约束相关的惩罚和奖励
        
        包含以下类别：
        - group_leader_operation: GROUP_LEADER参与操作的惩罚 (S1a)
        - no_group_leader_operation: 操作中无GROUP_LEADER的奖励 (S1b)
        - no_supervisor_on_duty: 有操作日无主管在岗的惩罚 (S2a)
        - extra_supervisor_non_workday: 非工作日多余主管的惩罚 (S2b)
        - team_leader_non_workday: TEAM_LEADER非工作日上班的惩罚 (S4)
        - rotation_violation: 轮流值班违规的惩罚 (S6)
        """
        terms = []
        
        # S1a: GROUP_LEADER参与操作惩罚（变量已按时长添加多次，权重=1）
        gl_op_penalties = self.variables.get_penalties("group_leader_operation")
        if gl_op_penalties:
            term = sum(gl_op_penalties)  # 变量数量=惩罚分数
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] GROUP_LEADER操作惩罚: {len(gl_op_penalties)} 个变量")
        
        # S1b: 操作中无GROUP_LEADER的奖励
        no_gl_reward = self.context.config.no_group_leader_operation_reward
        no_gl_rewards = self.variables.get_penalties("no_group_leader_operation")
        if no_gl_rewards:
            term = sum(no_gl_rewards) * (-no_gl_reward)  # 负权重表示奖励
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 无GROUP_LEADER奖励: {len(no_gl_rewards)} 个变量, 权重=-{no_gl_reward}")
        
        # S2a: 有操作日无主管在岗惩罚（变量已按罚分添加多次，权重=1）
        no_supervisor_penalties = self.variables.get_penalties("no_supervisor_on_duty")
        if no_supervisor_penalties:
            term = sum(no_supervisor_penalties)
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 无主管在岗惩罚: {len(no_supervisor_penalties)} 个变量")
        
        # S2b: 非工作日多余主管惩罚（变量已按罚分添加多次，权重=1）
        extra_supervisor_penalties = self.variables.get_penalties("extra_supervisor_non_workday")
        if extra_supervisor_penalties:
            term = sum(extra_supervisor_penalties)
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 非工作日多余主管惩罚: {len(extra_supervisor_penalties)} 个变量")
        
        # S4: TEAM_LEADER非工作日上班惩罚（变量已按罚分添加多次，权重=1）
        tl_nonworkday_penalties = self.variables.get_penalties("team_leader_non_workday")
        if tl_nonworkday_penalties:
            term = sum(tl_nonworkday_penalties)
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] TEAM_LEADER非工作日惩罚: {len(tl_nonworkday_penalties)} 个变量")
        
        # S6: 轮流值班违规惩罚（变量已按罚分添加多次，权重=1）
        rotation_penalties = self.variables.get_penalties("rotation_violation")
        if rotation_penalties:
            term = sum(rotation_penalties)
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 轮流值班违规惩罚: {len(rotation_penalties)} 个变量")
        
        return terms
    
    def _build_penalty_term(self, category: str, weight: int):
        """构建惩罚项"""
        penalties = self.variables.get_penalties(category)
        if not penalties:
            return None
        
        return sum(penalties) * weight
    
    def _build_fairness_penalties(self):
        """构建公平性约束惩罚
        
        包含4个类别：
        - night_shift_unfair: 夜班数量不公平（每差1次）
        - day_shift_unfair: 长白班数量不公平（每差1次）
        - night_interval_unfair: 夜班间隔不均匀（每次）
        - operation_time_unfair: 操作时长不公平（每差1小时）
        """
        terms = []
        
        # F1: 夜班数量不公平
        night_unfair = self.variables.get_penalties("night_shift_unfair")
        if night_unfair:
            weight = self.context.config.night_shift_unfair_penalty
            term = sum(night_unfair) * weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班不公平惩罚: {len(night_unfair)} 个变量, 权重={weight}")
        
        # F2: 长白班数量不公平
        day_unfair = self.variables.get_penalties("day_shift_unfair")
        if day_unfair:
            weight = self.context.config.day_shift_unfair_penalty
            term = sum(day_unfair) * weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 长白班不公平惩罚: {len(day_unfair)} 个变量, 权重={weight}")
        
        # F3: 夜班间隔不均匀
        interval_unfair = self.variables.get_penalties("night_interval_unfair")
        if interval_unfair:
            weight = self.context.config.night_interval_unfair_penalty
            term = sum(interval_unfair) * weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 夜班间隔不均匀惩罚: {len(interval_unfair)} 个变量, 权重={weight}")
        
        # F4: 操作时长不公平
        time_unfair = self.variables.get_penalties("operation_time_unfair")
        if time_unfair:
            weight = self.context.config.operation_time_unfair_penalty
            term = sum(time_unfair) * weight
            terms.append(term)
            logger.info(f"[ObjectiveBuilder] 操作时长不公平惩罚: {len(time_unfair)} 个变量, 权重={weight}")
        
        return terms
    
    def _build_triple_holiday_penalty(self):
        """构建三倍工资日人数惩罚（软约束）
        
        最小化三倍工资日的排班人数，但允许超额
        """
        if not self.context.config.minimize_triple_holiday_staff:
            return None
        
        weight = self.WEIGHTS["triple_holiday"]
        triple_vars = []
        
        for date_key in self.context.all_dates:
            if not self.context.is_triple_salary(date_key):
                continue
            
            for emp_id in self.context.employees.keys():
                work_var = self.variables.shift_vars.get((emp_id, date_key, "WORK"))
                if work_var is not None:
                    triple_vars.append(work_var)
        
        if not triple_vars:
            return None
        
        return sum(triple_vars) * weight
    
    def _build_assignment_bonus(self):
        """构建分配奖励（最大化分配数量）"""
        if not self.variables.assignment_vars:
            return None
        
        terms = []
        for (op_id, emp_id), var in self.variables.assignment_vars.items():
            terms.append(var)
        
        return sum(terms) if terms else None
    
    def _build_random_perturbation(self):
        """构建随机扰动项
        
        为每个分配变量添加随机小权重，打破员工之间的对称性，
        从而在多次求解时产生不同的结果。
        
        配置参数：
        - enable_random_perturbation: 是否启用
        - random_seed: 随机种子（None则每次不同）
        - perturbation_weight: 扰动权重上限（1-10推荐）
        
        Returns:
            随机扰动项的加权和，或 None（如果禁用）
        """
        if not self.context.config.enable_random_perturbation:
            return None
        
        if not self.variables.assignment_vars:
            return None
        
        # 设置随机种子
        seed = self.context.config.random_seed
        if seed is not None:
            random.seed(seed)
        else:
            # 使用当前时间作为种子，确保每次运行不同
            random.seed(int(time.time() * 1000) % (2**31))
        
        max_weight = self.context.config.perturbation_weight
        if max_weight <= 0:
            max_weight = 5  # 默认值
        
        terms = []
        perturbation_count = 0
        
        for (op_id, emp_id), var in self.variables.assignment_vars.items():
            # 为每个分配变量生成 [0, max_weight] 的随机权重
            random_weight = random.randint(0, max_weight)
            if random_weight > 0:
                terms.append(var * random_weight)
                perturbation_count += 1
        
        if terms:
            logger.info(
                f"[ObjectiveBuilder] 随机扰动: {perturbation_count} 个变量, "
                f"权重范围=[0, {max_weight}], seed={seed}"
            )
            return sum(terms)
        
        return None
