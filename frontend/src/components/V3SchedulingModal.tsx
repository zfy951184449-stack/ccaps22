import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Switch,
  Checkbox,
  Button,
  Space,
  Typography,
  Alert,
  Progress,
  Timeline,
  Card,
  Descriptions,
  Tag,
  List,
  Collapse,
  Spin,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  AppstoreOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mlSchedulingApi } from '../services/api';
import type { SchedulingRunEvent, SchedulingRunStage, SchedulingRunEventStatus } from '../types';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

// V3算法的10个阶段
const V3_STAGES = [
  { key: 1, label: '阶段1: 上下文准备与数据加载', stage: 'PREPARING' as SchedulingRunStage },
  { key: 2, label: '阶段2: 工作负载预测', stage: 'LOADING_DATA' as SchedulingRunStage },
  { key: 3, label: '阶段3: 操作排序与候选筛选', stage: 'PLANNING' as SchedulingRunStage },
  { key: 4, label: '阶段4: 多目标优化排班', stage: 'PLANNING' as SchedulingRunStage },
  { key: 5, label: '阶段5: 选择最优方案', stage: 'PLANNING' as SchedulingRunStage },
  { key: 6, label: '阶段6: 约束验证与修复', stage: 'PLANNING' as SchedulingRunStage },
  { key: 7, label: '阶段7: 工时均衡优化', stage: 'PLANNING' as SchedulingRunStage },
  { key: 8, label: '阶段8: 综合工时制适配', stage: 'PLANNING' as SchedulingRunStage },
  { key: 9, label: '阶段9: 结果持久化', stage: 'PERSISTING' as SchedulingRunStage },
  { key: 10, label: '阶段10: 质量评估', stage: 'COMPLETED' as SchedulingRunStage },
];

const STATUS_COLOR_MAP: Record<SchedulingRunEventStatus, string> = {
  INFO: 'blue',
  WARN: 'orange',
  ERROR: 'red',
  SUCCESS: 'green',
  PROGRESS: 'cyan',
};

const ORG_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FRONTLINE', label: '一线员工' },
  { value: 'SHIFT_LEADER', label: '班长（Shift Leader）' },
  { value: 'GROUP_LEADER', label: '组长（Group Leader）' },
  { value: 'TEAM_LEADER', label: '团队主管（Team Leader）' },
  { value: 'DEPT_MANAGER', label: '部门经理' },
];

// 5个优化目标
const OPTIMIZATION_OBJECTIVES = [
  { key: 'cost', label: '成本', color: 'red', icon: '💰' },
  { key: 'satisfaction', label: '满意度', color: 'green', icon: '😊' },
  { key: 'balance', label: '均衡度', color: 'blue', icon: '⚖️' },
  { key: 'skillMatch', label: '技能匹配', color: 'purple', icon: '🎯' },
  { key: 'compliance', label: '规则遵循', color: 'orange', icon: '✅' },
];

interface V3SchedulingModalProps {
  visible: boolean;
  batchIds: number[];
  onClose: () => void;
  onSuccess?: () => void;
}

interface AutoPlanResultData {
  message: string;
  period: {
    startDate: string;
    endDate: string;
    quarter: string;
  };
  batches: Array<{
    batchPlanId: number;
    batchCode: string;
    start: string | null;
    end: string | null;
    totalOperations: number;
  }>;
  warnings: string[];
  run: {
    id: number;
    key: string;
    status: 'RUNNING' | 'DRAFT' | 'PENDING_PUBLISH' | 'PUBLISHED' | 'ROLLED_BACK' | 'FAILED';
    resultId: number;
  };
  summary: {
    employeesTouched: number;
    operationsCovered: number;
    overtimeEntries: number;
    baseRosterRows: number;
    operationsAssigned: number;
  };
  diagnostics: {
    missingCalendar?: boolean;
  };
  logs: string[];
  coverage: {
    totalOperations: number;
    fullyCovered: number;
    coverageRate: number;
    gaps: Array<{
      operationPlanId: number;
      operationName: string;
      batchCode: string;
      planDate: string;
      requiredPeople: number;
      assignedPeople: number;
      category: 'HEADCOUNT' | 'QUALIFICATION' | 'OTHER';
      notes: string[];
      suggestions: string[];
    }>;
    gapTotals: {
      headcount: number;
      qualification: number;
      other: number;
    };
  };
  metricsSummary?: {
    gapTotals?: {
      headcount: number;
      qualification: number;
      other: number;
    };
    qualityMetrics?: {
      cost?: number;
      satisfaction?: number;
      balance?: number;
      skillMatch?: number;
      compliance?: number;
      overall?: number;
    };
  };
}

const V3SchedulingModal: React.FC<V3SchedulingModalProps> = ({
  visible,
  batchIds,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [configVisible, setConfigVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutoPlanResultData | null>(null);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // 解析日志，提取阶段信息
  const parseLogs = useCallback((logArray: string[]) => {
    let maxStage = 0;
    const parsedLogs: Array<{ stage: number; message: string; time?: string }> = [];

    logArray.forEach((log) => {
      // 提取阶段号
      const stageMatch = log.match(/阶段(\d+)/);
      if (stageMatch) {
        const stageNum = parseInt(stageMatch[1], 10);
        maxStage = Math.max(maxStage, stageNum);
        
        // 提取耗时信息
        const timeMatch = log.match(/耗时\s+([\d.]+)\s+秒/);
        parsedLogs.push({
          stage: stageNum,
          message: log,
          time: timeMatch ? `${timeMatch[1]}秒` : undefined,
        });
      } else {
        parsedLogs.push({
          stage: 0,
          message: log,
        });
      }
    });

    return { maxStage, parsedLogs };
  }, []);

  // 执行排班
  const executeScheduling = async () => {
    try {
      const values = await form.validateFields();
      setConfigVisible(false);
      setLoading(true);
      setResult(null);
      setCurrentStage(0);
      setLogs([]);
      setWarnings([]);

      const dateRange = values.dateRange as [Dayjs, Dayjs] | null;
      const payload = {
        batchIds,
        ...(dateRange && {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
        }),
        options: {
          dryRun: values.dryRun,
          ...(Array.isArray(values.allowedOrgRoles) && {
            allowedOrgRoles: values.allowedOrgRoles
              .map((role: string) => String(role).trim())
              .filter((role: string) => Boolean(role)),
          }),
        },
      };

      const response = await mlSchedulingApi.autoPlanV3(payload);
      const resultData: AutoPlanResultData = response;

      // 处理日志和阶段
      if (resultData.logs && Array.isArray(resultData.logs)) {
        setLogs(resultData.logs);
        const { maxStage } = parseLogs(resultData.logs);
        setCurrentStage(maxStage);
      }

      if (resultData.warnings) {
        setWarnings(resultData.warnings);
      }

      setResult(resultData);
      setLoading(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('V3 scheduling failed:', error);
      setLoading(false);
      setConfigVisible(true);
    }
  };

  // 计算进度百分比
  const progressPercent = result
    ? result.run.status === 'FAILED'
      ? 0
      : result.run.status === 'DRAFT' || result.run.status === 'PENDING_PUBLISH' || result.run.status === 'PUBLISHED'
      ? 100
      : (currentStage / 10) * 100
    : 0;

  // 获取当前阶段标签
  const currentStageLabel =
    currentStage > 0 && currentStage <= 10
      ? V3_STAGES[currentStage - 1].label
      : '准备中...';

  // 渲染质量指标
  const renderQualityMetrics = (metrics?: {
    cost?: number;
    satisfaction?: number;
    balance?: number;
    skillMatch?: number;
    compliance?: number;
    overall?: number;
  }) => {
    if (!metrics) return null;

    return (
      <Row gutter={16}>
        {OPTIMIZATION_OBJECTIVES.map((obj) => {
          const value = metrics[obj.key as keyof typeof metrics];
          if (typeof value !== 'number') return null;

          return (
            <Col span={8} key={obj.key} style={{ marginBottom: 16 }}>
              <Card size="small">
                <Statistic
                  title={
                    <Space>
                      <span>{obj.icon}</span>
                      <span>{obj.label}</span>
                    </Space>
                  }
                  value={value}
                  precision={2}
                  valueStyle={{ color: obj.color }}
                />
              </Card>
            </Col>
          );
        })}
        {typeof metrics.overall === 'number' && (
          <Col span={24} style={{ marginTop: 8 }}>
            <Card size="small" style={{ background: '#f0f2f5' }}>
              <Statistic
                title="总体质量评分"
                value={metrics.overall}
                precision={2}
                valueStyle={{ fontSize: 24, color: '#1890ff' }}
                prefix={<ExperimentOutlined />}
              />
            </Card>
          </Col>
        )}
      </Row>
    );
  };

  // 重置状态
  const handleReset = () => {
    setConfigVisible(true);
    setResult(null);
    setCurrentStage(0);
    setLogs([]);
    setWarnings([]);
    form.resetFields();
  };

  return (
    <Modal
      title={
        <Space>
          <AppstoreOutlined style={{ color: '#667eea' }} />
          <span>智能排班v3（ML算法）</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      destroyOnClose
    >
      {configVisible ? (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            dryRun: true,
            allowedOrgRoles: ORG_ROLE_OPTIONS.map((item) => item.value),
          }}
        >
          <Alert
            type="info"
            showIcon
            message="智能排班v3算法说明"
            description={
              <div>
                <p>
                  智能排班v3采用基于机器学习的多目标优化算法，实现了"预测-优化-验证-后处理"的完整流水线。
                </p>
                <p style={{ marginTop: 8 }}>
                  <strong>优化目标：</strong>成本、满意度、均衡度、技能匹配、规则遵循
                </p>
                <p style={{ marginTop: 8 }}>
                  <strong>核心特性：</strong>
                </p>
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  <li>使用机器学习预测工作负载和员工适应性</li>
                  <li>NSGA-II多目标优化算法生成帕累托最优解</li>
                  <li>10阶段完整流程，确保排班质量</li>
                  <li>综合工时制自动适配</li>
                </ul>
              </div>
            }
            style={{ marginBottom: 24 }}
          />

          <Form.Item
            label="排程周期"
            name="dateRange"
            tooltip="可选，留空则自动从批次时间窗口推导"
          >
            <RangePicker format="YYYY-MM-DD" allowClear style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="干跑（仅生成草案）" name="dryRun" valuePropName="checked">
            <Switch
              onChange={(checked) => {
                if (checked) {
                  form.setFieldsValue({ publishNow: false });
                }
              }}
            />
          </Form.Item>

          <Form.Item
            label="参与角色"
            name="allowedOrgRoles"
            tooltip="仅在勾选的组织角色中寻找候选人"
          >
            <Checkbox.Group options={ORG_ROLE_OPTIONS} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={executeScheduling}>
                执行排班
              </Button>
              <Button onClick={onClose}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      ) : loading ? (
        <Space direction="vertical" size={16} style={{ width: '100%', alignItems: 'center', padding: '48px 0' }}>
          <Spin size="large" />
          <Text type="secondary">正在执行智能排班v3，请稍候…</Text>
          <div style={{ width: '100%', padding: '16px', background: '#fafafa', borderRadius: 4, marginTop: 16 }}>
            <Progress
              percent={progressPercent}
              status={progressPercent === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#667eea',
                '100%': '#764ba2',
              }}
              style={{ marginBottom: 16 }}
            />
            <Text strong style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
              当前阶段：{currentStageLabel}
            </Text>
            {logs.length > 0 && (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: '8px',
                  background: '#fff',
                  borderRadius: 4,
                  marginTop: 12,
                }}
              >
                <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                  执行日志：
                </Text>
                <Timeline
                  items={logs.slice(-10).map((log, index) => {
                    const stageMatch = log.match(/阶段(\d+)/);
                    const stageNum = stageMatch ? parseInt(stageMatch[1], 10) : 0;
                    const timeMatch = log.match(/耗时\s+([\d.]+)\s+秒/);
                    const isCompleted = log.includes('完成');

                    return {
                      key: `log-${index}`,
                      color: isCompleted ? 'green' : 'blue',
                      children: (
                        <div>
                          <Text style={{ fontSize: 12, fontWeight: 500 }}>
                            {stageNum > 0 ? V3_STAGES[stageNum - 1]?.label : '处理中'}
                          </Text>
                          <Text style={{ fontSize: 12, display: 'block', marginTop: 4, color: '#666' }}>
                            {log}
                          </Text>
                          {timeMatch && (
                            <Text style={{ fontSize: 11, display: 'block', marginTop: 2, color: '#999' }}>
                              耗时：{timeMatch[1]}秒
                            </Text>
                          )}
                        </div>
                      ),
                    };
                  })}
                />
              </div>
            )}
          </div>
        </Space>
      ) : result ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 进度总结 */}
          <Card size="small">
            <Progress
              percent={progressPercent}
              status={result.run.status === 'FAILED' ? 'exception' : 'success'}
              strokeColor={{
                '0%': '#667eea',
                '100%': '#764ba2',
              }}
            />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Statistic title="执行状态" value={(() => {
                  switch (result.run.status) {
                    case 'PUBLISHED': return '已发布';
                    case 'DRAFT': return '草案';
                    case 'PENDING_PUBLISH': return '待发布';
                    case 'FAILED': return '失败';
                    default: return '已完成';
                  }
                })()} />
              </Col>
              <Col span={8}>
                <Statistic title="完成阶段" value={`${currentStage}/10`} />
              </Col>
              <Col span={8}>
                <Statistic title="运行ID" value={result.run.id} />
              </Col>
            </Row>
          </Card>

          {/* 基本信息 */}
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="周期">
              {result.period.startDate} ~ {result.period.endDate}
            </Descriptions.Item>
            <Descriptions.Item label="季度">{result.period.quarter}</Descriptions.Item>
            <Descriptions.Item label="结果">{result.message}</Descriptions.Item>
            <Descriptions.Item label="运行状态">
              <Tag
                color={
                  result.run.status === 'PUBLISHED'
                    ? 'green'
                    : result.run.status === 'FAILED'
                    ? 'red'
                    : 'orange'
                }
              >
                {result.run.status === 'PUBLISHED'
                  ? '已发布'
                  : result.run.status === 'FAILED'
                  ? '失败'
                  : '草案'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="摘要">
              <Space size={12} wrap>
                <Tag color="blue">员工 {result.summary.employeesTouched}</Tag>
                <Tag color="cyan">
                  操作 {result.summary.operationsAssigned}/{result.summary.operationsCovered}
                </Tag>
                <Tag color="purple">基础班次 {result.summary.baseRosterRows}</Tag>
                <Tag color="red">加班 {result.summary.overtimeEntries}</Tag>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="覆盖率">
              <Tag color={result.coverage.coverageRate >= 1 ? 'green' : 'red'}>
                覆盖率 {(result.coverage.coverageRate * 100).toFixed(2)}%
              </Tag>
              <div style={{ marginTop: 8 }}>
                满足 {result.coverage.fullyCovered}/{result.coverage.totalOperations} 个操作
              </div>
              <Space size={8} wrap style={{ marginTop: 8 }}>
                <Tag color="volcano">人数缺口 {result.coverage.gapTotals.headcount}</Tag>
                <Tag color="geekblue">资质缺口 {result.coverage.gapTotals.qualification}</Tag>
                <Tag color="default">其他缺口 {result.coverage.gapTotals.other}</Tag>
              </Space>
            </Descriptions.Item>
          </Descriptions>

          {/* 质量指标 */}
          {result.metricsSummary?.qualityMetrics && (
            <Card title="质量评估指标" size="small">
              {renderQualityMetrics(result.metricsSummary.qualityMetrics)}
            </Card>
          )}

          {/* 警告信息 */}
          {warnings.length > 0 && (
            <Alert
              type="warning"
              message="提醒"
              description={
                <List
                  size="small"
                  dataSource={warnings}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              }
              showIcon
            />
          )}

          {/* 详细信息折叠面板 */}
          <Collapse
            defaultActiveKey={['coverage', 'logs']}
            items={[
              {
                key: 'coverage',
                label: `覆盖缺口 (${result.coverage.gaps.length})`,
                children:
                  result.coverage.gaps.length === 0 ? (
                    <Alert type="success" message="所有操作均已覆盖" showIcon />
                  ) : (
                    <List
                      size="small"
                      dataSource={result.coverage.gaps}
                      renderItem={(gap) => (
                        <List.Item>
                          <Space direction="vertical" style={{ width: '100%' }} size={4}>
                            <Space size={8} wrap>
                              <Tag
                                color={
                                  gap.category === 'HEADCOUNT'
                                    ? 'volcano'
                                    : gap.category === 'QUALIFICATION'
                                    ? 'geekblue'
                                    : 'default'
                                }
                              >
                                {gap.category === 'HEADCOUNT'
                                  ? '人数缺口'
                                  : gap.category === 'QUALIFICATION'
                                  ? '资质缺口'
                                  : '其他缺口'}
                              </Tag>
                              <Tag color="blue">{gap.batchCode}</Tag>
                              <Text strong>{gap.operationName}</Text>
                              <Tag color="gold">{gap.planDate}</Tag>
                              <span>
                                需 {gap.requiredPeople} 人，已分配 {gap.assignedPeople} 人
                              </span>
                            </Space>
                            {gap.notes.length > 0 && (
                              <Space direction="vertical" size={2}>
                                {gap.notes.map((note, index) => (
                                  <Text type="secondary" key={`note-${gap.operationPlanId}-${index}`}>
                                    • {note}
                                  </Text>
                                ))}
                              </Space>
                            )}
                            {gap.suggestions.length > 0 && (
                              <Space direction="vertical" size={2}>
                                {gap.suggestions.map((sugg, index) => (
                                  <Text key={`sugg-${gap.operationPlanId}-${index}`}>
                                    建议：{sugg}
                                  </Text>
                                ))}
                              </Space>
                            )}
                          </Space>
                        </List.Item>
                      )}
                    />
                  ),
              },
              {
                key: 'logs',
                label: `执行日志 (${logs.length})`,
                children: (
                  <List
                    size="small"
                    dataSource={logs}
                    renderItem={(item, index) => (
                      <List.Item>
                        <Text>
                          {index + 1}. {item}
                        </Text>
                      </List.Item>
                    )}
                    locale={{ emptyText: '暂无日志' }}
                  />
                ),
              },
            ]}
          />

          {/* 操作按钮 */}
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleReset}>
              重新配置
            </Button>
            <Button onClick={onClose}>关闭</Button>
          </Space>
        </Space>
      ) : null}
    </Modal>
  );
};

export default V3SchedulingModal;

