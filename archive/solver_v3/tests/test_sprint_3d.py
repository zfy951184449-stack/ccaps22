"""
Sprint 3D 功能验证测试

验证字典序优化和完整求解流程。
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
from objectives.lexicographic import LexicographicOptimizer, SimpleWeightedOptimizer


def create_test_request(operations=None, employees=None):
    """创建测试请求"""
    return SolverRequest(
        operations=operations or [],
        employees=employees or [],
        config=SolverConfig(),
    )


class TestLexicographicOptimizer(unittest.TestCase):
    """字典序优化器测试"""
    
    def test_optimizer_initialization(self):
        """测试: LexicographicOptimizer 可实例化"""
        optimizer = LexicographicOptimizer()
        
        self.assertEqual(optimizer.PRIORITIES, ["P1", "P2", "P3"])
        self.assertIn("P1", optimizer.phase_time_limits)
        
        print("✅ LexicographicOptimizer 可实例化")
    
    def test_simple_weighted_optimizer(self):
        """测试: SimpleWeightedOptimizer 可实例化"""
        optimizer = SimpleWeightedOptimizer()
        self.assertIsNotNone(optimizer)
        
        print("✅ SimpleWeightedOptimizer 可实例化")


class TestFullSolverPipeline(unittest.TestCase):
    """完整求解流程测试"""
    
    def test_engine_solve_mock_request(self):
        """测试: 引擎可执行完整求解流程"""
        from core.engine import SolverEngine
        
        engine = SolverEngine()
        
        # 创建简单测试数据
        request_data = {
            "operations": [
                {
                    "id": 1,
                    "batch_id": 1,
                    "operation_name": "测试操作",
                    "required_people": 1,
                    "planned_start": "2025-01-15T09:00:00",
                    "planned_end": "2025-01-15T17:00:00",
                    "duration_minutes": 480,
                }
            ],
            "employees": [
                {
                    "id": 1,
                    "name": "张三",
                    "employee_code": "E001",
                    "role": "OPERATOR",
                }
            ],
            "config": {
                "solver_time_limit_seconds": 30,
            }
        }
        
        response = engine.solve(request_data)
        
        self.assertIn(response.status, ["OPTIMAL", "FEASIBLE"])
        self.assertEqual(len(response.assignments), 1)
        self.assertEqual(response.assignments[0].employee_id, 1)
        
        print(f"✅ 完整求解流程: 状态={response.status}, 分配数={len(response.assignments)}")
    
    def test_multiple_operations_balanced(self):
        """测试: 多操作均衡分配"""
        from core.engine import SolverEngine
        
        engine = SolverEngine()
        
        # 4个操作，2个员工
        request_data = {
            "operations": [
                {
                    "id": i,
                    "batch_id": 1,
                    "operation_name": f"Op{i}",
                    "required_people": 1,
                    "planned_start": f"2025-01-{15+i:02d}T09:00:00",
                    "planned_end": f"2025-01-{15+i:02d}T17:00:00",
                    "duration_minutes": 480,
                }
                for i in range(1, 5)
            ],
            "employees": [
                {"id": 1, "name": "张三", "employee_code": "E001", "role": "OPERATOR"},
                {"id": 2, "name": "李四", "employee_code": "E002", "role": "OPERATOR"},
            ],
            "config": {"solver_time_limit_seconds": 30}
        }
        
        response = engine.solve(request_data)
        
        self.assertIn(response.status, ["OPTIMAL", "FEASIBLE"])
        self.assertEqual(len(response.assignments), 4)
        
        # 检查分配是否均衡
        emp1_count = sum(1 for a in response.assignments if a.employee_id == 1)
        emp2_count = sum(1 for a in response.assignments if a.employee_id == 2)
        
        # 公平性约束应使分配均衡
        self.assertLessEqual(abs(emp1_count - emp2_count), 2)
        
        print(f"✅ 均衡分配: 员工1={emp1_count}, 员工2={emp2_count}")


class TestConstraintCounts(unittest.TestCase):
    """约束统计测试"""
    
    def test_all_constraints_registered(self):
        """测试: 所有约束已注册"""
        from constraints import load_all_constraints, CONSTRAINT_REGISTRY
        from constraints.soft import SOFT_CONSTRAINT_REGISTRY
        
        load_all_constraints()
        
        # 硬约束
        expected_hard = {"H1", "H2-H3", "H4", "H5", "H6", "H7", "H8-H9", "H10", "H11"}
        registered_hard = set(CONSTRAINT_REGISTRY.keys())
        
        self.assertTrue(expected_hard.issubset(registered_hard),
                       f"缺少硬约束: {expected_hard - registered_hard}")
        
        # 软约束
        expected_soft = {"S5", "S6", "S7", "S8", "S9"}
        registered_soft = set(SOFT_CONSTRAINT_REGISTRY.keys())
        
        self.assertEqual(expected_soft, registered_soft)
        
        print(f"✅ 硬约束: {len(CONSTRAINT_REGISTRY)} 个")
        print(f"✅ 软约束: {len(SOFT_CONSTRAINT_REGISTRY)} 个")


if __name__ == '__main__':
    print("=" * 60)
    print("Sprint 3D 字典序优化与完整流程验证测试")
    print("=" * 60)
    print()
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestLexicographicOptimizer))
    suite.addTests(loader.loadTestsFromTestCase(TestFullSolverPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestConstraintCounts))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    if result.wasSuccessful():
        print("🎉 所有测试通过!")
    else:
        print(f"❌ {len(result.failures)} 个测试失败")
    print("=" * 60)
