#!/usr/bin/env python3
"""
检查求解器结果中是否有操作分配了超过需求人数的情况
"""

import json
import sys
from collections import defaultdict
from typing import Dict, List

def analyze_solver_result(result_file: str = None):
    """分析求解器结果，检查操作分配"""
    
    # 如果没有提供文件，尝试从后端数据库查询最近一次求解
    if result_file:
        with open(result_file, 'r', encoding='utf-8') as f:
            result = json.load(f)
    else:
        # 从stdin读取求解结果
        print("请提供求解结果JSON (Ctrl+D结束):")
        result = json.load(sys.stdin)
    
    # 获取操作需求数据
    operation_demands = result.get('operationDemands', [])
    
    # 建立操作ID -> 需求人数的映射
    operation_required_workers = {}
    for op in operation_demands:
        op_id = op.get('operationPlanId')
        required = op.get('requiredPeople', 1)  # 默认需要1人
        if op_id is not None:
            operation_required_workers[op_id] = required
    
    # 获取班次计划（包含操作分配）
    shift_plans = result.get('shiftPlans', [])
    
    # 统计每个操作实际分配的人数
    operation_assignments = defaultdict(list)  # op_id -> [(emp_id, date)]
    
    for plan in shift_plans:
        emp_id = plan.get('employeeId')
        date = plan.get('date')
        operations = plan.get('operations', [])
        
        for op in operations:
            op_id = op.get('operationPlanId')
            if op_id is not None:
                operation_assignments[op_id].append((emp_id, date))
    
    # 检查是否有超额分配
    over_allocated = []
    
    for op_id, assignments in operation_assignments.items():
        required = operation_required_workers.get(op_id, 1)
        assigned = len(assignments)
        
        if assigned > required:
            over_allocated.append({
                'operationPlanId': op_id,
                'requiredPeople': required,
                'assignedPeople': assigned,
                'assignments': assignments
            })
    
    # 输出结果
    print("\n" + "="*80)
    print("操作分配分析报告")
    print("="*80)
    
    print(f"\n总操作数: {len(operation_demands)}")
    print(f"已分配操作数: {len(operation_assignments)}")
    print(f"超额分配操作数: {len(over_allocated)}")
    
    if over_allocated:
        print("\n❌ 发现超额分配的操作:")
        print("-" * 80)
        for item in over_allocated:
            print(f"\n操作ID: {item['operationPlanId']}")
            print(f"  需要人数: {item['requiredPeople']}")
            print(f"  实际分配: {item['assignedPeople']} 人")
            print(f"  详细分配:")
            for emp_id, date in item['assignments']:
                print(f"    - 员工 {emp_id} 在 {date}")
    else:
        print("\n✅ 未发现超额分配的操作")
    
    # 同时检查共享组操作
    shared_groups = result.get('sharedPreferences', [])
    if shared_groups:
        print("\n" + "="*80)
        print("共享组分析 (同一共享组内的操作可以由不同员工执行)")
        print("="*80)
        
        for group in shared_groups:
            group_id = group.get('shareGroupId')
            members = group.get('members', [])
            
            print(f"\n共享组 {group_id}:")
            
            # 统计共享组的总需求和实际分配
            total_required = 0
            total_assigned = 0
            
            for member in members:
                op_id = member.get('operationPlanId')
                required = member.get('requiredPeople', 1)
                assigned = len(operation_assignments.get(op_id, []))
                
                total_required += required
                total_assigned += assigned
                
                print(f"  操作 {op_id}: 需要 {required} 人, 分配 {assigned} 人")
            
            print(f"  共享组总计: 需要 {total_required} 人, 分配 {total_assigned} 人")
            
            if total_assigned > total_required:
                print(f"  ⚠️  共享组超额分配 {total_assigned - total_required} 人")
    
    print("\n" + "="*80)
    
    return len(over_allocated) > 0

if __name__ == "__main__":
    if len(sys.argv) > 1:
        result_file = sys.argv[1]
        has_issues = analyze_solver_result(result_file)
    else:
        has_issues = analyze_solver_result()
    
    sys.exit(1 if has_issues else 0)
