"""
Sprint 2B 功能验证测试

验证时间约束 (H5-H7) 是否真正生效。
"""

import unittest
import sys
import os

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig, ShiftTypeData
)
from core.context import SolverContext
from constraints.temporal.consecutive import ConsecutiveConstraint
from constraints.temporal.night_rest import NightRestConstraint


def create_test_request(operations=None, employees=None, shift_types=None):
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
        shift_types=shift_types or [],
        config=SolverConfig(),
    )


def create_assignment_vars(model, context):
    """创建分配变量"""
    for op in context.request.operations:
        for pos in range(op.required_people):
            for emp in context.request.employees:
                var_key = (op.id, pos, emp.id)
                var = model.NewBoolVar(f"assign_{op.id}_{pos}_{emp.id}")
                context.assignment_vars[var_key] = var


class TestH5ConsecutiveConstraint(unittest.TestCase):
    """H5 连续工作限制约束测试"""
    
    def test_consecutive_7_days_infeasible(self):
        """测试: 连续工作7天应无解 (限制6天)"""
        # 创建连续7天的操作
        operations = []
        for day in range(1, 8):  # 1-7
            operations.append(OperationData(
                id=day, batch_id=1, operation_name=f"Day{day}",
                required_people=1,
                planned_start=f"2025-01-{day:02d}T09:00:00",
                planned_end=f"2025-01-{day:02d}T17:00:00",
                duration_minutes=480,
            ))
        
        request = create_test_request(
            operations=operations,
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 应用连续工作约束 (最大6天)
        constraint = ConsecutiveConstraint(max_consecutive_days=6)
        constraint.apply(model, context)
        
        # 强制员工每天都被分配
        for op in operations:
            model.Add(context.assignment_vars[(op.id, 0, 1)] == 1)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        # 应该无解 (7天连续工作违反6天限制)
        self.assertEqual(status, cp_model.INFEASIBLE, 
                        "连续工作7天应该无解")
        
        print("✅ H5 测试通过: 连续工作7天正确返回无解")
    
    def test_consecutive_6_days_feasible(self):
        """测试: 连续工作6天应有解"""
        # 创建连续6天的操作
        operations = []
        for day in range(1, 7):  # 1-6
            operations.append(OperationData(
                id=day, batch_id=1, operation_name=f"Day{day}",
                required_people=1,
                planned_start=f"2025-01-{day:02d}T09:00:00",
                planned_end=f"2025-01-{day:02d}T17:00:00",
                duration_minutes=480,
            ))
        
        request = create_test_request(
            operations=operations,
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 应用连续工作约束 (最大6天)
        constraint = ConsecutiveConstraint(max_consecutive_days=6)
        constraint.apply(model, context)
        
        # 强制员工每天都被分配
        for op in operations:
            model.Add(context.assignment_vars[(op.id, 0, 1)] == 1)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        # 应该有解 (刚好6天)
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE], 
                     "连续工作6天应该有解")
        
        print("✅ H5 测试通过: 连续工作6天正确返回有解")


class TestH7NightRestConstraint(unittest.TestCase):
    """H7 夜班强制休息约束测试"""
    
    def test_night_shift_context_identification(self):
        """测试: 夜班类型能被正确识别"""
        request = create_test_request(
            shift_types=[
                ShiftTypeData(id=1, shift_code="D", shift_name="常日班", 
                             start_time="08:00", end_time="17:00", work_hours=8, is_night_shift=False),
                ShiftTypeData(id=2, shift_code="N", shift_name="夜班",
                             start_time="20:00", end_time="08:00", work_hours=12, is_night_shift=True),
            ]
        )
        
        context = SolverContext.from_request(request)
        
        self.assertIn(2, context.night_shift_ids, "夜班应被识别")
        self.assertNotIn(1, context.night_shift_ids, "常日班不应被识别为夜班")
        
        print("✅ H7 测试通过: 夜班类型被正确识别")


class TestConstraintRegistry(unittest.TestCase):
    """约束注册表测试"""
    
    def test_all_sprint2b_constraints_registered(self):
        """测试: 所有 Sprint 2B 约束应被注册"""
        from constraints import load_all_constraints, CONSTRAINT_REGISTRY
        
        load_all_constraints()
        
        # 检查时间约束
        self.assertIn("H5", CONSTRAINT_REGISTRY, "H5 应被注册")
        self.assertIn("H6", CONSTRAINT_REGISTRY, "H6 应被注册")
        self.assertIn("H7", CONSTRAINT_REGISTRY, "H7 应被注册")
        
        print(f"✅ 约束注册表: 已注册 {len(CONSTRAINT_REGISTRY)} 个约束")
        print(f"   约束列表: {list(CONSTRAINT_REGISTRY.keys())}")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 2B 时间约束功能验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestH5ConsecutiveConstraint))
    suite.addTests(loader.loadTestsFromTestCase(TestH7NightRestConstraint))
    suite.addTests(loader.loadTestsFromTestCase(TestConstraintRegistry))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
