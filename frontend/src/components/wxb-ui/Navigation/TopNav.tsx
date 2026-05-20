import React, { useRef, MouseEvent, useEffect, useState } from 'react';
import './TopNav.css';

export interface WxbTopNavLink {
  id: string;
  label: string;
  icon: React.ReactNode;
  animClass?: 'anim-spin' | 'anim-cube' | 'anim-shield' | 'anim-compass';
}

export interface WxbTopNavProps {
  appNameMain?: string;
  appNameSub?: string;
  links: WxbTopNavLink[];
  activeId?: string;
  onLinkClick?: (id: string) => void;
  onSearchSubmit?: (val: string) => void;
  envText?: string;
  avatarInitials?: string;
}

export const WxbTopNav: React.FC<WxbTopNavProps> = ({
  appNameMain = 'WuXi Biologics',
  appNameSub = '药明生物',
  links,
  activeId,
  onLinkClick,
  onSearchSubmit,
  envText = 'GMP · Wuxi MFG8',
  avatarInitials = 'LZ'
}) => {
  const navRef = useRef<HTMLElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  const movePill = (node: HTMLElement | null) => {
    if (!node || !linksRef.current) return;
    const r = node.getBoundingClientRect();
    const pr = linksRef.current.getBoundingClientRect();
    setPillStyle({ left: r.left - pr.left, width: r.width });
  };

  useEffect(() => {
    // Initial pill placement
    if (linksRef.current) {
      const activeNode = linksRef.current.querySelector('.is-on') as HTMLElement;
      if (activeNode) movePill(activeNode);
    }
  }, [activeId]);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!navRef.current) return;
    const r = navRef.current.getBoundingClientRect();
    navRef.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
    navRef.current.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <nav className="wxb-topnav-kit" ref={navRef} onMouseMove={handleMouseMove}>
      <div className="wxb-topnav-kit-logo">
        <span className="wxb-topnav-kit-markwrap">
          <svg className="hex" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/>
            <circle cx="12" cy="12" r="2.4" fill="currentColor"/>
          </svg>
        </span>
        <span className="name">
          <span className="nameMain">{appNameMain}</span>
          <span className="nameSub">{appNameSub}</span>
        </span>
      </div>

      <div 
        className="wxb-topnav-kit-links" 
        ref={linksRef}
        onMouseLeave={() => {
          const activeNode = linksRef.current?.querySelector('.is-on') as HTMLElement;
          if (activeNode) movePill(activeNode);
        }}
      >
        <span className="wxb-topnav-kit-pill" style={{ left: pillStyle.left, width: pillStyle.width }}></span>
        
        {links.map((lk) => (
          <span 
            key={lk.id}
            className={`wxb-topnav-kit-lk ${activeId === lk.id ? 'is-on' : ''}`}
            onClick={() => onLinkClick?.(lk.id)}
            onMouseEnter={(e) => movePill(e.currentTarget)}
          >
            <span className={`ic ${lk.animClass || ''}`}>
              {lk.icon}
            </span>
            <span className="label">{lk.label}</span>
          </span>
        ))}
      </div>

      <div className="wxb-topnav-kit-spacer"></div>

      <div className="wxb-topnav-kit-right">
        <div className="wxb-topnav-kit-search">
          <input 
            placeholder="Search..." 
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit?.(e.currentTarget.value);
            }}
          />
          <svg className="lens" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.3-4.3"/>
          </svg>
          <span className="kbd">⌘K</span>
        </div>

        <span className="wxb-topnav-kit-env">
          <span className="led"></span>
          <svg className="ekg" viewBox="0 0 36 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0 7 H7 L9 3 L11 11 L13 5 L15 9 L17 7 H36"/>
          </svg>
          {envText}
        </span>

        <span className="wxb-topnav-kit-iconbtn" title="Notifications">
          <svg className="bell" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 003.4 0"/>
          </svg>
          <span className="dotn"></span>
        </span>

        <span className="wxb-topnav-kit-ava">{avatarInitials}<span className="pres"></span></span>
      </div>
    </nav>
  );
};
