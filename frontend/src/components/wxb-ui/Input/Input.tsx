import React from 'react';
import './Input.css';

export interface WxbInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string | boolean;
  helpText?: string;
  prefix?: React.ReactNode;
}

export const WxbInput = React.forwardRef<HTMLInputElement, WxbInputProps>(
  ({ label, error, helpText, className = '', disabled, prefix, ...props }, ref) => {
    const isError = !!error;
    const inputClass = `wxb-input ${isError ? 'wxb-input-error' : ''} ${disabled ? 'wxb-input-disabled' : ''} ${className}`;
    const controlClass = `wxb-input-control ${isError ? 'wxb-input-control-error' : ''} ${disabled ? 'wxb-input-control-disabled' : ''}`;

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
        {prefix ? (
          <div className={controlClass}>
            <span className="wxb-input-prefix">{prefix}</span>
            <input
              ref={ref}
              className={inputClass}
              disabled={disabled}
              {...props}
            />
          </div>
        ) : (
          <input
            ref={ref}
            className={inputClass}
            disabled={disabled}
            {...props}
          />
        )}
        {renderHelpText()}
      </div>
    );
  }
);

WxbInput.displayName = 'WxbInput';
