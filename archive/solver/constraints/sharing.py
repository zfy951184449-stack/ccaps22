"""
共享组约束

处理可以共享人员的操作组。
"""

from __future__ import annotations
import logging
from ortools.sat.python import cp_model

from .base import BaseConstraint

logger = logging.getLogger(__name__)


class SharingConstraint(BaseConstraint):
    """共享组约束
    
    硬约束：
    1. 非共享操作之间不能时间冲突（同一员工同一时间只能执行一个操作）
    2. 共享组内：小操作的人员必须是大操作人员的子集
       例如：操作A需要4人，操作B需要2人，设置了共享，那么B操作的2人必须涵盖在A操作的4人中
    """
    
    name = "Sharing"
    
    def apply(self) -> None:
        """应用共享组约束"""
        # 处理时间冲突（非共享操作）
        self._apply_conflict_constraints()
        
        # 处理共享组（硬约束）
        self._apply_sharing_constraints()
        
        self.log_summary()
    
    def _apply_conflict_constraints(self) -> None:
        """应用时间冲突约束
        
        硬约束：非共享操作之间同一员工不能同时执行
        """
        from datetime import datetime
        
        # 找出时间冲突的操作对
        op_list = list(self.context.operations.items())
        
        for i, (op_id_a, op_a) in enumerate(op_list):
            if op_id_a in self.context.skipped_operations:
                continue
            
            for op_id_b, op_b in op_list[i + 1:]:
                if op_id_b in self.context.skipped_operations:
                    continue
                
                # 检查是否在同一共享组
                group_a = self.context.operation_share_group.get(op_id_a)
                group_b = self.context.operation_share_group.get(op_id_b)
                
                if group_a and group_a == group_b:
                    # 同一共享组，允许同一人执行
                    continue
                
                # 检查时间是否冲突
                if not self._check_overlap(op_a, op_b):
                    continue
                
                # 时间冲突，同一员工不能同时执行（硬约束）
                candidates_a = self.variables.operation_candidates.get(op_id_a, [])
                
                for emp_id, var_a in candidates_a:
                    var_b = self.variables.assignment_vars.get((op_id_b, emp_id))
                    if var_b is not None:
                        self.model.Add(var_a + var_b <= 1)
                        self.constraints_added += 1
    
    def _check_overlap(self, op_a, op_b) -> bool:
        """检查两个操作时间是否重叠"""
        from datetime import datetime
        
        try:
            start_a = datetime.fromisoformat(op_a.planned_start.replace("Z", "+00:00"))
            end_a = datetime.fromisoformat(op_a.planned_end.replace("Z", "+00:00"))
            start_b = datetime.fromisoformat(op_b.planned_start.replace("Z", "+00:00"))
            end_b = datetime.fromisoformat(op_b.planned_end.replace("Z", "+00:00"))
        except:
            return False
        
        # 检查是否重叠
        return not (end_a <= start_b or end_b <= start_a)
    
    def _apply_sharing_constraints(self) -> None:
        """应用共享组约束（硬约束）
        
        共享组内：小操作的人员必须是大操作（锚点）人员的子集
        """
        for group_id, member_ops in self.context.share_groups.items():
            if len(member_ops) < 2:
                continue
            
            anchor_id = self.context.share_anchor.get(group_id)
            if not anchor_id or anchor_id in self.context.skipped_operations:
                continue
            
            # 硬约束：成员操作的人员必须是锚点操作人员的子集
            for op_id in member_ops:
                if op_id == anchor_id:
                    continue
                if op_id in self.context.skipped_operations:
                    continue
                
                self._apply_subset_constraint(op_id, anchor_id)
    
    def _apply_subset_constraint(self, member_op_id: int, anchor_op_id: int) -> None:
        """应用子集约束（硬约束）
        
        确保成员操作的每个分配员工都必须同时被分配到锚点操作
        """
        member_candidates = self.variables.operation_candidates.get(member_op_id, [])
        
        for emp_id, member_var in member_candidates:
            anchor_var = self.variables.assignment_vars.get((anchor_op_id, emp_id))
            
            if anchor_var is None:
                # 该员工不是锚点操作的候选人，不能分配给成员操作
                self.model.Add(member_var == 0)
                self.constraints_added += 1
                logger.debug(
                    f"[{self.name}] 员工 {emp_id} 不是锚点操作 {anchor_op_id} 的候选人，"
                    f"禁止分配给成员操作 {member_op_id}"
                )
            else:
                # 硬约束：成员变量 <= 锚点变量
                # 即：如果员工被分配到成员操作，则必须也被分配到锚点操作
                self.model.Add(member_var <= anchor_var)
                self.constraints_added += 1
