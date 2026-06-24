import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import {
    WxbButton,
    WxbEmpty,
    WxbGanttChart,
    WxbIcon,
    WxbRangePicker,
    WxbSegmented,
    WxbSpinner,
    WxbSwitch,
    WxbTag,
    WxbTooltip,
    wxbToast,
} from '../../wxb-ui';
import type { GanttTask, YAxisMode, GanttContextActionContext } from '../../wxb-ui/GanttChart/types';
import { DEFAULT_BG_MENU_ITEMS, DEFAULT_GROUP_MENU_ITEMS, type ContextMenuItem } from '../../wxb-ui/GanttChart/GanttContextMenu';
import EditOperationModal from './EditOperationModal';
import CreateIndependentOperationModal, { type CreateOpPrefill } from './CreateIndependentOperationModal';
import type { DatePreset, GanttBatch, GanttDependency, GanttOperation, GanttShareGroup } from './types';
import {
    baseOperationTaskId,
    buildBatchGanttModel,
    buildBatchGanttRenderModel,
    getBatchDateExtent,
    hourOffsetToDate,
} from './batchGanttAdapter';
import { usePeakPersonnelV4 } from './hooks/usePeakPersonnelV4';
import './BatchGanttWxb.css';

const AUTOFIT_PROBE_MONTHS = 12;
const GANTT_FROM_PARAM = 'gantt_from';
const GANTT_TO_PARAM = 'gantt_to';
const BATCH_STATUS_FILTER = 'DRAFT,ACTIVATED,PLANNED';

const DATE_PRESET_OPTIONS: Array<{ label: string; value: DatePreset }> = [
    { label: '本周', value: 'thisWeek' },
    { label: '2周', value: 'next2Weeks' },
    { label: '本月', value: 'thisMonth' },
    { label: '3月', value: 'next3Months' },
    { label: '适应数据', value: 'autoFit' },
];

const Y_AXIS_OPTIONS: Array<{ label: string; value: YAxisMode }> = [
    { label: '操作', value: 'operation' },
    { label: '阶段·设备', value: 'stage-equipment' },
    { label: '设备', value: 'equipment' },
];

interface BatchGanttV4Props {
    filteredBatchIds?: number[];
    onCreateBatch?: () => void;
}

function readDateFromUrl(param: string): Dayjs | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const value = new URLSearchParams(window.location.search).get(param);
    if (!value) {
        return null;
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
}

function writeDatesToUrl(from: Dayjs, to: Dayjs) {
    if (typeof window === 'undefined') {
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(GANTT_FROM_PARAM, from.format('YYYY-MM-DD'));
    url.searchParams.set(GANTT_TO_PARAM, to.format('YYYY-MM-DD'));
    window.history.replaceState(null, '', url.toString());
}

function getInitialDates(): { start: Dayjs; end: Dayjs; fromUrl: boolean } {
    const urlFrom = readDateFromUrl(GANTT_FROM_PARAM);
    const urlTo = readDateFromUrl(GANTT_TO_PARAM);

    if (urlFrom && urlTo && urlTo.isAfter(urlFrom)) {
        return { start: urlFrom.startOf('day'), end: urlTo.endOf('day'), fromUrl: true };
    }

    return {
        start: dayjs().startOf('week'),
        end: dayjs().add(4, 'week').endOf('week'),
        fromUrl: false,
    };
}

function computeDatePreset(preset: Exclude<DatePreset, 'autoFit'>): { start: Dayjs; end: Dayjs } {
    const today = dayjs();
    switch (preset) {
        case 'thisWeek':
            return { start: today.startOf('week'), end: today.endOf('week') };
        case 'next2Weeks':
            return { start: today.startOf('week'), end: today.add(2, 'week').endOf('week') };
        case 'thisMonth':
            return { start: today.startOf('month'), end: today.endOf('month') };
        case 'next3Months':
            return { start: today.startOf('week'), end: today.add(3, 'month').endOf('week') };
    }
}

function formatApiDate(value: Dayjs): string {
    return value.format('YYYY-MM-DD HH:mm:ss');
}

// "新增操作" (add an independent op at the clicked point) is offered on every right-click
// surface so "在哪点就在哪加" holds: on a task bar, on a stage/equipment lane row, and on
// empty background. Every lane in this gantt is a group row, so without the group entry a
// right-click on a populated equipment lane would only show the group menu.
const ADD_OP_ITEM: ContextMenuItem = { key: 'add-task', label: '新增操作' };

const TASK_MENU_ITEMS: ContextMenuItem[] = [
    { key: 'edit', label: '编辑操作' },
    { ...ADD_OP_ITEM, divider: true },
];

const GROUP_MENU_ITEMS: ContextMenuItem[] = [
    { ...ADD_OP_ITEM, divider: true },
    ...DEFAULT_GROUP_MENU_ITEMS,
];

// Background (right-click empty area) menu — reuse the shared default but relabel the
// generic "新建任务" to the domain term. The 'add-task' action is routed via
// onContextAction below; the other items (expand/collapse/select) are handled inside
// the gantt itself.
const BG_MENU_ITEMS: ContextMenuItem[] = DEFAULT_BG_MENU_ITEMS.map((item) =>
    item.key === 'add-task' ? { ...item, label: '新增操作' } : item,
);

// Match a render task that lives in (or under) the clicked group, with separator-safe
// prefix boundaries so clicking batch "batch-5" never samples a task from "batch-50".
const taskBelongsToGroup = (taskGroupId: string | undefined, clickedGroupId: string): boolean => {
    if (!taskGroupId) return false;
    return taskGroupId === clickedGroupId
        || taskGroupId.startsWith(`${clickedGroupId}-`)
        || taskGroupId.startsWith(`${clickedGroupId}__`);
};

const BatchGanttV4: React.FC<BatchGanttV4Props> = ({ filteredBatchIds, onCreateBatch }) => {
    const navigate = useNavigate();
    const initialDates = useMemo(getInitialDates, []);
    const [startDate, setStartDate] = useState(initialDates.start);
    const [endDate, setEndDate] = useState(initialDates.end);
    const [yAxisMode, setYAxisMode] = useState<YAxisMode>('stage-equipment');
    const [showTimeWindows, setShowTimeWindows] = useState(false);
    const [hasUserInteracted, setHasUserInteracted] = useState(initialDates.fromUrl);
    const [hasAutoFit, setHasAutoFit] = useState(false);
    const [reloadVersion, setReloadVersion] = useState(0);

    const [batches, setBatches] = useState<GanttBatch[]>([]);
    const [dependencies, setDependencies] = useState<GanttDependency[]>([]);
    const [shareGroups, setShareGroups] = useState<GanttShareGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingOperation, setEditingOperation] = useState<GanttOperation | null>(null);
    const [createOpOpen, setCreateOpOpen] = useState(false);
    const [createOpPrefill, setCreateOpPrefill] = useState<CreateOpPrefill | null>(null);
    const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasExplicitBatchFilter = filteredBatchIds !== undefined;
    const filterBatchIdsKey = useMemo(
        () => (filteredBatchIds ? filteredBatchIds.join(',') : ''),
        [filteredBatchIds],
    );
    const filteredBatchIdSet = useMemo(
        () => new Set(filteredBatchIds ?? []),
        [filteredBatchIds],
    );

    const originDate = useMemo(() => startDate.startOf('day'), [startDate]);
    const model = useMemo(
        () => buildBatchGanttModel(batches, dependencies, shareGroups, originDate),
        [batches, dependencies, shareGroups, originDate],
    );
    const renderModel = useMemo(
        () => buildBatchGanttRenderModel(model, yAxisMode, showTimeWindows),
        [model, showTimeWindows, yAxisMode],
    );
    const dailyPeaks = usePeakPersonnelV4(batches, shareGroups, startDate, endDate);

    const rangeHours = useMemo(
        () => Math.max(24, endDate.endOf('day').diff(originDate, 'hour', true)),
        [endDate, originDate],
    );
    const personnelPeaks = useMemo(() => {
        const peaks = new Map<number, { peak: number; peakHour: number }>();

        dailyPeaks.forEach((dailyPeak) => {
            if (dailyPeak.peak <= 0) {
                return;
            }

            const dayOffset = dayjs(dailyPeak.dayKey).startOf('day').diff(originDate, 'day');
            if (dayOffset < 0 || dayOffset * 24 > rangeHours) {
                return;
            }

            peaks.set(dayOffset, {
                peak: dailyPeak.peak,
                peakHour: dailyPeak.peakHour,
            });
        });

        return peaks;
    }, [dailyPeaks, originDate, rangeHours]);

    const selectedRangeLabel = `${startDate.format('YYYY-MM-DD')} - ${endDate.format('YYYY-MM-DD')}`;

    const requestReload = useCallback(() => {
        setReloadVersion((version) => version + 1);
    }, []);

    const requestReloadSoon = useCallback(() => {
        if (reloadTimerRef.current) {
            clearTimeout(reloadTimerRef.current);
        }
        reloadTimerRef.current = setTimeout(() => {
            requestReload();
        }, 120);
    }, [requestReload]);

    useEffect(() => {
        return () => {
            if (reloadTimerRef.current) {
                clearTimeout(reloadTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        writeDatesToUrl(startDate, endDate);
    }, [startDate, endDate]);

    useEffect(() => {
        if (!hasUserInteracted) {
            setHasAutoFit(false);
        }
    }, [filterBatchIdsKey, hasUserInteracted]);

    const markUserInteracted = useCallback(() => {
        setHasUserInteracted(true);
    }, []);

    const clearGanttData = useCallback(() => {
        setBatches([]);
        setDependencies([]);
        setShareGroups([]);
    }, []);

    const fetchHierarchy = useCallback(async (rangeStart: Dayjs, rangeEnd: Dayjs) => {
        const hierarchyParams: Record<string, string> = {
            start_date: formatApiDate(rangeStart),
            end_date: formatApiDate(rangeEnd),
            status: BATCH_STATUS_FILTER,
        };

        if (filterBatchIdsKey) {
            hierarchyParams.batch_ids = filterBatchIdsKey;
        }

        const res = await axios.get('/api/v5/gantt/hierarchy', { params: hierarchyParams });
        const fetchedBatches = (res.data?.batches || res.data || []) as GanttBatch[];

        return hasExplicitBatchFilter
            ? fetchedBatches.filter((batch) => filteredBatchIdSet.has(batch.id))
            : fetchedBatches;
    }, [filterBatchIdsKey, filteredBatchIdSet, hasExplicitBatchFilter]);

    const loadConnections = useCallback(async (
        visibleBatches: GanttBatch[],
        rangeStart: Dayjs,
        rangeEnd: Dayjs,
    ) => {
        if (visibleBatches.length === 0) {
            setDependencies([]);
            setShareGroups([]);
            return;
        }

        const batchIdsParam = visibleBatches.map((batch) => batch.id).join(',');
        const rangeParams = {
            batch_ids: batchIdsParam,
            start_date: formatApiDate(rangeStart),
            end_date: formatApiDate(rangeEnd),
            status: BATCH_STATUS_FILTER,
        };

        const [shareGroupRes, dependencyRes] = await Promise.all([
            axios.get('/api/share-groups/batches/gantt', { params: rangeParams }),
            axios.get('/api/v5/gantt/dependencies', { params: rangeParams }),
        ]);

        setShareGroups(shareGroupRes.data || []);
        setDependencies(dependencyRes.data || []);
    }, []);

    useEffect(() => {
        if (hasAutoFit) {
            return;
        }

        if (hasExplicitBatchFilter && filteredBatchIdSet.size === 0) {
            clearGanttData();
            setLoading(false);
            return;
        }

        let cancelled = false;

        const autoFit = async () => {
            setLoading(true);
            try {
                const probeStart = dayjs().subtract(AUTOFIT_PROBE_MONTHS, 'month').startOf('day');
                const probeEnd = dayjs().add(AUTOFIT_PROBE_MONTHS, 'month').endOf('day');
                const fetchedBatches = await fetchHierarchy(probeStart, probeEnd);

                if (cancelled) {
                    return;
                }

                const extent = getBatchDateExtent(fetchedBatches);
                if (!extent) {
                    clearGanttData();
                    setHasAutoFit(true);
                    return;
                }

                const fittedStart = extent.start.startOf('day');
                const fittedEnd = extent.end.add(1, 'week').endOf('week');

                setBatches(fetchedBatches);
                setStartDate(fittedStart);
                setEndDate(fittedEnd);
                setHasAutoFit(true);
                await loadConnections(fetchedBatches, fittedStart, fittedEnd);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to auto-fit batch gantt data', error);
                    wxbToast.error('加载甘特图数据失败');
                    clearGanttData();
                    setHasAutoFit(true);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void autoFit();

        return () => {
            cancelled = true;
        };
    }, [
        clearGanttData,
        fetchHierarchy,
        filteredBatchIdSet,
        hasAutoFit,
        hasExplicitBatchFilter,
        loadConnections,
    ]);

    useEffect(() => {
        if (!hasAutoFit) {
            return;
        }

        if (hasExplicitBatchFilter && filteredBatchIdSet.size === 0) {
            clearGanttData();
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadData = async () => {
            setLoading(true);
            try {
                const fetchedBatches = await fetchHierarchy(startDate.startOf('day'), endDate.endOf('day'));
                if (cancelled) {
                    return;
                }
                setBatches(fetchedBatches);
                await loadConnections(fetchedBatches, startDate.startOf('day'), endDate.endOf('day'));
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to fetch batch gantt data', error);
                    wxbToast.error('加载甘特图数据失败');
                    clearGanttData();
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadData();

        return () => {
            cancelled = true;
        };
    }, [
        clearGanttData,
        endDate,
        fetchHierarchy,
        filteredBatchIdSet,
        hasAutoFit,
        hasExplicitBatchFilter,
        loadConnections,
        reloadVersion,
        startDate,
    ]);

    const handlePresetChange = useCallback((preset: string) => {
        if (preset === 'autoFit') {
            setHasUserInteracted(false);
            setHasAutoFit(false);
            return;
        }

        const { start, end } = computeDatePreset(preset as Exclude<DatePreset, 'autoFit'>);
        markUserInteracted();
        setStartDate(start.startOf('day'));
        setEndDate(end.endOf('day'));
    }, [markUserInteracted]);

    const handleRangeChange = useCallback((dates: null | [Dayjs | null, Dayjs | null]) => {
        if (!dates?.[0] || !dates?.[1]) {
            return;
        }
        markUserInteracted();
        setStartDate(dates[0].startOf('day'));
        setEndDate(dates[1].endOf('day'));
    }, [markUserInteracted]);

    const handleEditTask = useCallback((task: GanttTask) => {
        // A co-occupied operation may be clicked on a co-used device's mirror clone
        // (id suffixed with __equip-<id>); resolve back to the canonical operation.
        const operation = model.operationByTaskId.get(baseOperationTaskId(task.id));
        if (operation) {
            setEditingOperation(operation);
        }
    }, [model.operationByTaskId]);

    // Right-click "新增操作" — resolve the clicked lane (batch/stage/equipment) and time
    // from the context, then open the create modal pre-filled with "where you clicked".
    const handleContextAction = useCallback((
        action: string,
        task: GanttTask | null,
        context: GanttContextActionContext,
    ) => {
        if (action !== 'add-task') return;

        const startHour = context?.absoluteStartHour;
        const startTime = typeof startHour === 'number' && Number.isFinite(startHour)
            ? originDate.add(startHour, 'hour')
            : null;

        const prefill: CreateOpPrefill = {
            batchId: batches.length === 1 ? batches[0].id : null,
            stageId: null,
            stageName: null,
            resourceNodeId: null,
            resourceName: null,
            startTime,
        };

        const applyData = (data: Record<string, unknown> | undefined): boolean => {
            if (!data) return false;
            prefill.batchId = (data.batchId as number) ?? prefill.batchId;
            prefill.stageId = (data.stageId as number) ?? null;
            prefill.stageName = (data.stageName as string) ?? null;
            prefill.resourceNodeId = (data.resourceNodeId as number) ?? null;
            prefill.resourceName = (data.resourceName as string) ?? null;
            return true;
        };

        // Most precise: right-clicked directly on an operation bar — use its own data.
        if (!applyData(task?.data as Record<string, unknown> | undefined)) {
            // Otherwise resolve the clicked lane/stage/batch from the group under the cursor.
            const groupId = context?.groupId;
            if (groupId) {
                const sample = renderModel.tasks.find((t) => taskBelongsToGroup(t.groupId, groupId));
                if (!applyData(sample?.data as Record<string, unknown> | undefined)) {
                    // Batch summary / empty row — recover at least the batch id from the group id.
                    const match = /^batch-(\d+)/.exec(groupId);
                    if (match) prefill.batchId = Number(match[1]);
                }
            }
        }

        setCreateOpPrefill(prefill);
        setCreateOpOpen(true);
    }, [batches, originDate, renderModel.tasks]);

    const handleSaveOperation = useCallback(async (id: number, values: any) => {
        try {
            await axios.put(`/api/v5/gantt/operations/${id}`, values);
            wxbToast.success('操作更新成功');
            setEditingOperation(null);
            requestReload();
        } catch (error: any) {
            console.error('Failed to update operation:', error);
            wxbToast.error(error?.response?.data?.error || '更新失败，请重试');
        }
    }, [requestReload]);

    const handleDeleteOperation = useCallback(async (id: number) => {
        try {
            await axios.delete(`/api/v5/gantt/operations/${id}`);
            wxbToast.success('操作删除成功');
            setEditingOperation(null);
            requestReload();
        } catch (error: any) {
            console.error('Failed to delete operation:', error);
            wxbToast.error(error?.response?.data?.error || '删除失败，请重试');
        }
    }, [requestReload]);

    const persistTaskTime = useCallback(async (
        taskId: string,
        newStart: number,
        newEnd: number,
        reloadMode: 'immediate' | 'debounced' = 'debounced',
    ) => {
        const operation = model.operationByTaskId.get(taskId);
        if (!operation) {
            return false;
        }

        try {
            await axios.put(`/api/v5/gantt/operations/${operation.id}`, {
                startDate: formatApiDate(hourOffsetToDate(originDate, newStart)),
                endDate: formatApiDate(hourOffsetToDate(originDate, newEnd)),
                windowStartDate: operation.windowStartDate,
                windowEndDate: operation.windowEndDate,
            });
            if (reloadMode === 'immediate') {
                requestReload();
            } else {
                requestReloadSoon();
            }
            return true;
        } catch (error: any) {
            console.error('Failed to persist task timing', error);
            wxbToast.error(error?.response?.data?.error || '时间调整失败');
            return false;
        }
    }, [model.operationByTaskId, originDate, requestReload, requestReloadSoon]);

    const handleTaskDragEnd = useCallback(async (taskId: string, newStart: number, newEnd: number) => {
        return persistTaskTime(taskId, newStart, newEnd);
    }, [persistTaskTime]);

    const persistTasksBatch = useCallback(async (
        updates: Array<{ taskId: string; newStart: number; newEnd: number }>,
    ): Promise<boolean> => {
        const operations = updates
            .map(({ taskId, newStart, newEnd }) => {
                const operation = model.operationByTaskId.get(taskId);
                if (!operation) {
                    return null;
                }
                return {
                    operationId: operation.id,
                    startDate: formatApiDate(hourOffsetToDate(originDate, newStart)),
                    endDate: formatApiDate(hourOffsetToDate(originDate, newEnd)),
                    windowStartDate: operation.windowStartDate,
                    windowEndDate: operation.windowEndDate,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        if (operations.length === 0) {
            return false;
        }

        try {
            // Atomic: backend commits all or rolls back all. Only reload on success so
            // a rejected move leaves both the canvas and the DB untouched.
            await axios.put('/api/v5/gantt/operations/batch-time', { operations });
            wxbToast.success(`已移动 ${operations.length} 个操作`);
            requestReload();
            return true;
        } catch (error: any) {
            console.error('Failed to persist batch timing', error);
            wxbToast.error(error?.response?.data?.error || '批量调整失败');
            return false;
        }
    }, [model.operationByTaskId, originDate, requestReload]);

    const handleGroupDragEnd = useCallback(async (
        _groupId: string,
        deltaHours: number,
        affectedTaskIds: string[],
    ) => {
        const updates = affectedTaskIds
            .map((taskId) => {
                const operation = model.operationByTaskId.get(taskId);
                if (!operation) {
                    return null;
                }
                const currentStart = dayjs(operation.startDate).diff(originDate, 'hour', true);
                const currentEnd = dayjs(operation.endDate).diff(originDate, 'hour', true);
                return {
                    taskId,
                    newStart: currentStart + deltaHours,
                    newEnd: currentEnd + deltaHours,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        return persistTasksBatch(updates);
    }, [model.operationByTaskId, originDate, persistTasksBatch]);

    const handleCreateShareGroup = useCallback(async (selectedTaskIds: string[]) => {
        const operationIds = selectedTaskIds
            .map((taskId) => model.operationByTaskId.get(taskId)?.id)
            .filter((id): id is number => typeof id === 'number');

        if (operationIds.length < 2) {
            wxbToast.warning('至少选择 2 个操作才能创建共享组');
            return;
        }

        try {
            await axios.post('/api/share-groups/batch-operations/bulk', {
                operation_ids: operationIds,
                group_name: `共享组-${shareGroups.length + 1}`,
                share_mode: 'SAME_TEAM',
            });
            wxbToast.success('共享组创建成功');
            requestReload();
        } catch (error: any) {
            console.error('Failed to create share group', error);
            wxbToast.error(error?.response?.data?.error || '创建共享组失败');
        }
    }, [model.operationByTaskId, requestReload, shareGroups.length]);

    const handleAutoSchedule = useCallback(() => {
        wxbToast.info('真实批次的自动排班请在 V4 自动排班中运行；当前甘特图保留生产日期编辑。');
        navigate('/solver-v4');
    }, [navigate]);

    const hasData = model.tasks.length > 0;

    const toolbarExtraContent = (
        <div className="batch-gantt-wxb__toolbar-extra">
            <WxbSegmented
                size="sm"
                defaultValue="autoFit"
                options={DATE_PRESET_OPTIONS}
                onChange={handlePresetChange}
            />
            <WxbRangePicker
                className="batch-gantt-wxb__range"
                value={[startDate, endDate]}
                allowClear={false}
                onChange={handleRangeChange as any}
            />
            <div className="batch-gantt-wxb__summary">
                <WxbTag color="blue">{selectedRangeLabel}</WxbTag>
                <span><strong>{batches.length}</strong> 批次</span>
                <span><strong>{model.stageCount}</strong> 阶段</span>
                <span><strong>{model.operationCount}</strong> 操作</span>
            </div>
            <div className="batch-gantt-wxb__separator" />
            <WxbSegmented
                size="sm"
                value={yAxisMode}
                options={Y_AXIS_OPTIONS}
                onChange={(value) => setYAxisMode(value as YAxisMode)}
            />
            <div className="batch-gantt-wxb__separator" />
            <div className="batch-gantt-wxb__switch">
                <span>时间窗口</span>
                <WxbSwitch
                    size="sm"
                    checked={showTimeWindows}
                    onChange={setShowTimeWindows}
                />
            </div>
            <div className="batch-gantt-wxb__separator" />
            <WxbTooltip title="真实批次的人员自动排班由 V4 自动排班求解器执行">
                <span className="batch-gantt-wxb__tooltip-anchor">
                    <WxbButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="batch-gantt-wxb__action"
                        onClick={handleAutoSchedule}
                    >
                        自动排程
                    </WxbButton>
                </span>
            </WxbTooltip>
            <WxbButton
                type="button"
                variant="ghost"
                size="sm"
                className="batch-gantt-wxb__action"
                onClick={requestReload}
            >
                <WxbIcon name="capa" size={14} />
                刷新
            </WxbButton>
        </div>
    );

    return (
        <div className="batch-gantt-wxb">
            <div className="batch-gantt-wxb__body">
                {hasData ? (
                    <WxbGanttChart
                        className="batch-gantt-wxb__chart"
                        tasks={renderModel.tasks}
                        groups={renderModel.groups}
                        dependencies={renderModel.dependencies}
                        links={renderModel.links}
                        timeRange={{ start: 0, end: rangeHours }}
                        timelineOriginDate={originDate.format('YYYY-MM-DD')}
                        rowHeight={32}
                        sidebarWidth={300}
                        initialDayWidth={120}
                        personnelPeaks={personnelPeaks}
                        taskMenuItems={TASK_MENU_ITEMS}
                        groupMenuItems={GROUP_MENU_ITEMS}
                        backgroundMenuItems={BG_MENU_ITEMS}
                        onContextAction={handleContextAction}
                        onTaskDoubleClick={handleEditTask}
                        onTaskEdit={handleEditTask}
                        onTaskDragEnd={handleTaskDragEnd}
                        onGroupDragEnd={handleGroupDragEnd}
                        onTasksDragEnd={persistTasksBatch}
                        onCreateShareGroup={handleCreateShareGroup}
                        clampDragToWindow={false}
                        collapseEmptyNightShifts
                        enableFullscreen
                        showSelectionPanel
                        toolbarExtraContent={toolbarExtraContent}
                    />
                ) : (
                    <div className="batch-gantt-wxb__empty-wrap">
                        {/* No chart toolbar to host the controls in the empty state, so
                            surface them in a standalone bar to keep date navigation usable. */}
                        <div className="batch-gantt-wxb__empty-toolbar">
                            {toolbarExtraContent}
                        </div>
                        <div className="batch-gantt-wxb__empty">
                            <WxbEmpty
                                description={hasExplicitBatchFilter ? '没有匹配的批次排程' : '暂无批次排程数据'}
                                action={(
                                    <WxbButton type="button" size="sm" onClick={onCreateBatch}>
                                        新建批次
                                    </WxbButton>
                                )}
                            />
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="batch-gantt-wxb__loading">
                        <WxbSpinner tip="甘特图加载中" />
                    </div>
                )}
            </div>

            {editingOperation && (
                <EditOperationModal
                    visible
                    operation={editingOperation}
                    onClose={() => setEditingOperation(null)}
                    onSave={handleSaveOperation}
                    onDelete={handleDeleteOperation}
                />
            )}

            <CreateIndependentOperationModal
                visible={createOpOpen}
                batches={batches}
                prefill={createOpPrefill}
                onClose={() => setCreateOpOpen(false)}
                onCreated={requestReload}
            />
        </div>
    );
};

export default BatchGanttV4;
