import React, { useState } from 'react';
import { Button, Card, Flex, Space, Spin, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { schedulingMetricsApi } from '../services/api';
import type { MetricGrade, SchedulingMetricsSnapshot } from '../types';

const { Text } = Typography;

const gradeColorMap: Record<MetricGrade, string> = {
  EXCELLENT: 'green',
  GOOD: 'blue',
  WARNING: 'orange',
  CRITICAL: 'red',
  UNKNOWN: 'default'
};

interface SchedulingHealthSummaryCardProps {
  onViewDetails?: () => void;
}

const SchedulingHealthSummaryCard: React.FC<SchedulingHealthSummaryCardProps> = ({ onViewDetails }) => {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<SchedulingMetricsSnapshot | null>(null);

  const handleCompute = async (saveSnapshot = false) => {
    setLoading(true);
    try {
      const result = await schedulingMetricsApi.compute({
        periodType: 'MONTHLY',
        referenceDate: dayjs().startOf('month').format('YYYY-MM-DD'),
        includeDetails: false,
        saveSnapshot
      });
      setSnapshot(result);
      if (saveSnapshot) {
        message.success('指标快照已保存');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error ?? err?.message ?? '计算排班健康指标失败';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="排班健康概要"
      extra={
        <Space>
          <Button onClick={() => handleCompute(false)} loading={loading}>
            重新计算
          </Button>
          <Button type="primary" onClick={() => handleCompute(true)} loading={loading}>
            保存快照
          </Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {loading ? (
        <Flex justify="center">
          <Spin />
        </Flex>
      ) : snapshot ? (
        <Flex vertical gap={12}>
          <Flex align="center" gap={8}>
            <Text>总体评分：</Text>
            <Tag color={gradeColorMap[snapshot.grade] || 'default'}>
              {snapshot.overallScore} / {snapshot.grade}
            </Tag>
          </Flex>
          <Text type="secondary">
            统计区间：{snapshot.periodStart} ~ {snapshot.periodEnd}
          </Text>
          <Text type="secondary">数据来源：{snapshot.source ?? 'MANUAL'}</Text>
          <Space>
            <Button type="link" onClick={onViewDetails}>
              查看健康看板
            </Button>
          </Space>
        </Flex>
      ) : (
        <Flex vertical gap={12}>
          <Text>暂无排班健康数据，请点击“重新计算”生成指标。</Text>
          <Space>
            <Button type="link" onClick={onViewDetails}>
              前往健康看板
            </Button>
          </Space>
        </Flex>
      )}
    </Card>
  );
};

export default SchedulingHealthSummaryCard;

