"""
core/conflict_table.py

预计算冲突表 (Conflict Table)

在求解开始前，预先计算所有操作对之间的时间冲突关系。
求解过程中通过 O(1) 查表即可判断两个操作是否冲突。
"""

from typing import TYPE_CHECKING, Dict, Set, List, Tuple, Optional
from datetime import datetime
from collections import defaultdict

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from contracts.request import SolverRequest, OperationData


class ConflictTable:
    """
    预计算冲突表
    
    空间换时间：预处理阶段遍历所有操作对，构建静态冲突邻接表。
    """
    
    def __init__(self):
        # 冲突邻接表: op_id -> Set[conflicting_op_ids]
        self.conflict_map: Dict[int, Set[int]] = defaultdict(set)
        
        # 共享组映射: op_id -> share_group_id
        self.share_group_map: Dict[int, int] = {}
        
        # 统计信息
        self.stats = {
            'total_operations': 0,
            'total_pairs_checked': 0,
            'conflicts_found': 0,
            'share_group_exemptions': 0,
        }
    
    def build(self, request: 'SolverRequest') -> 'ConflictTable':
        """
        构建冲突表
        
        遍历所有操作对，判断是否存在"真实冲突"。
        真实冲突定义: 时间重叠 AND 不属于同一个共享组
        
        Returns:
            self (支持链式调用)
        """
        operations = request.operations
        self.stats['total_operations'] = len(operations)
        
        # 1. 构建共享组映射
        for op in operations:
            share_group_id = getattr(op, 'share_group_id', None)
            if share_group_id:
                self.share_group_map[op.id] = share_group_id
        
        # 2. 遍历所有操作对
        n = len(operations)
        for i in range(n):
            for j in range(i + 1, n):
                self.stats['total_pairs_checked'] += 1
                
                op_a = operations[i]
                op_b = operations[j]
                
                # 检查是否时间重叠
                if self._is_time_overlapping(op_a, op_b):
                    # 检查是否同属共享组 (共享组内不视为冲突)
                    if self._is_same_share_group(op_a.id, op_b.id):
                        self.stats['share_group_exemptions'] += 1
                    else:
                        # 记录真实冲突
                        self.conflict_map[op_a.id].add(op_b.id)
                        self.conflict_map[op_b.id].add(op_a.id)
                        self.stats['conflicts_found'] += 1
        
        info(f"[冲突表] 构建完成: {n} 操作, "
             f"检查 {self.stats['total_pairs_checked']} 对, "
             f"发现 {self.stats['conflicts_found']} 个冲突, "
             f"共享组豁免 {self.stats['share_group_exemptions']} 个")
        
        return self
    
    def get_conflicts(self, op_id: int) -> Set[int]:
        """
        获取与指定操作冲突的所有操作ID
        
        时间复杂度: O(1)
        
        Args:
            op_id: 操作ID
            
        Returns:
            冲突操作ID集合
        """
        return self.conflict_map.get(op_id, set())
    
    def is_conflicting(self, op_a_id: int, op_b_id: int) -> bool:
        """
        判断两个操作是否冲突
        
        时间复杂度: O(1)
        """
        return op_b_id in self.conflict_map.get(op_a_id, set())
    
    def get_non_conflicting_operations(self, op_id: int, all_ops: List[int]) -> List[int]:
        """
        获取与指定操作不冲突的操作列表
        
        Args:
            op_id: 操作ID
            all_ops: 所有操作ID列表
            
        Returns:
            不冲突的操作ID列表
        """
        conflicts = self.get_conflicts(op_id)
        return [oid for oid in all_ops if oid != op_id and oid not in conflicts]
    
    def _is_time_overlapping(self, op_a: 'OperationData', op_b: 'OperationData') -> bool:
        """判断两个操作是否时间重叠"""
        try:
            start_a = self._parse_datetime(op_a.planned_start)
            end_a = self._parse_datetime(op_a.planned_end)
            start_b = self._parse_datetime(op_b.planned_start)
            end_b = self._parse_datetime(op_b.planned_end)
            
            if not all([start_a, end_a, start_b, end_b]):
                return False
            
            # 时间重叠: StartA < EndB AND StartB < EndA
            return start_a < end_b and start_b < end_a
        except Exception:
            return False
    
    def _is_same_share_group(self, op_a_id: int, op_b_id: int) -> bool:
        """判断两个操作是否属于同一共享组"""
        group_a = self.share_group_map.get(op_a_id)
        group_b = self.share_group_map.get(op_b_id)
        return group_a is not None and group_a == group_b
    
    def _parse_datetime(self, value) -> Optional[datetime]:
        """解析日期时间"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                pass
        return None
    
    def get_stats(self) -> Dict:
        """获取统计信息"""
        return {
            **self.stats,
            'average_conflicts_per_op': (
                self.stats['conflicts_found'] * 2 / max(1, self.stats['total_operations'])
            ),
        }
