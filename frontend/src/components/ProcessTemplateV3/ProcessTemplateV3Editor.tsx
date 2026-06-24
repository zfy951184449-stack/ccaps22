/**
 * ProcessTemplateV3Editor — 全屏甘特图编辑器
 *
 * 以 WxbGanttChart 为核心，集成 ganttAdapter、useGanttData、
 * useShareGroupService、useV3EditorActions。
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { WxbGanttChart, WxbSkeleton, WxbEmpty, WxbCard, WxbModal, WxbInput, WxbSelect, WxbButton, wxbToast } from '../wxb-ui';
import type { GanttContextActionContext, GanttTask, YAxisMode } from '../wxb-ui/GanttChart/types';
import {
  CtxIcons,
  DEFAULT_BG_MENU_ITEMS,
  DEFAULT_GROUP_MENU_ITEMS,
  type ContextMenuItem,
} from '../wxb-ui/GanttChart/GanttContextMenu';
import { processTemplateV2Api } from '../../services';
import type { ProcessTemplate, GanttNode, StageOperation, GanttConstraint } from '../ProcessTemplateGantt/types';
import type {
  OperationCreateContext,
  OperationCreatedResult,
  TemplateConstraintLink,
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
import DeviceCoUseBindModal from './DeviceCoUseBindModal';
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

/**
 * Map a TemplateConstraintLink (resource-editor aggregate) → GanttConstraint
 * (legacy renderer type consumed by toGanttDeps). Keeps the constraint graph
 * sourced from the single resource-editor fetch instead of a duplicate request.
 */
function mapConstraint(c: TemplateConstraintLink): GanttConstraint {
  return {
    constraint_id: c.constraintId,
    from_schedule_id: c.fromScheduleId,
    from_operation_id: c.fromOperationId,
    from_operation_name: c.fromOperationName,
    from_operation_code: c.fromOperationCode,
    to_schedule_id: c.toScheduleId,
    to_operation_id: c.toOperationId,
    to_operation_name: c.toOperationName,
    to_operation_code: c.toOperationCode,
    constraint_type: c.constraintType,
    lag_time: c.lagTime,
    share_mode: c.shareMode ?? undefined,
    constraint_level: c.constraintLevel ?? undefined,
    constraint_name: c.constraintName ?? undefined,
    from_stage_name: c.fromStageName,
    to_stage_name: c.toStageName,
    from_operation_day: c.fromOperationDay,
    from_recommended_time: c.fromRecommendedTime,
    to_operation_day: c.toOperationDay,
    to_recommended_time: c.toRecommendedTime,
    from_stage_start_day: c.fromStageStartDay,
    to_stage_start_day: c.toStageStartDay,
  };
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
  // 并用设备多选弹窗(右键/批量入口共用):scheduleIds.length===1 走单操作,>1 走批量。
  const [coUsePicker, setCoUsePicker] = useState<{
    scheduleIds: number[];
    primaryId: number | null;
    candidateIds: number[];
    subtitle: string;
  } | null>(null);
  const [coUseSaving, setCoUseSaving] = useState(false);
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipSystemType, setNewEquipSystemType] = useState<string>('SUS');
  const [newEquipClass, setNewEquipClass] = useState('');
  const [newEquipModel, setNewEquipModel] = useState('');
  // ---- Add-stage state ----
  const [addStageModalOpen, setAddStageModalOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageStartDay, setNewStageStartDay] = useState('1');
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [newStageDesc, setNewStageDesc] = useState('');
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [deleteStageTarget, setDeleteStageTarget] = useState<TemplateStageSummary | null>(null);
  const [deleteStageSubmitting, setDeleteStageSubmitting] = useState(false);
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
          wxbToast.error(err?.response?.data?.error || '加载工艺模版失败');
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
      wxbToast.error(err?.response?.data?.error || '加载新增操作参考数据失败');
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
  // The resource-editor aggregate (constraints / share groups / stages) is
  // fetched once here via loadResourceEditorData and shared as the single
  // source of truth; the actions hook only re-triggers that fetch after CRUD.
  const actions = useV3EditorActions({
    templateId,
    ganttNodes: ganttData.ganttNodes,
    refreshData: ganttData.refreshData,
    onResourceRefresh: loadResourceEditorData,
  });

  // Constraint graph derived from the shared resource-editor aggregate.
  const constraints = useMemo<GanttConstraint[]>(
    () => (resourceEditorData?.constraints ?? []).map(mapConstraint),
    [resourceEditorData],
  );

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
      // 重拉 resource-editor 聚合，同步约束图(actions.refreshAll 现已收敛到它)。
      void loadResourceEditorData();
    },
    onMessage: (_type, text) => {
      if (_type === 'error') wxbToast.error(text);
      else if (_type === 'warning') wxbToast.warning(text);
      else wxbToast.success(text);
    },
  });

  // ---- Close editor-level overlays when the gantt leaves native fullscreen ----
  // These modals (QuickCreate / ShareGroup / equipment / stage dialogs) render as
  // siblings of WxbGanttChart. While the gantt is fullscreen they portal into the
  // fullscreen element (resolvePortalContainer); antd evaluates getContainer only
  // at mount, so on exit-fullscreen that host collapses and an already-open modal
  // would be left mis-positioned or stranded in the torn-down subtree. The gantt
  // already closes its own transient overlays on the same event — we mirror that
  // here for the business modals it can't reach. Closing on *exit* only keeps the
  // common open-while-fullscreen flow intact.
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) return; // only act when leaving fullscreen
      setCreateOperationModalOpen(false);
      setCreateOperationContext(null);
      setEditOperationModalOpen(false);
      setEditOperationTarget(null);
      setShowCreateEquipModal(false);
      setPendingBindTask(null);
      setAddStageModalOpen(false);
      setEditingStageId(null);
      setDeleteStageTarget(null);
      setDeleteTargets([]);
      shareService.closeModal();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [shareService]);

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
    () => toGanttDeps(constraints),
    [constraints],
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
      wxbToast.warning('请先创建阶段，再新增操作');
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
      // allSettled：任一刷新失败/挂起都不应拖垮其余刷新（审计 DYN-B2）。
      // loadResourceEditorData 同时刷新约束图（actions.refreshAll 现已收敛到它）。
      await Promise.allSettled([
        ganttData.refreshData(),
        shareService.refresh(),
        resourceView.refreshBindings(),
        loadResourceEditorData(),
      ]);
    },
    [ganttData, loadResourceEditorData, resourceView, shareService],
  );

  // Create the first / next stage. Restores the stage-management entry that
  // the V3 rewrite dropped (audit V3-STAGE-001): without it a brand-new empty
  // template can never be filled. Backend POST /process-stages is unchanged.
  // 新建/编辑阶段。补全 V3 重构时漏掉的阶段管理 UI（审计 V3-STAGE-001 及其
  // 编辑/删除延伸）。后端 /process-stages 的 POST/PUT/DELETE 均已存在。
  const handleSubmitStage = useCallback(async () => {
    const name = newStageName.trim();
    if (!name) {
      wxbToast.warning('请输入阶段名称');
      return;
    }
    const startDay = Number(newStageStartDay);
    if (!Number.isInteger(startDay) || startDay < 0) {
      wxbToast.warning('起始天需为 0 或正整数');
      return;
    }
    try {
      setStageSubmitting(true);
      if (editingStageId != null) {
        await processTemplateV2Api.updateStage(editingStageId, {
          stageName: name,
          startDay,
          description: newStageDesc.trim() || null,
        });
        wxbToast.success('阶段已更新');
      } else {
        await processTemplateV2Api.createStage(templateId, {
          stageName: name,
          stageOrder: (resourceEditorData?.stages?.length ?? 0) + 1,
          startDay,
          description: newStageDesc.trim() || undefined,
        });
        wxbToast.success('阶段已创建');
      }
      setAddStageModalOpen(false);
      setEditingStageId(null);
      setNewStageName('');
      setNewStageStartDay('0');
      setNewStageDesc('');
      // allSettled: 任一刷新挂起/失败都不拖死提交(参考审计 DYN-B2 卡死)
      // loadResourceEditorData 同时刷新约束图(actions.refreshAll 现已收敛到它)。
      await Promise.allSettled([
        ganttData.refreshData(),
        loadResourceEditorData(),
      ]);
    } catch (error: any) {
      wxbToast.error(error?.response?.data?.error || (editingStageId != null ? '更新阶段失败' : '创建阶段失败'));
    } finally {
      setStageSubmitting(false);
    }
  }, [newStageName, newStageStartDay, newStageDesc, editingStageId, resourceEditorData, templateId, ganttData, loadResourceEditorData]);

  // 打开"新增阶段"：起始天默认接续上一阶段（无阶段则首日 0）。
  const openCreateStage = useCallback(() => {
    const stages = resourceEditorData?.stages ?? [];
    const maxStart = stages.reduce((m, s) => Math.max(m, s.start_day ?? 0), -1);
    setEditingStageId(null);
    setNewStageName('');
    setNewStageStartDay(String(maxStart >= 0 ? maxStart + 1 : 0));
    setNewStageDesc('');
    setAddStageModalOpen(true);
  }, [resourceEditorData]);

  // 打开"编辑阶段"：预填当前阶段值。
  const openEditStage = useCallback((stageId: number) => {
    const stage = (resourceEditorData?.stages ?? []).find(s => s.id === stageId);
    if (!stage) { wxbToast.warning('未找到该阶段'); return; }
    setEditingStageId(stage.id);
    setNewStageName(stage.stage_name ?? '');
    setNewStageStartDay(String(stage.start_day ?? 0));
    setNewStageDesc(stage.description ?? '');
    setAddStageModalOpen(true);
  }, [resourceEditorData]);

  const openDeleteStage = useCallback((stageId: number) => {
    const stage = (resourceEditorData?.stages ?? []).find(s => s.id === stageId);
    if (!stage) { wxbToast.warning('未找到该阶段'); return; }
    setDeleteStageTarget(stage);
  }, [resourceEditorData]);

  const handleConfirmDeleteStage = useCallback(async () => {
    if (!deleteStageTarget) return;
    try {
      setDeleteStageSubmitting(true);
      await processTemplateV2Api.deleteStage(deleteStageTarget.id);
      wxbToast.success('阶段已删除');
      setDeleteStageTarget(null);
      // loadResourceEditorData 同时刷新约束图(actions.refreshAll 现已收敛到它)。
      await Promise.allSettled([
        ganttData.refreshData(),
        loadResourceEditorData(),
      ]);
    } catch (error: any) {
      wxbToast.error(error?.response?.data?.error || '删除阶段失败');
    } finally {
      setDeleteStageSubmitting(false);
    }
  }, [deleteStageTarget, ganttData, loadResourceEditorData]);

  const backgroundMenuItems = useMemo<ContextMenuItem[]>(
    () =>
      DEFAULT_BG_MENU_ITEMS.map((item) =>
        item.key === 'add-task'
          ? { ...item, label: '新增操作', disabled: resourceEditorLoading }
          : item,
      ),
    [resourceEditorLoading],
  );

  const groupMenuItems = useMemo<ContextMenuItem[]>(() => {
    // In pure-equipment view (res-equip-N / res-unbound), group ids cannot be
    // resolved to a stageId, so stage-dependent actions are omitted entirely.
    if (yAxisMode === 'equipment') {
      return DEFAULT_GROUP_MENU_ITEMS;
    }
    return [
      { key: 'add-task', label: '新增操作', icon: CtxIcons.plus, disabled: resourceEditorLoading },
      { key: 'edit-stage', label: '编辑阶段', disabled: resourceEditorLoading },
      { key: 'delete-stage', label: '删除阶段', danger: true, disabled: resourceEditorLoading, divider: true },
      ...DEFAULT_GROUP_MENU_ITEMS,
    ];
  }, [yAxisMode, resourceEditorLoading]);

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
      wxbToast.warning('未找到该操作的排程数据，请刷新后重试');
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
      // 备选(AUXILIARY)候选设备:从资源视图已加载的绑定列表回填,供弹窗多选编辑回显。
      candidateNodeIds: resourceView
        .getCandidatesForSchedule(op.id)
        .map((candidate) => candidate.resourceNodeId),
    });
    setEditOperationModalOpen(true);
  }, [findStageOperation, resourceEditorData, resourceView]);

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
      wxbToast.warning('请选择可删除的操作');
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
      wxbToast.error('未找到可删除的排程操作');
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
        wxbToast.success(deletedCount === 1 ? '操作已删除' : `已删除 ${deletedCount} 个操作`);
      }
      if (failed.length > 0) {
        const firstError = failed[0] as PromiseRejectedResult;
        const detail = firstError.reason?.response?.data?.error || '部分操作删除失败';
        wxbToast.error(detail);
      }

      await ganttData.refreshData();
      // 重拉 resource-editor 聚合，同步约束图(actions.refreshAll 现已收敛到它)。
      await loadResourceEditorData();
      await resourceView.refreshBindings();
      setDeleteTargets([]);
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || '删除操作失败');
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteTargets, ganttData, loadResourceEditorData, resourceView]);

  const handleContextAction = useCallback(
    async (action: string, task: GanttTask | null, context: GanttContextActionContext) => {
      if (action === 'add-task') {
        await openCreateOperationFromGantt(context);
        return;
      }
      if (action === 'edit-stage') {
        const sid = parseStageIdFromGroupId(context.groupId);
        if (sid) openEditStage(sid); else wxbToast.warning('请在阶段行上右键');
        return;
      }
      if (action === 'delete-stage') {
        const sid = parseStageIdFromGroupId(context.groupId);
        if (sid) openDeleteStage(sid); else wxbToast.warning('请在阶段行上右键');
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
          wxbToast.success(`已绑定到 ${equipName}`);
          await resourceView.refreshBindings();
        } catch (err: any) {
          wxbToast.error(err?.response?.data?.error || '绑定失败');
        }
        return;
      }
      if (action === 'unbind-equip') {
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        try {
          await processTemplateV2Api.batchUpdateBindings([scheduleId], null, 'PRIMARY');
          wxbToast.success('已解除设备绑定');
          await resourceView.refreshBindings();
        } catch (err: any) {
          wxbToast.error('解除绑定失败');
        }
        return;
      }
      if (action === 'bind-multi') {
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        const primary = resourceView.getBindingForSchedule(scheduleId);
        const candidates = resourceView.getCandidatesForSchedule(scheduleId);
        setCoUsePicker({
          scheduleIds: [scheduleId],
          primaryId: primary?.resourceNodeId ?? null,
          candidateIds: candidates.map((c) => c.resourceNodeId),
          subtitle: `为操作「${task.label}」配置并用设备(这道操作会同时占用所选设备)`,
        });
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
    [shareService, handleTaskEdit, handleTaskDelete, equipmentNodes, resourceView, openCreateOperationFromGantt, openEditStage, openDeleteStage],
  );

  // ---- Build final task menu including share sub-items + equipment ----
  const buildTaskMenu = useCallback(
    (task: GanttTask): ContextMenuItem[] => {
      const scheduleId = task.data?.scheduleId as number | undefined;
      const currentBinding = scheduleId
        ? resourceView.getBindingForSchedule(scheduleId)
        : null;
      const coUseCount = scheduleId
        ? resourceView.getCandidatesForSchedule(scheduleId).length
        : 0;

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
        { key: 'div-multi', label: '—', divider: true },
        { key: 'bind-multi', label: '编辑并用设备…（多台）' },
        { key: 'div-unbind', label: '—', divider: true },
        { key: 'unbind-equip', label: '解除绑定（含并用）', danger: true, disabled: !currentBinding },
        { key: 'div-create', label: '—', divider: true },
        { key: 'create-equip', label: '+ 新建设备...' },
      ];

      const bindLabel = currentBinding
        ? `设备: ${currentBinding.name}${coUseCount > 0 ? ` +并用${coUseCount}` : ''}`
        : '绑定设备';
      const baseItems: ContextMenuItem[] = [
        { key: 'edit', label: '编辑操作' },
        { key: 'bind-equipment', label: bindLabel, children: bindChildren },
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
        wxbToast.warning('至少选择 2 个操作才能创建共享组');
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
        wxbToast.success('已链接为共享');
        await shareService.refresh();
        await ganttData.refreshData();
      } catch (err: any) {
        wxbToast.error(err?.response?.data?.error || '创建共享组失败');
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
      wxbToast.warning('请先在甘特图中选择操作');
      return;
    }
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, nodeId, 'PRIMARY');
      const name = equipmentNodes.find(n => n.id === nodeId)?.nodeName || '';
      wxbToast.success(`已绑定 ${scheduleIds.length} 个操作到 ${name}`);
      await resourceView.refreshBindings();
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || '批量绑定失败');
    }
  }, [equipmentNodes, resourceView]);

  const handleBatchUnbind = useCallback(async (taskIds: string[]) => {
    const scheduleIds = taskIds
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(Number.isFinite);
    if (!scheduleIds.length) {
      wxbToast.warning('请先在甘特图中选择操作');
      return;
    }
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, null, 'PRIMARY');
      wxbToast.success(`已解除 ${scheduleIds.length} 个操作的设备绑定`);
      await resourceView.refreshBindings();
    } catch (err: any) {
      wxbToast.error('解除绑定失败');
    }
  }, [resourceView]);

  // ---- Open the 并用 multi-device picker for a batch of selected operations ----
  const handleBatchCoUse = useCallback((selectedTaskIds: string[]) => {
    const scheduleIds = selectedTaskIds
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(Number.isFinite);
    if (!scheduleIds.length) {
      wxbToast.warning('请先在甘特图中选择操作');
      return;
    }
    setCoUsePicker({
      scheduleIds,
      primaryId: null,
      candidateIds: [],
      subtitle: `将对所选 ${scheduleIds.length} 个操作设置同一组并用设备（会覆盖各自现有的设备绑定）`,
    });
  }, []);

  // ---- Persist the picker result: single → updateScheduleBindings, batch → batchUpdateScheduleBindings ----
  const handleCoUseConfirm = useCallback(async (primaryNodeId: number | null, candidateNodeIds: number[]) => {
    if (!coUsePicker) return;
    const { scheduleIds } = coUsePicker;
    setCoUseSaving(true);
    try {
      if (scheduleIds.length === 1) {
        await processTemplateV2Api.updateScheduleBindings(scheduleIds[0], primaryNodeId, candidateNodeIds);
      } else {
        await processTemplateV2Api.batchUpdateScheduleBindings(scheduleIds, primaryNodeId, candidateNodeIds);
      }
      const deviceCount = (primaryNodeId != null ? 1 : 0) + candidateNodeIds.length;
      wxbToast.success(
        primaryNodeId != null
          ? `已为 ${scheduleIds.length} 个操作设置 ${deviceCount} 台并用设备`
          : `已解除 ${scheduleIds.length} 个操作的设备绑定`,
      );
      setCoUsePicker(null);
      await resourceView.refreshBindings();
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || '设置并用设备失败');
    } finally {
      setCoUseSaving(false);
    }
  }, [coUsePicker, resourceView]);

  // ---- Create equipment handler ----
  const handleCreateEquipment = useCallback(async () => {
    if (!newEquipName.trim()) { wxbToast.warning('请输入设备名称'); return; }
    // 后端对非 VIRTUAL 设备要求 equipment_class 与 equipment_model 皆必填（审计 RV-01）。
    if (!newEquipClass.trim() || !newEquipModel.trim()) { wxbToast.warning('请填写设备类别与设备型号'); return; }
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
        equipmentClass: newEquipClass.trim(),
        equipmentModel: newEquipModel.trim(),
        nodeScope: 'DEPARTMENT',
        departmentCode: 'USP',
      } as any);
      await refreshEquipmentNodes();

      if (pendingBindTask) {
        const sid = pendingBindTask.data?.scheduleId as number | undefined;
        if (sid) {
          await processTemplateV2Api.batchUpdateBindings([sid], newId, 'PRIMARY');
          await resourceView.refreshBindings();
          wxbToast.success(`已创建设备 ${newEquipName} 并绑定`);
        }
      } else {
        wxbToast.success(`设备 ${newEquipName} 已创建`);
      }
      setShowCreateEquipModal(false);
      setNewEquipName(''); setNewEquipClass(''); setNewEquipModel(''); setPendingBindTask(null);
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || '创建设备失败');
    }
  }, [newEquipName, newEquipSystemType, newEquipClass, newEquipModel, pendingBindTask, resourceView, refreshEquipmentNodes]);

  // ---- Selection-panel extra actions (batch bind / unbind / create equip) ----
  // Stable reference so GanttSelectionPanel's React.memo isn't defeated by a
  // fresh inline function on every editor render (A16). setState setters are
  // identity-stable, so only the three handlers/options drive the deps.
  const renderSelectionPanelExtraActions = useCallback(
    (selectedTaskIds: string[]) => (
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
        <WxbButton
          variant="secondary"
          size="sm"
          style={{ width: '100%' }}
          onClick={() => handleBatchCoUse(selectedTaskIds)}
        >
          并用绑定…（多台）
        </WxbButton>
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
    ),
    [handleBatchBind, handleBatchUnbind, handleBatchCoUse, equipmentBindingOptions],
  );

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
        onAddStage={openCreateStage}
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
          onGroupDragEnd={actions.handleGroupDragEnd}
          onTasksDragEnd={actions.handleTasksDragEnd}
          onTaskEdit={handleTaskEdit}
          onTaskDoubleClick={handleTaskEdit}
          onTaskDelete={handleTaskDelete}
          onTasksDelete={handleTasksDelete}
          onContextAction={handleContextAction}
          showSelectionPanel
          onCreateShareGroup={handleQuickLink}
          selectionPanelExtraActions={renderSelectionPanelExtraActions}
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
          onCreated={async () => {}}
          onCancel={() => {
            setEditOperationModalOpen(false);
            setEditOperationTarget(null);
          }}
          onUpdated={async () => {
            setEditOperationModalOpen(false);
            setEditOperationTarget(null);
            // loadResourceEditorData 同时刷新约束图(actions.refreshAll 现已收敛到它)。
            await Promise.all([
              ganttData.refreshData(),
              shareService.refresh(),
              resourceView.refreshBindings(),
              loadResourceEditorData(),
            ]);
          }}
        />
      )}

      {/* Create Equipment Modal — Wxb Design System */}
      <DeviceCoUseBindModal
        open={coUsePicker !== null}
        title={coUsePicker && coUsePicker.scheduleIds.length > 1 ? '批量并用绑定' : '编辑并用设备'}
        subtitle={coUsePicker?.subtitle}
        resourceNodes={resourceEditorData?.resourceTree ?? []}
        initialPrimaryId={coUsePicker?.primaryId ?? null}
        initialCandidateIds={coUsePicker?.candidateIds ?? []}
        confirmLoading={coUseSaving}
        onCancel={() => setCoUsePicker(null)}
        onConfirm={handleCoUseConfirm}
      />

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
          <WxbInput
            label="设备型号"
            value={newEquipModel}
            onChange={e => setNewEquipModel(e.target.value)}
            placeholder="例如: XDR-200"
          />
          {pendingBindTask && (
            <div className="wxb-equip-bind-hint">
              提示：创建后将自动绑定到操作「{pendingBindTask.label}」
            </div>
          )}
        </div>
      </WxbModal>

      {/* Add / Edit Stage Modal — Wxb Design System (audit V3-STAGE-001 + 编辑/删除补全) */}
      <WxbModal
        open={addStageModalOpen}
        title={editingStageId != null ? '编辑阶段' : '新增阶段'}
        okText={editingStageId != null ? '保存修改' : '创建阶段'}
        cancelText="取消"
        confirmLoading={stageSubmitting}
        onOk={() => void handleSubmitStage()}
        onCancel={() => { setAddStageModalOpen(false); setEditingStageId(null); setNewStageName(''); setNewStageStartDay('0'); setNewStageDesc(''); }}
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
            label="起始天（阶段从模版第几天开始，首日 = 0）"
            value={newStageStartDay}
            onChange={e => setNewStageStartDay(e.target.value)}
            placeholder="0"
          />
          <WxbInput
            label="描述（可选）"
            value={newStageDesc}
            onChange={e => setNewStageDesc(e.target.value)}
            placeholder="阶段说明"
          />
        </div>
      </WxbModal>

      {/* Delete Stage Confirm */}
      <WxbModal
        open={!!deleteStageTarget}
        title="删除阶段"
        okText="删除阶段"
        cancelText="取消"
        okVariant="danger"
        confirmLoading={deleteStageSubmitting}
        onOk={() => void handleConfirmDeleteStage()}
        onCancel={() => setDeleteStageTarget(null)}
        width={440}
        destroyOnClose
      >
        <div className="wxb-template-delete-confirm">
          <p>确定删除阶段「{deleteStageTarget?.stage_name}」吗？</p>
          <p style={{ color: 'var(--wx-fg-3, #5A6B7E)', fontSize: 13 }}>
            该阶段下的工序{deleteStageTarget?.operation_count ? `（${deleteStageTarget.operation_count} 个）` : ''}将被一并删除；若已被批次引用则无法删除。此操作不可撤销。
          </p>
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
