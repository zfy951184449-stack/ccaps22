import React from 'react';
import {
  Card,
  Typography,
  Statistic,
  Row,
  Col,
  Table,
  Tag,
  Divider,
  Collapse,
  Space,
  Empty,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  CalendarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { SolveRun } from './types';
import dayjs from 'dayjs';

interface SolveResultSummaryProps {
  run: SolveRun | null;
  detailedResult?: any; // 详细结果数据
}

const SolveResultSummary: React.FC<SolveResultSummaryProps> = ({
  run,
  detailedResult,
}) => {
  if (!run || run.status !== 'COMPLETED') {
    return (
      <Card title="求解结果">
        <Empty description="暂无结果" />
      </Card>
    );
  }

  const summary = run.result_summary;

  return (
    <Card
      className="solve-result-summary"
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>求解结果</span>
          <Tag color="success">{run.run_code}</Tag>
        </Space>
      }
    >
      {/* 概览统计 */}
      <Row gutter={[24, 24]}>
        <Col span={6}>
          <Statistic
            title="人员分配"
            value={summary?.totalAssignments || 0}
            suffix="条"
            prefix={<TeamOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="班次计划"
            value={summary?.totalShiftPlans || 0}
            suffix="条"
            prefix={<CalendarOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="求解状态"
            value={
              summary?.status === 'OPTIMAL' ? '最优解' :
              summary?.status === 'FEASIBLE' ? '可行解' : '无解'
            }
            valueStyle={{
              color: summary?.status === 'OPTIMAL' ? '#52c41a' :
                     summary?.status === 'FEASIBLE' ? '#1890ff' : '#ff4d4f'
            }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="运行时长"
            value={
              run.completed_at && run.created_at
                ? dayjs(run.completed_at).diff(dayjs(run.created_at), 'second')
                : 0
            }
            suffix="秒"
            prefix={<ClockCircleOutlined />}
          />
        </Col>
      </Row>

      <Divider />

      {/* 详细信息 */}
      <Collapse
        items={[
          {
            key: 'details',
            label: (
              <Space>
                <span>详细信息</span>
                {summary?.message && (
                  <Tag color="blue">{summary.message}</Tag>
                )}
              </Space>
            ),
            children: (
              <div>
                <Typography.Paragraph>
                  <Typography.Text strong>求解区间：</Typography.Text>
                  {' '}
                  {run.window_start} ~ {run.window_end}
                </Typography.Paragraph>
                <Typography.Paragraph>
                  <Typography.Text strong>目标批次：</Typography.Text>
                  {' '}
                  {run.target_batch_ids.join(', ')}
                </Typography.Paragraph>
                <Typography.Paragraph>
                  <Typography.Text strong>创建时间：</Typography.Text>
                  {' '}
                  {dayjs(run.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Typography.Paragraph>
                <Typography.Paragraph>
                  <Typography.Text strong>完成时间：</Typography.Text>
                  {' '}
                  {run.completed_at ? dayjs(run.completed_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                </Typography.Paragraph>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default SolveResultSummary;

