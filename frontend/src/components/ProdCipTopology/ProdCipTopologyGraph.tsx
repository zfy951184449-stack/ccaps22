/**
 * 排产 CIP 拓扑 · 只读拓扑总览(SVG,无新接口 —— 复用维护页已加载的五类数据)。
 *
 * 读法:
 *  - 每条「泳道」= 一个 CIP 站(绿)/ 免洗·COP·其他(灰)/ 未指派 CIP 站(琥珀,需补)。
 *    设备落在哪条泳道 = 它由哪个站清洗(泳道内含 = 清洗归属,故不再画长连线)。
 *  - 灰色细线 = 母子设备(skid → pou,parent_equipment_id)。
 *  - 蓝色虚线 = 管线(连接两台设备,标签为管线编码;由哪个站清洗见其泳道/悬浮)。
 *  - 设备节点上的房间标签 ·随上级 = 房间/team 留空、沿父链继承。
 *  - 点节点 = 打开该对象的编辑抽屉(onPick)。
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WxbButton, WxbEmpty } from '../wxb-ui';
import type {
  CipEquipmentRow,
  CipStationRow,
  OrgUnitRow,
  PipelineRow,
  ProdEntity,
  RoomRow,
} from '../../services/prodResourceApi';

interface Props {
  stations: CipStationRow[];
  rooms: RoomRow[];
  equipment: CipEquipmentRow[];
  pipelines: PipelineRow[];
  orgUnits: OrgUnitRow[];
  onPick?: (entity: ProdEntity, id: number) => void;
}

const NODE_W = 158;
const NODE_H = 50;
const COL_GAP = 22;
const ROW_GAP = 20;
const HEAD_W = 200; // 泳道头(CIP 站)列宽
const PAD = 22; // 画布内边距
const BAND_PAD = 16; // 泳道内边距
const BAND_GAP = 14; // 泳道间距

const TYPE_LABEL: Record<string, string> = {
  reactor: '反应器',
  'akta-skid': '层析 skid',
  tank: '储罐',
  'ufdf-skid': '超滤 skid',
  transfer: '转移',
  other: '其他',
};

type BandKind = 'station' | 'noncip' | 'unassigned';
interface Band {
  key: string;
  kind: BandKind;
  code: string;
  name: string;
  station?: CipStationRow;
  items: CipEquipmentRow[];
  pipeCount: number;
}

const trunc = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const ProdCipTopologyGraph: React.FC<Props> = ({ stations, rooms, equipment, pipelines, orgUnits, onPick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(1080);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setCw(Math.max(720, el.clientWidth - 4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 派生映射 ──
  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const orgName = useMemo(() => {
    const m = new Map(orgUnits.map((o) => [o.id, o.name]));
    return (id: number | null) => (id != null ? m.get(id) ?? null : null);
  }, [orgUnits]);

  // 子设备留空时沿父链继承房间/组织(读侧派生,深度保护防环)
  const effRoom = useMemo(() => {
    const fn = (e: CipEquipmentRow | undefined, depth = 0): { id: number | null; inherited: boolean } => {
      if (!e || depth > 8) return { id: null, inherited: depth > 0 };
      if (e.room_id != null) return { id: e.room_id, inherited: depth > 0 };
      return fn(e.parent_equipment_id != null ? equipById.get(e.parent_equipment_id) : undefined, depth + 1);
    };
    return fn;
  }, [equipById]);
  const effOrg = useMemo(() => {
    const fn = (e: CipEquipmentRow | undefined, depth = 0): { id: number | null; inherited: boolean } => {
      if (!e || depth > 8) return { id: null, inherited: depth > 0 };
      if (e.org_unit_id != null) return { id: e.org_unit_id, inherited: depth > 0 };
      const rm = e.room_id != null ? roomById.get(e.room_id) : undefined;
      if (rm?.org_unit_id != null) return { id: rm.org_unit_id, inherited: depth > 0 };
      return fn(e.parent_equipment_id != null ? equipById.get(e.parent_equipment_id) : undefined, depth + 1);
    };
    return fn;
  }, [equipById, roomById]);

  // 节点内父链深度(同一泳道内排序:父在前)
  const depthOf = useMemo(() => {
    const cache = new Map<number, number>();
    const fn = (e: CipEquipmentRow, guard = 0): number => {
      if (cache.has(e.id)) return cache.get(e.id)!;
      if (guard > 8 || e.parent_equipment_id == null) {
        cache.set(e.id, 0);
        return 0;
      }
      const p = equipById.get(e.parent_equipment_id);
      const d = p ? fn(p, guard + 1) + 1 : 0;
      cache.set(e.id, d);
      return d;
    };
    return fn;
  }, [equipById]);

  // ── 组泳道 ──
  const bands = useMemo<Band[]>(() => {
    const sortItems = (arr: CipEquipmentRow[]) =>
      [...arr].sort((a, b) => depthOf(a) - depthOf(b) || a.code.localeCompare(b.code));
    const stationIds = new Set(stations.map((s) => s.id));
    const out: Band[] = stations.map((s) => ({
      key: `s${s.id}`,
      kind: 'station',
      code: s.code,
      name: s.name,
      station: s,
      items: sortItems(equipment.filter((e) => e.cleaning_mode === 'cip' && e.cip_station_id === s.id)),
      pipeCount: pipelines.filter((p) => p.cip_station_id === s.id).length,
    }));
    const noncip = equipment.filter((e) => e.cleaning_mode !== 'cip');
    if (noncip.length) {
      out.push({ key: 'noncip', kind: 'noncip', code: '免洗 / COP / 其他', name: '不归 CIP 站', items: sortItems(noncip), pipeCount: 0 });
    }
    const unassigned = equipment.filter(
      (e) => e.cleaning_mode === 'cip' && (e.cip_station_id == null || !stationIds.has(e.cip_station_id)),
    );
    if (unassigned.length) {
      out.push({ key: 'unassigned', kind: 'unassigned', code: '未指派 CIP 站', name: '需补:无法排产清洗', items: sortItems(unassigned), pipeCount: 0 });
    }
    return out;
  }, [stations, equipment, pipelines, depthOf]);

  // ── 布局 ──
  const layout = useMemo(() => {
    const gridLeft = PAD + HEAD_W;
    const availW = cw - gridLeft - PAD;
    const cols = Math.max(1, Math.floor((availW + COL_GAP) / (NODE_W + COL_GAP)));
    const pos = new Map<number, { x: number; y: number; cx: number; cy: number }>();
    const rects: Array<{ band: Band; top: number; height: number }> = [];
    let y = PAD;
    for (const band of bands) {
      const top = y;
      const n = band.items.length;
      const rows = Math.max(1, Math.ceil(n / cols));
      band.items.forEach((e, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = gridLeft + c * (NODE_W + COL_GAP);
        const ny = top + BAND_PAD + r * (NODE_H + ROW_GAP);
        pos.set(e.id, { x, y: ny, cx: x + NODE_W / 2, cy: ny + NODE_H / 2 });
      });
      const bodyH = rows * (NODE_H + ROW_GAP) - ROW_GAP;
      const height = BAND_PAD * 2 + Math.max(NODE_H, bodyH);
      rects.push({ band, top, height });
      y = top + height + BAND_GAP;
    }
    const canvasH = Math.max(y - BAND_GAP + PAD, 160);
    return { cols, pos, rects, canvasH, canvasW: cw };
  }, [bands, cw]);

  const { pos, rects, canvasH, canvasW } = layout;

  // ── 连线 ──
  const parentEdges = useMemo(() => {
    const out: Array<{ k: string; px: number; py: number; cx: number; cy: number }> = [];
    for (const e of equipment) {
      if (e.parent_equipment_id == null || e.parent_equipment_id === e.id) continue;
      const a = pos.get(e.parent_equipment_id);
      const b = pos.get(e.id);
      if (a && b) out.push({ k: `pe${e.id}`, px: a.cx, py: a.cy, cx: b.cx, cy: b.cy });
    }
    return out;
  }, [equipment, pos]);

  const pipeEdges = useMemo(() => {
    const out: Array<{ k: string; id: number; x1: number; y1: number; x2: number; y2: number; mx: number; my: number; code: string; title: string }> = [];
    for (const p of pipelines) {
      const a = pos.get(p.from_equipment_id);
      const b = pos.get(p.to_equipment_id);
      if (!a || !b) continue;
      const fromE = equipById.get(p.from_equipment_id);
      const toE = equipById.get(p.to_equipment_id);
      const st = stations.find((s) => s.id === p.cip_station_id);
      const params = [
        p.cip_duration_minutes != null ? `CIP ${p.cip_duration_minutes}分` : '',
        p.dht_hours != null ? `DHT ${p.dht_hours}时` : '',
        p.cht_hours != null ? `CHT ${p.cht_hours}时` : '',
      ].filter(Boolean).join(' · ');
      out.push({
        k: `pp${p.id}`,
        id: p.id,
        x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy,
        mx: (a.cx + b.cx) / 2, my: (a.cy + b.cy) / 2,
        code: p.code,
        title: `${p.code} ${p.name}\n${fromE?.code ?? '?'} → ${toE?.code ?? '?'}\nCIP 站:${st ? `${st.code} ${st.name}` : '—'}${params ? `\n${params}` : ''}`,
      });
    }
    return out;
  }, [pipelines, pos, equipById, stations]);

  const isEmpty = stations.length === 0 && equipment.length === 0 && pipelines.length === 0;
  if (isEmpty) {
    return <WxbEmpty description="尚无拓扑数据 —— 切到「表格维护」录入或导入 Excel 后,这里会画出 CIP 站 / 设备 / 管线的拓扑总览。" />;
  }

  const headFill = (k: BandKind) =>
    k === 'station' ? 'var(--wx-green-100, #dcfce7)' : k === 'unassigned' ? 'var(--wx-amber-100, #fef3c7)' : 'var(--wx-surface-3, #eef1f4)';
  const headStroke = (k: BandKind) =>
    k === 'station' ? 'var(--wx-green-600, #16a34a)' : k === 'unassigned' ? 'var(--wx-amber-500, #f59e0b)' : 'var(--wx-border-strong, #cbd5e1)';
  const headText = (k: BandKind) =>
    k === 'station' ? 'var(--wx-green-700, #15803d)' : k === 'unassigned' ? 'var(--wx-amber-700, #b45309)' : 'var(--wx-text-secondary, #64748b)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 图例 + 缩放 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>
          <LegendSwatch kind="band" color="var(--wx-green-600, #16a34a)" label="CIP 站泳道(站内 = 由该站清洗)" />
          <LegendSwatch kind="band" color="var(--wx-amber-500, #f59e0b)" label="未指派 CIP 站(需补)" />
          <LegendSwatch kind="line" color="var(--wx-border-strong, #cbd5e1)" label="母子设备(skid → pou)" />
          <LegendSwatch kind="dash" color="var(--wx-blue-500, #3b82f6)" label="管线连接" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <WxbButton variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>－</WxbButton>
          <span style={{ fontSize: 12, color: 'var(--wx-text-secondary, #64748b)', width: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <WxbButton variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>＋</WxbButton>
          <WxbButton variant="ghost" size="sm" onClick={() => setZoom(1)}>适应</WxbButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          overflow: 'auto',
          maxHeight: '72vh',
          border: '1px solid var(--wx-border, #e5e7eb)',
          borderRadius: 10,
          background: 'var(--wx-surface-2, #f8fafc)',
        }}
      >
        <svg
          width={canvasW * zoom}
          height={canvasH * zoom}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <defs>
            <marker id="ps-pipe-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--wx-blue-500, #3b82f6)" />
            </marker>
          </defs>

          {/* 泳道背景 + 头 */}
          {rects.map(({ band, top, height }) => (
            <g key={band.key}>
              <rect
                x={PAD - 8}
                y={top}
                width={canvasW - (PAD - 8) * 2}
                height={height}
                rx={10}
                fill="var(--wx-surface-1, #ffffff)"
                stroke="var(--wx-border, #eef1f4)"
              />
              <rect x={PAD} y={top + BAND_PAD} width={HEAD_W - 16} height={height - BAND_PAD * 2} rx={8} fill={headFill(band.kind)} stroke={headStroke(band.kind)} />
              <text x={PAD + 14} y={top + BAND_PAD + 20} fontSize={11} fill={headText(band.kind)}>
                {band.kind === 'station' ? 'CIP 站' : band.kind === 'unassigned' ? '待补' : '不清洗'}
              </text>
              <text x={PAD + 14} y={top + BAND_PAD + 40} fontSize={14} fontWeight={700} fill={headText(band.kind)}>
                {trunc(band.code, 14)}
              </text>
              <text x={PAD + 14} y={top + BAND_PAD + 58} fontSize={11} fill={headText(band.kind)}>
                {trunc(band.name, 16)}
              </text>
              {band.kind === 'station' && (
                <text x={PAD + 14} y={top + BAND_PAD + 76} fontSize={11} fill={headText(band.kind)}>
                  容量 {band.station?.capacity ?? '—'} · 清洗 {band.items.length} 设备 / {band.pipeCount} 管线
                </text>
              )}
            </g>
          ))}

          {/* 母子设备连线 */}
          {parentEdges.map((e) => (
            <path
              key={e.k}
              d={`M${e.px},${e.py} C${(e.px + e.cx) / 2},${e.py} ${(e.px + e.cx) / 2},${e.cy} ${e.cx},${e.cy}`}
              fill="none"
              stroke="var(--wx-border-strong, #cbd5e1)"
              strokeWidth={1.5}
            />
          ))}

          {/* 管线连线 */}
          {pipeEdges.map((e) => (
            <g key={e.k} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.('pipelines', e.id)}>
              <title>{e.title}</title>
              <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--wx-blue-500, #3b82f6)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#ps-pipe-arrow)" />
              <g>
                <rect x={e.mx - Math.min(e.code.length * 3.4 + 8, 52)} y={e.my - 9} width={Math.min(e.code.length * 6.8 + 16, 104)} height={18} rx={5} fill="var(--wx-blue-50, #eff6ff)" stroke="var(--wx-blue-200, #bfdbfe)" />
                <text x={e.mx} y={e.my + 4} fontSize={10.5} textAnchor="middle" fill="var(--wx-blue-700, #1d4ed8)">{trunc(e.code, 12)}</text>
              </g>
            </g>
          ))}

          {/* 设备节点 */}
          {bands.flatMap((band) =>
            band.items.map((e) => {
              const p = pos.get(e.id);
              if (!p) return null;
              const rm = effRoom(e);
              const og = effOrg(e);
              const roomCode = rm.id != null ? roomById.get(rm.id)?.code ?? null : null;
              const params = [
                e.cip_duration_minutes != null ? `CIP ${e.cip_duration_minutes}分` : '',
                e.sip_duration_minutes != null ? `SIP ${e.sip_duration_minutes}分` : '',
                e.dht_hours != null ? `DHT ${e.dht_hours}时` : '',
                e.cht_hours != null ? `CHT ${e.cht_hours}时` : '',
              ].filter(Boolean).join(' · ');
              const parentCode = e.parent_equipment_id != null ? equipById.get(e.parent_equipment_id)?.code ?? null : null;
              const title = [
                `${e.code} ${e.name}`,
                `类型:${TYPE_LABEL[e.type] ?? e.type}`,
                params ? `清洗:${params}` : '清洗:—',
                `房间:${roomCode ?? '—'}${rm.inherited && roomCode ? '(随上级)' : ''}`,
                `team:${orgName(og.id) ?? '—'}${og.inherited && og.id != null ? '(随上级)' : ''}`,
                parentCode ? `上级:${parentCode}` : '',
              ].filter(Boolean).join('\n');
              return (
                <g key={`eq${e.id}`} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.('equipment', e.id)}>
                  <title>{title}</title>
                  <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} fill="var(--wx-surface-1, #ffffff)" stroke="var(--wx-border-strong, #cbd5e1)" strokeWidth={1.2} />
                  <text x={p.x + 10} y={p.y + 19} fontSize={12.5} fontWeight={700} fill="var(--wx-blue-800, #1e3a8a)" style={{ fontFamily: 'var(--wx-font-mono, ui-monospace, monospace)' }}>
                    {trunc(e.code, 13)}
                  </text>
                  <text x={p.x + NODE_W - 10} y={p.y + 19} fontSize={10} textAnchor="end" fill="var(--wx-text-secondary, #94a3b8)">
                    {trunc(TYPE_LABEL[e.type] ?? e.type, 6)}
                  </text>
                  <text x={p.x + 10} y={p.y + 35} fontSize={11} fill="var(--wx-text-secondary, #475569)">
                    {trunc(e.name, 16)}
                  </text>
                  {roomCode && (
                    <text x={p.x + 10} y={p.y + 47} fontSize={10} fill="var(--wx-text-secondary, #94a3b8)">
                      {trunc(`${roomCode}${rm.inherited ? ' ·随上级' : ''}`, 20)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
};

const LegendSwatch: React.FC<{ kind: 'band' | 'line' | 'dash'; color: string; label: string }> = ({ kind, color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {kind === 'band' ? (
      <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${color}`, background: 'transparent', display: 'inline-block' }} />
    ) : (
      <svg width={22} height={8}>
        <line x1={0} y1={4} x2={22} y2={4} stroke={color} strokeWidth={2} strokeDasharray={kind === 'dash' ? '4 3' : undefined} />
      </svg>
    )}
    {label}
  </span>
);

export default ProdCipTopologyGraph;
