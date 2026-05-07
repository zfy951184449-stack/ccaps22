import React from 'react';
import { Cascader as AntdCascader } from 'antd';
import './Cascader.css';

// Use React.ComponentProps to correctly extract Antd Cascader props
export type WxbCascaderProps = React.ComponentProps<typeof AntdCascader> & {
  label?: string;
  error?: string;
};

export const WxbCascader: React.FC<WxbCascaderProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdCascader
      className={`wxb-cascader ${error ? 'wxb-cascader-error' : ''} ${className}`}
      popupClassName="wxb-cascader-popup"
      {...(props as any)}
    />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
