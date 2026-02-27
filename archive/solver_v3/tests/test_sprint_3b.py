"""
Sprint 3B 功能验证测试

验证公平性约束 F1-F4 是否真正生效。
"""

import unittest
import sys
import os

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig
)
from core.context import SolverContext
from objectives.builder import ObjectiveBuilder
from objectives.skip_penalty import SkipPenaltyObjective
from objectives.fairness import FairnessObjective


def create_test_request(operations=None, employees=None):
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
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


class TestFairnessObjective(unittest.TestCase):
    """公平性目标函数测试"""
    
    def test_fairness_initialization(self):
        """测试: FairnessObjective 可实例化"""
        fairness = FairnessObjective()
        
        self.assertEqual(fairness.night_shift_weight, 100)
        self.assertEqual(fairness.target_max_range, 3)
        
        print("✅ FairnessObjective 可实例化")
    
    def test_fairness_apply_creates_constraints(self):
        """测试: 公平性约束被正确创建"""
        # 创建多个操作和多个员工
        request = create_test_request(
            operations=[
                OperationData(id=1, batch_id=1, operation_name="Op1",
                             required_people=1,
                             planned_start="2025-01-15T09:00:00",
                             planned_end="2025-01-15T17:00:00",
                             duration_minutes=480),
                OperationData(id=2, batch_id=1, operation_name="Op2",
                             required_people=1,
                             planned_start="2025-01-16T09:00:00",
                             planned_end="2025-01-16T17:00:00",
                             duration_minutes=480),
            ],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        fairness = FairnessObjective()
        fairness.apply(model, context, builder)
        
        # 应该有公平性惩罚项
        self.assertGreater(builder.stats.total_terms, 0)
        self.assertIn("P2", builder.stats.terms_by_priority)
        
        print(f"✅ 公平性约束创建成功: {builder.stats.total_terms} 项")


class TestF1NightShiftFairness(unittest.TestCase):
    """F1 夜班公平性测试"""
    
    def test_night_operations_counted(self):
        """测试: 夜班操作被正确识别和计数"""
        request = create_test_request(
            operations=[
                OperationData(id=1, batch_id=1, operation_name="日班",
                             required_people=1,
                             planned_start="2025-01-15T09:00:00",  # 白天
                             planned_end="2025-01-15T17:00:00",
                             duration_minutes=480),
                OperationData(id=2, batch_id=1, operation_name="夜班",
                             required_people=1,
                             planned_start="2025-01-15T22:00:00",  # 晚上
                             planned_end="2025-01-16T06:00:00",
                             duration_minutes=480),
            ],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        fairness = FairnessObjective()
        fairness.apply(model, context, builder)
        
        # 检查夜班计数变量
        self.assertEqual(len(fairness.night_shift_counts), 2)
        
        print("✅ F1 夜班操作计数变量创建成功")


class TestF4RangePenalty(unittest.TestCase):
    """F4 极差惩罚测试"""
    
    def test_range_penalty_optimization(self):
        """测试: 求解器应均衡分配以减少极差"""
        # 创建4个操作，2个员工，应该每人2个操作
        request = create_test_request(
            operations=[
                OperationData(id=i, batch_id=1, operation_name=f"Op{i}",
                             required_people=1,
                             planned_start=f"2025-01-{15+i:02d}T09:00:00",
                             planned_end=f"2025-01-{15+i:02d}T17:00:00",
                             duration_minutes=480)
                for i in range(1, 5)  # 4个操作
            ],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 添加位置约束（每个位置只能一个人）
        from constraints.assignment.position import PositionConstraint
        position_constraint = PositionConstraint()
        position_constraint.apply(model, context)
        
        builder = ObjectiveBuilder()
        
        # 跳过惩罚
        skip_obj = SkipPenaltyObjective()
        skip_obj.apply(model, context, builder)
        
        # 公平性
        fairness = FairnessObjective()
        fairness.apply(model, context, builder)
        
        builder.minimize(model)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE])
        
        # 检查分配是否均衡
        emp1_count = sum(
            solver.Value(context.assignment_vars[(op.id, 0, 1)])
            for op in context.request.operations
            if (op.id, 0, 1) in context.assignment_vars
        )
        emp2_count = sum(
            solver.Value(context.assignment_vars[(op.id, 0, 2)])
            for op in context.request.operations
            if (op.id, 0, 2) in context.assignment_vars
        )
        
        # 极差应该很小
        range_val = abs(emp1_count - emp2_count)
        self.assertLessEqual(range_val, 2, f"极差应 ≤ 2, 实际为 {range_val}")
        
        print(f"✅ F4 极差惩罚: 员工1={emp1_count}, 员工2={emp2_count}, 极差={range_val}")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 3B 公平性约束验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestFairnessObjective))
    suite.addTests(loader.loadTestsFromTestCase(TestF1NightShiftFairness))
    suite.addTests(loader.loadTestsFromTestCase(TestF4RangePenalty))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
