/**
 * WxbGanttChart v2 — Hit Testing
 * Given canvas coordinates, find which task (and edge) is under the cursor
 */
import { useCallback, useMemo } from 'react';
import type { GanttTask, HitTestResult } from './types';
import { ROW_HEIGHT, HEADER_HEIGHT, BAR_HEIGHT, STAGE_BAR_HEIGHT, HEATMAP_HEIGHT } from './constants';

const EDGE_THRESHOLD = 6; // px from edge to trigger resize

export function useGanttHitTest(
  tasks: GanttTask[],
  taskRowMap: Map<string, number>,
  startHour: number,
  hourWidth: number
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
    const rowTasks = rowTasksMap.get(rowIndex);
    if (!rowTasks) return null;

    for (const task of rowTasks) {
      const barH = task.type === 'stage' ? STAGE_BAR_HEIGHT : BAR_HEIGHT;
      const barTop = rowIndex * ROW_HEIGHT + (ROW_HEIGHT - barH) / 2;
      const barBottom = barTop + barH;

      // Check Y bounds
      if (worldY < barTop || worldY > barBottom) continue;

      const taskX = (task.start - startHour) * hourWidth;
      const taskW = Math.max((task.end - task.start) * hourWidth, 4);

      // Check X bounds
      if (worldX < taskX || worldX > taskX + taskW) continue;

      // Determine edge
      let edge: HitTestResult['edge'] = 'body';
      if (task.type === 'timeWindow') {
        if (Math.abs(worldX - taskX) < EDGE_THRESHOLD) edge = 'resize-start';
        else if (Math.abs(worldX - (taskX + taskW)) < EDGE_THRESHOLD) edge = 'resize-end';
      }

      return { taskId: task.id, task, edge, row: rowIndex };
    }

    return null;
  }, [startHour, hourWidth, rowTasksMap]);

  return { hitTest };
}
