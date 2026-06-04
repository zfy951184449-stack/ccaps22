"""
LeadershipCoverage Constraint

Implements four leadership scheduling rules:

  Rule 1 (Hard, toggleable): On any date with production operations, at least one
                 leader (GROUP_LEADER / TEAM_LEADER / DEPT_MANAGER) must work a shift.
                 Switchable via enable_leader_production_coverage (default True) — turn
                 off when few leaders must cover many days and it clashes with the
                 StandardHours monthly cap (otherwise INFEASIBLE).

  Rule 2 (Hard): Leaders whose per-role policy is 'ban' must NOT be assigned to
                 any operation (assignment vars forced to 0). They can still be
                 assigned working shifts (on-duty without ops).

  Rule 3 (Soft): Leaders should prefer working on workdays and resting on
                 non-workdays. Penalty vars added to ctx.leadership_penalty_vars.

  Rule 4 (Soft): Leaders whose policy is 'soft' should minimize operation
                 assignments; all leaders should minimize SPECIAL shift usage.
                 Penalty vars added to ctx.leadership_penalty_vars.

Per-role operation policy (config keys; defaults preserve prior behavior):
  leader_ops_policy_group_leader  (default 'soft')
  leader_ops_policy_team_leader   (default 'ban')
  leader_ops_policy_dept_manager  (default 'ban')
  Each value ∈ {'allow', 'soft', 'ban'}.
  NOTE: SHIFT_LEADER (班组长) is intentionally NOT treated as a leader.

Config toggles:
  enable_leadership_coverage         (default True)  — master switch for this module
  enable_leader_production_coverage  (default True)  — Rule 1 only (production-day coverage)
"""

from typing import Set, Dict, List
from datetime import datetime, timezone
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix


# Leader roles. NOTE: SHIFT_LEADER (班组长) is intentionally NOT a leader here.
LEADER_ROLES = {"GROUP_LEADER", "TEAM_LEADER", "DEPT_MANAGER"}

# Config key mapping each leader role to its production-operation policy.
ROLE_OPS_POLICY_KEYS = {
    "GROUP_LEADER": "leader_ops_policy_group_leader",
    "TEAM_LEADER": "leader_ops_policy_team_leader",
    "DEPT_MANAGER": "leader_ops_policy_dept_manager",
}

# Per-role operation policy:
#   'ban'   → hard-forbidden from any operation assignment (Rule 2)
#   'soft'  → allowed, but penalized to minimize operation assignments (Rule 4a)
#   'allow' → no restriction on operation assignments
# Defaults preserve the previous hard-coded behavior (经理/团队长 banned, 工段长 soft).
DEFAULT_OPS_POLICY = {
    "GROUP_LEADER": "soft",
    "TEAM_LEADER": "ban",
    "DEPT_MANAGER": "ban",
}


class LeadershipCoverageConstraint(BaseConstraint):
    """Leadership scheduling rules: coverage, role ban, and soft preferences."""

    name = "LeadershipCoverage"
    config_key = "enable_leadership_coverage"
    default_enabled = True

    SPECIAL_CATEGORY = "SPECIAL"

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        assignments = ctx.assignments
        shift_assignments = ctx.shift_assignments
        config = ctx.config or {}

        if not shift_assignments or ctx.shift_index is None:
            self.log("Missing shift_assignments or shift_index. Skipping.", level="warning")
            return 0

        # ── Resolve per-role operation policy (config overrides defaults) ──
        ops_policy = {
            role: str(config.get(key, DEFAULT_OPS_POLICY[role])).lower()
            for role, key in ROLE_OPS_POLICY_KEYS.items()
        }

        # ── Classify employees by role + policy ──
        leader_emp_ids: Set[int] = set()      # all leaders (GROUP_LEADER, TEAM_LEADER, DEPT_MANAGER)
        ops_banned_emp_ids: Set[int] = set()  # policy 'ban'  → hard-forbidden from operations (Rule 2)
        ops_soft_emp_ids: Set[int] = set()    # policy 'soft' → penalized in operations (Rule 4a)

        for ep in data.employee_profiles:
            role = getattr(ep, "org_role", "FRONTLINE")
            if role not in LEADER_ROLES:
                continue
            leader_emp_ids.add(ep.employee_id)
            policy = ops_policy.get(role, "allow")
            if policy == "ban":
                ops_banned_emp_ids.add(ep.employee_id)
            elif policy == "soft":
                ops_soft_emp_ids.add(ep.employee_id)

        if not leader_emp_ids:
            self.log("No leader employees found. Skipping.")
            return 0

        self.log(f"Leader employees: {sorted(leader_emp_ids)}")
        self.log(f"Ops policy: {ops_policy}")
        self.log(f"Ops-banned (hard): {sorted(ops_banned_emp_ids)}; "
                 f"ops-soft (penalty): {sorted(ops_soft_emp_ids)}")

        constraints_added = 0

        # ── Identify production dates ──
        production_dates: Set[str] = set()
        for op in data.operation_demands:
            try:
                start_ts = parse_iso_to_unix(op.planned_start)
                dt = datetime.fromtimestamp(start_ts, tz=timezone.utc)
                production_dates.add(dt.strftime("%Y-%m-%d"))
            except Exception:
                pass

        self.log(f"Production dates: {sorted(production_dates)} ({len(production_dates)} days)")

        # ── Build calendar lookup ──
        calendar_map: Dict[str, bool] = {}  # date_str -> is_workday
        for cal in data.calendar:
            calendar_map[cal.date] = cal.is_workday

        # ── Identify shift categories ──
        rest_shift_ids: Set[int] = set()
        working_shift_ids: Set[int] = set()
        special_shift_ids: Set[int] = set()

        for s in data.shift_definitions:
            if s.nominal_hours <= 0.01:
                rest_shift_ids.add(s.shift_id)
            else:
                working_shift_ids.add(s.shift_id)
                if s.plan_category == self.SPECIAL_CATEGORY:
                    special_shift_ids.add(s.shift_id)

        # ── Get date range ──
        from utils.time_utils import get_date_range
        window_dates = get_date_range(data.window['start_date'], data.window['end_date'])

        # ══════════════════════════════════════════════
        # Rule 1: Production day leader coverage (HARD, toggleable)
        # ══════════════════════════════════════════════
        # This hard rule can clash with StandardHours (monthly hour cap): with few
        # leaders covering many production days, required hours can exceed the cap and
        # make the model INFEASIBLE. So it is independently switchable via
        # enable_leader_production_coverage (default True).
        if config.get("enable_leader_production_coverage", True):
            for date_str in window_dates:
                if date_str not in production_dates:
                    continue

                # Sum of working shift vars for all leaders on this date
                leader_work_vars = []
                for emp_id in leader_emp_ids:
                    for shift_id in working_shift_ids:
                        key = (emp_id, date_str, shift_id)
                        if key in shift_assignments:
                            leader_work_vars.append(shift_assignments[key])

                if leader_work_vars:
                    model.Add(sum(leader_work_vars) >= 1)
                    constraints_added += 1
                else:
                    self.log(
                        f"WARNING: No leader shift vars for production date {date_str}. "
                        f"Coverage cannot be guaranteed!",
                        level="warning"
                    )

            self.log(f"Rule 1: Added {constraints_added} production-day leader coverage constraints.")
        else:
            self.log("Rule 1: production-day leader coverage DISABLED by config. Skipping.")
        rule1_count = constraints_added

        # ══════════════════════════════════════════════
        # Rule 2: Team Leader+ operation ban (HARD)
        # ══════════════════════════════════════════════
        rule2_count = 0
        if ops_banned_emp_ids:
            for key, var in assignments.items():
                # assignment key format: (op_id, position, emp_id)
                if len(key) >= 3 and key[2] in ops_banned_emp_ids:
                    model.Add(var == 0)
                    rule2_count += 1
                    constraints_added += 1

        self.log(f"Rule 2: Banned {rule2_count} assignment vars for ban-policy leaders.")

        # ══════════════════════════════════════════════
        # Rule 3: GL+ workday/rest-day preference (SOFT)
        # ══════════════════════════════════════════════
        w_nonworkday = int(config.get("objective_weight_leader_nonworkday", 20))
        w_workday_rest = int(config.get("objective_weight_leader_workday_rest", 10))

        rule3_count = 0
        for date_str in window_dates:
            is_workday = calendar_map.get(date_str, True)

            for emp_id in leader_emp_ids:
                if is_workday:
                    # Workday: penalize REST shifts (encourage working)
                    for shift_id in rest_shift_ids:
                        key = (emp_id, date_str, shift_id)
                        if key in shift_assignments:
                            ctx.leadership_penalty_vars.append(
                                (shift_assignments[key], w_workday_rest)
                            )
                            rule3_count += 1
                else:
                    # Non-workday: penalize WORKING shifts (encourage rest)
                    for shift_id in working_shift_ids:
                        key = (emp_id, date_str, shift_id)
                        if key in shift_assignments:
                            ctx.leadership_penalty_vars.append(
                                (shift_assignments[key], w_nonworkday)
                            )
                            rule3_count += 1

        self.log(f"Rule 3: Added {rule3_count} workday/rest preference penalty vars "
                 f"(weights: nonworkday={w_nonworkday}, workday_rest={w_workday_rest}).")

        # ══════════════════════════════════════════════
        # Rule 4: GL+ minimize ops & special shifts (SOFT)
        # ══════════════════════════════════════════════
        w_ops = int(config.get("objective_weight_leader_ops", 30))
        w_special = int(config.get("objective_weight_leader_special", 50))

        rule4_ops_count = 0
        rule4_special_count = 0

        # 4a: Penalize operation assignments for 'soft'-policy leaders.
        #     'ban' leaders are already hard-forbidden by Rule 2; 'allow' leaders are unrestricted.
        if ops_soft_emp_ids:
            for key, var in assignments.items():
                if len(key) >= 3 and key[2] in ops_soft_emp_ids:
                    ctx.leadership_penalty_vars.append((var, w_ops))
                    rule4_ops_count += 1

        # 4b: Penalize SPECIAL shift usage for all GL+ employees
        if special_shift_ids:
            for date_str in window_dates:
                for emp_id in leader_emp_ids:
                    for shift_id in special_shift_ids:
                        key = (emp_id, date_str, shift_id)
                        if key in shift_assignments:
                            ctx.leadership_penalty_vars.append(
                                (shift_assignments[key], w_special)
                            )
                            rule4_special_count += 1

        self.log(f"Rule 4: Added {rule4_ops_count} ops penalty vars (weight={w_ops}) + "
                 f"{rule4_special_count} special shift penalty vars (weight={w_special}).")

        total = rule1_count + rule2_count
        total_soft = rule3_count + rule4_ops_count + rule4_special_count
        self.log(f"Total: {total} hard constraints + {total_soft} soft penalty vars.")

        return constraints_added

