"""
Sprint 3A 功能验证测试

验证目标函数框架、S1 缺员惩罚和智能优先级。
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
from objectives.priority import SmartPriorityObjective


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


class TestObjectiveBuilder(unittest.TestCase):
    """目标函数构建器测试"""
    
    def test_builder_initialization(self):
        """测试: ObjectiveBuilder 可实例化"""
        builder = ObjectiveBuilder()
        
        self.assertEqual(builder.stats.total_terms, 0)
        self.assertEqual(len(builder.terms), 0)
        
        print("✅ ObjectiveBuilder 可实例化")
    
    def test_add_terms_by_priority(self):
        """测试: 可添加不同优先级的项"""
        builder = ObjectiveBuilder()
        model = cp_model.CpModel()
        
        var1 = model.NewBoolVar("skip1")
        var2 = model.NewBoolVar("fair1")
        var3 = model.NewBoolVar("soft1")
        
        builder.add_skip_penalty(var1, base_penalty=1000, description="跳过1")
        builder.add_fairness_penalty(var2, weight=100, description="公平1")
        builder.add_soft_penalty(var3, penalty=500, description="软约束1")
        
        self.assertEqual(builder.stats.total_terms, 3)
        self.assertEqual(builder.stats.terms_by_priority.get("P1", 0), 1)
        self.assertEqual(builder.stats.terms_by_priority.get("P2", 0), 1)
        self.assertEqual(builder.stats.terms_by_priority.get("P3", 0), 1)
        
        print("✅ 多优先级项添加成功")


class TestS1SkipPenalty(unittest.TestCase):
    """S1 缺员惩罚测试"""
    
    def test_skip_penalty_creates_variables(self):
        """测试: 跳过变量被正确创建"""
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=2,  # 需要2人
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T12:00:00",
                duration_minutes=180,
            )],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        skip_objective = SkipPenaltyObjective(base_penalty=1000)
        skip_objective.apply(model, context, builder)
        
        # 应有2个跳过变量 (因为需要2人)
        self.assertEqual(len(skip_objective.skip_vars), 2)
        self.assertEqual(len(builder.terms), 2)
        
        print("✅ S1 跳过变量创建成功")
    
    def test_skip_penalty_optimization(self):
        """测试: 求解器应优先分配以减少跳过"""
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=2,  # 需要2人
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T12:00:00",
                duration_minutes=180,
            )],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        skip_objective = SkipPenaltyObjective(base_penalty=1000)
        skip_objective.apply(model, context, builder)
        
        # 设置最小化目标
        builder.minimize(model)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE])
        
        # 有2个员工满足2个岗位，应该没有跳过
        skip_count = skip_objective.get_skip_count(solver)
        self.assertEqual(skip_count, 0, "应该没有跳过")
        
        print("✅ S1 求解器优先分配减少跳过")


class TestSmartPriority(unittest.TestCase):
    """智能优先级测试"""
    
    def test_night_shift_gets_bonus(self):
        """测试: 夜班操作获得更高优先级"""
        request = create_test_request(
            operations=[
                OperationData(
                    id=1, batch_id=1, operation_name="日班操作",
                    required_people=1,
                    planned_start="2025-01-15T09:00:00",  # 上午9点
                    planned_end="2025-01-15T12:00:00",
                    duration_minutes=180,
                ),
                OperationData(
                    id=2, batch_id=1, operation_name="夜班操作",
                    required_people=1,
                    planned_start="2025-01-15T22:00:00",  # 晚上10点
                    planned_end="2025-01-16T06:00:00",
                    duration_minutes=480,
                ),
            ],
        )
        
        context = SolverContext.from_request(request)
        
        priority_obj = SmartPriorityObjective(
            night_shift_bonus=5000,
            peak_day_bonus=3000,
            normal_bonus=1000,
        )
        
        bonuses = priority_obj.calculate_priorities(context)
        
        # 日班应为常规加成
        self.assertEqual(bonuses[1], 1000, "日班应为常规加成")
        
        # 夜班应为高加成
        self.assertEqual(bonuses[2], 5000, "夜班应为高加成")
        
        print("✅ 智能优先级: 夜班获得更高加成")
    
    def test_peak_day_identification(self):
        """测试: 高峰日识别"""
        request = create_test_request(
            operations=[
                OperationData(id=1, batch_id=1, operation_name="Op1",
                             required_people=5, planned_start="2025-01-15T09:00:00",
                             planned_end="2025-01-15T17:00:00", duration_minutes=480),
                OperationData(id=2, batch_id=1, operation_name="Op2",
                             required_people=1, planned_start="2025-01-16T09:00:00",
                             planned_end="2025-01-16T17:00:00", duration_minutes=480),
                OperationData(id=3, batch_id=1, operation_name="Op3",
                             required_people=1, planned_start="2025-01-17T09:00:00",
                             planned_end="2025-01-17T17:00:00", duration_minutes=480),
                OperationData(id=4, batch_id=1, operation_name="Op4",
                             required_people=1, planned_start="2025-01-18T09:00:00",
                             planned_end="2025-01-18T17:00:00", duration_minutes=480),
            ],
        )
        
        context = SolverContext.from_request(request)
        
        priority_obj = SmartPriorityObjective()
        peak_days = priority_obj.identify_peak_days(context, threshold_percentile=0.75)
        
        # 1月15日需求5人，应被识别为高峰日
        self.assertIn("2025-01-15", peak_days, "1月15日应为高峰日")
        
        print("✅ 智能优先级: 高峰日识别成功")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 3A 目标函数与智能优先级验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestObjectiveBuilder))
    suite.addTests(loader.loadTestsFromTestCase(TestS1SkipPenalty))
    suite.addTests(loader.loadTestsFromTestCase(TestSmartPriority))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
