import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Card,
  Descriptions,
  Form,
  InputNumber,
  List,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Timeline,
  Typography,
  DatePicker,
  Divider,
  message
} from 'antd'
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import type {
  AutoPlanV4Result,
  BatchPlanSummary,
  ComprehensiveWorkTimeEmployeeStatus,
  OptimizationMetrics
} from '../types/scheduling'
import { runAutoPlanV4 } from '../services/schedulingService'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

interface V4SchedulingModalProps {
  visible: boolean
  batch: BatchPlanSummary | null
  onClose: () => void
  onSuccess?: () => void
}

interface FormValues {
  dateRange: [Dayjs, Dayjs]
  dryRun: boolean
  includeBaseRoster: boolean
  adaptiveParams: boolean
  earlyStop: boolean
  monthHourTolerance?: number
}

const statusTag = (status?: string) => {
  if (!status) return <Tag>未知</Tag>
  if (status === 'FAILED' || status === 'VIOLATION') {
    return (
      <Tag color="red" icon={<WarningOutlined />}>
        {status}
      </Tag>
    )
  }
  if (status === 'WARNING') {
    return <Tag color="orange">{status}</Tag>
  }
  return (
    <Tag color="green" icon={<CheckCircleOutlined />}>
      {status}
    </Tag>
  )
}

const buildOptimizationItems = (metrics?: OptimizationMetrics) => {
  if (!metrics) return []
  return [
    { label: '种群规模', value: metrics.populationSize },
    { label: '计划迭代数', value: metrics.generations },
    metrics.actualGenerations !== undefined
      ? { label: '实际迭代数', value: metrics.actualGenerations }
      : null,
    metrics.paretoFrontSize !== undefined
      ? { label: '帕累托前沿解数量', value: metrics.paretoFrontSize }
      : null,
    metrics.computationTime !== undefined
      ? { label: '计算耗时 (秒)', value: metrics.computationTime }
      : null
  ].filter(Boolean) as Array<{ label: string; value: number }>
}

const buildEmployeeDataSource = (employees: ComprehensiveWorkTimeEmployeeStatus[]) =>
  employees.map((item) => ({
    key: item.employeeId,
    name: item.employeeName,
    quarterHours: item.quarterHours,
    quarterStatus: item.quarterStatus,
    restDays: item.restDays,
    restDaysStatus: item.restDaysStatus,
    monthlyStatus: item.monthlyStatus
  }))

const V4SchedulingModal = ({ visible, batch, onClose, onSuccess }: V4SchedulingModalProps) => {
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AutoPlanV4Result | null>(null)

  useEffect(() => {
    if (visible) {
      form.resetFields()
      setResult(null)
      if (batch?.plannedStartDate && batch?.plannedEndDate) {
        form.setFieldsValue({
          dateRange: [dayjs(batch.plannedStartDate), dayjs(batch.plannedEndDate)],
          dryRun: true,
          includeBaseRoster: true,
          adaptiveParams: true,
          earlyStop: true,
          monthHourTolerance: 4
        } as Partial<FormValues>)
      } else {
        form.setFieldsValue({
          dryRun: true,
          includeBaseRoster: true,
          adaptiveParams: true,
          earlyStop: true,
          monthHourTolerance: 4
        } as Partial<FormValues>)
      }
    }
  }, [visible, form, batch])

  const coverageRateText = useMemo(() => {
    if (!result) return '—'
    const rate = (result.coverage.coverageRate || 0) * 100
    return `${rate.toFixed(2)}%`
  }, [result])

  const handleClose = () => {
    setResult(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!batch) {
      message.warning('未选择批次，无法执行 v4 排班')
      return
    }
    try {
      const values = await form.validateFields()
      const [start, end] = values.dateRange
      setLoading(true)
      const payload = {
        batchIds: [batch.id],
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        options: {
          dryRun: values.dryRun,
          includeBaseRoster: values.includeBaseRoster,
          adaptiveParams: values.adaptiveParams,
          earlyStop: values.earlyStop,
          ...(typeof values.monthHourTolerance === 'number'
            ? { monthHourTolerance: values.monthHourTolerance }
            : {})
        }
      }
      const response = await runAutoPlanV4(payload)
      setResult(response)
      if (response.run?.status === 'FAILED') {
        message.error(response.message || '智能排班 v4 执行失败')
      } else {
        message.success(response.message || '智能排班 v4 执行完成')
        onSuccess?.()
      }
    } catch (error: unknown) {
      const errMsg =
        (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data
          ?.message ||
        (error as Error).message ||
        '执行失败，请稍后再试'
      message.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const employeeColumns = [
    {
      title: '员工',
      dataIndex: 'name',
      key: 'name',
      width: 160
    },
    {
      title: '季度工时',
      dataIndex: 'quarterHours',
      key: 'quarterHours',
      width: 140,
      render: (value: number) => `${value.toFixed(1)} 小时`
    },
    {
      title: '季度状态',
      dataIndex: 'quarterStatus',
      key: 'quarterStatus',
      width: 150,
      render: (status: string) => statusTag(status)
    },
    {
      title: '休息天',
      dataIndex: 'restDays',
      key: 'restDays',
      width: 110,
      render: (_: number, record: { restDays: number; restDaysStatus: string }) => (
        <Space size={4}>
          <Text>{record.restDays}</Text>
          {statusTag(record.restDaysStatus)}
        </Space>
      )
    }
  ]

  return (
    <Modal
      width={960}
      title={
        <Space size={8}>
          <ExperimentOutlined />
          智能排班 v4（综合工时制优化）
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="执行排班"
      confirmLoading={loading}
      destroyOnClose
    >
      {!batch && (
        <Alert
          type="warning"
          showIcon
          message="请先选择一个已激活的批次，再执行智能排班 v4。"
          style={{ marginBottom: 16 }}
        />
      )}

      {batch && (
        <Descriptions
          size="small"
          column={3}
          layout="horizontal"
          style={{ marginBottom: 16 }}
          bordered
        >
          <Descriptions.Item label="批次编号">{batch.batchCode}</Descriptions.Item>
          <Descriptions.Item label="批次名称">{batch.batchName}</Descriptions.Item>
          <Descriptions.Item label="状态">{batch.planStatus}</Descriptions.Item>
          <Descriptions.Item label="计划开始">{batch.plannedStartDate ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="计划结束">{batch.plannedEndDate ?? '—'}</Descriptions.Item>
        </Descriptions>
      )}

      <Card
        title={
          <Space size={8}>
            <ThunderboltOutlined />
            排程配置
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label="排程周期"
            name="dateRange"
            rules={[{ required: true, message: '请选择排程周期' }]}
          >
            <RangePicker allowClear={false} />
          </Form.Item>

          <Space size="large">
            <Form.Item
              label="干跑（仅生成草案）"
              name="dryRun"
              valuePropName="checked"
              tooltip="开启后仅生成草案，不写入排班结果。"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="包含基础班表"
              name="includeBaseRoster"
              valuePropName="checked"
              tooltip="同时生成基础班表"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="自适应参数"
              name="adaptiveParams"
              valuePropName="checked"
              tooltip="根据问题规模自动调整优化参数"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="早停机制"
              name="earlyStop"
              valuePropName="checked"
              tooltip="在满足约束时提早结束迭代"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="月度工时容差（小时）"
              name="monthHourTolerance"
              tooltip="允许月度工时相对于标准上下浮动的范围，默认 ±8 小时"
              rules={[{ type: 'number', min: 0, message: '容差需 ≥ 0' }]}
            >
              <InputNumber min={0} max={200} addonAfter="小时" />
            </Form.Item>
          </Space>
        </Form>
      </Card>

      {result && (
        <>
          <Alert
            style={{ marginBottom: 16 }}
            type={result.run?.status === 'FAILED' ? 'error' : 'success'}
            showIcon
            message={result.message}
            description={
              <Space direction="vertical" size={4}>
                <Text>运行 ID：{result.run?.id ?? '—'}</Text>
                <Text>状态：{result.run?.status ?? '—'}</Text>
              </Space>
            }
          />

          <Card title="结果概览" size="small" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="排程区间">
                {result.period.startDate} ~ {result.period.endDate}
              </Descriptions.Item>
              <Descriptions.Item label="覆盖率">{coverageRateText}</Descriptions.Item>
              <Descriptions.Item label="处理员工">
                {result.summary.employeesTouched}
              </Descriptions.Item>
              <Descriptions.Item label="生成排班">
                {result.summary.operationsAssigned}
              </Descriptions.Item>
              <Descriptions.Item label="警告数量">{result.warnings.length}</Descriptions.Item>
              <Descriptions.Item label="日志记录数">{result.logs.length}</Descriptions.Item>
            </Descriptions>
          </Card>

          {result.optimizationMetrics && (
            <Card title="优化指标" size="small" style={{ marginBottom: 16 }}>
              <List
                size="small"
                dataSource={buildOptimizationItems(result.optimizationMetrics)}
                renderItem={(item) => (
                  <List.Item>
                    <Text strong>{item.label}</Text>
                    <Text style={{ marginLeft: 8 }}>{item.value}</Text>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {result.comprehensiveWorkTimeStatus?.employees?.length ? (
            <Card
              title="综合工时制合规状态"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Space size={12}>
                  <Text>
                    季度要求：≥
                    {result.comprehensiveWorkTimeStatus.quarterTargetHours
                      ? result.comprehensiveWorkTimeStatus.quarterTargetHours.toFixed(0)
                      : '—'}{' '}
                    小时
                  </Text>
                  <Text>
                    月度容差：±
                    {(
                      result.comprehensiveWorkTimeStatus.monthToleranceHours ?? 8
                    ).toFixed(0)}{' '}
                    小时
                  </Text>
                </Space>
              }
            >
              <Table
                size="small"
                scroll={{ y: 200 }}
                pagination={false}
                columns={employeeColumns}
                dataSource={buildEmployeeDataSource(result.comprehensiveWorkTimeStatus.employees)}
              />
            </Card>
          ) : null}

          {result.warnings.length > 0 && (
            <Card title="警告" size="small" style={{ marginBottom: 16 }}>
              <List
                size="small"
                dataSource={result.warnings}
                renderItem={(item, index) => (
                  <List.Item>
                    <Space size={8} align="start">
                      <Tag color="orange">{index + 1}</Tag>
                      <Text>{item}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}

          <Card title="执行日志" size="small">
            <Timeline
              mode="left"
              items={result.logs.map((log, index) => ({
                children: log,
                key: `${index}-${log.slice(0, 8)}`
              }))}
            />
          </Card>
        </>
      )}

      {!result && (
        <Card size="small">
          <Space direction="vertical" size={8}>
            <Title level={5} style={{ marginBottom: 0 }}>
              智能排班 v4 功能说明
            </Title>
            <Text type="secondary">
              v4 算法在 v3 的基础上强化了综合工时制、优先均衡一线员工，并支持自适应参数与早停机制。
            </Text>
            <Divider style={{ margin: '8px 0' }} />
            <Text>请先确认排程周期与参数，点击“执行排班”后即可查看详细结果。</Text>
          </Space>
        </Card>
      )}
    </Modal>
  )
}

export default V4SchedulingModal
