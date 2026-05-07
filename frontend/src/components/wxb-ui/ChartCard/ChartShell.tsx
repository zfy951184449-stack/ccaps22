/**
 * WxbChartShell
 *
 * Visual wrapper for chart cards — provides the WxbChartCard's
 * title/subtitle/legend/card chrome without coupling to the
 * internal SVG chart engine. Accepts any chart library's output
 * as children (e.g. @ant-design/plots).
 */

import React from 'react';
import './ChartShell.css';

export interface WxbChartLegendItem {
  label: string;
  color: string;
  dash?: boolean;  // dashed line swatch
}

export interface WxbChartShellProps {
  icon?: React.ReactNode;
  iconColor?: 'blue' | 'teal' | 'green' | 'purple' | 'orange';
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  legend?: WxbChartLegendItem[];
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const WxbChartShell: React.FC<WxbChartShellProps> = ({
  icon,
  iconColor = 'blue',
  title,
  subtitle,
  actions,
  legend,
  children,
  className = '',
  style
}) => (
  <div className={`wxb-chart-shell ${className}`} style={style}>
    {/* Header Row */}
    <div className="wxb-cs-header">
      <div className="wxb-cs-title-group">
        {icon && <div className={`wxb-cs-icon wxb-cs-icon--${iconColor}`}>{icon}</div>}
        <div>
          <h3 className="wxb-cs-title">{title}</h3>
          {subtitle && <div className="wxb-cs-sub">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="wxb-cs-actions">{actions}</div>}
    </div>

    {/* Legend Row */}
    {legend && legend.length > 0 && (
      <div className="wxb-cs-legend">
        {legend.map((item, i) => (
          <span key={i} className="wxb-cs-legend-item">
            <span
              className={`wxb-cs-swatch ${item.dash ? 'is-dash' : ''}`}
              style={item.dash ? undefined : { background: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
    )}

    {/* Chart Area */}
    <div className="wxb-cs-body">
      {children}
    </div>
  </div>
);
