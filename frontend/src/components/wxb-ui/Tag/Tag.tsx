import React from 'react';
import './Tag.css';

export type WxbTagColor = 'blue' | 'green' | 'amber' | 'red' | 'neutral' | 'cyan';

export interface WxbTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: WxbTagColor;
  closable?: boolean;
  onClose?: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
}

export const WxbTag: React.FC<WxbTagProps> = ({
  color = 'neutral',
  closable = false,
  onClose,
  icon,
  children,
  className = '',
  ...props
}) => (
  <span className={`wxb-tag wxb-tag-${color} ${className}`} {...props}>
    {icon && <span className="wxb-tag-icon">{icon}</span>}
    <span className="wxb-tag-text">{children}</span>
    {closable && (
      <span className="wxb-tag-close" onClick={(e) => { e.stopPropagation(); onClose?.(e); }}>×</span>
    )}
  </span>
);
