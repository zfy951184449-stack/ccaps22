/**
 * CIP 拓扑可视:设备/罐 → 管线 → {主站(优先), 备站(应急)}。
 * 拓扑三层(D20 / 10_spec §3.3):一道 CIP 的候选资源 = 它管线的主站(引擎只往这排),备站仅人工应急。
 * inline SVG,颜色只用 --wx 变量。
 *
 * 交互(可读性):三列任一节点都可悬停预览 / 点选锁定,双向高亮其链路;
 *   下方「链路解读」用一句话把引擎排产逻辑讲明白(选中设备/管线/站点各有解读)。
 */
import React, { useMemo, useState } from 'react';
import type {
  PsCipEquipment,
  PsCipStation,
  PsPipeline,
} from '../../types/psResource';
import { PS_CIP_EQUIP_TYPE_LABEL } from '../../types/psResource';

interface Props {
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
}

/** 选中/悬停的焦点:点设备等于点它的管线;站点单独成一类 */
type Focus = { kind: 'pipeline'; id: string } | { kind: 'station'; id: string };

const COL_EQUIP = 30;
const COL_PIPE = 320;
const COL_STATION = 600;
const NODE_W_EQUIP = 220;
const NODE_W_PIPE = 200;
const NODE_W_STATION = 250;
const ROW_H = 56;

export const PsCipTopology: React.FC<Props> = ({ stations, pipelines, equipment }) => {
  const [selected, setSelected] = useState<Focus | null>(null);
  const [hovered, setHovered] = useState<Focus | null>(null);
  // 悬停预览优先,移开后回落到锁定的选中
  const focus: Focus | null = hovered ?? selected;

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
    if (focus.kind === 'pipeline') {
      const p = pipelines.find((pp) => pp.id === focus.id);
      if (p) {
        pipes.add(p.id);
        sta.add(p.primaryStationId);
        if (p.backupStationId) sta.add(p.backupStationId);
        equipment.filter((e) => e.pipelineId === p.id).forEach((e) => equips.add(e.id));
      }
    } else {
      sta.add(focus.id);
      pipelines
        .filter((p) => p.primaryStationId === focus.id || p.backupStationId === focus.id)
        .forEach((p) => {
          pipes.add(p.id);
          equipment.filter((e) => e.pipelineId === p.id).forEach((e) => equips.add(e.id));
        });
    }
    return { pipes, sta, equips };
  }, [focus, pipelines, equipment]);

  const dimPipe = (id: string) => active !== null && !active.pipes.has(id);
  const dimStation = (id: string) => active !== null && !active.sta.has(id);
  const dimEquip = (id: string) => active !== null && !active.equips.has(id);

  const toggle = (f: Focus) =>
    setSelected((cur) => (cur && cur.kind === f.kind && cur.id === f.id ? null : f));

  const viewH = layout.height;

  return (
    <div className="psrm-topo">
      <div className="psrm-topo-cols">
        <span>设备 / 罐</span>
        <span>管线(主备站归属)</span>
        <span>CIP 站(容量 1)</span>
      </div>
      <svg
        viewBox={`0 0 880 ${viewH}`}
        width="100%"
        height={viewH}
        role="img"
        aria-label="CIP 拓扑:设备到管线到主备站"
        style={{ overflow: 'visible' }}
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
          const primaryY =
            layout.stationY[r.pipe.primaryStationId] !== undefined
              ? layout.stationY[r.pipe.primaryStationId] + ROW_H / 2
              : py;
          const backupY =
            r.pipe.backupStationId && layout.stationY[r.pipe.backupStationId] !== undefined
              ? layout.stationY[r.pipe.backupStationId] + ROW_H / 2
              : null;
          return (
            <g key={`s-${r.pipe.id}`}>
              <path
                d={`M ${COL_PIPE + NODE_W_PIPE} ${py} C ${COL_PIPE + NODE_W_PIPE + 40} ${py}, ${COL_STATION - 40} ${primaryY}, ${COL_STATION} ${primaryY}`}
                fill="none"
                stroke={dim ? 'var(--wx-blue-100)' : 'var(--wx-primary, var(--wx-blue-600))'}
                strokeWidth={dim ? 1 : 2}
              />
              {backupY !== null && (
                <path
                  d={`M ${COL_PIPE + NODE_W_PIPE} ${py} C ${COL_PIPE + NODE_W_PIPE + 40} ${py}, ${COL_STATION - 40} ${backupY}, ${COL_STATION} ${backupY}`}
                  fill="none"
                  stroke={dim ? 'var(--wx-blue-100)' : 'var(--wx-amber-500)'}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}
            </g>
          );
        })}

        {/* 设备节点(可点选 = 点其管线) */}
        {layout.rows.map((r) =>
          r.equips.map((eq, i) => {
            const ey = r.top + i * ROW_H;
            const dim = dimEquip(eq.id);
            return (
              <g
                key={`e-${eq.id}`}
                opacity={dim ? 0.4 : 1}
                style={{ cursor: 'pointer' }}
                onClick={() => toggle({ kind: 'pipeline', id: r.pipe.id })}
                onMouseEnter={() => setHovered({ kind: 'pipeline', id: r.pipe.id })}
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
              </g>
            );
          }),
        )}

        {/* 管线节点(可点选高亮链路) */}
        {layout.rows.map((r) => {
          const py = layout.pipeY[r.pipe.id];
          const dim = dimPipe(r.pipe.id);
          const isSel = selected?.kind === 'pipeline' && selected.id === r.pipe.id;
          return (
            <g
              key={`p-${r.pipe.id}`}
              opacity={dim ? 0.4 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => toggle({ kind: 'pipeline', id: r.pipe.id })}
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
                stroke={isSel ? 'var(--wx-primary, var(--wx-blue-600))' : 'var(--wx-blue-300)'}
                strokeWidth={isSel ? 2 : 1}
              />
              <text x={COL_PIPE + 12} y={py + 19} fontSize="12.5" fontWeight="700" fill="var(--wx-blue-700)">
                {r.pipe.code}
              </text>
              <text x={COL_PIPE + 12} y={py + 35} fontSize="10.5" fill="var(--wx-blue-700)">
                {r.pipe.name.replace(/^管线 \w+/, '').replace(/[()]/g, '') || '管线'}
              </text>
            </g>
          );
        })}

        {/* CIP 站节点(可点选 = 反查路由到它的管线/设备) */}
        {stations.map((s) => {
          const sy = layout.stationY[s.id];
          const dim = dimStation(s.id);
          const isSel = selected?.kind === 'station' && selected.id === s.id;
          const fill = s.emergencyOnly ? 'var(--wx-amber-100)' : 'var(--wx-green-100)';
          const stroke = isSel
            ? 'var(--wx-primary, var(--wx-blue-600))'
            : s.emergencyOnly
              ? 'var(--wx-amber-500)'
              : 'var(--wx-green-500)';
          return (
            <g
              key={`st-${s.id}`}
              opacity={dim ? 0.4 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => toggle({ kind: 'station', id: s.id })}
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
                strokeWidth={isSel ? 2.5 : 1.5}
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
            </g>
          );
        })}
      </svg>

      {/* 链路解读:把引擎怎么用这条链路讲明白 */}
      <CipReading
        focus={selected ?? hovered}
        locked={selected !== null}
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
        <span className="psrm-topo-hint">悬停预览 · 点选锁定(设备 / 管线 / 站点皆可)· 再点取消</span>
      </div>
    </div>
  );
};

/** 链路解读条:选中设备/管线 → 正向讲排站逻辑;选中站点 → 反查它服务谁 */
const CipReading: React.FC<{
  focus: Focus | null;
  locked: boolean;
  stations: PsCipStation[];
  pipelines: PsPipeline[];
  equipment: PsCipEquipment[];
}> = ({ focus, locked, stations, pipelines, equipment }) => {
  const codeOf = (id?: string) => stations.find((s) => s.id === id)?.code ?? '—';

  if (!focus) {
    return (
      <div className="psrm-topo-read empty">
        点选任一节点查看「这条 CIP 链路引擎怎么排」—— 容量 1 的站、主站满即报增援、备站留给人。
      </div>
    );
  }

  let body: React.ReactNode;
  if (focus.kind === 'pipeline') {
    const p = pipelines.find((pp) => pp.id === focus.id);
    if (!p) return null;
    const equips = equipment.filter((e) => e.pipelineId === p.id);
    const primary = stations.find((s) => s.id === p.primaryStationId);
    const backup = stations.find((s) => s.id === p.backupStationId);
    body = (
      <>
        <span className="psrm-read-lead">{p.code}</span>
        {' '}挂{' '}
        <strong>{equips.map((e) => e.code).join('、') || '—'}</strong>
        {' '}的 CIP → 引擎只排主站{' '}
        <strong className="psrm-read-primary">{primary?.code ?? '—'}</strong>
        (容量 1,同刻只洗一条管线)。主站塞不下 → <strong>报增援</strong>;
        备站{' '}
        {backup ? <strong className="psrm-read-backup">{backup.code}</strong> : '无'}
        {backup ? ' 是人工应急余量,引擎默认不往这排(D20)。' : '(无备站)。'}
      </>
    );
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
