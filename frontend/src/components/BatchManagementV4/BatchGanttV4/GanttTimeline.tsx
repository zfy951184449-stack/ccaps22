import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Tooltip } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { GanttBatch, GanttDependency, GanttOperation, GanttShareGroup, OffScreenOperation } from './types';
import { useGantt } from './GanttContext';
import ShareGroupConnections from './ShareGroupConnections';
import ConstraintConnections from './ConstraintConnections';
import { BATCH_COLORS } from './constants';
import { usePeakPersonnelV4 } from './hooks/usePeakPersonnelV4';
import { GanttRenderRow, RowCalculationResult, getVisibleOperations, isAlternateRow } from './rowUtils';
import { useVirtualRows } from './hooks/useVirtualRows';
import './BatchGanttV4.css';

interface GanttTimelineProps {
    batches: GanttBatch[];
    rows: GanttRenderRow[];
    rowLayout: RowCalculationResult;
    rowHeight: number;
    shareGroups?: GanttShareGroup[];
    dependencies?: GanttDependency[];
    offScreenOperations?: OffScreenOperation[];
    onVerticalScroll?: (scrollTop: number) => void;
    onScrollInteraction?: () => void;
    onHorizontalScroll?: (scrollLeft: number) => void;
    onOperationDoubleClick?: (operation: GanttOperation) => void;
}

const HEADER_HEIGHT = 56;

const GanttTimelineComponent: React.FC<GanttTimelineProps> = ({
    batches,
    rows,
    rowLayout,
    rowHeight,
    shareGroups = [],
    dependencies = [],
    offScreenOperations = [],
    onVerticalScroll,
    onScrollInteraction,
    onHorizontalScroll,
    onOperationDoubleClick
}) => {
    const { startDate, endDate, viewMode, zoomLevel, enterSingleDayMode, expandedBatches, layoutMode, showShareGroupLines } = useGantt();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isGrabbing, setIsGrabbing] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);

    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeftStart = useRef(0);
    const scrollIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isScrollingRef = useRef(false);

    const dayWidth = zoomLevel;
    const hourWidth = dayWidth / 24;
    const totalDays = endDate.diff(startDate, 'day') + 1;
    const totalWidth = totalDays * dayWidth;
    const totalBodyHeight = rowLayout.totalRows * rowHeight;
    const dates = useMemo(
        () => Array.from({ length: totalDays }, (_, index) => startDate.add(index, 'day')),
        [startDate, totalDays]
    );
    const { startIndex, endIndex } = useVirtualRows(scrollContainerRef, rowLayout.totalRows, rowHeight, { topOffset: HEADER_HEIGHT });
    const visibleRows = useMemo(
        () => rows.slice(startIndex, endIndex + 1),
        [endIndex, rows, startIndex]
    );
    const visibleTop = startIndex * rowHeight;
    const visibleBottom = (endIndex + 1) * rowHeight;

    const getLeftPosition = useCallback((dateStr: string) => {
        const date = dayjs(dateStr);
        const diffHours = date.diff(startDate, 'hour', true);
        return diffHours * hourWidth;
    }, [hourWidth, startDate]);

    const getWidth = useCallback((start: string, end: string) => {
        const startTime = dayjs(start);
        const endTime = dayjs(end);
        const diffHours = endTime.diff(startTime, 'hour', true);
        return Math.max(diffHours * hourWidth, 4);
    }, [hourWidth]);

    const dailyPeaks = usePeakPersonnelV4(batches, shareGroups, startDate, endDate);

    const markScrolling = useCallback(() => {
        if (!isScrollingRef.current) {
            isScrollingRef.current = true;
            setIsScrolling(true);
        }

        if (scrollIdleTimeoutRef.current) {
            clearTimeout(scrollIdleTimeoutRef.current);
        }

        scrollIdleTimeoutRef.current = setTimeout(() => {
            isScrollingRef.current = false;
            setIsScrolling(false);
        }, 140);
    }, []);

    useEffect(() => {
        return () => {
            if (scrollIdleTimeoutRef.current) {
                clearTimeout(scrollIdleTimeoutRef.current);
            }
        };
    }, []);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        markScrolling();
        onVerticalScroll?.(event.currentTarget.scrollTop);
        onScrollInteraction?.();
        onHorizontalScroll?.(event.currentTarget.scrollLeft);
    };

    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) {
            return;
        }
        isDragging.current = true;
        startX.current = event.pageX;
        scrollLeftStart.current = scrollContainerRef.current.scrollLeft;
        setIsGrabbing(true);
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging.current || !scrollContainerRef.current) {
            return;
        }
        event.preventDefault();
        markScrolling();
        const nextX = event.pageX;
        const walk = nextX - startX.current;
        scrollContainerRef.current.scrollLeft = scrollLeftStart.current - walk;
    };

    const handleMouseUpOrLeave = () => {
        isDragging.current = false;
        setIsGrabbing(false);
    };

    const shouldRenderConnections = !isScrolling && !isGrabbing;

    const renderGanttBarLabel = (text: string, width: number) => {
        if (width < 30) {
            return null;
        }

        const charWidth = 7;
        const textWidth = text.length * charWidth;
        const gap = 800;

        if (width > (textWidth + gap) * 1.5) {
            const repeatCount = Math.floor(width / (textWidth + gap));
            const labels = [];
            for (let index = 0; index < repeatCount; index += 1) {
                labels.push(
                    <span
                        key={index}
                        style={{
                            color: '#1F2937',
                            fontWeight: 500,
                            fontSize: 11,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        {text}
                    </span>
                );
            }
            return (
                <div
                    style={{
                        display: 'flex',
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'space-evenly',
                        overflow: 'hidden'
                    }}
                >
                    {labels}
                </div>
            );
        }

        return (
            <div
                style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    padding: '0 4px'
                }}
            >
                <span
                    style={{
                        color: '#1F2937',
                        fontWeight: 500,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {text}
                </span>
            </div>
        );
    };

    const renderCompactOperationBar = (operation: GanttOperation, batchId: number, color: { solid?: string; border: string }) => {
        const operationWidth = getWidth(operation.startDate, operation.endDate);

        return (
            <Tooltip key={operation.id} title={`${operation.name} (${operation.status})`}>
                <div
                    className="gantt-bar-op"
                    style={{
                        left: getLeftPosition(operation.startDate),
                        width: operationWidth,
                        minWidth: 8,
                        top: 7,
                        height: 18,
                        zIndex: 20,
                        backgroundColor: color.solid || color.border,
                        cursor: 'pointer'
                    }}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        onOperationDoubleClick?.({
                            ...operation,
                            batch_id: batchId
                        });
                    }}
                >
                    {renderGanttBarLabel(operation.name, operationWidth)}
                </div>
            </Tooltip>
        );
    };

    const renderDetailedOperationBar = (
        operation: GanttOperation,
        batchId: number,
        color: { solid?: string; border: string },
        key: string
    ) => {
        const operationWidth = getWidth(operation.startDate, operation.endDate);
        const hasWindow = operation.windowStartDate && operation.windowEndDate;

        return (
            <React.Fragment key={key}>
                {hasWindow && (
                    <Tooltip title={`窗口: ${dayjs(operation.windowStartDate).format('MM-DD HH:mm')} - ${dayjs(operation.windowEndDate).format('MM-DD HH:mm')}`}>
                        <div
                            className="gantt-bar-window"
                            style={{
                                left: getLeftPosition(operation.windowStartDate!),
                                width: getWidth(operation.windowStartDate!, operation.windowEndDate!),
                                top: 4,
                                height: 24
                            }}
                        />
                    </Tooltip>
                )}
                <Tooltip title={`${operation.name}: ${operation.assignedPeople}/${operation.requiredPeople} people`}>
                    <div
                        className="gantt-bar-op"
                        style={{
                            left: getLeftPosition(operation.startDate),
                            width: operationWidth,
                            top: 4,
                            height: 24,
                            padding: '0 4px',
                            justifyContent: 'center',
                            zIndex: 20,
                            backgroundColor: color.solid || color.border,
                            cursor: 'pointer'
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            onOperationDoubleClick?.({
                                ...operation,
                                batch_id: batchId
                            });
                        }}
                    >
                        {!hasWindow && operationWidth > 30 ? operation.name : ''}
                    </div>
                </Tooltip>
                {hasWindow && (
                    <div
                        className="gantt-text-overlay"
                        style={{
                            left: getLeftPosition(operation.windowStartDate!),
                            width: getWidth(operation.windowStartDate!, operation.windowEndDate!),
                        }}
                    >
                        {operation.name}
                    </div>
                )}
            </React.Fragment>
        );
    };

    const operationPositions = useMemo(() => {
        const positions = new Map<number, { x: number; y: number; width: number }>();

        rows.forEach((row) => {
            if (row.kind === 'batch') {
                if (layoutMode === 'compact' && !expandedBatches.has(row.batch.id)) {
                    row.batch.stages.forEach((stage) => {
                        getVisibleOperations(stage.operations).forEach((operation) => {
                            positions.set(operation.id, {
                                x: getLeftPosition(operation.startDate),
                                y: row.rowIndex * rowHeight,
                                width: getWidth(operation.startDate, operation.endDate)
                            });
                        });
                    });
                }
                return;
            }

            if (row.kind === 'stage') {
                if (layoutMode === 'compact') {
                    getVisibleOperations(row.stage.operations).forEach((operation) => {
                        positions.set(operation.id, {
                            x: getLeftPosition(operation.startDate),
                            y: row.rowIndex * rowHeight,
                            width: getWidth(operation.startDate, operation.endDate)
                        });
                    });
                }
                return;
            }

            if (row.kind === 'lane') {
                row.operations.forEach((operation) => {
                    positions.set(operation.id, {
                        x: getLeftPosition(operation.startDate),
                        y: row.rowIndex * rowHeight,
                        width: getWidth(operation.startDate, operation.endDate)
                    });
                });
                return;
            }

            positions.set(row.operation.id, {
                x: getLeftPosition(row.operation.startDate),
                y: row.rowIndex * rowHeight,
                width: getWidth(row.operation.startDate, row.operation.endDate)
            });
        });

        offScreenOperations.forEach((offscreenOperation) => {
            const linkedPosition = positions.get(offscreenOperation.linkedToOpId);
            if (!linkedPosition) {
                return;
            }

            positions.set(offscreenOperation.id, {
                x: offscreenOperation.direction === 'left' ? 0 : totalWidth,
                y: linkedPosition.y,
                width: 10
            });
        });

        return positions;
    }, [expandedBatches, getLeftPosition, getWidth, layoutMode, offScreenOperations, rowHeight, rows, totalWidth]);

    const renderHeader = () => {
        if (viewMode === 'day') {
            const singleDayWidth = totalWidth / 24;
            const dayKey = startDate.format('YYYY-MM-DD');
            const dayPeak = dailyPeaks.get(dayKey);

            return (
                <div className="gantt-timeline-header-sticky">
                    <div className="gantt-timeline-header-row gantt-border-b" style={{ justifyContent: 'space-between', paddingRight: 16 }}>
                        <div
                            className="gantt-timeline-cell"
                            style={{
                                left: 0,
                                width: 'auto',
                                position: 'relative',
                                justifyContent: 'flex-start',
                                paddingLeft: 12,
                                border: 'none',
                                fontWeight: 600,
                                fontSize: 14,
                                color: '#1F2937'
                            }}
                        >
                            {startDate.format('MMMM D, YYYY')}
                            <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>
                                {startDate.format('dddd')}
                            </span>
                        </div>

                        {dayPeak && dayPeak.peak > 0 && (
                            <div className="gantt-peak-badge" style={{ backgroundColor: dayPeak.color }}>
                                <TeamOutlined /> 峰值: {dayPeak.peak} 人 ({dayPeak.peakHour}:00)
                            </div>
                        )}
                    </div>
                    <div className="gantt-timeline-header-row">
                        {Array.from({ length: 24 }).map((_, hour) => (
                            <div
                                key={`hour-${hour}`}
                                className="gantt-timeline-cell"
                                style={{
                                    left: hour * singleDayWidth,
                                    width: singleDayWidth,
                                    color: '#6B7280',
                                    fontSize: 11
                                }}
                            >
                                {hour.toString().padStart(2, '0')}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="gantt-timeline-header-sticky">
                <div className="gantt-timeline-header-row gantt-border-b">
                    {dates.map((date, index) => {
                        const isMonthStart = date.date() === 1 || index === 0;
                        if (!isMonthStart) {
                            return null;
                        }
                        return (
                            <div
                                key={`month-${index}`}
                                className="gantt-timeline-cell"
                                style={{ left: index * dayWidth, justifyContent: 'flex-start', paddingLeft: 8, border: 'none', fontWeight: 600, color: '#6B7280' }}
                            >
                                {date.format('MMMM YYYY')}
                            </div>
                        );
                    })}
                </div>
                <div className="gantt-timeline-header-row">
                    {dates.map((date, index) => {
                        const isWeekend = date.day() === 0 || date.day() === 6;
                        const dayKey = date.format('YYYY-MM-DD');
                        const peakData = dailyPeaks.get(dayKey);

                        return (
                            <div
                                key={`day-${index}`}
                                className={`gantt-timeline-cell ${isWeekend ? 'gantt-cell-weekend' : ''}`}
                                style={{
                                    left: index * dayWidth,
                                    width: dayWidth,
                                    color: isWeekend ? '#9CA3AF' : '#4B5563',
                                    cursor: 'pointer',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    gap: 2
                                }}
                                title="Double click to zoom into this day"
                                onDoubleClick={() => enterSingleDayMode(date, batches)}
                            >
                                <div>
                                    {date.format('D')}
                                    <span className="gantt-text-xxs ml-1" style={{ color: '#9CA3AF', marginLeft: 0 }}>
                                        {date.format('ddd')}
                                    </span>
                                </div>

                                {peakData && peakData.peak > 0 && dayWidth > 50 && (
                                    <Tooltip title={`峰值: ${peakData.peak}人 @ ${peakData.peakHour}:00`}>
                                        <div className="gantt-peak-badge" style={{ backgroundColor: peakData.color, fontSize: 10, padding: '0 4px', height: 16 }}>
                                            <TeamOutlined style={{ fontSize: 10 }} /> {peakData.peak}
                                        </div>
                                    </Tooltip>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderGridBackground = () => {
        const backgroundImages = [
            'linear-gradient(to right, rgba(88, 86, 214, 0.08) 0%, rgba(88, 86, 214, 0.08) 37.5%, rgba(52, 199, 89, 0.08) 37.5%, rgba(52, 199, 89, 0.08) 70.83%, rgba(255, 149, 0, 0.05) 70.83%, rgba(255, 149, 0, 0.05) 87.5%, rgba(88, 86, 214, 0.08) 87.5%, rgba(88, 86, 214, 0.08) 100%)',
            'linear-gradient(to right, transparent 0, transparent calc(100% - 1px), #F3F4F6 calc(100% - 1px), #F3F4F6 100%)',
        ];
        const backgroundSizes = [`${dayWidth}px 100%`, `${dayWidth}px 100%`];

        if (dayWidth > 60) {
            backgroundImages.push('linear-gradient(to right, transparent 0, transparent calc(100% - 1px), #F9FAFB calc(100% - 1px), #F9FAFB 100%)');
            backgroundSizes.push(`${hourWidth}px 100%`);
        }

        return (
            <div
                className="gantt-grid-bg"
                style={{
                    backgroundImage: backgroundImages.join(','),
                    backgroundRepeat: 'repeat',
                    backgroundSize: backgroundSizes.join(','),
                }}
            />
        );
    };

    const renderRow = (row: GanttRenderRow) => {
        const color = BATCH_COLORS[row.batchIndex % BATCH_COLORS.length];
        const baseClassName = `gantt-relative gantt-border-b ${isAlternateRow(row.rowIndex) ? 'gantt-row-alt' : ''}`;
        const baseStyle: React.CSSProperties = {
            position: 'absolute',
            top: row.rowIndex * rowHeight,
            left: 0,
            right: 0,
            height: rowHeight,
            backgroundColor: color.tint,
            overflow: 'hidden'
        };

        if (row.kind === 'batch') {
            const batchWidth = getWidth(row.batch.startDate, row.batch.endDate);
            return (
                <div key={row.key} className={baseClassName} style={baseStyle}>
                    <div
                        className="gantt-bar-batch"
                        style={{
                            left: getLeftPosition(row.batch.startDate),
                            width: batchWidth,
                            top: 4,
                            backgroundColor: color.bg,
                            borderColor: color.border,
                            borderWidth: 1,
                            borderStyle: 'solid',
                            zIndex: 4
                        }}
                    >
                        {renderGanttBarLabel(row.batch.code, batchWidth)}
                    </div>
                </div>
            );
        }

        if (row.kind === 'stage') {
            const stageWidth = getWidth(row.stage.startDate, row.stage.endDate);
            return (
                <div key={row.key} className={baseClassName} style={baseStyle}>
                    {layoutMode === 'compact' ? (
                        getVisibleOperations(row.stage.operations).map((operation) =>
                            renderCompactOperationBar(operation, row.batch.id, color)
                        )
                    ) : (
                        <div
                            className="gantt-bar-stage"
                            style={{
                                left: getLeftPosition(row.stage.startDate),
                                width: stageWidth,
                                backgroundColor: color.bg.replace(/[\d.]+\)$/, '0.4)'),
                                borderColor: color.border,
                                borderWidth: 1,
                                borderStyle: 'solid',
                                top: 7,
                                height: 18,
                                zIndex: 4
                            }}
                        >
                            {renderGanttBarLabel(row.stage.name, stageWidth)}
                        </div>
                    )}
                </div>
            );
        }

        if (row.kind === 'lane') {
            return (
                <div key={row.key} className={`${baseClassName} gantt-row-lane`} style={baseStyle}>
                    {row.operations.map((operation) => renderDetailedOperationBar(operation, row.batch.id, color, `${row.key}-${operation.id}`))}
                </div>
            );
        }

        return (
            <div key={row.key} className={baseClassName} style={baseStyle}>
                {renderDetailedOperationBar(row.operation, row.batch.id, color, row.key)}
            </div>
        );
    };

    return (
        <div
            ref={scrollContainerRef}
            className="gantt-timeline-container"
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            style={{
                cursor: isGrabbing ? 'grabbing' : 'grab',
                userSelect: 'none'
            }}
        >
            <div style={{ width: totalWidth, minHeight: HEADER_HEIGHT + totalBodyHeight }} className="gantt-relative">
                {renderHeader()}
                <div className="gantt-w-full gantt-relative" style={{ height: totalBodyHeight, overflow: 'hidden' }}>
                    {renderGridBackground()}
                    {shouldRenderConnections && showShareGroupLines && shareGroups.length > 0 && (
                        <ShareGroupConnections
                            shareGroups={shareGroups}
                            operationPositions={operationPositions}
                            rowHeight={rowHeight}
                            visibleTop={visibleTop - rowHeight * 4}
                            visibleBottom={visibleBottom + rowHeight * 4}
                        />
                    )}
                    {shouldRenderConnections && dependencies.length > 0 && (
                        <ConstraintConnections
                            dependencies={dependencies}
                            operationPositions={operationPositions}
                            rowHeight={rowHeight}
                            visibleTop={visibleTop - rowHeight * 4}
                            visibleBottom={visibleBottom + rowHeight * 4}
                        />
                    )}
                    {visibleRows.map(renderRow)}
                </div>
            </div>
        </div>
    );
};

const GanttTimeline = React.memo(GanttTimelineComponent);

export default GanttTimeline;
