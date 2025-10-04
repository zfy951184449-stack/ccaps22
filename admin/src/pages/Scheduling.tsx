import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Result,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  DatePicker,
  Row,
  Flex
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import useAsync from '../hooks/useAsync'
import { useAutoPlan } from '../hooks/useAutoPlan'
import { fetchWorkloadSnapshot, computeSchedulingMetrics } from '../services/schedulingService'
import type {
  WorkloadEmployeeEntry,
  WorkloadSnapshot,
  SchedulingMetricsSnapshot
} from '../types/scheduling'

const { RangePicker } = DatePicker

const columns: ColumnsType<WorkloadEmployeeEntry> = [
  { title: '员工编码', dataIndex: 'employeeCode', key: 'employeeCode' },
  { title: '姓名', dataIndex: 'employeeName', key: 'employeeName' },
  {
    title: '计划工时',
    dataIndex: 'totalPlannedHours',
    key: 'totalPlannedHours',
    render: (value: number) => `${value.toFixed(1)} h`
  },
  {
    title: '加班工时',
    dataIndex: 'totalOvertimeHours',
    key: 'totalOvertimeHours',
    render: (value: number) => (value ? <Tag color="gold">{value.toFixed(1)} h</Tag> : '—')
  },
  { title: '工作天数', dataIndex: 'daysWorked', key: 'daysWorked' }
]

const gradeColorMap: Record<string, string> = {
  EXCELLENT: 'green',
  GOOD: 'blue',
  WARNING: 'orange',
  CRITICAL: 'red'
}

const SchedulingPage = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('week'), dayjs().endOf('week')])
  const [metricsSnapshot, setMetricsSnapshot] = useState<SchedulingMetricsSnapshot | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  const query = useMemo(() => ({
    startDate: range[0].format('YYYY-MM-DD'),
    endDate: range[1].format('YYYY-MM-DD')
  }), [range])

  const asyncFn = useCallback(() => fetchWorkloadSnapshot(query), [query])
  const { data, loading, error, execute } = useAsync<WorkloadSnapshot>(asyncFn)
  const { loading: autoPlanLoading, result: autoPlanResult } = useAutoPlan()

  type DayjsRangeValue = [Dayjs | null, Dayjs | null] | null

  const handleRangeChange = (values: DayjsRangeValue) => {
    if (!values || !values[0] || !values[1]) return
    setRange([values[0], values[1]])
  }

  const handleComputeMetrics = async (saveSnapshot = false) => {
    setMetricsLoading(true)
    try {
      const snapshot = await computeSchedulingMetrics({ periodType: 'MONTHLY', includeDetails: false, saveSnapshot })
      setMetricsSnapshot(snapshot)
    } catch (err) {
      console.error('Failed to compute metrics', err)
    } finally {
      setMetricsLoading(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          排班校验
        </Typography.Title>
        <Space>
          <RangePicker value={range} onChange={handleRangeChange} allowClear={false} />
          <Button onClick={execute}>刷新</Button>
          <Button>导出报告</Button>
          <Button type="primary">启动校验</Button>
        </Space>
      </Space>

      {error && (
        <Result
          status="error"
          title="排班数据加载失败"
          subTitle={error.message}
          extra={<Button onClick={execute}>重试</Button>}
        />
      )}

      <Card title="最近一次自动排班" bordered={false} loading={loading && !data}>
        {data ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="起始日期">{data.period.startDate}</Descriptions.Item>
            <Descriptions.Item label="结束日期">{data.period.endDate}</Descriptions.Item>
            <Descriptions.Item label="季度">{data.period.quarter}</Descriptions.Item>
            <Descriptions.Item label="覆盖员工数">{data.employees.length}</Descriptions.Item>
          </Descriptions>
        ) : (
          !loading && !error && <Empty description="暂无排班结果" />
        )}
      </Card>

      {data?.warnings?.length ? (
        <Alert
          type="warning"
          showIcon
          message="排班提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Card title="人员工作量" bordered={false}>
        {data && data.employees.length > 0 ? (
          <Table<WorkloadEmployeeEntry>
            rowKey="employeeId"
            columns={columns}
            dataSource={data.employees}
            loading={loading}
            pagination={{ pageSize: 15 }}
          />
        ) : (
          !loading && !error && <Empty description="选定周期内无排班数据" />
        )}
      </Card>

      <Card title="排班执行步骤" bordered={false}>
        <Steps
          direction="vertical"
          current={1}
          items={[
            {
              title: '准备数据',
              description: '同步班次定义、节假日、人员资质'
            },
            {
              title: '生成排班建议',
              description: '运行自动排班服务，匹配最佳可用人员'
            },
            {
              title: '冲突校验',
              description: '检测工时上限、连班限制、资质冲突'
            },
            {
              title: '发布与通知',
              description: '确认排班结果，推送至执行系统'
            }
          ]}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="排班健康摘要" extra={<Button onClick={handleComputeMetrics}>刷新健康指标</Button>}>
            {metricsLoading ? (
              <Spin />
            ) : metricsSnapshot ? (
              <Flex vertical gap={8}>
                <Flex align="center" gap={8}>
                  <span>总体评分：</span>
                  <Tag color={gradeColorMap[metricsSnapshot.grade] || 'default'}>
                    {metricsSnapshot.grade} / {metricsSnapshot.overallScore}
                  </Tag>
                </Flex>
                <div>
                  统计区间：{metricsSnapshot.periodStart} ~ {metricsSnapshot.periodEnd}
                </div>
                <Link to="/scheduling/health">查看健康详情</Link>
              </Flex>
            ) : (
              <Flex vertical gap={8}>
                <div>暂无健康指标数据。</div>
                <Link to="/scheduling/health">前往健康看板</Link>
              </Flex>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  )
}

export default SchedulingPage
