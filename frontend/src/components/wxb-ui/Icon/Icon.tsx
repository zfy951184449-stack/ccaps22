import React from 'react';
import { WxbIconsData, WxbIconName } from './icons';

export interface WxbIconProps extends React.SVGProps<SVGSVGElement> {
  name: WxbIconName;
  size?: number | string;
}

export const WxbIcon: React.FC<WxbIconProps> = ({ 
  name, 
  size = 24, 
  className = '', 
  ...props 
}) => {
  const iconContent = WxbIconsData[name];
  
  if (!iconContent) {
    console.warn(`[WxbIcon] Icon "${name}" not found in WxbIconsData.`);
    return null;
  }
  
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      className={`wxb-icon ${className}`} 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.55" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      {...props}
    >
      {iconContent}
    </svg>
  );
};
