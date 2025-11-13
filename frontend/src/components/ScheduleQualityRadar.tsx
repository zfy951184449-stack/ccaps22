import React from 'react';
import { Card } from 'antd';
import { Radar } from '@ant-design/plots';

interface ScheduleQualityRadarProps {
  qualityMetrics: {
    cost?: number;
    satisfaction?: number;
    balance?: number;
    skillMatch?: number;
    compliance?: number;
    overall?: number;
  };
  title?: string;
}

const ScheduleQualityRadar: React.FC<ScheduleQualityRadarProps> = ({ 
  qualityMetrics, 
  title = '排班质量指标' 
}) => {
  // 将指标转换为0-1范围（compliance和cost需要取绝对值并归一化）
  const normalizeValue = (value: number | undefined, isNegative: boolean = false) => {
    if (value === undefined) return 0;
    const absValue = Math.abs(value);
    // 假设最大值为100，归一化到0-1
    return Math.min(absValue / 100, 1);
  };

  const data = [
    {
      item: '成本',
      score: normalizeValue(qualityMetrics.cost, true),
    },
    {
      item: '满意度',
      score: normalizeValue(qualityMetrics.satisfaction),
    },
    {
      item: '均衡度',
      score: normalizeValue(qualityMetrics.balance, true),
    },
    {
      item: '技能匹配',
      score: normalizeValue(qualityMetrics.skillMatch),
    },
    {
      item: '规则遵循',
      score: normalizeValue(qualityMetrics.compliance, true),
    },
  ];

  const config = {
    data,
    xField: 'item',
    yField: 'score',
    area: {},
    point: {
      size: 2,
    },
    meta: {
      score: {
        min: 0,
        max: 1,
      },
    },
  };

  return (
    <Card title={title} bordered={false}>
      <Radar {...config} height={300} />
      {qualityMetrics.overall !== undefined && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <strong>总体评分: {(qualityMetrics.overall * 100).toFixed(1)}%</strong>
        </div>
      )}
    </Card>
  );
};

export default ScheduleQualityRadar;

