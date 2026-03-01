import React from 'react';
import { Typography } from 'antd';
import { fluentDesignTokens } from '../../styles/fluentDesignTokens';

const { Text, Title } = Typography;

interface StatsCardV4Props {
    title: string;
    value: number | string;
    icon?: React.ReactNode;
    color?: string; // Accent color for the icon or value
}

const StatsCardV4: React.FC<StatsCardV4Props> = ({ title, value, icon, color = fluentDesignTokens.colors.accent }) => {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: '200px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default',
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.05)';
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Text type="secondary" style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#666' }}>
                    {title}
                </Text>
                <Title level={3} style={{ margin: 0, fontWeight: 600, color: '#333' }}>
                    {value}
                </Title>
            </div>
            {icon && (
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: color ? `${color}15` : 'rgba(0,0,0,0.05)', // Light tint of the color
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: color,
                    fontSize: '24px',
                }}>
                    {icon}
                </div>
            )}
        </div>
    );
};

export default StatsCardV4;
