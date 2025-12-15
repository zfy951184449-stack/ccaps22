import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Typography,
  Slider,
  Select,
  Tooltip,
  Tabs
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import axios from 'axios';
import OperationQualificationModal from './OperationQualificationModal';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface Operation {
  id: number;
  operation_code: string;
  operation_name: string;
  standard_time: number;
  required_people?: number;
  description?: string;
  qualification_count?: number;
  operation_type_id?: number | null;
  operation_type_code?: string | null;
  operation_type_name?: string | null;
  operation_type_color?: string | null;
}

interface OperationType {
  id: number;
  type_code: string;
  type_name: string;
  team_id: number;
  team_code: string;
  team_name: string;
  color: string;
}

interface Team {
  id: number;
  unit_code: string;
  unit_name: string;
}

interface Statistics {
  summary: {
    total_operations: number;
    avg_time: number;
    min_time: number;
    max_time: number;
    avg_people: number;
  };
  peopleDistribution: Array<{
    required_people: number;
    count: number;
  }>;
}

const OperationTable: React.FC = () => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [peopleFilter, setPeopleFilter] = useState<number[]>([]);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 1000]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [nextCode, setNextCode] = useState<string>('');
  const [qualificationModalVisible, setQualificationModalVisible] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<{ id: number; name: string } | null>(null);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [qualifiedPersonnelMap, setQualifiedPersonnelMap] = useState<{ [key: number]: number[] }>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>('all');

  // 获取操作列表
  const fetchOperations = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/operations');
      const normalizedData = (response.data || []).map((operation: any) => ({
        ...operation,
        standard_time: Number(operation.standard_time),
        required_people:
          operation.required_people !== undefined && operation.required_people !== null
            ? Number(operation.required_people)
            : 1,
      }));
      setOperations(normalizedData);
    } catch (error) {
      message.error('获取操作列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取统计信息
  const fetchStatistics = async () => {
    try {
      const response = await axios.get('/api/operations/statistics');
      setStatistics(response.data);
      if (response.data.summary.max_time > 0) {
        setTimeRange([0, Math.ceil(response.data.summary.max_time)]);
      }
    } catch (error) {
      console.error('获取统计信息失败:', error);
    }
  };

  // 获取下一个操作编码
  const fetchNextCode = async () => {
    try {
      const response = await axios.get('/api/operations/next-code');
      setNextCode(response.data.nextCode);
    } catch (error) {
      console.error('获取下一个编码失败:', error);
    }
  };

  useEffect(() => {
    fetchOperations();
    fetchStatistics();
    // Fetch operation types
    axios.get('/api/operation-types').then(res => setOperationTypes(res.data)).catch(console.error);
    // Fetch qualified personnel by position
    axios.get('/api/operations/qualified-personnel').then(res => setQualifiedPersonnelMap(res.data)).catch(console.error);
    // Fetch teams
    axios.get('/api/organization/teams').then(res => setTeams(res.data)).catch(console.error);
  }, []);

  // 显示新增/编辑弹窗
  const showModal = (operation?: Operation) => {
    if (operation) {
      const normalizedOperation = {
        ...operation,
        standard_time: Number(operation.standard_time),
        required_people:
          operation.required_people !== undefined && operation.required_people !== null
            ? Number(operation.required_people)
            : 1,
      };
      setEditingOperation(normalizedOperation);
      form.setFieldsValue(normalizedOperation);
    } else {
      setEditingOperation(null);
      form.resetFields();
      form.setFieldsValue({ required_people: 1, operation_type_id: null });
      fetchNextCode();
    }
    setModalVisible(true);
  };

  // 保存操作
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        standard_time: Number(values.standard_time),
        required_people:
          values.required_people !== undefined && values.required_people !== null
            ? Number(values.required_people)
            : 1,
      };

      if (editingOperation) {
        await axios.put(`/api/operations/${editingOperation.id}`, payload);
        message.success('操作更新成功');
      } else {
        await axios.post('/api/operations', payload);
        message.success('操作创建成功');
      }

      setModalVisible(false);
      fetchOperations();
      fetchStatistics();
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 删除操作
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/operations/${id}`);
      message.success('操作删除成功');
      fetchOperations();
      fetchStatistics();
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      } else {
        message.error('删除失败');
      }
    }
  };

  // 显示资质要求设置弹窗
  const showQualificationModal = (operation: Operation) => {
    setSelectedOperation({ id: operation.id, name: operation.operation_name });
    setQualificationModalVisible(true);
  };

  // 过滤操作数据
  const filteredOperations = operations.filter(operation => {
    const matchesSearch = !searchText ||
      operation.operation_name.toLowerCase().includes(searchText.toLowerCase()) ||
      operation.operation_code.toLowerCase().includes(searchText.toLowerCase());

    const matchesPeople = peopleFilter.length === 0 ||
      peopleFilter.includes(operation.required_people || 1);

    const matchesTime = operation.standard_time >= timeRange[0] &&
      operation.standard_time <= timeRange[1];

    // 按 Team 过滤：根据操作类型所属的 team_id
    const matchesTeam = activeTeamId === 'all' ||
      operationTypes.find(t => t.id === operation.operation_type_id)?.team_id === parseInt(activeTeamId);

    return matchesSearch && matchesPeople && matchesTime && matchesTeam;
  });

  // Team tabs
  const teamTabs = [
    { key: 'all', label: `全部 (${operations.length})` },
    ...teams.map(t => {
      const count = operations.filter(op =>
        operationTypes.find(ot => ot.id === op.operation_type_id)?.team_id === t.id
      ).length;
      return { key: t.id.toString(), label: `${t.unit_name} (${count})` };
    })
  ];

  // 按 Team 分组的操作类型选项
  const groupedTypeOptions = teams.map(team => ({
    label: team.unit_name,
    options: operationTypes
      .filter(t => t.team_id === team.id)
      .map(t => ({
        value: t.id,
        label: (
          <Space>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: t.color
            }} />
            {t.type_name}
          </Space>
        ),
      }))
  })).filter(group => group.options.length > 0);

  // 表格列定义
  const columns = [
    {
      title: '操作编码',
      dataIndex: 'operation_code',
      key: 'operation_code',
      width: 120,
      render: (text: string) => (
        <Text type="secondary" style={{ fontFamily: 'monospace' }}>
          {text}
        </Text>
      ),
    },
    {
      title: '操作名称',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: 200,
    },
    {
      title: '标准耗时',
      dataIndex: 'standard_time',
      key: 'standard_time',
      width: 120,
      sorter: (a: Operation, b: Operation) => a.standard_time - b.standard_time,
      render: (time: number) => (
        <Space>
          <ClockCircleOutlined />
          <Text>{time} 小时</Text>
        </Space>
      ),
    },
    {
      title: '所需人数',
      dataIndex: 'required_people',
      key: 'required_people',
      width: 100,
      sorter: (a: Operation, b: Operation) => (a.required_people || 1) - (b.required_people || 1),
      render: (people: number) => (
        <Space>
          <TeamOutlined />
          <Text>{people || 1} 人</Text>
        </Space>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'operation_type_id',
      key: 'operation_type_id',
      width: 150,
      render: (_: any, record: Operation) => (
        <Select
          size="small"
          value={record.operation_type_id || undefined}
          placeholder="选择类型"
          allowClear
          style={{ width: '100%' }}
          onChange={async (value) => {
            try {
              await axios.put(`/api/operations/${record.id}`, {
                ...record,
                operation_type_id: value || null
              });
              message.success('类型更新成功');
              fetchOperations();
            } catch {
              message.error('更新失败');
            }
          }}
          options={groupedTypeOptions}
        />
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <Text>{text || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '资质要求',
      dataIndex: 'qualification_count',
      key: 'qualification_count',
      width: 100,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>
          {count || 0} 项
        </Tag>
      ),
    },
    {
      title: '合格人数',
      key: 'qualified_personnel',
      width: 140,
      render: (_: any, record: Operation) => {
        const positions = qualifiedPersonnelMap[record.id];
        if (!positions || positions.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Space size={4}>
            {positions.map((count, idx) => (
              <Tooltip key={idx} title={`位置${idx + 1}: ${count}人合格`}>
                <Tag color={count > 0 ? 'green' : 'red'}>
                  P{idx + 1}: {count}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Operation) => (
        <Space size="small">
          <Tooltip title="资质要求">
            <Button
              type="link"
              icon={<SettingOutlined />}
              onClick={() => showQualificationModal(record)}
            >
              资质
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => showModal(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm
              title="确定要删除这个操作吗？"
              description={record.qualification_count && record.qualification_count > 0
                ? "该操作有关联的资质要求，无法删除"
                : "删除后无法恢复"}
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={record.qualification_count !== undefined && record.qualification_count > 0}
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                disabled={record.qualification_count !== undefined && record.qualification_count > 0}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      {statistics && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总操作数"
                value={statistics.summary.total_operations}
                prefix={<InfoCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均耗时"
                value={Number(statistics.summary.avg_time || 0).toFixed(1)}
                suffix="小时"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="耗时范围"
                value={`${statistics.summary.min_time || 0} - ${statistics.summary.max_time || 0}`}
                suffix="小时"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均人数"
                value={Number(statistics.summary.avg_people || 1).toFixed(1)}
                suffix="人"
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Team Tabs */}
      <Tabs
        activeKey={activeTeamId}
        onChange={setActiveTeamId}
        items={teamTabs}
        style={{ marginBottom: 16 }}
      />

      {/* 筛选控制栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="搜索操作名称或编码"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              mode="multiple"
              placeholder="选择所需人数"
              style={{ width: '100%' }}
              value={peopleFilter}
              onChange={setPeopleFilter}
              allowClear
            >
              {[1, 2, 3, 4, 5].map(num => (
                <Option key={num} value={num}>
                  {num} 人
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={8}>
            <div style={{ padding: '0 12px' }}>
              <Text>耗时范围：{timeRange[0]} - {timeRange[1]} 小时</Text>
              <Slider
                range
                min={0}
                max={statistics?.summary.max_time || 1000}
                value={timeRange}
                onChange={(value) => setTimeRange(value as [number, number])}
                style={{ marginTop: 8 }}
              />
            </div>
          </Col>
          <Col span={4}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
              新增操作
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 数据表格 */}
      <Table
        columns={columns}
        dataSource={filteredOperations}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
        }}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingOperation ? '编辑操作' : '新增操作'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ required_people: 1 }}
        >
          {!editingOperation && nextCode && (
            <div style={{
              background: '#f0f2f5',
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '16px'
            }}>
              <Space>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
                <Text>将生成编码：<Text strong>{nextCode}</Text></Text>
              </Space>
            </div>
          )}

          {editingOperation && (
            <Form.Item label="操作编码">
              <Input value={editingOperation.operation_code} disabled />
            </Form.Item>
          )}

          <Form.Item
            name="operation_name"
            label="操作名称"
            rules={[{ required: true, message: '请输入操作名称' }]}
          >
            <Input placeholder="请输入操作名称" />
          </Form.Item>

          <Form.Item
            name="standard_time"
            label="标准耗时（小时）"
            rules={[
              { required: true, message: '请输入标准耗时' },
              { type: 'number', min: 0.1, message: '耗时必须大于0' }
            ]}
          >
            <InputNumber
              min={0.1}
              step={0.5}
              style={{ width: '100%' }}
              placeholder="请输入标准耗时"
              addonAfter="小时"
            />
          </Form.Item>

          <Form.Item
            name="required_people"
            label="所需人数"
            rules={[
              { type: 'number', min: 1, message: '人数必须大于0' }
            ]}
          >
            <InputNumber
              min={1}
              max={10}
              style={{ width: '100%' }}
              placeholder="请输入所需人数"
              addonAfter="人"
            />
          </Form.Item>

          <Form.Item
            name="operation_type_id"
            label="操作类型"
          >
            <Select
              placeholder="请选择操作类型（可选）"
              allowClear
              showSearch
              optionFilterProp="label"
              options={operationTypes.map(t => ({
                value: t.id,
                label: `${t.type_name} (${t.team_code})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea
              rows={3}
              placeholder="请输入操作描述（可选）"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 资质要求设置弹窗 */}
      {selectedOperation && (
        <OperationQualificationModal
          visible={qualificationModalVisible}
          operationId={selectedOperation.id}
          operationName={selectedOperation.name}
          onClose={() => {
            setQualificationModalVisible(false);
            setSelectedOperation(null);
          }}
          onUpdate={() => {
            fetchOperations();
          }}
        />
      )}
    </div>
  );
};

export default OperationTable;
