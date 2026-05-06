import React from 'react';
import { Dropdown as AntdDropdown } from 'antd';
import type { DropdownProps as AntdDropdownProps } from 'antd';
import './Dropdown.css';

export interface WxbDropdownProps extends AntdDropdownProps {}

export const WxbDropdown: React.FC<WxbDropdownProps> = ({ overlayClassName = '', ...props }) => (
  <AntdDropdown overlayClassName={`wxb-dropdown ${overlayClassName}`} {...props} />
);
