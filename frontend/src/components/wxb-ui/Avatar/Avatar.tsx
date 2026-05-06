import React from 'react';
import './Avatar.css';

export interface WxbAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string;
  initials?: string;
  size?: number;
  color?: string;
}

export const WxbAvatar: React.FC<WxbAvatarProps> = ({
  src, initials, size = 36, color, className = '', style, ...props
}) => (
  <span className={`wxb-avatar ${className}`}
    style={{ width: size, height: size, fontSize: size * 0.4, ...(color ? { background: color } : {}), ...style }} {...props}>
    {src ? <img src={src} alt="" className="wxb-avatar-img" /> : (initials || '?')}
  </span>
);

export interface WxbAvatarGroupProps { children: React.ReactNode; max?: number; }
export const WxbAvatarGroup: React.FC<WxbAvatarGroupProps> = ({ children, max }) => {
  const items = React.Children.toArray(children);
  const shown = max ? items.slice(0, max) : items;
  const extra = max && items.length > max ? items.length - max : 0;
  return (
    <div className="wxb-avatar-group">
      {shown}
      {extra > 0 && <span className="wxb-avatar wxb-avatar-extra" style={{ width: 36, height: 36, fontSize: 14 }}>+{extra}</span>}
    </div>
  );
};
