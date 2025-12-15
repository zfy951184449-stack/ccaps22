import React, { useState } from 'react';
import {
  Card,
  List,
  Button,
  Tag,
  Switch,
  Space,
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  message,
  Empty,
  Tooltip,
  Typography,
  Radio
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { Text } = Typography;

interface Constraint {
  constraint_id?: number;
  related_schedule_id: number;
  related_operation_name: string;
  related_operation_code: string;
  constraint_type: number;
  lag_time: number;
  lag_type?: 'ASAP' | 'FIXED' | 'WINDOW' | 'NEXT_DAY' | 'NEXT_SHIFT' | 'COOLING' | 'BATCH_END';
  lag_min?: number;
  lag_max?: number | null;
  share_mode?: 'NONE' | 'SAME_TEAM' | 'DIFFERENT';
  constraint_name?: string;
  constraint_level?: number;
  description?: string;
  relation_type: 'predecessor' | 'successor';
}

interface OperationConstraintsPanelProps {
  scheduleId?: number;
  constraints: {
    predecessors: Constraint[];
    successors: Constraint[];
  };
  availableOperations: any[];
  onConstraintAdded: () => void;
  onConstraintUpdated: () => void;
  onConstraintDeleted: () => void;
}

const API_BASE_URL = 'http://localhost:3001/api';

const OperationConstraintsPanel: React.FC<OperationConstraintsPanelProps> = ({
  scheduleId,
  constraints,
  availableOperations,
  onConstraintAdded,
  onConstraintUpdated,
  onConstraintDeleted
}) => {
  const [addConstraintModalVisible, setAddConstraintModalVisible] = useState(false);
  const [constraintForm] = Form.useForm();
  const [constraintType, setConstraintType] = useState<'predecessor' | 'successor'>('predecessor');
  const [loading, setLoading] = useState(false);

  const constraintTypeOptions = [
    { value: 1, label: 'FS (完成-开始)', color: 'blue', description: '前置操作完成后，当前操作才能开始' },
    { value: 2, label: 'SS (开始-开始)', color: 'green', description: '前置操作开始后，当前操作才能开始' },
    { value: 3, label: 'FF (完成-完成)', color: 'orange', description: '前置操作完成后，当前操作才能完成' },
    { value: 4, label: 'SF (开始-完成)', color: 'purple', description: '前置操作开始后，当前操作才能完成' }
  ];

  const lagTypeOptions = [
    { value: 'ASAP', label: '尽早开始', color: 'green', description: '尽快开始，无延迟' },
    { value: 'FIXED', label: '固定延迟', color: 'blue', description: '固定时间间隔' },
    { value: 'WINDOW', label: '时间窗口', color: 'cyan', description: '在时间范围内开始' },
    { value: 'NEXT_DAY', label: '次日开始', color: 'gold', description: '第二天开始' },
    { value: 'NEXT_SHIFT', label: '下一班次', color: 'orange', description: '下一个班次开始' },
    { value: 'COOLING', label: '冷却/培养', color: 'purple', description: '需要冷却或培养时间' },
    { value: 'BATCH_END', label: '批次结束后', color: 'magenta', description: '批次结束后执行' }
  ];

  const getConstraintTypeTag = (type: number, detailed: boolean = false) => {
    const option = constraintTypeOptions.find(o => o.value === type);
    if (!option) {
      return <Tag>未知</Tag>;
    }

    const shortLabel = option.label.split(' ')[0];
    const fullLabel = option.label;

    return (
      <Tooltip title={option.description}>
        <Tag color={option.color}>
          {detailed ? fullLabel : shortLabel}
        </Tag>
      </Tooltip>
    );
  };

  const getConstraintLevelTag = (level?: number) => {
    if (!level || level === 1) {
      return <Tag color="red">硬</Tag>;
    }
    if (level === 2) {
      return <Tag color="gold">软</Tag>;
    }
    return <Tag>建议</Tag>;
  };

  const getLagTypeTag = (lagType?: string) => {
    const option = lagTypeOptions.find(o => o.value === lagType);
    if (!option) {
      return null;
    }
    return (
      <Tooltip title={option.description}>
        <Tag color={option.color}>{option.label}</Tag>
      </Tooltip>
    );
  };

  const handleAddConstraint = () => {
    if (!scheduleId) {
      message.warning('请先保存操作后再添加约束');
      return;
    }
    constraintForm.resetFields();
    setAddConstraintModalVisible(true);
  };

  const handleSaveConstraint = async (values: any) => {
    if (!scheduleId) return;

    setLoading(true);
    try {
      const data = {
        from_schedule_id: constraintType === 'predecessor' ? scheduleId : values.related_schedule_id,
        to_schedule_id: constraintType === 'predecessor' ? values.related_schedule_id : scheduleId,
        constraint_type: values.constraint_type,
        constraint_level: values.constraint_level ?? 1,
        lag_time: values.lag_time || 0,
        lag_type: values.lag_type || 'FIXED',
        lag_min: values.lag_min || 0,
        lag_max: values.lag_max || null,
        share_mode: values.share_mode || 'NONE',
        constraint_name: values.constraint_name || null,
        description: values.description || null
      };

      await axios.post(`${API_BASE_URL}/constraints`, data);
      message.success('约束添加成功');
      setAddConstraintModalVisible(false);
      onConstraintAdded();
    } catch (error: any) {
      console.error('Error adding constraint:', error);
      if (error.response?.data?.error === 'Would create circular dependency') {
        message.error('添加失败：会产生循环依赖');
      } else if (error.response?.data?.error === 'Constraint already exists') {
        message.error('添加失败：约束已存在');
      } else {
        message.error('添加约束失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConstraint = async (constraintId: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个约束吗？',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/constraints/${constraintId}`);
          message.success('约束删除成功');
          onConstraintDeleted();
        } catch (error) {
          console.error('Error deleting constraint:', error);
          message.error('删除约束失败');
        }
      }
    });
  };

  const handleToggleShareMode = async (constraint: Constraint, newMode: 'NONE' | 'SAME_TEAM' | 'DIFFERENT') => {
    try {
      await axios.put(`${API_BASE_URL}/constraints/${constraint.constraint_id}`, {
        constraint_type: constraint.constraint_type,
        constraint_level: constraint.constraint_level ?? 1,
        lag_time: constraint.lag_time,
        lag_type: constraint.lag_type || 'FIXED',
        lag_min: constraint.lag_min || 0,
        lag_max: constraint.lag_max || null,
        share_mode: newMode,
        constraint_name: constraint.constraint_name || null,
        description: constraint.description || null
      });
      message.success('更新成功');
      onConstraintUpdated();
    } catch (error) {
      console.error('Error updating constraint:', error);
      message.error('更新失败');
    }
  };

  const renderConstraintList = (items: Constraint[], type: 'predecessor' | 'successor') => {
    if (items.length === 0) {
      return <Empty description={type === 'predecessor' ? '无前置约束' : '无后续约束'} />;
    }

    return (
      <List
        size="small"
        dataSource={items}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Tooltip title={
                item.share_mode === 'SAME_TEAM' ? '同组执行' :
                  item.share_mode === 'DIFFERENT' ? '不同人员' : '无共享'
              }>
                <Select
                  size="small"
                  value={item.share_mode || 'NONE'}
                  onChange={(val) => handleToggleShareMode(item, val)}
                  style={{ width: 90 }}
                >
                  <Select.Option value="NONE">无</Select.Option>
                  <Select.Option value="SAME_TEAM">同组</Select.Option>
                  <Select.Option value="DIFFERENT">不同</Select.Option>
                </Select>
              </Tooltip>,
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => item.constraint_id && handleDeleteConstraint(item.constraint_id)}
              />
            ]}
          >
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getConstraintTypeTag(item.constraint_type, true)}
                {item.constraint_level !== undefined && getConstraintLevelTag(item.constraint_level)}
                {item.lag_type && getLagTypeTag(item.lag_type)}
                {(item.lag_type === 'FIXED' || item.lag_type === 'COOLING') && !!item.lag_min && (
                  <Tag icon={<ClockCircleOutlined />} color="blue">
                    {item.lag_min}h
                  </Tag>
                )}
                {item.lag_type === 'WINDOW' && item.lag_min !== undefined && (
                  <Tag icon={<ClockCircleOutlined />} color="cyan">
                    {item.lag_min}h - {item.lag_max || '∞'}h
                  </Tag>
                )}
                {item.share_mode && item.share_mode !== 'NONE' && (
                  <Tag color={item.share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}>
                    {item.share_mode === 'SAME_TEAM' ? '同组执行' : '不同人员'}
                  </Tag>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#666' }}>
                {type === 'predecessor' ? (
                  <span>
                    <Text strong style={{ color: '#1890ff' }}>{item.related_operation_name}</Text>
                    <span style={{ margin: '0 6px' }}>→</span>
                    <Text strong>当前操作</Text>
                  </span>
                ) : (
                  <span>
                    <Text strong>当前操作</Text>
                    <span style={{ margin: '0 6px' }}>→</span>
                    <Text strong style={{ color: '#1890ff' }}>{item.related_operation_name}</Text>
                  </span>
                )}
              </div>
              {item.constraint_name && (
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                  约束名称: {item.constraint_name}
                </div>
              )}
              {item.description && (
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                  说明: {item.description}
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    );
  };

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card
          size="small"
          title="前置约束"
          extra={
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setConstraintType('predecessor');
                handleAddConstraint();
              }}
            >
              添加前置
            </Button>
          }
        >
          {renderConstraintList(constraints.predecessors, 'predecessor')}
        </Card>

        <Card
          size="small"
          title="后续约束"
          extra={
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setConstraintType('successor');
                handleAddConstraint();
              }}
            >
              添加后续
            </Button>
          }
        >
          {renderConstraintList(constraints.successors, 'successor')}
        </Card>
      </Space>

      <Modal
        title={`添加${constraintType === 'predecessor' ? '前置' : '后续'}约束`}
        open={addConstraintModalVisible}
        onCancel={() => setAddConstraintModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={constraintForm}
          layout="vertical"
          onFinish={handleSaveConstraint}
        >
          <Form.Item
            name="related_schedule_id"
            label={
              <span>
                {constraintType === 'predecessor' ? '选择前置操作' : '选择后续操作'}
                <span style={{ fontSize: '12px', color: '#999', marginLeft: '8px' }}>
                  (共{availableOperations.filter(op => op.schedule_id !== scheduleId).length}个可选)
                </span>
              </span>
            }
            rules={[{ required: true, message: '请选择操作' }]}
          >
            <Select
              showSearch
              placeholder="请搜索或选择操作（可搜索操作名称、阶段名称、操作代码）"
              optionFilterProp="children"
              listHeight={400}
              dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
              filterOption={(input, option) => {
                if (!input) return true;
                const searchTerm = input.toLowerCase();
                const label = option?.label as string || '';

                // 搜索操作名称、阶段名称、操作代码
                return label.toLowerCase().includes(searchTerm);
              }}
            >
              {availableOperations
                .filter(op => op.schedule_id !== scheduleId)
                .map(op => (
                  <Option
                    key={op.schedule_id}
                    value={op.schedule_id}
                    label={`${op.stage_name} - ${op.operation_name} (${op.operation_code})`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
                      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>
                        {op.operation_name} ({op.operation_code})
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        阶段: {op.stage_name} | Day{op.operation_day} {op.recommended_time}:00
                      </div>
                    </div>
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <div style={{
            background: '#f6f8fa',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            border: '1px solid #e8e8e8'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <InfoCircleOutlined style={{ color: '#1890ff', marginRight: '6px' }} />
              <Text strong style={{ color: '#1890ff' }}>约束类型说明</Text>
            </div>
            <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
              <div>• <strong>FS (完成-开始)</strong>: 前置操作完成后，后续操作才能开始</div>
              <div>• <strong>SS (开始-开始)</strong>: 前置操作开始后，后续操作才能开始</div>
              <div>• <strong>FF (完成-完成)</strong>: 前置操作完成后，后续操作才能完成</div>
              <div>• <strong>SF (开始-完成)</strong>: 前置操作开始后，后续操作才能完成</div>
            </div>
          </div>

          <Form.Item
            name="constraint_type"
            label="约束类型"
            rules={[{ required: true, message: '请选择约束类型' }]}
            initialValue={1}
          >
            <Select placeholder="请选择约束类型">
              {constraintTypeOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 'bold', color: option.color }}>
                      {option.label}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                      {option.description}
                    </span>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="constraint_level"
            label="约束强度"
            initialValue={1}
          >
            <Select>
              <Option value={1}>硬约束（必须满足）</Option>
              <Option value={2}>软约束（尽量满足）</Option>
              <Option value={3}>建议（可优化参考）</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="lag_type"
            label="延迟类型"
            initialValue="FIXED"
          >
            <Select placeholder="请选择延迟类型">
              {lagTypeOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Tag color={option.color} style={{ marginRight: 8 }}>{option.label}</Tag>
                    <span style={{ fontSize: '12px', color: '#666' }}>{option.description}</span>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.lag_type !== curr.lag_type}>
            {({ getFieldValue }) => {
              const lagType = getFieldValue('lag_type');
              const showLagMin = ['FIXED', 'WINDOW', 'COOLING'].includes(lagType);
              const showLagMax = lagType === 'WINDOW';

              return (
                <>
                  {showLagMin && (
                    <Form.Item
                      name="lag_min"
                      label={lagType === 'WINDOW' ? '最小延迟（小时）' : '延迟时间（小时）'}
                      initialValue={0}
                    >
                      <InputNumber min={0} max={999} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                  {showLagMax && (
                    <Form.Item
                      name="lag_max"
                      label="最大延迟（小时）"
                    >
                      <InputNumber min={0} max={999} step={0.5} style={{ width: '100%' }} placeholder="可选，不填表示无上限" />
                    </Form.Item>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item
            name="share_mode"
            label="人员共享"
            initialValue="NONE"
          >
            <Radio.Group>
              <Radio value="NONE">无</Radio>
              <Radio value="SAME_TEAM">同组执行</Radio>
              <Radio value="DIFFERENT">不同人员</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="constraint_name"
            label="约束名称"
          >
            <Input placeholder="可选：输入约束名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={2} placeholder="可选：输入约束描述" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                保存
              </Button>
              <Button onClick={() => setAddConstraintModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default OperationConstraintsPanel;
