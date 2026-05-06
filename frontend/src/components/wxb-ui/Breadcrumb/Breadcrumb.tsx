import React from 'react';
import './Breadcrumb.css';

export interface WxbBreadcrumbItem { label: React.ReactNode; href?: string; onClick?: () => void; }
export interface WxbBreadcrumbProps { items: WxbBreadcrumbItem[]; separator?: React.ReactNode; className?: string; }

export const WxbBreadcrumb: React.FC<WxbBreadcrumbProps> = ({ items, separator = '/', className = '' }) => (
  <nav className={`wxb-breadcrumb ${className}`}>
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="wxb-breadcrumb-sep">{separator}</span>}
        {i < items.length - 1 ? (
          <a className="wxb-breadcrumb-link" href={item.href || '#'} onClick={(e) => { if (item.onClick) { e.preventDefault(); item.onClick(); } }}>{item.label}</a>
        ) : (
          <span className="wxb-breadcrumb-current">{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);
