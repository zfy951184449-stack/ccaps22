import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  AppstoreOutlined,
  ProjectOutlined,
  BarChartOutlined,
  TeamOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  BatchPlan,
  BatchStatistics,
  BatchTemplateSummary,
} from '../types';
import { batchPlanApi } from '../services/api';
import BatchGanttAdapter from './BatchGanttAdapter';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type BatchPlanFormValues = {
  batch_code: string;
  batch_name: string;
  template_id: number;
  project_code?: string;
  planned_start_date: dayjs.Dayjs;
  plan_status: BatchPlan['plan_status'];
  description?: string;
  notes?: string;
};

type BulkCreateFormValues = {
  template_id: number;
  date_range: [dayjs.Dayjs, dayjs.Dayjs];
  interval_days: number;
  batch_prefix: string;
  start_number: number;
  description?: string;
  notes?: string;
};

const STATUS_COLORS: Record<BatchPlan['plan_status'], string> = {
  DRAFT: 'default',
  ACTIVATED: 'green',
};

const DEFAULT_STATS: BatchStatistics = {
  total_batches: 0,
  draft_count: 0,
  activated_count: 0,
};


const BatchManagement: React.FC = () => {
  const [batches, setBatches] = useState<BatchPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<BatchStatistics>(DEFAULT_STATS);
  const [templates, setTemplates] = useState<BatchTemplateSummary[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchPlan | null>(null);
  const [form] = Form.useForm<BatchPlanFormValues>();
  const [error, setError] = useState<string | null>(null);

  // Day0 offset state
  const [day0Offset, setDay0Offset] = useState<{ offset: number; has_pre_day0: boolean; pre_day0_count: number } | null>(null);
  const [loadingOffset, setLoadingOffset] = useState(false);

  // Bulk creation state
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [bulkForm] = Form.useForm<BulkCreateFormValues>();
  const [bulkDay0Offset, setBulkDay0Offset] = useState<{ offset: number; has_pre_day0: boolean; pre_day0_count: number } | null>(null);
  const [loadingBulkOffset, setLoadingBulkOffset] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<{ count: number; dates: string[]; codes: string[] }>({ count: 0, dates: [], codes: [] });
  const [bulkCreating, setBulkCreating] = useState(false);

  const statusFilters = useMemo(
    () =>
      Object.keys(STATUS_COLORS).map((status) => ({
        text: status,
        value: status,
      })),
    [],
  );

  const loadBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchList, statsData] = await Promise.all([
        batchPlanApi.list(),
        batchPlanApi.getStatistics(),
      ]);
      setBatches(batchList);
      setStats(statsData);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        '加载批次数据失败，请稀后重试';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await batchPlanApi.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.warn('Failed to load batch templates', err);
    }
  };

  useEffect(() => {
    loadBatches();
    loadTemplates();
  }, []);

  // Load day0 offset when template changes in single creation modal
  const handleTemplateChange = async (templateId: number) => {
    setLoadingOffset(true);
    setDay0Offset(null);
    try {
      const data = await batchPlanApi.getTemplateDay0Offset(templateId);
      setDay0Offset(data);
    } catch (err) {
      console.warn('Failed to load template day0 offset', err);
    } finally {
      setLoadingOffset(false);
    }
  };

  // Load day0 offset when template changes in bulk creation modal
  const handleBulkTemplateChange = async (templateId: number) => {
    setLoadingBulkOffset(true);
    setBulkDay0Offset(null);
    try {
      const data = await batchPlanApi.getTemplateDay0Offset(templateId);
      setBulkDay0Offset(data);
    } catch (err) {
      console.warn('Failed to load template day0 offset', err);
    } finally {
      setLoadingBulkOffset(false);
    }
  };

  // Update bulk preview when form values change
  const updateBulkPreview = () => {
    const values = bulkForm.getFieldsValue();
    if (!values.date_range || !values.interval_days || !values.batch_prefix || values.start_number === undefined) {
      setBulkPreview({ count: 0, dates: [], codes: [] });
      return;
    }

    const [startDate, endDate] = values.date_range;
    const dates: string[] = [];
    const codes: string[] = [];

    let current = startDate.clone();
    let index = 0;
    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      dates.push(current.format('MM/DD'));
      codes.push(`${values.batch_prefix}${values.start_number + index}`);
      current = current.add(values.interval_days, 'day');
      index++;
      if (index > 100) break; // Prevent infinite loop
    }

    setBulkPreview({ count: dates.length, dates: dates.slice(0, 5), codes: codes.slice(0, 5) });
  };

  const resetForm = (batch?: BatchPlan | null) => {
    setDay0Offset(null);
    if (batch) {
      form.setFieldsValue({
        batch_code: batch.batch_code,
        batch_name: batch.batch_name,
        template_id: batch.template_id,
        project_code: batch.project_code ?? undefined,
        planned_start_date: dayjs(batch.planned_start_date),
        plan_status: batch.plan_status,
        description: batch.description ?? undefined,
        notes: batch.notes ?? undefined,
      });
      // Load offset for existing batch
      if (batch.template_id) {
        handleTemplateChange(batch.template_id);
      }
    } else {
      form.resetFields();
      form.setFieldsValue({
        planned_start_date: dayjs(),
        plan_status: 'DRAFT',
      } as Partial<BatchPlanFormValues>);
    }
  };

  const openCreateModal = () => {
    setEditingBatch(null);
    resetForm(null);
    setModalVisible(true);
  };

  const openEditModal = (batch: BatchPlan) => {
    setEditingBatch(batch);
    resetForm(batch);
    setModalVisible(true);
  };

  const openBulkModal = () => {
    bulkForm.resetFields();
    bulkForm.setFieldsValue({
      interval_days: 5,
      start_number: 1,
    });
    setBulkDay0Offset(null);
    setBulkPreview({ count: 0, dates: [], codes: [] });
    setBulkModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      // Calculate actual start date based on day0 offset
      let actualStartDate = values.planned_start_date;
      if (day0Offset && day0Offset.offset < 0) {
        // If there are day-x operations, add the offset to get actual start
        actualStartDate = values.planned_start_date.add(day0Offset.offset, 'day');
      }

      const payload = {
        batch_code: values.batch_code.trim(),
        batch_name: values.batch_name.trim(),
        template_id: values.template_id,
        project_code: values.project_code?.trim() || null,
        planned_start_date: actualStartDate.format('YYYY-MM-DD'),
        plan_status: values.plan_status,
        description: values.description?.trim() || null,
        notes: values.notes?.trim() || null,
      };

      if (editingBatch) {
        await batchPlanApi.update(editingBatch.id, payload);
        message.success('批次已更新');
      } else {
        await batchPlanApi.create(payload);
        message.success('批次已创建');
      }
      setModalVisible(false);
      setEditingBatch(null);
      loadBatches();
    } catch (err: any) {
      if (err?.errorFields) {
        return;
      }
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        (editingBatch ? '更新批次失败' : '创建批次失败');
      message.error(msg);
    }
  };

  const handleBulkCreate = async () => {
    try {
      const values = await bulkForm.validateFields();

      if (bulkPreview.count === 0) {
        message.error('请先配置有效的日期范围和间隔');
        return;
      }

      setBulkCreating(true);

      const payload = {
        template_id: values.template_id,
        day0_start_date: values.date_range[0].format('YYYY-MM-DD'),
        day0_end_date: values.date_range[1].format('YYYY-MM-DD'),
        interval_days: values.interval_days,
        batch_prefix: values.batch_prefix.trim(),
        start_number: values.start_number,
        description: values.description?.trim() || null,
        notes: values.notes?.trim() || null,
      };

      const result = await batchPlanApi.createBulk(payload);
      message.success(result.message);
      setBulkModalVisible(false);
      loadBatches();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? '批量创建失败';
      message.error(msg);
    } finally {
      setBulkCreating(false);
    }
  };

  const handleDelete = async (batch: BatchPlan) => {
    try {
      await batchPlanApi.remove(batch.id);
      message.success('批次已删除');
      loadBatches();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? '删除批次失败';
      message.error(msg);
    }
  };

  const handleActivate = async (batch: BatchPlan) => {
    try {
      await batchPlanApi.activate(batch.id);
      message.success('批次已激活');
      loadBatches();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? '激活批次失败';
      message.error(msg);
    }
  };

  const handleDeactivate = async (batch: BatchPlan) => {
    try {
      await batchPlanApi.deactivate(batch.id);
      message.success('批次已撤销激活');
      loadBatches();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? '撤销激活失败';
      message.error(msg);
    }
  };

  const columns: ColumnsType<BatchPlan> = [
    {
      title: '批次编码',
      dataIndex: 'batch_code',
      key: 'batch_code',
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary">{record.batch_name}</Text>
        </Space>
      ),
    },
    {
      title: '模板',
      dataIndex: 'template_name',
      key: 'template',
      render: (value, record) =>
        value ? (
          <Space direction="vertical" size={0}>
            <Text>{value}</Text>
            <Text type="secondary">
              {record.template_duration_days
                ? `${record.template_duration_days} 天`
                : '—'}
            </Text>
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: '计划日期',
      dataIndex: 'planned_start_date',
      key: 'dates',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.planned_start_date || '-'}</Text>
          <Text type="secondary">
            {record.planned_end_date
              ? `~${record.planned_end_date} `
              : '待生成'}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'plan_status',
      filters: statusFilters,
      onFilter: (value, record) => record.plan_status === value,
      render: (value: BatchPlan['plan_status']) => (
        <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>
      ),
    },
    {
      title: '统计',
      key: 'stats',
      render: (_, record) => (
        <Space size="small" wrap>
          <Tag icon={<ProjectOutlined />}>
            操作 {record.operation_count ?? 0}
          </Tag>
          <Tag icon={<TeamOutlined />}>
            用工 {record.total_required_people ?? 0}
          </Tag>
          <Tag icon={<BarChartOutlined />}>
            已分配 {record.assigned_people_count ?? 0}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          {record.plan_status === 'DRAFT' && (
            <Popconfirm
              title="激活批次"
              description="确定要激活该批次吗？激活后将禁止拖拽调整。"
              onConfirm={() => handleActivate(record)}
            >
              <Button size="small" type="text" style={{ color: '#52c41a' }} icon={<PlayCircleOutlined />}>
                激活
              </Button>
            </Popconfirm>
          )}
          {record.plan_status === 'ACTIVATED' && (
            <Popconfirm
              title="撤销激活"
              description="确定要撤销激活该批次吗？撤销后状态将恢复为草稿。"
              onConfirm={() => handleDeactivate(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button size="small" type="text" style={{ color: '#faad14' }} icon={<StopOutlined />}>
                撤销激活
              </Button>
            </Popconfirm>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除批次"
            description="确定要删除该批次吗？"
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const templateOptions = templates.map((tpl) => ({
    label: `${tpl.template_name}（${tpl.calculated_duration ?? tpl.total_days ?? '-'} 天）`,
    value: tpl.id,
  }));

  return (
    <div style={{ padding: 24 }}>
      <Space
        style={{ width: '100%', marginBottom: 16 }}
        direction="vertical"
        size={16}
      >
        <Space
          style={{ width: '100%', justifyContent: 'space-between' }}
          wrap
        >
          <Typography.Title level={3} style={{ margin: 0 }}>
            批次管理
          </Typography.Title>
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={openBulkModal}
            >
              批量创建
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              新建批次
            </Button>
          </Space>
        </Space>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="批次总数"
                value={stats.total_batches}
                prefix={<AppstoreOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="草稿" value={stats.draft_count} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="已激活" value={stats.activated_count} />
            </Card>
          </Col>
        </Row>

        {error && <Alert type="error" message={error} />}

        <Card title="批次列表" style={{ marginBottom: 16 }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={batches}
            columns={columns}
            pagination={{ pageSize: 5 }}
            size="small"
          />
        </Card>

        <Card title="批次甘特图" style={{ padding: 0 }} bodyStyle={{ padding: 0 }}>
          <div style={{ minHeight: 500 }}>
            <BatchGanttAdapter showAllBatches />
          </div>
        </Card>

        {/* 单个创建/编辑弹窗 */}
        <Modal
          open={modalVisible}
          title={editingBatch ? '编辑批次' : '新建批次'}
          onCancel={() => {
            setModalVisible(false);
            setEditingBatch(null);
            form.resetFields();
            setDay0Offset(null);
          }}
          onOk={handleModalOk}
          destroyOnClose
          width={520}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              status: 'DRAFT',
            }}
          >
            <Form.Item
              label="工艺模板"
              name="template_id"
              rules={[{ required: true, message: '请选择工艺模板' }]}
            >
              <Select
                placeholder="选择工艺模板"
                onChange={handleTemplateChange}
                loading={loadingOffset}
              >
                {templates.map((t) => (
                  <Select.Option key={t.id} value={t.id}>
                    {t.template_code} - {t.template_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {day0Offset && day0Offset.has_pre_day0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={`该模版包含 day${day0Offset.offset} 操作，实际开始日期将比Day0提前 ${day0Offset.pre_day0_count} 天`}
              />
            )}

            <Form.Item
              label="Day0日期（接种日）"
              name="planned_start_date"
              rules={[{ required: true, message: '请选择Day0日期' }]}
              extra={day0Offset && day0Offset.has_pre_day0 ?
                `实际开始日期：${form.getFieldValue('planned_start_date')?.add(day0Offset.offset, 'day')?.format('YYYY-MM-DD') || '-'}`
                : undefined
              }
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="批次代码"
              name="batch_code"
              rules={[{ required: true, message: '请输入批次代码' }]}
            >
              <Input placeholder="如: GMP1" />
            </Form.Item>
            <Form.Item
              label="批次名称"
              name="batch_name"
              rules={[{ required: true, message: '请输入批次名称' }]}
            >
              <Input placeholder="如: GMP1" />
            </Form.Item>
            <Form.Item label="状态" name="plan_status">
              <Select>
                {Object.keys(STATUS_COLORS).map((status) => (
                  <Select.Option key={status} value={status}>
                    {status}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="简介" name="description">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>

        {/* 批量创建弹窗 */}
        <Modal
          open={bulkModalVisible}
          title="批量创建批次"
          onCancel={() => {
            setBulkModalVisible(false);
            bulkForm.resetFields();
            setBulkDay0Offset(null);
            setBulkPreview({ count: 0, dates: [], codes: [] });
          }}
          onOk={handleBulkCreate}
          okText="创建"
          okButtonProps={{ loading: bulkCreating, disabled: bulkPreview.count === 0 }}
          destroyOnClose
          width={600}
        >
          <Form
            form={bulkForm}
            layout="vertical"
            onValuesChange={updateBulkPreview}
          >
            <Form.Item
              label="工艺模板"
              name="template_id"
              rules={[{ required: true, message: '请选择工艺模板' }]}
            >
              <Select
                placeholder="选择工艺模板"
                onChange={handleBulkTemplateChange}
                loading={loadingBulkOffset}
              >
                {templates.map((t) => (
                  <Select.Option key={t.id} value={t.id}>
                    {t.template_code} - {t.template_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {bulkDay0Offset && bulkDay0Offset.has_pre_day0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={`该模版包含 day${bulkDay0Offset.offset} 操作，每个批次的实际开始日期将比Day0提前 ${bulkDay0Offset.pre_day0_count} 天`}
              />
            )}

            <Form.Item
              label="Day0日期范围"
              name="date_range"
              rules={[{ required: true, message: '请选择Day0日期范围' }]}
            >
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label="间隔天数"
                  name="interval_days"
                  rules={[{ required: true, message: '请输入间隔天数' }]}
                >
                  <InputNumber min={1} max={365} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="批次编码前缀"
                  name="batch_prefix"
                  rules={[{ required: true, message: '请输入前缀' }]}
                >
                  <Input placeholder="如: GMP" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="起始序号"
                  name="start_number"
                  rules={[{ required: true, message: '请输入起始序号' }]}
                >
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            {bulkPreview.count > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  <div>
                    <div>将创建 <strong>{bulkPreview.count}</strong> 个批次</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                      Day0: {bulkPreview.dates.join(', ')}{bulkPreview.count > 5 ? '...' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      编码: {bulkPreview.codes.join(', ')}{bulkPreview.count > 5 ? '...' : ''}
                    </div>
                  </div>
                }
              />
            )}

            <Form.Item label="批次描述" name="description">
              <Input.TextArea rows={2} placeholder="可选，所有批次共用" />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </div>
  );
};

export default BatchManagement;

