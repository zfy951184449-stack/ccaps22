/**
 * ManpowerCurveCard
 * 
 * 人力供需曲线组件 - 展示一个月内的人力资源供需情况
 * 使用 WxbChartCard 堆叠柱状图（按班次+操作状态）+ 需求折线图
 */

import React, { useState, useEffect, useMemo } from 'react';
import { WxbOverlay, WxbEmpty, WxbTooltip, WxbKpiCard, WxbChartShell, WxbChartCard } from '../wxb-ui';
import type { WxbChartSeriesConfig, WxbChartPoint, WxbChartAnnotation } from '../wxb-ui';
import dayjs, { Dayjs } from 'dayjs';
import { dashboardService } from '../../services/dashboardService';
import { ManpowerCurveData } from '../../types/dashboard';
import './ManpowerCurveCard.css';

/* ── Inline SVG icons ── */
const IconUsers = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
);
const IconInfo = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
);

interface ManpowerCurveCardProps {
    date: Dayjs;
    orgPath: number[];
    shiftId?: number;
}

// 班次颜色配置
const SHIFT_COLORS: Record<string, { withOp: string; noOp: string }> = {
    'DAY': { withOp: '#52c41a', noOp: 'rgba(82, 196, 26, 0.4)' },
    'BASE': { withOp: '#52c41a', noOp: 'rgba(82, 196, 26, 0.4)' },
    'LONGDAY': { withOp: '#1890ff', noOp: 'rgba(24, 144, 255, 0.4)' },
    'night': { withOp: '#722ed1', noOp: 'rgba(114, 46, 209, 0.4)' },
};

const getShiftColor = (shiftCode: string, hasOperation: boolean): string => {
    const colorConfig = SHIFT_COLORS[shiftCode] || { withOp: '#8c8c8c', noOp: 'rgba(140, 140, 140, 0.4)' };
    return hasOperation ? colorConfig.withOp : colorConfig.noOp;
};

// 固定堆叠顺序（从下到上）
const CATEGORY_ORDER = [
    '基础班(待命)',
    '标准日班(待命)',
    '长白班(待命)',
    '夜班(待命)',
    '基础班(有操作)',
    '标准日班(有操作)',
    '长白班(有操作)',
    '夜班(有操作)',
];

const getCategoryWeight = (category: string): number => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index >= 0 ? index : 999;
};

const ManpowerCurveCard: React.FC<ManpowerCurveCardProps> = ({
    date,
    orgPath,
    shiftId
}) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ManpowerCurveData | null>(null);
    const dailyData = useMemo(() => (
        Array.isArray(data?.daily_data) ? (data?.daily_data ?? []) : []
    ), [data?.daily_data]);

    const summary = data?.summary ?? {
        avg_gap: '0',
        max_gap: 0,
        max_gap_date: '',
        sufficiency_rate: 100,
        gap_days: 0,
    };

    // 加载曲线数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const res = await dashboardService.getManpowerCurve(
                    date.format('YYYY-MM'),
                    orgPath,
                    shiftId
                );
                setData(res);
            } catch (error) {
                console.error('Failed to load manpower curve:', error);
                setData(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [date, orgPath, shiftId]);

    // ============== WxbChartCard 数据转换 ==============

    // 收集所有班次分类
    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        dailyData.forEach(d => {
            if (d.shift_breakdown && d.shift_breakdown.length > 0) {
                const sorted = [...d.shift_breakdown].sort((a, b) => {
                    const catA = a.has_operation ? `${a.shift_name}(有操作)` : `${a.shift_name}(待命)`;
                    const catB = b.has_operation ? `${b.shift_name}(有操作)` : `${b.shift_name}(待命)`;
                    return getCategoryWeight(catA) - getCategoryWeight(catB);
                });
                sorted.forEach(sb => {
                    const label = sb.has_operation ? `${sb.shift_name}(有操作)` : `${sb.shift_name}(待命)`;
                    cats.add(label);
                });
            } else {
                cats.add('可用人数');
            }
        });
        // Sort by category order
        return Array.from(cats).sort((a, b) => getCategoryWeight(a) - getCategoryWeight(b));
    }, [dailyData]);

    // 生成颜色映射
    const categoryColorMap = useMemo(() => {
        const map: Record<string, string> = {};
        allCategories.forEach(cat => {
            const hasOp = cat.includes('有操作');
            let shiftCode = 'DEFAULT';
            if (cat.includes('日班') || cat.includes('标准')) shiftCode = 'DAY';
            else if (cat.includes('基础')) shiftCode = 'BASE';
            else if (cat.includes('长白')) shiftCode = 'LONGDAY';
            else if (cat.includes('夜班')) shiftCode = 'night';
            map[cat] = getShiftColor(shiftCode, hasOp);
        });
        return map;
    }, [allCategories]);

    // WxbChartCard series config
    const wxbSeriesConfig = useMemo((): WxbChartSeriesConfig[] => {
        const configs: WxbChartSeriesConfig[] = [];
        // 各班次分类 → bar 系列
        allCategories.forEach(cat => {
            configs.push({
                key: cat,
                label: cat,
                color: categoryColorMap[cat] || '#8c8c8c',
                geometry: 'bar',
            });
        });
        // 需求折线
        configs.push({
            key: 'demand',
            label: '需求人数',
            color: '#ff4d4f',
            geometry: 'line',
            lineWidth: 2,
            showPoints: true,
        });
        return configs;
    }, [allCategories, categoryColorMap]);

    // WxbChartCard points
    const wxbChartPoints = useMemo((): WxbChartPoint[] => {
        return dailyData.map(d => {
            const values: Record<string, number> = { demand: d.demand_count };

            // 填充各班次分类的值
            if (d.shift_breakdown && d.shift_breakdown.length > 0) {
                d.shift_breakdown.forEach(sb => {
                    const label = sb.has_operation ? `${sb.shift_name}(有操作)` : `${sb.shift_name}(待命)`;
                    values[label] = (values[label] ?? 0) + sb.count;
                });
            } else {
                if (allCategories.includes('可用人数')) {
                    values['可用人数'] = d.available_count;
                }
            }
            // 确保所有分类都有值
            allCategories.forEach(cat => {
                if (values[cat] === undefined) values[cat] = 0;
            });

            // extra tooltip info
            const extra: Array<{ label: string; value: string; color?: string }> = [];

            // 节假日标签
            if (!d.is_workday) {
                if (d.salary_multiplier === 3) {
                    extra.push({ label: d.holiday_name || '法定假日', value: '3倍工资', color: '#ff4d4f' });
                } else if (d.is_weekend) {
                    extra.push({ label: '周末', value: '休息日' });
                } else {
                    extra.push({ label: '休息日', value: '' });
                }
            }

            // 缺口信息
            if (d.gap > 0) {
                extra.push({ label: '缺口', value: `${d.gap}人`, color: '#ff4d4f' });
            }

            return {
                label: dayjs(d.date).format('M/D'),
                date: d.date,
                values,
                extra: extra.length > 0 ? extra : undefined,
            };
        });
    }, [dailyData, allCategories]);

    // Annotations: 节假日区域 + 总人数参考线
    const wxbAnnotations = useMemo((): WxbChartAnnotation[] => {
        const anns: WxbChartAnnotation[] = [];

        // 节假日区域标记
        dailyData.forEach((d, i) => {
            if (!d.is_workday) {
                const isTripleSalary = d.salary_multiplier === 3;
                anns.push({
                    type: 'region',
                    xStart: i,
                    xEnd: i,
                    color: isTripleSalary ? '#ff4d4f' : '#000',
                    opacity: isTripleSalary ? 0.08 : 0.03,
                });
            }
        });

        // 总人数参考线
        if (data?.total_headcount) {
            anns.push({
                type: 'referenceLine',
                yValue: data.total_headcount,
                label: `总人数: ${data.total_headcount}`,
                color: '#8898A8',
                dash: [4, 4],
            });
        }

        return anns;
    }, [dailyData, data?.total_headcount]);

    return (
        <WxbChartShell
            icon={<IconUsers />}
            iconColor="blue"
            title="人力供需曲线"
            subtitle={`${date.format('YYYY年M月')} · 堆叠柱状图 + 需求折线`}
            actions={
                <WxbTooltip title="堆叠柱状图显示各班次可用人数（深色=有操作任务，浅色=待命），红色折线为需求人数">
                    <span style={{ color: 'var(--wx-fg-4, #8898A8)', cursor: 'help', display: 'inline-flex' }}>
                        <IconInfo />
                    </span>
                </WxbTooltip>
            }
        >
            <WxbOverlay loading={loading}>
                {data && dailyData.length > 0 ? (
                    <>
                        {/* KPI 统计块 */}
                        <div className="dashboard-kpi-grid">
                            <WxbKpiCard
                                title="团队总人数"
                                value={data.total_headcount ?? 0}
                                unit="人"
                            />
                            <WxbKpiCard
                                title="人力充足率"
                                value={summary.sufficiency_rate}
                                unit="%"
                                trend={summary.sufficiency_rate >= 80 ? 'up' : 'down'}
                            />
                            <WxbKpiCard
                                title="平均缺口"
                                value={summary.avg_gap}
                                unit="人/天"
                                trend={Number(summary.avg_gap) > 0 ? 'down' : 'up'}
                            />
                            <WxbKpiCard
                                title="峰值缺口"
                                value={summary.max_gap}
                                unit={summary.max_gap_date ? `人 (${dayjs(summary.max_gap_date).format('M/D')})` : '人'}
                                trend={summary.max_gap > 0 ? 'down' : 'up'}
                            />
                        </div>

                        {/* 图例 */}
                        <div className="wxb-cs-legend" style={{ marginTop: 8 }}>
                            {wxbSeriesConfig.filter(sc => sc.geometry === 'bar').map(sc => (
                                <span key={sc.key} className="wxb-cs-legend-item">
                                    <span className="wxb-cs-swatch" style={{ background: sc.color }} />
                                    {sc.label}
                                </span>
                            ))}
                            <span className="wxb-cs-legend-divider" />
                            {wxbSeriesConfig.filter(sc => sc.geometry !== 'bar').map(sc => (
                                <span key={sc.key} className="wxb-cs-legend-item">
                                    <span className="wxb-cs-swatch" style={{ background: sc.color }} />
                                    {sc.label}
                                </span>
                            ))}
                        </div>

                        <WxbChartCard
                            headless
                            seriesConfig={wxbSeriesConfig}
                            points={wxbChartPoints}
                            annotations={wxbAnnotations}
                            yUnit="人"
                            tooltipFormatter={(v) => `${Math.round(v)} 人`}
                        />
                    </>
                ) : (
                    !loading && <WxbEmpty />
                )}
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default ManpowerCurveCard;
