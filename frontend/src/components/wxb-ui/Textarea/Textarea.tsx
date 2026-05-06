import React from 'react';
import './Textarea.css';

export interface WxbTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | boolean;
  helpText?: string;
}

export const WxbTextarea = React.forwardRef<HTMLTextAreaElement, WxbTextareaProps>(
  ({ label, error, helpText, className = '', disabled, ...props }, ref) => {
    const isError = !!error;
    const cls = `wxb-textarea ${isError ? 'wxb-textarea-error' : ''} ${disabled ? 'wxb-textarea-disabled' : ''} ${className}`;
    return (
      <div className="wxb-field">
        {label && <label className="wxb-label">{label}</label>}
        <textarea ref={ref} className={cls} disabled={disabled} rows={4} {...props} />
        {typeof error === 'string' && <span className="wxb-help wxb-help-error">{error}</span>}
        {!error && helpText && <span className="wxb-help">{helpText}</span>}
      </div>
    );
  }
);
WxbTextarea.displayName = 'WxbTextarea';
