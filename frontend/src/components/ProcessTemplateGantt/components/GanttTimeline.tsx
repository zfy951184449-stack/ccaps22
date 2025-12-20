import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { FlattenedRow, ProcessStage, GanttNode } from '../types';
import { TOKENS, ROW_HEIGHT } from '../constants';
import { toRgba } from '../utils';

interface GanttTimelineProps {
    startDay: number;
    endDay: number;
    hourWidth: number;
    totalHeight: number;
    virtualRows: FlattenedRow[];
    visibleStartIndex: number;
    stageColorMap: Map<number, string>;
    // Imperative hover
    setHoveredRow: (id: string | null) => void;
    // For today marker (batch mode)
    baseDate?: string;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
    startDay,
    endDay,
    hourWidth,
    totalHeight,
    virtualRows,
    visibleStartIndex,
    stageColorMap,
    setHoveredRow,
    baseDate
}) => {
    const totalDays = endDay - startDay + 1;
    const totalWidth = totalDays * 24 * hourWidth;
    const dayWidth = 24 * hourWidth;

    const getStageColorByNode = (node: GanttNode): string | undefined => {
        if (node.type === 'stage' && node.data) {
            return stageColorMap.get((node.data as ProcessStage).id);
        }
        if (node.type === 'operation' && node.parent_id) {
            const stageId = Number(node.parent_id.replace('stage_', ''));
            if (!Number.isNaN(stageId)) {
                return stageColorMap.get(stageId);
            }
        }
        return undefined;
    };

    const day0LineLeft = useMemo(() => {
        if (startDay <= 0 && endDay >= 0) {
            return (0 - startDay) * dayWidth;
        }
        return null;
    }, [startDay, endDay, dayWidth]);

    // Today marker calculation (only for batch mode with baseDate)
    const todayMarker = useMemo(() => {
        if (!baseDate) return null;

        const today = dayjs();
        const base = dayjs(baseDate);
        const todayDay = today.diff(base, 'day');

        // Check if today is within visible range
        if (todayDay < startDay || todayDay > endDay) return null;

        // Calculate position: day offset + current hour
        const todayPosition = (todayDay - startDay) * dayWidth + today.hour() * hourWidth + (today.minute() / 60) * hourWidth;

        return {
            position: todayPosition,
            label: '今天'
        };
    }, [baseDate, startDay, endDay, dayWidth, hourWidth]);

    // P0 Performance: Memoize time period backgrounds (工作时段 + 长白时段)
    const timePeriodBackgrounds = useMemo(() =>
        Array.from({ length: totalDays }, (_, dayIndex) => {
            const dayLeft = dayIndex * dayWidth;
            return (
                <React.Fragment key={`time-bg-${dayIndex}`}>
                    {/* 工作时段 9:00-17:00 */}
                    <div style={{
                        position: 'absolute',
                        left: dayLeft + 9 * hourWidth,
                        top: 0,
                        width: 8 * hourWidth,
                        height: totalHeight,
                        background: 'rgba(59, 130, 246, 0.06)',
                        mixBlendMode: 'multiply',
                        zIndex: 2,
                        pointerEvents: 'none'
                    }} />
                    {/* 长白时段 17:00-21:00 */}
                    <div style={{
                        position: 'absolute',
                        left: dayLeft + 17 * hourWidth,
                        top: 0,
                        width: 4 * hourWidth,
                        height: totalHeight,
                        background: 'rgba(251, 191, 36, 0.08)',
                        mixBlendMode: 'multiply',
                        zIndex: 2,
                        pointerEvents: 'none'
                    }} />
                </React.Fragment>
            );
        }),
        [totalDays, dayWidth, hourWidth, totalHeight]
    );

    // P0 Performance: Memoize day grid lines
    const dayGridLines = useMemo(() =>
        Array.from({ length: totalDays + 1 }, (_, index) => {
            const dayNumber = startDay + index;
            const lineLeft = index * dayWidth;
            const isDay0 = dayNumber === 0;
            const isWeekBoundary = dayNumber % 7 === 0;

            return (
                <div
                    key={`grid-day-${dayNumber}`}
                    style={{
                        position: 'absolute',
                        left: lineLeft,
                        top: 0,
                        width: isDay0 ? 2 : 1.5,
                        height: totalHeight,
                        background: isDay0 ? TOKENS.primary : isWeekBoundary ? '#64748B' : '#94A3B8',
                        zIndex: 1,
                        pointerEvents: 'none'
                    }}
                />
            );
        }),
        [totalDays, startDay, dayWidth, totalHeight]
    );

    // P0 Performance: Memoize hour grid lines
    const hourGridLines = useMemo(() =>
        Array.from({ length: totalDays * 24 }, (_, index) => {
            const hourOffset = index + 1;
            if (hourOffset % 24 === 0) return null; // Skip day boundaries
            const lineLeft = hourOffset * hourWidth;

            return (
                <div
                    key={`grid-1h-${index}`}
                    style={{
                        position: 'absolute',
                        left: lineLeft,
                        top: 0,
                        width: 0.5,
                        height: totalHeight,
                        background: '#E2E8F0',
                        zIndex: 1,
                        pointerEvents: 'none'
                    }}
                />
            );
        }),
        [totalDays, hourWidth, totalHeight]
    );

    return (
        <>
            <style>{`
                .gantt-timeline-row:hover,
                .gantt-timeline-row.is-hovered {
                    background-color: rgba(0, 0, 0, 0.04) !important;
                }
            `}</style>
            <div
                style={{
                    position: 'relative',
                    width: totalWidth,
                    minWidth: totalWidth,
                    height: totalHeight,
                    minHeight: totalHeight
                }}
            >
                {/* Row backgrounds - zIndex 0 */}
                {virtualRows.map((row, index) => {
                    // In filtered mode, use index directly for positioning
                    const rowTop = index * ROW_HEIGHT;
                    const node = row.node;
                    const isEvenRow = index % 2 === 0;
                    const stageColor = getStageColorByNode(node);

                    // Style B: Zebra stripes + Stage color blending
                    let backgroundColor: string;
                    if (node.type === 'stage' && stageColor) {
                        // Stage rows: stronger tint with zebra variation
                        backgroundColor = isEvenRow
                            ? toRgba(stageColor, 0.12)
                            : toRgba(stageColor, 0.06);
                    } else if (node.type === 'operation' && stageColor) {
                        // Operation rows: lighter tint with zebra variation
                        backgroundColor = isEvenRow
                            ? toRgba(stageColor, 0.08)
                            : toRgba(stageColor, 0.04);
                    } else {
                        // Default zebra stripes for other rows
                        backgroundColor = isEvenRow ? '#F1F5F9' : TOKENS.card;
                    }

                    return (
                        <div
                            key={`row-bg-${row.id}`}
                            className="gantt-timeline-row"
                            data-row-id={row.id}
                            style={{
                                position: 'absolute',
                                top: rowTop,
                                left: 0,
                                width: totalWidth,
                                height: ROW_HEIGHT,
                                backgroundColor,
                                zIndex: 0,
                                pointerEvents: 'auto',
                                borderBottom: `1px solid ${TOKENS.border}`
                                // P2 #7: transition 已移除，hover 效果由 CSS class 处理
                            }}
                            onMouseEnter={() => setHoveredRow(row.id)}
                            onMouseLeave={() => setHoveredRow(null)}
                        />
                    );
                })}

                {/* Time period backgrounds - memoized */}
                {timePeriodBackgrounds}

                {/* Day grid lines - memoized */}
                {dayGridLines}

                {/* Hour grid lines - memoized */}
                {hourGridLines}


                {/* Today marker - only in batch mode */}
                {todayMarker && (
                    <div
                        style={{
                            position: 'absolute',
                            left: todayMarker.position,
                            top: 0,
                            width: 2,
                            height: totalHeight,
                            background: '#EF4444',
                            zIndex: 5,
                            pointerEvents: 'none'
                        }}
                    >
                        {/* P1 #3: 标签改为内部定位，避免被裁剪 */}
                        <span
                            style={{
                                position: 'absolute',
                                top: 4,
                                left: 4,
                                background: '#EF4444',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                            }}
                        >
                            {todayMarker.label}
                        </span>
                    </div>
                )}
            </div>
        </>
    );
};
