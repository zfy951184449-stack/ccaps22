import React from 'react';
import { WxbCard } from '../../../components/wxb-ui';
import { TriageKpis } from '../triageModel';

export type TriageFacet = 'vacancy' | 'night' | 'idle' | 'overload';

interface Props {
    kpis: TriageKpis;
    activeFacet: TriageFacet | null;
    onFacet: (facet: TriageFacet | null) => void;
}

/** 健康指标条:4 张可点筛选的 KPI 卡(点中=按该维度过滤工单流,再点取消)。 */
const CoverageStrip: React.FC<Props> = ({ kpis, activeFacet, onFacet }) => {
    const nightPct = kpis.nightRequired > 0 ? kpis.nightFilled / kpis.nightRequired : null;
    const nightFull = nightPct != null && nightPct >= 1;

    const card = (
        facet: TriageFacet,
        label: string,
        valueNode: React.ReactNode,
        extra?: React.ReactNode
    ) => {
        const active = activeFacet === facet;
        return (
            <button
                type="button"
                className={`rt-kpi ${active ? 'rt-kpi--active' : ''}`}
                aria-pressed={active}
                onClick={() => onFacet(active ? null : facet)}
            >
                <div className="rt-kpi-label">
                    {label}
                    <svg className="rt-ico" style={{ width: 13, height: 13, opacity: 0.6 }} viewBox="0 0 24 24" aria-hidden="true">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                </div>
                {valueNode}
                {extra}
            </button>
        );
    };

    return (
        <WxbCard className="rt-strip-card" style={{ padding: 0, border: 'none', background: 'transparent' }}>
            <div className="rt-strip">
                {card(
                    'vacancy',
                    '未覆盖人次',
                    <span className="rt-kpi-value rt-kpi-value--alarm">{kpis.uncoveredHeadcount}</span>
                )}
                {card(
                    'night',
                    '夜班覆盖',
                    nightPct == null
                        ? <span className="rt-kpi-value">—</span>
                        : <span className="rt-kpi-value">{kpis.nightFilled}<span className="rt-kpi-sub"> / {kpis.nightRequired}</span></span>,
                    nightPct != null && (
                        <div className="rt-gauge-bar">
                            <div
                                className="rt-gauge-fill"
                                style={{
                                    width: `${Math.round(Math.min(1, nightPct) * 100)}%`,
                                    background: nightFull ? 'var(--wx-green-500)' : 'var(--wx-red-500)'
                                }}
                            />
                        </div>
                    )
                )}
                {card(
                    'idle',
                    '待补派人力',
                    <span className={`rt-kpi-value ${kpis.idleWithDemand > 0 ? 'rt-kpi-value--warn' : ''}`}>{kpis.idleWithDemand}</span>
                )}
                {card(
                    'overload',
                    '超载',
                    <span className={`rt-kpi-value ${kpis.overloadCount > 0 ? 'rt-kpi-value--alarm' : ''}`}>{kpis.overloadCount}</span>
                )}
            </div>
        </WxbCard>
    );
};

export default CoverageStrip;
