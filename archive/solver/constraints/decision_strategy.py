"""
自适应变量决策策略

根据数据特征动态计算权重，优先处理关键操作，加速求解。

优化策略：
1. 夜班操作优先 - 夜班约束最严格，最难手动调节
2. 用工峰值日优先 - 高峰日操作密集，竞争激烈
3. 候选人稀缺操作优先 - 候选人少的操作更难分配
"""

import logging
from typing import Dict, List, Tuple
from collections import Counter
import math

from ortools.sat.python import cp_model

from models.context import SolverContext
from models.variables import ModelVariables

logger = logging.getLogger(__name__)


class DecisionStrategyBuilder:
    """自适应变量决策策略构建器
    
    评分维度（按重要性排序）：
    1. 夜班权重 (30%) - 夜班后有强制休息约束，最难手动调节
    2. 日期峰值 (30%) - 高峰日操作密集，竞争激烈
    3. 候选人稀缺度 (20%) - 候选人越少越难分配
    4. 操作频率 (10%) - 高频操作竞争资源
    5. 主管值班日 (10%) - 有操作日必须有主管在岗
    """
    
    # 默认权重配置
    DEFAULT_WEIGHTS = {
        'night': 30,        # 夜班操作权重
        'peak': 30,         # 日期峰值权重
        'scarcity': 20,     # 候选人稀缺度权重
        'frequency': 10,    # 操作频率权重
        'supervisor': 10,   # 主管相关权重
    }
    
    def __init__(
        self, 
        model: cp_model.CpModel, 
        context: SolverContext, 
        variables: ModelVariables
    ):
        self.model = model
        self.context = context
        self.variables = variables
        self.weights = {}
        self._daily_demand = None  # 缓存日期需求统计
    
    def build(self) -> int:
        """构建决策策略
        
        Returns:
            添加的策略变量数
        """
        if not self.variables.assignment_vars:
            logger.warning("[DecisionStrategy] 没有分配变量，跳过决策策略")
            return 0
        
        # 1. 预计算日期需求
        self._daily_demand = self._calc_daily_demand()
        self._log_peak_analysis()
        
        # 2. 使用固定权重（从配置读取或使用默认值）
        self.weights = self._get_configured_weights()
        logger.info(f"[DecisionStrategy] 权重配置: {self.weights}")
        
        # 3. 计算每个操作的优先级分数
        priorities = self._calculate_priorities()
        
        # 4. 按优先级排序变量（高分优先）
        sorted_vars = self._get_sorted_variables(priorities)
        
        if not sorted_vars:
            logger.warning("[DecisionStrategy] 没有可排序的变量")
            return 0
        
        # 5. 添加决策策略 - 改为 SELECT_MAX_VALUE 优先尝试分配
        self.model.AddDecisionStrategy(
            sorted_vars,
            cp_model.CHOOSE_FIRST,      # 按列表顺序选择变量
            cp_model.SELECT_MAX_VALUE   # 优先尝试 1（分配）- 确保优先分配
        )
        
        logger.info(f"[DecisionStrategy] 添加决策策略，涉及 {len(sorted_vars)} 个变量")
        return len(sorted_vars)
    
    def _get_configured_weights(self) -> Dict[str, int]:
        """获取配置的权重或使用默认值"""
        config = self.context.config
        return {
            'night': getattr(config, 'priority_weight_night', self.DEFAULT_WEIGHTS['night']),
            'peak': getattr(config, 'priority_weight_peak', self.DEFAULT_WEIGHTS['peak']),
            'scarcity': getattr(config, 'priority_weight_scarcity', self.DEFAULT_WEIGHTS['scarcity']),
            'frequency': getattr(config, 'priority_weight_frequency', self.DEFAULT_WEIGHTS['frequency']),
            'supervisor': getattr(config, 'priority_weight_supervisor', self.DEFAULT_WEIGHTS['supervisor']),
        }
    
    def _calc_daily_demand(self) -> Dict[str, int]:
        """计算每天的用工需求总量"""
        daily_demand = Counter()
        for op in self.context.operations.values():
            date_key = op.planned_start[:10] if op.planned_start else ""
            if date_key:
                daily_demand[date_key] += op.required_people
        return dict(daily_demand)
    
    def _log_peak_analysis(self) -> None:
        """记录峰值分析日志"""
        if not self._daily_demand:
            return
        
        values = list(self._daily_demand.values())
        if not values:
            return
        
        peak_date = max(self._daily_demand.keys(), key=lambda d: self._daily_demand[d])
        peak_demand = self._daily_demand[peak_date]
        avg_demand = sum(values) / len(values)
        
        logger.info(
            f"[DecisionStrategy] 日期峰值分析: "
            f"峰值日={peak_date} (需求{peak_demand}人), "
            f"平均={avg_demand:.1f}人, "
            f"覆盖{len(self._daily_demand)}天"
        )
    
    def _is_night_operation(self, op) -> bool:
        """判断是否是夜班操作"""
        try:
            start_hour = int(op.planned_start[11:13]) if op.planned_start else 0
            start_date = op.planned_start[:10] if op.planned_start else ""
            end_date = op.planned_end[:10] if op.planned_end else ""
            
            # 开始时间 >= 20:00 或跨日
            return start_hour >= 20 or start_date != end_date
        except:
            return False
    
    def _calculate_priorities(self) -> Dict[int, float]:
        """计算每个操作的优先级分数
        
        优先级越高的操作越早被分配变量，确保难分配的操作先被处理。
        """
        priorities = {}
        
        # 预计算统计量
        max_demand = max(self._daily_demand.values()) if self._daily_demand else 1
        night_count = sum(1 for op in self.context.operations.values() 
                         if self._is_night_operation(op))
        
        for op_id, op in self.context.operations.items():
            candidates = self.variables.operation_candidates.get(op_id, [])
            if not candidates:
                continue
            
            # 1. 夜班得分 (0 或 1)
            is_night = 1.0 if self._is_night_operation(op) else 0.0
            
            # 2. 日期峰值得分 (归一化到 0-1)
            date_key = op.planned_start[:10] if op.planned_start else ""
            daily_demand = self._daily_demand.get(date_key, 0)
            peak_score = daily_demand / max_demand if max_demand > 0 else 0.0
            
            # 3. 候选人稀缺度得分 (候选人越少分数越高)
            candidate_count = len(candidates)
            # 使用对数缩放，避免极端值主导
            scarcity = 1.0 / (1 + math.log(max(candidate_count, 1)))
            
            # 4. 操作频率得分
            op_type = getattr(op, 'operation_code', None) or 'unknown'
            type_count = sum(1 for o in self.context.operations.values() 
                           if (getattr(o, 'operation_code', None) or 'unknown') == op_type)
            frequency = type_count / len(self.context.operations) if self.context.operations else 0.0
            
            # 5. 主管参与得分
            has_supervisor = 0.0
            for emp_id, _ in candidates:
                emp = self.context.employees.get(emp_id)
                if emp:
                    role = getattr(emp, 'org_role', None) or getattr(emp, 'role_type', None)
                    if role and role.upper() in ('GROUP_LEADER', 'TEAM_LEADER'):
                        has_supervisor = 1.0
                        break
            
            # 综合得分（加权求和）
            score = (
                self.weights['night'] * is_night +
                self.weights['peak'] * peak_score +
                self.weights['scarcity'] * scarcity +
                self.weights['frequency'] * frequency +
                self.weights['supervisor'] * has_supervisor
            )
            
            priorities[op_id] = score
        
        # 记录优先级最高的操作
        if priorities:
            top_ops = sorted(priorities.keys(), key=lambda x: -priorities[x])[:5]
            for op_id in top_ops:
                op = self.context.operations.get(op_id)
                if op:
                    logger.debug(
                        f"[DecisionStrategy] 高优先级操作: op_{op_id} "
                        f"({op.operation_name or op.operation_code}), "
                        f"分数={priorities[op_id]:.1f}, "
                        f"夜班={self._is_night_operation(op)}, "
                        f"日期={op.planned_start[:10]}"
                    )
        
        return priorities
    
    def _get_sorted_variables(
        self, 
        priorities: Dict[int, float]
    ) -> List[cp_model.IntVar]:
        """按优先级排序变量
        
        高优先级操作的变量排在前面，确保它们先被考虑分配。
        """
        # 按优先级降序排列操作
        sorted_ops = sorted(priorities.keys(), key=lambda x: -priorities[x])
        
        # 收集变量
        sorted_vars = []
        for op_id in sorted_ops:
            candidates = self.variables.operation_candidates.get(op_id, [])
            # 对于每个操作，候选人按某种顺序排列（可以进一步优化）
            for emp_id, var in candidates:
                sorted_vars.append(var)
        
        return sorted_vars
