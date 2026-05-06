import React from 'react';
import './Alert.css';

export interface WxbAlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'warning' | 'error';
  title?: React.ReactNode;
}

export const WxbAlert: React.FC<WxbAlertProps> = ({
  variant = 'warning',
  title,
  children,
  className = '',
  ...props
}) => {
  const isWarning = variant === 'warning';
  
  return (
    <div className={`wxb-alert wxb-alert-${variant} ${className}`} {...props}>
      <span className="wxb-alert-icon">
        {isWarning ? '!' : '×'}
      </span>
      <div className="wxb-alert-content">
        {title && <div className="wxb-alert-title">{title}</div>}
        <div className="wxb-alert-body">{children}</div>
      </div>
    </div>
  );
};
