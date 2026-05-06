import React from 'react';
import './Input.css';

export interface WxbInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | boolean;
  helpText?: string;
}

export const WxbInput = React.forwardRef<HTMLInputElement, WxbInputProps>(
  ({ label, error, helpText, className = '', disabled, ...props }, ref) => {
    const isError = !!error;
    const inputClass = `wxb-input ${isError ? 'wxb-input-error' : ''} ${disabled ? 'wxb-input-disabled' : ''} ${className}`;

    const renderHelpText = () => {
      if (typeof error === 'string') {
        return <span className="wxb-help wxb-help-error">{error}</span>;
      }
      if (helpText) {
        return <span className="wxb-help">{helpText}</span>;
      }
      return null;
    };

    return (
      <div className="wxb-field">
        {label && <label className="wxb-label">{label}</label>}
        <input 
          ref={ref}
          className={inputClass} 
          disabled={disabled}
          {...props} 
        />
        {renderHelpText()}
      </div>
    );
  }
);

WxbInput.displayName = 'WxbInput';
