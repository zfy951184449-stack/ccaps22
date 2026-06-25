import os
import time
import threading
import requests
import json
from ortools.sat.python import cp_model
from utils.logger import get_logger

logger = get_logger("Callback")

# 求解期积压队列上限：后端长时间不可用时，发送失败的进度/日志会回灌待重试（见 flush）。
# 带上限防无界增长——超限丢最旧、保最新（最新心跳/日志足以刷新 updated_at 维持 reaper 判活）。
MAX_PENDING_BUFFER = 200

class APICallbackV5(cp_model.CpSolverSolutionCallback):
    """
    CP-SAT Solution Callback that pushes progress to Backend API.
    Also handles:
    1. Dynamic Time Limit (Stagnation Detection)
    2. Manual Interrupt (Server Status Polling)
    
    IMPORTANT: StopSearch() must be called from within this callback to work reliably.
    """

    def __init__(self, run_id, api_url, log_search_progress=True, max_time_seconds=300, stagnation_limit=90):
        cp_model.CpSolverSolutionCallback.__init__(self)
        self.run_id = run_id
        self.api_url = api_url
        self.log_search_progress = log_search_progress

        # 🔐 solver→backend 回调共享密钥（与 backend 的 SOLVER_CALLBACK_SECRET 同值）。
        # backend 的 requireServiceAuth 用 timingSafeEqual 校验 header X-Solver-Callback-Token。
        # 进度 POST / 结果 POST / status 轮询 GET 都带上：status 路由在 backend 同样挂了
        # requireServiceAuth（见 backend/src/routes/schedulingV4.ts 与 docs/pending-decisions.md PD-3），
        # 缺密钥会被 401 拦死。
        self.callback_secret = os.environ.get("SOLVER_CALLBACK_SECRET", "").strip()
        if not self.callback_secret:
            logger.warning(
                "⚠️ SOLVER_CALLBACK_SECRET 未设置：solver→backend 回调将不带 "
                "X-Solver-Callback-Token，新版 backend 会以 401 拒绝回调（进度/结果无法回写）。"
            )

        # Stop Strategy Config
        self.max_time_seconds = max_time_seconds
        self.stagnation_limit = stagnation_limit

        # State
        self.solution_count = 0
        self.start_time = time.time()
        self.last_solution_time = time.time()
        self.best_objective = float('inf')

        # S6: lexicographic 第二阶段预算基准。
        # 单阶段路径 phase_start_time == start_time，monitor 超时判据引用此字段，行为不变。
        # phase-2 由 reset_phase2() 重置为新窗口起点（§5.4：不动 start_time 以免停滞误判）。
        self.phase_start_time = self.start_time

        # 🔧 Solution Caching: Preserve variable values when solver stops
        self._variables_to_cache = {}  # Dict of all variables to track
        self.cached_solution = {}      # Dict[var_key, value] - last best solution values

        # Thread-safe stop flag (set by external monitor thread)
        self.should_stop = False
        self._stop_reason = ""

        # 🔧 Reference to solver for immediate stop
        self._solver = None

        # Polling
        self.last_poll_time = time.time()
        self.poll_interval = 5.0 # 轮询后端停止信号的间隔(P1-12:从 1s 降到 5s)

        # 🔧 异步推送(P0-1):求解期把进度/日志写进内存,由 monitor 线程每秒 flush 实发,
        # 避免在 CP-SAT 求解线程里做同步 HTTP,阻塞 worker。
        self._lock = threading.Lock()
        self._defer_sends = False
        # S4: _latest_solution 扩展为 5-tuple (status, metrics, log_line, incumbent_extra, v5_mode)
        # v5_mode=True 时 flush 用 _send_now_v5，否则沿用 _send_now（backward compat）
        self._latest_solution = None
        self._pending = []             # 其它待发(LOG 等),按序保留

        # Construct Status Check URL
        base_url = api_url.split("/callback/progress")[0]
        self.status_url = f"{base_url}/runs/{run_id}/status"

        # ──────────────────────────────────────────────
        # S4: incumbent.breakdown + preview 下采样 + search_stats
        # ──────────────────────────────────────────────

        # breakdown 观测变量（由 set_breakdown() 从 solver._build_objectives 注入）
        self._breakdown_obs_vars = {}   # key -> IntVar（由 ObjectiveBreakdown.obs_vars 传入）
        self._breakdown_enabled = False

        # preview 下采样配置（由 set_breakdown() 注入；也可用默认值）
        self._snapshot_min_interval = 8.0   # seconds，§1.6 默认 8s
        self._snapshot_top_n = 50           # §1.6 默认 50 条
        self._last_snapshot_time = -999.0   # 上次发 preview 的 wall_time（相对 start_time）
        self._last_snapshot_obj = float('inf')  # 上次发 preview 时的 obj

        # search_stats 缓存（on_solution_callback 里更新，monitor heartbeat 里消费）
        self._last_search_stats = None   # dict {branches, conflicts, booleans} or None

        # preview 计算专用变量字典（由 set_preview_vars() 注入）
        self._preview_assignments = {}
        self._preview_vacancy_vars = {}
        self._preview_shift_assignments = {}

        # viz telemetry 总门控（enable_viz_telemetry，默认 True）。
        # False 时 worker 线程逐解零额外工作（不缓存 search_stats、不算 preview），
        # 使 callback 与 V4 逐指令等价——回归 A 轮（全关档）依赖此保证。
        self._viz_telemetry = True

    def on_solution_callback(self):
        """Called by solver when a solution is found."""
        current_time = time.time()
        self.solution_count += 1
        obj_value = self.ObjectiveValue()
        best_bound = self.BestObjectiveBound()

        # Calculate Gap
        # Gap = |Obj - Bound| / |Obj| (Protect against division by zero)
        gap_percent = 0.0
        if abs(obj_value) > 1e-6:
            gap_percent = 100.0 * abs(obj_value - best_bound) / abs(obj_value)
        else:
            gap_percent = 0.0 if abs(obj_value - best_bound) < 1e-6 else 100.0

        is_best_improvement = obj_value < self.best_objective

        # Update Best & Stagnation Timer
        if is_best_improvement:
            self.best_objective = obj_value
            self.last_solution_time = current_time  # Reset stagnation timer on improvement

            # 🔧 CRITICAL: Cache all variable values for this best solution
            # This ensures we can extract the solution even after StopSearch()
            self._cache_current_solution()

        wall_time = self.WallTime()

        # S4: 更新 search_stats 缓存（在 callback 里安全读，monitor heartbeat 消费）
        # enable_viz_telemetry=False 时跳过（与 V4 逐指令等价，见 __init__ 注释）
        if self._viz_telemetry:
            try:
                self._last_search_stats = {
                    "branches": int(self.NumBranches()),
                    "conflicts": int(self.NumConflicts()),
                    "booleans": int(self.NumBooleans()),
                }
            except Exception:
                pass

        # S4: 读 breakdown 分量值（只在 callback 里 self.Value() 安全调用）
        breakdown_dict = None
        if self._breakdown_enabled and self._breakdown_obs_vars:
            try:
                bd = {}
                for key, obs_var in self._breakdown_obs_vars.items():
                    bd[key] = int(self.Value(obs_var))
                # 补齐不存在分量为 0（保证 9 键完整）
                from core.breakdown import BREAKDOWN_KEYS
                for k in BREAKDOWN_KEYS:
                    if k not in bd:
                        bd[k] = 0
                breakdown_dict = bd
            except Exception as e:
                logger.debug(f"breakdown read failed (non-fatal): {e}")
                breakdown_dict = None

        # S4: preview 下采样（方案 A 轻量聚合）
        preview = self._compute_preview_if_needed(wall_time, obj_value, is_best_improvement)

        # Log locally
        # e.g. [SUCCESS] 发现新方案 #3 | 成本: 1250 | 下限: 1200 | 差距: 4.0% | ⚡️ 1.2s
        log_msg = (f"[SUCCESS] 发现新方案 #{self.solution_count} | 成本: {obj_value:.0f} | "
                   f"理论下限: {best_bound:.0f} | 差距: {gap_percent:.2f}% | ⚡️ {wall_time:.2f}s")
        print(log_msg)

        # S4: 组装 V5 incumbent extra（event=NEW_INCUMBENT，type=SOLUTION）
        metrics = {
            "solution_count": self.solution_count,
            "objective_value": obj_value,
            "best_bound": best_bound,
            "gap": gap_percent,
            "wall_time": wall_time,
        }
        incumbent_obj = {
            "obj": obj_value,
            "bound": best_bound,
            "gap": gap_percent,
            "wall_time": wall_time,
            "solution_count": self.solution_count,
        }
        if breakdown_dict is not None:
            incumbent_obj["breakdown"] = breakdown_dict
        if preview is not None:
            incumbent_obj["preview"] = preview

        if self._breakdown_enabled or preview is not None:
            # V5 路径：发带 incumbent extra 的 V5 事件
            extra = {
                "event": "NEW_INCUMBENT",
                "incumbent": incumbent_obj,
            }
            self._push_solution_v5(
                status="RUNNING",
                metrics=metrics,
                log_line=log_msg,
                extra=extra,
            )
        else:
            # V4 兼容路径（无 breakdown 配置时降级）
            self.push_progress(
                status="RUNNING",
                progress=None,
                metrics=metrics,
                log_line=log_msg,
                type="SOLUTION",
            )
        
        # 0. Optimality Checks (Stop immediately)
        # 0a. Integer Optimality (Gap < 1.0)
        # Since objective is integer, if gap < 1, it's optimal.
        abs_gap = abs(obj_value - best_bound)
        if abs_gap < 0.99:
             self.log(f"✅ 已找到整数最优解 (Gap < 1.0)，停止搜索")
             self.StopSearch()
             return

        # 0b. Optimal Gap Percentage
        is_optimal = gap_percent < 0.01
        if is_optimal:
             self.log(f"✅ 已找到最优解 (Gap {gap_percent:.2f}%)，停止搜索")
             self.StopSearch()
             return

        # ⚠️ CRITICAL: Check stop conditions from WITHIN the callback
        if self._should_stop_now(gap_percent):
            self.log(f"🛑 {self._stop_reason}")
            self.StopSearch()
    
    def log_heartbeat(self):
        """Called by monitor thread to show liveness"""
        wall_time = time.time() - self.start_time
        # Try to get bound if possible (Only reliable inside callback, but we can try)
        # Note: BestObjectiveBound() might not be thread-safe or available outside callback.
        # So we just log time and last best.
        
        best_str = f"{self.best_objective:.0f}" if self.best_objective != float('inf') else "None"
        msg = f"[WAIT] ...已搜索 {wall_time:.1f}s | 当前最佳: {best_str} | 正在尝试突破局部最优..."
        self.log(msg)

    def _should_stop_now(self, current_gap_percent: float = 100.0) -> bool:
        """
        Check if we should stop the search. Called from within on_solution_callback.
        Returns True if any stop condition is met.
        """
        now = time.time()
        # S6: 超时以 phase_start_time 为基准（phase-1 与 phase_start_time==start_time，行为不变；
        #     phase-2 由 reset_phase2 重置成新预算窗口起点，§5.4 防停滞误判）。
        elapsed = now - self.phase_start_time
        stagnation = now - self.last_solution_time

        # 1. External stop signal (set by monitor thread or direct call)
        if self.should_stop:
            self._stop_reason = f"External stop signal received."
            return True

        # 2. Hard Time Limit
        if elapsed > self.max_time_seconds:
            self._stop_reason = f"Reached Max Time Limit ({self.max_time_seconds}s)."
            return True
        
        # 3. Smart Stagnation (Good Enough Early Exit)
        # If Gap < 5% AND Stagnation > 30s (Default)
        if self.best_objective != float('inf'):
            # Rule 1: Deep Stagnation (hard limit)
            if stagnation > self.stagnation_limit:
                self._stop_reason = f"Stagnation detected ({stagnation:.1f}s > {self.stagnation_limit}s)."
                return True
            
            # Rule 2: Smart Stagnation (Good Enough)
            # Thresholds: Gap < 5% and Stagnation > 30s
            smart_gap_threshold = 5.0 
            smart_stagnation_threshold = 30.0
            
            if current_gap_percent < smart_gap_threshold and stagnation > smart_stagnation_threshold:
                self._stop_reason = (f"📉 达到满意解 (Gap {current_gap_percent:.2f}% < {smart_gap_threshold}%) "
                                     f"且 {stagnation:.1f}s 无改进，提前停止")
                return True
        
        return False
    
    def set_solver(self, solver):
        """Set reference to solver for immediate stop capability."""
        self._solver = solver

    def reset_phase2(self, budget):
        """S6: lexicographic 第二阶段进入时重置 monitor 超时基准（10_solver §5.4）。

        重置 phase_start_time / last_solution_time / best_objective / max_time_seconds，
        但**保留** solution_count（phase-2 解继续累加编号），且**不动** start_time
        （start_time 仍是全局墙钟，用于 wall_time 上报；若重置会让 phase-1 记录的
         last_solution_time 相对新基准变「未来时间」→ 停滞值为负/极大 → 错误早退）。

        budget: phase-2 预算秒数。monitor 用 (now - phase_start_time) > max_time_seconds 判超时。
        """
        with self._lock:
            now = time.time()
            self.phase_start_time = now
            self.last_solution_time = now
            self.best_objective = float('inf')
            self.max_time_seconds = float(budget)
            self.should_stop = False
            self._stop_reason = ""
            self.last_poll_time = now
        logger.info("🔁 reset_phase2: phase-2 预算 %.1fs（保留 solution_count=%d）",
                    budget, self.solution_count)


    def register_variables(self, variables_dict: dict):
        """
        Register variables to cache when a new best solution is found.
        Call this BEFORE solve() to enable solution caching.

        Args:
            variables_dict: Dict mapping keys to BoolVar/IntVar objects.
                           Example: assignments dict, shift_assignments dict
        """
        self._variables_to_cache.update(variables_dict)
        logger.info(f"📦 Registered {len(variables_dict)} variables for caching")

    def set_breakdown(self, breakdown, config=None):
        """S4: 注入 ObjectiveBreakdown（由 solver._run_solver 在求解前调用）。

        breakdown: ObjectiveBreakdown 实例（solver.breakdown）。
        config: solve config dict，用于读 snapshot_min_interval / snapshot_top_n。
        """
        if breakdown is None or not breakdown.enabled:
            self._breakdown_enabled = False
            return
        self._breakdown_obs_vars = dict(breakdown.obs_vars)  # key -> IntVar
        self._breakdown_enabled = True
        if config:
            self._snapshot_min_interval = float(config.get("snapshot_min_interval", 8.0))
            self._snapshot_top_n = int(config.get("snapshot_top_n", 50))

    def set_preview_vars(self, assignments, vacancy_vars, shift_assignments):
        """S4: 注入 preview 计算所需的变量字典（由 solver._run_solver 在求解前调用）。

        assignments: {(op_id, pos_num, emp_id): BoolVar}
        vacancy_vars: {(op_id, pos_num): BoolVar}  (1 = vacant)
        shift_assignments: {(emp_id, date, shift_id): BoolVar}
        """
        self._preview_assignments = assignments or {}
        self._preview_vacancy_vars = vacancy_vars or {}
        self._preview_shift_assignments = shift_assignments or {}

    def set_viz_telemetry(self, enabled):
        """S4: viz telemetry 总门控（由 solver._run_solver 按 enable_viz_telemetry 注入）。"""
        self._viz_telemetry = bool(enabled)
    
    def _cache_current_solution(self):
        """
        Cache all registered variable values from the current solution.
        Called from within on_solution_callback when best_objective improves.
        """
        if not self._variables_to_cache:
            return

        new_cache = {}
        for key, var in self._variables_to_cache.items():
            try:
                new_cache[key] = self.Value(var)
            except Exception:
                pass  # Skip variables that can't be read

        self.cached_solution = new_cache
        logger.debug(f"💾 Cached {len(new_cache)} variable values")

    def _compute_preview_if_needed(self, wall_time, obj_value, is_best_improvement):
        """S4: 计算 incumbent.preview（方案 A 轻量聚合）。

        下采样策略（§2.5）：
          (a) 首解（solution_count==1）
          (b) 距上次 preview ≥ snapshot_min_interval 秒
          (c) obj 相对改善 ≥ 5%（相对上次 preview 时的 obj）
        否则返回 None（前端复用上一帧）。

        在 on_solution_callback 内调用（此时 self.Value() 可用），O(vars) 直接数，<1ms。
        无 preview 变量注入时（_preview_vacancy_vars 为空）返回 None。
        """
        # viz telemetry 关闭 / 未注入 preview 变量时跳过
        if not self._viz_telemetry:
            return None
        if not self._preview_assignments and not self._preview_vacancy_vars:
            return None

        elapsed_since_last = wall_time - self._last_snapshot_time
        is_first_solution = (self.solution_count == 1)
        is_time_ok = (elapsed_since_last >= self._snapshot_min_interval)
        rel_improvement = 0.0
        if abs(self._last_snapshot_obj) > 1e-6 and self._last_snapshot_obj != float('inf'):
            rel_improvement = (self._last_snapshot_obj - obj_value) / abs(self._last_snapshot_obj)
        is_improvement_ok = (rel_improvement >= 0.05)

        if not (is_first_solution or is_time_ok or is_improvement_ok):
            return None

        # 更新下采样锚点
        self._last_snapshot_time = wall_time
        self._last_snapshot_obj = obj_value

        # 从 _preview_vacancy_vars / _preview_assignments / _preview_shift_assignments 聚合
        # 在 on_solution_callback 内调用，self.Value() 读当前解，O(vars)，<1ms
        total_positions = len(self._preview_vacancy_vars)
        vacant_count = 0
        scheduled_shifts = 0
        top_assignments = []

        try:
            for key, var in self._preview_vacancy_vars.items():
                if self.Value(var) == 1:
                    vacant_count += 1

            for key, var in self._preview_shift_assignments.items():
                if self.Value(var) == 1:
                    scheduled_shifts += 1

            for key, var in self._preview_assignments.items():
                if self.Value(var) == 1:
                    # key = (op_id, pos_num, emp_id)
                    top_assignments.append(key)

        except Exception as e:
            logger.debug(f"preview compute error (non-fatal): {e}")
            return None

        # fill_rate 计算
        if total_positions > 0:
            fill_rate = round(100.0 * (total_positions - vacant_count) / total_positions, 2)
        else:
            fill_rate = 100.0

        # top_assignments：按 op_id 排序取前 snapshot_top_n 条
        top_assignments.sort(key=lambda x: x[0])
        top_n = self._snapshot_top_n
        top_list = [{"op": a[0], "pos": a[1], "emp": a[2]} for a in top_assignments[:top_n]]

        preview = {
            "fill_rate": fill_rate,
            "vacant_positions": vacant_count,
            "scheduled_shifts": scheduled_shifts,
        }
        if top_list:
            preview["top_assignments"] = top_list
        return preview

    def _push_solution_v5(self, status, metrics, log_line, extra):
        """S4: 发送 V5 SOLUTION 事件（带 incumbent extra）。

        走 deferred 机制（写 _latest_solution 的 5-tuple），monitor flush 时用 _send_now_v5 发。
        _latest_solution = (status, metrics, log_line, extra, True)，True 表示 V5 路径。
        """
        if self._defer_sends:
            with self._lock:
                # 覆盖：只留最新解（P0-4 节流）
                self._latest_solution = (status, metrics, log_line, extra, True)
            return
        self._send_now_v5(status, None, metrics, None, log_line, "SOLUTION", extra)
        
    def request_stop(self, reason: str = "Manual stop requested"):
        """
        Thread-safe method to request solver stop.
        🔧 FIXED: Directly call StopSearch() on solver for immediate stop.
        """
        self.should_stop = True
        self._stop_reason = reason
        logger.info(f"🛑 Stop requested: {reason}")
        
        # 🔧 CRITICAL: Directly call StopSearch on solver if available
        if self._solver:
            try:
                self._solver.StopSearch()
                logger.info(f"✅ StopSearch() called on solver")
            except Exception as e:
                logger.warning(f"⚠️ StopSearch() failed: {e}")

    def _auth_headers(self) -> dict:
        """回调鉴权头：带共享密钥供 backend 的 requireServiceAuth 校验。
        未配置密钥时返回空 dict（保持旧行为，由 backend 决定 401/503）。"""
        if self.callback_secret:
            return {"X-Solver-Callback-Token": self.callback_secret}
        return {}

    def push_progress(self, status, progress=None, metrics=None, message=None, log_line=None, type="STATUS"):
        """求解期(self._defer_sends=True)只把内容写进内存,由 monitor 线程 flush 实发,
        避免在 CP-SAT 求解线程做同步 HTTP 阻塞 worker(P0-1)。其它时候直接同步发。"""
        if self._defer_sends:
            with self._lock:
                if type == "SOLUTION":
                    self._latest_solution = (status, metrics, log_line)  # 覆盖,只留最新(P0-4)
                else:
                    self._pending.append((status, progress, metrics, message, log_line, type))
            return
        self._send_now(status, progress, metrics, message, log_line, type)

    def flush(self):
        """由 monitor 线程每秒调用:把求解期积压的进度/日志实际发出去(节流,最新解只发一条)。

        发送失败(后端 401/500/抖动)不再永久丢弃心跳/日志——回灌 _pending 待下次 flush 重试,
        以保证 updated_at 持续刷新、后端 reaper 判活可靠。一旦本轮出现失败即停止继续发(避免逐条
        timeout 叠加拖死 monitor 线程),整批回灌并裁剪到 MAX_PENDING_BUFFER。"""
        with self._lock:
            sol = self._latest_solution
            self._latest_solution = None
            pend = self._pending
            self._pending = []
        # 解只保留最新一帧,发失败也不回灌(下一个解会刷新)
        if sol is not None:
            if len(sol) == 5 and sol[4] is True:
                # S4 V5 路径：5-tuple (status, metrics, log_line, extra, True)
                status, metrics, log_line, extra, _ = sol
                self._send_now_v5(status, None, metrics, None, log_line, "SOLUTION", extra)
            else:
                # V4 兼容路径：3-tuple (status, metrics, log_line)
                self._send_now(sol[0], metrics=sol[1], log_line=sol[2], type="SOLUTION")
        failed = []
        for args in pend:
            if failed:
                # 本轮已出现失败,其余整批回灌不再逐条重试
                failed.append(args)
                continue
            if len(args) == 7:
                # V5 事件带 extra 字段
                status, progress, metrics, message, log_line, type_, extra = args
                ok = self._send_now_v5(status, progress, metrics, message, log_line, type_, extra)
            else:
                ok = self._send_now(*args)
            if not ok:
                failed.append(args)
        if failed:
            with self._lock:
                self._pending = (failed + self._pending)[-MAX_PENDING_BUFFER:]

    def begin_deferred(self):
        """进入求解期:推送/日志改为写内存(由 monitor flush)。"""
        self._defer_sends = True

    def end_deferred(self):
        """退出求解期:发完残留并恢复同步(之后 final/result_summary 直接发)。"""
        self._defer_sends = False
        self.flush()

    def _send_now_v5(self, status, progress=None, metrics=None, message=None,
                     log_line=None, type="INFO", extra=None):
        """
        发送带 V5 扩展字段的 payload（phase/event/model_stats/incumbent/search_stats）。
        extra dict 会合并进基础 payload，覆盖同名键。
        """
        max_retries = 2
        retry_delay = 0.5

        payload = {
            "run_id": self.run_id,
            "status": status,
            "type": type,
        }
        if progress is not None:
            payload["progress"] = progress
        if metrics:
            payload["metrics"] = metrics
        if message:
            payload["message"] = message
        if log_line:
            payload["log_line"] = log_line
        if extra:
            payload.update(extra)

        for attempt in range(max_retries + 1):
            try:
                requests.post(self.api_url, json=payload, headers=self._auth_headers(), timeout=2)
                return True
            except requests.exceptions.Timeout:
                if attempt < max_retries:
                    logger.warning(f"V5 event push timeout (attempt {attempt + 1}/{max_retries + 1}), retrying...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"V5 event push failed after {max_retries + 1} attempts: Timeout")
                    return False
            except Exception as e:
                logger.error(f"V5 event push failed: {e}")
                return False
        return False

    def _send_now(self, status, progress=None, metrics=None, message=None, log_line=None, type="STATUS"):
        """Sends POST request to backend with retry logic."""
        max_retries = 2
        retry_delay = 0.5  # 500ms

        payload = {
            "run_id": self.run_id,
            "status": status,
            "type": type
        }
        if progress is not None:
            payload["progress"] = progress
        if metrics:
            payload["metrics"] = metrics
        if message:
            payload["message"] = message
        if log_line:
            payload["log_line"] = log_line

        for attempt in range(max_retries + 1):
            try:
                requests.post(self.api_url, json=payload, headers=self._auth_headers(), timeout=2)
                return True  # Success, exit
            except requests.exceptions.Timeout:
                if attempt < max_retries:
                    logger.warning(f"Push timeout (attempt {attempt + 1}/{max_retries + 1}), retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Failed to push progress after {max_retries + 1} attempts: Timeout")
                    return False
            except Exception as e:
                # For non-timeout errors, fail immediately（回灌待重试,不丢弃）
                logger.error(f"Failed to push progress: {e}")
                return False
        return False
            
    def poll_server_stop(self):
        """Check if server requested stop."""
        try:
            resp = requests.get(self.status_url, headers=self._auth_headers(), timeout=1)
            if resp.status_code == 200:
                data = resp.json()
                # If status is STOPPING or STOPPED
                status = data.get("data", {}).get("status")
                if status in ["STOPPING", "STOPPED"]:
                    logger.info(f"🛑 Server requested STOP. Status: {status}")
                    return True
        except Exception:
            pass # Ignore network errors during poll
        return False
    
    # Helper for generic logs
    def log(self, message):
        """Sends a generic log message."""
        print(message)
        self.push_progress(status="RUNNING", log_line=message, type="LOG")

    # --- Structured Logging Helpers (Apple Style) ---

    def log_phase(self, phase, message):
        self.log(f"[{phase}] {message}")

    def log_section(self, title, details=None):
        self.log(f"[INFO]    {title}")
        if details:
            for line in details:
                self.log(f"          - {line}")

    def log_metric(self, name, value):
        self.log(f"[STATUS]  {name}: {value}")

    def push_final_result(self, result: dict):
        """
        Push final solve result to backend via callback endpoint.
        Called by solver.py after _extract_solution.
        This ensures the result is saved even if the main HTTP response fails.
        """
        status_str = result.get("status", "UNKNOWN")
        is_success = status_str in ["OPTIMAL", "FEASIBLE", "FEASIBLE (Forced)"]
        metrics = result.get("metrics", {})
        
        final_status = "COMPLETED" if is_success else "FAILED"
        
        log_msg = (f"[DONE] 求解完成 | 状态: {status_str} | "
                   f"分配: {metrics.get('assigned_count', 0)} | "
                   f"填充率: {metrics.get('fill_rate', 0)}%")
        
        logger.info(f"📤 Pushing final result to backend: {final_status}")

        # 先落 result_summary（/callback/result 内部 saveResults→updateRunStatus 原子地「先存结果再置终态」），
        # 再发 FINAL 进度帧。此前顺序相反：FINAL 帧先把状态打成 COMPLETED，若紧接着 result POST 失败，
        # run 会停在「COMPLETED 但无结果」。调换后终态翻转总是伴随结果落库。
        self._push_result_summary(result)

        self.push_progress(
            status=final_status,
            progress=100,
            metrics=metrics,
            message=f"Solve finished: {status_str}",
            log_line=log_msg,
            type="FINAL"
        )
    
    def _push_result_summary(self, result: dict):
        """
        Push full result JSON to a dedicated endpoint for saving result_summary.
        """
        import json
        # Construct the result callback URL
        base_url = self.api_url.replace("/callback/progress", "")
        result_url = f"{base_url}/callback/result"
        
        payload = {
            "run_id": self.run_id,
            "result": result
        }
        
        try:
            resp = requests.post(result_url, json=payload, headers=self._auth_headers(), timeout=30)
            if resp.status_code == 200:
                logger.info(f"✅ Result summary pushed successfully")
            else:
                logger.warning(f"⚠️ Failed to push result summary: {resp.status_code}")
        except Exception as e:
            logger.error(f"❌ Failed to push result summary: {e}")

    def log_diagnosis(self, title: str, conflicts: list):
        """
        Log IIS diagnosis results with special formatting.
        专用于输出冲突诊断结果，与普通日志区分。
        All output goes to Live Log via push_progress.
        """
        self.log(f"[DIAG] {title}")
        self.log(f"[DIAG] ==============================")
        for i, conflict in enumerate(conflicts, 1):
            self.log(f"[DIAG] {i}. {conflict}")
        self.log(f"[DIAG] ==============================")
        self.log(f"[DIAG] 建议: 尝试在高级设置中关闭上述约束类别后重试")

    # ──────────────────────────────────────────────
    # V5 新增：phase 事件 + model_stats 事件（S2 工单）
    # ──────────────────────────────────────────────

    def emit_search_stats(self):
        """S4: 发送 SEARCH_STATS 事件（由 monitor heartbeat 每 5s 调用一次）。

        search_stats 从 on_solution_callback 里缓存的 _last_search_stats 读取；
        无解时（从未进入 callback）_last_search_stats=None，不发。
        走 deferred 推送（写 _pending），由 monitor flush 实发。
        """
        stats = self._last_search_stats
        if stats is None:
            return
        payload_extra = {
            "event": "SEARCH_STATS",
            "search_stats": stats,
        }
        self._send_v5_event(
            status="RUNNING",
            type="INFO",
            message="SEARCH_STATS: branches=%d conflicts=%d booleans=%d" % (
                stats.get("branches", 0),
                stats.get("conflicts", 0),
                stats.get("booleans", 0),
            ),
            extra=payload_extra,
        )
        logger.debug(f"[SearchStats] branches={stats.get('branches',0)} conflicts={stats.get('conflicts',0)}")

    def emit_phase(self, phase: str):
        """
        发送 PHASE_ENTER 事件（V5 新增）。
        phase: "BUILDING" | "PRESOLVE" | "SOLVING" | "EXTRACTING" | "DIAGNOSING"
        走 deferred 推送（写内存，由 monitor flush）。
        """
        wall_time = time.time() - self.start_time
        payload_extra = {
            "phase": phase,
            "event": "PHASE_ENTER",
        }
        self._send_v5_event(
            status="RUNNING",
            type="INFO",
            message=f"PHASE_ENTER:{phase}",
            extra=payload_extra,
        )
        logger.info(f"[Phase] {phase} (wall_time={wall_time:.2f}s)")

    def emit_model_stats(self, model_stats: dict):
        """
        发送 MODEL_STATS 事件（一次性，BUILDING 末）。
        走 deferred 推送，与普通日志一起由 monitor flush。
        """
        payload_extra = {
            "phase": "BUILDING",
            "event": "MODEL_STATS",
            "model_stats": model_stats,
        }
        self._send_v5_event(
            status="RUNNING",
            type="INFO",
            message=f"MODEL_STATS: vars={model_stats.get('num_vars',0)} ctrs={model_stats.get('num_constraints',0)}",
            extra=payload_extra,
        )
        logger.info(f"[ModelStats] vars={model_stats.get('num_vars',0)} ctrs={model_stats.get('num_constraints',0)}")

    def emit_diagnosis(self, infeasibility: dict):
        """S7: 发送 DIAGNOSIS 事件（仅 INFEASIBLE 诊断 pass）。

        固定 status=FAILED, type=LOG, phase=DIAGNOSING, event=DIAGNOSIS（§6.4 冻结）。
        诊断在主求解结束后调用（此时 deferred 已 end）→ _send_v5_event 直发。
        infeasibility: {"located": bool, "groups": [...]}。
        """
        payload_extra = {
            "phase": "DIAGNOSING",
            "event": "DIAGNOSIS",
            "infeasibility": infeasibility,
        }
        n_groups = len(infeasibility.get("groups", []) or []) if infeasibility else 0
        located = bool(infeasibility.get("located", False)) if infeasibility else False
        self._send_v5_event(
            status="FAILED",
            type="LOG",
            message="DIAGNOSIS: located=%s groups=%d" % (located, n_groups),
            extra=payload_extra,
        )
        logger.info(f"[Diagnosis] located={located} groups={n_groups}")

    def _send_v5_event(self, status: str, type: str, message: str, extra: dict):
        """
        发送带 V5 扩展字段的事件。
        走 deferred 机制（写 _pending），由 monitor flush 实发。
        extra 字段在 _send_now 内合并进 payload。
        """
        if self._defer_sends:
            with self._lock:
                # 保存 (status, progress, metrics, message, log_line, type, extra)
                self._pending.append((status, None, None, message, None, type, extra))
            return
        self._send_now_v5(status, None, None, message, None, type, extra)
