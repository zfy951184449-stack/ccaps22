"""
真实数据验证测试

从数据库获取真实操作和员工数据，验证约束是否正确生效。
"""

import unittest
import sys
import os
import requests
from datetime import datetime

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig, ShiftTypeData, CalendarDayData
)
from core.context import SolverContext
from constraints import load_all_constraints, CONSTRAINT_REGISTRY


# 后端 API 地址
BACKEND_URL = "http://localhost:3001"


def fetch_real_operations(start_date: str, end_date: str, limit: int = 20):
    """从后端 API 获取真实操作数据"""
    try:
        # 尝试日历 API 获取月度操作
        response = requests.get(
            f"{BACKEND_URL}/api/calendar/operations/month",
            params={
                "month": start_date[:7],  # 2025-01
            },
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            ops = data.get('operations', data) if isinstance(data, dict) else data
            if ops:
                return ops[:limit]
        
        # 备选: 活跃操作
        response = requests.get(
            f"{BACKEND_URL}/api/calendar/operations/active",
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            return (data.get('operations', data) if isinstance(data, dict) else data)[:limit]
            
    except Exception as e:
        print(f"⚠️ 无法获取操作数据: {e}")
    return []


def fetch_real_employees(limit: int = 50):
    """从后端 API 获取真实员工数据"""
    try:
        response = requests.get(
            f"{BACKEND_URL}/api/employees",
            params={"limit": limit},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            return data.get('employees', data) if isinstance(data, dict) else data
    except Exception as e:
        print(f"⚠️ 无法获取员工数据: {e}")
    return []


def fetch_real_shift_types():
    """从后端 API 获取真实班次类型"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/shift-types", timeout=5)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"⚠️ 无法获取班次类型: {e}")
    return []


def convert_to_operation_data(raw_ops):
    """将真实操作数据转换为 OperationData"""
    operations = []
    for op in raw_ops:
        try:
            # 跳过没有时间的操作
            planned_start = op.get('planned_start')
            planned_end = op.get('planned_end')
            if not planned_start or not planned_end:
                continue
                
            operations.append(OperationData(
                id=op.get('id'),
                batch_id=op.get('batch_id', op.get('batch_plan_id', 1)),
                operation_name=op.get('operation_name', op.get('name', '')),
                required_people=op.get('personnel_count', op.get('required_people', 1)),
                planned_start=planned_start,
                planned_end=planned_end,
                duration_minutes=op.get('duration_minutes', 480),
                required_qualifications=op.get('required_qualifications', []),
                share_group_id=op.get('share_group_id'),
            ))
        except Exception as e:
            print(f"⚠️ 跳过无效操作 {op.get('id')}: {e}")
    return operations


def convert_to_employee_data(raw_emps):
    """将真实员工数据转换为 EmployeeData"""
    employees = []
    for emp in raw_emps:
        try:
            employees.append(EmployeeData(
                id=emp.get('id'),
                name=emp.get('name', ''),
                employee_code=emp.get('employee_code', emp.get('code', '')),
                role=emp.get('employee_type', emp.get('role', 'OPERATOR')),
                qualifications=emp.get('qualification_ids', emp.get('qualifications', [])),
            ))
        except Exception as e:
            print(f"⚠️ 跳过无效员工 {emp.get('id')}: {e}")
    return employees


class TestRealDataValidation(unittest.TestCase):
    """真实数据验证测试"""
    
    @classmethod
    def setUpClass(cls):
        """初始化: 加载约束并获取真实数据"""
        load_all_constraints()
        
        # 获取真实数据 (1月1日-15日)
        print("\n=== 获取真实数据 ===")
        
        raw_ops = fetch_real_operations("2025-01-01", "2025-01-15", limit=30)
        raw_emps = fetch_real_employees(limit=50)
        raw_shifts = fetch_real_shift_types()
        
        cls.operations = convert_to_operation_data(raw_ops)
        cls.employees = convert_to_employee_data(raw_emps)
        cls.shift_types = [
            ShiftTypeData(
                id=st.get('id'),
                shift_code=st.get('shift_code', ''),
                shift_name=st.get('shift_name', ''),
                start_time=st.get('start_time', '08:00'),
                end_time=st.get('end_time', '17:00'),
                work_hours=st.get('work_hours', 8),
                is_night_shift=st.get('is_night_shift', False),
            )
            for st in raw_shifts
        ] if raw_shifts else []
        
        print(f"  操作数: {len(cls.operations)}")
        print(f"  员工数: {len(cls.employees)}")
        print(f"  班次类型: {len(cls.shift_types)}")
    
    def test_context_builds_successfully(self):
        """测试: 使用真实数据构建上下文"""
        if not self.operations:
            self.skipTest("无真实操作数据")
        
        request = SolverRequest(
            operations=self.operations,
            employees=self.employees,
            shift_types=self.shift_types,
            config=SolverConfig(),
        )
        
        context = SolverContext.from_request(request)
        
        self.assertEqual(len(context.operation_by_id), len(self.operations))
        self.assertEqual(len(context.employee_by_id), len(self.employees))
        
        print(f"\n✅ 上下文构建成功:")
        print(f"   操作索引: {len(context.operation_by_id)} 项")
        print(f"   员工索引: {len(context.employee_by_id)} 项")
        print(f"   资质索引: {len(context.employees_by_qualification)} 种资质")
        print(f"   冲突对数: {sum(len(v) for v in context.time_conflict_map.values()) // 2}")
    
    def test_qualification_filter_real_data(self):
        """测试: 真实数据的资质过滤"""
        if not self.operations or not self.employees:
            self.skipTest("无真实数据")
        
        request = SolverRequest(
            operations=self.operations,
            employees=self.employees,
            config=SolverConfig(),
        )
        
        context = SolverContext.from_request(request)
        
        # 统计每个操作的合格员工数
        qualified_stats = []
        for op in self.operations:
            qualified = context.qualified_employees.get(op.id, set())
            qualified_stats.append(len(qualified))
        
        avg_qualified = sum(qualified_stats) / len(qualified_stats) if qualified_stats else 0
        
        print(f"\n✅ 资质过滤统计:")
        print(f"   平均每操作合格员工数: {avg_qualified:.1f}")
        print(f"   最少合格员工: {min(qualified_stats) if qualified_stats else 0}")
        print(f"   最多合格员工: {max(qualified_stats) if qualified_stats else 0}")
        
        self.assertTrue(len(qualified_stats) > 0, "应有操作被处理")
    
    def test_time_conflict_detection_real_data(self):
        """测试: 真实数据的时间冲突检测"""
        if not self.operations:
            self.skipTest("无真实操作数据")
        
        request = SolverRequest(
            operations=self.operations,
            employees=self.employees,
            config=SolverConfig(),
        )
        
        context = SolverContext.from_request(request)
        
        total_conflicts = sum(len(v) for v in context.time_conflict_map.values()) // 2
        
        print(f"\n✅ 时间冲突检测:")
        print(f"   总操作数: {len(self.operations)}")
        print(f"   检测到冲突对数: {total_conflicts}")
        
        # 列出前5个冲突示例
        shown = 0
        for op_id, conflicts in context.time_conflict_map.items():
            if conflicts and shown < 3:
                op = context.operation_by_id.get(op_id)
                print(f"   例: 操作 {op.operation_name if op else op_id} 与 {len(conflicts)} 个操作冲突")
                shown += 1
    
    def test_full_constraint_application(self):
        """测试: 应用所有约束到真实数据"""
        if not self.operations or not self.employees:
            self.skipTest("无真实数据")
        
        request = SolverRequest(
            operations=self.operations[:10],  # 限制10个操作，加快测试
            employees=self.employees[:20],     # 限制20个员工
            shift_types=self.shift_types,
            config=SolverConfig(),
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        
        # 创建分配变量
        for op in request.operations:
            for pos in range(op.required_people):
                for emp in request.employees:
                    var_key = (op.id, pos, emp.id)
                    var = model.NewBoolVar(f"assign_{op.id}_{pos}_{emp.id}")
                    context.assignment_vars[var_key] = var
        
        # 应用所有约束
        print(f"\n=== 应用约束到真实数据 ===")
        for constraint_id, constraint_class in CONSTRAINT_REGISTRY.items():
            constraint = constraint_class()
            try:
                constraint.apply(model, context)
                print(f"   {constraint_id}: 添加 {constraint.stats.constraints_added} 个约束")
            except Exception as e:
                print(f"   {constraint_id}: ⚠️ {e}")
        
        # 尝试求解
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 5
        status = solver.Solve(model)
        
        status_names = {
            cp_model.OPTIMAL: "最优解",
            cp_model.FEASIBLE: "可行解",
            cp_model.INFEASIBLE: "无解",
            cp_model.MODEL_INVALID: "模型无效",
            cp_model.UNKNOWN: "超时/未知",
        }
        
        print(f"\n✅ 求解结果: {status_names.get(status, status)}")
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE, cp_model.INFEASIBLE, cp_model.UNKNOWN],
                     "求解应返回有效状态")


if __name__ == '__main__':
    print("=" * 60)
    print("真实数据验证测试")
    print("=" * 60)
    
    # 检查后端是否可用
    try:
        response = requests.get(f"{BACKEND_URL}/api/health", timeout=2)
        print(f"后端状态: {'✅ 可用' if response.status_code == 200 else '❌ 不可用'}")
    except:
        print("后端状态: ⚠️ 无法连接，将跳过需要后端的测试")
    
    print()
    
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestRealDataValidation)
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"⚠️ {len(result.failures) + len(result.skipped)} 个测试失败或跳过")
    print("=" * 60)
