/**
 * WorkHoursCurveCard
 * 
 * 工时需求曲线组件 - 展示工时需求变化
 * 日视图: 当月内每日工时折线图
 * 月视图: 多月堆叠柱状图 + 峰值折线
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WxbOverlay, WxbEmpty, WxbTooltip, WxbKpiCard, WxbSegmented, WxbButton, WxbChartShell, WxbChartCard } from '../wxb-ui';
import type { WxbChartSeriesConfig, WxbChartPoint } from '../wxb-ui';
import { WxbRangePicker } from '../wxb-ui/RangePicker/RangePicker';

import dayjs, { Dayjs } from 'dayjs';
import { dashboardService } from '../../services/dashboardService';
import { WorkHoursData, DayViewData, MonthViewData, BatchInfo } from '../../types/dashboard';
import './WorkHoursCurveCard.css';

/* ── Inline SVG icons ── */
const IconClock = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
);
const IconInfo = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
);

// 批次颜色列表
const BATCH_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96',
    '#13c2c2', '#fa541c', '#2f54eb', '#a0d911', '#f5222d',
];

interface WorkHoursCurveCardProps {
    date: Dayjs;
    orgPath: number[];
}

const WorkHoursCurveCard: React.FC<WorkHoursCurveCardProps> = ({ date, orgPath }) => {
    const [loading, setLoading] = useState(false);
    const [granularity, setGranularity] = useState<'day' | 'month'>('day');
    const [data, setData] = useState<WorkHoursData | null>(null);

    // 日视图状态
    const [selectedBatches, setSelectedBatches] = useState<number[]>([]);

    // 月视图状态 - 默认最近6个月，基于传入的 date
    // 如果 date 变化，我们也顺便把月视图的范围更新一下
    const [monthRange, setMonthRange] = useState<[Dayjs, Dayjs]>([
        date.subtract(5, 'month'),
        date
    ]);

    // 当父组件日期变化时，更新月视图范围的结束日期
    useEffect(() => {
        setMonthRange(prev => [prev[0], date]);
    }, [date]);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                let resData: WorkHoursData;

                if (granularity === 'day') {
                    resData = await dashboardService.getWorkHoursCurve('day', date.format('YYYY-MM'), orgPath);
                } else {
                    resData = await dashboardService.getWorkHoursCurve('month', [
                        monthRange[0].format('YYYY-MM'),
                        monthRange[1].format('YYYY-MM')
                    ], orgPath);
                }

                setData(resData);

                // 日视图: 默认选中所有批次
                if (granularity === 'day' && 'batches' in resData && resData.batches?.length > 0 && selectedBatches.length === 0) {
                    setSelectedBatches(resData.batches.map((b: BatchInfo) => b.batch_id));
                }
            } catch (error) {
                console.error('Failed to load work hours curve:', error);
                setData(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [granularity, date, monthRange, orgPath]);

    // Assessor 追加补丁： date 月份变化时强制重置 selectedBatches
    useEffect(() => {
        setSelectedBatches([]);
    }, [date]);

    // ============== 日视图数据处理 ==============

    const dayViewData = data?.granularity === 'day' ? data as DayViewData : null;

    const batchColorMap = useMemo(() => {
        const map: Record<string, string> = {};
        if (dayViewData?.batches) {
            dayViewData.batches.forEach((batch, index) => {
                map[batch.batch_code] = BATCH_COLORS[index % BATCH_COLORS.length];
            });
        }
        return map;
    }, [dayViewData?.batches]);

    /* ── WxbChartCard multi-series config ── */
    const wxbSeriesConfig = useMemo((): WxbChartSeriesConfig[] => {
        const configs: WxbChartSeriesConfig[] = [
            { key: '总需求', label: '总需求', color: '#ff4d4f', lineWidth: 2.5, showPoints: true, areaFill: true },
        ];
        if (dayViewData?.batches) {
            dayViewData.batches
                .filter(b => selectedBatches.includes(b.batch_id))
                .forEach(batch => {
                    configs.push({
                        key: batch.batch_code,
                        label: batch.batch_code,
                        color: batchColorMap[batch.batch_code] || '#8c8c8c',
                        lineWidth: 1.5,
                        dash: [4, 2],
                        showPoints: false,
                    });
                });
        }
        return configs;
    }, [dayViewData?.batches, selectedBatches, batchColorMap]);

    const wxbChartPoints = useMemo((): WxbChartPoint[] => {
        if (!dayViewData) return [];
        // Collect all unique dates
        const dateSet = new Set<string>();
        dayViewData.total_by_date.forEach(d => dateSet.add(d.date));
        const dates = Array.from(dateSet).sort();

        // Build total map
        const totalMap: Record<string, number> = {};
        dayViewData.total_by_date.forEach(d => { totalMap[d.date] = d.work_hours; });

        // Build batch maps
        const batchMaps: Record<string, Record<string, number>> = {};
        dayViewData.daily_data
            .filter(d => selectedBatches.includes(d.batch_id))
            .forEach(d => {
                if (!batchMaps[d.batch_code]) batchMaps[d.batch_code] = {};
                batchMaps[d.batch_code][d.date] = d.work_hours;
            });

        return dates.map(date => {
            const values: Record<string, number> = { '总需求': totalMap[date] ?? 0 };
            Object.entries(batchMaps).forEach(([code, map]) => {
                values[code] = map[date] ?? 0;
            });
            return { label: dayjs(date).format('M/D'), date, values };
        });
    }, [dayViewData, selectedBatches]);

    const batchOptions = useMemo(() => {
        return dayViewData?.batches ?? [];
    }, [dayViewData?.batches]);

    // 日视图 batch 全选 / 清空
    const allBatchesSelected = batchOptions.length > 0
        && selectedBatches.length === batchOptions.length;

    const toggleAllBatches = useCallback(() => {
        if (allBatchesSelected) {
            setSelectedBatches([]);
        } else {
            setSelectedBatches((dayViewData?.batches ?? []).map(b => b.batch_id));
        }
    }, [allBatchesSelected, dayViewData?.batches]);

    const toggleSingleBatch = useCallback((batchId: number) => {
        setSelectedBatches(prev =>
            prev.includes(batchId)
                ? prev.filter(id => id !== batchId)
                : [...prev, batchId]
        );
    }, []);

    // ============== 月视图数据处理 ==============

    const monthViewData = data?.granularity === 'month' ? data as MonthViewData : null;

    // 收集所有批次用于颜色映射
    const monthBatchColorMap = useMemo(() => {
        const map: Record<string, string> = {};
        const allBatches = new Set<string>();
        monthViewData?.monthly_data.forEach(m => {
            m.batch_breakdown.forEach(b => allBatches.add(b.batch_code));
        });
        Array.from(allBatches).forEach((batch, index) => {
            map[batch] = BATCH_COLORS[index % BATCH_COLORS.length];
        });
        return map;
    }, [monthViewData?.monthly_data]);

    // WxbChartCard 月视图 series config: 各批次为 bar + 峰值为 line
    const monthWxbSeriesConfig = useMemo((): WxbChartSeriesConfig[] => {
        const configs: WxbChartSeriesConfig[] = [];
        // 堆叠柱状图 — 每个批次一个 bar series
        const allBatches = new Set<string>();
        monthViewData?.monthly_data.forEach(m => {
            m.batch_breakdown.forEach(b => allBatches.add(b.batch_code));
        });
        Array.from(allBatches).forEach(batch => {
            configs.push({
                key: batch,
                label: batch,
                color: monthBatchColorMap[batch] || '#8c8c8c',
                geometry: 'bar',
            });
        });
        // 峰值折线
        configs.push({
            key: 'peak',
            label: '峰值日工时',
            color: '#ff4d4f',
            geometry: 'line',
            lineWidth: 2,
            showPoints: true,
        });
        return configs;
    }, [monthViewData?.monthly_data, monthBatchColorMap]);

    const monthWxbChartPoints = useMemo((): WxbChartPoint[] => {
        if (!monthViewData) return [];
        return monthViewData.monthly_data.map(m => {
            const values: Record<string, number> = { peak: m.peak_daily_hours };
            m.batch_breakdown.forEach(b => {
                values[b.batch_code] = b.work_hours;
            });
            return { label: m.month_label, date: m.peak_date, values };
        });
    }, [monthViewData]);

    // 用于条件渲染的检查
    const monthHasData = monthWxbChartPoints.length > 0;


    // ============== 渲染 ==============

    return (
        <WxbChartShell
            icon={<IconClock />}
            iconColor="teal"
            title="工时需求曲线"
            subtitle={granularity === 'day'
                ? `${date.format('YYYY年M月')} · 日视图`
                : `${monthRange[0].format('YYYY-MM')} ~ ${monthRange[1].format('YYYY-MM')}`
            }
            actions={
                <>
                    <WxbTooltip title={granularity === 'day'
                        ? "红色粗线为每日总工时需求，虚线为各批次工时需求"
                        : "柱状图为按批次堆叠的月总工时，红色折线为每月峰値日工时"
                    }>
                        <span style={{ color: 'var(--wx-fg-4, #8898A8)', cursor: 'help', display: 'inline-flex' }}>
                            <IconInfo />
                        </span>
                    </WxbTooltip>

                    {/* 月视图：时间范围选择 */}
                    {granularity === 'month' && (
                        <WxbRangePicker
                            picker="month"
                            value={monthRange}
                            onChange={(dates: any) => {
                                if (dates && dates[0] && dates[1]) {
                                    setMonthRange([dates[0], dates[1]]);
                                }
                            }}
                            allowClear={false}
                            size="small"
                            style={{ width: 195 }}
                        />
                    )}

                    {/* 粒度切换：WxbSegmented */}
                    <WxbSegmented
                        size="sm"
                        options={[
                            { label: '日视图', value: 'day' },
                            { label: '月视图', value: 'month' },
                        ]}
                        value={granularity}
                        onChange={(val) => {
                            setGranularity(val as 'day' | 'month');
                            setData(null);
                        }}
                    />
                </>
            }
        >

            <WxbOverlay loading={loading}>
                {/* 日视图 */}
                {granularity === 'day' && dayViewData && wxbChartPoints.length > 0 && (
                    <>
                        <div className="dashboard-kpi-grid">
                            <WxbKpiCard
                                title="月度总工时"
                                value={dayViewData.summary.total_hours}
                                unit="h"
                            />
                            <WxbKpiCard
                                title="日均工时"
                                value={dayViewData.summary.avg_daily_hours}
                                unit="h/天"
                            />
                            <WxbKpiCard
                                title="峰値工时"
                                value={dayViewData.summary.peak_hours}
                                unit={dayViewData.summary.peak_date ? `h (${dayjs(dayViewData.summary.peak_date).format('M/D')})` : 'h'}
                                trend="down"
                            />
                            <WxbKpiCard
                                title="活跃批次"
                                value={dayViewData.summary.batch_count}
                                unit="个"
                            />
                        </div>

                        {/* 图例联动行（日视图专属，wxb-cs-legend 风格） */}
                        {batchOptions.length > 0 && (
                            <div className="wxb-cs-legend wxb-cs-legend--interactive">
                                {/* 总需求（固定，不可关闭） */}
                                <WxbTooltip title="总工时需求，始终显示">
                                    <span className="wxb-cs-legend-item is-fixed">
                                        <span className="wxb-cs-swatch" style={{ background: '#ff4d4f' }} />
                                        总需求
                                    </span>
                                </WxbTooltip>

                                <span className="wxb-cs-legend-divider" />

                                {/* 全选/清空 */}
                                <WxbTooltip title={allBatchesSelected ? '清空批次线' : '显示所有批次线'}>
                                    <WxbButton variant="ghost" size="sm" onClick={toggleAllBatches} style={{ fontSize: 10, padding: '2px 6px' }}>
                                        {allBatchesSelected ? '清空' : '全选'}
                                    </WxbButton>
                                </WxbTooltip>

                                {/* 批次图例 */}
                                {batchOptions.map(batch => {
                                    const color = batchColorMap[batch.batch_code];
                                    const isSelected = selectedBatches.includes(batch.batch_id);
                                    return (
                                        <WxbTooltip
                                            key={batch.batch_id}
                                            title={isSelected
                                                ? `点击隐藏 [${batch.batch_code}]`
                                                : `点击显示 [${batch.batch_code}]`
                                            }
                                            placement="top"
                                        >
                                            <span
                                                className={`wxb-cs-legend-item is-toggle ${isSelected ? 'is-on' : 'is-off'}`}
                                                onClick={() => toggleSingleBatch(batch.batch_id)}
                                            >
                                                <span className="wxb-cs-swatch" style={{ background: color }} />
                                                {batch.batch_code}
                                            </span>
                                        </WxbTooltip>
                                    );
                                })}
                            </div>
                        )}

                        <WxbChartCard
                            headless
                            seriesConfig={wxbSeriesConfig}
                            points={wxbChartPoints}
                            yUnit="h"
                            tooltipFormatter={(v) => `${v.toFixed(1)} h`}
                        />
                    </>
                )}

                {/* 月视图 */}
                {granularity === 'month' && monthViewData && monthHasData && (
                    <>
                        <div className="dashboard-kpi-grid" style={{ gridTemplateColumns: '1fr' }}>
                            <WxbKpiCard
                                title="月人均操作工时 (均値)"
                                value={monthViewData.summary.avg_hours_per_person}
                                unit={`h (共${monthViewData.summary.total_employees}人)`}
                            />
                        </div>

                        {/* 月视图图例 */}
                        <div className="wxb-cs-legend" style={{ marginTop: 8 }}>
                            {monthWxbSeriesConfig.map(sc => (
                                <span key={sc.key} className="wxb-cs-legend-item">
                                    <span
                                        className={`wxb-cs-swatch${sc.geometry === 'line' ? ' is-dash' : ''}`}
                                        style={sc.geometry === 'line' ? undefined : { background: sc.color }}
                                    />
                                    {sc.label}
                                </span>
                            ))}
                        </div>

                        <WxbChartCard
                            headless
                            seriesConfig={monthWxbSeriesConfig}
                            points={monthWxbChartPoints}
                            yUnit="h"
                            tooltipFormatter={(v) => `${v.toFixed(1)} h`}
                        />
                    </>
                )}

                {/* 无数据状态 */}
                {!loading && (
                    (granularity === 'day' && (!dayViewData || wxbChartPoints.length === 0)) ||
                    (granularity === 'month' && (!monthViewData || !monthHasData))
                ) && (
                        <WxbEmpty />
                    )}
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default WorkHoursCurveCard;
