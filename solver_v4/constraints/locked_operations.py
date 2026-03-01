"""
Locked Operations Constraint Module

Preserves manually locked employee-operation assignments from previous runs.

Semantics:
- Every locked employee must remain assigned to the locked operation.
- Remaining open positions can still be optimized normally.
- If a locked employee is no longer a valid candidate, the model becomes infeasible.
"""

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


class LockedOperationsConstraint(BaseConstraint):
    name = "LockedOperations"
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        index = ctx.index

        if not getattr(data, "locked_operations", None):
            self.log("No locked operations to enforce.")
            return 0

        constraints_added = 0
        seen_ops = {op.operation_plan_id for op in data.operation_demands}

        for locked in data.locked_operations:
            op_id = locked.operation_plan_id
            if op_id not in seen_ops:
                continue

            enforced_ids = []
            seen_emp_ids = set()
            for emp_id in locked.enforced_employee_ids:
                if emp_id not in seen_emp_ids:
                    enforced_ids.append(emp_id)
                    seen_emp_ids.add(emp_id)

            for emp_id in enforced_ids:
                assign_vars = index.get_vars_for_op_emp(op_id, emp_id)
                if not assign_vars:
                    self.log(
                        f"Locked employee {emp_id} is not a candidate for operation {op_id}; forcing infeasible.",
                        level="warning",
                    )
                    model.Add(0 == 1)
                    constraints_added += 1
                    continue

                model.Add(sum(assign_vars) == 1)
                constraints_added += 1

        self.log(f"Total locked-operation constraints: {constraints_added}")
        return constraints_added
