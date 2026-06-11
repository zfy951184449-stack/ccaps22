import React from 'react';
import { Popconfirm as AntdPopconfirm } from 'antd';
import type { PopconfirmProps as AntdPopconfirmProps } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Popconfirm.css';

export interface WxbPopconfirmProps extends AntdPopconfirmProps {}

export const WxbPopconfirm: React.FC<WxbPopconfirmProps> = ({
  overlayClassName = '',
  // 全屏下气泡就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <AntdPopconfirm overlayClassName={`wxb-popconfirm ${overlayClassName}`} okText={props.okText || '确认'} cancelText={props.cancelText || '取消'} getPopupContainer={getPopupContainer} {...props} />
);
