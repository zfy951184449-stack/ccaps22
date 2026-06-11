"""
S7 无解诊断 pass 测试。

覆盖：
  1) 七组「单组无解」用例各命中对应 group/lit_key（§1.5 / §6.2 冻结集）。
  2) 同构性回归门禁（不可绕过）：同一份可行输入喂 diag_model 必判可行。
  3) 可行用例 diagnose 不被调用（mock 计数==0，零开销铁律）。
  4) 诊断后主结果 payload 形状 == V4 INFEASIBLE（status/schedules/unassigned_jobs）。
  5) 实时路径 infeasibility.groups[] 与结果路径 minimal_conflict_groups[] 组项字段一致。
"""

import unittest
from unittest import mock

from ortools.sat.python import cp_model

from contracts.request import (
    CalendarDay,
    EmployeeProfile,
    FrozenShift,
    LockedOperation,
    LockedShift,
    OperationDemand,
    PositionQualification,
    ShiftDefinition,
    SolverRequest,
    SpecialShiftCandidate,
    SpecialShiftRequirement,
)
from core import infeasibility as infeas
from core.solver import SolverV5


DAY = ShiftDefinition(
    shift_id=1, shift_code="D", shift_name="Day", start_time="08:00", end_time="20:00",
    nominal_hours=12, is_night_shift=False, plan_category="STANDARD",
)
REST = ShiftDefinition(
    shift_id=99, shift_code="R", shift_name="Rest", start_time="00:00", end_time="00:00",
    nominal_hours=0, is_night_shift=False, plan_category="STANDARD",
)

# 组项字段集（§1.5 冻结）。
_GROUP_FIELDS = {"group", "lit_key", "message_zh", "suggestion_zh", "config_keys"}
_SEVEN_GROUPS = {
    "STANDARD_HOURS", "LOCKED_OPERATIONS", "CONSECUTIVE_DAYS", "SPECIAL_SHIFT_COVERAGE",
    "LEADERSHIP_COVERAGE", "LOCKED_SHIFTS", "POSITION_MUST_FILL",
}


def _base_cfg(**over):
    """关掉一切可能干扰的约束/目标，留下被测组单独造无解。"""
    cfg = {
        "enable_share_group": False,
        "enable_locked_operations": False,
        "enable_locked_shifts": False,
        "enable_balance_night_shifts": False,
        "enable_minimize_special_shifts": False,
        "enable_minimize_deviation": False,
        "enable_employee_availability": False,
        "enable_flexible_scheduling": False,
        "enable_leadership_coverage": False,
        "enable_leader_production_coverage": False,
        "enable_max_consecutive_work_days": False,
        "enable_max_consecutive_rest_days": False,
        "enable_standard_hours": False,
        "enable_prefer_standard_shift": False,
        "allow_position_vacancy": False,
    }
    cfg.update(over)
    return cfg


def _emp(eid, role="FRONTLINE"):
    return EmployeeProfile(
        employee_id=eid, employee_code="E%d" % eid, employee_name="N%d" % eid,
        qualifications=[], unavailable_periods=[], org_role=role,
    )


def _op(op_id, candidate_lists, start="2026-01-12T08:30:00Z", end="2026-01-12T10:30:00Z",
        required=None):
    """candidate_lists: list of candidate-id lists, one per position."""
    pqs = [
        PositionQualification(position_number=i + 1, qualifications=[], candidate_employee_ids=c)
        for i, c in enumerate(candidate_lists)
    ]
    return OperationDemand(
        operation_plan_id=op_id, batch_id=1, batch_code="B", operation_id=1,
        operation_name="Op", planned_start=start, planned_end=end,
        planned_duration_minutes=120,
        required_people=required if required is not None else len(candidate_lists),
        position_qualifications=pqs,
    )


def _req(operation_demands, config, window=None, **kw):
    return SolverRequest(
        request_id="t",
        window=window or {"start_date": "2026-01-12", "end_date": "2026-01-12"},
        operation_demands=operation_demands,
        employee_profiles=kw.pop("employee_profiles", [_emp(1)]),
        calendar=kw.pop("calendar", [CalendarDay(date="2026-01-12", is_workday=True, is_triple_salary=False)]),
        shift_definitions=[DAY, REST],
        shared_preferences=[],
        special_shift_requirements=kw.pop("special_shift_requirements", []),
        config=config,
        **kw
    )


def _solve(req):
    solver = SolverV5()
    solver.solver.parameters.max_time_in_seconds = 8
    return solver.solve(req)


def _located_keys(result):
    ia = result.get("infeasibility_analysis") or {}
    return ia.get("located"), [g["lit_key"] for g in ia.get("minimal_conflict_groups", [])]


class TestSevenGroupDiagnosis(unittest.TestCase):
    """七组「单组无解」各命中对应 lit_key。"""

    def test_position_must_fill(self):
        # 1 op, 2 positions, both sole-candidate emp1 → OnePosition 阻止 → 无法填满。
        req = _req([_op(100, [[1], [1]], required=2)], _base_cfg(), employee_profiles=[_emp(1)])
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_fill", keys)
        self.assertEqual(res["infeasibility_analysis"]["minimal_conflict_groups"][0]["group"], "POSITION_MUST_FILL")

    def test_locked_operations(self):
        # 锁定不在候选的 emp9 → Add(0==1)。
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_operations=True),
                   locked_operations=[LockedOperation(operation_plan_id=100, enforced_employee_ids=[9])])
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_locked_op", keys)

    def test_locked_shifts(self):
        # strict 模式锁定缺失班次 → Add(0==1)。
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_shifts=True, strict_locked_shifts=True),
                   locked_shifts=[LockedShift(employee_id=1, date="2026-01-12", shift_id=777)])
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_locked_shift", keys)

    def test_special_shift_coverage(self):
        # 专项 HARD：需 3 人但仅 2 候选。
        req = _req(
            [], _base_cfg(enable_special_shift_coverage=True),
            employee_profiles=[_emp(1), _emp(2)],
            special_shift_requirements=[SpecialShiftRequirement(
                occurrence_id=11, window_id=1, date="2026-01-12", shift_id=1, required_people=3,
                eligible_employee_ids=[1, 2], fulfillment_mode="HARD", priority_level="HIGH",
                candidates=[SpecialShiftCandidate(employee_id=1, impact_cost=10),
                            SpecialShiftCandidate(employee_id=2, impact_cost=10)],
            )],
        )
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_special", keys)

    def test_standard_hours(self):
        # 负的下限偏移 → 月度下限远超单日最大工时 → 无解。
        req = _req([_op(100, [[1]])], _base_cfg(enable_standard_hours=True, monthly_hours_lower_offset=-100.0))
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_hours", keys)

    def test_consecutive_days(self):
        # 7 个连续生产日单候选 emp1 + max_consecutive_work_days=3 → 滑窗无解。
        ops = [_op(200 + i, [[1]],
                   start="2026-01-%02dT08:30:00Z" % (12 + i),
                   end="2026-01-%02dT10:30:00Z" % (12 + i)) for i in range(7)]
        cal = [CalendarDay(date="2026-01-%02d" % (12 + i), is_workday=True, is_triple_salary=False)
               for i in range(7)]
        req = _req(ops, _base_cfg(enable_max_consecutive_work_days=True, max_consecutive_work_days=3),
                   window={"start_date": "2026-01-12", "end_date": "2026-01-18"}, calendar=cal)
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_consec", keys)

    def test_leadership_coverage(self):
        # 生产日 D1 在 solve_range 之外、leader emp2 被 frozen 到 REST → Rule1 无可用领导。
        op = _op(100, [[1]])  # 生产 op 在 D1（2026-01-12）
        cal = [CalendarDay(date="2026-01-12", is_workday=True, is_triple_salary=False),
               CalendarDay(date="2026-01-13", is_workday=True, is_triple_salary=False)]
        req = _req(
            [op],
            _base_cfg(enable_leadership_coverage=True, enable_leader_production_coverage=True),
            window={"start_date": "2026-01-12", "end_date": "2026-01-13"},
            calendar=cal,
            employee_profiles=[_emp(1), _emp(2, role="GROUP_LEADER")],
            solve_range={"start_date": "2026-01-13", "end_date": "2026-01-13"},
            frozen_shifts=[FrozenShift(employee_id=2, date="2026-01-12", shift_id=99)],
        )
        res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        located, keys = _located_keys(res)
        self.assertTrue(located)
        self.assertIn("lit_leader", keys)


class TestIsomorphismGate(unittest.TestCase):
    """同构性回归门禁（不可绕过）：可行输入喂 diag_model 必判可行。"""

    def _assert_diag_feasible(self, req):
        diag_model, _ = infeas.build_diag_model(req, req.config)
        self.assertIsNotNone(diag_model, "诊断模型不应早退（可行输入）")
        s = cp_model.CpSolver()
        s.parameters.max_time_in_seconds = 8
        s.parameters.num_workers = 1
        status = s.Solve(diag_model)
        self.assertIn(
            status, (cp_model.OPTIMAL, cp_model.FEASIBLE),
            "可行输入喂 diag_model 却判 %s —— 同构被破坏" % s.StatusName(status),
        )

    def test_feasible_special_coverage(self):
        req = _req(
            [], _base_cfg(enable_special_shift_coverage=True),
            employee_profiles=[_emp(1), _emp(2)],
            special_shift_requirements=[SpecialShiftRequirement(
                occurrence_id=11, window_id=1, date="2026-01-12", shift_id=1, required_people=2,
                eligible_employee_ids=[1, 2], fulfillment_mode="HARD", priority_level="HIGH",
                candidates=[SpecialShiftCandidate(employee_id=1, impact_cost=10),
                            SpecialShiftCandidate(employee_id=2, impact_cost=10)],
            )],
        )
        self._assert_diag_feasible(req)

    def test_feasible_simple_assignment(self):
        # 单 op 单候选，足够人手；多组约束全开但可行。
        cfg = _base_cfg(
            enable_standard_hours=True, enable_leadership_coverage=True,
            enable_max_consecutive_work_days=True, enable_max_consecutive_rest_days=True,
        )
        req = _req([_op(100, [[1]])], cfg, employee_profiles=[_emp(1), _emp(2, role="GROUP_LEADER")])
        self._assert_diag_feasible(req)


class TestNoDiagnoseOnFeasible(unittest.TestCase):
    """可行/有解路径不调 diagnose（零开销铁律）。"""

    def test_diagnose_not_called_when_feasible(self):
        req = _req([_op(100, [[1]])], _base_cfg())
        with mock.patch("core.infeasibility.diagnose") as m:
            res = _solve(req)
        self.assertIn(res["status"], ("OPTIMAL", "FEASIBLE"))
        self.assertEqual(m.call_count, 0)
        # 有解路径不应带 infeasibility_analysis。
        self.assertNotIn("infeasibility_analysis", res)

    def test_diagnose_called_once_when_infeasible(self):
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_operations=True),
                   locked_operations=[LockedOperation(operation_plan_id=100, enforced_employee_ids=[9])])
        with mock.patch("core.infeasibility.diagnose",
                        return_value={"located": False, "groups": []}) as m:
            res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        self.assertEqual(m.call_count, 1)

    def test_diagnosis_disabled_by_config(self):
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_operations=True,
                                                enable_infeasibility_diagnosis=False),
                   locked_operations=[LockedOperation(operation_plan_id=100, enforced_employee_ids=[9])])
        with mock.patch("core.infeasibility.diagnose") as m:
            res = _solve(req)
        self.assertEqual(res["status"], "INFEASIBLE")
        self.assertEqual(m.call_count, 0)
        self.assertNotIn("infeasibility_analysis", res)


class TestPayloadShape(unittest.TestCase):
    """诊断后主结果形状 == V4 INFEASIBLE；组项字段对齐。"""

    def test_infeasible_payload_shape(self):
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_operations=True),
                   locked_operations=[LockedOperation(operation_plan_id=100, enforced_employee_ids=[9])])
        res = _solve(req)
        # V4 INFEASIBLE 形状：status/schedules/unassigned_jobs 保持。
        self.assertEqual(res["status"], "INFEASIBLE")
        self.assertEqual(res["schedules"], [])
        self.assertEqual(res["unassigned_jobs"], [])

        ia = res["infeasibility_analysis"]
        self.assertTrue(ia["is_infeasible"])
        self.assertIn("located", ia)
        self.assertIn("diagnosed_at", ia)
        self.assertIn("minimal_conflict_groups", ia)
        for g in ia["minimal_conflict_groups"]:
            self.assertTrue(_GROUP_FIELDS.issubset(set(g.keys())))
            self.assertIn(g["group"], _SEVEN_GROUPS)
            self.assertIsInstance(g["config_keys"], list)

    def test_realtime_and_result_group_fields_aligned(self):
        # diagnose 返回实时 groups；build_infeasibility_analysis 派生结果路径，组项字段集相同。
        req = _req([_op(100, [[1]])], _base_cfg(enable_locked_operations=True),
                   locked_operations=[LockedOperation(operation_plan_id=100, enforced_employee_ids=[9])])
        rt = infeas.diagnose(req, req.config)
        self.assertTrue(rt["located"])
        analysis = infeas.build_infeasibility_analysis(rt)
        rt_fields = {frozenset(g.keys()) for g in rt["groups"]}
        res_fields = {frozenset(g.keys()) for g in analysis["minimal_conflict_groups"]}
        self.assertEqual(rt_fields, res_fields)

    def test_literal_to_business_text_covers_seven_groups(self):
        groups = {v["group"] for v in infeas.LITERAL_TO_BUSINESS_TEXT.values()}
        self.assertEqual(groups, _SEVEN_GROUPS)
        # lit_key → group 映射逐字符与冻结集一致。
        self.assertEqual(infeas.LITERAL_TO_BUSINESS_TEXT["lit_hours"]["group"], "STANDARD_HOURS")
        self.assertEqual(infeas.LITERAL_TO_BUSINESS_TEXT["lit_fill"]["group"], "POSITION_MUST_FILL")


if __name__ == "__main__":
    unittest.main()
