import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Button, Form, Select, InputNumber, Space, message, Popconfirm, Tag, Tooltip, Input, Card, Statistic, Row, Col, Divider, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ClearOutlined, CheckCircleOutlined, ExclamationCircleOutlined, AppstoreAddOutlined, DeleteFilled } from '@ant-design/icons';
import { Employee, Qualification, EmployeeQualification } from '../types';
import { employeeQualificationApi, qualificationApi } from '../services/api';

interface EmployeeQualificationModalProps {
  visible: boolean;
  employee: Employee | null;
  onClose: () => void;
}

interface ExtendedEmployeeQualification extends EmployeeQualification {
  qualification_name?: string;
}

const EmployeeQualificationModal: React.FC<EmployeeQualificationModalProps> = ({
  visible,
  employee,
  onClose
}) => {
  const [employeeQualifications, setEmployeeQualifications] = useState<ExtendedEmployeeQualification[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [filteredQualifications, setFilteredQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExtendedEmployeeQualification | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBatchAdd, setShowBatchAdd] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();

  const fetchEmployeeQualifications = useCallback(async () => {
    if (!employee?.id) return;
    
    setLoading(true);
    try {
      const response = await employeeQualificationApi.getByEmployeeId(employee.id);
      setEmployeeQualifications(response.data);
    } catch (error) {
      message.error('获取人员资质失败');
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  const fetchQualifications = useCallback(async () => {
    try {
      const response = await qualificationApi.getAll();
      setQualifications(response.data);
      setFilteredQualifications(response.data);
    } catch (error) {
      message.error('获取资质列表失败');
    }
  }, []);

  const filterAvailableQualifications = useCallback(() => {
    const existingQualificationIds = employeeQualifications.map(eq => eq.qualification_id);
    const available = qualifications.filter(q => !existingQualificationIds.includes(q.id!));
    setFilteredQualifications(available);
  }, [qualifications, employeeQualifications]);

  useEffect(() => {
    if (visible && employee) {
      fetchEmployeeQualifications();
      fetchQualifications();
    }
  }, [visible, employee, fetchEmployeeQualifications, fetchQualifications]);

  useEffect(() => {
    filterAvailableQualifications();
  }, [qualifications, employeeQualifications, filterAvailableQualifications]);

  const handleAdd = () => {
    setEditingRecord(null);
    setShowAddForm(true);
    form.resetFields();
    form.setFieldsValue({ employee_id: employee?.id });
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setEditingRecord(null);
    form.resetFields();
  };

  const handleBatchAdd = () => {
    setShowBatchAdd(true);
    batchForm.resetFields();
  };

  const handleBatchAddSubmit = async (values: any) => {
    const { qualifications: selectedQualifications, defaultLevel } = values;
    
    try {
      const promises = selectedQualifications.map((qualificationId: number) => 
        employeeQualificationApi.create({
          employee_id: employee!.id!,
          qualification_id: qualificationId,
          qualification_level: defaultLevel
        })
      );
      
      await Promise.all(promises);
      message.success(`成功添加 ${selectedQualifications.length} 个资质`);
      setShowBatchAdd(false);
      batchForm.resetFields();
      fetchEmployeeQualifications();
    } catch (error) {
      message.error('批量添加失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的资质');
      return;
    }

    try {
      const promises = selectedRowKeys.map(id => employeeQualificationApi.delete(Number(id)));
      await Promise.all(promises);
      message.success(`成功删除 ${selectedRowKeys.length} 个资质`);
      setSelectedRowKeys([]);
      fetchEmployeeQualifications();
    } catch (error) {
      message.error('批量删除失败');
    }
  };

  const handleEdit = (record: ExtendedEmployeeQualification) => {
    setEditingRecord(record);
    setShowAddForm(true);
    form.setFieldsValue(record);
  };

  const handleDelete = async (id: number) => {
    try {
      await employeeQualificationApi.delete(id);
      message.success('删除成功');
      fetchEmployeeQualifications();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: EmployeeQualification) => {
    try {
      if (editingRecord) {
        await employeeQualificationApi.update(editingRecord.id!, values);
        message.success('更新成功');
      } else {
        await employeeQualificationApi.create(values);
        message.success('添加成功');
      }
      setEditingRecord(null);
      setShowAddForm(false);
      form.resetFields();
      fetchEmployeeQualifications();
    } catch (error: any) {
      if (error.response?.data?.error === 'Employee already has this qualification') {
        message.error('该人员已具备此资质');
      } else {
        message.error(editingRecord ? '更新失败' : '添加失败');
      }
    }
  };

  const getQualificationLevelColor = (level: number) => {
    const colors = ['', 'red', 'orange', 'gold', 'green', 'blue'];
    return colors[level] || 'default';
  };

  const getQualificationLevelIcon = (level: number) => {
    return level >= 4 ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />;
  };

  const columns = [
    {
      title: '资质名称',
      dataIndex: 'qualification_name',
      key: 'qualification_name',
      render: (name: string) => (
        <strong style={{ color: '#1890ff' }}>{name}</strong>
      ),
    },
    {
      title: '资质等级',
      dataIndex: 'qualification_level',
      key: 'qualification_level',
      width: 120,
      render: (level: number) => (
        <Tag 
          color={getQualificationLevelColor(level)} 
          icon={getQualificationLevelIcon(level)}
          style={{ minWidth: '60px', textAlign: 'center' }}
        >
          {level}级
        </Tag>
      ),
      sorter: (a: ExtendedEmployeeQualification, b: ExtendedEmployeeQualification) => 
        a.qualification_level - b.qualification_level,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: ExtendedEmployeeQualification) => (
        <Space size="small">
          <Tooltip title="编辑资质等级">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Popconfirm
            title="确定要删除这个资质吗？"
            description="删除后将无法恢复"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
          >
            <Tooltip title="删除资质">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const levelOptions = [
    { label: '1级', value: 1 },
    { label: '2级', value: 2 },
    { label: '3级', value: 3 },
    { label: '4级', value: 4 },
    { label: '5级', value: 5 },
  ];

  const getQualificationStats = () => {
    const totalQualifications = employeeQualifications.length;
    const highLevelCount = employeeQualifications.filter(q => q.qualification_level >= 4).length;
    const avgLevel = totalQualifications > 0 
      ? (employeeQualifications.reduce((sum, q) => sum + q.qualification_level, 0) / totalQualifications).toFixed(1)
      : '0';
    
    return { totalQualifications, highLevelCount, avgLevel };
  };

  const stats = getQualificationStats();

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>人员资质管理</span>
          <Tag color="blue">{employee?.employee_name}</Tag>
          <Tag>{employee?.employee_code}</Tag>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
    >
      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="总资质数"
              value={stats.totalQualifications}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="高级资质"
              value={stats.highLevelCount}
              suffix={`/ ${stats.totalQualifications}`}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="平均等级"
              value={stats.avgLevel}
              precision={1}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 操作按钮 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={filteredQualifications.length === 0}
          >
            添加资质
          </Button>
          <Button
            type="default"
            icon={<AppstoreAddOutlined />}
            onClick={handleBatchAdd}
            disabled={filteredQualifications.length === 0}
          >
            批量添加
          </Button>
          {filteredQualifications.length === 0 && (
            <span style={{ color: '#999', fontSize: '12px' }}>
              所有资质已添加
            </span>
          )}
        </Space>
        
        <Input
          placeholder="搜索资质名称"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 200 }}
          allowClear
        />
      </div>

      {/* 批量操作 */}
      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f8ff', borderRadius: 6, border: '1px solid #d9d9d9' }}>
          <Space>
            <span>已选择 {selectedRowKeys.length} 项</span>
            <Popconfirm
              title={`确定要删除选中的 ${selectedRowKeys.length} 个资质吗？`}
              description="删除后将无法恢复"
              onConfirm={handleBatchDelete}
              okText="确定"
              cancelText="取消"
              icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
            >
              <Button 
                danger 
                size="small" 
                icon={<DeleteFilled />}
              >
                批量删除
              </Button>
            </Popconfirm>
            <Button 
              size="small" 
              onClick={() => setSelectedRowKeys([])}
            >
              取消选择
            </Button>
          </Space>
        </div>
      )}

      {/* 资质表格 */}
      <Table
        columns={columns}
        dataSource={employeeQualifications.filter(eq => 
          !searchText || eq.qualification_name?.toLowerCase().includes(searchText.toLowerCase())
        )}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: '暂无资质记录' }}
        scroll={{ y: 300 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          selections: [
            Table.SELECTION_ALL,
            Table.SELECTION_INVERT,
            Table.SELECTION_NONE,
          ],
        }}
      />

      {/* 添加/编辑表单 */}
      {showAddForm && (
        <Card 
          title={editingRecord ? '编辑资质' : '添加资质'}
          style={{ marginTop: 16 }}
          size="small"
          extra={
            <Button 
              type="text" 
              icon={<ClearOutlined />} 
              onClick={handleCancelAdd}
            >
              关闭
            </Button>
          }
        >
          <Form
            form={form}
            layout="inline"
            onFinish={handleSubmit}
          >
            <Form.Item name="employee_id" hidden>
              <InputNumber />
            </Form.Item>

            <Form.Item
              label="资质"
              name="qualification_id"
              rules={[{ required: true, message: '请选择资质' }]}
            >
              <Select
                placeholder="请选择资质"
                style={{ width: 250 }}
                showSearch
                filterOption={(input, option: any) =>
                  String(option?.children || '')?.toLowerCase().includes(input.toLowerCase())
                }
                disabled={!!editingRecord}
              >
                {(editingRecord ? qualifications : filteredQualifications).map(q => (
                  <Select.Option key={q.id} value={q.id}>
                    {q.qualification_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="等级"
              name="qualification_level"
              rules={[{ required: true, message: '请选择等级' }]}
            >
              <Select placeholder="请选择等级" style={{ width: 120 }}>
                {levelOptions.map(level => (
                  <Select.Option key={level.value} value={level.value}>
                    <Tag color={getQualificationLevelColor(level.value)}>
                      {level.label}
                    </Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  {editingRecord ? '更新' : '添加'}
                </Button>
                <Button onClick={handleCancelAdd}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* 批量添加表单 */}
      {showBatchAdd && (
        <Card 
          title="批量添加资质"
          style={{ marginTop: 16 }}
          size="small"
          extra={
            <Button 
              type="text" 
              icon={<ClearOutlined />} 
              onClick={() => setShowBatchAdd(false)}
            >
              关闭
            </Button>
          }
        >
          <Form
            form={batchForm}
            layout="vertical"
            onFinish={handleBatchAddSubmit}
          >
            <Form.Item
              label="选择资质"
              name="qualifications"
              rules={[{ required: true, message: '请至少选择一个资质' }]}
            >
              <Checkbox.Group style={{ width: '100%' }}>
                <Row gutter={[16, 8]}>
                  {filteredQualifications.map(q => (
                    <Col span={8} key={q.id}>
                      <Checkbox value={q.id}>
                        {q.qualification_name}
                      </Checkbox>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Form.Item>

            <Form.Item
              label="默认等级"
              name="defaultLevel"
              rules={[{ required: true, message: '请选择默认等级' }]}
              initialValue={3}
            >
              <Select style={{ width: 150 }}>
                {levelOptions.map(level => (
                  <Select.Option key={level.value} value={level.value}>
                    <Tag color={getQualificationLevelColor(level.value)}>
                      {level.label}
                    </Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={<AppstoreAddOutlined />}>
                  批量添加
                </Button>
                <Button onClick={() => setShowBatchAdd(false)}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}
    </Modal>
  );
};

export default EmployeeQualificationModal;