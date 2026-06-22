import dayjs, { Dayjs } from 'dayjs';
import type {
    GanttDependency as WxbGanttDependency,
    GanttGroup,
    GanttLink,
    GanttTask,
    YAxisMode,
} from '../../wxb-ui/GanttChart/types';
import { STAGE_COLORS } from '../../ProcessTemplateGantt/constants';
import type {
    GanttBatch,
    GanttDependency,
    GanttOperation,
    GanttShareGroup,
} from './types';

const COLOR_KEYS = ['STAGE1', 'STAGE2', 'STAGE3', 'STAGE4', 'STAGE5', 'DEFAULT'] as const;

/**
 * operations.description 在当前数据里多被用作导入溯源字段：要么是整段 JSON 元数据
 * （{"source":...,"raw_text":...}），要么是 "Bulk Import" 占位串，都不是给人看的描述。
 * 这里只放行真正的自由文本描述，其余归一成 null，避免浮窗里出现一坨 JSON。
 */
function cleanOperationDescription(raw: string | null | undefined): string | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;
    if (text.startsWith('{') || text.startsWith('[')) return null;
    if (text.toLowerCase() === 'bulk import') return null;
    return text;
}

export interface BatchGanttModel {
    tasks: GanttTask[];
    groups: GanttGroup[];
    dependencies: WxbGanttDependency[];
    links: GanttLink[];
    operationByTaskId: Map<string, GanttOperation>;
    operationTaskIds: Set<string>;
    operationCount: number;
    stageCount: number;
}

export interface BatchGanttRenderModel {
    tasks: GanttTask[];
    groups: GanttGroup[];
    dependencies: WxbGanttDependency[];
    links: GanttLink[];
}

type ResourceTaskUpdate = {
    groupId: string;
    conflictType?: 'OVERLAP';
    color?: string;
    label?: string;
    renderOnGroupRow?: boolean;
};

export const toOperationTaskId = (operationId: number): string => `batch-operation-${operationId}`;
export const toBatchGroupId = (batchId: number): string => `batch-${batchId}`;
export const toStageGroupId = (batchId: number, stageId: number): string => `batch-${batchId}-stage-${stageId}`;

export function getBatchDateExtent(batches: GanttBatch[]): { start: Dayjs; end: Dayjs } | null {
    let start: Dayjs | null = null;
    let end: Dayjs | null = null;

    batches.forEach((batch) => {
        const batchStart = dayjs(batch.startDate);
        const batchEnd = dayjs(batch.endDate);

        if (!start || batchStart.isBefore(start)) {
            start = batchStart;
        }
        if (!end || batchEnd.isAfter(end)) {
            end = batchEnd;
        }
    });

    if (!start || !end) {
        return null;
    }

    return { start, end };
}

export function toHourOffset(origin: Dayjs, value: string): number {
    return dayjs(value).diff(origin, 'hour', true);
}

export function hourOffsetToDate(origin: Dayjs, hour: number): Dayjs {
    return origin.add(hour, 'hour');
}

export function buildBatchGanttModel(
    batches: GanttBatch[],
    rawDependencies: GanttDependency[],
    shareGroups: GanttShareGroup[],
    origin: Dayjs,
): BatchGanttModel {
    const tasks: GanttTask[] = [];
    const groups: GanttGroup[] = [];
    const operationByTaskId = new Map<string, GanttOperation>();
    const operationTaskIds = new Set<string>();
    let stageCount = 0;

    batches.forEach((batch, batchIndex) => {
        const batchColor = pickColor(batchIndex);
        const batchGroupId = toBatchGroupId(batch.id);

        groups.push({
            id: batchGroupId,
            label: `${batch.code} ${batch.name}`.trim(),
            type: 'batch',
            color: batchColor,
        });

        batch.stages.forEach((stage, stageIndex) => {
            stageCount += 1;
            const stageColor = pickColor(batchIndex + stageIndex + 1);
            const stageGroupId = toStageGroupId(batch.id, stage.id);

            groups.push({
                id: stageGroupId,
                parentId: batchGroupId,
                label: stage.name,
                type: 'stage',
                color: stageColor,
            });

            stage.operations
                .forEach((operation) => {
                    const taskId = toOperationTaskId(operation.id);
                    const start = toHourOffset(origin, operation.startDate);
                    const end = toHourOffset(origin, operation.endDate);
                    const windowStart = operation.windowStartDate
                        ? toHourOffset(origin, operation.windowStartDate)
                        : undefined;
                    const windowEnd = operation.windowEndDate
                        ? toHourOffset(origin, operation.windowEndDate)
                        : undefined;

                    operationByTaskId.set(taskId, {
                        ...operation,
                        batch_id: batch.id,
                    });
                    operationTaskIds.add(taskId);

                    tasks.push({
                        id: taskId,
                        label: operation.name,
                        start,
                        end: Math.max(end, start + 0.25),
                        groupId: stageGroupId,
                        color: stageColor,
                        progress: operation.progress,
                        status: getOperationStatusLabel(operation.status),
                        type: 'operation',
                        draggable: true,
                        // Duration is fixed by the domain model; operations move but
                        // never resize on the batch gantt (no resize handler wired).
                        requiredPeople: operation.requiredPeople,
                        assignedPeople: operation.assignedPeople,
                        personnelAssignments: operation.personnelAssignments,
                        windowStart,
                        windowEnd,
                        data: {
                            operationId: operation.id,
                            templateScheduleId: operation.templateScheduleId ?? null,
                            description: cleanOperationDescription(operation.description),
                            batchId: batch.id,
                            batchCode: batch.code,
                            stageId: stage.id,
                            stageName: stage.name,
                            resourceNodeId: operation.resourceNodeId ?? null,
                            resourceName: operation.resourceName ?? null,
                            resourceNodeClass: operation.resourceNodeClass ?? null,
                            resourceSystemType: operation.resourceSystemType ?? null,
                            resourceEquipmentClass: operation.resourceEquipmentClass ?? null,
                            displayStart: dayjs(operation.startDate).format('YYYY-MM-DD HH:mm'),
                            displayEnd: dayjs(operation.endDate).format('YYYY-MM-DD HH:mm'),
                        },
                    });
                });
        });
    });

    return {
        tasks,
        groups,
        dependencies: toWxbDependencies(rawDependencies, operationTaskIds),
        links: toWxbLinks(shareGroups, operationTaskIds),
        operationByTaskId,
        operationTaskIds,
        operationCount: tasks.length,
        stageCount,
    };
}

export function buildBatchGanttRenderModel(
    model: BatchGanttModel,
    yAxisMode: YAxisMode,
    showTimeWindows: boolean,
): BatchGanttRenderModel {
    const tasks = showTimeWindows
        ? model.tasks
        : model.tasks.map((task) => ({
            ...task,
            windowStart: undefined,
            windowEnd: undefined,
        }));

    if (yAxisMode === 'operation') {
        return {
            tasks,
            groups: model.groups,
            dependencies: model.dependencies,
            links: model.links,
        };
    }

    const result = yAxisMode === 'stage-equipment'
        ? buildStageEquipmentView(model.groups, tasks)
        : buildEquipmentView(tasks);

    return {
        tasks: tasks
            .map((task) => {
                const update = result.taskUpdates.get(task.id);
                if (!update) {
                    return task.type === 'timeWindow' ? null : task;
                }
                return {
                    ...task,
                    groupId: update.groupId,
                    conflictType: update.conflictType ?? task.conflictType,
                    color: update.color ?? task.color,
                    label: update.label ?? task.label,
                    renderOnGroupRow: update.renderOnGroupRow ?? task.renderOnGroupRow,
                };
            })
            .filter(Boolean) as GanttTask[],
        groups: result.groups,
        dependencies: [],
        links: model.links,
    };
}

function pickColor(index: number): string {
    return STAGE_COLORS[COLOR_KEYS[index % COLOR_KEYS.length]] || STAGE_COLORS.DEFAULT;
}

function getOperationStatusLabel(status: string): string {
    switch (status) {
        case 'COMPLETED':
            return '人员已满足';
        case 'READY':
            return '已激活';
        case 'PENDING':
            return '待确认';
        default:
            return status;
    }
}

function normalizeDependencyType(type: string): WxbGanttDependency['type'] {
    const normalized = String(type).toUpperCase();
    switch (normalized) {
        case '2':
        case 'SS':
        case 'START_TO_START':
            return 'SS';
        case '3':
        case 'FF':
        case 'FINISH_TO_FINISH':
            return 'FF';
        case '4':
        case 'SF':
        case 'START_TO_FINISH':
            return 'SF';
        case '1':
        case 'FS':
        case 'FINISH_TO_START':
        default:
            return 'FS';
    }
}

function toWxbDependencies(
    dependencies: GanttDependency[],
    operationTaskIds: Set<string>,
): WxbGanttDependency[] {
    return dependencies
        .map((dependency) => ({
            id: `batch-dependency-${dependency.id}`,
            from: toOperationTaskId(dependency.from),
            to: toOperationTaskId(dependency.to),
            type: normalizeDependencyType(dependency.type),
            label: dependency.type,
        }))
        .filter((dependency) => operationTaskIds.has(dependency.from) && operationTaskIds.has(dependency.to));
}

function toWxbLinks(
    shareGroups: GanttShareGroup[],
    operationTaskIds: Set<string>,
): GanttLink[] {
    return shareGroups
        .map((shareGroup) => {
            const taskIds = shareGroup.member_operation_ids
                .map(toOperationTaskId)
                .filter((taskId) => operationTaskIds.has(taskId));

            return {
                id: `batch-share-${shareGroup.id}`,
                taskIds,
                label: shareGroup.group_name,
                shareMode: shareGroup.share_mode === 'DIFFERENT_PEOPLE' ? 'DIFFERENT' : 'SAME_TEAM',
            } satisfies GanttLink;
        })
        .filter((link) => link.taskIds.length >= 2);
}

function getTaskData<T>(task: GanttTask, key: string): T | null {
    const value = task.data?.[key];
    return value === undefined || value === null ? null : value as T;
}

function getResourceKey(task: GanttTask): string {
    const resourceNodeId = getTaskData<number>(task, 'resourceNodeId');
    return Number.isFinite(Number(resourceNodeId)) && Number(resourceNodeId) > 0
        ? `equip-${Number(resourceNodeId)}`
        : 'unbound';
}

function getResourceLabel(task: GanttTask, taskCount?: number): string {
    const resourceName = getTaskData<string>(task, 'resourceName');
    if (!resourceName) {
        return taskCount ? `[未绑定] 设备 (${taskCount})` : '[未绑定] 设备';
    }

    const systemType = getTaskData<string>(task, 'resourceSystemType');
    const equipmentClass = getTaskData<string>(task, 'resourceEquipmentClass');
    const suffix = [systemType, equipmentClass].filter(Boolean).join(' · ');
    return suffix ? `${resourceName} (${suffix})` : resourceName;
}

function splitIntoLayers(tasks: GanttTask[]): GanttTask[][] {
    if (tasks.length === 0) {
        return [];
    }
    if (tasks.length === 1) {
        return [tasks];
    }

    const sorted = [...tasks].sort((a, b) => a.start - b.start || a.end - b.end);
    const layers: Array<{ end: number; tasks: GanttTask[] }> = [];

    sorted.forEach((task) => {
        const targetLayer = layers.find((layer) => layer.end <= task.start);
        if (targetLayer) {
            targetLayer.end = task.end;
            targetLayer.tasks.push(task);
            return;
        }

        layers.push({ end: task.end, tasks: [task] });
    });

    return layers.map((layer) => layer.tasks);
}

function findOverlappingTaskIds(tasks: GanttTask[]): Set<string> {
    const overlapping = new Set<string>();
    for (let i = 0; i < tasks.length; i += 1) {
        for (let j = i + 1; j < tasks.length; j += 1) {
            const a = tasks[i];
            const b = tasks[j];
            if (a.start < b.end && b.start < a.end) {
                overlapping.add(a.id);
                overlapping.add(b.id);
            }
        }
    }
    return overlapping;
}

function assignTasksToResourceRows(
    parentGroupId: string,
    tasks: GanttTask[],
    taskUpdates: Map<string, ResourceTaskUpdate>,
    options: { color: string; labelWithBatch?: boolean },
) {
    const layers = splitIntoLayers(tasks);
    const overlappingTaskIds = findOverlappingTaskIds(tasks);

    layers.forEach((layerTasks, index) => {
        const laneGroupId = `${parentGroupId}__lane-${index + 1}`;
        layerTasks.forEach((task) => {
            taskUpdates.set(task.id, {
                groupId: laneGroupId,
                conflictType: overlappingTaskIds.has(task.id) ? 'OVERLAP' : undefined,
                color: task.color ?? options.color,
                label: formatResourceTaskLabel(task, options.labelWithBatch),
                renderOnGroupRow: true,
            });
        });
    });
    return layers.length;
}

function formatResourceTaskLabel(task: GanttTask, labelWithBatch?: boolean): string {
    if (!labelWithBatch) {
        return task.label;
    }
    const batchCode = getTaskData<string>(task, 'batchCode');
    return batchCode ? `${batchCode} · ${task.label}` : task.label;
}

function buildStageEquipmentView(
    sourceGroups: GanttGroup[],
    tasks: GanttTask[],
): { groups: GanttGroup[]; taskUpdates: Map<string, ResourceTaskUpdate> } {
    const groups: GanttGroup[] = [];
    const taskUpdates = new Map<string, ResourceTaskUpdate>();
    const operationTasks = tasks.filter((task) => task.type !== 'timeWindow');

    sourceGroups
        .filter((group) => group.type === 'batch')
        .forEach((batchGroup) => {
            groups.push({ ...batchGroup, showSummaryBar: true });

            sourceGroups
                .filter((stageGroup) => stageGroup.parentId === batchGroup.id)
                .forEach((stageGroup) => {
                    const stageTasks = operationTasks.filter((task) => task.groupId === stageGroup.id);
                    if (stageTasks.length === 0) {
                        return;
                    }

                    const resourceStageGroupId = `${stageGroup.id}__resource`;
                    groups.push({
                        ...stageGroup,
                        id: resourceStageGroupId,
                        parentId: batchGroup.id,
                        showSummaryBar: true,
                    });

                    const byEquipment = new Map<string, GanttTask[]>();
                    stageTasks.forEach((task) => {
                        const key = getResourceKey(task);
                        const current = byEquipment.get(key) ?? [];
                        current.push(task);
                        byEquipment.set(key, current);
                    });

                    Array.from(byEquipment.entries()).forEach(([resourceKey, resourceTasks]) => {
                        const isUnbound = resourceKey === 'unbound';
                        const resourceGroupId = `${resourceStageGroupId}__${resourceKey}`;
                        const color = isUnbound ? 'var(--wx-fg-4)' : (stageGroup.color ?? batchGroup.color ?? 'var(--wx-blue-700)');

                        groups.push({
                            id: resourceGroupId,
                            parentId: resourceStageGroupId,
                            label: getResourceLabel(resourceTasks[0]),
                            color,
                            type: 'equipment',
                            showSummaryBar: true,
                        });

                        const laneCount = assignTasksToResourceRows(resourceGroupId, resourceTasks, taskUpdates, { color });
                        for (let i = 0; i < laneCount; i += 1) {
                            groups.push({
                                id: `${resourceGroupId}__lane-${i + 1}`,
                                parentId: resourceGroupId,
                                label: `轨道 ${i + 1}`,
                                color,
                                showSummaryBar: false,
                                isSubRow: true,
                            });
                        }
                    });
                });
        });

    return { groups, taskUpdates };
}

function buildEquipmentView(
    tasks: GanttTask[],
): { groups: GanttGroup[]; taskUpdates: Map<string, ResourceTaskUpdate> } {
    const groups: GanttGroup[] = [];
    const taskUpdates = new Map<string, ResourceTaskUpdate>();
    const byEquipment = new Map<string, GanttTask[]>();

    tasks
        .filter((task) => task.type !== 'timeWindow')
        .forEach((task) => {
            const key = getResourceKey(task);
            const current = byEquipment.get(key) ?? [];
            current.push(task);
            byEquipment.set(key, current);
        });

    Array.from(byEquipment.entries()).forEach(([resourceKey, resourceTasks]) => {
        const isUnbound = resourceKey === 'unbound';
        const resourceGroupId = `resource-${resourceKey}`;
        const color = isUnbound ? 'var(--wx-fg-4)' : 'var(--wx-blue-800)';

        groups.push({
            id: resourceGroupId,
            label: getResourceLabel(resourceTasks[0], resourceTasks.length),
            color,
            type: 'equipment',
            showSummaryBar: true,
        });

        const laneCount = assignTasksToResourceRows(resourceGroupId, resourceTasks, taskUpdates, {
            color,
            labelWithBatch: true,
        });
        for (let i = 0; i < laneCount; i += 1) {
            groups.push({
                id: `${resourceGroupId}__lane-${i + 1}`,
                parentId: resourceGroupId,
                label: `轨道 ${i + 1}`,
                color,
                showSummaryBar: false,
                isSubRow: true,
            });
        }
    });

    return { groups, taskUpdates };
}
