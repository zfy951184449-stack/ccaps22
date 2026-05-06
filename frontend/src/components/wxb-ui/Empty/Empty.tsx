import React from 'react';
import './Empty.css';

export interface WxbEmptyProps { description?: React.ReactNode; image?: React.ReactNode; action?: React.ReactNode; className?: string; }

export const WxbEmpty: React.FC<WxbEmptyProps> = ({
  description = '暂无数据', image, action, className = '',
}) => (
  <div className={`wxb-empty ${className}`}>
    {image || (
      <svg className="wxb-empty-img" width="80" height="60" viewBox="0 0 80 60" fill="none">
        <rect x="16" y="10" width="48" height="36" rx="4" stroke="var(--wx-border-strong,#C7D1DD)" strokeWidth="1.5" strokeDasharray="3 3"/>
        <path d="M30 30l8-6 12 10" stroke="var(--wx-fg-4,#8898A8)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="32" cy="22" r="3" stroke="var(--wx-fg-4,#8898A8)" strokeWidth="1.2"/>
      </svg>
    )}
    <div className="wxb-empty-desc">{description}</div>
    {action && <div className="wxb-empty-action">{action}</div>}
  </div>
);
