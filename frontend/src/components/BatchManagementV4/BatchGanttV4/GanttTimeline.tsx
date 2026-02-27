import React, { useRef, useMemo, useState } from 'react';
import { GanttBatch, GanttShareGroup, GanttDependency, OffScreenOperation, GanttOperation } from './types';
import { useGantt } from './GanttContext';
import ShareGroupConnections from './ShareGroupConnections';
import ConstraintConnections from './ConstraintConnections'; // Re-import
import dayjs from 'dayjs';
import { Tooltip } from 'antd';
import { BATCH_COLORS } from './constants';
import { usePeakPersonnelV4 } from './hooks/usePeakPersonnelV4'; // Import Hook
import { TeamOutlined } from '@ant-design/icons'; // Import Icon
import { calculateRowLayout, isAlternateRow } from './rowUtils'; // 统一行计算
import './BatchGanttV4.css';

interface GanttTimelineProps {
    data: GanttBatch[];
    shareGroups?: GanttShareGroup[];
    dependencies?: GanttDependency[];
    offScreenOperations?: OffScreenOperation[];
    onVerticalScroll?: (scrollTop: number) => void;
    onScrollInteraction?: () => void;
    onHorizontalScroll?: (scrollLeft: number) => void;
    onOperationDoubleClick?: (operation: GanttOperation) => void;
}

const GanttTimeline: React.FC<GanttTimelineProps> = ({ data, shareGroups = [], dependencies = [], offScreenOperations = [], onVerticalScroll, onScrollInteraction, onHorizontalScroll, onOperationDoubleClick }) => {
    const { startDate, endDate, viewMode, zoomLevel, setStartDate, setEndDate, setZoomLevel, setViewMode, enterSingleDayMode } = useGantt();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Drag Scroll State
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeftStart = useRef(0);
    const [isGrabbing, setIsGrabbing] = useState(false);

    // Sync scroll
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (onVerticalScroll) {
            onVerticalScroll(e.currentTarget.scrollTop);
        }
        if (onScrollInteraction) {
            onScrollInteraction();
        }
        if (onHorizontalScroll) {
            onHorizontalScroll(e.currentTarget.scrollLeft);
        }
    };

    // Drag Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        isDragging.current = true;
        startX.current = e.pageX;
        scrollLeftStart.current = scrollContainerRef.current.scrollLeft;
        setIsGrabbing(true);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging.current || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX;
        const walk = (x - startX.current); // Scroll pixels = drag pixels (1:1)
        scrollContainerRef.current.scrollLeft = scrollLeftStart.current - walk;
    };

    const handleMouseUpOrLeave = () => {
        isDragging.current = false;
        setIsGrabbing(false);
    };

    // --- Configuration based on Zoom ---
    const dayWidth = zoomLevel; // Direct mapping: 1 unit = 1px
    const hourWidth = dayWidth / 24;

    const totalDays = endDate.diff(startDate, 'day') + 1;
    const dates = Array.from({ length: totalDays }, (_, i) => startDate.add(i, 'day'));

    // --- Styles ---
    const headerHeight = 56;
    const rowHeight = 32;
    const totalWidth = totalDays * dayWidth;

    // --- Helpers ---
    const getLeftPosition = (dateStr: string) => {
        const date = dayjs(dateStr);
        const diffHours = date.diff(startDate, 'hour', true);
        return diffHours * hourWidth;
    };

    const getWidth = (start: string, end: string) => {
        const s = dayjs(start);
        const e = dayjs(end);
        const diffHours = e.diff(s, 'hour', true);
        return Math.max(diffHours * hourWidth, 4); // Min width 4px
    };

    // --- Render ---
    // --- Peak Personnel Calculation ---
    // Import hook assuming it's available (need to update imports)
    const dailyPeaks = usePeakPersonnelV4(data, shareGroups, startDate, endDate);

    // --- Render ---
    const renderHeader = () => {
        // Day View: Date on top, Hours on bottom
        if (viewMode === 'day') {
            const hourWidth = totalWidth / 24;
            // Get current day peak for display
            const dayKey = startDate.format('YYYY-MM-DD');
            const dayPeak = dailyPeaks.get(dayKey);

            return (
                <div className="gantt-timeline-header-sticky">
                    {/* Row 1: Full Date & Peak Info */}
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
                            {startDate.format('MMMM D, YYYY')} <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>{startDate.format('dddd')}</span>
                        </div>

                        {dayPeak && dayPeak.peak > 0 && (
                            <div className="gantt-peak-badge" style={{ backgroundColor: dayPeak.color }}>
                                <TeamOutlined /> 峰值: {dayPeak.peak} 人 ({dayPeak.peakHour}:00)
                            </div>
                        )}
                    </div>
                    {/* Row 2: Hours 0-23 */}
                    <div className="gantt-timeline-header-row">
                        {Array.from({ length: 24 }).map((_, hour) => (
                            <div
                                key={`hour-${hour}`}
                                className="gantt-timeline-cell"
                                style={{
                                    left: hour * hourWidth,
                                    width: hourWidth,
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

        // Week/Month View: Month on top, Days on bottom
        return (
            <div className="gantt-timeline-header-sticky">
                <div className="gantt-timeline-header-row gantt-border-b">
                    {dates.map((date, index) => {
                        const isMonthStart = date.date() === 1 || index === 0;
                        if (!isMonthStart) return null;
                        return (
                            <div key={`month-${index}`} className="gantt-timeline-cell"
                                style={{ left: index * dayWidth, justifyContent: 'flex-start', paddingLeft: 8, border: 'none', fontWeight: 600, color: '#6B7280' }}>
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
                            <div key={`day-${index}`}
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
                                onDoubleClick={() => {
                                    enterSingleDayMode(date, data);
                                }}
                            >
                                <div>
                                    {date.format('D')} <span className="gantt-text-xxs ml-1" style={{ color: '#9CA3AF', marginLeft: 0 }}>{date.format('ddd')}</span>
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
        return (
            <div className="gantt-grid-bg">
                {dates.map((date, index) => {
                    const isWeekend = date.day() === 0 || date.day() === 6;
                    // Render hour lines if dayWidth > 60px
                    const showHourLines = dayWidth > 60;

                    return (
                        <div key={`grid-${index}`}
                            className="gantt-grid-line"
                            style={{ minWidth: dayWidth, width: dayWidth, backgroundColor: 'transparent', position: 'relative' }}
                        >
                            {/* Shift Zones */}
                            {/* 1. Night (00:00 - 09:00) 9h = 37.5% */}
                            <div className="gantt-zone-night" style={{ left: 0, width: '37.5%' }} />

                            {/* 2. Normal Day (09:00 - 17:00) 8h = 33.33% starting at 9/24 = 37.5% */}
                            <div className="gantt-zone-day" style={{ left: '37.5%', width: '33.33%' }} />

                            {/* 3. Long Day (17:00 - 21:00) 4h = 16.66% starting at 17/24 = 70.83% */}
                            <div className="gantt-zone-long-day" style={{ left: '70.83%', width: '16.66%' }} />

                            {/* 4. Night (21:00 - 24:00) 3h = 12.5% starting at 21/24 = 87.5% */}
                            <div className="gantt-zone-night" style={{ left: '87.5%', width: '12.5%' }} />

                            {/* Hour Lines */}
                            {showHourLines && Array.from({ length: 23 }).map((_, hourIndex) => (
                                <div
                                    key={`hour-${hourIndex}`}
                                    className="gantt-grid-hour-line"
                                    style={{
                                        left: `${(hourIndex + 1) * (100 / 24)}%`
                                    }}
                                />
                            ))}
                        </div>
                    );
                })}
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
                userSelect: 'none' // Prevent text selection while dragging
            }}
        >
            <div style={{ width: totalWidth, minHeight: '100%' }} className="gantt-relative">
                {renderHeader()}
                <div className="gantt-relative" style={{ zIndex: 10 }}>
                    {renderGridBackground()}
                    <TimelineBody
                        data={data}
                        shareGroups={shareGroups}
                        dependencies={dependencies}
                        offScreenOperations={offScreenOperations}
                        rowHeight={rowHeight}
                        totalWidth={totalWidth}
                        getPos={getLeftPosition}
                        getWidth={getWidth}
                        onOperationDoubleClick={onOperationDoubleClick}
                    />
                </div>
            </div>
        </div>
    );
};

const TimelineBody: React.FC<{
    data: GanttBatch[],
    shareGroups: GanttShareGroup[],
    dependencies: GanttDependency[],
    offScreenOperations: OffScreenOperation[],
    rowHeight: number,
    totalWidth: number,
    getPos: (d: string) => number,
    getWidth: (s: string, e: string) => number,
    onOperationDoubleClick?: (operation: GanttOperation) => void
}> = ({ data, shareGroups, dependencies, offScreenOperations, rowHeight, totalWidth, getPos, getWidth, onOperationDoubleClick }) => {
    const { expandedBatches, expandedStages, layoutMode, showShareGroupLines } = useGantt();

    // 使用统一的行计算逻辑
    const { rowMap } = useMemo(
        () => calculateRowLayout(data, expandedBatches, expandedStages, layoutMode),
        [data, expandedBatches, expandedStages, layoutMode]
    );

    // 计算操作位置，用于绘制共享组连接线
    // P0-1: 支持 Compact 模式
    // P0-3: 添加 rowMap 安全检查
    const operationPositions = useMemo(() => {
        const positions = new Map<number, { x: number; y: number; width: number }>();

        data.forEach(batch => {
            const batchRowIndex = rowMap.get(`batch-${batch.id}`);
            if (batchRowIndex === undefined) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`[GanttTimeline] Missing rowMap entry for batch-${batch.id}`);
                }
                return;
            }

            if (!expandedBatches.has(batch.id)) {
                // Batch 未展开时：Compact 模式下仍需生成位置（指向 Batch 行）
                // Standard 模式下不生成位置（连接线隐藏）
                if (layoutMode === 'compact') {
                    batch.stages.forEach(stage => {
                        stage.operations.filter(op => !op.isOffScreen).forEach(op => {
                            positions.set(op.id, {
                                x: getPos(op.startDate),
                                y: batchRowIndex * rowHeight,
                                width: getWidth(op.startDate, op.endDate)
                            });
                        });
                    });
                }
                return;
            }

            // Batch 已展开
            batch.stages.forEach(stage => {
                const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                const stageRowIndex = rowMap.get(stageKey);
                if (stageRowIndex === undefined) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[GanttTimeline] Missing rowMap entry for ${stageKey}`);
                    }
                    return;
                }

                if (layoutMode === 'compact') {
                    // Compact 模式 - 所有操作使用 Stage 行的 Y 坐标
                    stage.operations.filter(op => !op.isOffScreen).forEach(op => {
                        positions.set(op.id, {
                            x: getPos(op.startDate),
                            y: stageRowIndex * rowHeight,
                            width: getWidth(op.startDate, op.endDate)
                        });
                    });
                } else if (expandedStages.has(stageKey)) {
                    // Standard 模式 + Stage 展开 - 操作使用独立行
                    stage.operations.filter(op => !op.isOffScreen).forEach(op => {
                        const opRowIndex = rowMap.get(`op-${op.id}`);
                        if (opRowIndex === undefined) {
                            if (process.env.NODE_ENV === 'development') {
                                console.warn(`[GanttTimeline] Missing rowMap entry for op-${op.id}`);
                            }
                            return;
                        }
                        positions.set(op.id, {
                            x: getPos(op.startDate),
                            y: opRowIndex * rowHeight,
                            width: getWidth(op.startDate, op.endDate)
                        });
                    });
                }
                // Standard 模式 + Stage 折叠：不生成位置，连接线隐藏
            });
        });

        // V2: Add off-screen operations with virtual edge positions
        offScreenOperations.forEach(offOp => {
            const linkedPos = positions.get(offOp.linkedToOpId);
            if (linkedPos) {
                positions.set(offOp.id, {
                    x: offOp.direction === 'left' ? 0 : totalWidth,
                    y: linkedPos.y,
                    width: 10
                });
            }
        });

        return positions;
    }, [data, expandedBatches, expandedStages, layoutMode, rowHeight, getPos, getWidth, offScreenOperations, totalWidth, rowMap]);

    // Helper to render repeating labels for long bars
    const renderGanttBarLabel = (text: string, width: number) => {
        if (width < 30) return null;

        const charWidth = 7; // Approx width per char for 11px font
        const textWidth = text.length * charWidth;
        const gap = 800; // Gap between repeating labels

        // If bar is long enough to support repeating labels
        if (width > (textWidth + gap) * 1.5) {
            const repeatCount = Math.floor(width / (textWidth + gap));
            // Create an array of text elements
            const labels = [];
            for (let i = 0; i < repeatCount; i++) {
                labels.push(
                    <span key={i} style={{
                        color: '#1F2937', fontWeight: 500, fontSize: 11,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                        {text}
                    </span>
                );
            }
            return (
                <div style={{
                    display: 'flex', width: '100%', height: '100%',
                    alignItems: 'center', justifyContent: 'space-evenly', overflow: 'hidden'
                }}>
                    {labels}
                </div>
            );
        }

        // Default: Single centered label
        return (
            <div style={{
                display: 'flex', width: '100%', height: '100%',
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 4px'
            }}>
                <span style={{
                    color: '#1F2937', fontWeight: 500, fontSize: 11,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                    {text}
                </span>
            </div>
        );
    };

    // 构建行渲染
    const rows: React.ReactNode[] = [];

    // P0-5: DEV 环境下验证渲染顺序与 rowMap 一致
    if (process.env.NODE_ENV === 'development') {
        let expectedIndex = 0;
        data.forEach(batch => {
            const batchRow = rowMap.get(`batch-${batch.id}`);
            if (batchRow !== expectedIndex) {
                console.error(`[GanttTimeline] Row order mismatch: batch-${batch.id} expected index ${expectedIndex}, got ${batchRow}`);
            }
            expectedIndex++;
            if (expandedBatches.has(batch.id)) {
                batch.stages.forEach(stage => {
                    const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                    const stageRow = rowMap.get(stageKey);
                    if (stageRow !== expectedIndex) {
                        console.error(`[GanttTimeline] Row order mismatch: ${stageKey} expected index ${expectedIndex}, got ${stageRow}`);
                    }
                    expectedIndex++;
                    if (layoutMode === 'standard' && expandedStages.has(stageKey)) {
                        stage.operations.filter(op => !op.isOffScreen).forEach(op => {
                            const opRow = rowMap.get(`op-${op.id}`);
                            if (opRow !== expectedIndex) {
                                console.error(`[GanttTimeline] Row order mismatch: op-${op.id} expected index ${expectedIndex}, got ${opRow}`);
                            }
                            expectedIndex++;
                        });
                    }
                });
            }
        });
    }

    data.forEach((batch, index) => {
        // 1. Batch Row
        const color = BATCH_COLORS[index % BATCH_COLORS.length];
        const backgroundTint = color.tint;
        const batchRowIndex = rowMap.get(`batch-${batch.id}`) ?? 0;
        const batchIsAlt = isAlternateRow(batchRowIndex);

        const batchWidth = getWidth(batch.startDate, batch.endDate);

        rows.push(
            <div key={`batch-${batch.id}`} className={`gantt-relative gantt-border-b ${batchIsAlt ? 'gantt-row-alt' : ''}`} style={{ height: rowHeight, backgroundColor: backgroundTint, overflow: 'hidden' }}>
                <div
                    className="gantt-bar-batch"
                    style={{
                        left: getPos(batch.startDate),
                        width: batchWidth,
                        top: 4, // (32-24)/2
                        backgroundColor: color.bg,
                        borderColor: color.border,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        zIndex: 4 // 高于连接线 (2-3)
                    }}
                >
                    {renderGanttBarLabel(batch.code, batchWidth)}
                </div>
            </div>
        );

        if (expandedBatches.has(batch.id)) {
            batch.stages.forEach(stage => {
                // 2. Stage Row
                const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                const stageRowIndex = rowMap.get(stageKey) ?? 0;
                const stageIsAlt = isAlternateRow(stageRowIndex);

                const stageWidth = getWidth(stage.startDate, stage.endDate);

                const stageContent = (
                    <div key={stageKey} className={`gantt-relative gantt-border-b ${stageIsAlt ? 'gantt-row-alt' : ''}`} style={{ height: rowHeight, backgroundColor: backgroundTint, overflow: 'hidden' }}>
                        {layoutMode === 'compact' ? (
                            stage.operations.map(op => {
                                const opWidth = getWidth(op.startDate, op.endDate);
                                const opContent = (
                                    <Tooltip key={op.id} title={`${op.name} (${op.status})`}>
                                        <div
                                            className="gantt-bar-op"
                                            style={{
                                                left: getPos(op.startDate),
                                                width: opWidth,
                                                minWidth: 8,
                                                top: 7, // Centered in 32px row (ish) - actually row is 32, window is 24(top4), op is 18(top7)
                                                height: 18,
                                                zIndex: 20,
                                                backgroundColor: (color as any).solid || color.border, // Fallback if solid not found
                                                cursor: 'pointer'
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                // Inject batch_id context
                                                if (onOperationDoubleClick) {
                                                    onOperationDoubleClick({
                                                        ...op,
                                                        batch_id: batch.id
                                                    });
                                                }
                                            }}
                                        >
                                            {renderGanttBarLabel(op.name, opWidth)}
                                        </div>
                                    </Tooltip>
                                );

                                return opContent;
                            })
                        ) : (
                            <div
                                className="gantt-bar-stage"
                                style={{
                                    left: getPos(stage.startDate),
                                    width: stageWidth,
                                    backgroundColor: color.bg.replace(/[\d.]+\)$/, '0.4)'), // Slightly darker than row bg (0.05) and batch bar (0.2)
                                    borderColor: color.border,
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    top: 7,
                                    height: 18,
                                    zIndex: 4 // 高于连接线 (2-3)
                                }}
                            >
                                {renderGanttBarLabel(stage.name, stageWidth)}
                            </div>
                        )}
                    </div>
                );
                rows.push(stageContent);

                // 3. Operations Rows (Standard Mode Only)
                // P0-2: Filter out offScreen ops, P0-3: Safety check for rowMap
                if (layoutMode === 'standard' && expandedStages.has(stageKey)) {
                    stage.operations.filter(op => !op.isOffScreen).forEach(op => {
                        const opRowIndex = rowMap.get(`op-${op.id}`);
                        if (opRowIndex === undefined) {
                            if (process.env.NODE_ENV === 'development') {
                                console.warn(`[GanttTimeline] Missing rowMap entry for op-${op.id} in row rendering`);
                            }
                            return;
                        }
                        const opIsAlt = isAlternateRow(opRowIndex);

                        const opWidth = getWidth(op.startDate, op.endDate);
                        const hasWindow = op.windowStartDate && op.windowEndDate;

                        rows.push(
                            <div key={`op-${op.id}`} className={`gantt-relative gantt-border-b ${opIsAlt ? 'gantt-row-alt' : ''}`} style={{ height: rowHeight, backgroundColor: backgroundTint, overflow: 'hidden' }}>
                                {hasWindow && (
                                    <Tooltip title={`窗口: ${dayjs(op.windowStartDate).format('MM-DD HH:mm')} - ${dayjs(op.windowEndDate).format('MM-DD HH:mm')}`}>
                                        <div
                                            className="gantt-bar-window"
                                            style={{
                                                left: getPos(op.windowStartDate!),
                                                width: getWidth(op.windowStartDate!, op.windowEndDate!),
                                                top: 4,
                                                height: 24
                                            }}
                                        />
                                    </Tooltip>
                                )}
                                <Tooltip title={`${op.name}: ${op.assignedPeople}/${op.requiredPeople} people`}>
                                    <div
                                        className="gantt-bar-op"
                                        style={{
                                            left: getPos(op.startDate),
                                            width: opWidth,
                                            top: 4,
                                            height: 24,
                                            padding: '0 4px',
                                            justifyContent: 'center',
                                            zIndex: 20,
                                            backgroundColor: (color as any).solid || color.border,
                                            cursor: 'pointer'
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            // Inject batch_id context
                                            if (onOperationDoubleClick) {
                                                onOperationDoubleClick({
                                                    ...op,
                                                    batch_id: batch.id
                                                });
                                            }
                                        }}
                                    >
                                        {!hasWindow && opWidth > 30 ? op.name : ''}
                                    </div>
                                </Tooltip>
                                {hasWindow && (
                                    <div
                                        className="gantt-text-overlay"
                                        style={{
                                            left: getPos(op.windowStartDate!),
                                            width: getWidth(op.windowStartDate!, op.windowEndDate!),
                                        }}
                                    >
                                        {op.name}
                                    </div>
                                )}
                            </div>
                        );
                    });
                }
            });
        }
    });

    return (
        <div className="gantt-w-full" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* 连接线先渲染，位于底层 */}
            {showShareGroupLines && shareGroups.length > 0 && (
                <ShareGroupConnections
                    shareGroups={shareGroups}
                    operationPositions={operationPositions}
                    rowHeight={rowHeight}
                />
            )}
            {dependencies.length > 0 && (
                <ConstraintConnections
                    dependencies={dependencies}
                    operationPositions={operationPositions}
                    rowHeight={rowHeight}
                />
            )}
            {/* 行内容后渲染，覆盖连接线 */}
            {rows}
        </div>
    );
}

export default GanttTimeline;
