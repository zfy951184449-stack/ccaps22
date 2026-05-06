import React from 'react';
import { DatePicker as AntdDatePicker } from 'antd';
import './DatePicker.css';

export type WxbDatePickerProps = React.ComponentProps<typeof AntdDatePicker> & { label?: string; error?: string; };

export const WxbDatePicker: React.FC<WxbDatePickerProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdDatePicker className={`wxb-datepicker ${error ? 'wxb-dp-error' : ''} ${className}`} popupClassName="wxb-datepicker-popup" {...(props as any)} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);

