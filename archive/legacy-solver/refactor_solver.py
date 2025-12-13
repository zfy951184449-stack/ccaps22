#!/usr/bin/env python3
"""
自动重构脚本

将server.py中的函数调用更新为模块化的导入
"""

# 读取原始server.py.backup
with open('/Users/zhengfengyi/ccaps22/solver/server.py.backup', 'r') as f:
    content = f.read()

# 定义函数名替换映射
replacements = {
    '_log_lines': 'log_lines',
    '_build_calendar_structs': 'build_calendar_structs',
    '_build_share_groups': 'build_share_groups',
    '_build_locked_operation_map': 'build_locked_operation_map',
    '_build_employee_lookups': 'build_employee_lookups',
    '_identify_leaders': 'identify_leaders',
    '_group_unavailability': 'group_unavailability',
    '_prepare_shift_definitions': 'prepare_shift_definitions',
    '_is_employee_unavailable': 'is_employee_unavailable',
    '_extract_operation_window': 'extract_operation_window',
    '_find_conflicting_operation_pairs':  'find_conflicting_operation_pairs',
    '_apply_pre_production_constraints': 'apply_pre_production_constraints',
    '_apply_night_rest_constraints': 'apply_night_rest_constraints',
    '_apply_month_quarter_constraints': 'apply_month_quarter_constraints',
    '_apply_leader_coverage_constraints': 'apply_leader_coverage_constraints',
    '_build_shift_plans': 'build_shift_plans',
    '_parse_iso_datetime': 'parse_iso_datetime',
    '_parse_iso_date': 'parse_iso_date',
    '_calculate_duration_minutes': 'calculate_duration_minutes',
    '_get_primary_work_date': 'get_primary_work_date',
    '_is_night_operation': 'is_night_operation',
    '_enforce_day_has_production_consistency': 'enforce_day_has_production_consistency',
}

# 应用替换
for old_name, new_name in replacements.items():
    content = content.replace(old_name, new_name)

# 提取 _build_assignments_unified 函数 (大约从449到1492行)
lines = content.split('\n')

# 找到函数开始
func_start = None
for i, line in enumerate(lines):
    if 'def _build_assignments_unified(' in line or 'def build_assignments_unified(' in line:
        func_start = i
        break

# 找到下一个顶级函数定义
func_end = None
if func_start is not None:
    indent_level = len(lines[func_start]) - len(lines[func_start].lstrip())
    for i in range(func_start + 1, len(lines)):
        line = lines[i]
        if not line.strip():  # 空行
            continue
        current_indent = len(line) - len(line.lstrip())
        if current_indent == 0 and (line.startswith('def ') or line.startswith('class ')):
            func_end = i
            break
    
    if func_end is None:
        func_end = len(lines)

# 提取函数内容
if func_start is not None and func_end is not None:
    func_lines = lines[func_start:func_end]
    # 修改函数名
    func_lines[0] = func_lines[0].replace('_build_assignments_unified', 'build_assignments_unified')
    
    # 创建完整的core/solver.py文件
    header = '''"""核心求解器模块

包含主要的统一建模求解逻辑
"""
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Dict, List, Tuple
import sys

from ortools.sat.python import cp_model

# 导入工具函数
from ..utils.logging import log_lines
from ..utils.time_utils import (
    parse_iso_datetime,
    parse_iso_date,
    calculate_duration_minutes,
    get_primary_work_date,
    is_night_operation,
)
from ..utils.builders import (
    build_calendar_structs,
    build_share_groups,
    build_locked_operation_map,
    build_employee_lookups,
    identify_leaders,
    group_unavailability,
    prepare_shift_definitions,
    is_employee_unavailable,
    extract_operation_window,
    find_conflicting_operation_pairs,
)

# 导入约束模块
from ..constraints.pre_production import apply_pre_production_constraints
from ..constraints.night_rest import apply_night_rest_constraints  
from ..constraints.monthly_hours import apply_month_quarter_constraints
from ..constraints.leader_coverage import apply_leader_coverage_constraints

# 导入班次规划模块
from ..shift_planning.builder import build_shift_plans


def enforce_day_has_production_consistency(
    model: cp_model.CpModel,
    employee_day_payloads: Dict[Tuple[int, str], List[Tuple[int, cp_model.BoolVar]]],
    day_has_production: Dict[Tuple[int, str], cp_model.BoolVar],
) -> None:
    """
    确保 day_has_production 只有在当天存在实际分配的操作时才为 1。
    """
    for (emp_id, date_key), payload_list in employee_day_payloads.items():
        if not payload_list:
            continue
        flag_var = day_has_production.get((emp_id, date_key))
        if flag_var is None:
            continue
        op_vars = [var for _, var in payload_list]
        model.Add(sum(op_vars) >= 1).OnlyEnforceIf(flag_var)
        model.Add(sum(op_vars) == 0).OnlyEnforceIf(flag_var.Not())


'''
    
    full_content = header + '\n'.join(func_lines)
    
    # 写入core/solver.py
    with open('/Users/zhengfengyi/ccaps22/solver/core/solver.py', 'w') as f:
        f.write(full_content)
    
    print(f"✓ Extracted function from line {func_start} to {func_end}")
    print(f"✓ Created core/solver.py with {len(func_lines)} lines")
else:
    print("✗ Could not find _build_assignments_unified function")

# 创建新的server.py（门面）
new_server = '''#!/usr/bin/env python3
"""求解器门面 - 向后兼容层

此模块仅用于向后兼容。实际逻辑已移至core/solver.py。
"""

from core.solver import build_assignments_unified

# 保持向后兼容的函数名
_build_assignments_unified = build_assignments_unified
'''

with open('/Users/zhengfengyi/ccaps22/solver/server.py', 'w') as f:
    f.write(new_server)

print("✓ Created new server.py facade")
print("✓ Refactoring complete!")
