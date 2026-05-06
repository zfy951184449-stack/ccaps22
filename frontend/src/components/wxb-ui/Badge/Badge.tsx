import React from 'react';
import './Badge.css';

export type BadgeStatus = 'success' | 'info' | 'warning' | 'error' | 'neutral';
export type BadgeType = 'code' | 'bar' | 'tracked' | 'outline';

export interface WxbBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
  variant?: BadgeType;
  label: string;
  code?: string; // Only used when variant is 'outline'
}

export const WxbBadge: React.FC<WxbBadgeProps> = ({ 
  status = 'neutral', 
  variant = 'bar', 
  label, 
  code,
  className = '', 
  ...props 
}) => {
  const baseClass = `wxb-badge-${variant}`;
  const statusClass = `status-${status}`;
  const combinedClass = `${baseClass} ${statusClass} ${className}`;

  if (variant === 'code') {
    return (
      <span className={combinedClass} {...props}>
        <span className="br">[</span><span className="lbl">{label}</span><span className="br">]</span>
      </span>
    );
  }

  if (variant === 'outline') {
    return (
      <span className={combinedClass} {...props}>
        {code && <span className="k">{code}</span>}
        <span className="v">{label}</span>
      </span>
    );
  }

  // tracked and bar variants just render the text
  return (
    <span className={combinedClass} {...props}>
      {label}
    </span>
  );
};
