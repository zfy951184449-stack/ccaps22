import React from 'react';
import './Table.css';

export const WxbTableWrapper: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`wxb-table-wrapper ${className}`} {...props}>
      <table className="wxb-table">
        {children}
      </table>
    </div>
  );
};
