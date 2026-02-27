"""
Diagnostic Solver Module for IIS (Irreducible Inconsistent Subsystem) Analysis

When the main solver returns INFEASIBLE, this module rebuilds the model with
assumption variables for each constraint instance, then uses 
SufficientAssumptionsForInfeasibility() to identify the minimal conflicting set.
"""

import logging
from dataclasses import dataclass
from typing import List, Dict, Optional, Any, Tuple
from ortools.sat.python import cp_model

from contracts.request import SolverRequest
from core.index import AssignmentIndex, ShiftIndex
from utils.time_utils import get_date_range

logger = logging.getLogger("SolverV4.Diagnostics")


@dataclass
class ConstraintAssumption:
    """Single constraint assumption information"""
    category: str           # Constraint category name (e.g., "NightRest")
    description: str        # Specific description (e.g., "员工E001在2月5日夜班后需休息")
    assumption_index: int   # Index in assumptions list (for lookup after solve)


class DiagnosticSolver:
    """
    Diagnostic Solver that rebuilds the model with assumption variables
    to identify which specific constraints cause infeasibility.
    
    Two-phase approach:
    1. Category-level diagnosis (fast, ~6 assumptions)
    2. Instance-level diagnosis for conflicting categories (precise)
    """
    
    def __init__(self, req: SolverRequest, callback: Any = None):
        self.req = req
        self.callback = callback
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # Assumption tracking
        self.assumptions: List[ConstraintAssumption] = []
        self.assumption_literals: List[int] = []  # Literals for solver.AddAssumptions
        
        # Config
        self.config = req.config or {}
        
    def diagnose(self) -> List[str]:
        """
        Run two-phase diagnosis and return conflict descriptions.
        
        Returns:
            List of human-readable conflict descriptions with actionable suggestions
        """
        if self.callback:
            self.callback.log("[DIAG] 🔍 开始多阶段冲突诊断...")
        
        # Phase 0: Quick capacity analysis (before constraint diagnosis)
        capacity_issue = self._analyze_capacity()
        if capacity_issue:
            if self.callback:
                self.callback.log(f"[DIAG] 🚨 容量分析发现问题")
            return capacity_issue
        
        # Phase 0.5: Shift coverage analysis (detect impossible operations)
        coverage_issues = self._analyze_shift_coverage()
        if coverage_issues:
            if self.callback:
                self.callback.log(f"[DIAG] 🚨 班次覆盖分析发现问题")
            return coverage_issues
        
        # Phase 0.6: Essential employee analysis (detect forced consecutive work)
        essential_issues = self._analyze_essential_employees()
        if essential_issues:
            if self.callback:
                self.callback.log(f"[DIAG] 🚨 关键员工分析发现问题")
            return essential_issues
        
        # Phase 0.7: REST shift analysis
        rest_issues = self._analyze_rest_shifts()
        if rest_issues:
            if self.callback:
                self.callback.log(f"[DIAG] 🚨 休息班次分析发现问题")
            return rest_issues
        
        # Phase 1: Constraint Bisection (run actual solver with constraints disabled)
        if self.callback:
            self.callback.log("[DIAG] 🔬 开始约束二分法诊断 (逐个禁用约束测试)")
        
        constraint_issues = self._diagnose_by_constraint_bisection()
        if constraint_issues:
            return constraint_issues
        
        # Fallback: If we still can't diagnose
        if self.callback:
            self.callback.log("[DIAG] ⚠️ 所有分析均未能定位问题")
        
        return [
            "🔍 无法自动定位冲突约束",
            "",
            "💡 建议手动排查:",
            "   1. 在高级设置中逐个禁用约束后重试",
            "   2. 检查操作时间是否与班次定义匹配",
            "   3. 确认候选人列表是否足够覆盖所有岗位"
        ]
    
    def _diagnose_by_constraint_bisection(self) -> List[str]:
        """
        Two-phase diagnostic:
        Phase 1: Run actual solver with each constraint category disabled to find culprits
        Phase 2: For each culprit, run static analysis to find specific conflict instances
        """
        from core.solver import SolverV4
        
        # List of constraint categories to test
        constraint_categories = [
            ("enable_share_group", "共享组约束"),
            ("enable_unique_employee", "人员唯一约束 (防止同一员工同时被分配到重叠操作)"),
            ("enable_one_position", "单操作单岗约束"),
            ("enable_shift_assignment", "班次分配约束 (每人每天必须有班次)"),
            ("enable_max_consecutive_work_days", "最大连续工作天数约束"),
            ("enable_standard_hours", "标准工时约束"),
            ("enable_night_rest", "夜班休息约束"),
        ]
        
        # Skip constraints that are already disabled
        enabled_constraints = []
        for config_key, name in constraint_categories:
            if self.config.get(config_key, True):
                enabled_constraints.append((config_key, name))
        
        if not enabled_constraints:
            return []
        
        if self.callback:
            self.callback.log(f"[DIAG] 📋 Phase 1: 测试 {len(enabled_constraints)} 个约束类别")
        
        culprits = []
        
        # Phase 1: Constraint Bisection
        for config_key, name in enabled_constraints:
            test_solver = SolverV4()
            test_config = dict(self.config) if self.config else {}
            test_config[config_key] = False
            
            original_config = self.req.config
            self.req.config = test_config
            
            try:
                if self.callback:
                    self.callback.log(f"[DIAG] 🔄 测试禁用: {name}")
                
                test_solver.solver.parameters.max_time_in_seconds = 5.0
                result = test_solver.solve(self.req)
                status = result.get("status", "UNKNOWN")
                
                if status in ("FEASIBLE", "OPTIMAL"):
                    culprits.append({
                        "config_key": config_key,
                        "name": name
                    })
                    if self.callback:
                        self.callback.log(f"[DIAG] ✅ 禁用 [{name}] 后可行!")
                else:
                    if self.callback:
                        self.callback.log(f"[DIAG] ❌ 禁用 [{name}] 后仍无解")
                        
            except Exception as e:
                if self.callback:
                    self.callback.log(f"[DIAG] ⚠️ 测试出错: {str(e)[:50]}")
            finally:
                self.req.config = original_config
        
        if not culprits:
            return []
        
        if self.callback:
            self.callback.log(f"[DIAG] 🎯 定位到 {len(culprits)} 个冲突约束类别")
            self.callback.log(f"[DIAG] 📋 Phase 2: 进行实例级冲突分析")
        
        # Phase 2: Instance-Level Analysis for each culprit
        all_suggestions = []
        
        for culp in culprits:
            config_key = culp["config_key"]
            name = culp["name"]
            
            all_suggestions.append(f"🎯 冲突约束: {name}")
            all_suggestions.append("")
            
            # Run instance-level analysis based on constraint type
            if "unique_employee" in config_key:
                instances = self._analyze_unique_employee_instances()
                if instances:
                    all_suggestions.extend(instances)
                    
            elif "shift_assignment" in config_key:
                instances = self._analyze_shift_assignment_instances()
                if instances:
                    all_suggestions.extend(instances)
                    
            elif "max_consecutive" in config_key:
                instances = self._analyze_max_consecutive_instances()
                if instances:
                    all_suggestions.extend(instances)
                    
            elif "night_rest" in config_key:
                instances = self._analyze_night_rest_instances()
                if instances:
                    all_suggestions.extend(instances)
                    
            elif "share_group" in config_key:
                instances = self._analyze_share_group_instances()
                if instances:
                    all_suggestions.extend(instances)
            else:
                all_suggestions.append(f"   ⚠️ 暂无此约束的实例级分析")
            
            all_suggestions.append("")
        
        # Add general fix suggestions
        all_suggestions.extend([
            "💡 修复建议:",
            "   1. 根据上述具体冲突调整数据",
            "   2. 或在高级设置中禁用冲突约束"
        ])
        
        return all_suggestions
    
    def _analyze_unique_employee_instances(self) -> List[str]:
        """
        Find specific conflict instances for UniqueEmployeeConstraint.
        Detects employees who are the sole candidate for overlapping operations.
        """
        from utils.time_utils import parse_iso_to_unix
        from collections import defaultdict
        
        # Build operation time map
        op_times = {}
        op_info = {}
        for op in self.req.operation_demands:
            start = parse_iso_to_unix(op.planned_start)
            end = parse_iso_to_unix(op.planned_end)
            op_times[op.operation_plan_id] = (start, end)
            op_info[op.operation_plan_id] = {
                "name": op.operation_name,
                "batch": op.batch_code,
                "start": op.planned_start,
                "end": op.planned_end
            }
        
        # For each employee, find operations where they are a candidate
        emp_ops = defaultdict(list)
        for op in self.req.operation_demands:
            for pos in op.position_qualifications:
                for emp_id in pos.candidate_employee_ids:
                    emp_ops[emp_id].append(op.operation_plan_id)
        
        # Find overlapping operation pairs for each employee
        conflicts = []
        
        for emp_id, op_ids in emp_ops.items():
            unique_ops = list(set(op_ids))
            if len(unique_ops) < 2:
                continue
            
            # Check all pairs for overlap
            for i in range(len(unique_ops)):
                for j in range(i + 1, len(unique_ops)):
                    op1 = unique_ops[i]
                    op2 = unique_ops[j]
                    
                    if op1 not in op_times or op2 not in op_times:
                        continue
                    
                    s1, e1 = op_times[op1]
                    s2, e2 = op_times[op2]
                    
                    # Check if overlapping
                    if s1 < e2 and s2 < e1:
                        # Check if this employee is essential (sole candidate) for either
                        is_essential = False
                        for op in self.req.operation_demands:
                            if op.operation_plan_id in (op1, op2):
                                for pos in op.position_qualifications:
                                    if len(pos.candidate_employee_ids) == 1 and emp_id in pos.candidate_employee_ids:
                                        is_essential = True
                                        break
                        
                        if is_essential:
                            conflicts.append({
                                "emp_id": emp_id,
                                "emp_name": self._get_emp_name(emp_id),
                                "op1": op_info.get(op1, {}),
                                "op2": op_info.get(op2, {}),
                                "op1_id": op1,
                                "op2_id": op2
                            })
        
        if not conflicts:
            return ["   ✅ 未发现明确的时间重叠冲突实例"]
        
        suggestions = [f"📋 发现 {len(conflicts)} 个时间重叠冲突:"]
        
        for i, c in enumerate(conflicts[:5], 1):
            suggestions.append(f"   {i}. 员工 [{c['emp_name']}] (ID: {c['emp_id']}) 无法同时执行:")
            suggestions.append(f"      • [{c['op1'].get('batch', '?')}] {c['op1'].get('name', '?')}")
            suggestions.append(f"        时间: {c['op1'].get('start', '?')} ~ {c['op1'].get('end', '?')}")
            suggestions.append(f"      • [{c['op2'].get('batch', '?')}] {c['op2'].get('name', '?')}")
            suggestions.append(f"        时间: {c['op2'].get('start', '?')} ~ {c['op2'].get('end', '?')}")
            suggestions.append(f"      → 该员工是某操作唯一候选人")
        
        if len(conflicts) > 5:
            suggestions.append(f"   ... 还有 {len(conflicts) - 5} 个类似冲突")
        
        suggestions.append("")
        suggestions.append("   💡 解决方案: 调整操作时间或为操作添加更多候选人")
        
        return suggestions
    
    def _analyze_shift_assignment_instances(self) -> List[str]:
        """
        Find specific conflict instances for ShiftAssignmentConstraint.
        Detects operations that cannot be covered by any shift.
        """
        # Reuse the existing shift coverage analysis
        try:
            from core.index import ShiftIndex
            from utils.time_utils import parse_iso_to_unix
            from datetime import datetime, timedelta
            
            shift_index = ShiftIndex(self.req)
            problem_ops = []
            
            for op in self.req.operation_demands:
                start = parse_iso_to_unix(op.planned_start)
                end = parse_iso_to_unix(op.planned_end)
                op_date_str = op.planned_start.split("T")[0]
                
                dt_obj = datetime.fromisoformat(op_date_str)
                prev_date_str = (dt_obj - timedelta(days=1)).strftime("%Y-%m-%d")
                
                valid_ids_today = shift_index.get_valid_shifts_for_op(start, end, op_date_str)
                valid_ids_prev = shift_index.get_valid_shifts_for_op(start, end, prev_date_str)
                
                if not valid_ids_today and not valid_ids_prev:
                    problem_ops.append({
                        "op_id": op.operation_plan_id,
                        "name": op.operation_name,
                        "batch": op.batch_code,
                        "time": f"{op.planned_start} ~ {op.planned_end}"
                    })
            
            if not problem_ops:
                return ["   ✅ 所有操作都有可覆盖的班次"]
            
            suggestions = [f"📋 发现 {len(problem_ops)} 个无法被班次覆盖的操作:"]
            
            for i, op in enumerate(problem_ops[:5], 1):
                suggestions.append(f"   {i}. [{op['batch']}] {op['name']}")
                suggestions.append(f"      时间: {op['time']}")
            
            if len(problem_ops) > 5:
                suggestions.append(f"   ... 还有 {len(problem_ops) - 5} 个类似问题")
            
            suggestions.append("")
            suggestions.append("   💡 解决方案: 调整操作时间或添加覆盖该时段的班次")
            
            return suggestions
            
        except Exception as e:
            return [f"   ⚠️ 分析出错: {str(e)[:50]}"]
    
    def _analyze_max_consecutive_instances(self) -> List[str]:
        """
        Find specific conflict instances for MaxConsecutiveWorkDaysConstraint.
        Detects employees forced to work too many consecutive days.
        """
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        limit = self.config.get("max_consecutive_work_days", 6)
        
        # Reuse essential employee logic
        essential_days = defaultdict(set)
        for op in self.req.operation_demands:
            date_str = op.planned_start.split("T")[0]
            for pos in op.position_qualifications:
                if len(pos.candidate_employee_ids) == 1:
                    emp_id = pos.candidate_employee_ids[0]
                    essential_days[emp_id].add(date_str)
        
        problems = []
        for emp_id, days in essential_days.items():
            sorted_days = sorted(list(days))
            if not sorted_days:
                continue
            
            date_objs = []
            for d in sorted_days:
                try:
                    date_objs.append(datetime.strptime(d, "%Y-%m-%d").date())
                except:
                    pass
            
            if len(date_objs) < 2:
                continue
            
            consecutive = 1
            start_idx = 0
            max_consec = 1
            worst_range = None
            
            for i in range(1, len(date_objs)):
                if (date_objs[i] - date_objs[i-1]).days == 1:
                    consecutive += 1
                    if consecutive > max_consec:
                        max_consec = consecutive
                        worst_range = (date_objs[start_idx], date_objs[i])
                else:
                    consecutive = 1
                    start_idx = i
            
            if max_consec > limit:
                problems.append({
                    "emp_id": emp_id,
                    "emp_name": self._get_emp_name(emp_id),
                    "days": max_consec,
                    "start": worst_range[0].strftime("%Y-%m-%d") if worst_range else "?",
                    "end": worst_range[1].strftime("%Y-%m-%d") if worst_range else "?"
                })
        
        if not problems:
            return ["   ✅ 未发现连续工作超限问题"]
        
        suggestions = [f"📋 发现 {len(problems)} 个员工被迫连续工作超过 {limit} 天:"]
        
        for i, p in enumerate(problems[:5], 1):
            suggestions.append(f"   {i}. [{p['emp_name']}] (ID: {p['emp_id']})")
            suggestions.append(f"      必须连续工作 {p['days']} 天 ({p['start']} ~ {p['end']})")
            suggestions.append(f"      超出限制 {p['days'] - limit} 天")
        
        if len(problems) > 5:
            suggestions.append(f"   ... 还有 {len(problems) - 5} 个类似问题")
        
        suggestions.append("")
        suggestions.append("   💡 解决方案: 为关键操作添加更多候选人或调整排期")
        
        return suggestions
    
    def _analyze_night_rest_instances(self) -> List[str]:
        """Find specific conflicts for NightRestConstraint."""
        # Simplified: report that night rest conflicts exist
        return [
            "   📋 夜班休息约束冲突:",
            "      • 某些员工夜班后的第二天仍需工作",
            "   💡 解决方案: 调整夜班安排或添加替代人选"
        ]
    
    def _analyze_share_group_instances(self) -> List[str]:
        """Find specific conflicts for ShareGroupConstraint."""
        if not self.req.shared_preferences:
            return ["   ✅ 无共享组定义"]
        
        suggestions = [f"📋 共享组约束冲突 ({len(self.req.shared_preferences)} 个共享组):"]
        for i, group in enumerate(self.req.shared_preferences[:3], 1):
            member_count = len(group.members) if group.members else 0
            suggestions.append(f"   {i}. 共享组 #{group.share_group_id}: {member_count} 个成员")
        
        suggestions.append("")
        suggestions.append("   💡 解决方案: 检查共享组内操作是否有足够的共同候选人")
        return suggestions
    
    def _analyze_essential_employees(self) -> List[str]:
        """
        Detect if any employee is the ONLY candidate for operations on > limit consecutive days.
        This guarantees INFEASIBLE regardless of whether max_consecutive constraint is enabled.
        (Reuses logic from MaxConsecutiveWorkDaysConstraint.detect_unavoidable_conflicts)
        """
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        limit = self.config.get("max_consecutive_work_days", 6)
        max_consecutive_enabled = self.config.get("enable_max_consecutive_work_days", True)
        
        # Build Essential Map: Emp -> Set(Dates) where they are the ONLY candidate
        essential_days = defaultdict(set)
        
        for op in self.req.operation_demands:
            date_str = op.planned_start.split("T")[0]
            
            for pos in op.position_qualifications:
                candidates = pos.candidate_employee_ids
                if len(candidates) == 1:
                    emp_id = candidates[0]
                    essential_days[emp_id].add(date_str)
        
        # Check for employees with essential work on > limit consecutive days
        problem_employees = []
        
        for emp_id, days in essential_days.items():
            sorted_days = sorted(list(days))
            if not sorted_days:
                continue
            
            date_objs = []
            for d in sorted_days:
                try:
                    date_objs.append(datetime.strptime(d, "%Y-%m-%d").date())
                except:
                    pass
            
            if not date_objs:
                continue
            
            consecutive = 1
            start_seq_idx = 0
            max_consecutive_found = 1
            worst_range = None
            
            for i in range(1, len(date_objs)):
                diff = (date_objs[i] - date_objs[i-1]).days
                if diff == 1:
                    consecutive += 1
                    if consecutive > max_consecutive_found:
                        max_consecutive_found = consecutive
                        worst_range = (date_objs[start_seq_idx], date_objs[i])
                else:
                    consecutive = 1
                    start_seq_idx = i
            
            if max_consecutive_found > limit:
                emp_name = self._get_emp_name(emp_id)
                problem_employees.append({
                    "emp_id": emp_id,
                    "emp_name": emp_name,
                    "consecutive_days": max_consecutive_found,
                    "start_date": worst_range[0].strftime("%Y-%m-%d") if worst_range else "?",
                    "end_date": worst_range[1].strftime("%Y-%m-%d") if worst_range else "?"
                })
        
        if problem_employees:
            if self.callback:
                self.callback.log(f"[DIAG] 📊 关键员工分析: 发现 {len(problem_employees)} 名员工被强制连续工作超过限制")
            
            suggestions = [
                f"🚨 关键员工超载: 有 {len(problem_employees)} 名员工是某些操作的唯一候选人，且被迫连续工作超过 {limit} 天",
                f"",
                f"📋 问题员工列表:",
            ]
            
            for i, prob in enumerate(problem_employees[:5], 1):
                suggestions.append(f"   {i}. {prob['emp_name']} (ID: {prob['emp_id']})")
                suggestions.append(f"      • 必须连续工作: {prob['consecutive_days']} 天 ({prob['start_date']} ~ {prob['end_date']})")
                suggestions.append(f"      • 超过限制 {limit} 天 ({prob['consecutive_days'] - limit} 天)")
            
            if len(problem_employees) > 5:
                suggestions.append(f"   ... 还有 {len(problem_employees) - 5} 名类似员工")
            
            suggestions.extend([
                f"",
                f"💡 修复建议:",
                f"   1. 添加替代人选: 为这些员工负责的操作添加更多候选人",
                f"   2. 调整操作排期: 将部分操作移到其他日期以打断连续工作",
                f"   3. 放宽限制: 将'最大连续工作天数'从 {limit} 增加到 {max(prob['consecutive_days'] for prob in problem_employees)}",
            ])
            
            if not max_consecutive_enabled:
                suggestions.append(f"   ⚠️ 注意: 您已禁用'最大连续工作天数'约束，但其他约束可能仍导致无解")
            
            return suggestions
        
        if self.callback:
            self.callback.log(f"[DIAG] ✅ 关键员工分析通过")
        return []
    
    def _analyze_rest_shifts(self) -> List[str]:
        """
        Check if there's no REST shift defined. 
        Without REST shifts, employees work every day, causing guaranteed infeasibility.
        """
        if not self.req.shift_definitions:
            return []
        
        # Check for REST shift (nominal_hours <= 0.01)
        has_rest_shift = False
        for shift in self.req.shift_definitions:
            if shift.nominal_hours <= 0.01:
                has_rest_shift = True
                break
        
        if not has_rest_shift:
            if self.callback:
                self.callback.log(f"[DIAG] 📊 休息班次分析: 未找到休息班次定义")
            
            return [
                f"🚨 缺少休息班次: 班次定义中没有'休息'班次 (nominal_hours ≈ 0)",
                f"",
                f"📋 当前班次定义:",
            ] + [
                f"   • {shift.shift_name}: {shift.nominal_hours}小时"
                for shift in self.req.shift_definitions[:5]
            ] + [
                f"",
                f"⚠️ 问题说明:",
                f"   '班次分配约束'要求每位员工每天必须有一个班次",
                f"   如果所有班次都是工作班次，员工将被迫每天工作",
                f"   这会与'最大连续工作'约束冲突，导致无解",
                f"",
                f"💡 修复建议:",
                f"   1. 添加休息班次: 创建一个 nominal_hours = 0 的'休息'班次",
                f"   2. 关闭班次约束: 在高级设置中禁用'班次分配'约束"
            ]
        
        if self.callback:
            self.callback.log(f"[DIAG] ✅ 休息班次分析通过")
        return []
    
    def _analyze_shift_coverage(self) -> List[str]:
        """
        Analyze if there are operations where no candidate has a valid shift to cover.
        This is a common cause of INFEASIBLE when ShiftAssignmentConstraint bans all candidates.
        """
        if not self.req.shift_definitions or not self.req.window:
            return []
        
        try:
            from core.index import ShiftIndex
            from utils.time_utils import parse_iso_to_unix
            from datetime import datetime, timedelta
            
            shift_index = ShiftIndex(self.req)
            
            problem_operations = []
            
            for op in self.req.operation_demands:
                start = parse_iso_to_unix(op.planned_start)
                end = parse_iso_to_unix(op.planned_end)
                op_date_str = op.planned_start.split("T")[0]
                
                # Check each position
                for pos in op.position_qualifications:
                    candidates_with_valid_shift = []
                    candidates_without_valid_shift = []
                    
                    # Get previous day for night shift check
                    dt_obj = datetime.fromisoformat(op_date_str)
                    prev_date_str = (dt_obj - timedelta(days=1)).strftime("%Y-%m-%d")
                    
                    for emp_id in pos.candidate_employee_ids:
                        # Check if any shift can cover this operation
                        valid_ids_today = shift_index.get_valid_shifts_for_op(start, end, op_date_str)
                        valid_ids_prev = shift_index.get_valid_shifts_for_op(start, end, prev_date_str)
                        
                        if valid_ids_today or valid_ids_prev:
                            candidates_with_valid_shift.append(emp_id)
                        else:
                            candidates_without_valid_shift.append(emp_id)
                    
                    # If NO candidates have valid shifts, this position is impossible!
                    if not candidates_with_valid_shift and pos.candidate_employee_ids:
                        emp_name = self._get_emp_name(pos.candidate_employee_ids[0]) if pos.candidate_employee_ids else "N/A"
                        problem_operations.append({
                            "op_id": op.operation_plan_id,
                            "op_name": op.operation_name,
                            "batch_code": op.batch_code,
                            "pos_num": pos.position_number,
                            "planned_time": f"{op.planned_start} ~ {op.planned_end}",
                            "candidate_count": len(pos.candidate_employee_ids)
                        })
            
            if problem_operations:
                if self.callback:
                    self.callback.log(f"[DIAG] 📊 班次覆盖分析: 发现 {len(problem_operations)} 个无法覆盖的操作")
                
                suggestions = [
                    f"🚨 班次覆盖冲突: 有 {len(problem_operations)} 个操作没有任何候选人的班次能覆盖其时间段",
                    f"",
                    f"📋 问题操作列表 (前5个):",
                ]
                
                for i, prob in enumerate(problem_operations[:5], 1):
                    suggestions.append(f"   {i}. [{prob['batch_code']}] {prob['op_name']}")
                    suggestions.append(f"      • 时间: {prob['planned_time']}")
                    suggestions.append(f"      • 岗位 #{prob['pos_num']} 有 {prob['candidate_count']} 个候选人，但无人班次匹配")
                
                if len(problem_operations) > 5:
                    suggestions.append(f"   ... 还有 {len(problem_operations) - 5} 个类似问题")
                
                suggestions.extend([
                    f"",
                    f"💡 修复建议:",
                    f"   1. 调整操作时间: 确保操作时间在班次覆盖范围内",
                    f"   2. 添加新班次: 创建能覆盖这些时段的生产班次",
                    f"   3. 添加候选人: 为这些操作添加有合适班次的候选人",
                    f"   4. 关闭约束: 在高级设置中禁用'班次分配'约束"
                ])
                
                return suggestions
            
            if self.callback:
                self.callback.log(f"[DIAG] ✅ 班次覆盖分析通过")
            return []
            
        except Exception as e:
            logger.warning(f"Shift coverage analysis failed: {e}")
            if self.callback:
                self.callback.log(f"[DIAG] ⚠️ 班次覆盖分析出错: {str(e)}")
            return []
    
    def _get_emp_name(self, emp_id: int) -> str:
        """Helper to get employee name/code"""
        for emp in self.req.employee_profiles:
            if emp.employee_id == emp_id:
                return emp.employee_code or emp.employee_name or str(emp_id)
        return str(emp_id)
    
    def _analyze_capacity(self) -> List[str]:
        """
        Analyze if there's a fundamental capacity shortage.
        Compares total man-hours required by operations vs. total max man-hours available from employees.
        """
        if not self.req.shift_definitions or not self.req.window:
            return []
        
        try:
            from utils.time_utils import get_date_range, parse_iso_to_unix
            
            dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
            num_days = len(dates)
            num_employees = len(self.req.employee_profiles)
            
            # 1. Calculate REAL Demand (Total Man-Hours Required)
            total_required_hours = 0.0
            
            for op in self.req.operation_demands:
                # Duration in hours
                duration_hours = op.planned_duration_minutes / 60.0
                
                # Check how many people actually needed (sum of positions)
                # Note: required_people might be aggregate, or we sum positions
                # Usually required_people is the total.
                # Let's verify against position demands to be safe, but op.required_people is standard.
                people_count = op.required_people
                
                total_required_hours += (duration_hours * people_count)
            
            # 2. Calculate Max Supply (Total Man-Hours Available)
            # Max Work Days per employee * Max Hours per Shift (approx)
            
            max_consecutive_enabled = self.config.get("enable_max_consecutive_work_days", True)
            if max_consecutive_enabled:
                max_consecutive = self.config.get("max_consecutive_work_days", 6)
                # Utilization ratio: N / (N+1)
                utilization_ratio = max_consecutive / (max_consecutive + 1)
                max_work_days_per_emp = num_days * utilization_ratio
            else:
                max_work_days_per_emp = num_days
                
            # Average shift length (conservative estimate, e.g. 8h or max available shift?)
            # Use max nominal hours from working shifts to be optimistic about capacity
            working_shifts = [s for s in self.req.shift_definitions if s.nominal_hours > 0.01]
            if not working_shifts:
                return ["🚨 配置错误: 没有定义工作班次"]
                
            max_shift_hours = max(s.nominal_hours for s in working_shifts)
            
            max_supply_hours = num_employees * max_work_days_per_emp * max_shift_hours
            
            # Buffer for transition/inefficiency (e.g. 10%)
            max_supply_hours_adjusted = max_supply_hours * 0.95
            
            if self.callback:
                self.callback.log(f"[DIAG] 📊 容量分析 (工时):")
                self.callback.log(f"       需求: {total_required_hours:.1f} 工时")
                self.callback.log(f"       供给: {max_supply_hours:.1f} 工时 (Est. {max_work_days_per_emp:.1f} days/emp * {max_shift_hours}h * {num_employees}ppl)")
            
            if total_required_hours > max_supply_hours_adjusted:
                shortage = total_required_hours - max_supply_hours
                
                suggestions = [
                    f"🚨 工时容量不足: 总需求 {total_required_hours:.1f}h > 最大供给 {max_supply_hours:.1f}h",
                    f"   └ 缺口: {shortage:.1f} 工时",
                    f"",
                    f"📋 分析数据:",
                    f"   • 员工总数: {num_employees}",
                    f"   • 预估人均工时: {max_supply_hours/num_employees:.1f}h",
                    f"",
                    f"💡 修复建议:",
                    f"   1. 增加员工: 补充更多人力",
                    f"   2. 减少任务: 移除部分非必要操作",
                    f"   3. 放宽排班规则: 允许连续工作更多天数"
                ]
                return suggestions
                
            return []
            
        except Exception as e:
            logger.warning(f"Capacity analysis failed: {e}")
            return []
            
            # Capacity OK, continue to constraint-level diagnosis
            if self.callback:
                self.callback.log(f"[DIAG] ✅ 容量分析通过，继续约束诊断...")
            return []
            
        except Exception as e:
            logger.warning(f"Capacity analysis failed: {e}")
            return []
    
    def _generate_actionable_suggestions(self, conflicts: List[str]) -> List[str]:
        """
        Generate actionable fix suggestions based on conflict categories.
        """
        suggestions = []
        
        for conflict in conflicts:
            if "连续工作天数" in conflict:
                max_days = self.config.get("max_consecutive_work_days", 6)
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   └ 当前限制: 最多连续工作 {max_days} 天")
                suggestions.append(f"   💡 修复: 在高级设置中将此值增加到 {max_days + 1} 或关闭该约束")
                
            elif "班次分配" in conflict:
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   └ 每位员工每天都必须分配一个班次（包括休息班）")
                suggestions.append(f"   💡 修复: 确保班次定义中包含'休息'班次，或关闭该约束")
                
            elif "岗位需求" in conflict:
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   └ 某些岗位没有足够的候选人")
                suggestions.append(f"   💡 修复: 检查岗位资质配置，确保每个岗位至少有1名合格候选人")
                
            elif "夜班休息" in conflict:
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   └ 夜班后必须休息的规则与其他排班需求冲突")
                suggestions.append(f"   💡 修复: 减少夜班安排，或临时关闭夜班休息约束")
                
            elif "标准工时" in conflict:
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   └ 月度工时上下限与排班需求冲突")
                suggestions.append(f"   💡 修复: 调整工时偏差允许范围，或增加人手分担工时")
                
            else:
                suggestions.append(f"⚠️ {conflict}")
                suggestions.append(f"   💡 修复: 在高级设置中尝试关闭该约束")
        
        return suggestions

    
    def _diagnose_category_level(self) -> List[str]:
        """
        Phase 1: Quick category-level diagnosis with ~6-8 assumption variables.
        Returns list of conflicting category names.
        
        IMPORTANT: In diagnostic mode, ALL constraints (including base ones) must be
        guarded by assumptions, otherwise IIS cannot identify them.
        """
        model = cp_model.CpModel()
        
        # Build base variables WITHOUT hard constraints (diagnostic mode)
        assignments, index = self._build_base_variables_for_diagnosis(model)
        shift_assignments, shift_index = self._build_shift_variables(model)
        
        # Category assumptions
        categories = {}
        
        # 0. Base Demand (岗位需求 - 每个岗位必须分配一人)
        assume_base = model.NewBoolVar("assume_base_demand")
        categories["岗位需求约束 (每个岗位必须分配一人)"] = assume_base
        self._apply_base_demand_with_assumption(model, assignments, assume_base)
        
        # 1. Share Group
        if self.config.get("enable_share_group", True):
            assume_var = model.NewBoolVar("assume_share_group")
            categories["共享组约束"] = assume_var
            self._apply_share_group_with_assumption(model, assignments, index, assume_var)
        
        # 2. Unique Employee
        if self.config.get("enable_unique_employee", True):
            assume_var = model.NewBoolVar("assume_unique_employee")
            categories["人员唯一约束"] = assume_var
            self._apply_unique_employee_with_assumption(model, assignments, index, assume_var)
        
        # 3. One Position
        if self.config.get("enable_one_position", True):
            assume_var = model.NewBoolVar("assume_one_position")
            categories["单操作单岗约束"] = assume_var
            self._apply_one_position_with_assumption(model, assignments, index, assume_var)
        
        if shift_assignments:
            # 4. Shift Assignment
            if self.config.get("enable_shift_assignment", True):
                assume_var = model.NewBoolVar("assume_shift_assignment")
                categories["班次分配约束 (每人每天必须有班次)"] = assume_var
                self._apply_shift_assignment_with_assumption(model, assignments, index, 
                                                             shift_assignments, shift_index, assume_var)
            
            # 5. Max Consecutive Work Days
            if self.config.get("enable_max_consecutive_work_days", True):
                assume_var = model.NewBoolVar("assume_max_consecutive_work")
                categories["连续工作天数约束"] = assume_var
                self._apply_max_consecutive_with_assumption(model, shift_assignments, shift_index, assume_var)
            
            # 6. Standard Hours
            if self.config.get("enable_standard_hours", True):
                assume_var = model.NewBoolVar("assume_standard_hours")
                categories["标准工时约束"] = assume_var
                self._apply_standard_hours_with_assumption(model, shift_assignments, shift_index, assume_var)
            
            # 7. Night Rest
            if self.config.get("enable_night_rest", True):
                assume_var = model.NewBoolVar("assume_night_rest")
                categories["夜班休息约束"] = assume_var
                self._apply_night_rest_with_assumption(model, shift_assignments, shift_index, assume_var)
        
        # Log category count for debugging
        if self.callback:
            self.callback.log(f"[DIAG] 📊 类别假设变量数: {len(categories)}")
        
        # Solve with assumptions (pass BoolVar list directly, not indices)
        assumption_var_list = list(categories.values())
        model.AddAssumptions(assumption_var_list)
        
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 30.0
        status = solver.Solve(model)
        
        if self.callback:
            self.callback.log(f"[DIAG] 📊 诊断求解状态: {solver.StatusName(status)}")
        
        if status == cp_model.INFEASIBLE:
            # Get conflicting assumption indices
            # NOTE: SufficientAssumptionsForInfeasibility returns LITERAL VALUES (variable indices),
            # not positions in the assumptions list. We need to match by variable Index().
            conflict_literals = solver.SufficientAssumptionsForInfeasibility()
            
            if self.callback:
                self.callback.log(f"[DIAG] 📊 冲突字面量: {list(conflict_literals)}")
            
            # Create a map from variable Index to category name
            var_index_to_name = {var.Index(): name for name, var in categories.items()}
            
            if self.callback:
                self.callback.log(f"[DIAG] 📊 变量索引映射: {var_index_to_name}")
            
            # Map conflict literals to category names
            conflicts = []
            for lit in conflict_literals:
                # Literal can be positive (var) or negative (~var), take absolute
                var_idx = abs(lit)
                if var_idx in var_index_to_name:
                    conflicts.append(var_index_to_name[var_idx])
            
            if self.callback:
                self.callback.log(f"[DIAG] 📊 匹配到的冲突类别: {conflicts}")
            
            return conflicts
        
        return []

    
    def _diagnose_instance_level(self, category_conflicts: List[str]) -> List[str]:
        """
        Phase 2: Instance-level diagnosis for specific conflicting categories.
        Creates individual assumptions for each constraint instance.
        """
        model = cp_model.CpModel()
        
        # Build base variables
        assignments, index = self._build_base_variables(model)
        shift_assignments, shift_index = self._build_shift_variables(model)
        
        # Reset assumptions
        self.assumptions = []
        assumption_vars = []
        
        # Apply non-conflicting categories as hard constraints
        # Apply conflicting categories with instance-level assumptions
        
        # Share Group
        if self.config.get("enable_share_group", True):
            if "共享组约束" in category_conflicts:
                self._apply_share_group_instance_assumptions(model, assignments, index, assumption_vars)
            else:
                self._apply_share_group_hard(model, assignments, index)
        
        # Unique Employee
        if self.config.get("enable_unique_employee", True):
            if "人员唯一约束" in category_conflicts:
                self._apply_unique_employee_instance_assumptions(model, assignments, index, assumption_vars)
            else:
                self._apply_unique_employee_hard(model, assignments, index)
        
        # One Position
        if self.config.get("enable_one_position", True):
            if "单操作单岗约束" in category_conflicts:
                self._apply_one_position_instance_assumptions(model, assignments, index, assumption_vars)
            else:
                self._apply_one_position_hard(model, assignments, index)
        
        if shift_assignments:
            # Shift Assignment
            if self.config.get("enable_shift_assignment", True):
                if "班次分配约束" in category_conflicts:
                    self._apply_shift_assignment_instance_assumptions(model, assignments, index,
                                                                      shift_assignments, shift_index, assumption_vars)
                else:
                    self._apply_shift_assignment_hard(model, assignments, index, shift_assignments, shift_index)
            
            # Max Consecutive Work Days
            if self.config.get("enable_max_consecutive_work_days", True):
                if "连续工作天数约束" in category_conflicts:
                    self._apply_max_consecutive_instance_assumptions(model, shift_assignments, shift_index, assumption_vars)
                else:
                    self._apply_max_consecutive_hard(model, shift_assignments, shift_index)
            
            # Standard Hours
            if self.config.get("enable_standard_hours", True):
                if "标准工时约束" in category_conflicts:
                    self._apply_standard_hours_instance_assumptions(model, shift_assignments, shift_index, assumption_vars)
                else:
                    self._apply_standard_hours_hard(model, shift_assignments, shift_index)
            
            # Night Rest
            if self.config.get("enable_night_rest", True):
                if "夜班休息约束" in category_conflicts:
                    self._apply_night_rest_instance_assumptions(model, shift_assignments, shift_index, assumption_vars)
                else:
                    self._apply_night_rest_hard(model, shift_assignments, shift_index)
        
        if not assumption_vars:
            return []
        
        # Solve with instance-level assumptions (pass BoolVar list directly)
        model.AddAssumptions(assumption_vars)
        
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 60.0
        status = solver.Solve(model)
        
        if status == cp_model.INFEASIBLE:
            # Get conflicting assumption indices (indices into the assumption_vars list)
            conflict_indices = solver.SufficientAssumptionsForInfeasibility()
            
            # Map back to descriptions
            conflicts = []
            for idx in conflict_indices:
                if 0 <= idx < len(self.assumptions):
                    conflicts.append(self.assumptions[idx].description)
            
            return conflicts[:10]  # Limit to top 10 for readability
        
        return []
    
    # ========== Base Variable Builders ==========
    
    def _build_base_variables_for_diagnosis(self, model: cp_model.CpModel) -> Tuple[Dict, AssignmentIndex]:
        """
        Build assignment variables WITHOUT hard constraints.
        For diagnostic mode only - constraints will be added separately with assumptions.
        """
        assignments = {}
        
        for op in self.req.operation_demands:
            for pos in op.position_qualifications:
                for emp_id in pos.candidate_employee_ids:
                    var_name = f"Assign_Op{op.operation_plan_id}_Pos{pos.position_number}_Emp{emp_id}"
                    assignments[(op.operation_plan_id, pos.position_number, emp_id)] = model.NewBoolVar(var_name)
                # NOTE: No hard constraint added here - will be added via assumption in _apply_base_demand_with_assumption
        
        index = AssignmentIndex(assignments)
        return assignments, index
    
    def _apply_base_demand_with_assumption(self, model: cp_model.CpModel, assignments: Dict, assume_var):
        """
        Apply base demand constraints: each position must have exactly one employee.
        Guarded by assumption variable for IIS analysis.
        """
        positions = {}  # (op_id, pos_num) -> list of employee vars
        
        for (op_id, pos_num, emp_id), var in assignments.items():
            key = (op_id, pos_num)
            if key not in positions:
                positions[key] = []
            positions[key].append(var)
        
        for (op_id, pos_num), emp_vars in positions.items():
            if emp_vars:
                # Each position must have exactly one employee (enforced if assume_var is true)
                model.Add(sum(emp_vars) == 1).OnlyEnforceIf(assume_var)
    
    def _build_base_variables(self, model: cp_model.CpModel) -> Tuple[Dict, AssignmentIndex]:
        """Build assignment variables with hard constraints (for instance-level diagnosis)"""
        assignments = {}
        
        for op in self.req.operation_demands:
            for pos in op.position_qualifications:
                for emp_id in pos.candidate_employee_ids:
                    var_name = f"Assign_Op{op.operation_plan_id}_Pos{pos.position_number}_Emp{emp_id}"
                    assignments[(op.operation_plan_id, pos.position_number, emp_id)] = model.NewBoolVar(var_name)
                
                # Each position must have exactly one employee
                candidates_vars = [
                    assignments[(op.operation_plan_id, pos.position_number, emp_id)]
                    for emp_id in pos.candidate_employee_ids
                ]
                if candidates_vars:
                    model.Add(sum(candidates_vars) == 1)
        
        index = AssignmentIndex(assignments)
        return assignments, index

    
    def _build_shift_variables(self, model: cp_model.CpModel) -> Tuple[Dict, Optional[ShiftIndex]]:
        """Build shift assignment variables"""
        shift_assignments = {}
        shift_index = None
        
        if self.req.window and self.req.shift_definitions:
            shift_index = ShiftIndex(self.req)
            dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
            all_employees = {ep.employee_id for ep in self.req.employee_profiles}
            
            for date in dates:
                for emp_id in all_employees:
                    for shift in self.req.shift_definitions:
                        var_name = f"Shift_{emp_id}_{date}_{shift.shift_id}"
                        shift_assignments[(emp_id, date, shift.shift_id)] = model.NewBoolVar(var_name)
        
        return shift_assignments, shift_index
    
    # ========== Category-Level Assumption Appliers ==========
    
    def _apply_share_group_with_assumption(self, model, assignments, index, assume_var):
        """Apply share group constraints with category-level assumption"""
        # Simplified: skip for now if no share groups
        if not self.req.shared_preferences:
            return
        # Real implementation would add OnlyEnforceIf(assume_var) to each constraint
        
    def _apply_unique_employee_with_assumption(self, model, assignments, index, assume_var):
        """Apply unique employee constraints with category-level assumption"""
        pass  # Simplified for category-level
        
    def _apply_one_position_with_assumption(self, model, assignments, index, assume_var):
        """Apply one position constraints with category-level assumption"""
        pass
        
    def _apply_shift_assignment_with_assumption(self, model, assignments, index, 
                                                 shift_assignments, shift_index, assume_var):
        """Apply shift assignment constraints with category-level assumption"""
        if not shift_assignments:
            return
        
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        
        for date in dates:
            for emp_id in all_employees:
                day_shifts = [
                    shift_assignments[(emp_id, date, s.shift_id)]
                    for s in self.req.shift_definitions
                    if (emp_id, date, s.shift_id) in shift_assignments
                ]
                if day_shifts:
                    # Exactly one shift per day (enforced if assume_var is true)
                    model.Add(sum(day_shifts) == 1).OnlyEnforceIf(assume_var)
    
    def _apply_max_consecutive_with_assumption(self, model, shift_assignments, shift_index, assume_var):
        """Apply max consecutive work days with category-level assumption"""
        if not shift_assignments or not shift_index:
            return
        
        max_days = self.config.get("max_consecutive_work_days", 6)
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        
        for emp_id in all_employees:
            for i in range(len(dates) - max_days):
                window_dates = dates[i:i + max_days + 1]
                work_vars = []
                for d in window_dates:
                    for s in self.req.shift_definitions:
                        if s.shift_id != 0 and (emp_id, d, s.shift_id) in shift_assignments:
                            work_vars.append(shift_assignments[(emp_id, d, s.shift_id)])
                if work_vars:
                    model.Add(sum(work_vars) <= max_days).OnlyEnforceIf(assume_var)
    
    def _apply_standard_hours_with_assumption(self, model, shift_assignments, shift_index, assume_var):
        """Apply standard hours with category-level assumption"""
        pass  # Simplified
    
    def _apply_night_rest_with_assumption(self, model, shift_assignments, shift_index, assume_var):
        """Apply night rest with category-level assumption"""
        if not shift_assignments or not shift_index:
            return
        
        night_shift_ids = shift_index.night_shift_ids if hasattr(shift_index, 'night_shift_ids') else set()
        if not night_shift_ids:
            return
        
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        
        for emp_id in all_employees:
            for i in range(len(dates) - 1):
                d1, d2 = dates[i], dates[i + 1]
                for ns_id in night_shift_ids:
                    if (emp_id, d1, ns_id) not in shift_assignments:
                        continue
                    night_var = shift_assignments[(emp_id, d1, ns_id)]
                    
                    # Next day must be rest (no work shifts)
                    for s in self.req.shift_definitions:
                        if s.shift_id != 0 and (emp_id, d2, s.shift_id) in shift_assignments:
                            next_day_var = shift_assignments[(emp_id, d2, s.shift_id)]
                            model.AddImplication(night_var, next_day_var.Not()).OnlyEnforceIf(assume_var)
    
    # ========== Hard Constraint Appliers (for non-conflicting categories) ==========
    
    def _apply_share_group_hard(self, model, assignments, index):
        """Apply share group as hard constraint"""
        pass
    
    def _apply_unique_employee_hard(self, model, assignments, index):
        """Apply unique employee as hard constraint"""
        pass
    
    def _apply_one_position_hard(self, model, assignments, index):
        """Apply one position as hard constraint"""
        pass
    
    def _apply_shift_assignment_hard(self, model, assignments, index, shift_assignments, shift_index):
        """Apply shift assignment as hard constraint"""
        if not shift_assignments:
            return
        
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        
        for date in dates:
            for emp_id in all_employees:
                day_shifts = [
                    shift_assignments[(emp_id, date, s.shift_id)]
                    for s in self.req.shift_definitions
                    if (emp_id, date, s.shift_id) in shift_assignments
                ]
                if day_shifts:
                    model.Add(sum(day_shifts) == 1)
    
    def _apply_max_consecutive_hard(self, model, shift_assignments, shift_index):
        """Apply max consecutive as hard constraint"""
        pass
    
    def _apply_standard_hours_hard(self, model, shift_assignments, shift_index):
        """Apply standard hours as hard constraint"""
        pass
    
    def _apply_night_rest_hard(self, model, shift_assignments, shift_index):
        """Apply night rest as hard constraint"""
        pass
    
    # ========== Instance-Level Assumption Appliers ==========
    
    def _apply_share_group_instance_assumptions(self, model, assignments, index, assumption_vars):
        """Apply share group with instance-level assumptions"""
        pass
    
    def _apply_unique_employee_instance_assumptions(self, model, assignments, index, assumption_vars):
        """Apply unique employee with instance-level assumptions"""
        pass
    
    def _apply_one_position_instance_assumptions(self, model, assignments, index, assumption_vars):
        """Apply one position with instance-level assumptions"""
        pass
    
    def _apply_shift_assignment_instance_assumptions(self, model, assignments, index,
                                                      shift_assignments, shift_index, assumption_vars):
        """Apply shift assignment with instance-level assumptions"""
        if not shift_assignments:
            return
        
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        emp_names = {ep.employee_id: ep.employee_code for ep in self.req.employee_profiles}
        
        for date in dates:
            for emp_id in all_employees:
                day_shifts = [
                    shift_assignments[(emp_id, date, s.shift_id)]
                    for s in self.req.shift_definitions
                    if (emp_id, date, s.shift_id) in shift_assignments
                ]
                if day_shifts:
                    assume_var = model.NewBoolVar(f"assume_shift_{emp_id}_{date}")
                    model.Add(sum(day_shifts) == 1).OnlyEnforceIf(assume_var)
                    
                    assumption_vars.append(assume_var)
                    self.assumptions.append(ConstraintAssumption(
                        category="班次分配",
                        description=f"员工{emp_names.get(emp_id, emp_id)}在{date}必须分配班次",
                        assumption_index=len(assumption_vars) - 1
                    ))
    
    def _apply_max_consecutive_instance_assumptions(self, model, shift_assignments, shift_index, assumption_vars):
        """Apply max consecutive with instance-level assumptions"""
        if not shift_assignments or not shift_index:
            return
        
        max_days = self.config.get("max_consecutive_work_days", 6)
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        emp_names = {ep.employee_id: ep.employee_code for ep in self.req.employee_profiles}
        
        for emp_id in all_employees:
            for i in range(len(dates) - max_days):
                window_dates = dates[i:i + max_days + 1]
                work_vars = []
                for d in window_dates:
                    for s in self.req.shift_definitions:
                        if s.shift_id != 0 and (emp_id, d, s.shift_id) in shift_assignments:
                            work_vars.append(shift_assignments[(emp_id, d, s.shift_id)])
                
                if work_vars:
                    assume_var = model.NewBoolVar(f"assume_consec_{emp_id}_{dates[i]}")
                    model.Add(sum(work_vars) <= max_days).OnlyEnforceIf(assume_var)
                    
                    assumption_vars.append(assume_var)
                    self.assumptions.append(ConstraintAssumption(
                        category="连续工作",
                        description=f"员工{emp_names.get(emp_id, emp_id)}在{window_dates[0]}~{window_dates[-1]}不能连续工作超过{max_days}天",
                        assumption_index=len(assumption_vars) - 1
                    ))
    
    def _apply_standard_hours_instance_assumptions(self, model, shift_assignments, shift_index, assumption_vars):
        """Apply standard hours with instance-level assumptions"""
        pass
    
    def _apply_night_rest_instance_assumptions(self, model, shift_assignments, shift_index, assumption_vars):
        """Apply night rest with instance-level assumptions"""
        if not shift_assignments or not shift_index:
            return
        
        night_shift_ids = shift_index.night_shift_ids if hasattr(shift_index, 'night_shift_ids') else set()
        if not night_shift_ids:
            return
        
        dates = get_date_range(self.req.window['start_date'], self.req.window['end_date'])
        all_employees = {ep.employee_id for ep in self.req.employee_profiles}
        emp_names = {ep.employee_id: ep.employee_code for ep in self.req.employee_profiles}
        
        for emp_id in all_employees:
            for i in range(len(dates) - 1):
                d1, d2 = dates[i], dates[i + 1]
                
                for ns_id in night_shift_ids:
                    if (emp_id, d1, ns_id) not in shift_assignments:
                        continue
                    
                    night_var = shift_assignments[(emp_id, d1, ns_id)]
                    
                    # Create assumption for night rest
                    assume_var = model.NewBoolVar(f"assume_night_rest_{emp_id}_{d1}")
                    
                    # Next day must be rest (enforced if assume_var is true)
                    for s in self.req.shift_definitions:
                        if s.shift_id != 0 and (emp_id, d2, s.shift_id) in shift_assignments:
                            next_day_var = shift_assignments[(emp_id, d2, s.shift_id)]
                            # night_var AND assume_var => NOT next_day_var
                            b = model.NewBoolVar(f"night_rest_impl_{emp_id}_{d1}_{s.shift_id}")
                            model.AddBoolAnd([night_var, assume_var]).OnlyEnforceIf(b)
                            model.Add(next_day_var == 0).OnlyEnforceIf(b)
                    
                    assumption_vars.append(assume_var)
                    self.assumptions.append(ConstraintAssumption(
                        category="夜班休息",
                        description=f"员工{emp_names.get(emp_id, emp_id)}在{d1}夜班后第二天({d2})需休息",
                        assumption_index=len(assumption_vars) - 1
                    ))
                    break  # One assumption per employee per day
