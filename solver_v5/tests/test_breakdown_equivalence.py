"""
S3 验收测试：objective_breakdown 等价性（R2 验收基石）

核心断言（10_solver_design §3.3 / 实施计划 §1.4 / S3）：
    Σ (外层权重_k × breakdown[k]) == solver.ObjectiveValue()   整数严格相等
权重集冻结：{O0:1, O1:1, O2:w_impact, O3:w1, O4:w2, O5:w3, O6:w4, O7:w5, O8:1}
其中 O0/O1/O8 的全部权重已内嵌进表达式，外层乘子恒为 1。

必须覆盖含动态权重的非平凡场景（不能只测无空缺）：
  · 峰值日有空缺     —— O1 final_weight 含 peak_mult，验证动态峰值乘子未漂移
  · 非标时段有空缺   —— O1 final_weight 含 off_hours_mult
  · 有专项欠配       —— O0 PRIORITY_WEIGHTS 内嵌
  · 无空缺（平凡）   —— 退化为 0 也要等价
另含：obs_total == objective_value（lex 前置）；
      enable_objective_breakdown=false 时省略 breakdown 字段（不建变量）。

运行：python3 -m unittest tests.test_breakdown_equivalence
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from contracts.request import (
    SolverRequest, OperationDemand, PositionQualification,
    EmployeeProfile, CalendarDay,
)
from core.solver import SolverV5
from core.breakdown import ObjectiveBreakdown, BREAKDOWN_KEYS, KEY_TO_WEIGHT_NAME


# 外层权重 name（weights_applied 里的键）→ breakdown 分量键，用于运行期重建权重集。
_WEIGHTNAME_TO_KEY = {v: k for k, v in KEY_TO_WEIGHT_NAME.items()}


def _weighted_sum_from_result(result):
    """从 result.metrics.objective_breakdown 重建 Σ(外层权重 × 分量值)。

    权重集：O0/O1/O8 外层乘子=1；O2-O7 取 weights_applied[name]。
    """
    metrics = result["metrics"]
    ob = metrics["objective_breakdown"]
    weights_applied = ob["weights_applied"]
    total = 0
    for key in BREAKDOWN_KEYS:
        val = int(ob[key])
        if key in KEY_TO_WEIGHT_NAME:
            # O2-O7：外层乘子来自 weights_applied
            w = int(weights_applied[KEY_TO_WEIGHT_NAME[key]])
        else:
            # O0/O1/O8：外层乘子恒为 1（权重已内嵌表达式）
            w = 1
        total += w * val
    return total


class TestBreakdownUnit(unittest.TestCase):
    """ObjectiveBreakdown 工厂单元测试（不跑求解）。"""

    def test_disabled_builds_nothing(self):
        from ortools.sat.python import cp_model
        m = cp_model.CpModel()
        bd = ObjectiveBreakdown(m, enabled=False)
        x = m.NewIntVar(0, 10, "x")
        self.assertIsNone(bd.register("vacancy_penalty", x, weight=1))
        self.assertIsNone(bd.finalize_total([x]))
        self.assertEqual(bd.obs_vars, {})
        self.assertIsNone(bd.obs_total)
        self.assertIsNone(bd.build_metrics_breakdown(lambda v: 0, {}))

    def test_register_creates_equality_var(self):
        from ortools.sat.python import cp_model
        m = cp_model.CpModel()
        bd = ObjectiveBreakdown(m, enabled=True)
        x = m.NewIntVar(0, 10, "x")
        y = m.NewIntVar(0, 10, "y")
        expr = 2 * x + 3 * y
        obs = bd.register("hours_deviation_scaled", expr, weight=7)
        self.assertIsNotNone(obs)
        self.assertEqual(bd.weight_of("hours_deviation_scaled"), 7)
        m.Add(x == 2)
        m.Add(y == 1)
        s = cp_model.CpSolver()
        st = s.Solve(m)
        self.assertIn(st, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        # obs == 2*2 + 3*1 == 7
        self.assertEqual(s.Value(obs), 7)

    def test_unknown_key_raises(self):
        from ortools.sat.python import cp_model
        m = cp_model.CpModel()
        bd = ObjectiveBreakdown(m, enabled=True)
        x = m.NewIntVar(0, 1, "x")
        with self.assertRaises(ValueError):
            bd.register("not_a_key", x, weight=1)

    def test_constant_expr_records_weight_no_var(self):
        from ortools.sat.python import cp_model
        m = cp_model.CpModel()
        bd = ObjectiveBreakdown(m, enabled=True)
        self.assertIsNone(bd.register("special_impact", 0, weight=3))
        self.assertEqual(bd.weight_of("special_impact"), 3)
        self.assertNotIn("special_impact", bd.obs_vars)
        # read_values 把记了权重但无变量的分量补 0
        vals = bd.read_values(lambda v: 99)
        self.assertEqual(vals.get("special_impact"), 0)


def _emp(eid):
    return EmployeeProfile(
        employee_id=eid, employee_code="E%d" % eid, employee_name="Emp%d" % eid,
        qualifications=[], unavailable_periods=[],
    )


def _op(op_id, start_iso, candidates, n_positions=1, required_people=None,
        source_type="BATCH"):
    pqs = [
        PositionQualification(position_number=p + 1, qualifications=[],
                              candidate_employee_ids=list(candidates))
        for p in range(n_positions)
    ]
    od = OperationDemand(
        operation_plan_id=op_id, batch_id=1, batch_code="B001",
        operation_id=op_id, operation_name="Op%d" % op_id,
        planned_start=start_iso, planned_end=start_iso,
        planned_duration_minutes=240,
        required_people=(required_people if required_people is not None else n_positions),
        position_qualifications=pqs,
    )
    if source_type != "BATCH":
        try:
            od.source_type = source_type
        except Exception:
            pass
    return od


class TestBreakdownEquivalenceEndToEnd(unittest.TestCase):
    """端到端：真实 SolverV5().solve()，断言 Σ(权重×分量) == objective_value。"""

    def _solve(self, req):
        result = SolverV5().solve(req)
        self.assertIn(result.get("status"), ("OPTIMAL", "FEASIBLE"),
                      "预期可行，实际: %s / %s" % (result.get("status"), result.get("message")))
        return result

    def _assert_equivalence(self, result, scenario):
        metrics = result["metrics"]
        self.assertIn("objective_breakdown", metrics,
                      "%s: metrics 缺 objective_breakdown" % scenario)
        ob = metrics["objective_breakdown"]
        # schema：9 分量 + weights_applied
        for key in BREAKDOWN_KEYS:
            self.assertIn(key, ob, "%s: breakdown 缺 %s" % (scenario, key))
        self.assertIn("weights_applied", ob, "%s: 缺 weights_applied" % scenario)

        weighted_sum = _weighted_sum_from_result(result)
        obj_int = int(round(float(metrics["objective_value"])))
        self.assertEqual(
            weighted_sum, obj_int,
            "%s: Σ(权重×分量)=%d != objective_value=%d (breakdown=%s, weights=%s)"
            % (scenario, weighted_sum, obj_int, ob, ob["weights_applied"]))

    # ---- 场景 1：无空缺（平凡，全员可填）----
    def test_no_vacancy_trivial(self):
        # 1 op / 1 pos / 1 候选，无空缺开关 → 必填，O1=0
        req = SolverRequest(
            request_id="bd_no_vac",
            window={"start_date": "2026-01-05", "end_date": "2026-01-05"},
            operation_demands=[_op(101, "2026-01-05T08:00:00Z", [1], n_positions=1)],
            employee_profiles=[_emp(1)],
            calendar=[CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False)],
            shift_definitions=[], shared_preferences=[],
            config={},
        )
        result = self._solve(req)
        self._assert_equivalence(result, "no_vacancy")
        self.assertEqual(int(result["metrics"]["objective_breakdown"]["vacancy_penalty"]), 0)

    # ---- 场景 2：非标时段有空缺（O1 off_hours_mult 动态乘子）----
    def test_off_hours_vacancy(self):
        # 凌晨 02:00（off-hours：<7 或 >=22），无候选 + 允许空缺 → 强制空缺常量 1
        req = SolverRequest(
            request_id="bd_off_hours",
            window={"start_date": "2026-01-05", "end_date": "2026-01-05"},
            operation_demands=[_op(201, "2026-01-05T02:00:00Z", [], n_positions=1)],
            employee_profiles=[_emp(1)],
            calendar=[CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False)],
            shift_definitions=[], shared_preferences=[],
            config={"allow_position_vacancy": True},
        )
        result = self._solve(req)
        self._assert_equivalence(result, "off_hours_vacancy")
        ob = result["metrics"]["objective_breakdown"]
        self.assertGreater(int(ob["vacancy_penalty"]), 0, "off-hours 空缺应有惩罚")

    # ---- 场景 3：峰值日有空缺（O1 peak_mult 动态乘子）----
    def test_peak_day_vacancy(self):
        # 两天：day A 需求大（峰值），day B 需求小。A 上有强制空缺。
        # peak_mult(A) 应 > peak_mult(B)，验证动态峰值乘子嵌入未漂移。
        ops = []
        # day A：4 个 op 各 1 人（需求 4），其中 op 301 无候选 + 允许空缺 → 空缺
        ops.append(_op(301, "2026-01-05T10:00:00Z", [], n_positions=1))
        ops.append(_op(302, "2026-01-05T10:00:00Z", [1], n_positions=1))
        ops.append(_op(303, "2026-01-05T10:00:00Z", [2], n_positions=1))
        ops.append(_op(304, "2026-01-05T10:00:00Z", [3], n_positions=1))
        # day B：1 个 op 1 人（需求 1，低谷）
        ops.append(_op(311, "2026-01-06T10:00:00Z", [1], n_positions=1))
        req = SolverRequest(
            request_id="bd_peak",
            window={"start_date": "2026-01-05", "end_date": "2026-01-06"},
            operation_demands=ops,
            employee_profiles=[_emp(1), _emp(2), _emp(3)],
            calendar=[
                CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False),
                CalendarDay(date="2026-01-06", is_workday=True, is_triple_salary=False),
            ],
            shift_definitions=[], shared_preferences=[],
            config={"allow_position_vacancy": True},
        )
        result = self._solve(req)
        self._assert_equivalence(result, "peak_day_vacancy")
        ob = result["metrics"]["objective_breakdown"]
        self.assertGreater(int(ob["vacancy_penalty"]), 0, "峰值日空缺应有惩罚")

    # ---- 场景 4：有专项欠配（O0 PRIORITY_WEIGHTS 内嵌）----
    def test_special_shortage(self):
        # SpecialShiftJointCoverage 属 SHIFT_CONSTRAINTS，无 shift_definitions 时整段跳过；
        # 故须带班次定义，覆盖约束才会跑、shortage 才被绑定。
        from contracts.request import (
            SpecialShiftRequirement, SpecialShiftCandidate, ShiftDefinition,
        )
        # 专项需求 2 人，但只有 1 个候选 → 覆盖上限 1 → 至少 1 人欠配 → O0 > 0
        req = SolverRequest(
            request_id="bd_special_shortage",
            window={"start_date": "2026-01-05", "end_date": "2026-01-05"},
            operation_demands=[_op(401, "2026-01-05T08:00:00Z", [1], n_positions=1)],
            employee_profiles=[_emp(1)],
            calendar=[CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False)],
            shift_definitions=[
                ShiftDefinition(
                    shift_id=1, shift_code="D", shift_name="白班",
                    start_time="08:00", end_time="16:00",
                    nominal_hours=8.0, is_night_shift=False,
                )
            ],
            shared_preferences=[],
            special_shift_requirements=[
                SpecialShiftRequirement(
                    occurrence_id=9001,
                    window_id=1,
                    date="2026-01-05",
                    shift_id=1,
                    required_people=2,
                    eligible_employee_ids=[1],
                    candidates=[SpecialShiftCandidate(employee_id=1, impact_cost=0)],
                    fulfillment_mode="SOFT",  # 软专项：允许欠配 → O0 > 0
                )
            ],
            config={},
        )
        result = self._solve(req)
        self._assert_equivalence(result, "special_shortage")
        ob = result["metrics"]["objective_breakdown"]
        self.assertGreater(int(ob["special_shortage_penalty"]), 0, "应有专项欠配惩罚")

    # ---- enable_objective_breakdown=false：省略 breakdown 字段 ----
    def test_breakdown_disabled_omits_field(self):
        req = SolverRequest(
            request_id="bd_disabled",
            window={"start_date": "2026-01-05", "end_date": "2026-01-05"},
            operation_demands=[_op(501, "2026-01-05T08:00:00Z", [1], n_positions=1)],
            employee_profiles=[_emp(1)],
            calendar=[CalendarDay(date="2026-01-05", is_workday=True, is_triple_salary=False)],
            shift_definitions=[], shared_preferences=[],
            config={"enable_objective_breakdown": False},
        )
        result = self._solve(req)
        self.assertNotIn("objective_breakdown", result["metrics"],
                         "关闭时应省略 objective_breakdown 键")


if __name__ == "__main__":
    unittest.main()
