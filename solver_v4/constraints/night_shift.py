"""
Night Shift Constraint Module (Unified)

Consolidates night-shift-related constraints into a single module
with shared initialization (shift classification, historical boundary
index, IsNight aggregation variables) and four independently toggled
sub-rules:

  1. Night Rest (enable_night_rest)
     - After a night shift, forbid all working shifts for min_night_rest days.

  2. No Isolated Night Shift (enable_no_isolated_night_shift)
     - Forbid "rest → night" sequences: a night shift must be preceded
       by a work shift (not rest).

  3. Night Shift Interval (enable_night_shift_interval)
     - Sliding window: at most 1 night shift within min_night_shift_interval
       consecutive days.

  4. Prefer Extended Night Rest (enable_prefer_extended_night_rest)
     - Soft constraint: penalize working shifts on days between
       min_night_rest+1 and preferred_night_rest_days after a night shift.

All sub-rules share:
  - Night / rest / working shift ID classification (built once)
  - Historical night boundary index (built once)
  - IsNight_{emp}_{date} aggregation variables (built once, reused across rules)
"""

from ortools.sat.python import cp_model
from typing import Dict, Set, List, Optional, Tuple
from collections import defaultdict
from datetime import datetime, timedelta
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class NightShiftConstraint(BaseConstraint):
    """Unified night shift constraint with three independently toggled sub-rules."""

    name = "NightShift"
    # No config_key — always execute; individual sub-rules are gated by their own toggles.
    # This preserves backward compatibility with existing frontend config keys.
    default_enabled = True
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments

        if not shift_assignments:
            self.log("Shift assignments not present. Skipping.", level="info")
            return 0

        cfg = data.config or {}

        # Determine which sub-rules are enabled
        do_rest = cfg.get("enable_night_rest", True)
        do_isolated = cfg.get("enable_no_isolated_night_shift", True)
        do_interval = cfg.get("enable_night_shift_interval", True)

        if not do_rest and not do_isolated and not do_interval:
            self.log("All night-shift sub-rules disabled. Skipping.")
            return 0

        # ── Shared Initialization ───────────────────────────────────────

        # 1. Classify shifts
        night_shift_ids: Set[int] = set()
        rest_shift_ids: Set[int] = set()
        working_shift_ids: Set[int] = set()

        for s in (data.shift_definitions or []):
            if s.is_night_shift:
                night_shift_ids.add(s.shift_id)
            if s.nominal_hours > 0.01:
                working_shift_ids.add(s.shift_id)
            else:
                rest_shift_ids.add(s.shift_id)

        if not night_shift_ids:
            self.log("No night shifts defined. Skipping.", level="info")
            return 0

        self.log(f"Night IDs: {night_shift_ids}, Rest IDs: {rest_shift_ids}")

        # 2. Parse window
        if not data.window:
            self.log("No scheduling window. Skipping.", level="warning")
            return 0

        try:
            window_start = datetime.strptime(data.window['start_date'], "%Y-%m-%d").date()
            window_end = datetime.strptime(data.window['end_date'], "%Y-%m-%d").date()
        except (KeyError, ValueError) as e:
            self.log(f"Invalid window format: {e}", level="error")
            return 0

        total_days = (window_end - window_start).days + 1
        all_dates = [
            (window_start + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(total_days)
        ]
        window_date_set: Set[str] = set(all_dates)

        # 3. Collect all employees from shift_assignments
        all_employees: Set[int] = {emp_id for (emp_id, _, _) in shift_assignments.keys()}

        # 4. Build historical night index
        #    hist_night_dates[emp_id] = set of date strings where a historical night occurred
        #    hist_prev_day_is_work[emp_id] = True/False/None for the day before window_start
        interval = int(cfg.get("min_night_shift_interval", 7))
        hist_night_dates: Dict[int, Set[str]] = defaultdict(set)
        prev_day_str = (window_start - timedelta(days=1)).strftime("%Y-%m-%d")
        hist_prev_day_is_work: Dict[int, Optional[bool]] = {}

        if hasattr(data, 'historical_shifts') and data.historical_shifts:
            for hist in data.historical_shifts:
                # For NoIsolated boundary: check exact prev day
                if hist.date == prev_day_str:
                    hist_prev_day_is_work[hist.employee_id] = hist.is_work

                # For NightRest & NightInterval boundary
                if not hist.is_night:
                    continue
                try:
                    hist_date = datetime.strptime(hist.date, "%Y-%m-%d").date()
                except ValueError:
                    continue

                # Note: NightRest looks back x days, NightInterval looks back (interval-1) days
                # Use the larger lookback window to capture all relevant history
                x = int(cfg.get("min_night_rest", 1))
                max_lookback = max(x, interval - 1) if do_interval else x
                days_before = (window_start - hist_date).days
                if 0 < days_before <= max_lookback:
                    hist_night_dates[hist.employee_id].add(hist.date)

        # 5. Build per-employee daily "is_night" expressions (shared across all sub-rules)
        #    is_night_map[(emp_id, date_str)] → BoolVar | 0
        is_night_map: Dict[Tuple[int, str], object] = {}

        for emp_id in all_employees:
            for date_str in all_dates:
                night_vars = [
                    shift_assignments[(emp_id, date_str, sid)]
                    for sid in night_shift_ids
                    if (emp_id, date_str, sid) in shift_assignments
                ]

                if not night_vars:
                    is_night_map[(emp_id, date_str)] = 0
                elif len(night_vars) == 1:
                    is_night_map[(emp_id, date_str)] = night_vars[0]
                else:
                    is_night = model.NewBoolVar(f"IsNight_{emp_id}_{date_str}")
                    model.Add(sum(night_vars) >= 1).OnlyEnforceIf(is_night)
                    model.Add(sum(night_vars) == 0).OnlyEnforceIf(is_night.Not())
                    is_night_map[(emp_id, date_str)] = is_night

        # ── Sub-rules ────────────────────────────────────────────────────

        total = 0

        if do_rest:
            n = self._apply_night_rest(
                model, shift_assignments, cfg, all_employees, all_dates,
                window_start, window_end, window_date_set,
                night_shift_ids, working_shift_ids,
                is_night_map, hist_night_dates,
            )
            self.log(f"  [NightRest] {n} constraints")
            total += n

        if do_isolated:
            n = self._apply_no_isolated(
                model, shift_assignments, all_employees, all_dates,
                total_days, night_shift_ids, rest_shift_ids,
                hist_prev_day_is_work,
            )
            self.log(f"  [NoIsolated] {n} constraints")
            total += n

        if do_interval:
            n = self._apply_interval(
                model, shift_assignments, cfg, all_employees, all_dates,
                total_days, window_start, window_end,
                night_shift_ids, is_night_map, hist_night_dates, interval,
            )
            self.log(f"  [NightInterval] {n} constraints")
            total += n

        # Sub-rule 4: Prefer Extended Night Rest (soft)
        do_extended = cfg.get("enable_prefer_extended_night_rest", True)
        if do_extended and do_rest:
            n = self._apply_prefer_extended_rest(
                model, ctx, shift_assignments, cfg, all_employees, all_dates,
                window_start, window_date_set,
                working_shift_ids, is_night_map, hist_night_dates,
            )
            self.log(f"  [PreferExtendedRest] {n} soft penalty vars")

        self.log(f"Total night-shift constraints: {total}")
        return total

    # ── Sub-rule 1: Night Rest ──────────────────────────────────────────

    def _apply_night_rest(
        self, model, shift_assignments, cfg, all_employees, all_dates,
        window_start, window_end, window_date_set,
        night_shift_ids, working_shift_ids, is_night_map, hist_night_dates,
    ) -> int:
        x = int(cfg.get("min_night_rest", 1))
        count = 0

        # Boundary: historical nights force rest on early window days
        for emp_id in all_employees:
            for hist_date_str in hist_night_dates.get(emp_id, set()):
                try:
                    night_date = datetime.strptime(hist_date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                for offset in range(1, x + 1):
                    rest_date = night_date + timedelta(days=offset)
                    rest_date_str = rest_date.strftime("%Y-%m-%d")
                    if rest_date_str not in window_date_set:
                        continue
                    for shift_id in working_shift_ids:
                        var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                        if var is not None:
                            model.Add(var == 0)
                            count += 1

        # In-window: if night on date D, forbid working on D+1..D+x
        for emp_id in all_employees:
            for d_idx, date_str in enumerate(all_dates):
                is_night = is_night_map.get((emp_id, date_str))
                if is_night is None or isinstance(is_night, int):
                    continue  # No night var → cannot be night

                night_date = window_start + timedelta(days=d_idx)
                for offset in range(1, x + 1):
                    rest_date = night_date + timedelta(days=offset)
                    rest_date_str = rest_date.strftime("%Y-%m-%d")
                    if rest_date_str not in window_date_set:
                        continue
                    for shift_id in working_shift_ids:
                        var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                        if var is not None:
                            model.Add(var == 0).OnlyEnforceIf(is_night)
                            count += 1

        return count

    # ── Sub-rule 2: No Isolated Night Shift ─────────────────────────────

    def _apply_no_isolated(
        self, model, shift_assignments, all_employees, all_dates,
        total_days, night_shift_ids, rest_shift_ids, hist_prev_day_is_work,
    ) -> int:
        count = 0

        for emp_id in all_employees:
            # Boundary: d=0 (first day)
            prev_was_work = hist_prev_day_is_work.get(emp_id)
            if prev_was_work is False:
                for n_sid in night_shift_ids:
                    var = shift_assignments.get((emp_id, all_dates[0], n_sid))
                    if var is not None:
                        model.Add(var == 0)
                        count += 1

            # In-window: d=1..T-1
            for d in range(1, total_days):
                today = all_dates[d]
                yesterday = all_dates[d - 1]
                for n_sid in night_shift_ids:
                    night_var = shift_assignments.get((emp_id, today, n_sid))
                    if night_var is None:
                        continue
                    for r_sid in rest_shift_ids:
                        rest_var = shift_assignments.get((emp_id, yesterday, r_sid))
                        if rest_var is None:
                            continue
                        model.Add(night_var + rest_var <= 1)
                        count += 1

        return count

    # ── Sub-rule 3: Night Shift Interval ────────────────────────────────

    def _apply_interval(
        self, model, shift_assignments, cfg, all_employees, all_dates,
        total_days, window_start, window_end,
        night_shift_ids, is_night_map, hist_night_dates, interval,
    ) -> int:
        if interval < 2:
            self.log(f"Interval {interval} too small (min 2). Skipping.", level="warning")
            return 0

        count = 0

        for emp_id in all_employees:
            # Build daily expressions list for sliding window
            daily_night_exprs = [
                is_night_map.get((emp_id, d), 0) for d in all_dates
            ]

            # Boundary: block early days that fall within interval of a historical night
            for hist_date_str in hist_night_dates.get(emp_id, set()):
                try:
                    hist_date = datetime.strptime(hist_date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                for offset in range(1, interval):
                    blocked_date = hist_date + timedelta(days=offset)
                    if blocked_date < window_start or blocked_date > window_end:
                        continue
                    blocked_date_str = blocked_date.strftime("%Y-%m-%d")
                    for sid in night_shift_ids:
                        var = shift_assignments.get((emp_id, blocked_date_str, sid))
                        if var is not None:
                            model.Add(var == 0)
                            count += 1

            # Sliding window: sum(is_night[i:i+interval]) <= 1
            if total_days < interval:
                non_const = [e for e in daily_night_exprs if not isinstance(e, int)]
                if len(non_const) > 1:
                    model.Add(sum(non_const) <= 1)
                    count += 1
                continue

            for i in range(total_days - interval + 1):
                window_vars = [
                    daily_night_exprs[j]
                    for j in range(i, i + interval)
                    if not isinstance(daily_night_exprs[j], int)
                ]
                if len(window_vars) <= 1:
                    continue
                model.Add(sum(window_vars) <= 1)
                count += 1

        return count

    # ── Sub-rule 4: Prefer Extended Night Rest (Soft) ───────────────────

    def _apply_prefer_extended_rest(
        self, model, ctx, shift_assignments, cfg, all_employees, all_dates,
        window_start, window_date_set,
        working_shift_ids, is_night_map, hist_night_dates,
    ) -> int:
        """
        Soft constraint: after a night shift, prefer resting for
        `preferred_night_rest_days` days (default 2), beyond the hard
        minimum of `min_night_rest` days (default 1).

        For days between (min_night_rest+1) and preferred_night_rest_days,
        penalize any working shift assignment.
        """
        hard_rest = int(cfg.get("min_night_rest", 1))
        preferred_rest = int(cfg.get("preferred_night_rest_days", 2))
        weight = int(cfg.get("objective_weight_night_rest_extend", 15))

        if preferred_rest <= hard_rest:
            self.log(f"  preferred_night_rest_days ({preferred_rest}) <= "
                     f"min_night_rest ({hard_rest}). No extra soft penalty needed.")
            return 0

        count = 0

        # Boundary: historical nights before window
        for emp_id in all_employees:
            for hist_date_str in hist_night_dates.get(emp_id, set()):
                try:
                    night_date = datetime.strptime(hist_date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                for offset in range(hard_rest + 1, preferred_rest + 1):
                    rest_date = night_date + timedelta(days=offset)
                    rest_date_str = rest_date.strftime("%Y-%m-%d")
                    if rest_date_str not in window_date_set:
                        continue
                    for shift_id in working_shift_ids:
                        var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                        if var is not None:
                            ctx.leadership_penalty_vars.append((var, weight))
                            count += 1

        # In-window: if night on date D, penalize working on D+(hard_rest+1)..D+preferred_rest
        for emp_id in all_employees:
            for d_idx, date_str in enumerate(all_dates):
                is_night = is_night_map.get((emp_id, date_str))
                if is_night is None or isinstance(is_night, int):
                    continue  # No night var or constant 0

                night_date = window_start + timedelta(days=d_idx)
                for offset in range(hard_rest + 1, preferred_rest + 1):
                    rest_date = night_date + timedelta(days=offset)
                    rest_date_str = rest_date.strftime("%Y-%m-%d")
                    if rest_date_str not in window_date_set:
                        continue
                    for shift_id in working_shift_ids:
                        var = shift_assignments.get((emp_id, rest_date_str, shift_id))
                        if var is not None:
                            # Create conditional penalty:
                            # penalty_var = 1 iff (is_night AND working on rest_date)
                            penalty_var = model.NewBoolVar(
                                f"NightExtRest_{emp_id}_{date_str}_d{offset}"
                            )
                            model.Add(penalty_var == 1).OnlyEnforceIf(
                                [is_night, var]
                            )
                            model.Add(penalty_var == 0).OnlyEnforceIf(
                                is_night.Not()
                            )
                            model.Add(penalty_var == 0).OnlyEnforceIf(
                                var.Not()
                            )
                            ctx.leadership_penalty_vars.append((penalty_var, weight))
                            count += 1

        return count
