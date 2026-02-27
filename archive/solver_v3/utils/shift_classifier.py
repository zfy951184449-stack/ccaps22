"""
班次分类器

用于根据操作的时间范围，将其归类到对应的班次类型 (ShiftType)。
解决硬编码判断 (如 hour >= 20) 的问题，使用定义的班次数据进行匹配。
"""

from typing import List, Optional, Dict, Tuple
from datetime import datetime, time, timedelta

from contracts.request import ShiftTypeData as ShiftType, OperationData
from utils.logger import debug, warning


class ShiftClassifier:
    """
    班次分类器
    
    职责:
    1. 接收班次定义列表
    2. 提供 classify(operation) -> shift_id 方法
    3. 处理跨天班次 (如夜班 20:00-08:00)
    """
    
    def __init__(self, shift_types: List[ShiftType]):
        # 按工时降序排序，优先匹配长班次
        self.shift_types = sorted(shift_types or [], key=lambda s: s.work_hours, reverse=True)
        
        # 预处理班次时间窗口
        self.processed_shifts = []
        for st in self.shift_types:
            start_time = self._parse_time(st.start_time)
            end_time = self._parse_time(st.end_time)
            if start_time and end_time:
                self.processed_shifts.append({
                    "id": st.id,
                    "type": st,
                    "start": start_time,
                    "end": end_time,
                    "is_cross_day": end_time < start_time or st.is_night_shift
                })
    
    def classify(self, operation: OperationData) -> Optional[int]:
        """
        将操作归类到最匹配的班次
        
        策略:
        1. 计算操作的中点时间 (mid_time)
        2. 检查中点时间落在哪个班次的时间窗口内
        3. 如果多个匹配，返回可以在该窗口内完整容纳操作的班次
        
        Returns:
            shift_id or None
        """
        # 解析操作时间
        start_dt = self._filesafe_parse_datetime(operation.planned_start)
        end_dt = self._filesafe_parse_datetime(operation.planned_end)
        
        if not start_dt or not end_dt:
            return None
            
        # 计算操作的"核心时间" (中点)，用于判断所属的逻辑"天"或班次
        # 对于夜班 (如 22:00-06:00)，操作可能在凌晨 (02:00)，
        # 我们只关心 Time 部分，但要处理跨天逻辑
        op_start_time = start_dt.time()
        op_end_time = end_dt.time()
        op_mid_timestamp = start_dt.timestamp() + (end_dt.timestamp() - start_dt.timestamp()) / 2
        op_mid_time = datetime.fromtimestamp(op_mid_timestamp).time()
        
        for shift in self.processed_shifts:
            if self._is_time_in_shift(op_mid_time, shift):
                return shift["id"]
        
        # 如果没有匹配，尝试使用更宽松的规则 (如操作开始时间在班次内)
        for shift in self.processed_shifts:
            if self._is_time_in_shift(op_start_time, shift):
                return shift["id"]
                
        return None

    def get_shift_type(self, shift_id: int) -> Optional[ShiftType]:
        """获取班次定义对象"""
        for s in self.shift_types:
            if s.id == shift_id:
                return s
        return None

    def is_night_shift(self, shift_id: int) -> bool:
        """判断是否为夜班"""
        st = self.get_shift_type(shift_id)
        return st.is_night_shift if st else False

    def _is_time_in_shift(self, t: time, shift: Dict) -> bool:
        """检查时间点是否在班次窗口内"""
        start = shift["start"]
        end = shift["end"]
        
        if shift["is_cross_day"]:
            # 跨天班次 (例: 20:00 - 08:00)
            # 时间 >= 20:00 OR 时间 <= 08:00
            return t >= start or t <= end
        else:
            # 当天班次 (例: 08:00 - 20:00)
            return start <= t <= end

    def _parse_time(self, time_str: str) -> Optional[time]:
        """解析时间字符串 HH:MM:SS"""
        if not time_str:
            return None
        try:
            # 尝试 HH:MM:SS
            if len(time_str) == 8:
                return datetime.strptime(time_str, "%H:%M:%S").time()
            # 尝试 HH:MM
            elif len(time_str) == 5:
                return datetime.strptime(time_str, "%H:%M").time()
            return None
        except:
            return None

    def _filesafe_parse_datetime(self, value) -> Optional[datetime]:
        """(从 context 借用的) 稳健解析日期时间"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            s = value.rstrip('Z').replace('+00:00', '')
            if '.' in s:
                parts = s.split('.')
                s = parts[0] + '.' + parts[1][:6]
            try:
                return datetime.fromisoformat(s)
            except:
                pass
        return None
