import React from 'react';
import './Button.css';

export interface WxbButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const WxbButton: React.FC<WxbButtonProps> = ({ 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  children, 
  ...props 
}) => {
  const baseClass = 'wxb-btn';
  const variantClass = `wxb-btn-${variant}`;
  const sizeClass = `wxb-btn-${size}`;

  return (
    <button 
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
