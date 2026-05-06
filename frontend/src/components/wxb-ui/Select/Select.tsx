import React from 'react';
import { Select as AntdSelect } from 'antd';
import type { SelectProps as AntdSelectProps } from 'antd';
import './Select.css';

export interface WxbSelectProps extends AntdSelectProps {
  label?: string;
  error?: string;
}

export const WxbSelect: React.FC<WxbSelectProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdSelect className={`wxb-select ${error ? 'wxb-select-error' : ''} ${className}`} popupClassName="wxb-select-popup" {...props} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
