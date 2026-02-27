"""
Sprint 3C 功能验证测试

验证其他软约束 S5-S9 是否真正生效。
"""

import unittest
import sys
import os

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig, ShareGroupData
)
from core.context import SolverContext
from objectives.builder import ObjectiveBuilder
from constraints.soft import SOFT_CONSTRAINT_REGISTRY
from constraints.soft.share_group_cross_day import ShareGroupCrossDayPenalty
from constraints.soft.non_workday import NonWorkdayPenalty
from constraints.soft.supervisor_night import SupervisorNightPenalty


def create_test_request(operations=None, employees=None, share_groups=None):
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
        share_groups=share_groups or [],
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


class TestSoftConstraintRegistry(unittest.TestCase):
    """软约束注册表测试"""
    
    def test_all_soft_constraints_registered(self):
        """测试: 所有 S5-S9 软约束应被注册"""
        self.assertIn("S5", SOFT_CONSTRAINT_REGISTRY)
        self.assertIn("S6", SOFT_CONSTRAINT_REGISTRY)
        self.assertIn("S7", SOFT_CONSTRAINT_REGISTRY)
        self.assertIn("S8", SOFT_CONSTRAINT_REGISTRY)
        self.assertIn("S9", SOFT_CONSTRAINT_REGISTRY)
        
        print(f"✅ 软约束注册表: {len(SOFT_CONSTRAINT_REGISTRY)} 个约束")


class TestS5ShareGroupCrossDay(unittest.TestCase):
    """S5 共享组跨天惩罚测试"""
    
    def test_cross_day_penalty_applies(self):
        """测试: 共享组跨天换人产生惩罚"""
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
            ],
            share_groups=[
                ShareGroupData(id=1, group_name="测试组", group_type="SAME_TEAM",
                              operation_ids=[1, 2])
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        penalty = ShareGroupCrossDayPenalty()
        penalty.apply(model, context, builder)
        
        # 应该有惩罚项
        self.assertGreater(builder.stats.total_terms, 0)
        
        print(f"✅ S5 共享组跨天惩罚: {builder.stats.total_terms} 个惩罚项")


class TestS9SupervisorNight(unittest.TestCase):
    """S9 主管夜班惩罚测试"""
    
    def test_supervisor_night_penalty(self):
        """测试: 主管夜班产生惩罚"""
        request = create_test_request(
            operations=[
                OperationData(id=1, batch_id=1, operation_name="夜班操作",
                             required_people=1,
                             planned_start="2025-01-15T22:00:00",  # 晚上10点
                             planned_end="2025-01-16T06:00:00",
                             duration_minutes=480),
            ],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="SUPERVISOR"),  # 主管
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),    # 普通员工
            ],
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        builder = ObjectiveBuilder()
        penalty = SupervisorNightPenalty()
        penalty.apply(model, context, builder)
        
        # 只有主管的夜班分配有惩罚
        self.assertEqual(builder.stats.total_terms, 1, "只有主管夜班应有惩罚")
        
        print("✅ S9 主管夜班惩罚: 只对主管应用惩罚")


class TestSoftConstraintsOptimization(unittest.TestCase):
    """软约束优化测试"""
    
    def test_avoids_soft_violations_when_possible(self):
        """测试: 求解器应尽量避免软约束违规"""
        request = create_test_request(
            operations=[
                OperationData(id=1, batch_id=1, operation_name="夜班",
                             required_people=1,
                             planned_start="2025-01-15T22:00:00",
                             planned_end="2025-01-16T06:00:00",
                             duration_minutes=480),
            ],
            employees=[
                EmployeeData(id=1, name="主管", employee_code="E001", role="SUPERVISOR"),
                EmployeeData(id=2, name="普通", employee_code="E002", role="OPERATOR"),
            ],
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 位置约束
        from constraints.assignment.position import PositionConstraint
        PositionConstraint().apply(model, context)
        
        builder = ObjectiveBuilder()
        
        # 跳过惩罚
        from objectives.skip_penalty import SkipPenaltyObjective
        SkipPenaltyObjective().apply(model, context, builder)
        
        # 主管夜班惩罚
        SupervisorNightPenalty().apply(model, context, builder)
        
        builder.minimize(model)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE])
        
        # 应该选择普通员工而非主管
        supervisor_assigned = solver.Value(context.assignment_vars[(1, 0, 1)])
        operator_assigned = solver.Value(context.assignment_vars[(1, 0, 2)])
        
        # 求解器应该选择普通员工以避免主管夜班惩罚
        self.assertEqual(supervisor_assigned, 0, "应避免分配主管")
        self.assertEqual(operator_assigned, 1, "应分配普通员工")
        
        print("✅ 求解器正确避免软约束违规 (选择普通员工而非主管)")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 3C 其他软约束验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestSoftConstraintRegistry))
    suite.addTests(loader.loadTestsFromTestCase(TestS5ShareGroupCrossDay))
    suite.addTests(loader.loadTestsFromTestCase(TestS9SupervisorNight))
    suite.addTests(loader.loadTestsFromTestCase(TestSoftConstraintsOptimization))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
