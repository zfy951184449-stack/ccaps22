import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Checkbox } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { GanttOperation } from './types';
import { useGantt } from './GanttContext';
import { BATCH_COLORS } from './constants';
import { GanttRenderRow, RowCalculationResult, getVisibleOperations, isAlternateRow } from './rowUtils';
import { useVirtualRows } from './hooks/useVirtualRows';
import './BatchGanttV4.css';

interface GanttSidebarProps {
    data: RowCalculationResult['rows'];
    rowLayout: RowCalculationResult;
    rowHeight: number;
    onOperationDoubleClick?: (operation: GanttOperation) => void;
    isShareGroupMode?: boolean;
    selectedOperationIds?: number[];
    onOperationCheck?: (operationId: number, checked: boolean) => void;
}

const GanttSidebar = forwardRef<HTMLDivElement, GanttSidebarProps>(({
    data,
    rowLayout,
    rowHeight,
    onOperationDoubleClick,
    isShareGroupMode = false,
    selectedOperationIds = [],
    onOperationCheck
}, forwardedRef) => {
    const { expandedBatches, toggleBatch, expandedStages, toggleStage, layoutMode } = useGantt();
    const bodyRef = useRef<HTMLDivElement>(null);
    const selectedOperationIdSet = useMemo(() => new Set(selectedOperationIds), [selectedOperationIds]);
    const { startIndex, endIndex } = useVirtualRows(bodyRef, rowLayout.totalRows, rowHeight);

    useEffect(() => {
        if (typeof forwardedRef === 'function') {
            forwardedRef(bodyRef.current);
            return;
        }

        if (forwardedRef) {
            forwardedRef.current = bodyRef.current;
        }
    }, [forwardedRef]);

    const visibleRows = useMemo(
        () => rowLayout.rows.slice(startIndex, endIndex + 1),
        [endIndex, rowLayout.rows, startIndex]
    );

    const renderRow = (row: GanttRenderRow) => {
        const color = BATCH_COLORS[row.batchIndex % BATCH_COLORS.length];
        const backgroundTint = color.tint;
        const rowClassName = `gantt-sidebar-row ${isAlternateRow(row.rowIndex) ? 'gantt-row-alt' : ''}`;
        const baseStyle: React.CSSProperties = {
            position: 'absolute',
            top: row.rowIndex * rowHeight,
            left: 0,
            right: 0,
            height: rowHeight,
            backgroundColor: backgroundTint,
        };

        if (row.kind === 'batch') {
            return (
                <div
                    key={row.key}
                    style={baseStyle}
                    className={rowClassName}
                    onClick={() => toggleBatch(row.batch.id)}
                >
                    <span className="gantt-icon-sm gantt-text-xxs">
                        {expandedBatches.has(row.batch.id) ? <DownOutlined /> : <RightOutlined />}
                    </span>
                    <span className="gantt-text-truncate gantt-text-sm" style={{ fontWeight: 600, flex: 1, color: '#1F2937' }}>
                        {row.batch.code}
                    </span>
                    <span className={`gantt-status-badge ${row.batch.status === 'ACTIVATED' ? 'gantt-status-active' : 'gantt-status-draft'}`}>
                        {row.batch.status === 'ACTIVATED' ? 'Active' : 'Draft'}
                    </span>
                </div>
            );
        }

        if (row.kind === 'stage') {
            const visibleOperationCount = getVisibleOperations(row.stage.operations).length;
            return (
                <div
                    key={row.key}
                    style={baseStyle}
                    className={rowClassName}
                    onClick={() => {
                        if (layoutMode !== 'compact') {
                            toggleStage(row.stageKey);
                        }
                    }}
                >
                    <div style={{ width: 16 }}></div>
                    {layoutMode === 'standard' && (
                        <span className="gantt-icon-sm gantt-text-xxs">
                            {expandedStages.has(row.stageKey) ? <DownOutlined /> : <RightOutlined />}
                        </span>
                    )}
                    <span className="gantt-text-truncate gantt-text-sm" style={{ color: '#4B5563', flex: 1 }}>
                        {row.stage.name}
                    </span>
                    {layoutMode === 'compact' && visibleOperationCount > 0 && (
                        <span style={{
                            fontSize: 10,
                            color: '#9CA3AF',
                            backgroundColor: '#F3F4F6',
                            padding: '2px 6px',
                            borderRadius: 4,
                            marginLeft: 8,
                            whiteSpace: 'nowrap'
                        }}>
                            {visibleOperationCount} 项
                        </span>
                    )}
                </div>
            );
        }

        if (row.kind === 'lane') {
            const summary = row.operations.length > 1 ? `${row.operations[0].name} +${row.operations.length - 1}` : row.operations[0]?.name || '空 Lane';
            return (
                <div
                    key={row.key}
                    style={{ ...baseStyle, paddingLeft: 20 }}
                    className={`${rowClassName} gantt-sidebar-row-lane`}
                >
                    <div style={{ width: 32 }}></div>
                    <span className="gantt-lane-label">L{row.laneIndex + 1}</span>
                    <span className="gantt-text-truncate gantt-text-xs" style={{ color: '#6B7280', flex: 1 }}>
                        {summary}
                    </span>
                    <span className="gantt-lane-badge">{row.operations.length} 项</span>
                </div>
            );
        }

        return (
            <div
                key={row.key}
                style={{ ...baseStyle, cursor: 'pointer' }}
                className={rowClassName}
                onDoubleClick={() => onOperationDoubleClick?.(row.operation)}
            >
                <div style={{ width: 32 }}></div>
                {isShareGroupMode && onOperationCheck ? (
                    <Checkbox
                        checked={selectedOperationIdSet.has(row.operation.id)}
                        onChange={(event) => {
                            event.stopPropagation();
                            onOperationCheck(row.operation.id, event.target.checked);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        style={{ marginRight: 8 }}
                    />
                ) : (
                    <span
                        className="w-1 h-1 rounded-full bg-gray-300 mr-2"
                        style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#D1D5DB', marginRight: 8 }}
                    ></span>
                )}
                <span className="gantt-text-truncate gantt-text-xs" style={{ color: '#6B7280' }}>
                    {row.operation.name}
                </span>
            </div>
        );
    };

    return (
        <div className="gantt-sidebar">
            <div style={{ height: 56 }} className="gantt-header-cell">
                <span className="gantt-text-sm">Batch Name</span>
            </div>

            <div ref={bodyRef} className="gantt-sidebar-body" id="gantt-sidebar-body">
                <div
                    className="gantt-virtual-content"
                    style={{ height: rowLayout.totalRows * rowHeight, position: 'relative' }}
                >
                    {data.length > 0 ? visibleRows.map(renderRow) : null}
                </div>
            </div>
        </div>
    );
});

GanttSidebar.displayName = 'GanttSidebar';

export default React.memo(GanttSidebar);
