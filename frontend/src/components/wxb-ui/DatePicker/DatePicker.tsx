import React from 'react';
import { DatePicker as AntdDatePicker } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './DatePicker.css';

export type WxbDatePickerProps = React.ComponentProps<typeof AntdDatePicker> & { label?: string; error?: string; };

export const WxbDatePicker: React.FC<WxbDatePickerProps> = ({
  label,
  error,
  className = '',
  // 全屏下面板就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdDatePicker className={`wxb-datepicker ${error ? 'wxb-dp-error' : ''} ${className}`} popupClassName="wxb-datepicker-popup" getPopupContainer={getPopupContainer} {...(props as any)} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);

