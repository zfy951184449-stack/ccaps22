import React from 'react';
import './Gauge.css';

export interface WxbGaugeProps { percent: number; size?: number; title?: string; label?: React.ReactNode; color?: string; className?: string; }

export const WxbGauge: React.FC<WxbGaugeProps> = ({
  percent, size = 140, title, label, color = 'var(--wx-blue-700,#0B3D7F)', className = '',
}) => {
  const p = Math.max(0, Math.min(100, percent));
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const startAngle = 135, endAngle = 405, sweep = endAngle - startAngle;
  const arc = (sweep * p) / 100;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (from: number, to: number) => {
    const x1 = cx + r * Math.cos(toRad(from));
    const y1 = cy + r * Math.sin(toRad(from));
    const x2 = cx + r * Math.cos(toRad(to));
    const y2 = cy + r * Math.sin(toRad(to));
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className={`wxb-gauge ${className}`}>
      {title && <div className="wxb-gauge-title">{title}</div>}
      <svg width={size} height={size * 0.8} viewBox={`0 0 ${size} ${size * 0.85}`}>
        <path d={arcPath(startAngle, endAngle)} fill="none" stroke="var(--wx-surface-3,#EDF1F6)" strokeWidth={size * 0.08} strokeLinecap="round" />
        <path d={arcPath(startAngle, startAngle + arc)} fill="none" stroke={color} strokeWidth={size * 0.08} strokeLinecap="round"
          style={{ transition: 'all 500ms cubic-bezier(0.2,0,0,1)' }} />
        <text x={cx} y={cy + 4} textAnchor="middle" className="wxb-gauge-val">{p}%</text>
        {label && <text x={cx} y={cy + 20} textAnchor="middle" className="wxb-gauge-lbl">{label}</text>}
      </svg>
    </div>
  );
};
