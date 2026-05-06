import React from 'react';
import { InputNumber as AntdInputNumber } from 'antd';
import type { InputNumberProps as AntdInputNumberProps } from 'antd';
import './InputNumber.css';

export interface WxbInputNumberProps extends AntdInputNumberProps { label?: string; error?: string; }

export const WxbInputNumber: React.FC<WxbInputNumberProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdInputNumber className={`wxb-input-number ${error ? 'wxb-in-error' : ''} ${className}`} {...props} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
