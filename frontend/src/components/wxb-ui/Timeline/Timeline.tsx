import React from 'react';
import './Timeline.css';

export interface WxbTimelineItem { label: React.ReactNode; time?: string; color?: 'blue' | 'green' | 'amber' | 'red' | 'neutral'; dot?: React.ReactNode; }
export interface WxbTimelineProps { items: WxbTimelineItem[]; className?: string; }

export const WxbTimeline: React.FC<WxbTimelineProps> = ({ items, className = '' }) => (
  <div className={`wxb-timeline ${className}`}>
    {items.map((item, i) => (
      <div key={i} className={`wxb-timeline-item wxb-tl-${item.color || 'blue'}`}>
        <div className="wxb-tl-tail" />
        <div className="wxb-tl-dot">{item.dot || <span className="wxb-tl-dot-inner" />}</div>
        <div className="wxb-tl-content">
          <div className="wxb-tl-label">{item.label}</div>
          {item.time && <div className="wxb-tl-time">{item.time}</div>}
        </div>
      </div>
    ))}
  </div>
);
