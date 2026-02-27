"""
求解器核心

统一的模块化求解器入口。
"""

from __future__ import annotations
import time
import logging
from typing import Dict, Any

from ortools.sat.python import cp_model

from contracts.request import SolverRequest
from contracts.response import SolverResponse, SolverStatus, SolverDiagnostics
from models.context import SolverContext
from models.variables import ModelVariables
from constraints import (
    OperationAssignmentConstraint,
    ShiftConsistencyConstraint,
    MonthlyHoursConstraint,
    ConsecutiveWorkConstraint,
    NightRestConstraint,
    SupervisorConstraint,
    FairnessConstraint,
    # QualificationConstraint 和 SharingConstraint 已合并到 OperationAssignmentConstraint
)
from objectives import ObjectiveBuilder
from constraints.decision_strategy import DecisionStrategyBuilder
from .result_builder import ResultBuilder
from .conflict_detector import ConflictDetector
from .hierarchical_solver import HierarchicalSolver
from .hint_generator import HintGenerator
from .live_logger import LiveLogger, LogLevel, LogCategory

logger = logging.getLogger(__name__)


class SolverCallback(cp_model.CpSolverSolutionCallback):
    """求解器回调
    
    用于跟踪求解进度和实现提前停止。
    """
    
    def __init__(self, improvement_timeout: float = 30.0, progress_callback=None, time_limit: float = 60.0, live_logger: LiveLogger = None):
        super().__init__()
        self._best_objective = None
        self._last_improvement_time = time.time()
        self._start_time = time.time()
        self._improvement_timeout = improvement_timeout
        self._time_limit = time_limit
        self._solutions_found = 0
        self._progress_callback = progress_callback
        self._last_report_time = 0
        self._abort_requested = False  # 外部中断信号
        self._stop_search_called = False  # 追踪是否已调用过 StopSearch
        self._live_logger = live_logger  # 实时日志收集器
    
    def request_abort(self):
        """请求中断求解
        
        设置中断标志并调用 StopSearch()。
        注意：StopSearch() 在回调外部调用时可能不会立即生效，
        solver 需要到达检查点才会响应。
        """
        if self._abort_requested:
            logger.info("[Solver] 中断请求已存在，忽略重复请求")
            return
            
        self._abort_requested = True
        logger.info("[Solver] 收到中断请求，正在请求停止搜索...")
        
        # 尝试多次调用 StopSearch 增加成功率
        for i in range(3):
            try:
                self.StopSearch()
                self._stop_search_called = True
                logger.info(f"[Solver] StopSearch() 调用成功 (尝试 {i+1})")
                break
            except Exception as e:
                logger.warning(f"[Solver] StopSearch() 调用失败 (尝试 {i+1}): {e}")
    
    @property
    def abort_requested(self) -> bool:
        return self._abort_requested
    
    def OnSolutionCallback(self):
        self._solutions_found += 1
        obj = self.ObjectiveValue()
        now = time.time()
        
        if self._best_objective is None or obj < self._best_objective:
            self._best_objective = obj
            self._last_improvement_time = now
            logger.info(f"[Solver] 找到更优解: {obj:.0f} (第 {self._solutions_found} 个解)")
        
        # 报告进度（每秒最多一次）
        if self._progress_callback and (now - self._last_report_time) >= 1.0:
            self._last_report_time = now
            self._report_progress()
        
        # 检查1：无改进超时（核心停止条件）
        elapsed_since_improvement = now - self._last_improvement_time
        if elapsed_since_improvement > self._improvement_timeout:
            elapsed_total = now - self._start_time
            logger.info(f"[Solver] {self._improvement_timeout}秒无改进，停止求解 (总耗时: {elapsed_total:.1f}秒)")
            self.StopSearch()
            return
        
        # 检查2：软性时间限制（只在无持续改进时触发）
        # 如果超过时间限制但仍有改进，继续求解
        elapsed_total = now - self._start_time
        if elapsed_total >= self._time_limit:
            # 检查最近是否有改进（_improvement_timeout 的一半时间内）
            recent_improvement = elapsed_since_improvement < (self._improvement_timeout / 2)
            if recent_improvement:
                logger.info(f"[Solver] 超过时间限制但仍在找到更优解，继续求解...")
            else:
                logger.info(f"[Solver] 达到时间限制 {self._time_limit}秒，停止求解")
                self.StopSearch()
                return
        
        # 检查3：外部中断信号
        if self._abort_requested:
            logger.info(f"[Solver] 收到中断信号，停止求解并保留当前最优解")
            self.StopSearch()
    
    def _report_progress(self):
        """报告当前进度"""
        if not self._progress_callback:
            return
        elapsed = self.elapsed_time
        progress = min(100, int((elapsed / self._time_limit) * 100))
        
        # 构建进度数据
        progress_data = {
            "solutions_found": self._solutions_found,
            "best_objective": self._best_objective,
            "elapsed_seconds": round(elapsed, 1),
            "time_limit_seconds": self._time_limit,
            "progress_percent": progress,
            "estimated_remaining": max(0, round(self._time_limit - elapsed, 1)),
        }
        
        # 如果有 LiveLogger，附加日志列表
        if self._live_logger:
            progress_data["logs"] = self._live_logger.get_messages_only()
            progress_data["logs_full"] = self._live_logger.get_logs()
        
        self._progress_callback(progress_data)
    
    @property
    def solutions_found(self) -> int:
        return self._solutions_found
    
    @property
    def best_objective(self):
        return self._best_objective
    
    @property
    def elapsed_time(self) -> float:
        return time.time() - self._start_time


class Solver:
    """模块化求解器
    
    使用 OR-Tools CP-SAT 求解排班问题。
    """
    
    def __init__(self):
        self.model: cp_model.CpModel = None
        self.context: SolverContext = None
        self.variables: ModelVariables = None
        self.cp_solver: cp_model.CpSolver = None
        self.callback: SolverCallback = None  # 保存回调引用，用于外部中断
        self.conflict_report = None  # 冲突检测报告
        self.live_logger: LiveLogger = None  # 实时日志收集器
    
    def solve(self, request: SolverRequest, progress_callback=None) -> SolverResponse:
        """执行求解
        
        Args:
            request: 求解请求
            progress_callback: 进度回调函数，接收进度字典
            
        Returns:
            求解响应
        """
        start_time = time.time()
        
        try:
            # 0. 创建实时日志收集器
            self.live_logger = LiveLogger()
            self.live_logger.solver(f"🚀 开始求解 (request_id={request.request_id})")
            
            # 1. 初始化
            logger.info(f"[Solver] 开始求解 request_id={request.request_id}")
            self._initialize(request)
            
            # 1.5 冲突检测（注入 LiveLogger）
            logger.info("[Solver] 运行约束冲突检测...")
            conflict_detector = ConflictDetector(self.context, live_logger=self.live_logger)
            self.conflict_report = conflict_detector.detect_all()
            
            # 2. 构建约束
            logger.info("[Solver] 构建约束...")
            self._build_constraints()
            
            # 3. 构建目标函数
            logger.info("[Solver] 构建目标函数...")
            self._build_objective()
            
            # 3.5 生成并注入初始解 Hint
            logger.info("[Solver] 生成初始解 Hint...")
            self._inject_solution_hints()
            
            # 4. 构建决策策略
            logger.info("[Solver] 构建决策策略...")
            self._build_decision_strategy()
            
            # 5. 执行求解
            if self.context.config.use_hierarchical_solving:
                # 使用分层求解器
                logger.info("[Solver] 使用分层多目标求解...")
                hierarchical = HierarchicalSolver(self.context)
                return hierarchical.solve(
                    request, 
                    self.model, 
                    self.variables,
                    self.conflict_report,
                )
            else:
                # 使用标准求解
                logger.info("[Solver] 开始 CP-SAT 求解...")
                status, callback = self._run_solver(progress_callback)
            
            # 6. 生成结果
            logger.info(f"[Solver] 求解完成，状态: {status}")
            elapsed = time.time() - start_time
            
            return self._build_response(request, status, callback, elapsed)
            
        except Exception as e:
            logger.exception(f"[Solver] 求解失败: {e}")
            return SolverResponse.create_error(
                request_id=request.request_id,
                message=str(e),
            )
    
    def _initialize(self, request: SolverRequest) -> None:
        """初始化求解器"""
        self.model = cp_model.CpModel()
        self.context = SolverContext.from_request(request)
        self.variables = ModelVariables()
    
    def _build_constraints(self) -> None:
        """构建所有约束（根据配置开关控制模块启用）"""
        config = self.context.config
        constraints = []
        
        # 操作分配模块（整合了资质、共享、时间冲突约束）
        if config.enable_operation_assignment:
            constraints.append(OperationAssignmentConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 操作分配模块已禁用")
        
        # 班次一致性模块（总是启用，因为需要生成班次变量）
        constraints.append(ShiftConsistencyConstraint(self.model, self.context, self.variables))
        
        # 月度工时模块
        if config.enforce_monthly_hours:
            constraints.append(MonthlyHoursConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 月度工时模块已禁用")
        
        # 连续工作模块
        if config.enforce_consecutive_limit:
            constraints.append(ConsecutiveWorkConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 连续工作模块已禁用")
        
        # 夜班休息模块
        if config.enforce_night_rest:
            constraints.append(NightRestConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 夜班休息模块已禁用")
        
        # 主管约束模块
        if config.enforce_supervisor_constraints:
            constraints.append(SupervisorConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 主管约束模块已禁用")
        
        # 公平性约束模块
        if config.enforce_fairness:
            constraints.append(FairnessConstraint(self.model, self.context, self.variables))
        else:
            logger.info("[Solver] ⚠️ 公平性约束模块已禁用")
        
        total_constraints = 0
        for constraint in constraints:
            # 注入 LiveLogger
            if self.live_logger:
                constraint.set_live_logger(self.live_logger)
            
            constraint.apply()
            added = constraint.constraints_added
            total_constraints += added
            logger.info(f"[Solver] 约束 {constraint.name}: 添加 {added} 条约束")
            
            # 输出摘要到 LiveLog
            constraint.log_summary()
        
        logger.info(f"[Solver] 总计 {total_constraints} 条约束，{len(self.variables.position_assignment_vars)} 个岗位分配变量")
        logger.info(f"[Solver] 聚合变量: {len(self.variables.assignment_vars)} 个，操作候选人: {len(self.variables.operation_candidates)} 个操作")
        
        # 推送汇总到 LiveLog
        if self.live_logger:
            self.live_logger.solver(f"📊 约束构建完成: {total_constraints} 条约束, {len(self.variables.position_assignment_vars)} 个变量")
        
        # 诊断：检查是否有岗位没有分配变量
        ops_without_vars = []
        for op_id, op in self.context.operations.items():
            if op_id in self.context.skipped_operations:
                continue
            has_vars = False
            for pos_num in range(1, op.required_people + 1):
                if (op_id, pos_num) in self.variables.position_candidates and self.variables.position_candidates[(op_id, pos_num)]:
                    has_vars = True
                    break
            if not has_vars:
                ops_without_vars.append(op_id)
        
        if ops_without_vars:
            logger.warning(f"[Solver] ❌ 有 {len(ops_without_vars)} 个操作没有任何岗位分配变量!")
    
    def _build_objective(self) -> None:
        """构建目标函数"""
        builder = ObjectiveBuilder(self.model, self.context, self.variables)
        builder.build()
    
    def _build_decision_strategy(self) -> None:
        """构建自适应决策策略"""
        strategy = DecisionStrategyBuilder(self.model, self.context, self.variables)
        strategy.build()
    
    def _inject_solution_hints(self) -> None:
        """生成并注入初始解 Hint
        
        使用贪心算法生成初始解，通过 AddHint 注入到模型中，
        加速找到第一个可行解。
        """
        try:
            generator = HintGenerator(self.context, self.variables)
            hints = generator.generate()
            
            if not hints:
                logger.info("[Solver] 无 Hint 可注入")
                return
            
            # 注入 Hint
            hint_count = 0
            for (op_id, emp_id), value in hints.items():
                var = self.variables.assignment_vars.get((op_id, emp_id))
                if var is not None:
                    self.model.AddHint(var, value)
                    hint_count += 1
            
            logger.info(f"[Solver] 注入 {hint_count} 个初始解 Hint")
            
        except Exception as e:
            # Hint 生成失败不影响求解
            logger.warning(f"[Solver] Hint 生成失败，继续无 Hint 求解: {e}")
    
    def _run_solver(self, progress_callback=None) -> tuple:
        """运行 CP-SAT 求解器"""
        import threading
        
        self.cp_solver = cp_model.CpSolver()
        
        # 设置时间限制
        time_limit = self.context.config.solver_time_limit_seconds
        self.cp_solver.parameters.max_time_in_seconds = time_limit
        
        # ==================== 性能优化参数 ====================
        # 1. 多线程并行 - 使用所有 CPU 核心（最大影响）
        self.cp_solver.parameters.num_workers = 0  # 0 = 自动检测核心数
        
        # 2. 线性松弛 - 获得更好的边界估计，加速剪枝
        self.cp_solver.parameters.linearization_level = 2
        
        # 3. 大邻域搜索（LNS） - 加速找到高质量解
        self.cp_solver.parameters.search_branching = cp_model.AUTOMATIC_SEARCH
        
        # 4. 对称性消除 - 剪枝等效解
        self.cp_solver.parameters.symmetry_level = 2
        
        # 5. 启用子句共享（多线程间共享学习到的约束）
        self.cp_solver.parameters.share_level_zero_bounds = True
        self.cp_solver.parameters.share_binary_clauses = True
        
        # 6. 交错搜索 - 多线程协调更高效
        self.cp_solver.parameters.interleave_search = True
        
        # 7. 快速随机数生成器
        self.cp_solver.parameters.use_absl_random = True
        
        logger.info(
            f"[Solver] 性能优化: workers=auto, linearization=2, symmetry=2, interleave=True"
        )
        # ======================================================
        
        # 设置随机化参数（增加结果多样性）
        if self.context.config.enable_random_perturbation:
            seed = self.context.config.random_seed
            if seed is not None:
                self.cp_solver.parameters.random_seed = seed
            else:
                # 使用当前时间戳作为随机种子
                import time as time_module
                self.cp_solver.parameters.random_seed = int(time_module.time() * 1000) % (2**31)
            
            # 启用随机化搜索策略
            self.cp_solver.parameters.randomize_search = True
            
            logger.info(
                f"[Solver] 启用随机化: seed={self.cp_solver.parameters.random_seed}, "
                f"perturbation_weight={self.context.config.perturbation_weight}"
            )
        
        # 创建回调（传入 LiveLogger）
        improvement_timeout = self.context.config.solver_improvement_timeout
        self.callback = SolverCallback(
            improvement_timeout=improvement_timeout,
            progress_callback=progress_callback,
            time_limit=time_limit,
            live_logger=self.live_logger
        )
        
        # 记录求解开始
        if self.live_logger:
            self.live_logger.solver("⏱️ 开始 CP-SAT 求解...")
        
        # 创建一个标志来控制看门狗线程
        solve_complete = threading.Event()
        
        def abort_watchdog():
            """看门狗线程：定期检查中断请求并重复调用 StopSearch"""
            while not solve_complete.is_set():
                if self.callback and self.callback.abort_requested:
                    # 如果有中断请求，每隔 0.5 秒重复调用 StopSearch
                    try:
                        self.callback.StopSearch()
                        logger.debug("[Solver] 看门狗: 重复调用 StopSearch()")
                    except Exception as e:
                        logger.debug(f"[Solver] 看门狗: StopSearch 调用异常: {e}")
                solve_complete.wait(0.5)  # 每 0.5 秒检查一次
        
        # 启动看门狗线程
        watchdog_thread = threading.Thread(target=abort_watchdog, daemon=True)
        watchdog_thread.start()
        
        try:
            # 执行求解
            status = self.cp_solver.Solve(self.model, self.callback)
        finally:
            # 通知看门狗线程停止
            solve_complete.set()
            watchdog_thread.join(timeout=1.0)
        
        return status, self.callback
    
    def _build_response(
        self,
        request: SolverRequest,
        status: int,
        callback: SolverCallback,
        elapsed: float,
    ) -> SolverResponse:
        """构建响应"""
        status_name = self._get_status_name(status)
        
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            # 无可行解 - 分析原因
            diagnostics = self._build_diagnostics(callback, elapsed, 0, 0)
            infeasibility_analysis = self._analyze_infeasibility()
            reason = f"CP-SAT 返回状态: {status_name}"
            if infeasibility_analysis:
                reason = f"{infeasibility_analysis}\n(CP-SAT 状态: {status_name})"
            
            # 推送到 LiveLog
            if self.live_logger:
                self.live_logger.error(f"❌ 求解失败: {status_name}", LogCategory.SOLVER.value)
            
            return SolverResponse.create_infeasible(
                request_id=request.request_id,
                reason=reason,
                diagnostics=diagnostics,
                conflict_report=self.conflict_report.to_dict() if self.conflict_report else None,
            )
        
        # 构建结果
        builder = ResultBuilder(
            self.cp_solver,
            self.context,
            self.variables,
        )
        
        assignments = builder.build_assignments()
        shift_plans = builder.build_shift_plans()
        hours_summaries = builder.build_hours_summaries()
        warnings = builder.build_warnings()
        
        diagnostics = self._build_diagnostics(
            callback, elapsed,
            len(assignments),
            len(shift_plans),
        )
        
        return SolverResponse(
            request_id=request.request_id,
            status=status_name,
            summary=self._build_summary(status_name, len(assignments), len(self.context.operations)),
            assignments=assignments,
            shift_plans=shift_plans,
            hours_summaries=hours_summaries,
            warnings=warnings,
            diagnostics=diagnostics,
            conflict_report=self.conflict_report.to_dict() if self.conflict_report else None,
        )
    
    def _get_status_name(self, status: int) -> str:
        """获取状态名称"""
        if status == cp_model.OPTIMAL:
            return SolverStatus.OPTIMAL.value
        elif status == cp_model.FEASIBLE:
            return SolverStatus.FEASIBLE.value
        elif status == cp_model.INFEASIBLE:
            return SolverStatus.INFEASIBLE.value
        else:
            return SolverStatus.TIMEOUT.value
    
    def _build_summary(self, status: str, assigned: int, total: int) -> str:
        """构建摘要"""
        if status == SolverStatus.OPTIMAL.value:
            return f"找到最优解，分配了 {assigned}/{total} 个操作"
        elif status == SolverStatus.FEASIBLE.value:
            return f"找到可行解，分配了 {assigned}/{total} 个操作"
        else:
            return f"求解状态: {status}"
    
    def _analyze_infeasibility(self) -> str:
        """分析无可行解的原因"""
        issues = []
        
        # 0. 优先使用 ConflictDetector 生成的详细报告
        if self.conflict_report:
            # 严重冲突
            for conflict in self.conflict_report.critical_conflicts[:10]:  # 显示前10个
                reason = conflict.reason
                op_info = f"{conflict.date} {conflict.op_name}" if conflict.date else conflict.op_name
                issues.append(f"❌ [CRITICAL] {reason} ({op_info})")
                if conflict.details:
                    for d in conflict.details[:2]:
                        issues.append(f"   └─ {d}")
            
            # 警告（如果没严重冲突，显示警告）
            if not self.conflict_report.has_critical_error:
                for warning in self.conflict_report.warnings[:5]:
                    reason = warning.reason
                    op_info = f"{warning.date}" if warning.date else warning.op_name
                    issues.append(f"⚠️ [WARNING] {reason} ({op_info})")
            
            # 统计汇总
            crit_count = len(self.conflict_report.critical_conflicts)
            warn_count = len(self.conflict_report.warnings)
            if crit_count > 0 or warn_count > 0:
                issues.append(f"\n📊 诊断汇总: {crit_count} 个严重冲突, {warn_count} 个警告")
                issues.append("-" * 40)
        
        # 1. 检查员工数量是否足够
        total_required = sum(op.required_people for op in self.context.operations.values())
        total_employees = len(self.context.employees)
        total_days = len(self.context.all_dates)
        if total_employees == 0:
            issues.append("❌ 没有可用的员工")
        else:
            avg_required_per_day = total_required / max(1, total_days)
            # issues.append(f"📊 员工: {total_employees}人, 操作: {len(self.context.operations)}个, 需求: {total_required}人次, 天数: {total_days}天")
            if total_employees < avg_required_per_day:
                issues.append(f"⚠️ 员工数量可能不足: 日均需求 {avg_required_per_day:.1f} 人次")
        
        # 2. 检查按岗位的候选人情况
        positions_without_candidates = []
        positions_with_few_candidates = []  # 候选人数 < 3 的岗位
        
        for (op_id, pos_num), candidates in self.context.operation_position_candidates.items():
            op = self.context.operations.get(op_id)
            op_name = op.operation_name if op else f"操作{op_id}"
            
            if len(candidates) == 0:
                positions_without_candidates.append(f"{op_name}岗位{pos_num}")
            elif len(candidates) < 3:
                positions_with_few_candidates.append(f"{op_name}岗位{pos_num}({len(candidates)}人)")
        
        if positions_without_candidates:
            # 如果 ConflictDetector 已经报了这个，就不重复了
            if not self.conflict_report or not any(c.conflict_type == "NO_CANDIDATES" for c in self.conflict_report.critical_conflicts):
                if len(positions_without_candidates) <= 5:
                    issues.append(f"❌ 以下岗位没有候选人: {', '.join(positions_without_candidates)}")
                else:
                    issues.append(f"❌ {len(positions_without_candidates)} 个岗位没有候选人")
        
        if positions_with_few_candidates:
            issues.append(f"⚠️ {len(positions_with_few_candidates)} 个岗位候选人不足3人")
            if len(positions_with_few_candidates) <= 10:
                for p in positions_with_few_candidates[:10]:
                    issues.append(f"  - {p}")
        
        # 3. 检查资质匹配（操作级别）
        unqualified_ops = []
        for op_id, candidates in self.context.operation_candidates.items():
            if len(candidates) == 0:
                op = self.context.operations.get(op_id)
                if op:
                    unqualified_ops.append(f"{op.operation_name or op.operation_code}")
        if unqualified_ops:
            if len(unqualified_ops) <= 3:
                issues.append(f"❌ 以下操作没有符合资质的员工: {', '.join(unqualified_ops)}")
            else:
                issues.append(f"❌ {len(unqualified_ops)} 个操作没有符合资质的员工")
        
        # 4. 检查月度工时约束
        if self.context.config.enforce_monthly_hours:
            lower = self.context.config.monthly_hours_lower_offset
            upper = self.context.config.monthly_hours_upper_offset
            issues.append(f"📊 月度工时约束: 标准工时 -[{lower}h, +{upper}h]")
            
            for month_key, workdays_in_month in self.context.month_workdays.items():
                std_hours = self.context.get_standard_hours(month_key)
                min_hours = std_hours - lower
                max_hours = std_hours + upper
                
                issues.append(f"  {month_key}: {workdays_in_month}天, 标准={std_hours}h, 范围=[{min_hours}, {max_hours}]h")
                
                if workdays_in_month * 8 < min_hours:
                    issues.append(f"  ⚠️ {month_key} 工作日不足: 需要至少 {min_hours:.0f}h，但最多只能 {workdays_in_month * 8}h")
        
        # 5. 检查员工操作密度
        emp_op_days = {}  # emp_id -> set(dates with ops)
        for (op_id, pos_num), candidates in self.context.operation_position_candidates.items():
            op = self.context.operations.get(op_id)
            if op:
                date = op.planned_start[:10]
                for emp_id in candidates:
                    if emp_id not in emp_op_days:
                        emp_op_days[emp_id] = set()
                    emp_op_days[emp_id].add(date)
        
        overloaded_emps = []
        for emp_id, op_dates in emp_op_days.items():
            if len(op_dates) > 50:  # 如果员工可能需要工作超过50天
                overloaded_emps.append((emp_id, len(op_dates)))
        
        if overloaded_emps:
            issues.append(f"⚠️ 操作密集员工（可能需要工作>50天）: {len(overloaded_emps)}人")
            for emp_id, days in sorted(overloaded_emps, key=lambda x: -x[1])[:5]:
                issues.append(f"  - 员工{emp_id}: {days}天有操作")
        
        # 4. 检查连续工作约束
        max_consecutive = self.context.config.max_consecutive_workdays
        # 检查是否有连续操作超过限制
        for emp_id in self.context.employees:
            required_days = set()
            for op_id, op in self.context.operations.items():
                if emp_id in self.context.locked_operations.get(op_id, set()):
                    required_days.add(op.planned_start[:10])
            # 简单检查是否有连续天数要求
            if len(required_days) > max_consecutive:
                issues.append(f"⚠️ 员工 {emp_id} 的锁定操作可能超过连续工作 {max_consecutive} 天限制")
                break
        
        # 5. 检查操作时间冲突
        emp_day_ops = {}  # {(emp_id, date): [op_ids]}
        for op_id, op in self.context.operations.items():
            locked = self.context.locked_operations.get(op_id, set())
            date = op.planned_start[:10]
            for emp_id in locked:
                key = (emp_id, date)
                if key not in emp_day_ops:
                    emp_day_ops[key] = []
                emp_day_ops[key].append((op_id, op))
        
        conflicts = []
        for (emp_id, date), ops in emp_day_ops.items():
            if len(ops) > 1:
                # 检查是否有时间冲突（非共享组）
                for i, (op1_id, op1) in enumerate(ops):
                    for op2_id, op2 in ops[i+1:]:
                        # 简单检查时间是否重叠
                        if (op1.planned_start < op2.planned_end and op2.planned_start < op1.planned_end):
                            # 检查是否在共享组中
                            shared = False
                            for pref in self.context.request.shared_preferences:
                                member_ids = {m.operation_plan_id for m in pref.members}
                                if op1_id in member_ids and op2_id in member_ids:
                                    shared = True
                                    break
                            if not shared:
                                conflicts.append(f"员工 {emp_id} 在 {date} 有时间冲突")
        if conflicts:
            issues.append(f"❌ 存在 {len(conflicts)} 个员工时间冲突")
        
        # 汇总
        if not issues:
            issues.append("约束过于严格，请尝试：\n- 增加员工\n- 放宽月度工时限制\n- 检查员工资质")
        
        return "可能的原因:\n" + "\n".join(issues)
    
    def _build_diagnostics(
        self,
        callback: SolverCallback,
        elapsed: float,
        assigned_ops: int,
        shift_plans: int,
    ) -> SolverDiagnostics:
        """构建诊断信息"""
        total_ops = len(self.context.operations)
        skipped_ops = len(self.context.skipped_operations)
        
        return SolverDiagnostics(
            total_operations=total_ops,
            total_employees=len(self.context.employees),
            total_days=len(self.context.all_dates),
            assigned_operations=assigned_ops,
            skipped_operations=skipped_ops,
            shift_plans_created=shift_plans,
            solve_time_seconds=round(elapsed, 2),
            solutions_found=callback.solutions_found if callback else 0,
            objective_value=self.cp_solver.ObjectiveValue() if self.cp_solver else None,
            employee_utilization_rate=assigned_ops / max(1, len(self.context.employees) * len(self.context.all_dates)),
            operation_fulfillment_rate=assigned_ops / max(1, total_ops - skipped_ops),
        )


def solve(payload: Dict[str, Any]) -> Dict[str, Any]:
    """便捷求解函数
    
    从字典创建请求并执行求解。
    当求解窗口超过 14 天时，自动启用分段求解。
    
    Args:
        payload: 请求数据字典
        
    Returns:
        响应数据字典
    """
    from datetime import datetime
    from core.segmented_solver import SegmentedSolver
    
    request = SolverRequest.from_dict(payload)
    
    # 计算求解窗口天数
    start = datetime.strptime(request.window.start_date[:10], "%Y-%m-%d")
    end = datetime.strptime(request.window.end_date[:10], "%Y-%m-%d")
    window_days = (end - start).days + 1
    
    # 自动切换：窗口 > 14 天时使用分段求解
    if window_days > 14:
        logger.info(f"[Solver] 窗口 {window_days} 天 > 14 天，自动启用分段求解")
        solver = SegmentedSolver()
        response = solver.solve(request)
    else:
        logger.info(f"[Solver] 窗口 {window_days} 天 <= 14 天，使用整体求解")
        solver = Solver()
        response = solver.solve(request)
    
    return response.to_dict()

