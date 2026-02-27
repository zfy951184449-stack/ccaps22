import React, { forwardRef, useMemo } from 'react';
import { GanttBatch } from './types';
import { useGantt } from './GanttContext';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { BATCH_COLORS } from './constants';
import { calculateRowLayout, isAlternateRow } from './rowUtils';
import './BatchGanttV4.css';

interface GanttSidebarProps {
    data: GanttBatch[];
    onOperationDoubleClick?: (operation: any) => void;
    // 快捷创建共享组模式
    isShareGroupMode?: boolean;
    selectedOperationIds?: number[];
    onOperationCheck?: (operationId: number, checked: boolean) => void;
}

const GanttSidebar = forwardRef<HTMLDivElement, GanttSidebarProps>(({
    data,
    onOperationDoubleClick,
    isShareGroupMode = false,
    selectedOperationIds = [],
    onOperationCheck
}, ref) => {
    const { expandedBatches, toggleBatch, expandedStages, toggleStage, layoutMode } = useGantt();

    // 使用统一的行计算逻辑
    const { rowMap } = useMemo(
        () => calculateRowLayout(data, expandedBatches, expandedStages, layoutMode),
        [data, expandedBatches, expandedStages, layoutMode]
    );

    // Styles matching Timeline
    const headerHeight = 56;
    const rowHeight = 32;

    return (
        <div className="gantt-sidebar">
            {/* Header matches Timeline Header Height */}
            <div style={{ height: headerHeight }} className="gantt-header-cell">
                <span className="gantt-text-sm">Batch Name</span>
            </div>

            <div ref={ref} className="gantt-sidebar-body" id="gantt-sidebar-body">
                {data.map((batch, batchIndex) => {
                    const batchRowIndex = rowMap.get(`batch-${batch.id}`) ?? 0;
                    const batchIsAlt = isAlternateRow(batchRowIndex);
                    const color = BATCH_COLORS[batchIndex % BATCH_COLORS.length];
                    const backgroundTint = color.tint;

                    return (
                        <div key={batch.id}>
                            {/* Batch Row */}
                            <div
                                style={{ height: rowHeight, backgroundColor: backgroundTint }}
                                className={`gantt-sidebar-row ${batchIsAlt ? 'gantt-row-alt' : ''}`}
                                onClick={() => toggleBatch(batch.id)}
                            >
                                <span className="gantt-icon-sm gantt-text-xxs">
                                    {expandedBatches.has(batch.id) ? <DownOutlined /> : <RightOutlined />}
                                </span>
                                <span className="gantt-text-truncate gantt-text-sm" style={{ fontWeight: 600, flex: 1, color: '#1F2937' }}>{batch.code}</span>
                                <span className={`gantt-status-badge ${batch.status === 'ACTIVATED' ? 'gantt-status-active' : 'gantt-status-draft'}`}>
                                    {batch.status === 'ACTIVATED' ? 'Active' : 'Draft'}
                                </span>
                            </div>

                            {/* Stages */}
                            {expandedBatches.has(batch.id) && batch.stages.map(stage => {
                                const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                                const stageRowIndex = rowMap.get(stageKey) ?? 0;
                                const stageIsAlt = isAlternateRow(stageRowIndex);

                                return (
                                    <div key={stage.id}>
                                        <div
                                            style={{ height: rowHeight, backgroundColor: backgroundTint }}
                                            className={`gantt-sidebar-row ${stageIsAlt ? 'gantt-row-alt' : ''}`}
                                            onClick={() => layoutMode === 'compact' ? null : toggleStage(stageKey)}
                                        >
                                            <div style={{ width: 16 }}></div> {/* Indent */}
                                            {layoutMode === 'standard' && (
                                                <span className="gantt-icon-sm gantt-text-xxs">
                                                    {expandedStages.has(stageKey) ? <DownOutlined /> : <RightOutlined />}
                                                </span>
                                            )}
                                            <span className="gantt-text-truncate gantt-text-sm" style={{ color: '#4B5563', flex: 1 }}>{stage.name}</span>
                                            {layoutMode === 'compact' && stage.operations.length > 0 && (
                                                <span style={{
                                                    fontSize: 10,
                                                    color: '#9CA3AF',
                                                    backgroundColor: '#F3F4F6',
                                                    padding: '2px 6px',
                                                    borderRadius: 4,
                                                    marginLeft: 8,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {stage.operations.length} 项
                                                </span>
                                            )}
                                        </div>

                                        {/* Operations (Only in Standard Mode) */}
                                        {/* P0-2: Filter out offScreen ops, P0-3: Safety check for rowMap */}
                                        {layoutMode === 'standard' && expandedStages.has(stageKey) && stage.operations
                                            .filter(op => !op.isOffScreen)
                                            .map(op => {
                                                const opRowIndex = rowMap.get(`op-${op.id}`);
                                                if (opRowIndex === undefined) {
                                                    if (process.env.NODE_ENV === 'development') {
                                                        console.error(`[GanttSidebar] Data integrity error: op-${op.id} not in rowMap`);
                                                    }
                                                    return null;
                                                }
                                                const opIsAlt = isAlternateRow(opRowIndex);

                                                return (
                                                    <div key={op.id}
                                                        style={{ height: rowHeight, backgroundColor: backgroundTint, cursor: 'pointer' }}
                                                        className={`gantt-sidebar-row ${opIsAlt ? 'gantt-row-alt' : ''}`}
                                                        onDoubleClick={() => onOperationDoubleClick && onOperationDoubleClick(op)}
                                                    >
                                                        <div style={{ width: 32 }}></div> {/* Indent */}
                                                        {/* 共享组模式下显示勾选框 */}
                                                        {isShareGroupMode && onOperationCheck ? (
                                                            <Checkbox
                                                                checked={selectedOperationIds.includes(op.id)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    onOperationCheck(op.id, e.target.checked);
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ marginRight: 8 }}
                                                            />
                                                        ) : (
                                                            <span className="w-1 h-1 rounded-full bg-gray-300 mr-2" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#D1D5DB', marginRight: 8 }}></span>
                                                        )}
                                                        <span className="gantt-text-truncate gantt-text-xs" style={{ color: '#6B7280' }}>{op.name}</span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

GanttSidebar.displayName = 'GanttSidebar';

export default GanttSidebar;
