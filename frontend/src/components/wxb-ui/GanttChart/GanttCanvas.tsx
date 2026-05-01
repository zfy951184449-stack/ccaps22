/**
 * WxbGanttChart v2 — Single Canvas Container + RAF Loop
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { GanttTask, GanttDependency, GanttLink, FlatRow } from './types';
import type { GanttState } from './useGanttStore';
import type { GanttAction } from './useGanttStore';
import { HEADER_HEIGHT, HEATMAP_HEIGHT, ZOOM_SENSITIVITY, ROW_HEIGHT } from './constants';
import { drawGrid, drawTimeAxis, drawBars, drawDependencies, drawLinks } from './useGanttRenderer';
import { useGanttHitTest } from './useGanttHitTest';
import { useGanttDrag } from './useGanttDrag';
import { clamp } from './ganttUtils';

interface GanttCanvasProps {
  tasks: GanttTask[];
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
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void;
  onTooltipShow?: (task: GanttTask, x: number, y: number) => void;
  onTooltipHide?: () => void;
}

const GanttCanvas: React.FC<GanttCanvasProps> = ({
  tasks, flatRows, taskRowMap, dependencies, links,
  state, stateRef, dispatch,
  startHour, endHour,
  showGrid, showToday, showProgress, showHeatmap, readOnly, zoomRange,
  personnelPeaks,
  onTaskClick, onTaskDoubleClick, onTaskDragEnd,
  onTooltipShow, onTooltipHide,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const rafId = useRef(0);
  const lastDrawRef = useRef(0);

  const hourWidth = state.dayWidth / 24;
  const { hitTest, rebuildIndex } = useGanttHitTest(tasks, taskRowMap, startHour, hourWidth);
  const { startDrag } = useGanttDrag({
    hourWidth,
    startHour,
    endHour,
    readOnly,
    onDragEnd: onTaskDragEnd,
  });

  // Rebuild hit test index when data changes
  useEffect(() => { rebuildIndex(); }, [tasks, taskRowMap, rebuildIndex]);

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

  // RAF render loop
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

        const cfg = {
          startHour, endHour, hourWidth: s.dayWidth / 24,
          scrollX: s.scrollX, scrollY: s.scrollY,
          canvasW: w, canvasH: h, rowHeight: ROW_HEIGHT,
          showGrid, showToday, showProgress, showHeatmap,
          hoveredTaskId: s.hoveredTaskId,
          selectedTaskId: s.selectedTaskId,
          expandedDay: s.expandedDay,
          dpr,
        };

        drawGrid(ctx, cfg, flatRows);
        drawTimeAxis(ctx, cfg, personnelPeaks);
        drawBars(ctx, cfg, tasks, taskRowMap);
        drawDependencies(ctx, cfg, tasks, taskRowMap, dependencies);
        drawLinks(ctx, cfg, tasks, taskRowMap, links);
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
    const hw = s.dayWidth / 24;

    const hit = hitTest(cx, cy, s.scrollX, s.scrollY, showHeatmap);

    if (hit && hit.task.draggable !== false && !readOnly && !hit.task.readOnly) {
      const barX = (hit.task.start - startHour) * hw - s.scrollX;
      const barW = (hit.task.end - hit.task.start) * hw;
      if (hit.edge !== 'body') {
        startDrag(e, hit.task, hit.edge, barX + rect.left, barW);
      } else {
        startDrag(e, hit.task, 'move', barX + rect.left, barW);
      }
      return;
    }

    // Start panning
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY, sx: s.scrollX, sy: s.scrollY };
  }, [hitTest, startDrag, stateRef, startHour, showHeatmap, readOnly]);

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
      } else if (hit) {
        canvas.style.cursor = readOnly || hit.task.readOnly ? 'default' : 'move';
      } else {
        canvas.style.cursor = isPanning.current ? 'grabbing' : 'grab';
      }
    }
  }, [dispatch, hitTest, stateRef, showHeatmap, readOnly, onTooltipShow, onTooltipHide]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) {
      isPanning.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      return;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTaskClick) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = stateRef.current;
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, s.scrollX, s.scrollY, showHeatmap);
    if (hit) {
      dispatch({ type: 'SELECT', taskId: hit.taskId });
      onTaskClick(hit.task);
    }
  }, [onTaskClick, hitTest, stateRef, dispatch, showHeatmap]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTaskDoubleClick) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = stateRef.current;
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, s.scrollX, s.scrollY, showHeatmap);
    if (hit) onTaskDoubleClick(hit.task);
  }, [onTaskDoubleClick, hitTest, stateRef, showHeatmap]);

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false;
    dispatch({ type: 'HOVER', taskId: null });
    onTooltipHide?.();
  }, [dispatch, onTooltipHide]);

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
        style={{ display: 'block', cursor: 'grab' }}
      />
    </div>
  );
};

export default React.memo(GanttCanvas);
