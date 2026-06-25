"""
排产引擎请求契约 —— 第一刀只有一个端点:CIP 容量尖峰分析。

输入由后端 ProdDataAssembler 组装:已把每道 CIP 操作解析到它落的 CIP 站(主站),
引擎只做并发扫描,不在这里做设备→管线→主站的拓扑解析(那在后端 TS 侧)。
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.timetable import Interval


@dataclass
class CipOperation:
    """一道已解析到 CIP 站的清洗操作。"""
    op_id: str
    station_code: str
    start_hour: float
    duration_hours: float
    equipment_code: Optional[str] = None   # 仅做溯源,不参与计算
    pipeline_code: Optional[str] = None     # 仅做溯源

    def to_interval(self) -> Interval:
        return Interval(
            op_id=self.op_id,
            station_code=self.station_code,
            start=float(self.start_hour),
            end=float(self.start_hour) + float(self.duration_hours),
        )

    @staticmethod
    def from_dict(d: dict) -> "CipOperation":
        return CipOperation(
            op_id=str(d["op_id"]),
            station_code=str(d["station_code"]),
            start_hour=float(d["start_hour"]),
            duration_hours=float(d["duration_hours"]),
            equipment_code=d.get("equipment_code"),
            pipeline_code=d.get("pipeline_code"),
        )


@dataclass
class CipPeakRequest:
    operations: List[CipOperation] = field(default_factory=list)
    capacity_by_station: Dict[str, int] = field(default_factory=dict)
    default_capacity: int = 1
    day_hours: float = 24.0
    origin: Optional[str] = None  # 批次 Day0 的 ISO 时间,仅供前端映射日期,不参与计算

    @staticmethod
    def from_dict(payload: dict) -> "CipPeakRequest":
        if payload is None:
            raise ValueError("空请求体")
        ops = [CipOperation.from_dict(o) for o in payload.get("operations", [])]
        return CipPeakRequest(
            operations=ops,
            capacity_by_station={str(k): int(v) for k, v in (payload.get("capacity_by_station") or {}).items()},
            default_capacity=int(payload.get("default_capacity", 1)),
            day_hours=float(payload.get("day_hours", 24.0)),
            origin=payload.get("origin"),
        )

    def intervals(self) -> List[Interval]:
        return [op.to_interval() for op in self.operations]
