import React from 'react';
import './Divider.css';

export interface WxbDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'horizontal' | 'vertical';
  label?: React.ReactNode;
}

export const WxbDivider: React.FC<WxbDividerProps> = ({
  direction = 'horizontal',
  label,
  className = '',
  ...props
}) => {
  if (direction === 'vertical') {
    return <span className={`wxb-divider-v ${className}`} {...props} />;
  }
  return (
    <div className={`wxb-divider ${label ? 'wxb-divider-with-text' : ''} ${className}`} {...props}>
      {label && <span className="wxb-divider-text">{label}</span>}
    </div>
  );
};
