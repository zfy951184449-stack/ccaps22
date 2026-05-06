import React from 'react';
import { TimePicker as AntdTimePicker } from 'antd';
import type { TimePickerProps as AntdTimePickerProps } from 'antd';
import './TimePicker.css';

export interface WxbTimePickerProps extends AntdTimePickerProps { label?: string; error?: string; }

export const WxbTimePicker: React.FC<WxbTimePickerProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdTimePicker className={`wxb-timepicker ${error ? 'wxb-tp-error' : ''} ${className}`} popupClassName="wxb-timepicker-popup" {...props} />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
