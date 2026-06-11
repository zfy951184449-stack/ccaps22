import React from 'react';
import { Select as AntdSelect } from 'antd';
import type { SelectProps as AntdSelectProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Select.css';

export interface WxbSelectProps extends AntdSelectProps {
  label?: string;
  error?: string;
}

export const WxbSelect: React.FC<WxbSelectProps> = ({
  label,
  error,
  className = '',
  // 全屏下下拉就近渲染到触发器内,避免 portal 到 body 跑出全屏;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdSelect className={`wxb-select ${error ? 'wxb-select-error' : ''} ${className}`} popupClassName="wxb-select-popup" getPopupContainer={getPopupContainer} {...props} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
