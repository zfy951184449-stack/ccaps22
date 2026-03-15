import { Button, Card, Empty, Result, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import useAsync from '../hooks/useAsync'
import { fetchTemplates } from '../services/templateService'
import type { TemplateSummary } from '../types/template'

interface TemplateRow {
  key: number
  template_code: string
  template_name: string
  stage_count?: number
  operation_count?: number
  updated_at?: string
  plan_status?: string
}

const statusTagMap: Record<string, { color: string; text: string }> = {
  draft: { color: 'gold', text: '草稿' },
  planned: { color: 'blue', text: '计划中' },
  approved: { color: 'purple', text: '已批准' },
  activated: { color: 'green', text: '已激活' },
  completed: { color: 'default', text: '已完成' }
}

const TemplatesPage = () => {
  const { data, loading, error, execute } = useAsync(fetchTemplates)

  const tableData: TemplateRow[] = useMemo(() => {
    if (!data) return []
    return data.map((item: TemplateSummary) => ({
      key: item.id,
      template_code: item.template_code,
      template_name: item.template_name,
      stage_count: item.stage_count,
      operation_count: item.operation_count,
      updated_at: item.updated_at,
      plan_status: item.plan_status
    }))
  }, [data])

  const columns: ColumnsType<TemplateRow> = [
    {
      title: '模板编号',
      dataIndex: 'template_code',
      key: 'template_code'
    },
    {
      title: '模板名称',
      dataIndex: 'template_name',
      key: 'template_name'
    },
    {
      title: '阶段数',
      dataIndex: 'stage_count',
      key: 'stage_count',
      width: 100,
      render: (value?: number) => value ?? '--'
    },
    {
      title: '操作数',
      dataIndex: 'operation_count',
      key: 'operation_count',
      width: 100,
      render: (value?: number) => value ?? '--'
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '--')
    },
    {
      title: '状态',
      dataIndex: 'plan_status',
      key: 'plan_status',
      width: 140,
      render: (value?: string) => {
        if (!value) {
          return <Tag color="default">未定义</Tag>
        }
        const meta = statusTagMap[value.toLowerCase()] || { color: 'default', text: value }
        return <Tag color={meta.color}>{meta.text}</Tag>
      }
    }
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          工艺模板
        </Typography.Title>
        <Space>
          <Button onClick={execute}>刷新</Button>
          <Button type="default">导入</Button>
          <Button type="primary">新增模板</Button>
        </Space>
      </Space>

      <Card title="模板列表" bordered={false}>
        {error && (
          <Result
            status="error"
            title="加载失败"
            subTitle={error.message}
            extra={<Button onClick={execute}>重试</Button>}
          />
        )}

        {loading && !error && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <Spin size="large" />
          </div>
        )}

        {!loading && !error && tableData.length === 0 && (
          <Empty description="暂无模板数据" />
        )}

        {tableData.length > 0 && (
          <Table
            rowKey="key"
            dataSource={tableData}
            columns={columns}
            pagination={{ pageSize: 15 }}
          />
        )}
      </Card>
    </Space>
  )
}

export default TemplatesPage
