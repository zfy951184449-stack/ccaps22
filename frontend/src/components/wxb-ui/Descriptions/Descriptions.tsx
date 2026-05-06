import React from 'react';
import './Descriptions.css';

export interface WxbDescItem { label: React.ReactNode; value: React.ReactNode; span?: number; }
export interface WxbDescriptionsProps { items: WxbDescItem[]; columns?: number; title?: React.ReactNode; bordered?: boolean; className?: string; }

export const WxbDescriptions: React.FC<WxbDescriptionsProps> = ({
  items, columns = 2, title, bordered = false, className = '',
}) => (
  <div className={`wxb-descriptions ${bordered ? 'wxb-desc-bordered' : ''} ${className}`}>
    {title && <div className="wxb-desc-title">{title}</div>}
    <div className="wxb-desc-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item, i) => (
        <div key={i} className="wxb-desc-item" style={item.span ? { gridColumn: `span ${item.span}` } : undefined}>
          <span className="wxb-desc-label">{item.label}</span>
          <span className="wxb-desc-value">{item.value}</span>
        </div>
      ))}
    </div>
  </div>
);
