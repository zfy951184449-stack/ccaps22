import { useState, useCallback, useEffect } from 'react';
import { Form, message, Modal } from 'antd';
import axios from 'axios';
import {
    GanttNode, ProcessTemplate, ProcessStage, StageOperation, Operation,
    Constraint, ShareGroup, GanttConstraint, ConstraintValidationResult, ConstraintConflict, FlattenedRow
} from '../types';
import { API_BASE_URL, ROW_HEIGHT } from '../constants';
import { findNodeById, generateOperationCode } from '../utils';

export const useGanttInteraction = (
    template: ProcessTemplate,
    ganttNodes: GanttNode[],
    flattenedRows: FlattenedRow[],
    refreshData: () => Promise<void>,
    availableOperations: Operation[],
    setAvailableOperations: React.Dispatch<React.SetStateAction<Operation[]>>,
    expandedKeys: string[],
    setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>,
    ganttContentRef: React.RefObject<HTMLDivElement>
) => {
    // State
    const [editingNode, setEditingNode] = useState<GanttNode | null>(null);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [operationModalVisible, setOperationModalVisible] = useState(false);
    const [operationSubmitting, setOperationSubmitting] = useState(false);

    const [shareGroupModalVisible, setShareGroupModalVisible] = useState(false);
    const [creatingGroup, setCreatingGroup] = useState(false);
    const [assigningGroup, setAssigningGroup] = useState(false);

    const [validationDrawerVisible, setValidationDrawerVisible] = useState(false);
    const [validationLoading, setValidationLoading] = useState(false);
    const [validationResult, setValidationResult] = useState<ConstraintValidationResult | null>(null);

    const [activeHighlight, setActiveHighlight] = useState<{ operations: string[]; constraints: number[] }>({ operations: [], constraints: [] });
    const [scheduling, setScheduling] = useState(false);
    const [scheduleConflicts, setScheduleConflicts] = useState<Record<number, string>>({});
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

    // Data State for Interaction
    const [operationConstraints, setOperationConstraints] = useState<{
        predecessors: Constraint[];
        successors: Constraint[];
    }>({ predecessors: [], successors: [] });
    const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
    const [operationShareGroups, setOperationShareGroups] = useState<ShareGroup[]>([]);
    const [availableOperationsForConstraints, setAvailableOperationsForConstraints] = useState<any[]>([]);
    const [ganttConstraints, setGanttConstraints] = useState<GanttConstraint[]>([]);

    // Forms
    const [form] = Form.useForm();
    const [constraintForm] = Form.useForm();
    const [shareGroupForm] = Form.useForm();
    const [assignGroupForm] = Form.useForm();
    const [operationForm] = Form.useForm<Operation>();

    // Loaders
    const loadShareGroups = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/share-groups/template/${template.id}`);
            const normalized: ShareGroup[] = (response.data || []).map((group: any) => ({
                ...group,
                id: Number(group.id),
                operation_count: group.operation_count !== undefined ? Number(group.operation_count) : undefined
            }));
            setShareGroups(normalized);
        } catch (error) {
            console.error('Error loading share groups:', error);
        }
    }, [template.id]);

    const loadAvailableOperationsForConstraints = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/constraints/template/${template.id}/available-operations`);
            setAvailableOperationsForConstraints(response.data);
        } catch (error) {
            console.error('Error loading available operations:', error);
        }
    }, [template.id]);

    const loadOperationConstraints = async (scheduleId: number) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/constraints/operation/${scheduleId}`);

            const normalize = (items: any[] = [], relation: 'predecessor' | 'successor'): Constraint[] =>
                items.map((item) => ({
                    constraint_id: item.constraint_id !== undefined ? Number(item.constraint_id) : undefined,
                    related_schedule_id: Number(item.related_schedule_id),
                    related_operation_name: item.related_operation_name,
                    related_operation_code: item.related_operation_code,
                    constraint_type: Number(item.constraint_type) || 1,
                    lag_time: item.lag_time !== undefined && item.lag_time !== null ? Number(item.lag_time) : 0,
                    share_personnel: Boolean(item.share_personnel),
                    constraint_name: item.constraint_name || undefined,
                    constraint_level: item.constraint_level !== undefined ? Number(item.constraint_level) : undefined,
                    description: item.description || undefined,
                    relation_type: relation
                }));

            setOperationConstraints({
                predecessors: normalize(response.data?.predecessors, 'predecessor'),
                successors: normalize(response.data?.successors, 'successor')
            });
        } catch (error) {
            console.error('Error loading operation constraints:', error);
            setOperationConstraints({ predecessors: [], successors: [] });
        }
    };

    const loadOperationShareGroups = async (scheduleId: number) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/share-groups/operation/${scheduleId}`);
            const normalized: ShareGroup[] = (response.data || []).map((group: any) => ({
                ...group,
                id: Number(group.id),
                priority: group.priority !== undefined ? Number(group.priority) : undefined
            }));
            setOperationShareGroups(normalized);
        } catch (error) {
            console.error('Error loading operation share groups:', error);
            setOperationShareGroups([]);
        }
    };

    const loadGanttConstraints = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/constraints/template/${template.id}/gantt`);

            const normalizedConstraints: GanttConstraint[] = (response.data || []).map((item: any) => ({
                ...item,
                constraint_id: Number(item.constraint_id),
                from_schedule_id: Number(item.from_schedule_id),
                from_operation_id: Number(item.from_operation_id),
                to_schedule_id: Number(item.to_schedule_id),
                to_operation_id: Number(item.to_operation_id),
                constraint_type: Number(item.constraint_type) || 1,
                lag_time: item.lag_time !== undefined && item.lag_time !== null ? Number(item.lag_time) : 0,
                share_personnel: Boolean(item.share_personnel),
                constraint_level: item.constraint_level !== undefined ? Number(item.constraint_level) : undefined,
                constraint_name: item.constraint_name || undefined,
                from_operation_day: Number(item.from_operation_day),
                from_recommended_time: Number(item.from_recommended_time),
                to_operation_day: Number(item.to_operation_day),
                to_recommended_time: Number(item.to_recommended_time),
                from_stage_start_day: Number(item.from_stage_start_day),
                to_stage_start_day: Number(item.to_stage_start_day)
            }));

            setGanttConstraints(normalizedConstraints);
        } catch (error) {
            console.error('Error loading gantt constraints:', error);
            setGanttConstraints([]);
        }
    }, [template.id]);

    // Effects
    useEffect(() => {
        loadShareGroups();
        loadAvailableOperationsForConstraints();
        loadGanttConstraints();
    }, [loadShareGroups, loadAvailableOperationsForConstraints, loadGanttConstraints]);

    useEffect(() => {
        setValidationResult(null);
        setActiveHighlight({ operations: [], constraints: [] });
        setValidationDrawerVisible(false);
    }, [template.id]);

    useEffect(() => {
        assignGroupForm.setFieldsValue({ priority: Math.max(1, operationShareGroups.length + 1) });
    }, [operationShareGroups, assignGroupForm]);

    // Handlers
    const handleEditNode = (node: GanttNode) => {
        setEditingNode(node);

        if (node.type === 'stage' && node.data) {
            const stageData = node.data as ProcessStage;
            form.setFieldsValue({
                stage_name: stageData.stage_name,
                stage_code: stageData.stage_code,
                start_day: stageData.start_day,
                description: stageData.description
            });
        } else if (node.type === 'operation') {
            assignGroupForm.resetFields();
            assignGroupForm.setFieldsValue({ priority: 1 });
            if (node.data) {
                const operationData = node.data as StageOperation;

                const parseTimeValue = (value: any): number => {
                    if (typeof value === 'string') {
                        return parseFloat(value);
                    }
                    return typeof value === 'number' ? value : 0;
                };

                form.setFieldsValue({
                    operation_id: operationData.operation_id,
                    operation_day: operationData.operation_day,
                    recommended_time: parseTimeValue(operationData.recommended_time ?? 9),
                    recommended_day_offset: operationData.recommended_day_offset ?? 0,
                    window_start_time: parseTimeValue(operationData.window_start_time ?? 9),
                    window_start_day_offset: operationData.window_start_day_offset ?? 0,
                    window_end_time: parseTimeValue(operationData.window_end_time ?? 17),
                    window_end_day_offset: operationData.window_end_day_offset ?? 0,
                });

                loadOperationConstraints(operationData.id);
                loadOperationShareGroups(operationData.id);
            } else {
                form.setFieldsValue({
                    operation_day: 0,
                    recommended_time: 9,
                    recommended_day_offset: 0,
                    window_start_time: 9,
                    window_start_day_offset: 0,
                    window_end_time: 17,
                    window_end_day_offset: 0,
                });

                setOperationConstraints({ predecessors: [], successors: [] });
                setOperationShareGroups([]);
            }
        }

        setEditModalVisible(true);
    };

    const handleSaveNode = async (values: any) => {
        try {
            if (editingNode) {
                if (editingNode.type === 'stage') {
                    if (editingNode.id.includes('new')) {
                        await axios.post(`${API_BASE_URL}/process-stages/template/${template.id}`, values);
                    } else {
                        const stageData = editingNode.data as ProcessStage;
                        await axios.put(`${API_BASE_URL}/process-stages/${stageData.id}`, values);
                    }
                } else if (editingNode.type === 'operation') {
                    const parentStageId = editingNode.parent_id?.replace('stage_', '');
                    if (editingNode.id.includes('new')) {
                        await axios.post(`${API_BASE_URL}/stage-operations/stage/${parentStageId}`, values);
                    } else {
                        const operationData = editingNode.data as StageOperation;
                        await axios.put(`${API_BASE_URL}/stage-operations/${operationData.id}`, values);
                    }
                }

                await refreshData();
                message.success('保存成功');
                setIsDirty(true);
            }
        } catch (error) {
            message.error('保存失败');
            console.error(error);
        }

        setEditModalVisible(false);
        setEditingNode(null);
        form.resetFields();
    };

    const handleDeleteNode = (nodeId: string) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除该节点吗？删除后不可恢复。',
            onOk: async () => {
                try {
                    const node = findNodeById(ganttNodes, nodeId);
                    if (node) {
                        if (node.type === 'stage' && node.data) {
                            await axios.delete(`${API_BASE_URL}/process-stages/${(node.data as ProcessStage).id}`);
                        } else if (node.type === 'operation' && node.data) {
                            await axios.delete(`${API_BASE_URL}/stage-operations/${(node.data as StageOperation).id}`);
                        }
                        await refreshData();
                        message.success('删除成功');
                        setIsDirty(true);
                    }
                } catch (error) {
                    message.error('删除失败');
                    console.error(error);
                }
            }
        });
    };

    const handleSaveTemplate = async () => {
        try {
            await axios.put(`${API_BASE_URL}/process-templates/${template.id}/recalculate`);
            setIsDirty(false);
            message.success('模板保存成功');
        } catch (error) {
            console.error('保存模板失败:', error);
            message.error('保存模板失败');
        }
    };

    const handleAutoSchedule = async () => {
        setScheduling(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/process-templates/${template.id}/auto-schedule`);
            const conflicts = response.data?.conflicts || [];
            const conflictMap: Record<number, string> = {};
            conflicts.forEach((conflict: any) => {
                if (conflict.scheduleId) {
                    conflictMap[Number(conflict.scheduleId)] = conflict.type;
                }
            });
            setScheduleConflicts(conflictMap);

            await refreshData();
            await loadGanttConstraints();

            if (editingNode?.type === 'operation' && editingNode.data) {
                const scheduleId = (editingNode.data as StageOperation).id;
                if (scheduleId) {
                    await loadOperationConstraints(scheduleId);
                    await loadOperationShareGroups(scheduleId);
                }
            }

            if (conflicts.length > 0) {
                const criticalCount = conflicts.filter((item: any) => item?.severity === 'CRITICAL').length;
                message.warning(`自动排程完成，但存在 ${conflicts.length} 个冲突${criticalCount ? `（其中 ${criticalCount} 个为阻断项）` : ''}`);
            } else {
                message.success('自动排程完成');
            }

            setIsDirty(false);
        } catch (error) {
            console.error('Error running auto schedule:', error);
            message.error('自动排程失败，请稍后重试');
        } finally {
            setScheduling(false);
        }
    };

    const handleCreateNode = (type: 'stage' | 'operation', parentNode: GanttNode) => {
        const newNode: GanttNode = {
            id: `new_${type}_${Date.now()}`,
            title: type === 'stage' ? '新阶段' : '新操作',
            type: type,
            parent_id: parentNode.id,
            standard_time: type === 'operation' ? 4 : undefined,
            required_people: type === 'operation' ? 2 : undefined,
            start_day: 0,
            start_hour: 0,
            editable: true,
            children: type === 'stage' ? [] : undefined
        };

        setEditingNode(newNode);
        setEditModalVisible(true);
    };

    const openOperationModal = useCallback(() => {
        operationForm.resetFields();
        operationForm.setFieldsValue({
            operation_code: generateOperationCode(availableOperations),
            standard_time: 1,
            required_people: 1,
        });
        setOperationModalVisible(true);
    }, [operationForm, availableOperations]);

    const handleOperationSubmit = useCallback(async () => {
        try {
            const values = await operationForm.validateFields();
            const payload = {
                operation_code: values.operation_code.trim(),
                operation_name: values.operation_name.trim(),
                standard_time: Number(values.standard_time),
                required_people: Number(values.required_people),
                description: values.description?.trim() || undefined,
            };

            setOperationSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/operations`, payload);
            const created: Operation = response.data;

            setAvailableOperations((prev) => [...prev, created]);
            loadAvailableOperationsForConstraints();

            if (!editingNode?.data && created?.id) {
                form.setFieldsValue({ operation_id: created.id });
            }

            message.success('操作创建成功');
            setOperationModalVisible(false);
            operationForm.resetFields();
        } catch (error: any) {
            if (error?.errorFields) {
                return;
            }
            const msg = error?.response?.data?.error || error?.message || '创建操作失败';
            message.error(msg);
        } finally {
            setOperationSubmitting(false);
        }
    }, [operationForm, editingNode, form, loadAvailableOperationsForConstraints, setAvailableOperations]);

    const handleAssignShareGroup = async (values: any) => {
        if (!editingNode?.data?.id) {
            message.warning('请先保存操作后再设置共享组');
            return;
        }

        setAssigningGroup(true);
        try {
            await axios.post(`${API_BASE_URL}/share-groups/assign`, {
                schedule_id: editingNode.data.id,
                share_group_id: values.share_group_id,
                priority: values.priority ?? 1
            });
            message.success('已加入共享组');
            assignGroupForm.resetFields();
            loadOperationShareGroups(editingNode.data.id);
            loadShareGroups();
        } catch (error) {
            console.error('Error assigning share group:', error);
            message.error('加入共享组失败');
        } finally {
            setAssigningGroup(false);
        }
    };

    const handleRemoveShareGroup = async (groupId: number) => {
        if (!editingNode?.data?.id) return;

        try {
            await axios.delete(`${API_BASE_URL}/share-groups/operation/${editingNode.data.id}/group/${groupId}`);
            message.success('已移出共享组');
            loadOperationShareGroups(editingNode.data.id);
            loadShareGroups();
        } catch (error) {
            console.error('Error removing share group relation:', error);
            message.error('移除共享组失败');
        }
    };

    const handleCreateShareGroup = async (values: any) => {
        setCreatingGroup(true);
        try {
            await axios.post(`${API_BASE_URL}/share-groups`, {
                template_id: template.id,
                group_code: values.group_code,
                group_name: values.group_name,
                description: values.description || null,
                color: values.color || '#1890ff'
            });
            message.success('共享组创建成功');
            setShareGroupModalVisible(false);
            shareGroupForm.resetFields();
            loadShareGroups();
        } catch (error: any) {
            console.error('Error creating share group:', error);
            if (error.response?.data?.error) {
                message.error(error.response.data.error);
            } else {
                message.error('创建共享组失败');
            }
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleSaveConstraint = async (values: any, relation: 'predecessor' | 'successor') => {
        if (!editingNode?.data?.id) {
            message.warning('请先保存操作后再添加约束');
            return;
        }

        try {
            const currentScheduleId = editingNode.data.id;
            const payload = {
                from_schedule_id: relation === 'successor' ? currentScheduleId : values.related_schedule_id,
                to_schedule_id: relation === 'predecessor' ? currentScheduleId : values.related_schedule_id,
                constraint_type: Number(values.constraint_type) || 1,
                lag_time: Number(values.lag_time) || 0,
                share_personnel: Boolean(values.share_personnel),
                constraint_name: values.constraint_name || undefined,
                constraint_level: values.constraint_level || 1,
                description: values.description || undefined
            };

            await axios.post(`${API_BASE_URL}/constraints`, payload);
            message.success('约束添加成功');
            constraintForm.resetFields();

            // Reload constraints and gantt data
            await loadOperationConstraints(currentScheduleId);
            await loadGanttConstraints();
        } catch (error: any) {
            console.error('Error saving constraint:', error);
            message.error(error.response?.data?.error || '添加约束失败');
        }
    };

    const handleDeleteConstraint = async (constraintId: number) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除该约束关系吗？删除后不可恢复。',
            onOk: async () => {
                try {
                    await axios.delete(`${API_BASE_URL}/constraints/${constraintId}`);
                    message.success('约束删除成功');

                    // Reload data
                    if (editingNode?.data?.id) {
                        await loadOperationConstraints(editingNode.data.id);
                    }
                    await loadGanttConstraints();
                } catch (error) {
                    console.error('Error deleting constraint:', error);
                    message.error('删除约束失败');
                }
            }
        });
    };

    const handleValidateConstraints = async () => {
        setValidationDrawerVisible(true);
        setValidationLoading(true);
        try {
            const response = await axios.get<ConstraintValidationResult>(`${API_BASE_URL}/constraints/template/${template.id}/validate`);
            setValidationResult(response.data);
            if (response.data.hasConflicts) {
                message.warning('检测完成，发现约束冲突。');
            } else {
                message.success('检测完成，未发现约束冲突。');
            }
        } catch (error) {
            console.error('Failed to validate constraints:', error);
            message.error('约束校验失败，请稍后重试。');
        } finally {
            setValidationLoading(false);
        }
    };

    const handleConflictHighlight = (conflict: ConstraintConflict) => {
        const operationNodeIds = (conflict.operationScheduleIds || []).map((id) => `operation_${id}`);
        const constraintIds = conflict.constraintIds || [];

        if (operationNodeIds.length === 0 && constraintIds.length === 0) {
            return;
        }

        setActiveHighlight({ operations: operationNodeIds, constraints: constraintIds });

        if (operationNodeIds.length > 0) {
            const newExpanded = new Set(expandedKeys);
            operationNodeIds.forEach((nodeId) => {
                const node = findNodeById(ganttNodes, nodeId);
                if (node?.parent_id) {
                    newExpanded.add(node.parent_id);
                }
            });
            setExpandedKeys(Array.from(newExpanded));

            setTimeout(() => {
                const firstNode = operationNodeIds[0];
                const rowIndex = flattenedRows.findIndex(row => row.id === firstNode);
                if (rowIndex !== -1 && ganttContentRef.current) {
                    const targetScrollTop = rowIndex * ROW_HEIGHT - ROW_HEIGHT * 2;
                    ganttContentRef.current.scrollTop = Math.max(0, targetScrollTop);
                }
            }, 120);
        }
    };

    // 拖拽结束处理
    const handleOperationDragEnd = useCallback(async (
        scheduleId: number,
        stageId: number,
        updates: {
            operation_day?: number;
            recommended_time?: number;
            window_start_time?: number;
            window_start_day_offset?: number;
            window_end_time?: number;
            window_end_day_offset?: number;
        }
    ) => {
        try {
            await axios.put(`${API_BASE_URL}/stage-operations/${scheduleId}`, updates);
            setIsDirty(true);
        } catch (error: any) {
            console.error('Error updating operation via drag:', error);
            console.error('Error response data:', error?.response?.data);
            console.error('Updates sent:', updates);
            throw error; // 让调用方处理错误
        }
    }, []);

    const clearActiveHighlight = () => {
        setActiveHighlight({ operations: [], constraints: [] });
    };

    return {
        editingNode, setEditingNode,
        editModalVisible, setEditModalVisible,
        isDirty, setIsDirty,
        operationModalVisible, setOperationModalVisible,
        operationSubmitting, setOperationSubmitting,
        shareGroupModalVisible, setShareGroupModalVisible,
        creatingGroup, setCreatingGroup,
        assigningGroup, setAssigningGroup,
        validationDrawerVisible, setValidationDrawerVisible,
        validationLoading, setValidationLoading,
        validationResult, setValidationResult,
        activeHighlight, setActiveHighlight,
        scheduling, setScheduling,
        scheduleConflicts, setScheduleConflicts,
        operationConstraints, setOperationConstraints,
        shareGroups, setShareGroups,
        operationShareGroups, setOperationShareGroups,
        availableOperationsForConstraints, setAvailableOperationsForConstraints,
        ganttConstraints, setGanttConstraints,
        form, constraintForm, shareGroupForm, assignGroupForm, operationForm,
        handleEditNode,
        handleSaveNode,
        handleDeleteNode,
        handleSaveTemplate,
        handleAutoSchedule,
        handleCreateNode,
        openOperationModal,
        handleOperationSubmit,
        handleAssignShareGroup,
        handleRemoveShareGroup,
        handleCreateShareGroup,
        handleSaveConstraint,
        handleDeleteConstraint,
        handleValidateConstraints,
        handleConflictHighlight,
        clearActiveHighlight,
        loadOperationConstraints,
        loadOperationShareGroups,
        loadShareGroups, // Expose this
        handleOperationDragEnd,
        refreshData,
        hoveredRowId,
        setHoveredRowId
    };
};
