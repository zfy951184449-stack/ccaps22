"""
Unit tests for the MinimizeChange (最小变更 / 稳定性) objective.

Validates:
  1. Gate-safety: empty baseline -> build_expression returns None (contributes nothing).
  2. Operation-level baseline: minimizing the change penalty keeps the baseline employee.
  3. Shift-level baseline: minimizing keeps the baseline shift.
  4. "换人 = 2 处": moving off + moving on costs exactly 2 penalty units.
"""

import unittest
from ortools.sat.python import cp_model

from objectives.minimize_change import MinimizeChangeObjective
from contracts.request import BaselineAssignment, BaselineShift


class _Data:
    """Minimal stand-in for SolverRequest carrying only the baseline fields."""

    def __init__(self, baseline_assignments=None, baseline_shifts=None):
        self.baseline_assignments = baseline_assignments or []
        self.baseline_shifts = baseline_shifts or []


class TestMinimizeChange(unittest.TestCase):

    def test_empty_baseline_returns_none(self):
        m = cp_model.CpModel()
        expr = MinimizeChangeObjective().build_expression(m, {}, {}, _Data())
        self.assertIsNone(expr, "empty baseline must contribute nothing (gate-safe)")

    def test_picks_baseline_assignment_both_directions(self):
        # One position, two candidates, exactly one must be chosen.
        for baseline_emp in (1, 2):
            m = cp_model.CpModel()
            x1 = m.NewBoolVar("op101_pos1_emp1")
            x2 = m.NewBoolVar("op101_pos1_emp2")
            m.Add(x1 + x2 == 1)
            assignments = {(101, 1, 1): x1, (101, 1, 2): x2}
            data = _Data(baseline_assignments=[BaselineAssignment(101, 1, baseline_emp)])

            expr = MinimizeChangeObjective().build_expression(m, assignments, {}, data)
            self.assertIsNotNone(expr)
            m.Minimize(expr)

            solver = cp_model.CpSolver()
            status = solver.Solve(m)
            self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
            chosen = 1 if solver.Value(x1) else 2
            self.assertEqual(chosen, baseline_emp,
                             f"should keep baseline employee {baseline_emp}")

    def test_picks_baseline_shift(self):
        m = cp_model.CpModel()
        s1 = m.NewBoolVar("shift_early")   # (emp1, date, 10)
        s2 = m.NewBoolVar("shift_late")    # (emp1, date, 20)
        m.Add(s1 + s2 == 1)
        shift_assignments = {(1, "2026-01-01", 10): s1, (1, "2026-01-01", 20): s2}
        data = _Data(baseline_shifts=[BaselineShift(1, "2026-01-01", 20)])

        expr = MinimizeChangeObjective().build_expression(m, {}, shift_assignments, data)
        m.Minimize(expr)
        cp_model.CpSolver().Solve(m)

        solver = cp_model.CpSolver()
        solver.Solve(m)
        self.assertEqual(solver.Value(s2), 1, "should keep baseline shift 20")
        self.assertEqual(solver.Value(s1), 0)

    def test_swap_costs_two(self):
        # Force a swap: baseline keeps emp1, but emp1 is forced OFF (x1 == 0),
        # so emp2 must come on. Penalty should be exactly 2 (vacate + fill).
        m = cp_model.CpModel()
        x1 = m.NewBoolVar("emp1")
        x2 = m.NewBoolVar("emp2")
        m.Add(x1 + x2 == 1)
        m.Add(x1 == 0)  # emp1 unavailable -> forced swap
        assignments = {(101, 1, 1): x1, (101, 1, 2): x2}
        data = _Data(baseline_assignments=[BaselineAssignment(101, 1, 1)])

        expr = MinimizeChangeObjective().build_expression(m, assignments, {}, data)
        m.Minimize(expr)
        solver = cp_model.CpSolver()
        solver.Solve(m)
        # penalty = (1 - x1) + x2 = (1-0) + 1 = 2
        self.assertEqual(solver.Value(expr), 2, "a forced swap must cost exactly 2")


if __name__ == "__main__":
    unittest.main()
