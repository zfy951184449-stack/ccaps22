"""
LeadershipCoverage Constraint

Implements four leadership scheduling rules:

  Rule 1 (Hard): On any date with production operations, at least one employee
                 with org_role >= GROUP_LEADER must be assigned a working shift.

  Rule 2 (Hard): Employees with org_role in {TEAM_LEADER, DEPT_MANAGER} must NOT
                 be assigned to any operation (assignment vars forced to 0).
                 They can still be assigned working shifts (on-duty without ops).

  Rule 3 (Soft): Group Leader+ employees should prefer working on workdays and
                 resting on non-workdays. Penalty vars added to ctx.leadership_penalty_vars.

  Rule 4 (Soft): Group Leader+ employees should minimize operation assignments and
                 SPECIAL shift usage. Penalty vars added to ctx.leadership_penalty_vars.

Config toggle: enable_leadership_coverage (default True)
"""

from typing import Set, Dict, List
from datetime import datetime, timezone
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix


# Roles at or above Group Leader
LEADER_ROLES = {"GROUP_LEADER", "TEAM_LEADER", "DEPT_MANAGER"}

# Roles banned from operation assignments (Team Leader and above)
OPS_BANNED_ROLES = {"TEAM_LEADER", "DEPT_MANAGER"}


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

        # ── Classify employees by role ──
        leader_emp_ids: Set[int] = set()     # GL+: GROUP_LEADER, TEAM_LEADER, DEPT_MANAGER
        ops_banned_emp_ids: Set[int] = set() # TL+: TEAM_LEADER, DEPT_MANAGER
        gl_only_emp_ids: Set[int] = set()    # GROUP_LEADER only (for Rule 4 ops penalty)

        for ep in data.employee_profiles:
            role = getattr(ep, "org_role", "FRONTLINE")
            if role in LEADER_ROLES:
                leader_emp_ids.add(ep.employee_id)
            if role in OPS_BANNED_ROLES:
                ops_banned_emp_ids.add(ep.employee_id)
            if role == "GROUP_LEADER":
                gl_only_emp_ids.add(ep.employee_id)

        if not leader_emp_ids:
            self.log("No Group Leader+ employees found. Skipping.")
            return 0

        self.log(f"Leader employees (GL+): {sorted(leader_emp_ids)}")
        self.log(f"Ops-banned employees (TL+): {sorted(ops_banned_emp_ids)}")

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
        # Rule 1: Production day leader coverage (HARD)
        # ══════════════════════════════════════════════
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

        self.log(f"Rule 2: Banned {rule2_count} assignment vars for Team Leader+ employees.")

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

        # 4a: Penalize operation assignments for GL (GROUP_LEADER only)
        #     Note: TL+/DEPT_MANAGER are already hard-banned by Rule 2
        if gl_only_emp_ids:
            for key, var in assignments.items():
                if len(key) >= 3 and key[2] in gl_only_emp_ids:
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

