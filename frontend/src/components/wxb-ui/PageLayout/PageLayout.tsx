import React from 'react';
import './PageLayout.css';

type WxbPageSize = 'default' | 'wide' | 'full';
type WxbPageGap = 'sm' | 'md' | 'lg';
type WxbSectionVariant = 'plain' | 'framed';
type WxbSectionDensity = 'comfortable' | 'compact';
type StyleWithVars = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

export interface WxbPageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: WxbPageSize;
  gap?: WxbPageGap;
  minHeight?: React.CSSProperties['minHeight'];
}

export const WxbPageShell: React.FC<WxbPageShellProps> = ({
  size = 'default',
  gap = 'md',
  minHeight,
  className = '',
  style,
  children,
  ...props
}) => {
  const shellStyle: StyleWithVars = {
    ...style,
    '--wxb-page-min-height': typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
  };

  return (
    <div
      className={`wxb-page-shell wxb-page-shell-${size} wxb-page-gap-${gap} ${className}`}
      style={shellStyle}
      {...props}
    >
      {children}
    </div>
  );
};

export interface WxbPageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export const WxbPageHeader: React.FC<WxbPageHeaderProps> = ({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = '',
  children,
  ...props
}) => {
  const titleId = React.useId();

  return (
    <header className={`wxb-page-header ${className}`} aria-labelledby={titleId} {...props}>
      <div className="wxb-page-header-main">
        {eyebrow && <div className="wxb-page-eyebrow">{eyebrow}</div>}
        <div className="wxb-page-title-row">
          <h1 id={titleId} className="wxb-page-title">
            {title}
          </h1>
          {meta && <div className="wxb-page-meta">{meta}</div>}
        </div>
        {description && <p className="wxb-page-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="wxb-page-header-actions">{actions}</div>}
    </header>
  );
};

export interface WxbPageToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode;
  filters?: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  stickyTop?: number | string;
}

export const WxbPageToolbar: React.FC<WxbPageToolbarProps> = ({
  leading,
  filters,
  summary,
  actions,
  sticky = false,
  stickyTop = 0,
  className = '',
  style,
  children,
  ...props
}) => {
  const toolbarStyle: StyleWithVars = {
    ...style,
    '--wxb-page-toolbar-top': typeof stickyTop === 'number' ? `${stickyTop}px` : stickyTop,
  };

  return (
    <div
      className={`wxb-page-toolbar ${sticky ? 'is-sticky' : ''} ${className}`}
      style={toolbarStyle}
      {...props}
    >
      <div className="wxb-page-toolbar-left">
        {leading && <div className="wxb-page-toolbar-leading">{leading}</div>}
        {filters && <div className="wxb-page-toolbar-filters">{filters}</div>}
        {children}
      </div>
      {(summary || actions) && (
        <div className="wxb-page-toolbar-right">
          {summary && <div className="wxb-page-toolbar-summary">{summary}</div>}
          {actions && <div className="wxb-page-toolbar-actions">{actions}</div>}
        </div>
      )}
    </div>
  );
};

export interface WxbPageSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: WxbSectionVariant;
  density?: WxbSectionDensity;
}

export const WxbPageSection: React.FC<WxbPageSectionProps> = ({
  title,
  description,
  actions,
  variant = 'plain',
  density = 'comfortable',
  className = '',
  children,
  ...props
}) => (
  <section
    className={`wxb-page-section wxb-page-section-${variant} wxb-page-section-${density} ${className}`}
    {...props}
  >
    {(title || description || actions) && (
      <div className="wxb-page-section-header">
        <div className="wxb-page-section-copy">
          {title && <h2 className="wxb-page-section-title">{title}</h2>}
          {description && <p className="wxb-page-section-description">{description}</p>}
        </div>
        {actions && <div className="wxb-page-section-actions">{actions}</div>}
      </div>
    )}
    <div className="wxb-page-section-body">{children}</div>
  </section>
);

export interface WxbPageGridProps extends React.HTMLAttributes<HTMLDivElement> {
  minItemWidth?: string;
  gap?: WxbPageGap;
  mode?: 'auto-fill' | 'auto-fit';
}

export const WxbPageGrid: React.FC<WxbPageGridProps> = ({
  minItemWidth = '320px',
  gap = 'md',
  mode = 'auto-fill',
  className = '',
  style,
  children,
  ...props
}) => {
  const gridStyle: StyleWithVars = {
    ...style,
    '--wxb-page-grid-min': minItemWidth,
    '--wxb-page-grid-mode': mode,
  };

  return (
    <div className={`wxb-page-grid wxb-page-grid-gap-${gap} ${className}`} style={gridStyle} {...props}>
      {children}
    </div>
  );
};
