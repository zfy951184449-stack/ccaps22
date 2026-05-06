import React from 'react';
import './Progress.css';

export interface WxbProgressProps { percent: number; type?: 'line' | 'circle'; size?: number; showInfo?: boolean; status?: 'normal' | 'success' | 'warning' | 'error'; label?: React.ReactNode; className?: string; }

export const WxbProgress: React.FC<WxbProgressProps> = ({
  percent, type = 'line', size = 80, showInfo = true, status = 'normal', label, className = '',
}) => {
  const colors: Record<string, string> = { normal: 'var(--wx-blue-700,#0B3D7F)', success: 'var(--wx-green-500,#2E9D6E)', warning: 'var(--wx-amber-500,#E8B53C)', error: 'var(--wx-red-500,#D6493A)' };
  const color = colors[status];
  const p = Math.max(0, Math.min(100, percent));

  if (type === 'circle') {
    const r = (size - 6) / 2, c = 2 * Math.PI * r, offset = c - (p / 100) * c;
    return (
      <div className={`wxb-progress-circle ${className}`} style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--wx-surface-3,#EDF1F6)" strokeWidth="5" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 400ms cubic-bezier(0.2,0,0,1)' }} />
        </svg>
        {showInfo && <span className="wxb-progress-circle-text">{label || `${p}%`}</span>}
      </div>
    );
  }
  return (
    <div className={`wxb-progress-line ${className}`}>
      <div className="wxb-progress-track">
        <div className="wxb-progress-bar" style={{ width: `${p}%`, background: color }} />
      </div>
      {showInfo && <span className="wxb-progress-text">{label || `${p}%`}</span>}
    </div>
  );
};
