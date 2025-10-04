import { useState } from 'react'
import {
  Button,
  Card,
  Empty,
  InputNumber,
  List,
  Modal,
  Result,
  Skeleton,
  Space,
  Tag,
  Typography
} from 'antd'
import useAsync from '../hooks/useAsync'
import { fetchEmployees, updateEmployeeWorkloadProfile } from '../services/employeeService'
import type { PersonnelSummary } from '../types/personnel'

type EditModalState = {
  visible: boolean
  employeeId?: number
  baselinePct: number
  upperPct: number
}

const PersonnelPage = () => {
  const { data, loading, error, execute } = useAsync(fetchEmployees)
  const personnel = (data ?? []) as PersonnelSummary[]
  const [saving, setSaving] = useState(false)
  const [editState, setEditState] = useState<EditModalState>({
    visible: false,
    baselinePct: 0.6,
    upperPct: 0.9
  })

  const openEditModal = (employee: PersonnelSummary) => {
    setEditState({
      visible: true,
      employeeId: employee.id,
      baselinePct: employee.shopfloor_baseline_pct ?? 0.6,
      upperPct: employee.shopfloor_upper_pct ?? 0.9
    })
  }

  const closeEditModal = () => {
    setEditState({ visible: false, baselinePct: 0.6, upperPct: 0.9 })
  }

  const handleSaveProfile = async () => {
    if (!editState.employeeId) {
      return
    }
    setSaving(true)
    try {
      await updateEmployeeWorkloadProfile(editState.employeeId, {
        baselinePct: editState.baselinePct,
        upperPct: editState.upperPct
      })
      closeEditModal()
      execute()
    } catch (saveError) {
      console.error('Failed to update workload profile', saveError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          人员与资质
        </Typography.Title>
        <Space>
          <Button onClick={execute}>刷新</Button>
          <Button>导入人员</Button>
          <Button type="primary">新增人员</Button>
        </Space>
      </Space>

      <Card title="人员列表" bordered={false}>
        {error && (
          <Result
            status="error"
            title="人员数据加载失败"
            subTitle={error.message}
            extra={<Button onClick={execute}>重试</Button>}
          />
        )}

        {loading && !error && (
          <div style={{ padding: '24px 0' }}>
            <Skeleton active paragraph={{ rows: 4 }} />
            <Skeleton active paragraph={{ rows: 4 }} />
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        )}

        {!loading && !error && personnel.length === 0 && <Empty description="暂无人员数据" />}

        {personnel.length > 0 && (
          <List
            itemLayout="horizontal"
            dataSource={personnel}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="edit" type="link" onClick={() => openEditModal(item)}>
                    车间工时基线
                  </Button>,
                  <Button key="assign" type="link">
                    分配资质
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Typography.Text strong>{item.employee_name}</Typography.Text>
                      {item.employee_code && (
                        <Typography.Text type="secondary">{item.employee_code}</Typography.Text>
                      )}
                      {item.employment_status && (
                        <Tag color={item.employment_status === 'ACTIVE' ? 'green' : 'red'}>
                          {item.employment_status === 'ACTIVE' ? '在岗' : '停用'}
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Typography.Text>
                        角色：{item.role ?? '—'} | 车间工时基线：{Math.round((item.shopfloor_baseline_pct ?? 0.6) * 100)}% 上限：
                        {Math.round((item.shopfloor_upper_pct ?? 0.9) * 100)}%
                      </Typography.Text>
                      <Space wrap>
                        {item.qualifications?.map((q) => (
                          <Tag key={q} color="blue">
                            {q}
                          </Tag>
                        ))}
                      </Space>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="调整车间工时基线"
        open={editState.visible}
        onCancel={closeEditModal}
        onOk={handleSaveProfile}
        confirmLoading={saving}
      >
        <Space direction="vertical" size="middle">
          <Typography.Text>基线百分比（默认 60%）：</Typography.Text>
          <InputNumber
            min={0}
            max={1}
            step={0.05}
            value={editState.baselinePct}
            formatter={(value) => `${Math.round(Number(value || 0) * 100)}%`}
            parser={(value) => Number(String(value).replace('%', '')) / 100}
            onChange={(value) =>
              setEditState((prev) => ({
                ...prev,
                baselinePct: typeof value === 'number' ? value : prev.baselinePct
              }))
            }
          />
          <Typography.Text>上限百分比（默认 90%）：</Typography.Text>
          <InputNumber
            min={0}
            max={1}
            step={0.05}
            value={editState.upperPct}
            formatter={(value) => `${Math.round(Number(value || 0) * 100)}%`}
            parser={(value) => Number(String(value).replace('%', '')) / 100}
            onChange={(value) =>
              setEditState((prev) => ({
                ...prev,
                upperPct: typeof value === 'number' ? value : prev.upperPct
              }))
            }
          />
        </Space>
      </Modal>
    </Space>
  )
}

export default PersonnelPage
