"""
V3 求解器引擎

核心求解入口，协调约束加载、模型构建、求解执行和结果生成。
"""

from typing import Dict, Any, Optional, List
import time

from ortools.sat.python import cp_model

from contracts.request import SolverRequest
from contracts.response import SolverResponse, SolverDiagnostics, SolverStatus, AssignmentResult
from core.context import SolverContext
from core.solver_config import SolverConfig, DEFAULT_SOLVER_CONFIG
from utils.logger import logger, info, debug, warning, error


class SolverEngine:
    """
    V3 求解器引擎
    
    职责:
    1. 接收请求并解析
    2. 构建上下文 (预处理)
    3. 加载并应用约束
    4. 执行求解
    5. 构建并返回响应
    """
    
    def __init__(self):
        self.context: Optional[SolverContext] = None
        self.model: Optional[cp_model.CpModel] = None
        self.solver: Optional[cp_model.CpSolver] = None
        self.builder = None  # ObjectiveBuilder
        
    def solve(self, request_data: Dict[str, Any]) -> SolverResponse:
        """
        执行求解流程
        
        Args:
            request_data: 请求数据字典
            
        Returns:
            SolverResponse: 求解响应
        """
        start_time = time.time()
        
        try:
            # 1. 解析请求
            info("=" * 50)
            info("V3 求解器开始处理请求")
            info("=" * 50)
            
            request = self._parse_request(request_data)
            
            # 2. 构建上下文
            info("构建求解上下文...")
            self.context = SolverContext.from_request(request)
            
            # 3. 检查输入有效性
            if not self._validate_input():
                return SolverResponse.error("输入数据无效")
            
            # 4. 构建模型
            info("构建约束模型...")
            self._build_model()
            
            # 5. 执行求解
            info("执行求解...")
            solve_result = self._execute_solve()
            
            # 6. 构建响应
            info("构建响应...")
            response = self._build_response(solve_result, time.time() - start_time)
            
            info(f"求解完成，耗时 {time.time() - start_time:.2f}s")
            info("=" * 50)
            
            return response
            
        except Exception as e:
            error(f"求解过程出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return SolverResponse.error(f"求解出错: {str(e)}")
    
    def _parse_request(self, request_data: Dict[str, Any]) -> SolverRequest:
        """解析请求数据"""
        request = SolverRequest.from_dict(request_data)
        
        info(f"解析请求:")
        info(f"  - 操作数: {len(request.operations)}")
        info(f"  - 员工数: {len(request.employees)}")
        info(f"  - 共享组数: {len(request.share_groups)}")
        info(f"  - 日历天数: {len(request.calendar_days)}")
        
        return request
    
    def _validate_input(self) -> bool:
        """验证输入数据"""
        if not self.context.request.operations:
            warning("没有操作需要求解")
            return True
            
        if not self.context.request.employees:
            warning("没有可用员工")
            return True
            
        return True
    
    def _build_model(self):
        """构建 OR-Tools CP-SAT 模型"""
        self.model = cp_model.CpModel()
        
        # 1. 创建分配变量
        info("创建分配变量...")
        self._create_assignment_vars()
        
        # 2. 加载硬约束
        info("加载硬约束...")
        self._apply_hard_constraints()
        
        # 3. 创建目标函数
        info("创建目标函数...")
        self._build_objectives()
    
    def _create_assignment_vars(self):
        """创建分配变量"""
        for op in self.context.request.operations:
            for pos in range(op.required_people):
                for emp in self.context.request.employees:
                    var_key = (op.id, pos, emp.id)
                    var = self.model.NewBoolVar(f"assign_{op.id}_{pos}_{emp.id}")
                    self.context.assignment_vars[var_key] = var
        
        debug(f"创建 {len(self.context.assignment_vars)} 个分配变量")
    
    def _apply_hard_constraints(self):
        """应用所有硬约束"""
        from constraints import load_all_constraints, CONSTRAINT_REGISTRY
        
        load_all_constraints()
        
        for constraint_id, constraint_class in CONSTRAINT_REGISTRY.items():
            try:
                constraint = constraint_class()
                constraint.apply(self.model, self.context)
            except Exception as e:
                warning(f"约束 {constraint_id} 应用失败: {e}")
    
    def _build_objectives(self):
        """构建目标函数"""
        from objectives import (
            ObjectiveBuilder, 
            SkipPenaltyObjective, 
            SmartPriorityObjective,
            FairnessObjective,
        )
        
        self.builder = ObjectiveBuilder()
        
        # S1: 缺员惩罚 + 智能优先级
        priority_obj = SmartPriorityObjective()
        peak_days = priority_obj.identify_peak_days(self.context)
        bonuses = priority_obj.calculate_priorities(self.context, peak_days)
        
        skip_obj = SkipPenaltyObjective()
        skip_obj.apply(self.model, self.context, self.builder, bonuses)
        
        # F1-F4: 公平性
        fairness_obj = FairnessObjective()
        fairness_obj.apply(self.model, self.context, self.builder)
        
        # 设置最小化目标
        self.builder.minimize(self.model)
    
    def _execute_solve(self) -> Dict[str, Any]:
        """执行求解"""
        from core.progress_callback import SolutionCallback, ProgressTracker
        
        self.solver = cp_model.CpSolver()
        
        # 从请求配置或使用默认配置
        solver_config = self._get_solver_config()
        
        # 应用求解器参数
        self.solver.parameters.max_time_in_seconds = solver_config.time_limit_seconds
        self.solver.parameters.num_search_workers = solver_config.get_effective_threads()
        self.solver.parameters.log_search_progress = solver_config.log_level in ('PROGRESS', 'DETAILED')
        
        info(f"求解配置: 时间限制={solver_config.time_limit_seconds}s, 线程数={solver_config.get_effective_threads()}, 对称性破缺={solver_config.enable_symmetry_breaking}")
        
        # 应用对称性破缺
        if solver_config.enable_symmetry_breaking:
            self._apply_symmetry_breaking()
        
        # 创建进度追踪器
        run_id = getattr(self.context.request, 'run_id', None)
        progress_tracker = ProgressTracker(run_id=run_id, db_writer=self._write_progress_to_db)
        
        # 创建取消检查器
        def cancel_checker():
            return self._check_cancel_flag(run_id)
        
        # 创建解回调
        solution_callback = SolutionCallback(
            cancel_checker=cancel_checker if run_id else None,
            progress_reporter=progress_tracker.update,
            assignment_vars=self.context.assignment_vars,
            context=self.context,
        )
        
        # 求解 (带回调)
        status = self.solver.Solve(self.model, solution_callback)
        
        # 检查是否被取消
        if solution_callback.is_cancelled:
            info("求解被用户取消")
            return {
                "status": "CANCELLED",
                "assignments": self._extract_assignments() if status in [cp_model.OPTIMAL, cp_model.FEASIBLE] else [],
                "shift_plans": [],
                "objective": solution_callback.best_objective or 0,
            }
        
        # 解析状态
        status_map = {
            cp_model.OPTIMAL: SolverStatus.OPTIMAL.value,
            cp_model.FEASIBLE: SolverStatus.FEASIBLE.value,
            cp_model.INFEASIBLE: SolverStatus.INFEASIBLE.value,
            cp_model.MODEL_INVALID: SolverStatus.ERROR.value,
        }
        solver_status = status_map.get(status, SolverStatus.TIMEOUT.value)
        
        # 提取分配结果
        assignments = []
        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            assignments = self._extract_assignments()
        
        return {
            "status": solver_status,
            "assignments": assignments,
            "shift_plans": [],
            "objective": self.solver.ObjectiveValue() if status in [cp_model.OPTIMAL, cp_model.FEASIBLE] else 0,
        }
    
    def _check_cancel_flag(self, run_id: int) -> bool:
        """检查数据库中的取消标志"""
        if not run_id:
            return False
        
        try:
            import pymysql
            import os
            
            conn = pymysql.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                user=os.getenv('DB_USER', 'root'),
                password=os.getenv('DB_PASSWORD', ''),
                database=os.getenv('DB_NAME', 'ccaps'),
                port=int(os.getenv('DB_PORT', 3306)),
            )
            
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT options_json FROM scheduling_runs WHERE id = %s",
                    (run_id,)
                )
                row = cursor.fetchone()
                if row and row[0]:
                    import json
                    options = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                    return options.get('cancel_requested', False)
            
            conn.close()
        except Exception as e:
            debug(f"[取消检查] 检查失败: {e}")
        
        return False
    
    def _write_progress_to_db(self, run_id: int, data: Dict[str, Any]) -> None:
        """将进度写入数据库"""
        try:
            import pymysql
            import os
            import json
            
            conn = pymysql.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                user=os.getenv('DB_USER', 'root'),
                password=os.getenv('DB_PASSWORD', ''),
                database=os.getenv('DB_NAME', 'ccaps'),
                port=int(os.getenv('DB_PORT', 3306)),
            )
            
            # 动态获取进度，如果未提供则默认为 0
            current_progress = data.get('progress', 0)
            
            progress_json = json.dumps({
                "progress": current_progress,
                "best_objective": data.get('best_objective'),
                "metrics": data.get('metrics', {}),
            }, ensure_ascii=False)
            
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE scheduling_runs SET solver_progress = %s WHERE id = %s",
                    (progress_json, run_id)
                )
            conn.commit()
            conn.close()
        except Exception as e:
            debug(f"[进度写入] 写入失败: {e}")
    
    def _extract_assignments(self) -> List[AssignmentResult]:
        """提取分配结果"""
        assignments = []
        
        for (op_id, pos, emp_id), var in self.context.assignment_vars.items():
            if self.solver.Value(var):
                op = self.context.operation_by_id.get(op_id)
                emp = self.context.employee_by_id.get(emp_id)
                
                assignments.append(AssignmentResult(
                    operation_id=op_id,
                    employee_id=emp_id,
                    position_number=pos,
                    employee_name=emp.name if emp else "",
                ))
        
        return assignments
    
    def _build_response(self, solve_result: Dict[str, Any], elapsed_time: float) -> SolverResponse:
        """构建响应"""
        request = self.context.request
        
        diagnostics = SolverDiagnostics(
            solver_version="3.0.0-alpha",
            solve_time_seconds=elapsed_time,
            solutions_found=1 if solve_result.get("status") not in [SolverStatus.INFEASIBLE.value, SolverStatus.ERROR.value] else 0,
            best_objective=solve_result.get("objective"),
            operations_count=len(request.operations),
            employees_count=len(request.employees),
            share_groups_count=len(request.share_groups),
            assignments_count=len(solve_result.get("assignments", [])),
            shift_plans_count=len(solve_result.get("shift_plans", [])),
        )
        
        return SolverResponse(
            status=solve_result.get("status", SolverStatus.ERROR.value),
            message=f"V3 求解完成 (耗时 {elapsed_time:.2f}s)",
            assignments=solve_result.get("assignments", []),
            shift_plans=solve_result.get("shift_plans", []),
            diagnostics=diagnostics,
            run_id=request.run_id,
        )
    
    def _get_solver_config(self) -> SolverConfig:
        """获取求解器配置"""
        # 尝试从请求中提取配置
        if hasattr(self.context.request, 'solver_options') and self.context.request.solver_options:
            return SolverConfig.from_dict(self.context.request.solver_options)
        
        # 使用请求中的基础配置
        config = self.context.request.config
        return SolverConfig(
            time_limit_seconds=config.time_limit_seconds,
            num_threads=0,  # 自动检测
            enable_symmetry_breaking=True,
        )
    
    def _apply_symmetry_breaking(self):
        """应用对称性破缺策略"""
        try:
            from strategies.symmetry import SymmetryBreaking
            
            symmetry = SymmetryBreaking(enabled=True)
            constraints_added = symmetry.apply(self.model, self.context)
            info(f"对称性破缺: 添加 {constraints_added} 个约束")
        except Exception as e:
            warning(f"对称性破缺应用失败: {e}")


# 全局引擎实例
_engine: Optional[SolverEngine] = None


def get_engine() -> SolverEngine:
    """获取求解引擎实例"""
    global _engine
    if _engine is None:
        _engine = SolverEngine()
    return _engine


def solve(request_data: Dict[str, Any]) -> SolverResponse:
    """便捷求解函数"""
    engine = get_engine()
    return engine.solve(request_data)
