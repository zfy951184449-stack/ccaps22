"""
core/preprocessor.py

数据预处理模块
- 员工候选人过滤（基于资质、可用性）
- 操作分组和排序
- 共享组预处理
"""

from typing import TYPE_CHECKING, List, Dict, Set, Tuple, Optional
from datetime import datetime, date

from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from contracts.request import SolverRequest, OperationData, EmployeeData


class Preprocessor:
    """数据预处理器"""
    
    def __init__(self):
        self.stats = {
            'total_operations': 0,
            'total_employees': 0,
            'total_candidates': 0,
            'filtered_by_qualification': 0,
            'filtered_by_availability': 0,
        }
    
    def preprocess(self, request: 'SolverRequest') -> Dict:
        """
        预处理求解请求数据
        
        Returns:
            预处理结果字典，包含:
            - operation_candidates: Dict[op_id, Set[emp_id]] 每个操作的候选员工
            - share_groups: Dict[group_id, List[op_id]] 共享组映射
            - operation_order: List[op_id] 推荐求解顺序
            - stats: 统计信息
        """
        self.stats['total_operations'] = len(request.operations)
        self.stats['total_employees'] = len(request.employees)
        
        # 1. 构建资质映射
        qualification_map = self._build_qualification_map(request.employees)
        
        # 2. 构建可用性映射
        availability_map = self._build_availability_map(request)
        
        # 3. 为每个操作计算候选员工
        operation_candidates = {}
        for op in request.operations:
            candidates = self._compute_candidates(
                op, 
                request.employees,
                qualification_map,
                availability_map,
            )
            operation_candidates[op.id] = candidates
            self.stats['total_candidates'] += len(candidates)
        
        # 4. 提取共享组
        share_groups = self._extract_share_groups(request.operations)
        
        # 5. 计算推荐求解顺序（优先处理约束多的操作）
        operation_order = self._compute_operation_order(
            request.operations,
            operation_candidates,
            share_groups,
        )
        
        info(f"[预处理] 完成: {self.stats['total_operations']} 操作, "
             f"{self.stats['total_employees']} 员工, "
             f"平均候选人 {self.stats['total_candidates'] / max(1, self.stats['total_operations']):.1f}")
        
        return {
            'operation_candidates': operation_candidates,
            'share_groups': share_groups,
            'operation_order': operation_order,
            'stats': self.stats,
        }
    
    def _build_qualification_map(
        self, 
        employees: List['EmployeeData']
    ) -> Dict[int, Set[int]]:
        """构建员工→资质集合映射"""
        result = {}
        for emp in employees:
            quals = getattr(emp, 'qualifications', [])
            result[emp.id] = set(quals) if quals else set()
        return result
    
    def _build_availability_map(self, request: 'SolverRequest') -> Dict[int, List[Tuple[date, date]]]:
        """构建员工→不可用时间段映射"""
        result = {}
        for emp in request.employees:
            unavailable = getattr(emp, 'unavailable_periods', [])
            periods = []
            for period in unavailable:
                try:
                    start = datetime.strptime(period['start_date'], '%Y-%m-%d').date()
                    end = datetime.strptime(period['end_date'], '%Y-%m-%d').date()
                    periods.append((start, end))
                except:
                    pass
            result[emp.id] = periods
        return result
    
    def _compute_candidates(
        self,
        op: 'OperationData',
        employees: List['EmployeeData'],
        qualification_map: Dict[int, Set[int]],
        availability_map: Dict[int, List[Tuple[date, date]]],
    ) -> Set[int]:
        """计算操作的候选员工集合"""
        candidates = set()
        op_date = self._get_operation_date(op)
        required_quals = set(getattr(op, 'required_qualifications', []))
        
        for emp in employees:
            # 检查资质
            if required_quals:
                emp_quals = qualification_map.get(emp.id, set())
                if not required_quals.issubset(emp_quals):
                    self.stats['filtered_by_qualification'] += 1
                    continue
            
            # 检查可用性
            if op_date:
                unavailable_periods = availability_map.get(emp.id, [])
                is_unavailable = any(
                    start <= op_date <= end 
                    for start, end in unavailable_periods
                )
                if is_unavailable:
                    self.stats['filtered_by_availability'] += 1
                    continue
            
            candidates.add(emp.id)
        
        return candidates
    
    def _extract_share_groups(
        self, 
        operations: List['OperationData']
    ) -> Dict[int, List[int]]:
        """提取共享组映射"""
        share_groups = {}
        for op in operations:
            group_id = getattr(op, 'share_group_id', None)
            if group_id:
                if group_id not in share_groups:
                    share_groups[group_id] = []
                share_groups[group_id].append(op.id)
        return share_groups
    
    def _compute_operation_order(
        self,
        operations: List['OperationData'],
        candidates: Dict[int, Set[int]],
        share_groups: Dict[int, List[int]],
    ) -> List[int]:
        """
        计算推荐求解顺序
        
        策略：
        1. 优先处理候选人少的操作（约束更紧）
        2. 共享组内操作连续处理
        """
        # 计算每个操作的优先级分数
        scores = {}
        for op in operations:
            candidate_count = len(candidates.get(op.id, set()))
            # 候选人越少，分数越高（优先处理）
            scores[op.id] = -candidate_count
        
        # 按分数排序
        sorted_ops = sorted(operations, key=lambda o: scores[o.id], reverse=True)
        return [op.id for op in sorted_ops]
    
    def _get_operation_date(self, op: 'OperationData') -> Optional[date]:
        """获取操作日期"""
        try:
            planned_start = getattr(op, 'planned_start', None)
            if isinstance(planned_start, datetime):
                return planned_start.date()
            elif isinstance(planned_start, str):
                return datetime.fromisoformat(planned_start.replace('Z', '+00:00')).date()
        except:
            pass
        return None
