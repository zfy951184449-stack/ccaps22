import React, { useMemo } from 'react';
import { GanttBatch } from './types';
import './BatchGanttV4.css';
import dayjs from 'dayjs';

interface GanttMinimapProps {
    data: GanttBatch[];
    visible?: boolean;
    currentDate: dayjs.Dayjs;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const GanttMinimapComponent: React.FC<GanttMinimapProps> = ({ data, visible = false, currentDate, onMouseEnter, onMouseLeave }) => {
    // 2. 筛选在该日期有操作的批次
    const activeBatches = useMemo(() => {
        return data.filter(batch => {
            const batchStart = dayjs(batch.startDate).startOf('day');
            const batchEnd = dayjs(batch.endDate).startOf('day');
            const current = currentDate.startOf('day');
            return current.isSame(batchStart) ||
                current.isSame(batchEnd) ||
                (current.isAfter(batchStart) && current.isBefore(batchEnd));
        });
    }, [data, currentDate]);

    // 3. 仅显示前 4 个批次
    const displayedBatches = activeBatches.slice(0, 4);
    const remainingCount = activeBatches.length - 4;

    return (
        <div
            className="gantt-minimap"
            style={{
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
                width: 'auto',
                minWidth: 180,
                height: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(20px)',
                borderRadius: 12,
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                bottom: 24,
                right: 24
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* 1. Current Date */}
            <div style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#111827',
                lineHeight: '1.2',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif'
            }}>
                {currentDate.format('MMM D')}
            </div>

            {/* 2. Active Batches */}
            {displayedBatches.length > 0 ? (
                displayedBatches.map(batch => (
                    <div key={batch.id} style={{
                        fontSize: 12,
                        color: '#6B7280',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 200
                    }}>
                        {batch.name || batch.code}
                    </div>
                ))
            ) : (
                <div style={{
                    fontSize: 12,
                    color: '#9CA3AF',
                    fontStyle: 'italic'
                }}>
                    No batches
                </div>
            )}

            {/* 3. Overflow indicator */}
            {remainingCount > 0 && (
                <div style={{
                    fontSize: 11,
                    color: '#9CA3AF',
                    fontWeight: 500
                }}>
                    +{remainingCount} more...
                </div>
            )}
        </div>
    );
};

const GanttMinimap = React.memo(GanttMinimapComponent);

export default GanttMinimap;
