"""
排产引擎请求契约 —— 第一刀只有一个端点:CIP 容量尖峰分析。

输入由后端 ProdDataAssembler 组装:已把每道 CIP 操作解析到它落的 CIP 站(主站),
引擎只做并发扫描,不在这里做设备→管线→主站的拓扑解析(那在后端 TS 侧)。
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.timetable import Interval
from core.statemachine import ObjectState, StateOp, Transition


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


@dataclass
class StateCheckRequest:
    """
    设备状态机·保持窗检测请求。由后端 ProdDataAssembler 组装:
      · objects     —— 每个清洗对象的清洗链 regime + 各保持窗取值(列名→小时,取自 ps_*)。
      · operations  —— 已 placement 定时的状态相关操作(CIP/RIP/SIP/USE/...)。
      · transitions —— ps_sm_transition 规则(引擎不碰 DB,规则随请求传入)。
    """
    objects: List[ObjectState] = field(default_factory=list)
    operations: List[StateOp] = field(default_factory=list)
    transitions: List[Transition] = field(default_factory=list)
    day_hours: float = 24.0
    origin: Optional[str] = None  # Day0 ISO,仅供前端映射日期,不参与计算

    @staticmethod
    def from_dict(payload: dict) -> "StateCheckRequest":
        if payload is None:
            raise ValueError("空请求体")
        objects = [
            ObjectState(
                object_code=str(o["object_code"]),
                template=str(o.get("template", "")),
                windows={k: (None if v is None else float(v)) for k, v in (o.get("windows") or {}).items()},
            )
            for o in payload.get("objects", [])
        ]
        operations = [
            StateOp(
                op_id=str(op["op_id"]),
                object_code=str(op["object_code"]),
                action=str(op.get("action", "")).upper(),
                start_hour=float(op["start_hour"]),
                end_hour=float(op["end_hour"]),
            )
            for op in payload.get("operations", [])
        ]
        def _num(v):
            return None if v is None else float(v)

        transitions = [
            Transition(
                template=str(t.get("template") if t.get("template") is not None else t.get("regime", "")),
                attribute=str(t.get("attribute", "")),
                from_state=str(t.get("from_state", "")),
                action=str(t["action"]).upper(),
                to_state=str(t.get("to_state", "")),
                duration_col=t.get("duration_col"),
                start_within_col=t.get("start_within_col"),
                produces_validity_col=t.get("produces_validity_col"),
                requires=t.get("requires_json") if t.get("requires_json") is not None else t.get("requires"),
                start_within_hours=_num(t.get("start_within_hours")),
                produces_validity_hours=_num(t.get("produces_validity_hours")),
                duration_minutes=_num(t.get("duration_minutes")),
            )
            for t in payload.get("transitions", [])
        ]
        return StateCheckRequest(
            objects=objects,
            operations=operations,
            transitions=transitions,
            day_hours=float(payload.get("day_hours", 24.0)),
            origin=payload.get("origin"),
        )
