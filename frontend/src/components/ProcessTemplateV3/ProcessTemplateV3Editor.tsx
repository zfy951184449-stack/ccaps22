/**
 * ProcessTemplateV3Editor — 全屏甘特图编辑器
 *
 * 以 WxbGanttChart 为核心，集成 ganttAdapter、useGanttData、
 * useShareGroupService、useV3EditorActions。
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { message } from 'antd';
import { WxbGanttChart } from '../wxb-ui';
import { WxbSkeleton, WxbEmpty } from '../wxb-ui';
import { WxbCard } from '../wxb-ui';
import type { GanttTask } from '../wxb-ui/GanttChart/types';
import type { ContextMenuItem } from '../wxb-ui/GanttChart/GanttContextMenu';
import { processTemplateV2Api } from '../../services';
import type { ProcessTemplate, GanttNode, StageOperation } from '../ProcessTemplateGantt/types';
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
import V3EditorHeader from './V3EditorHeader';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcessTemplateV3EditorProps {
  templateId: number;
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessTemplateV3Editor: React.FC<ProcessTemplateV3EditorProps> = ({ templateId }) => {
  // ---- Template metadata ----
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [showTimeWindows, setShowTimeWindows] = useState(false); // default off

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

  // ---- Gantt data (stages → nodes → timeBlocks) ----
  const ganttData = useGanttData(
    template ?? { id: 0, template_code: '', template_name: '', description: '', total_days: 0 },
  );

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

  // ---- Callbacks ----
  const handleTaskEdit = useCallback((task: GanttTask) => {
    // For now, log and show info — full inspector panel is a future enhancement
    message.info(`编辑 ${task.label} (ID: ${task.id})`);
  }, []);

  const handleTaskDelete = useCallback(
    async (task: GanttTask) => {
      await actions.handleDeleteTask(task.id);
    },
    [actions],
  );

  const handleContextAction = useCallback(
    (action: string, task: GanttTask | null) => {
      if (!task) return;

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
          void handleTaskDelete(task);
          break;
        default:
          break;
      }
    },
    [shareService, handleTaskEdit, handleTaskDelete],
  );

  // ---- Build final task menu including share sub-items ----
  const buildTaskMenu = useCallback(
    (task: GanttTask): ContextMenuItem[] => {
      const baseItems: ContextMenuItem[] = [
        { key: 'edit', label: '编辑操作' },
        { key: 'delete', label: '删除操作', danger: true },
        { key: 'divider-share', label: '—', divider: true },
      ];
      const shareItems = shareService.buildShareMenuItems(task);
      return [...baseItems, ...shareItems];
    },
    [shareService],
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

  // Static menu for the chart (dynamic per-task is handled via onContextAction)
  const staticTaskMenu: ContextMenuItem[] = [
    { key: 'edit', label: '编辑操作' },
    { key: 'delete', label: '删除操作', danger: true },
    { key: 'divider-share', label: '—', divider: true },
    { key: 'share-new', label: '新建共享组' },
  ];

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
      />

      {/* Gantt Chart — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WxbGanttChart
          tasks={tasks}
          groups={groups}
          dependencies={dependencies}
          links={links}
          highlightedLinkIds={shareService.highlightedLinkIds}
          taskMenuItems={staticTaskMenu}
          onTaskDragEnd={actions.handleDragEnd}
          onTaskResizeEnd={actions.handleResizeEnd}
          onTaskEdit={handleTaskEdit}
          onTaskDelete={handleTaskDelete}
          onContextAction={handleContextAction}
          showSelectionPanel
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
    </div>
  );
};

export default ProcessTemplateV3Editor;
