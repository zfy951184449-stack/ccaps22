import React from 'react';
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
    hoveredRowId: string | null;
    setHoveredRowId: (id: string | null) => void;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
    startDay,
    endDay,
    hourWidth,
    totalHeight,
    virtualRows,
    visibleStartIndex,
    stageColorMap,
    hoveredRowId,
    setHoveredRowId
}) => {
    const totalDays = endDay - startDay + 1;
    const totalWidth = totalDays * 24 * hourWidth;

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

    return (
        <div
            style={{
                position: 'relative',
                width: totalWidth,
                minWidth: totalWidth,
                height: totalHeight,
                minHeight: totalHeight
            }}
        >
            {/* Row backgrounds */}
            {virtualRows.map((row, index) => {
                const absoluteIndex = visibleStartIndex + index;
                const node = row.node;
                let backgroundColor = absoluteIndex % 2 === 0 ? '#F1F5F9' : TOKENS.card;
                const stageColor = getStageColorByNode(node);

                if (node.type === 'stage' && stageColor) {
                    backgroundColor = toRgba(stageColor, 0.08);
                } else if (node.type === 'operation' && stageColor) {
                    backgroundColor = toRgba(stageColor, 0.04);
                }

                if (row.id === hoveredRowId) {
                    backgroundColor = 'rgba(59, 130, 246, 0.12)';
                }

                return (
                    <div
                        key={`row-bg-${row.id}`}
                        style={{
                            position: 'absolute',
                            top: absoluteIndex * ROW_HEIGHT,
                            left: 0,
                            width: totalWidth,
                            height: ROW_HEIGHT,
                            backgroundColor,
                            zIndex: 0,
                            pointerEvents: 'auto',
                            borderBottom: `1px solid ${TOKENS.border}`
                        }}
                        onMouseEnter={() => setHoveredRowId(row.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                    />
                );
            })}

            {/* Daily grid lines */}
            {Array.from({ length: totalDays + 1 }, (_, index) => {
                const dayNumber = startDay + index;
                const lineLeft = index * 24 * hourWidth;
                return (
                    <div
                        key={`grid-day-${dayNumber}`}
                        style={{
                            position: 'absolute',
                            left: lineLeft,
                            top: 0,
                            width: 1,
                            height: totalHeight,
                            background:
                                dayNumber === 0
                                    ? TOKENS.primary
                                    : dayNumber % 7 === 0
                                        ? '#CBD5F5'
                                        : TOKENS.border,
                            zIndex: 2,
                            pointerEvents: 'none'
                        }}
                    />
                );
            })}

            {/* Hourly grid lines */}
            {Array.from({ length: totalDays * 24 + 1 }, (_, index) => {
                if (index % 24 === 0) return null;
                const lineLeft = index * hourWidth;
                const hour = index % 24;
                return (
                    <div
                        key={`grid-hour-${index}`}
                        style={{
                            position: 'absolute',
                            left: lineLeft,
                            top: 0,
                            width: 1,
                            height: totalHeight,
                            background: hour % 6 === 0 ? '#CBD5F5' : '#E7EEF8',
                            zIndex: 1,
                            pointerEvents: 'none'
                        }}
                    />
                );
            })}

            {/* Work hours highlight (9:00-17:00) */}
            {Array.from({ length: totalDays }, (_, dayIndex) => {
                const workHoursLeft = (dayIndex * 24 + 9) * hourWidth;
                const workHoursWidth = 8 * hourWidth;
                return (
                    <div
                        key={`work-hours-${dayIndex}`}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: workHoursLeft,
                            width: workHoursWidth,
                            height: totalHeight,
                            backgroundColor: 'rgba(24, 144, 255, 0.04)',
                            zIndex: 1,
                            pointerEvents: 'none'
                        }}
                    />
                );
            })}
        </div>
    );
};
