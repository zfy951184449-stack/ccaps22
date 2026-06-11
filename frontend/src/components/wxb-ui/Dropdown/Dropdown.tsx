import React from 'react';
import { Dropdown as AntdDropdown } from 'antd';
import type { DropdownProps as AntdDropdownProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Dropdown.css';

export interface WxbDropdownProps extends AntdDropdownProps {}

export const WxbDropdown: React.FC<WxbDropdownProps> = ({
  overlayClassName = '',
  // 全屏下浮层就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <AntdDropdown overlayClassName={`wxb-dropdown ${overlayClassName}`} getPopupContainer={getPopupContainer} {...props} />
);
