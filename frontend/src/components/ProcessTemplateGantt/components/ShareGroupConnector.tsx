/**
 * 共享组连线层
 * 
 * 在甘特图上显示共享组操作之间的连线
 */

import React, { useMemo } from 'react';
import { ShareGroup } from './ShareGroupPanel';
import './ShareGroupPanel.less';

interface OperationPosition {
    scheduleId: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ShareGroupConnectorProps {
    shareGroups: ShareGroup[];
    operationPositions: Map<number, OperationPosition>;
    containerHeight: number;
}

const ShareGroupConnector: React.FC<ShareGroupConnectorProps> = ({
    shareGroups,
    operationPositions,
    containerHeight
}) => {
    // 计算连线路径
    const connectorPaths = useMemo(() => {
        const paths: Array<{
            groupId: number;
            groupName: string;
            mode: 'SAME_TEAM' | 'DIFFERENT';
            path: string;
            labelX: number;
            labelY: number;
            dots: Array<{ cx: number; cy: number }>;
        }> = [];

        shareGroups.forEach(group => {
            if (!group.members || group.members.length < 2) return;

            // 获取所有成员操作的位置
            const memberPositions = group.members
                .map(m => operationPositions.get(m.schedule_id))
                .filter((pos): pos is OperationPosition => pos !== undefined);

            if (memberPositions.length < 2) return;

            // 按Y坐标排序
            memberPositions.sort((a, b) => a.y - b.y);

            // 计算连接点（操作块的左侧中心）
            const dots = memberPositions.map(pos => ({
                cx: pos.x - 10, // 操作块左侧
                cy: pos.y + pos.height / 2
            }));

            // 创建贝塞尔曲线路径连接所有点
            let pathD = '';
            const offsetX = -20; // 连线偏移

            if (dots.length === 2) {
                // 两个点：简单的贝塞尔曲线
                const [p1, p2] = dots;
                const midY = (p1.cy + p2.cy) / 2;
                pathD = `M ${p1.cx} ${p1.cy} 
                 C ${p1.cx + offsetX} ${p1.cy}, 
                   ${p2.cx + offsetX} ${p2.cy}, 
                   ${p2.cx} ${p2.cy}`;
            } else {
                // 多个点：连接线（通过左侧的垂直线）
                const leftX = Math.min(...dots.map(d => d.cx)) + offsetX;

                pathD = dots.map((dot, idx) => {
                    if (idx === 0) {
                        return `M ${dot.cx} ${dot.cy} L ${leftX} ${dot.cy}`;
                    } else if (idx === dots.length - 1) {
                        return `M ${leftX} ${dots[idx - 1].cy} L ${leftX} ${dot.cy} L ${dot.cx} ${dot.cy}`;
                    } else {
                        return `M ${leftX} ${dot.cy} L ${dot.cx} ${dot.cy}`;
                    }
                }).join(' ');
            }

            // 计算标签位置
            const labelX = Math.min(...dots.map(d => d.cx)) - 30;
            const labelY = (dots[0].cy + dots[dots.length - 1].cy) / 2;

            paths.push({
                groupId: group.id,
                groupName: group.group_name,
                mode: group.share_mode,
                path: pathD,
                labelX,
                labelY,
                dots
            });
        });

        return paths;
    }, [shareGroups, operationPositions]);

    if (connectorPaths.length === 0) return null;

    return (
        <svg
            className="share-group-connector-layer"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: containerHeight,
                pointerEvents: 'none',
                overflow: 'visible'
            }}
        >
            {connectorPaths.map(connector => (
                <g
                    key={connector.groupId}
                    className={`share-group-connector mode-${connector.mode.toLowerCase().replace('_', '-')}`}
                >
                    {/* 连接线 */}
                    <path
                        className="connector-line"
                        d={connector.path}
                    />

                    {/* 连接点 */}
                    {connector.dots.map((dot, idx) => (
                        <circle
                            key={idx}
                            className="connector-dot"
                            cx={dot.cx}
                            cy={dot.cy}
                            r={4}
                        />
                    ))}

                    {/* 组名标签 */}
                    <text
                        className="connector-label"
                        x={connector.labelX}
                        y={connector.labelY}
                        textAnchor="end"
                        dominantBaseline="middle"
                    >
                        {connector.groupName}
                    </text>
                </g>
            ))}
        </svg>
    );
};

export default ShareGroupConnector;
