"""
Time-table 并发扫描 —— 排产 v1 资源层的核心语义(纯传播,无求解器)。

把每道 CIP 操作看成它所落 CIP 站上的一个半开区间 [start, start+dur),height=1。
对每个站做扫描线统计同刻并发数:
  · 站容量恒 1 → 任一时刻并发 > 1 即冲突(候选「报增援」:主站塞不下,需动备站/挪窗)。
  · 全站汇总并发的峰值 = 「同刻几次清洗」这个尖峰数字(对标 WBP2486 Day5=16)。

纯函数、无 IO、无第三方依赖,便于单测对标已知答案。
权威设计:docs/production_scheduling/40_scheduling_layer_spec.md(C10 time-table / C11 容量 / C16 优先级)。
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class Interval:
    """一道占用某 CIP 站的区间(半开 [start, end),单位:小时,自 origin 起算)。"""
    op_id: str
    station_code: str
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class Segment:
    """扫描产出的一段恒定并发区间。"""
    start: float
    end: float
    count: int
    op_ids: List[str]


def scan(intervals: List[Interval]) -> List[Segment]:
    """
    扫描线:把一组区间压成「恒定并发」的连续段。
    同一时刻先处理结束(-1)再处理开始(+1):一道结束恰逢另一道开始,不算重叠。
    """
    events: List[Tuple[float, int, str]] = []
    for it in intervals:
        if it.end <= it.start:
            continue  # 零/负时长不占资源
        events.append((it.start, 1, it.op_id))
        events.append((it.end, -1, it.op_id))
    if not events:
        return []
    # 排序:时间升序;同刻 -1(结束)在 +1(开始)之前
    events.sort(key=lambda e: (e[0], e[1]))

    segments: List[Segment] = []
    active: List[str] = []
    prev_t: Optional[float] = None
    i = 0
    n = len(events)
    while i < n:
        t = events[i][0]
        # 先把 [prev_t, t) 这段(在处理本时刻事件之前的并发状态)记录下来
        if prev_t is not None and t > prev_t and active:
            segments.append(Segment(prev_t, t, len(active), list(active)))
        # 处理所有发生在时刻 t 的事件
        while i < n and events[i][0] == t:
            _, delta, op_id = events[i]
            if delta == -1:
                if op_id in active:
                    active.remove(op_id)
            else:
                active.append(op_id)
            i += 1
        prev_t = t
    return segments


def _peak(segments: List[Segment]) -> Dict:
    """峰值并发 + 首个达到峰值的窗口。"""
    if not segments:
        return {"peak_concurrency": 0, "peak_window": None}
    peak = max(s.count for s in segments)
    win = next(s for s in segments if s.count == peak)
    return {
        "peak_concurrency": peak,
        "peak_window": {"start": win.start, "end": win.end, "op_ids": win.op_ids},
    }


def daily_peaks(segments: List[Segment], day_hours: float = 24.0) -> Dict[int, int]:
    """逐日峰值并发(用于读「Day5 的尖峰」)。day index = floor(hour / day_hours)。"""
    peaks: Dict[int, int] = {}
    for s in segments:
        first_day = int(s.start // day_hours)
        # 区间可能跨日:覆盖到 (end 落入的那天),end 为开区间故对齐边界减一极小量
        last_day = int((s.end - 1e-9) // day_hours)
        for d in range(first_day, last_day + 1):
            if d < 0:
                continue
            if s.count > peaks.get(d, 0):
                peaks[d] = s.count
    return peaks


def analyze(
    intervals: List[Interval],
    capacity_by_station: Optional[Dict[str, int]] = None,
    default_capacity: int = 1,
    day_hours: float = 24.0,
) -> Dict:
    """
    主入口。返回:
      overall   —— 全站汇总并发峰值 + 逐日峰值(尖峰数字)
      stations  —— 逐站峰值(负载呈现,不判冲突/不报增援)
    """
    capacity_by_station = capacity_by_station or {}

    overall_segments = scan(intervals)
    overall = _peak(overall_segments)
    overall["daily_peak"] = {str(d): c for d, c in sorted(daily_peaks(overall_segments, day_hours).items())}

    by_station: Dict[str, List[Interval]] = {}
    for it in intervals:
        by_station.setdefault(it.station_code, []).append(it)

    stations: List[Dict] = []
    for code, its in sorted(by_station.items()):
        cap = capacity_by_station.get(code, default_capacity)
        info = _peak(scan(its))
        stations.append({
            "station_code": code,
            "capacity": cap,
            "peak_concurrency": info["peak_concurrency"],
            "peak_window": info["peak_window"],
        })

    return {
        "overall": overall,
        "stations": stations,
    }
