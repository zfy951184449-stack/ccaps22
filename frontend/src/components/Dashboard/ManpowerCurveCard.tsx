/**
 * ManpowerCurveCard
 * 
 * 人力供需曲线组件 - 展示一个月内的人力资源供需情况
 * 使用堆叠柱状图（按班次+操作状态）+ 需求折线图的组合形式
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Spin, Empty, Tooltip } from 'antd';
import { TeamOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { DualAxes } from '@ant-design/plots';
import dayjs, { Dayjs } from 'dayjs';
import { dashboardService } from '../../services/dashboardService';
import { ManpowerCurveData } from '../../types/dashboard';
import './ManpowerCurveCard.css';

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

    // 转换为堆叠柱状图数据（按班次+操作状态分组）
    const stackedBarData = useMemo(() => {
        const result: any[] = [];
        dailyData.forEach((d) => {
            // 如果有班次分组数据，使用分组数据
            if (d.shift_breakdown && d.shift_breakdown.length > 0) {
                // 先按固定顺序排序
                const sortedBreakdown = [...d.shift_breakdown].sort((a, b) => {
                    const catA = a.has_operation ? `${a.shift_name}(有操作)` : `${a.shift_name}(待命)`;
                    const catB = b.has_operation ? `${b.shift_name}(有操作)` : `${b.shift_name}(待命)`;
                    return getCategoryWeight(catA) - getCategoryWeight(catB);
                });

                sortedBreakdown.forEach((sb) => {
                    const categoryLabel = sb.has_operation
                        ? `${sb.shift_name}(有操作)`
                        : `${sb.shift_name}(待命)`;
                    result.push({
                        date: d.date,
                        count: sb.count,
                        category: categoryLabel,
                        shiftCode: sb.shift_code,
                        hasOperation: sb.has_operation,
                    });
                });
            } else {
                // 没有分组数据时，使用总可用人数
                result.push({
                    date: d.date,
                    count: d.available_count,
                    category: '可用人数',
                    shiftCode: 'DEFAULT',
                    hasOperation: true,
                });
            }
        });
        return result;
    }, [dailyData]);

    // 需求折线图数据
    const demandLineData = useMemo(() => {
        return dailyData.map((d) => ({
            date: d.date,
            demand: d.demand_count,
        }));
    }, [dailyData]);

    // 获取所有班次分类（用于图例和颜色）
    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        stackedBarData.forEach(item => cats.add(item.category));
        return Array.from(cats);
    }, [stackedBarData]);

    // 生成动态颜色映射
    const categoryColors = useMemo(() => {
        const colorMap: string[] = [];
        allCategories.forEach(cat => {
            // 从分类名称中提取班次信息
            const hasOp = cat.includes('有操作');
            let shiftCode = 'DEFAULT';
            if (cat.includes('日班') || cat.includes('标准')) shiftCode = 'DAY';
            else if (cat.includes('基础')) shiftCode = 'BASE';
            else if (cat.includes('长白')) shiftCode = 'LONGDAY';
            else if (cat.includes('夜班')) shiftCode = 'night';

            colorMap.push(getShiftColor(shiftCode, hasOp));
        });
        return colorMap.length > 0 ? colorMap : ['#52c41a'];
    }, [allCategories]);

    // 生成非工作日标记注释
    const holidayAnnotations = useMemo(() => {
        const annotations: any[] = [];

        dailyData.forEach((d) => {
            if (!d.is_workday) {
                const startTime = new Date(d.date).getTime();
                const endTime = new Date(dayjs(d.date).add(1, 'day').format('YYYY-MM-DD')).getTime();

                // 只有3倍工资节假日用红色，其他非工作日（周末、2倍节假日）用灰色
                const isTripleSalary = d.salary_multiplier === 3;

                annotations.push({
                    type: 'region',
                    start: [startTime, 'min'],
                    end: [endTime, 'max'],
                    style: {
                        fill: isTripleSalary ? 'rgba(255, 77, 79, 0.15)' : 'rgba(0, 0, 0, 0.04)',
                    },
                });

                // 3倍工资节假日添加节日名称标签
                if (isTripleSalary && d.holiday_name) {
                    annotations.push({
                        type: 'text',
                        position: [d.date, 'max'],
                        content: d.holiday_name,
                        style: {
                            fill: '#ff4d4f',
                            fontSize: 10,
                            textAlign: 'center',
                        },
                        offsetY: -8,
                    });
                }
            }
        });

        return annotations;
    }, [dailyData]);

    // 双轴图配置
    const chartConfig = useMemo(() => ({
        data: [stackedBarData, demandLineData],
        xField: 'date',
        yField: ['count', 'demand'],
        geometryOptions: [
            {
                geometry: 'column',
                isStack: true,
                seriesField: 'category',
                color: categoryColors,
                columnWidthRatio: 0.6,
            },
            {
                geometry: 'line',
                lineStyle: {
                    lineWidth: 2,
                },
                color: '#ff4d4f',
                point: {
                    size: 3,
                    shape: 'circle',
                    style: {
                        fill: '#ff4d4f',
                        stroke: '#fff',
                        lineWidth: 1,
                    },
                },
            },
        ],
        xAxis: {
            type: 'time' as const,
            tickCount: 10,
            label: {
                formatter: (v: string) => dayjs(v).format('M/D'),
            },
        },
        yAxis: {
            count: {
                title: { text: '可用人数' },
                min: 0,
            },
            demand: {
                title: { text: '需求人数' },
                min: 0,
            },
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
            customContent: (title: string, items: any[]) => {
                if (!items || items.length === 0) return '';

                const date = dayjs(title).format('M月D日');
                const dayInfo = dailyData.find(d => d.date === title);

                let holidayLabel = '';
                if (dayInfo && !dayInfo.is_workday) {
                    if (dayInfo.salary_multiplier === 3) {
                        holidayLabel = `<span style="color:#ff4d4f;font-weight:500;"> (${dayInfo.holiday_name || '法定假日'} 3倍)</span>`;
                    } else if (dayInfo.is_weekend) {
                        holidayLabel = '<span style="color:#8c8c8c;"> (周末)</span>';
                    } else {
                        holidayLabel = '<span style="color:#8c8c8c;"> (休息日)</span>';
                    }
                }

                let html = `<div style="padding:8px 12px;"><div style="font-weight:500;margin-bottom:8px;">${date}${holidayLabel}</div>`;

                items.forEach(item => {
                    const color = item.color || '#1890ff';
                    const name = item.name || '';
                    const value = item.value ?? 0;
                    html += `<div style="display:flex;align-items:center;margin:4px 0;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></span>
                        <span style="color:#595959;">${name}:</span>
                        <span style="font-weight:500;margin-left:4px;">${value}人</span>
                    </div>`;
                });

                // 添加缺口信息
                if (dayInfo && dayInfo.gap > 0) {
                    html += `<div style="color:#ff4d4f;margin-top:8px;padding-top:8px;border-top:1px dashed #f0f0f0;">
                        <WarningOutlined /> 缺口: ${dayInfo.gap}人
                    </div>`;
                }

                html += '</div>';
                return html;
            },
        },
        annotations: {
            count: [
                ...holidayAnnotations,
                // 总人数参考线
                ...(data?.total_headcount ? [{
                    type: 'line',
                    start: ['min', data.total_headcount],
                    end: ['max', data.total_headcount],
                    style: {
                        stroke: '#8c8c8c',
                        lineWidth: 1,
                        lineDash: [4, 4],
                    },
                    text: {
                        content: `总人数: ${data.total_headcount}`,
                        position: 'end',
                        style: {
                            fill: '#8c8c8c',
                            fontSize: 11,
                        },
                        offsetY: -5,
                    },
                }] : []),
            ],
        },
    }), [stackedBarData, demandLineData, categoryColors, data, dailyData, holidayAnnotations]);

    return (
        <div className="dashboard-glass-card">
            {/* 卡片标题 */}
            <div className="dashboard-card-header">
                <div className="dashboard-card-title">
                    <div className="dashboard-card-icon blue">
                        <TeamOutlined />
                    </div>
                    人力供需曲线
                    <Tooltip title="堆叠柱状图显示各班次可用人数（深色=有操作任务，浅色=待命），红色折线为需求人数">
                        <InfoCircleOutlined style={{ color: '#c0c0c0', fontSize: 13, marginLeft: 2 }} />
                    </Tooltip>
                </div>
            </div>

            <Spin spinning={loading}>
                {data && dailyData.length > 0 ? (
                    <>
                        {/* KPI 统计块 — 原生 CSS Grid，替代 Antd Row/Col */}
                        <div className="dashboard-stats-grid">
                            {/* 团队总人数 */}
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">团队总人数</div>
                                <div className="dashboard-stat-value">
                                    {data.total_headcount ?? 0}
                                    <span className="dashboard-stat-suffix">人</span>
                                </div>
                            </div>
                            {/* 人力充足率 */}
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">人力充足率</div>
                                <div className={`dashboard-stat-value ${summary.sufficiency_rate >= 80 ? 'success' : 'warning'}`}>
                                    {summary.sufficiency_rate}
                                    <span className="dashboard-stat-suffix">%</span>
                                </div>
                            </div>
                            {/* 平均缺口 */}
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">平均缺口</div>
                                <div className={`dashboard-stat-value ${Number(summary.avg_gap) > 0 ? 'danger' : 'success'}`}>
                                    {summary.avg_gap}
                                    <span className="dashboard-stat-suffix">人/天</span>
                                </div>
                            </div>
                            {/* 峰值缺口 */}
                            <div className="dashboard-stat-item">
                                <div className="dashboard-stat-label">峰值缺口</div>
                                <div className={`dashboard-stat-value ${summary.max_gap > 0 ? 'danger' : 'success'}`}>
                                    {summary.max_gap}
                                    <span className="dashboard-stat-suffix">
                                        {summary.max_gap_date ? `人 (${dayjs(summary.max_gap_date).format('M/D')})` : '人'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-chart-container">
                            <DualAxes {...chartConfig} />
                        </div>
                    </>
                ) : (
                    <Empty description="暂无数据" />
                )}
            </Spin>
        </div>
    );
};

export default ManpowerCurveCard;
