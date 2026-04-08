/**
 * WorkHoursCurveCard
 * 
 * 工时需求曲线组件 - 展示工时需求变化
 * 日视图: 当月内每日工时折线图
 * 月视图: 多月堆叠柱状图 + 峰值折线
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DatePicker, Spin, Empty, Tooltip, Radio } from 'antd';
import { ClockCircleOutlined, InfoCircleOutlined, FireOutlined, UserOutlined, CheckSquareOutlined, BorderOutlined } from '@ant-design/icons';
import { Line, DualAxes } from '@ant-design/plots';
import dayjs, { Dayjs } from 'dayjs';
import { dashboardService } from '../../services/dashboardService';
import { WorkHoursData, DayViewData, MonthViewData, BatchInfo } from '../../types/dashboard';
import './WorkHoursCurveCard.css';

const { RangePicker } = DatePicker;

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
    }, [granularity, date, monthRange, orgPath]); // date 作为依赖，触发日视图刷新

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

    const lineData = useMemo(() => {
        if (!dayViewData) return [];

        const result: any[] = [];

        // 添加总需求线
        dayViewData.total_by_date.forEach((d) => {
            result.push({
                date: d.date,
                hours: d.work_hours,
                batch: '总需求',
            });
        });

        // 添加各批次线
        dayViewData.daily_data
            .filter(d => selectedBatches.includes(d.batch_id))
            .forEach((d) => {
                result.push({
                    date: d.date,
                    hours: d.work_hours,
                    batch: d.batch_code,
                });
            });

        return result;
    }, [dayViewData, selectedBatches]);

    const dayChartConfig = useMemo(() => ({
        data: lineData,
        xField: 'date',
        yField: 'hours',
        seriesField: 'batch',
        smooth: false,
        animation: false,
        lineStyle: (datum: any) => ({
            lineWidth: datum.batch === '总需求' ? 3 : 1.5,
            lineDash: datum.batch === '总需求' ? [] : [4, 2],
        }),
        color: (datum: any) => {
            if (datum.batch === '总需求') return '#ff4d4f';
            return batchColorMap[datum.batch] || '#8c8c8c';
        },
        point: {
            size: (datum: any) => datum.batch === '总需求' ? 4 : 2,
            shape: 'circle',
            style: (datum: any) => ({
                fill: datum.batch === '总需求' ? '#ff4d4f' : batchColorMap[datum.batch] || '#8c8c8c',
                stroke: '#fff',
                lineWidth: 1,
            }),
        },
        xAxis: {
            type: 'time' as const,
            tickCount: 10,
            label: {
                formatter: (v: string) => dayjs(v).format('M/D'),
            },
        },
        yAxis: {
            title: { text: '工时 (h)' },
            min: 0,
        },
        legend: {
            position: 'top' as const,
            itemName: { style: { fontSize: 11 } },
        },
        tooltip: {
            shared: true,
            showMarkers: true,
            formatter: (datum: any) => ({
                name: datum.batch,
                value: `${datum.hours.toFixed(1)} h`,
            }),
        },
    }), [lineData, batchColorMap]);

    const batchList = useMemo(() => dayViewData?.batches || [], [dayViewData?.batches]);

    // 全选 / 清空
    const allBatchesSelected = batchList.length > 0 && selectedBatches.length === batchList.length;
    const toggleAll = useCallback(() => {
        if (allBatchesSelected) {
            setSelectedBatches([]);
        } else {
            setSelectedBatches(batchList.map(b => b.batch_id));
        }
    }, [allBatchesSelected, batchList]);

    // 单个 Chip 切换
    const toggleBatch = useCallback((batchId: number) => {
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

    // 堆叠柱状图数据
    const monthColumnData = useMemo(() => {
        if (!monthViewData) return [];

        const result: any[] = [];
        monthViewData.monthly_data.forEach(m => {
            m.batch_breakdown.forEach(b => {
                result.push({
                    month: m.month_label,
                    batch: b.batch_code,
                    hours: b.work_hours,
                });
            });
            // 如果该月没有数据，添加一个0值
            if (m.batch_breakdown.length === 0) {
                result.push({
                    month: m.month_label,
                    batch: '无数据',
                    hours: 0,
                });
            }
        });
        return result;
    }, [monthViewData]);

    // 峰值折线数据
    const peakLineData = useMemo(() => {
        if (!monthViewData) return [];
        return monthViewData.monthly_data.map(m => ({
            month: m.month_label,
            peak: m.peak_daily_hours,
            peakDate: m.peak_date,
        }));
    }, [monthViewData]);

    const monthChartConfig = useMemo(() => ({
        data: [monthColumnData, peakLineData],
        xField: 'month',
        yField: ['hours', 'peak'],
        geometryOptions: [
            {
                geometry: 'column',
                isStack: true,
                seriesField: 'batch',
                color: (datum: any) => monthBatchColorMap[datum.batch] || '#8c8c8c',
                columnWidthRatio: 0.5,
            },
            {
                geometry: 'line',
                color: '#ff4d4f',
                lineStyle: { lineWidth: 2 },
                point: {
                    size: 5,
                    shape: 'diamond',
                    style: { fill: '#ff4d4f', stroke: '#fff', lineWidth: 2 },
                },
            },
        ],
        yAxis: {
            hours: { title: { text: '月总工时 (h)' }, min: 0 },
            peak: { title: { text: '峰值日工时 (h)' }, min: 0 },
        },
        legend: {
            position: 'top' as const,
        },
        tooltip: {
            shared: true,
            showMarkers: true,
        },
    }), [monthColumnData, peakLineData, monthBatchColorMap]);


    // ============== 渲染 ==============

    return (
        <div className="dashboard-glass-card">
            <div className="dashboard-card-header">
                <div className="dashboard-card-title">
                    <div className="dashboard-card-icon teal">
                        <ClockCircleOutlined />
                    </div>
                    工时需求曲线
                    <Tooltip title={granularity === 'day'
                        ? "红色粗线为每日总工时需求，虚线为各批次工时需求"
                        : "柱状图为按批次堆叠的月总工时，红色折线为每月峰値日工时"
                    }>
                        <InfoCircleOutlined style={{ color: '#c0c0c0', fontSize: 13, marginLeft: 2 }} />
                    </Tooltip>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {/* 月视图: 范围选择（保持原有） */}
                    {granularity === 'month' && (
                        <RangePicker
                            picker="month"
                            value={monthRange}
                            onChange={(dates) => {
                                if (dates && dates[0] && dates[1]) {
                                    setMonthRange([dates[0], dates[1]]);
                                }
                            }}
                            allowClear={false}
                            size="small"
                            style={{ width: 200 }}
                            bordered={false}
                            className="glass-input-range"
                        />
                    )}
                    {/* 粒度切换 */}
                    <Radio.Group
                        value={granularity}
                        onChange={e => {
                            setGranularity(e.target.value);
                            setData(null);
                            setSelectedBatches([]);
                        }}
                        size="small"
                        buttonStyle="solid"
                        className="granularity-switcher"
                    >
                        <Radio.Button value="day">日</Radio.Button>
                        <Radio.Button value="month">月</Radio.Button>
                    </Radio.Group>
                </div>
            </div>

            {/* 日视图批次 Chip 筛选行（仅在日视图且有批次时显示） */}
            {granularity === 'day' && batchList.length > 0 && (
                <div className="batch-filter-bar" style={{ marginBottom: 16 }}>
                    <Tooltip title={allBatchesSelected ? '清空选择' : '全部选中'} placement="top">
                        <button className="batch-filter-toggle-btn" onClick={toggleAll}>
                            {allBatchesSelected
                                ? <><CheckSquareOutlined style={{ marginRight: 4 }} />全选</>
                                : <><BorderOutlined style={{ marginRight: 4 }} />全选</>
                            }
                        </button>
                    </Tooltip>

                    <div className="batch-filter-divider" />

                    {batchList.map(batch => {
                        const color = batchColorMap[batch.batch_code];
                        const isSelected = selectedBatches.includes(batch.batch_id);
                        return (
                            <Tooltip
                                key={batch.batch_id}
                                title={isSelected ? '点击取消筛选' : '点击筛选该批次'}
                                placement="top"
                            >
                                <div
                                    className={`batch-chip ${isSelected ? 'selected' : 'unselected'}`}
                                    style={isSelected ? {
                                        background: color,
                                        borderColor: color,
                                    } : {
                                        borderColor: `${color}30`,
                                    }}
                                    onClick={() => toggleBatch(batch.batch_id)}
                                >
                                    <span
                                        className="batch-chip-dot"
                                        style={{ background: isSelected ? 'rgba(255,255,255,0.8)' : color }}
                                    />
                                    {batch.batch_code}
                                </div>
                            </Tooltip>
                        );
                    })}
                </div>
            )}

            <Spin spinning={loading}>
                {/* 日视图 */}
                {granularity === 'day' && dayViewData && lineData.length > 0 && (
                    <>
                        <div className="dashboard-stats-grid">
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">月度总工时</div>
                                <div className="dashboard-stat-value">
                                    {dayViewData.summary.total_hours}
                                    <span className="dashboard-stat-suffix">h</span>
                                </div>
                            </div>
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">日均工时</div>
                                <div className="dashboard-stat-value">
                                    {dayViewData.summary.avg_daily_hours}
                                    <span className="dashboard-stat-suffix">h/天</span>
                                </div>
                            </div>
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">峰値工时</div>
                                <div className="dashboard-stat-value danger">
                                    {dayViewData.summary.peak_hours}
                                    <span className="dashboard-stat-suffix">
                                        {dayViewData.summary.peak_date ? `h (${dayjs(dayViewData.summary.peak_date).format('M/D')})` : 'h'}
                                    </span>
                                </div>
                            </div>
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">活跃批次</div>
                                <div className="dashboard-stat-value info">
                                    {dayViewData.summary.batch_count}
                                    <span className="dashboard-stat-suffix">个</span>
                                </div>
                            </div>
                        </div>
                        <div className="dashboard-chart-container">
                            <Line {...dayChartConfig} />
                        </div>
                    </>
                )}

                {/* 月视图 */}
                {granularity === 'month' && monthViewData && monthColumnData.length > 0 && (
                    <>
                        <div className="dashboard-stats-grid" style={{ gridTemplateColumns: '1fr' }}>
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">月人均操作工时 (均値)</div>
                                <div className="dashboard-stat-value info">
                                    {monthViewData.summary.avg_hours_per_person}
                                    <span className="dashboard-stat-suffix">h (共{monthViewData.summary.total_employees}人)</span>
                                </div>
                            </div>
                        </div>
                        <div className="dashboard-chart-container">
                            <DualAxes {...monthChartConfig} />
                        </div>
                    </>
                )}

                {/* 无数据状态 */}
                {!loading && (
                    (granularity === 'day' && (!dayViewData || lineData.length === 0)) ||
                    (granularity === 'month' && (!monthViewData || monthColumnData.length === 0))
                ) && (
                        <Empty description="暂无数据" />
                    )}
            </Spin>
        </div>
    );
};

export default WorkHoursCurveCard;
