/**
 * WxbGanttChart — GanttCanvas Component
 * 3-layer Canvas container with resize handling
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { GanttTask, GanttDependency, GanttLink, FlatRow, ThemeColors, CanvasViewport } from './types';
import { useGanttRenderer } from './useGanttRenderer';
import { useGanttHitTest, HitTestResult } from './useGanttHitTest';
import { GanttTooltip } from './GanttTooltip';

interface GanttCanvasProps {
  tasks: GanttTask[];
  flatRows: FlatRow[];
  taskRowMap: Map<string, number>;
  dependencies: GanttDependency[];
  links: GanttLink[];
  theme: ThemeColors;
  rowHeight: number;
  startHour: number;
  endHour: number;
  hourWidth: number;
  scrollX: number;
  scrollY: number;
  showGrid: boolean;
  showToday: boolean;
  showProgress: boolean;
  todayHour: number;
  onWheel: (e: React.WheelEvent) => void;
  onPanStart: (e: React.MouseEvent) => void;
  onPanMove: (e: React.MouseEvent) => void;
  onPanEnd: (e: React.MouseEvent) => void;
  isPanning: React.MutableRefObject<boolean>;
  onTaskClick?: (task: GanttTask) => void;
  onTaskDoubleClick?: (task: GanttTask) => void;
}

export const GanttCanvas: React.FC<GanttCanvasProps> = ({
  tasks,
  flatRows,
  taskRowMap,
  dependencies,
  links,
  theme,
  rowHeight,
  startHour,
  endHour,
  hourWidth,
  scrollX,
  scrollY,
  showGrid,
  showToday,
  showProgress,
  todayHour,
  onWheel,
  onPanStart,
  onPanMove,
  onPanEnd,
  isPanning,
  onTaskClick,
  onTaskDoubleClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const barsCanvasRef = useRef<HTMLCanvasElement>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ width: 800, height: 400 });
  const [hoveredTask, setHoveredTask] = useState<GanttTask | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const { drawGridLayer, drawBarsLayer, drawLinesLayer } = useGanttRenderer(theme);
  const { hitTest } = useGanttHitTest(tasks, taskRowMap, rowHeight, startHour, hourWidth);

  // Debounce timer for lines layer
  const linesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);
  const prevScrollRef = useRef({ x: scrollX, y: scrollY });

  // ─── Resize Observer ───
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ─── Set canvas dimensions ───
  useEffect(() => {
    [gridCanvasRef, barsCanvasRef, linesCanvasRef].forEach(ref => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    });
  }, [size, dpr]);

  // ─── Build viewport ───
  const viewport: CanvasViewport = {
    scrollX,
    scrollY,
    width: size.width,
    height: size.height,
    startRow: Math.max(0, Math.floor(scrollY / rowHeight) - 2),
    endRow: Math.min(flatRows.length, Math.ceil((scrollY + size.height) / rowHeight) + 2),
  };

  const config = {
    rowHeight,
    startHour,
    endHour,
    hourWidth,
    showGrid,
    showToday,
    showProgress,
    todayHour,
    dpr,
  };

  // ─── Draw Grid Layer ───
  useEffect(() => {
    const ctx = gridCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawGridLayer(ctx, viewport, config, flatRows.length);
  }, [size, scrollX, scrollY, startHour, endHour, hourWidth, flatRows.length, showGrid, showToday, todayHour, dpr, theme]);

  // ─── Draw Bars Layer ───
  useEffect(() => {
    const ctx = barsCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBarsLayer(ctx, viewport, config, tasks, taskRowMap, flatRows, hoveredTask?.id || null);
  }, [size, scrollX, scrollY, tasks, taskRowMap, flatRows, hoveredTask, hourWidth, startHour, showProgress, dpr, theme]);

  // ─── Draw Lines Layer (debounced during scroll) ───
  useEffect(() => {
    const scrollChanged =
      prevScrollRef.current.x !== scrollX || prevScrollRef.current.y !== scrollY;
    prevScrollRef.current = { x: scrollX, y: scrollY };

    if (scrollChanged) {
      isScrollingRef.current = true;
      if (linesTimerRef.current) clearTimeout(linesTimerRef.current);
      linesTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        const ctx = linesCanvasRef.current?.getContext('2d');
        if (ctx) {
          drawLinesLayer(ctx, viewport, config, tasks, taskRowMap, dependencies, links);
        }
      }, 150);
    } else {
      const ctx = linesCanvasRef.current?.getContext('2d');
      if (ctx) {
        drawLinesLayer(ctx, viewport, config, tasks, taskRowMap, dependencies, links);
      }
    }

    return () => {
      if (linesTimerRef.current) clearTimeout(linesTimerRef.current);
    };
  }, [size, scrollX, scrollY, tasks, taskRowMap, dependencies, links, hourWidth, startHour, dpr, theme]);

  // ─── Mouse handlers ───
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning.current) {
        onPanMove(e);
        setHoveredTask(null);
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      const result = hitTest(canvasX, canvasY, viewport);
      setHoveredTask(result?.task || null);
      setTooltipPos({ x: e.clientX, y: e.clientY });

      // Cursor
      const container = containerRef.current;
      if (container) {
        if (result?.edge) {
          container.style.cursor = 'col-resize';
        } else if (result?.task) {
          container.style.cursor = result.task.draggable ? 'grab' : 'pointer';
        } else {
          container.style.cursor = isPanning.current ? 'grabbing' : 'default';
        }
      }
    },
    [hitTest, viewport, isPanning, onPanMove]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      const result = hitTest(canvasX, canvasY, viewport);

      if (!result) {
        // Start panning
        onPanStart(e);
      }
    },
    [hitTest, viewport, onPanStart]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      onPanEnd(e);
    },
    [onPanEnd]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      const result = hitTest(canvasX, canvasY, viewport);

      if (result?.task && onTaskClick) {
        onTaskClick(result.task);
      }
    },
    [hitTest, viewport, onTaskClick, isPanning]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      const result = hitTest(canvasX, canvasY, viewport);

      if (result?.task && onTaskDoubleClick) {
        onTaskDoubleClick(result.task);
      }
    },
    [hitTest, viewport, onTaskDoubleClick]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredTask(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="wxb-gantt-canvas-container"
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
      }}
      onWheel={onWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Layer 0: Grid */}
      <canvas
        ref={gridCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
      {/* Layer 1: Bars */}
      <canvas
        ref={barsCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
      {/* Layer 2: Lines */}
      <canvas
        ref={linesCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />

      {/* DOM Overlay: Tooltip */}
      <GanttTooltip
        task={hoveredTask}
        x={tooltipPos.x}
        y={tooltipPos.y}
        visible={!!hoveredTask && !isPanning.current}
      />
    </div>
  );
};
