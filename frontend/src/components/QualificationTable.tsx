import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Qualification } from '../types';
import { qualificationApi } from '../services/api';

const QualificationTable: React.FC = () => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQualification, setEditingQualification] = useState<Qualification | null>(null);
  const [form] = Form.useForm();

  const fetchQualifications = async () => {
    setLoading(true);
    try {
      const response = await qualificationApi.getAll();
      setQualifications(response.data);
    } catch (error) {
      message.error('获取资质数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQualifications();
  }, []);

  const handleAdd = () => {
    setEditingQualification(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Qualification) => {
    setEditingQualification(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualificationApi.delete(id);
      message.success('删除成功');
      fetchQualifications();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: Qualification) => {
    try {
      if (editingQualification) {
        await qualificationApi.update(editingQualification.id!, values);
        message.success('更新成功');
      } else {
        await qualificationApi.create(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchQualifications();
    } catch (error) {
      message.error(editingQualification ? '更新失败' : '创建失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      sorter: (a: Qualification, b: Qualification) => (a.id || 0) - (b.id || 0),
    },
    {
      title: '资质名称',
      dataIndex: 'qualification_name',
      key: 'qualification_name',
      sorter: (a: Qualification, b: Qualification) => 
        a.qualification_name.localeCompare(b.qualification_name),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="搜索资质名称"
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => confirm()}
              size="small"
              style={{ width: 90 }}
            >
              搜索
            </Button>
            <Button
              onClick={() => clearFilters()}
              size="small"
              style={{ width: 90 }}
            >
              重置
            </Button>
          </Space>
        </div>
      ),
      onFilter: (value: any, record: Qualification) =>
        record.qualification_name.toLowerCase().includes(String(value).toLowerCase()),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Qualification) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个资质吗？"
            description="删除后相关的人员资质和操作要求也会受到影响"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增资质
          </Button>
        </div>
        <div style={{ color: '#666', fontSize: '14px' }}>
          共 {qualifications.length} 项资质
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={qualifications}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
          pageSize: 10,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        size="middle"
      />

      <Modal
        title={editingQualification ? '编辑资质' : '新增资质'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="资质名称"
            name="qualification_name"
            rules={[
              { required: true, message: '请输入资质名称' },
              { min: 2, message: '资质名称至少2个字符' },
              { max: 100, message: '资质名称不能超过100个字符' }
            ]}
          >
            <Input 
              placeholder="请输入资质名称，如：操作员证书、安全证书等" 
              showCount
              maxLength={100}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default QualificationTable;