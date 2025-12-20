/**
 * BatchOperationBasicForm - 批次操作基本信息表单
 * 
 * 包含：
 * - 时间安排 (计划开始/结束)
 * - 时间窗口 (最早开始/最晚完成)
 * - 人员分配 (按位置)
 * - 备注
 * 
 * B+ 设计 - Apple HIG 风格
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Form,
    DatePicker,
    InputNumber,
    Input,
    Button,
    Select,
    Typography,
    Tooltip,
    Space,
    Tag,
    Divider,
    message
} from 'antd';
import {
    ClockCircleOutlined,
    TeamOutlined,
    FileTextOutlined,
    PlusOutlined,
    DeleteOutlined,
    WarningOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';

const { Text } = Typography;
const { TextArea } = Input;

// 设计 tokens
const TOKENS = {
    sectionBg: '#fafafa',
    sectionBorder: '#e5e5e5',
    cardRadius: 8,
    primaryColor: '#1890ff',
};

interface AssignedPersonnel {
    assignment_id?: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    position: number;
    is_primary: boolean;
}

interface AvailableEmployee {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    department?: string;
    has_conflict: boolean;
    conflict_type?: 'TIME' | 'QUALIFICATION' | 'REST' | 'HOURS';
    conflict_message?: string;
}

interface BatchOperationBasicFormProps {
    operationPlanId: number;
    batchCode: string;
    batchName: string;
    stageName: string;
    operationName: string;
    plannedStart: Dayjs | null;
    plannedEnd: Dayjs | null;
    plannedDuration: number;
    windowStart: Dayjs | null;
    windowEnd: Dayjs | null;
    requiredPeople: number;
    notes: string;
    assignedPersonnel: AssignedPersonnel[];
    onFieldChange: (field: string, value: any) => void;
    onPersonnelChange: (personnel: { position: number; employee_id: number | null }[]) => void;
}

// Section 标题组件
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        fontSize: 13,
        fontWeight: 600,
        color: '#333',
    }}>
        <span style={{ color: TOKENS.primaryColor }}>{icon}</span>
        {title}
    </div>
);

export const BatchOperationBasicForm: React.FC<BatchOperationBasicFormProps> = ({
    operationPlanId,
    batchCode,
    batchName,
    stageName,
    operationName,
    plannedStart,
    plannedEnd,
    plannedDuration,
    windowStart,
    windowEnd,
    requiredPeople,
    notes,
    assignedPersonnel,
    onFieldChange,
    onPersonnelChange,
}) => {
    const [availableEmployees, setAvailableEmployees] = useState<AvailableEmployee[]>([]);
    const [positions, setPositions] = useState<{ position: number; employee_id: number | null }[]>([]);

    // 初始化位置
    useEffect(() => {
        const initialPositions: { position: number; employee_id: number | null }[] = [];
        for (let i = 0; i < requiredPeople; i++) {
            const assigned = assignedPersonnel.find(p => p.position === i + 1);
            initialPositions.push({
                position: i + 1,
                employee_id: assigned?.employee_id || null,
            });
        }
        setPositions(initialPositions);
    }, [requiredPeople, assignedPersonnel]);

    // 加载可用员工
    useEffect(() => {
        const loadEmployees = async () => {
            try {
                const startTime = plannedStart?.toISOString();
                const endTime = plannedEnd?.toISOString();
                const response = await axios.get(`/api/employees/available`, {
                    params: { start_time: startTime, end_time: endTime }
                });
                setAvailableEmployees(response.data);
            } catch (error) {
                console.error('Failed to load employees:', error);
            }
        };
        if (plannedStart && plannedEnd) {
            loadEmployees();
        }
    }, [plannedStart, plannedEnd]);

    // 添加位置
    const handleAddPosition = () => {
        const newPosition = positions.length + 1;
        const newPositions = [...positions, { position: newPosition, employee_id: null }];
        setPositions(newPositions);
        onPersonnelChange(newPositions);
    };

    // 删除位置
    const handleRemovePosition = (index: number) => {
        if (positions.length <= 1) return;
        const newPositions = positions.filter((_, i) => i !== index).map((p, i) => ({
            ...p,
            position: i + 1,
        }));
        setPositions(newPositions);
        onPersonnelChange(newPositions);
    };

    // 更新位置分配
    const handlePositionChange = (index: number, employeeId: number | null) => {
        const newPositions = [...positions];
        newPositions[index] = { ...newPositions[index], employee_id: employeeId };
        setPositions(newPositions);
        onPersonnelChange(newPositions);
    };

    // 获取员工冲突状态
    const getEmployeeConflict = (employeeId: number) => {
        return availableEmployees.find(e => e.employee_id === employeeId && e.has_conflict);
    };

    // 计划开始时间变化
    const handleStartTimeChange = (value: Dayjs | null) => {
        onFieldChange('planned_start_datetime', value);
        if (value && plannedDuration) {
            const newEnd = value.add(plannedDuration, 'hour');
            onFieldChange('planned_end_datetime', newEnd);
        }
    };

    return (
        <div style={{ padding: 0 }}>
            {/* 操作信息头 */}
            <div style={{
                padding: '12px 16px',
                background: TOKENS.sectionBg,
                borderBottom: `1px solid ${TOKENS.sectionBorder}`,
                marginBottom: 16,
            }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                    {batchCode} - {batchName} / {stageName}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {operationName}
                </div>
            </div>

            <div style={{ padding: '0 16px 16px' }}>
                {/* 时间安排 */}
                <SectionHeader icon={<ClockCircleOutlined />} title="时间安排" />
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            计划开始
                        </Text>
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            value={plannedStart}
                            onChange={handleStartTimeChange}
                            style={{ width: '100%' }}
                            size="small"
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            计划结束
                        </Text>
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            value={plannedEnd}
                            onChange={(v) => onFieldChange('planned_end_datetime', v)}
                            style={{ width: '100%' }}
                            size="small"
                        />
                    </div>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* 时间窗口 */}
                <SectionHeader icon={<ClockCircleOutlined />} title="时间窗口" />
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            最早开始
                        </Text>
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            value={windowStart}
                            onChange={(v) => onFieldChange('window_start_datetime', v)}
                            style={{ width: '100%' }}
                            size="small"
                            placeholder="可选"
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                            最晚完成
                        </Text>
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            value={windowEnd}
                            onChange={(v) => onFieldChange('window_end_datetime', v)}
                            style={{ width: '100%' }}
                            size="small"
                            placeholder="可选"
                        />
                    </div>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* 人员分配 */}
                <SectionHeader icon={<TeamOutlined />} title={`人员分配 (需要 ${requiredPeople} 人)`} />
                <div style={{ marginBottom: 12 }}>
                    {positions.map((pos, index) => {
                        const conflict = pos.employee_id ? getEmployeeConflict(pos.employee_id) : null;
                        return (
                            <div key={index} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 8,
                            }}>
                                <Text type="secondary" style={{ fontSize: 12, width: 50 }}>
                                    位置{pos.position}
                                </Text>
                                <Select
                                    placeholder="选择人员"
                                    value={pos.employee_id}
                                    onChange={(v) => handlePositionChange(index, v)}
                                    style={{ flex: 1 }}
                                    size="small"
                                    allowClear
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {availableEmployees.map(emp => (
                                        <Select.Option key={emp.employee_id} value={emp.employee_id}>
                                            <Space>
                                                <span>{emp.employee_name}</span>
                                                <span style={{ color: '#999', fontSize: 11 }}>{emp.employee_code}</span>
                                                {emp.has_conflict && (
                                                    <Tag color="orange" style={{ fontSize: 10 }}>冲突</Tag>
                                                )}
                                            </Space>
                                        </Select.Option>
                                    ))}
                                </Select>
                                {conflict && (
                                    <Tooltip title={conflict.conflict_message}>
                                        <WarningOutlined style={{ color: '#faad14' }} />
                                    </Tooltip>
                                )}
                                {pos.employee_id && !conflict && (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                )}
                                {positions.length > 1 && (
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleRemovePosition(index)}
                                        danger
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
                <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleAddPosition}
                    block
                >
                    添加位置
                </Button>

                <Divider style={{ margin: '16px 0' }} />

                {/* 备注 */}
                <SectionHeader icon={<FileTextOutlined />} title="备注" />
                <TextArea
                    value={notes}
                    onChange={(e) => onFieldChange('notes', e.target.value)}
                    rows={3}
                    placeholder="可选，补充说明"
                    style={{ fontSize: 13 }}
                />
            </div>
        </div>
    );
};

export default BatchOperationBasicForm;
