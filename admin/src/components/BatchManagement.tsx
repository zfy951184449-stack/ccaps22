import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Flex,
  List,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd'
import {
  ExclamationCircleOutlined,
  FireOutlined,
  InfoCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type {
  AutoPlanResult,
  BatchPlanSummary,
  HeuristicHotspot,
  OperationCoverageDetail
} from '../types/scheduling'
import { fetchBatchPlans, runAutoPlan } from '../services/schedulingService'
import useAsync from '../hooks/useAsync'

const { Title, Text } = Typography

interface AutoPlanModalState {
  visible: boolean
  loading: boolean
  result?: AutoPlanResult
  batch?: BatchPlanSummary
  error?: string
}

const HotspotBadge = ({ deficit }: { deficit: number }) => {
  if (deficit >= 3) {
    return (
      <Badge count={`缺口 ${deficit}`} status="error" />
    )
  }
  if (deficit === 2) {
    return (
      <Badge count={`缺口 ${deficit}`} status="warning" />
    )
  }
  return <Badge count={`缺口 ${deficit}`} status="processing" />
}

const formatHotspotNotes = (notes: string[]) => {
  if (!notes.length) {
    return '无额外备注'
  }
  return notes.join('；')
}

const HotspotList = ({ hotspots }: { hotspots: HeuristicHotspot[] }) => {
  if (!hotspots.length) {
    return (
      <Alert
        type="success"
        message="启发式热点提醒"
        description="本次排程未检测到热点"
        showIcon
      />
    )
  }

  return (
    <List
      size="small"
      dataSource={hotspots}
      renderItem={(item) => {
        const createdAt = dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')
        return (
          <List.Item>
            <List.Item.Meta
              avatar={<FireOutlined style={{ color: '#fa8c16', fontSize: 16 }} />}
              title={
                <Space size={8}>
                  <Text strong>{item.operationName}</Text>
                  <Tag color="volcano">{item.planDate}</Tag>
                  <HotspotBadge deficit={item.deficit} />
                </Space>
              }
              description={
                <Flex vertical gap={4}>
                  <Text type="secondary">原因：{item.reason}</Text>
                  <Text type="secondary">尝试次数：{item.attempts}</Text>
                  <Text type="secondary">备注：{formatHotspotNotes(item.notes)}</Text>
                  <Text type="secondary">
                    相关操作：{item.relatedOperations.length ? item.relatedOperations.join(', ') : '无'}
                  </Text>
                  <Text type="secondary">记录时间：{createdAt}</Text>
                </Flex>
              }
            />
          </List.Item>
        )
      }}
      locale={{ emptyText: '暂无热点' }}
    />
  )
}

const OperationCoverageTable = ({
  coverage
}: {
  coverage: OperationCoverageDetail[]
}) => {
  const columns: ColumnsType<OperationCoverageDetail> = useMemo(
    () => [
      {
        title: '操作名称',
        dataIndex: 'operationName',
        key: 'operationName',
        width: 200
      },
      {
        title: '日期',
        dataIndex: 'planDate',
        key: 'planDate',
        width: 140,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD')
      },
      {
        title: '需求人数',
        dataIndex: 'required',
        key: 'required',
        width: 120
      },
      {
        title: '已分配',
        dataIndex: 'assigned',
        key: 'assigned',
        width: 120
      },
      {
        title: '缺口',
        dataIndex: 'deficit',
        key: 'deficit',
        width: 120,
        render: (value: number) =>
          value > 0 ? <Tag color="red">缺 {value}</Tag> : <Tag color="green">已满足</Tag>
      },
      {
        title: '缺口原因',
        dataIndex: 'shortageReason',
        key: 'shortageReason',
        render: (value?: string) => value ?? '—'
      }
    ],
    []
  )

  return (
    <Table
      columns={columns}
      dataSource={coverage.map((item) => ({ ...item, key: item.operationPlanId }))}
      size="small"
      pagination={false}
    />
  )
}

const BatchManagement = () => {
  const [selectedBatch, setSelectedBatch] = useState<BatchPlanSummary | null>(
    null
  )
  const [autoPlanState, setAutoPlanState] = useState<AutoPlanModalState>({
    visible: false,
    loading: false
  })

  const {
    value: batchPlans,
    loading: loadingPlans,
    error: loadPlansError,
    execute: reloadBatchPlans
  } = useAsync(fetchBatchPlans, [])

  useEffect(() => {
    reloadBatchPlans()
  }, [reloadBatchPlans])

  const openAutoPlanModal = (batch: BatchPlanSummary) => {
    setSelectedBatch(batch)
    setAutoPlanState({ visible: true, loading: false, batch })
  }

  const closeAutoPlanModal = () => {
    setAutoPlanState({ visible: false, loading: false })
    setSelectedBatch(null)
  }

  const handleRunAutoPlan = async () => {
    if (!selectedBatch) {
      return
    }

    setAutoPlanState((prev) => ({ ...prev, loading: true, error: undefined }))
    try {
      const result = await runAutoPlan({ batchIds: [selectedBatch.id], dryRun: true })
      setAutoPlanState((prev) => ({ ...prev, result, loading: false }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '自动排程失败'
      setAutoPlanState((prev) => ({ ...prev, error: errorMessage, loading: false }))
    }
  }

  const batchColumns: ColumnsType<BatchPlanSummary> = useMemo(
    () => [
      {
        title: '批次编码',
        dataIndex: 'batchCode',
        key: 'batchCode',
        width: 160
      },
      {
        title: '批次名称',
        dataIndex: 'batchName',
        key: 'batchName'
      },
      {
        title: '周期',
        dataIndex: 'period',
        key: 'period',
        width: 200,
        render: (_value, record) =>
          `${dayjs(record.plannedStartDate).format('MM-DD')} ~ ${dayjs(record.plannedEndDate).format('MM-DD')}`
      },
      {
        title: '状态',
        dataIndex: 'planStatus',
        key: 'planStatus',
        width: 120,
        render: (value: BatchPlanSummary['planStatus']) => (
          <Tag color={value === 'APPROVED' ? 'green' : 'blue'}>{value}</Tag>
        )
      },
      {
        title: '操作',
        key: 'action',
        width: 160,
        render: (_value, record) => (
          <Space>
            <Button type="primary" onClick={() => openAutoPlanModal(record)}>
              自动排程
            </Button>
          </Space>
        )
      }
    ],
    []
  )

  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <Flex justify="space-between" align="center">
        <Title level={3}>批次管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={reloadBatchPlans}>
            刷新
          </Button>
        </Space>
      </Flex>

      {loadPlansError && (
        <Alert
          type="error"
          message="加载批次列表失败"
          description={loadPlansError instanceof Error ? loadPlansError.message : '请稍后重试'}
          showIcon
        />
      )}

      <Card>
        <Table
          loading={loadingPlans}
          columns={batchColumns}
          dataSource={(batchPlans ?? []).map((item) => ({ ...item, key: item.id }))}
          rowKey="id"
        />
      </Card>

      <Modal
        width={900}
        open={autoPlanState.visible}
        title={
          <Space size={8}>
            <ExclamationCircleOutlined />
            自动排程诊断
          </Space>
        }
        onCancel={closeAutoPlanModal}
        footer={
          <Space>
            <Button onClick={closeAutoPlanModal}>关闭</Button>
            <Button
              type="primary"
              loading={autoPlanState.loading}
              onClick={handleRunAutoPlan}
            >
              执行排程（干跑）
            </Button>
          </Space>
        }
      >
        {autoPlanState.loading && (
          <Flex justify="center" style={{ minHeight: 240 }}>
            <Spin tip="正在执行自动排程..." />
          </Flex>
        )}

        {!autoPlanState.loading && autoPlanState.error && (
          <Alert
            type="error"
            showIcon
            message="排程执行失败"
            description={autoPlanState.error}
          />
        )}

        {!autoPlanState.loading &&
          !autoPlanState.error &&
          autoPlanState.result && (
            <Flex vertical gap={16}>
              <Card
                type="inner"
                title="排程摘要"
                extra={
                  <Tag icon={<InfoCircleOutlined />} color="processing">
                    员工覆盖 {autoPlanState.result.summary.employeesTouched} 人
                  </Tag>
                }
              >
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="排程区间">
                    {autoPlanState.result.period.startDate} -{' '}
                    {autoPlanState.result.period.endDate}
                  </Descriptions.Item>
                  <Descriptions.Item label="操作数量">
                    {autoPlanState.result.summary.operationsCovered}
                  </Descriptions.Item>
                  <Descriptions.Item label="警告数">
                    {autoPlanState.result.warnings.length}
                  </Descriptions.Item>
                  <Descriptions.Item label="运行日志">
                    {autoPlanState.result.logs.length}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Card
                type="inner"
                title={
                  <Space size={8}>
                    <FireOutlined style={{ color: '#fa8c16' }} />
                    启发式热点提醒
                  </Space>
                }
              >
                <HotspotList hotspots={autoPlanState.result.heuristicHotspots ?? []} />
              </Card>

              <Card
                type="inner"
                title={
                  <Space size={8}>
                    <InfoCircleOutlined />
                    操作覆盖详情
                  </Space>
                }
              >
                <OperationCoverageTable coverage={autoPlanState.result.coverage} />
              </Card>
            </Flex>
          )}
      </Modal>
    </Flex>
  )
}

export default BatchManagement
