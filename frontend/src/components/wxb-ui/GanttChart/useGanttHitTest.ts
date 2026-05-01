/**
 * WxbGanttChart — useGanttHitTest Hook
 * Maps mouse coordinates to tasks on the canvas
 */
import { useCallback, useRef } from 'react';
import { GanttTask, CanvasViewport } from './types';
import { xToTime } from './ganttUtils';

export interface HitTestResult {
  task: GanttTask;
  rowIndex: number;
  /** Whether the hit is on the drag handle zone (left/right edge) */
  edge: 'left' | 'right' | null;
}

export function useGanttHitTest(
  tasks: GanttTask[],
  taskRowMap: Map<string, number>,
  rowHeight: number,
  startHour: number,
  hourWidth: number
) {
  // Pre-built row -> tasks lookup for O(1) row access
  const rowTasksRef = useRef<Map<number, GanttTask[]>>(new Map());

  // Rebuild index when data changes
  const rebuildIndex = useCallback(() => {
    const map = new Map<number, GanttTask[]>();
    for (const task of tasks) {
      const row = taskRowMap.get(task.id);
      if (row === undefined) continue;
      const arr = map.get(row) || [];
      arr.push(task);
      map.set(row, arr);
    }
    rowTasksRef.current = map;
  }, [tasks, taskRowMap]);

  // Call rebuild on dependency changes
  rebuildIndex();

  const hitTest = useCallback(
    (canvasX: number, canvasY: number, viewport: CanvasViewport): HitTestResult | null => {
      const worldX = canvasX + viewport.scrollX;
      const worldY = canvasY + viewport.scrollY;
      const row = Math.floor(worldY / rowHeight);

      const rowTasks = rowTasksRef.current.get(row);
      if (!rowTasks) return null;

      const time = xToTime(worldX, startHour, hourWidth);
      const edgeThreshold = 6 / hourWidth; // 6px in time units

      for (const task of rowTasks) {
        if (time >= task.start && time <= task.end) {
          let edge: 'left' | 'right' | null = null;
          if (time - task.start < edgeThreshold) edge = 'left';
          else if (task.end - time < edgeThreshold) edge = 'right';
          return { task, rowIndex: row, edge };
        }
      }
      return null;
    },
    [rowHeight, startHour, hourWidth]
  );

  return { hitTest };
}
