"""
设备状态机·保持窗检测 —— 排产 v1 规划期检测(纯传播,无求解器)。

把每个清洗对象的「计划操作时间线」按 ps_sm_transition 规则走一遍状态机,检查两类 max-lag:
  · start_within(DHT 这类):from_state 须在此窗内发生本转移
      —— 设备变脏(上一道操作结束)后,清洗(CIP/RIP)须在 DHT 小时内开始。
  · produces_validity(CHT/RHT/SHT):to_state 的有效期
      —— 洗/淋/灭完(本操作结束)后,下一道消费操作须在 窗 小时内开始。
超窗 = 时序不可行 → 报冲突(不反推主链 D21;微调/报增援由上层按 C16 决定)。

v1 = 所有操作时间已知(placement 已定),STN 一致性退化为相邻间隔检查;待时间变为弹簧
变量(v2)再上一般化 STN/Bellman-Ford 传播。窗值由后端按列名(dht_hours/rht_hours/
cht_hours/sht_hours)取自 ps_cip_equipment/ps_pipeline 传入;留空(None)= 该约束不启用
(与列语义一致)。转移规则(ps_sm_transition)亦由后端读出后随请求传入,引擎不碰 DB。

纯函数、无 IO、无第三方依赖,便于单测对标已知答案。
权威设计:docs/production_scheduling/10_process_flow_model_spec.md(§3.3 状态机 / D13 max-lag)。
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

_EPS = 1e-9


@dataclass
class Transition:
    """一条状态转移规则(对应 ps_sm_transition 一行,归属一个状态机模板)。"""
    template: str        # 模板编码(分组键;后端按设备绑定的模板填)
    attribute: str
    from_state: str
    action: str
    to_state: str
    duration_col: Optional[str] = None
    start_within_col: Optional[str] = None       # from_state 须在此窗内发生本转移(DHT 这类)
    produces_validity_col: Optional[str] = None  # to_state 有效期(CHT/RHT/SHT)
    requires: Optional[dict] = None              # 跨属性前提(v1 携带不强制,留 P3 派生层)
    # 模板自带默认窗值(自由建模:自定义转移没有固定实例列时,引擎用这里的默认值;
    # 有 *_col 且实例填了值时,实例覆盖优先)。None = 该窗不约束。
    start_within_hours: Optional[float] = None
    produces_validity_hours: Optional[float] = None
    duration_minutes: Optional[float] = None     # 仅供溯源/展示,引擎不参与计算


@dataclass
class StateOp:
    """一道与状态相关的计划操作(已 placement 定时)。"""
    op_id: str
    object_code: str
    action: str          # CIP/RIP/SIP/USE/INSTALL/...(大写归一)
    start_hour: float
    end_hour: float


@dataclass
class ObjectState:
    """一个清洗对象的状态语境:绑定的状态机模板 + 各保持窗有效取值(列名→小时)。"""
    object_code: str
    template: str        # 该对象绑定的状态机模板编码(设备 ?? 类型默认,后端解析)
    windows: Dict[str, Optional[float]] = field(default_factory=dict)


@dataclass
class Violation:
    object_code: str
    kind: str            # 窗列名:dht_hours/rht_hours/cht_hours/sht_hours
    action: str          # 触发检查的动作
    window_hours: float
    gap_hours: float
    over_by_hours: float
    from_op_id: str
    to_op_id: str
    detail: str

    def to_dict(self) -> dict:
        return {
            "object_code": self.object_code,
            "kind": self.kind,
            "action": self.action,
            "window_hours": self.window_hours,
            "gap_hours": round(self.gap_hours, 6),
            "over_by_hours": round(self.over_by_hours, 6),
            "from_op_id": self.from_op_id,
            "to_op_id": self.to_op_id,
            "detail": self.detail,
        }


def _window(obj: ObjectState, col: Optional[str]) -> Optional[float]:
    if not col:
        return None
    v = obj.windows.get(col)
    return None if v is None else float(v)


def check_holds(
    objects: List[ObjectState],
    operations: List[StateOp],
    transitions: List[Transition],
    day_hours: float = 24.0,
) -> Dict:
    """
    主入口。按各对象的清洗链规则走时间线,检出保持窗超期。
    返回:violations(超期清单)+ 计数汇总。无求解、不改时间、不报增援(交上层)。
    """
    obj_by_code = {o.object_code: o for o in objects}

    rules_by_template: Dict[str, List[Transition]] = {}
    for t in transitions:
        rules_by_template.setdefault(t.template, []).append(t)

    ops_by_obj: Dict[str, List[StateOp]] = {}
    for op in operations:
        ops_by_obj.setdefault(op.object_code, []).append(op)
    for lst in ops_by_obj.values():
        lst.sort(key=lambda o: (o.start_hour, o.end_hour))

    violations: List[Violation] = []
    checked_objects = 0

    for code, ops in sorted(ops_by_obj.items()):
        obj = obj_by_code.get(code)
        if obj is None:
            continue  # 无状态语境(模板/窗未给)→ 跳过,不臆测
        rules = rules_by_template.get(obj.template, [])
        if not rules:
            continue
        checked_objects += 1

        # 一条转移「带 start_within / produces_validity 约束」的判定:有实例覆盖列 或 自带默认值。
        start_within = {r.action.upper(): r for r in rules if r.start_within_col or r.start_within_hours is not None}
        validity = {r.action.upper(): r for r in rules if r.produces_validity_col or r.produces_validity_hours is not None}

        for i, op in enumerate(ops):
            act = op.action.upper()

            # 1) start_within(DHT 这类):上一道结束(变脏)→ 本清洗须在窗内开始
            r = start_within.get(act)
            if r and i > 0:
                # 有效窗 = 实例覆盖列(若填)?? 转移自带默认;两者皆空 = 不约束
                w = _window(obj, r.start_within_col)
                if w is None:
                    w = r.start_within_hours
                if w is not None:
                    prev = ops[i - 1]
                    gap = op.start_hour - prev.end_hour
                    if gap > w + _EPS:
                        kind = r.start_within_col or f"{act}·start_within"
                        violations.append(Violation(
                            object_code=code, kind=kind, action=act,
                            window_hours=w, gap_hours=gap, over_by_hours=gap - w,
                            from_op_id=prev.op_id, to_op_id=op.op_id,
                            detail=f"{prev.op_id} 结束到 {op.op_id}({act})开始 {gap:.1f}h > {kind} {w:.0f}h",
                        ))

            # 2) produces_validity(CHT/RHT/SHT):本操作产出有效期态 → 下一道须在窗内消费
            r2 = validity.get(act)
            if r2 and i + 1 < len(ops):
                w = _window(obj, r2.produces_validity_col)
                if w is None:
                    w = r2.produces_validity_hours
                if w is not None:
                    nxt = ops[i + 1]
                    gap = nxt.start_hour - op.end_hour
                    if gap > w + _EPS:
                        kind = r2.produces_validity_col or f"{act}·validity"
                        violations.append(Violation(
                            object_code=code, kind=kind, action=act,
                            window_hours=w, gap_hours=gap, over_by_hours=gap - w,
                            from_op_id=op.op_id, to_op_id=nxt.op_id,
                            detail=f"{op.op_id}({act})结束到 {nxt.op_id} 开始 {gap:.1f}h > {kind} {w:.0f}h",
                        ))

    by_kind: Dict[str, int] = {}
    for v in violations:
        by_kind[v.kind] = by_kind.get(v.kind, 0) + 1

    return {
        "status": "ok",
        "checked_objects": checked_objects,
        "checked_operations": len(operations),
        "violations": [v.to_dict() for v in violations],
        "violation_count": len(violations),
        "violation_by_kind": by_kind,
    }
