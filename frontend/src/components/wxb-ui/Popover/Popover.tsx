import React from 'react';
import { Popover as AntdPopover } from 'antd';
import type { PopoverProps as AntdPopoverProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Popover.css';

export interface WxbPopoverProps extends AntdPopoverProps {}

export const WxbPopover: React.FC<WxbPopoverProps> = ({
  overlayClassName = '',
  // 全屏下浮层就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <AntdPopover overlayClassName={`wxb-popover ${overlayClassName}`} getPopupContainer={getPopupContainer} {...props} />
);
