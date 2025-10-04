import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  Switch, 
  Select,
  Space, 
  message,
  Popconfirm,
  Tag,
  Card,
  Alert,
  Descriptions
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { SchedulingRule } from '../types';

const { TextArea } = Input;
const { Option } = Select;

const ScheduleRulesManagement: React.FC = () => {
  const [rules, setRules] = useState<SchedulingRule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<SchedulingRule | null>(null);
  const [form] = Form.useForm();

  // 规则类型映射
  const ruleTypeMap = {
    MIN_REST_HOURS: '最小休息时间',
    MAX_CONSECUTIVE_DAYS: '最大连续工作天数',
    WEEKEND_REST: '周末休息',
    NIGHT_SHIFT_LIMIT: '夜班限制',
    LONG_DAY_SHIFT_LIMIT: '长白班限制',
    CROSS_DAY_SHIFT_LIMIT: '跨天班次限制',
    DAILY_HOURS_LIMIT: '每日工时限制',
    OVERTIME_LIMIT: '加班限制',
  };

  // 规则单位映射
  const ruleUnitMap = {
    hours: '小时',
    days: '天',
    times: '次',
    percent: '%',
  };

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 180,
    },
    {
      title: '规则类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      render: (type: string) => (
        <Tag color="blue">{ruleTypeMap[type as keyof typeof ruleTypeMap] || type}</Tag>
      ),
    },
    {
      title: '规则值',
      key: 'rule_value_display',
      render: (record: SchedulingRule) => (
        <span style={{ fontWeight: 'bold' }}>
          {record.rule_value} {ruleUnitMap[record.rule_unit as keyof typeof ruleUnitMap] || record.rule_unit}
        </span>
      ),
    },
    {
      title: '规则描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
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
      width: 150,
      render: (record: SchedulingRule) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个规则吗？"
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

  const handleEdit = (rule: SchedulingRule) => {
    setEditingRule(rule);
    form.setFieldsValue(rule);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    // TODO: 实现删除功能
    message.success('删除成功（占位符）');
  };

  const handleAdd = () => {
    setEditingRule(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (editingRule) {
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
    setEditingRule(null);
    form.resetFields();
  };

  // 根据规则类型获取建议的单位和默认值
  const getRuleDefaults = (ruleType: string) => {
    const defaults = {
      MIN_REST_HOURS: { unit: 'hours', value: 12 },
      MAX_CONSECUTIVE_DAYS: { unit: 'days', value: 6 },
      NIGHT_SHIFT_LIMIT: { unit: 'days', value: 1 },
      LONG_DAY_SHIFT_LIMIT: { unit: 'days', value: 2 },
      CROSS_DAY_SHIFT_LIMIT: { unit: 'days', value: 2 },
      DAILY_HOURS_LIMIT: { unit: 'hours', value: 11 },
      OVERTIME_LIMIT: { unit: 'hours', value: 36 },
      WEEKEND_REST: { unit: 'days', value: 1 },
    };
    return defaults[ruleType as keyof typeof defaults] || { unit: 'hours', value: 1 };
  };

  // 监听规则类型变化，自动设置单位和默认值
  const handleRuleTypeChange = (ruleType: string) => {
    const defaults = getRuleDefaults(ruleType);
    form.setFieldsValue({
      rule_unit: defaults.unit,
      rule_value: defaults.value,
    });
  };

  // TODO: 从API加载排班规则数据
  useEffect(() => {
    // setRules([]);
  }, []);

  return (
    <div>
      {/* 规则说明 */}
      <Alert
        message="排班规则说明"
        description="排班规则用于确保员工排班符合劳动法规定和公司政策。系统会在排班时自动检测违规情况并提示冲突。"
        type="info"
        icon={<WarningOutlined />}
        style={{ marginBottom: 16 }}
        showIcon
      />

      {/* 重要规则概览 */}
      <Card title="重要规则概览" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="最小休息时间">
            {rules.find(r => r.rule_type === 'MIN_REST_HOURS')?.rule_value || 0} 小时
          </Descriptions.Item>
          <Descriptions.Item label="最大连续工作天数">
            {rules.find(r => r.rule_type === 'MAX_CONSECUTIVE_DAYS')?.rule_value || 0} 天
          </Descriptions.Item>
          <Descriptions.Item label="每日工时限制">
            {rules.find(r => r.rule_type === 'DAILY_HOURS_LIMIT')?.rule_value || 0} 小时
          </Descriptions.Item>
          <Descriptions.Item label="月度加班限制">
            {rules.find(r => r.rule_type === 'OVERTIME_LIMIT')?.rule_value || 0} 小时
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 操作按钮 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增规则
          </Button>
          <Button>
            批量启用
          </Button>
          <Button>
            批量禁用
          </Button>
        </Space>
      </div>

      {/* 规则表格 */}
      <Table
        columns={columns}
        dataSource={rules}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      {/* 新增/编辑规则模态框 */}
      <Modal
        title={editingRule ? '编辑排班规则' : '新增排班规则'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            is_active: true,
            rule_unit: 'hours',
            rule_value: 1,
          }}
        >
          <Form.Item
            name="rule_name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如：最小休息时间" />
          </Form.Item>

          <Form.Item
            name="rule_type"
            label="规则类型"
            rules={[{ required: true, message: '请选择规则类型' }]}
          >
            <Select 
              placeholder="选择规则类型"
              onChange={handleRuleTypeChange}
            >
              {Object.entries(ruleTypeMap).map(([key, value]) => (
                <Option key={key} value={key}>
                  {value}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Form.Item
              name="rule_value"
              label="规则值"
              rules={[{ required: true, message: '请输入规则值' }]}
            >
              <InputNumber min={0} step={0.1} style={{ width: 150 }} />
            </Form.Item>

            <Form.Item
              name="rule_unit"
              label="单位"
              rules={[{ required: true, message: '请选择单位' }]}
            >
              <Select style={{ width: 100 }}>
                {Object.entries(ruleUnitMap).map(([key, value]) => (
                  <Option key={key} value={key}>
                    {value}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Space>

          <Form.Item
            name="description"
            label="规则描述"
            rules={[{ required: true, message: '请输入规则描述' }]}
          >
            <TextArea rows={3} placeholder="详细描述这个规则的作用和限制" />
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ScheduleRulesManagement;