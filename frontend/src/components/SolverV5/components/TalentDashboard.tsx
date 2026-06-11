import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spin, Tooltip, Empty } from 'antd';
import { WarningOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

/* ═══════════════════════════════════════════════════════
   Types — mirrors backend QualificationShortageMonitoringResponse
   ═══════════════════════════════════════════════════════ */

interface ShortageSummary {
    mode: string;
    year_month: string | null;
    shortage_count: number;
    high_risk_coverable_count: number;
    total_demand_hours: number;
    average_risk_score: number;
    max_risk_score: number;
    max_peak_gap: number;
}

interface RiskItem {
    qualification_id: number;
    qualification_name: string;
    required_level: number;
    qualified_employee_count: number;
    demand_hours: number;
    demand_person_instances: number;
    peak_required_people: number;
    peak_gap_people: number;
    gap_rate: number;
    risk_score: number;
    coverage_fragility: number;
}

interface HeatmapCell {
    qualification_id: number;
    qualification_name: string;
    qualification_rank: number;
    required_level: number;
    risk_score: number | null;
    peak_gap_people: number | null;
    demand_hours: number | null;
}

interface TrendPoint {
    year_month: string;
    label: string;
    shortage_count: number;
    average_risk_score: number;
    max_risk_score: number;
    total_demand_hours: number;
}

interface MonitoringResponse {
    summary: ShortageSummary;
    ranking: RiskItem[];
    heatmap: HeatmapCell[];
    trend: TrendPoint[];
}

/* ═══════════════════════════════════════════════════════
   Heatmap Color Engine — continuous color scale
   ═══════════════════════════════════════════════════════ */

/** Returns HSL background color for heatmap cell.
 *  0 = deep green, 50 = yellow, 100 = deep red.
 *  null = neutral gray */
function heatBg(score: number | null): string {
    if (score === null) return '#f3f4f6';
    const clamped = Math.min(100, Math.max(0, score));
    // Hue: 120 (green) → 60 (yellow) → 0 (red)
    const hue = 120 - (clamped / 100) * 120;
    // Saturation: higher for extreme values
    const sat = 45 + (Math.abs(clamped - 50) / 50) * 35;
    // Lightness: darker for higher scores
    const light = 92 - (clamped / 100) * 32;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function heatText(score: number | null): string {
    if (score === null) return '#d1d5db';
    const clamped = Math.min(100, Math.max(0, score));
    const hue = 120 - (clamped / 100) * 120;
    const light = 35 - (clamped / 100) * 12;
    return `hsl(${hue}, 70%, ${light}%)`;
}

function riskLabel(score: number | null): string {
    if (score === null) return '';
    if (score >= 70) return '高危';
    if (score >= 50) return '预警';
    if (score >= 30) return '关注';
    if (score >= 10) return '低风险';
    return '正常';
}

function levelBadge(level: number): string {
    if (level >= 3) return 'L3+';
    return `L${level}`;
}

/* ═══════════════════════════════════════════════════════
   TalentDashboard Component — v2
   ═══════════════════════════════════════════════════════ */

const CELL_SIZE = 48;

const TalentDashboard: React.FC = () => {
    const [data, setData] = useState<MonitoringResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/qualifications/shortages/monitoring', {
                params: { mode: 'current_month', months: 6 },
            });
            setData(res.data);
        } catch (err) {
            console.error('Failed to fetch talent data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Group heatmap by qualification
    const heatmapByQual = useMemo(() => {
        if (!data?.heatmap) return [];
        const map = new Map<number, { name: string; rank: number; levels: Map<number, HeatmapCell> }>();
        data.heatmap.forEach(cell => {
            if (!map.has(cell.qualification_id)) {
                map.set(cell.qualification_id, { name: cell.qualification_name, rank: cell.qualification_rank, levels: new Map() });
            }
            map.get(cell.qualification_id)!.levels.set(cell.required_level, cell);
        });
        return Array.from(map.entries())
            .sort(([, a], [, b]) => a.rank - b.rank)
            .map(([id, val]) => ({ id, ...val }));
    }, [data?.heatmap]);

    // Distinct levels (only those with data)
    const activeLevels = useMemo(() => {
        if (!data?.heatmap) return [1, 2, 3];
        const levels = new Set<number>();
        data.heatmap.forEach(c => {
            if (c.risk_score !== null) levels.add(c.required_level);
        });
        const result = Array.from(levels).sort((a, b) => a - b);
        return result.length > 0 ? result : [1, 2, 3];
    }, [data?.heatmap]);

    // Sort ranking: gap>0 first, then by risk_score
    const sortedRanking = useMemo(() => {
        if (!data?.ranking) return [];
        return [...data.ranking].sort((a, b) => {
            const aHasGap = a.peak_gap_people > 0 ? 1 : 0;
            const bHasGap = b.peak_gap_people > 0 ? 1 : 0;
            if (bHasGap !== aHasGap) return bHasGap - aHasGap;
            return b.risk_score - a.risk_score;
        });
    }, [data?.ranking]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                <Spin size="large" tip="加载人才供需数据..." />
            </div>
        );
    }

    if (!data) {
        return <Empty description="暂无数据" style={{ marginTop: 80 }} />;
    }

    const { summary, trend } = data;

    return (
        <div style={{ padding: '0 4px' }}>
            {/* ── HERO KPI Row ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
                marginBottom: 24,
            }}>
                <KpiCard
                    label="紧缺资质数"
                    value={summary.shortage_count}
                    suffix=""
                    gradient={summary.shortage_count > 0 ? ['#fef2f2', '#fee2e2'] : ['#f0fdf4', '#dcfce7']}
                    border={summary.shortage_count > 0 ? '#fecaca' : '#bbf7d0'}
                    color={summary.shortage_count > 0 ? '#dc2626' : '#16a34a'}
                    sub={summary.high_risk_coverable_count > 0 ? `${summary.high_risk_coverable_count} 项高危但可覆盖` : undefined}
                />
                <KpiCard
                    label="最大峰值缺口"
                    value={summary.max_peak_gap}
                    suffix="人"
                    gradient={['#fff7ed', '#ffedd5']}
                    border="#fed7aa"
                    color="#ea580c"
                />
                <KpiCard
                    label="最高风险分"
                    value={summary.max_risk_score}
                    suffix="/100"
                    gradient={['#fefce8', '#fef9c3']}
                    border="#fde68a"
                    color="#ca8a04"
                />
                <KpiCard
                    label="总需求工时"
                    value={summary.total_demand_hours > 1000 ? `${(summary.total_demand_hours / 1000).toFixed(1)}k` : summary.total_demand_hours}
                    suffix="h"
                    gradient={['#eff6ff', '#dbeafe']}
                    border="#bfdbfe"
                    color="#2563eb"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 24 }}>
                {/* ── Heatmap Matrix (Qualification × Level) — Color Block Style ── */}
                <div style={{
                    background: 'white',
                    borderRadius: 16,
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                            资质供需热力图
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#9ca3af' }}>
                            <span>低风险</span>
                            <div style={{ display: 'flex', gap: 1 }}>
                                {[0, 15, 30, 50, 70, 90].map(s => (
                                    <div key={s} style={{ width: 14, height: 10, borderRadius: 2, background: heatBg(s) }} />
                                ))}
                            </div>
                            <span>高危</span>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', padding: '0 0 8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th style={{
                                        textAlign: 'left',
                                        padding: '8px 16px',
                                        fontWeight: 600,
                                        color: '#9ca3af',
                                        fontSize: 11,
                                        minWidth: 180,
                                        borderBottom: '1px solid #f3f4f6',
                                        position: 'sticky',
                                        left: 0,
                                        background: 'white',
                                        zIndex: 1,
                                    }}>
                                        资质
                                    </th>
                                    {activeLevels.map(level => (
                                        <th key={level} style={{
                                            textAlign: 'center',
                                            padding: '8px 4px',
                                            fontWeight: 600,
                                            color: '#9ca3af',
                                            fontSize: 11,
                                            width: CELL_SIZE + 16,
                                            borderBottom: '1px solid #f3f4f6',
                                        }}>
                                            {levelBadge(level)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {heatmapByQual.map(qual => {
                                    const allScores = activeLevels.map(l => qual.levels.get(l)?.risk_score).filter((s): s is number => s !== null);
                                    const maxScore = allScores.length > 0 ? Math.max(...allScores) : null;

                                    return (
                                        <tr key={qual.id}>
                                            <td style={{
                                                padding: '4px 16px',
                                                fontWeight: 500,
                                                color: '#374151',
                                                fontSize: 12,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: 200,
                                                position: 'sticky',
                                                left: 0,
                                                background: 'white',
                                                zIndex: 1,
                                                borderBottom: '1px solid #f9fafb',
                                            }}>
                                                <Tooltip title={qual.name}>
                                                    <span>{qual.name.length > 28 ? qual.name.slice(0, 28) + '...' : qual.name}</span>
                                                </Tooltip>
                                                {maxScore !== null && maxScore >= 50 && (
                                                    <WarningOutlined style={{ marginLeft: 4, fontSize: 10, color: maxScore >= 70 ? '#ef4444' : '#f97316' }} />
                                                )}
                                            </td>
                                            {activeLevels.map(level => {
                                                const cell = qual.levels.get(level);
                                                const score = cell?.risk_score ?? null;
                                                const gap = cell?.peak_gap_people ?? null;
                                                return (
                                                    <td key={level} style={{
                                                        textAlign: 'center',
                                                        padding: '3px 4px',
                                                        borderBottom: '1px solid #f9fafb',
                                                    }}>
                                                        <Tooltip
                                                            title={cell ? (
                                                                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                                                                    <div><strong>{qual.name}</strong> · {levelBadge(level)}</div>
                                                                    <div>风险分: {score}</div>
                                                                    <div>峰值缺口: {gap !== null && gap > 0 ? <span style={{ color: '#fca5a5' }}>-{gap}人</span> : '充足'}</div>
                                                                    <div>需求工时: {cell.demand_hours}h</div>
                                                                    <div>评级: {riskLabel(score)}</div>
                                                                </div>
                                                            ) : '无需求'}
                                                        >
                                                            <div style={{
                                                                width: CELL_SIZE,
                                                                height: 28,
                                                                borderRadius: 4,
                                                                background: heatBg(score),
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 700,
                                                                fontSize: score !== null ? 11 : 10,
                                                                color: heatText(score),
                                                                transition: 'all 0.15s ease',
                                                                cursor: 'default',
                                                                margin: '0 auto',
                                                                border: gap !== null && gap > 0
                                                                    ? '2px solid #ef4444'
                                                                    : score !== null ? '1px solid rgba(0,0,0,0.04)' : 'none',
                                                            }}>
                                                                {gap !== null && gap > 0
                                                                    ? <span>-{gap}</span>
                                                                    : score !== null
                                                                        ? score
                                                                        : <span style={{ color: '#e5e7eb' }}>·</span>
                                                                }
                                                            </div>
                                                        </Tooltip>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Trend Sparkline (right sidebar) ── */}
                {trend.length > 0 && (
                    <div style={{
                        background: 'white',
                        borderRadius: 16,
                        border: '1px solid #e5e7eb',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 12 }}>
                            月度风险趋势
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {trend.map((t, i) => {
                                const prevScore = i > 0 ? trend[i - 1].average_risk_score : t.average_risk_score;
                                const delta = t.average_risk_score - prevScore;
                                const isCurrentMonth = t.year_month === dayjs().format('YYYY-MM');
                                const barWidth = Math.max(8, (t.average_risk_score / Math.max(1, summary.max_risk_score)) * 100);
                                return (
                                    <div key={t.year_month} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 0',
                                        borderBottom: i < trend.length - 1 ? '1px solid #f9fafb' : 'none',
                                    }}>
                                        <span style={{
                                            width: 32,
                                            fontSize: 11,
                                            color: isCurrentMonth ? '#2563eb' : '#9ca3af',
                                            fontWeight: isCurrentMonth ? 700 : 400,
                                            flexShrink: 0,
                                        }}>
                                            {dayjs(t.year_month + '-01').format('M月')}
                                        </span>
                                        <div style={{ flex: 1, position: 'relative', height: 18 }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${barWidth}%`,
                                                borderRadius: 4,
                                                background: heatBg(t.average_risk_score),
                                                transition: 'width 0.3s ease',
                                            }} />
                                        </div>
                                        <span style={{
                                            width: 28,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: heatText(t.average_risk_score),
                                            textAlign: 'right',
                                            flexShrink: 0,
                                        }}>
                                            {t.average_risk_score}
                                        </span>
                                        <span style={{ width: 28, fontSize: 10, flexShrink: 0, textAlign: 'right' }}>
                                            {i > 0 && (
                                                delta > 0
                                                    ? <span style={{ color: '#ef4444' }}><ArrowUpOutlined /></span>
                                                    : delta < 0
                                                        ? <span style={{ color: '#22c55e' }}><ArrowDownOutlined /></span>
                                                        : <span style={{ color: '#d1d5db' }}><MinusOutlined /></span>
                                            )}
                                        </span>
                                        <span style={{ width: 38, fontSize: 10, color: '#d1d5db', textAlign: 'right', flexShrink: 0 }}>
                                            缺{t.shortage_count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Risk Ranking Table ── */}
            {sortedRanking.length > 0 && (
                <div style={{
                    background: 'white',
                    borderRadius: 16,
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                            风险排名 — 缺口优先
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            共 {sortedRanking.length} 项 · 缺口 {sortedRanking.filter(r => r.peak_gap_people > 0).length} 项
                        </span>
                    </div>

                    {/* Column headers */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1fr 50px 50px 60px 60px 50px',
                        alignItems: 'center',
                        padding: '8px 16px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#9ca3af',
                        borderBottom: '1px solid #f3f4f6',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                    }}>
                        <span>#</span>
                        <span>资质</span>
                        <span style={{ textAlign: 'center' }}>等级</span>
                        <span style={{ textAlign: 'center' }}>供给</span>
                        <span style={{ textAlign: 'center' }}>峰值需求</span>
                        <span style={{ textAlign: 'center' }}>缺口</span>
                        <span style={{ textAlign: 'center' }}>风险</span>
                    </div>

                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {sortedRanking.map((item, i) => {
                            const hasGap = item.peak_gap_people > 0;
                            return (
                                <div key={`${item.qualification_id}-${item.required_level}`} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px 1fr 50px 50px 60px 60px 50px',
                                    alignItems: 'center',
                                    padding: '8px 16px',
                                    borderBottom: '1px solid #f9fafb',
                                    fontSize: 12,
                                    background: hasGap ? '#fef2f208' : 'transparent',
                                    borderLeft: hasGap ? '3px solid #ef4444' : '3px solid transparent',
                                }}>
                                    <span style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        background: hasGap ? '#fef2f2' : '#f9fafb',
                                        color: hasGap ? '#dc2626' : '#9ca3af',
                                    }}>
                                        {i + 1}
                                    </span>
                                    <Tooltip title={item.qualification_name}>
                                        <span style={{
                                            fontWeight: 500,
                                            color: '#1f2937',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {item.qualification_name}
                                        </span>
                                    </Tooltip>
                                    <span style={{ textAlign: 'center' }}>
                                        <span style={{
                                            fontSize: 10,
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: '#f3f4f6',
                                            color: '#6b7280',
                                        }}>
                                            {levelBadge(item.required_level)}
                                        </span>
                                    </span>
                                    <span style={{ textAlign: 'center', color: '#6b7280' }}>
                                        {item.qualified_employee_count}
                                    </span>
                                    <span style={{ textAlign: 'center', color: '#6b7280' }}>
                                        {item.peak_required_people}
                                    </span>
                                    <span style={{ textAlign: 'center' }}>
                                        {hasGap ? (
                                            <span style={{ color: '#dc2626', fontWeight: 700 }}>
                                                -{item.peak_gap_people}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#22c55e', fontSize: 11 }}>OK</span>
                                        )}
                                    </span>
                                    <span style={{ textAlign: 'center' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            width: 28,
                                            height: 18,
                                            lineHeight: '18px',
                                            borderRadius: 4,
                                            background: heatBg(item.risk_score),
                                            color: heatText(item.risk_score),
                                            fontWeight: 700,
                                            fontSize: 10,
                                            textAlign: 'center',
                                        }}>
                                            {item.risk_score}
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ── Sub-components ── */

const KpiCard: React.FC<{
    label: string;
    value: number | string;
    suffix?: string;
    gradient: [string, string];
    border: string;
    color: string;
    sub?: string;
}> = ({ label, value, suffix, gradient, border, color, sub }) => (
    <div style={{
        background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
        borderRadius: 16,
        padding: '18px 22px',
        border: `1px solid ${border}`,
    }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1.1 }}>
            {value}
            {suffix && <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>{suffix}</span>}
        </div>
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
);

export default TalentDashboard;
