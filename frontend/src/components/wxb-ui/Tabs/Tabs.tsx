import React from 'react';
import './Tabs.css';

export interface WxbTabItem { key: string; label: React.ReactNode; children?: React.ReactNode; disabled?: boolean; }
export interface WxbTabsProps { items: WxbTabItem[]; activeKey?: string; defaultActiveKey?: string; onChange?: (key: string) => void; className?: string; }

export const WxbTabs: React.FC<WxbTabsProps> = ({
  items, activeKey: controlledKey, defaultActiveKey, onChange, className = '',
}) => {
  const [internal, setInternal] = React.useState(defaultActiveKey || items[0]?.key || '');
  const isControlled = controlledKey !== undefined;
  const current = isControlled ? controlledKey : internal;
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const [inkStyle, setInkStyle] = React.useState({ left: 0, width: 0 });

  React.useEffect(() => {
    if (tabsRef.current) {
      const el = tabsRef.current.querySelector('.wxb-tab-btn.is-active') as HTMLElement;
      if (el) setInkStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [current]);

  const handleClick = (key: string, disabled?: boolean) => {
    if (disabled) return;
    if (!isControlled) setInternal(key);
    onChange?.(key);
  };

  const activePanel = items.find(i => i.key === current);

  return (
    <div className={`wxb-tabs ${className}`}>
      <div className="wxb-tabs-nav" ref={tabsRef}>
        {items.map(item => (
          <button key={item.key} type="button"
            className={`wxb-tab-btn ${current === item.key ? 'is-active' : ''} ${item.disabled ? 'is-disabled' : ''}`}
            onClick={() => handleClick(item.key, item.disabled)}>
            {item.label}
          </button>
        ))}
        <span className="wxb-tabs-ink" style={{ left: inkStyle.left, width: inkStyle.width }} />
      </div>
      {activePanel?.children && <div className="wxb-tabs-panel">{activePanel.children}</div>}
    </div>
  );
};
