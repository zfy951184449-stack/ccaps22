import React from 'react';
import './Sparkline.css';

export interface WxbSparklineProps { data: number[]; width?: number; height?: number; color?: string; showDot?: boolean; className?: string; }

export const WxbSparkline: React.FC<WxbSparklineProps> = ({
  data, width = 80, height = 24, color = 'var(--wx-blue-500,#1F6FEB)', showDot = true, className = '',
}) => {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - 2 - ((v - min) / range) * (height - 4),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg className={`wxb-sparkline ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {showDot && <circle cx={last.x} cy={last.y} r={2.5} fill={color} />}
    </svg>
  );
};
