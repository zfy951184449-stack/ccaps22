import React from 'react';
import './SideNav.css';

export interface WxbSideNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
}

export interface WxbSideNavGroup {
  title: string;
  items: WxbSideNavItem[];
}

export interface WxbSideNavProps {
  siteType?: string;
  siteName?: string;
  statusText?: string;
  groups: WxbSideNavGroup[];
  activeId?: string;
  onItemClick?: (id: string) => void;
  capacity?: {
    label: string;
    value: string;
    percent: number;
    subLeft: string;
    subRight: string;
  };
}

export const WxbSideNav: React.FC<WxbSideNavProps> = ({
  siteType = 'Site',
  siteName = 'Wuxi MFG8 · GMP',
  statusText = 'Live',
  groups,
  activeId,
  onItemClick,
  capacity,
}) => {
  return (
    <div className="wxb-sidenav">
      <div className="wxb-sidenav-header">
        <div className="wxb-sidenav-h-eye">{siteType}</div>
        <div className="wxb-sidenav-h-name">{siteName}</div>
        <div className="wxb-sidenav-h-status"><span className="wxb-pulse"></span>{statusText}</div>
        <svg className="hex" width="64" height="64" viewBox="0 0 64 64">
          <polygon points="32,2 60,18 60,46 32,62 4,46 4,18" fill="none" stroke="#fff" strokeWidth="1"/>
          <polygon points="32,12 50,22 50,42 32,52 14,42 14,22" fill="none" stroke="#fff" strokeWidth="1" opacity="0.5"/>
        </svg>
      </div>

      {groups.map((group, i) => (
        <React.Fragment key={i}>
          <div className="wxb-sidenav-group">{group.title}</div>
          {group.items.map(item => (
            <div 
              key={item.id} 
              className={`wxb-sidenav-item ${activeId === item.id ? 'is-active' : ''}`}
              onClick={() => onItemClick?.(item.id)}
            >
              <span className="ic">{item.icon}</span>
              <span className="label">{item.label}</span>
              {item.badge != null && <span className="badge">{item.badge}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}

      {capacity && (
        <div className="wxb-sidenav-foot">
          <div className="wxb-sidenav-foot-h">
            <span className="l">{capacity.label}</span>
            <span className="v">{capacity.value}</span>
          </div>
          <div className="wxb-meter"><i style={{ width: `${capacity.percent}%` }}></i></div>
          <div className="wxb-sidenav-foot-sub">
            <span>{capacity.subLeft}</span>
            <span>{capacity.subRight}</span>
          </div>
        </div>
      )}
    </div>
  );
};
