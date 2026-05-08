import React from 'react';
import './Button.css';

export interface WxbButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const WxbButton = React.forwardRef<HTMLButtonElement, WxbButtonProps>(({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}, ref) => {
  const baseClass = 'wxb-btn';
  const variantClass = `wxb-btn-${variant}`;
  const sizeClass = `wxb-btn-${size}`;

  return (
    <button
      ref={ref}
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

WxbButton.displayName = 'WxbButton';
