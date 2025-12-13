"""求解结果生成器模块

处理 CP-SAT 求解器结果的提取和格式化。
"""
from __future__ import annotations
from typing import Dict, List, Tuple, Any
from ortools.sat.python import cp_model
from datetime import datetime


def extract_assignments(
    solver: cp_model.CpSolver,
    operation_vars: Dict[Tuple[int, int], cp_model.BoolVar],
    operation_lookup: Dict[int, Dict],
) -> Tuple[List[Dict], Dict[Tuple[int, str], List[Dict]]]:
    """提取操作分配结果
    
    Args:
        solver: 求解器实例
        operation_vars: 操作分配变量 (op_id, emp_id) -> BoolVar
        operation_lookup: 操作详情查找表
        
    Returns:
        (assignments, employee_day_operations)
        - assignments: 分配结果列表
        - employee_day_operations: 员工每日操作记录
    """
    assignments = []
    employee_day_operations: Dict[Tuple[int, str], List[Dict]] = {}
    
    for (op_id, emp_id), var in operation_vars.items():
        if solver.Value(var) == 1:
            assignments.append({
                "operationPlanId": op_id,
                "employeeId": emp_id
            })
            
            # 记录到员工日操作中
            op = operation_lookup.get(op_id)
            if op:
                start = op.get("plannedStart")
                end = op.get("plannedEnd")
                day = start[:10] if start else None
                
                if day:
                    from utils.time_utils import calculate_duration_minutes
                    employee_day_operations.setdefault((emp_id, day), []).append({
                        "operationPlanId": op_id,
                        "plannedStart": start,
                        "plannedEnd": end,
                        "durationMinutes": calculate_duration_minutes(start, end)
                    })
    
    return assignments, employee_day_operations


def deduplicate_assignments(assignments: List[Dict]) -> Tuple[List[Dict], List[Tuple[int, int]]]:
    """去重分配结果
    
    Args:
        assignments: 原始分配列表
        
    Returns:
        ( deduped_assignments, duplicates)
        - deduped_assignments: 去重后的分配列表
        - duplicates: 重复的 (op_id, emp_id) 对
    """
    seen_pairs = set()
    dup_pairs = []
    deduped_assignments = []
    
    for a in assignments:
        key = (a["operationPlanId"], a["employeeId"])
        if key in seen_pairs:
            dup_pairs.append(key)
        else:
            seen_pairs.add(key)
            deduped_assignments.append(a)
    
    return deduped_assignments, dup_pairs


def extract_night_flags(
    solver: cp_model.CpSolver,
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar],
) -> Dict[Tuple[int, str], int]:
    """提取夜班标记值
    
    Args:
        solver: 求解器实例
        day_night_flag: 夜班标记变量
        
    Returns:
        夜班标记值字典 (emp_id, date) -> 1
    """
    night_flag_values = {}
    for k, v in day_night_flag.items():
        if solver.Value(v) == 1:
            night_flag_values[k] = 1
    return night_flag_values


def prepare_shift_vars_for_planning(
    shift_vars: Dict[Tuple[int, str, str], cp_model.BoolVar],
) -> Tuple[Dict, Dict]:
    """为班次规划准备变量
    
    Args:
        shift_vars: 班次变量 (emp_id, date, type) -> BoolVar
        
    Returns:
        (shift_vars_base_simple, shift_vars_rest_simple)
    """
    shift_vars_base_simple = {}
    shift_vars_rest_simple = {}
    
    for (e_id, d_key, s_type), var in shift_vars.items():
        if s_type == "BASE":
            shift_vars_base_simple[(e_id, d_key)] = var
        elif s_type == "REST":
            shift_vars_rest_simple[(e_id, d_key)] = var
    
    return shift_vars_base_simple, shift_vars_rest_simple


def build_summary_parts(
    assignments: List[Dict],
    shift_plans: List[Dict],
    dup_pairs: List,
    skipped_ops_no_candidates: List[int],
    infeasible_ops: List[int],
) -> List[str]:
    """构建结果摘要部分
    
    Args:
        assignments: 分配结果
        shift_plans: 班次计划
        dup_pairs: 重复对
        skipped_ops_no_candidates: 跳过的无候选操作
        infeasible_ops: 不可行操作
        
    Returns:
        摘要字符串列表
    """
    summary_parts = [
        f"Assigned {len(assignments)} pairs, generated {len(shift_plans)} shift plans"
    ]
    
    if dup_pairs:
        summary_parts.append(f"Removed {len(dup_pairs)} duplicate assignment pairs")
    if skipped_ops_no_candidates:
        summary_parts.append(f"Skipped {len(skipped_ops_no_candidates)} ops without candidates")
    if infeasible_ops:
        summary_parts.append(f"Skipped {len(infeasible_ops)} ops due to invalid locks/availability")
    
    return summary_parts


def generate_solver_response(
    status_name: str,
    summary: str,
    assignments: List[Dict],
    shift_plans: List[Dict],
    skipped_ops_no_candidates: List[int],
    infeasible_ops: List[int],
) -> Dict[str, Any]:
    """生成求解器响应
    
    Args:
        status_name: 状态名称
        summary: 摘要信息
        assignments: 分配结果
        shift_plans: 班次计划
        skipped_ops_no_candidates: 跳过的无候选操作
        infeasible_ops: 不可行操作
        
    Returns:
        求解器响应字典
    """
    final_status = "COMPLETED" if status_name == "OPTIMAL" else "RUNNING"
    
    return {
        "status": final_status,
        "summary": summary,
        "details": {
            "assignments": assignments,
            "shiftPlans": shift_plans,
            "skippedOperations": skipped_ops_no_candidates + infeasible_ops,
            "skippedNoCandidates": skipped_ops_no_candidates,
            "skippedInvalidLocks": infeasible_ops,
        },
    }
