import React from 'react';
import { DatePicker as AntdDatePicker } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './RangePicker.css';

const { RangePicker: AntdRangePicker } = AntdDatePicker;

export type WxbRangePickerProps = React.ComponentProps<typeof AntdRangePicker> & {
  label?: string;
  error?: string;
};

export const WxbRangePicker: React.FC<WxbRangePickerProps> = ({
  label,
  error,
  className = '',
  // 全屏下面板就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <div className="wxb-field">
    {label && <label className="wxb-label">{label}</label>}
    <AntdRangePicker
      className={`wxb-rangepicker ${error ? 'wxb-rp-error' : ''} ${className}`}
      popupClassName="wxb-datepicker-popup"
      getPopupContainer={getPopupContainer}
      {...(props as any)}
    />
    {error && <span className="wxb-help wxb-help-error">{error}</span>}
  </div>
);
