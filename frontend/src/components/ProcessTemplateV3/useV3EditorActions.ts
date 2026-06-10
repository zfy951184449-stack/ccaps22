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
import { buildDraggedOperationTimingUpdate } from './dragTiming';

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
  /** Handle cascade group/equipment summary-bar drag end — shifts all affected operations by deltaHours */
  handleGroupDragEnd: (groupId: string, deltaHours: number, affectedTaskIds: string[]) => Promise<boolean>;
  /** Handle multi-select drag end — moves each task to its provided new start/end in one batch */
  handleTasksDragEnd: (updates: Array<{ taskId: string; newStart: number; newEnd: number }>) => Promise<boolean>;
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

  // ---- Persist a single operation's new timing (no refresh) ----
  // Returns true on success, false when the task can't be resolved or the PUT fails.
  // Callers are responsible for refreshing once after a batch.
  const persistOperationTime = useCallback(
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
      // Since opData stores operation_day relative to stage, and
      // node.start_day was computed as stageStartDay + opData.operation_day + dayOffset,
      // we can derive stageStartDay from the current absolute position.
      const originalAbsoluteDay = node.start_day ?? 0;
      const originalOpDay = opData.operation_day ?? 0;
      const originalDayOffset = opData.recommended_day_offset ?? 0;
      const stageStartDay = originalAbsoluteDay - originalOpDay - originalDayOffset;

      await processTemplateV2Api.updateStageOperation(
        scheduleId,
        buildDraggedOperationTimingUpdate(newStart, newEnd, stageStartDay),
      );
      return true;
    },
    [ganttNodes],
  );

  // ---- Drag end handler (single task) ----
  const handleDragEnd = useCallback(
    async (taskId: string, newStart: number, newEnd: number): Promise<boolean> => {
      try {
        const ok = await persistOperationTime(taskId, newStart, newEnd);
        if (!ok) return false;
        await refreshData();
        return true;
      } catch (err: any) {
        message.error(err?.response?.data?.error || '更新操作时间失败');
        return false;
      }
    },
    [persistOperationTime, refreshData],
  );

  // ---- Resize end handler ----
  const handleResizeEnd = useCallback(
    async (taskId: string, newStart: number, newEnd: number): Promise<boolean> => {
      return handleDragEnd(taskId, newStart, newEnd);
    },
    [handleDragEnd],
  );

  // ---- Compute a task's current absolute start/end (hours) from the node tree ----
  // start_day is the absolute day; recommended_time is hour-of-day; standard_time is duration.
  const getTaskCurrentSpan = useCallback(
    (taskId: string): { start: number; end: number } | null => {
      const scheduleId = parseScheduleId(taskId);
      if (!scheduleId) return null;
      const node = findOperationNode(ganttNodes, scheduleId);
      if (!node) return null;
      const opData = node.data as StageOperation | undefined;
      if (!opData) return null;

      const absoluteDay = node.start_day ?? 0;
      const startHour = absoluteDay * 24 + (opData.recommended_time ?? 0);
      const rawDuration =
        typeof opData.standard_time === 'string'
          ? parseFloat(opData.standard_time)
          : opData.standard_time;
      const duration = rawDuration && rawDuration > 0 ? rawDuration : 4;
      return { start: startHour, end: startHour + duration };
    },
    [ganttNodes],
  );

  // ---- Persist a batch of operation moves concurrently, refresh once, report failures ----
  // Always refreshes (even on partial failure) so the canvas snaps back to server truth.
  // Returns true only when every update succeeded.
  const persistBatch = useCallback(
    async (updates: Array<{ taskId: string; newStart: number; newEnd: number }>): Promise<boolean> => {
      if (updates.length === 0) return true;

      const results = await Promise.allSettled(
        updates.map((u) => persistOperationTime(u.taskId, u.newStart, u.newEnd)),
      );

      let failed = 0;
      for (const r of results) {
        if (r.status === 'rejected' || r.value === false) failed += 1;
      }

      // Refresh once regardless — partial failures must fall back to server truth.
      await refreshData();

      if (failed > 0) {
        message.error(`${updates.length} 条中 ${failed} 条更新失败，已回到服务端最新状态`);
        return false;
      }
      return true;
    },
    [persistOperationTime, refreshData],
  );

  // ---- Cascade group/equipment drag end ----
  // Shifts every affected operation by deltaHours from its CURRENT span, in one batch.
  // Reading current spans (not a captured snapshot) keeps the undo path — which re-invokes
  // this handler with -deltaHours against the refreshed positions — self-consistent.
  const handleGroupDragEnd = useCallback(
    async (_groupId: string, deltaHours: number, affectedTaskIds: string[]): Promise<boolean> => {
      const updates: Array<{ taskId: string; newStart: number; newEnd: number }> = [];
      for (const taskId of affectedTaskIds) {
        const span = getTaskCurrentSpan(taskId);
        if (!span) continue;
        updates.push({ taskId, newStart: span.start + deltaHours, newEnd: span.end + deltaHours });
      }
      return persistBatch(updates);
    },
    [getTaskCurrentSpan, persistBatch],
  );

  // ---- Multi-select drag end ----
  // Each update already carries its target absolute start/end from the canvas.
  const handleTasksDragEnd = useCallback(
    async (updates: Array<{ taskId: string; newStart: number; newEnd: number }>): Promise<boolean> => {
      return persistBatch(updates);
    },
    [persistBatch],
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
    handleGroupDragEnd,
    handleTasksDragEnd,
    handleDeleteTask,
    handleAutoSchedule,
    refreshAll,
  };
}
