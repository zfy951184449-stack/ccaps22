/**
 * WxbGanttChart v2 — Drag System
 * Ported from ProcessTemplateGantt with RAF-optimized ghost rendering
 */
import { useRef, useCallback, useEffect } from 'react';
import type { GanttTask, DragState } from './types';
import { SNAP_HOURS, DRAG_THRESHOLD, MAX_UNDO } from './constants';
import { snapHour, formatHour, clamp } from './ganttUtils';

interface UndoEntry {
  taskId: string;
  type: DragState['type'];
  oldStart: number;
  oldEnd: number;
}

interface UseGanttDragProps {
  hourWidth: number;
  startHour: number;
  endHour: number;
  readOnly?: boolean;
  onDragEnd?: (taskId: string, newStart: number, newEnd: number) => void;
}

export function useGanttDrag({
  hourWidth,
  startHour,
  endHour,
  readOnly,
  onDragEnd,
}: UseGanttDragProps) {
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const rafId = useRef(0);

  const createGhost = useCallback((rect: DOMRect, color: string) => {
    const ghost = document.createElement('div');
    // WXB accent-bar ghost style: tinted fill + left accent + focus ring
    ghost.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      border-radius: 4px;
      opacity: 0.92;
      background: ${color}1A;
      border: 1px solid ${color}4D;
      border-left: 3px solid ${color};
      box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 2px rgba(31,111,235,0.4);
      width: ${rect.width}px;
      height: ${rect.height}px;
      left: ${rect.left}px;
      top: ${rect.top}px;
      transition: top 0.05s ease-out;
    `;
    // Label inside ghost
    const label = document.createElement('span');
    label.style.cssText = `
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      font: 500 11px "Inter", "PingFang SC", system-ui, sans-serif;
      color: #3A4A5C;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: calc(100% - 16px);
    `;
    ghost.appendChild(label);
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    return ghost;
  }, []);

  const updateTooltip = useCallback((clientX: number, clientY: number, hour: number) => {
    if (!tooltipRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `
        position: fixed;
        background: rgba(15,27,45,0.92);
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        pointer-events: none;
        z-index: 10001;
        white-space: nowrap;
        font-family: "Inter", "PingFang SC", system-ui, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        letter-spacing: 0.02em;
      `;
      document.body.appendChild(el);
      tooltipRef.current = el;
    }
    tooltipRef.current.textContent = formatHour(hour);
    tooltipRef.current.style.left = `${clientX + 15}px`;
    tooltipRef.current.style.top = `${clientY - 30}px`;
  }, []);

  const cleanup = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
    tooltipRef.current?.remove();
    tooltipRef.current = null;
    dragRef.current = null;
    cancelAnimationFrame(rafId.current);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragRef.current;
    if (!state) return;

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      if (!dragRef.current) return;
      const dx = e.clientX - state.startMouseX;
      const dy = e.clientY - state.startMouseY;

      // Check threshold
      if (!state.isDragging) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        state.isDragging = true;
        // Create ghost at exact bar position
        const rect = new DOMRect(
          state.startLeft, state.startTop,
          state.startWidth, 24
        );
        createGhost(rect, '#1F6FEB');
      }

      if (!ghostRef.current) return;

      const dxHours = dx / hourWidth;
      const snapW = SNAP_HOURS * hourWidth;

      if (state.type === 'move') {
        const newHour = snapHour(state.startHour + dxHours, SNAP_HOURS);
        const duration = state.endHour - state.startHour;
        const clampedHour = clamp(newHour, startHour, endHour - duration);
        const pxDelta = (clampedHour - state.startHour) * hourWidth;
        ghostRef.current.style.left = `${state.startLeft + pxDelta}px`;
        // Keep ghost on original row (don't follow Y to prevent row-jump confusion)
        updateTooltip(e.clientX, e.clientY, clampedHour);
        // Update ghost label
        const label = ghostRef.current.querySelector('span');
        if (label) label.textContent = formatHour(clampedHour);
      } else if (state.type === 'resize-end') {
        const newWidth = Math.max(SNAP_HOURS * hourWidth, state.startWidth + dx);
        const snappedW = Math.round(newWidth / snapW) * snapW;
        ghostRef.current.style.width = `${Math.max(snapW, snappedW)}px`;
        const newEndHour = state.startHour + snappedW / hourWidth;
        updateTooltip(e.clientX, e.clientY, newEndHour);
        const label = ghostRef.current.querySelector('span');
        if (label) {
          const dur = newEndHour - state.startHour;
          label.textContent = `${dur.toFixed(1)}h`;
        }
      } else if (state.type === 'resize-start') {
        const newLeft = state.startLeft + dx;
        const newWidth = state.startWidth - dx;
        if (newWidth < SNAP_HOURS * hourWidth) return;
        const snappedLeft = Math.round(newLeft / snapW) * snapW;
        ghostRef.current.style.left = `${snappedLeft}px`;
        ghostRef.current.style.width = `${Math.max(snapW, state.startWidth - (snappedLeft - state.startLeft))}px`;
        const newStartHour = state.startHour + (snappedLeft - state.startLeft) / hourWidth;
        updateTooltip(e.clientX, e.clientY, newStartHour);
        const label = ghostRef.current.querySelector('span');
        if (label) label.textContent = formatHour(newStartHour);
      }
    });
  }, [hourWidth, startHour, endHour, createGhost, updateTooltip]);

  const handleMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    const state = dragRef.current;
    if (!state || !state.isDragging) {
      cleanup();
      return;
    }

    // Calculate final position from ghost
    const ghost = ghostRef.current;
    if (ghost && onDragEnd) {
      const ghostLeft = parseFloat(ghost.style.left);
      const ghostWidth = parseFloat(ghost.style.width);

      let newStart = state.startHour;
      let newEnd = state.endHour;

      if (state.type === 'move') {
        const pxDelta = ghostLeft - state.startLeft;
        const hourDelta = pxDelta / hourWidth;
        newStart = snapHour(state.startHour + hourDelta, SNAP_HOURS);
        newEnd = newStart + (state.endHour - state.startHour);
      } else if (state.type === 'resize-end') {
        newEnd = snapHour(state.startHour + ghostWidth / hourWidth, SNAP_HOURS);
      } else if (state.type === 'resize-start') {
        const pxDelta = ghostLeft - state.startLeft;
        newStart = snapHour(state.startHour + pxDelta / hourWidth, SNAP_HOURS);
      }

      // Push undo
      undoStack.current.push({
        taskId: state.taskId,
        type: state.type,
        oldStart: state.startHour,
        oldEnd: state.endHour,
      });
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();

      onDragEnd(state.taskId, newStart, newEnd);
    }

    cleanup();
  }, [hourWidth, onDragEnd, cleanup, handleMouseMove]);

  const startDrag = useCallback((
    e: React.MouseEvent | MouseEvent,
    task: GanttTask,
    type: DragState['type'],
    barLeft: number,
    barWidth: number,
    barTop?: number
  ) => {
    if (readOnly || task.readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      type,
      taskId: task.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: barLeft,
      startWidth: barWidth,
      startTop: barTop ?? e.clientY,
      startHour: task.start,
      endHour: task.end,
      isDragging: false,
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, handleMouseMove, handleMouseUp]);

  // Ctrl+Z undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && onDragEnd) {
        const entry = undoStack.current.pop();
        if (entry) {
          e.preventDefault();
          onDragEnd(entry.taskId, entry.oldStart, entry.oldEnd);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDragEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cleanup, handleMouseMove, handleMouseUp]);

  return { startDrag, isDragging: dragRef.current?.isDragging ?? false };
}
