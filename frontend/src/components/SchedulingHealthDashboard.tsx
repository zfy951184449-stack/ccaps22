import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import type {
  ComputeSchedulingMetricsPayload,
  Department,
  MetricGrade,
  MetricPeriodType,
  SchedulingMetric,
  SchedulingMetricsSnapshot
} from '../types';
import { organizationApi, schedulingMetricsApi } from '../services/api';

const { Title, Paragraph, Text } = Typography;

type MetricTableRecord = SchedulingMetric & { key: string };

const periodOptions: Array<{ label: string; value: MetricPeriodType }> = [
  { label: '按月统计', value: 'MONTHLY' },
  { label: '按季度统计', value: 'QUARTERLY' }
];

const gradeColorMap: Record<MetricGrade, string> = {
  EXCELLENT: 'green',
  GOOD: 'blue',
  WARNING: 'orange',
  CRITICAL: 'red',
  UNKNOWN: 'default'
};

const SchedulingHealthDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [periodType, setPeriodType] = useState<MetricPeriodType>('MONTHLY');
  const [referenceDate, setReferenceDate] = useState<Dayjs>(dayjs());
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<SchedulingMetricsSnapshot | null>(null);
  const [history, setHistory] = useState<SchedulingMetricsSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

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
            {record.unit ? <Tag color="default">{record.unit}</Tag> : null}
          </Space>
        )
      },
      {
        title: '等级',
        dataIndex: 'grade',
        key: 'grade',
        render: (grade: MetricGrade) => <Tag color={gradeColorMap[grade] || 'default'}>{grade}</Tag>
      },
      {
        title: '阈值说明',
        dataIndex: 'threshold',
        key: 'threshold',
        render: (threshold) =>
          threshold ? (
            <div>
              <Paragraph style={{ marginBottom: 0 }}>绿色：{threshold.green}</Paragraph>
              {threshold.yellow ? <Paragraph style={{ marginBottom: 0 }}>黄色：{threshold.yellow}</Paragraph> : null}
              {threshold.red ? <Paragraph style={{ marginBottom: 0 }}>红色：{threshold.red}</Paragraph> : null}
            </div>
          ) : (
            '-'
          )
      },
      {
        title: '系统建议',
        dataIndex: 'recommendation',
        key: 'recommendation',
        render: (value?: string) => value || '-'
      }
    ],
    []
  );

  const metricTableData: MetricTableRecord[] = useMemo(
    () =>
      snapshot?.metrics.map((metric) => ({
        ...metric,
        key: metric.id
      })) ?? [],
    [snapshot]
  );

  const fetchMetrics = async (options?: Partial<ComputeSchedulingMetricsPayload>) => {
    setLoading(true);
    setError(null);
    try {
      const start = periodType === 'MONTHLY'
        ? referenceDate.startOf('month')
        : referenceDate.startOf('quarter' as any);
      const payload: ComputeSchedulingMetricsPayload = {
        periodType,
        referenceDate: start.format('YYYY-MM-DD'),
        departmentIds: departmentIds.length ? departmentIds : undefined,
        includeDetails: true,
        saveSnapshot: Boolean(options?.saveSnapshot)
      };

      const result = await schedulingMetricsApi.compute(payload);
      setSnapshot(result);
      if (options?.saveSnapshot) {
        message.success('排班健康指标快照已保存');
        refreshHistory();
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error ?? err?.message ?? '计算排班健康指标失败';
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    setDepartmentsLoading(true);
    try {
      const data = await organizationApi.getDepartments();
      setDepartments(data);
    } catch (err: any) {
      console.error('Failed to load departments for scheduling health dashboard', err);
      message.error('加载部门列表失败');
    } finally {
      setDepartmentsLoading(false);
    }
  };

  const refreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await schedulingMetricsApi.listHistory(20);
      setHistory(data);
    } catch (err: any) {
      console.error('Failed to load metrics history', err);
      message.error('加载指标历史记录失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    refreshHistory();
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodChange = (value: MetricPeriodType) => {
    setPeriodType(value);
  };

  const handleDateChange = (date: Dayjs | null) => {
    if (date) {
      setReferenceDate(date);
    }
  };

  const overallGrade = snapshot?.grade ?? 'UNKNOWN';

  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center">
        <Title level={3}>排班健康看板</Title>
        <Space>
          <Select
            value={periodType}
            options={periodOptions}
            onChange={handlePeriodChange}
            style={{ width: 160 }}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="选择部门（留空=全部）"
            value={departmentIds}
            onChange={(values: number[]) => setDepartmentIds(values)}
            loading={departmentsLoading}
            showSearch
            optionFilterProp="label"
            options={departments
              .filter((dept) => typeof dept.id === 'number')
              .map((dept) => ({
                label: dept.dept_name ?? dept.deptName ?? dept.dept_code ?? `部门 ${dept.id}`,
                value: dept.id as number
              }))}
            style={{ width: 260 }}
            maxTagCount="responsive"
          />
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

      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        {loading ? (
          <Flex justify="center">
            <Spin tip="正在计算排班健康指标..." />
          </Flex>
        ) : snapshot ? (
          <Row gutter={[16, 16]}>
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
        {loading ? <Spin /> : <Table columns={columns} dataSource={metricTableData} pagination={false} />}
      </Card>

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
                render: (grade: MetricGrade) => <Tag color={gradeColorMap[grade] || 'default'}>{grade}</Tag>
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

      <Card title="指标说明">
        <Flex vertical gap={8}>
          <Text>· 个人车间工时均衡度：通过标准差/极差评估一线员工车间工时是否分布均衡。</Text>
          <Text>· 部门内部工时分布：比较同部门员工的车间工时差异，自动排除非一线角色。</Text>
          <Text>· 关键操作技能匹配：跟踪资质等级 ≥4 的关键操作是否由合格人员执行。</Text>
          <Text>· 夜班公平性与占比：仅统计具备夜班资质的员工，确保夜班负担均衡。</Text>
          <Text>· 高薪节假日占用率：关注 3 倍工资的法定节假日排班情况，避免超额使用。</Text>
          <Text>· 合规性计数：记录连续工作、休息不足等软/硬约束违规情况。</Text>
          <Text>· 运行稳定性：展示班次切换频率、局部重排次数等指标，帮助评估排班稳定度。</Text>
        </Flex>
      </Card>
    </Flex>
  );
};

export default SchedulingHealthDashboard;
