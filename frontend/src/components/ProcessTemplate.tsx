import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Tooltip,
  Popconfirm,
  Typography,
  Row,
  Col,
  Tabs,
  Tag
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ProjectOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import ProcessTemplateGantt from './ProcessTemplateGantt';
import TemplateWorkbookImportModal from './TemplateWorkbookImportModal';
import { exportTemplateWorkbook } from '../services/templateWorkbookApi';

const { Title } = Typography;
const { TextArea } = Input;

interface Team {
  id: number;
  unit_code: string;
  unit_name: string;
}

interface Template {
  id: number;
  template_code: string;
  template_name: string;
  team_id: number | null;
  team_code: string | null;
  team_name: string | null;
  description: string;
  total_days: number;
  created_at: string;
  updated_at: string;
}

const ProcessTemplate: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>('all');
  const [workbookImportOpen, setWorkbookImportOpen] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const [form] = Form.useForm();

  const API_BASE_URL = '/api';

  const fetchTeams = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/organization/teams`);
      setTeams(response.data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  }, []);

  const fetchTemplates = useCallback(async (teamId?: string) => {
    setLoading(true);
    try {
      const params = teamId && teamId !== 'all' ? { team_id: teamId } : {};
      const response = await axios.get(`${API_BASE_URL}/process-templates`, { params });
      setTemplates(response.data);
    } catch (error) {
      message.error('获取工艺模版失败');
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
    fetchTemplates();
  }, [fetchTeams, fetchTemplates]);

  useEffect(() => {
    fetchTemplates(activeTeamId);
  }, [activeTeamId, fetchTemplates]);

  useEffect(() => {
    setSelectedRowKeys((prev) =>
      prev.filter((key) => templates.some((template) => template.id === Number(key))),
    );
  }, [templates]);

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    // 如果选中了特定 team，自动填充
    if (activeTeamId !== 'all') {
      form.setFieldValue('team_id', parseInt(activeTeamId));
    }
    setIsModalVisible(true);
  };

  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      template_name: record.template_name,
      team_id: record.team_id,
      description: record.description
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingTemplate) {
        // 更新模版
        const { template_name, description, team_id } = values;
        await axios.put(`${API_BASE_URL}/process-templates/${editingTemplate.id}`, {
          template_name,
          team_id,
          description
        });
        message.success('模版更新成功');
      } else {
        // 创建新模版
        const { template_name, description, team_id } = values;
        await axios.post(`${API_BASE_URL}/process-templates`, {
          template_name,
          team_id,
          description
        });
        message.success('模版创建成功');
      }

      setIsModalVisible(false);
      form.resetFields();
      fetchTemplates(activeTeamId);
    } catch (error) {
      message.error('操作失败');
      console.error('Error saving template:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE_URL}/process-templates/${id}`);
      message.success('模版删除成功');
      fetchTemplates(activeTeamId);
    } catch (error) {
      message.error('删除失败');
      console.error('Error deleting template:', error);
    }
  };

  const handleCopy = async (id: number) => {
    try {
      await axios.post(`${API_BASE_URL}/process-templates/${id}/copy`);
      message.success('模版复制成功');
      fetchTemplates(activeTeamId);
    } catch (error) {
      message.error('复制失败');
      console.error('Error copying template:', error);
    }
  };

  const handleManageStages = (template: Template) => {
    setSelectedTemplate(template);
  };

  const selectedTemplateRecord = useMemo(
    () => templates.find((template) => template.id === Number(selectedRowKeys[0])) ?? null,
    [selectedRowKeys, templates],
  );

  const handleExportWorkbook = useCallback(async () => {
    if (!selectedTemplateRecord) {
      message.warning('请先单选一个模板');
      return;
    }

    try {
      setExportingWorkbook(true);
      await exportTemplateWorkbook(selectedTemplateRecord.id);
      message.success(`已导出 ${selectedTemplateRecord.template_code}`);
    } catch (error) {
      console.error('Failed to export template workbook:', error);
      message.error('导出 Excel 失败');
    } finally {
      setExportingWorkbook(false);
    }
  }, [selectedTemplateRecord]);

  const tabItems = useMemo(() => [
    { key: 'all', label: `全部 (${templates.length})` },
    ...teams.map(t => {
      // 当筛选特定 team 时，计数需要重新计算
      return { key: t.id.toString(), label: t.unit_name };
    })
  ], [teams, templates.length]);

  const columns = [
    {
      title: '模版编码',
      dataIndex: 'template_code',
      key: 'template_code',
      width: 120,
      render: (text: string) => (
        <span style={{ fontFamily: 'monospace' }}>{text}</span>
      )
    },
    {
      title: '模版名称',
      dataIndex: 'template_name',
      key: 'template_name',
    },
    {
      title: '所属Team',
      dataIndex: 'team_name',
      key: 'team_name',
      width: 120,
      render: (text: string, record: Template) =>
        record.team_code ? (
          <Tag color="blue">{record.team_code}</Tag>
        ) : (
          <Tag color="default">未分配</Tag>
        )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '总天数',
      dataIndex: 'total_days',
      key: 'total_days',
      width: 100,
      render: (days: number) => `${days} 天`
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_: any, record: Template) => (
        <Space size="small">
          <Tooltip title="甘特图编辑">
            <Button
              type="primary"
              size="small"
              icon={<ProjectOutlined />}
              onClick={() => handleManageStages(record)}
            >
              甘特图
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="复制">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个模版吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (selectedTemplate) {
    return (
      <ProcessTemplateGantt
        template={selectedTemplate}
        onBack={() => {
          setSelectedTemplate(null);
          fetchTemplates(activeTeamId);
        }}
      />
    );
  }

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <ProjectOutlined /> 工艺模版管理
            </Title>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<UploadOutlined />}
                onClick={() => setWorkbookImportOpen(true)}
              >
                导入 Excel
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportWorkbook}
                loading={exportingWorkbook}
                disabled={!selectedTemplateRecord}
              >
                导出 Excel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                新增模版
              </Button>
            </Space>
          </Col>
        </Row>

        <Tabs
          activeKey={activeTeamId}
          onChange={setActiveTeamId}
          items={tabItems}
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          rowSelection={{
            type: 'radio',
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      <Modal
        title={editingTemplate ? '编辑模版' : '新增模版'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="template_name"
            label="模版名称"
            rules={[{ required: true, message: '请输入模版名称' }]}
          >
            <Input placeholder="请输入模版名称" />
          </Form.Item>

          <Form.Item
            name="team_id"
            label="所属Team"
            rules={[{ required: true, message: '请选择所属Team' }]}
          >
            <Select
              placeholder="请选择所属Team"
              options={teams.map(t => ({ value: t.id, label: `${t.unit_code} - ${t.unit_name}` }))}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea
              rows={4}
              placeholder="请输入模版描述"
            />
          </Form.Item>
        </Form>
      </Modal>

      <TemplateWorkbookImportModal
        open={workbookImportOpen}
        onClose={() => setWorkbookImportOpen(false)}
        onImported={() => {
          setSelectedRowKeys([]);
          fetchTemplates(activeTeamId);
        }}
      />
    </div>
  );
};

export default ProcessTemplate;
