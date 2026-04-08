/* ── useGanttViewport ──────────────────────────────────────────────
 *
 * Manages zoom, virtual scrolling, and layout calculations.
 */

"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import type { GanttNode, TimeBlock, FlattenedRow } from "../types";
import { GANTT_LAYOUT } from "../types";
import { flattenGanttNodes, calculateTimeRange } from "../utils";

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const OVERSCAN = 5;

export function useGanttViewport(
  ganttNodes: GanttNode[],
  expandedKeys: string[],
  timeBlocks: TimeBlock[],
) {
  const [zoomScale, setZoomScale] = useState(1);
  const ganttContentRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const hourWidth = GANTT_LAYOUT.baseHourWidth * zoomScale;

  const flattenedRows: FlattenedRow[] = useMemo(
    () => flattenGanttNodes(ganttNodes, expandedKeys),
    [ganttNodes, expandedKeys],
  );

  const { startDay, endDay } = useMemo(
    () => calculateTimeRange(timeBlocks),
    [timeBlocks],
  );

  const headerWidth = (endDay - startDay + 1) * 24 * hourWidth;
  const totalHeight = flattenedRows.length * GANTT_LAYOUT.rowHeight;

  // Row index mapping for cross-referencing
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flattenedRows.forEach((row, i) => map.set(row.id, i));
    return map;
  }, [flattenedRows]);

  // Operation block position map (nodeId → block position)
  const operationBlockMap = useMemo(() => {
    const map = new Map<
      string,
      { startHour: number; durationHours: number; nodeId: string }
    >();
    for (const block of timeBlocks) {
      if (block.isRecommended) {
        map.set(block.nodeId, {
          startHour: block.startHour,
          durationHours: block.durationHours,
          nodeId: block.nodeId,
        });
      }
    }
    return map;
  }, [timeBlocks]);

  // Node lookup map
  const nodeMap = useMemo(() => {
    const map = new Map<string, GanttNode>();
    const traverse = (nodes: GanttNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children) traverse(n.children);
      }
    };
    traverse(ganttNodes);
    return map;
  }, [ganttNodes]);

  // Simple visible range (no complex virtualization — @tanstack/react-virtual handles that)
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = 800; // approximate, updated on scroll

  const visibleStartIndex = Math.max(
    0,
    Math.floor(scrollTop / GANTT_LAYOUT.rowHeight) - OVERSCAN,
  );
  const visibleEndIndex = Math.min(
    flattenedRows.length - 1,
    Math.ceil((scrollTop + containerHeight) / GANTT_LAYOUT.rowHeight) + OVERSCAN,
  );

  // Visible rows for rendering
  const virtualRows = useMemo(
    () => flattenedRows,
    [flattenedRows],
  );
  const virtualOffsetY = 0;

  // Zoom handlers
  const handleZoomIn = useCallback(
    () => setZoomScale((s) => Math.min(MAX_ZOOM, s + ZOOM_STEP)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoomScale((s) => Math.max(MIN_ZOOM, s - ZOOM_STEP)),
    [],
  );
  const handleZoomReset = useCallback(() => setZoomScale(1), []);

  // Scroll sync handler
  const handleGanttScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
    [],
  );

  // Middle-button panning
  const handleGanttMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        isPanningRef.current = true;
        const el = ganttContentRef.current;
        if (el) {
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: el.scrollLeft,
            scrollTop: el.scrollTop,
          };
        }

        const handleMove = (me: MouseEvent) => {
          if (!isPanningRef.current || !el) return;
          el.scrollLeft = panStartRef.current.scrollLeft - (me.clientX - panStartRef.current.x);
          el.scrollTop = panStartRef.current.scrollTop - (me.clientY - panStartRef.current.y);
        };

        const handleUp = () => {
          isPanningRef.current = false;
          window.removeEventListener("mousemove", handleMove);
          window.removeEventListener("mouseup", handleUp);
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
      }
    },
    [],
  );

  return {
    zoomScale,
    setZoomScale,
    ganttContentRef,
    flattenedRows,
    virtualRows,
    totalHeight,
    virtualOffsetY,
    handleGanttScroll,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    hourWidth,
    headerWidth,
    startDay,
    endDay,
    rowIndexMap,
    operationBlockMap,
    visibleStartIndex,
    visibleEndIndex,
    overscanCount: OVERSCAN,
    handleGanttMouseDown,
    isPanningRef,
    nodeMap,
  };
}
