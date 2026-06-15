/**
 * 单条属性的「小状态机」SVG 视图 —— 状态节点 + 转移边(标操作名)+ 过期钟标注。
 * 纯 inline SVG(不用甘特);颜色全用 --wx CSS 变量。
 * 布局:状态节点横向均分一行;转移边在节点上方(forward,弧)/ 下方(backward/loop,弧)。
 */
import React from 'react';
import type { EsmAttribute, EsmTransition, EsmStateValue } from '../../types/equipmentStateMachine';

interface Props {
  attribute: EsmAttribute;
  /** 选中的转移边 id(高亮)*/
  selectedEdgeId?: string | null;
  onEdgeClick?: (t: EsmTransition) => void;
}

const NODE_W = 116;
const NODE_H = 44;
const GAP_X = 70;
const PAD_X = 24;
const ROW_Y = 120; // 节点行的中线 y
const SVG_H = 230;

const nodeColors = (v: EsmStateValue) => {
  if (v.ready) return { fill: 'var(--wx-green-100)', stroke: 'var(--wx-green-600)', text: 'var(--wx-green-700)' };
  if (v.initial) return { fill: 'var(--wx-blue-100)', stroke: 'var(--wx-blue-600)', text: 'var(--wx-blue-700)' };
  return { fill: 'var(--wx-amber-100)', stroke: 'var(--wx-amber-500)', text: 'var(--wx-amber-700)' };
};

export const StateMachineDiagram: React.FC<Props> = ({ attribute, selectedEdgeId, onEdgeClick }) => {
  const values = attribute.values;
  const indexById = new Map(values.map((v, i) => [v.id, i]));
  const centerX = (i: number) => PAD_X + NODE_W / 2 + i * (NODE_W + GAP_X);
  const svgW = PAD_X * 2 + values.length * NODE_W + (values.length - 1) * GAP_X;

  return (
    <svg
      className="esm-svg"
      viewBox={`0 0 ${Math.max(svgW, 320)} ${SVG_H}`}
      width="100%"
      role="img"
      aria-label={`${attribute.name} 状态机`}
    >
      <defs>
        <marker id="esm-arrow-primary" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--wx-blue-600)" />
        </marker>
        <marker id="esm-arrow-derivable" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--wx-green-600)" />
        </marker>
        <marker id="esm-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--wx-primary, var(--wx-blue-600))" />
        </marker>
      </defs>

      {/* ── 转移边 ── */}
      {attribute.transitions.map((t) => {
        const fi = indexById.get(t.from) ?? 0;
        const ti = indexById.get(t.to) ?? 0;
        const x1 = centerX(fi);
        const x2 = centerX(ti);
        const selected = selectedEdgeId === t.id;
        const isDerivable = t.origin === 'derivable';
        const stroke = selected
          ? 'var(--wx-primary, var(--wx-blue-600))'
          : isDerivable
          ? 'var(--wx-green-600)'
          : 'var(--wx-blue-600)';
        const marker = selected ? 'esm-arrow-sel' : isDerivable ? 'esm-arrow-derivable' : 'esm-arrow-primary';

        // self-loop(计数 cycle):画一个小回环在节点上方
        if (fi === ti) {
          const cx = x1;
          const topY = ROW_Y - NODE_H / 2;
          const labelY = topY - 52;
          return (
            <g key={t.id} className="esm-edge" onClick={() => onEdgeClick?.(t)} style={{ cursor: 'pointer' }}>
              <path
                d={`M ${cx - 18} ${topY} C ${cx - 30} ${topY - 46}, ${cx + 30} ${topY - 46}, ${cx + 18} ${topY}`}
                fill="none"
                stroke={stroke}
                strokeWidth={selected ? 2.4 : 1.6}
                markerEnd={`url(#${marker})`}
              />
              <EdgeLabel x={cx} y={labelY} t={t} selected={selected} isDerivable={isDerivable} />
            </g>
          );
        }

        const forward = ti > fi;
        // forward 边走上方弧,backward 边走下方弧,避免重叠
        const mx = (x1 + x2) / 2;
        const edgeY = forward ? ROW_Y - NODE_H / 2 - 8 : ROW_Y + NODE_H / 2 + 8;
        const ctrlY = forward ? edgeY - 40 : edgeY + 40;
        const startX = x1 + (forward ? NODE_W / 2 - 6 : -(NODE_W / 2 - 6));
        const endX = x2 + (forward ? -(NODE_W / 2 - 6) : NODE_W / 2 - 6);
        const labelY = forward ? ctrlY - 6 : ctrlY + 14;

        return (
          <g key={t.id} className="esm-edge" onClick={() => onEdgeClick?.(t)} style={{ cursor: 'pointer' }}>
            <path
              d={`M ${startX} ${edgeY} Q ${mx} ${ctrlY} ${endX} ${edgeY}`}
              fill="none"
              stroke={stroke}
              strokeWidth={selected ? 2.4 : 1.6}
              strokeDasharray={isDerivable ? '5 4' : undefined}
              markerEnd={`url(#${marker})`}
            />
            <EdgeLabel x={mx} y={labelY} t={t} selected={selected} isDerivable={isDerivable} />
          </g>
        );
      })}

      {/* ── 状态节点 ── */}
      {values.map((v, i) => {
        const x = centerX(i) - NODE_W / 2;
        const y = ROW_Y - NODE_H / 2;
        const c = nodeColors(v);
        return (
          <g key={v.id} className="esm-node">
            <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={10} fill={c.fill} stroke={c.stroke} strokeWidth={1.6} />
            <text x={centerX(i)} y={ROW_Y - 3} textAnchor="middle" className="esm-node-label" fill={c.text}>
              {v.label}
            </text>
            <text x={centerX(i)} y={ROW_Y + 13} textAnchor="middle" className="esm-node-tag" fill={c.text}>
              {v.initial ? '初始' : v.ready ? 'ready' : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const EdgeLabel: React.FC<{ x: number; y: number; t: EsmTransition; selected: boolean; isDerivable: boolean }> = ({
  x,
  y,
  t,
  selected,
  isDerivable,
}) => {
  const opColor = selected
    ? 'var(--wx-primary, var(--wx-blue-600))'
    : isDerivable
    ? 'var(--wx-green-700)'
    : 'var(--wx-blue-700)';
  return (
    <>
      <text x={x} y={y} textAnchor="middle" className="esm-edge-op" fill={opColor}>
        {t.operation}
        {t.countDelta ? ` +${t.countDelta}` : ''}
      </text>
      {t.clockText && (
        <text x={x} y={y - 13} textAnchor="middle" className="esm-edge-clock" fill="var(--wx-amber-700)">
          {t.clockText}
        </text>
      )}
    </>
  );
};

export default StateMachineDiagram;
