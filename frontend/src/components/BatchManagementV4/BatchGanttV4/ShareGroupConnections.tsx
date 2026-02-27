import React from 'react';
import { GanttShareGroup } from './types';

interface OperationPosition {
    x: number;
    y: number;
    width: number;
}

interface ShareGroupConnectionsProps {
    shareGroups: GanttShareGroup[];
    operationPositions: Map<number, OperationPosition>;
    rowHeight: number;
}

const ShareGroupConnections: React.FC<ShareGroupConnectionsProps> = ({
    shareGroups,
    operationPositions,
    rowHeight
}) => {
    if (!shareGroups || shareGroups.length === 0) return null;

    // Calculate SVG container size
    let maxX = 0;
    let maxY = 0;
    operationPositions.forEach(pos => {
        maxX = Math.max(maxX, pos.x + pos.width);
        maxY = Math.max(maxY, pos.y + rowHeight);
    });

    const getColor = (mode: string) => {
        return mode === 'SAME_TEAM' ? '#10B981' : '#8B5CF6'; // Green for same team, Purple for different people
    };

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: maxX + 100,
                height: maxY + 100,
                pointerEvents: 'none',
                zIndex: 2 // 高于窗口条 (1)，低于批次/阶段条 (4)
            }}
        >
            {shareGroups.map(group => {
                const memberPositions = group.member_operation_ids
                    .map(id => operationPositions.get(id))
                    .filter((pos): pos is OperationPosition => pos !== undefined);

                if (memberPositions.length < 2) return null;

                const color = getColor(group.share_mode);
                const halfRow = rowHeight / 2;

                // Connect all members in sequence
                const lines: React.ReactNode[] = [];
                for (let i = 0; i < memberPositions.length - 1; i++) {
                    const from = memberPositions[i];
                    const to = memberPositions[i + 1];

                    const x1 = from.x + from.width / 2;
                    const y1 = from.y + halfRow;
                    const x2 = to.x + to.width / 2;
                    const y2 = to.y + halfRow;

                    // Draw orthogonal (L-shaped) line
                    const gap = 12;
                    let pathD = '';

                    if (Math.abs(y2 - y1) < 5) {
                        // Same row - direct horizontal line
                        pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
                    } else if (x2 > x1 + 2 * gap) {
                        // Normal case: go right, then down/up, then right
                        const midX = x1 + (x2 - x1) / 2;
                        pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                    } else {
                        // Tight case: go right a bit, down, left a bit
                        pathD = `M ${x1} ${y1} L ${x1 + gap} ${y1} L ${x1 + gap} ${y2} L ${x2} ${y2}`;
                    }

                    lines.push(
                        <path
                            key={`sg-${group.id}-${i}`}
                            d={pathD}
                            stroke={color}
                            strokeWidth={2}
                            strokeDasharray="4,4"
                            fill="none"
                            opacity={0.6}
                        />
                    );
                }

                return <g key={`sg-group-${group.id}`}>{lines}</g>;
            })}
        </svg>
    );
};

export default ShareGroupConnections;
