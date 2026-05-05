/**
 * useV3EditorActions — V3 编辑器操作 Hook
 *
 * 从旧版 useGanttInteraction 提取的纯 API 调用逻辑。
 * 负责：拖拽更新、约束加载、自动排程、删除等 CRUD 操作。
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { processTemplateV2Api } from '../../services';
import type { GanttConstraint, ShareGroup, GanttNode, StageOperation } from '../ProcessTemplateGantt/types';
import type { TemplateConstraintLink, TemplateShareGroupSummary } from '../ProcessTemplateV2/types';

const API = '/api';

// ---------------------------------------------------------------------------
// Options & Return types
// ---------------------------------------------------------------------------

export interface UseV3EditorActionsOptions {
  templateId: number;
  ganttNodes: GanttNode[];
  refreshData: () => Promise<void>;
}

export interface UseV3EditorActionsReturn {
  /** Loaded constraint list */
  constraints: GanttConstraint[];
  /** Loaded share groups */
  shareGroups: ShareGroup[];
  /** Schedule ID → conflict reason map */
  conflictMap: Record<number, string>;
  /** Loading state */
  loading: boolean;
  /** Handle drag end on a task bar */
  handleDragEnd: (taskId: string, newStart: number, newEnd: number) => Promise<boolean>;
  /** Handle resize end on a task bar */
  handleResizeEnd: (taskId: string, newStart: number, newEnd: number) => Promise<boolean>;
  /** Delete a scheduled operation */
  handleDeleteTask: (taskId: string) => Promise<void>;
  /** Trigger auto-schedule for the template */
  handleAutoSchedule: () => Promise<void>;
  /** Reload constraints and share groups */
  refreshAll: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract numeric schedule ID from a gantt task ID string.
 * Task IDs follow the pattern: `op_{stageId}_{scheduleId}` or `tw_{stageId}_{scheduleId}`
 */
const parseScheduleId = (taskId: string): number | null => {
  const parts = taskId.split('_');
  const lastPart = parts[parts.length - 1];
  const num = Number(lastPart);
  return Number.isFinite(num) && num > 0 ? num : null;
};

/**
 * Find a GanttNode (operation) by schedule ID from the gantt node tree.
 */
const findOperationNode = (nodes: GanttNode[], scheduleId: number): GanttNode | null => {
  for (const node of nodes) {
    if (node.type === 'operation') {
      const opData = node.data as StageOperation | undefined;
      if (opData?.id === scheduleId) return node;
    }
    if (node.children) {
      const found = findOperationNode(node.children, scheduleId);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Map TemplateConstraintLink (V2 API response) → GanttConstraint (legacy renderer type).
 */
const mapConstraint = (c: TemplateConstraintLink): GanttConstraint => ({
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
});

/**
 * Map TemplateShareGroupSummary → ShareGroup (legacy renderer type).
 */
const mapShareGroup = (g: TemplateShareGroupSummary): ShareGroup => ({
  id: g.id,
  template_id: g.templateId,
  group_code: g.groupCode,
  group_name: g.groupName,
  share_mode: g.shareMode,
  operation_count: g.memberCount,
  members: (g.members ?? []).map((m) => ({
    id: m.id,
    schedule_id: m.scheduleId,
    operation_name: m.operationName,
    required_people: m.requiredPeople,
    stage_name: m.stageName,
  })),
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useV3EditorActions({
  templateId,
  ganttNodes,
  refreshData,
}: UseV3EditorActionsOptions): UseV3EditorActionsReturn {
  const [constraints, setConstraints] = useState<GanttConstraint[]>([]);
  const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- Load constraints + share groups from resource-editor endpoint ----
  const loadAll = useCallback(async () => {
    if (!templateId) return;
    try {
      setLoading(true);
      const data = await processTemplateV2Api.getResourceEditor(templateId);
      setConstraints((data.constraints ?? []).map(mapConstraint));
      setShareGroups((data.shareGroups ?? []).map(mapShareGroup));
    } catch (err) {
      console.error('[useV3EditorActions] Failed to load editor data:', err);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---- Conflict map: scheduleId → reason ----
  const conflictMap = useMemo(() => {
    const map: Record<number, string> = {};
    // Simple heuristic: detect constraint conflicts from loaded data
    // This can be enriched once validation endpoint is integrated
    return map;
  }, []);

  // ---- Drag end handler ----
  const handleDragEnd = useCallback(
    async (taskId: string, newStart: number, newEnd: number): Promise<boolean> => {
      const scheduleId = parseScheduleId(taskId);
      if (!scheduleId) return false;

      const node = findOperationNode(ganttNodes, scheduleId);
      if (!node) return false;
      const opData = node.data as StageOperation | undefined;
      if (!opData) return false;

      // Convert absolute hours → relative fields
      // newStart is absolute hours (e.g. Day 2 at 9:00 = 57)
      // API expects: operation_day (relative to stage), recommended_time (0-23.9)
      //
      // We need the stage's start_day to compute relative operation_day.
      // The stage start_day can be found from the parent node or from opData.
      // Since opData stores operation_day relative to stage, and
      // node.start_day was computed as stageStartDay + opData.operation_day + dayOffset,
      // we can derive stageStartDay from the original absolute position.
      const originalAbsoluteDay = node.start_day ?? 0;
      const originalOpDay = opData.operation_day ?? 0;
      const originalDayOffset = opData.recommended_day_offset ?? 0;
      const stageStartDay = originalAbsoluteDay - originalOpDay - originalDayOffset;

      const newAbsoluteDay = Math.floor(newStart / 24);
      const newRecommendedTime = newStart - newAbsoluteDay * 24; // 0-24 range
      const newOperationDay = Math.max(0, newAbsoluteDay - stageStartDay);
      const newDayOffset = newAbsoluteDay - stageStartDay - newOperationDay;

      // Compute window fields relative to the new position
      const duration = newEnd - newStart;
      const windowPadding = 2; // hours of padding around operation
      const windowStartAbsolute = newStart - windowPadding;
      const windowEndAbsolute = newStart + Math.max(duration, windowPadding);
      const windowStartDay = Math.floor(windowStartAbsolute / 24);
      const windowEndDay = Math.floor(windowEndAbsolute / 24);

      const toHourValue = (v: number) => {
        const rem = v % 24;
        return rem < 0 ? rem + 24 : rem;
      };

      try {
        await processTemplateV2Api.updateStageOperation(scheduleId, {
          operationDay: newOperationDay,
          recommendedTime: newRecommendedTime,
          recommendedDayOffset: newDayOffset,
          windowStartTime: toHourValue(windowStartAbsolute),
          windowStartDayOffset: windowStartDay - stageStartDay - newOperationDay,
          windowEndTime: toHourValue(windowEndAbsolute),
          windowEndDayOffset: windowEndDay - stageStartDay - newOperationDay,
        });
        await refreshData();
        return true;
      } catch (err: any) {
        message.error(err?.response?.data?.error || '更新操作时间失败');
        return false;
      }
    },
    [ganttNodes, refreshData],
  );

  // ---- Resize end handler ----
  const handleResizeEnd = useCallback(
    async (taskId: string, newStart: number, newEnd: number): Promise<boolean> => {
      return handleDragEnd(taskId, newStart, newEnd);
    },
    [handleDragEnd],
  );

  // ---- Delete task ----
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      const scheduleId = parseScheduleId(taskId);
      if (!scheduleId) return;

      try {
        await processTemplateV2Api.deleteStageOperation(scheduleId);
        message.success('操作已删除');
        await refreshData();
        await loadAll();
      } catch (err: any) {
        message.error(err?.response?.data?.error || '删除操作失败');
      }
    },
    [refreshData, loadAll],
  );

  // ---- Auto-schedule ----
  const handleAutoSchedule = useCallback(async () => {
    try {
      setLoading(true);
      await axios.post(`${API}/process-templates/${templateId}/auto-schedule`);
      message.success('自动排程完成');
      await refreshData();
      await loadAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '自动排程失败');
    } finally {
      setLoading(false);
    }
  }, [templateId, refreshData, loadAll]);

  // ---- Refresh all ----
  const refreshAll = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  return {
    constraints,
    shareGroups,
    conflictMap,
    loading,
    handleDragEnd,
    handleResizeEnd,
    handleDeleteTask,
    handleAutoSchedule,
    refreshAll,
  };
}
