"""
time-table 扫描的单测:对标人工构造的已知答案(含复刻 Day5=16 尖峰)。
只判并发峰值/负载,不判冲突、不报增援。
运行(在 prod_scheduler/ 下):python3 -m unittest tests.test_timetable
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.timetable import Interval, analyze, daily_peaks, scan  # noqa: E402
from contracts.request import CipPeakRequest  # noqa: E402


def iv(op_id, station, start, end):
    return Interval(op_id=op_id, station_code=station, start=start, end=end)


class TestTimeTable(unittest.TestCase):
    def test_empty(self):
        r = analyze([])
        self.assertEqual(r["overall"]["peak_concurrency"], 0)
        self.assertEqual(r["stations"], [])

    def test_non_overlapping_peak_one(self):
        # 同站两道首尾相接:并发峰值 1
        its = [iv("a", "S1", 0, 24), iv("b", "S1", 24, 48)]
        r = analyze(its)
        self.assertEqual(r["overall"]["peak_concurrency"], 1)

    def test_end_meets_start_not_overlap(self):
        # t=24 同时一道结束一道开始,半开区间不算重叠
        segs = scan([iv("a", "S1", 0, 24), iv("b", "S1", 24, 48)])
        self.assertTrue(all(s.count <= 1 for s in segs))

    def test_overlap_peak_on_one_station(self):
        # 同站三道重叠 [10,20):该站并发峰值 3
        its = [iv("a", "S1", 10, 20), iv("b", "S1", 12, 18), iv("c", "S1", 11, 19)]
        r = analyze(its)
        self.assertEqual(r["overall"]["peak_concurrency"], 3)
        self.assertEqual(len(r["stations"]), 1)
        self.assertEqual(r["stations"][0]["station_code"], "S1")
        self.assertEqual(r["stations"][0]["peak_concurrency"], 3)

    def test_distinct_stations_aggregate_peak(self):
        # 三道同刻分落三个站:全站汇总并发 3,每站各 1
        its = [iv("a", "S1", 10, 20), iv("b", "S2", 10, 20), iv("c", "S3", 10, 20)]
        r = analyze(its)
        self.assertEqual(r["overall"]["peak_concurrency"], 3)
        self.assertTrue(all(s["peak_concurrency"] == 1 for s in r["stations"]))

    def test_daily_peak_indexing(self):
        # Day5 [120,144):落在第 5 天
        segs = scan([iv("x", "S1", 121, 130)])
        dp = daily_peaks(segs, day_hours=24.0)
        self.assertEqual(dp.get(5), 1)
        self.assertNotIn(0, dp)

    def test_reproduce_day5_peak_16(self):
        # 复刻 WBP2486 已知尖峰:Day5 同刻 16 道清洗(分落 16 个站 → 汇总并发 16)
        day5_start = 5 * 24
        its = [iv(f"cip{i}", f"S{i}", day5_start + 1, day5_start + 6) for i in range(16)]
        r = analyze(its, day_hours=24.0)
        self.assertEqual(r["overall"]["peak_concurrency"], 16)
        self.assertEqual(r["overall"]["daily_peak"].get("5"), 16)

    def test_request_contract_roundtrip(self):
        payload = {
            "day_hours": 24,
            "operations": [
                {"op_id": "o1", "station_code": "CIP-S1", "start_hour": 120, "duration_hours": 5,
                 "equipment_code": "PT1810", "pipeline_code": "M1"},
                {"op_id": "o2", "station_code": "CIP-S1", "start_hour": 122, "duration_hours": 5},
            ],
        }
        req = CipPeakRequest.from_dict(payload)
        r = analyze(req.intervals(), capacity_by_station=req.capacity_by_station,
                    default_capacity=req.default_capacity, day_hours=req.day_hours)
        # 两道在 CIP-S1 重叠 [122,125) → 并发峰值 2
        self.assertEqual(r["overall"]["peak_concurrency"], 2)
        self.assertEqual(r["stations"][0]["peak_concurrency"], 2)


if __name__ == "__main__":
    unittest.main()
