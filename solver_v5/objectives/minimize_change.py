"""
Minimize Change Objective (最小变更 / 稳定性优化)

Goal: When RE-SOLVING an already-published roster (e.g. after a 临时人员不可用 quick
repair), keep the new solution as close as possible to the published baseline — minimize
the number of assignment CHANGES instead of optimizing from scratch.

Mathematical form (linear, NO auxiliary variables):
  For each binary decision var x with a known baseline constant b ∈ {0,1}:
    b = 1 (originally assigned)   -> penalty = (1 - x)   # 取消则罚 1，保留则 0
    b = 0 (originally NOT assigned) -> penalty = x        # 新排上则罚 1，不排则 0
  change_penalty = Σ over shift vars + Σ over operation vars

A "换人" (swap one person off a slot, another on) naturally costs 2 (vacate b=1→0 plus
fill b=0→1) — matching the agreed 排班员 口径.

This is a SOFT objective and MUST sit below coverage/vacancy priority — it never sacrifices
feasibility to avoid churn (weight calibration lives in core/solver.py, see design doc
docs/solver-minimize-change-objective-design.md §6).

Data source: SolverRequest.baseline_shifts / baseline_assignments (window-internal published
roster). When both are empty the objective returns None → contributes nothing → byte-for-byte
identical to the old behavior (regression-gate safe).
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, Any
from objectives.base import ObjectiveBase


class MinimizeChangeObjective(ObjectiveBase):
    name = "MinimizeChange"

    def __init__(self, logger=None):
        super().__init__(logger)

    def build_expression(
        self,
        model: cp_model.CpModel,
        assignments: Dict[tuple, cp_model.IntVar],
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: Any,
    ) -> Optional[cp_model.LinearExpr]:

        baseline_shifts = getattr(data, "baseline_shifts", None) or []
        baseline_assignments = getattr(data, "baseline_assignments", None) or []

        if not baseline_shifts and not baseline_assignments:
            # 无基线 → 不贡献任何项，逐字节等价旧行为
            return None

        terms = []

        # Shift-level baseline: key (employee_id, date, shift_id) — matches solver.py:263
        base_shift_keys = {
            (b.employee_id, b.date, b.shift_id) for b in baseline_shifts
        }
        for key, var in shift_assignments.items():
            if key in base_shift_keys:
                terms.append(1 - var)   # b=1: 取消则罚
            else:
                terms.append(var)       # b=0: 新增则罚

        # Operation-level baseline: key (operation_plan_id, position_number, employee_id)
        # — matches solver.py:199
        base_assign_keys = {
            (b.operation_plan_id, b.position_number, b.employee_id)
            for b in baseline_assignments
        }
        for key, var in assignments.items():
            if key in base_assign_keys:
                terms.append(1 - var)
            else:
                terms.append(var)

        if not terms:
            return None

        self.log(
            f"Built MinimizeChange: baseline {len(base_shift_keys)} shifts / "
            f"{len(base_assign_keys)} assignments; "
            f"{len(shift_assignments)} shift-vars + {len(assignments)} op-vars penalized."
        )

        return sum(terms)
