"""
设备状态机·保持窗检测单测:对标人工构造的已知答案。
转移规则镜像 20260628_sm_state_transition.sql 的模板种子(模板编码作分组键)。
运行(在 prod_scheduler/ 下):python3 -m unittest tests.test_statemachine
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.statemachine import (  # noqa: E402
    ObjectState,
    StateOp,
    Transition,
    check_holds,
)
from contracts.request import StateCheckRequest  # noqa: E402


def seed_transitions():
    """镜像 ps_sm_transition 的模板种子(只取检测用得到的 *_col,不含默认数值)。"""
    return [
        # cip-sip
        Transition("cip-sip", "cleanliness", "dirty", "CIP", "clean", "cip_duration_minutes", "dht_hours", "cht_hours"),
        Transition("cip-sip", "sterility", "non_sterile", "SIP", "sterile", "sip_duration_minutes", None, "sht_hours", {"cleanliness": ["clean"]}),
        Transition("cip-sip", "cleanliness", "clean", "USE", "dirty"),
        # rip-sip
        Transition("rip-sip", "cleanliness", "dirty", "RIP", "rinsed", "rip_duration_minutes", "dht_hours", "rht_hours"),
        Transition("rip-sip", "sterility", "non_sterile", "SIP", "sterile", "sip_duration_minutes", None, "sht_hours", {"cleanliness": ["rinsed"]}),
        Transition("rip-sip", "cleanliness", "rinsed", "USE", "dirty"),
        # single-use
        Transition("single-use", "bag", "none", "INSTALL", "installed"),
        Transition("single-use", "bag", "installed", "USE", "used"),
    ]


def op(op_id, code, action, start, end):
    return StateOp(op_id=op_id, object_code=code, action=action, start_hour=start, end_hour=end)


class TestStateMachine(unittest.TestCase):
    def test_empty(self):
        r = check_holds([], [], seed_transitions())
        self.assertEqual(r["violation_count"], 0)
        self.assertEqual(r["checked_objects"], 0)

    def test_cip_chain_all_within_windows(self):
        # 脏(USE 0-10)→ CIP 12-14(DHT gap 2 ≤24)→ USE 20-30(CHT gap 6 ≤72):无超期
        obj = ObjectState("PT", "cip-sip", {"dht_hours": 24, "cht_hours": 72})
        ops = [op("u1", "PT", "USE", 0, 10), op("c1", "PT", "CIP", 12, 14), op("u2", "PT", "USE", 20, 30)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual(r["violation_count"], 0)
        self.assertEqual(r["checked_objects"], 1)

    def test_dht_violation(self):
        # 变脏后 30h 才开 CIP > DHT 24h
        obj = ObjectState("PT", "cip-sip", {"dht_hours": 24, "cht_hours": 72})
        ops = [op("u1", "PT", "USE", 0, 10), op("c1", "PT", "CIP", 40, 42)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual(r["violation_count"], 1)
        v = r["violations"][0]
        self.assertEqual(v["kind"], "dht_hours")
        self.assertEqual(v["action"], "CIP")
        self.assertAlmostEqual(v["gap_hours"], 30.0)
        self.assertAlmostEqual(v["over_by_hours"], 6.0)

    def test_cht_violation(self):
        # CIP 洗完后 86h 才被用 > CHT 72h
        obj = ObjectState("PT", "cip-sip", {"dht_hours": 24, "cht_hours": 72})
        ops = [op("u1", "PT", "USE", 0, 10), op("c1", "PT", "CIP", 12, 14), op("u2", "PT", "USE", 100, 110)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual(r["violation_count"], 1)
        self.assertEqual(r["violations"][0]["kind"], "cht_hours")

    def test_rip_chain_all_within_windows(self):
        # 脏 → RIP 6-8(DHT 1 ≤24)→ SIP 9-10(RHT 1 ≤8)→ USE 11-20(SHT 1 ≤12):无超期
        obj = ObjectState("AKTA", "rip-sip", {"dht_hours": 24, "rht_hours": 8, "sht_hours": 12})
        ops = [op("u0", "AKTA", "USE", 0, 5), op("r1", "AKTA", "RIP", 6, 8),
               op("s1", "AKTA", "SIP", 9, 10), op("u1", "AKTA", "USE", 11, 20)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual(r["violation_count"], 0)

    def test_rht_violation(self):
        # RIP 淋完后 20h 才 SIP > RHT 8h
        obj = ObjectState("AKTA", "rip-sip", {"dht_hours": 24, "rht_hours": 8, "sht_hours": 12})
        ops = [op("u0", "AKTA", "USE", 0, 5), op("r1", "AKTA", "RIP", 6, 8), op("s1", "AKTA", "SIP", 28, 29)]
        r = check_holds([obj], ops, seed_transitions())
        kinds = [v["kind"] for v in r["violations"]]
        self.assertIn("rht_hours", kinds)

    def test_sht_violation(self):
        # SIP 灭完后 40h 才被用 > SHT 12h
        obj = ObjectState("AKTA", "rip-sip", {"dht_hours": 24, "rht_hours": 8, "sht_hours": 12})
        ops = [op("u0", "AKTA", "USE", 0, 5), op("r1", "AKTA", "RIP", 6, 8),
               op("s1", "AKTA", "SIP", 9, 10), op("u1", "AKTA", "USE", 50, 60)]
        r = check_holds([obj], ops, seed_transitions())
        kinds = [v["kind"] for v in r["violations"]]
        self.assertIn("sht_hours", kinds)

    def test_single_use_no_windows(self):
        # 一次性链:换袋/使用,无保持窗 → 永不超期
        obj = ObjectState("SUB-50", "single-use", {})
        ops = [op("i1", "SUB-50", "INSTALL", 0, 1), op("u1", "SUB-50", "USE", 2, 100)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual(r["violation_count"], 0)
        self.assertEqual(r["checked_objects"], 1)

    def test_null_window_skips_check(self):
        # DHT 留空 = 不约束:即便 30h 才开 CIP 也不报(只剩 CHT 在管)
        obj = ObjectState("PT", "cip-sip", {"dht_hours": None, "cht_hours": 72})
        ops = [op("u1", "PT", "USE", 0, 10), op("c1", "PT", "CIP", 40, 42), op("u2", "PT", "USE", 50, 60)]
        r = check_holds([obj], ops, seed_transitions())
        self.assertEqual([v["kind"] for v in r["violations"]], [])

    def test_object_without_state_context_skipped(self):
        # 传了操作但没给该对象的模板/窗 → 跳过不臆测
        ops = [op("u1", "GHOST", "USE", 0, 10), op("c1", "GHOST", "CIP", 40, 42)]
        r = check_holds([], ops, seed_transitions())
        self.assertEqual(r["checked_objects"], 0)
        self.assertEqual(r["violation_count"], 0)

    def test_custom_transition_uses_template_default_window(self):
        # 自由建模:自定义转移没有实例覆盖列(*_col=None),只在转移上带默认窗。
        # 引擎应改用转移自带默认值,而非静默跳过。
        custom = [
            # 起始窗自带默认 10h(无 col),无对应实例列
            Transition("custom", "cleanliness", "dirty", "WASH", "clean",
                       start_within_hours=10, produces_validity_hours=20),
        ]
        # 对象绑 custom 模板,windows 为空(无任何实例列)
        obj = ObjectState("VESSEL", "custom", {})
        # 变脏(USE 0-5)→ 15h 后才 WASH:gap 10 ≤ 10? gap=15-5=10 恰好不超;改 16 触发
        ok = check_holds([obj], [op("u", "VESSEL", "USE", 0, 5), op("w", "VESSEL", "WASH", 15, 16)], custom)
        self.assertEqual(ok["violation_count"], 0)  # gap 10 == 窗 10,不超
        bad = check_holds([obj], [op("u", "VESSEL", "USE", 0, 5), op("w", "VESSEL", "WASH", 20, 21)], custom)
        self.assertEqual(bad["violation_count"], 1)  # gap 15 > 窗 10
        self.assertEqual(bad["violations"][0]["window_hours"], 10)
        self.assertIn("start_within", bad["violations"][0]["kind"])

    def test_custom_validity_default_and_instance_override(self):
        # to_state 有效期:自定义转移自带默认,实例 windows 若给同名列则覆盖。
        t = [Transition("c2", "cleanliness", "dirty", "WASH", "clean",
                        produces_validity_col="my_cht", produces_validity_hours=30)]
        ops = [op("w", "OBJ", "WASH", 0, 2), op("u", "OBJ", "USE", 50, 60)]  # WASH 完 48h 后才用
        # 无实例覆盖 → 用默认 30:48 > 30 超期
        d = check_holds([ObjectState("OBJ", "c2", {})], ops, t)
        self.assertEqual(d["violation_count"], 1)
        # 实例覆盖 my_cht=60 → 48 ≤ 60 不超
        ov = check_holds([ObjectState("OBJ", "c2", {"my_cht": 60})], ops, t)
        self.assertEqual(ov["violation_count"], 0)

    def test_request_contract_roundtrip(self):
        payload = {
            "objects": [{"object_code": "PT", "template": "cip-sip", "windows": {"dht_hours": 24, "cht_hours": 72}}],
            "operations": [
                {"op_id": "u1", "object_code": "PT", "action": "use", "start_hour": 0, "end_hour": 10},
                {"op_id": "c1", "object_code": "PT", "action": "cip", "start_hour": 40, "end_hour": 42},
            ],
            "transitions": [
                {"template": "cip-sip", "attribute": "cleanliness", "from_state": "dirty", "action": "CIP",
                 "to_state": "clean", "duration_col": "cip_duration_minutes",
                 "start_within_col": "dht_hours", "produces_validity_col": "cht_hours"},
            ],
        }
        req = StateCheckRequest.from_dict(payload)
        r = check_holds(req.objects, req.operations, req.transitions, day_hours=req.day_hours)
        # action 大小写归一(use→USE),DHT 30>24 → 1 处超期
        self.assertEqual(r["violation_count"], 1)
        self.assertEqual(r["violations"][0]["kind"], "dht_hours")


if __name__ == "__main__":
    unittest.main()
