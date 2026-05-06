import React from 'react';

export interface WxbCardProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export const WxbCard: React.FC<WxbCardProps> = ({ 
  className = '', 
  children, 
  noPadding = false,
  style,
  ...props 
}) => {
  const baseStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid var(--wx-border, #E4EAF1)',
    borderRadius: '8px',
    boxShadow: 'var(--wx-sh-1, 0 1px 2px rgba(15, 27, 45, 0.04))',
    padding: noPadding ? '0' : '20px 24px',
    boxSizing: 'border-box',
    ...style
  };

  return (
    <div style={baseStyle} className={`wxb-card ${className}`} {...props}>
      {children}
    </div>
  );
};
