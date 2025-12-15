import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Tag, Popconfirm, Space, Tabs, Row, Col, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, BgColorsOutlined } from '@ant-design/icons';
import axios from 'axios';
import './OperationTypesPage.css';

interface OperationType {
    id: number;
    type_code: string;
    type_name: string;
    team_id: number;
    team_code: string;
    team_name: string;
    color: string;
    category: 'MONITOR' | 'PROCESS' | 'PREP';
    display_order: number;
    is_active: boolean;
}

interface Team {
    id: number;
    unit_code: string;
    unit_name: string;
}

const PRESET_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
    '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911',
    '#8c8c8c', '#595959', '#36cfc9', '#9254de', '#73d13d'
];

const CATEGORY_OPTIONS = [
    { value: 'PROCESS', label: '工艺类', color: '#1890ff' },
    { value: 'PREP', label: '准备/收尾类', color: '#52c41a' },
    { value: 'MONITOR', label: '监控类', color: '#faad14' },
];

const OperationTypesPage: React.FC = () => {
    const [types, setTypes] = useState<OperationType[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState<OperationType | null>(null);
    const [activeTeamId, setActiveTeamId] = useState<string>('all');
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [typesRes, teamsRes] = await Promise.all([
                axios.get('/api/operation-types'),
                axios.get('/api/organization/teams')
            ]);
            setTypes(typesRes.data);
            setTeams(teamsRes.data);
        } catch (err) {
            message.error('加载数据失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (values: any) => {
        setSubmitting(true);
        try {
            if (editingType) {
                await axios.put(`/api/operation-types/${editingType.id}`, values);
                message.success('更新成功');
            } else {
                await axios.post('/api/operation-types', values);
                message.success('创建成功');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingType(null);
            fetchData();
        } catch (err: any) {
            if (err.response?.status === 409) {
                message.error('类型代码已存在');
            } else {
                message.error('操作失败');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await axios.delete(`/api/operation-types/${id}`);
            message.success('已删除/停用');
            fetchData();
        } catch {
            message.error('删除失败');
        }
    };

    const handleEdit = (record: OperationType) => {
        setEditingType(record);
        form.setFieldsValue(record);
        setModalVisible(true);
    };

    const handleAdd = () => {
        setEditingType(null);
        form.resetFields();
        // 如果当前选中了特定 team，自动填充
        if (activeTeamId !== 'all') {
            form.setFieldValue('team_id', parseInt(activeTeamId));
        }
        setModalVisible(true);
    };

    const filteredTypes = useMemo(() => {
        return activeTeamId === 'all'
            ? types
            : types.filter(t => t.team_id === parseInt(activeTeamId));
    }, [types, activeTeamId]);

    const columns = [
        {
            title: '类型代码',
            dataIndex: 'type_code',
            width: 140,
            render: (v: string) => <code className="type-code">{v}</code>,
            sorter: (a: OperationType, b: OperationType) => a.type_code.localeCompare(b.type_code)
        },
        {
            title: '类型名称',
            dataIndex: 'type_name',
            width: 150,
            sorter: (a: OperationType, b: OperationType) => a.type_name.localeCompare(b.type_name)
        },
        {
            title: '所属Team',
            dataIndex: 'team_name',
            width: 100,
            render: (v: string, record: OperationType) => (
                <Tag>{record.team_code} - {v}</Tag>
            )
        },
        {
            title: '颜色',
            dataIndex: 'color',
            width: 100,
            render: (c: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 20, height: 20, borderRadius: 4,
                        backgroundColor: c, border: '1px solid #d9d9d9'
                    }} />
                    <span style={{ fontSize: 12, color: '#666' }}>{c}</span>
                </div>
            )
        },
        {
            title: '分类',
            dataIndex: 'category',
            width: 100,
            render: (cat: string) => {
                const opt = CATEGORY_OPTIONS.find(o => o.value === cat);
                return <Tag color={opt?.color || '#1890ff'}>{opt?.label || cat}</Tag>;
            },
            filters: CATEGORY_OPTIONS.map(o => ({ text: o.label, value: o.value })),
            onFilter: (value: any, record: OperationType) => record.category === value,
        },
        {
            title: '排序',
            dataIndex: 'display_order',
            width: 80,
            sorter: (a: OperationType, b: OperationType) => a.display_order - b.display_order
        },
        {
            title: '操作',
            width: 120,
            render: (_: any, record: OperationType) => (
                <Space>
                    <Tooltip title="编辑">
                        <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="确定要删除/停用此操作类型？"
                        description="如果该类型已被操作使用，将变为停用状态"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Tooltip title="删除">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const tabItems = useMemo(() => [
        { key: 'all', label: `全部 (${types.length})` },
        ...teams.map(t => {
            const count = types.filter(type => type.team_id === t.id).length;
            return { key: t.id.toString(), label: `${t.unit_name} (${count})` };
        })
    ], [teams, types]);

    return (
        <div className="operation-types-page">
            <Card
                title="操作类型管理"
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            新增类型
                        </Button>
                    </Space>
                }
            >
                <Tabs
                    activeKey={activeTeamId}
                    onChange={setActiveTeamId}
                    items={tabItems}
                    style={{ marginBottom: 16 }}
                />

                <Table
                    columns={columns}
                    dataSource={filteredTypes}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                />
            </Card>

            <Modal
                title={editingType ? '编辑操作类型' : '新增操作类型'}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); setEditingType(null); }}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                width={500}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    initialValues={{ color: '#1890ff', display_order: 0, category: 'PROCESS' }}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="type_code"
                                label="类型代码"
                                rules={[
                                    { required: true, message: '请输入类型代码' },
                                    { pattern: /^[A-Za-z_]+$/, message: '仅允许英文字母和下划线' }
                                ]}
                                tooltip="建议使用大写英文，如 CELL_CULTURE"
                                normalize={(value) => value?.toUpperCase()}
                            >
                                <Input
                                    placeholder="如 CELL_CULTURE"
                                    disabled={!!editingType}
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="type_name"
                                label="类型名称"
                                rules={[{ required: true, message: '请输入类型名称' }]}
                            >
                                <Input placeholder="如 细胞培养" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="team_id"
                        label="所属Team"
                        rules={[{ required: true, message: '请选择所属Team' }]}
                    >
                        <Select
                            placeholder="请选择Team"
                            options={teams.map(t => ({ value: t.id, label: `${t.unit_code} - ${t.unit_name}` }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="category"
                        label="分类"
                        rules={[{ required: true, message: '请选择分类' }]}
                        tooltip="分类影响求解器排班优先级"
                    >
                        <Select
                            placeholder="请选择分类"
                            options={CATEGORY_OPTIONS.map(o => ({
                                value: o.value,
                                label: (
                                    <Space>
                                        <Tag color={o.color} style={{ margin: 0 }}>{o.label}</Tag>
                                    </Space>
                                ),
                            }))}
                        />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="color" label="显示颜色">
                                <Select
                                    placeholder="选择颜色"
                                    optionLabelProp="label"
                                >
                                    {PRESET_COLORS.map(c => (
                                        <Select.Option key={c} value={c} label={c}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{
                                                    width: 16, height: 16, borderRadius: 3,
                                                    backgroundColor: c, border: '1px solid #d9d9d9'
                                                }} />
                                                <span>{c}</span>
                                            </div>
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="display_order"
                                label="排序值"
                                tooltip="数值越小越靠前"
                            >
                                <Input type="number" min={0} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default OperationTypesPage;
