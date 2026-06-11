/**
 * useV3EditorActions — V3 编辑器操作 Hook
 *
 * 从旧版 useGanttInteraction 提取的纯 API 调用逻辑。
 * 负责：拖拽更新、自动排程、删除等 CRUD 操作。CRUD 完成后通过
 * onResourceRefresh 触发编辑器重拉 resource-editor 聚合（约束/共享组等），
 * 该聚合的唯一数据源在编辑器侧，避免本 hook 重复发起聚合查询。
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { wxbToast } from '../wxb-ui';
import { processTemplateV2Api } from '../../services';
import type { GanttNode, StageOperation } from '../ProcessTemplateGantt/types';
import { buildDraggedOperationTimingUpdate } from './dragTiming';

const API = '/api';

// ---------------------------------------------------------------------------
// Options & Return types
// ---------------------------------------------------------------------------

export interface UseV3EditorActionsOptions {
  templateId: number;
  ganttNodes: GanttNode[];
  refreshData: () => Promise<void>;
  /**
   * Re-pull the resource-editor aggregate (constraints/share-groups/stages/…).
   * The editor owns that fetch as the single source of truth; this hook only
   * triggers it after CRUD operations so the constraint graph stays in sync.
   */
  onResourceRefresh?: () => Promise<unknown>;
}

export interface UseV3EditorActionsReturn {
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
  /** Re-pull the resource-editor aggregate (constraints / share groups / …) */
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useV3EditorActions({
  templateId,
  ganttNodes,
  refreshData,
  onResourceRefresh,
}: UseV3EditorActionsOptions): UseV3EditorActionsReturn {
  const [loading, setLoading] = useState(false);

  // ---- Re-pull the resource-editor aggregate (single source of truth lives
  //      in the editor; this just forwards the request after CRUD). ----
  const refreshResource = useCallback(async () => {
    if (!onResourceRefresh) return;
    await onResourceRefresh();
  }, [onResourceRefresh]);

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
        wxbToast.error(err?.response?.data?.error || '更新操作时间失败');
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
        wxbToast.error(`${updates.length} 条中 ${failed} 条更新失败，已回到服务端最新状态`);
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
        wxbToast.success('操作已删除');
        await refreshData();
        await refreshResource();
      } catch (err: any) {
        wxbToast.error(err?.response?.data?.error || '删除操作失败');
      }
    },
    [refreshData, refreshResource],
  );

  // ---- Auto-schedule ----
  const handleAutoSchedule = useCallback(async () => {
    try {
      setLoading(true);
      await axios.post(`${API}/process-templates/${templateId}/auto-schedule`);
      wxbToast.success('自动排程完成');
      await refreshData();
      await refreshResource();
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || '自动排程失败');
    } finally {
      setLoading(false);
    }
  }, [templateId, refreshData, refreshResource]);

  // ---- Refresh all ----
  const refreshAll = useCallback(async () => {
    await refreshResource();
  }, [refreshResource]);

  return {
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
