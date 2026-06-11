import React from 'react';
import { TreeSelect as AntdTreeSelect } from 'antd';
import type { TreeSelectProps as AntdTreeSelectProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './TreeSelect.css';

export interface WxbTreeSelectProps extends AntdTreeSelectProps {
  label?: string;
  error?: string;
}

export const WxbTreeSelect: React.FC<WxbTreeSelectProps> = ({
  label,
  error,
  className = '',
  popupClassName = '',
  // 全屏下下拉就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdTreeSelect
      className={`wxb-tree-select ${error ? 'wxb-tree-select-error' : ''} ${className}`}
      popupClassName={`wxb-tree-select-popup ${popupClassName}`}
      getPopupContainer={getPopupContainer}
      {...props}
    />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
