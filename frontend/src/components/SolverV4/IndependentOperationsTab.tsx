/**
 * IndependentOperationsTab - 独立操作管理 Tab
 *
 * 用于管理不属于任何批次的独立操作（如监控班次、巡检等非工艺操作）
 * 包含列表展示 + 批量创建 Modal
 *
 * 恢复自 BatchGanttAdapter/AddIndependentOperationModal.tsx
 * 移至 SolverV4 模块，作为 MonthlyBatchSelector 的一个 Tab
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Modal,
    Form,
    DatePicker,
    TimePicker,
    InputNumber,
    Button,
    Space,
    Typography,
    Divider,
    Select,
    Alert,
    Card,
    Table,
    Tag,
    Popconfirm,
    Empty,
    Spin,
    message
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    CalendarOutlined,
    SwapOutlined,
    ReloadOutlined,
    GroupOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ─── Types ───────────────────────────────────────────────────

/** 时段配置 */
interface TimeSlot {
    key: string;
    operation_id: number | null;
    start: string;          // 开始时间 HH:mm
    people: number;         // 需求人数
    duration: number;       // 时长（小时）
    dayOffset: number;      // 偏移天数
}

/** 可用操作 */
interface AvailableOperation {
    id: number;
    operation_code: string;
    operation_name: string;
    required_people: number;
    standard_time: string;
}

/** 独立操作记录 */
interface IndependentOperation {
    operation_plan_id: number;
    operation_id: number;
    operation_name: string;
    operation_code: string;
    planned_start_datetime: string;
    planned_end_datetime: string;
    planned_duration: number;
    required_people: number;
    generation_group_id: string;
    notes: string | null;
    created_at: string;
}

// ─── Add Modal (restored from legacy BatchGanttAdapter) ─────

interface AddModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const AddIndependentOperationModal: React.FC<AddModalProps> = ({
    visible,
    onClose,
    onSuccess
}) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [operations, setOperations] = useState<AvailableOperation[]>([]);
    const [loadingOps, setLoadingOps] = useState(false);

    const [slots, setSlots] = useState<TimeSlot[]>([
        { key: '1', operation_id: null, start: '08:00', people: 1, duration: 12, dayOffset: 0 },
        { key: '2', operation_id: null, start: '20:00', people: 1, duration: 12, dayOffset: 0 }
    ]);

    const [sharePairs, setSharePairs] = useState<[number, number][]>([[0, 1]]);

    useEffect(() => {
        if (visible) {
            loadOperations();
        }
    }, [visible]);

    const loadOperations = async () => {
        setLoadingOps(true);
        try {
            const response = await axios.get<AvailableOperation[]>('/api/operations');
            setOperations(response.data);
        } catch (error) {
            console.error('Failed to load operations:', error);
            message.error('加载操作列表失败');
        } finally {
            setLoadingOps(false);
        }
    };

    const addSlot = () => {
        const newKey = String(Date.now());
        setSlots([...slots, {
            key: newKey,
            operation_id: null,
            start: '08:00',
            people: 1,
            duration: 12,
            dayOffset: 0
        }]);
    };

    const removeSlot = (key: string) => {
        if (slots.length <= 1) return;
        const idx = slots.findIndex(s => s.key === key);
        setSlots(slots.filter(s => s.key !== key));
        setSharePairs(sharePairs.filter(([a, b]) => a !== idx && b !== idx));
    };

    const handleOperationChange = (key: string, operationId: number) => {
        const op = operations.find(o => o.id === operationId);
        if (op) {
            setSlots(slots.map(s => s.key === key ? {
                ...s,
                operation_id: operationId,
                people: op.required_people || 1,
                duration: parseFloat(op.standard_time) || 12
            } : s));
        }
    };

    const updateStartTime = (key: string, time: string) => {
        setSlots(slots.map(s => s.key === key ? { ...s, start: time } : s));
    };

    const calculateEndTime = (start: string, durationHours: number): { time: string, nextDay: boolean } => {
        const [h, m] = start.split(':').map(Number);
        const startMinutes = h * 60 + m;
        const endMinutes = startMinutes + durationHours * 60;
        const nextDay = endMinutes >= 24 * 60;
        const adjustedMinutes = endMinutes % (24 * 60);
        const endH = Math.floor(adjustedMinutes / 60);
        const endM = adjustedMinutes % 60;
        return {
            time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
            nextDay
        };
    };

    const toggleSharePair = (fromIdx: number, toIdx: number) => {
        const exists = sharePairs.some(([a, b]) => a === fromIdx && b === toIdx);
        if (exists) {
            setSharePairs(sharePairs.filter(([a, b]) => !(a === fromIdx && b === toIdx)));
        } else {
            setSharePairs([...sharePairs, [fromIdx, toIdx]]);
        }
    };

    const calculatePreview = () => {
        const values = form.getFieldsValue();
        if (!values.dateRange?.[0] || !values.dateRange?.[1]) return { operations: 0, constraints: 0 };
        const startDate = values.dateRange[0];
        const endDate = values.dateRange[1];
        const stepDays = values.stepDays || 1;
        const totalDays = Math.floor(endDate.diff(startDate, 'day') / stepDays) + 1;
        const operationCount = totalDays * slots.filter(s => s.operation_id).length;
        const constraintCount = totalDays * sharePairs.length;
        return { operations: operationCount, constraints: constraintCount };
    };

    const preview = calculatePreview();

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            const invalidSlots = slots.filter(s => !s.operation_id);
            if (invalidSlots.length > 0) {
                message.error('请为所有时段选择操作');
                return;
            }
            setSaving(true);

            const slotsData = slots.map(s => {
                const endInfo = calculateEndTime(s.start, s.duration);
                return {
                    operation_id: s.operation_id,
                    start: s.start,
                    end: endInfo.time,
                    end_next_day: endInfo.nextDay,
                    people: s.people,
                    day_offset: s.dayOffset
                };
            });

            const payload = {
                date_range: {
                    start: values.dateRange[0].format('YYYY-MM-DD'),
                    end: values.dateRange[1].format('YYYY-MM-DD')
                },
                step_days: values.stepDays || 1,
                slots: slotsData,
                share_pairs: sharePairs
            };

            await axios.post('/api/independent-operations/batch', payload);
            message.success(`成功创建 ${preview.operations} 个操作`);
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Failed to create operations:', error);
            const msg = error?.response?.data?.error || '创建失败';
            message.error(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title="批量添加独立操作"
            open={visible}
            onCancel={onClose}
            width={650}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="save" type="primary" loading={saving} onClick={handleSave}>
                    确认添加
                </Button>
            ]}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    stepDays: 1
                }}
            >
                {/* 日期范围 */}
                <Form.Item
                    name="dateRange"
                    label={<><CalendarOutlined /> 日期范围</>}
                    rules={[{ required: true, message: '请选择日期范围' }]}
                >
                    <RangePicker style={{ width: '100%' }} />
                </Form.Item>

                {/* 重复间隔 */}
                <Form.Item
                    name="stepDays"
                    label="重复间隔"
                    tooltip="每隔几天创建一组操作，1表示每天"
                >
                    <InputNumber
                        min={1}
                        max={30}
                        addonAfter="天"
                        style={{ width: 150 }}
                    />
                </Form.Item>

                <Divider orientation="left">时段配置</Divider>

                {/* 时段列表 */}
                {slots.map((slot, idx) => {
                    const endInfo = calculateEndTime(slot.start, slot.duration);

                    return (
                        <Card
                            key={slot.key}
                            size="small"
                            style={{ marginBottom: 12 }}
                            title={`时段 ${idx + 1}`}
                            extra={
                                slots.length > 1 && (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => removeSlot(slot.key)}
                                    />
                                )
                            }
                        >
                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                {/* 操作选择 */}
                                <Select
                                    placeholder="选择操作"
                                    style={{ width: '100%' }}
                                    value={slot.operation_id}
                                    onChange={(v) => handleOperationChange(slot.key, v)}
                                    loading={loadingOps}
                                    showSearch
                                    filterOption={(input, option) =>
                                        (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={operations.map(op => ({
                                        value: op.id,
                                        label: `${op.operation_code} - ${op.operation_name}（${op.standard_time}小时，需${op.required_people}人）`
                                    }))}
                                />

                                {/* 时间显示 */}
                                {slot.operation_id && (
                                    <Space wrap>
                                        <Text>开始时间：</Text>
                                        <TimePicker
                                            format="HH:mm"
                                            value={dayjs(slot.start, 'HH:mm')}
                                            onChange={(v) => updateStartTime(slot.key, v?.format('HH:mm') || '08:00')}
                                            style={{ width: 100 }}
                                        />
                                        <Text type="secondary">
                                            → 结束 {endInfo.time} {endInfo.nextDay && <Text type="warning">(次日)</Text>}
                                        </Text>
                                        <Text type="secondary" style={{ marginLeft: 8 }}>
                                            | 需 {slot.people} 人
                                        </Text>
                                        <Text style={{ marginLeft: 12 }}>偏移</Text>
                                        <InputNumber
                                            min={0}
                                            max={7}
                                            value={slot.dayOffset}
                                            onChange={(v) => setSlots(slots.map(s => s.key === slot.key ? { ...s, dayOffset: v || 0 } : s))}
                                            style={{ width: 60 }}
                                        />
                                        <Text type="secondary">天</Text>
                                    </Space>
                                )}

                                {/* 人员共享按钮 */}
                                {idx > 0 && (
                                    <Button
                                        type={sharePairs.some(([a, b]) => a === idx - 1 && b === idx) ? 'primary' : 'dashed'}
                                        icon={<SwapOutlined />}
                                        size="small"
                                        onClick={() => toggleSharePair(idx - 1, idx)}
                                    >
                                        与上一时段共享人员
                                    </Button>
                                )}
                            </Space>
                        </Card>
                    );
                })}

                <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={addSlot}
                    style={{ width: '100%', marginBottom: 16 }}
                >
                    添加时段
                </Button>

                {/* 预览 */}
                {preview.operations > 0 && (
                    <Alert
                        type="info"
                        message={
                            <Space>
                                <Text>预览：将创建</Text>
                                <Text strong>{preview.operations}</Text>
                                <Text>个操作，</Text>
                                <Text strong>{preview.constraints}</Text>
                                <Text>条人员共享约束</Text>
                            </Space>
                        }
                    />
                )}
            </Form>
        </Modal>
    );
};

// ─── Main Tab Component ─────────────────────────────────────

const IndependentOperationsTab: React.FC = () => {
    const [data, setData] = useState<IndependentOperation[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [filterRange, setFilterRange] = useState<[Dayjs, Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month')
    ]);
    const [deletingGroup, setDeletingGroup] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterRange[0]) params.set('start_date', filterRange[0].format('YYYY-MM-DD'));
            if (filterRange[1]) params.set('end_date', filterRange[1].format('YYYY-MM-DD'));

            const response = await axios.get<IndependentOperation[]>(
                `/api/independent-operations?${params.toString()}`
            );
            setData(response.data);
        } catch (error) {
            console.error('Failed to fetch independent operations:', error);
            message.error('加载独立操作失败');
        } finally {
            setLoading(false);
        }
    }, [filterRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDeleteGroup = async (groupId: string) => {
        setDeletingGroup(groupId);
        try {
            await axios.delete(`/api/independent-operations/group/${groupId}`);
            message.success('删除成功');
            fetchData();
        } catch (error) {
            console.error('Failed to delete group:', error);
            message.error('删除失败');
        } finally {
            setDeletingGroup(null);
        }
    };

    const handleDeleteSingle = async (id: number) => {
        try {
            await axios.delete(`/api/independent-operations/${id}`);
            message.success('删除成功');
            fetchData();
        } catch (error) {
            console.error('Failed to delete operation:', error);
            message.error('删除失败');
        }
    };

    // Group data by generation_group_id
    const groupedData = useMemo(() => {
        const groups: Record<string, IndependentOperation[]> = {};
        data.forEach(op => {
            const gid = op.generation_group_id || 'ungrouped';
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(op);
        });
        return groups;
    }, [data]);

    const groupEntries = useMemo(() => Object.entries(groupedData), [groupedData]);

    const columns: ColumnsType<IndependentOperation> = [
        {
            title: '操作',
            key: 'operation',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.operation_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.operation_code}</Text>
                </Space>
            ),
        },
        {
            title: '计划时间',
            key: 'time',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text>{dayjs(record.planned_start_datetime).format('MM-DD HH:mm')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        → {dayjs(record.planned_end_datetime).format('MM-DD HH:mm')}
                    </Text>
                </Space>
            ),
            sorter: (a, b) => dayjs(a.planned_start_datetime).unix() - dayjs(b.planned_start_datetime).unix(),
            defaultSortOrder: 'ascend',
        },
        {
            title: '时长',
            dataIndex: 'planned_duration',
            key: 'duration',
            width: 80,
            render: (v: number) => `${v}h`,
        },
        {
            title: '人数',
            dataIndex: 'required_people',
            key: 'people',
            width: 60,
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_, record) => (
                <Popconfirm
                    title="确认删除此操作？"
                    onConfirm={() => handleDeleteSingle(record.operation_plan_id)}
                    okText="删除"
                    cancelText="取消"
                >
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Space>
                    <RangePicker
                        value={filterRange}
                        onChange={(dates) => {
                            if (dates && dates[0] && dates[1]) {
                                setFilterRange([dates[0], dates[1]]);
                            }
                        }}
                        style={{ width: 280 }}
                    />
                    <Button icon={<ReloadOutlined />} onClick={fetchData}>
                        刷新
                    </Button>
                </Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                    批量添加独立操作
                </Button>
            </div>

            {/* Summary */}
            <div style={{ marginBottom: 16 }}>
                <Space>
                    <Tag color="blue">共 {data.length} 个操作</Tag>
                    <Tag color="geekblue">
                        <GroupOutlined style={{ marginRight: 4 }} />
                        {groupEntries.length} 个批次组
                    </Tag>
                </Space>
            </div>

            {/* Content */}
            <Spin spinning={loading}>
                {groupEntries.length === 0 ? (
                    <Empty
                        description="暂无独立操作"
                        style={{ padding: 48 }}
                    >
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                            添加第一批独立操作
                        </Button>
                    </Empty>
                ) : (
                    groupEntries.map(([groupId, ops]) => {
                        const dateRange = ops.length > 0
                            ? `${dayjs(ops[0].planned_start_datetime).format('YYYY-MM-DD')} ~ ${dayjs(ops[ops.length - 1].planned_start_datetime).format('YYYY-MM-DD')}`
                            : '';

                        return (
                            <Card
                                key={groupId}
                                size="small"
                                style={{ marginBottom: 12, borderRadius: 8 }}
                                title={
                                    <Space>
                                        <GroupOutlined />
                                        <Text strong>批次组</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {groupId === 'ungrouped' ? '未分组' : groupId.substring(0, 8) + '...'}
                                        </Text>
                                        <Tag>{ops.length} 个操作</Tag>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{dateRange}</Text>
                                    </Space>
                                }
                                extra={
                                    groupId !== 'ungrouped' && (
                                        <Popconfirm
                                            title={`确认删除此批次组的全部 ${ops.length} 个操作？`}
                                            onConfirm={() => handleDeleteGroup(groupId)}
                                            okText="全部删除"
                                            cancelText="取消"
                                            okButtonProps={{ danger: true }}
                                        >
                                            <Button
                                                type="text"
                                                danger
                                                size="small"
                                                loading={deletingGroup === groupId}
                                                icon={<DeleteOutlined />}
                                            >
                                                删除整组
                                            </Button>
                                        </Popconfirm>
                                    )
                                }
                            >
                                <Table
                                    columns={columns}
                                    dataSource={ops}
                                    rowKey="operation_plan_id"
                                    size="small"
                                    pagination={false}
                                />
                            </Card>
                        );
                    })
                )}
            </Spin>

            {/* Add Modal */}
            <AddIndependentOperationModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                onSuccess={fetchData}
            />
        </div>
    );
};

export default IndependentOperationsTab;
