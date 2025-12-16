import React, { useMemo } from 'react';
import { TimeBlock } from '../types';
import { TOKENS, ROW_HEIGHT } from '../constants';

interface ShareLink {
    constraint_id: number;
    from_schedule_id: number;
    to_schedule_id: number;
    share_mode: 'SAME_TEAM' | 'DIFFERENT';
}

interface DrawingLine {
    startScheduleId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

interface ShareLinkLayerProps {
    shareLinks: ShareLink[];
    operationBlockMap: Map<number, TimeBlock>;
    containerWidth: number;
    containerHeight: number;
    scrollLeft: number;
    scrollTop: number;
    hourWidth: number;
    rowIndexMap: Map<string, number>;
    startDay: number;  // 用于转换绝对小时到相对坐标
    isDrawingMode?: boolean;
    drawingLine?: DrawingLine | null;
}

const SHARE_MODE_COLORS = {
    SAME_TEAM: '#1890ff',  // 蓝色
    DIFFERENT: '#fa8c16'   // 橙色
};

export const ShareLinkLayer: React.FC<ShareLinkLayerProps> = ({
    shareLinks,
    operationBlockMap,
    containerWidth,
    containerHeight,
    hourWidth,
    rowIndexMap,
    startDay,
    isDrawingMode = false,
    drawingLine
}) => {
    // 计算连线路径
    const linkPaths = useMemo(() => {
        // 统计同一行的连线数量，用于偏移计算
        const rowLinkCount = new Map<number, number>();

        return shareLinks.map((link, linkIndex) => {
            const fromBlock = operationBlockMap.get(link.from_schedule_id);
            const toBlock = operationBlockMap.get(link.to_schedule_id);

            if (!fromBlock || !toBlock) return null;

            // 获取行索引
            const fromRowIndex = rowIndexMap.get(fromBlock.node_id);
            const toRowIndex = rowIndexMap.get(toBlock.node_id);

            if (fromRowIndex === undefined || toRowIndex === undefined) return null;

            // 转换绝对小时到相对坐标（与 ConstraintLayer 一致）
            const fromRelativeHour = (fromBlock.start_hour + fromBlock.duration_hours / 2) - startDay * 24;
            const toRelativeHour = (toBlock.start_hour + toBlock.duration_hours / 2) - startDay * 24;
            const fromCenterX = fromRelativeHour * hourWidth;
            const toCenterX = toRelativeHour * hourWidth;
            const fromY = fromRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            const toY = toRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

            // 使用直角折线连接（与 ConstraintLayer 风格一致）
            const sameRow = fromRowIndex === toRowIndex;
            let path: string;
            let arrowPoints: string;
            let arrowPoints2: string;
            const arrowSize = 9;

            if (sameRow) {
                // 同一行：水平虚线，使用索引偏移避免重叠
                const currentCount = rowLinkCount.get(fromRowIndex) || 0;
                rowLinkCount.set(fromRowIndex, currentCount + 1);
                // 交替使用上下偏移
                const baseOffset = ROW_HEIGHT * 0.2;
                const offsetY = fromY - baseOffset - (currentCount * 6);

                path = `M ${fromCenterX} ${offsetY} L ${toCenterX} ${offsetY}`;
                // 双向箭头
                arrowPoints = fromCenterX < toCenterX
                    ? `${toCenterX},${offsetY} ${toCenterX - arrowSize},${offsetY - arrowSize / 2} ${toCenterX - arrowSize},${offsetY + arrowSize / 2}`
                    : `${toCenterX},${offsetY} ${toCenterX + arrowSize},${offsetY - arrowSize / 2} ${toCenterX + arrowSize},${offsetY + arrowSize / 2}`;
                arrowPoints2 = fromCenterX < toCenterX
                    ? `${fromCenterX},${offsetY} ${fromCenterX + arrowSize},${offsetY - arrowSize / 2} ${fromCenterX + arrowSize},${offsetY + arrowSize / 2}`
                    : `${fromCenterX},${offsetY} ${fromCenterX - arrowSize},${offsetY - arrowSize / 2} ${fromCenterX - arrowSize},${offsetY + arrowSize / 2}`;
            } else {
                // 不同行：直角折线连接，添加基于索引的X偏移避免重叠
                const xOffset = (linkIndex % 5) * 8; // 每条连线偏移一点
                const midX = fromCenterX + (toCenterX - fromCenterX) / 2 + xOffset;
                path = `M ${fromCenterX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toCenterX} ${toY}`;
                // 双向箭头
                arrowPoints = toCenterX >= midX
                    ? `${toCenterX},${toY} ${toCenterX - arrowSize},${toY - arrowSize / 2} ${toCenterX - arrowSize},${toY + arrowSize / 2}`
                    : `${toCenterX},${toY} ${toCenterX + arrowSize},${toY - arrowSize / 2} ${toCenterX + arrowSize},${toY + arrowSize / 2}`;
                arrowPoints2 = fromCenterX <= midX
                    ? `${fromCenterX},${fromY} ${fromCenterX + arrowSize},${fromY - arrowSize / 2} ${fromCenterX + arrowSize},${fromY + arrowSize / 2}`
                    : `${fromCenterX},${fromY} ${fromCenterX - arrowSize},${fromY - arrowSize / 2} ${fromCenterX - arrowSize},${fromY + arrowSize / 2}`;
            }

            return {
                id: link.constraint_id,
                path,
                color: SHARE_MODE_COLORS[link.share_mode],
                shareMode: link.share_mode,
                fromCenterX,
                fromY,
                toCenterX,
                toY,
                arrowPoints,
                arrowPoints2,
                sameRow
            };
        }).filter(Boolean);
    }, [shareLinks, operationBlockMap, hourWidth, rowIndexMap, startDay]);

    if (shareLinks.length === 0 && !isDrawingMode) return null;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: containerWidth,
                height: containerHeight,
                pointerEvents: 'none',
                zIndex: 5
            }}
        >
            <defs>
                {/* 蓝色箭头 - 同组执行 */}
                <marker
                    id="share-arrow-same"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill={SHARE_MODE_COLORS.SAME_TEAM} />
                </marker>
                {/* 橙色箭头 - 不同人员 */}
                <marker
                    id="share-arrow-different"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path d="M0,0 L0,8 L8,4 z" fill={SHARE_MODE_COLORS.DIFFERENT} />
                </marker>
            </defs>

            {/* 渲染已存在的共享连线 */}
            {linkPaths.map((link) => link && (
                <g key={link.id}>
                    {/* 路径 - 虚线 */}
                    <path
                        d={link.path}
                        fill="none"
                        stroke={link.color}
                        strokeWidth={3}
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                        opacity={0.85}
                    />
                    {/* 双向箭头 */}
                    <polygon
                        points={link.arrowPoints}
                        fill={link.color}
                        opacity={0.85}
                    />
                    <polygon
                        points={link.arrowPoints2}
                        fill={link.color}
                        opacity={0.85}
                    />
                </g>
            ))}

            {/* 正在绘制的连线 */}
            {isDrawingMode && drawingLine && (
                <g>
                    <line
                        x1={drawingLine.startX}
                        y1={drawingLine.startY}
                        x2={drawingLine.currentX}
                        y2={drawingLine.currentY}
                        stroke="#1890ff"
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        opacity={0.6}
                    />
                    <circle
                        cx={drawingLine.startX}
                        cy={drawingLine.startY}
                        r={6}
                        fill="#1890ff"
                        opacity={0.8}
                    />
                    <circle
                        cx={drawingLine.currentX}
                        cy={drawingLine.currentY}
                        r={4}
                        fill="#1890ff"
                        stroke="#fff"
                        strokeWidth={2}
                        opacity={0.8}
                    />
                </g>
            )}

            {/* 绘制模式提示 */}
            {isDrawingMode && !drawingLine && (
                <text
                    x={20}
                    y={30}
                    fill={TOKENS.primary}
                    fontSize={14}
                    fontWeight={500}
                >
                    点击操作条开始绘制共享关系...
                </text>
            )}
        </svg>
    );
};
