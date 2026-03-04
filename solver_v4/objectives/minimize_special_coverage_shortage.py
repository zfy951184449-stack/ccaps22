"""
Minimize Special Coverage Shortage Objective
"""

from ortools.sat.python import cp_model

from objectives.base import ObjectiveBase


class MinimizeSpecialCoverageShortageObjective(ObjectiveBase):
    name = "MinimizeSpecialCoverageShortage"

    PRIORITY_WEIGHTS = {
        "CRITICAL": 200000,
        "HIGH": 100000,
        "NORMAL": 50000,
    }

    def build_expression(self, model: cp_model.CpModel, special_shortage_vars, data):
        if not special_shortage_vars or not data.special_shift_requirements:
            return None

        terms = []
        for requirement in data.special_shift_requirements:
            shortage_var = special_shortage_vars.get(requirement.occurrence_id)
            if shortage_var is None:
                continue
            priority = str(getattr(requirement, "priority_level", "HIGH") or "HIGH").upper()
            weight = self.PRIORITY_WEIGHTS.get(priority, self.PRIORITY_WEIGHTS["HIGH"])
            terms.append(weight * shortage_var)

        return sum(terms) if terms else None
