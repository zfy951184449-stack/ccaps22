/**
 * CIP 拓扑可视 + 编辑:设备/罐 → 管线 → {主站(优先), 备站(应急)}。
 * 拓扑三层(D20 / 10_spec §3.3):一道 CIP 的候选资源 = 它管线的主站(引擎只往这排),备站仅人工应急。
 * inline SVG,颜色只用 --wx 变量。
 *
 * 受控组件(viz+edit 重设计):
 *  - 浏览态(mode='view')= 历史只读体验逐像素不变:悬停预览 / 点选锁定,双向高亮链路 + 链路解读条。
 *  - 编辑态(mode='edit')= 同一张图叠加:节点点选打开右侧编辑抽屉(由父组件渲染);列头「+ 新增」;
 *    主/备站连线端点出现可拖 handle,拖到目标站即改路由(非法落点回弹);有校验问题的节点亮红点。
 *  选中态(selected)、增删改路由全部上提到父组件;本组件只渲染 + 触发回调(声明式,连线随 data 重画)。
 */
import React, { useMemo, useRef, useState } from 'react';
import type {
  PsCipEquipment,
  PsCipStation,
  PsPipeline,
} from '../../types/psResource';
import { PS_CIP_EQUIP_TYPE_LABEL } from '../../types/psResource';

/** 选中/悬停的焦点。编辑态下设备单独可选(改挂管线);浏览态点设备等于点其管线。 */
export type PsCipFocus =
  | { kind: 'pipeline'; id: string }
  | { kind: 'station'; id: string }
  | { kind: 'equipment'; id: string };

export type PsCipReroute = (pipelineId: string, stationId: string, role: 'primary' | 'backup') => void;

interface Props {
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
  mode?: 'view' | 'edit';
  selected?: PsCipFocus | null;
  onSelect?: (f: PsCipFocus | null) => void;
  onReroute?: PsCipReroute;
  /** 列头「+ 新增」(编辑态);kind = station|pipeline|equipment */
  onAdd?: (kind: 'station' | 'pipeline' | 'equipment') => void;
  /** entityId → 最严重问题(error 优先),用于节点红点高亮 */
  issueEntities?: Map<string, { severity: 'error' | 'warn'; message: string }>;
}

const COL_EQUIP = 30;
const COL_PIPE = 320;
const COL_STATION = 600;
const NODE_W_EQUIP = 220;
const NODE_W_PIPE = 200;
const NODE_W_STATION = 250;
const ROW_H = 56;
const VIEW_W = 880;

interface DragState {
  pipelineId: string;
  role: 'primary' | 'backup';
  x: number;
  y: number;
  /** 当前悬停命中的站(候选落点) */
  candidateStationId: string | null;
  /** 候选是否非法(主站不能落到 emergencyOnly 站) */
  candidateInvalid: boolean;
}

export const PsCipTopology: React.FC<Props> = ({
  stations,
  pipelines,
  equipment,
  mode = 'view',
  selected: selectedProp = null,
  onSelect,
  onReroute,
  onAdd,
  issueEntities,
}) => {
  const editing = mode === 'edit';
  const [hovered, setHovered] = useState<PsCipFocus | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // 镜像最新候选落点,供同步注册的 mouseup 处理器读取(避开 setState 异步/闭包过期)
  const dragInfoRef = useRef<{ candidateStationId: string | null; candidateInvalid: boolean }>({
    candidateStationId: null,
    candidateInvalid: false,
  });
  // 悬停预览优先,移开后回落到锁定的选中;拖拽中不让 hover 干扰高亮
  const focus: PsCipFocus | null = drag ? null : (hovered ?? selectedProp);

  // 布局:管线居中,设备挂左,主备站挂右
  const layout = useMemo(() => {
    const pipeY: Record<string, number> = {};
    const equipPipeRows = pipelines.map((p) => ({
      pipe: p,
      equips: equipment.filter((e) => e.pipelineId === p.id),
    }));
    let y = 24;
    const rows = equipPipeRows.map((r) => {
      const span = Math.max(r.equips.length, 1);
      const blockH = span * ROW_H;
      const centerY = y + blockH / 2 - ROW_H / 2;
      pipeY[r.pipe.id] = centerY;
      const out = { ...r, top: y, centerY, equips: r.equips };
      y += blockH + 12;
      return out;
    });
    const height = y + 8;

    const stationY: Record<string, number> = {};
    let sy = 24;
    stations.forEach((s) => {
      stationY[s.id] = sy;
      sy += ROW_H + 12;
    });

    return { rows, pipeY, stationY, height: Math.max(height, sy) };
  }, [pipelines, equipment, stations]);

  // 焦点 → 高亮集合(管线 / 站点 / 设备),双向可达
  const active = useMemo(() => {
    if (!focus) return null;
    const pipes = new Set<string>();
    const sta = new Set<string>();
    const equips = new Set<string>();
    const addPipeChain = (p?: PsPipeline) => {
      if (!p) return;
      pipes.add(p.id);
      if (p.primaryStationId) sta.add(p.primaryStationId);
      if (p.backupStationId) sta.add(p.backupStationId);
      equipment.filter((e) => e.pipelineId === p.id).forEach((e) => equips.add(e.id));
    };
    if (focus.kind === 'pipeline') {
      addPipeChain(pipelines.find((pp) => pp.id === focus.id));
    } else if (focus.kind === 'equipment') {
      const eq = equipment.find((e) => e.id === focus.id);
      if (eq) {
        equips.add(eq.id);
        addPipeChain(pipelines.find((pp) => pp.id === eq.pipelineId));
      }
    } else {
      sta.add(focus.id);
      pipelines
        .filter((p) => p.primaryStationId === focus.id || p.backupStationId === focus.id)
        .forEach((p) => addPipeChain(p));
    }
    return { pipes, sta, equips };
  }, [focus, pipelines, equipment]);

  const dimPipe = (id: string) => active !== null && !active.pipes.has(id);
  const dimStation = (id: string) => active !== null && !active.sta.has(id);
  const dimEquip = (id: string) => active !== null && !active.equips.has(id);

  const select = (f: PsCipFocus) => {
    if (!onSelect) return;
    const isSame = selectedProp && selectedProp.kind === f.kind && selectedProp.id === f.id;
    onSelect(isSame ? null : f);
  };

  const issueOf = (id: string) => issueEntities?.get(id);

  // ── 拖端点改路由 ──
  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || !svg.getScreenCTM) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const hitStation = (x: number, y: number): string | null => {
    for (const s of stations) {
      const sy = layout.stationY[s.id];
      if (sy === undefined) continue;
      if (x >= COL_STATION && x <= COL_STATION + NODE_W_STATION && y >= sy && y <= sy + ROW_H - 12) {
        return s.id;
      }
    }
    return null;
  };

  const startDrag = (e: React.MouseEvent, pipelineId: string, role: 'primary' | 'backup') => {
    if (!editing || !onReroute) return;
    e.stopPropagation();
    e.preventDefault();
    const start = clientToSvg(e.clientX, e.clientY);
    dragInfoRef.current = { candidateStationId: null, candidateInvalid: false };
    setDrag({ pipelineId, role, x: start.x, y: start.y, candidateStationId: null, candidateInvalid: false });

    // 同步注册 window 监听器,避免 useEffect 下一帧才挂上导致快速拖拽/首帧丢失
    const onMove = (ev: MouseEvent) => {
      const { x, y } = clientToSvg(ev.clientX, ev.clientY);
      const candidateStationId = hitStation(x, y);
      const cand = candidateStationId ? stations.find((s) => s.id === candidateStationId) : undefined;
      const candidateInvalid = !!cand && role === 'primary' && !!cand.emergencyOnly;
      dragInfoRef.current = { candidateStationId, candidateInvalid };
      setDrag((d) => (d ? { ...d, x, y, candidateStationId, candidateInvalid } : d));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const { candidateStationId, candidateInvalid } = dragInfoRef.current;
      if (candidateStationId && !candidateInvalid) {
        onReroute(pipelineId, candidateStationId, role);
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const viewH = layout.height;

  return (
    <div className={`psrm-topo${editing ? ' editing' : ''}`}>
      <div className="psrm-topo-cols">
        <span className="psrm-topo-col-head">
          设备 / 罐
          {editing && onAdd && (
            <button type="button" className="psrm-topo-add" onClick={() => onAdd('equipment')} aria-label="新增设备">
              <PlusGlyph />
            </button>
          )}
        </span>
        <span className="psrm-topo-col-head">
          管线(主备站归属)
          {editing && onAdd && (
            <button type="button" className="psrm-topo-add" onClick={() => onAdd('pipeline')} aria-label="新增管线">
              <PlusGlyph />
            </button>
          )}
        </span>
        <span className="psrm-topo-col-head">
          CIP 站(容量 1)
          {editing && onAdd && (
            <button type="button" className="psrm-topo-add" onClick={() => onAdd('station')} aria-label="新增 CIP 站">
              <PlusGlyph />
            </button>
          )}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        width="100%"
        height={viewH}
        role="img"
        aria-label="CIP 拓扑:设备到管线到主备站"
        style={{ overflow: 'visible', cursor: drag ? 'grabbing' : undefined }}
      >
        {/* 连线:设备 → 管线 */}
        {layout.rows.map((r) =>
          r.equips.map((eq, i) => {
            const ey = r.top + i * ROW_H + ROW_H / 2;
            const py = layout.pipeY[r.pipe.id] + ROW_H / 2;
            const dim = dimPipe(r.pipe.id);
            return (
              <path
                key={`l-${eq.id}`}
                d={`M ${COL_EQUIP + NODE_W_EQUIP} ${ey} C ${COL_EQUIP + NODE_W_EQUIP + 40} ${ey}, ${COL_PIPE - 40} ${py}, ${COL_PIPE} ${py}`}
                fill="none"
                stroke={dim ? 'var(--wx-blue-100)' : 'var(--wx-blue-300)'}
                strokeWidth={dim ? 1 : 1.5}
              />
            );
          }),
        )}

        {/* 连线:管线 → 主站(实线粗)/ 备站(虚线细) */}
        {layout.rows.map((r) => {
          const py = layout.pipeY[r.pipe.id] + ROW_H / 2;
          const dim = dimPipe(r.pipe.id);
          const hasPrimary = r.pipe.primaryStationId && layout.stationY[r.pipe.primaryStationId] !== undefined;
          const primaryY = hasPrimary ? layout.stationY[r.pipe.primaryStationId] + ROW_H / 2 : py;
          const backupY =
            r.pipe.backupStationId && layout.stationY[r.pipe.backupStationId] !== undefined
              ? layout.stationY[r.pipe.backupStationId] + ROW_H / 2
              : null;
          return (
            <g key={`s-${r.pipe.id}`}>
              {hasPrimary && (
                <path
                  d={`M ${COL_PIPE + NODE_W_PIPE} ${py} C ${COL_PIPE + NODE_W_PIPE + 40} ${py}, ${COL_STATION - 40} ${primaryY}, ${COL_STATION} ${primaryY}`}
                  fill="none"
                  stroke={dim ? 'var(--wx-blue-100)' : 'var(--wx-primary, var(--wx-blue-600))'}
                  strokeWidth={dim ? 1 : 2}
                />
              )}
              {backupY !== null && (
                <path
                  d={`M ${COL_PIPE + NODE_W_PIPE} ${py} C ${COL_PIPE + NODE_W_PIPE + 40} ${py}, ${COL_STATION - 40} ${backupY}, ${COL_STATION} ${backupY}`}
                  fill="none"
                  stroke={dim ? 'var(--wx-blue-100)' : 'var(--wx-amber-500)'}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}
              {/* 编辑态:主/备站端点可拖 handle */}
              {editing && onReroute && !dim && hasPrimary && (
                <circle
                  className="psrm-topo-handle"
                  cx={COL_STATION}
                  cy={primaryY}
                  r={6}
                  fill="var(--wx-primary, var(--wx-blue-600))"
                  stroke="#ffffff"
                  strokeWidth={2}
                  onMouseDown={(e) => startDrag(e, r.pipe.id, 'primary')}
                >
                  <title>拖动改主站</title>
                </circle>
              )}
              {editing && onReroute && !dim && backupY !== null && (
                <circle
                  className="psrm-topo-handle"
                  cx={COL_STATION}
                  cy={backupY}
                  r={5}
                  fill="var(--wx-amber-500)"
                  stroke="#ffffff"
                  strokeWidth={2}
                  onMouseDown={(e) => startDrag(e, r.pipe.id, 'backup')}
                >
                  <title>拖动改备站</title>
                </circle>
              )}
            </g>
          );
        })}

        {/* 拖拽中的浮动连线 */}
        {drag && (() => {
          const pipe = pipelines.find((p) => p.id === drag.pipelineId);
          if (!pipe) return null;
          const py = layout.pipeY[pipe.id] + ROW_H / 2;
          const color = drag.candidateInvalid
            ? 'var(--wx-red-500)'
            : drag.role === 'primary'
              ? 'var(--wx-primary, var(--wx-blue-600))'
              : 'var(--wx-amber-500)';
          return (
            <path
              d={`M ${COL_PIPE + NODE_W_PIPE} ${py} C ${COL_PIPE + NODE_W_PIPE + 40} ${py}, ${drag.x - 40} ${drag.y}, ${drag.x} ${drag.y}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray={drag.role === 'backup' ? '5 4' : undefined}
              pointerEvents="none"
            />
          );
        })()}

        {/* 设备节点 */}
        {layout.rows.map((r) =>
          r.equips.map((eq, i) => {
            const ey = r.top + i * ROW_H;
            const dim = dimEquip(eq.id);
            const issue = issueOf(eq.id);
            return (
              <g
                key={`e-${eq.id}`}
                opacity={dim ? 0.4 : 1}
                style={{ cursor: 'pointer' }}
                onClick={() => select(editing ? { kind: 'equipment', id: eq.id } : { kind: 'pipeline', id: r.pipe.id })}
                onMouseEnter={() => setHovered(editing ? { kind: 'equipment', id: eq.id } : { kind: 'pipeline', id: r.pipe.id })}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={COL_EQUIP}
                  y={ey}
                  width={NODE_W_EQUIP}
                  height={ROW_H - 12}
                  rx={8}
                  fill="var(--wx-blue-100)"
                  stroke="var(--wx-blue-300)"
                />
                <text x={COL_EQUIP + 12} y={ey + 19} fontSize="12" fontWeight="600" fill="var(--wx-blue-700)">
                  {eq.code}
                </text>
                <text x={COL_EQUIP + 12} y={ey + 35} fontSize="10.5" fill="var(--wx-text-secondary, var(--wx-blue-700))">
                  {PS_CIP_EQUIP_TYPE_LABEL[eq.type]}
                </text>
                {issue && <IssueBadge x={COL_EQUIP + NODE_W_EQUIP - 8} y={ey + 6} severity={issue.severity} />}
              </g>
            );
          }),
        )}

        {/* 管线节点 */}
        {layout.rows.map((r) => {
          const py = layout.pipeY[r.pipe.id];
          const dim = dimPipe(r.pipe.id);
          const isSel = selectedProp?.kind === 'pipeline' && selectedProp.id === r.pipe.id;
          const issue = issueOf(r.pipe.id);
          const noPrimary = !r.pipe.primaryStationId;
          return (
            <g
              key={`p-${r.pipe.id}`}
              opacity={dim ? 0.4 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => select({ kind: 'pipeline', id: r.pipe.id })}
              onMouseEnter={() => setHovered({ kind: 'pipeline', id: r.pipe.id })}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={COL_PIPE}
                y={py}
                width={NODE_W_PIPE}
                height={ROW_H - 12}
                rx={8}
                fill={isSel ? 'var(--wx-blue-300)' : 'var(--wx-blue-200)'}
                stroke={
                  noPrimary
                    ? 'var(--wx-amber-500)'
                    : isSel
                      ? 'var(--wx-primary, var(--wx-blue-600))'
                      : 'var(--wx-blue-300)'
                }
                strokeWidth={isSel ? 2 : 1}
                strokeDasharray={noPrimary ? '5 4' : undefined}
              />
              <text x={COL_PIPE + 12} y={py + 19} fontSize="12.5" fontWeight="700" fill="var(--wx-blue-700)">
                {r.pipe.code}
              </text>
              <text x={COL_PIPE + 12} y={py + 35} fontSize="10.5" fill={noPrimary ? 'var(--wx-amber-700)' : 'var(--wx-blue-700)'}>
                {noPrimary ? '待指定主站' : r.pipe.name.replace(/^管线 \w+/, '').replace(/[()]/g, '') || '管线'}
              </text>
              {issue && <IssueBadge x={COL_PIPE + NODE_W_PIPE - 8} y={py + 6} severity={issue.severity} />}
            </g>
          );
        })}

        {/* CIP 站节点 */}
        {stations.map((s) => {
          const sy = layout.stationY[s.id];
          const dim = dimStation(s.id);
          const isSel = selectedProp?.kind === 'station' && selectedProp.id === s.id;
          const issue = issueOf(s.id);
          const isCandidate = drag?.candidateStationId === s.id;
          const fill = s.emergencyOnly ? 'var(--wx-amber-100)' : 'var(--wx-green-100)';
          const stroke = isCandidate
            ? drag?.candidateInvalid
              ? 'var(--wx-red-500)'
              : 'var(--wx-primary, var(--wx-blue-600))'
            : isSel
              ? 'var(--wx-primary, var(--wx-blue-600))'
              : s.emergencyOnly
                ? 'var(--wx-amber-500)'
                : 'var(--wx-green-500)';
          return (
            <g
              key={`st-${s.id}`}
              opacity={dim && !isCandidate ? 0.4 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => select({ kind: 'station', id: s.id })}
              onMouseEnter={() => setHovered({ kind: 'station', id: s.id })}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={COL_STATION}
                y={sy}
                width={NODE_W_STATION}
                height={ROW_H - 12}
                rx={8}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSel || isCandidate ? 2.5 : 1.5}
              />
              <text x={COL_STATION + 12} y={sy + 19} fontSize="12.5" fontWeight="700" fill="var(--wx-green-700)">
                {s.code}
                <tspan fontSize="10" fontWeight="500" fill="var(--wx-text-secondary, var(--wx-blue-700))">
                  {'  '}容量 1
                </tspan>
              </text>
              <text x={COL_STATION + 12} y={sy + 35} fontSize="10.5" fill="var(--wx-text-secondary, var(--wx-blue-700))">
                {s.emergencyOnly ? '备站 · 人工应急' : s.department}
              </text>
              {issue && <IssueBadge x={COL_STATION + NODE_W_STATION - 8} y={sy + 6} severity={issue.severity} />}
              {isCandidate && drag?.candidateInvalid && (
                <text x={COL_STATION + NODE_W_STATION / 2} y={sy - 4} fontSize="10.5" textAnchor="middle" fill="var(--wx-red-700)">
                  备站不能当主站
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 链路解读:把引擎怎么用这条链路讲明白 */}
      <CipReading
        focus={selectedProp ?? hovered}
        locked={selectedProp !== null}
        stations={stations}
        pipelines={pipelines}
        equipment={equipment}
      />

      <div className="psrm-topo-legend">
        <span className="psrm-topo-leg">
          <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--wx-primary, var(--wx-blue-600))" strokeWidth="2" /></svg>
          主站(引擎只往此排)
        </span>
        <span className="psrm-topo-leg">
          <svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--wx-amber-500)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
          备站(人工应急,默认不占)
        </span>
        <span className="psrm-topo-hint">
          {editing ? '点节点编辑 · 拖端点改主/备站 · 列头「+」新增' : '悬停预览 · 点选锁定(设备 / 管线 / 站点皆可)· 再点取消'}
        </span>
      </div>
    </div>
  );
};

/** 加号图标(inline SVG,禁 emoji)。 */
const PlusGlyph: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
    <line x1="5.5" y1="1" x2="5.5" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** 节点右上角校验角标。 */
const IssueBadge: React.FC<{ x: number; y: number; severity: 'error' | 'warn' }> = ({ x, y, severity }) => (
  <g pointerEvents="none">
    <circle cx={x} cy={y} r={7} fill={severity === 'error' ? 'var(--wx-red-500)' : 'var(--wx-amber-500)'} />
    <text x={x} y={y + 3.5} fontSize="10" fontWeight="700" textAnchor="middle" fill="#ffffff">!</text>
  </g>
);

/** 链路解读条:选中设备/管线 → 正向讲排站逻辑;选中站点 → 反查它服务谁。 */
const CipReading: React.FC<{
  focus: PsCipFocus | null;
  locked: boolean;
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
}> = ({ focus, locked, stations, pipelines, equipment }) => {
  if (!focus) {
    return (
      <div className="psrm-topo-read empty">
        点选任一节点查看「这条 CIP 链路引擎怎么排」—— 容量 1 的站、主站满即报增援、备站留给人。
      </div>
    );
  }

  let body: React.ReactNode;
  const pipeReading = (p?: PsPipeline) => {
    if (!p) return null;
    const equips = equipment.filter((e) => e.pipelineId === p.id);
    const primary = stations.find((s) => s.id === p.primaryStationId);
    const backup = stations.find((s) => s.id === p.backupStationId);
    return (
      <>
        <span className="psrm-read-lead">{p.code}</span>
        {' '}挂{' '}
        <strong>{equips.map((e) => e.code).join('、') || '—'}</strong>
        {' '}的 CIP → 引擎只排主站{' '}
        <strong className="psrm-read-primary">{primary?.code ?? '(未指定)'}</strong>
        (容量 1,同刻只洗一条管线)。主站塞不下 → <strong>报增援</strong>;
        备站{' '}
        {backup ? <strong className="psrm-read-backup">{backup.code}</strong> : '无'}
        {backup ? ' 是人工应急余量,引擎默认不往这排(D20)。' : '(无备站)。'}
      </>
    );
  };

  if (focus.kind === 'pipeline') {
    body = pipeReading(pipelines.find((pp) => pp.id === focus.id));
    if (!body) return null;
  } else if (focus.kind === 'equipment') {
    const eq = equipment.find((e) => e.id === focus.id);
    body = pipeReading(pipelines.find((pp) => pp.id === eq?.pipelineId));
    if (!body) return null;
  } else {
    const s = stations.find((st) => st.id === focus.id);
    if (!s) return null;
    const asPrimary = pipelines.filter((p) => p.primaryStationId === s.id);
    const asBackup = pipelines.filter((p) => p.backupStationId === s.id);
    body = s.emergencyOnly ? (
      <>
        <span className="psrm-read-lead">{s.code}</span>
        {' '}是应急<strong className="psrm-read-backup">备站</strong>:引擎默认不往这排,仅{' '}
        <strong>{asBackup.map((p) => p.code).join('、') || '相关管线'}</strong>
        {' '}主站满时由人工启用(动备站=人的决定,不是引擎的)。
      </>
    ) : (
      <>
        <span className="psrm-read-lead">{s.code}</span>
        (容量 1)是{' '}
        <strong className="psrm-read-primary">{asPrimary.map((p) => p.code).join('、') || '—'}</strong>
        {' '}的主站
        {asBackup.length > 0 && (
          <>、{' '}<strong className="psrm-read-backup">{asBackup.map((p) => p.code).join('、')}</strong>{' '}的备站</>
        )}
        。同刻只能洗一条管线 →{' '}
        {asPrimary.length > 1
          ? '这几条管线的 CIP 抢同一时间轴,排不下就报增援。'
          : '该管线的 CIP 独占其时间轴。'}
      </>
    );
  }

  return (
    <div className="psrm-topo-read">
      <span className={`psrm-read-tag${locked ? ' locked' : ''}`}>{locked ? '已锁定' : '预览'}</span>
      <span className="psrm-read-body">{body}</span>
    </div>
  );
};

export default PsCipTopology;
