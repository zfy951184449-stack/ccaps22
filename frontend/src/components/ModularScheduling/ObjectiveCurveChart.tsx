/**
 * 目标函数曲线图组件
 * 
 * 实时显示求解过程中目标函数值的变化趋势
 */

import React, { memo } from 'react';
import { Card, Empty } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';

interface ObjectiveCurveChartProps {
    data: { time: number; value: number }[];
    title?: string;
}

/**
 * 简化版曲线图 - 使用纯 CSS 实现
 * 不依赖第三方图表库
 */
const ObjectiveCurveChart: React.FC<ObjectiveCurveChartProps> = memo(({ data, title = '目标分值曲线' }) => {
    if (!data || data.length === 0) {
        return (
            <Card size="small" title={<><LineChartOutlined /> {title}</>}>
                <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </Card>
        );
    }

    // 计算值范围
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    // 画布尺寸
    const width = 400;
    const height = 150;
    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // 生成 SVG 路径
    const points = data.map((d, i) => {
        const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
        const y = padding + chartHeight - ((d.value - minValue) / range) * chartHeight;
        return `${x},${y}`;
    });
    const pathD = `M ${points.join(' L ')}`;

    // Y 轴标签
    const yLabels = [
        { value: maxValue, y: padding },
        { value: (maxValue + minValue) / 2, y: padding + chartHeight / 2 },
        { value: minValue, y: padding + chartHeight },
    ];

    // 当前值
    const currentValue = data[data.length - 1]?.value;

    return (
        <Card
            size="small"
            title={<><LineChartOutlined /> {title}</>}
            extra={<span style={{ color: currentValue < 0 ? '#52c41a' : '#ff4d4f' }}>当前: {currentValue?.toLocaleString()}</span>}
        >
            <svg width={width} height={height} style={{ display: 'block', margin: '0 auto' }}>
                {/* 网格线 */}
                {[0, 1, 2].map((i) => (
                    <line
                        key={i}
                        x1={padding}
                        y1={padding + (i * chartHeight) / 2}
                        x2={padding + chartWidth}
                        y2={padding + (i * chartHeight) / 2}
                        stroke="#f0f0f0"
                        strokeDasharray="3,3"
                    />
                ))}

                {/* Y 轴标签 */}
                {yLabels.map((label, i) => (
                    <text
                        key={i}
                        x={padding - 5}
                        y={label.y}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        fontSize={10}
                        fill="#888"
                    >
                        {label.value.toLocaleString()}
                    </text>
                ))}

                {/* 曲线 */}
                <path
                    d={pathD}
                    fill="none"
                    stroke="#1890ff"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* 数据点 */}
                {data.map((d, i) => {
                    const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
                    const y = padding + chartHeight - ((d.value - minValue) / range) * chartHeight;
                    return (
                        <circle
                            key={i}
                            cx={x}
                            cy={y}
                            r={3}
                            fill="#1890ff"
                            stroke="#fff"
                            strokeWidth={1}
                        />
                    );
                })}

                {/* X 轴时间标签 */}
                {[0, data.length - 1].map((i) => (
                    <text
                        key={i}
                        x={padding + (i / (data.length - 1 || 1)) * chartWidth}
                        y={padding + chartHeight + 15}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#888"
                    >
                        {data[i]?.time}s
                    </text>
                ))}
            </svg>
        </Card>
    );
});

ObjectiveCurveChart.displayName = 'ObjectiveCurveChart';

export default ObjectiveCurveChart;
