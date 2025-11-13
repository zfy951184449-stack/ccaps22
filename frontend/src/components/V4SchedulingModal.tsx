import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Switch,
  Button,
  Space,
  Typography,
  Alert,
  Progress,
  Timeline,
  Card,
  Descriptions,
  Tag,
  Collapse,
  Spin,
  Statistic,
  Row,
  Col,
  Tabs,
  Divider,
  InputNumber,
} from 'antd';
import {
  AppstoreOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mlSchedulingApi } from '../services/api';
import ComprehensiveWorkTimeStatus from './ComprehensiveWorkTimeStatus';
import ScheduleQualityRadar from './ScheduleQualityRadar';
import type { SchedulingRunEvent, SchedulingRunStage, SchedulingRunEventStatus } from '../types';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

// V4算法的10个阶段（与v3相同，但日志会显示v4改进）
const V4_STAGES = [
  { key: 1, label: '阶段1: 上下文准备与数据加载', stage: 'PREPARING' as SchedulingRunStage },
  { key: 2, label: '阶段2: 工作负载预测', stage: 'LOADING_DATA' as SchedulingRunStage },
  { key: 3, label: '阶段3: 操作排序与候选筛选（v4：优先使用一线员工）', stage: 'PLANNING' as SchedulingRunStage },
  { key: 4, label: '阶段4: 多目标优化排班（v4：自适应参数+早停机制）', stage: 'PLANNING' as SchedulingRunStage },
  { key: 5, label: '阶段5: 选择最优方案', stage: 'PLANNING' as SchedulingRunStage },
  { key: 6, label: '阶段6: 约束验证与修复', stage: 'PLANNING' as SchedulingRunStage },
  { key: 7, label: '阶段7: 工时均衡优化（v4：优先均衡一线员工）', stage: 'PLANNING' as SchedulingRunStage },
  { key: 8, label: '阶段8: 综合工时制适配', stage: 'PLANNING' as SchedulingRunStage },
  { key: 9, label: '阶段9: 结果持久化', stage: 'PERSISTING' as SchedulingRunStage },
  { key: 10, label: '阶段10: 质量评估', stage: 'COMPLETED' as SchedulingRunStage },
];

interface V4SchedulingModalProps {
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
    qualityMetrics?: {
      cost?: number;
      satisfaction?: number;
      balance?: number;
      skillMatch?: number;
      compliance?: number;
      overall?: number;
    };
  };
  optimizationMetrics?: {
    populationSize: number;
    generations: number;
    actualGenerations?: number;
    computationTime?: number;
    paretoFrontSize: number;
  };
  comprehensiveWorkTimeStatus?: {
    employees: Array<{
      employeeId: number;
      employeeName: string;
      quarterHours: number;
      quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      monthlyStatus: Array<{
        month: string;
        hours: number;
        status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      }>;
      restDays: number;
      restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    }>;
    quarterTargetHours: number;
    quarterMinHours: number;
    quarterMaxHours: number;
    monthToleranceHours?: number;
  };
}

const V4SchedulingModal: React.FC<V4SchedulingModalProps> = ({
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
      const stageMatch = log.match(/阶段(\d+)/);
      if (stageMatch) {
        const stageNum = parseInt(stageMatch[1], 10);
        maxStage = Math.max(maxStage, stageNum);
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
          adaptiveParams: values.adaptiveParams !== false, // 默认启用
          earlyStop: values.earlyStop !== false, // 默认启用
          ...(typeof values.monthHourTolerance === 'number'
            ? { monthHourTolerance: values.monthHourTolerance }
            : {}),
        },
      };

      const response = await mlSchedulingApi.autoPlanV4(payload);
      const resultData: AutoPlanResultData = response;

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
      console.error('V4 scheduling failed:', error);
      setLoading(false);
      setConfigVisible(true);
    }
  };

  const progressPercent = result
    ? result.run.status === 'FAILED'
      ? 0
      : result.run.status === 'DRAFT' || result.run.status === 'PENDING_PUBLISH' || result.run.status === 'PUBLISHED'
      ? 100
      : (currentStage / 10) * 100
    : 0;

  const currentStageLabel =
    currentStage > 0 && currentStage <= 10
      ? V4_STAGES[currentStage - 1].label
      : '准备中...';

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
          <RocketOutlined style={{ color: '#52c41a' }} />
          <span>智能排班v4（综合工时制优化版）</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      destroyOnClose
    >
      {configVisible ? (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            dryRun: false,
            adaptiveParams: true,
            earlyStop: false,
            monthHourTolerance: 8,
          }}
        >
          <Form.Item
            name="dateRange"
            label="排班周期（可选）"
            tooltip="留空则自动从批次时间窗口推导"
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="dryRun"
            valuePropName="checked"
            tooltip="试运行模式，不会实际保存排班结果"
          >
            <Switch checkedChildren="试运行" unCheckedChildren="正式运行" />
          </Form.Item>

          <Form.Item
            name="adaptiveParams"
            valuePropName="checked"
            tooltip="根据问题规模自动调整优化参数（种群大小、迭代次数）"
          >
            <Switch checkedChildren="启用自适应参数" unCheckedChildren="禁用自适应参数" />
          </Form.Item>

          <Form.Item
            name="earlyStop"
            valuePropName="checked"
            tooltip="如果找到满足约束的解或连续无改进，提前终止优化"
          >
            <Switch checkedChildren="启用早停机制" unCheckedChildren="禁用早停机制" />
          </Form.Item>

          <Form.Item
            name="monthHourTolerance"
            label="月度工时容差（小时）"
            tooltip="允许月度工时在标准值上下浮动的范围，默认 ±8 小时"
            rules={[
              {
                type: 'number',
                min: 0,
                message: '容差需大于或等于 0',
              },
            ]}
          >
            <InputNumber min={0} max={200} addonAfter="小时" style={{ width: 220 }} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={executeScheduling}>
                开始排班
              </Button>
              <Button onClick={onClose}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      ) : (
        <Spin spinning={loading} tip={currentStageLabel}>
          {result ? (
            <Tabs defaultActiveKey="summary" items={[
              {
                key: 'summary',
                label: '排班结果',
                children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 进度条 */}
                  <Card>
                    <Progress
                      percent={progressPercent}
                      status={result.run.status === 'FAILED' ? 'exception' : 'active'}
                      format={() => `${currentStage}/10`}
                    />
                    <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                      {currentStageLabel}
                    </Text>
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
                      <Progress
                        type="circle"
                        percent={Math.round(result.coverage.coverageRate * 100)}
                        size={80}
                        format={(percent) => `${percent}%`}
                      />
                    </Descriptions.Item>
                  </Descriptions>

                  {/* v4新增：优化指标 */}
                  {result.optimizationMetrics && (
                    <Card title="优化指标" size="small">
                      <Row gutter={16}>
                        <Col span={6}>
                          <Statistic
                            title="种群大小"
                            value={result.optimizationMetrics.populationSize}
                          />
                        </Col>
                        <Col span={6}>
                          <Statistic
                            title="计划迭代"
                            value={result.optimizationMetrics.generations}
                          />
                        </Col>
                        <Col span={6}>
                          <Statistic
                            title="实际迭代"
                            value={result.optimizationMetrics.actualGenerations || result.optimizationMetrics.generations}
                            valueStyle={{ color: result.optimizationMetrics.actualGenerations && result.optimizationMetrics.actualGenerations < result.optimizationMetrics.generations ? '#52c41a' : undefined }}
                          />
                        </Col>
                        <Col span={6}>
                          <Statistic
                            title="帕累托前沿解"
                            value={result.optimizationMetrics.paretoFrontSize}
                          />
                        </Col>
                      </Row>
                    </Card>
                  )}

                  {/* 质量指标雷达图 */}
                  {result.metricsSummary?.qualityMetrics && (
                    <ScheduleQualityRadar
                      qualityMetrics={result.metricsSummary.qualityMetrics}
                      title="排班质量指标（雷达图）"
                    />
                  )}

                  {/* 警告信息 */}
                  {warnings.length > 0 && (
                    <Alert
                      message="警告信息"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      }
                      type="warning"
                      showIcon
                    />
                  )}
                </Space>
              ),
              },
              // v4新增：综合工时制合规状态
              ...(result.comprehensiveWorkTimeStatus ? [{
                key: 'comprehensive',
                label: '综合工时制合规',
                children: (
                  <ComprehensiveWorkTimeStatus
                    employees={result.comprehensiveWorkTimeStatus.employees}
                    quarterTargetHours={result.comprehensiveWorkTimeStatus.quarterTargetHours}
                    monthToleranceHours={result.comprehensiveWorkTimeStatus.monthToleranceHours}
                  />
                ),
              }] : []),
              {
                key: 'coverage',
                label: '覆盖率详情',
                children: (
                <Card title="操作覆盖情况" bordered={false}>
                  <Descriptions size="small" bordered column={2}>
                    <Descriptions.Item label="总操作数">
                      {result.coverage.totalOperations}
                    </Descriptions.Item>
                    <Descriptions.Item label="完全覆盖">
                      {result.coverage.fullyCovered}
                    </Descriptions.Item>
                    <Descriptions.Item label="覆盖率">
                      {(result.coverage.coverageRate * 100).toFixed(1)}%
                    </Descriptions.Item>
                    <Descriptions.Item label="缺口统计">
                      <Space>
                        <Tag color="red">人数不足: {result.coverage.gapTotals.headcount}</Tag>
                        <Tag color="orange">资质不匹配: {result.coverage.gapTotals.qualification}</Tag>
                        <Tag color="gray">其他: {result.coverage.gapTotals.other}</Tag>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>

                  {result.coverage.gaps.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Title level={5}>缺口详情</Title>
                      <Collapse>
                        {result.coverage.gaps.map((gap) => (
                          <Collapse.Panel
                            key={gap.operationPlanId}
                            header={`${gap.operationName} (${gap.batchCode}) - ${gap.planDate}`}
                          >
                            <Descriptions size="small" column={1}>
                              <Descriptions.Item label="需要人数">
                                {gap.requiredPeople}
                              </Descriptions.Item>
                              <Descriptions.Item label="已分配人数">
                                {gap.assignedPeople}
                              </Descriptions.Item>
                              <Descriptions.Item label="缺口类型">
                                <Tag
                                  color={
                                    gap.category === 'HEADCOUNT'
                                      ? 'red'
                                      : gap.category === 'QUALIFICATION'
                                      ? 'orange'
                                      : 'gray'
                                  }
                                >
                                  {gap.category === 'HEADCOUNT'
                                    ? '人数不足'
                                    : gap.category === 'QUALIFICATION'
                                    ? '资质不匹配'
                                    : '其他'}
                                </Tag>
                              </Descriptions.Item>
                              {gap.notes.length > 0 && (
                                <Descriptions.Item label="备注">
                                  <ul>
                                    {gap.notes.map((note, idx) => (
                                      <li key={idx}>{note}</li>
                                    ))}
                                  </ul>
                                </Descriptions.Item>
                              )}
                              {gap.suggestions.length > 0 && (
                                <Descriptions.Item label="建议">
                                  <ul>
                                    {gap.suggestions.map((suggestion, idx) => (
                                      <li key={idx}>{suggestion}</li>
                                    ))}
                                  </ul>
                                </Descriptions.Item>
                              )}
                            </Descriptions>
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    </div>
                  )}
                </Card>
              ),
              },
              {
                key: 'logs',
                label: '执行日志',
                children: (
                  <Timeline>
                    {logs.map((log, idx) => (
                      <Timeline.Item key={idx}>
                        <Text>{log}</Text>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                ),
              },
            ]} />
          ) : (
            <Space
              direction="vertical"
              size={16}
              style={{ width: '100%', alignItems: 'center', padding: '48px 0' }}
            >
              <Spin size="large" />
              <Text type="secondary">正在执行智能排班v4，请稍候…</Text>
            </Space>
          )}

          {result && (
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重新排班
                </Button>
                <Button type="primary" onClick={onClose}>
                  关闭
                </Button>
              </Space>
            </div>
          )}
        </Spin>
      )}
    </Modal>
  );
};

export default V4SchedulingModal;
