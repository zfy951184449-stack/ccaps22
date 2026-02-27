import React from 'react';
import { Card, Row, Col, Statistic, Tag, Empty, Tooltip } from 'antd';
import {
  CalendarOutlined,
  FieldTimeOutlined,
  DollarOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { SchedulingWindow as SchedulingWindowType } from './types';
import './styles.css';

interface SchedulingWindowProps {
  window: SchedulingWindowType | null;
  loading?: boolean;
}

const SchedulingWindowDisplay: React.FC<SchedulingWindowProps> = ({ window, loading }) => {
  if (!window) {
    return (
      <Card className="scheduling-window-card">
        <Empty
          description="请先选择需要排班的批次"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const { startDate, endDate, rawStartDate, rawEndDate, totalDays, workdays, triplePayDays, months } = window;

  // 计算进度条上的位置
  const totalRange = endDate.diff(startDate, 'day');
  const rawStartOffset = rawStartDate.diff(startDate, 'day');
  const rawEndOffset = rawEndDate.diff(startDate, 'day');
  const rawStartPercent = (rawStartOffset / totalRange) * 100;
  const rawEndPercent = (rawEndOffset / totalRange) * 100;

  return (
    <Card className="scheduling-window-card" loading={loading}>
      <div className="window-dates">
        <div className="window-date-item">
          <span className="window-date-label">求解开始</span>
          <span className="window-date-value">{startDate.format('YYYY-MM-DD')}</span>
          <span className="window-date-weekday">{startDate.format('dddd')}</span>
        </div>

        <ArrowRightOutlined className="window-arrow" />

        <div className="window-date-item">
          <span className="window-date-label">求解结束</span>
          <span className="window-date-value">{endDate.format('YYYY-MM-DD')}</span>
          <span className="window-date-weekday">{endDate.format('dddd')}</span>
        </div>
      </div>

      <div className="window-timeline">
        <div className="timeline-bar">
          <div
            className="timeline-actual-range"
            style={{
              left: `${rawStartPercent}%`,
              width: `${rawEndPercent - rawStartPercent}%`,
            }}
          />
          <Tooltip title={`设定开始: ${rawStartDate.format('YYYY-MM-DD')}`}>
            <div
              className="timeline-marker timeline-marker-start"
              style={{ left: `${rawStartPercent}%` }}
            />
          </Tooltip>
          <Tooltip title={`设定结束: ${rawEndDate.format('YYYY-MM-DD')}`}>
            <div
              className="timeline-marker timeline-marker-end"
              style={{ left: `${rawEndPercent}%` }}
            />
          </Tooltip>
        </div>
        <div className="timeline-labels">
          <span>{startDate.format('MM/DD')}</span>
          <span className="timeline-center-label">
            设定时间范围: {rawStartDate.format('MM/DD')} ~ {rawEndDate.format('MM/DD')}
          </span>
          <span>{endDate.format('MM/DD')}</span>
        </div>
      </div>

      <div className="window-months">
        {months.map((month) => (
          <Tag key={month} color="blue" className="month-tag">
            {dayjs(month).format('YYYY年M月')}
          </Tag>
        ))}
      </div>

      <Row gutter={24} className="window-stats">
        <Col xs={8}>
          <Statistic
            title="覆盖天数"
            value={totalDays}
            suffix="天"
            prefix={<CalendarOutlined />}
          />
        </Col>
        <Col xs={8}>
          <Statistic
            title="工作日"
            value={workdays}
            suffix="天"
            prefix={<FieldTimeOutlined />}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col xs={8}>
          <Statistic
            title="三倍工资日"
            value={triplePayDays}
            suffix="天"
            prefix={<DollarOutlined />}
            valueStyle={{ color: triplePayDays > 0 ? '#faad14' : undefined }}
          />
        </Col>
      </Row>
    </Card>
  );
};

export default SchedulingWindowDisplay;

