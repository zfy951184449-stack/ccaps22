import React from 'react';
import { Cascader as AntdCascader } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Cascader.css';

// Use React.ComponentProps to correctly extract Antd Cascader props
export type WxbCascaderProps = React.ComponentProps<typeof AntdCascader> & {
  label?: string;
  error?: string;
};

export const WxbCascader: React.FC<WxbCascaderProps> = ({
  label,
  error,
  className = '',
  // 全屏下下拉就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdCascader
      className={`wxb-cascader ${error ? 'wxb-cascader-error' : ''} ${className}`}
      popupClassName="wxb-cascader-popup"
      getPopupContainer={getPopupContainer}
      {...(props as any)}
    />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
