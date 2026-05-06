import React from 'react';
import './Collapse.css';

export interface WxbCollapseItem { key: string; label: React.ReactNode; children: React.ReactNode; }
export interface WxbCollapseProps { items: WxbCollapseItem[]; defaultActiveKeys?: string[]; accordion?: boolean; className?: string; }

export const WxbCollapse: React.FC<WxbCollapseProps> = ({
  items, defaultActiveKeys = [], accordion = false, className = '',
}) => {
  const [activeKeys, setActiveKeys] = React.useState<string[]>(defaultActiveKeys);
  const toggle = (key: string) => {
    setActiveKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      return accordion ? [key] : [...prev, key];
    });
  };
  return (
    <div className={`wxb-collapse ${className}`}>
      {items.map(item => {
        const open = activeKeys.includes(item.key);
        return (
          <div key={item.key} className={`wxb-collapse-item ${open ? 'is-open' : ''}`}>
            <div className="wxb-collapse-header" onClick={() => toggle(item.key)}>
              <span className="wxb-collapse-arrow">›</span>
              <span className="wxb-collapse-title">{item.label}</span>
            </div>
            <div className="wxb-collapse-body"><div className="wxb-collapse-content">{item.children}</div></div>
          </div>
        );
      })}
    </div>
  );
};
