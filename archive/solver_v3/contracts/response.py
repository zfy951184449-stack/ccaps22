"""
V3 求解器响应数据契约

定义求解器输出的标准格式。
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum


class SolverStatus(Enum):
    """求解状态"""
    OPTIMAL = "OPTIMAL"           # 找到最优解
    FEASIBLE = "FEASIBLE"         # 找到可行解
    INFEASIBLE = "INFEASIBLE"     # 无可行解
    TIMEOUT = "TIMEOUT"           # 超时
    ABORTED = "ABORTED"           # 用户中止
    ERROR = "ERROR"               # 求解出错
    MOCK = "MOCK"                 # 模拟响应 (开发阶段)


@dataclass
class AssignmentResult:
    """分配结果"""
    operation_id: int
    position_number: int
    employee_id: int
    employee_name: str
    shift_plan_id: Optional[int] = None


@dataclass
class ShiftPlanResult:
    """班次计划结果"""
    id: Optional[int] = None
    employee_id: int = 0
    plan_date: str = ""           # YYYY-MM-DD
    shift_id: int = 0
    shift_code: str = ""
    plan_hours: float = 0.0
    plan_type: str = "WORK"       # WORK, REST, UNAVAILABLE


@dataclass
class ViolationDetail:
    """约束违规详情"""
    constraint_id: str            # H1, S5, F1 等
    constraint_name: str          # 中文名称
    severity: str                 # HARD (无解原因), SOFT (扣分原因)
    description: str              # 具体描述
    affected_employees: List[int] = field(default_factory=list)
    affected_operations: List[int] = field(default_factory=list)
    affected_dates: List[str] = field(default_factory=list)
    penalty_score: int = 0


@dataclass
class FairnessMetrics:
    """公平性指标"""
    night_shift_range: int = 0    # 夜班数量极差
    day_shift_range: int = 0      # 长白班数量极差
    operation_hours_range: float = 0.0  # 操作工时极差
    night_shift_distribution: Dict[int, int] = field(default_factory=dict)  # 员工ID -> 夜班数


@dataclass
class SolverDiagnostics:
    """求解诊断信息"""
    solver_version: str = "3.0.0"
    solve_time_seconds: float = 0.0
    solutions_found: int = 0
    best_objective: Optional[float] = None
    
    # 输入统计
    operations_count: int = 0
    employees_count: int = 0
    share_groups_count: int = 0
    
    # 输出统计
    assignments_count: int = 0
    shift_plans_count: int = 0
    unassigned_positions_count: int = 0
    
    # 公平性
    fairness: Optional[FairnessMetrics] = None
    
    # 违规详情
    violations: List[ViolationDetail] = field(default_factory=list)
    
    # 搜索统计
    search_branches: int = 0
    pruned_branches: int = 0


@dataclass
class SolverResponse:
    """
    V3 求解器响应
    
    包含求解结果的所有输出数据。
    """
    # 状态
    status: str = "MOCK"
    message: str = ""
    
    # 核心结果
    assignments: List[AssignmentResult] = field(default_factory=list)
    shift_plans: List[ShiftPlanResult] = field(default_factory=list)
    
    # 诊断信息
    diagnostics: SolverDiagnostics = field(default_factory=SolverDiagnostics)
    
    # 元数据
    run_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "status": self.status,
            "message": self.message,
            "assignments": [
                {
                    "operation_id": a.operation_id,
                    "position_number": a.position_number,
                    "employee_id": a.employee_id,
                    "employee_name": a.employee_name,
                    "shift_plan_id": a.shift_plan_id,
                }
                for a in self.assignments
            ],
            "shift_plans": [
                {
                    "id": sp.id,
                    "employee_id": sp.employee_id,
                    "plan_date": sp.plan_date,
                    "shift_id": sp.shift_id,
                    "shift_code": sp.shift_code,
                    "plan_hours": sp.plan_hours,
                    "plan_type": sp.plan_type,
                }
                for sp in self.shift_plans
            ],
            "diagnostics": {
                "solver_version": self.diagnostics.solver_version,
                "solve_time_seconds": self.diagnostics.solve_time_seconds,
                "solutions_found": self.diagnostics.solutions_found,
                "best_objective": self.diagnostics.best_objective,
                "operations_count": self.diagnostics.operations_count,
                "employees_count": self.diagnostics.employees_count,
                "assignments_count": self.diagnostics.assignments_count,
                "shift_plans_count": self.diagnostics.shift_plans_count,
                "unassigned_positions_count": self.diagnostics.unassigned_positions_count,
                "violations": [
                    {
                        "constraint_id": v.constraint_id,
                        "constraint_name": v.constraint_name,
                        "severity": v.severity,
                        "description": v.description,
                        "affected_employees": v.affected_employees,
                        "affected_operations": v.affected_operations,
                        "affected_dates": v.affected_dates,
                        "penalty_score": v.penalty_score,
                    }
                    for v in self.diagnostics.violations
                ],
            },
            "run_id": self.run_id,
        }
    
    @classmethod
    def error(cls, message: str, run_id: Optional[str] = None) -> 'SolverResponse':
        """创建错误响应"""
        return cls(
            status=SolverStatus.ERROR.value,
            message=message,
            run_id=run_id,
        )
    
    @classmethod
    def mock(cls, operations_count: int = 0, employees_count: int = 0) -> 'SolverResponse':
        """创建模拟响应 (开发阶段)"""
        return cls(
            status=SolverStatus.MOCK.value,
            message="V3 求解器模拟响应",
            diagnostics=SolverDiagnostics(
                operations_count=operations_count,
                employees_count=employees_count,
            ),
        )
