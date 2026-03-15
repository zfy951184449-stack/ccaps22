import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Radio,
  Result,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { AxiosError } from 'axios'
import dayjs from 'dayjs'
import type { ChangeEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import useAsync from '../hooks/useAsync'
import {
  exportTemplateWorkbook,
  fetchTemplates,
  importTemplateWorkbook
} from '../services/templateService'
import type { TemplateSummary } from '../types/template'
import type {
  ProcessTemplateWorkbookImportPayload,
  WorkbookImportMode
} from '../types/templateWorkbook'
import {
  downloadTemplateWorkbook,
  parseTemplateWorkbookFile
} from '../utils/templateWorkbook'

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

const getErrorMessage = (error: unknown) => {
  const axiosError = error as AxiosError<{ error?: string; details?: unknown }>
  return axiosError.response?.data?.error || axiosError.message || '操作失败'
}

const TemplatesPage = () => {
  const { data, loading, error, execute } = useAsync(fetchTemplates)
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [exporting, setExporting] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importMode, setImportMode] = useState<WorkbookImportMode>('create')
  const [importing, setImporting] = useState(false)
  const [importPayload, setImportPayload] = useState<ProcessTemplateWorkbookImportPayload | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const handleExport = async () => {
    try {
      setExporting(true)
      const templateIds = selectedRowKeys.length ? selectedRowKeys : undefined
      const workbook = await exportTemplateWorkbook(templateIds)
      const fileName = downloadTemplateWorkbook(workbook)

      if (workbook.warnings.length > 0) {
        message.warning(workbook.warnings[0])
      }

      message.success(
        `已导出 ${workbook.templates.length} 个工艺模板到 ${fileName}${templateIds?.length ? '（当前选择）' : ''}`
      )
    } catch (exportError) {
      message.error(getErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  const resetImportState = () => {
    setImportPayload(null)
    setSelectedFileName('')
    setImportError(null)
  }

  const openImportModal = () => {
    setImportModalOpen(true)
    resetImportState()
    setImportMode('create')
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    resetImportState()
  }

  const handleChooseFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setImportError(null)
      const payload = await parseTemplateWorkbookFile(file, importMode)
      setImportPayload(payload)
      setSelectedFileName(file.name)
      message.success(`已解析 Excel：${file.name}`)
    } catch (parseError) {
      const nextError = getErrorMessage(parseError)
      setImportPayload(null)
      setSelectedFileName(file.name)
      setImportError(nextError)
      message.error(nextError)
    } finally {
      event.target.value = ''
    }
  }

  const handleImport = async () => {
    if (!importPayload) {
      setImportError('请先选择并解析 Excel 文件')
      return
    }

    try {
      setImporting(true)
      setImportError(null)
      const result = await importTemplateWorkbook({
        ...importPayload,
        mode: importMode
      })

      if (result.warnings.length > 0) {
        message.warning(result.warnings[0])
      }

      message.success(
        `导入完成：新建 ${result.created_count} 个，替换 ${result.replaced_count} 个模板`
      )
      closeImportModal()
      setSelectedRowKeys([])
      await execute()
    } catch (submitError) {
      const nextError = getErrorMessage(submitError)
      setImportError(nextError)
      message.error(nextError)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space direction="vertical" size={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            工艺模板
          </Typography.Title>
          <Typography.Text type="secondary">
            支持按同一 Excel 模版执行批量导出与回导；若已勾选行，则只导出勾选模板。
          </Typography.Text>
        </Space>
        <Space>
          <Button onClick={execute}>刷新</Button>
          <Button onClick={handleExport} loading={exporting} disabled={tableData.length === 0}>
            导出 Excel
          </Button>
          <Button type="default" onClick={openImportModal}>
            导入 Excel
          </Button>
          <Button type="primary">新增模板</Button>
        </Space>
      </Space>

      <Card title="模板列表" bordered={false}>
        {selectedRowKeys.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`已选择 ${selectedRowKeys.length} 个模板；点击“导出 Excel”将仅导出当前选择。`}
          />
        )}

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
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as number[])
            }}
            pagination={{ pageSize: 15 }}
          />
        )}
      </Card>

      <Modal
        title="导入工艺模板 Excel"
        open={importModalOpen}
        onCancel={closeImportModal}
        onOk={() => void handleImport()}
        confirmLoading={importing}
        okText="开始导入"
        cancelText="取消"
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="请使用系统导出的同一 Excel 模版回填数据，再执行导入。"
          />

          <Radio.Group
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as WorkbookImportMode)}
          >
            <Space direction="vertical">
              <Radio value="create">create：按 workbook 内的 template_code 新建模板</Radio>
              <Radio value="replace">replace：按 template_code 替换未被批次引用的模板</Radio>
            </Space>
          </Radio.Group>

          {importMode === 'replace' && (
            <Alert
              type="warning"
              showIcon
              message="replace 会重建模板结构；若模板已被批次计划引用，后端会拒绝替换。"
            />
          )}

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Button onClick={handleChooseFile}>选择 Excel 文件</Button>
            {selectedFileName ? (
              <Typography.Text>当前文件：{selectedFileName}</Typography.Text>
            ) : (
              <Typography.Text type="secondary">尚未选择文件</Typography.Text>
            )}
          </Space>

          {importPayload && (
            <Alert
              type="success"
              showIcon
              message="Excel 已解析"
              description={`模板 ${importPayload.templates.length} 个，阶段 ${importPayload.stages.length} 个，操作 ${importPayload.operations.length} 个，约束 ${importPayload.constraints.length} 条`}
            />
          )}

          {importError && (
            <Alert
              type="error"
              showIcon
              message="导入前校验失败"
              description={importError}
            />
          )}
        </Space>
      </Modal>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(event) => void handleFileChange(event)}
      />
    </Space>
  )
}

export default TemplatesPage
