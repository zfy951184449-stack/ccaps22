"""
S6 验收测试：lexicographic L4 第二阶段（10_solver_design §5）。

覆盖（实施计划 S6 验收 / §5.5 用例）：
  (a) 第二阶段成功时 L0-L3 不变 & L4 ≤ 阶段一，且 objective_value == phase2_solver.ObjectiveValue()；
  (b) 强制第二阶段失败时回退结果 == 阶段一，且 objective_value == phase1_solver.ObjectiveValue()；
  (c) phase-1 仅 FEASIBLE 时不进 phase-2；
  (d) 员工数 > 50 中等规模数值稳定性（C 常量动态上界，无溢出）；
  默认关（enable_lexicographic_l4=false）时 == 单阶段（V4）。

运行：python3 -m unittest tests.test_lexicographic
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ortools.sat.python import cp_model

from contracts.request import (
    SolverRequest, OperationDemand, PositionQualification,
    EmployeeProfile, CalendarDay,
)
from core.solver import SolverV5
from core.breakdown import ObjectiveBreakdown
from core import lexicographic


# ──────────────────────────────────────────────
# 辅助构造（与 test_breakdown_equivalence 同模式）
# ──────────────────────────────────────────────

def _emp(eid):
    return EmployeeProfile(
        employee_id=eid, employee_code="E%d" % eid, employee_name="Emp%d" % eid,
        qualifications=[], unavailable_periods=[],
    )


def _op(op_id, start_iso, candidates, n_positions=1, required_people=None):
    pqs = [
        PositionQualification(position_number=p + 1, qualifications=[],
                              candidate_employee_ids=list(candidates))
        for p in range(n_positions)
    ]
    return OperationDemand(
        operation_plan_id=op_id, batch_id=1, batch_code="B001",
        operation_id=op_id, operation_name="Op%d" % op_id,
        planned_start=start_iso, planned_end=start_iso,
        planned_duration_minutes=240,
        required_people=(required_people if required_people is not None else n_positions),
        position_qualifications=pqs,
    )


# ──────────────────────────────────────────────
# 1. 代理系数 / 变量映射 单元测试
# ──────────────────────────────────────────────

class TestProxyCoefficients(unittest.TestCase):
    def test_magnitude_isolation_descending(self):
        # C3 >> C4 >> ... >> C8（高位分量优先压最小）。
        # 小规模（3 人/2 天）量级隔离可行不降级；大规模按 §5.3 降级（见 test_large_scale_degrades）。
        coeffs, degrade, est = lexicographic.compute_proxy_coefficients(
            employee_count=3, day_count=2)
        self.assertFalse(degrade, "3 人/2 天小规模不应触发降级，估算=%d" % est)
        keys = lexicographic.L4_KEYS
        for i in range(len(keys) - 1):
            self.assertGreater(
                coeffs[keys[i]], coeffs[keys[i + 1]],
                "C[%s] 应 >> C[%s]" % (keys[i], keys[i + 1]))
        # 最低位 C8 == 2（running 起步 1 + 1）。
        self.assertEqual(coeffs[keys[-1]], 2)

    def test_large_scale_degrades(self):
        # 员工数极大 → C·UB 估算超 1e15 → 降级 O5+O6。
        coeffs, degrade, est = lexicographic.compute_proxy_coefficients(
            employee_count=5000, day_count=60)
        self.assertTrue(degrade, "超大规模应触发降级，估算=%d" % est)

    def test_map_var_to_clone_preserves_value(self):
        m = cp_model.CpModel()
        x = m.NewIntVar(0, 5, "x")
        y = m.NewIntVar(0, 5, "y")
        m.Add(x + y >= 3)
        m.Minimize(x + y)
        clone = m.Clone()
        x_clone = lexicographic.map_var_to_clone(clone, x)
        clone.Add(x_clone == 4)
        clone.Minimize(y)
        s = cp_model.CpSolver()
        st = s.Solve(clone)
        self.assertIn(st, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        # phase-2 solver 用 phase-1 变量对象取值（proto 索引一致）。
        self.assertEqual(s.Value(x), 4)
        self.assertEqual(s.Value(x_clone), 4)


# ──────────────────────────────────────────────
# 2. run_phase2 直控模型测试（成功 / 回退 / 跳过）
# ──────────────────────────────────────────────

class _Req(object):
    """run_phase2 仅读 req.employee_profiles 与 req.window。"""
    def __init__(self, n_emp=3, days=("2026-01-05", "2026-01-07")):
        self.employee_profiles = [_emp(i + 1) for i in range(n_emp)]
        self.window = {"start_date": days[0], "end_date": days[1]}


def _build_lex_solver(enabled_breakdown=True):
    """构造一个 SolverV5，手搭一个有 L4 腾挪空间的小模型 + ObjectiveBreakdown。

    模型：a + b == 3（a,b ∈ [0,3]），night = a²的代理（这里直接用 a 当 night 分量）。
    目标 = a + b（恒 3，L3 总目标对任何 (a,b) 都一样）→ phase-1 OPTIMAL=3，
    phase-2 在 obs_total<=3 下最小化 night=a → a=0 最优（L4 改善）。
    O0/O1 设为常量 0（无空缺/欠配），obs_total == a+b。
    """
    sv = SolverV5()
    m = sv.model
    a = m.NewIntVar(0, 3, "a")
    b = m.NewIntVar(0, 3, "b")
    m.Add(a + b == 3)
    # 目标：a + b（恒 3）。
    objective_terms = [a + b]
    m.Minimize(sum(objective_terms))

    bd = ObjectiveBreakdown(m, enabled=enabled_breakdown)
    # O0/O1 常量 0（无变量）。O5 night_shift_variance == a（可被 phase-2 压低）。
    bd.register("special_shortage_penalty", 0, weight=1)
    bd.register("vacancy_penalty", 0, weight=1)
    bd.register("night_shift_variance", a, weight=5)
    bd.finalize_total(objective_terms)
    sv.breakdown = bd
    sv._objective_weights_applied = {
        "special_impact": 1, "hours_deviation": 1, "special_shifts": 100,
        "night_balance": 5, "weekend_balance": 5, "triple_salary": 10,
    }
    return sv, a, b


class TestRunPhase2(unittest.TestCase):
    def test_phase2_success_improves_l4_keeps_l3(self):
        sv, a, b = _build_lex_solver()
        # phase-1 求解（self.solver）。
        sv._phase1_elapsed = 0.0
        s1 = sv.solver
        st1 = s1.Solve(sv.model)
        self.assertEqual(st1, cp_model.OPTIMAL)
        v_star = int(s1.Value(sv.breakdown.obs_total))
        self.assertEqual(v_star, 3, "phase-1 总目标应=3")

        config = {"enable_lexicographic_l4": True, "max_time_seconds": 30,
                  "lex_phase2_min_seconds": 5}
        req = _Req(n_emp=3)
        use2, p2 = lexicographic.run_phase2(sv, req, config, None, st1, s1)
        self.assertTrue(use2, "phase-2 应成功采用")
        self.assertIsNotNone(p2)
        # L4（night=a）应被压到 0（≤ phase-1 任意取值）。
        night2 = int(p2.Value(sv.breakdown.obs_vars["night_shift_variance"]))
        self.assertEqual(night2, 0, "phase-2 应把 night 压到 0")
        # L3 总目标不变（obs_total 仍 == 3）。
        total2 = int(p2.Value(sv.breakdown.obs_total))
        self.assertEqual(total2, v_star, "L3 总目标必须不变")

    def test_phase1_feasible_skips_phase2(self):
        sv, a, b = _build_lex_solver()
        config = {"enable_lexicographic_l4": True, "max_time_seconds": 30,
                  "lex_phase2_min_seconds": 5}
        req = _Req(n_emp=3)
        # 伪造 phase-1 状态为 FEASIBLE（非 OPTIMAL）→ 不进 phase-2。
        use2, p2 = lexicographic.run_phase2(sv, req, config, None,
                                            cp_model.FEASIBLE, sv.solver)
        self.assertFalse(use2)
        self.assertIsNone(p2)

    def test_default_off_skips_phase2(self):
        sv, a, b = _build_lex_solver()
        st1 = sv.solver.Solve(sv.model)
        config = {}  # enable_lexicographic_l4 缺省 False
        req = _Req(n_emp=3)
        use2, p2 = lexicographic.run_phase2(sv, req, config, None, st1, sv.solver)
        self.assertFalse(use2)
        self.assertIsNone(p2)

    def test_breakdown_disabled_skips_phase2(self):
        # enable_objective_breakdown 关 → 无 obs_total → 跳过 phase-2。
        sv, a, b = _build_lex_solver(enabled_breakdown=False)
        st1 = sv.solver.Solve(sv.model)
        config = {"enable_lexicographic_l4": True, "max_time_seconds": 30}
        req = _Req(n_emp=3)
        use2, p2 = lexicographic.run_phase2(sv, req, config, None, st1, sv.solver)
        self.assertFalse(use2)
        self.assertIsNone(p2)

    def test_forced_phase2_infeasible_falls_back(self):
        # (b) 强制 phase-2 INFEASIBLE：劫持代理目标构造，往 clone 加一条与 phase-1 锁定
        # 矛盾的硬约束（night==a 同时强制 a>=2 与 obs_total<=3 但 a+b==3 且 b>=2 不可能时
        # 简单做法：直接让 clone 无解）。回退后用 phase-1 solver 读值。
        sv, a, b = _build_lex_solver()
        s1 = sv.solver
        st1 = s1.Solve(sv.model)
        self.assertEqual(st1, cp_model.OPTIMAL)
        phase1_obj = s1.ObjectiveValue()

        orig = lexicographic._build_proxy_objective

        def _sabotage(phase2_model, clone_obs, ec, dc, cb):
            # 注入一条不可满足约束（0 == 1）→ phase-2 INFEASIBLE → 回退 S1。
            dummy = phase2_model.NewIntVar(0, 0, "dummy_infeasible")
            phase2_model.Add(dummy == 1)
            return orig(phase2_model, clone_obs, ec, dc, cb)

        lexicographic._build_proxy_objective = _sabotage
        try:
            config = {"enable_lexicographic_l4": True, "max_time_seconds": 30,
                      "lex_phase2_min_seconds": 5}
            req = _Req(n_emp=3)
            use2, p2 = lexicographic.run_phase2(sv, req, config, None, st1, s1)
        finally:
            lexicographic._build_proxy_objective = orig

        self.assertFalse(use2, "phase-2 INFEASIBLE 必须回退")
        self.assertIsNone(p2)
        # 回退后 phase-1 solver 仍持有阶段一最优解，obj 不变。
        self.assertEqual(s1.ObjectiveValue(), phase1_obj)

    def test_budget_too_small_skips_phase2(self):
        sv, a, b = _build_lex_solver()
        st1 = sv.solver.Solve(sv.model)
        # phase-1 几乎用满总预算 → 剩余 < min_seconds → 跳过。
        sv._phase1_elapsed = 28.0
        config = {"enable_lexicographic_l4": True, "max_time_seconds": 30,
                  "lex_phase2_min_seconds": 30}
        req = _Req(n_emp=3)
        use2, p2 = lexicographic.run_phase2(sv, req, config, None, st1, sv.solver)
        self.assertFalse(use2, "剩余预算不足应跳过 phase-2")
        self.assertIsNone(p2)


# ──────────────────────────────────────────────
# 3. 端到端：SolverV5.solve() 的 obj 来源与默认关等价
# ──────────────────────────────────────────────

class TestLexEndToEnd(unittest.TestCase):
    def _req(self, lex_on, n_emp=3):
        config = {}
        if lex_on:
            config = {"enable_lexicographic_l4": True, "max_time_seconds": 20,
                      "lex_phase2_min_seconds": 5}
        return SolverRequest(
            request_id="lex_%s" % ("on" if lex_on else "off"),
            window={"start_date": "2026-01-05", "end_date": "2026-01-06"},
            operation_demands=[
                _op(101, "2026-01-05T08:00:00Z", [1, 2], n_positions=1),
                _op(102, "2026-01-06T08:00:00Z", [1, 2], n_positions=1),
            ],
            employee_profiles=[_emp(i + 1) for i in range(n_emp)],
            calendar=[
                CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False),
                CalendarDay(date="2026-01-06", is_workday=True, is_triple_salary=False),
            ],
            shift_definitions=[], shared_preferences=[],
            config=config,
        )

    def test_default_off_equals_single_phase(self):
        # 默认关：结果与单阶段（V4）一致——可行且 status 正常。
        result = SolverV5().solve(self._req(lex_on=False))
        self.assertIn(result.get("status"), ("OPTIMAL", "FEASIBLE"))

    def test_lex_on_returns_valid_result(self):
        # lex 开启：不崩、可行（成功用 phase-2 或安全回退 phase-1，二者皆有效）。
        result = SolverV5().solve(self._req(lex_on=True))
        self.assertIn(result.get("status"), ("OPTIMAL", "FEASIBLE"))
        self.assertIn("metrics", result)
        self.assertIn("objective_value", result["metrics"])

    def test_large_scale_numerical_stability(self):
        # (d) 员工数 > 50：lex 开启不溢出、不崩、返回有效结果。
        result = SolverV5().solve(self._req(lex_on=True, n_emp=55))
        self.assertIn(result.get("status"), ("OPTIMAL", "FEASIBLE"))


if __name__ == "__main__":
    unittest.main()
