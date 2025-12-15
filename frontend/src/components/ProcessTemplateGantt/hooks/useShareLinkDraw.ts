import { useState, useCallback } from 'react';
import { Modal, message } from 'antd';
import axios from 'axios';
import { TimeBlock } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

interface DrawingLine {
    startScheduleId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

interface UseShareLinkDrawOptions {
    operationBlockMap: Map<number, TimeBlock>;
    onConstraintCreated: () => void;
    containerRef: React.RefObject<HTMLElement>;
    hourWidth: number;
    rowIndexMap: Map<string, number>;
}

export const useShareLinkDraw = ({
    operationBlockMap,
    onConstraintCreated,
    containerRef,
    hourWidth,
    rowIndexMap
}: UseShareLinkDrawOptions) => {
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [drawingLine, setDrawingLine] = useState<DrawingLine | null>(null);
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

    const ROW_HEIGHT = 36; // Match constants

    // 切换绘制模式
    const toggleDrawMode = useCallback(() => {
        setIsDrawingMode(prev => !prev);
        setDrawingLine(null);
        setSelectedScheduleId(null);
    }, []);

    // 获取相对于容器的坐标
    const getRelativeCoords = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        const scrollLeft = containerRef.current.scrollLeft;
        const scrollTop = containerRef.current.scrollTop;
        return {
            x: clientX - rect.left + scrollLeft,
            y: clientY - rect.top + scrollTop
        };
    }, [containerRef]);

    // 点击操作条 - 开始或结束绘制
    const handleOperationClick = useCallback((scheduleId: number, event: React.MouseEvent) => {
        if (!isDrawingMode) return;

        event.stopPropagation();
        const block = operationBlockMap.get(scheduleId);
        if (!block) return;

        const rowIndex = rowIndexMap.get(block.node_id);
        if (rowIndex === undefined) return;

        if (!drawingLine) {
            // 开始绘制：设置起点
            const startX = (block.start_hour + block.duration_hours) * hourWidth;
            const startY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            setDrawingLine({
                startScheduleId: scheduleId,
                startX,
                startY,
                currentX: startX,
                currentY: startY
            });
            setSelectedScheduleId(scheduleId);
        } else {
            // 结束绘制：选择了目标操作
            if (scheduleId === drawingLine.startScheduleId) {
                // 点击了同一个操作，取消绘制
                setDrawingLine(null);
                setSelectedScheduleId(null);
                return;
            }

            // 弹出模式选择对话框
            showShareModeModal(drawingLine.startScheduleId, scheduleId);
        }
    }, [isDrawingMode, drawingLine, operationBlockMap, hourWidth, rowIndexMap]);

    // 鼠标移动 - 更新绘制线终点
    const handleMouseMove = useCallback((event: React.MouseEvent) => {
        if (!isDrawingMode || !drawingLine) return;
        const { x, y } = getRelativeCoords(event.clientX, event.clientY);
        setDrawingLine(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
    }, [isDrawingMode, drawingLine, getRelativeCoords]);

    // 点击空白区域 - 取消绘制
    const handleCanvasClick = useCallback(() => {
        if (!isDrawingMode || !drawingLine) return;
        // 取消当前绘制
        setDrawingLine(null);
        setSelectedScheduleId(null);
    }, [isDrawingMode, drawingLine]);

    // 显示共享模式选择对话框
    const showShareModeModal = useCallback((fromScheduleId: number, toScheduleId: number) => {
        let selectedMode: 'SAME_TEAM' | 'DIFFERENT' = 'SAME_TEAM';

        Modal.confirm({
            title: '选择共享模式',
            icon: null,
            content: '请选择人员共享模式：\n\n🔵 同组执行 - 由同一组人员执行\n🟠 不同人员 - 必须由不同人员执行',
            okText: '同组执行',
            cancelText: '不同人员',
            onOk: async () => {
                selectedMode = 'SAME_TEAM';
                await createShareConstraint(fromScheduleId, toScheduleId, selectedMode);
            },
            onCancel: async () => {
                selectedMode = 'DIFFERENT';
                await createShareConstraint(fromScheduleId, toScheduleId, selectedMode);
            }
        });

        // 完成后清除绘制状态
        setDrawingLine(null);
        setSelectedScheduleId(null);
    }, []);

    // 创建共享约束
    const createShareConstraint = async (
        fromScheduleId: number,
        toScheduleId: number,
        shareMode: 'SAME_TEAM' | 'DIFFERENT'
    ) => {
        try {
            await axios.post(`${API_BASE_URL}/constraints`, {
                from_schedule_id: fromScheduleId,
                to_schedule_id: toScheduleId,
                constraint_type: 0,  // 仅人员共享
                constraint_level: 1,
                lag_time: 0,
                lag_type: 'ASAP',
                lag_min: 0,
                lag_max: null,
                share_mode: shareMode
            });
            message.success(`共享关系创建成功 (${shareMode === 'SAME_TEAM' ? '同组执行' : '不同人员'})`);
            onConstraintCreated();
        } catch (error: any) {
            console.error('Error creating share constraint:', error);
            if (error.response?.data?.error === 'Would create circular dependency') {
                message.error('添加失败：会产生循环依赖');
            } else if (error.response?.data?.error === 'Constraint already exists') {
                message.error('添加失败：约束已存在');
            } else {
                message.error('创建共享关系失败');
            }
        }
    };

    return {
        isDrawingMode,
        toggleDrawMode,
        drawingLine,
        selectedScheduleId,
        handleOperationClick,
        handleMouseMove,
        handleCanvasClick
    };
};
