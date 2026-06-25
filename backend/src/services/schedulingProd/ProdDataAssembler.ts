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
