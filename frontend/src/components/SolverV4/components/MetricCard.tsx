import React from 'react';
import '../SolverV4.css';

interface MetricCardProps {
    label: string;
    value: string | number;
    suffix?: string;
    icon?: React.ReactNode;
    color?: 'success' | 'warning' | 'error' | 'info' | 'default';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, suffix, icon, color = 'default' }) => {
    const getColorStyle = () => {
        switch (color) {
            case 'success': return { color: 'var(--v4-color-success)' };
            case 'warning': return { color: 'var(--v4-color-warning)' };
            case 'error': return { color: 'var(--v4-color-error)' };
            case 'info': return { color: 'var(--v4-color-info)' };
            default: return { color: 'var(--v4-text-primary)' };
        }
    };

    return (
        <div className="v4-metric-card">
            <div className="v4-metric-label">{label}</div>
            <div className="v4-metric-value" style={getColorStyle()}>
                {icon && <span className="v4-metric-icon">{icon}</span>}
                <span>{value}</span>
                {suffix && <span style={{ fontSize: 'var(--v4-font-size-lg)', fontWeight: 400 }}>{suffix}</span>}
            </div>
        </div>
    );
};

export default MetricCard;
