import React from 'react';
import { Popconfirm as AntdPopconfirm } from 'antd';
import type { PopconfirmProps as AntdPopconfirmProps } from 'antd';
import './Popconfirm.css';

export interface WxbPopconfirmProps extends AntdPopconfirmProps {}

export const WxbPopconfirm: React.FC<WxbPopconfirmProps> = ({ overlayClassName = '', ...props }) => (
  <AntdPopconfirm overlayClassName={`wxb-popconfirm ${overlayClassName}`} okText={props.okText || '确认'} cancelText={props.cancelText || '取消'} {...props} />
);
