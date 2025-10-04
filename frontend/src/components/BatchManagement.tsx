import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Space,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Typography,
  Popconfirm,
  Divider,
  Collapse,
  Descriptions,
  Alert,
  List
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  PlayCircleOutlined,
  ProjectOutlined,
  EyeOutlined,
  FileTextOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  StopOutlined,
  DotChartOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import ActivatedBatchGantt from './ActivatedBatchGantt';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import axios from 'axios';

const { Option } = Select;
const { Text } = Typography;

const API_BASE_URL = 'http://localhost:3001/api';

interface BatchPlan {
  id: number;
  batch_code: string;
  batch_name: string;
  template_id: number;
  template_name?: string;
  project_code?: string;
  planned_start_date: string;
  planned_end_date: string;
  template_duration_days: number;
  plan_status: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED';
  description?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  operation_count?: number;
  total_required_people?: number;
  assigned_people_count?: number;
}

interface ProcessTemplate {
  id: number;
  template_code: string;
  template_name: string;
  total_days?: number;
}

interface AutoPlanSummary {
  employeesTouched: number;
  operationsCovered: number;
  overtimeEntries: number;
  baseRosterRows: number;
  operationsAssigned: number;
}

interface CoverageGap {
  operationPlanId: number;
  operationId: number;
  operationName: string;
  batchPlanId: number;
  batchCode: string;
  stageName: string;
  planDate: string;
  requiredPeople: number;
  assignedPeople: number;
  availableHeadcount: number;
  availableQualified: number;
  qualifiedPoolSize: number;
  category: 'HEADCOUNT' | 'QUALIFICATION' | 'OTHER';
  status: 'UNASSIGNED' | 'PARTIAL';
  notes: string[];
  suggestions: string[];
}

interface CoverageSummary {
  totalOperations: number;
  fullyCovered: number;
  coverageRate: number;
  gaps: CoverageGap[];
  gapTotals: {
    headcount: number;
    qualification: number;
    other: number;
  };
}

interface AutoPlanBatchWindow {
  batchPlanId: number;
  batchCode: string;
  start: string | null;
  end: string | null;
  totalOperations: number;
}

interface AutoPlanResultData {
  message: string;
  period: {
    startDate: string;
    endDate: string;
    quarter: string;
  };
  batches: AutoPlanBatchWindow[];
  warnings: string[];
  summary: AutoPlanSummary;
  diagnostics: {
    missingCalendar?: boolean;
  };
  logs: string[];
  coverage: CoverageSummary;
}

const BatchManagement: React.FC = () => {
  const [batches, setBatches] = useState<BatchPlan[]>([]);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchPlan | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchPlan | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [ganttVisible, setGanttVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [autoPlanLoading, setAutoPlanLoading] = useState(false);
  const [autoPlanModalVisible, setAutoPlanModalVisible] = useState(false);
  const [autoPlanResult, setAutoPlanResult] = useState<AutoPlanResultData | null>(null);
  const [form] = Form.useForm();

  // 获取数据
  useEffect(() => {
    fetchBatchPlans();
    fetchTemplates();
    fetchStatistics();
  }, []);

  const fetchBatchPlans = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans`);
      setBatches(response.data);
    } catch (error) {
      console.error('Error fetching batch plans:', error);
      message.error('获取批次计划失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans/templates`);
      const templateData = response.data.map((t: any) => ({
        id: t.id,
        template_code: t.template_code,
        template_name: t.template_name,
        total_days: t.calculated_duration || t.total_days
      }));
      setTemplates(templateData);
    } catch (error) {
      console.error('Error fetching templates:', error);
      message.error('获取模版列表失败');
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans/statistics`);
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  // 状态标签渲染
  const renderStatus = (status: string) => {
    const statusConfig = {
      DRAFT: { color: 'default', text: '草稿' },
      PLANNED: { color: 'processing', text: '已计划' },
      APPROVED: { color: 'success', text: '已批准' },
      ACTIVATED: { color: 'warning', text: '已激活' },
      COMPLETED: { color: 'default', text: '已完成' },
      CANCELLED: { color: 'error', text: '已取消' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列定义
  const columns: ColumnsType<BatchPlan> = [
    {
      title: '批次编号',
      dataIndex: 'batch_code',
      key: 'batch_code',
      fixed: 'left',
      width: 150,
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: '批次名称',
      dataIndex: 'batch_name',
      key: 'batch_name',
      width: 200
    },
    {
      title: '项目代码',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 120
    },
    {
      title: '工艺模版',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 180,
      render: (text) => (
        <Tooltip title={text}>
          <ProjectOutlined /> {text}
        </Tooltip>
      )
    },
    {
      title: '计划开始日期',
      dataIndex: 'planned_start_date',
      key: 'planned_start_date',
      width: 120,
      render: (text) => (
        <Space>
          <CalendarOutlined />
          {text}
        </Space>
      )
    },
    {
      title: '计划结束日期',
      dataIndex: 'planned_end_date',
      key: 'planned_end_date',
      width: 120,
      render: (text) => text
    },
    {
      title: '工期(天)',
      dataIndex: 'template_duration_days',
      key: 'template_duration_days',
      width: 100,
      align: 'center',
      render: (days) => <Tag color="blue">{days}天</Tag>
    },
    {
      title: '状态',
      dataIndex: 'plan_status',
      key: 'plan_status',
      width: 100,
      align: 'center',
      render: (status) => renderStatus(status)
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button 
              icon={<EyeOutlined />} 
              size="small"
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button 
              icon={<EditOutlined />} 
              size="small"
              onClick={() => handleEdit(record)}
              disabled={record.plan_status === 'ACTIVATED' || record.plan_status === 'COMPLETED'}
            />
          </Tooltip>
          {record.plan_status === 'APPROVED' && (
            <Tooltip title="激活批次">
              <Button 
                icon={<PlayCircleOutlined />} 
                size="small"
                type="primary"
                onClick={() => handleActivate(record)}
              />
            </Tooltip>
          )}
          {record.plan_status === 'ACTIVATED' && (
            <Tooltip title="人员安排">
              <Button 
                icon={<TeamOutlined />} 
                size="small"
                onClick={() => message.info('请在人员排班日历中安排人员')}
              />
            </Tooltip>
          )}
          {record.plan_status === 'ACTIVATED' && (
            <Tooltip title="撤销激活">
              <Button
                icon={<StopOutlined />}
                size="small"
                danger
                onClick={() => handleDeactivate(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="确定删除这个批次计划吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.plan_status === 'ACTIVATED'}
          >
            <Tooltip title="删除">
              <Button 
                icon={<DeleteOutlined />} 
                size="small"
                danger
                disabled={record.plan_status === 'ACTIVATED'}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys.map((key) => Number(key))),
    getCheckboxProps: (record: BatchPlan) => ({
      disabled: record.plan_status !== 'ACTIVATED',
    }),
  };

  // 处理新增
  const handleAdd = () => {
    setEditingBatch(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  // 处理编辑
  const handleEdit = (record: BatchPlan) => {
    setEditingBatch(record);
    form.setFieldsValue({
      ...record,
      planned_start_date: dayjs(record.planned_start_date)
    });
    setIsModalVisible(true);
  };

  // 处理删除
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE_URL}/batch-plans/${id}`);
      message.success('删除成功');
      fetchBatchPlans();
      fetchStatistics();
    } catch (error) {
      console.error('Error deleting batch plan:', error);
      message.error('删除批次计划失败');
    }
  };

  // 处理查看详情
  const handleViewDetail = (record: BatchPlan) => {
    setSelectedBatch(record);
    setDetailModalVisible(true);
  };

  // 处理激活批次
  const handleActivate = async (record: BatchPlan) => {
    Modal.confirm({
      title: '确认激活批次',
      content: `确定要激活批次 "${record.batch_code}" 吗？激活后将在人员排班日历中显示。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.post(`${API_BASE_URL}/calendar/batch/${record.id}/activate`, {
            color: '#' + Math.floor(Math.random()*16777215).toString(16)
          });
          message.success('批次激活成功');
          fetchBatchPlans();
          fetchStatistics();
        } catch (error) {
          console.error('Error activating batch:', error);
          message.error('激活批次失败');
        }
      }
    });
  };

  // 撤销激活
  const handleDeactivate = async (record: BatchPlan) => {
    Modal.confirm({
      title: '确认撤销激活',
      content: `撤销后批次 "${record.batch_code}" 将从排班日历中移除，所有已安排人员会被清除。确定继续？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.post(`${API_BASE_URL}/calendar/batch/${record.id}/deactivate`);
          message.success('批次激活已撤销');
          fetchBatchPlans();
          fetchStatistics();
        } catch (error) {
          console.error('Error deactivating batch:', error);
          message.error('撤销批次激活失败');
        }
      }
    });
  };

  const handleAutoPlan = async () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择至少一个已激活批次');
      return;
    }
    setAutoPlanLoading(true);
    try {
      const targetBatches = batches.filter((batch) => selectedRowKeys.includes(batch.id));
      const years = Array.from(
        new Set<number>(
          targetBatches.flatMap((batch) => {
            const result: number[] = [];
            if (batch.planned_start_date) {
              result.push(dayjs(batch.planned_start_date).year());
            }
            if (batch.planned_end_date) {
              result.push(dayjs(batch.planned_end_date).year());
            }
            return result;
          })
        )
      );

      years.forEach(async (year) => {
        try {
          await axios.post(`${API_BASE_URL}/calendar/holidays/import`, { year });
        } catch (importError: any) {
          console.error('Holiday import failed:', importError);
          message.warning(`同步 ${year} 年节假日失败：${importError?.response?.data?.error || importError?.message}`);
        }
      });

      const response = await axios.post(`${API_BASE_URL}/scheduling/auto-plan`, {
        batchIds: selectedRowKeys,
      });
      const result: AutoPlanResultData = response.data;
      setAutoPlanResult(result);
      setAutoPlanModalVisible(true);
      message.success(`自动人员安排完成，覆盖 ${result.summary.operationsAssigned || 0} 个操作`);
      fetchBatchPlans();
      fetchStatistics();
      setSelectedRowKeys([]);
    } catch (error: any) {
      console.error('Error executing auto plan:', error);
      message.error(error.response?.data?.error || '自动人员安排失败');
    } finally {
      setAutoPlanLoading(false);
    }
  };

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const formData = {
        ...values,
        planned_start_date: values.planned_start_date.format('YYYY-MM-DD')
      };

      if (editingBatch) {
        // 编辑
        try {
          await axios.put(`${API_BASE_URL}/batch-plans/${editingBatch.id}`, formData);
          message.success('更新成功');
        } catch (error) {
          console.error('Error updating batch plan:', error);
          message.error('更新批次计划失败');
          return;
        }
      } else {
        // 新增
        try {
          await axios.post(`${API_BASE_URL}/batch-plans`, formData);
          message.success('创建成功');
        } catch (error: any) {
          console.error('Error creating batch plan:', error);
          if (error.response?.data?.error === 'Batch code already exists') {
            message.error('批次编号已存在');
          } else {
            message.error('创建批次计划失败');
          }
          return;
        }
      }
      
      setIsModalVisible(false);
      form.resetFields();
      fetchBatchPlans();
      fetchStatistics();
    } catch (error) {
      message.error('请填写所有必填字段');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总批次数"
              value={statistics?.total_batches || 0}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已批准"
              value={statistics?.approved_count || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="计划中"
              value={statistics?.planned_count || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="草稿"
              value={statistics?.draft_count || 0}
              valueStyle={{ color: '#666' }}
              prefix={<EditOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 主卡片 */}
      <Card
        title={
          <Space>
            <AppstoreOutlined />
            <span>批次管理</span>
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<DotChartOutlined />}
              type={ganttVisible ? 'primary' : 'default'}
              onClick={() => setGanttVisible((prev) => !prev)}
            >
              {ganttVisible ? '隐藏激活甘特' : '激活批次甘特'}
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              disabled={!selectedRowKeys.length}
              loading={autoPlanLoading}
              onClick={handleAutoPlan}
            >
              自动人员安排
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              新建批次
            </Button>
            <Button 
              icon={<ExportOutlined />}
              onClick={() => message.info('导出功能开发中')}
            >
              导出
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={batches}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      {/* 新增/编辑模态框 */}
      <Modal
        title={editingBatch ? '编辑批次' : '新建批次'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            plan_status: 'DRAFT'
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="batch_code"
                label="批次编号"
                rules={[{ required: true, message: '请输入批次编号' }]}
              >
                <Input placeholder="如：BATCH-2024-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="project_code"
                label="项目代码"
              >
                <Input placeholder="如：PRJ-2024-A" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="batch_name"
            label="批次名称"
            rules={[{ required: true, message: '请输入批次名称' }]}
          >
            <Input placeholder="请输入批次名称" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="template_id"
                label="工艺模版"
                rules={[{ required: true, message: '请选择工艺模版' }]}
              >
                <Select placeholder="请选择工艺模版">
                  {templates.map(t => (
                    <Option key={t.id} value={t.id}>
                      {t.template_name} ({t.total_days || 0}天)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="planned_start_date"
                label="计划开始日期"
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="plan_status"
            label="状态"
          >
            <Select>
              <Option value="DRAFT">草稿</Option>
              <Option value="PLANNED">已计划</Option>
              <Option value="APPROVED">已批准</Option>
              <Option value="ACTIVATED">已激活</Option>
              <Option value="COMPLETED">已完成</Option>
              <Option value="CANCELLED">已取消</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="批次描述"
          >
            <Input.TextArea rows={3} placeholder="请输入批次描述" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情模态框 */}
      <Modal
        title="批次详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button 
            key="schedule" 
            type="primary" 
            icon={<CalendarOutlined />}
            onClick={() => message.info('查看排程功能开发中')}
          >
            查看排程
          </Button>
        ]}
        width={700}
      >
        {selectedBatch && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">批次编号</Text>
                <div><Text strong>{selectedBatch.batch_code}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">批次名称</Text>
                <div><Text strong>{selectedBatch.batch_name}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">项目代码</Text>
                <div><Text strong>{selectedBatch.project_code || '-'}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">工艺模版</Text>
                <div><Text strong>{selectedBatch.template_name}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">计划开始日期</Text>
                <div><Text strong>{selectedBatch.planned_start_date}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">计划结束日期</Text>
                <div><Text strong>{selectedBatch.planned_end_date}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">工期</Text>
                <div><Text strong>{selectedBatch.template_duration_days}天</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">状态</Text>
                <div>{renderStatus(selectedBatch.plan_status)}</div>
              </Col>
              <Col span={24}>
                <Text type="secondary">描述</Text>
                <div><Text>{selectedBatch.description || '-'}</Text></div>
              </Col>
              <Col span={24}>
                <Text type="secondary">备注</Text>
                <div><Text>{selectedBatch.notes || '-'}</Text></div>
              </Col>
            </Row>

            <Divider />

            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="操作数"
                    value={selectedBatch?.operation_count || 0}
                    prefix={<CheckCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="需要人员"
                    value={selectedBatch?.total_required_people || 0}
                    prefix={<TeamOutlined />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="已安排"
                    value={selectedBatch?.assigned_people_count || 0}
                    suffix={`/ ${selectedBatch?.total_required_people || 0}`}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      <Modal
        title="自动人员安排结果"
        open={autoPlanModalVisible}
        onCancel={() => setAutoPlanModalVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setAutoPlanModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={720}
      >
        {autoPlanResult ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={1} labelStyle={{ width: 120 }}>
              <Descriptions.Item label="周期">
                {autoPlanResult.period.startDate} ~ {autoPlanResult.period.endDate}
              </Descriptions.Item>
              <Descriptions.Item label="季度">{autoPlanResult.period.quarter}</Descriptions.Item>
              <Descriptions.Item label="结果">{autoPlanResult.message}</Descriptions.Item>
              <Descriptions.Item label="摘要">
                <Space size={12} wrap>
                  <Tag color="blue">员工 {autoPlanResult.summary.employeesTouched}</Tag>
                  <Tag color="cyan">操作 {autoPlanResult.summary.operationsAssigned}/{autoPlanResult.summary.operationsCovered}</Tag>
                  <Tag color="purple">基础班次 {autoPlanResult.summary.baseRosterRows}</Tag>
                  <Tag color="red">加班 {autoPlanResult.summary.overtimeEntries}</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="覆盖率">
                <Space size={12} direction="vertical" style={{ width: '100%' }}>
                  <Tag color={autoPlanResult.coverage.coverageRate >= 1 ? 'green' : 'red'}>
                    覆盖率 {(autoPlanResult.coverage.coverageRate * 100).toFixed(2)}%
                  </Tag>
                  <span>
                    满足 {autoPlanResult.coverage.fullyCovered}/{autoPlanResult.coverage.totalOperations} 个操作
                  </span>
                  <Space size={8} wrap>
                    <Tag color="volcano">人数缺口 {autoPlanResult.coverage.gapTotals.headcount}</Tag>
                    <Tag color="geekblue">资质缺口 {autoPlanResult.coverage.gapTotals.qualification}</Tag>
                    <Tag color="default">其他缺口 {autoPlanResult.coverage.gapTotals.other}</Tag>
                  </Space>
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {autoPlanResult.diagnostics?.missingCalendar && (
              <Alert
                type="warning"
                message="节假日数据缺失"
                description="请先导入节假日/调休数据，以保证综合工时计算准确。"
                showIcon
              />
            )}

            {autoPlanResult.warnings.length > 0 && (
              <Alert
                type="warning"
                message="提醒"
                description={(
                  <List
                    size="small"
                    dataSource={autoPlanResult.warnings}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                )}
                showIcon
              />
            )}

            <Collapse defaultActiveKey={['coverage', 'batches', 'logs']}>
              <Collapse.Panel
                header={`覆盖缺口 (${autoPlanResult.coverage.gaps.length})`}
                key="coverage"
              >
                {autoPlanResult.coverage.gaps.length === 0 ? (
                  <Alert type="success" message="所有操作均已覆盖" showIcon />
                ) : (
                  <List
                    size="small"
                    dataSource={autoPlanResult.coverage.gaps}
                    renderItem={(gap) => (
                      <List.Item>
                        <Space direction="vertical" style={{ width: '100%' }} size={4}>
                          <Space size={8} wrap>
                            <Tag color="volcano">{gap.category === 'HEADCOUNT' ? '人数缺口' : gap.category === 'QUALIFICATION' ? '资质缺口' : '其他缺口'}</Tag>
                            <Tag color="blue">{gap.batchCode}</Tag>
                            <Text strong>{gap.operationName}</Text>
                            <Tag color="gold">{gap.planDate}</Tag>
                            <span>
                              需 {gap.requiredPeople} 人，已分配 {gap.assignedPeople} 人
                            </span>
                          </Space>
                          <Space direction="vertical" size={2}>
                            {gap.notes.map((note, index) => (
                              <Text type="secondary" key={`note-${gap.operationPlanId}-${index}`}>
                                • {note}
                              </Text>
                            ))}
                          </Space>
                          <Space direction="vertical" size={2}>
                            {gap.suggestions.map((sugg, index) => (
                              <Text key={`sugg-${gap.operationPlanId}-${index}`}>建议：{sugg}</Text>
                            ))}
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                )}
              </Collapse.Panel>
              <Collapse.Panel header="覆盖批次" key="batches">
                <List
                  size="small"
                  dataSource={autoPlanResult.batches}
                  renderItem={(item) => (
                    <List.Item>
                      <Space size={12} wrap>
                        <Tag color="blue">{item.batchCode}</Tag>
                        <span>操作 {item.totalOperations}</span>
                        {item.start && <span>开始 {item.start}</span>}
                        {item.end && <span>结束 {item.end}</span>}
                      </Space>
                    </List.Item>
                  )}
                  locale={{ emptyText: '无批次数据' }}
                />
              </Collapse.Panel>
              <Collapse.Panel header="执行日志" key="logs">
                <List
                  size="small"
                  dataSource={autoPlanResult.logs}
                  renderItem={(item, index) => <List.Item>{index + 1}. {item}</List.Item>}
                  locale={{ emptyText: '暂无日志' }}
                />
              </Collapse.Panel>
            </Collapse>
          </Space>
        ) : (
          <Alert type="info" message="暂无返回数据" showIcon />
        )}
      </Modal>

      <ActivatedBatchGantt
        visible={ganttVisible}
        onClose={() => setGanttVisible(false)}
      />
    </div>
  );
};

export default BatchManagement;
