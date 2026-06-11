import React from 'react';
import { Drawer as AntdDrawer } from 'antd';
import type { DrawerProps as AntdDrawerProps } from 'antd';
import { resolvePortalContainer } from '../_internal/portalContainer';
import './Drawer.css';

export interface WxbDrawerProps extends AntdDrawerProps {}

export const WxbDrawer: React.FC<WxbDrawerProps> = ({
  className = '',
  // 默认挂进当前全屏元素(无全屏时为 document.body);调用方显式传则尊重其值。
  getContainer = resolvePortalContainer,
  ...props
}) => (
  <AntdDrawer className={`wxb-drawer ${className}`} getContainer={getContainer} {...props} />
);
