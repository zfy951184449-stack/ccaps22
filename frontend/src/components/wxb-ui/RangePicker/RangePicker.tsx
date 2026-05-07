import React from 'react';
import { DatePicker as AntdDatePicker } from 'antd';
import './RangePicker.css';

const { RangePicker: AntdRangePicker } = AntdDatePicker;

export type WxbRangePickerProps = React.ComponentProps<typeof AntdRangePicker> & {
  label?: string;
  error?: string;
};

export const WxbRangePicker: React.FC<WxbRangePickerProps> = ({ label, error, className = '', ...props }) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdRangePicker
      className={`wxb-rangepicker ${error ? 'wxb-rp-error' : ''} ${className}`}
      popupClassName="wxb-datepicker-popup"
      {...(props as any)}
    />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
