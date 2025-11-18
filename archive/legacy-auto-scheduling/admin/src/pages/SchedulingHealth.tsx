import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  DatePicker
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import {
  computeSchedulingMetrics,
  fetchMetricsHistory
} from '../services/schedulingService'
import type {
  ComputeMetricsPayload,
  SchedulingMetric,
  SchedulingMetricsSnapshot
} from '../types/scheduling'

const { Title, Paragraph } = Typography

type MetricTableRecord = SchedulingMetric & { key: string }

type PeriodOption = 'MONTHLY' | 'QUARTERLY'

const periodOptions: Array<{ label: string; value: PeriodOption }> = [
  { label: '按月', value: 'MONTHLY' },
  { label: '按季度', value: 'QUARTERLY' }
]

const gradeColorMap: Record<string, string> = {
  EXCELLENT: 'green',
  GOOD: 'blue',
  WARNING: 'orange',
  CRITICAL: 'red'
}

const SchedulingHealth = () => {
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [periodType, setPeriodType] = useState<PeriodOption>('MONTHLY')
  const [referenceDate, setReferenceDate] = useState<Dayjs>(dayjs())
  const [departmentIds, setDepartmentIds] = useState<number[]>([])
  const [snapshot, setSnapshot] = useState<SchedulingMetricsSnapshot | null>(null)
  const [history, setHistory] = useState<SchedulingMetricsSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)

  const columns: ColumnsType<MetricTableRecord> = useMemo(
    () => [
      {
        title: '指标名称',
        dataIndex: 'name',
        key: 'name'
      },
      {
        title: '数值',
        dataIndex: 'value',
        key: 'value',
        render: (value: number, record) => (
          <Space>
            <span>{value}</span>
            {record.unit && <Tag color="default">{record.unit}</Tag>}
          </Space>
        )
      },
      {
        title: '等级',
        dataIndex: 'grade',
        key: 'grade',
        render: (grade: string) => <Tag color={gradeColorMap[grade] || 'default'}>{grade}</Tag>
      },
      {
        title: '阈值说明',
        dataIndex: 'threshold',
        key: 'threshold',
        render: (threshold) =>
          threshold ? (
            <div>
              <Paragraph style={{ marginBottom: 0 }}>绿色：{threshold.green}</Paragraph>
              {threshold.yellow && <Paragraph style={{ marginBottom: 0 }}>黄色：{threshold.yellow}</Paragraph>}
              {threshold.red && <Paragraph style={{ marginBottom: 0 }}>红色：{threshold.red}</Paragraph>}
            </div>
          ) : (
            '-'
          )
      },
      {
        title: '建议',
        dataIndex: 'recommendation',
        key: 'recommendation',
        render: (value: string | undefined) => value || '-'
      }
    ],
    []
  )

  const metricTableData: MetricTableRecord[] = useMemo(
    () =>
      snapshot?.metrics.map((metric) => ({
        ...metric,
        key: metric.id
      })) ?? [],
    [snapshot]
  )

  const fetchMetrics = async (options?: Partial<ComputeMetricsPayload>) => {
    setLoading(true)
    setError(null)
    try {
      const periodStart = referenceDate
        .startOf(periodType === 'MONTHLY' ? 'month' : 'quarter')
        .format('YYYY-MM-DD')
      const payload: ComputeMetricsPayload = {
        periodType,
        referenceDate: periodStart,
        departmentIds: departmentIds.length ? departmentIds : undefined,
        includeDetails: true,
        saveSnapshot: Boolean(options?.saveSnapshot)
      }
      const result = await computeSchedulingMetrics(payload)
      setSnapshot(result)
      if (options?.saveSnapshot) {
        refreshHistory()
      }
    } catch (err: any) {
      setError(err?.message || '计算排班健康指标失败')
    } finally {
      setLoading(false)
    }
  }

  const refreshHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await fetchMetricsHistory(20)
      setHistory(data)
    } catch (err: any) {
      console.error('Failed to load metrics history', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    refreshHistory()
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePeriodChange = (value: PeriodOption) => {
    setPeriodType(value)
  }

  const handleDateChange = (date: Dayjs | null) => {
    if (date) {
      setReferenceDate(date)
    }
  }

  const overallGrade = snapshot?.grade ?? 'UNKNOWN'

  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center">
        <Title level={3}>排班健康度</Title>
        <Space>
          <Select value={periodType} options={periodOptions} onChange={handlePeriodChange} style={{ width: 140 }} />
          <DatePicker
            picker={periodType === 'MONTHLY' ? 'month' : 'quarter'}
            value={referenceDate}
            onChange={handleDateChange}
            allowClear={false}
          />
          <Button onClick={() => fetchMetrics()}>重新计算</Button>
          <Button type="primary" onClick={() => fetchMetrics({ saveSnapshot: true })}>
            保存快照
          </Button>
        </Space>
      </Flex>

      {error && <Alert type="error" message={error} />}

      <Card>
        {loading ? (
          <Flex justify="center">
            <Spin tip="正在计算排班健康指标..." />
          </Flex>
        ) : snapshot ? (
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Statistic
                title="整体评分"
                value={snapshot.overallScore}
                suffix="/100"
                valueStyle={{ color: gradeColorMap[overallGrade] || '#595959' }}
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title="总体等级"
                value={overallGrade}
                valueStyle={{ color: gradeColorMap[overallGrade] || '#595959', fontWeight: 600 }}
              />
            </Col>
            <Col xs={24} md={6}>
              <Card size="small" bordered={false} bodyStyle={{ padding: 0 }}>
                <Paragraph style={{ marginBottom: 4 }}>周期类型</Paragraph>
                <Tag color="default">{snapshot.periodType}</Tag>
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card size="small" bordered={false} bodyStyle={{ padding: 0 }}>
                <Paragraph style={{ marginBottom: 4 }}>统计区间</Paragraph>
                <Tag color="default">
                  {snapshot.periodStart} ~ {snapshot.periodEnd}
                </Tag>
              </Card>
            </Col>
          </Row>
        ) : (
          <Paragraph>暂无指标数据，请点击“重新计算”。</Paragraph>
        )}
      </Card>

      <Card title="指标明细">
        {loading ? <Spin /> : <Table columns={columns} dataSource={metricTableData} pagination={false} />} </Card>

      <Card title="历史快照" extra={<Button onClick={refreshHistory}>刷新</Button>}>
        {historyLoading ? (
          <Flex justify="center">
            <Spin />
          </Flex>
        ) : history.length ? (
          <Table
            size="small"
            dataSource={history.map((item) => ({
              key: item.snapshotId?.toString() || item.createdAt,
              snapshotId: item.snapshotId,
              periodType: item.periodType,
              periodStart: item.periodStart,
              periodEnd: item.periodEnd,
              overallScore: item.overallScore,
              grade: item.grade,
              source: item.source,
              createdAt: item.createdAt
            }))}
            columns={[
              {
                title: '快照 ID',
                dataIndex: 'snapshotId',
                key: 'snapshotId'
              },
              {
                title: '周期',
                dataIndex: 'periodType',
                key: 'periodType'
              },
              {
                title: '区间',
                dataIndex: 'period',
                key: 'period',
                render: (_value, record) => `${record.periodStart} ~ ${record.periodEnd}`
              },
              {
                title: '评分',
                dataIndex: 'overallScore',
                key: 'overallScore'
              },
              {
                title: '等级',
                dataIndex: 'grade',
                key: 'grade',
                render: (grade: string) => <Tag color={gradeColorMap[grade] || 'default'}>{grade}</Tag>
              },
              {
                title: '来源',
                dataIndex: 'source',
                key: 'source'
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                key: 'createdAt'
              }
            ]}
            pagination={false}
          />
        ) : (
          <Paragraph>暂无历史快照。</Paragraph>
        )}
      </Card>
    </Flex>
  )
}

export default SchedulingHealth
