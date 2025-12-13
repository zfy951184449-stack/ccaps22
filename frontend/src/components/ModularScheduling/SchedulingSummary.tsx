import React from 'react';
import { Card, Row, Col, Statistic, Descriptions, Empty, Tag, Progress } from 'antd';
import {
  TeamOutlined,
  UnorderedListOutlined,
  SafetyOutlined,
  FieldTimeOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { SchedulingSummary as SchedulingSummaryType } from './types';
import './styles.css';

interface SchedulingSummaryProps {
  summary: SchedulingSummaryType | null;
  loading?: boolean;
}

const SchedulingSummaryDisplay: React.FC<SchedulingSummaryProps> = ({ summary, loading }) => {
  if (!summary) {
    return (
      <Card className="scheduling-summary-card">
        <Empty
          description="选择批次后显示求解摘要"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const {
    totalOperations,
    totalRequiredPeople,
    availableEmployees,
    unassignedOperations,
    constraintsSummary,
  } = summary;

  // 计算人力充足度
  const capacityRatio = availableEmployees > 0 ? (totalRequiredPeople / availableEmployees) * 100 : 0;
  const isCapacitySufficient = capacityRatio <= 100;

  return (
    <Card className="scheduling-summary-card" loading={loading}>
      <Row gutter={[24, 24]}>
        <Col xs={12} sm={6}>
          <Statistic
            title="总操作数"
            value={totalOperations}
            prefix={<UnorderedListOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="总人次需求"
            value={totalRequiredPeople}
            prefix={<TeamOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="可用员工"
            value={availableEmployees}
            prefix={<TeamOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="待分配操作"
            value={unassignedOperations}
            prefix={unassignedOperations > 0 ? <WarningOutlined /> : <SafetyOutlined />}
            valueStyle={{ color: unassignedOperations > 0 ? '#faad14' : '#52c41a' }}
          />
        </Col>
      </Row>

      <div className="capacity-section">
        <div className="capacity-header">
          <span>人力负载预估</span>
          <Tag color={isCapacitySufficient ? 'success' : 'warning'}>
            {isCapacitySufficient ? '人力充足' : '人力紧张'}
          </Tag>
        </div>
        <Progress
          percent={Math.min(capacityRatio, 150)}
          status={isCapacitySufficient ? 'success' : 'exception'}
          format={() => `${capacityRatio.toFixed(0)}%`}
          strokeColor={{
            '0%': '#52c41a',
            '100%': capacityRatio > 100 ? '#ff4d4f' : '#1890ff',
          }}
        />
      </div>

      <Descriptions
        title="约束配置"
        column={1}
        size="small"
        className="constraints-summary"
      >
        <Descriptions.Item
          label={
            <>
              <FieldTimeOutlined /> 连续工作限制
            </>
          }
        >
          最多 <Tag color="blue">{constraintsSummary.maxConsecutiveWorkdays} 天</Tag>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <>
              <FieldTimeOutlined /> 月度工时范围
            </>
          }
        >
          <Tag color="cyan">{constraintsSummary.monthlyHoursRange}</Tag>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <>
              <FieldTimeOutlined /> 夜班休息
            </>
          }
        >
          <Tag color="purple">{constraintsSummary.nightShiftRest}</Tag>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default SchedulingSummaryDisplay;

