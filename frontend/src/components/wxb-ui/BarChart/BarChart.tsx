import React, { useState } from 'react';
import './BarChart.css';

export interface WxbBarChartData { label: string; value: number; color?: string; }
export interface WxbBarChartProps { data: WxbBarChartData[]; height?: number; title?: string; unit?: string; className?: string; }

export const WxbBarChart: React.FC<WxbBarChartProps> = ({ data, height = 200, title, unit = '', className = '' }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const barWidth = Math.min(40, Math.max(16, 300 / data.length));
  const gap = Math.max(4, barWidth * 0.3);
  const svgW = data.length * (barWidth + gap) + 40;
  const svgH = height;
  const chartH = svgH - 32;

  return (
    <div className={`wxb-bar-chart ${className}`}>
      {title && <div className="wxb-bar-title">{title}</div>}
      <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = chartH - f * chartH + 4;
          return <line key={f} x1="32" y1={y} x2={svgW} y2={y} stroke="var(--wx-divider,#EEF2F7)" strokeWidth="1" />;
        })}
        {data.map((d, i) => {
          const bh = (d.value / max) * chartH;
          const x = 36 + i * (barWidth + gap);
          const y = chartH - bh + 4;
          return (
            <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
              <rect x={x} y={y} width={barWidth} height={bh} rx={3}
                fill={d.color || 'var(--wx-blue-500,#1F6FEB)'} opacity={hoverIdx === i ? 1 : 0.85}
                style={{ transition: 'all 180ms' }} />
              <text x={x + barWidth / 2} y={svgH - 4} textAnchor="middle" className="wxb-bar-label">{d.label}</text>
              {hoverIdx === i && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="wxb-bar-val">{d.value}{unit}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
