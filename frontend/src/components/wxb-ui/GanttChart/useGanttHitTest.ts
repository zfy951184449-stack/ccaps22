/**
 * WxbGanttChart v3.2 — Hit Testing
 * Given canvas coordinates, find which task or group bar is under the cursor
 */
import { useCallback, useMemo } from 'react';
import type { GanttTask, GanttGroup, FlatRow, HitTestResult, GanttTimeScale } from './types';
import { ROW_HEIGHT, HEADER_HEIGHT, BAR_HEIGHT, STAGE_BAR_HEIGHT, HEATMAP_HEIGHT } from './constants';

const EDGE_THRESHOLD = 6; // px from edge to trigger resize

export function useGanttHitTest(
  tasks: GanttTask[],
  groups: GanttGroup[],
  flatRows: FlatRow[],
  taskRowMap: Map<string, number>,
  startHour: number,
  hourWidth: number,
  timeScale?: GanttTimeScale
) {
  // Build row→tasks index via useMemo (auto-syncs with data changes)
  const rowTasksMap = useMemo(() => {
    const map = new Map<number, GanttTask[]>();
    for (const task of tasks) {
      const row = taskRowMap.get(task.id);
      if (row === undefined) continue;
      if (!map.has(row)) map.set(row, []);
      map.get(row)!.push(task);
    }
    return map;
  }, [tasks, taskRowMap]);

  // Build group span map (min/max hours for each group from ALL tasks)
  const groupSpanMap = useMemo(() => {
    const spans = new Map<string, { min: number; max: number }>();
    for (const task of tasks) {
      if (!task.groupId) continue;
      const span = spans.get(task.groupId);
      if (span) {
        if (task.start < span.min) span.min = task.start;
        if (task.end > span.max) span.max = task.end;
      } else {
        spans.set(task.groupId, { min: task.start, max: task.end });
      }
    }
    // Propagate up through parent groups
    const groupParent = new Map<string, string>();
    for (const g of groups) {
      if (g.parentId) groupParent.set(g.id, g.parentId);
    }
    for (const [groupId, span] of Array.from(spans.entries())) {
      let current = groupId;
      while (groupParent.has(current)) {
        const parentId = groupParent.get(current)!;
        const parentSpan = spans.get(parentId);
        if (parentSpan) {
          if (span.min < parentSpan.min) parentSpan.min = span.min;
          if (span.max > parentSpan.max) parentSpan.max = span.max;
        } else {
          spans.set(parentId, { min: span.min, max: span.max });
        }
        current = parentId;
      }
    }
    return spans;
  }, [tasks, groups]);

  const groupById = useMemo(
    () => new Map(groups.map(group => [group.id, group])),
    [groups],
  );

  const hitTest = useCallback((
    canvasX: number,
    canvasY: number,
    scrollX: number,
    scrollY: number,
    showHeatmap: boolean
  ): HitTestResult | null => {
    const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);
    const worldX = canvasX + scrollX;
    const worldY = canvasY + scrollY - totalHeaderH;

    if (worldY < 0) return null;

    const rowIndex = Math.floor(worldY / ROW_HEIGHT);

    // 1. Try to hit task bars first (higher priority)
    const rowTasks = rowTasksMap.get(rowIndex);
    if (rowTasks) {
      for (const task of rowTasks) {
        const barH = task.type === 'stage' ? STAGE_BAR_HEIGHT : BAR_HEIGHT;
        const barTop = rowIndex * ROW_HEIGHT + (ROW_HEIGHT - barH) / 2;
        const barBottom = barTop + barH;

        // Check Y bounds
        if (worldY < barTop || worldY > barBottom) continue;

        const taskX = timeScale ? timeScale.hourToX(task.start) : (task.start - startHour) * hourWidth;
        const taskW = Math.max(
          timeScale ? timeScale.widthBetween(task.start, task.end) : (task.end - task.start) * hourWidth,
          4,
        );

        // Check X bounds
        if (worldX < taskX || worldX > taskX + taskW) continue;

        // Determine edge (resize enabled for timeWindow or resizable tasks)
        let edge: HitTestResult['edge'] = 'body';
        if (task.type === 'timeWindow' || task.resizable) {
          if (Math.abs(worldX - taskX) < EDGE_THRESHOLD) edge = 'resize-start';
          else if (Math.abs(worldX - (taskX + taskW)) < EDGE_THRESHOLD) edge = 'resize-end';
        }

        return { taskId: task.id, task, edge, row: rowIndex, hitType: 'task' };
      }
    }

    // 2. Try to hit group bars (lower priority, only if no task hit)
    if (rowIndex < flatRows.length) {
      const flatRow = flatRows[rowIndex];
      if (flatRow && flatRow.type === 'group') {
        const group = groupById.get(flatRow.id);
        if (group?.showSummaryBar === false) return null;

        const span = groupSpanMap.get(flatRow.id);
        if (span) {
          const barH = BAR_HEIGHT;
          const barTop = rowIndex * ROW_HEIGHT + (ROW_HEIGHT - barH) / 2;
          const barBottom = barTop + barH;

          if (worldY >= barTop && worldY <= barBottom) {
            const groupX = timeScale ? timeScale.hourToX(span.min) : (span.min - startHour) * hourWidth;
            const groupW = Math.max(
              timeScale ? timeScale.widthBetween(span.min, span.max) : (span.max - span.min) * hourWidth,
              4,
            );

            if (worldX >= groupX && worldX <= groupX + groupW) {
              // Create a synthetic "group task" for the hit result
              const syntheticTask: GanttTask = {
                id: flatRow.id,
                label: flatRow.label,
                start: span.min,
                end: span.max,
                color: flatRow.color,
                draggable: true,
              };
              return {
                taskId: flatRow.id,
                task: syntheticTask,
                edge: 'body',
                row: rowIndex,
                hitType: 'group',
                groupId: flatRow.id,
              };
            }
          }
        }
      }
    }

    return null;
  }, [startHour, hourWidth, timeScale, rowTasksMap, groupSpanMap, flatRows, groupById]);

  return { hitTest };
}
