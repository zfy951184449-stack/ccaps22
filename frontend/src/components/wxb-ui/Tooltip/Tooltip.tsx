import React from 'react';
import { Tooltip as AntdTooltip } from 'antd';
import './Tooltip.css';

export type WxbTooltipProps = React.ComponentProps<typeof AntdTooltip>;

export const WxbTooltip: React.FC<WxbTooltipProps> = ({ overlayClassName = '', ...props }) => (
  <AntdTooltip overlayClassName={`wxb-tooltip ${overlayClassName}`} {...(props as any)} />
);
