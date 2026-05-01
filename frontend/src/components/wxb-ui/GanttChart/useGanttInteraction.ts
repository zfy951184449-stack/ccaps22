/**
 * WxbGanttChart — useGanttInteraction Hook
 * Handles zoom, pan, scroll, and drag interactions
 */
import { useCallback, useRef, useState, useEffect } from 'react';
import { GanttTask } from './types';
import { clamp } from './ganttUtils';

interface InteractionConfig {
  zoomRange: [number, number]; // [minPxPerDay, maxPxPerDay]
  rowHeight: number;
  totalRows: number;
  totalHours: number;
  startHour: number;
  sidebarWidth: number;
}

interface DragState {
  taskId: string;
  startMouseX: number;
  originalStart: number;
  originalEnd: number;
  ghostEl: HTMLDivElement | null;
}

export function useGanttInteraction(
  config: InteractionConfig,
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void
) {
  const { zoomRange, rowHeight, totalRows, totalHours, startHour, sidebarWidth } = config;

  // ─── Zoom State (px per day) ───
  const [dayWidth, setDayWidth] = useState(100);
  const hourWidth = dayWidth / 24;

  // ─── Scroll State ───
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  // ─── Pan State ───
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const rafRef = useRef<number>(0);

  // ─── Drag State ───
  const dragState = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ─── Computed bounds ───
  const totalWidth = totalHours * hourWidth;
  const totalHeight = totalRows * rowHeight + 48; // +header

  // ─── Zoom handler ───
  const handleZoom = useCallback(
    (delta: number, centerX?: number) => {
      setDayWidth(prev => {
        const newDayWidth = clamp(prev + delta, zoomRange[0], zoomRange[1]);
        // If center provided, adjust scrollX to keep pointer in same position
        if (centerX !== undefined) {
          const ratio = newDayWidth / prev;
          setScrollX(sx => Math.max(0, sx * ratio + (centerX - sidebarWidth) * (ratio - 1)));
        }
        return newDayWidth;
      });
    },
    [zoomRange, sidebarWidth]
  );

  // ─── Wheel handler (zoom + scroll) ───
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        handleZoom(delta, e.clientX);
      } else {
        // Pan
        setScrollX(sx => Math.max(0, Math.min(totalWidth - 200, sx + e.deltaX)));
        setScrollY(sy => Math.max(0, Math.min(Math.max(0, totalHeight - 200), sy + e.deltaY)));
      }
    },
    [handleZoom, totalWidth, totalHeight]
  );

  // ─── Pan (grab) handlers ───
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, scrollX, scrollY };
      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    },
    [scrollX, scrollY]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dx = panStart.current.x - e.clientX;
        const dy = panStart.current.y - e.clientY;
        setScrollX(Math.max(0, Math.min(totalWidth - 200, panStart.current.scrollX + dx)));
        setScrollY(Math.max(0, Math.min(Math.max(0, totalHeight - 200), panStart.current.scrollY + dy)));
      });
    },
    [totalWidth, totalHeight]
  );

  const handlePanEnd = useCallback((e: React.MouseEvent) => {
    isPanning.current = false;
    cancelAnimationFrame(rafRef.current);
    (e.currentTarget as HTMLElement).style.cursor = '';
  }, []);

  // ─── Drag task handlers ───
  const startDrag = useCallback(
    (task: GanttTask, mouseX: number, containerEl: HTMLElement) => {
      if (!task.draggable) return;
      setIsDragging(true);

      // Create ghost element
      const ghost = document.createElement('div');
      ghost.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        height: ${rowHeight - 12}px;
        background: rgba(31,111,235,0.7);
        border-radius: 4px;
        pointer-events: none;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: none;
      `;
      containerEl.appendChild(ghost);

      dragState.current = {
        taskId: task.id,
        startMouseX: mouseX,
        originalStart: task.start,
        originalEnd: task.end,
        ghostEl: ghost,
      };
    },
    [rowHeight]
  );

  const moveDrag = useCallback(
    (mouseX: number) => {
      if (!dragState.current || !dragState.current.ghostEl) return;
      const dx = mouseX - dragState.current.startMouseX;
      const deltaHours = dx / hourWidth;
      const snapHours = 0.25;
      const snapped = Math.round(deltaHours / snapHours) * snapHours;

      const newStart = dragState.current.originalStart + snapped;
      const newEnd = dragState.current.originalEnd + snapped;

      // Update ghost position
      const x = (newStart - startHour) * hourWidth - scrollX;
      const w = (newEnd - newStart) * hourWidth;
      dragState.current.ghostEl.style.left = `${x}px`;
      dragState.current.ghostEl.style.width = `${w}px`;
    },
    [hourWidth, startHour, scrollX]
  );

  const endDrag = useCallback(() => {
    if (!dragState.current) return;

    // Clean up ghost
    dragState.current.ghostEl?.remove();

    // Calculate final position
    const dx = 0; // Final snap is computed from ghost style.left
    const ghostLeft = dragState.current.ghostEl?.style.left;
    if (ghostLeft) {
      const newX = parseFloat(ghostLeft) + scrollX;
      const newStart = newX / hourWidth + startHour;
      const duration = dragState.current.originalEnd - dragState.current.originalStart;
      const snapHours = 0.25;
      const snappedStart = Math.round(newStart / snapHours) * snapHours;

      if (onTaskDragEnd) {
        onTaskDragEnd(dragState.current.taskId, snappedStart, snappedStart + duration);
      }
    }

    dragState.current = null;
    setIsDragging(false);
  }, [hourWidth, startHour, scrollX, onTaskDragEnd]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    // Zoom
    dayWidth,
    setDayWidth,
    hourWidth,
    handleZoom,
    // Scroll
    scrollX,
    scrollY,
    setScrollX,
    setScrollY,
    // Pan
    handleWheel,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    isPanningRef: isPanning,
    // Drag
    startDrag,
    moveDrag,
    endDrag,
    isDragging,
    // Computed
    totalWidth,
    totalHeight,
  };
}
