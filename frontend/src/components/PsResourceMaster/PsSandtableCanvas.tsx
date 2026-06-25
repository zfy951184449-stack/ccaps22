/**
 * 工厂数字沙盘画布(SVG · 网格布局 · 手机桌面式整理)。厂区 → 产线(着色)→ 房间(网格格位)→ 设备(分类整齐网格)。
 * 房间占整数网格列×行(gx/gy/gw/gh);拖动=跟手 + 落点 ghost,松手吸附到格;**碰撞自动让位 + 重力上浮压实**(永不重叠、始终对齐)。
 * 右下角手柄**双向**拖动改宽改高(高度不小于内容);整画布禁选中文字。设备分色立体 + 选中三层 + 产线聚焦。
 */
import React, { useMemo, useRef, useState } from 'react';
import type { PsEquipment, PsFactoryModel } from '../../types/psSandtable';
import { layoutRoom, type PsRoomLayout } from './psSandtableLayout';
import { PsEquipmentIcon } from './PsEquipmentIcon';

interface Props {
  model: PsFactoryModel;
  focusedLineId?: string | null;
  selectedEquipmentId?: string | null;
  onSelectEquipment?: (id: string | null) => void;
  editMode?: boolean;
}

const TITLE_H = 48;
const COL_W = 96;
const ROW_H = 24;
const CANVAS_W = 1200;
const MARGIN = 16;
const COLS = Math.floor((CANVAS_W - 2 * MARGIN) / COL_W); // 12
const MIN_GW = 2;

interface Cell { gx: number; gy: number; gw: number; gh: number }
type Grid = Record<string, Cell>;

const gpx = (gx: number) => MARGIN + gx * COL_W;
const gpy = (gy: number) => MARGIN + gy * ROW_H;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const collide = (a: Cell, b: Cell) => a.gx < b.gx + b.gw && a.gx + a.gw > b.gx && a.gy < b.gy + b.gh && a.gy + a.gh > b.gy;

/** 重力上浮压实:保持各房间 gx,被固定的房间不动,其余按 (gy,gx) 顺序找最低可放 gy,永不重叠 */
function reflow(grid: Grid, ids: string[], fixedId: string | null, fixedCell: Cell | null): Grid {
  const result: Grid = {};
  const occupied: Cell[] = [];
  if (fixedId && fixedCell) {
    result[fixedId] = { ...fixedCell };
    occupied.push(result[fixedId]);
  }
  const others = ids
    .filter((id) => id !== fixedId)
    .sort((a, b) => grid[a].gy - grid[b].gy || grid[a].gx - grid[b].gx);
  for (const id of others) {
    const it: Cell = { ...grid[id] };
    it.gx = clamp(it.gx, 0, COLS - it.gw);
    let gy = 0;
    while (occupied.some((o) => collide({ ...it, gy }, o))) gy++;
    it.gy = gy;
    result[id] = it;
    occupied.push(it);
  }
  return result;
}

export const PsSandtableCanvas: React.FC<Props> = ({ model, focusedLineId, selectedEquipmentId, onSelectEquipment, editMode = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const eqByRoom = useMemo(() => {
    const m = new Map<string, PsEquipment[]>();
    model.equipment.forEach((e) => {
      if (!e.roomId) return;
      const a = m.get(e.roomId) ?? [];
      a.push(e);
      m.set(e.roomId, a);
    });
    return m;
  }, [model.equipment]);

  // 房间内容布局 + 占格(gw 由内容定,gh 至少容纳内容)
  const layoutFor = useMemo(() => {
    const cache = new Map<string, { layout: PsRoomLayout; minRows: (gw: number) => number; intrinsicGw: number; intrinsicGh: number }>();
    model.rooms.forEach((room) => {
      const eq = eqByRoom.get(room.id) ?? [];
      const baseLayout = layoutRoom(eq);
      const intrinsicGw = clamp(Math.round(baseLayout.width / COL_W), MIN_GW, COLS);
      const rowsFor = (gw: number) => {
        const l = layoutRoom(eq, { maxCols: Math.max(2, Math.floor((gw * COL_W - 24 + 16) / (58 + 16))) });
        return Math.ceil((TITLE_H + l.height) / ROW_H);
      };
      cache.set(room.id, { layout: baseLayout, minRows: rowsFor, intrinsicGw, intrinsicGh: rowsFor(intrinsicGw) });
    });
    return cache;
  }, [model.rooms, eqByRoom]);

  const [grid, setGrid] = useState<Grid>(() => {
    // 初始流式铺位 → 压实
    const g: Grid = {};
    let gx = 0;
    let gy = 0;
    let rowH = 0;
    for (const room of model.rooms) {
      const info = layoutFor.get(room.id)!;
      const gw = info.intrinsicGw;
      const gh = info.intrinsicGh;
      if (gx + gw > COLS) { gx = 0; gy += rowH; rowH = 0; }
      g[room.id] = { gx, gy, gw, gh };
      gx += gw;
      rowH = Math.max(rowH, gh);
    }
    return reflow(g, model.rooms.map((r) => r.id), null, null);
  });

  const [live, setLive] = useState<{ id: string; mode: 'move' | 'resize'; raw: { x: number; y: number; w: number; h: number }; target: Cell; preview: Grid } | null>(null);
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; orig: Cell } | null>(null);

  const linesByRoom = useMemo(() => {
    const m = new Map<string, string[]>();
    model.roomLines.forEach((rl) => {
      const a = m.get(rl.roomId) ?? [];
      if (rl.isPrimary) a.unshift(rl.lineId);
      else a.push(rl.lineId);
      m.set(rl.roomId, a);
    });
    return m;
  }, [model.roomLines]);

  const colorOf = useMemo(() => new Map(model.lines.map((l) => [l.id, l.colorToken ?? 'var(--ps-line-1)'])), [model.lines]);

  const focusedRooms = useMemo(() => {
    if (!focusedLineId) return null;
    const s = new Set<string>();
    model.roomLines.forEach((rl) => { if (rl.lineId === focusedLineId) s.add(rl.roomId); });
    return s;
  }, [focusedLineId, model.roomLines]);

  const cellOf = (id: string): Cell => (live && id !== live.id ? live.preview[id] : grid[id]) ?? grid[id];

  const ids = model.rooms.map((r) => r.id);
  const canvasH = useMemo(() => {
    const cells = ids.map((id) => cellOf(id));
    const maxRow = Math.max(0, ...cells.map((c) => c.gy + c.gh));
    return MARGIN * 2 + maxRow * ROW_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, live, model.rooms]);

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  };

  const startDrag = (id: string, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { id, mode, sx: p.x, sy: p.y, orig: { ...grid[id] } };
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const info = layoutFor.get(d.id)!;
    if (d.mode === 'move') {
      const raw = { x: gpx(d.orig.gx) + dx, y: gpy(d.orig.gy) + dy, w: d.orig.gw * COL_W, h: d.orig.gh * ROW_H };
      const target: Cell = {
        gx: clamp(Math.round((raw.x - MARGIN) / COL_W), 0, COLS - d.orig.gw),
        gy: Math.max(0, Math.round((raw.y - MARGIN) / ROW_H)),
        gw: d.orig.gw,
        gh: d.orig.gh,
      };
      setLive({ id: d.id, mode: 'move', raw, target, preview: reflow(grid, ids, d.id, target) });
    } else {
      const rawW = Math.max(MIN_GW * COL_W, d.orig.gw * COL_W + dx);
      const rawH = Math.max(ROW_H * 2, d.orig.gh * ROW_H + dy);
      const gw = clamp(Math.round(rawW / COL_W), MIN_GW, COLS - d.orig.gx);
      const gh = Math.max(info.minRows(gw), Math.round(rawH / ROW_H));
      const target: Cell = { gx: d.orig.gx, gy: d.orig.gy, gw, gh };
      const raw = { x: gpx(d.orig.gx), y: gpy(d.orig.gy), w: rawW, h: rawH };
      setLive({ id: d.id, mode: 'resize', raw, target, preview: reflow(grid, ids, d.id, target) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (live) setGrid({ ...live.preview, [d.id]: live.target });
    setLive(null);
    drag.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const svgClass = `pst-canvas${editMode ? ' is-edit' : ''}${live?.mode === 'move' ? ' is-dragging' : ''}${live?.mode === 'resize' ? ' is-resizing' : ''}`;
  const order = live ? [...ids.filter((id) => id !== live.id), live.id] : ids;
  const roomById = useMemo(() => new Map(model.rooms.map((r) => [r.id, r])), [model.rooms]);

  return (
    <svg
      ref={svgRef}
      className={svgClass}
      viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
      width="100%"
      role="group"
      aria-label="工厂数字沙盘"
      onClick={() => onSelectEquipment?.(null)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        <filter id="ps-card-shadow" x="-10%" y="-10%" width="120%" height="135%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--ps-shadow)" floodOpacity="0.08" />
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="var(--ps-shadow)" floodOpacity="0.05" />
        </filter>
        <filter id="ps-card-shadow-lift" x="-14%" y="-14%" width="128%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="11" floodColor="var(--ps-shadow)" floodOpacity="0.14" />
        </filter>
        <pattern id="ps-grid" width={COL_W} height={ROW_H} patternUnits="userSpaceOnUse" x={MARGIN} y={MARGIN}>
          <circle cx={0} cy={0} r={0.9} className="pst-grid-dot" />
        </pattern>
      </defs>

      <rect className="pst-grid-bg" x="0" y="0" width={CANVAS_W} height={canvasH} fill="url(#ps-grid)" />

      {live && (
        <rect className="pst-drop-ghost" x={gpx(live.target.gx)} y={gpy(live.target.gy)} width={live.target.gw * COL_W} height={live.target.gh * ROW_H} rx={12} />
      )}

      {order.map((id) => {
        const room = roomById.get(id)!;
        const isActive = live?.id === id;
        const cell = isActive ? null : cellOf(id);
        // 活动房间用 raw 像素;其余用格位
        const x = isActive ? (live!.mode === 'move' ? live!.raw.x : live!.raw.x) : gpx(cell!.gx);
        const y = isActive ? (live!.mode === 'move' ? live!.raw.y : live!.raw.y) : gpy(cell!.gy);
        const gw = isActive ? (live!.mode === 'resize' ? Math.round(live!.raw.w / COL_W) : live!.target.gw) : cell!.gw;
        const w = isActive && live!.mode === 'resize' ? live!.raw.w : gw * COL_W;
        const info = layoutFor.get(id)!;
        const innerCols = Math.max(2, Math.floor((w - 24 + 16) / (58 + 16)));
        const eq = eqByRoom.get(id) ?? [];
        const layout = layoutRoom(eq, { maxCols: innerCols });
        const ghRows = isActive ? (live!.mode === 'resize' ? Math.max(info.minRows(gw), Math.round(live!.raw.h / ROW_H)) : live!.target.gh) : cell!.gh;
        const h = isActive && live!.mode === 'resize' ? live!.raw.h : ghRows * ROW_H;
        const lineIds = linesByRoom.get(id) ?? [];
        const lineColors = lineIds.map((lid) => colorOf.get(lid) ?? 'var(--ps-line-1)');
        const isShared = lineIds.length > 1;
        const eqCount = eq.length;
        const dim = focusedRooms !== null && !focusedRooms.has(id);
        const isHover = hoverRoomId === id;
        const filter = isActive || isHover ? 'url(#ps-card-shadow-lift)' : 'url(#ps-card-shadow)';

        return (
          <g
            key={id}
            className={`pst-room-g${isActive ? ' pst-dragging' : ''}`}
            opacity={dim ? 0.3 : 1}
            style={{ pointerEvents: dim ? 'none' : 'auto', transition: isActive ? 'none' : 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s' }}
            transform={isActive ? undefined : `translate(0,0)`}
            onMouseEnter={() => setHoverRoomId(id)}
            onMouseLeave={() => setHoverRoomId((cur) => (cur === id ? null : cur))}
          >
            <rect className={`pst-room${isShared ? ' shared' : ''}`} x={x} y={y} width={w} height={h} rx={12} filter={filter} />

            {isShared ? (
              lineColors.map((c, i) => (
                <rect key={i} x={x + 6} y={y + 12 + i * 7} width={4} height={5} rx={1.5} style={{ fill: c }} />
              ))
            ) : (
              <rect x={x + 6} y={y + 12} width={4} height={h - 24} rx={2} style={{ fill: lineColors[0] ?? 'var(--ps-line-1)' }} />
            )}

            <rect x={x} y={y} width={w} height={TITLE_H} fill="transparent" style={{ cursor: editMode ? 'grab' : 'default' }} onPointerDown={startDrag(id, 'move')} />
            {editMode && isHover && (
              <g style={{ pointerEvents: 'none' }}>
                {[0, 1, 2].map((r) => [0, 1].map((c) => (
                  <circle key={`${r}-${c}`} cx={x + w - 16 + c * 4} cy={y + 16 + r * 4} r={1} className="pst-drag-dot" />
                )))}
              </g>
            )}
            <line x1={x + 14} y1={y + TITLE_H - 6} x2={x + w - 12} y2={y + TITLE_H - 6} className="pst-hr" />
            <text className="pst-rt" x={x + 16} y={y + 19} style={{ pointerEvents: 'none' }}>{room.code} · {room.name}</text>
            <text className="pst-rm" x={x + 16} y={y + 37} style={{ pointerEvents: 'none' }}>设备 ×{eqCount}</text>
            {isShared && (
              <g style={{ pointerEvents: 'none' }}>
                <rect className="pst-tag" x={x + w - 64} y={y + 27} width={52} height={15} rx={4} />
                <text className="pst-tag-t" x={x + w - 38} y={y + 38} textAnchor="middle">共用 ×{lineColors.length}</text>
              </g>
            )}

            {layout.bands.map((band) => (
              <g key={band.category}>
                <text className="pst-bt" x={x + 14} y={y + TITLE_H + band.titleY} style={{ pointerEvents: 'none' }}>{band.label} ×{band.count}</text>
                {band.cells.map((cellL) => {
                  const cx = x + cellL.iconX;
                  const cy = y + TITLE_H + cellL.iconY;
                  const sel = selectedEquipmentId === cellL.equipment.id;
                  return (
                    <g
                      key={cellL.equipment.id}
                      className="pst-eq"
                      role="button"
                      tabIndex={dim ? -1 : 0}
                      aria-label={`${cellL.equipment.code} ${cellL.equipment.name}`}
                      aria-pressed={sel}
                      onClick={(ev) => { ev.stopPropagation(); onSelectEquipment?.(cellL.equipment.id); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelectEquipment?.(cellL.equipment.id); } }}
                    >
                      <rect className="pst-cell" x={x + cellL.x} y={y + TITLE_H + cellL.y} width={cellL.cell} height={cellL.cell} rx={8} />
                      {sel && (
                        <>
                          <rect className="pst-sel-wash" x={x + cellL.x} y={y + TITLE_H + cellL.y} width={cellL.cell} height={cellL.cell} rx={8} />
                          <rect className="pst-sel-glow" x={x + cellL.x - 4} y={y + TITLE_H + cellL.y - 4} width={cellL.cell + 8} height={cellL.cell + 8} rx={12} />
                          <rect key={selectedEquipmentId} className="pst-sel" x={x + cellL.x - 2} y={y + TITLE_H + cellL.y - 2} width={cellL.cell + 4} height={cellL.cell + 4} rx={10} />
                        </>
                      )}
                      <ellipse className="pst-eshadow" cx={cx + cellL.iconSize / 2} cy={cy + cellL.iconSize - 1} rx={cellL.iconSize * 0.3} ry={2.6} />
                      <g transform={`translate(${cx},${cy})`} style={{ pointerEvents: 'none' }}>
                        <PsEquipmentIcon type={cellL.equipment.equipmentType} stirDirection={cellL.equipment.stirDirection} size={cellL.iconSize} title={`${cellL.equipment.code} ${cellL.equipment.name}`} />
                      </g>
                      <text className="pst-code" x={x + cellL.x + cellL.cell / 2} y={y + TITLE_H + cellL.y + cellL.cell + 9} textAnchor="middle" style={{ pointerEvents: 'none' }}>{cellL.equipment.code}</text>
                    </g>
                  );
                })}
              </g>
            ))}

            {editMode && (
              <g className="pst-resize-g" onPointerDown={startDrag(id, 'resize')} style={{ cursor: 'nwse-resize' }}>
                <rect x={x + w - 22} y={y + h - 22} width={22} height={22} fill="transparent" />
                <path className="pst-resize-grip" d={`M ${x + w - 13} ${y + h - 5} L ${x + w - 5} ${y + h - 13} M ${x + w - 8} ${y + h - 5} L ${x + w - 5} ${y + h - 8}`} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default PsSandtableCanvas;
