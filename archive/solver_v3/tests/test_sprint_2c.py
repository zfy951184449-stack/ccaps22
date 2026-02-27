"""
Sprint 2C 功能验证测试

验证容量约束 (H8-H9) 和共享组约束 (H10) 是否真正生效。
"""

import unittest
import sys
import os

# 添加 solver_v3 到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model
from contracts.request import (
    SolverRequest, OperationData, EmployeeData, 
    SolverConfig, ShareGroupData, BoundaryStateData
)
from core.context import SolverContext
from constraints.capacity.monthly_hours import MonthlyHoursConstraint
from constraints.assignment.sharing import SharingConstraint


def create_test_request(operations=None, employees=None, share_groups=None, boundary_states=None):
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
        share_groups=share_groups or [],
        boundary_states=boundary_states or [],
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


class TestH8H9MonthlyHoursConstraint(unittest.TestCase):
    """H8-H9 月度工时约束测试"""
    
    def test_hours_within_limit_feasible(self):
        """测试: 工时在限制内应有解"""
        # 创建一个8小时的操作
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=1,
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T17:00:00",
                duration_minutes=480,  # 8小时
            )],
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 应用月度工时约束 (max 192h)
        constraint = MonthlyHoursConstraint(standard_hours=160, upper_offset=32)
        constraint.apply(model, context)
        
        # 强制分配
        model.Add(context.assignment_vars[(1, 0, 1)] == 1)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE],
                     "工时在限制内应有解")
        
        print("✅ H8-H9 测试通过: 工时在限制内有解")
    
    def test_hours_exceed_limit_infeasible(self):
        """测试: 累计工时超过上限应无解"""
        request = create_test_request(
            operations=[OperationData(
                id=1, batch_id=1, operation_name="Test",
                required_people=1,
                planned_start="2025-01-15T09:00:00",
                planned_end="2025-01-15T17:00:00",
                duration_minutes=480,  # 8小时
            )],
            employees=[EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR")],
            boundary_states=[BoundaryStateData(
                employee_id=1,
                accumulated_hours=190.0,  # 已累计190小时
            )]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 应用月度工时约束 (max 192h)
        constraint = MonthlyHoursConstraint(standard_hours=160, upper_offset=32)
        constraint.apply(model, context)
        
        # 强制分配 (190 + 8 = 198 > 192)
        model.Add(context.assignment_vars[(1, 0, 1)] == 1)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertEqual(status, cp_model.INFEASIBLE,
                        "累计工时超过上限应无解")
        
        print("✅ H8-H9 测试通过: 超出工时上限正确返回无解")


class TestH10SharingConstraint(unittest.TestCase):
    """H10 共享组一致性约束测试"""
    
    def test_subset_rule_enforced(self):
        """测试: 共享组子集规则应生效"""
        # 创建两个操作，一个需要2人，一个需要1人
        request = create_test_request(
            operations=[
                OperationData(
                    id=1, batch_id=1, operation_name="主操作",
                    required_people=2,  # 需要2人
                    planned_start="2025-01-15T09:00:00",
                    planned_end="2025-01-15T12:00:00",
                    duration_minutes=180,
                ),
                OperationData(
                    id=2, batch_id=1, operation_name="子操作",
                    required_people=1,  # 需要1人
                    planned_start="2025-01-15T14:00:00",
                    planned_end="2025-01-15T17:00:00",
                    duration_minutes=180,
                ),
            ],
            employees=[
                EmployeeData(id=1, name="张三", employee_code="E001", role="OPERATOR"),
                EmployeeData(id=2, name="李四", employee_code="E002", role="OPERATOR"),
                EmployeeData(id=3, name="王五", employee_code="E003", role="OPERATOR"),
            ],
            share_groups=[
                ShareGroupData(id=1, group_name="测试组", group_type="SAME_TEAM", 
                              operation_ids=[1, 2])
            ]
        )
        
        context = SolverContext.from_request(request)
        model = cp_model.CpModel()
        create_assignment_vars(model, context)
        
        # 首先应用位置约束，确保每个位置只有一个人
        from constraints.assignment.position import PositionConstraint
        position_constraint = PositionConstraint()
        position_constraint.apply(model, context)
        
        # 应用共享组约束
        constraint = SharingConstraint()
        constraint.apply(model, context)
        
        # 强制子操作分配给员工3（不在主操作的候选中）
        # 主操作强制员工1和2，子操作强制员工3
        model.Add(context.assignment_vars[(1, 0, 1)] == 1)  # 主操作位置0 = 员工1
        model.Add(context.assignment_vars[(1, 1, 2)] == 1)  # 主操作位置1 = 员工2
        model.Add(context.assignment_vars[(2, 0, 3)] == 1)  # 子操作 = 员工3 (违反子集规则)
        
        # 禁止员工3在主操作中
        model.Add(context.assignment_vars[(1, 0, 3)] == 0)
        model.Add(context.assignment_vars[(1, 1, 3)] == 0)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        # 子操作分配给不在主操作中的员工应无解
        self.assertEqual(status, cp_model.INFEASIBLE,
                        "违反子集规则应无解")
        
        print("✅ H10 测试通过: 共享组子集规则正确生效")
    
    def test_subset_rule_valid_assignment(self):
        """测试: 符合子集规则的分配应有解"""
        request = create_test_request(
            operations=[
                OperationData(
                    id=1, batch_id=1, operation_name="主操作",
                    required_people=2,
                    planned_start="2025-01-15T09:00:00",
                    planned_end="2025-01-15T12:00:00",
                    duration_minutes=180,
                ),
                OperationData(
                    id=2, batch_id=1, operation_name="子操作",
                    required_people=1,
                    planned_start="2025-01-15T14:00:00",
                    planned_end="2025-01-15T17:00:00",
                    duration_minutes=180,
                ),
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
        
        constraint = SharingConstraint()
        constraint.apply(model, context)
        
        # 子操作分配给主操作中的员工
        model.Add(context.assignment_vars[(1, 0, 1)] == 1)  # 主操作 = 员工1
        model.Add(context.assignment_vars[(1, 1, 2)] == 1)  # 主操作 = 员工2
        model.Add(context.assignment_vars[(2, 0, 1)] == 1)  # 子操作 = 员工1 (满足子集规则)
        
        solver = cp_model.CpSolver()
        status = solver.Solve(model)
        
        self.assertIn(status, [cp_model.OPTIMAL, cp_model.FEASIBLE],
                     "符合子集规则应有解")
        
        print("✅ H10 测试通过: 符合子集规则的分配有解")


class TestConstraintRegistry(unittest.TestCase):
    """约束注册表测试"""
    
    def test_all_sprint2c_constraints_registered(self):
        """测试: 所有 Sprint 2C 约束应被注册"""
        from constraints import load_all_constraints, CONSTRAINT_REGISTRY
        
        load_all_constraints()
        
        self.assertIn("H8-H9", CONSTRAINT_REGISTRY, "H8-H9 应被注册")
        self.assertIn("H10", CONSTRAINT_REGISTRY, "H10 应被注册")
        
        print(f"✅ 约束注册表: 已注册 {len(CONSTRAINT_REGISTRY)} 个约束")
        print(f"   约束列表: {list(CONSTRAINT_REGISTRY.keys())}")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 2C 容量约束与共享组功能验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestH8H9MonthlyHoursConstraint))
    suite.addTests(loader.loadTestsFromTestCase(TestH10SharingConstraint))
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
