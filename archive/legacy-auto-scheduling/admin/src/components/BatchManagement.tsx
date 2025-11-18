import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Flex, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, ExperimentOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type { BatchPlanSummary } from '../types/scheduling'
import { fetchBatchPlans } from '../services/schedulingService'
import useAsync from '../hooks/useAsync'
import V4SchedulingModal from './V4SchedulingModal'

const { Title } = Typography

const BatchManagement = () => {
  const [v4ModalVisible, setV4ModalVisible] = useState(false)
  const [v4SelectedBatch, setV4SelectedBatch] = useState<BatchPlanSummary | null>(null)

  const {
    value: batchPlans,
    loading: loadingPlans,
    error: loadPlansError,
    execute: reloadBatchPlans
  } = useAsync(fetchBatchPlans, [])

  useEffect(() => {
    reloadBatchPlans()
  }, [reloadBatchPlans])

  const openAutoPlanV4Modal = useCallback((batch: BatchPlanSummary) => {
    setV4SelectedBatch(batch)
    setV4ModalVisible(true)
  }, [])

  const closeAutoPlanV4Modal = useCallback(() => {
    setV4ModalVisible(false)
    setV4SelectedBatch(null)
  }, [])

  const batchColumns = useMemo<ColumnsType<BatchPlanSummary>>(
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
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={() => openAutoPlanV4Modal(record)}
          >
            智能排班 v4
          </Button>
        )
      }
    ],
    [openAutoPlanV4Modal]
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

      <V4SchedulingModal
        visible={v4ModalVisible}
        batch={v4SelectedBatch}
        onClose={closeAutoPlanV4Modal}
        onSuccess={() => {
          closeAutoPlanV4Modal()
          reloadBatchPlans()
        }}
      />
    </Flex>
  )
}

export default BatchManagement
