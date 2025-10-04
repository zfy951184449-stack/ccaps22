import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  Switch, 
  TimePicker, 
  Space, 
  message,
  Popconfirm,
  Tag
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ShiftType } from '../types';
import dayjs from 'dayjs';

const { TextArea } = Input;

const ShiftTypeManagement: React.FC = () => {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingShiftType, setEditingShiftType] = useState<ShiftType | null>(null);
  const [form] = Form.useForm();

  const columns = [
    {
      title: '班次代码',
      dataIndex: 'shift_code',
      key: 'shift_code',
    },
    {
      title: '班次名称',
      dataIndex: 'shift_name',
      key: 'shift_name',
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
    },
    {
      title: '标准工时',
      dataIndex: 'work_hours',
      key: 'work_hours',
      render: (hours: number) => `${hours}小时`,
    },
    {
      title: '加班费率',
      dataIndex: 'overtime_rate',
      key: 'overtime_rate',
      render: (rate: number) => `${rate}倍`,
    },
    {
      title: '班次类型',
      key: 'shift_features',
      render: (record: ShiftType) => (
        <Space>
          {record.is_night_shift && <Tag color="blue">夜班</Tag>}
          {record.is_weekend_shift && <Tag color="green">周末班</Tag>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>
          {active ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: ShiftType) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个班次类型吗？"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleEdit = (shiftType: ShiftType) => {
    setEditingShiftType(shiftType);
    form.setFieldsValue({
      ...shiftType,
      start_time: shiftType.start_time ? dayjs(shiftType.start_time, 'HH:mm:ss') : null,
      end_time: shiftType.end_time ? dayjs(shiftType.end_time, 'HH:mm:ss') : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    // TODO: 实现删除功能
    message.success('删除成功（占位符）');
  };

  const handleAdd = () => {
    setEditingShiftType(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      
      // 格式化时间
      const formattedValues = {
        ...values,
        start_time: values.start_time?.format('HH:mm:ss'),
        end_time: values.end_time?.format('HH:mm:ss'),
      };

      if (editingShiftType) {
        // TODO: 实现更新功能
        message.success('更新成功（占位符）');
      } else {
        // TODO: 实现创建功能
        message.success('创建成功（占位符）');
      }

      setModalVisible(false);
      // TODO: 重新加载数据
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    setEditingShiftType(null);
    form.resetFields();
  };

  // TODO: 从API加载班次类型数据
  useEffect(() => {
    // setShiftTypes([]);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          新增班次类型
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={shiftTypes}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingShiftType ? '编辑班次类型' : '新增班次类型'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            is_night_shift: false,
            is_weekend_shift: false,
            overtime_rate: 1.0,
            is_active: true,
          }}
        >
          <Form.Item
            name="shift_code"
            label="班次代码"
            rules={[{ required: true, message: '请输入班次代码' }]}
          >
            <Input placeholder="例如：DAY_SHIFT" />
          </Form.Item>

          <Form.Item
            name="shift_name"
            label="班次名称"
            rules={[{ required: true, message: '请输入班次名称' }]}
          >
            <Input placeholder="例如：常日班" />
          </Form.Item>

          <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Form.Item
              name="start_time"
              label="开始时间"
              rules={[{ required: true, message: '请选择开始时间' }]}
            >
              <TimePicker format="HH:mm:ss" />
            </Form.Item>

            <Form.Item
              name="end_time"
              label="结束时间"
              rules={[{ required: true, message: '请选择结束时间' }]}
            >
              <TimePicker format="HH:mm:ss" />
            </Form.Item>
          </Space>

          <Form.Item
            name="work_hours"
            label="标准工时（小时）"
            rules={[{ required: true, message: '请输入标准工时' }]}
          >
            <InputNumber min={0} max={24} step={0.5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="overtime_rate"
            label="加班费率"
            rules={[{ required: true, message: '请输入加班费率' }]}
          >
            <InputNumber min={1} max={5} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Form.Item name="is_night_shift" valuePropName="checked">
              <Switch checkedChildren="夜班" unCheckedChildren="非夜班" />
            </Form.Item>

            <Form.Item name="is_weekend_shift" valuePropName="checked">
              <Switch checkedChildren="周末班" unCheckedChildren="工作日班" />
            </Form.Item>

            <Form.Item name="is_active" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </Space>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="班次描述信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ShiftTypeManagement;