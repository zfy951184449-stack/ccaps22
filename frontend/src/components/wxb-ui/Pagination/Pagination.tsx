import React from 'react';
import './Pagination.css';

export interface WxbPaginationProps { current: number; total: number; pageSize?: number; onChange?: (page: number) => void; className?: string; }

export const WxbPagination: React.FC<WxbPaginationProps> = ({
  current, total, pageSize = 10, onChange, className = '',
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const getRange = () => {
    const delta = 2;
    const range: (number | string)[] = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || (i >= current - delta && i <= current + delta)) range.push(i);
      else if (range[range.length - 1] !== '...') range.push('...');
    }
    return range;
  };
  return (
    <nav className={`wxb-pagination ${className}`}>
      <button className="wxb-page-btn" disabled={current <= 1} onClick={() => onChange?.(current - 1)}>‹</button>
      {getRange().map((p, i) =>
        typeof p === 'number' ? (
          <button key={i} className={`wxb-page-btn ${p === current ? 'is-active' : ''}`} onClick={() => onChange?.(p)}>{p}</button>
        ) : (
          <span key={i} className="wxb-page-dots">···</span>
        )
      )}
      <button className="wxb-page-btn" disabled={current >= pages} onClick={() => onChange?.(current + 1)}>›</button>
    </nav>
  );
};
