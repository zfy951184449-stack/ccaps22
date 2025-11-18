import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
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
  Segmented,
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  BatchPlan,
  BatchStatistics,
  BatchTemplateSummary,
} from '../types';
import { batchPlanApi } from '../services/api';
import ActivatedBatchGantt from './ActivatedBatchGantt';
import ActivatedBatchGanttAligned from './ActivatedBatchGanttAligned';

const { Text } = Typography;

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

const STATUS_COLORS: Record<BatchPlan['plan_status'], string> = {
  DRAFT: 'default',
  PLANNED: 'blue',
  APPROVED: 'gold',
  ACTIVATED: 'green',
  COMPLETED: 'purple',
  CANCELLED: 'red',
};

const DEFAULT_STATS: BatchStatistics = {
  total_batches: 0,
  draft_count: 0,
  planned_count: 0,
  approved_count: 0,
  cancelled_count: 0,
};

const GANTT_VIEW_OPTIONS = [
  { label: '对齐视图', value: 'aligned' },
  { label: '标准视图', value: 'standard' },
];

const BatchManagement: React.FC = () => {
  const [batches, setBatches] = useState<BatchPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<BatchStatistics>(DEFAULT_STATS);
  const [templates, setTemplates] = useState<BatchTemplateSummary[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchPlan | null>(null);
  const [form] = Form.useForm<BatchPlanFormValues>();
  const [ganttVisible, setGanttVisible] = useState(false);
  const [ganttMode, setGanttMode] = useState<'aligned' | 'standard'>('aligned');
  const [error, setError] = useState<string | null>(null);

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
        '加载批次数据失败，请稍后重试';
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

  const resetForm = (batch?: BatchPlan | null) => {
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

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        batch_code: values.batch_code.trim(),
        batch_name: values.batch_name.trim(),
        template_id: values.template_id,
        project_code: values.project_code?.trim() || null,
        planned_start_date: values.planned_start_date.format('YYYY-MM-DD'),
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
              ? `~ ${record.planned_end_date}`
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
          <Button
            size="small"
            icon={<CalendarOutlined />}
            onClick={() => {
              setGanttVisible(true);
            }}
          >
            甘特图
          </Button>
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
    label: `${tpl.template_name}（${tpl.calculated_duration ?? tpl.total_days ?? '-'}天）`,
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
            <Segmented
              options={GANTT_VIEW_OPTIONS}
              value={ganttMode}
              onChange={(val) =>
                setGanttMode(val as 'aligned' | 'standard')
              }
            />
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
          <Col xs={24} md={6}>
            <Card>
              <Statistic
                title="批次总数"
                value={stats.total_batches}
                prefix={<AppstoreOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={6}>
            <Card>
              <Statistic title="草稿" value={stats.draft_count} />
            </Card>
          </Col>
          <Col xs={24} md={6}>
            <Card>
              <Statistic title="已排期" value={stats.planned_count} />
            </Card>
          </Col>
          <Col xs={24} md={6}>
            <Card>
              <Statistic title="已审批" value={stats.approved_count} />
            </Card>
          </Col>
        </Row>

        {error && <Alert type="error" message={error} />}

        <Card>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={batches}
            columns={columns}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </Space>

      <Modal
        open={modalVisible}
        title={editingBatch ? '编辑批次' : '新建批次'}
        onCancel={() => {
          setModalVisible(false);
          setEditingBatch(null);
        }}
        onOk={handleModalOk}
        destroyOnClose
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            plan_status: 'DRAFT',
            planned_start_date: dayjs(),
          }}
        >
          <Form.Item
            label="批次编码"
            name="batch_code"
            rules={[{ required: true, message: '请输入批次编码' }]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item
            label="批次名称"
            name="batch_name"
            rules={[{ required: true, message: '请输入批次名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="关联模板"
            name="template_id"
            rules={[{ required: true, message: '请选择模板' }]}
          >
            <Select
              placeholder="请选择模板"
              options={templateOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="项目编号" name="project_code">
            <Input />
          </Form.Item>
          <Form.Item
            label="计划开始日期"
            name="planned_start_date"
            rules={[{ required: true, message: '请选择开始日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="状态"
            name="plan_status"
            rules={[{ required: true, message: '请选择状态' }]}
          >
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
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <ActivatedBatchGanttAligned
        visible={ganttVisible && ganttMode === 'aligned'}
        onClose={() => {
          setGanttVisible(false);
        }}
        actionRequest={null}
      />
      <ActivatedBatchGantt
        visible={ganttVisible && ganttMode === 'standard'}
        onClose={() => {
          setGanttVisible(false);
        }}
        actionRequest={null}
      />
    </div>
  );
};

export default BatchManagement;
