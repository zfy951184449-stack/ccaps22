import React, { useState } from 'react';
import './PieChart.css';

export interface WxbPieChartData { label: string; value: number; color: string; }
export interface WxbPieChartProps { data: WxbPieChartData[]; size?: number; title?: string; centerLabel?: React.ReactNode; className?: string; }

export const WxbPieChart: React.FC<WxbPieChartProps> = ({ data, size = 160, title, centerLabel, className = '' }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2, r = size * 0.36, sw = size * 0.14;
  let cumAngle = -90;

  const arcs = data.map((d, i) => {
    const angle = (d.value / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    const end = cumAngle;
    const startRad = (start * Math.PI) / 180;
    const endRad = (end * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, color: d.color, label: d.label, value: d.value, idx: i };
  });

  return (
    <div className={`wxb-pie-chart ${className}`}>
      {title && <div className="wxb-pie-title">{title}</div>}
      <div className="wxb-pie-body">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map(a => (
            <path key={a.idx} d={a.d} fill="none" stroke={a.color} strokeWidth={hoverIdx === a.idx ? sw + 4 : sw}
              strokeLinecap="butt" style={{ transition: 'stroke-width 180ms', cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(a.idx)} onMouseLeave={() => setHoverIdx(null)} />
          ))}
          {centerLabel && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="wxb-pie-center">{centerLabel}</text>}
        </svg>
        <div className="wxb-pie-legend">
          {data.map((d, i) => (
            <div key={i} className={`wxb-pie-legend-item ${hoverIdx === i ? 'is-active' : ''}`}>
              <span className="wxb-pie-dot" style={{ background: d.color }} />
              <span className="wxb-pie-lbl">{d.label}</span>
              <span className="wxb-pie-pct">{((d.value / total) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
