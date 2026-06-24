/**
 * 工厂数字沙盘画布(SVG)。厂区 → 产线(着色)→ 房间(容器)→ 设备(分类整齐网格)。
 * 物理粗分区 USP / DSP / 公用;产线色只上房间色条;共用房间多色分段 +「共用 ×N」;设备图标中性灰。
 * 本组件只读渲染 + 选中/产线聚焦;拖拽摆位 / 增删 / 编辑抽屉为后续切片。
 */
import React, { useMemo } from 'react';
import type { PsFactoryModel, PsRoom } from '../../types/psSandtable';
import { layoutRoom, type PsRoomLayout } from './psSandtableLayout';
import { PsEquipmentIcon } from './PsEquipmentIcon';

interface Props {
  model: PsFactoryModel;
  focusedLineId?: string | null;
  selectedEquipmentId?: string | null;
  onSelectEquipment?: (id: string | null) => void;
}

type Zone = 'usp' | 'dsp' | 'util';
const ZONE_LABEL: Record<Zone, string> = { usp: 'USP · 上游', dsp: 'DSP · 下游', util: '公用 / 配液' };
const ZONE_ORDER: Zone[] = ['usp', 'dsp', 'util'];

const zoneOfRoom = (r: PsRoom): Zone => {
  if (r.function === 'usp' || r.function === 'harvest') return 'usp';
  if (r.function === 'chromatography' || r.function === 'ufdf') return 'dsp';
  return 'util';
};

const TITLE_H = 46; // 两行表头:① code · 名 ② 设备×N + 共用×N
const ROOM_MIN_W = 176;
const CANVAS_W = 1160;
const MARGIN = 16;
const GAP = 16;
const ZONE_GAP = 30;

interface Placed {
  room: PsRoom;
  layout: PsRoomLayout;
  x: number;
  y: number;
  w: number;
  h: number;
  lineColors: string[];
  isShared: boolean;
}

export const PsSandtableCanvas: React.FC<Props> = ({ model, focusedLineId, selectedEquipmentId, onSelectEquipment }) => {
  const placed = useMemo(() => {
    const eqByRoom = new Map<string, typeof model.equipment>();
    for (const e of model.equipment) {
      if (!e.roomId) continue;
      const arr = eqByRoom.get(e.roomId) ?? [];
      arr.push(e);
      eqByRoom.set(e.roomId, arr);
    }
    const linesByRoom = new Map<string, string[]>();
    for (const rl of model.roomLines) {
      const arr = linesByRoom.get(rl.roomId) ?? [];
      // isPrimary 排前,保证主归属色在第一段
      if (rl.isPrimary) arr.unshift(rl.lineId);
      else arr.push(rl.lineId);
      linesByRoom.set(rl.roomId, arr);
    }
    const colorOf = new Map(model.lines.map((l) => [l.id, l.colorToken ?? 'var(--ps-line-1)']));

    const out: { zone: Zone; label: string; rooms: Placed[]; y: number; h: number }[] = [];
    let cursorY = MARGIN;

    for (const zone of ZONE_ORDER) {
      const zoneRooms = model.rooms.filter((r) => zoneOfRoom(r) === zone);
      if (zoneRooms.length === 0) continue;
      const zoneTop = cursorY;
      let x = MARGIN;
      let rowY = cursorY + 18; // 留 zone 标签
      let rowMaxH = 0;
      const rp: Placed[] = [];
      for (const room of zoneRooms) {
        const eq = eqByRoom.get(room.id) ?? [];
        const layout = layoutRoom(eq, { maxCols: Math.min(4, Math.max(2, Math.ceil(Math.sqrt(eq.length)))) });
        const w = Math.max(layout.width, ROOM_MIN_W);
        const h = TITLE_H + layout.height;
        if (x + w > CANVAS_W && x > MARGIN) {
          x = MARGIN;
          rowY += rowMaxH + GAP;
          rowMaxH = 0;
        }
        const lineIds = linesByRoom.get(room.id) ?? [];
        const lineColors = lineIds.map((id) => colorOf.get(id) ?? 'var(--ps-line-1)');
        rp.push({ room, layout, x, y: rowY, w, h, lineColors, isShared: lineIds.length > 1 });
        x += w + GAP;
        rowMaxH = Math.max(rowMaxH, h);
      }
      const zoneH = rowY + rowMaxH - zoneTop;
      out.push({ zone, label: ZONE_LABEL[zone], rooms: rp, y: zoneTop, h: zoneH });
      cursorY = zoneTop + zoneH + ZONE_GAP;
    }
    return { zones: out, height: cursorY };
  }, [model]);

  const focusedRooms = useMemo(() => {
    if (!focusedLineId) return null;
    const s = new Set<string>();
    for (const rl of model.roomLines) if (rl.lineId === focusedLineId) s.add(rl.roomId);
    return s;
  }, [focusedLineId, model.roomLines]);

  return (
    <svg
      className="pst-canvas"
      viewBox={`0 0 ${CANVAS_W} ${Math.max(placed.height, 200)}`}
      width="100%"
      role="img"
      aria-label="工厂数字沙盘"
      onClick={() => onSelectEquipment?.(null)}
    >
      {placed.zones.map((z) => (
        <g key={z.zone}>
          <text className="pst-zn" x={MARGIN} y={z.y + 12}>{z.label}</text>
          {z.rooms.map((p) => {
            const dim = focusedRooms !== null && !focusedRooms.has(p.room.id);
            const eqCount = p.layout.bands.reduce((n, b) => n + b.count, 0);
            return (
              <g key={p.room.id} opacity={dim ? 0.28 : 1} style={{ transition: 'opacity .2s' }}>
                <rect className={`pst-room${p.isShared ? ' shared' : ''}`} x={p.x} y={p.y} width={p.w} height={p.h} rx={8} />
                {/* 产线色条:独占=整条,共用=分段 */}
                {p.lineColors.map((c, i) => {
                  const seg = p.h / p.lineColors.length;
                  return <rect key={i} x={p.x} y={p.y + i * seg} width={5} height={seg} rx={2} style={{ fill: c }} />;
                })}
                <line x1={p.x + 12} y1={p.y + TITLE_H - 6} x2={p.x + p.w - 12} y2={p.y + TITLE_H - 6} className="pst-hr" />
                <text className="pst-rt" x={p.x + 14} y={p.y + 19}>{p.room.code} · {p.room.name}</text>
                <text className="pst-rm" x={p.x + 14} y={p.y + 37}>设备 ×{eqCount}</text>
                {p.isShared && (
                  <g>
                    <rect className="pst-tag" x={p.x + p.w - 64} y={p.y + 27} width={52} height={15} rx={4} />
                    <text className="pst-tag-t" x={p.x + p.w - 38} y={p.y + 38} textAnchor="middle">共用 ×{p.lineColors.length}</text>
                  </g>
                )}
                {/* 类别带 + 设备网格 */}
                {p.layout.bands.map((band) => (
                  <g key={band.category}>
                    <text className="pst-bt" x={p.x + 12} y={p.y + TITLE_H + band.titleY}>{band.label} ×{band.count}</text>
                    {band.cells.map((cell) => {
                      const cx = p.x + cell.iconX;
                      const cy = p.y + TITLE_H + cell.iconY;
                      const sel = selectedEquipmentId === cell.equipment.id;
                      return (
                        <g
                          key={cell.equipment.id}
                          style={{ cursor: 'pointer' }}
                          onClick={(ev) => { ev.stopPropagation(); onSelectEquipment?.(cell.equipment.id); }}
                        >
                          {sel && (
                            <rect
                              className="pst-sel"
                              x={p.x + cell.x - 2}
                              y={p.y + TITLE_H + cell.y - 2}
                              width={cell.cell + 4}
                              height={cell.cell + 4}
                              rx={6}
                            />
                          )}
                          <g transform={`translate(${cx},${cy})`}>
                            <PsEquipmentIcon
                              type={cell.equipment.equipmentType}
                              stirDirection={cell.equipment.stirDirection}
                              size={cell.iconSize}
                              title={`${cell.equipment.code} ${cell.equipment.name}`}
                            />
                          </g>
                          <text
                            className="pst-code"
                            x={p.x + cell.x + cell.cell / 2}
                            y={p.y + TITLE_H + cell.y + cell.cell + 9}
                            textAnchor="middle"
                          >
                            {cell.equipment.code}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                ))}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
};

export default PsSandtableCanvas;
