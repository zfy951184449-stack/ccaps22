import React, { useMemo } from 'react';
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
    visibleTop?: number;
    visibleBottom?: number;
}

interface ShareGroupPath {
    key: string;
    minY: number;
    maxY: number;
    color: string;
    pathD: string;
}

const ShareGroupConnections: React.FC<ShareGroupConnectionsProps> = ({
    shareGroups,
    operationPositions,
    rowHeight,
    visibleTop = 0,
    visibleBottom = Number.POSITIVE_INFINITY
}) => {
    const getColor = (mode: string) => {
        return mode === 'SAME_TEAM' ? '#10B981' : '#8B5CF6';
    };

    const containerBounds = useMemo(() => {
        let maxX = 0;
        let maxY = 0;

        operationPositions.forEach(pos => {
            maxX = Math.max(maxX, pos.x + pos.width);
            maxY = Math.max(maxY, pos.y + rowHeight);
        });

        return {
            width: maxX + 100,
            height: maxY + 100,
        };
    }, [operationPositions, rowHeight]);

    const groupPaths = useMemo(() => {
        if (!shareGroups || shareGroups.length === 0) {
            return [];
        }

        return shareGroups.map(group => {
            const memberPositions = group.member_operation_ids
                .map(id => operationPositions.get(id))
                .filter((pos): pos is OperationPosition => pos !== undefined);

            if (memberPositions.length < 2) {
                return null;
            }

            const color = getColor(group.share_mode);
            const halfRow = rowHeight / 2;
            const paths: ShareGroupPath[] = [];

            for (let i = 0; i < memberPositions.length - 1; i++) {
                const from = memberPositions[i];
                const to = memberPositions[i + 1];
                const x1 = from.x + from.width / 2;
                const y1 = from.y + halfRow;
                const x2 = to.x + to.width / 2;
                const y2 = to.y + halfRow;
                const gap = 12;
                let pathD = '';

                if (Math.abs(y2 - y1) < 5) {
                    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
                } else if (x2 > x1 + 2 * gap) {
                    const midX = x1 + (x2 - x1) / 2;
                    pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                } else {
                    pathD = `M ${x1} ${y1} L ${x1 + gap} ${y1} L ${x1 + gap} ${y2} L ${x2} ${y2}`;
                }

                paths.push({
                    key: `sg-${group.id}-${i}`,
                    minY: Math.min(from.y, to.y),
                    maxY: Math.max(from.y, to.y) + rowHeight,
                    color,
                    pathD,
                });
            }

            return {
                id: group.id,
                paths,
            };
        }).filter((group): group is { id: number; paths: ShareGroupPath[] } => group !== null);
    }, [operationPositions, rowHeight, shareGroups]);

    if (groupPaths.length === 0) return null;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: containerBounds.width,
                height: containerBounds.height,
                pointerEvents: 'none',
                zIndex: 2
            }}
        >
            {groupPaths.map(group => {
                const visiblePaths = group.paths.filter(path => !(path.maxY < visibleTop || path.minY > visibleBottom));

                if (visiblePaths.length === 0) {
                    return null;
                }

                return (
                    <g key={`sg-group-${group.id}`}>
                        {visiblePaths.map(path => (
                            <path
                                key={path.key}
                                d={path.pathD}
                                stroke={path.color}
                                strokeWidth={2}
                                strokeDasharray="4,4"
                                fill="none"
                                opacity={0.6}
                            />
                        ))}
                    </g>
                );
            })}
        </svg>
    );
};

export default React.memo(ShareGroupConnections);
