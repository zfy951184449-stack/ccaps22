"""
S2 验收测试：stats_collector + phase/model_stats 事件

验收标准：
  1. by_constraint[*] 含 count/ms/vars 三键
  2. num_constraints == Σ by_constraint[*].count（OFF 计 0）
  3. 求解返回含 phase 事件（BUILDING/SOLVING/EXTRACTING）
  4. S1 基线 obj 不变（有 emit 时与无 emit 目标值一致）

运行：
  python3 -m unittest tests.test_stats_collector_s2
"""

import unittest
import sys
import os

# 保证 solver_v5/ 下可导入
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.stats_collector import StatsCollector


class TestStatsCollector(unittest.TestCase):
    """单元测试 StatsCollector 本身。"""

    def test_basic_record_and_payload(self):
        """基本 record + to_payload 结构。"""
        collector = StatsCollector()

        # 模拟两个约束 apply
        with collector.measure("FrozenRange"):
            # 空 apply，仅计时
            pass
        collector.record("FrozenRange", 5)

        with collector.measure("ShareGroup"):
            pass
        collector.record("ShareGroup", 3)

        # 关闭的约束
        collector.record("UniqueEmployee", "OFF")

        collector.set_layers(
            num_assignments=100,
            num_shift=50,
            num_vacancy=10,
        )

        payload = collector.to_payload()

        # 断言结构
        self.assertIn("num_vars", payload)
        self.assertIn("num_constraints", payload)
        self.assertIn("by_layer", payload)
        self.assertIn("by_constraint", payload)

        # num_vars = 100 + 50 + 10 = 160
        self.assertEqual(payload["num_vars"], 160)

        # num_constraints = 5 + 3 + 0(OFF) = 8
        self.assertEqual(payload["num_constraints"], 8)

        # 每条目含 count/ms/vars 三键
        for name, entry in payload["by_constraint"].items():
            self.assertIn("count", entry, f"{name} 缺 count")
            self.assertIn("ms", entry, f"{name} 缺 ms")
            self.assertIn("vars", entry, f"{name} 缺 vars")

        # OFF 时 ms=0 / vars=0
        off_entry = payload["by_constraint"]["UniqueEmployee"]
        self.assertEqual(off_entry["count"], "OFF")
        self.assertEqual(off_entry["ms"], 0.0)
        self.assertEqual(off_entry["vars"], 0)

    def test_num_constraints_equals_sum_of_counts(self):
        """num_constraints == Σ count（OFF 计 0）。"""
        collector = StatsCollector()
        expected_total = 0

        for i, count in enumerate([2, 0, 7, "OFF", 15, "OFF", 3]):
            with collector.measure(f"C{i}"):
                pass
            collector.record(f"C{i}", count)
            if count != "OFF":
                expected_total += count

        collector.set_layers()
        payload = collector.to_payload()

        # Σ counts
        actual_sum = sum(
            v["count"] if v["count"] != "OFF" else 0
            for v in payload["by_constraint"].values()
        )
        self.assertEqual(payload["num_constraints"], actual_sum)
        self.assertEqual(payload["num_constraints"], expected_total)

    def test_ms_is_non_negative_float(self):
        """ms 为非负浮点数。"""
        import time
        collector = StatsCollector()
        with collector.measure("Slow"):
            time.sleep(0.01)  # 10ms
        collector.record("Slow", 1)
        payload = collector.to_payload()
        ms = payload["by_constraint"]["Slow"]["ms"]
        self.assertIsInstance(ms, float)
        self.assertGreater(ms, 0)

    def test_set_layers_explicit_num_vars(self):
        """显式传 num_vars 时不求和。"""
        collector = StatsCollector()
        collector.set_layers(num_assignments=10, num_shift=5, num_vars=999)
        payload = collector.to_payload()
        self.assertEqual(payload["num_vars"], 999)

    def test_presolve_optional(self):
        """未设置 presolve 时 payload 不含 presolve 键。"""
        collector = StatsCollector()
        collector.set_layers()
        payload = collector.to_payload()
        self.assertNotIn("presolve", payload)

    def test_presolve_set(self):
        """set_presolve 后 payload 含 presolve 键。"""
        collector = StatsCollector()
        collector.set_presolve(1000, 800, 500, 400)
        collector.set_layers()
        payload = collector.to_payload()
        self.assertIn("presolve", payload)
        ps = payload["presolve"]
        self.assertEqual(ps["vars_before"], 1000)
        self.assertEqual(ps["vars_after"], 800)
        self.assertEqual(ps["ctrs_before"], 500)
        self.assertEqual(ps["ctrs_after"], 400)


class TestPhaseAndModelStatsInCallback(unittest.TestCase):
    """
    集成测试：真实运行 SolverV5，通过 monkey-patch 拦截回调 payload，
    验证 PHASE_ENTER + MODEL_STATS 事件存在且结构正确。
    """

    def _make_tiny_request(self):
        """构造一个最小可解 request（无班次，有 op+员工）。"""
        from contracts.request import (
            SolverRequest, OperationDemand, PositionQualification,
            EmployeeProfile, CalendarDay,
        )
        return SolverRequest(
            request_id="s2_test",
            window={"start_date": "2026-01-01", "end_date": "2026-01-01"},
            operation_demands=[
                OperationDemand(
                    operation_plan_id=101,
                    batch_id=1, batch_code="B001",
                    operation_id=1, operation_name="Op1",
                    planned_start="2026-01-01T08:00:00Z",
                    planned_end="2026-01-01T12:00:00Z",
                    planned_duration_minutes=240,
                    required_people=1,
                    position_qualifications=[
                        PositionQualification(
                            position_number=1,
                            qualifications=[],
                            candidate_employee_ids=[1],
                        )
                    ],
                )
            ],
            employee_profiles=[
                EmployeeProfile(
                    employee_id=1, employee_code="E1", employee_name="Emp1",
                    qualifications=[], unavailable_periods=[],
                )
            ],
            calendar=[CalendarDay(date="2026-01-01", is_workday=True, is_triple_salary=False)],
            shift_definitions=[],
            shared_preferences=[],
            config={
                "metadata": {"run_id": "s2-run-001"},
            },
        )

    def test_emit_phase_and_model_stats_captured(self):
        """
        monkey-patch APICallbackV5._send_now_v5 / _send_now 拦截所有外发 payload，
        检查 PHASE_ENTER(BUILDING/SOLVING/EXTRACTING) 和 MODEL_STATS 存在。
        """
        from core.solver import SolverV5
        from core.callback import APICallbackV5

        captured = []

        def fake_send_now_v5(self_cb, status, progress=None, metrics=None,
                              message=None, log_line=None, type="INFO", extra=None):
            payload = {"status": status, "type": type}
            if extra:
                payload.update(extra)
            captured.append(payload)

        def fake_send_now(self_cb, status, progress=None, metrics=None,
                          message=None, log_line=None, type="STATUS"):
            captured.append({"status": status, "type": type})

        # Monkey-patch（只在本测试生效）
        orig_v5 = APICallbackV5._send_now_v5
        orig_v4 = APICallbackV5._send_now
        try:
            APICallbackV5._send_now_v5 = fake_send_now_v5
            APICallbackV5._send_now = fake_send_now

            solver = SolverV5()
            result = solver.solve(self._make_tiny_request())
        finally:
            APICallbackV5._send_now_v5 = orig_v5
            APICallbackV5._send_now = orig_v4

        # 1. 求解成功
        self.assertIn(result.get("status"), ("OPTIMAL", "FEASIBLE"),
                      f"预期可行，实际: {result.get('status')}")

        # 2. 有 PHASE_ENTER 事件
        phase_events = [p for p in captured if p.get("event") == "PHASE_ENTER"]
        self.assertTrue(len(phase_events) >= 2,
                        f"预期至少 2 个 PHASE_ENTER 事件，实际: {len(phase_events)}")

        phases_seen = {p.get("phase") for p in phase_events}
        self.assertIn("BUILDING", phases_seen, "缺 BUILDING phase")
        self.assertIn("SOLVING", phases_seen, "缺 SOLVING phase")

        # 3. 有 MODEL_STATS 事件且结构正确
        stats_events = [p for p in captured if p.get("event") == "MODEL_STATS"]
        self.assertEqual(len(stats_events), 1, f"预期恰好 1 个 MODEL_STATS，实际: {len(stats_events)}")

        ms = stats_events[0].get("model_stats", {})
        self.assertIn("num_vars", ms)
        self.assertIn("num_constraints", ms)
        self.assertIn("by_layer", ms)
        self.assertIn("by_constraint", ms)

        # 4. by_constraint[*] 含 count/ms/vars 三键
        for name, entry in ms["by_constraint"].items():
            self.assertIn("count", entry, f"{name} 缺 count")
            self.assertIn("ms", entry, f"{name} 缺 ms")
            self.assertIn("vars", entry, f"{name} 缺 vars")

        # 5. num_constraints == Σ count（OFF 计 0）
        sigma_count = sum(
            v["count"] if v["count"] != "OFF" else 0
            for v in ms["by_constraint"].values()
        )
        self.assertEqual(ms["num_constraints"], sigma_count,
                         f"num_constraints({ms['num_constraints']}) != Σcount({sigma_count})")

    def test_objective_unchanged_with_stats(self):
        """
        有 emit 时 obj 与无 callback 时 obj 一致（S1 基线不变）。
        注意：无 run_id 时无 callback，此处直接对比两次求解结果的 status 和 obj。
        """
        from contracts.request import (
            SolverRequest, OperationDemand, PositionQualification,
            EmployeeProfile, CalendarDay,
        )
        from core.solver import SolverV5

        def _req(run_id_val=None):
            cfg = {}
            if run_id_val:
                cfg["metadata"] = {"run_id": run_id_val}
            return SolverRequest(
                request_id="s2_obj_test",
                window={"start_date": "2026-01-02", "end_date": "2026-01-02"},
                operation_demands=[
                    OperationDemand(
                        operation_plan_id=201,
                        batch_id=2, batch_code="B002",
                        operation_id=2, operation_name="Op2",
                        planned_start="2026-01-02T08:00:00Z",
                        planned_end="2026-01-02T12:00:00Z",
                        planned_duration_minutes=240,
                        required_people=1,
                        position_qualifications=[
                            PositionQualification(
                                position_number=1,
                                qualifications=[],
                                candidate_employee_ids=[2, 3],
                            )
                        ],
                    )
                ],
                employee_profiles=[
                    EmployeeProfile(employee_id=2, employee_code="E2", employee_name="Emp2",
                                    qualifications=[], unavailable_periods=[]),
                    EmployeeProfile(employee_id=3, employee_code="E3", employee_name="Emp3",
                                    qualifications=[], unavailable_periods=[]),
                ],
                calendar=[CalendarDay(date="2026-01-02", is_workday=True, is_triple_salary=False)],
                shift_definitions=[],
                shared_preferences=[],
                config=cfg,
            )

        from core.callback import APICallbackV5

        def noop_send(*args, **kwargs):
            pass

        orig_v5 = APICallbackV5._send_now_v5
        orig_v4 = APICallbackV5._send_now
        try:
            APICallbackV5._send_now_v5 = lambda *a, **kw: None
            APICallbackV5._send_now = lambda *a, **kw: None

            # 有 callback（含 emit 调用）
            result_with = SolverV5().solve(_req(run_id_val="s2-obj-cb"))
        finally:
            APICallbackV5._send_now_v5 = orig_v5
            APICallbackV5._send_now = orig_v4

        # 无 callback（无 run_id）
        result_without = SolverV5().solve(_req(run_id_val=None))

        self.assertIn(result_with.get("status"), ("OPTIMAL", "FEASIBLE"))
        self.assertIn(result_without.get("status"), ("OPTIMAL", "FEASIBLE"))

        obj_with = result_with["metrics"]["objective_value"]
        obj_without = result_without["metrics"]["objective_value"]
        self.assertEqual(int(obj_with), int(obj_without),
                         f"emit 后 obj 改变: with={obj_with}, without={obj_without}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
