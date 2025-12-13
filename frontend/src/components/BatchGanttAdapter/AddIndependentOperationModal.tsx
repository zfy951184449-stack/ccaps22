/**
 * AddIndependentOperationModal - 批量添加独立操作弹窗
 * 
 * 用于批量创建不属于批次的独立操作（如监控班次）
 * 支持多时段配置、日期范围、人员共享约束自动生成
 */

import React, { useState, useEffect } from 'react';
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
    message
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    CalendarOutlined,
    SwapOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// 时段配置
interface TimeSlot {
    key: string;
    operation_id: number | null;
    start: string;          // 开始时间 HH:mm
    people: number;         // 需求人数（从操作定义自动获取）
    duration: number;       // 时长（小时，从操作定义自动获取）
    dayOffset: number;      // 偏移天数（相对基准日）
}

// 可用操作
interface AvailableOperation {
    id: number;
    operation_code: string;
    operation_name: string;
    required_people: number;
    standard_time: string;  // 标准时长（小时）
}

interface AddIndependentOperationModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddIndependentOperationModal: React.FC<AddIndependentOperationModalProps> = ({
    visible,
    onClose,
    onSuccess
}) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);
    const [operations, setOperations] = useState<AvailableOperation[]>([]);
    const [loadingOps, setLoadingOps] = useState(false);

    // 时段列表
    const [slots, setSlots] = useState<TimeSlot[]>([
        { key: '1', operation_id: null, start: '08:00', people: 1, duration: 12, dayOffset: 0 },
        { key: '2', operation_id: null, start: '20:00', people: 1, duration: 12, dayOffset: 0 }
    ]);

    // 人员共享配对
    const [sharePairs, setSharePairs] = useState<[number, number][]>([[0, 1]]);

    // 加载可用操作列表
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

    // 添加时段
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

    // 删除时段
    const removeSlot = (key: string) => {
        if (slots.length <= 1) return;
        const idx = slots.findIndex(s => s.key === key);
        setSlots(slots.filter(s => s.key !== key));
        setSharePairs(sharePairs.filter(([a, b]) => a !== idx && b !== idx));
    };

    // 选择操作时自动填入人数和时长
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

    // 更新开始时间
    const updateStartTime = (key: string, time: string) => {
        setSlots(slots.map(s => s.key === key ? { ...s, start: time } : s));
    };

    // 计算结束时间
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

    // 切换人员共享
    const toggleSharePair = (fromIdx: number, toIdx: number) => {
        const exists = sharePairs.some(([a, b]) => a === fromIdx && b === toIdx);
        if (exists) {
            setSharePairs(sharePairs.filter(([a, b]) => !(a === fromIdx && b === toIdx)));
        } else {
            setSharePairs([...sharePairs, [fromIdx, toIdx]]);
        }
    };

    // 计算预览
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

    // 保存
    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            const invalidSlots = slots.filter(s => !s.operation_id);
            if (invalidSlots.length > 0) {
                message.error('请为所有时段选择操作');
                return;
            }

            setSaving(true);

            // 构建请求数据
            const slotsData = slots.map(s => {
                const endInfo = calculateEndTime(s.start, s.duration);
                return {
                    operation_id: s.operation_id,
                    start: s.start,
                    end: endInfo.time,
                    end_next_day: endInfo.nextDay,
                    people: s.people,
                    day_offset: 0
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
                    const selectedOp = operations.find(o => o.id === slot.operation_id);
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

export default AddIndependentOperationModal;
