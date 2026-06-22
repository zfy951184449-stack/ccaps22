import React from 'react';
import { WxbCard } from '../../../components/wxb-ui';

/** 班次配色图例(排班日历 / 我的排班共用)。 */
const ShiftLegend: React.FC = () => (
    <WxbCard className="rc-legend-card">
        <div className="rc-legend-title">班次图例</div>
        <div className="rc-legend-list">
            <div className="rc-legend-item"><span className="rc-legend-swatch rc-shift--day" />白班(标准日班)</div>
            <div className="rc-legend-item"><span className="rc-legend-swatch rc-shift--night" />夜班</div>
            <div className="rc-legend-item"><span className="rc-legend-swatch rc-shift--long" />长白班</div>
            <div className="rc-legend-item"><span className="rc-legend-swatch rc-shift--leave" />请假</div>
            <div className="rc-legend-item"><span className="rc-legend-swatch rc-shift--rest" />休息</div>
        </div>
    </WxbCard>
);

export default ShiftLegend;
