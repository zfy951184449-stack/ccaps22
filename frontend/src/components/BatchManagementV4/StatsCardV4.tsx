import React from 'react';
import { WxbIcon, WxbKpiCard } from '../wxb-ui';
import type { WxbIconName } from '../wxb-ui/Icon/icons';

interface StatsCardV4Props {
    title: string;
    value: number | string;
    iconName: WxbIconName;
    tone?: 'blue' | 'neutral' | 'success';
}

const StatsCardV4: React.FC<StatsCardV4Props> = ({
    title,
    value,
    iconName,
    tone = 'blue',
}) => {
    return (
        <WxbKpiCard title={title} value={value} className={`batch-stat-card batch-stat-card--${tone}`}>
            <span className="batch-stat-card__icon" aria-hidden="true">
                <WxbIcon name={iconName} size={22} />
            </span>
        </WxbKpiCard>
    );
};

export default StatsCardV4;
