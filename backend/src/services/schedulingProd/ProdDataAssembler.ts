/**
 * 排产引擎 DataAssembler —— 把 ps_* 拓扑 + 一批 CIP 操作组装成引擎请求。
 *
 * 模型:清洗对象有两类、平级——设备(罐/单元)与 管线(设备-设备的连接)。
 * 每个清洗对象「直接归属一个 CIP 站」。一道 CIP 操作引用一个对象编码(设备码 或 管线码),
 * 解析到该对象自己的 cip_station_id(一跳,无中间路由)。纯函数、不碰 DB,便于单测。
 */

export interface PsCipStationRow {
  id: number;
  code: string;
  name: string;
  capacity: number;
}

export interface PsCipEquipmentRow {
  id: number;
  code: string;
  name: string;
  type: string;
  cip_station_id: number | null;
}

export interface PsPipelineRow {
  id: number;
  code: string;
  name: string;
  from_equipment_id: number;
  to_equipment_id: number;
  cip_station_id: number;
}

/** 一道待落点的 CIP 操作(引用一个清洗对象:设备码 或 管线码)。 */
export interface CipOperationInput {
  opId: string;
  objectCode: string;
  startHour: number;
  durationHours: number;
}

/** 已解析到站、可直接喂引擎的 CIP 操作。 */
export interface EngineCipOperation {
  op_id: string;
  station_code: string;
  object_code: string;
  start_hour: number;
  duration_hours: number;
}

export interface UnresolvedOp {
  opId: string;
  objectCode: string;
  reason: string;
}

interface ObjectRef {
  stationId: number | null;
  kind: 'equipment' | 'pipeline';
}

export interface TopologyIndex {
  stationById: Map<number, PsCipStationRow>;
  /** 清洗对象编码 → 它归属的 cip_station_id(合并 设备 + 管线)。 */
  refByObjectCode: Map<string, ObjectRef>;
}

export function buildTopologyIndex(
  stations: PsCipStationRow[],
  equipment: PsCipEquipmentRow[],
  pipelines: PsPipelineRow[],
): TopologyIndex {
  const refByObjectCode = new Map<string, ObjectRef>();
  for (const e of equipment) refByObjectCode.set(e.code, { stationId: e.cip_station_id, kind: 'equipment' });
  for (const p of pipelines) refByObjectCode.set(p.code, { stationId: p.cip_station_id, kind: 'pipeline' });
  return {
    stationById: new Map(stations.map((s) => [s.id, s])),
    refByObjectCode,
  };
}

type ResolveResult = { station: PsCipStationRow } | { error: string };

/** 清洗对象(设备 或 管线) → 它归属的 CIP 站。 */
export function resolveStation(objectCode: string, index: TopologyIndex): ResolveResult {
  const ref = index.refByObjectCode.get(objectCode);
  if (!ref) return { error: `清洗对象未录(设备/管线缺 code=${objectCode})` };
  if (ref.stationId == null) return { error: `对象 ${objectCode} 未归属 CIP 站` };
  const station = index.stationById.get(ref.stationId);
  if (!station) return { error: `对象 ${objectCode} 归属的 CIP 站缺失(id=${ref.stationId})` };
  return { station };
}

export interface AssembleOptions {
  dayHours?: number;
  origin?: string;
  defaultCapacity?: number;
}

export function assembleCipPeakRequest(
  ops: CipOperationInput[],
  index: TopologyIndex,
  opts: AssembleOptions = {},
): { request: CipPeakRequestBody; unresolved: UnresolvedOp[] } {
  const operations: EngineCipOperation[] = [];
  const unresolved: UnresolvedOp[] = [];
  const capacityByStation: Record<string, number> = {};

  for (const op of ops) {
    const r = resolveStation(op.objectCode, index);
    if ('error' in r) {
      unresolved.push({ opId: op.opId, objectCode: op.objectCode, reason: r.error });
      continue;
    }
    operations.push({
      op_id: op.opId,
      station_code: r.station.code,
      object_code: op.objectCode,
      start_hour: op.startHour,
      duration_hours: op.durationHours,
    });
    capacityByStation[r.station.code] = r.station.capacity;
  }

  return {
    request: {
      operations,
      capacity_by_station: capacityByStation,
      default_capacity: opts.defaultCapacity ?? 1,
      day_hours: opts.dayHours ?? 24,
      origin: opts.origin,
    },
    unresolved,
  };
}

export interface CipPeakRequestBody {
  operations: EngineCipOperation[];
  capacity_by_station: Record<string, number>;
  default_capacity: number;
  day_hours: number;
  origin?: string;
}

// ── 设备状态机 · 保持窗检测(P1,模板版)的组装 ───────────────────────
// 设备/管线绑【状态机模板】(类型默认 ?? 设备覆盖);模板的转移规则带默认时序,设备同名列可覆盖。
// 后端解析出「每个对象的有效模板 + 有效保持窗」,连同模板转移规则与已定时操作喂引擎(引擎不碰 DB)。

/** 状态机模板(ps_sm_template)。 */
export interface PsTemplateRow {
  id: number;
  code: string;
  name: string;
}

/** 模板的一条转移规则(ps_sm_transition):默认时序 + 设备可覆盖列名。 */
export interface PsTransitionRow {
  template_id: number;
  attribute: string;
  from_state: string;
  action: string;
  to_state: string;
  duration_minutes: number | null;
  duration_col: string | null;
  start_within_hours: number | null;
  start_within_col: string | null;
  produces_validity_hours: number | null;
  produces_validity_col: string | null;
  requires_json: unknown;
}

/** 设备类型(ps_equipment_type):name + 默认状态机模板。 */
export interface PsEquipmentTypeRow {
  id: number;
  name: string;
  sm_template_id: number | null;
}

/** 清洗对象状态行:绑定 + 七个可覆盖时序列(设备有 type_name;管线无)。 */
export interface PsEquipmentStateRow {
  code: string;
  type_name?: string | null;
  sm_template_id: number | null;
  cip_duration_minutes: number | null;
  rip_duration_minutes: number | null;
  sip_duration_minutes: number | null;
  dht_hours: number | null;
  rht_hours: number | null;
  cht_hours: number | null;
  sht_hours: number | null;
}

export interface StateObjectSpec {
  object_code: string;
  template: string;
  windows: Record<string, number | null>;
}

const OVERRIDE_COLS = [
  'cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes',
  'dht_hours', 'rht_hours', 'cht_hours', 'sht_hours',
] as const;

function instOverride(row: PsEquipmentStateRow, col: string): number | null {
  if (!col || !(OVERRIDE_COLS as readonly string[]).includes(col)) return null;
  const v = (row as unknown as Record<string, unknown>)[col];
  return v == null ? null : Number(v);
}

/**
 * 解析每个清洗对象的「有效模板 + 有效保持窗」:
 *   有效模板 = 设备 sm_template_id ?? 其类型(type_name)的 sm_template_id;两者皆空 → 未绑,跳过。
 *   有效窗   = 设备同名覆盖列(若填)?? 模板该转移的默认窗;留空 = 不约束。
 */
export function buildStateObjects(
  equipment: PsEquipmentStateRow[],
  pipelines: PsEquipmentStateRow[],
  types: PsEquipmentTypeRow[],
  templates: PsTemplateRow[],
  transitions: PsTransitionRow[],
): StateObjectSpec[] {
  const templateById = new Map<number, PsTemplateRow>(templates.map((t) => [t.id, t]));
  const typeTemplateByName = new Map<string, number | null>(types.map((t) => [t.name, t.sm_template_id]));
  const transByTemplateId = new Map<number, PsTransitionRow[]>();
  for (const tr of transitions) {
    if (!transByTemplateId.has(tr.template_id)) transByTemplateId.set(tr.template_id, []);
    transByTemplateId.get(tr.template_id)!.push(tr);
  }

  const out: StateObjectSpec[] = [];
  const push = (r: PsEquipmentStateRow) => {
    const templateId = r.sm_template_id ?? (r.type_name ? typeTemplateByName.get(r.type_name) ?? null : null);
    if (templateId == null) return; // 未绑模板 → 无状态机,跳过
    const tpl = templateById.get(templateId);
    if (!tpl) return;
    const windows: Record<string, number | null> = {};
    for (const tr of transByTemplateId.get(templateId) ?? []) {
      if (tr.start_within_col) windows[tr.start_within_col] = instOverride(r, tr.start_within_col) ?? tr.start_within_hours;
      if (tr.produces_validity_col) windows[tr.produces_validity_col] = instOverride(r, tr.produces_validity_col) ?? tr.produces_validity_hours;
    }
    out.push({ object_code: r.code, template: tpl.code, windows });
  };
  equipment.forEach(push);
  pipelines.forEach(push);
  return out;
}

/** 转换模板转移规则为引擎契约(用模板编码作分组键;只传检测用得到的 *_col)。 */
export function buildEngineTransitions(templates: PsTemplateRow[], transitions: PsTransitionRow[]): EngineTransition[] {
  const codeById = new Map<number, string>(templates.map((t) => [t.id, t.code]));
  return transitions
    .filter((tr) => codeById.has(tr.template_id))
    .map((tr) => ({
      template: codeById.get(tr.template_id)!,
      attribute: tr.attribute,
      from_state: tr.from_state,
      action: tr.action,
      to_state: tr.to_state,
      duration_col: tr.duration_col,
      start_within_col: tr.start_within_col,
      produces_validity_col: tr.produces_validity_col,
      start_within_hours: tr.start_within_hours,
      produces_validity_hours: tr.produces_validity_hours,
      duration_minutes: tr.duration_minutes,
      requires_json: tr.requires_json,
    }));
}

/** 一道状态相关操作(已 placement 定时)。 */
export interface StateOpInput {
  opId: string;
  objectCode: string;
  action: string;
  startHour: number;
  endHour: number;
}

export interface EngineStateOp {
  op_id: string;
  object_code: string;
  action: string;
  start_hour: number;
  end_hour: number;
}

/** 一条状态转移规则(喂引擎;模板编码作分组键)。 */
export interface EngineTransition {
  template: string;
  attribute: string;
  from_state: string;
  action: string;
  to_state: string;
  duration_col: string | null;
  start_within_col: string | null;
  produces_validity_col: string | null;
  // 转移自带默认窗值(自由建模:自定义转移无固定实例列时引擎据此约束)
  start_within_hours: number | null;
  produces_validity_hours: number | null;
  duration_minutes: number | null;
  requires_json?: unknown;
}

export interface StateCheckRequestBody {
  objects: StateObjectSpec[];
  operations: EngineStateOp[];
  transitions: EngineTransition[];
  day_hours: number;
  origin?: string;
}

export function assembleStateCheckRequest(
  objects: StateObjectSpec[],
  ops: StateOpInput[],
  transitions: EngineTransition[],
  opts: AssembleOptions = {},
): StateCheckRequestBody {
  return {
    objects,
    operations: ops.map((o) => ({
      op_id: o.opId,
      object_code: o.objectCode,
      action: String(o.action || '').toUpperCase(),
      start_hour: o.startHour,
      end_hour: o.endHour,
    })),
    transitions,
    day_hours: opts.dayHours ?? 24,
    origin: opts.origin,
  };
}
