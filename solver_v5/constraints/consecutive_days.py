"""
Consecutive Days Constraint Module (Unified)

Consolidates MaxConsecutiveWorkDays and MaxConsecutiveRestDays into a single
module with shared daily-work-expression construction and two independently
toggled sub-rules:

  1. Work Limit (enable_max_consecutive_work_days)
     - Sliding window: in any (limit+1) consecutive days, sum(working) <= limit
     - Boundary handling via historical_shifts (consecutive_work_days)

  2. Rest Limit (enable_max_consecutive_rest_days)
     - Sliding window: in any (limit+1) consecutive days, sum(working) >= 1
     - Boundary handling via historical_shifts (consecutive_rest_days) [NEW]

Both sub-rules share:
  - is_working_shift_map construction (built once)
  - emp_date_vars grouping (built once)
  - daily_working_exprs construction per employee (built once, reused)
"""

from ortools.sat.python import cp_model
from typing import Dict, List, Set
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class ConsecutiveDaysConstraint(BaseConstraint):
    """Unified consecutive work/rest days constraint."""

    name = "ConsecutiveDays"
    # No config_key — always execute; sub-rules gated by their own toggles.
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments

        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        cfg = data.config or {}
        do_work = cfg.get("enable_max_consecutive_work_days", True)
        do_rest = cfg.get("enable_max_consecutive_rest_days", True)

        if not do_work and not do_rest:
            self.log("Both work/rest sub-rules disabled. Skipping.")
            return 0

        # ── Shared Initialization ───────────────────────────────────────

        # 1. Classify shifts
        is_working_shift_map: Dict[int, bool] = {}
        for s in (data.shift_definitions or []):
            is_working_shift_map[s.shift_id] = (s.nominal_hours > 0.01)

        # Diagnostic: check if REST shift exists
        has_rest = any(not v for v in is_working_shift_map.values())
        if not has_rest and do_work:
            self.log(
                "[CONFLICT] No 'REST' shift defined (nominal_hours <= 0.01). "
                "All shifts count as working. Solver may be INFEASIBLE if window > limit.",
                level="error",
            )

        # 2. Parse window
        if not data.window:
            self.log("No window defined. Skipping.", level="warning")
            return 0

        try:
            w_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            w_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
            total_days = (w_end - w_start).days + 1
        except Exception as e:
            self.log(f"Window parse error: {e}", level="error")
            return 0

        # 3. Group shift vars by (employee, date) — working shifts only
        emp_date_vars: Dict[int, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for (emp_id, date, shift_id), var in shift_assignments.items():
            if is_working_shift_map.get(shift_id, True):
                emp_date_vars[emp_id][date].append(var)

        # 4. Build daily work expressions per employee (shared across sub-rules)
        #    daily_map[emp_id] = list of expressions (0 or sum(vars)) for each day
        daily_map: Dict[int, List] = {}
        for emp_id, date_vars in emp_date_vars.items():
            exprs = []
            for i in range(total_days):
                day_str = (w_start + timedelta(days=i)).strftime("%Y-%m-%d")
                vars_today = date_vars.get(day_str, [])
                exprs.append(0 if not vars_today else sum(vars_today))
            daily_map[emp_id] = exprs

        # Run diagnostics
        if do_work:
            self._detect_unavoidable_conflicts(data, cfg)

        # ── Sub-rules ────────────────────────────────────────────────────

        total = 0

        if do_work:
            work_limit = self._safe_int(cfg, "max_consecutive_work_days", 6)
            self.log(f"Work sub-rule: max {work_limit} consecutive working days.")
            n = self._apply_work_limit(model, daily_map, work_limit)
            n += self._apply_work_boundary(
                model, shift_assignments, data, work_limit, is_working_shift_map, w_start
            )
            self.log(f"  [WorkLimit] {n} constraints")
            total += n

        if do_rest:
            rest_limit = self._safe_int(cfg, "max_consecutive_rest_days", 4)
            self.log(f"Rest sub-rule: max {rest_limit} consecutive rest days.")
            n = self._apply_rest_limit(model, daily_map, rest_limit)
            n += self._apply_rest_boundary(
                model, shift_assignments, data, rest_limit, is_working_shift_map, w_start
            )
            self.log(f"  [RestLimit] {n} constraints")
            total += n

        self.log(f"Total consecutive-days constraints: {total}")
        return total

    # ── Sub-rule 1: Work Limit ──────────────────────────────────────────

    def _apply_work_limit(self, model, daily_map, limit) -> int:
        window_size = limit + 1
        count = 0
        for emp_id, exprs in daily_map.items():
            if len(exprs) < window_size:
                continue
            for i in range(len(exprs) - window_size + 1):
                window = exprs[i: i + window_size]
                model.Add(sum(window) <= limit)
                count += 1
        return count

    def _apply_work_boundary(
        self, model, shift_assignments, data, limit, is_working_shift_map, w_start
    ) -> int:
        """If employee worked X consecutive days before window, limit first days."""
        if not hasattr(data, 'historical_shifts') or not data.historical_shifts:
            return 0

        history_map: Dict[int, int] = {}
        for hist in data.historical_shifts:
            if hasattr(hist, 'consecutive_work_days') and hist.consecutive_work_days > 0:
                history_map[hist.employee_id] = hist.consecutive_work_days

        if not history_map:
            return 0

        count = 0
        for emp_id, hist_consecutive in history_map.items():
            remaining = limit - hist_consecutive
            if remaining <= 0:
                # Must rest on day 1
                day_str = w_start.strftime("%Y-%m-%d")
                for sid, is_work in is_working_shift_map.items():
                    if is_work:
                        var = shift_assignments.get((emp_id, day_str, sid))
                        if var is not None:
                            model.Add(var == 0)
                            count += 1
                self.log(f"[Boundary-Work] Emp {emp_id}: hist={hist_consecutive} >= limit={limit}, day 1 MUST rest")
            else:
                window_size = remaining + 1
                work_vars = []
                for offset in range(window_size):
                    day_str = (w_start + timedelta(days=offset)).strftime("%Y-%m-%d")
                    for sid, is_work in is_working_shift_map.items():
                        if is_work and (emp_id, day_str, sid) in shift_assignments:
                            work_vars.append(shift_assignments[(emp_id, day_str, sid)])
                if work_vars:
                    model.Add(sum(work_vars) <= remaining)
                    count += 1
                    self.log(f"[Boundary-Work] Emp {emp_id}: hist={hist_consecutive}, first {window_size} days <= {remaining} work")

        return count

    # ── Sub-rule 2: Rest Limit ──────────────────────────────────────────

    def _apply_rest_limit(self, model, daily_map, limit) -> int:
        window_size = limit + 1
        count = 0
        for emp_id, exprs in daily_map.items():
            if len(exprs) < window_size:
                continue
            for i in range(len(exprs) - window_size + 1):
                window = exprs[i: i + window_size]
                model.Add(sum(window) >= 1)
                count += 1
        return count

    def _apply_rest_boundary(
        self, model, shift_assignments, data, limit, is_working_shift_map, w_start
    ) -> int:
        """
        NEW: If employee rested X consecutive days before window, limit first days.
        Mirror logic of _apply_work_boundary but for rest direction.
        """
        if not hasattr(data, 'historical_shifts') or not data.historical_shifts:
            return 0

        history_map: Dict[int, int] = {}
        for hist in data.historical_shifts:
            if hasattr(hist, 'consecutive_rest_days') and hist.consecutive_rest_days > 0:
                history_map[hist.employee_id] = hist.consecutive_rest_days

        if not history_map:
            return 0

        count = 0
        for emp_id, hist_rest in history_map.items():
            remaining = limit - hist_rest
            if remaining <= 0:
                # Must work on day 1
                day_str = w_start.strftime("%Y-%m-%d")
                work_vars = []
                for sid, is_work in is_working_shift_map.items():
                    if is_work:
                        var = shift_assignments.get((emp_id, day_str, sid))
                        if var is not None:
                            work_vars.append(var)
                if work_vars:
                    model.Add(sum(work_vars) >= 1)
                    count += 1
                self.log(f"[Boundary-Rest] Emp {emp_id}: hist_rest={hist_rest} >= limit={limit}, day 1 MUST work")
            else:
                # In the first (remaining + 1) days, at least one must be working
                window_size = remaining + 1
                work_vars = []
                for offset in range(window_size):
                    day_str = (w_start + timedelta(days=offset)).strftime("%Y-%m-%d")
                    for sid, is_work in is_working_shift_map.items():
                        if is_work and (emp_id, day_str, sid) in shift_assignments:
                            work_vars.append(shift_assignments[(emp_id, day_str, sid)])
                if work_vars:
                    model.Add(sum(work_vars) >= 1)
                    count += 1
                    self.log(f"[Boundary-Rest] Emp {emp_id}: hist_rest={hist_rest}, first {window_size} days must include >= 1 work")

        return count

    # ── Diagnostics ─────────────────────────────────────────────────────

    def _detect_unavoidable_conflicts(self, data: SolverRequest, cfg: dict):
        """Pre-check: detect if any employee is forced to work > limit consecutive days."""
        limit = self._safe_int(cfg, "max_consecutive_work_days", 6)

        # 1. Essential days: employee is the ONLY candidate for a position
        essential_days: Dict[int, Set[str]] = defaultdict(set)
        for op in data.operation_demands:
            date_str = op.planned_start.split("T")[0]
            for pos in op.position_qualifications:
                if len(pos.candidate_employee_ids) == 1:
                    essential_days[pos.candidate_employee_ids[0]].add(date_str)

        for emp_id, days in essential_days.items():
            sorted_dates = sorted(days)
            if not sorted_dates:
                continue
            try:
                date_objs = [datetime.strptime(d, "%Y-%m-%d").date() for d in sorted_dates]
            except ValueError:
                continue

            consecutive = 1
            start_idx = 0
            for i in range(1, len(date_objs)):
                if (date_objs[i] - date_objs[i - 1]).days == 1:
                    consecutive += 1
                else:
                    consecutive = 1
                    start_idx = i
                if consecutive > limit:
                    self.log(
                        f"[CONFLICT] Emp {emp_id} is sole candidate on {consecutive} "
                        f"consecutive days ({date_objs[start_idx]}~{date_objs[i]}). "
                        f"Limit={limit}. Solver may be INFEASIBLE.",
                        level="error",
                    )

        # 2. Pigeonhole capacity check
        if not data.window:
            return
        try:
            w_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            w_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
            total_days = (w_end - w_start).days + 1
            active_emps = len(data.employee_profiles)
            cycle = limit + 1
            max_per_emp = (total_days // cycle) * limit + min(total_days % cycle, limit)
            total_capacity = active_emps * max_per_emp
            total_demand = sum(op.required_people for op in data.operation_demands)
            if total_demand > total_capacity:
                self.log(
                    f"[CONFLICT] Demand ({total_demand}) > Capacity ({total_capacity}). "
                    f"{active_emps} employees, {total_days} days, max {max_per_emp}/emp.",
                    level="error",
                )
        except Exception as e:
            self.log(f"Diagnostic error: {e}", level="warning")

    # ── Utilities ───────────────────────────────────────────────────────

    @staticmethod
    def _safe_int(cfg: dict, key: str, default: int) -> int:
        try:
            return int(cfg.get(key, default))
        except (ValueError, TypeError):
            return default
