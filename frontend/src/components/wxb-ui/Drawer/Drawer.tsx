import React from 'react';
import { Drawer as AntdDrawer } from 'antd';
import type { DrawerProps as AntdDrawerProps } from 'antd';
import './Drawer.css';

export interface WxbDrawerProps extends AntdDrawerProps {}

export const WxbDrawer: React.FC<WxbDrawerProps> = ({ className = '', ...props }) => (
  <AntdDrawer className={`wxb-drawer ${className}`} {...props} />
);
