/**
 * WorkHoursCurveCard
 * 
 * 工时需求曲线组件 - 展示一个月内的工时需求变化
 * 使用多折线图展示总需求线和各批次需求线
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Select, Spin, Empty, Statistic, Row, Col, Tooltip } from 'antd';
import { ClockCircleOutlined, LeftOutlined, RightOutlined, InfoCircleOutlined, FireOutlined } from '@ant-design/icons';
import { Line } from '@ant-design/plots';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import './WorkHoursCurveCard.css';

const API_BASE = '/api';

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

interface WorkHoursCurveData {
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

// 批次颜色列表
const BATCH_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96',
    '#13c2c2', '#fa541c', '#2f54eb', '#a0d911', '#f5222d',
];

const WorkHoursCurveCard: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [selectedBatches, setSelectedBatches] = useState<number[]>([]);
    const [data, setData] = useState<WorkHoursCurveData | null>(null);

    // 加载曲线数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const params = {
                    year_month: selectedMonth.format('YYYY-MM'),
                };

                const res = await axios.get(`${API_BASE}/dashboard/work-hours-curve`, { params });
                setData(res.data);

                // 默认选中所有批次
                if (res.data?.batches?.length > 0 && selectedBatches.length === 0) {
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
    }, [selectedMonth]);

    // 生成批次颜色映射
    const batchColorMap = useMemo(() => {
        const map: Record<string, string> = {};
        data?.batches.forEach((batch, index) => {
            map[batch.batch_code] = BATCH_COLORS[index % BATCH_COLORS.length];
        });
        return map;
    }, [data?.batches]);

    // 转换为折线图数据
    const lineData = useMemo(() => {
        if (!data) return [];

        const result: any[] = [];

        // 添加总需求线
        data.total_by_date.forEach((d) => {
            result.push({
                date: d.date,
                hours: d.work_hours,
                batch: '总需求',
            });
        });

        // 添加各批次线（根据选中的批次过滤）
        data.daily_data
            .filter(d => selectedBatches.includes(d.batch_id))
            .forEach((d) => {
                result.push({
                    date: d.date,
                    hours: d.work_hours,
                    batch: d.batch_code,
                });
            });

        return result;
    }, [data, selectedBatches]);

    // 图表配置
    const chartConfig = useMemo(() => ({
        data: lineData,
        xField: 'date',
        yField: 'hours',
        seriesField: 'batch',
        smooth: true,
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
            itemName: {
                style: {
                    fontSize: 11,
                },
            },
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

    // 批次选项
    const batchOptions = useMemo(() => {
        return data?.batches.map(b => ({
            value: b.batch_id,
            label: b.batch_code,
        })) || [];
    }, [data?.batches]);

    return (
        <Card
            className="work-hours-curve-card"
            title={
                <div className="card-header">
                    <span className="card-title">
                        <ClockCircleOutlined /> 工时需求曲线
                        <Tooltip title="红色粗线为每日总工时需求，虚线为各批次工时需求">
                            <InfoCircleOutlined style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }} />
                        </Tooltip>
                    </span>
                    <div className="card-filters">
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
                    </div>
                </div>
            }
        >
            <Spin spinning={loading}>
                {data && lineData.length > 0 ? (
                    <>
                        <div className="chart-container">
                            <Line {...chartConfig} />
                        </div>
                        <div className="summary-row">
                            <Row gutter={24}>
                                <Col span={6}>
                                    <Statistic
                                        title="月度总工时"
                                        value={data.summary.total_hours}
                                        suffix="h"
                                        prefix={<ClockCircleOutlined />}
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="日均工时"
                                        value={data.summary.avg_daily_hours}
                                        suffix="h/天"
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="峰值工时"
                                        value={data.summary.peak_hours}
                                        suffix={data.summary.peak_date ? `h (${dayjs(data.summary.peak_date).format('M/D')})` : 'h'}
                                        valueStyle={{ color: '#ff4d4f' }}
                                        prefix={<FireOutlined />}
                                    />
                                </Col>
                                <Col span={6}>
                                    <Statistic
                                        title="活跃批次"
                                        value={data.summary.batch_count}
                                        suffix="个"
                                    />
                                </Col>
                            </Row>
                        </div>
                    </>
                ) : (
                    <Empty description="暂无数据" />
                )}
            </Spin>
        </Card>
    );
};

export default WorkHoursCurveCard;
