import React from 'react';
import './KpiCard.css';

export interface WxbKpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendText?: string;
}

export const WxbKpiCard: React.FC<WxbKpiCardProps> = ({
  title,
  value,
  unit,
  trend = 'neutral',
  trendText,
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`wxb-kpi-card ${className}`} {...props}>
      <div>
        <div className="wxb-kpi-title">{title}</div>
        <div className="wxb-kpi-value-container">
          <span className="wxb-kpi-value">{value}</span>
          {unit && <span className="wxb-kpi-unit">{unit}</span>}
        </div>
        {trendText && (
          <div className={`wxb-kpi-trend trend-${trend}`}>
            {trend === 'up' && '▲ '}
            {trend === 'down' && '▼ '}
            {trendText}
          </div>
        )}
      </div>
      {children && (
        <div className="wxb-kpi-visual">
          {children}
        </div>
      )}
    </div>
  );
};
