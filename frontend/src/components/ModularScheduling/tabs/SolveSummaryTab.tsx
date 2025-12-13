import React from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Progress,
  Alert,
  Descriptions,
  Tag,
  Empty,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  CalendarOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { SolveResult, SolverWarning } from '../types';

interface SolveSummaryTabProps {
  result: SolveResult;
}

const SolveSummaryTab: React.FC<SolveSummaryTabProps> = ({ result }) => {
  const diag = result.diagnostics;

  // 渲染警告
  const renderWarnings = () => {
    if (!result.warnings?.length) return null;

    return (
      <div className="warnings-section" style={{ marginBottom: 16 }}>
        {result.warnings.map((warning: SolverWarning, index: number) => (
          <Alert
            key={index}
            type="warning"
            message={warning.message}
            description={
              warning.count ? `涉及 ${warning.count} 个项目` : undefined
            }
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 8 }}
          />
        ))}
      </div>
    );
  };

  if (!diag) {
    return <Empty description="暂无诊断信息" />;
  }

  // 计算完成率
  const operationRate = diag.total_operations > 0 
    ? (diag.assigned_operations / diag.total_operations * 100) 
    : 100;
  const positionRate = diag.total_positions > 0 
    ? (diag.assigned_positions / diag.total_positions * 100) 
    : 100;

  return (
    <div className="solve-summary-tab">
      {/* 状态提示 */}
      {result.error_message ? (
        <Alert
          type="error"
          message="求解失败"
          description={result.error_message}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type={result.status === 'OPTIMAL' ? 'success' : 'info'}
          message={result.summary || '求解完成'}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {renderWarnings()}

      {/* 操作分配统计 */}
      <Card 
        size="small" 
        title="操作分配统计" 
        style={{ marginBottom: 16 }}
        className="summary-card"
      >
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Statistic
              title="操作总数"
              value={diag.total_operations}
              prefix={<CalendarOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="已分配操作"
              value={diag.assigned_operations}
              valueStyle={{ color: diag.assigned_operations === diag.total_operations ? '#52c41a' : '#faad14' }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="操作岗位总数"
              value={diag.total_positions}
              prefix={<TeamOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="已分配岗位"
              value={diag.assigned_positions}
              valueStyle={{ color: diag.assigned_positions === diag.total_positions ? '#52c41a' : '#faad14' }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={12}>
            <div style={{ marginBottom: 8 }}>
              操作完成率: {operationRate.toFixed(1)}%
            </div>
            <Progress
              percent={Math.round(operationRate)}
              status={operationRate >= 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 8 }}>
              岗位完成率: {positionRate.toFixed(1)}%
            </div>
            <Progress
              percent={Math.round(positionRate)}
              status={positionRate >= 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* 员工排班统计 */}
      <Card 
        size="small" 
        title="员工排班统计" 
        style={{ marginBottom: 16 }}
        className="summary-card"
      >
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Statistic
              title="安排班次的员工数"
              value={diag.employees_with_shifts || diag.total_employees}
              prefix={<TeamOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="生成的班次计划数"
              value={diag.shift_plans_created}
              prefix={<CalendarOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="员工利用率"
              value={(diag.employee_utilization_rate * 100).toFixed(1)}
              suffix="%"
              prefix={<ThunderboltOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* 求解器统计 */}
      <Card 
        size="small" 
        title="求解器统计" 
        style={{ marginBottom: 16 }}
        className="summary-card"
      >
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Statistic
              title="求解得分"
              value={diag.objective_value ?? '-'}
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="找到的解数量"
              value={diag.solutions_found}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="求解用时"
              value={diag.solve_time_seconds?.toFixed(1) || '-'}
              suffix="秒"
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="排班天数"
              value={diag.total_days}
              suffix="天"
              prefix={<CalendarOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* 约束满足情况 */}
      <Card 
        size="small" 
        title="约束满足情况" 
        className="summary-card"
      >
        <Descriptions size="small" bordered column={3}>
          <Descriptions.Item label="月度工时违规">
            {diag.monthly_hours_violations === 0 ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>0</Tag>
            ) : (
              <Tag color="error" icon={<CloseCircleOutlined />}>{diag.monthly_hours_violations}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="连续工作违规">
            {diag.consecutive_work_violations === 0 ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>0</Tag>
            ) : (
              <Tag color="error" icon={<CloseCircleOutlined />}>{diag.consecutive_work_violations}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="夜班休息违规">
            {diag.night_rest_violations === 0 ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>0</Tag>
            ) : (
              <Tag color="warning" icon={<WarningOutlined />}>{diag.night_rest_violations}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="未分配操作">
            {diag.skipped_operations === 0 ? (
              <Tag color="success">0</Tag>
            ) : (
              <Tag color="warning">{diag.skipped_operations}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="未分配岗位">
            {diag.skipped_positions === 0 ? (
              <Tag color="success">0</Tag>
            ) : (
              <Tag color="warning">{diag.skipped_positions}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="操作满足率">
            <Tag color={diag.operation_fulfillment_rate >= 1 ? 'success' : 'warning'}>
              {(diag.operation_fulfillment_rate * 100).toFixed(1)}%
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default SolveSummaryTab;


