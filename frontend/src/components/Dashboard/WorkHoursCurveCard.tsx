/**
 * WorkHoursCurveCard
 * 
 * 工时需求曲线组件 - 展示工时需求变化
 * 日视图: 当月内每日工时折线图
 * 月视图: 多月堆叠柱状图 + 峰值折线
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Select, Spin, Empty, Statistic, Row, Col, Tooltip, Radio } from 'antd';
import { ClockCircleOutlined, LeftOutlined, RightOutlined, InfoCircleOutlined, FireOutlined, UserOutlined } from '@ant-design/icons';
import { Line, DualAxes } from '@ant-design/plots';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import './WorkHoursCurveCard.css';

const { RangePicker } = DatePicker;
const API_BASE = '/api';

// ============== 类型定义 ==============

interface DailyBatchData {
    date: string;
    batch_id: number;
    batch_code: string;
    work_hours: number;
}

interface TotalDailyData {
    date: string;
    work_hours: number;
}

interface BatchInfo {
    batch_id: number;
    batch_code: string;
}

interface DayViewData {
    granularity: 'day';
    daily_data: DailyBatchData[];
    total_by_date: TotalDailyData[];
    batches: BatchInfo[];
    summary: {
        total_hours: number;
        avg_daily_hours: number;
        peak_hours: number;
        peak_date: string;
        batch_count: number;
    };
}

interface MonthlyDataItem {
    year_month: string;
    month_label: string;
    total_hours: number;
    hours_per_person: number;
    peak_daily_hours: number;
    peak_date: string;
    batch_breakdown: { batch_code: string; work_hours: number }[];
}

interface MonthViewData {
    granularity: 'month';
    monthly_data: MonthlyDataItem[];
    summary: {
        total_hours: number;
        avg_monthly_hours: number;
        avg_hours_per_person: number;
        total_employees: number;
    };
}

type WorkHoursData = DayViewData | MonthViewData;

// 批次颜色列表
const BATCH_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96',
    '#13c2c2', '#fa541c', '#2f54eb', '#a0d911', '#f5222d',
];

const WorkHoursCurveCard: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [granularity, setGranularity] = useState<'day' | 'month'>('day');

    // 日视图状态
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [selectedBatches, setSelectedBatches] = useState<number[]>([]);

    // 月视图状态 - 默认最近6个月
    const [monthRange, setMonthRange] = useState<[Dayjs, Dayjs]>([
        dayjs().subtract(5, 'month'),
        dayjs()
    ]);

    const [data, setData] = useState<WorkHoursData | null>(null);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                let params: any = { granularity };

                if (granularity === 'day') {
                    params.year_month = selectedMonth.format('YYYY-MM');
                } else {
                    params.start_month = monthRange[0].format('YYYY-MM');
                    params.end_month = monthRange[1].format('YYYY-MM');
                }

                const res = await axios.get(`${API_BASE}/dashboard/work-hours-curve`, { params });
                setData(res.data);

                // 日视图: 默认选中所有批次
                if (granularity === 'day' && res.data?.batches?.length > 0 && selectedBatches.length === 0) {
                    setSelectedBatches(res.data.batches.map((b: BatchInfo) => b.batch_id));
                }
            } catch (error) {
                console.error('Failed to load work hours curve:', error);
                setData(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [granularity, selectedMonth, monthRange]);

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

    const batchOptions = useMemo(() => {
        return dayViewData?.batches.map(b => ({
            value: b.batch_id,
            label: b.batch_code,
        })) || [];
    }, [dayViewData?.batches]);

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
        <Card
            className="work-hours-curve-card"
            title={
                <div className="card-header">
                    <span className="card-title">
                        <ClockCircleOutlined /> 工时需求曲线
                        <Tooltip title={granularity === 'day'
                            ? "红色粗线为每日总工时需求，虚线为各批次工时需求"
                            : "柱状图为按批次堆叠的月总工时，红色折线为每月峰值日工时"
                        }>
                            <InfoCircleOutlined style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }} />
                        </Tooltip>
                    </span>
                    <div className="card-filters">
                        {/* 粒度切换 */}
                        <Radio.Group
                            value={granularity}
                            onChange={e => {
                                setGranularity(e.target.value);
                                setData(null);
                            }}
                            size="small"
                            buttonStyle="solid"
                            className="granularity-switcher"
                        >
                            <Radio.Button value="day">日</Radio.Button>
                            <Radio.Button value="month">月</Radio.Button>
                        </Radio.Group>

                        {/* 日视图: 月份导航 */}
                        {granularity === 'day' && (
                            <>
                                <div className="month-navigator">
                                    <button
                                        className="month-nav-btn"
                                        onClick={() => setSelectedMonth(selectedMonth.subtract(1, 'month'))}
                                        title="上一月"
                                    >
                                        <LeftOutlined />
                                    </button>
                                    <DatePicker
                                        picker="month"
                                        value={selectedMonth}
                                        onChange={(date) => date && setSelectedMonth(date)}
                                        allowClear={false}
                                        size="small"
                                        style={{ width: 100 }}
                                    />
                                    <button
                                        className="month-nav-btn"
                                        onClick={() => setSelectedMonth(selectedMonth.add(1, 'month'))}
                                        title="下一月"
                                    >
                                        <RightOutlined />
                                    </button>
                                </div>
                                <Select
                                    mode="multiple"
                                    value={selectedBatches}
                                    onChange={setSelectedBatches}
                                    placeholder="选择批次"
                                    maxTagCount={2}
                                    maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                                    size="small"
                                    style={{ minWidth: 180, maxWidth: 300 }}
                                    options={batchOptions}
                                    allowClear
                                />
                            </>
                        )}

                        {/* 月视图: 月份范围选择器 */}
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
                                style={{ width: 220 }}
                            />
                        )}
                    </div>
                </div>
            }
        >
            <Spin spinning={loading}>
                {/* 日视图 */}
                {granularity === 'day' && dayViewData && lineData.length > 0 && (
                    <>
                        <div className="chart-container">
                            <Line {...dayChartConfig} />
                        </div>
                        <div className="summary-row">
                            <Row gutter={24}>
                                <Col span={6}>
                                    <Statistic
                                        title="月度总工时"
                                        value={dayViewData.summary.total_hours}
                                        suffix="h"
                                        prefix={<ClockCircleOutlined />}
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="日均工时"
                                        value={dayViewData.summary.avg_daily_hours}
                                        suffix="h/天"
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="峰值工时"
                                        value={dayViewData.summary.peak_hours}
                                        suffix={dayViewData.summary.peak_date ? `h (${dayjs(dayViewData.summary.peak_date).format('M/D')})` : 'h'}
                                        valueStyle={{ color: '#ff4d4f' }}
                                        prefix={<FireOutlined />}
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="活跃批次"
                                        value={dayViewData.summary.batch_count}
                                        suffix="个"
                                    />
                                </Col>
                            </Row>
                        </div>
                    </>
                )}

                {/* 月视图 */}
                {granularity === 'month' && monthViewData && monthColumnData.length > 0 && (
                    <>
                        <div className="chart-container">
                            <DualAxes {...monthChartConfig} />
                        </div>
                        <div className="summary-row">
                            <Row gutter={24} justify="center" style={{ marginBottom: 16 }}>
                                <Col span={8}>
                                    <Statistic
                                        title="月人均操作工时 (均值)"
                                        value={monthViewData.summary.avg_hours_per_person}
                                        suffix={`h (共${monthViewData.summary.total_employees}人)`}
                                        prefix={<UserOutlined />}
                                        valueStyle={{ color: '#1890ff' }}
                                    />
                                </Col>
                            </Row>
                            <div className="monthly-per-capita">
                                <div className="per-capita-title">各月人均工时</div>
                                <div className="per-capita-grid">
                                    {monthViewData.monthly_data.map(m => (
                                        <div key={m.year_month} className="per-capita-item">
                                            <span className="month-label">{m.month_label}</span>
                                            <span className="hours-value">{m.hours_per_person}h</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
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
        </Card>
    );
};

export default WorkHoursCurveCard;
