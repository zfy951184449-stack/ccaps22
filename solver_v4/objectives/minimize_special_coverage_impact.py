"""
Minimize Special Coverage Impact Objective
"""

from ortools.sat.python import cp_model

from objectives.base import ObjectiveBase


class MinimizeSpecialCoverageImpactObjective(ObjectiveBase):
    name = "MinimizeSpecialCoverageImpact"

    def build_expression(self, model: cp_model.CpModel, special_cover_vars, data):
        if not special_cover_vars or not data.special_shift_requirements:
            return None

        terms = []
        for requirement in data.special_shift_requirements:
            candidate_cost_map = {
                candidate.employee_id: int(candidate.impact_cost or 0)
                for candidate in getattr(requirement, "candidates", [])
            }
            for employee_id, impact_cost in candidate_cost_map.items():
                cover_var = special_cover_vars.get((requirement.occurrence_id, employee_id))
                if cover_var is None or impact_cost <= 0:
                    continue
                terms.append(impact_cost * cover_var)

        return sum(terms) if terms else None
