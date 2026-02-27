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

SOLVER_API_URL = os.environ.get("BACKEND_API_URL", "http://localhost:3001/api/v4/scheduling/callback/progress")


class SolverV4:
    def __init__(self):
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # Performance Parameters (Optimized for Multi-core)
        self.solver.parameters.log_search_progress = True
        self.solver.parameters.num_workers = 8
        self.solver.parameters.linearization_level = 2
        self.solver.parameters.symmetry_level = 2

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
        
        # Phase 2: Variables
        result_or_vars = self._build_variables(req, config, callback)
        if isinstance(result_or_vars, dict):
            # Early exit (INFEASIBLE due to no candidates)
            return result_or_vars
        assignments, vacancy_vars, shift_assignments, index, shift_index = result_or_vars

        # Phase 3: Constraints
        self._apply_constraints(req, config, callback, assignments, vacancy_vars,
                                shift_assignments, index, shift_index)

        # Phase 4: Objectives
        self._build_objectives(req, config, callback, assignments, vacancy_vars,
                               shift_assignments)

        # Phase 5: Solve
        status = self._run_solver(config, callback, assignments, shift_assignments, vacancy_vars)

        # Phase 6: Result handling
        return self._handle_result(status, callback, assignments, shift_assignments,
                                   req, shift_index, vacancy_vars)

    # ──────────────────────────────────────────────
    # Phase 1: Callback Initialization
    # ──────────────────────────────────────────────

    def _init_callback(self, config: dict):
        """Parse config, create APICallback if run_id exists."""
        max_time_s = float(config.get("max_time_seconds", 300))
        stagnation_s = float(config.get("stagnation_limit", 300))
        
        run_id = None
        if "metadata" in config:
            run_id = config["metadata"].get("run_id")

        callback = None
        if run_id:
            from core.callback import APICallback
            logger.info(f"🔗 Attaching Monitor Callback for Run {run_id} to {SOLVER_API_URL}")
            callback = APICallback(run_id, SOLVER_API_URL,
                                   max_time_seconds=max_time_s,
                                   stagnation_limit=stagnation_s)
            callback.set_solver(self.solver)
            
            # Registry injection (from app.py metadata)
            if "metadata" in config and "registry" in config["metadata"]:
                registry = config["metadata"]["registry"]
                registry[str(run_id)] = callback
                logger.info(f"✅ Registered callback for Run {run_id} in global registry")
        else:
            logger.warning("⚠️ run_id is None. Flexible Stop Strategy limited (No Server Poll).")

        if callback:
            callback.log_section("启动求解器 V4 (Flexible Stop)", [
                f"操作任务: {config.get('_op_count', '?')}",
                f"最大时间: {max_time_s}s",
                f"停滞检测: {stagnation_s}s",
            ])

        return callback, run_id

    # ──────────────────────────────────────────────
    # Phase 2: Variable Creation
    # ──────────────────────────────────────────────

    def _build_variables(self, req: SolverRequest, config: dict, callback):
        """
        Create assignment, vacancy, and shift variables.
        
        Returns:
            (assignments, vacancy_vars, shift_assignments, index, shift_index)
            OR a dict (early exit result) if infeasible.
        """
        assignments = {}
        vacancy_vars = {}
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
                
                if candidates_vars:
                    is_mandatory = op.operation_plan_id in mandatory_ops
                    allow_vacancy = config.get("allow_position_vacancy", False) and not is_mandatory
                    
                    if allow_vacancy:
                        self.model.Add(sum(candidates_vars) <= 1)
                        var_vacant = self.model.NewBoolVar(f"Vacant_Op{op.operation_plan_id}_Pos{pos.position_number}")
                        self.model.Add(sum(candidates_vars) == 0).OnlyEnforceIf(var_vacant)
                        self.model.Add(sum(candidates_vars) >= 1).OnlyEnforceIf(var_vacant.Not())
                        vacancy_vars[(op.operation_plan_id, pos.position_number)] = var_vacant
                    else:
                        self.model.Add(sum(candidates_vars) == 1)
                else:
                    allow_vacancy = config.get("allow_position_vacancy", False)
                    if allow_vacancy:
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
            all_employees = {ep.employee_id for ep in req.employee_profiles}
            
            for date in dates:
                for emp_id in all_employees:
                    for shift in req.shift_definitions:
                        var_name = f"Assign_Shift_{emp_id}_{date}_{shift.shift_id}"
                        shift_assignments[(emp_id, date, shift.shift_id)] = self.model.NewBoolVar(var_name)
                        total_vars += 1
            
            if callback:
                callback.log_metric("班次变量", f"Days {len(dates)} x Emps {len(all_employees)} x Shifts {len(req.shift_definitions)}")

        return assignments, vacancy_vars, shift_assignments, index, shift_index

    # ──────────────────────────────────────────────
    # Phase 3: Constraint Application
    # ──────────────────────────────────────────────

    def _apply_constraints(self, req, config, callback, assignments, vacancy_vars,
                           shift_assignments, index, shift_index):
        """Load and apply all constraint modules based on config toggles."""

        # Build unified context
        ctx = SolverContext(
            model=self.model,
            assignments=assignments,
            index=index,
            shift_assignments=shift_assignments or {},
            shift_index=shift_index,
            vacancy_vars=vacancy_vars or {},
            config=config,
        )

        # --- Core Constraints (no shift dependency) ---
        from constraints.share_group import ShareGroupConstraint
        share_count = 0
        if config.get("enable_share_group", True):
            share_count = ShareGroupConstraint(logger=logger).apply(ctx, req)
        else:
            logger.info("⏩ Skipping ShareGroupConstraint (Disabled)")

        from constraints.unique_employee import UniqueEmployeeConstraint
        unique_count = 0
        if config.get("enable_unique_employee", True):
            unique_count = UniqueEmployeeConstraint(logger=logger).apply(ctx, req)
        else:
            logger.info("⏩ Skipping UniqueEmployeeConstraint (Disabled)")

        if callback:
            callback.log_section("应用硬约束 (从文件加载)", [
                f"共享组: {share_count} (Config: {config.get('enable_share_group', 'ON')})",
                f"一人一岗: {len(req.operation_demands)} Ops (Implicit)",
                f"人员唯一: {unique_count} (Config: {config.get('enable_unique_employee', 'ON')})"
            ])

        from constraints.one_position import OnePositionConstraint
        one_pos_count = 0
        if config.get("enable_one_position", True):
            one_pos_count = OnePositionConstraint(logger=logger).apply(ctx, req)

        from constraints.employee_availability import EmployeeAvailabilityConstraint
        availability_count = 0
        if config.get("enable_employee_availability", True):
            availability_count = EmployeeAvailabilityConstraint(logger=logger).apply(ctx, req)

        # --- Shift-Dependent Constraints ---
        if not shift_assignments:
            return

        from constraints.shift_assignment import ShiftAssignmentConstraint
        shift_count = 0
        if config.get("enable_shift_assignment", True):
            shift_count = ShiftAssignmentConstraint(logger=logger).apply(ctx, req)

        from constraints.prefer_standard_shift import PreferStandardShiftConstraint
        prefer_std_count = 0
        if config.get("enable_prefer_standard_shift", True):
            prefer_std_count = PreferStandardShiftConstraint(logger=logger).apply(ctx, req)

        from constraints.work_days_limit import MaxConsecutiveWorkDaysConstraint
        work_limit_count = 0
        if config.get("enable_max_consecutive_work_days", True):
            work_limit_count = MaxConsecutiveWorkDaysConstraint(logger=logger).apply(ctx, req)

        from constraints.consecutive_rest_limit import MaxConsecutiveRestDaysConstraint
        rest_limit_count = 0
        if config.get("enable_max_consecutive_rest_days", True):
            rest_limit_count = MaxConsecutiveRestDaysConstraint(logger=logger).apply(ctx, req)

        from constraints.standard_hours import StandardHoursConstraint
        standard_hours_count = 0
        if config.get("enable_standard_hours", True):
            standard_hours_count = StandardHoursConstraint(logger=logger).apply(ctx, req)

        from constraints.night_rest import NightRestConstraint
        night_rest_count = 0
        if config.get("enable_night_rest", True):
            night_rest_count = NightRestConstraint(logger=logger).apply(ctx, req)

        from constraints.night_shift_interval import NightShiftIntervalConstraint
        night_interval_count = 0
        if config.get("enable_night_shift_interval", True):
            night_interval_count = NightShiftIntervalConstraint(logger=logger).apply(ctx, req)

        if callback:
            all_employees = {ep.employee_id for ep in req.employee_profiles}
            callback.log_section("排班规则概览", [
                f"✅ 班次分配: {shift_count} 条 (覆盖 {len(all_employees)} 人)",
                f"✅ 标准班优先: {prefer_std_count} 条",
                f"✅ 连续工作限制: {work_limit_count} 条 (Max {req.config.get('max_consecutive_work_days', 6)} 天)",
                f"✅ 连续休息限制: {rest_limit_count} 条 (Max {req.config.get('max_consecutive_rest_days', 4)} 天)",
                f"✅ 标准工时: {standard_hours_count} 条",
                f"✅ 夜班休息: {night_rest_count} 条 (Blocks Enabled)",
                f"✅ 夜班间隔: {night_interval_count} 条 (Min {req.config.get('min_night_shift_interval', 7) - 1} 天)"
            ])

    # ──────────────────────────────────────────────
    # Phase 4: Objective Construction
    # ──────────────────────────────────────────────

    def _build_objectives(self, req, config, callback, assignments, vacancy_vars,
                          shift_assignments):
        """Build multi-objective weighted sum and apply to model."""
        objective_terms = []
        objective_desc = []

        # O0: Vacancy Minimization (highest priority, built-in weights)
        if config.get("allow_position_vacancy", False) and vacancy_vars:
            from objectives.minimize_vacancies import MinimizeVacanciesObjective
            
            op_metadata = {}
            for op in req.operation_demands:
                try:
                    dt_str = op.planned_start.replace('Z', '+00:00')
                    start_dt = datetime.fromisoformat(dt_str)
                    op_metadata[op.operation_plan_id] = {
                        'date': start_dt.strftime('%Y-%m-%d'),
                        'start_hour': start_dt.hour,
                        'required_people': op.required_people
                    }
                except Exception as e:
                    logger.warning(f"Failed to parse date for op {op.operation_plan_id}: {e}")
            
            obj0 = MinimizeVacanciesObjective(logger=logger)
            expr0 = obj0.build_expression(self.model, vacancy_vars, req, op_metadata)
            
            if expr0 is not None:
                objective_terms.append(expr0)
                objective_desc.append(f"岗位填报(优先)")

        # Weights
        w1 = int(config.get("objective_weight_deviation", 1))
        w2 = int(config.get("objective_weight_special_shifts", 100))
        w3 = int(config.get("objective_weight_night_balance", 5))

        # O1: Hours Deviation
        if config.get("enable_minimize_deviation", True) and shift_assignments:
            from objectives.minimize_deviation import MinimizeHoursDeviationObjective
            expr1 = MinimizeHoursDeviationObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr1 is not None and not isinstance(expr1, int):
                objective_terms.append(w1 * expr1)
                objective_desc.append(f"工时偏差(×{w1})")

        # O2: Special Shifts Count
        if config.get("enable_minimize_special_shifts", True) and shift_assignments:
            from objectives.minimize_special_shifts import MinimizeSpecialShiftsObjective
            expr2 = MinimizeSpecialShiftsObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr2 is not None and not isinstance(expr2, int):
                objective_terms.append(w2 * expr2)
                objective_desc.append(f"特殊班次(×{w2})")

        # O3: Balance Night Shifts
        if config.get("enable_balance_night_shifts", True) and shift_assignments:
            from objectives.balance_night_shifts import BalanceNightShiftsObjective
            expr3 = BalanceNightShiftsObjective(logger=logger).build_expression(
                self.model, shift_assignments, req)
            if expr3 is not None and not isinstance(expr3, int):
                objective_terms.append(w3 * expr3)
                objective_desc.append(f"夜班均衡(×{w3})")

        # Apply combined objective
        if objective_terms:
            self.model.Minimize(sum(objective_terms))
            if callback:
                callback.log_metric("目标函数", f"加权优化: {' + '.join(objective_desc)} ✅")
        else:
            if callback:
                callback.log_metric("目标函数", "未激活 (无目标项)")

    # ──────────────────────────────────────────────
    # Phase 5: Run Solver
    # ──────────────────────────────────────────────

    def _run_solver(self, config, callback, assignments, shift_assignments, vacancy_vars):
        """Register variables, start monitor thread, and run CP-SAT."""
        max_time_s = float(config.get("max_time_seconds", 300))
        stagnation_s = float(config.get("stagnation_limit", 300))

        self.solver.parameters.max_time_in_seconds = max_time_s + 10.0

        if callback:
            callback.log_phase("INFO", f"开始搜索 (Max: {max_time_s}s, Stagnate: {stagnation_s}s)...")

            # Register ALL variables for caching (enables solution recovery after StopSearch)
            callback.register_variables(assignments)
            if shift_assignments:
                callback.register_variables(shift_assignments)
            if vacancy_vars:
                callback.register_variables(vacancy_vars)

            self.stopping_event = threading.Event()
            monitor_thread = threading.Thread(
                target=self._monitor_loop, args=(callback,))
            monitor_thread.start()

            try:
                status = self.solver.Solve(self.model, callback)
            finally:
                self.stopping_event.set()
                monitor_thread.join()
        else:
            self.solver.parameters.max_time_in_seconds = max_time_s
            status = self.solver.Solve(self.model)

        return status

    def _monitor_loop(self, cb):
        """Background thread: monitors stop conditions with 5s heartbeat."""
        last_heartbeat = time.time()

        while not self.stopping_event.is_set():
            time.sleep(1.0)

            if cb.should_stop:
                return

            now = time.time()
            elapsed = now - cb.start_time
            stagnation = now - cb.last_solution_time

            if now - last_heartbeat > 5.0:
                cb.log_heartbeat()
                last_heartbeat = now

            if elapsed > cb.max_time_seconds:
                cb.request_stop(f"⏰ Reached Max Time Limit ({cb.max_time_seconds}s)")
                return

            if cb.best_objective != float('inf') and stagnation > cb.stagnation_limit:
                cb.request_stop(f"📉 Stagnation detected ({stagnation:.1f}s > {cb.stagnation_limit}s)")
                return

            if cb.poll_server_stop():
                cb.request_stop("🛑 Received Manual Stop Signal from server")
                return

    # ──────────────────────────────────────────────
    # Result Handling
    # ──────────────────────────────────────────────

    def _handle_result(self, status, callback, assignments, shift_assignments,
                       req, shift_index, vacancy_vars):
        """Process solver status, extract solution or return error."""
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
                                                cached_solution)
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
                                                    cached_solution, use_cache_only=True)
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
            if callback:
                callback.push_final_result(no_solution_result)
            return no_solution_result

    # ──────────────────────────────────────────────
    # Solution Extraction (unchanged logic)
    # ──────────────────────────────────────────────

    def _extract_solution(self, assignments, shift_assignments, req: SolverRequest,
                          status: int, shift_index: ShiftIndex = None,
                          vacancy_vars: dict = None, cached_solution: dict = None,
                          use_cache_only: bool = False):
        """Extract solution into Unified 'Shift-Anchored' Format."""
        if shift_index is None:
            shift_index = ShiftIndex(req)

        if cached_solution is None:
            cached_solution = {}

        def get_var_value(key, var):
            """Get variable value, falling back to cache if solver fails."""
            if use_cache_only:
                return cached_solution.get(key, 0)
            try:
                return self.solver.Value(var)
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
                        "employee_id": emp_id,
                        "reason": "No covering shift assigned"
                    })

        # 3. Metrics
        status_str = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"

        objective_value = self.solver.ObjectiveValue()
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

        return {
            "status": status_str,
            "schedules": schedules,
            "unassigned_jobs": unassigned_tasks,
            "metrics": {
                "assigned_count": assigned_count,
                "scheduled_shifts": len(schedules),
                "total_deviation_hours": total_deviation,
                "objective_value": objective_value,
                "vacant_positions": vacant_count,
                "total_positions": total_positions,
                "fill_rate": round(fill_rate, 2)
            }
        }
