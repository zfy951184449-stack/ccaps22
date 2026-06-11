import React from 'react';
import { Tooltip as AntdTooltip } from 'antd';
import { resolvePopupContainer } from '../_internal/portalContainer';
import './Tooltip.css';

export type WxbTooltipProps = React.ComponentProps<typeof AntdTooltip>;

export const WxbTooltip: React.FC<WxbTooltipProps> = ({
  overlayClassName = '',
  // 全屏下浮层就近渲染到触发器内;非全屏保持 antd 默认(body)。
  getPopupContainer = resolvePopupContainer,
  ...props
}) => (
  <AntdTooltip overlayClassName={`wxb-tooltip ${overlayClassName}`} getPopupContainer={getPopupContainer} {...(props as any)} />
);
