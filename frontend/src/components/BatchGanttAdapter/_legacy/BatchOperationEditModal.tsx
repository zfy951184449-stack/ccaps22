/**
 * BatchOperationEditModal - 批次操作编辑弹窗
 * 
 * 用于编辑批次甘特图中的操作，包括：
 * - 时间安排（绝对日期时间）
 * - 时间窗口
 * - 人员分配（按位置）
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    Form,
    DatePicker,
    InputNumber,
    Input,
    Button,
    Space,
    Typography,
    Divider,
    Select,
    Tag,
    Tooltip,
    Spin,
    Alert,
    message
} from 'antd';
import {
    ClockCircleOutlined,
    TeamOutlined,
    FileTextOutlined,
    PlusOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    CloseCircleOutlined,
    UserOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import { BatchShareGroupSection } from '../BatchShareGroupSection';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 操作详情类型
export interface BatchOperationDetail {
    operation_plan_id: number;
    batch_id: number;
    batch_code: string;
    batch_name: string;
    stage_name: string;
    operation_name: string;
    planned_start_datetime: string;
    planned_end_datetime: string;
    planned_duration: number;
    window_start_datetime?: string | null;
    window_end_datetime?: string | null;
    required_people: number;
    notes?: string;
    is_locked?: boolean;
    assigned_personnel?: AssignedPersonnel[];
}

// 已分配人员
interface AssignedPersonnel {
    assignment_id?: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    position: number;
    is_primary: boolean;
}

// 可用员工（带冲突状态）
interface AvailableEmployee {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    department?: string;
    has_conflict: boolean;
    conflict_type?: 'TIME' | 'QUALIFICATION' | 'REST' | 'HOURS';
    conflict_message?: string;
}

interface BatchOperationEditModalProps {
    visible: boolean;
    operation: BatchOperationDetail | null;
    onClose: () => void;
    onSave: (updates: Partial<BatchOperationDetail> & { personnel?: { position: number; employee_id: number }[] }) => Promise<void>;
}

export const BatchOperationEditModal: React.FC<BatchOperationEditModalProps> = ({
    visible,
    operation,
    onClose,
    onSave
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // 人员分配状态
    const [positions, setPositions] = useState<{ position: number; employee_id: number | null; employee_name?: string }[]>([]);
    const [availableEmployees, setAvailableEmployees] = useState<AvailableEmployee[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    // 初始化表单和人员位置
    useEffect(() => {
        if (visible && operation) {
            form.setFieldsValue({
                planned_start: dayjs(operation.planned_start_datetime),
                planned_end: dayjs(operation.planned_end_datetime),
                window_start: operation.window_start_datetime ? dayjs(operation.window_start_datetime) : null,
                window_end: operation.window_end_datetime ? dayjs(operation.window_end_datetime) : null,
                required_people: operation.required_people,
                notes: operation.notes || ''
            });

            // 初始化人员位置
            const initialPositions: { position: number; employee_id: number | null; employee_name?: string }[] = [];
            for (let i = 1; i <= operation.required_people; i++) {
                const assigned = operation.assigned_personnel?.find(p => p.position === i);
                initialPositions.push({
                    position: i,
                    employee_id: assigned?.employee_id || null,
                    employee_name: assigned?.employee_name
                });
            }
            setPositions(initialPositions);

            // 加载可用员工
            loadAvailableEmployees(operation.operation_plan_id);
        }
    }, [visible, operation, form]);

    // 加载可用员工列表
    const loadAvailableEmployees = useCallback(async (operationPlanId: number) => {
        setLoadingEmployees(true);
        try {
            const response = await axios.get<AvailableEmployee[]>(
                `/api/calendar/operations/${operationPlanId}/available-employees`
            );
            setAvailableEmployees(response.data);
        } catch (error) {
            console.error('Failed to load available employees:', error);
            // 如果API不存在，使用空列表
            setAvailableEmployees([]);
        } finally {
            setLoadingEmployees(false);
        }
    }, []);

    // 添加位置
    const handleAddPosition = () => {
        const newPosition = positions.length + 1;
        setPositions([...positions, { position: newPosition, employee_id: null }]);
        form.setFieldValue('required_people', newPosition);
    };

    // 删除位置
    const handleRemovePosition = (positionIndex: number) => {
        if (positions.length <= 1) return;
        const newPositions = positions.filter((_, idx) => idx !== positionIndex)
            .map((p, idx) => ({ ...p, position: idx + 1 }));
        setPositions(newPositions);
        form.setFieldValue('required_people', newPositions.length);
    };

    // 更新位置分配
    const handlePositionChange = (positionIndex: number, employeeId: number | null) => {
        const employee = availableEmployees.find(e => e.employee_id === employeeId);
        const newPositions = [...positions];
        newPositions[positionIndex] = {
            ...newPositions[positionIndex],
            employee_id: employeeId,
            employee_name: employee?.employee_name
        };
        setPositions(newPositions);
    };

    // 获取员工冲突状态
    const getEmployeeConflict = (employeeId: number): AvailableEmployee | undefined => {
        return availableEmployees.find(e => e.employee_id === employeeId && e.has_conflict);
    };

    // 保存
    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);

            const updates: Partial<BatchOperationDetail> & { personnel?: { position: number; employee_id: number }[] } = {
                planned_start_datetime: values.planned_start.format('YYYY-MM-DD HH:mm:ss'),
                planned_end_datetime: values.planned_end.format('YYYY-MM-DD HH:mm:ss'),
                window_start_datetime: values.window_start?.format('YYYY-MM-DD HH:mm:ss') || null,
                window_end_datetime: values.window_end?.format('YYYY-MM-DD HH:mm:ss') || null,
                required_people: values.required_people,
                notes: values.notes,
                personnel: positions
                    .filter(p => p.employee_id !== null)
                    .map(p => ({ position: p.position, employee_id: p.employee_id! }))
            };

            await onSave(updates);
            message.success('保存成功');
            onClose();
        } catch (error: any) {
            console.error('Save failed:', error);
            const errorMsg = error?.response?.data?.error || error?.message || '保存失败';
            message.error(errorMsg);
        } finally {
            setSaving(false);
        }
    };

    // 计划开始时间变化时自动更新结束时间
    const handleStartTimeChange = (value: Dayjs | null) => {
        if (value && operation) {
            const endTime = value.add(operation.planned_duration, 'hour');
            form.setFieldValue('planned_end', endTime);
        }
    };

    if (!operation) return null;

    return (
        <Modal
            title={`编辑操作：${operation.operation_name}`}
            open={visible}
            onCancel={onClose}
            width={600}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="save" type="primary" loading={saving} onClick={handleSave}>
                    保存
                </Button>
            ]}
        >
            <Spin spinning={loading}>
                {/* 基本信息 */}
                <div style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 6,
                    marginBottom: 16
                }}>
                    <Space direction="vertical" size={4}>
                        <Text><strong>批次：</strong>{operation.batch_code} - {operation.batch_name}</Text>
                        <Text><strong>阶段：</strong>{operation.stage_name}</Text>
                        <Text><strong>持续时长：</strong>{operation.planned_duration} 小时</Text>
                    </Space>
                </div>

                <Form form={form} layout="vertical">
                    {/* 时间安排 */}
                    <Divider orientation="left">
                        <ClockCircleOutlined /> 时间安排
                    </Divider>

                    <Space style={{ width: '100%' }} size={16}>
                        <Form.Item
                            name="planned_start"
                            label="计划开始"
                            rules={[{ required: true, message: '请选择开始时间' }]}
                            style={{ flex: 1 }}
                        >
                            <DatePicker
                                showTime={{ format: 'HH:mm' }}
                                format="YYYY-MM-DD HH:mm"
                                style={{ width: '100%' }}
                                onChange={handleStartTimeChange}
                            />
                        </Form.Item>

                        <Form.Item
                            name="planned_end"
                            label="计划结束（自动计算）"
                            style={{ flex: 1 }}
                        >
                            <DatePicker
                                showTime={{ format: 'HH:mm' }}
                                format="YYYY-MM-DD HH:mm"
                                style={{ width: '100%' }}
                                disabled
                            />
                        </Form.Item>
                    </Space>

                    {/* 时间窗口 */}
                    <Divider orientation="left">
                        <ClockCircleOutlined /> 时间窗口
                    </Divider>

                    <Space style={{ width: '100%' }} size={16}>
                        <Form.Item
                            name="window_start"
                            label="最早开始"
                            style={{ flex: 1 }}
                        >
                            <DatePicker
                                showTime={{ format: 'HH:mm' }}
                                format="YYYY-MM-DD HH:mm"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>

                        <Form.Item
                            name="window_end"
                            label="最晚完成"
                            style={{ flex: 1 }}
                        >
                            <DatePicker
                                showTime={{ format: 'HH:mm' }}
                                format="YYYY-MM-DD HH:mm"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Space>

                    {/* 人员分配 */}
                    <Divider orientation="left">
                        <TeamOutlined /> 人员分配
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            (需要 {positions.length} 人)
                        </Text>
                    </Divider>

                    <div style={{ marginBottom: 16 }}>
                        {positions.map((pos, idx) => (
                            <div
                                key={pos.position}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginBottom: 8,
                                    gap: 8
                                }}
                            >
                                <Text style={{ width: 60 }}>位置 {pos.position}:</Text>
                                <Select
                                    style={{ flex: 1 }}
                                    placeholder="选择人员"
                                    value={pos.employee_id}
                                    onChange={(value) => handlePositionChange(idx, value)}
                                    loading={loadingEmployees}
                                    allowClear
                                    showSearch
                                    filterOption={(input, option) =>
                                        (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    options={availableEmployees.map(emp => ({
                                        value: emp.employee_id,
                                        label: `${emp.employee_code} - ${emp.employee_name}`,
                                        disabled: emp.has_conflict && emp.conflict_type === 'QUALIFICATION'
                                    }))}
                                />
                                {/* 冲突状态 */}
                                {pos.employee_id && (() => {
                                    const conflict = getEmployeeConflict(pos.employee_id);
                                    if (!conflict) {
                                        return (
                                            <Tooltip title="无冲突">
                                                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                                            </Tooltip>
                                        );
                                    }
                                    return (
                                        <Tooltip title={conflict.conflict_message}>
                                            {conflict.conflict_type === 'QUALIFICATION' ? (
                                                <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                                            ) : (
                                                <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />
                                            )}
                                        </Tooltip>
                                    );
                                })()}
                                {/* 删除按钮 */}
                                {positions.length > 1 && (
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleRemovePosition(idx)}
                                        danger
                                    />
                                )}
                            </div>
                        ))}

                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={handleAddPosition}
                            style={{ width: '100%', marginTop: 8 }}
                        >
                            添加位置
                        </Button>
                    </div>

                    <Form.Item name="required_people" hidden>
                        <InputNumber />
                    </Form.Item>

                    {/* 共享组 */}
                    <Divider orientation="left">
                        <TeamOutlined /> 共享组
                    </Divider>

                    <BatchShareGroupSection
                        operationPlanId={operation.operation_plan_id}
                        batchId={operation.batch_id}
                    />

                    {/* 备注 */}
                    <Divider orientation="left">
                        <FileTextOutlined /> 备注
                    </Divider>

                    <Form.Item name="notes">
                        <TextArea rows={3} placeholder="可选，补充说明" />
                    </Form.Item>
                </Form>
            </Spin>
        </Modal>
    );
};

export default BatchOperationEditModal;
