import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { message, Drawer, Button, Space, Tag, List, Checkbox, Input, Spin, Alert, Descriptions, Select } from 'antd';
import { SyncOutlined, TeamOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import ProcessTemplateGantt from '../ProcessTemplateGantt';
import type { GanttNode, TimeBlock, ProcessTemplate, ProcessStage, StageOperation, GanttConstraint } from '../ProcessTemplateGantt/types';
import type { ExternalGanttData } from '../ProcessTemplateGantt/hooks/useGanttData';
import { BatchOperationEditModal, BatchOperationDetail } from './BatchOperationEditModal';
import AddIndependentOperationModal from './AddIndependentOperationModal';

// 批次操作数据结构（来自后端API）
interface ActiveOperation {
    operation_plan_id: number;
    batch_id: number;
    batch_code: string;
    batch_name: string;
    batch_color?: string;
    plan_status: string;
    stage_name: string;
    stage_id?: number;
    stage_start_day?: number | null;
    operation_name: string;
    planned_start_datetime: string;
    planned_end_datetime: string;
    planned_duration: number;
    window_start_datetime?: string | null;
    window_end_datetime?: string | null;
    required_people: number;
    assigned_people: number;
    assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED' | string;
    operation_type?: string;
    is_locked?: number | boolean;
    lock_reason?: string | null;
    locked_at?: string | null;
    locked_by?: number | null;
}

interface OperationDetailAssignedPersonnel {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    assignment_status: string;
    role: string;
    is_primary: 0 | 1 | boolean;
}

interface OperationDetailResponse extends ActiveOperation {
    assigned_personnel: OperationDetailAssignedPersonnel[];
}

interface RecommendedPersonnel {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    department?: string;
    qualifications?: string;
    match_score: number;
    recommendation: string;
    has_conflict?: boolean;
}

export interface BatchGanttAdapterActionRequest {
    operationPlanId: number;
    action: 'focus' | 'assign';
    requestedAt?: number;
}

interface BatchGanttAdapterProps {
    onBack?: () => void;
    actionRequest?: BatchGanttAdapterActionRequest | null;
    onActionHandled?: () => void;
    showAllBatches?: boolean; // 是否默认显示所有批次
}

// 批次状态选项 - 仅支持 DRAFT 和 ACTIVATED
const STATUS_OPTIONS = [
    { value: 'DRAFT', label: '草稿', color: 'default' },
    { value: 'ACTIVATED', label: '激活', color: 'green' },
];

const DEFAULT_COLORS = ['#2563EB', '#0F766E', '#D97706', '#B91C1C', '#7C3AED'];

/**
 * 将批次操作数据转换为 ProcessTemplateGantt 兼容格式
 */
function convertBatchToGanttData(operations: ActiveOperation[], baseDate: dayjs.Dayjs): {
    template: ProcessTemplate;
    externalData: ExternalGanttData;
    operationMap: Map<number, ActiveOperation>;
    readOnlyOperationIds: Set<string>;
} {
    // 按批次分组
    const batchMap = new Map<number, {
        sample: ActiveOperation;
        stageMap: Map<string, ActiveOperation[]>;
    }>();

    // 用于快速查找操作
    const operationMap = new Map<number, ActiveOperation>();

    // 只读操作集合（ACTIVATED 状态的批次操作禁止拖拽）
    const readOnlyOperationIds = new Set<string>();

    operations.forEach(op => {
        operationMap.set(op.operation_plan_id, op);

        // ACTIVATED 状态的操作加入只读集合
        // INDEPENDENT 批次的操作也加入只读集合（禁止拖动编辑）
        if (op.plan_status === 'ACTIVATED' || op.batch_code === 'INDEPENDENT') {
            readOnlyOperationIds.add(`operation_${op.operation_plan_id}`);
        }

        if (!batchMap.has(op.batch_id)) {
            batchMap.set(op.batch_id, {
                sample: op,
                stageMap: new Map()
            });
        }
        const stageMap = batchMap.get(op.batch_id)!.stageMap;
        if (!stageMap.has(op.stage_name)) {
            stageMap.set(op.stage_name, []);
        }
        stageMap.get(op.stage_name)!.push(op);
    });

    // 构建 GanttNode 树 和 TimeBlock
    const ganttNodes: GanttNode[] = [];
    const timeBlocks: TimeBlock[] = [];
    let globalMinDay = Infinity;
    let globalMaxDay = -Infinity;

    Array.from(batchMap.entries()).forEach(([batchId, { sample, stageMap }], batchIndex) => {
        const batchColor = sample.batch_color || DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length];

        // 创建批次节点（作为模板）
        const batchNode: GanttNode = {
            id: `batch_${batchId}`,
            title: `${sample.batch_code} - ${sample.batch_name}`,
            type: 'template',
            children: [],
            expanded: true,
            editable: false
        };

        Array.from(stageMap.entries()).forEach(([stageName, ops], stageIndex) => {
            // 计算阶段开始天数
            const stageOps = ops.sort((a, b) =>
                dayjs(a.planned_start_datetime).valueOf() - dayjs(b.planned_start_datetime).valueOf()
            );
            const stageStartTime = dayjs(stageOps[0].planned_start_datetime);
            const stageEndTime = dayjs(stageOps[stageOps.length - 1].planned_end_datetime);
            const stageStartDay = stageStartTime.startOf('day').diff(baseDate, 'day');
            const stageEndDay = stageEndTime.startOf('day').diff(baseDate, 'day');

            // 创建阶段节点
            const stageNode: GanttNode = {
                id: `stage_${batchId}_${stageIndex}`,
                title: stageName,
                type: 'stage',
                parent_id: `batch_${batchId}`,
                stage_code: `S${stageIndex + 1}`,
                start_day: stageStartDay,
                children: [],
                expanded: true,
                editable: false,
                data: {
                    id: stageIndex,
                    template_id: batchId,
                    stage_code: `S${stageIndex + 1}`,
                    stage_name: stageName,
                    stage_order: stageIndex,
                    start_day: stageStartDay
                } as ProcessStage
            };

            // 添加阶段条 TimeBlock
            const stageStartHour = stageStartDay * 24;
            const stageDurationHours = (stageEndDay - stageStartDay + 1) * 24;
            timeBlocks.push({
                id: `stage_bar_${batchId}_${stageIndex}`,
                node_id: stageNode.id,
                title: stageName,
                start_hour: stageStartHour,
                duration_hours: stageDurationHours,
                color: batchColor,
                isStage: true
            });

            // 对于 INDEPENDENT 批次，按 operation_name 合并操作
            const isIndependentBatch = sample.batch_code === 'INDEPENDENT';

            if (isIndependentBatch) {
                // 按 operation_name 分组
                const opsByName = new Map<string, ActiveOperation[]>();
                stageOps.forEach(op => {
                    if (!opsByName.has(op.operation_name)) {
                        opsByName.set(op.operation_name, []);
                    }
                    opsByName.get(op.operation_name)!.push(op);
                });

                let consolidatedOpIndex = 0;
                Array.from(opsByName.entries()).forEach(([opName, opsGroup]) => {
                    // 使用第一个操作作为代表创建节点
                    const firstOp = opsGroup[0];
                    const totalCount = opsGroup.length;
                    const totalDuration = opsGroup.reduce((sum, o) => sum + o.planned_duration, 0);

                    // 创建合并后的节点（使用虚拟 ID）
                    const consolidatedNodeId = `independent_${opName.replace(/\s+/g, '_')}_${batchId}`;

                    // 将合并节点加入只读集合，禁止拖动
                    readOnlyOperationIds.add(consolidatedNodeId);

                    const opNode: GanttNode = {
                        id: consolidatedNodeId,
                        title: opName,
                        type: 'operation',
                        parent_id: stageNode.id,
                        start_day: stageStartDay,
                        standard_time: totalDuration,
                        required_people: firstOp.required_people,
                        children: [],
                        expanded: false,
                        editable: false, // 合并行本身不可编辑
                        data: {
                            id: 0,
                            stage_id: stageIndex,
                            operation_id: 0,
                            operation_code: `OP${consolidatedOpIndex + 1}`,
                            operation_name: opName,
                            operation_day: 0,
                            recommended_time: 0,
                            window_start_time: 0,
                            window_start_day_offset: 0,
                            window_end_time: 24,
                            window_end_day_offset: 0,
                            operation_order: consolidatedOpIndex,
                            standard_time: totalDuration,
                            required_people: firstOp.required_people,
                            // 附加信息用于侧边栏显示
                            _consolidatedCount: totalCount
                        } as StageOperation & { _consolidatedCount: number }
                    };

                    stageNode.children!.push(opNode);

                    // 为该组内每个操作创建 TimeBlock，但都关联到同一个合并节点
                    opsGroup.forEach(op => {
                        const opStart = dayjs(op.planned_start_datetime);
                        const opEnd = dayjs(op.planned_end_datetime);

                        const opDayFromBase = opStart.startOf('day').diff(baseDate, 'day');
                        const recommendedTime = opStart.hour() + opStart.minute() / 60;
                        const startHour = opDayFromBase * 24 + recommendedTime;
                        const durationHours = opEnd.diff(opStart, 'minute') / 60;

                        // 更新全局范围
                        globalMinDay = Math.min(globalMinDay, opDayFromBase);
                        globalMaxDay = Math.max(globalMaxDay, opDayFromBase);

                        // 添加操作 TimeBlock（使用实际操作ID，以便点击时能识别）
                        timeBlocks.push({
                            id: `op_${op.operation_plan_id}`,
                            node_id: consolidatedNodeId,  // 关联到合并节点
                            title: op.operation_name,
                            start_hour: startHour,
                            duration_hours: durationHours,
                            color: batchColor,
                            isRecommended: true,
                            // 存储真实操作 ID 用于点击处理
                            operationPlanId: op.operation_plan_id
                        } as TimeBlock & { operationPlanId: number });
                    });

                    consolidatedOpIndex++;
                });
            } else {
                // 普通批次：每个操作一行
                stageOps.forEach((op, opIndex) => {
                    const opStart = dayjs(op.planned_start_datetime);
                    const opEnd = dayjs(op.planned_end_datetime);

                    // 计算相对于 baseDate 的天数和时间
                    const opDayFromBase = opStart.startOf('day').diff(baseDate, 'day');
                    const recommendedTime = opStart.hour() + opStart.minute() / 60;
                    const startHour = opDayFromBase * 24 + recommendedTime;
                    const durationHours = opEnd.diff(opStart, 'minute') / 60;

                    // 计算相对于阶段开始的 operation_day
                    const operationDay = opDayFromBase - stageStartDay;

                    // 时间窗口
                    let windowStartTime = recommendedTime - 2;
                    let windowStartDayOffset = 0;
                    let windowEndTime = recommendedTime + 2;
                    let windowEndDayOffset = 0;
                    let windowStartHour = startHour - 2;
                    let windowDurationHours = durationHours + 4;

                    if (op.window_start_datetime) {
                        const windowStart = dayjs(op.window_start_datetime);
                        const windowStartDayFromBase = windowStart.startOf('day').diff(baseDate, 'day');
                        windowStartTime = windowStart.hour() + windowStart.minute() / 60;
                        windowStartDayOffset = windowStartDayFromBase - opDayFromBase;
                        windowStartHour = windowStartDayFromBase * 24 + windowStartTime;
                    }

                    if (op.window_end_datetime) {
                        const windowEnd = dayjs(op.window_end_datetime);
                        const windowEndDayFromBase = windowEnd.startOf('day').diff(baseDate, 'day');
                        windowEndTime = windowEnd.hour() + windowEnd.minute() / 60;
                        windowEndDayOffset = windowEndDayFromBase - opDayFromBase;
                        const windowEndHour = windowEndDayFromBase * 24 + windowEndTime;
                        windowDurationHours = windowEndHour - windowStartHour;
                    }

                    // 更新全局范围
                    globalMinDay = Math.min(globalMinDay, opDayFromBase + windowStartDayOffset);
                    globalMaxDay = Math.max(globalMaxDay, opDayFromBase + windowEndDayOffset);

                    const opNode: GanttNode = {
                        id: `operation_${op.operation_plan_id}`,
                        title: op.operation_name,
                        type: 'operation',
                        parent_id: stageNode.id,
                        start_day: opDayFromBase,
                        start_hour: startHour,
                        standard_time: op.planned_duration,
                        required_people: op.required_people,
                        children: [],
                        expanded: false,
                        editable: true,
                        data: {
                            id: op.operation_plan_id,
                            stage_id: stageIndex,
                            operation_id: op.operation_plan_id,
                            operation_code: `OP${opIndex + 1}`,
                            operation_name: op.operation_name,
                            operation_day: operationDay,
                            recommended_time: recommendedTime,
                            window_start_time: windowStartTime,
                            window_start_day_offset: windowStartDayOffset,
                            window_end_time: windowEndTime,
                            window_end_day_offset: windowEndDayOffset,
                            operation_order: opIndex,
                            standard_time: op.planned_duration,
                            required_people: op.required_people
                        } as StageOperation
                    };

                    stageNode.children!.push(opNode);

                    // 添加时间窗口 TimeBlock
                    timeBlocks.push({
                        id: `window_${op.operation_plan_id}`,
                        node_id: opNode.id,
                        title: `${op.operation_name} 窗口`,
                        start_hour: windowStartHour,
                        duration_hours: windowDurationHours,
                        color: batchColor,
                        isTimeWindow: true
                    });

                    // 添加操作 TimeBlock
                    timeBlocks.push({
                        id: `op_${op.operation_plan_id}`,
                        node_id: opNode.id,
                        title: op.operation_name,
                        start_hour: startHour,
                        duration_hours: durationHours,
                        color: batchColor,
                        isRecommended: true
                    });
                });
            }

            batchNode.children!.push(stageNode);
        });

        ganttNodes.push(batchNode);
    });

    // 处理边界情况
    if (globalMinDay === Infinity) globalMinDay = 0;
    if (globalMaxDay === -Infinity) globalMaxDay = 7;

    // 创建虚拟模板
    const template: ProcessTemplate = {
        id: 0,
        template_code: 'BATCH_VIEW',
        template_name: '激活批次甘特图',
        description: '所有激活批次的甘特图视图',
        total_days: globalMaxDay - globalMinDay + 1
    };

    return {
        template,
        externalData: {
            ganttNodes,
            startDay: globalMinDay,
            endDay: globalMaxDay,
            timeBlocks,
            baseDate: baseDate.format('YYYY-MM-DD')
        },
        operationMap,
        readOnlyOperationIds
    };
}

const BatchGanttAdapter: React.FC<BatchGanttAdapterProps> = ({
    onBack,
    actionRequest,
    onActionHandled,
    showAllBatches = false
}) => {
    const [loading, setLoading] = useState(false);
    // 状态过滤器 - 默认显示草稿和已激活状态
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['DRAFT', 'ACTIVATED']);
    const [error, setError] = useState<string | null>(null);
    const [operations, setOperations] = useState<ActiveOperation[]>([]);

    // 人员分配相关状态
    const [assignDrawerVisible, setAssignDrawerVisible] = useState(false);
    const [selectedOperation, setSelectedOperation] = useState<ActiveOperation | null>(null);
    const [operationDetail, setOperationDetail] = useState<OperationDetailResponse | null>(null);
    const [operationDetailLoading, setOperationDetailLoading] = useState(false);
    const [assignCandidates, setAssignCandidates] = useState<RecommendedPersonnel[]>([]);
    const [assignSelectedIds, setAssignSelectedIds] = useState<number[]>([]);
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignSubmitting, setAssignSubmitting] = useState(false);
    const [assignSearch, setAssignSearch] = useState('');

    // 批次操作编辑弹窗状态
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingOperationDetail, setEditingOperationDetail] = useState<BatchOperationDetail | null>(null);

    // 独立操作添加弹窗状态
    const [addIndependentModalVisible, setAddIndependentModalVisible] = useState(false);

    // 待保存的更改记录（用于批量确认保存）
    const [pendingChanges, setPendingChanges] = useState<Map<number, {
        planned_start_datetime?: string;
        planned_end_datetime?: string;
        window_start_datetime?: string | null;
        window_end_datetime?: string | null;
    }>>(new Map());

    // 是否有未保存更改
    const isDirty = pendingChanges.size > 0;

    // 批次约束原始数据（仅 API ID 信息，不包含计算的位置）
    const [rawConstraints, setRawConstraints] = useState<any[]>([]);
    // 用于跟踪约束是否已加载（避免重复加载）
    const [constraintsLoaded, setConstraintsLoaded] = useState(false);

    // 加载数据
    const loadOperations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 根据选中的状态构建查询参数
            const statusParam = selectedStatuses.length === 0 ? 'ACTIVATED' : selectedStatuses.join(',');
            const response = await axios.get<ActiveOperation[]>('/api/calendar/operations/active', {
                params: { status: statusParam }
            });
            setOperations(response.data);
        } catch (err) {
            console.error('Failed to load batch operations', err);
            setError('加载批次操作数据失败');
        } finally {
            setLoading(false);
        }
    }, [selectedStatuses]);

    useEffect(() => {
        loadOperations();
    }, [loadOperations]);

    // 处理状态过滤变化
    const handleStatusChange = useCallback((values: string[]) => {
        setSelectedStatuses(values.length > 0 ? values : ['ACTIVATED']);
    }, []);

    // 计算基准日期（所有操作的最早日期）
    const baseDate = useMemo(() => {
        if (operations.length === 0) return dayjs().startOf('day');
        const earliest = operations.reduce((min, op) => {
            const opDate = dayjs(op.planned_start_datetime);
            return opDate.isBefore(min) ? opDate : min;
        }, dayjs(operations[0].planned_start_datetime));
        return earliest.startOf('day');
    }, [operations]);

    // 加载批次约束原始数据（仅在操作首次加载时调用，不依赖 operations 状态）
    const loadBatchConstraints = useCallback(async (ops: ActiveOperation[]) => {
        if (ops.length === 0) return;

        // 获取所有唯一的批次 ID
        const batchIds = Array.from(new Set(ops.map(op => op.batch_id)));

        try {
            // 并行加载所有批次的约束
            const constraintPromises = batchIds.map(batchId =>
                axios.get<any[]>(`/api/constraints/batch/${batchId}/gantt`)
                    .then(res => res.data)
                    .catch(() => []) // 忽略单个批次的加载错误
            );
            const allConstraintArrays = await Promise.all(constraintPromises);

            // 仅存储原始约束数据（不计算位置）
            setRawConstraints(allConstraintArrays.flat());
            setConstraintsLoaded(true);
        } catch (err) {
            console.error('Failed to load batch constraints', err);
        }
    }, []);

    // 动态计算约束位置（基于当前 operations 状态，这样拖拽后位置会自动更新）
    const batchConstraints = useMemo((): GanttConstraint[] => {
        if (rawConstraints.length === 0 || operations.length === 0) return [];

        const constraints: GanttConstraint[] = [];
        rawConstraints.forEach(row => {
            // 从当前 operations 状态中查找对应的操作
            const fromOp = operations.find(op => op.operation_plan_id === row.predecessor_batch_operation_plan_id);
            const toOp = operations.find(op => op.operation_plan_id === row.batch_operation_plan_id);

            if (!fromOp || !toOp) return;

            const fromOpStart = dayjs(fromOp.planned_start_datetime);
            const toOpStart = dayjs(toOp.planned_start_datetime);

            constraints.push({
                constraint_id: row.constraint_id,
                from_schedule_id: row.predecessor_batch_operation_plan_id,
                from_operation_id: row.predecessor_batch_operation_plan_id,
                from_operation_name: fromOp.operation_name,
                from_operation_code: '',
                to_schedule_id: row.batch_operation_plan_id,
                to_operation_id: row.batch_operation_plan_id,
                to_operation_name: toOp.operation_name,
                to_operation_code: '',
                constraint_type: row.constraint_type || 1,
                lag_time: row.time_lag || 0,
                share_personnel: row.share_personnel,
                constraint_level: row.constraint_level,
                constraint_name: row.constraint_name,
                from_stage_name: row.predecessor_stage_name || fromOp.stage_name,
                to_stage_name: row.current_stage_name || toOp.stage_name,
                from_operation_day: fromOpStart.startOf('day').diff(baseDate, 'day'),
                from_recommended_time: fromOpStart.hour() + fromOpStart.minute() / 60,
                to_operation_day: toOpStart.startOf('day').diff(baseDate, 'day'),
                to_recommended_time: toOpStart.hour() + toOpStart.minute() / 60,
                from_stage_start_day: 0,
                to_stage_start_day: 0
            });
        });

        return constraints;
    }, [rawConstraints, operations, baseDate]);

    // 操作首次加载后加载约束（仅加载一次）
    useEffect(() => {
        if (operations.length > 0 && !constraintsLoaded) {
            loadBatchConstraints(operations);
        }
    }, [operations, constraintsLoaded, loadBatchConstraints]);

    // 转换数据
    const ganttData = useMemo(() => {
        if (operations.length === 0) return null;
        return convertBatchToGanttData(operations, baseDate);
    }, [operations, baseDate]);

    // 处理操作点击（打开编辑弹窗）
    const handleOperationClick = useCallback((operationId: number, operationData: StageOperation) => {
        const operation = ganttData?.operationMap.get(operationId);
        if (!operation) return;

        setSelectedOperation(operation);

        // 加载操作详情并打开编辑弹窗
        axios.get<OperationDetailResponse>(`/api/calendar/operations/${operationId}`)
            .then(res => {
                const detail: BatchOperationDetail = {
                    operation_plan_id: res.data.operation_plan_id,
                    batch_id: res.data.batch_id,
                    batch_code: res.data.batch_code,
                    batch_name: res.data.batch_name,
                    stage_name: res.data.stage_name,
                    operation_name: res.data.operation_name,
                    planned_start_datetime: res.data.planned_start_datetime,
                    planned_end_datetime: res.data.planned_end_datetime,
                    planned_duration: res.data.planned_duration,
                    window_start_datetime: res.data.window_start_datetime,
                    window_end_datetime: res.data.window_end_datetime,
                    required_people: res.data.required_people,
                    is_locked: Boolean(res.data.is_locked),
                    assigned_personnel: res.data.assigned_personnel?.map((p, idx) => ({
                        employee_id: p.employee_id,
                        employee_name: p.employee_name,
                        employee_code: p.employee_code,
                        position: idx + 1,
                        is_primary: Boolean(p.is_primary)
                    }))
                };
                setEditingOperationDetail(detail);
                setEditModalVisible(true);
            })
            .catch(err => {
                console.error('Failed to load operation detail', err);
                message.error('加载操作详情失败');
            });
    }, [ganttData]);

    // 处理编辑弹窗保存
    const handleEditModalSave = useCallback(async (
        updates: Partial<BatchOperationDetail> & { personnel?: { position: number; employee_id: number }[] }
    ) => {
        if (!editingOperationDetail) return;

        // 保存时间更新
        const scheduleUpdates: any = {};
        if (updates.planned_start_datetime) scheduleUpdates.planned_start_datetime = updates.planned_start_datetime;
        if (updates.planned_end_datetime) scheduleUpdates.planned_end_datetime = updates.planned_end_datetime;
        if (updates.window_start_datetime !== undefined) scheduleUpdates.window_start_datetime = updates.window_start_datetime;
        if (updates.window_end_datetime !== undefined) scheduleUpdates.window_end_datetime = updates.window_end_datetime;
        if (updates.required_people !== undefined) scheduleUpdates.required_people = updates.required_people;
        if (updates.notes !== undefined) scheduleUpdates.notes = updates.notes;

        if (Object.keys(scheduleUpdates).length > 0) {
            await axios.put(
                `/api/calendar/operations/${editingOperationDetail.operation_plan_id}/schedule`,
                scheduleUpdates
            );
        }

        // 保存人员分配
        if (updates.personnel && updates.personnel.length > 0) {
            await axios.post(
                `/api/calendar/operations/${editingOperationDetail.operation_plan_id}/assign`,
                { employee_ids: updates.personnel.map(p => p.employee_id) }
            );
        }

        // 刷新数据
        loadOperations();
    }, [editingOperationDetail, loadOperations]);

    // 提交人员分配
    const handleAssignSubmit = useCallback(async () => {
        if (!selectedOperation) return;

        setAssignSubmitting(true);
        try {
            await axios.post(`/api/calendar/operations/${selectedOperation.operation_plan_id}/assign`, {
                employee_ids: assignSelectedIds
            });
            message.success('人员分配成功');
            setAssignDrawerVisible(false);
            loadOperations(); // 刷新数据
        } catch (err: any) {
            const msg = err?.response?.data?.error || '人员分配失败';
            message.error(msg);
        } finally {
            setAssignSubmitting(false);
        }
    }, [selectedOperation, assignSelectedIds, loadOperations]);

    // 处理拖动结束 - 支持移动操作和调整窗口时间
    const handleDragEnd = useCallback(async (
        scheduleId: number,
        stageId: number,
        updates: Partial<{
            operation_day: number;
            recommended_time: number;
            window_start_time: number;
            window_start_day_offset: number;
            window_end_time: number;
            window_end_day_offset: number;
            stage_start_day: number;
        }>
    ) => {
        // 找到对应的操作
        const operation = ganttData?.operationMap.get(scheduleId);
        if (!operation || !ganttData) return;

        // 构建 API 请求参数
        const requestBody: {
            planned_start_datetime?: string;
            planned_end_datetime?: string;
            window_start_datetime?: string | null;
            window_end_datetime?: string | null;
        } = {};

        // 处理移动操作（更新计划时间）
        // useGanttDrag 现在传递 stage_start_day，可以正确反算绝对天数
        // absoluteDay = stage_start_day + operation_day
        if (updates.operation_day !== undefined && updates.recommended_time !== undefined) {
            const stageStartDay = updates.stage_start_day ?? 0;
            const absoluteDay = stageStartDay + updates.operation_day;
            const newHour = Math.floor(updates.recommended_time);
            const newMinute = Math.round((updates.recommended_time - newHour) * 60);
            const newPlannedStart = baseDate.add(absoluteDay, 'day').hour(newHour).minute(newMinute).second(0);
            const duration = operation.planned_duration;
            const effectiveDuration = Math.max(duration, 1);
            const newPlannedEnd = newPlannedStart.add(effectiveDuration, 'hour');

            requestBody.planned_start_datetime = newPlannedStart.format('YYYY-MM-DD HH:mm:ss');
            requestBody.planned_end_datetime = newPlannedEnd.format('YYYY-MM-DD HH:mm:ss');
        }

        // 处理窗口开始时间调整（resize-start）
        if (updates.window_start_time !== undefined) {
            // 计算操作的绝对天数
            const opStartTime = dayjs(operation.planned_start_datetime);
            const opDayFromBase = opStartTime.startOf('day').diff(baseDate, 'day');
            const windowStartDayOffset = updates.window_start_day_offset ?? 0;
            const windowStartAbsoluteDay = opDayFromBase + windowStartDayOffset;
            const windowStartHour = Math.floor(updates.window_start_time);
            const windowStartMinute = Math.round((updates.window_start_time - windowStartHour) * 60);
            const newWindowStart = baseDate.add(windowStartAbsoluteDay, 'day')
                .hour(windowStartHour).minute(windowStartMinute).second(0);

            requestBody.window_start_datetime = newWindowStart.format('YYYY-MM-DD HH:mm:ss');
        }

        // 处理窗口结束时间调整（resize-end）
        if (updates.window_end_time !== undefined) {
            const opStartTime = dayjs(operation.planned_start_datetime);
            const opDayFromBase = opStartTime.startOf('day').diff(baseDate, 'day');
            const windowEndDayOffset = updates.window_end_day_offset ?? 0;
            const windowEndAbsoluteDay = opDayFromBase + windowEndDayOffset;
            const windowEndHour = Math.floor(updates.window_end_time);
            const windowEndMinute = Math.round((updates.window_end_time - windowEndHour) * 60);
            const newWindowEnd = baseDate.add(windowEndAbsoluteDay, 'day')
                .hour(windowEndHour).minute(windowEndMinute).second(0);

            requestBody.window_end_datetime = newWindowEnd.format('YYYY-MM-DD HH:mm:ss');
        }

        // 如果既没有计划时间更新也没有窗口更新，直接返回
        if (Object.keys(requestBody).length === 0) {
            return;
        }

        // 将更改添加到待保存队列（不立即调用 API）
        setPendingChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(scheduleId) || {};
            next.set(scheduleId, { ...existing, ...requestBody });
            return next;
        });

        // 同步更新本地 operations 状态，触发 ganttData 重新计算
        // 确保后续拖拽使用最新数据
        setOperations(prev => prev.map(op =>
            op.operation_plan_id === scheduleId
                ? {
                    ...op,
                    planned_start_datetime: requestBody.planned_start_datetime ?? op.planned_start_datetime,
                    planned_end_datetime: requestBody.planned_end_datetime ?? op.planned_end_datetime,
                    window_start_datetime: requestBody.window_start_datetime !== undefined
                        ? requestBody.window_start_datetime
                        : op.window_start_datetime,
                    window_end_datetime: requestBody.window_end_datetime !== undefined
                        ? requestBody.window_end_datetime
                        : op.window_end_datetime,
                }
                : op
        ));

        message.info('已修改，请点击保存确认');
    }, [ganttData, baseDate]);

    // 过滤推荐人员
    const filteredCandidates = useMemo(() => {
        if (!assignSearch.trim()) return assignCandidates;
        const keyword = assignSearch.toLowerCase();
        return assignCandidates.filter(p =>
            p.employee_name.toLowerCase().includes(keyword) ||
            p.employee_code.toLowerCase().includes(keyword)
        );
    }, [assignCandidates, assignSearch]);

    // 批量确认保存所有待保存的更改
    const handleConfirmSave = useCallback(async () => {
        if (pendingChanges.size === 0) {
            message.info('没有需要保存的更改');
            return;
        }

        setLoading(true);
        const totalCount = pendingChanges.size;
        let successCount = 0;
        const errors: string[] = [];

        try {
            // 并行保存所有待保存的更改
            const promises = Array.from(pendingChanges.entries()).map(
                async ([scheduleId, changes]) => {
                    try {
                        await axios.put(`/api/calendar/operations/${scheduleId}/schedule`, changes);
                        successCount++;
                    } catch (err: any) {
                        const msg = err?.response?.data?.error || `操作 ${scheduleId} 保存失败`;
                        errors.push(msg);
                    }
                }
            );
            await Promise.all(promises);

            if (errors.length === 0) {
                setPendingChanges(new Map()); // 清空待保存队列
                message.success(`已成功保存 ${successCount} 项更改`);
            } else {
                message.warning(`保存完成：${successCount}/${totalCount} 成功，${errors.length} 失败`);
                console.error('Save errors:', errors);
            }
        } catch (err: any) {
            message.error('批量保存失败，请重试');
        } finally {
            setLoading(false);
        }
    }, [pendingChanges]);

    // 默认返回操作
    const handleBack = useCallback(() => {
        if (onBack) {
            onBack();
        }
    }, [onBack]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 工具栏 */}
            <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#fff',
                flexWrap: 'wrap'
            }}>
                <TeamOutlined style={{ fontSize: 18, color: '#2563EB' }} />
                <span style={{ fontWeight: 600, fontSize: 16 }}>批次甘特图</span>
                <Select
                    mode="multiple"
                    size="small"
                    placeholder="选择批次状态"
                    value={selectedStatuses}
                    onChange={handleStatusChange}
                    style={{ minWidth: 200 }}
                    options={STATUS_OPTIONS.map(opt => ({
                        value: opt.value,
                        label: <Tag color={opt.color} style={{ margin: 0 }}>{opt.label}</Tag>
                    }))}
                    maxTagCount={2}
                    allowClear={false}
                />
                <Button
                    size="small"
                    icon={<SyncOutlined spin={loading} />}
                    onClick={loadOperations}
                    disabled={loading}
                >
                    刷新
                </Button>
                <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setAddIndependentModalVisible(true)}
                >
                    添加独立操作
                </Button>
                {operations.length > 0 && (
                    <Tag color="blue">{operations.length} 个操作</Tag>
                )}
            </div>

            {/* 主内容区 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <Spin size="large" />
                        <p>加载中...</p>
                    </div>
                )}

                {error && (
                    <Alert type="error" message={error} showIcon style={{ margin: 16 }} />
                )}

                {!loading && !error && ganttData && (
                    <ProcessTemplateGantt
                        template={ganttData.template}
                        onBack={handleBack}
                        externalData={ganttData.externalData}
                        onOperationClick={handleOperationClick}
                        onCustomDragEnd={handleDragEnd}
                        readOnlyOperations={ganttData.readOnlyOperationIds}
                        externalIsDirty={isDirty}
                        onExternalSave={handleConfirmSave}
                        externalConstraints={batchConstraints}
                    />
                )}

                {!loading && !error && operations.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <p>暂无符合筛选条件的批次操作</p>
                    </div>
                )}
            </div>

            {/* 人员分配抽屉 */}
            <Drawer
                title={selectedOperation ? `分配人员 - ${selectedOperation.operation_name}` : '分配人员'}
                open={assignDrawerVisible}
                onClose={() => setAssignDrawerVisible(false)}
                width={480}
                extra={
                    <Space>
                        <Button onClick={() => setAssignDrawerVisible(false)}>取消</Button>
                        <Button
                            type="primary"
                            onClick={handleAssignSubmit}
                            loading={assignSubmitting}
                        >
                            确认分配
                        </Button>
                    </Space>
                }
            >
                {operationDetailLoading ? (
                    <Spin />
                ) : operationDetail && (
                    <>
                        <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="需求人数">{operationDetail.required_people}</Descriptions.Item>
                            <Descriptions.Item label="已分配">{operationDetail.assigned_people}</Descriptions.Item>
                            <Descriptions.Item label="开始时间">
                                {dayjs(operationDetail.planned_start_datetime).format('MM/DD HH:mm')}
                            </Descriptions.Item>
                            <Descriptions.Item label="结束时间">
                                {dayjs(operationDetail.planned_end_datetime).format('MM/DD HH:mm')}
                            </Descriptions.Item>
                        </Descriptions>

                        {operationDetail.assigned_personnel?.length > 0 && (
                            <>
                                <div style={{ marginBottom: 8, fontWeight: 500 }}>已分配人员</div>
                                <List
                                    size="small"
                                    dataSource={operationDetail.assigned_personnel}
                                    renderItem={p => (
                                        <List.Item>
                                            <span>{p.employee_name} ({p.employee_code})</span>
                                            {p.is_primary && <Tag color="blue">主要</Tag>}
                                        </List.Item>
                                    )}
                                    style={{ marginBottom: 16 }}
                                />
                            </>
                        )}
                    </>
                )}

                <div style={{ marginBottom: 8, fontWeight: 500 }}>推荐人员</div>
                <Input.Search
                    placeholder="搜索员工姓名或编号"
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    style={{ marginBottom: 12 }}
                />

                {assignLoading ? (
                    <Spin />
                ) : (
                    <Checkbox.Group
                        value={assignSelectedIds}
                        onChange={vals => setAssignSelectedIds(vals as number[])}
                        style={{ display: 'block' }}
                    >
                        <List
                            size="small"
                            dataSource={filteredCandidates}
                            renderItem={p => (
                                <List.Item>
                                    <Checkbox value={p.employee_id}>
                                        <Space>
                                            <span>{p.employee_name} ({p.employee_code})</span>
                                            <Tag color={p.match_score >= 80 ? 'green' : p.match_score >= 50 ? 'orange' : 'default'}>
                                                匹配 {p.match_score}%
                                            </Tag>
                                            {p.has_conflict && <Tag color="red">冲突</Tag>}
                                        </Space>
                                    </Checkbox>
                                </List.Item>
                            )}
                        />
                    </Checkbox.Group>
                )}
            </Drawer>

            {/* 批次操作编辑弹窗 */}
            <BatchOperationEditModal
                visible={editModalVisible}
                operation={editingOperationDetail}
                onClose={() => {
                    setEditModalVisible(false);
                    setEditingOperationDetail(null);
                }}
                onSave={handleEditModalSave}
            />

            {/* 独立操作添加弹窗 */}
            <AddIndependentOperationModal
                visible={addIndependentModalVisible}
                onClose={() => setAddIndependentModalVisible(false)}
                onSuccess={loadOperations}
            />
        </div>
    );
};

export default BatchGanttAdapter;
