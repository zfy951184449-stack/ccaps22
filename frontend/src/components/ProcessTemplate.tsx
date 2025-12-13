import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  message,
  Space,
  Tooltip,
  Popconfirm,
  Typography,
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ProjectOutlined
} from '@ant-design/icons';
import axios from 'axios';
import ProcessTemplateGantt from './ProcessTemplateGantt';

const { Title } = Typography;
const { TextArea } = Input;

interface Template {
  id: number;
  template_code: string;
  template_name: string;
  description: string;
  total_days: number;
  created_at: string;
  updated_at: string;
}

const ProcessTemplate: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();

  const API_BASE_URL = 'http://localhost:3001/api';

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/process-templates`);
      setTemplates(response.data);
    } catch (error) {
      message.error('获取工艺模版失败');
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      template_name: record.template_name,
      description: record.description
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingTemplate) {
        // 更新模版（不包含total_days）
        const { template_name, description } = values;
        await axios.put(`${API_BASE_URL}/process-templates/${editingTemplate.id}`, {
          template_name,
          description
        });
        message.success('模版更新成功');
      } else {
        // 创建新模版（不包含total_days）
        const { template_name, description } = values;
        await axios.post(`${API_BASE_URL}/process-templates`, {
          template_name,
          description
        });
        message.success('模版创建成功');
      }

      setIsModalVisible(false);
      form.resetFields();
      fetchTemplates();
    } catch (error) {
      message.error('操作失败');
      console.error('Error saving template:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE_URL}/process-templates/${id}`);
      message.success('模版删除成功');
      fetchTemplates();
    } catch (error) {
      message.error('删除失败');
      console.error('Error deleting template:', error);
    }
  };

  const handleCopy = async (id: number) => {
    try {
      await axios.post(`${API_BASE_URL}/process-templates/${id}/copy`);
      message.success('模版复制成功');
      fetchTemplates();
    } catch (error) {
      message.error('复制失败');
      console.error('Error copying template:', error);
    }
  };

  const handleManageStages = (template: Template) => {
    setSelectedTemplate(template);
  };

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
          fetchTemplates();
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              新增模版
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
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
    </div>
  );
};

export default ProcessTemplate;
