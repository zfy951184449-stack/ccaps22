import React from 'react';
import { TimePicker as AntdTimePicker } from 'antd';
import type { TimePickerProps as AntdTimePickerProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './TimePicker.css';

export interface WxbTimePickerProps extends AntdTimePickerProps { label?: string; error?: string; }

export const WxbTimePicker: React.FC<WxbTimePickerProps> = ({
  label,
  error,
  className = '',
  // 全屏下面板就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdTimePicker className={`wxb-timepicker ${error ? 'wxb-tp-error' : ''} ${className}`} popupClassName="wxb-timepicker-popup" getPopupContainer={getPopupContainer} {...props} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
