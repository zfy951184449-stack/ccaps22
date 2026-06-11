"""
test_hint_no_fix.py — S5 验收：软 solution hint 绝不 fix，不改最优值，失配安全降级。

覆盖（对应 20_IMPLEMENTATION_PLAN.md S5 验收 + 10_solver §4.2）：
  1. 部分不可行 hint → objective_value 仍 == 无 hint 时（同一模型最优唯一）。
  2. 空 dict / 乱序 / 多余字段 / list 形态均正常求解（不崩、不抛）。
  3. 反射断言：apply_hint 路径从不设置 fix_variables_to_their_hinted_value=True。
  4. 关 hint（enable_solution_hint=false）时与默认无 hint 行为一致（基线）。
  5. apply_hint 直接单元测试：跨输入失配（缺失变量）天然跳过，仅注入存在的变量。
"""

import unittest
from ortools.sat.python import cp_model

from core.solver import SolverV5
from core.hint_provider import apply_hint, greedy_hint, resolve_hint, _VarsBundle
from contracts.request import (
    SolverRequest, OperationDemand, PositionQualification,
    EmployeeProfile, CalendarDay,
)


def _make_req(config=None):
    """两个工序、两个候选员工的小可行模型（无班次定义，纯 assignment 层）。"""
    return SolverRequest(
        request_id="hint_test",
        window={"start_date": "2026-01-01", "end_date": "2026-01-02"},
        operation_demands=[
            OperationDemand(
                operation_plan_id=101, batch_id=1, batch_code="B1",
                operation_id=1, operation_name="Op1",
                planned_start="2026-01-01 08:00", planned_end="2026-01-01 12:00",
                planned_duration_minutes=240, required_people=1,
                position_qualifications=[
                    PositionQualification(position_number=1, qualifications=[],
                                          candidate_employee_ids=[1, 2])
                ],
            ),
            OperationDemand(
                operation_plan_id=102, batch_id=1, batch_code="B1",
                operation_id=2, operation_name="Op2",
                planned_start="2026-01-02 08:00", planned_end="2026-01-02 12:00",
                planned_duration_minutes=240, required_people=1,
                position_qualifications=[
                    PositionQualification(position_number=1, qualifications=[],
                                          candidate_employee_ids=[1, 2])
                ],
            ),
        ],
        employee_profiles=[
            EmployeeProfile(employee_id=1, employee_code="E1", employee_name="Emp1",
                            qualifications=[], unavailable_periods=[]),
            EmployeeProfile(employee_id=2, employee_code="E2", employee_name="Emp2",
                            qualifications=[], unavailable_periods=[]),
        ],
        calendar=[
            CalendarDay(date="2026-01-01", is_workday=True, is_triple_salary=False),
            CalendarDay(date="2026-01-02", is_workday=True, is_triple_salary=False),
        ],
        shift_definitions=[],
        shared_preferences=[],
        config=config,
    )


def _solve_obj(config):
    """跑求解并返回 (status, objective_value)。"""
    res = SolverV5().solve(_make_req(config))
    obj = None
    if isinstance(res, dict) and isinstance(res.get("metrics"), dict):
        obj = res["metrics"].get("objective_value")
    return res.get("status"), obj


class TestHintNoFix(unittest.TestCase):

    def test_partial_infeasible_hint_same_obj(self):
        """部分不可行 hint（含本模型不存在的 op/emp）不改变最优 objective_value。"""
        base_status, base_obj = _solve_obj({"enable_solution_hint": False})

        partial_hint = {
            "assignments": [
                {"op": 101, "pos": 1, "emp": 1},     # 存在 → 注入
                {"op": 999, "pos": 1, "emp": 1},     # op 不存在 → 跳过
                {"op": 102, "pos": 1, "emp": 7},     # emp 不存在 → 跳过
            ],
            "shifts": [
                {"emp": 1, "date": "2026-01-01", "shift": 555},  # 无 shift 变量 → 跳过
            ],
        }
        hint_status, hint_obj = _solve_obj({
            "enable_solution_hint": True,
            "hint": {"previous_solution": partial_hint},
        })

        self.assertEqual(base_status, hint_status)
        self.assertEqual(base_obj, hint_obj,
                         "软 hint 不应改变同一模型的最优 objective_value")

    def test_empty_disordered_extra_fields_solve_ok(self):
        """空 dict / 乱序 / 多余字段 / list 形态均正常求解，不崩。"""
        cases = [
            {"previous_solution": {}},
            {"previous_solution": {"assignments": []}},
            {"previous_solution": {"assignments": [{"emp": 1, "op": 101, "pos": 1, "junk": 9}]}},
            {"previous_solution": {"assignments": [[101, 1, 1]]}},  # list 形态
            {"previous_solution": {"weird_key": 123}},
            {"previous_solution": None},
            {},
        ]
        for hint_cfg in cases:
            status, obj = _solve_obj({"enable_solution_hint": True, "hint": hint_cfg})
            self.assertIn(status, ("OPTIMAL", "FEASIBLE"),
                          "hint=%r 应正常求解，实得 status=%s" % (hint_cfg, status))

    def test_hint_off_equals_baseline(self):
        """关 hint 与默认无 hint 行为一致（S1 基线）。"""
        off_status, off_obj = _solve_obj({"enable_solution_hint": False})
        # 默认无 previous_solution 时 greedy 兜底也只是 hint，不改最优值
        default_status, default_obj = _solve_obj({"enable_solution_hint": True})
        self.assertEqual(off_status, default_status)
        self.assertEqual(off_obj, default_obj)

    def test_never_sets_fix_variables_to_their_hinted_value(self):
        """
        反射断言：apply_hint 走完后，solver.parameters.fix_variables_to_their_hinted_value
        从未被设为 True。模拟整条 solve 路径里 model 上注入 hint，检查 solver 参数默认值。
        """
        solver = SolverV5()
        # 全程默认（hint on）跑一次完整 solve
        solver.solve(_make_req({"enable_solution_hint": True}))
        # CP-SAT 默认为 False；apply_hint 绝不触碰它
        self.assertFalse(
            bool(solver.solver.parameters.fix_variables_to_their_hinted_value),
            "fix_variables_to_their_hinted_value 绝不允许被设为 True",
        )

    def test_apply_hint_unit_only_injects_existing_vars(self):
        """apply_hint 单元：只注入模型里存在的变量，缺失变量 .get()->None->跳过。"""
        model = cp_model.CpModel()
        v_a = model.NewBoolVar("a")
        v_b = model.NewBoolVar("b")
        bundle = _VarsBundle(
            assignments={(101, 1, 1): v_a, (102, 1, 2): v_b},
            shift_assignments={},
        )
        hint = {
            "assignments": [
                {"op": 101, "pos": 1, "emp": 1},   # 存在
                {"op": 102, "pos": 1, "emp": 2},   # 存在
                {"op": 999, "pos": 1, "emp": 1},   # 不存在 → 跳过
                "garbage",                          # 非法 → 跳过
                {"op": "x", "pos": 1},              # 缺字段 → 跳过
            ],
            "shifts": [{"emp": 1, "date": "d", "shift": 9}],  # 无 shift 变量 → 跳过
        }
        applied = apply_hint(model, bundle, hint)
        self.assertEqual(applied, 2, "只应注入 2 个存在的 assignment 变量")

    def test_apply_hint_never_raises_on_garbage(self):
        """喂任意垃圾，apply_hint 返回 0，绝不抛出。"""
        model = cp_model.CpModel()
        bundle = _VarsBundle(assignments={}, shift_assignments={})
        for bad in [None, {}, {"assignments": "notalist"}, {"assignments": [None, 5]},
                    {"assignments": [{"op": None, "pos": None, "emp": None}]}, 12345]:
            try:
                n = apply_hint(model, bundle, bad)
            except Exception as e:  # noqa
                self.fail("apply_hint 对垃圾输入 %r 抛出异常：%s" % (bad, e))
            self.assertEqual(n, 0)

    def test_greedy_and_resolve_fallback(self):
        """greedy_hint 生成存在变量的 hint；resolve_hint 优先 previous_solution。"""
        req = _make_req({})
        bundle = _VarsBundle(
            assignments={(101, 1, 1): "v1", (101, 1, 2): "v2",
                         (102, 1, 1): "v3", (102, 1, 2): "v4"},
            shift_assignments={},
        )
        greedy = greedy_hint(req, bundle)
        self.assertTrue(len(greedy["assignments"]) >= 1)
        for a in greedy["assignments"]:
            self.assertIn((a["op"], a["pos"], a["emp"]), bundle.assignments)

        # resolve 优先取 previous_solution
        prev = {"assignments": [{"op": 101, "pos": 1, "emp": 1}], "shifts": []}
        hint, source = resolve_hint(req, {"hint": {"previous_solution": prev}}, bundle)
        self.assertEqual(source, "previous_solution")
        self.assertEqual(hint, prev)

        # 无 previous_solution → greedy 兜底
        hint2, source2 = resolve_hint(req, {}, bundle)
        self.assertEqual(source2, "greedy")


if __name__ == "__main__":
    unittest.main()
