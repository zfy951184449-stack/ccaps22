"""
智能优先级策略

根据操作属性计算优先级加成，使重要操作优先填满。
"""

from typing import TYPE_CHECKING, Dict, Set
from datetime import datetime

from utils.logger import debug, info

if TYPE_CHECKING:
    from core.context import SolverContext


class SmartPriorityObjective:
    """
    智能优先级策略
    
    根据以下规则计算操作的优先级加成:
    - 夜班操作: +5000 (最高优先级)
    - 高峰需求日: +3000
    - 常规操作: +1000 (基础)
    """
    
    NIGHT_SHIFT_BONUS = 5000   # 夜班加成
    PEAK_DAY_BONUS = 3000      # 高峰日加成
    NORMAL_BONUS = 1000        # 常规加成
    
    def __init__(
        self,
        night_shift_bonus: int = 5000,
        peak_day_bonus: int = 3000,
        normal_bonus: int = 1000,
    ):
        self.night_shift_bonus = night_shift_bonus
        self.peak_day_bonus = peak_day_bonus
        self.normal_bonus = normal_bonus
        self.priority_bonuses: Dict[int, int] = {}
    
    def calculate_priorities(
        self, 
        context: 'SolverContext',
        peak_days: Set[str] = None,  # 高峰日期集合 (YYYY-MM-DD)
    ) -> Dict[int, int]:
        """
        计算每个操作的优先级加成
        
        Args:
            context: 求解上下文
            peak_days: 高峰日期集合
            
        Returns:
            {op_id: priority_bonus}
        """
        peak_days = peak_days or set()
        
        for op in context.request.operations:
            op_id = op.id
            bonus = self.normal_bonus  # 基础加成
            reasons = []
            
            # 检查是否是夜班操作
            if self._is_night_shift_operation(op, context):
                bonus = max(bonus, self.night_shift_bonus)
                reasons.append("夜班")
            
            # 检查是否在高峰日
            op_date = self._get_operation_date(op)
            if op_date in peak_days:
                bonus = max(bonus, self.peak_day_bonus)
                reasons.append("高峰日")
            
            # 检查操作本身的优先级标记
            if hasattr(op, 'priority') and op.priority == "CRITICAL":
                bonus = max(bonus, self.night_shift_bonus)  # 关键操作同等夜班
                reasons.append("关键操作")
            
            self.priority_bonuses[op_id] = bonus
            
            if reasons:
                debug(f"操作 {op_id} 优先级加成 {bonus}: {', '.join(reasons)}")
        
        # 统计优先级分布
        night_count = sum(1 for b in self.priority_bonuses.values() if b >= self.night_shift_bonus)
        peak_count = sum(1 for b in self.priority_bonuses.values() 
                        if self.peak_day_bonus <= b < self.night_shift_bonus)
        normal_count = sum(1 for b in self.priority_bonuses.values() if b < self.peak_day_bonus)
        
        info(f"[智能优先级] 夜班/关键: {night_count}, 高峰日: {peak_count}, 常规: {normal_count}")
        
        return self.priority_bonuses
    
    def _is_night_shift_operation(self, op, context: 'SolverContext') -> bool:
        """检查操作是否属于夜班"""
        # 方法1: 检查操作时间
        try:
            planned_start = op.planned_start
            if isinstance(planned_start, str):
                planned_start = datetime.fromisoformat(planned_start.replace('Z', '+00:00'))
            
            start_hour = planned_start.hour
            
            # 夜班定义: 晚上20点之后 或 凌晨6点之前
            if start_hour >= 20 or start_hour < 6:
                return True
        except:
            pass
        
        # 方法2: 检查是否在夜班班次的操作日期内
        # (需要更复杂的逻辑，这里简化处理)
        
        return False
    
    def _get_operation_date(self, op) -> str:
        """获取操作日期"""
        try:
            planned_start = op.planned_start
            if isinstance(planned_start, str):
                return planned_start[:10]  # YYYY-MM-DD
            elif hasattr(planned_start, 'strftime'):
                return planned_start.strftime('%Y-%m-%d')
        except:
            pass
        return ""
    
    def identify_peak_days(
        self, 
        context: 'SolverContext',
        threshold_percentile: float = 0.75,
    ) -> Set[str]:
        """
        自动识别高峰日
        
        基于每日操作人数需求，识别需求量前25%的日期为高峰日。
        """
        daily_demand: Dict[str, int] = {}
        
        for op in context.request.operations:
            date_str = self._get_operation_date(op)
            if date_str:
                if date_str not in daily_demand:
                    daily_demand[date_str] = 0
                daily_demand[date_str] += op.required_people
        
        if not daily_demand:
            return set()
        
        # 计算阈值
        demands = sorted(daily_demand.values())
        threshold_idx = int(len(demands) * threshold_percentile)
        threshold = demands[threshold_idx] if threshold_idx < len(demands) else demands[-1]
        
        # 识别高峰日
        peak_days = {
            date for date, demand in daily_demand.items()
            if demand >= threshold
        }
        
        info(f"[智能优先级] 识别 {len(peak_days)} 个高峰日 (阈值: {threshold} 人)")
        
        return peak_days
