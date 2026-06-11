"""
Minimize Triple Salary Cost Objective (三倍薪日成本优化)

Goal: Discourage scheduling on triple-salary days (法定节假日) when not strictly necessary.
Mathematical form: Min Σ (triple_salary_work_count[e]) for all employees e

This is a soft objective — it won't prevent scheduling on holidays if needed,
but will prefer non-holiday alternatives when available.

Data source: CalendarDay.is_triple_salary from the request calendar.
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, Set
from collections import defaultdict
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest


class MinimizeTripleSalaryCostObjective(ObjectiveBase):
    name = "MinimizeTripleSalaryCost"

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

        # 1. Identify triple-salary dates from calendar
        triple_salary_dates: Set[str] = set()
        if data.calendar:
            for day in data.calendar:
                if day.is_triple_salary:
                    triple_salary_dates.add(day.date)

        if not triple_salary_dates:
            self.log("No triple-salary days in calendar. Objective disabled.")
            return 0

        # 2. Identify REST shifts (nominal_hours ~= 0) to exclude
        rest_shift_ids: Set[int] = set()
        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.nominal_hours <= 0.01:
                    rest_shift_ids.add(s.shift_id)

        # 3. Collect all work-shift variables on triple-salary days
        triple_salary_vars = []
        for (emp_id, date_str, shift_id), var in shift_assignments.items():
            if date_str in triple_salary_dates and shift_id not in rest_shift_ids:
                triple_salary_vars.append(var)

        if not triple_salary_vars:
            self.log("No shift variables on triple-salary days. Objective disabled.")
            return 0

        self.log(
            f"Built MinimizeTripleSalaryCost: {len(triple_salary_vars)} shift-vars "
            f"on {len(triple_salary_dates)} triple-salary days."
        )

        # Total count of work shifts on triple-salary days
        return sum(triple_salary_vars)
