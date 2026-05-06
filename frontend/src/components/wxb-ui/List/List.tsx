import React from 'react';
import './List.css';

export interface WxbListProps<T = any> { header?: React.ReactNode; footer?: React.ReactNode; dataSource: T[]; renderItem: (item: T, index: number) => React.ReactNode; bordered?: boolean; className?: string; }

export function WxbList<T>({ header, footer, dataSource, renderItem, bordered = true, className = '' }: WxbListProps<T>) {
  return (
    <div className={`wxb-list ${bordered ? 'wxb-list-bordered' : ''} ${className}`}>
      {header && <div className="wxb-list-header">{header}</div>}
      <div className="wxb-list-body">
        {dataSource.map((item, i) => (
          <div key={i} className="wxb-list-item">{renderItem(item, i)}</div>
        ))}
        {dataSource.length === 0 && <div className="wxb-list-empty">暂无数据</div>}
      </div>
      {footer && <div className="wxb-list-footer">{footer}</div>}
    </div>
  );
}
