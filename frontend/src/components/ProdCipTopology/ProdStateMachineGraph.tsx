/**
 * 排产 · 设备状态机转移图(可视化编辑画布)。
 *
 * 自动排版(按属性分泳道、状态按出现顺序左→右),在图上直接编辑:
 *  - 从一个状态节点拖到另一个(同属性)= 新建转移;拖到空白 = 新建到一个新状态。
 *  - 点边 = 编辑该转移;点节点 = 弹节点菜单(改名/从此加转移/删);点泳道头 = 改属性名。
 *  - 实线灰边 = 普通转移(标 动作·时长 / 起≤窗·效窗);回边(指向更早状态)走泳道上方弧线。
 *  - 紫色虚线 = 有跨属性前提(requires)。拖拽时画幽灵线。
 * 细节(动作/时长/前置/可覆盖列)由父组件用浮层填——图只负责结构与交互意图。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WxbEmpty } from '../wxb-ui';
import type { SmTemplateRow, SmTransitionRow } from '../../services/prodResourceApi';

export interface ConnectIntent { attribute: string; from_state: string; to_state: string | null; clientX: number; clientY: number }
export interface NodeIntent { attribute: string; state: string; clientX: number; clientY: number }
export interface AttrIntent { attribute: string; clientX: number; clientY: number }

interface Props {
  template: SmTemplateRow | null;
  transitions: SmTransitionRow[];
  highlightedId?: number | null;
  editable?: boolean;
  onEditEdge?: (id: number, clientX: number, clientY: number) => void; // 点边
  onConnect?: (i: ConnectIntent) => void;  // 拖拽连线产生的「建转移」意图
  onNodeClick?: (i: NodeIntent) => void;   // 点节点(未拖动)
  onAttrClick?: (i: AttrIntent) => void;   // 点泳道头(属性名)
}

const NODE_W = 132;
const NODE_H = 46;
const EDGE_GAP = 128; // 同泳道相邻状态的横向间隔(留给边标签)
const HEAD_W = 78; // 泳道头(属性名)宽
const PAD = 20;
const ARC_SPACE = 46; // 节点上方留给回边弧线 + 标签
const LANE_GAP = 34;
const CLICK_SLOP = 6; // 小于此位移视作「点击」而非「拖拽」

const STATE_ZH: Record<string, string> = {
  dirty: '脏', clean: '洁净', rinsed: '淋洗', non_sterile: '未灭菌', sterile: '无菌',
  none: '无袋', installed: '已装', used: '已用',
};
const ATTR_ZH: Record<string, string> = { cleanliness: '洁净度', sterility: '灭菌', bag: '袋' };
export const stZh = (s: string) => STATE_ZH[s] ?? s;
export const atZh = (a: string) => ATTR_ZH[a] ?? a;

// 属性配色(CSS 变量 + 兜底 hex,与拓扑图一套路子)
const attrColor = (a: string): { fill: string; stroke: string; text: string } => {
  if (a === 'sterility') return { fill: 'var(--wx-purple-50, #faf5ff)', stroke: 'var(--wx-purple-600, #9333ea)', text: 'var(--wx-purple-700, #7e22ce)' };
  if (a === 'bag') return { fill: 'var(--wx-surface-3, #eef1f4)', stroke: 'var(--wx-slate-500, #64748b)', text: 'var(--wx-text-secondary, #475569)' };
  return { fill: 'var(--wx-cyan-50, #ecfeff)', stroke: 'var(--wx-cyan-600, #0891b2)', text: 'var(--wx-cyan-700, #0e7490)' };
};
const PURPLE = 'var(--wx-purple-500, #a855f7)';
const GRAY = 'var(--wx-border-strong, #94a3b8)';
const BLUE = 'var(--wx-blue-500, #3b82f6)';

const edgeLabel = (t: SmTransitionRow): { top: string; bot: string } => {
  const top = `${t.action}${t.duration_minutes != null ? ` · ${t.duration_minutes}分` : ''}`;
  const bot = [
    t.start_within_hours != null ? `起≤${t.start_within_hours}h` : '',
    t.produces_validity_hours != null ? `效${t.produces_validity_hours}h` : '',
  ].filter(Boolean).join(' · ');
  return { top, bot };
};

const requiresZh = (t: SmTransitionRow): string | null => {
  if (!t.requires_json) return null;
  const parts: string[] = [];
  for (const states of Object.values(t.requires_json)) {
    for (const s of states) parts.push(stZh(s));
  }
  return parts.length ? `需先${parts.join('/')}` : null;
};

const ProdStateMachineGraph: React.FC<Props> = ({ template, transitions, highlightedId, editable, onEditEdge, onConnect, onNodeClick, onAttrClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [cw, setCw] = useState(900);
  const [drag, setDrag] = useState<{ attr: string; state: string; cx: number; cy: number; clientX: number; clientY: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setCw(Math.max(560, el.clientWidth - 4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const byAttr = new Map<string, SmTransitionRow[]>();
    for (const t of [...transitions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)) {
      if (!byAttr.has(t.attribute)) byAttr.set(t.attribute, []);
      byAttr.get(t.attribute)!.push(t);
    }
    const attrs = Array.from(byAttr.keys());

    const lanes = attrs.map((attr) => {
      const ts = byAttr.get(attr)!;
      const firstFrom = new Map<string, number>();
      const firstTo = new Map<string, number>();
      ts.forEach((t, i) => {
        if (!firstFrom.has(t.from_state)) firstFrom.set(t.from_state, i);
        if (!firstTo.has(t.to_state)) firstTo.set(t.to_state, i);
      });
      const states = Array.from(new Set(ts.flatMap((t) => [t.from_state, t.to_state])));
      states.sort((a, b) => {
        const fa = firstFrom.has(a) ? firstFrom.get(a)! : 1000 + (firstTo.get(a) ?? 0);
        const fb = firstFrom.has(b) ? firstFrom.get(b)! : 1000 + (firstTo.get(b) ?? 0);
        return fa - fb || a.localeCompare(b);
      });
      return { attr, transitions: ts, states };
    });

    const maxStates = Math.max(1, ...lanes.map((l) => l.states.length));
    const gridLeft = PAD + HEAD_W;
    const canvasW = Math.max(cw, gridLeft + maxStates * NODE_W + (maxStates - 1) * EDGE_GAP + PAD);
    const stepX = NODE_W + EDGE_GAP;

    const pos = new Map<string, { x: number; y: number; cx: number; cy: number; attr: string }>();
    const laneRects: Array<{ attr: string; top: number; height: number }> = [];
    let y = PAD;
    const laneH = ARC_SPACE + NODE_H + LANE_GAP;
    lanes.forEach((lane) => {
      const top = y;
      const nodeY = top + ARC_SPACE;
      lane.states.forEach((s, j) => {
        const x = gridLeft + j * stepX;
        pos.set(`${lane.attr}|${s}`, { x, y: nodeY, cx: x + NODE_W / 2, cy: nodeY + NODE_H / 2, attr: lane.attr });
      });
      laneRects.push({ attr: lane.attr, top, height: ARC_SPACE + NODE_H });
      y = top + laneH;
    });
    const canvasH = Math.max(y - LANE_GAP + PAD, 140);
    return { lanes, pos, laneRects, canvasW, canvasH };
  }, [transitions, cw]);

  // 拖拽连线:全局监听 move/up(拖到 svg 外也能收尾)
  useEffect(() => {
    if (!drag) return;
    const svgXY = (e: MouseEvent) => {
      const r = svgRef.current?.getBoundingClientRect();
      return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
    };
    const move = (e: MouseEvent) => {
      setGhost(svgXY(e));
      const { x, y } = svgXY(e);
      let hk: string | null = null;
      for (const [key, p] of Array.from(model.pos)) {
        if (x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) { hk = key; break; }
      }
      setHoverKey(hk);
    };
    const up = (e: MouseEvent) => {
      const moved = Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY);
      if (moved < CLICK_SLOP) {
        onNodeClick?.({ attribute: drag.attr, state: drag.state, clientX: e.clientX, clientY: e.clientY });
      } else {
        const { x, y } = svgXY(e);
        let target: { attr: string; state: string } | null = null;
        for (const [key, p] of Array.from(model.pos)) {
          if (x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) {
            const i = key.indexOf('|');
            target = { attr: key.slice(0, i), state: key.slice(i + 1) };
            break;
          }
        }
        const sameAttr = !!target && target.attr === drag.attr && target.state !== drag.state;
        onConnect?.({ attribute: drag.attr, from_state: drag.state, to_state: sameAttr ? target!.state : null, clientX: e.clientX, clientY: e.clientY });
      }
      setDrag(null); setGhost(null); setHoverKey(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag, model, onConnect, onNodeClick]);

  if (!template) {
    return <WxbEmpty description="先在「模板库」选一个模板,这里画出它的状态机转移图。" />;
  }
  if (!transitions.length) {
    return <WxbEmpty description={`模板「${template.name}」还没有转移。点上方「新增转移」开始搭,或导入。`} />;
  }

  const { lanes, pos, laneRects, canvasW, canvasH } = model;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>
        <Swatch kind="line" color={GRAY} label="普通转移" />
        <Swatch kind="dash" color={PURPLE} label="有前置(需先洁净/淋洗)" />
        <Swatch kind="node" color={attrColor('cleanliness').stroke} label="洁净度" />
        <Swatch kind="node" color={attrColor('sterility').stroke} label="灭菌" />
        <Swatch kind="node" color={attrColor('bag').stroke} label="袋" />
        {editable && <span style={{ color: 'var(--wx-blue-600, #2563eb)' }}>从一个状态拖到另一个 = 建转移 · 点边改 · 点节点改名/删</span>}
      </div>

      <div
        ref={scrollRef}
        style={{ overflow: 'auto', maxHeight: '64vh', border: '1px solid var(--wx-border, #e5e7eb)', borderRadius: 10, background: 'var(--wx-surface-2, #f8fafc)' }}
      >
        <svg ref={svgRef} width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', cursor: drag ? 'crosshair' : 'default', userSelect: 'none' }}>
          <defs>
            <marker id="sm-arrow-gray" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={GRAY} />
            </marker>
            <marker id="sm-arrow-purple" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={PURPLE} />
            </marker>
            <marker id="sm-arrow-blue" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={BLUE} />
            </marker>
          </defs>

          {/* 泳道头(属性名;可点改名) */}
          {laneRects.map((lr) => {
            const c = attrColor(lr.attr);
            return (
              <g
                key={`lane-${lr.attr}`}
                style={{ cursor: editable && onAttrClick ? 'pointer' : 'default' }}
                onClick={editable && onAttrClick ? (e) => onAttrClick({ attribute: lr.attr, clientX: e.clientX, clientY: e.clientY }) : undefined}
              >
                <rect x={PAD} y={lr.top + ARC_SPACE - 2} width={HEAD_W - 12} height={NODE_H + 4} rx={8} fill={c.fill} stroke={c.stroke} />
                <text x={PAD + (HEAD_W - 12) / 2} y={lr.top + ARC_SPACE + NODE_H / 2 + 4} fontSize={12} fontWeight={700} textAnchor="middle" fill={c.text}>
                  {atZh(lr.attr)}
                </text>
              </g>
            );
          })}

          {/* requires 跨属性引导虚线 */}
          {lanes.flatMap((lane) =>
            lane.transitions.map((t) => {
              if (!t.requires_json) return null;
              const toP = pos.get(`${t.attribute}|${t.to_state}`);
              if (!toP) return null;
              for (const [reqAttr, states] of Object.entries(t.requires_json)) {
                const reqState = states[0];
                const srcP = pos.get(`${reqAttr}|${reqState}`);
                if (!srcP) continue;
                return (
                  <line key={`req-${t.id}`} x1={srcP.cx} y1={srcP.cy} x2={toP.cx} y2={toP.cy} stroke={PURPLE} strokeWidth={1.3} strokeDasharray="4 4" opacity={0.7} markerEnd="url(#sm-arrow-purple)" />
                );
              }
              return null;
            }),
          )}

          {/* 转移边(点击=编辑) */}
          {lanes.flatMap((lane) =>
            lane.transitions.map((t) => {
              const a = pos.get(`${t.attribute}|${t.from_state}`);
              const b = pos.get(`${t.attribute}|${t.to_state}`);
              if (!a || !b) return null;
              const hl = highlightedId === t.id;
              const isReq = !!t.requires_json;
              const stroke = isReq ? PURPLE : GRAY;
              const marker = isReq ? 'url(#sm-arrow-purple)' : 'url(#sm-arrow-gray)';
              const { top, bot } = edgeLabel(t);
              const forward = b.cx > a.cx;
              const click = (editable && onEditEdge) ? (e: React.MouseEvent) => onEditEdge(t.id, e.clientX, e.clientY) : undefined;
              const cursor = click ? 'pointer' : 'default';
              if (forward) {
                const x1 = a.x + NODE_W;
                const x2 = b.x;
                const mx = (x1 + x2) / 2;
                return (
                  <g key={`e-${t.id}`} style={{ cursor }} onClick={click}>
                    {/* 透明粗线扩大点击热区 */}
                    <line x1={x1} y1={a.cy} x2={x2} y2={b.cy} stroke="transparent" strokeWidth={16} />
                    {hl && <line x1={x1} y1={a.cy} x2={x2} y2={b.cy} stroke="var(--wx-blue-400, #60a5fa)" strokeWidth={7} opacity={0.35} />}
                    <line x1={x1} y1={a.cy} x2={x2} y2={b.cy} stroke={stroke} strokeWidth={hl ? 2.4 : 1.6} strokeDasharray={isReq ? '5 4' : undefined} markerEnd={marker} />
                    <text x={mx} y={a.cy - 8} fontSize={11.5} fontWeight={600} textAnchor="middle" fill="var(--wx-text-primary, #334155)">{top}</text>
                    {bot && <text x={mx} y={a.cy + 16} fontSize={10.5} textAnchor="middle" fill="var(--wx-text-secondary, #64748b)">{bot}</text>}
                  </g>
                );
              }
              const peak = a.y - ARC_SPACE + 8;
              const mx = (a.cx + b.cx) / 2;
              return (
                <g key={`e-${t.id}`} style={{ cursor }} onClick={click}>
                  <path d={`M${a.cx},${a.y} Q${mx},${peak} ${b.cx},${b.y}`} fill="none" stroke="transparent" strokeWidth={16} />
                  {hl && <path d={`M${a.cx},${a.y} Q${mx},${peak - 6} ${b.cx},${b.y}`} fill="none" stroke="var(--wx-blue-400, #60a5fa)" strokeWidth={7} opacity={0.35} />}
                  <path d={`M${a.cx},${a.y} Q${mx},${peak} ${b.cx},${b.y}`} fill="none" stroke={stroke} strokeWidth={hl ? 2.4 : 1.6} strokeDasharray={isReq ? '5 4' : '4 3'} markerEnd={marker} />
                  <text x={mx} y={peak + 2} fontSize={10.5} textAnchor="middle" fill="var(--wx-text-secondary, #64748b)">{top}</text>
                </g>
              );
            }),
          )}

          {/* 幽灵连线(拖拽中) */}
          {drag && ghost && (
            <line x1={drag.cx} y1={drag.cy} x2={ghost.x} y2={ghost.y} stroke={BLUE} strokeWidth={2.2} strokeDasharray="6 4" markerEnd="url(#sm-arrow-blue)" />
          )}

          {/* 状态节点(按下=可拖拽连线;松开未移动=点击) */}
          {lanes.flatMap((lane) => {
            const c = attrColor(lane.attr);
            return lane.states.map((s) => {
              const p = pos.get(`${lane.attr}|${s}`);
              if (!p) return null;
              const key = `${lane.attr}|${s}`;
              const isHover = hoverKey === key && drag && key !== `${drag.attr}|${drag.state}`;
              const isSrc = drag && key === `${drag.attr}|${drag.state}`;
              return (
                <g
                  key={`n-${key}`}
                  style={{ cursor: editable ? 'grab' : 'default' }}
                  onMouseDown={editable ? (e) => { e.preventDefault(); setDrag({ attr: lane.attr, state: s, cx: p.cx, cy: p.cy, clientX: e.clientX, clientY: e.clientY }); } : undefined}
                >
                  <rect
                    x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={9}
                    fill={isHover ? 'var(--wx-blue-50, #eff6ff)' : c.fill}
                    stroke={isHover || isSrc ? BLUE : c.stroke}
                    strokeWidth={isHover || isSrc ? 2.4 : 1.4}
                  />
                  <text x={p.cx} y={p.y + 20} fontSize={13} fontWeight={700} textAnchor="middle" fill={c.text}>{stZh(s)}</text>
                  <text x={p.cx} y={p.y + 36} fontSize={10} textAnchor="middle" fill="var(--wx-text-secondary, #94a3b8)">{s}</text>
                </g>
              );
            });
          })}
        </svg>
      </div>

      {lanes.some((l) => l.transitions.some((t) => t.requires_json)) && (
        <div style={{ fontSize: 11, color: 'var(--wx-text-secondary, #94a3b8)' }}>
          紫色虚线 = 跨属性前提:
          {lanes.flatMap((l) => l.transitions.filter((t) => t.requires_json).map((t) => {
            const rq = requiresZh(t);
            return rq ? <span key={`rqh-${t.id}`} style={{ marginLeft: 8 }}>{t.action} {rq}</span> : null;
          }))}
        </div>
      )}
    </div>
  );
};

const Swatch: React.FC<{ kind: 'line' | 'dash' | 'node'; color: string; label: string }> = ({ kind, color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {kind === 'node' ? (
      <span style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${color}`, display: 'inline-block' }} />
    ) : (
      <svg width={22} height={8}><line x1={0} y1={4} x2={22} y2={4} stroke={color} strokeWidth={2} strokeDasharray={kind === 'dash' ? '4 3' : undefined} /></svg>
    )}
    {label}
  </span>
);

export default ProdStateMachineGraph;
