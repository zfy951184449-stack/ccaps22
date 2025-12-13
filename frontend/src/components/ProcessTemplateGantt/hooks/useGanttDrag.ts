import { useRef, useCallback, useEffect } from 'react';
import { message } from 'antd';

// 吸附精度：0.25 小时（15分钟）
const SNAP_HOURS = 0.25;
const MAX_UNDO = 10;

interface UndoAction {
    nodeId: string;
    scheduleId: number;
    stageId: number;
    type: 'move' | 'resize-start' | 'resize-end';
    oldValue: {
        operation_day: number;
        recommended_time: number;
        window_start_time?: number;
        window_start_day_offset?: number;
        window_end_time?: number;
        window_end_day_offset?: number;
        stage_start_day?: number;
    };
}

interface DragState {
    type: 'move' | 'resize-start' | 'resize-end';
    nodeId: string;
    scheduleId: number;
    stageId: number;
    blockElement: HTMLElement;
    ghostElement: HTMLElement | null;
    startMouseX: number;
    startLeft: number;
    startWidth: number;
    originalData: UndoAction['oldValue'];
    // 用于边界检查
    minX: number;
    maxX: number;
    // 窗口边界（仅用于 move 类型）
    windowMinX?: number;
    windowMaxX?: number;
}

interface UseGanttDragProps {
    hourWidth: number;
    startDay: number;
    endDay: number;
    onDragEnd: (
        scheduleId: number,
        stageId: number,
        updates: Partial<UndoAction['oldValue']>
    ) => Promise<void>;
    // 静默更新本地节点数据的回调（拖拽成功后调用）
    onNodeUpdate?: (nodeId: string, updates: Partial<UndoAction['oldValue']>) => void;
}

export function useGanttDrag({
    hourWidth,
    startDay,
    endDay,
    onDragEnd,
    onNodeUpdate
}: UseGanttDragProps) {
    const dragState = useRef<DragState | null>(null);
    const rafId = useRef<number>(0);
    const undoStack = useRef<UndoAction[]>([]);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    // 计算时间从 X 位置
    const computeHourFromX = useCallback((x: number): number => {
        const hour = x / hourWidth + startDay * 24;
        // 吸附到 SNAP_HOURS
        return Math.round(hour / SNAP_HOURS) * SNAP_HOURS;
    }, [hourWidth, startDay]);

    // 创建拖拽预览 ghost 元素
    const createGhost = useCallback((element: HTMLElement): HTMLElement => {
        const ghost = element.cloneNode(true) as HTMLElement;
        ghost.style.position = 'absolute';
        ghost.style.opacity = '0.7';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '1000';
        ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        element.parentElement?.appendChild(ghost);
        return ghost;
    }, []);

    // 创建/更新时间提示 Tooltip
    const updateTooltip = useCallback((x: number, y: number, hour: number) => {
        if (!tooltipRef.current) {
            tooltipRef.current = document.createElement('div');
            tooltipRef.current.style.cssText = `
                position: fixed;
                background: rgba(0,0,0,0.85);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 10000;
                white-space: nowrap;
            `;
            document.body.appendChild(tooltipRef.current);
        }

        const day = Math.floor(hour / 24);
        const h = Math.floor(hour % 24);
        const m = Math.round((hour % 1) * 60);
        tooltipRef.current.textContent = `Day ${day} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        tooltipRef.current.style.left = `${x + 15}px`;
        tooltipRef.current.style.top = `${y - 30}px`;
    }, []);

    // 销毁 Tooltip
    const destroyTooltip = useCallback(() => {
        if (tooltipRef.current) {
            tooltipRef.current.remove();
            tooltipRef.current = null;
        }
    }, []);

    // 开始拖拽
    const handleDragStart = useCallback((
        e: React.MouseEvent,
        type: DragState['type'],
        nodeId: string,
        scheduleId: number,
        stageId: number,
        blockElement: HTMLElement,
        originalData: UndoAction['oldValue']
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = blockElement.getBoundingClientRect();
        const parentRect = blockElement.parentElement?.getBoundingClientRect();

        if (!parentRect) return;

        const startLeft = rect.left - parentRect.left;
        const startWidth = rect.width;

        // 边界计算
        const minX = 0;
        const maxX = (endDay - startDay + 1) * 24 * hourWidth;

        // 计算窗口边界（用于限制操作只能在窗口内移动）
        let windowMinX: number | undefined;
        let windowMaxX: number | undefined;

        if (type === 'move' && originalData.window_start_time !== undefined && originalData.window_end_time !== undefined) {
            const stageStartDay = originalData.stage_start_day ?? 0;
            const operationDay = originalData.operation_day;

            // 计算窗口开始的绝对小时数
            const windowStartDayOffset = originalData.window_start_day_offset ?? 0;
            const windowStartTime = typeof originalData.window_start_time === 'string'
                ? parseFloat(originalData.window_start_time)
                : originalData.window_start_time;
            const windowStartAbsoluteDay = stageStartDay + operationDay + windowStartDayOffset;
            const windowStartHour = windowStartAbsoluteDay * 24 + windowStartTime;

            // 计算窗口结束的绝对小时数
            const windowEndDayOffset = originalData.window_end_day_offset ?? 0;
            const windowEndTime = typeof originalData.window_end_time === 'string'
                ? parseFloat(originalData.window_end_time)
                : originalData.window_end_time;
            const windowEndAbsoluteDay = stageStartDay + operationDay + windowEndDayOffset;
            const windowEndHour = windowEndAbsoluteDay * 24 + windowEndTime;

            // 转换为像素位置
            windowMinX = (windowStartHour - startDay * 24) * hourWidth;
            windowMaxX = (windowEndHour - startDay * 24) * hourWidth;

            console.log('[Drag] Window bounds calculated:', {
                windowStartHour, windowEndHour, windowMinX, windowMaxX, startWidth
            });
        }

        // 创建 ghost
        const ghost = createGhost(blockElement);
        ghost.style.left = `${startLeft}px`;
        ghost.style.top = `${rect.top - parentRect.top}px`;
        ghost.style.width = `${startWidth}px`;

        // 原始元素变为虚线框
        blockElement.style.opacity = '0.3';
        blockElement.style.border = '2px dashed #1890ff';

        dragState.current = {
            type,
            nodeId,
            scheduleId,
            stageId,
            blockElement,
            ghostElement: ghost,
            startMouseX: e.clientX,
            startLeft,
            startWidth,
            originalData,
            minX,
            maxX,
            windowMinX,
            windowMaxX
        };

        // 添加全局事件
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [hourWidth, startDay, endDay, createGhost]);

    // 拖拽中
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragState.current) return;

        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
            const state = dragState.current;
            if (!state || !state.ghostElement) return;

            const deltaX = e.clientX - state.startMouseX;

            if (state.type === 'move') {
                // 移动操作条
                let newLeft = state.startLeft + deltaX;

                // 使用窗口边界限制（如果存在），否则使用视图边界
                if (state.windowMinX !== undefined && state.windowMaxX !== undefined) {
                    // 操作需要完全在窗口内：左边界不能超出窗口开始，右边界不能超出窗口结束
                    newLeft = Math.max(state.windowMinX, Math.min(state.windowMaxX - state.startWidth, newLeft));
                } else {
                    // 回退到视图边界
                    newLeft = Math.max(state.minX, Math.min(state.maxX - state.startWidth, newLeft));
                }

                state.ghostElement.style.left = `${newLeft}px`;

                const newHour = computeHourFromX(newLeft);
                updateTooltip(e.clientX, e.clientY, newHour);

            } else if (state.type === 'resize-start') {
                // 调整窗口开始
                let newLeft = state.startLeft + deltaX;
                let newWidth = state.startWidth - deltaX;

                // 最小宽度限制（至少 0.25 小时）
                const minWidth = SNAP_HOURS * hourWidth;
                if (newWidth < minWidth) {
                    newWidth = minWidth;
                    newLeft = state.startLeft + state.startWidth - minWidth;
                }
                newLeft = Math.max(state.minX, newLeft);

                state.ghostElement.style.left = `${newLeft}px`;
                state.ghostElement.style.width = `${newWidth}px`;

                const newHour = computeHourFromX(newLeft);
                updateTooltip(e.clientX, e.clientY, newHour);

            } else if (state.type === 'resize-end') {
                // 调整窗口结束
                let newWidth = state.startWidth + deltaX;

                // 最小宽度限制
                const minWidth = SNAP_HOURS * hourWidth;
                newWidth = Math.max(minWidth, newWidth);

                // 边界限制
                const maxWidth = state.maxX - state.startLeft;
                newWidth = Math.min(maxWidth, newWidth);

                state.ghostElement.style.width = `${newWidth}px`;

                const endHour = computeHourFromX(state.startLeft + newWidth);
                updateTooltip(e.clientX, e.clientY, endHour);
            }
        });
    }, [hourWidth, computeHourFromX, updateTooltip]);

    // 拖拽结束
    const handleMouseUp = useCallback(async () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        cancelAnimationFrame(rafId.current);
        destroyTooltip();

        const state = dragState.current;
        if (!state) return;

        // 直接读取 style.left 和 style.width，避免 getBoundingClientRect 受滚动等因素影响
        const ghostLeft = state.ghostElement?.style.left;
        const ghostWidth = state.ghostElement?.style.width;

        // 在移除 ghost 前获取其最终位置
        const finalLeft = ghostLeft ? parseFloat(ghostLeft) : state.startLeft;
        const finalWidth = ghostWidth ? parseFloat(ghostWidth) : state.startWidth;

        // 移除 ghost
        state.ghostElement?.remove();

        if (!ghostLeft) {
            // 没有有效的拖拽，恢复原始样式
            state.blockElement.style.opacity = '';
            state.blockElement.style.border = '';
            dragState.current = null;
            return;
        }

        // 立即更新原始元素的位置到新位置（避免视觉上"回弹"）
        state.blockElement.style.left = `${finalLeft}px`;
        if (state.type !== 'move') {
            state.blockElement.style.width = `${finalWidth}px`;
        }
        // 恢复原始元素样式
        state.blockElement.style.opacity = '';
        state.blockElement.style.border = '';

        const newLeft = finalLeft;
        const newWidth = finalWidth;

        let updates: Partial<UndoAction['oldValue']> = {};

        if (state.type === 'move') {
            const newHour = computeHourFromX(newLeft);
            const absoluteDay = Math.floor(newHour / 24);
            // 处理负数小时的时间计算，确保 recommended_time 在 0-23.99 范围内
            let newTime = newHour - absoluteDay * 24;
            // 确保 newTime 是正数且在有效范围内
            if (newTime < 0) newTime += 24;
            if (newTime >= 24) newTime = 23.75;

            // operation_day 是相对于 stage_start_day 的天数
            const stageStartDay = state.originalData.stage_start_day ?? 0;
            const relativeOperationDay = absoluteDay - stageStartDay;

            // 计算操作移动的时间差（小时）
            const oldAbsoluteDay = stageStartDay + state.originalData.operation_day;
            const oldAbsoluteHour = oldAbsoluteDay * 24 + state.originalData.recommended_time;
            const newAbsoluteHour = absoluteDay * 24 + newTime;
            const deltaHours = newAbsoluteHour - oldAbsoluteHour;

            // 计算天数变化和时间变化
            const deltaDays = relativeOperationDay - state.originalData.operation_day;
            const deltaTime = newTime - state.originalData.recommended_time;

            console.log('[Drag] Move calculation:', {
                newHour, absoluteDay, stageStartDay, relativeOperationDay, newTime, newLeft,
                deltaDays, deltaTime, deltaHours
            });


            // 更新 operation_day 和 recommended_time
            // 注意：移动操作时不更新窗口时间，窗口保持不变，操作在窗口内移动
            // 包含 stage_start_day 以便 handleDragEnd 可以正确计算绝对天数
            updates = {
                operation_day: relativeOperationDay,
                recommended_time: newTime,
                stage_start_day: stageStartDay
            };

        } else if (state.type === 'resize-start') {
            // 调整时间窗口开始
            // window_start_day_offset 是相对于 operation_day 的偏移（-7 到 7）
            const newHour = computeHourFromX(newLeft);
            const operationAbsoluteHour = state.originalData.operation_day * 24 + state.originalData.recommended_time;

            // 计算新窗口开始时间相对于当天0点的小时数
            const newWindowDay = Math.floor(newHour / 24);
            let newWindowTime = newHour - newWindowDay * 24;
            if (newWindowTime < 0) newWindowTime += 24;

            // 计算相对于 operation_day 的偏移
            const windowOffset = newWindowDay - state.originalData.operation_day;

            // 限制偏移在 -7 到 7 之间
            const clampedOffset = Math.max(-7, Math.min(7, windowOffset));

            console.log('[Drag] Resize-start:', { newHour, newWindowDay, newWindowTime, windowOffset, clampedOffset });

            updates = {
                window_start_time: newWindowTime,
                window_start_day_offset: clampedOffset
            };

        } else if (state.type === 'resize-end') {
            // 调整时间窗口结束
            const endHour = computeHourFromX(newLeft + newWidth);
            const endDay = Math.floor(endHour / 24);
            let endWindowTime = endHour - endDay * 24;
            if (endWindowTime < 0) endWindowTime += 24;

            // 计算相对于 operation_day 的偏移
            const windowOffset = endDay - state.originalData.operation_day;
            const clampedOffset = Math.max(-7, Math.min(7, windowOffset));

            console.log('[Drag] Resize-end:', { endHour, endDay, endWindowTime, windowOffset, clampedOffset });

            updates = {
                window_end_time: endWindowTime,
                window_end_day_offset: clampedOffset
            };
        }

        // 保存到撤销栈
        undoStack.current.push({
            nodeId: state.nodeId,
            scheduleId: state.scheduleId,
            stageId: state.stageId,
            type: state.type,
            oldValue: { ...state.originalData }
        });

        // 限制撤销栈大小
        if (undoStack.current.length > MAX_UNDO) {
            undoStack.current.shift();
        }

        dragState.current = null;

        // 调用 API 更新（静默模式，不刷新界面）
        try {
            await onDragEnd(state.scheduleId, state.stageId, updates);
            // 静默更新本地节点数据，确保后续拖拽使用新值
            if (onNodeUpdate) {
                onNodeUpdate(state.nodeId, updates);
            }
        } catch (error) {
            message.error('保存失败，请重试');
            // 可以考虑自动撤销
        }
    }, [hourWidth, computeHourFromX, destroyTooltip, onDragEnd, onNodeUpdate, handleMouseMove]);

    // 撤销
    const handleUndo = useCallback(async () => {
        const action = undoStack.current.pop();
        if (!action) {
            message.info('没有可撤销的操作');
            return;
        }

        try {
            await onDragEnd(action.scheduleId, action.stageId, action.oldValue);
            // 不调用 refreshData - 静默撤销
            message.success('已撤销');
        } catch (error) {
            message.error('撤销失败');
            // 恢复到撤销栈
            undoStack.current.push(action);
        }
    }, [onDragEnd]);

    // 监听 Ctrl+Z / Cmd+Z
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleUndo]);

    // 清理
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafId.current);
            destroyTooltip();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [destroyTooltip, handleMouseMove, handleMouseUp]);

    return {
        handleDragStart,
        isDragging: dragState.current !== null
    };
}
