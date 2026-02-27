import React, { useMemo, useState, useCallback } from 'react';
import { Tooltip } from 'antd';
import { DragOutlined } from '@ant-design/icons';
import { TimeBlock, GanttNode, ProcessStage, StageOperation } from '../types';
import { ROW_HEIGHT, STAGE_COLORS } from '../constants';
import { toRgba, findNodeById } from '../utils';

// Tooltip state for singleton pattern
interface TooltipState {
    visible: boolean;
    content: React.ReactNode;
    x: number;
    y: number;
}


interface GanttBarsProps {
    timeBlocks: TimeBlock[];    // Added back
    nodeMap: Map<string, GanttNode>;  // P0 Fix: O(1) lookup
    rowIndexMap: Map<string, number>;
    visibleStartIndex: number;
    visibleEndIndex: number;
    overscanCount: number;
    startDay: number;
    endDay: number;
    hourWidth: number;
    stageColorMap: Map<number, string>;
    activeOperationSet: Set<string>;
    conflictOperationSet: Set<string>;
    scheduleConflicts: Record<number, string>;
    onEditNode: (node: GanttNode) => void;
    // Imperative hover
    setHoveredRow: (id: string | null) => void;
    expandedDay?: number | null;
    onDragStart?: (
        e: React.MouseEvent,
        type: 'move' | 'resize-start' | 'resize-end',
        nodeId: string,
        scheduleId: number,
        stageId: number,
        blockElement: HTMLElement,
        originalData: {
            operation_day: number;
            recommended_time: number;
            window_start_time?: number;
            window_start_day_offset?: number;
            window_end_time?: number;
            window_end_day_offset?: number;
            stage_start_day?: number;
        }
    ) => void;
    // 只读操作集合（ACTIVATED 状态的批次操作禁止拖拽）
    readOnlyOperations?: Set<string>;
    // 绘制共享关系模式
    isDrawingShareMode?: boolean;
    onShareDrawClick?: (scheduleId: number, e: React.MouseEvent) => void;
    // 绘制模式下已选中的第一个操作
    drawingSelectedScheduleId?: number | null;
}

const GanttBarsComponent: React.FC<GanttBarsProps> = ({
    timeBlocks,
    // ganttNodes, // Removed: No longer needed for finding nodes
    nodeMap,      // Added: O(1) lookup
    rowIndexMap,
    visibleStartIndex,
    visibleEndIndex,
    overscanCount,
    startDay,
    endDay,
    hourWidth,
    stageColorMap,
    activeOperationSet,
    conflictOperationSet,
    scheduleConflicts,
    onEditNode,

    setHoveredRow,
    expandedDay = null,
    onDragStart,
    readOnlyOperations,
    isDrawingShareMode = false,
    onShareDrawClick,
    drawingSelectedScheduleId
}) => {
    const totalDays = endDay - startDay + 1;
    const totalWidth = totalDays * 24 * hourWidth;

    // Singleton tooltip state
    const [tooltipState, setTooltipState] = useState<TooltipState>({
        visible: false,
        content: null,
        x: 0,
        y: 0
    });

    const getStageColorByNode = (node: GanttNode): string => {
        if (node.type === 'stage' && node.data) {
            return stageColorMap.get((node.data as ProcessStage).id) || STAGE_COLORS.DEFAULT;
        }
        if (node.type === 'operation' && node.parent_id) {
            const stageId = Number(node.parent_id.replace('stage_', ''));
            if (!Number.isNaN(stageId)) {
                return stageColorMap.get(stageId) || STAGE_COLORS.DEFAULT;
            }
        }
        return STAGE_COLORS.DEFAULT;
    };

    // Build tooltip content helper
    // P0 Fix: Memoize tooltip content generation function is likely not enough,
    // needs internal memoization per block, but keeping this simple for now.
    const buildTooltipContent = useCallback((block: TimeBlock, absoluteStartHour: number) => {
        const blockStartDay = Math.floor(absoluteStartHour / 24);
        const startHourOfDay = Math.floor(absoluteStartHour % 24);
        const startMinute = Math.round((absoluteStartHour % 1) * 60);
        const endHour = absoluteStartHour + block.duration_hours;
        const endDayNum = Math.floor(endHour / 24);
        const endHourOfDay = Math.floor(endHour % 24);
        const endMinute = Math.round((endHour % 1) * 60);

        return (
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{block.title}</div>
                <div>开始: Day {blockStartDay} {startHourOfDay.toString().padStart(2, '0')}:{startMinute.toString().padStart(2, '0')}</div>
                <div>结束: Day {endDayNum} {endHourOfDay.toString().padStart(2, '0')}:{endMinute.toString().padStart(2, '0')}</div>
                <div>时长: {block.duration_hours.toFixed(1)} 小时</div>
            </div>
        );
    }, []);

    const hideTooltip = useCallback(() => {
        setTooltipState(prev => ({ ...prev, visible: false }));
    }, []);


    return (
        <>
            {timeBlocks.map((block) => {
                const rowIndex = rowIndexMap.get(block.node_id);
                if (rowIndex === undefined) return null;

                // Culling: skip blocks outside visible area
                if (rowIndex < visibleStartIndex - overscanCount || rowIndex >= visibleEndIndex + overscanCount) {
                    return null;
                }

                // 日期展开过滤：只显示在展开日期范围内的内容
                if (expandedDay !== null) {
                    // 在展开模式下隐藏阶段条（它们跨多天且不需要在单日视图显示）
                    if (block.isStage) {
                        return null;
                    }

                    // 使用小时进行精确的重叠检测（适用于正负天数）
                    const dayStartHour = expandedDay * 24;
                    const dayEndHour = (expandedDay + 1) * 24;
                    const blockStartHour = block.start_hour;
                    const blockEndHour = block.start_hour + block.duration_hours;

                    // 操作和时间窗口必须与展开日期有重叠
                    // 无重叠条件：结束 <= 日期开始 OR 开始 >= 日期结束
                    if (blockEndHour <= dayStartHour || blockStartHour >= dayEndHour) {
                        return null;
                    }
                }

                // 计算实际显示的起始小时和持续时间
                let displayStartHour = block.start_hour;
                let displayDurationHours = block.duration_hours;

                // 在展开模式下，裁剪跨天操作到当天范围
                if (expandedDay !== null && !block.isStage && !block.isTimeWindow) {
                    const dayStartHour = expandedDay * 24;
                    const dayEndHour = (expandedDay + 1) * 24;
                    const blockStartHour = block.start_hour;
                    const blockEndHour = block.start_hour + block.duration_hours;

                    // 裁剪到当天范围
                    const clippedStart = Math.max(blockStartHour, dayStartHour);
                    const clippedEnd = Math.min(blockEndHour, dayEndHour);
                    displayStartHour = clippedStart;
                    displayDurationHours = clippedEnd - clippedStart;
                }

                const absoluteStartHour = displayStartHour;
                const relativeStartHour = absoluteStartHour - startDay * 24;
                const left = relativeStartHour * hourWidth;
                const width = Math.max(displayDurationHours * hourWidth, hourWidth * 0.25);

                // Culling: skip blocks outside horizontal viewport
                if (left + width < 0 || left > totalWidth) {
                    return null;
                }

                const isStageBlock = Boolean(block.isStage);
                const isTimeWindowBlock = Boolean(block.isTimeWindow);
                const isHighlightedOperation = activeOperationSet.has(block.node_id);
                const isConflictOperation = conflictOperationSet.has(block.node_id);

                // P0 Fix: Use nodeMap for O(1) lookup
                const node = nodeMap.get(block.node_id);
                // const node = findNodeById(ganttNodes, block.node_id);
                const stageColor = node ? getStageColorByNode(node) : STAGE_COLORS.DEFAULT;

                // 检查是否为只读操作（ACTIVATED 批次的操作不允许拖拽）
                const isReadOnly = readOnlyOperations?.has(block.node_id) ?? false;

                // Determine styles - P0-1 Visual Hierarchy Improvements (Deep Space Style)
                // Operation: Deep Space Floating (Strong shadow + inset highlight)
                // Stage: dashed border + glass fill + narrower
                // TimeWindow: diagonal stripe pattern with border
                let borderStyle: string;
                let boxShadow: string;
                let blockOpacity = 1;
                let blockCursor: React.CSSProperties['cursor'] = isDrawingShareMode
                    ? 'crosshair'
                    : (isReadOnly ? 'not-allowed' : 'move');
                let textColor = '#fff';
                let borderRadius = 6;
                let backgroundStyle: string | undefined = undefined;
                let backdropFilter: string | undefined = undefined;

                if (isStageBlock) {
                    // Stage: dashed border, glass fill, narrower
                    borderStyle = `1.5px dashed ${stageColor}`;
                    boxShadow = 'none';
                    blockCursor = 'pointer';
                    textColor = stageColor;
                    borderRadius = 4;
                    backdropFilter = 'blur(4px)'; // Slight blur for stages
                } else if (isTimeWindowBlock) {
                    // TimeWindow: diagonal stripe pattern with visible border
                    // IMPORTANT: Always use stageColor (solid) instead of block.color (pre-transparent)
                    // because block.color from utils.ts already has 15% alpha, causing double transparency
                    const effectiveColor = stageColor; // Use solid color, not block.color
                    borderStyle = `1.5px dashed ${toRgba(effectiveColor, 0.6)}`;
                    boxShadow = 'none';
                    blockOpacity = 1;
                    blockCursor = 'default';
                    // Diagonal stripe pattern - Enhanced visibility
                    backgroundStyle = `repeating-linear-gradient(
                        45deg,
                        ${toRgba(effectiveColor, 0.15)},
                        ${toRgba(effectiveColor, 0.15)} 4px,
                        ${toRgba(effectiveColor, 0.30)} 4px,
                        ${toRgba(effectiveColor, 0.30)} 8px
                    )`;
                } else {
                    // Operation: Deep Space Style
                    // Stronger shadow offset for floating effect + inset highlight
                    borderStyle = '1px solid rgba(0,0,0,0.05)';
                    boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255,255,255,0.3)';
                }


                // Handle conflicts
                const scheduleId = block.node_id.startsWith('operation_')
                    ? Number(block.node_id.replace('operation_', ''))
                    : undefined;
                const conflictType = scheduleId ? scheduleConflicts[scheduleId] : undefined;

                if (!isStageBlock) {
                    if (conflictType === 'CYCLE') {
                        borderStyle = '2px solid rgba(255,77,79,0.9)';
                        boxShadow = '0 0 0 2px rgba(255,77,79,0.35)';
                    } else if (conflictType === 'WINDOW') {
                        borderStyle = '2px solid rgba(250,140,22,0.85)';
                        boxShadow = '0 0 0 2px rgba(250,140,22,0.35)';
                    } else if (conflictType === 'OVERLAP') {
                        borderStyle = '2px solid rgba(24,144,255,0.85)';
                        boxShadow = '0 0 0 2px rgba(24,144,255,0.3)';
                    } else if (isConflictOperation) {
                        borderStyle = '2px solid rgba(250,140,22,0.85)';
                        boxShadow = '0 0 0 2px rgba(250,140,22,0.35)';
                    }
                }

                if (isHighlightedOperation && !isTimeWindowBlock) {
                    borderStyle = '2px solid #ff4d4f';
                    boxShadow = '0 0 0 2px rgba(255,77,79,0.45)';
                    blockOpacity = 1;
                }

                // 绘制模式下已选中的操作高亮（蓝色光晕）
                const isDrawingSelected = isDrawingShareMode && scheduleId && scheduleId === drawingSelectedScheduleId;
                if (isDrawingSelected && !isTimeWindowBlock && !isStageBlock) {
                    borderStyle = '2px solid #1890ff';
                    boxShadow = '0 0 0 3px rgba(24,144,255,0.5), 0 0 12px rgba(24,144,255,0.4)';
                    blockOpacity = 1;
                }

                const blockWidth = Math.min(width, totalWidth - Math.max(0, left));
                // P0-1: Stage narrower (20px), Operation standard (24px)
                const blockHeight = isStageBlock
                    ? 20  // Stage: narrower height
                    : ROW_HEIGHT - 8;  // Operation & TimeWindow: 24px (32 - 8)
                const blockTop = rowIndex * ROW_HEIGHT + (ROW_HEIGHT - blockHeight) / 2;
                const blockLeft = Math.max(0, left);
                // P0-1: Use stripe pattern for time window, transparent for stage
                // Calculate background color
                // Priority: TimeWindow pattern -> Stage transparent -> Block specific color -> Stage color
                const backgroundColor = isTimeWindowBlock
                    ? backgroundStyle
                    : isStageBlock
                        ? toRgba(stageColor, 0.08)
                        : (block.color || stageColor);  // Solid color for operations


                // 构建 tooltip 内容
                const blockStartDay = Math.floor(absoluteStartHour / 24);
                const startHourOfDay = Math.floor(absoluteStartHour % 24);
                const startMinute = Math.round((absoluteStartHour % 1) * 60);
                const endHour = absoluteStartHour + block.duration_hours;
                const endDayNum = Math.floor(endHour / 24);
                const endHourOfDay = Math.floor(endHour % 24);
                const endMinute = Math.round((endHour % 1) * 60);

                const tooltipContent = (
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{block.title}</div>
                        <div>开始: Day {blockStartDay} {startHourOfDay.toString().padStart(2, '0')}:{startMinute.toString().padStart(2, '0')}</div>
                        <div>结束: Day {endDayNum} {endHourOfDay.toString().padStart(2, '0')}:{endMinute.toString().padStart(2, '0')}</div>
                        <div>时长: {block.duration_hours.toFixed(1)} 小时</div>
                    </div>
                );

                return (
                    <Tooltip
                        key={block.id}
                        title={tooltipContent}
                        placement="top"
                        mouseEnterDelay={0.2}
                        mouseLeaveDelay={0}
                        destroyTooltipOnHide
                        fresh
                    >

                        <div
                            data-node-id={block.node_id}
                            data-schedule-id={node?.data ? (node.data as StageOperation).id : undefined}
                            data-stage-id={node?.parent_id?.replace('stage_', '')}
                            style={{
                                position: 'absolute',
                                left: blockLeft,
                                top: blockTop,
                                width: blockWidth,
                                height: blockHeight,
                                background: backgroundColor,
                                borderRadius,
                                display: 'flex',
                                alignItems: 'center',
                                color: textColor,
                                fontSize: 9,
                                cursor: blockCursor,
                                boxShadow,
                                border: borderStyle,
                                paddingLeft: 4,
                                paddingRight: 4,
                                zIndex: isStageBlock ? 4 : isTimeWindowBlock ? 7 : 10,
                                opacity: blockOpacity,
                                overflow: 'hidden',
                                backdropFilter,
                                WebkitBackdropFilter: backdropFilter
                            }}
                            onDoubleClick={() => {
                                if (node && !isDrawingShareMode) {
                                    onEditNode(node);
                                }
                            }}
                            onClick={(e) => {
                                // 绘制共享模式下，点击操作条触发连线
                                if (isDrawingShareMode && onShareDrawClick && scheduleId) {
                                    onShareDrawClick(scheduleId, e);
                                }
                            }}
                            onMouseDown={(e) => {
                                // 只对非阶段、非时间窗口、非只读的操作条启用拖拽
                                if (!isStageBlock && !isTimeWindowBlock && !isReadOnly && onDragStart && node?.data) {
                                    const opData = node.data as StageOperation;
                                    const stageId = node.parent_id ? Number(node.parent_id.replace('stage_', '')) : 0;
                                    // 获取 stage_start_day: node.start_day 是绝对天，operation_day 是相对天
                                    // 所以 stage_start_day = node.start_day - operation_day
                                    const stageStartDay = (node.start_day || 0) - (opData.operation_day || 0);
                                    onDragStart(
                                        e,
                                        'move',
                                        block.node_id,
                                        opData.id,
                                        stageId,
                                        e.currentTarget as HTMLElement,
                                        {
                                            operation_day: opData.operation_day,
                                            recommended_time: opData.recommended_time,
                                            window_start_time: opData.window_start_time,
                                            window_start_day_offset: opData.window_start_day_offset,
                                            window_end_time: opData.window_end_time,
                                            window_end_day_offset: opData.window_end_day_offset,
                                            stage_start_day: stageStartDay
                                        }
                                    );
                                }
                            }}
                            onMouseEnter={() => setHoveredRow(block.node_id)}
                            onMouseLeave={() => setHoveredRow(null)}
                        >
                            {/* 时间窗口左侧 resize handle - 只读操作不显示 */}
                            {isTimeWindowBlock && !isReadOnly && onDragStart && node?.data && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: -4,
                                        top: 0,
                                        width: 12,
                                        height: '100%',
                                        cursor: 'ew-resize',
                                        background: 'transparent',
                                        zIndex: 20
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(24,144,255,0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const opData = node.data as StageOperation;
                                        const stageId = node.parent_id ? Number(node.parent_id.replace('stage_', '')) : 0;
                                        const stageStartDay = (node.start_day || 0) - (opData.operation_day || 0);
                                        onDragStart(
                                            e,
                                            'resize-start',
                                            block.node_id,
                                            opData.id,
                                            stageId,
                                            e.currentTarget.parentElement as HTMLElement,
                                            {
                                                operation_day: opData.operation_day,
                                                recommended_time: opData.recommended_time,
                                                window_start_time: opData.window_start_time,
                                                window_start_day_offset: opData.window_start_day_offset,
                                                window_end_time: opData.window_end_time,
                                                window_end_day_offset: opData.window_end_day_offset,
                                                stage_start_day: stageStartDay
                                            }
                                        );
                                    }}
                                />
                            )}
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: width > 80 ? 9 : width > 40 ? 8 : 7,
                                    fontWeight: block.isTimeWindow ? 'normal' : '500',
                                    flex: 1
                                }}
                            >
                                {width > 30
                                    ? block.title.length > Math.floor(width / 8)
                                        ? `${block.title.substring(0, Math.floor(width / 8))}...`
                                        : block.title
                                    : ''}
                            </span>
                            {/* 拖拽图标 - 只读操作不显示 */}
                            {!block.isTimeWindow && !block.isStage && blockWidth > 60 && !isReadOnly && (
                                <DragOutlined style={{ marginLeft: 4, fontSize: 7, opacity: 0.8 }} />
                            )}
                            {/* 时间窗口右侧 resize handle - 只读操作不显示 */}
                            {isTimeWindowBlock && !isReadOnly && onDragStart && node?.data && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        right: -4,
                                        top: 0,
                                        width: 12,
                                        height: '100%',
                                        cursor: 'ew-resize',
                                        background: 'transparent',
                                        zIndex: 20
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(24,144,255,0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const opData = node.data as StageOperation;
                                        const stageId = node.parent_id ? Number(node.parent_id.replace('stage_', '')) : 0;
                                        const stageStartDay = (node.start_day || 0) - (opData.operation_day || 0);
                                        onDragStart(
                                            e,
                                            'resize-end',
                                            block.node_id,
                                            opData.id,
                                            stageId,
                                            e.currentTarget.parentElement as HTMLElement,
                                            {
                                                operation_day: opData.operation_day,
                                                recommended_time: opData.recommended_time,
                                                window_start_time: opData.window_start_time,
                                                window_start_day_offset: opData.window_start_day_offset,
                                                window_end_time: opData.window_end_time,
                                                window_end_day_offset: opData.window_end_day_offset,
                                                stage_start_day: stageStartDay
                                            }
                                        );
                                    }}
                                />
                            )}
                        </div>
                    </Tooltip>
                );
            })}
        </>
    );
};

// P0 Fix: Memoize the component
export const GanttBars = React.memo(GanttBarsComponent, (prevProps, nextProps) => {
    // Only re-render if critical props change
    // Note: We're doing a shallow comparison of most props, but specifically checking
    // data structures that might change reference but not content if not careful.
    if (prevProps.timeBlocks !== nextProps.timeBlocks) return false;
    if (prevProps.rowIndexMap !== nextProps.rowIndexMap) return false;
    // if (prevProps.ganttNodes !== nextProps.ganttNodes) return false; // Still check reference even if unused inside
    if (prevProps.nodeMap !== nextProps.nodeMap) return false; // Check nodeMap reference
    if (prevProps.visibleStartIndex !== nextProps.visibleStartIndex) return false;
    if (prevProps.visibleEndIndex !== nextProps.visibleEndIndex) return false;
    if (prevProps.startDay !== nextProps.startDay) return false;
    if (prevProps.hourWidth !== nextProps.hourWidth) return false;
    if (prevProps.setHoveredRow !== nextProps.setHoveredRow) return false;
    if (prevProps.expandedDay !== nextProps.expandedDay) return false;

    // Sets need to be checked carefully or just check reference identity
    if (prevProps.activeOperationSet !== nextProps.activeOperationSet) return false;
    if (prevProps.conflictOperationSet !== nextProps.conflictOperationSet) return false;
    if (prevProps.scheduleConflicts !== nextProps.scheduleConflicts) return false;
    if (prevProps.readOnlyOperations !== nextProps.readOnlyOperations) return false;

    return true; // Props are equal
});
