import React, { useState, useMemo } from 'react';
import './AreaChart.css';

export interface WxbAreaChartData { label: string; value: number; }
export interface WxbAreaChartProps { data: WxbAreaChartData[]; height?: number; title?: string; color?: string; unit?: string; className?: string; }

export const WxbAreaChart: React.FC<WxbAreaChartProps> = ({
  data, height = 160, title, color = 'var(--wx-green-500,#2E9D6E)', unit = '', className = '',
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgW = 400, svgH = height, pad = { top: 8, right: 8, bottom: 24, left: 40 };
  const chartW = svgW - pad.left - pad.right, chartH = svgH - pad.top - pad.bottom;
  const max = useMemo(() => Math.max(...data.map(d => d.value), 1) * 1.1, [data]);

  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top + chartH - (d.value / max) * chartH,
    ...d,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`;
  const gradId = `wxb-area-grad-${React.useId().replace(/:/g, '')}`;

  return (
    <div className={`wxb-area-chart ${className}`}>
      {title && <div className="wxb-area-title">{title}</div>}
      <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => {
          const y = pad.top + chartH - f * chartH;
          return <line key={f} x1={pad.left} y1={y} x2={svgW - pad.right} y2={y} stroke="var(--wx-divider,#EEF2F7)" strokeWidth="1" />;
        })}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoverIdx(i)}>
            <rect x={p.x - chartW / data.length / 2} y={pad.top} width={chartW / data.length} height={chartH} fill="transparent" />
            {hoverIdx === i && (
              <>
                <line x1={p.x} y1={pad.top} x2={p.x} y2={pad.top + chartH} stroke="var(--wx-border-strong,#C7D1DD)" strokeDasharray="3 3" />
                <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#fff" strokeWidth="2" />
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="wxb-area-val">{p.value}{unit}</text>
              </>
            )}
            <text x={p.x} y={svgH - 4} textAnchor="middle" className="wxb-area-label">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};
