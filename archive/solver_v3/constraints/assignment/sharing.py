"""
H10: 共享组一致性约束

组内操作人员必须保持最大程度的一致性（严格固定班底）。
"""

from typing import TYPE_CHECKING, List, Dict, Set, Tuple

from constraints.base import HardConstraint
from utils.logger import debug, info, warning

if TYPE_CHECKING:
    from ortools.sat.python import cp_model
    from core.context import SolverContext


class SharingConstraint(HardConstraint):
    """
    H10: 共享组一致性硬约束
    
    确保共享组内的操作使用一致的人员。
    
    实现逻辑:
    - 组内操作的分配人员必须是"班底"的子集
    - 相同人数需求的操作必须使用完全相同的人员
    - 人数少的操作使用人数多的操作人员的子集
    """
    
    constraint_id = "H10"
    constraint_name = "共享组一致性"
    
    def apply(self, model: 'cp_model.CpModel', context: 'SolverContext') -> None:
        """
        应用共享组一致性约束
        
        对于每个共享组:
        1. 找出组内需要最多人的操作作为"主操作"
        2. 其他操作的人员必须是主操作人员的子集
        """
        if not self.enabled:
            return
        
        constraints_added = 0
        
        for sg in context.request.share_groups:
            if not sg.operation_ids or len(sg.operation_ids) < 2:
                continue
            
            # 获取组内所有操作
            ops_in_group = [
                context.operation_by_id.get(op_id)
                for op_id in sg.operation_ids
                if op_id in context.operation_by_id
            ]
            
            if len(ops_in_group) < 2:
                continue
            
            # 找出需要最多人的操作作为"主操作"
            ops_in_group.sort(key=lambda x: x.required_people, reverse=True)
            main_op = ops_in_group[0]
            sub_ops = ops_in_group[1:]
            
            # 对每个员工
            for emp_id in context.employee_by_id.keys():
                # 检查该员工是否被分配到主操作
                main_assigned_vars = []
                for pos in range(main_op.required_people):
                    var_key = (main_op.id, pos, emp_id)
                    if var_key in context.assignment_vars:
                        main_assigned_vars.append(context.assignment_vars[var_key])
                
                if not main_assigned_vars:
                    continue
                
                # 创建"该员工是否在主操作中"的变量
                emp_in_main = model.NewBoolVar(f"in_main_{sg.id}_{emp_id}")
                model.AddMaxEquality(emp_in_main, main_assigned_vars)
                
                # 对于每个子操作
                for sub_op in sub_ops:
                    sub_assigned_vars = []
                    for pos in range(sub_op.required_people):
                        var_key = (sub_op.id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            sub_assigned_vars.append(context.assignment_vars[var_key])
                    
                    if not sub_assigned_vars:
                        continue
                    
                    # 创建"该员工是否在子操作中"的变量
                    emp_in_sub = model.NewBoolVar(f"in_sub_{sg.id}_{sub_op.id}_{emp_id}")
                    model.AddMaxEquality(emp_in_sub, sub_assigned_vars)
                    
                    # 约束: 如果员工在子操作中，则必须也在主操作中
                    # emp_in_sub => emp_in_main
                    # 等价于: NOT emp_in_sub OR emp_in_main
                    model.AddImplication(emp_in_sub, emp_in_main)
                    constraints_added += 1
            
            # 对于人数相同的子操作，确保使用完全相同的人员
            same_size_groups: Dict[int, List] = {}
            for op in ops_in_group:
                size = op.required_people
                if size not in same_size_groups:
                    same_size_groups[size] = []
                same_size_groups[size].append(op)
            
            for size, group_ops in same_size_groups.items():
                if len(group_ops) < 2:
                    continue
                
                # 取第一个作为参考
                ref_op = group_ops[0]
                other_ops = group_ops[1:]
                
                for emp_id in context.employee_by_id.keys():
                    # 参考操作中该员工的分配
                    ref_vars = []
                    for pos in range(ref_op.required_people):
                        var_key = (ref_op.id, pos, emp_id)
                        if var_key in context.assignment_vars:
                            ref_vars.append(context.assignment_vars[var_key])
                    
                    if not ref_vars:
                        continue
                    
                    ref_assigned = model.NewBoolVar(f"ref_assigned_{sg.id}_{ref_op.id}_{emp_id}")
                    model.AddMaxEquality(ref_assigned, ref_vars)
                    
                    for other_op in other_ops:
                        other_vars = []
                        for pos in range(other_op.required_people):
                            var_key = (other_op.id, pos, emp_id)
                            if var_key in context.assignment_vars:
                                other_vars.append(context.assignment_vars[var_key])
                        
                        if not other_vars:
                            continue
                        
                        other_assigned = model.NewBoolVar(f"other_assigned_{sg.id}_{other_op.id}_{emp_id}")
                        model.AddMaxEquality(other_assigned, other_vars)
                        
                        # 双向蕴含: ref_assigned <=> other_assigned
                        model.AddImplication(ref_assigned, other_assigned)
                        model.AddImplication(other_assigned, ref_assigned)
                        constraints_added += 2
        
        self.stats.constraints_added = constraints_added
        info(f"[{self.constraint_id}] {self.constraint_name}: 添加 {constraints_added} 个共享组约束")
    
    def validate(self, context: 'SolverContext') -> List[str]:
        """验证共享组数据"""
        errors = []
        
        for sg in context.request.share_groups:
            if len(sg.operation_ids) < 2:
                debug(f"共享组 {sg.id} 只有 {len(sg.operation_ids)} 个操作")
            
            # 检查组内操作是否存在
            missing = [
                op_id for op_id in sg.operation_ids
                if op_id not in context.operation_by_id
            ]
            if missing:
                errors.append(f"共享组 {sg.id} 包含不存在的操作: {missing}")
        
        return errors
