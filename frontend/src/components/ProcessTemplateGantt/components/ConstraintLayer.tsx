import React, { useMemo } from 'react';
import { GanttConstraint, TimeBlock } from '../types';
import { ROW_HEIGHT } from '../constants';

interface ConstraintLayerProps {
    ganttConstraints: GanttConstraint[];
    rowIndexMap: Map<string, number>;
    operationBlockMap: Map<number, TimeBlock>;
    visibleStartIndex: number;
    visibleEndIndex: number;
    overscanCount: number;
    startDay: number;
    hourWidth: number;
    totalHeight: number;
    conflictConstraintSet: Set<number>;
    activeConstraintSet: Set<number>;
}

export const ConstraintLayer: React.FC<ConstraintLayerProps> = ({
    ganttConstraints,
    rowIndexMap,
    operationBlockMap,
    visibleStartIndex,
    visibleEndIndex,
    overscanCount,
    startDay,
    hourWidth,
    totalHeight,
    conflictConstraintSet,
    activeConstraintSet
}) => {
    if (ganttConstraints.length === 0) return null;

    const getAnchorRelativeHour = (block: TimeBlock, anchor: 'start' | 'end') => {
        const hour = anchor === 'start' ? block.start_hour : block.start_hour + block.duration_hours;
        return hour - startDay * 24;
    };

    const getAnchorType = (type: number): { from: 'start' | 'end'; to: 'start' | 'end' } => {
        switch (type) {
            case 2: // SS
                return { from: 'start', to: 'start' };
            case 3: // FF
                return { from: 'end', to: 'end' };
            case 4: // SF
                return { from: 'start', to: 'end' };
            case 1:
            default: // FS
                return { from: 'end', to: 'start' };
        }
    };

    const typeLabels: Record<number, string> = {
        1: 'FS',
        2: 'SS',
        3: 'FF',
        4: 'SF'
    };

    const getBaseStyle = (type: number) => {
        switch (type) {
            case 2:
                return { color: '#52c41a', dashArray: '6,4' };
            case 3:
                return { color: '#faad14', dashArray: '4,4' };
            case 4:
                return { color: '#722ed1', dashArray: '12,4' };
            case 1:
            default:
                return { color: '#1890ff', dashArray: 'none' };
        }
    };

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: totalHeight,
                pointerEvents: 'none',
                zIndex: 6
            }}
            data-testid="constraint-lines-svg"
        >
            <defs>
                <filter id="constraint-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {ganttConstraints.map((constraint) => {
                const predecessorScheduleId = constraint.from_schedule_id;
                const successorScheduleId = constraint.to_schedule_id;

                // 先获取 block，用于获取 node_id（支持合并的独立操作）
                const predecessorBlock = operationBlockMap.get(predecessorScheduleId);
                const successorBlock = operationBlockMap.get(successorScheduleId);

                if (!predecessorBlock || !successorBlock) {
                    return null;
                }

                // 使用 block 的 node_id（支持合并的独立操作）
                const predecessorNodeId = predecessorBlock.node_id;
                const successorNodeId = successorBlock.node_id;

                const predecessorRowIndex = rowIndexMap.get(predecessorNodeId);
                const successorRowIndex = rowIndexMap.get(successorNodeId);

                if (predecessorRowIndex === undefined || successorRowIndex === undefined) {
                    return null;
                }

                // Culling: skip if both nodes are outside visible area
                if (
                    predecessorRowIndex < visibleStartIndex - overscanCount &&
                    successorRowIndex < visibleStartIndex - overscanCount
                ) {
                    return null;
                }

                if (
                    predecessorRowIndex > visibleEndIndex + overscanCount &&
                    successorRowIndex > visibleEndIndex + overscanCount
                ) {
                    return null;
                }

                const anchorType = getAnchorType(constraint.constraint_type);
                const fromRelativeHour = getAnchorRelativeHour(predecessorBlock, anchorType.from);
                const toRelativeHour = getAnchorRelativeHour(successorBlock, anchorType.to);

                const fromX = fromRelativeHour * hourWidth;
                const toX = toRelativeHour * hourWidth;

                const baseStyle = getBaseStyle(constraint.constraint_type);

                const isSoft = constraint.constraint_level && constraint.constraint_level !== 1;
                const isShared = false; // (Legacy Share Mode Disabled)
                const isConflictConstraint = conflictConstraintSet.has(constraint.constraint_id);
                const isActiveConstraint = activeConstraintSet.has(constraint.constraint_id);

                let strokeColor = baseStyle.color;
                let strokeWidth = 2.5;
                const dashArray = baseStyle.dashArray || (isSoft ? '5,4' : 'none');

                if (isConflictConstraint) {
                    strokeColor = '#fa8c16';
                    strokeWidth = 3;
                }

                if (isActiveConstraint) {
                    strokeColor = '#ff4d4f';
                    strokeWidth = 3.6;
                }

                const sameRow = predecessorRowIndex === successorRowIndex;
                const fromY = predecessorRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                const toY = successorRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                const label = typeLabels[constraint.constraint_type] || 'FS';
                const lagText = constraint.lag_time ? `${constraint.lag_time > 0 ? '+' : ''}${constraint.lag_time}h` : '';
                const strokeOpacity = isActiveConstraint ? 1 : (isConflictConstraint ? 0.95 : (isSoft ? 0.65 : 0.9));
                const highlightFilter = isActiveConstraint ? 'url(#constraint-glow)' : undefined;
                const labelBackgroundColor = isActiveConstraint
                    ? 'rgba(255,77,79,0.88)'
                    : isConflictConstraint
                        ? 'rgba(250,140,22,0.88)'
                        : 'rgba(0,0,0,0.65)';

                // (Legacy: Removed isPureSharePersonnel logic)
                const isPureSharePersonnel = false;

                const arrowSize = 9;
                let arrowPoints = '';
                let arrowPoints2 = '';
                let pathD = '';

                // (Standard drawing logic only)
                if (sameRow) {
                    const horizontalDirection = toX >= fromX ? 1 : -1;
                    const offsetY = fromY + (horizontalDirection > 0 ? ROW_HEIGHT * 0.25 : -ROW_HEIGHT * 0.25);
                    pathD = `M ${fromX} ${offsetY} L ${toX} ${offsetY}`;
                    arrowPoints = horizontalDirection > 0
                        ? `${toX},${offsetY} ${toX - arrowSize},${offsetY - arrowSize / 2} ${toX - arrowSize},${offsetY + arrowSize / 2}`
                        : `${toX},${offsetY} ${toX + arrowSize},${offsetY - arrowSize / 2} ${toX + arrowSize},${offsetY + arrowSize / 2}`;
                } else {
                    const midX = fromX + (toX - fromX) / 2;
                    pathD = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
                    arrowPoints = toX >= midX
                        ? `${toX},${toY} ${toX - arrowSize},${toY - arrowSize / 2} ${toX - arrowSize},${toY + arrowSize / 2}`
                        : `${toX},${toY} ${toX + arrowSize},${toY - arrowSize / 2} ${toX + arrowSize},${toY + arrowSize / 2}`;
                }

                const midX = sameRow ? (fromX + toX) / 2 : fromX + (toX - fromX) / 2;
                const midY = sameRow
                    ? fromY + (toX >= fromX ? ROW_HEIGHT * 0.25 : -ROW_HEIGHT * 0.25)
                    : toY + (fromY < toY ? -ROW_HEIGHT * 0.25 : ROW_HEIGHT * 0.25);

                const finalStrokeColor = strokeColor;
                const finalDashArray = dashArray;
                const finalLabel = (typeLabels[constraint.constraint_type] || 'FS');

                const baseLabelWidth = 44;
                const labelBackgroundWidth = baseLabelWidth + (lagText ? 30 : 0);
                const labelHeight = 18;
                const labelXOffset = 12;
                const lagXOffset = labelXOffset + 24;
                const shareXOffset = 0; // Unused

                return (
                    <g key={`constraint-${constraint.constraint_id}`}>
                        <path
                            d={pathD}
                            stroke={finalStrokeColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={finalDashArray}
                            strokeLinecap="round"
                            opacity={strokeOpacity}
                            data-constraint-id={constraint.constraint_id}
                            filter={highlightFilter}
                        />

                        <polygon
                            points={arrowPoints}
                            fill={finalStrokeColor}
                            opacity={strokeOpacity}
                        />

                        {/* 双向箭头的第二个箭头（纯人员共享时显示） */}
                        {arrowPoints2 && (
                            <polygon
                                points={arrowPoints2}
                                fill={finalStrokeColor}
                                opacity={strokeOpacity}
                            />
                        )}

                        <g transform={`translate(${midX - labelBackgroundWidth / 2}, ${midY - labelHeight / 2})`}>
                            <rect
                                width={labelBackgroundWidth}
                                height={labelHeight}
                                rx={9}
                                ry={9}
                                fill={isPureSharePersonnel ? 'rgba(114,46,209,0.88)' : labelBackgroundColor}
                                opacity={0.85}
                            />
                            <text
                                x={labelXOffset}
                                y={labelHeight / 2 + 3}
                                fontSize="11"
                                fill="#fff"
                                fontWeight="bold"
                            >
                                {finalLabel}
                            </text>
                            {lagText && !isPureSharePersonnel && (
                                <text
                                    x={lagXOffset}
                                    y={labelHeight / 2 + 3}
                                    fontSize="10"
                                    fill="#fff"
                                    opacity={0.85}
                                >
                                    {lagText}
                                </text>
                            )}
                            {/* (Share Badge Removed) */}
                        </g>

                        {constraint.constraint_name && (
                            <text
                                x={midX}
                                y={midY + labelHeight}
                                fontSize="10"
                                fill={strokeColor}
                                textAnchor="middle"
                                opacity={0.85}
                            >
                                {constraint.constraint_name}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};
