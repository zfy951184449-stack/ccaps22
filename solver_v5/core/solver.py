"""
Solver V4 Core Logic

Refactored: solve() orchestrates 5 focused phases:
  1. _init_callback()      → Config parsing, callback setup
  2. _build_variables()    → Assignment, vacancy, shift variables
  3. _apply_constraints()  → All constraint modules
  4. _build_objectives()   → Multi-objective weighted sum
  5. _run_solver()         → Monitor thread + CP-SAT solve
  _extract_solution()      → Solution → JSON (unchanged)
"""

import os
import threading
import time
from datetime import datetime
from ortools.sat.python import cp_model
from contracts.request import SolverRequest
from core.index import AssignmentIndex, ShiftIndex
from core.context import SolverContext
from utils.time_utils import get_date_range, parse_iso_to_unix
from utils.logger import get_logger

logger = get_logger("Core")

SOLVER_API_URL = os.environ.get("BACKEND_API_URL", "http://localhost:3001/api/v5/scheduling/callback/progress")


class SolverV5:
    def __init__(self):
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.solver_context = None
        # S3: breakdown 观测变量注册表（_build_objectives 内实例化）+ 外层权重快照
        self.breakdown = None
        self._objective_weights_applied = {}
        # S6: lexicographic 第二阶段——记 phase-1 实耗（供 phase-2 预算计算，§5.4）。
        self._phase1_elapsed = 0.0
        
        # Performance Parameters (Environment-aware)
        self.solver.parameters.log_search_progress = os.environ.get("SOLVER_DEBUG", "0") == "1"
        # 自适应:按运行机实际核数开线程,留 2 核给系统/后端/MySQL/开发(codex);可用 SOLVER_WORKERS 覆盖
        _cpu = os.cpu_count() or 4
        self.solver.parameters.num_workers = int(os.environ.get("SOLVER_WORKERS") or max(4, _cpu - 2))
        self.solver.parameters.linearization_level = 2
        self.solver.parameters.symmetry_level = 2
        # 目标为整数,绝对 gap < 1 即最优;让 C++ 层自动终止,省去 Python callback 判 gap 再 StopSearch(P0-5)
        self.solver.parameters.absolute_gap_limit = 0.99

    # ──────────────────────────────────────────────
    # Public Entry Point
    # ──────────────────────────────────────────────

    def solve(self, req: SolverRequest):
        """
        Orchestrator: runs the 5-phase pipeline and returns solution dict.
        """
        logger.info(f"Building Model for {len(req.operation_demands)} operations...")
        
        config = req.config or {}

        # Phase 1: Callback
        callback, run_id = self._init_callback(config)

        # Phase 1.5: Input Pre-check (fast sanity checks)
        from core.precheck import run_precheck
        precheck_issues = run_precheck(req)
        if precheck_issues:
            errors = [i for i in precheck_issues if i.severity == "ERROR"]
            warnings = [i for i in precheck_issues if i.severity == "WARNING"]
            if callback:
                for issue in errors:
                    callback.log_metric("预检-错误", f"🔴 {issue.message}")
                for issue in warnings[:5]:  # Limit to 5 warnings in callback
                    callback.log_metric("预检-警告", f"⚠️ {issue.message}")
            for issue in errors:
                logger.error(f"[PRECHECK] {issue.message}")
            for issue in warnings:
                logger.warning(f"[PRECHECK] {issue.message}")
        
        # S2: BUILDING phase 开始
        if callback:
            callback.emit_phase("BUILDING")

        # Phase 2: Variables
        result_or_vars = self._build_variables(req, config, callback)
        if isinstance(result_or_vars, dict):
            # Early exit (INFEASIBLE due to no candidates)
            return result_or_vars
        assignments, vacancy_vars, shift_assignments, special_cover_vars, special_shortage_vars, index, shift_index = result_or_vars

        # Phase 3: Constraints
        self._apply_constraints(req, config, callback, assignments, vacancy_vars,
                                shift_assignments, special_cover_vars, special_shortage_vars, index, shift_index)

        # Phase 4: Objectives
        self._build_objectives(req, config, callback, assignments, vacancy_vars,
                               shift_assignments, special_cover_vars, special_shortage_vars)

        # Phase 4.5: Solution hint（S5）— _build_objectives 之后、_run_solver 之前注入。
        # 软 hint，绝不 fix；全程安全降级，任何异常等同于「无 hint」，不影响求解。
        self._apply_solution_hint(req, config, callback, assignments, shift_assignments)

        # S2: SOLVING phase 开始
        if callback:
            callback.emit_phase("SOLVING")

        # S6: lexicographic 第二阶段开启时，phase-1 只占 lex_phase1_budget_ratio 的总预算，
        #     剩余留给 phase-2（§5.4）。默认 off → 不改 config，phase-1 用满预算（== V4）。
        lex_enabled = bool(config.get("enable_lexicographic_l4", False))
        phase1_config = config
        if lex_enabled:
            total_time = float(config.get("max_time_seconds", 300))
            ratio = float(config.get("lex_phase1_budget_ratio", 0.7))
            phase1_config = dict(config)
            phase1_config["max_time_seconds"] = max(1.0, total_time * ratio)

        # Phase 5: Solve（phase-1）
        status = self._run_solver(
            phase1_config,
            callback,
            assignments,
            shift_assignments,
            vacancy_vars,
            special_cover_vars,
            special_shortage_vars,
        )

        # Phase 5.5: lexicographic L4 第二阶段（S6，默认关；§5.2/§5.5 全程安全回退 phase-1）。
        # solver_override 指明结果提取该读哪个 solver：成功用 phase2_solver，回退/单阶段用 self.solver。
        solver_override = None
        if lex_enabled:
            try:
                from core import lexicographic
                use_phase2, phase2_solver = lexicographic.run_phase2(
                    self, req, config, callback, status, self.solver)
                if use_phase2 and phase2_solver is not None:
                    solver_override = phase2_solver
                    # phase-2 若拿到更优解，status 视为 phase-2 状态（OPTIMAL/FEASIBLE）。
                    status = cp_model.OPTIMAL
            except Exception as e:
                # run_phase2 内部已大包围，此处再保险一层：异常一律按单阶段处理。
                logger.exception("lex phase-2 编排异常，按 phase-1 解返回：%s", e)
                solver_override = None

        # S2: EXTRACTING phase 开始
        if callback:
            callback.emit_phase("EXTRACTING")

        # Phase 6: Result handling
        return self._handle_result(status, callback, assignments, shift_assignments,
                                   req, shift_index, vacancy_vars,
                                   solver_override=solver_override)

    # ──────────────────────────────────────────────
    # Phase 1: Callback Initialization
    # ──────────────────────────────────────────────

    def _init_callback(self, config: dict):
        """Parse config, create APICallback if run_id exists."""
        max_time_s = float(config.get("max_time_seconds", 300))
        stagnation_s = float(config.get("stagnation_limit", 90))
        
        run_id = None
        if "metadata" in config:
            run_id = config["metadata"].get("run_id")

        callback = None
        if run_id:
            from core.callback import APICallbackV5
            logger.info(f"Attaching Monitor Callback for Run {run_id} to {SOLVER_API_URL}")
            callback = APICallbackV5(run_id, SOLVER_API_URL,
                                     max_time_seconds=max_time_s,
                                     stagnation_limit=stagnation_s)
            callback.set_solver(self.solver)

            # Registry injection (from app.py metadata)
            if "metadata" in config and "registry" in config["metadata"]:
                registry = config["metadata"]["registry"]
                registry[str(run_id)] = callback
                logger.info(f"Registered callback for Run {run_id} in global registry")
        else:
            logger.warning("run_id is None. Flexible Stop Strategy limited (No Server Poll).")

        if callback:
            callback.log_section("启动求解器 V5 (Flexible Stop)", [
                f"操作任务: {config.get('_op_count', '?')}",
                f"最大时间: {max_time_s}s",
                f"停滞检测: {stagnation_s}s",
            ])

        return callback, run_id

    # ──────────────────────────────────────────────
    # Phase 2: Variable Creation
    # ──────────────────────────────────────────────

    def _shift_relevant_employee_ids(self, req: SolverRequest, index) -> set:
        """
        [P0-2] 需要建立 shift_assignments 变量的员工集合。

        = 所有"可能被排班 / 被班次约束按 employee_id 点名"的员工:
            · 操作候选       index.get_all_employees() (position_qualifications.candidate_employee_ids)
            · 领导           org_role ∈ LEADER_ROLES  (leadership_coverage Rule1 需领导的 shift 变量)
            · 专项班次相关   special_shift_requirements 的 eligible_employee_ids + candidates
            · 锁定操作强制人 locked_operations.enforced_employee_ids
            · 锁定班次       locked_shifts.employee_id
            · 冻结班次/分配  frozen_shifts / frozen_assignments 的 employee_id
        排除的只有"从头到尾没被任何需求/约束引用"的无关员工 —— 正是本优化要省掉的。

        ⚠️ 维护铁律: 任何新增的、按 employee_id 指定班次或操作分配的 contract 字段,
           都必须在此并入。漏掉会让该员工缺失 shift 变量, 相关硬约束(领导在岗 / 专项覆盖 /
           锁定 / 冻结)会**静默失效**: 不抛异常, 但排出违反约束的班次。
        """
        from constraints.leadership_coverage import LEADER_ROLES
        emps = set(index.get_all_employees())
        emps |= {ep.employee_id for ep in req.employee_profiles
                 if getattr(ep, "org_role", "FRONTLINE") in LEADER_ROLES}
        for r in req.special_shift_requirements:
            emps |= set(getattr(r, "eligible_employee_ids", None) or [])
            emps |= {c.employee_id for c in (getattr(r, "candidates", None) or [])}
        for lo in req.locked_operations:
            emps |= set(getattr(lo, "enforced_employee_ids", None) or [])
        emps |= {ls.employee_id for ls in req.locked_shifts}
        emps |= {fs.employee_id for fs in req.frozen_shifts}
        emps |= {fa.employee_id for fa in req.frozen_assignments}
        return emps

    def _build_variables(self, req: SolverRequest, config: dict, callback):
        """
        Create assignment, vacancy, and shift variables.

        Returns:
            (assignments, vacancy_vars, shift_assignments, special_cover_vars, special_shortage_vars, index, shift_index)
            OR a dict (early exit result) if infeasible.
        """
        assignments = {}
        vacancy_vars = {}
        special_cover_vars = {}
        special_shortage_vars = {}
        mandatory_ops = set(config.get("mandatory_operation_ids", []))
        total_vars = 0

        for op in req.operation_demands:
            for pos in op.position_qualifications:
                for emp_id in pos.candidate_employee_ids:
                    var_name = f"Assign_Op{op.operation_plan_id}_Pos{pos.position_number}_Emp{emp_id}"
                    assignments[(op.operation_plan_id, pos.position_number, emp_id)] = self.model.NewBoolVar(var_name)
                    total_vars += 1
                
                candidates_vars = [
                    assignments[(op.operation_plan_id, pos.position_number, emp_id)]
                    for emp_id in pos.candidate_employee_ids
                ]
                
                # Standalone tasks use their own vacancy switch (allow_standalone_vacancy,
                # default True); batch ops use allow_position_vacancy (default False).
                is_standalone = getattr(op, "source_type", "BATCH") == "STANDALONE"
                if is_standalone:
                    allow_vacancy_cfg = config.get("allow_standalone_vacancy", True)
                else:
                    allow_vacancy_cfg = config.get("allow_position_vacancy", False)

                if candidates_vars:
                    is_mandatory = op.operation_plan_id in mandatory_ops
                    allow_vacancy = allow_vacancy_cfg and not is_mandatory

                    if allow_vacancy:
                        self.model.Add(sum(candidates_vars) <= 1)
                        var_vacant = self.model.NewBoolVar(f"Vacant_Op{op.operation_plan_id}_Pos{pos.position_number}")
                        self.model.Add(sum(candidates_vars) == 0).OnlyEnforceIf(var_vacant)
                        self.model.Add(sum(candidates_vars) >= 1).OnlyEnforceIf(var_vacant.Not())
                        vacancy_vars[(op.operation_plan_id, pos.position_number)] = var_vacant
                    else:
                        self.model.Add(sum(candidates_vars) == 1)
                else:
                    if allow_vacancy_cfg:
                        msg = f"No candidates for Op {op.operation_plan_id} Pos {pos.position_number}, will be vacant."
                        logger.warning(msg)
                        if callback: callback.log(f"[WARNING] {msg}")
                        var_vacant = self.model.NewConstant(1)
                        vacancy_vars[(op.operation_plan_id, pos.position_number)] = var_vacant
                    else:
                        msg = f"No candidates for Op {op.operation_plan_id} Pos {pos.position_number}!"
                        logger.warning(msg)
                        if callback: callback.log(f"[ERROR] {msg}")
                        return {"status": "INFEASIBLE", "message": msg}

        if callback:
            callback.log_metric("模型构建", f"变量总数 {total_vars}")

        # Build Index
        index = AssignmentIndex(assignments)
        if callback:
            callback.log_metric("索引构建", f"员工 {len(index.get_all_employees())} / 操作 {len(index.get_all_operations())}")

        # Shift Variables
        shift_assignments = {}
        shift_index = None

        if req.window and req.shift_definitions:
            shift_index = ShiftIndex(req)
            dates = get_date_range(req.window['start_date'], req.window['end_date'])
            # [P0-2] 只为"需要排班的员工"建 shift 变量,排除从未被任何需求/约束点名的
            # 无关员工(典型场景省 30%+ shift BoolVar)。完整来源见 _shift_relevant_employee_ids。
            all_employees = self._shift_relevant_employee_ids(req, index)
            
            for date in dates:
                for emp_id in all_employees:
                    for shift in req.shift_definitions:
                        var_name = f"Assign_Shift_{emp_id}_{date}_{shift.shift_id}"
                        shift_assignments[(emp_id, date, shift.shift_id)] = self.model.NewBoolVar(var_name)
                        total_vars += 1
            
            if callback:
                callback.log_metric("班次变量", f"Days {len(dates)} x Emps {len(all_employees)}/{len(req.employee_profiles)}(收窄后/全员) x Shifts {len(req.shift_definitions)}")

        for requirement in req.special_shift_requirements:
            special_shortage_vars[requirement.occurrence_id] = self.model.NewIntVar(
                0,
                requirement.required_people,
                f"SpecialShortage_{requirement.occurrence_id}",
            )
            total_vars += 1

            candidate_ids = [
                candidate.employee_id for candidate in getattr(requirement, "candidates", [])
            ] or list(requirement.eligible_employee_ids)
            for employee_id in candidate_ids:
                key = (requirement.occurrence_id, employee_id)
                special_cover_vars[key] = self.model.NewBoolVar(
                    f"SpecialCover_{requirement.occurrence_id}_Emp{employee_id}"
                )
                total_vars += 1

        if callback and req.special_shift_requirements:
            callback.log_metric(
                "专项变量",
                f"Coverage {len(special_cover_vars)} / Shortage {len(special_shortage_vars)}",
            )

        return assignments, vacancy_vars, shift_assignments, special_cover_vars, special_shortage_vars, index, shift_index

    # ──────────────────────────────────────────────
    # Phase 3: Constraint Application
    # ──────────────────────────────────────────────

    def _apply_constraints(self, req, config, callback, assignments, vacancy_vars,
                           shift_assignments, special_cover_vars, special_shortage_vars, index, shift_index):
        """Load and apply all constraint modules via the constraint registry."""

        # Build unified context
        ctx = SolverContext(
            model=self.model,
            assignments=assignments,
            index=index,
            shift_assignments=shift_assignments or {},
            shift_index=shift_index,
            vacancy_vars=vacancy_vars or {},
            special_cover_vars=special_cover_vars or {},
            special_shortage_vars=special_shortage_vars or {},
            config=config,
        )
        # Keep a reference for solution extraction (e.g., flexible task placements).
        self.solver_context = ctx

        from constraints.registry import CORE_CONSTRAINTS, SHIFT_CONSTRAINTS
        from core.stats_collector import StatsCollector

        # S2: 建立采集器，计时包裹每个约束 apply
        collector = StatsCollector()

        constraint_results = {}  # name -> count

        # --- Phase 1: Core Constraints (no shift dependency) ---
        for cls in CORE_CONSTRAINTS:
            enabled = config.get(cls.config_key, cls.default_enabled) if cls.config_key else True
            if enabled:
                with collector.measure(cls.name):
                    count = cls(logger=logger).apply(ctx, req)
                collector.record(cls.name, count)
                constraint_results[cls.name] = count
            else:
                logger.info(f"Skipping {cls.name} (Disabled)")
                collector.record(cls.name, "OFF")
                constraint_results[cls.name] = "OFF"

        if callback:
            core_lines = [f"{name}: {v} 条" if v != 'OFF' else f"{name}: 已关闭"
                          for name, v in constraint_results.items()]
            callback.log_section("应用硬约束 (核心)", core_lines)

        # --- Phase 2: Shift-Dependent Constraints ---
        if not shift_assignments:
            # 无 shift 变量：发 MODEL_STATS（仅核心约束）
            if callback:
                task_placements = getattr(self.solver_context, "task_placements", {})
                collector.set_layers(
                    num_assignments=len(assignments),
                    num_shift=len(shift_assignments or {}),
                    num_vacancy=len(vacancy_vars or {}),
                    num_special_cover=len(special_cover_vars or {}),
                    num_special_shortage=len(special_shortage_vars or {}),
                    num_task_placement=len(task_placements),
                )
                callback.emit_model_stats(collector.to_payload())
            return

        shift_results = {}

        for cls in SHIFT_CONSTRAINTS:
            enabled = config.get(cls.config_key, cls.default_enabled) if cls.config_key else True
            if enabled:
                with collector.measure(cls.name):
                    count = cls(logger=logger).apply(ctx, req)
                collector.record(cls.name, count)
                shift_results[cls.name] = count
            else:
                logger.info(f"Skipping {cls.name} (Disabled)")
                collector.record(cls.name, "OFF")
                shift_results[cls.name] = "OFF"

        if callback:
            shift_lines = [f"{name}: {v} 条" if v != 'OFF' else f"{name}: 已关闭"
                           for name, v in shift_results.items()]
            callback.log_section("排班规则概览", shift_lines)

        # S2: BUILDING 末发 MODEL_STATS（含全部约束）
        if callback:
            task_placements = getattr(self.solver_context, "task_placements", {})
            collector.set_layers(
                num_assignments=len(assignments),
                num_shift=len(shift_assignments or {}),
                num_vacancy=len(vacancy_vars or {}),
                num_special_cover=len(special_cover_vars or {}),
                num_special_shortage=len(special_shortage_vars or {}),
                num_task_placement=len(task_placements),
            )
            callback.emit_model_stats(collector.to_payload())

    # ──────────────────────────────────────────────
    # Phase 4: Objective Construction
    # ──────────────────────────────────────────────

    def _build_objectives(self, req, config, callback, assignments, vacancy_vars,
                          shift_assignments, special_cover_vars, special_shortage_vars):
        """Build multi-objective weighted sum and apply to model."""
        objective_terms = []
        objective_desc = []

        # S3: breakdown 观测变量注册表（enable_objective_breakdown 默认 true）。
        # "观测不改优化"：每个 exprN 同时 (1) 乘外层权重塞 objective_terms（与 V4 一致）
        #                              (2) 未乘权重原始 exprN 注册建观测 IntVar。
        from core.breakdown import ObjectiveBreakdown
        enable_breakdown = bool(config.get("enable_objective_breakdown", True))
        self.breakdown = ObjectiveBreakdown(self.model, enabled=enable_breakdown)

        # O0: Special Coverage Shortage (highest priority among soft terms)
        if special_shortage_vars and req.special_shift_requirements:
            from objectives.minimize_special_coverage_shortage import MinimizeSpecialCoverageShortageObjective

            expr_special_shortage = MinimizeSpecialCoverageShortageObjective(logger=logger).build_expression(
                self.model,
                special_shortage_vars,
                req,
            )
            if expr_special_shortage is not None and not isinstance(expr_special_shortage, int):
                objective_terms.append(expr_special_shortage)
                objective_desc.append("专项欠配(优先)")
                # O0 外层权重=1（PRIORITY_WEIGHTS 已内嵌进表达式）
                self.breakdown.register("special_shortage_penalty", expr_special_shortage, weight=1)

        # O1: Vacancy Minimization — penalize ANY vacancy var (batch OR standalone).
        # vacancy_vars only contain entries when some vacancy was allowed, so gating on
        # the dict alone is correct (don't gate on allow_position_vacancy, which would
        # drop standalone vacancy penalties when only allow_standalone_vacancy is on).
        if vacancy_vars:
            from objectives.minimize_vacancies import MinimizeVacanciesObjective
            
            op_metadata = {}
            for op in req.operation_demands:
                try:
                    dt_str = op.planned_start.replace('Z', '+00:00')
                    start_dt = datetime.fromisoformat(dt_str)
                    op_metadata[op.operation_plan_id] = {
                        'date': start_dt.strftime('%Y-%m-%d'),
                        'start_hour': start_dt.hour,
                        'required_people': op.required_people,
                        'source_type': getattr(op, 'source_type', 'BATCH')
                    }
                except Exception as e:
                    logger.warning(f"Failed to parse date for op {op.operation_plan_id}: {e}")
            
            obj0 = MinimizeVacanciesObjective(logger=logger)
            expr0 = obj0.build_expression(self.model, vacancy_vars, req, op_metadata)
            
            if expr0 is not None and not isinstance(expr0, int):
                objective_terms.append(expr0)
                objective_desc.append(f"岗位填报(优先)")
                # O1 外层权重=1（final_weight 含动态峰值/非标时段乘子，已内嵌表达式）
                self.breakdown.register("vacancy_penalty", expr0, weight=1)

        # Weights
        w_impact = int(config.get("objective_weight_special_coverage_impact", 1))
        w1 = int(config.get("objective_weight_deviation", 1))
        w2 = int(config.get("objective_weight_special_shifts", 100))
        w3 = int(config.get("objective_weight_night_balance", 5))
        w4 = int(config.get("objective_weight_weekend_balance", 5))
        w5 = int(config.get("objective_weight_triple_salary", 10))
        w_change = int(config.get("objective_weight_change", 0))

        # O2: Special Coverage Impact
        if special_cover_vars and req.special_shift_requirements:
            from objectives.minimize_special_coverage_impact import MinimizeSpecialCoverageImpactObjective

            expr_impact = MinimizeSpecialCoverageImpactObjective(logger=logger).build_expression(
                self.model,
                special_cover_vars,
                req,
            )
            if expr_impact is not None and not isinstance(expr_impact, int):
                objective_terms.append(w_impact * expr_impact)
                objective_desc.append(f"专项工艺影响(×{w_impact})")
                self.breakdown.register("special_impact", expr_impact, weight=w_impact)

        # O3: Hours Deviation
        if config.get("enable_minimize_deviation", True) and shift_assignments:
            from objectives.minimize_deviation import MinimizeHoursDeviationObjective
            expr1 = MinimizeHoursDeviationObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr1 is not None and not isinstance(expr1, int):
                objective_terms.append(w1 * expr1)
                objective_desc.append(f"工时偏差(×{w1})")
                self.breakdown.register("hours_deviation_scaled", expr1, weight=w1)

        # O4: Special Shifts Count
        if config.get("enable_minimize_special_shifts", True) and shift_assignments:
            from objectives.minimize_special_shifts import MinimizeSpecialShiftsObjective
            expr2 = MinimizeSpecialShiftsObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr2 is not None and not isinstance(expr2, int):
                objective_terms.append(w2 * expr2)
                objective_desc.append(f"特殊班次(×{w2})")
                self.breakdown.register("special_shift_count", expr2, weight=w2)

        # O5: Balance Night Shifts
        if config.get("enable_balance_night_shifts", True) and shift_assignments:
            from objectives.balance_night_shifts import BalanceNightShiftsObjective
            expr3 = BalanceNightShiftsObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr3 is not None and not isinstance(expr3, int):
                objective_terms.append(w3 * expr3)
                objective_desc.append(f"夜班均衡(×{w3})")
                self.breakdown.register("night_shift_variance", expr3, weight=w3)

        # O6: Balance Weekend Work
        if config.get("enable_balance_weekend_work", True) and shift_assignments:
            from objectives.balance_weekend_work import BalanceWeekendWorkObjective
            expr4 = BalanceWeekendWorkObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr4 is not None and not isinstance(expr4, int):
                objective_terms.append(w4 * expr4)
                objective_desc.append(f"周末均衡(×{w4})")
                self.breakdown.register("weekend_work_variance", expr4, weight=w4)

        # O7: Minimize Triple Salary Cost
        if config.get("enable_minimize_triple_salary", True) and shift_assignments:
            from objectives.minimize_triple_salary import MinimizeTripleSalaryCostObjective
            expr5 = MinimizeTripleSalaryCostObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr5 is not None and not isinstance(expr5, int):
                objective_terms.append(w5 * expr5)
                objective_desc.append(f"三倍薪日(×{w5})")
                self.breakdown.register("triple_salary_count", expr5, weight=w5)

        # O7.5: Minimize Change (最小变更 / 稳定性) — opt-in, default OFF.
        # Gate-safe: disabled flag / weight 0 / empty baseline each reproduce old behavior.
        # Weight MUST stay below coverage/vacancy priority (see design doc §6).
        if (config.get("enable_minimize_change", False)
                and w_change > 0
                and (assignments or shift_assignments)):
            from objectives.minimize_change import MinimizeChangeObjective
            expr_change = MinimizeChangeObjective(logger=logger).build_expression(
                self.model, assignments, shift_assignments, req)
            if expr_change is not None and not isinstance(expr_change, int):
                objective_terms.append(w_change * expr_change)
                objective_desc.append(f"最小变更(×{w_change})")
                self.breakdown.register("change_penalty", expr_change, weight=w_change)

        # O8: Leadership Coverage Soft Penalties
        if (config.get("enable_leadership_coverage", True)
                and hasattr(self, 'solver_context')
                and self.solver_context.leadership_penalty_vars):
            leadership_expr = sum(
                var * weight
                for var, weight in self.solver_context.leadership_penalty_vars
            )
            if leadership_expr is not None and not isinstance(leadership_expr, int):
                objective_terms.append(leadership_expr)
                n_terms = len(self.solver_context.leadership_penalty_vars)
                objective_desc.append(f"管理岗偏好({n_terms}项)")
                # O8 外层权重=1（各 penalty 的 (var, weight) 权重已内嵌）
                self.breakdown.register("leadership_penalty", leadership_expr, weight=1)

        # S3: 透出实际外层权重（result.metrics.objective_breakdown.weights_applied）
        self._objective_weights_applied = {
            "special_impact": w_impact,
            "hours_deviation": w1,
            "special_shifts": w2,
            "night_balance": w3,
            "weekend_balance": w4,
            "triple_salary": w5,
        }

        # Apply combined objective
        if objective_terms:
            self.model.Minimize(sum(objective_terms))
            # S3: obs_total == sum(objective_terms)（lex S6 必需 + 等价自检）。
            # 必须用与 Minimize 完全相同的 objective_terms 列表，逐项一致。
            self.breakdown.finalize_total(objective_terms)
            if callback:
                callback.log_metric("目标函数", f"加权优化: {' + '.join(objective_desc)} ✅")
        else:
            if callback:
                callback.log_metric("目标函数", "未激活 (无目标项)")

    # ──────────────────────────────────────────────
    # Phase 4.5: Solution Hint（S5，软 hint，绝不 fix）
    # ──────────────────────────────────────────────

    def _apply_solution_hint(self, req, config, callback, assignments, shift_assignments):
        """
        注入软 solution hint（10_solver §4，D5 最高优先）。

        - 开关 `enable_solution_hint`（默认 on）。关掉时不注入 → 退化为纯 V4 行为。
        - 来源双层兜底：首选 config.hint.previous_solution，兜底 greedy_hint。
        - 整段 try/except 大包围：任何异常静默降级为「无 hint」，绝不影响求解。
        - 只 AddHint(v, 1)；绝不 fix_variables_to_their_hinted_value；绝不加硬约束。
        """
        try:
            if not config.get("enable_solution_hint", True):
                return

            from core.hint_provider import resolve_hint, apply_hint, _VarsBundle
            bundle = _VarsBundle(assignments=assignments,
                                 shift_assignments=shift_assignments)
            hint, source = resolve_hint(req, config, bundle)
            applied = apply_hint(self.model, bundle, hint)

            logger.info("注入解提示 %d 项（来源=%s）", applied, source)
            if callback and applied > 0:
                # type=INFO，CONSTRAINT 类目，供可视化展示热启动了多少变量
                callback.log_metric("解提示", f"注入解提示 {applied} 项（来源={source}）")
        except Exception as e:
            # 入口大包围 #2（resolve/apply 内部已各自兜底，这里是最外层保险）
            logger.warning("solution hint 注入异常，已静默跳过（退化为无 hint）：%s", e)
            return

    # ──────────────────────────────────────────────
    # Phase 5: Run Solver
    # ──────────────────────────────────────────────

    def _run_solver(self, config, callback, assignments, shift_assignments, vacancy_vars,
                    special_cover_vars, special_shortage_vars):
        """Register variables, start monitor thread, and run CP-SAT."""
        max_time_s = float(config.get("max_time_seconds", 300))
        stagnation_s = float(config.get("stagnation_limit", 90))

        self.solver.parameters.max_time_in_seconds = max_time_s + 10.0

        if callback:
            callback.log_phase("INFO", f"开始搜索 (Max: {max_time_s}s, Stagnate: {stagnation_s}s)...")

            # S4: 注入 breakdown 观测变量到 callback（在 on_solution_callback 里读值）
            callback.set_breakdown(self.breakdown, config)
            # S4: viz telemetry 门控（enable_viz_telemetry=False 时 worker 逐解零额外工作，
            # callback 与 V4 逐指令等价——回归全关档依赖此保证）
            viz_telemetry = bool(config.get("enable_viz_telemetry", True))
            callback.set_viz_telemetry(viz_telemetry)
            if viz_telemetry:
                # S4: 注入 preview 计算所需的变量字典
                callback.set_preview_vars(assignments, vacancy_vars, shift_assignments)

            # Register ALL variables for caching (enables solution recovery after StopSearch)
            callback.register_variables(assignments)
            if shift_assignments:
                callback.register_variables(shift_assignments)
            if vacancy_vars:
                callback.register_variables(vacancy_vars)
            if special_cover_vars:
                callback.register_variables(special_cover_vars)
            if special_shortage_vars:
                callback.register_variables(special_shortage_vars)

            self.stopping_event = threading.Event()
            monitor_thread = threading.Thread(
                target=self._monitor_loop, args=(callback,))
            monitor_thread.start()

            callback.begin_deferred()  # 求解期推送/日志走内存,由 monitor flush(不阻塞 worker)
            _t0 = time.time()
            try:
                status = self.solver.Solve(self.model, callback)
            finally:
                self._phase1_elapsed = time.time() - _t0  # S6: phase-1 实耗（lex 预算用）
                self.stopping_event.set()
                monitor_thread.join()
                callback.end_deferred()  # 发完残留并恢复同步(供后续 final result)
        else:
            self.solver.parameters.max_time_in_seconds = max_time_s
            _t0 = time.time()
            status = self.solver.Solve(self.model)
            self._phase1_elapsed = time.time() - _t0  # S6: phase-1 实耗（lex 预算用）

        return status

    def _monitor_loop(self, cb):
        """Background thread: 每秒 flush 求解期积压的进度/日志、检查停止条件;轮询后端每 5s。"""
        last_heartbeat = time.time()

        while not self.stopping_event.is_set():
            time.sleep(1.0)

            try:
                # 把求解线程攒下的进度/日志实际发出去(HTTP 在本线程,不阻塞 CP-SAT worker)
                cb.flush()

                if cb.should_stop:
                    return

                now = time.time()
                # S6: 超时基准用 phase_start_time（单阶段==start_time；lex phase-2 由 reset_phase2 重置）。
                elapsed = now - cb.phase_start_time
                stagnation = now - cb.last_solution_time

                if now - last_heartbeat > 5.0:
                    cb.log_heartbeat()
                    # S4: search_stats 心跳（每 5s 搭载一次）
                    cb.emit_search_stats()
                    last_heartbeat = now

                if elapsed > cb.max_time_seconds:
                    cb.request_stop(f"⏰ Reached Max Time Limit ({cb.max_time_seconds}s)")
                    return

                if cb.best_objective != float('inf') and stagnation > cb.stagnation_limit:
                    cb.request_stop(f"📉 Stagnation detected ({stagnation:.1f}s > {cb.stagnation_limit}s)")
                    return

                # 轮询后端停止信号:每 poll_interval(5s)一次,而非每秒(P1-12)
                if now - cb.last_poll_time > cb.poll_interval:
                    cb.last_poll_time = now
                    if cb.poll_server_stop():
                        cb.request_stop("🛑 Received Manual Stop Signal from server")
                        return
            except Exception as e:
                # 监控线程绝不能因偶发异常(网络抖动/序列化错误)整条退出——否则心跳与停止轮询双双失联,
                # updated_at 停滞会触发后端 reaper 误判。吞掉单次迭代异常,下一秒继续。
                logger.warning(f"[Monitor] 本轮监控迭代异常,已跳过: {e}")

    # ──────────────────────────────────────────────
    # Result Handling
    # ──────────────────────────────────────────────

    def _handle_result(self, status, callback, assignments, shift_assignments,
                       req, shift_index, vacancy_vars, solver_override=None):
        """Process solver status, extract solution or return error.

        S6: solver_override 非 None 时（lex phase-2 成功），一律从该 solver 读值；
        None 时读 self.solver（phase-1，含 lex 回退路径，§5.5）。
        """
        # S6: 读值 solver——phase-2 成功用 override，否则 phase-1。
        read_solver = solver_override if solver_override is not None else self.solver
        status_name = self.solver.StatusName(status)
        logger.info(f"Solve Finished. Status: {status_name}")

        if callback:
            if status == cp_model.INFEASIBLE:
                callback.log("[FAILED] ❌ 无法找到可行解 (INFEASIBLE)")
                callback.log_section("建议", [
                    "1. 资源不足: 某个时段需求人数 > 可用人数",
                    "2. 规则冲突: 约束过于严格",
                    "💡 建议: 尝试在高级设置中临时关闭部分约束重试"
                ])
            elif status == cp_model.MODEL_INVALID:
                callback.log("[ERROR] ❌ 模型构建错误 (MODEL_INVALID)")

        # Robust Status Handling
        has_solver_solution = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        has_callback_solution = callback and callback.solution_count > 0
        has_cached_solution = callback and len(callback.cached_solution) > 0

        final_status = status
        if not has_solver_solution and has_callback_solution:
            logger.info(f"⚠️ Solver status is {status_name}, but Callback has {callback.solution_count} solutions. Forcing FEASIBLE.")
            final_status = cp_model.FEASIBLE
            status_name = "FEASIBLE (Forced)"
            if callback:
                callback.log(f"[INFO] ⏸️ 求解被中断 (或超时)，返回已找到的最佳方案 (Obj: {callback.best_objective})")

        # Extract solution
        if final_status in (cp_model.OPTIMAL, cp_model.FEASIBLE) or has_callback_solution:
            cached_solution = callback.cached_solution if callback else {}

            try:
                result = self._extract_solution(assignments, shift_assignments, req,
                                                final_status, shift_index, vacancy_vars,
                                                cached_solution, solver_override=solver_override)
                if callback:
                    callback.push_final_result(result)
                return result
            except RuntimeError as e:
                if has_cached_solution:
                    logger.warning(f"⚠️ solver.Value() failed, using cached solution instead: {e}")
                    if callback:
                        callback.log(f"[INFO] 使用缓存的解 ({len(cached_solution)} 变量)")
                    result = self._extract_solution(assignments, shift_assignments, req,
                                                    final_status, shift_index, vacancy_vars,
                                                    cached_solution, use_cache_only=True,
                                                    solver_override=solver_override)
                    if callback:
                        callback.push_final_result(result)
                    return result

                logger.error(f"❌ Failed to extract solution values (Solver RuntimeError): {e}")
                if callback:
                    callback.log(f"[ERROR] 无法读取解的具体数值 (RuntimeError)。可能原因：求解器状态 ({status_name}) 不允许访问变量。")

                fallback_result = {
                    "status": "FAILED_TO_EXTRACT",
                    "message": f"Solution found but values inaccessible: {e}",
                    "metrics": {
                        "solution_count": callback.solution_count if callback else 0,
                        "best_objective": callback.best_objective if callback else 0
                    }
                }
                if callback:
                    callback.push_final_result(fallback_result)
                return fallback_result
            except Exception as e:
                logger.exception(f"❌ Unexpected error in extraction: {e}")
                error_result = {"status": "INTERNAL_ERROR", "message": str(e)}
                if callback:
                    callback.push_final_result(error_result)
                return error_result
        else:
            no_solution_result = {
                "status": status_name,
                "schedules": [],
                "unassigned_jobs": []
            }
            # S7: 无解诊断 pass —— 仅 INFEASIBLE 触发（FAILED_TO_EXTRACT / UNKNOWN 等不诊断）。
            # 全程不影响主结果形状（与 V4 INFEASIBLE payload 一致），仅追加 infeasibility_analysis。
            _diag_config = req.config or {}
            if status == cp_model.INFEASIBLE and _diag_config.get("enable_infeasibility_diagnosis", True):
                self._diagnose_infeasibility(req, _diag_config, callback, no_solution_result)
            if callback:
                callback.push_final_result(no_solution_result)
            return no_solution_result

    # ──────────────────────────────────────────────
    # S7: Infeasibility Diagnosis Pass（仅 INFEASIBLE 触发）
    # ──────────────────────────────────────────────

    def _diagnose_infeasibility(self, req, config, callback, result):
        """重建同构诊断模型定位无解组，写实时 DIAGNOSIS + result.infeasibility_analysis。

        全程大包围：诊断异常绝不改变主结果 status/schedules（仍是 V4 形状的 INFEASIBLE）。
        """
        try:
            from core import infeasibility as infeas

            if callback:
                callback.emit_phase("DIAGNOSING")

            diag = infeas.diagnose(req, config, callback)

            # result 落库路径（§6.5）：始终写 infeasibility_analysis（located 反映是否定位到七组）。
            result["infeasibility_analysis"] = infeas.build_infeasibility_analysis(diag)

            if callback:
                # 实时路径 DIAGNOSIS 事件。
                callback.emit_diagnosis(diag)
                groups = diag.get("groups", []) or []
                if groups:
                    callback.log_diagnosis(
                        "无解原因分析",
                        ["[%s] %s 建议：%s" % (g["group"], g["message_zh"], g["suggestion_zh"])
                         for g in groups],
                    )
                else:
                    callback.log_diagnosis(
                        "无解原因分析",
                        ["具体冲突组未能定位（七组之外的约束/数据导致）；建议核对资源是否充足、规则是否过严。"],
                    )
        except Exception as exc:
            logger.warning("无解诊断 pass 异常，主结果不受影响：%s", exc)

    # ──────────────────────────────────────────────
    # Solution Extraction (unchanged logic)
    # ──────────────────────────────────────────────

    def _extract_solution(self, assignments, shift_assignments, req: SolverRequest,
                          status: int, shift_index: ShiftIndex = None,
                          vacancy_vars: dict = None, cached_solution: dict = None,
                          use_cache_only: bool = False, solver_override=None):
        """Extract solution into Unified 'Shift-Anchored' Format.

        S6: solver_override 非 None（lex phase-2 成功）时一律从该 solver 读值；
        None 时读 self.solver（phase-1，含 lex 回退路径，§5.5）。CpSolver.Value() 按变量
        proto 索引解析，Clone 保留索引，故可直接用 phase-1 变量对象向 phase-2 solver 取值。
        """
        # S6: 读值 solver——phase-2 用 override，否则 phase-1。
        read_solver = solver_override if solver_override is not None else self.solver

        if shift_index is None:
            shift_index = ShiftIndex(req)

        if cached_solution is None:
            cached_solution = {}

        def get_var_value(key, var):
            """Get variable value, falling back to cache if solver fails."""
            if use_cache_only:
                return cached_solution.get(key, 0)
            try:
                return read_solver.Value(var)
            except RuntimeError:
                return cached_solution.get(key, 0)

        window_dates = get_date_range(req.window['start_date'], req.window['end_date'])

        # 1. Build Schedule Skeleton (Shifts)
        schedule_map = {}
        schedules = []
        shift_def_map = {s.shift_id: s for s in req.shift_definitions}

        if shift_assignments:
            for (emp_id, date, shift_id), var in shift_assignments.items():
                key = (emp_id, date, shift_id)
                if get_var_value(key, var) == 1:
                    s_def = shift_def_map.get(shift_id)
                    start_ts, end_ts = shift_index.get_shift_interval(date, shift_id)

                    from datetime import timezone
                    start_iso = datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                    end_iso = datetime.fromtimestamp(end_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")

                    entry = {
                        "employee_id": emp_id,
                        "date": date,
                        "shift": {
                            "shift_id": shift_id,
                            "name": s_def.shift_name if s_def else "Unknown",
                            "code": s_def.shift_code if s_def else "?",
                            "start": start_iso,
                            "end": end_iso,
                            "is_night": s_def.is_night_shift if s_def else False
                        },
                        "tasks": []
                    }
                    schedules.append(entry)
                    schedule_map[(emp_id, date, shift_id)] = entry

        # 2. Attach Tasks to Schedules
        unassigned_tasks = []
        op_coverage_cache = {}
        op_map = {op.operation_plan_id: op for op in req.operation_demands}
        assigned_count = 0

        for (op_id, pos_num, emp_id), var in assignments.items():
            key = (op_id, pos_num, emp_id)
            if get_var_value(key, var) == 1:
                assigned_count += 1
                op = op_map.get(op_id)
                if not op:
                    continue

                op_start = parse_iso_to_unix(op.planned_start)
                op_end = parse_iso_to_unix(op.planned_end)

                if op.scheduling_mode == 'FLEXIBLE':
                    attached = False
                    # For flexible tasks, we read from ctx.task_placements
                    # Find exactly which (date, shift) was selected for this task
                    # Only map if this employee also works that specific shift
                    for (p_op_id, date, shift_id), p_var in getattr(self.solver_context, 'task_placements', {}).items():
                        if p_op_id == op_id and get_var_value((p_op_id, date, shift_id), p_var) == 1:
                            if (emp_id, date, shift_id) in schedule_map:
                                task_entry = {
                                    "operation_id": op_id,
                                    "operation_name": op.operation_name,
                                    "batch_code": op.batch_code,
                                    "position_number": pos_num,
                                    # Use the shift's start and end times for the task rendering
                                    "start": schedule_map[(emp_id, date, shift_id)]["shift"]["start"],
                                    "end": schedule_map[(emp_id, date, shift_id)]["shift"]["end"]
                                }
                                schedule_map[(emp_id, date, shift_id)]["tasks"].append(task_entry)
                                attached = True
                            break
                            
                    if not attached:
                        logger.warning(f"⚠️ Flexible Task {op_id} assigned to Emp {emp_id} but NO matching Placement Shift found! (Orphaned Task)")
                        unassigned_tasks.append({
                            "operation_id": op_id,
                            "position_number": pos_num,
                            "employee_id": emp_id,
                            "reason": "No covering placement shift assigned"
                        })
                else:
                    if op_id not in op_coverage_cache:
                        op_coverage_cache[op_id] = shift_index.get_covering_shifts(op_start, op_end, window_dates)

                    valid_keys = op_coverage_cache[op_id]

                    attached = False
                    for (date, shift_id) in valid_keys:
                        if (emp_id, date, shift_id) in schedule_map:
                            task_entry = {
                                "operation_id": op_id,
                                "operation_name": op.operation_name,
                                "batch_code": op.batch_code,
                                "position_number": pos_num,
                                "start": op.planned_start,
                                "end": op.planned_end
                            }
                            schedule_map[(emp_id, date, shift_id)]["tasks"].append(task_entry)
                            attached = True
                            break

                    if not attached:
                        logger.warning(f"⚠️ Task {op_id} assigned to Emp {emp_id} but NO matching Shift found! (Orphaned Task)")
                        unassigned_tasks.append({
                            "operation_id": op_id,
                            "position_number": pos_num,
                            "employee_id": emp_id,
                            "reason": "No covering shift assigned"
                        })

        # 3. Metrics
        status_str = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"

        # S6: lex phase-2 成功时读 phase-2 solver 的 objective/bound（§5.2 数值来源明确）。
        objective_value = read_solver.ObjectiveValue()
        best_bound = read_solver.BestObjectiveBound()

        # Calculate optimality gap
        gap_percent = 0.0
        if abs(objective_value) > 1e-6:
            gap_percent = 100.0 * abs(objective_value - best_bound) / abs(objective_value)
        else:
            gap_percent = 0.0 if abs(objective_value - best_bound) < 1e-6 else 100.0

        total_deviation = None
        if objective_value is not None and objective_value > 0:
            total_deviation = objective_value / 100.0

        total_positions = sum(op.required_people for op in req.operation_demands)
        vacant_count = 0
        if vacancy_vars:
            for key, var in vacancy_vars.items():
                if get_var_value(key, var) == 1:
                    vacant_count += 1

        fill_rate = 100.0
        if total_positions > 0:
            fill_rate = ((total_positions - vacant_count) / total_positions) * 100.0

        special_cover_vars = getattr(self.solver_context, "special_cover_vars", {}) or {}
        special_shortage_vars = getattr(self.solver_context, "special_shortage_vars", {}) or {}
        special_shift_assignments = []
        special_shift_shortages = []
        requirement_map = {requirement.occurrence_id: requirement for requirement in req.special_shift_requirements}

        for (occurrence_id, employee_id), var in special_cover_vars.items():
            if get_var_value((occurrence_id, employee_id), var) != 1:
                continue
            requirement = requirement_map.get(occurrence_id)
            if requirement is None:
                continue
            special_shift_assignments.append({
                "occurrence_id": occurrence_id,
                "employee_id": employee_id,
                "date": requirement.date,
                "shift_id": requirement.shift_id,
            })

        for occurrence_id, var in special_shortage_vars.items():
            shortage_people = int(get_var_value(occurrence_id, var))
            if shortage_people <= 0:
                continue
            special_shift_shortages.append({
                "occurrence_id": occurrence_id,
                "shortage_people": shortage_people,
            })

        # 4. Share Group Compliance Check
        share_group_compliance = []
        if req.shared_preferences:
            for group in req.shared_preferences:
                members = group.members
                if len(members) < 2:
                    continue

                member_teams = {}
                for m in members:
                    op_id = m["operation_plan_id"]
                    assigned_emps = set()
                    for (o, p, e), var in assignments.items():
                        if o == op_id and get_var_value((o, p, e), var) == 1:
                            assigned_emps.add(e)
                    member_teams[op_id] = assigned_emps

                sorted_members = sorted(members, key=lambda x: x.get("required_people", 0))
                compliant = True
                violations = []

                for i in range(len(sorted_members)):
                    for j in range(i + 1, len(sorted_members)):
                        team_i = member_teams.get(sorted_members[i]["operation_plan_id"], set())
                        team_j = member_teams.get(sorted_members[j]["operation_plan_id"], set())
                        size_i = sorted_members[i].get("required_people", 1)
                        size_j = sorted_members[j].get("required_people", 1)

                        if size_i < size_j:
                            if not team_i.issubset(team_j):
                                compliant = False
                                violations.append(
                                    f"Op{sorted_members[i]['operation_plan_id']} ⊄ Op{sorted_members[j]['operation_plan_id']}")
                        else:
                            if team_i != team_j:
                                compliant = False
                                violations.append(
                                    f"Op{sorted_members[i]['operation_plan_id']} ≠ Op{sorted_members[j]['operation_plan_id']}")

                share_group_compliance.append({
                    "group_id": group.share_group_id,
                    "group_name": group.share_group_name,
                    "compliant": compliant,
                    "violations": violations,
                    "teams": {str(op_id): sorted(list(emps)) for op_id, emps in member_teams.items()}
                })

        metrics = {
            "assigned_count": assigned_count,
            "scheduled_shifts": len(schedules),
            "total_deviation_hours": total_deviation,
            "objective_value": objective_value,
            "best_bound": best_bound,
            "gap": round(gap_percent, 2),
            "vacant_positions": vacant_count,
            "total_positions": total_positions,
            "fill_rate": round(fill_rate, 2),
            "special_shift_shortage_total": sum(item["shortage_people"] for item in special_shift_shortages),
        }

        # S3: objective_breakdown（冻结路径 result.metrics.objective_breakdown）。
        # 仅 enable_objective_breakdown=true（默认）且本次构建了观测变量时存在；否则省略键。
        if self.breakdown is not None and self.breakdown.enabled:
            def _obs_value(obs_var):
                # 观测变量不在 cached_solution（按原始变量键缓存），用 read_solver.Value；
                # S6: lex phase-2 成功时 read_solver=phase2_solver，读到的是 phase-2 的真实分量值。
                # use_cache_only / RuntimeError 时退 0（极端中断路径，breakdown 退化）。
                if use_cache_only:
                    return 0
                try:
                    return read_solver.Value(obs_var)
                except RuntimeError:
                    return 0
            ob = self.breakdown.build_metrics_breakdown(
                _obs_value, self._objective_weights_applied
            )
            if ob is not None:
                metrics["objective_breakdown"] = ob

        return {
            "status": status_str,
            "schedules": schedules,
            "unassigned_jobs": unassigned_tasks,
            "special_shift_assignments": special_shift_assignments,
            "special_shift_shortages": special_shift_shortages,
            "share_group_compliance": share_group_compliance,
            "metrics": metrics,
        }
