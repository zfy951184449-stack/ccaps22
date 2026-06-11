"""
Balance Weekend Work Objective (周末工作均衡)

Goal: Minimize the variance of weekend/holiday work days assigned to employees.
Mathematical form: Min Sum(WeekendWorkCount(e)^2)

Using L2 regularization (sum of squares) ensures:
- When total weekend work is fixed, it's distributed as evenly as possible
- Outliers (employees with many weekend shifts) are heavily penalized

Weekend/Holiday identification:
- Uses CalendarDay.is_workday = False to identify non-working days (weekends + holidays)
- Only counts WORK shifts (nominal_hours > 0) on non-working days
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, Set
from collections import defaultdict
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest


class BalanceWeekendWorkObjective(ObjectiveBase):
    name = "BalanceWeekendWork"

    def __init__(self, logger=None):
        super().__init__(logger)

    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest
    ) -> Optional[cp_model.LinearExpr]:

        if not shift_assignments:
            return None

        # 1. Identify non-working days (weekends + holidays) from calendar
        non_workday_dates: Set[str] = set()
        if data.calendar:
            for day in data.calendar:
                if not day.is_workday:
                    non_workday_dates.add(day.date)

        if not non_workday_dates:
            self.log("No non-working days found in calendar. Objective disabled.")
            return 0

        # 2. Identify REST shifts (nominal_hours ~= 0) to exclude
        rest_shift_ids: Set[int] = set()
        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.nominal_hours <= 0.01:
                    rest_shift_ids.add(s.shift_id)

        # 3. Pre-group: weekend work shift vars by employee
        emp_weekend_map: Dict[int, list] = defaultdict(list)
        for (emp_id, date_str, shift_id), var in shift_assignments.items():
            if date_str in non_workday_dates and shift_id not in rest_shift_ids:
                emp_weekend_map[emp_id].append(var)

        # 4. Build count variables for all employees
        all_employees = {ep.employee_id for ep in data.employee_profiles}
        emp_weekend_counts = {}

        for emp_id in all_employees:
            weekend_vars = emp_weekend_map.get(emp_id, [])

            if not weekend_vars:
                emp_weekend_counts[emp_id] = 0  # Constant 0
            else:
                count_var = model.NewIntVar(0, len(weekend_vars), f"WeekendWorkCount_{emp_id}")
                model.Add(count_var == sum(weekend_vars))
                emp_weekend_counts[emp_id] = count_var

        # 5. Minimize Sum of Squares (L2 Regularization for Balance)
        squared_vars = []

        for emp_id, count in emp_weekend_counts.items():
            if isinstance(count, int):
                squared_vars.append(count * count)
            else:
                max_count = len(emp_weekend_map.get(emp_id, []))
                sq_var = model.NewIntVar(0, max_count * max_count, f"WeekendWorkSq_{emp_id}")
                model.AddMultiplicationEquality(sq_var, [count, count])
                squared_vars.append(sq_var)

        active_employees = sum(1 for c in emp_weekend_counts.values() if not isinstance(c, int) or c > 0)
        self.log(
            f"Built BalanceWeekendWork objective: {len(squared_vars)} terms, "
            f"{len(non_workday_dates)} non-working days, "
            f"{active_employees} employees with weekend work potential."
        )

        return sum(squared_vars) if squared_vars else 0
