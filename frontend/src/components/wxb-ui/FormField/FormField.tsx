import React from 'react';
import './FormField.css';

export interface WxbFormFieldProps { label?: React.ReactNode; required?: boolean; error?: string; helpText?: string; children: React.ReactNode; className?: string; layout?: 'vertical' | 'horizontal'; }

export const WxbFormField: React.FC<WxbFormFieldProps> = ({
  label, required, error, helpText, children, className = '', layout = 'vertical',
}) => (
  <div className={`wxb-form-field wxb-form-${layout} ${error ? 'has-error' : ''} ${className}`}>
    {label && <label className="wxb-form-label">{label}{required && <span className="wxb-form-req">*</span>}</label>}
    <div className="wxb-form-control">{children}</div>
    {error && <span className="wxb-form-error">{error}</span>}
    {!error && helpText && <span className="wxb-form-help">{helpText}</span>}
  </div>
);
