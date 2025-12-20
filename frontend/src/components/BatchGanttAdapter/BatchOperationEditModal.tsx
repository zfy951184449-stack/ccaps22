/**
 * BatchOperationEditModal - B+ 版本批次操作编辑弹窗
 * 
 * 主面板 + 多功能侧边抽屉布局
 * Apple HIG 风格设计
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    Button,
    Spin,
    message
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import axios from 'axios';
import { BatchOperationBasicForm } from './BatchOperationBasicForm';
import { BatchOperationDrawer } from './BatchOperationDrawer';
import { Constraint, ConstraintValidationResult } from '../ProcessTemplateGantt/types';

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

interface AssignedPersonnel {
    assignment_id?: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    position: number;
    is_primary: boolean;
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
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // 表单状态
    const [plannedStart, setPlannedStart] = useState<Dayjs | null>(null);
    const [plannedEnd, setPlannedEnd] = useState<Dayjs | null>(null);
    const [windowStart, setWindowStart] = useState<Dayjs | null>(null);
    const [windowEnd, setWindowEnd] = useState<Dayjs | null>(null);
    const [notes, setNotes] = useState('');
    const [personnel, setPersonnel] = useState<{ position: number; employee_id: number | null }[]>([]);

    // 约束状态
    const [predecessors, setPredecessors] = useState<Constraint[]>([]);
    const [successors, setSuccessors] = useState<Constraint[]>([]);
    const [constraintsLoading, setConstraintsLoading] = useState(false);

    // 校验状态
    const [validationLoading, setValidationLoading] = useState(false);
    const [validationResult, setValidationResult] = useState<ConstraintValidationResult | null>(null);

    // 初始化
    useEffect(() => {
        if (visible && operation) {
            setPlannedStart(dayjs(operation.planned_start_datetime));
            setPlannedEnd(dayjs(operation.planned_end_datetime));
            setWindowStart(operation.window_start_datetime ? dayjs(operation.window_start_datetime) : null);
            setWindowEnd(operation.window_end_datetime ? dayjs(operation.window_end_datetime) : null);
            setNotes(operation.notes || '');
            setIsDirty(false);
            loadConstraints();
        }
    }, [visible, operation]);

    // 加载约束
    const loadConstraints = async () => {
        if (!operation) return;
        setConstraintsLoading(true);
        try {
            const response = await axios.get(`/api/batch-operation-plans/${operation.operation_plan_id}/constraints`);
            setPredecessors(response.data.predecessors || []);
            setSuccessors(response.data.successors || []);
        } catch (error) {
            console.error('Failed to load constraints:', error);
            // API可能尚不存在，使用空数组
            setPredecessors([]);
            setSuccessors([]);
        } finally {
            setConstraintsLoading(false);
        }
    };

    // 处理字段变化
    const handleFieldChange = (field: string, value: any) => {
        setIsDirty(true);
        switch (field) {
            case 'planned_start_datetime':
                setPlannedStart(value);
                break;
            case 'planned_end_datetime':
                setPlannedEnd(value);
                break;
            case 'window_start_datetime':
                setWindowStart(value);
                break;
            case 'window_end_datetime':
                setWindowEnd(value);
                break;
            case 'notes':
                setNotes(value);
                break;
        }
    };

    // 处理人员变化
    const handlePersonnelChange = (newPersonnel: { position: number; employee_id: number | null }[]) => {
        setIsDirty(true);
        setPersonnel(newPersonnel);
    };

    // 保存
    const handleSave = async () => {
        if (!operation) return;
        setSaving(true);
        try {
            const updates: any = {
                planned_start_datetime: plannedStart?.toISOString(),
                planned_end_datetime: plannedEnd?.toISOString(),
                window_start_datetime: windowStart?.toISOString() || null,
                window_end_datetime: windowEnd?.toISOString() || null,
                notes,
                personnel: personnel.filter(p => p.employee_id !== null),
            };
            await onSave(updates);
            message.success('保存成功');
            onClose();
        } catch (error) {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    // 处理关闭
    const handleCancel = () => {
        if (isDirty) {
            Modal.confirm({
                title: '确认关闭',
                content: '您有未保存的修改，确定要关闭吗？',
                okText: '关闭',
                cancelText: '继续编辑',
                onOk: onClose,
            });
        } else {
            onClose();
        }
    };

    // 添加约束
    const handleAddPredecessor = () => {
        message.info('选择前置操作功能开发中');
    };

    const handleAddSuccessor = () => {
        message.info('选择后续操作功能开发中');
    };

    // 删除约束
    const handleDeleteConstraint = async (constraintId: number) => {
        try {
            await axios.delete(`/api/batch-constraints/${constraintId}`);
            message.success('约束已删除');
            loadConstraints();
        } catch (error) {
            message.error('删除失败');
        }
    };

    // 编辑约束
    const handleEditConstraint = async (constraintId: number, updates: Partial<Constraint>) => {
        try {
            await axios.put(`/api/batch-constraints/${constraintId}`, updates);
            message.success('约束已更新');
            loadConstraints();
        } catch (error) {
            message.error('更新失败');
        }
    };

    // 校验
    const handleValidate = async () => {
        if (!operation) return;
        setValidationLoading(true);
        try {
            const response = await axios.get(`/api/batches/${operation.batch_id}/validate`);
            setValidationResult(response.data);
            if (response.data.hasConflicts) {
                message.warning('检测完成，发现约束冲突');
            } else {
                message.success('检测完成，无冲突');
            }
        } catch (error) {
            message.error('校验失败');
        } finally {
            setValidationLoading(false);
        }
    };

    if (!operation) return null;

    return (
        <Modal
            title={`编辑操作：${operation.operation_name}`}
            open={visible}
            onCancel={handleCancel}
            width={820}
            centered
            maskClosable={false}
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    取消
                </Button>,
                <Button key="save" type="primary" loading={saving} onClick={handleSave}>
                    保存
                </Button>,
            ]}
            bodyStyle={{ padding: 0, display: 'flex', height: 520 }}
        >
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                {/* 左侧主面板 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <BatchOperationBasicForm
                        operationPlanId={operation.operation_plan_id}
                        batchCode={operation.batch_code}
                        batchName={operation.batch_name}
                        stageName={operation.stage_name}
                        operationName={operation.operation_name}
                        plannedStart={plannedStart}
                        plannedEnd={plannedEnd}
                        plannedDuration={operation.planned_duration}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                        requiredPeople={operation.required_people}
                        notes={notes}
                        assignedPersonnel={operation.assigned_personnel || []}
                        onFieldChange={handleFieldChange}
                        onPersonnelChange={handlePersonnelChange}
                    />
                </div>

                {/* 右侧抽屉 */}
                <BatchOperationDrawer
                    predecessors={predecessors}
                    successors={successors}
                    onAddPredecessor={handleAddPredecessor}
                    onAddSuccessor={handleAddSuccessor}
                    onDeleteConstraint={handleDeleteConstraint}
                    onEditConstraint={handleEditConstraint}
                    operationPlanId={operation.operation_plan_id}
                    batchId={operation.batch_id}
                    onShareGroupRefresh={loadConstraints}
                    validationLoading={validationLoading}
                    validationResult={validationResult}
                    onValidate={handleValidate}
                />
            </div>
        </Modal>
    );
};

export default BatchOperationEditModal;
