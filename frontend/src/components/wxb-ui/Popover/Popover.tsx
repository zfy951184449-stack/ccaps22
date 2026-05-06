import React from 'react';
import { Popover as AntdPopover } from 'antd';
import type { PopoverProps as AntdPopoverProps } from 'antd';
import './Popover.css';

export interface WxbPopoverProps extends AntdPopoverProps {}

export const WxbPopover: React.FC<WxbPopoverProps> = ({ overlayClassName = '', ...props }) => (
  <AntdPopover overlayClassName={`wxb-popover ${overlayClassName}`} {...props} />
);
