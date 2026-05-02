/**
 * WxbGanttChart v2 — Single Canvas Container + RAF Loop
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { GanttTask, GanttGroup, GanttDependency, GanttLink, FlatRow } from './types';
import type { GanttState } from './useGanttStore';
import type { GanttAction } from './useGanttStore';
import { HEADER_HEIGHT, HEATMAP_HEIGHT, ZOOM_SENSITIVITY, ROW_HEIGHT, BAR_HEIGHT } from './constants';
import { drawGrid, drawTimeAxis, drawGroupBars, drawBars, drawDependencies, drawLinks, drawDragOverlay, clipBelowHeader } from './useGanttRenderer';
import { useGanttHitTest } from './useGanttHitTest';
import { useGanttDrag } from './useGanttDrag';
import type { UseGanttDragResult } from './useGanttDrag';
import { clamp } from './ganttUtils';

interface GanttCanvasProps {
  tasks: GanttTask[];
  groups: GanttGroup[];
  flatRows: FlatRow[];
  taskRowMap: Map<string, number>;
  dependencies: GanttDependency[];
  links: GanttLink[];
  state: GanttState;
  stateRef: React.MutableRefObject<GanttState>;
  dispatch: React.Dispatch<GanttAction>;
  startHour: number;
  endHour: number;
  showGrid: boolean;
  showToday: boolean;
  showProgress: boolean;
  showHeatmap: boolean;
  readOnly: boolean;
  zoomRange: [number, number];
  personnelPeaks?: Map<number, { peak: number; peakHour: number }>;
  onTaskClick?: (task: GanttTask) => void;
  onTaskDoubleClick?: (task: GanttTask) => void;
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void | boolean | Promise<boolean | void>;
  onGroupDragEnd?: (groupId: string, deltaHours: number, affectedTaskIds: string[]) => void | boolean | Promise<boolean | void>;
  onTooltipShow?: (task: GanttTask, x: number, y: number) => void;
  onTooltipHide?: () => void;
  onContextMenu?: (task: GanttTask | null, x: number, y: number) => void;
  onUndoToast?: (data: { message: string; onUndo: () => void } | null) => void;
}

const GanttCanvas: React.FC<GanttCanvasProps> = ({
  tasks, groups, flatRows, taskRowMap, dependencies, links,
  state, stateRef, dispatch,
  startHour, endHour,
  showGrid, showToday, showProgress, showHeatmap, readOnly, zoomRange,
  personnelPeaks,
  onTaskClick, onTaskDoubleClick, onTaskDragEnd, onGroupDragEnd,
  onTooltipShow, onTooltipHide, onContextMenu, onUndoToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const rafId = useRef(0);

  // Smooth scroll animation for collapse/expand
  const prevRowCount = useRef(flatRows.length);
  const animRafId = useRef(0);
  useEffect(() => {
    const prevCount = prevRowCount.current;
    const newCount = flatRows.length;
    prevRowCount.current = newCount;

    if (prevCount === newCount) return;

    // Animate scrollY to clamp smoothly when rows decrease
    const s = stateRef.current;
    const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);
    const viewportH = s.canvasH - totalHeaderH;
    const targetMaxY = Math.max(0, newCount * ROW_HEIGHT - viewportH);
    const targetY = Math.min(s.scrollY, targetMaxY);

    if (targetY === s.scrollY) return; // no animation needed

    const startY = s.scrollY;
    const duration = 200; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const currentY = startY + (targetY - startY) * eased;
      dispatch({ type: 'SET_SCROLL', y: currentY });
      if (t < 1) {
        animRafId.current = requestAnimationFrame(animate);
      }
    };
    cancelAnimationFrame(animRafId.current);
    animRafId.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animRafId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatRows.length]);

  // ===== DATA REFS: mirror props into refs so RAF closure always reads latest =====
  const dataRef = useRef({
    tasks, groups, flatRows, taskRowMap, dependencies, links,
    startHour, endHour,
    showGrid, showToday, showProgress, showHeatmap,
    personnelPeaks,
  });
  dataRef.current = {
    tasks, groups, flatRows, taskRowMap, dependencies, links,
    startHour, endHour,
    showGrid, showToday, showProgress, showHeatmap,
    personnelPeaks,
  };

  // In expanded day mode, override startHour/endHour for hit detection and drag
  const effectiveStartHour = state.expandedDay !== null ? state.expandedDay * 24 : startHour;
  const effectiveEndHour = state.expandedDay !== null ? (state.expandedDay + 1) * 24 : endHour;

  const hourWidth = state.dayWidth / 24;
  const { hitTest } = useGanttHitTest(tasks, groups, flatRows, taskRowMap, effectiveStartHour, hourWidth);

  const onAutoScroll = useCallback((dx: number) => {
    dispatch({ type: 'SCROLL', dx, dy: 0 });
  }, [dispatch]);

  const {
    startDrag, startGroupDrag, dragState, isDragging, cancelDrag,
    undoToast, dismissToast,
  }: UseGanttDragResult = useGanttDrag({
    hourWidth,
    startHour: effectiveStartHour,
    endHour: effectiveEndHour,
    readOnly,
    tasks,
    groups,
    taskRowMap,
    selectedTaskIds: state.selectedTaskIds,
    onDragEnd: onTaskDragEnd,
    onGroupDragEnd,
    onAutoScroll,
    canvasWidth: state.canvasW,
  });

  // Mirror dragState into a ref so RAF loop can read latest value
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;
  // Mark canvas dirty when drag state changes
  useEffect(() => {
    if (dragState) dispatch({ type: 'MARK_DIRTY' });
  }, [dragState, dispatch]);

  // Forward undo toast to parent
  useEffect(() => {
    if (onUndoToast) onUndoToast(undoToast);
  }, [undoToast, onUndoToast]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        dispatch({ type: 'RESIZE', w: width, h: height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [dispatch]);

  // RAF render loop — reads data from refs, never stale
  useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (!mountedRef.current) return;
      const s = stateRef.current;
      if (s.dirty) {
        dispatch({ type: 'MARK_CLEAN' });
        const canvas = canvasRef.current;
        if (!canvas) { rafId.current = requestAnimationFrame(tick); return; }

        const dpr = window.devicePixelRatio || 1;
        const w = s.canvasW;
        const h = s.canvasH;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) { rafId.current = requestAnimationFrame(tick); return; }
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        // Read latest data from ref
        const d = dataRef.current;

        // In expanded day mode, override time range to single day (V4 strategy)
        let effectiveStartHour = d.startHour;
        let effectiveEndHour = d.endHour;
        let effectiveScrollX = s.scrollX;
        if (s.expandedDay !== null) {
          effectiveStartHour = s.expandedDay * 24;
          effectiveEndHour = (s.expandedDay + 1) * 24;
          effectiveScrollX = 0;  // no horizontal scroll in single-day mode
        }

        const cfg = {
          startHour: effectiveStartHour, endHour: effectiveEndHour, hourWidth: s.dayWidth / 24,
          scrollX: effectiveScrollX, scrollY: s.scrollY,
          canvasW: w, canvasH: h, rowHeight: ROW_HEIGHT,
          showGrid: d.showGrid, showToday: d.showToday, showProgress: d.showProgress, showHeatmap: d.showHeatmap,
          hoveredTaskId: s.hoveredTaskId,
          selectedTaskIds: s.selectedTaskIds,
          hoveredRow: s.hoveredRow,
          hoveredColX: s.hoveredColX,
          expandedDay: s.expandedDay,
          todayHour: null as number | null,
          viewMode: s.viewMode,
          dpr,
        };

        // L0: Grid (row bg + hover highlight + grid lines)
        drawGrid(ctx, cfg, d.flatRows);

        // L1: Time Axis Header (drawn on top of grid, below clip)
        drawTimeAxis(ctx, cfg, d.personnelPeaks);

        // L2-L4: Bars, Dependencies, Links — clipped below header
        clipBelowHeader(ctx, cfg);
        drawGroupBars(ctx, cfg, d.flatRows, d.groups, d.tasks, d.taskRowMap);
        drawBars(ctx, cfg, d.tasks, d.taskRowMap);
        drawDependencies(ctx, cfg, d.tasks, d.taskRowMap, d.dependencies);
        drawLinks(ctx, cfg, d.tasks, d.taskRowMap, d.links);

        // L5: Drag overlay (ghost bars, window highlight, warning badges)
        drawDragOverlay(ctx, cfg, dragStateRef.current, d.tasks, d.taskRowMap);

        ctx.restore();
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafId.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark dirty when data changes
  useEffect(() => {
    dispatch({ type: 'MARK_DIRTY' });
  }, [tasks, flatRows, dependencies, links, personnelPeaks, showGrid, showToday, showProgress, showHeatmap, dispatch]);

  // Compute scroll limits when row count or canvas size changes
  useEffect(() => {
    const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);
    const contentH = flatRows.length * ROW_HEIGHT;
    const viewportH = state.canvasH - totalHeaderH;
    const maxY = Math.max(0, contentH - viewportH);
    dispatch({ type: 'SET_MAX_SCROLL_Y', maxY });
  }, [flatRows.length, state.canvasH, showHeatmap, dispatch]);

  // Compute horizontal scroll limit
  useEffect(() => {
    const hourWidth = state.dayWidth / 24;
    const contentW = (endHour - startHour) * hourWidth;
    const maxX = Math.max(0, contentW - state.canvasW);
    dispatch({ type: 'SET_MAX_SCROLL_X', maxX });
  }, [state.dayWidth, startHour, endHour, state.canvasW, dispatch]);

  // Wheel handler: scroll + zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const s = stateRef.current;
        const delta = -e.deltaY * ZOOM_SENSITIVITY * s.dayWidth;
        const newDW = clamp(s.dayWidth + delta, zoomRange[0], zoomRange[1]);
        dispatch({ type: 'ZOOM', dayWidth: newDW, anchorX: e.offsetX });
      } else {
        dispatch({ type: 'SCROLL', dx: e.deltaX, dy: e.deltaY });
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [dispatch, stateRef, zoomRange]);

  // Mouse handlers
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, sx: 0, sy: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = stateRef.current;
    const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);

    const hit = hitTest(cx, cy, s.scrollX, s.scrollY, showHeatmap);

    if (hit && !readOnly) {
      if (hit.hitType === 'group') {
        // Group bar drag → cascade
        startGroupDrag(e, hit.groupId!, hit.row);
        return;
      }

      if (hit.hitType === 'task' && hit.task.draggable !== false && !hit.task.readOnly) {
        startDrag(e, hit.task, hit.row);
        return;
      }
    }

    // Start panning
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, sx: s.scrollX, sy: s.scrollY };
  }, [hitTest, startDrag, startGroupDrag, stateRef, showHeatmap, readOnly]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      const dx = panStart.current.x - e.clientX;
      const dy = panStart.current.y - e.clientY;
      dispatch({ type: 'SET_SCROLL', x: Math.max(0, panStart.current.sx + dx), y: Math.max(0, panStart.current.sy + dy) });
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = stateRef.current;
    const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);

    // Compute hovered row for crosshair
    const worldY = cy + s.scrollY - totalHeaderH;
    const rowIdx = worldY >= 0 ? Math.floor(worldY / ROW_HEIGHT) : -1;
    dispatch({ type: 'HOVER_ROW', row: rowIdx, colX: cx });

    const hit = hitTest(cx, cy, s.scrollX, s.scrollY, showHeatmap);
    const newHover = hit?.taskId ?? null;
    if (newHover !== s.hoveredTaskId) {
      dispatch({ type: 'HOVER', taskId: newHover });
      if (hit && onTooltipShow) {
        onTooltipShow(hit.task, e.clientX, e.clientY);
      } else if (!hit && onTooltipHide) {
        onTooltipHide();
      }
    }

    // Cursor
    const canvas = canvasRef.current;
    if (canvas) {
      if (hit?.edge === 'resize-start' || hit?.edge === 'resize-end') {
        canvas.style.cursor = 'ew-resize';
      } else if (hit?.hitType === 'group') {
        canvas.style.cursor = 'grab';
      } else if (hit) {
        canvas.style.cursor = readOnly || hit.task.readOnly ? 'default' : 'move';
      } else {
        canvas.style.cursor = isPanning.current ? 'grabbing' : 'grab';
      }
    }
  }, [dispatch, hitTest, stateRef, showHeatmap, readOnly, onTooltipShow, onTooltipHide]);

  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      return;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = stateRef.current;

    // Header click: handle expanded-day navigation buttons
    // In expanded day mode, entire canvas = 1 day (x=0, width=canvasW)
    if (cy < HEADER_HEIGHT && s.expandedDay !== null) {
      const centerX = s.canvasW / 2;

      // Back button: left area (0 to 60)
      if (cx <= 60 && cy < 24) {
        dispatch({ type: 'EXPAND_DAY', day: null });
        return;
      }
      // Prev arrow: centerX - 80 to centerX - 60
      if (cx >= centerX - 80 && cx <= centerX - 60 && cy < 24) {
        dispatch({ type: 'EXPAND_DAY', day: s.expandedDay - 1 });
        return;
      }
      // Next arrow: centerX + 60 to centerX + 80
      if (cx >= centerX + 60 && cx <= centerX + 80 && cy < 24) {
        dispatch({ type: 'EXPAND_DAY', day: s.expandedDay + 1 });
        return;
      }
    }

    // Task click — with multi-select support
    const hit = hitTest(cx, cy, s.scrollX, s.scrollY, showHeatmap);
    if (hit && hit.hitType === 'task') {
      if (e.ctrlKey || e.metaKey) {
        dispatch({ type: 'SELECT_MULTI', taskId: hit.taskId });
      } else if (e.shiftKey) {
        dispatch({ type: 'SELECT_RANGE', taskId: hit.taskId, flatRows });
      } else {
        dispatch({ type: 'SELECT', taskId: hit.taskId });
      }
      if (onTaskClick) onTaskClick(hit.task);
    } else if (!hit) {
      dispatch({ type: 'SELECT_CLEAR' });
    }
  }, [onTaskClick, hitTest, stateRef, dispatch, showHeatmap, flatRows]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = stateRef.current;

    // Double-click on header area: expand/collapse day
    if (cy < HEADER_HEIGHT) {
      if (s.expandedDay !== null) {
        // Already expanded — double-click header collapses
        dispatch({ type: 'EXPAND_DAY', day: null });
      } else {
        // Not expanded — compute which day was clicked
        const hw = s.dayWidth / 24;
        const worldX = cx + s.scrollX;
        const dayHour = worldX / hw + startHour;
        const dayNum = Math.floor(dayHour / 24);
        dispatch({ type: 'EXPAND_DAY', day: dayNum });
      }
      return;
    }

    // Task double-click
    const hit = hitTest(cx, cy, s.scrollX, s.scrollY, showHeatmap);
    if (hit) {
      if (onTaskDoubleClick) onTaskDoubleClick(hit.task);
    }
  }, [onTaskDoubleClick, hitTest, stateRef, showHeatmap, startHour, dispatch]);

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false;
    dispatch({ type: 'HOVER', taskId: null });
    dispatch({ type: 'HOVER_ROW', row: -1, colX: -1 });
    onTooltipHide?.();
  }, [dispatch, onTooltipHide]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onContextMenu) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = stateRef.current;
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, s.scrollX, s.scrollY, showHeatmap);
    onContextMenu(hit?.task ?? null, e.clientX, e.clientY);
  }, [onContextMenu, hitTest, stateRef, showHeatmap]);

  return (
    <div ref={containerRef} className="wxb-gantt-canvas-container" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        className="wxb-gantt-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{ display: 'block', cursor: 'grab' }}
      />
    </div>
  );
};

export default React.memo(GanttCanvas);
