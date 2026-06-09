/**
 * ProcessTemplateV3Editor — 全屏甘特图编辑器
 *
 * 以 WxbGanttChart 为核心，集成 ganttAdapter、useGanttData、
 * useShareGroupService、useV3EditorActions。
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { message } from 'antd';
import axios from 'axios';
import { WxbGanttChart, WxbSkeleton, WxbEmpty, WxbCard, WxbModal, WxbInput, WxbSelect, WxbButton } from '../wxb-ui';
import type { GanttContextActionContext, GanttTask, YAxisMode } from '../wxb-ui/GanttChart/types';
import {
  CtxIcons,
  DEFAULT_BG_MENU_ITEMS,
  DEFAULT_GROUP_MENU_ITEMS,
  type ContextMenuItem,
} from '../wxb-ui/GanttChart/GanttContextMenu';
import { processTemplateV2Api } from '../../services';
import type { ProcessTemplate, GanttNode, StageOperation } from '../ProcessTemplateGantt/types';
import type {
  OperationCreateContext,
  OperationCreatedResult,
  TemplateResourceEditorResponse,
  TemplateStageSummary,
} from '../ProcessTemplateV2/types';
import { useGanttData } from '../ProcessTemplateGantt/hooks/useGanttData';
import { useShareGroupService } from '../ProcessTemplateGantt/useShareGroupService';
import WxbShareGroupModal from '../ProcessTemplateGantt/components/WxbShareGroupModal';
import {
  toGanttTasks,
  toGanttGroups,
  toGanttDeps,
  toGanttLinks,
} from '../ProcessTemplateGantt/ganttAdapter';
import { useV3EditorActions } from './useV3EditorActions';
import { useResourceView } from './useResourceView';
import { buildCreateTimingContext, parseStageIdFromGroupId } from './createOperationContext';
import V3EditorHeader from './V3EditorHeader';
import QuickCreateOperationModal, { type EditOperationTarget } from './QuickCreateOperationModal';
import './EquipmentBinding.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcessTemplateV3EditorProps {
  templateId: number;
}

const EMPTY_TEMPLATE: ProcessTemplate = {
  id: 0,
  template_code: '',
  template_name: '',
  description: '',
  total_days: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all operation-type GanttNodes from the tree and map to the
 * operations list needed by useShareGroupService.
 */
function collectOperations(
  nodes: GanttNode[],
  parentStageName?: string,
): Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }> {
  const result: Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }> = [];

  for (const node of nodes) {
    if (node.type === 'operation') {
      const opData = node.data as StageOperation | undefined;
      if (opData) {
        result.push({
          scheduleId: opData.id,
          operationName: opData.operation_name ?? node.title,
          stageName: parentStageName ?? '',
          requiredPeople: opData.required_people ?? 1,
        });
      }
    }
    if (node.children) {
      const stageName = node.type === 'stage' ? node.title : parentStageName;
      result.push(...collectOperations(node.children, stageName));
    }
  }

  return result;
}

function getScheduleIdFromTask(task: GanttTask): number | null {
  const explicit = task.data?.scheduleId;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;

  const match = task.id.match(/(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessTemplateV3Editor: React.FC<ProcessTemplateV3EditorProps> = ({ templateId }) => {
  // ---- Template metadata ----
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [showTimeWindows, setShowTimeWindows] = useState(false); // default off
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>('stage-equipment');

  // ---- Equipment binding state ----
  const [equipmentNodes, setEquipmentNodes] = useState<Array<{
    id: number; nodeName: string; equipmentSystemType: string | null; equipmentClass: string | null;
    departmentCode: string | null;
  }>>([]);
  const [showCreateEquipModal, setShowCreateEquipModal] = useState(false);
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipSystemType, setNewEquipSystemType] = useState<string>('SUS');
  const [newEquipClass, setNewEquipClass] = useState('');
  // ---- Add-stage state ----
  const [addStageModalOpen, setAddStageModalOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageStartDay, setNewStageStartDay] = useState('1');
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [pendingBindTask, setPendingBindTask] = useState<GanttTask | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<GanttTask[]>([]);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [createOperationModalOpen, setCreateOperationModalOpen] = useState(false);
  const [createOperationContext, setCreateOperationContext] = useState<OperationCreateContext | null>(null);
  const [editOperationModalOpen, setEditOperationModalOpen] = useState(false);
  const [editOperationTarget, setEditOperationTarget] = useState<EditOperationTarget | null>(null);
  const [resourceEditorData, setResourceEditorData] = useState<TemplateResourceEditorResponse | null>(null);
  const [resourceEditorLoading, setResourceEditorLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setTemplateLoading(true);
        const data = await processTemplateV2Api.getTemplate(templateId);
        if (!cancelled) {
          setTemplate({
            id: data.id,
            template_code: data.template_code,
            template_name: data.template_name,
            description: data.description,
            total_days: data.total_days,
            team_id: data.team_id,
            team_code: data.team_code,
            team_name: data.team_name,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          message.error(err?.response?.data?.error || '加载工艺模版失败');
          setTemplate(null);
        }
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [templateId]);

  // ---- Load equipment node list ----
  const refreshEquipmentNodes = useCallback(async () => {
    try {
      // tree:false → flat list; the default tree form only exposes SITE roots,
      // which would hide all nested EQUIPMENT_UNIT nodes.
      // boundResourceIsSchedulable: only nodes bound to a schedulable resource are valid
      // bind targets — the backend rejects the rest ("not bound to a schedulable resource").
      const all = await processTemplateV2Api.listResourceNodes({ tree: false });
      setEquipmentNodes(
        all.filter((n: any) => n.nodeClass === 'EQUIPMENT_UNIT' && n.isActive && n.boundResourceIsSchedulable)
          .map((n: any) => ({
            id: n.id, nodeName: n.nodeName,
            equipmentSystemType: n.equipmentSystemType, equipmentClass: n.equipmentClass,
            departmentCode: n.departmentCode ?? null,
          })),
      );
    } catch (err) {
      console.error('Failed to load equipment nodes:', err);
    }
  }, []);

  useEffect(() => { void refreshEquipmentNodes(); }, [refreshEquipmentNodes]);

  // ---- Equipment binding options: grouped by team (departmentCode), current template's team first ----
  const equipmentBindingOptions = useMemo(() => {
    const teamCode = template?.team_code ?? null;
    const groups = new Map<string, Array<{ label: string; value: number }>>();
    for (const node of equipmentNodes) {
      const key = node.departmentCode ?? '__none__';
      if (!groups.has(key)) groups.set(key, []);
      const extra = [node.equipmentSystemType, node.equipmentClass].filter(Boolean).join(' · ');
      groups.get(key)!.push({ value: node.id, label: extra ? `${node.nodeName} (${extra})` : node.nodeName });
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (teamCode && a === teamCode) return -1;
        if (teamCode && b === teamCode) return 1;
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return a.localeCompare(b);
      })
      .map(([code, opts]) => ({
        label: code === '__none__' ? '未归属团队' : code === teamCode ? `${code}（本模板）` : code,
        options: opts.sort((x, y) => x.label.localeCompare(y.label, 'zh-Hans-CN')),
      }));
  }, [equipmentNodes, template?.team_code]);

  const loadResourceEditorData = useCallback(async () => {
    if (!templateId) return null;

    try {
      setResourceEditorLoading(true);
      const data = await processTemplateV2Api.getResourceEditor(templateId);
      setResourceEditorData(data);
      return data;
    } catch (err: any) {
      message.error(err?.response?.data?.error || '加载新增操作参考数据失败');
      return null;
    } finally {
      setResourceEditorLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadResourceEditorData();
  }, [loadResourceEditorData]);



  // ---- Gantt data (stages → nodes → timeBlocks) ----
  const ganttTemplate = useMemo(() => template ?? EMPTY_TEMPLATE, [template]);
  const ganttData = useGanttData(ganttTemplate);

  // ---- Editor actions (drag / resize / delete / auto-schedule) ----
  const actions = useV3EditorActions({
    templateId,
    ganttNodes: ganttData.ganttNodes,
    refreshData: ganttData.refreshData,
  });

  // ---- Operations list for share group modal (from ganttNodes tree) ----
  const operationsList = useMemo(
    () => collectOperations(ganttData.ganttNodes),
    [ganttData.ganttNodes],
  );

  // ---- Share group service ----
  const shareService = useShareGroupService({
    templateId,
    operations: operationsList,
    onDataChange: () => {
      void ganttData.refreshData();
      void actions.refreshAll();
    },
    onMessage: (_type, text) => {
      if (_type === 'error') message.error(text);
      else if (_type === 'warning') message.warning(text);
      else message.success(text);
    },
  });

  // ---- Gantt adapter (memo-ized transforms) ----
  const rawTasks = useMemo(
    () => toGanttTasks(ganttData.timeBlocks, ganttData.ganttNodes, {
      shareGroups: shareService.shareGroups,
      mergeTimeWindows: true,
    }),
    [ganttData.timeBlocks, ganttData.ganttNodes, shareService.shareGroups],
  );

  // Strip window data when toggle is off
  const tasks = useMemo(() => {
    if (showTimeWindows) return rawTasks;
    return rawTasks.map(t =>
      t.windowStart !== undefined || t.windowEnd !== undefined
        ? { ...t, windowStart: undefined, windowEnd: undefined }
        : t
    );
  }, [rawTasks, showTimeWindows]);

  const groups = useMemo(
    () => toGanttGroups(ganttData.ganttNodes),
    [ganttData.ganttNodes],
  );

  const dependencies = useMemo(
    () => toGanttDeps(actions.constraints),
    [actions.constraints],
  );

  const links = useMemo(
    () => toGanttLinks(shareService.shareGroups),
    [shareService.shareGroups],
  );

  // ---- Resource view (equipment-centric grouping) ----
  const resourceView = useResourceView(
    templateId, ganttData.ganttNodes, tasks, groups, yAxisMode,
  );

  // Select data source based on yAxisMode
  const finalTasks = yAxisMode === 'operation' ? tasks : resourceView.resourceTasks;
  const finalGroups = yAxisMode === 'operation' ? groups : resourceView.resourceGroups;

  // In resource view, only show dependencies for hovered task (otherwise too dense)
  const finalDependencies = yAxisMode === 'operation' ? dependencies : [];

  const firstVisibleStageId = useMemo(() => {
    for (const group of finalGroups) {
      const stageId = parseStageIdFromGroupId(group.id);
      if (stageId) return stageId;
    }
    return resourceEditorData?.stages[0]?.id ?? ganttData.stages[0]?.id ?? null;
  }, [finalGroups, ganttData.stages, resourceEditorData]);

  const resolveCreateStage = useCallback((
    context: GanttContextActionContext,
    editorData: TemplateResourceEditorResponse,
  ): TemplateStageSummary | null => {
    const contextStageId = parseStageIdFromGroupId(context.groupId);
    const stageId = contextStageId ?? firstVisibleStageId;
    return editorData.stages.find(stage => Number(stage.id) === Number(stageId)) ?? editorData.stages[0] ?? null;
  }, [firstVisibleStageId]);

  const ensureResourceEditorData = useCallback(async () => {
    return resourceEditorData ?? await loadResourceEditorData();
  }, [loadResourceEditorData, resourceEditorData]);

  const openCreateOperationFromGantt = useCallback(async (context: GanttContextActionContext) => {
    const editorData = await ensureResourceEditorData();
    if (!editorData) return;

    const stage = resolveCreateStage(context, editorData);
    if (!stage) {
      message.warning('请先创建阶段，再新增操作');
      return;
    }

    const absoluteStartHour = context.absoluteStartHour ?? Number(stage.start_day ?? 0) * 24 + 9;
    const timing = buildCreateTimingContext(stage, absoluteStartHour);
    setCreateOperationContext({
      source: context.contextType === 'group' ? 'stage' : 'canvas',
      stageId: Number(stage.id),
      absoluteStartHour,
      operationDay: timing.operationDay,
      recommendedTime: timing.recommendedTime,
      recommendedDayOffset: timing.recommendedDayOffset,
    });
    setCreateOperationModalOpen(true);
  }, [ensureResourceEditorData, resolveCreateStage]);

  const closeCreateOperationModal = useCallback(() => {
    setCreateOperationModalOpen(false);
    setCreateOperationContext(null);
  }, []);

  const handleCreatedOperation = useCallback(
    async (_result: OperationCreatedResult) => {
      await Promise.all([
        ganttData.refreshData(),
        actions.refreshAll(),
        shareService.refresh(),
        resourceView.refreshBindings(),
        loadResourceEditorData(),
      ]);
    },
    [actions, ganttData, loadResourceEditorData, resourceView, shareService],
  );

  // Create the first / next stage. Restores the stage-management entry that
  // the V3 rewrite dropped (audit V3-STAGE-001): without it a brand-new empty
  // template can never be filled. Backend POST /process-stages is unchanged.
  const handleCreateStage = useCallback(async () => {
    const name = newStageName.trim();
    if (!name) {
      message.warning('请输入阶段名称');
      return;
    }
    const startDay = Number(newStageStartDay);
    if (!Number.isInteger(startDay) || startDay < 0) {
      message.warning('起始天需为 0 或正整数');
      return;
    }
    try {
      setStageSubmitting(true);
      const existingStages = resourceEditorData?.stages?.length ?? 0;
      await processTemplateV2Api.createStage(templateId, {
        stageName: name,
        stageOrder: existingStages + 1,
        startDay,
      });
      message.success('阶段已创建');
      setAddStageModalOpen(false);
      setNewStageName('');
      setNewStageStartDay('1');
      // allSettled: 任一刷新挂起/失败都不拖死提交(参考审计 DYN-B2 卡死)
      await Promise.allSettled([
        ganttData.refreshData(),
        actions.refreshAll(),
        loadResourceEditorData(),
      ]);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '创建阶段失败');
    } finally {
      setStageSubmitting(false);
    }
  }, [newStageName, newStageStartDay, resourceEditorData, templateId, ganttData, actions, loadResourceEditorData]);

  const backgroundMenuItems = useMemo<ContextMenuItem[]>(
    () =>
      DEFAULT_BG_MENU_ITEMS.map((item) =>
        item.key === 'add-task'
          ? { ...item, label: '新增操作', disabled: resourceEditorLoading }
          : item,
      ),
    [resourceEditorLoading],
  );

  const groupMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      { key: 'add-task', label: '新增操作', icon: CtxIcons.plus, disabled: resourceEditorLoading, divider: true },
      ...DEFAULT_GROUP_MENU_ITEMS,
    ],
    [resourceEditorLoading],
  );

  // ---- Callbacks ----
  // Find the StageOperation row for a schedule ID within the gantt node tree.
  const findStageOperation = useCallback((scheduleId: number): StageOperation | null => {
    const walk = (nodes: GanttNode[]): StageOperation | null => {
      for (const node of nodes) {
        if (node.type === 'operation') {
          const op = node.data as StageOperation | undefined;
          if (op?.id === scheduleId) return op;
        }
        if (node.children) {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(ganttData.ganttNodes);
  }, [ganttData.ganttNodes]);

  const handleTaskEdit = useCallback((task: GanttTask) => {
    if (task.readOnly || task.type !== 'operation') return;
    const scheduleId = getScheduleIdFromTask(task);
    if (!scheduleId) return;
    const op = findStageOperation(scheduleId);
    if (!op) {
      message.warning('未找到该操作的排程数据，请刷新后重试');
      return;
    }
    const libItem = resourceEditorData?.operationLibrary?.find(
      (item) => Number(item.id) === Number(op.operation_id),
    );
    setEditOperationTarget({
      scheduleId: op.id,
      operationId: op.operation_id,
      operationName: op.operation_name,
      operationCode: op.operation_code,
      stageId: op.stage_id,
      operationDay: Number(op.operation_day ?? 0),
      recommendedTime: Number(op.recommended_time ?? 0),
      recommendedDayOffset: Number(op.recommended_day_offset ?? 0),
      windowStartTime: Number(op.window_start_time ?? 0),
      windowStartDayOffset: Number(op.window_start_day_offset ?? 0),
      windowEndTime: Number(op.window_end_time ?? 0),
      windowEndDayOffset: Number(op.window_end_day_offset ?? 0),
      durationHours: Number(op.standard_time ?? libItem?.standard_time ?? 2),
      requiredPeople: Number(op.required_people ?? libItem?.required_people ?? 1),
    });
    setEditOperationModalOpen(true);
  }, [findStageOperation, resourceEditorData]);

  const openDeleteConfirm = useCallback((targets: GanttTask[]) => {
    const seen = new Set<number>();
    const deletableTargets = targets.filter(task => {
      if (task.readOnly || task.type !== 'operation') return false;
      const scheduleId = getScheduleIdFromTask(task);
      if (!scheduleId || seen.has(scheduleId)) return false;
      seen.add(scheduleId);
      return true;
    });

    if (deletableTargets.length === 0) {
      message.warning('请选择可删除的操作');
      return;
    }

    setDeleteTargets(deletableTargets);
  }, []);

  const handleTaskDelete = useCallback((task: GanttTask) => {
    openDeleteConfirm([task]);
  }, [openDeleteConfirm]);

  const handleTasksDelete = useCallback((targets: GanttTask[]) => {
    openDeleteConfirm(targets);
  }, [openDeleteConfirm]);

  const handleCancelDelete = useCallback(() => {
    if (deleteSubmitting) return;
    setDeleteTargets([]);
  }, [deleteSubmitting]);

  const handleConfirmDelete = useCallback(async () => {
    const scheduleIds = deleteTargets
      .map(getScheduleIdFromTask)
      .filter((id): id is number => typeof id === 'number');
    if (scheduleIds.length === 0) {
      message.error('未找到可删除的排程操作');
      return;
    }

    try {
      setDeleteSubmitting(true);
      const results = await Promise.allSettled(
        scheduleIds.map(scheduleId => processTemplateV2Api.deleteStageOperation(scheduleId)),
      );
      const failed = results.filter(result => result.status === 'rejected');
      const deletedCount = results.length - failed.length;

      if (deletedCount > 0) {
        message.success(deletedCount === 1 ? '操作已删除' : `已删除 ${deletedCount} 个操作`);
      }
      if (failed.length > 0) {
        const firstError = failed[0] as PromiseRejectedResult;
        const detail = firstError.reason?.response?.data?.error || '部分操作删除失败';
        message.error(detail);
      }

      await ganttData.refreshData();
      await actions.refreshAll();
      await resourceView.refreshBindings();
      setDeleteTargets([]);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '删除操作失败');
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteTargets, ganttData, actions, resourceView]);

  const handleContextAction = useCallback(
    async (action: string, task: GanttTask | null, context: GanttContextActionContext) => {
      if (action === 'add-task') {
        await openCreateOperationFromGantt(context);
        return;
      }

      if (!task) return;

      // ---- Equipment binding actions ----
      if (action.startsWith('bind-equip-')) {
        const nodeId = Number(action.replace('bind-equip-', ''));
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        try {
          await processTemplateV2Api.batchUpdateBindings([scheduleId], nodeId, 'PRIMARY');
          const equipName = equipmentNodes.find(n => n.id === nodeId)?.nodeName || '';
          message.success(`已绑定到 ${equipName}`);
          await resourceView.refreshBindings();
        } catch (err: any) {
          message.error(err?.response?.data?.error || '绑定失败');
        }
        return;
      }
      if (action === 'unbind-equip') {
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        try {
          await processTemplateV2Api.batchUpdateBindings([scheduleId], null, 'PRIMARY');
          message.success('已解除设备绑定');
          await resourceView.refreshBindings();
        } catch (err: any) {
          message.error('解除绑定失败');
        }
        return;
      }
      if (action === 'create-equip') {
        setShowCreateEquipModal(true);
        setPendingBindTask(task);
        return;
      }

      // Route share-* actions to share service
      if (action.startsWith('share-')) {
        void shareService.handleShareAction(action, task);
        return;
      }

      switch (action) {
        case 'edit':
          handleTaskEdit(task);
          break;
        case 'delete':
          handleTaskDelete(task);
          break;
        default:
          break;
      }
    },
    [shareService, handleTaskEdit, handleTaskDelete, equipmentNodes, resourceView, openCreateOperationFromGantt],
  );

  // ---- Build final task menu including share sub-items + equipment ----
  const buildTaskMenu = useCallback(
    (task: GanttTask): ContextMenuItem[] => {
      const scheduleId = task.data?.scheduleId as number | undefined;
      const currentBinding = scheduleId
        ? resourceView.getBindingForSchedule(scheduleId)
        : null;

      const equipLabel = (n: typeof equipmentNodes[0]) => {
        const parts = [n.nodeName];
        if (n.equipmentSystemType || n.equipmentClass) {
          parts.push(`(${[n.equipmentSystemType, n.equipmentClass].filter(Boolean).join(' · ')})`)
        }
        return parts.join(' ');
      };

      const bindChildren: ContextMenuItem[] = [
        ...equipmentNodes.map(node => ({
          key: `bind-equip-${node.id}`,
          label: equipLabel(node),
          icon: currentBinding?.resourceNodeId === node.id
            ? React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', style: { color: 'var(--wx-green-600, #2E9D6E)' } },
                React.createElement('path', { d: 'M2.5 6l2.5 2.5 4.5-5', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }))
            : undefined,
        })),
        { key: 'div-unbind', label: '—', divider: true },
        { key: 'unbind-equip', label: '解除绑定', danger: true, disabled: !currentBinding },
        { key: 'div-create', label: '—', divider: true },
        { key: 'create-equip', label: '+ 新建设备...' },
      ];

      const baseItems: ContextMenuItem[] = [
        { key: 'edit', label: '编辑操作' },
        { key: 'bind-equipment', label: currentBinding ? `设备: ${currentBinding.name}` : '绑定设备', children: bindChildren },
        { key: 'delete', label: '删除操作', danger: true },
        { key: 'divider-share', label: '—', divider: true },
      ];
      const shareItems = shareService.buildShareMenuItems(task);
      return [...baseItems, ...shareItems];
    },
    [shareService, equipmentNodes, resourceView],
  );

  // ---- One-click link from SelectionPanel ----
  const handleQuickLink = useCallback(
    async (selectedTaskIds: string[]) => {
      const scheduleIds = selectedTaskIds
        .map(id => parseInt(id.replace(/\D/g, ''), 10))
        .filter(Number.isFinite);
      if (scheduleIds.length < 2) {
        message.warning('至少选择 2 个操作才能创建共享组');
        return;
      }

      // Auto-name: first 2 operation names + count
      const allOps = collectOperations(ganttData.ganttNodes);
      const names = scheduleIds.slice(0, 2)
        .map(sid => allOps.find(op => op.scheduleId === sid)?.operationName)
        .filter(Boolean);
      const autoName = names.join(' + ') + (scheduleIds.length > 2 ? ` +${scheduleIds.length - 2}` : '');

      try {
        await axios.post(`/api/share-groups/template/${templateId}`, {
          group_name: autoName || '共享组',
          share_mode: 'SAME_TEAM',
          member_ids: scheduleIds,
        });
        message.success('已链接为共享');
        await shareService.refresh();
        await ganttData.refreshData();
      } catch (err: any) {
        message.error(err?.response?.data?.error || '创建共享组失败');
      }
    },
    [templateId, ganttData, shareService],
  );

  // ---- Batch bind from selection panel (selectedTaskIds come from the gantt selection) ----
  const handleBatchBind = useCallback(async (selectedTaskIds: string[], nodeId: number) => {
    const scheduleIds = selectedTaskIds
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(Number.isFinite);
    if (!scheduleIds.length) {
      message.warning('请先在甘特图中选择操作');
      return;
    }
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, nodeId, 'PRIMARY');
      const name = equipmentNodes.find(n => n.id === nodeId)?.nodeName || '';
      message.success(`已绑定 ${scheduleIds.length} 个操作到 ${name}`);
      await resourceView.refreshBindings();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '批量绑定失败');
    }
  }, [equipmentNodes, resourceView]);

  const handleBatchUnbind = useCallback(async (taskIds: string[]) => {
    const scheduleIds = taskIds
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(Number.isFinite);
    if (!scheduleIds.length) {
      message.warning('请先在甘特图中选择操作');
      return;
    }
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, null, 'PRIMARY');
      message.success(`已解除 ${scheduleIds.length} 个操作的设备绑定`);
      await resourceView.refreshBindings();
    } catch (err: any) {
      message.error('解除绑定失败');
    }
  }, [resourceView]);

  // ---- Create equipment handler ----
  const handleCreateEquipment = useCallback(async () => {
    if (!newEquipName.trim()) { message.warning('请输入设备名称'); return; }
    try {
      // Find the first ROOM node as parent (fallback to ID 11)
      const allNodes = await processTemplateV2Api.listResourceNodes({ tree: false });
      const firstRoom = allNodes.find((n: any) => n.nodeClass === 'ROOM' && n.nodeSubtype === 'MAIN_PROCESS');
      const parentId = firstRoom ? (firstRoom as any).id : 11;

      const newId = await processTemplateV2Api.createResourceNode({
        nodeName: newEquipName.trim(),
        nodeClass: 'EQUIPMENT_UNIT',
        parentId,
        equipmentSystemType: newEquipSystemType as any,
        equipmentClass: newEquipClass || undefined,
        nodeScope: 'DEPARTMENT',
        departmentCode: 'USP',
      } as any);
      await refreshEquipmentNodes();

      if (pendingBindTask) {
        const sid = pendingBindTask.data?.scheduleId as number | undefined;
        if (sid) {
          await processTemplateV2Api.batchUpdateBindings([sid], newId, 'PRIMARY');
          await resourceView.refreshBindings();
          message.success(`已创建设备 ${newEquipName} 并绑定`);
        }
      } else {
        message.success(`设备 ${newEquipName} 已创建`);
      }
      setShowCreateEquipModal(false);
      setNewEquipName(''); setNewEquipClass(''); setPendingBindTask(null);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建设备失败');
    }
  }, [newEquipName, newEquipSystemType, newEquipClass, pendingBindTask, resourceView, refreshEquipmentNodes]);

  // ---- Loading / error states ----
  if (templateLoading) {
    return (
      <div style={{ padding: 48 }}>
        <WxbCard><WxbSkeleton rows={6} /></WxbCard>
      </div>
    );
  }

  if (!template) {
    return (
      <div style={{ padding: 48 }}>
        <WxbCard style={{ padding: 64 }}>
          <WxbEmpty description="无法加载工艺模版，请返回列表重试。" />
        </WxbCard>
      </div>
    );
  }


  // ---- Main render ----
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        margin: '-24px',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <V3EditorHeader
        templateCode={template.template_code}
        templateName={template.template_name}
        teamName={template.team_name ?? null}
        totalDays={template.total_days}
        loading={actions.loading}
        showTimeWindows={showTimeWindows}
        onToggleTimeWindows={setShowTimeWindows}
        onAutoSchedule={actions.handleAutoSchedule}
        yAxisMode={yAxisMode}
        onYAxisModeChange={setYAxisMode}
        onAddStage={() => setAddStageModalOpen(true)}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <WxbGanttChart
          tasks={finalTasks}
          groups={finalGroups}
          dependencies={finalDependencies}
          links={links}
          highlightedLinkIds={shareService.highlightedLinkIds}
          taskMenuBuilder={buildTaskMenu}
          groupMenuItems={groupMenuItems}
          backgroundMenuItems={backgroundMenuItems}
          onTaskDragEnd={actions.handleDragEnd}
          onTaskResizeEnd={actions.handleResizeEnd}
          onTaskEdit={handleTaskEdit}
          onTaskDoubleClick={handleTaskEdit}
          onTaskDelete={handleTaskDelete}
          onTasksDelete={handleTasksDelete}
          onContextAction={handleContextAction}
          showSelectionPanel
          onCreateShareGroup={handleQuickLink}
          selectionPanelExtraActions={(selectedTaskIds: string[]) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <WxbSelect
                placeholder={`绑定 ${selectedTaskIds.length} 个操作到设备`}
                showSearch
                optionFilterProp="label"
                value={undefined}
                onChange={(val) => {
                  if (val != null) void handleBatchBind(selectedTaskIds, val as number);
                }}
                options={equipmentBindingOptions}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <WxbButton
                  variant="ghost"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => void handleBatchUnbind(selectedTaskIds)}
                >
                  解除绑定
                </WxbButton>
                <WxbButton
                  variant="ghost"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => { setShowCreateEquipModal(true); setPendingBindTask(null); }}
                >
                  + 新建设备
                </WxbButton>
              </div>
            </div>
          )}
          collapseEmptyNightShifts
          enableFullscreen
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Share Group Modal */}
      <WxbShareGroupModal
        visible={shareService.modalState.visible}
        templateId={templateId}
        group={shareService.modalState.editingGroup}
        operations={operationsList}
        preSelectedIds={shareService.modalState.preSelectedIds}
        onCancel={shareService.closeModal}
        onSubmit={shareService.submitModal}
      />

      {resourceEditorData && (
        <QuickCreateOperationModal
          open={createOperationModalOpen}
          templateId={templateId}
          templateName={resourceEditorData.template.template_name || template.template_name}
          templateTeamId={resourceEditorData.template.team_id ?? template.team_id ?? null}
          templateTeamName={resourceEditorData.template.team_name ?? template.team_name ?? null}
          stages={resourceEditorData.stages}
          operations={resourceEditorData.operations}
          resourceNodes={resourceEditorData.resourceTree}
          operationLibrary={resourceEditorData.operationLibrary ?? []}
          capabilities={resourceEditorData.capabilities}
          context={createOperationContext}
          onCancel={closeCreateOperationModal}
          onCreated={handleCreatedOperation}
        />
      )}

      {resourceEditorData && (
        <QuickCreateOperationModal
          mode="edit"
          open={editOperationModalOpen}
          editTarget={editOperationTarget}
          templateId={templateId}
          templateName={resourceEditorData.template.template_name || template.template_name}
          templateTeamId={resourceEditorData.template.team_id ?? template.team_id ?? null}
          templateTeamName={resourceEditorData.template.team_name ?? template.team_name ?? null}
          stages={resourceEditorData.stages}
          operations={resourceEditorData.operations}
          resourceNodes={resourceEditorData.resourceTree}
          operationLibrary={resourceEditorData.operationLibrary ?? []}
          capabilities={resourceEditorData.capabilities}
          context={null}
          bindingOptions={equipmentBindingOptions}
          onCreated={async () => {}}
          onCancel={() => {
            setEditOperationModalOpen(false);
            setEditOperationTarget(null);
          }}
          onUpdated={async () => {
            setEditOperationModalOpen(false);
            setEditOperationTarget(null);
            await Promise.all([
              ganttData.refreshData(),
              actions.refreshAll(),
              shareService.refresh(),
              resourceView.refreshBindings(),
              loadResourceEditorData(),
            ]);
          }}
        />
      )}

      {/* Create Equipment Modal — Wxb Design System */}
      <WxbModal
        open={showCreateEquipModal}
        title="新建设备"
        okText={pendingBindTask ? '创建并绑定' : '创建设备'}
        cancelText="取消"
        onOk={() => void handleCreateEquipment()}
        onCancel={() => { setShowCreateEquipModal(false); setPendingBindTask(null); }}
        width={440}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WxbInput
            label="设备名称"
            value={newEquipName}
            onChange={e => setNewEquipName(e.target.value)}
            placeholder="例如: BR-201"
            error={!newEquipName.trim() ? undefined : undefined}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <WxbSelect
                label="材质系统"
                value={newEquipSystemType}
                onChange={(val) => setNewEquipSystemType(val as string)}
                options={[
                  { label: 'SUS (一次性)', value: 'SUS' },
                  { label: 'SS (不锈钢)', value: 'SS' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <WxbInput
                label="设备类别"
                value={newEquipClass}
                onChange={e => setNewEquipClass(e.target.value)}
                placeholder="例如: REACTOR"
              />
            </div>
          </div>
          {pendingBindTask && (
            <div className="wxb-equip-bind-hint">
              提示：创建后将自动绑定到操作「{pendingBindTask.label}」
            </div>
          )}
        </div>
      </WxbModal>

      {/* Add Stage Modal — Wxb Design System (restores missing stage entry) */}
      <WxbModal
        open={addStageModalOpen}
        title="新增阶段"
        okText="创建阶段"
        cancelText="取消"
        confirmLoading={stageSubmitting}
        onOk={() => void handleCreateStage()}
        onCancel={() => { setAddStageModalOpen(false); setNewStageName(''); setNewStageStartDay('1'); }}
        width={440}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WxbInput
            label="阶段名称"
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            placeholder="例如: 配制阶段"
          />
          <WxbInput
            label="起始天（第几天开始，从 1 起）"
            value={newStageStartDay}
            onChange={e => setNewStageStartDay(e.target.value)}
            placeholder="1"
          />
        </div>
      </WxbModal>

      <WxbModal
        open={deleteTargets.length > 0}
        title="删除操作"
        okText={deleteTargets.length > 1 ? `删除 ${deleteTargets.length} 个操作` : '删除操作'}
        cancelText="取消"
        okVariant="danger"
        confirmLoading={deleteSubmitting}
        onOk={() => void handleConfirmDelete()}
        onCancel={handleCancelDelete}
        width={440}
        destroyOnClose
      >
        <div className="wxb-template-delete-confirm">
          <p>
            删除后将移除排程操作及其设备绑定、人员共享组成员关系。此操作不会删除操作定义本身。
          </p>
          <div className="wxb-template-delete-confirm-list">
            {deleteTargets.slice(0, 6).map(task => (
              <div key={task.id} className="wxb-template-delete-confirm-item">
                {task.label}
              </div>
            ))}
            {deleteTargets.length > 6 && (
              <div className="wxb-template-delete-confirm-more">
                另有 {deleteTargets.length - 6} 个操作
              </div>
            )}
          </div>
        </div>
      </WxbModal>
    </div>
  );
};

export default ProcessTemplateV3Editor;
