import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GanttNode, TimeBlock, FlattenedRow } from '../types';
import { ROW_HEIGHT, BASE_HOUR_WIDTH } from '../constants';
import { flattenGanttNodes, calculateTimeRange } from '../utils';

export const useGanttViewport = (
    ganttNodes: GanttNode[],
    expandedKeys: string[],
    timeBlocks: TimeBlock[]
) => {
    const [zoomScale, setZoomScale] = useState(1.0);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(640);
    const ganttContentRef = useRef<HTMLDivElement>(null);

    const flattenedRows = useMemo(() => {
        if (!ganttNodes.length) {
            return [] as FlattenedRow[];
        }
        return flattenGanttNodes(ganttNodes, expandedKeys, 0, undefined);
    }, [ganttNodes, expandedKeys]);

    const totalHeight = flattenedRows.length * ROW_HEIGHT;
    const overscanCount = 6;
    const visibleStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const viewportRowCount = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
    const visibleEndIndex = Math.min(flattenedRows.length, visibleStartIndex + viewportRowCount + overscanCount);
    const virtualRows = useMemo(() => flattenedRows.slice(visibleStartIndex, visibleEndIndex), [flattenedRows, visibleStartIndex, visibleEndIndex]);
    const virtualOffsetY = visibleStartIndex * ROW_HEIGHT;

    const handleGanttScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const element = e.currentTarget;
        const nextScrollTop = element.scrollTop;
        setScrollTop(nextScrollTop);
    }, []);

    const handleZoomIn = useCallback(() => {
        setZoomScale(prev => Math.min(prev * 1.2, 5.0));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoomScale(prev => Math.max(prev / 1.2, 0.1));
    }, []);

    const handleZoomReset = useCallback(() => {
        setZoomScale(1.0);
    }, []);

    useEffect(() => {
        const container = ganttContentRef.current;
        if (!container) {
            return;
        }

        const updateViewport = () => {
            setViewportHeight(container.clientHeight || 0);
        };

        updateViewport();

        const resizeObserver = new ResizeObserver(() => {
            updateViewport();
        });
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // Pan functionality
    const isPanningRef = useRef(false);
    const panStartXRef = useRef(0);
    const panStartScrollLeftRef = useRef(0);
    const panRafRef = useRef<number | null>(null);

    const updatePan = useCallback((clientX: number) => {
        if (!ganttContentRef.current || !isPanningRef.current) return;
        const deltaX = panStartXRef.current - clientX;
        const targetScrollLeft = panStartScrollLeftRef.current + deltaX;

        if (panRafRef.current) {
            cancelAnimationFrame(panRafRef.current);
        }
        panRafRef.current = requestAnimationFrame(() => {
            if (ganttContentRef.current) {
                ganttContentRef.current.scrollLeft = targetScrollLeft;
            }
        });
    }, []);

    const handleWindowMouseMove = useCallback((e: MouseEvent) => {
        if (!isPanningRef.current) return;
        e.preventDefault();
        updatePan(e.clientX);
    }, [updatePan]);

    const handleWindowMouseUp = useCallback(() => {
        isPanningRef.current = false;
        document.body.style.cursor = '';
        if (panRafRef.current) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
    }, [handleWindowMouseMove]);

    const handleGanttMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return; // Only left mouse button
        if (!ganttContentRef.current) return;

        // Don't pan if clicking on interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('[role="button"], button, a, input, select, textarea')) {
            return;
        }

        isPanningRef.current = true;
        panStartXRef.current = e.clientX;
        panStartScrollLeftRef.current = ganttContentRef.current.scrollLeft;
        document.body.style.cursor = 'grabbing';

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    }, [handleWindowMouseMove, handleWindowMouseUp]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (panRafRef.current) {
                cancelAnimationFrame(panRafRef.current);
            }
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [handleWindowMouseMove, handleWindowMouseUp]);

    const timeRange = useMemo(() => calculateTimeRange(timeBlocks), [timeBlocks]);
    const hourWidth = BASE_HOUR_WIDTH * zoomScale;
    const startDay = timeRange.startDay;
    const endDay = timeRange.endDay;
    const totalDays = endDay - startDay + 1;
    const headerWidth = Math.max(totalDays, 0) * 24 * hourWidth;

    // Build row index map for efficient lookup
    const rowIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        flattenedRows.forEach((row, index) => {
            map.set(row.id, index);
        });
        return map;
    }, [flattenedRows]);

    // Build operation block map for constraint rendering
    const operationBlockMap = useMemo(() => {
        const map = new Map<number, TimeBlock>();
        timeBlocks.forEach(block => {
            if (block.isStage || block.isTimeWindow) return;

            // 支持两种情况：
            // 1. 普通操作：node_id 格式为 "operation_${id}"
            // 2. 合并的独立操作：有 operationPlanId 字段
            if (block.node_id.startsWith('operation_')) {
                const scheduleId = Number(block.node_id.replace('operation_', ''));
                if (!Number.isNaN(scheduleId)) {
                    map.set(scheduleId, block);
                }
            } else if ((block as any).operationPlanId) {
                // 合并的独立操作使用 operationPlanId
                const scheduleId = (block as any).operationPlanId;
                if (!Number.isNaN(scheduleId)) {
                    map.set(scheduleId, block);
                }
            }
        });
        return map;
    }, [timeBlocks]);

    return {
        zoomScale,
        setZoomScale,
        scrollTop,
        setScrollTop,
        viewportHeight,
        ganttContentRef,
        flattenedRows,
        virtualRows,
        totalHeight,
        visibleStartIndex,
        visibleEndIndex,
        virtualOffsetY,
        handleGanttScroll,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
        hourWidth,
        timeRange,
        headerWidth,
        startDay,
        endDay,
        totalDays,
        rowIndexMap,
        operationBlockMap,
        overscanCount,
        handleGanttMouseDown,
        isPanningRef
    };
};
