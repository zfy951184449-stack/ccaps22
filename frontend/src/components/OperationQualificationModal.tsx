import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Table,
  Button,
  Select,
  InputNumber,
  Switch,
  Space,
  Tag,
  message,
  Popconfirm,
  Form,
  Row,
  Col,
  Typography,
  Divider,
  Badge,
  Empty,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

interface Qualification {
  id: number;
  qualification_name: string;
}

interface PositionQualification {
  id?: number;
  qualification_id: number;
  qualification_name?: string;
  min_level: number;
  is_mandatory: number;
}

interface Props {
  visible: boolean;
  operationId: number | null;
  operationName: string;
  onClose: () => void;
  onUpdate: () => void;
}

const OperationQualificationModal: React.FC<Props> = ({
  visible,
  operationId,
  operationName,
  onClose,
  onUpdate
}) => {
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [requiredPeople, setRequiredPeople] = useState<number>(1);
  const [positionRequirements, setPositionRequirements] = useState<{[key: number]: PositionQualification[]}>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePosition, setActivePosition] = useState<string>('1');
  const [form] = Form.useForm();
  const [addMode, setAddMode] = useState(false);

  // 获取所有可用资质
  const fetchAvailableQualifications = async () => {
    try {
      const response = await axios.get('/api/operation-qualifications/available');
      setQualifications(response.data);
    } catch (error) {
      message.error('获取资质列表失败');
    }
  };

  // 获取操作的资质要求
  const fetchOperationQualifications = async () => {
    if (!operationId) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`/api/operation-qualifications/${operationId}`);
      const { requiredPeople: people, positionRequirements: requirements } = response.data;
      
      setRequiredPeople(people);
      setPositionRequirements(requirements);
    } catch (error) {
      message.error('获取操作资质要求失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取操作的所需人数
  const fetchOperationInfo = async () => {
    if (!operationId) return;
    
    try {
      const response = await axios.get(`/api/operations/${operationId}`);
      const people = response.data.required_people || 1;
      setRequiredPeople(people);
      
      // 初始化空的位置要求
      const emptyRequirements: {[key: number]: PositionQualification[]} = {};
      for (let i = 1; i <= people; i++) {
        emptyRequirements[i] = [];
      }
      setPositionRequirements(emptyRequirements);
    } catch (error) {
      console.error('获取操作信息失败:', error);
    }
  };

  useEffect(() => {
    if (visible && operationId) {
      fetchAvailableQualifications();
      fetchOperationInfo();
      fetchOperationQualifications();
    }
  }, [visible, operationId]);

  // 添加资质要求到当前位置
  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      const position = parseInt(activePosition);
      
      // 检查是否已存在相同资质
      const exists = positionRequirements[position]?.some(
        q => q.qualification_id === values.qualification_id
      );
      
      if (exists) {
        message.warning('该位置已存在该资质要求');
        return;
      }
      
      const newQualification: PositionQualification = {
        ...values,
        qualification_name: qualifications.find(q => q.id === values.qualification_id)?.qualification_name
      };
      
      setPositionRequirements({
        ...positionRequirements,
        [position]: [...(positionRequirements[position] || []), newQualification]
      });
      
      form.resetFields();
      setAddMode(false);
      message.success('添加成功');
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  // 删除资质要求
  const handleDelete = (position: number, index: number) => {
    const newRequirements = [...(positionRequirements[position] || [])];
    newRequirements.splice(index, 1);
    
    setPositionRequirements({
      ...positionRequirements,
      [position]: newRequirements
    });
    
    message.success('删除成功');
  };

  // 更新资质要求字段
  const handleFieldUpdate = (position: number, index: number, field: string, value: any) => {
    const newRequirements = [...(positionRequirements[position] || [])];
    newRequirements[index] = { ...newRequirements[index], [field]: value };
    
    setPositionRequirements({
      ...positionRequirements,
      [position]: newRequirements
    });
  };

  // 复制位置要求
  const handleCopyPosition = (fromPosition: number, toPosition: number) => {
    const sourceRequirements = positionRequirements[fromPosition] || [];
    
    setPositionRequirements({
      ...positionRequirements,
      [toPosition]: [...sourceRequirements]
    });
    
    message.success(`已复制位置${fromPosition}的要求到位置${toPosition}`);
  };

  // 保存某个位置的更改
  const handleSavePosition = async (position: number) => {
    if (!operationId) return;
    
    setSaving(true);
    try {
      await axios.put(`/api/operation-qualifications/${operationId}/position/${position}`, {
        qualifications: positionRequirements[position] || []
      });
      
      message.success(`位置${position}的资质要求保存成功`);
      onUpdate();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 保存所有更改
  const handleSaveAll = async () => {
    if (!operationId) return;
    
    setSaving(true);
    try {
      // 依次保存每个位置的要求
      for (let position = 1; position <= requiredPeople; position++) {
        await axios.put(`/api/operation-qualifications/${operationId}/position/${position}`, {
          qualifications: positionRequirements[position] || []
        });
      }
      
      message.success('所有资质要求保存成功');
      onUpdate();
      onClose();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 表格列定义
  const getColumns = (position: number) => [
    {
      title: '资质名称',
      dataIndex: 'qualification_name',
      key: 'qualification_name',
      width: 200,
    },
    {
      title: '最低等级要求',
      dataIndex: 'min_level',
      key: 'min_level',
      width: 150,
      render: (level: number, record: PositionQualification, index: number) => (
        <Space>
          <InputNumber
            min={1}
            max={5}
            value={level}
            onChange={(value) => handleFieldUpdate(position, index, 'min_level', value)}
          />
          <Text type="secondary">级及以上</Text>
        </Space>
      ),
    },
    {
      title: '是否必须',
      dataIndex: 'is_mandatory',
      key: 'is_mandatory',
      width: 120,
      render: (mandatory: number, record: PositionQualification, index: number) => (
        <Switch
          checked={mandatory === 1}
          onChange={(checked) => handleFieldUpdate(position, index, 'is_mandatory', checked ? 1 : 0)}
          checkedChildren="必须"
          unCheckedChildren="可选"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: PositionQualification, index: number) => (
        <Popconfirm
          title="确定删除这个资质要求吗？"
          onConfirm={() => handleDelete(position, index)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // 渲染位置内容
  const renderPositionContent = (position: number) => {
    const requirements = positionRequirements[position] || [];
    const mandatoryCount = requirements.filter(r => r.is_mandatory === 1).length;
    const optionalCount = requirements.filter(r => r.is_mandatory === 0).length;

    return (
      <div>
        {/* 统计信息 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Tag icon={<ExclamationCircleOutlined />} color="red">
              必须资质: {mandatoryCount} 项
            </Tag>
          </Col>
          <Col span={8}>
            <Tag icon={<CheckCircleOutlined />} color="green">
              可选资质: {optionalCount} 项
            </Tag>
          </Col>
          <Col span={8}>
            <Space>
              <Tooltip title="复制此位置的要求到其他位置">
                <Button 
                  size="small" 
                  icon={<CopyOutlined />}
                  onClick={() => {
                    // 简单实现：复制到下一个位置
                    if (position < requiredPeople) {
                      handleCopyPosition(position, position + 1);
                    } else {
                      message.info('已是最后一个位置');
                    }
                  }}
                >
                  复制到下一位置
                </Button>
              </Tooltip>
            </Space>
          </Col>
        </Row>

        {/* 添加新资质要求 */}
        {!addMode ? (
          <Button 
            type="dashed" 
            icon={<PlusOutlined />} 
            onClick={() => setAddMode(true)}
            style={{ width: '100%', marginBottom: 16 }}
          >
            添加资质要求
          </Button>
        ) : (
          <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
            <Form.Item
              name="qualification_id"
              label="资质"
              rules={[{ required: true, message: '请选择资质' }]}
              style={{ width: 200 }}
            >
              <Select placeholder="选择资质">
                {qualifications.map(q => (
                  <Option key={q.id} value={q.id}>
                    {q.qualification_name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item
              name="min_level"
              label="最低等级"
              initialValue={1}
              rules={[{ required: true, message: '请输入等级' }]}
            >
              <InputNumber min={1} max={5} />
            </Form.Item>
            
            <Form.Item
              name="is_mandatory"
              label="必须"
              initialValue={1}
              valuePropName="checked"
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
            
            <Form.Item>
              <Space>
                <Button type="primary" onClick={handleAdd}>
                  添加
                </Button>
                <Button onClick={() => {
                  setAddMode(false);
                  form.resetFields();
                }}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}

        {/* 资质要求列表 */}
        {requirements.length > 0 ? (
          <Table
            columns={getColumns(position)}
            dataSource={requirements}
            rowKey={(record, index) => `${position}-${index}`}
            pagination={false}
            size="small"
          />
        ) : (
          <Empty description="暂无资质要求" />
        )}

        {/* 保存按钮 */}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Button 
            type="primary" 
            onClick={() => handleSavePosition(position)}
            loading={saving}
          >
            保存此位置
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <Text strong>设置资质要求 - {operationName}</Text>
          <Badge count={`${requiredPeople}人`} style={{ backgroundColor: '#52c41a' }} />
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="saveAll" type="primary" onClick={handleSaveAll} loading={saving}>
          保存所有位置
        </Button>,
      ]}
    >
      {/* 提示信息 */}
      <div style={{ marginBottom: 16, padding: '8px 12px', background: '#e6f7ff', borderRadius: 4 }}>
        <Space>
          <InfoCircleOutlined style={{ color: '#1890ff' }} />
          <Text type="secondary">
            为每个位置单独设置资质要求。高等级可以满足低等级要求（如5级可以做3级的工作）
          </Text>
        </Space>
      </div>

      {/* 位置标签页 */}
      <Tabs activeKey={activePosition} onChange={setActivePosition}>
        {Array.from({ length: requiredPeople }, (_, i) => i + 1).map(position => (
          <TabPane 
            tab={
              <Space>
                <UserOutlined />
                <span>位置 {position}</span>
                <Badge 
                  count={(positionRequirements[position] || []).length} 
                  size="small" 
                />
              </Space>
            } 
            key={position.toString()}
          >
            {renderPositionContent(position)}
          </TabPane>
        ))}
      </Tabs>
    </Modal>
  );
};

export default OperationQualificationModal;