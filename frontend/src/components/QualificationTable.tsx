import React, { useState, useEffect } from 'react';
import { Table, Form, Space, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { Qualification } from '../types';
import { qualificationApi } from '../services/api';
import { 
  WxbCard, 
  WxbButton, 
  WxbInput, 
  WxbTableWrapper, 
  WxbModal, 
  WxbBadge 
} from './wxb-ui';

const QualificationTable: React.FC = () => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQualification, setEditingQualification] = useState<Qualification | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null);
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

  const handleConfirmDelete = async () => {
    if (!deleteRecordId) return;
    try {
      await qualificationApi.delete(deleteRecordId);
      message.success('删除成功');
      setDeleteRecordId(null);
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
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <WxbInput
            placeholder="搜索资质名称"
            value={selectedKeys[0]}
            onChange={(e: any) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onKeyDown={(e: any) => e.key === 'Enter' && confirm()}
          />
          <Space>
            <WxbButton
              variant="primary"
              onClick={() => confirm()}
              size="sm"
            >
              <SearchOutlined style={{ marginRight: 4 }} />搜索
            </WxbButton>
            <WxbButton
              variant="secondary"
              onClick={() => clearFilters()}
              size="sm"
            >
              重置
            </WxbButton>
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
          <WxbButton
            variant="ghost"
            size="sm"
            onClick={() => handleEdit(record)}
          >
            <EditOutlined style={{ marginRight: 4 }} />编辑
          </WxbButton>
          <WxbButton
            variant="ghost"
            size="sm"
            style={{ color: 'var(--wx-color-error)' }}
            onClick={() => setDeleteRecordId(record.id!)}
          >
            <DeleteOutlined style={{ marginRight: 4 }} />删除
          </WxbButton>
        </Space>
      ),
    },
  ];

  return (
    <div className="dashboard-page" style={{ padding: 24 }}>
      <WxbCard>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <WxbButton
              variant="primary"
              onClick={handleAdd}
            >
              <PlusOutlined style={{ marginRight: 8 }} />新增资质
            </WxbButton>
          </div>
          <WxbBadge 
            variant="outline" 
            status="info" 
            label={`共 ${qualifications.length} 项资质`} 
          />
        </div>

        <WxbTableWrapper>
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
        </WxbTableWrapper>
      </WxbCard>

      <WxbModal
        title={editingQualification ? '编辑资质' : '新增资质'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
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
            <WxbInput 
              placeholder="请输入资质名称，如：操作员证书、安全证书等" 
            />
          </Form.Item>
        </Form>
      </WxbModal>

      <WxbModal
        title="确认删除"
        open={!!deleteRecordId}
        onCancel={() => setDeleteRecordId(null)}
        onOk={handleConfirmDelete}
        okText="确定删除"
        okVariant="danger"
        width={400}
      >
        <p className="wxb-body" style={{ margin: '16px 0' }}>
          确定要删除这个资质吗？<br/>
          <span style={{ color: 'var(--wx-color-error)', fontSize: '12px' }}>删除后相关的人员资质和操作要求也会受到影响。</span>
        </p>
      </WxbModal>
    </div>
  );
};

export default QualificationTable;