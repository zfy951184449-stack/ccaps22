import time
import requests
import json
from ortools.sat.python import cp_model
from utils.logger import get_logger

logger = get_logger("Callback")

class APICallback(cp_model.CpSolverSolutionCallback):
    """
    CP-SAT Solution Callback that pushes progress to Backend API.
    Also handles:
    1. Dynamic Time Limit (Stagnation Detection)
    2. Manual Interrupt (Server Status Polling)
    
    IMPORTANT: StopSearch() must be called from within this callback to work reliably.
    """

    def __init__(self, run_id, api_url, log_search_progress=True, max_time_seconds=300, stagnation_limit=60):
        cp_model.CpSolverSolutionCallback.__init__(self)
        self.run_id = run_id
        self.api_url = api_url
        self.log_search_progress = log_search_progress
        
        # Stop Strategy Config
        self.max_time_seconds = max_time_seconds
        self.stagnation_limit = stagnation_limit
        
        # State
        self.solution_count = 0
        self.start_time = time.time()
        self.last_solution_time = time.time()
        self.best_objective = float('inf')
        
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
        self.poll_interval = 1.0 # Check server every 1s
        
        # Construct Status Check URL
        base_url = api_url.split("/callback/progress")[0]
        self.status_url = f"{base_url}/runs/{run_id}/status"

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
            
        # Update Best & Stagnation Timer
        if obj_value < self.best_objective:
            self.best_objective = obj_value
            self.last_solution_time = current_time # Reset stagnation timer on improvement
            
            # 🔧 CRITICAL: Cache all variable values for this best solution
            # This ensures we can extract the solution even after StopSearch()
            self._cache_current_solution()
            
        wall_time = self.WallTime()
        
        # Log locally
        # e.g. [SUCCESS] 发现新方案 #3 | 成本: 1250 | 下限: 1200 | 差距: 4.0% | ⚡️ 1.2s
        log_msg = (f"[SUCCESS] 发现新方案 #{self.solution_count} | 成本: {obj_value:.0f} | "
                   f"理论下限: {best_bound:.0f} | 差距: {gap_percent:.2f}% | ⚡️ {wall_time:.2f}s")
        print(log_msg)

        # Push to API
        self.push_progress(
            status="RUNNING",
            progress=None, 
            metrics={
                "solution_count": self.solution_count,
                "objective_value": obj_value,
                "best_bound": best_bound,
                "gap": gap_percent,
                "wall_time": wall_time
            },
            log_line=log_msg,
            type="SOLUTION"
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
        elapsed = now - self.start_time
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

    def push_progress(self, status, progress=None, metrics=None, message=None, log_line=None, type="STATUS"):
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
                requests.post(self.api_url, json=payload, timeout=2)
                return  # Success, exit
            except requests.exceptions.Timeout:
                if attempt < max_retries:
                    logger.warning(f"Push timeout (attempt {attempt + 1}/{max_retries + 1}), retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Failed to push progress after {max_retries + 1} attempts: Timeout")
            except Exception as e:
                # For non-timeout errors, fail immediately
                logger.error(f"Failed to push progress: {e}")
                return
            
    def poll_server_stop(self):
        """Check if server requested stop."""
        try:
            resp = requests.get(self.status_url, timeout=1)
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
        
        self.push_progress(
            status=final_status,
            progress=100,
            metrics=metrics,
            message=f"Solve finished: {status_str}",
            log_line=log_msg,
            type="FINAL"
        )
        
        # Also push the full result for result_summary
        self._push_result_summary(result)
    
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
            resp = requests.post(result_url, json=payload, timeout=30)
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
        self.log(f"[DIAG] 🔍 {title}")
        self.log(f"[DIAG] ══════════════════════════════════")
        for i, conflict in enumerate(conflicts, 1):
            self.log(f"[DIAG] ❌ {i}. {conflict}")
        self.log(f"[DIAG] ══════════════════════════════════")
        self.log(f"[DIAG] 💡 建议: 尝试在高级设置中关闭上述约束类别后重试")
