/**
 * WxbGanttChart v3.2 — Drag System (Canvas-native)
 *
 * Architecture:
 *   - NO DOM ghost elements — all rendering happens in Canvas RAF loop
 *   - DragState is exposed to renderer for drawDragOverlay()
 *   - Supports: single-task move, cascade group-move, multi-select move, edge resize
 *   - Window constraint clamping for single-task moves
 *   - 3-tier warning system for cascade drags (normal/warning/danger)
 *   - Async validation: onDragEnd can return false to trigger rollback
 *   - ESC to cancel, Ctrl+Z to undo
 */
import { useRef, useCallback, useEffect, useState } from 'react';
import type { GanttTask, GanttGroup, DragState, GanttTimeScale } from './types';
import { SNAP_HOURS, MAX_UNDO } from './constants';
import { snapHour, clamp } from './ganttUtils';

// Drag threshold: px mouse movement before drag activates
const TASK_DRAG_THRESHOLD = 5;
const GROUP_DRAG_THRESHOLD = 12;  // Higher for groups to prevent accidental cascade

// Edge auto-scroll zone
const EDGE_ZONE = 40;
const EDGE_SCROLL_SPEED = 0.5;

// Warning thresholds (in hours)
const WARNING_THRESHOLD = 1;
const DANGER_THRESHOLD = 4;

interface UndoEntry {
  type: 'task' | 'group';
  primaryId: string;
  restorations: Array<{ taskId: string; start: number; end: number }>;
}

export interface UndoToastData {
  message: string;
  onUndo: () => void;
}

export interface UseGanttDragProps {
  hourWidth: number;
  startHour: number;
  endHour: number;
  readOnly?: boolean;
  tasks: GanttTask[];
  groups: GanttGroup[];
  taskRowMap: Map<string, number>;
  selectedTaskIds: Set<string>;
  onDragEnd?: (taskId: string, newStart: number, newEnd: number) => void | boolean | Promise<boolean | void>;
  onTaskResizeEnd?: (taskId: string, newStart: number, newEnd: number) => void | boolean | Promise<boolean | void>;
  onGroupDragEnd?: (groupId: string, deltaHours: number, affectedTaskIds: string[]) => void | boolean | Promise<boolean | void>;
  /** Batch handler for multi-select moves. When set, the multi-select branch calls this once
   *  instead of looping onDragEnd per task. Falls back to onDragEnd when omitted. */
  onTasksDragEnd?: (updates: Array<{ taskId: string; newStart: number; newEnd: number }>) => void | boolean | Promise<boolean | void>;
  onAutoScroll?: (dx: number) => void;
  canvasWidth: number;
  timeScale?: GanttTimeScale;
  /** Clamp single-task move to [windowStart, windowEnd]. Default: true.
   *  When false the window no longer restricts dragging (timeline bounds still apply). */
  clampDragToWindow?: boolean;
}

export interface UseGanttDragResult {
  startDrag: (e: React.MouseEvent | MouseEvent, task: GanttTask, row: number) => void;
  startGroupDrag: (e: React.MouseEvent | MouseEvent, groupId: string, row: number) => void;
  startResize: (e: React.MouseEvent | MouseEvent, task: GanttTask, row: number, edge: 'resize-start' | 'resize-end') => void;
  dragState: DragState | null;
  isDragging: boolean;
  cancelDrag: () => void;
  undoToast: UndoToastData | null;
  dismissToast: () => void;
  /** Rewind the most-recent drag (same action as Ctrl+Z and the cascade toast). */
  undo: () => void;
  /** Number of drags currently on the undo stack (0 = nothing to undo). Reactive. */
  undoCount: number;
}

/**
 * Find all descendant task IDs under a group (BFS through nested groups)
 */
function getDescendantTaskIds(
  groupId: string,
  groups: GanttGroup[],
  tasks: GanttTask[]
): string[] {
  const descendantGroupIds = new Set<string>([groupId]);
  const queue = [groupId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of groups) {
      if (g.parentId === current && !descendantGroupIds.has(g.id)) {
        descendantGroupIds.add(g.id);
        queue.push(g.id);
      }
    }
  }
  return tasks
    .filter(t => t.groupId && descendantGroupIds.has(t.groupId))
    .map(t => t.id);
}

export function useGanttDrag({
  hourWidth,
  startHour,
  endHour,
  readOnly,
  tasks,
  groups,
  taskRowMap,
  selectedTaskIds,
  onDragEnd,
  onTaskResizeEnd,
  onGroupDragEnd,
  onTasksDragEnd,
  onAutoScroll,
  canvasWidth,
  timeScale,
  clampDragToWindow = true,
}: UseGanttDragProps): UseGanttDragResult {
  const dragRef = useRef<DragState | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToastData | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef(0);

  // Keep props in refs for event handlers
  const propsRef = useRef({ hourWidth, startHour, endHour, tasks, groups, taskRowMap, selectedTaskIds, canvasWidth, timeScale });
  propsRef.current = { hourWidth, startHour, endHour, tasks, groups, taskRowMap, selectedTaskIds, canvasWidth, timeScale };

  const cleanup = useCallback(() => {
    dragRef.current = null;
    setDragState(null);
    cancelAnimationFrame(rafId.current);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setUndoToast(null);
  }, []);

  // ===== Undo (shared by Ctrl+Z, the cascade toast, and the toolbar button) =====
  // Pops the most-recent drag and restores every affected task to its pre-drag
  // start/end. Re-uses the consumer's persist handlers so the backend is rewound
  // too — prefers the atomic batch handler when more than one task moved.
  const performUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!entry) return;
    const { restorations } = entry;
    if (restorations.length > 1 && onTasksDragEnd) {
      onTasksDragEnd(restorations.map(r => ({ taskId: r.taskId, newStart: r.start, newEnd: r.end })));
    } else if (onDragEnd) {
      for (const r of restorations) onDragEnd(r.taskId, r.start, r.end);
    }
    dismissToast();
  }, [onDragEnd, onTasksDragEnd, dismissToast]);

  // ===== Mouse Move Handler =====
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragRef.current;
    if (!state) return;

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      if (!dragRef.current) return;
      const { hourWidth: hw, startHour: sh, endHour: eh, canvasWidth: cw, timeScale: scale } = propsRef.current;
      const dx = e.clientX - state.startMouseX;

      // Check threshold
      if (!state.isDragging) {
        const threshold = state.isGroupDrag ? GROUP_DRAG_THRESHOLD : TASK_DRAG_THRESHOLD;
        if (Math.abs(dx) < threshold) return;
        state.isDragging = true;
      }

      // Convert pixel delta to hour delta
      const primaryOrig = state.originals.get(state.primaryId);
      const deltaOrigin = state.type === 'resize-end'
        ? primaryOrig?.end
        : primaryOrig?.start;
      const rawDeltaHours = scale && deltaOrigin !== undefined
        ? scale.pixelDeltaToHourDelta(deltaOrigin, dx)
        : dx / hw;
      let deltaHours = snapHour(rawDeltaHours, SNAP_HOURS);

      if (state.type === 'move' && !state.isGroupDrag && state.affectedTaskIds.length === 1) {
        // Single task: clamp to window constraints
        const orig = state.originals.get(state.primaryId)!;
        const duration = orig.end - orig.start;
        const winMin = state.windowMinHour ?? sh;
        const winMax = state.windowMaxHour ?? eh;
        const newStart = clamp(orig.start + deltaHours, winMin, winMax - duration);
        deltaHours = newStart - orig.start;
      } else {
        // Cascade / multi-select: clamp so no child exceeds timeline bounds
        let earliest = Infinity, latest = -Infinity;
        for (const [, orig] of Array.from(state.originals)) {
          if (orig.start < earliest) earliest = orig.start;
          if (orig.end > latest) latest = orig.end;
        }
        const minDelta = sh - earliest;
        const maxDelta = eh - latest;
        deltaHours = clamp(deltaHours, minDelta, maxDelta);
      }

      // Resize mode: adjust start or end independently
      if (state.type === 'resize-start' || state.type === 'resize-end') {
        const orig = state.originals.get(state.primaryId)!;
        const minDuration = SNAP_HOURS; // 15-min minimum

        if (state.type === 'resize-start') {
          // Drag left edge: change start, end stays
          let newStart = snapHour(orig.start + rawDeltaHours, SNAP_HOURS);
          newStart = clamp(newStart, sh, orig.end - minDuration);
          deltaHours = newStart - orig.start;
        } else {
          // Drag right edge: start stays, change end
          let newEnd = snapHour(orig.end + rawDeltaHours, SNAP_HOURS);
          newEnd = clamp(newEnd, orig.start + minDuration, eh);
          deltaHours = newEnd - orig.end;
        }
      }

      // Update warning level for cascade
      let warningLevel: DragState['warningLevel'] = 'normal';
      if (state.isGroupDrag) {
        const absDelta = Math.abs(deltaHours);
        if (absDelta >= DANGER_THRESHOLD) warningLevel = 'danger';
        else if (absDelta >= WARNING_THRESHOLD) warningLevel = 'warning';
      }

      state.deltaHours = deltaHours;
      state.warningLevel = warningLevel;

      // Sync to React state for Canvas rendering
      setDragState({ ...state });

      // Edge auto-scroll
      if (onAutoScroll) {
        const mouseLocalX = e.clientX; // approximate
        if (mouseLocalX < EDGE_ZONE) {
          onAutoScroll(-(EDGE_ZONE - mouseLocalX) * EDGE_SCROLL_SPEED);
        } else if (mouseLocalX > window.innerWidth - EDGE_ZONE) {
          onAutoScroll((mouseLocalX - window.innerWidth + EDGE_ZONE) * EDGE_SCROLL_SPEED);
        }
      }
    });
  }, [onAutoScroll]);

  // ===== Mouse Up Handler =====
  const handleMouseUp = useCallback(async () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    const state = dragRef.current;
    if (!state || !state.isDragging) {
      cleanup();
      return;
    }

    const deltaHours = state.deltaHours;
    if (Math.abs(deltaHours) < 0.01) {
      cleanup();
      return;
    }

    // Build restorations for undo
    const restorations: UndoEntry['restorations'] = [];
    for (const [taskId, orig] of Array.from(state.originals)) {
      restorations.push({ taskId, start: orig.start, end: orig.end });
    }

    const pushUndo = () => {
      undoStack.current.push({
        type: state.isGroupDrag ? 'group' : 'task',
        primaryId: state.primaryId,
        restorations,
      });
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
      setUndoCount(undoStack.current.length);
    };

    if (state.isGroupDrag) {
      // Defensive: with no group-drag handler wired there is nothing to persist.
      // Only clean up the canvas — do NOT push undo or show a success toast that
      // would otherwise promise a move the consumer never saved.
      if (!onGroupDragEnd) {
        cleanup();
        return;
      }

      // Cascade drag end
      const result = await onGroupDragEnd(state.primaryId, deltaHours, state.affectedTaskIds);
      if (result === false) {
        // Rollback — consumer rejected
        cleanup();
        return;
      }

      pushUndo();

      // Show Undo Toast
      const affectedCount = state.affectedTaskIds.length;
      const label = state.taskLabel;
      const sign = deltaHours > 0 ? '+' : '';
      dismissToast();
      const toastData: UndoToastData = {
        message: `已移动 "${label}" 下 ${affectedCount} 个任务 ${sign}${deltaHours.toFixed(1)}h`,
        // Shares the single undo path so the toolbar button's count stays in sync.
        onUndo: performUndo,
      };
      setUndoToast(toastData);
      toastTimer.current = setTimeout(() => setUndoToast(null), 3000);
      cleanup();
      return;
    }

    // Non-group branches all persist via onDragEnd-style handlers; record undo first.
    pushUndo();

    if (state.type === 'resize-start' || state.type === 'resize-end') {
      // Resize end — compute new start/end based on resize direction
      const orig = state.originals.get(state.primaryId)!;
      let newStart = orig.start, newEnd = orig.end;
      if (state.type === 'resize-start') {
        newStart = snapHour(orig.start + deltaHours, SNAP_HOURS);
      } else {
        newEnd = snapHour(orig.end + deltaHours, SNAP_HOURS);
      }
      // Prefer onTaskResizeEnd, fallback to onDragEnd
      const handler = onTaskResizeEnd || onDragEnd;
      if (handler) {
        const result = await handler(state.primaryId, newStart, newEnd);
        if (result === false) {
          cleanup();
          return;
        }
      }
    } else if (state.affectedTaskIds.length === 1) {
      // Single task drag end
      const orig = state.originals.get(state.primaryId)!;
      const newStart = snapHour(orig.start + deltaHours, SNAP_HOURS);
      const newEnd = newStart + (orig.end - orig.start);
      if (onDragEnd) {
        const result = await onDragEnd(state.primaryId, newStart, newEnd);
        if (result === false) {
          // Rollback animation would be here (future enhancement)
          cleanup();
          return;
        }
      }
    } else {
      // Multi-select drag end
      const updates = state.affectedTaskIds.map((taskId) => {
        const orig = state.originals.get(taskId)!;
        const newStart = snapHour(orig.start + deltaHours, SNAP_HOURS);
        const newEnd = newStart + (orig.end - orig.start);
        return { taskId, newStart, newEnd };
      });
      if (onTasksDragEnd) {
        // Batch path: one call, consumer persists concurrently + refreshes once.
        await onTasksDragEnd(updates);
      } else if (onDragEnd) {
        // Fallback: per-task (preserves behaviour for consumers without a batch handler).
        for (const u of updates) {
          await onDragEnd(u.taskId, u.newStart, u.newEnd);
        }
      }
    }

    cleanup();
  }, [cleanup, handleMouseMove, onDragEnd, onTaskResizeEnd, onGroupDragEnd, onTasksDragEnd, dismissToast, performUndo]);

  // ===== Start Single Task Drag =====
  const startDrag = useCallback((
    e: React.MouseEvent | MouseEvent,
    task: GanttTask,
    row: number
  ) => {
    if (readOnly || task.readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const { selectedTaskIds: selIds, taskRowMap: trm } = propsRef.current;

    // Determine affected tasks (single or multi-select)
    let affectedIds: string[];
    if (selIds.size > 1 && selIds.has(task.id)) {
      // Dragging one of the selected → move all selected
      affectedIds = Array.from(selIds);
    } else {
      affectedIds = [task.id];
    }

    // Build originals map
    const originals = new Map<string, { start: number; end: number; row: number }>();
    const { tasks: allTasks } = propsRef.current;
    for (const id of affectedIds) {
      const t = allTasks.find(tt => tt.id === id);
      if (t) {
        originals.set(id, { start: t.start, end: t.end, row: trm.get(id) ?? 0 });
      }
    }

    const newState: DragState = {
      type: 'move',
      primaryId: task.id,
      affectedTaskIds: affectedIds,
      isDragging: false,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originals,
      deltaHours: 0,
      windowMinHour: clampDragToWindow ? task.windowStart : undefined,
      windowMaxHour: clampDragToWindow ? task.windowEnd : undefined,
      taskColor: task.color || '#1F6FEB',
      taskLabel: task.label,
      warningLevel: 'normal',
      isGroupDrag: false,
    };

    dragRef.current = newState;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, clampDragToWindow, handleMouseMove, handleMouseUp]);

  // ===== Start Group Cascade Drag =====
  const startGroupDrag = useCallback((
    e: React.MouseEvent | MouseEvent,
    groupId: string,
    _row: number
  ) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const { tasks: allTasks, groups: allGroups, taskRowMap: trm } = propsRef.current;

    // Find affected tasks via BFS
    const affectedIds = getDescendantTaskIds(groupId, allGroups, allTasks);
    if (affectedIds.length === 0) return;

    // Build originals
    const originals = new Map<string, { start: number; end: number; row: number }>();
    for (const id of affectedIds) {
      const t = allTasks.find(tt => tt.id === id);
      if (t) {
        originals.set(id, { start: t.start, end: t.end, row: trm.get(id) ?? 0 });
      }
    }

    // Find group info
    const group = allGroups.find(g => g.id === groupId);
    const groupLabel = group?.label || groupId;
    const groupColor = group?.color || '#1F6FEB';

    const newState: DragState = {
      type: 'group-move',
      primaryId: groupId,
      affectedTaskIds: affectedIds,
      isDragging: false,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originals,
      deltaHours: 0,
      taskColor: groupColor,
      taskLabel: groupLabel,
      warningLevel: 'normal',
      isGroupDrag: true,
    };

    dragRef.current = newState;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, handleMouseMove, handleMouseUp]);

  // ===== Start Resize Drag =====
  const startResize = useCallback((
    e: React.MouseEvent | MouseEvent,
    task: GanttTask,
    row: number,
    edge: 'resize-start' | 'resize-end'
  ) => {
    if (readOnly || task.readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const originals = new Map<string, { start: number; end: number; row: number }>();
    originals.set(task.id, { start: task.start, end: task.end, row });

    const newState: DragState = {
      type: edge,
      primaryId: task.id,
      affectedTaskIds: [task.id],
      isDragging: false,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originals,
      deltaHours: 0,
      taskColor: task.color || '#1F6FEB',
      taskLabel: task.label,
      warningLevel: 'normal',
      isGroupDrag: false,
    };

    dragRef.current = newState;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, handleMouseMove, handleMouseUp]);

  // ===== Cancel Drag (ESC) =====
  const cancelDrag = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    cleanup();
  }, [cleanup, handleMouseMove, handleMouseUp]);

  // ===== ESC Key Handler =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) {
        e.preventDefault();
        cancelDrag();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cancelDrag]);

  // ===== Ctrl+Z Undo =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (undoStack.current.length === 0) return;
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo]);

  // ===== Cleanup on unmount =====
  useEffect(() => {
    return () => {
      cleanup();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [cleanup, handleMouseMove, handleMouseUp]);

  return {
    startDrag,
    startGroupDrag,
    startResize,
    dragState,
    isDragging: dragState?.isDragging ?? false,
    cancelDrag,
    undoToast,
    dismissToast,
    undo: performUndo,
    undoCount,
  };
}
