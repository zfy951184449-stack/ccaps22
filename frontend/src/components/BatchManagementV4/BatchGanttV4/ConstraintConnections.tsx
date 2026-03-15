import React, { useMemo } from 'react';
import { GanttDependency } from './types';

interface OperationPosition {
    x: number;
    y: number;
    width: number;
}

interface ConstraintConnectionsProps {
    dependencies: GanttDependency[];
    operationPositions: Map<number, OperationPosition>;
    rowHeight: number;
    visibleTop?: number;
    visibleBottom?: number;
}

interface DependencyPath {
    id: number;
    minY: number;
    maxY: number;
    pathD: string;
}

const ConstraintConnections: React.FC<ConstraintConnectionsProps> = ({
    dependencies,
    operationPositions,
    rowHeight,
    visibleTop = 0,
    visibleBottom = Number.POSITIVE_INFINITY
}) => {
    const ARROW_SIZE = 6;
    const COLOR = '#F97316';

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

    const dependencyPaths = useMemo(() => {
        if (!dependencies || dependencies.length === 0) {
            return [];
        }

        return dependencies.map(dep => {
            const fromPos = operationPositions.get(dep.from);
            const toPos = operationPositions.get(dep.to);

            if (!fromPos || !toPos) {
                return null;
            }

            const minY = Math.min(fromPos.y, toPos.y);
            const maxY = Math.max(fromPos.y, toPos.y) + rowHeight;
            const type = Number(dep.type) || 1;
            const halfRow = rowHeight / 2;

            let x1: number;
            let y1: number;
            let x2: number;
            let y2: number;

            if (type === 1 || type === 3) {
                x1 = fromPos.x + fromPos.width;
                y1 = fromPos.y + halfRow;
            } else {
                x1 = fromPos.x;
                y1 = fromPos.y + halfRow;
            }

            if (type === 1 || type === 2) {
                x2 = toPos.x;
                y2 = toPos.y + halfRow;
            } else {
                x2 = toPos.x + toPos.width;
                y2 = toPos.y + halfRow;
            }

            let pathD = '';
            const gap = 12;

            if (type === 1) {
                if (x2 > x1 + 2 * gap) {
                    const midX = x1 + (x2 - x1) / 2;
                    pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                } else {
                    pathD = `M ${x1} ${y1} L ${x1 + gap} ${y1} L ${x1 + gap} ${y2 - (y2 > y1 ? 10 : -10)} L ${x2 - gap} ${y2 - (y2 > y1 ? 10 : -10)} L ${x2 - gap} ${y2} L ${x2} ${y2}`;
                }
            } else if (type === 2) {
                const minX = Math.min(x1, x2) - gap;
                pathD = `M ${x1} ${y1} L ${minX} ${y1} L ${minX} ${y2} L ${x2} ${y2}`;
            } else if (type === 3) {
                const maxXRoute = Math.max(x1, x2) + gap;
                pathD = `M ${x1} ${y1} L ${maxXRoute} ${y1} L ${maxXRoute} ${y2} L ${x2} ${y2}`;
            } else if (type === 4) {
                if (x1 > x2 + 2 * gap) {
                    const midX = x2 + (x1 - x2) / 2;
                    pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                } else {
                    pathD = `M ${x1} ${y1} L ${x1 - gap} ${y1} L ${x1 - gap} ${y2 - (y2 > y1 ? 10 : -10)} L ${x2 + gap} ${y2 - (y2 > y1 ? 10 : -10)} L ${x2 + gap} ${y2} L ${x2} ${y2}`;
                }
            }

            return {
                id: dep.id,
                minY,
                maxY,
                pathD: pathD || `M ${x1} ${y1} L ${x2} ${y2}`,
            };
        }).filter((path): path is DependencyPath => path !== null);
    }, [dependencies, operationPositions, rowHeight]);

    if (dependencyPaths.length === 0) return null;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: containerBounds.width,
                height: containerBounds.height,
                pointerEvents: 'none',
                zIndex: 3
            }}
        >
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth={ARROW_SIZE}
                    markerHeight={ARROW_SIZE}
                    refX={ARROW_SIZE}
                    refY={ARROW_SIZE / 2}
                    orient="auto"
                >
                    <path d={`M 0 0 L ${ARROW_SIZE} ${ARROW_SIZE / 2} L 0 ${ARROW_SIZE} z`} fill={COLOR} />
                </marker>
            </defs>

            {dependencyPaths.map(path => {
                if (path.maxY < visibleTop || path.minY > visibleBottom) {
                    return null;
                }

                return (
                    <path
                        key={`dep-${path.id}`}
                        d={path.pathD}
                        stroke={COLOR}
                        strokeWidth={1.5}
                        fill="none"
                        markerEnd="url(#arrowhead)"
                        opacity={0.8}
                    />
                );
            })}
        </svg>
    );
};

export default React.memo(ConstraintConnections);
