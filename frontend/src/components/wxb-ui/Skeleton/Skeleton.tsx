import React from 'react';
import './Skeleton.css';

export interface WxbSkeletonProps { rows?: number; avatar?: boolean; active?: boolean; width?: string | number; className?: string; }

export const WxbSkeleton: React.FC<WxbSkeletonProps> = ({
  rows = 3, avatar = false, active = true, width, className = '',
}) => (
  <div className={`wxb-skeleton ${active ? 'wxb-skeleton-active' : ''} ${className}`} style={width ? { width } : undefined}>
    {avatar && <div className="wxb-skeleton-avatar" />}
    <div className="wxb-skeleton-content">
      <div className="wxb-skeleton-title" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="wxb-skeleton-line" style={{ width: i === rows - 1 ? '61%' : '100%' }} />
      ))}
    </div>
  </div>
);
