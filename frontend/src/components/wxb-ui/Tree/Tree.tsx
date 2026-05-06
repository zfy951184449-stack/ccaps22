import React from 'react';
import { Tree as AntdTree } from 'antd';
import type { TreeProps as AntdTreeProps } from 'antd';
import './Tree.css';

export interface WxbTreeProps extends AntdTreeProps {}

export const WxbTree: React.FC<WxbTreeProps> = ({ className = '', ...props }) => (
  <AntdTree className={`wxb-tree ${className}`} {...props} />
);
