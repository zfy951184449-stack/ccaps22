"""操作优先级约束模块

确保高优先级操作（PROCESS、MONITOR等）优先获得人员分配，减少缺员情况。
"""
from typing import Dict, List, Tuple, Set
from ortools.sat.python import cp_model


def identify_priority_operations(
    operations: List[Dict],
    priority_types: Set[str],
    priority_operation_ids: Set[int],
) -> Set[int]:
    """识别需要优先满足的操作
    
    Args:
        operations: 操作列表
        priority_types: 优先级操作类型集合（如 {'PROCESS', 'MONITOR'}）
        priority_operation_ids: 显式指定的优先级操作ID集合
        
    Returns:
        优先级操作ID集合
    """
    priority_ops = set()
    
    for operation in operations:
        op_id = int(operation["operationPlanId"])
        op_type = str(operation.get("operationType") or operation.get("type") or "").upper()
        
        # 检查是否在显式ID列表中
        if op_id in priority_operation_ids:
            priority_ops.add(op_id)
            continue
            
        # 检查操作类型
        if op_type and op_type in priority_types:
            priority_ops.add(op_id)
            
    return priority_ops


def apply_operation_priority_constraints(
    model: cp_model.CpModel,
    operations: List[Dict],
    operation_lookup: Dict[int, Dict],
    slack_vars: Dict[int, Tuple],
    priority_types: Set[str],
    priority_operation_ids: Set[int],
    enforce_hard_constraint: bool = True,
    shortage_penalty_weight: int = 1000,
) -> List[cp_model.IntVar]:
    """应用操作优先级约束
    
    Args:
        model: CP-SAT模型
        operations: 操作列表
        operation_lookup: 操作查找字典
        slack_vars: 松弛变量字典 {op_id: (slack_var, required, candidates_count)}
        priority_types: 优先级操作类型集合
        priority_operation_ids: 优先级操作ID集合
        enforce_hard_constraint: 是否强制硬约束（禁止缺员）
        shortage_penalty_weight: 缺员惩罚权重（软约束模式）
        
    Returns:
        惩罚项列表（用于目标函数）
    """
    priority_ops = identify_priority_operations(
        operations, priority_types, priority_operation_ids
    )
    
    penalty_terms = []
    
    for op_id in priority_ops:
        if op_id not in slack_vars:
            continue
            
        slack_var, required, candidates_count = slack_vars[op_id]
        
        if enforce_hard_constraint:
            # 硬约束：不允许缺员
            model.Add(slack_var == 0)
        else:
            # 软约束：缺员会产生高额惩罚
            # 惩罚 = shortage_penalty_weight * slack_var
            penalty_var = model.NewIntVar(
                0, 
                shortage_penalty_weight * required,
                f"priority_penalty_op_{op_id}"
            )
            model.Add(penalty_var == shortage_penalty_weight * slack_var)
            penalty_terms.append(penalty_var)
    
    return penalty_terms
