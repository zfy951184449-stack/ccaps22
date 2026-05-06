import React from 'react';
import './Spinner.css';

export interface WxbSpinnerProps { size?: number; tip?: string; className?: string; }

export const WxbSpinner: React.FC<WxbSpinnerProps> = ({ size = 32, tip, className = '' }) => (
  <div className={`wxb-spinner ${className}`}>
    <svg className="wxb-spinner-svg" width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--wx-surface-3,#EDF1F6)" strokeWidth="3"/>
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--wx-blue-700,#0B3D7F)" strokeWidth="3"
        strokeDasharray="80 20" strokeLinecap="round" className="wxb-spinner-arc"/>
    </svg>
    {tip && <span className="wxb-spinner-tip">{tip}</span>}
  </div>
);
