"""
资质匹配约束

确保操作分配符合资质要求。
"""

from __future__ import annotations
import logging

from .base import BaseConstraint

logger = logging.getLogger(__name__)


class QualificationConstraint(BaseConstraint):
    """资质匹配约束
    
    硬约束：
    1. 分配给操作的员工必须具有所需资质
    2. 员工资质等级必须 >= 操作要求的最低等级
    
    注意：资质检查已在 SolverContext._compute_candidates() 中完成，
    本约束主要用于验证和记录。
    """
    
    name = "Qualification"
    
    def apply(self) -> None:
        """应用资质约束（验证）"""
        violations = 0
        
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            
            candidates = self.context.operation_candidates.get(op_id, [])
            
            for emp_id in candidates:
                # 验证资质（已在候选人计算时检查）
                if not self._verify_qualification(emp_id, op):
                    # 如果是锁定的分配，记录警告但不阻止
                    if op_id in self.context.locked_operations:
                        if emp_id in self.context.locked_operations[op_id]:
                            logger.warning(
                                f"[{self.name}] 锁定分配 op={op_id} emp={emp_id} 资质不匹配"
                            )
                            violations += 1
        
        if violations > 0:
            logger.warning(f"[{self.name}] 发现 {violations} 个资质不匹配的锁定分配")
        
        logger.info(f"[{self.name}] 资质验证完成，已在候选人计算阶段强制执行")
    
    def _verify_qualification(self, emp_id: int, op) -> bool:
        """验证员工是否满足操作的任一岗位资质需求"""
        emp_quals = self.context.employee_qualifications.get(emp_id, {})
        
        # 如果没有岗位资质要求，所有人都符合
        if not op.position_qualifications:
            return True
        
        # 只要满足任一岗位的要求即可
        for pos_qual in op.position_qualifications:
            satisfies_position = True
            for req in pos_qual.qualifications:
                emp_level = emp_quals.get(req.qualification_id, 0)
                if emp_level < req.min_level:
                    satisfies_position = False
                    break
            if satisfies_position:
                return True
        
        return False
