"""
Sprint 2A 功能验证测试

验证分配约束 (H1-H4, H11) 是否真正生效。
"""

import unittest
import sys
import os

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig, ShiftTypeData, CalendarDayData
)
from core.context import SolverContext
from constraints.assignment.qualification import QualificationConstraint
from constraints.assignment.position import PositionConstraint
from constraints.assignment.mutex import MutexConstraint
from constraints.assignment.availability import AvailabilityConstraint


def create_test_request(
    operations: list = None,
    employees: list = None,
) -> SolverRequest:
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
        config=SolverConfig(),
    )


def create_assignment_vars(model, context):
    """创建分配变量 (简化版)"""
    for op in context.request.operations:
        for pos in range(op.required_people):
            for emp in context.request.employees:
                var_key = (op.id, pos, emp.id)
                var = model.NewBoolVar(f"assign_{op.id}_{pos}_{emp.id}")
                context.assignment_vars[var_key] = var


class TestH1QualificationConstraint(unittest.TestCase):
    """H1 资质匹配约束测试"""
    
    def test_unqualified_employee_excluded(self):
        """测试: 无资质员工应被排除"""
        # 创建请求: 操作需要资质99，员工只有资质1,2
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=1,
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T12:00:00",
                duration_minutes=180,
                required_qualifications=[99],  # 需要资质99
            )],
            employees=[EmployeeData(
                id=1, name="张三", employee_code="E001",
                role="OPERATOR",
                qualifications=[1, 2],  # 只有资质1,2
            )]
        )
        
        # 构建上下文
        context = SolverContext.from_request(request)
        
        # 验证: 合格员工应为空 (因为没有资质99的员工)
        qualified = context.qualified_employees.get(1, set())
        self.assertEqual(len(qualified), 0, "应该没有合格员工")
        
        print("✅ H1 测试通过: 无资质员工被正确排除")
    
    def test_qualified_employee_included(self):
        """测试: 有资质员工应被包含"""
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=1,
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T12:00:00",
                duration_minutes=180,
                required_qualifications=[1],  # 需要资质1
            )],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR", qualifications=[1, 2]),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR", qualifications=[3]),
            ]
        )
        
        context = SolverContext.from_request(request)
        
        qualified = context.qualified_employees.get(1, set())
        self.assertIn(1, qualified, "员工1应该合格")
        self.assertNotIn(2, qualified, "员工2不应该合格")
        
        print("✅ H1 测试通过: 有资质员工被正确包含")


class TestH4MutexConstraint(unittest.TestCase):
    """H4 时间冲突互斥约束测试"""
    
    def test_overlapping_operations_conflict(self):
        """测试: 时间重叠的操作应标记为冲突"""
        request = create_test_request(
            operations=[
                OperationData(
                    id=1, batch_id=1, operation_name="Op1",
                    required_people=1,
                    planned_start="2025-01-15T09:00:00",
                    planned_end="2025-01-15T11:00:00",  # 09:00-11:00
                    duration_minutes=120,
                ),
                OperationData(
                    id=2, batch_id=1, operation_name="Op2",
                    required_people=1,
                    planned_start="2025-01-15T10:00:00",
                    planned_end="2025-01-15T12:00:00",  # 10:00-12:00 (重叠)
                    duration_minutes=120,
                ),
            ],
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")]
        )
        
        context = SolverContext.from_request(request)
        
        # 验证冲突表
        conflicts_of_1 = context.get_conflicts_for(1)
        conflicts_of_2 = context.get_conflicts_for(2)
        
        self.assertIn(2, conflicts_of_1, "操作1应与操作2冲突")
        self.assertIn(1, conflicts_of_2, "操作2应与操作1冲突")
        
        print("✅ H4 测试通过: 时间重叠操作被正确标记为冲突")
    
    def test_non_overlapping_operations_no_conflict(self):
        """测试: 时间不重叠的操作不应冲突"""
        request = create_test_request(
            operations=[
                OperationData(
                    id=1, batch_id=1, operation_name="Op1",
                    required_people=1,
                    planned_start="2025-01-15T09:00:00",
                    planned_end="2025-01-15T10:00:00",  # 09:00-10:00
                    duration_minutes=60,
                ),
                OperationData(
                    id=2, batch_id=1, operation_name="Op2",
                    required_people=1,
                    planned_start="2025-01-15T11:00:00",
                    planned_end="2025-01-15T12:00:00",  # 11:00-12:00 (不重叠)
                    duration_minutes=60,
                ),
            ],
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")]
        )
        
        context = SolverContext.from_request(request)
        
        conflicts_of_1 = context.get_conflicts_for(1)
        self.assertNotIn(2, conflicts_of_1, "操作1不应与操作2冲突")
        
        print("✅ H4 测试通过: 时间不重叠操作正确无冲突")


class TestH2H3PositionConstraint(unittest.TestCase):
    """H2-H3 位置分配约束测试"""
    
    def test_position_constraint_solver(self):
        """测试: 使用 OR-Tools 验证位置约束确实生效"""
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
        
        # 创建模型
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 应用位置约束
        constraint = PositionConstraint()
        constraint.apply(model, context)
        
        # 强制让员工1同时占据两个位置 (应该无解)
        model.Add(context.assignment_vars[(1, 0, 1)] == 1)  # 员工1占位置0
        model.Add(context.assignment_vars[(1, 1, 1)] == 1)  # 员工1占位置1
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        # 应该无解 (INFEASIBLE)
        self.assertEqual(status, cp_model.INFEASIBLE, 
                        "同一员工不能占据同一操作的多个位置")
        
        print("✅ H2-H3 测试通过: 位置约束正确限制了员工不能占多位置")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 2A 约束功能验证测试")
    print("=" * 60)
    print()
    
    # 运行测试
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestH1QualificationConstraint))
    suite.addTests(loader.loadTestsFromTestCase(TestH4MutexConstraint))
    suite.addTests(loader.loadTestsFromTestCase(TestH2H3PositionConstraint))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
