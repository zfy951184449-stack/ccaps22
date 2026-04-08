/**
 * ProcessTemplateGantt - Refactored Main Component
 */

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Empty, Drawer, message } from 'antd';
import axios from 'axios';
import { ProcessTemplateGanttProps, StageOperation } from './types';
import { useGanttData } from './hooks/useGanttData';
import { useGanttViewport } from './hooks/useGanttViewport';
import { useGanttInteraction } from './hooks/useGanttInteraction';
import { useGanttDrag } from './hooks/useGanttDrag';
import { usePeakPersonnel } from './hooks/usePeakPersonnel';
import { GanttHeader } from './components/GanttHeader';
import { GanttSidebar } from './components/GanttSidebar';
import { GanttTimeline } from './components/GanttTimeline';
import { GanttBars } from './components/GanttBars';
import { ConstraintLayer } from './components/ConstraintLayer';
import { ShareLinkLayer } from './components/ShareLinkLayer';
import { GanttModals } from './components/GanttModals';
import { GanttAxis } from './components/GanttAxis';
import ShareGroupPanel from './components/ShareGroupPanel';
import { collectAllExpandableKeys } from './utils';
import { TOKENS, LEFT_PANEL_WIDTH, TITLE_BAR_HEIGHT, HEADER_HEIGHT, CONTENT_GAP, STAGE_COLORS } from './constants';

const ProcessTemplateGantt: React.FC<ProcessTemplateGanttProps> = ({
    template,
    onBack,
    externalData,
    onOperationClick,
    onCustomDragEnd,
    readOnly = false,
    readOnlyOperations,
    externalIsDirty,
    onExternalSave,
    externalConstraints,
    externalShareGroups
}) => {
    const {
        stages,
        ganttNodes,
        setGanttNodes,
        timeBlocks,
        expandedKeys,
        setExpandedKeys,
        refreshData,
        availableOperations,
        setAvailableOperations,
        isExternalMode
    } = useGanttData(externalData ? { template, externalData } : template);

    const {
        zoomScale,
        setZoomScale,
        ganttContentRef,
        flattenedRows,
        virtualRows,
        totalHeight,
        virtualOffsetY,
        handleGanttScroll,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
        hourWidth,
        headerWidth,
        startDay,
        endDay,
        rowIndexMap,
        operationBlockMap,
        visibleStartIndex,
        visibleEndIndex,
        overscanCount,
        handleGanttMouseDown,
        isPanningRef,
        nodeMap // Extract nodeMap
    } = useGanttViewport(ganttNodes, expandedKeys, timeBlocks);

    const interaction = useGanttInteraction(
        template,
        ganttNodes,
        flattenedRows,
        refreshData,
        availableOperations,
        setAvailableOperations,
        expandedKeys,
        setExpandedKeys,
        ganttContentRef
    );

    // 计算每日人员峰值（实时更新，考虑人员共享）
    const dailyPeaks = usePeakPersonnel({
        timeBlocks,
        ganttNodes,
        startDay,
        endDay,
        constraints: externalConstraints ?? interaction.ganttConstraints,
        shareGroups: externalShareGroups ?? interaction.shareGroups
    });


    // 日期展开功能状态
    const [expandedDay, setExpandedDay] = useState<number | null>(null);

    // 共享组面板状态
    const [shareGroupPanelVisible, setShareGroupPanelVisible] = useState(false);

    // 快捷创建共享组模式状态
    const [isShareGroupMode, setIsShareGroupMode] = useState(false);
    const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>([]);
    const API_BASE_URL = '/api';

    // 操作勾选处理
    const handleOperationCheck = useCallback((operationId: string, checked: boolean) => {
        setSelectedOperationIds(prev =>
            checked
                ? [...prev, operationId]
                : prev.filter(id => id !== operationId)
        );
    }, []);

    // 进入共享组创建模式
    const handleEnterShareGroupMode = useCallback(() => {
        setIsShareGroupMode(true);
        setSelectedOperationIds([]);
    }, []);

    // 取消共享组创建
    const handleCancelShareGroup = useCallback(() => {
        setIsShareGroupMode(false);
        setSelectedOperationIds([]);
    }, []);

    // 确认创建共享组
    const handleConfirmShareGroup = useCallback(async () => {
        if (selectedOperationIds.length < 2) {
            message.warning('请至少选择2个操作');
            return;
        }

        try {
            // 提取 schedule_id（从 operation_X 格式中提取数字）
            const memberIds = selectedOperationIds.map(id =>
                parseInt(id.replace('operation_', ''))
            );

            // 自动生成组名
            const existingCount = interaction.shareGroups?.length || 0;
            const groupName = `共享组-${existingCount + 1}`;

            await axios.post(`${API_BASE_URL}/share-groups/template/${template.id}`, {
                group_name: groupName,
                share_mode: 'SAME_TEAM',
                member_ids: memberIds
            });

            message.success(`${groupName} 创建成功`);
            handleCancelShareGroup();

            // 刷新共享组数据
            interaction.loadShareGroups();
        } catch (error) {
            console.error('创建共享组失败:', error);
            message.error('创建共享组失败');
        }
    }, [selectedOperationIds, template.id, interaction.shareGroups?.length, interaction.loadShareGroups, handleCancelShareGroup]);

    // 绘制共享关系 hook
    // 绘制共享关系 hook (Removed)
    // const shareLinkDraw = ...

    // 从约束中提取共享关系 + 从共享组表提取共享关系
    const shareLinks = useMemo(() => {
        const links: Array<{
            constraint_id: number;
            from_schedule_id: number;
            to_schedule_id: number;
            share_mode: 'SAME_TEAM' | 'DIFFERENT';
        }> = [];

        // 使用外部共享组（批次模式）或内部共享组（模板模式）
        const shareGroupsData = isExternalMode ? externalShareGroups : interaction.shareGroups;

        if (shareGroupsData) {
            shareGroupsData.forEach(group => {
                const members = group.members || [];
                if (members.length >= 2) {
                    // 生成相邻成员之间的连线
                    for (let i = 0; i < members.length - 1; i++) {
                        // 使用负数ID区分共享组连线和约束连线
                        links.push({
                            constraint_id: -(group.id * 1000 + i),
                            from_schedule_id: members[i].schedule_id,
                            to_schedule_id: members[i + 1].schedule_id,
                            share_mode: group.share_mode || 'SAME_TEAM'
                        });
                    }
                }
            });
        }

        return links;
    }, [externalConstraints, interaction.ganttConstraints, interaction.shareGroups, isExternalMode, externalShareGroups]);

    const handleDayDoubleClick = useCallback((dayNumber: number) => {
        setExpandedDay(prev => {
            const newValue = prev === dayNumber ? null : dayNumber;

            // 进入单日模式时，自动展开所有层级到操作层
            if (newValue !== null) {
                const allKeys = collectAllExpandableKeys(ganttNodes);
                setExpandedKeys(allKeys);
            }

            // 重置滚动位置到起始位置，避免 Gantt 图不可见的问题
            setTimeout(() => {
                if (ganttContentRef.current) {
                    ganttContentRef.current.scrollLeft = 0;
                }
                if (headerRef.current) {
                    headerRef.current.scrollLeft = 0;
                }
            }, 0);
            return newValue;
        });
    }, [ganttContentRef, ganttNodes, setExpandedKeys]);

    const handleCollapseDay = useCallback(() => {
        setExpandedDay(null);
        // 重置滚动位置
        setTimeout(() => {
            if (ganttContentRef.current) {
                ganttContentRef.current.scrollLeft = 0;
            }
            if (headerRef.current) {
                headerRef.current.scrollLeft = 0;
            }
        }, 0);
    }, [ganttContentRef]);

    const handlePrevDay = useCallback(() => {
        setExpandedDay(prev => prev !== null ? prev - 1 : null);
        // 单日模式切换日期时，保持所有层级展开
        const allKeys = collectAllExpandableKeys(ganttNodes);
        setExpandedKeys(allKeys);
    }, [ganttNodes, setExpandedKeys]);

    const handleNextDay = useCallback(() => {
        setExpandedDay(prev => prev !== null ? prev + 1 : null);
        // 单日模式切换日期时，保持所有层级展开
        const allKeys = collectAllExpandableKeys(ganttNodes);
        setExpandedKeys(allKeys);
    }, [ganttNodes, setExpandedKeys]);

    // ESC 键收起展开的日期
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && expandedDay !== null) {
                setExpandedDay(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [expandedDay]);

    // 计算展开时的小时宽度（放大 4 倍）
    const effectiveHourWidth = expandedDay !== null ? hourWidth * 4 : hourWidth;
    const effectiveStartDay = expandedDay !== null ? expandedDay : startDay;
    const effectiveEndDay = expandedDay !== null ? expandedDay : endDay;
    const effectiveHeaderWidth = (effectiveEndDay - effectiveStartDay + 1) * 24 * effectiveHourWidth;

    // 拖拽功能 - 使用 effective 值以支持单日展开视图
    // 批次模式使用自定义拖动处理，模板模式使用默认处理
    const dragEndHandler = useMemo(() => {
        if (onCustomDragEnd) {
            return onCustomDragEnd;
        }
        return interaction.handleOperationDragEnd;
    }, [onCustomDragEnd, interaction.handleOperationDragEnd]);

    // 静默更新本地节点数据（拖拽成功后调用，确保后续拖拽使用新值）
    const handleNodeUpdate = useCallback((nodeId: string, updates: {
        operation_day?: number;
        recommended_time?: number;
        window_start_time?: number;
        window_start_day_offset?: number;
        window_end_time?: number;
        window_end_day_offset?: number;
    }) => {
        setGanttNodes(prevNodes => {
            const updateNode = (nodes: typeof prevNodes): typeof prevNodes => {
                return nodes.map(node => {
                    if (node.id === nodeId && node.data) {
                        return {
                            ...node,
                            data: { ...node.data, ...updates }
                        };
                    }
                    if (node.children) {
                        return { ...node, children: updateNode(node.children) };
                    }
                    return node;
                });
            };
            return updateNode(prevNodes);
        });
    }, [setGanttNodes]);

    // 拖拽采用静默更新，不刷新界面，不打断用户操作
    const { handleDragStart } = useGanttDrag({
        hourWidth: effectiveHourWidth,
        startDay: effectiveStartDay,
        endDay: effectiveEndDay,
        onDragEnd: dragEndHandler,
        onNodeUpdate: handleNodeUpdate
    });

    // 过滤 virtualRows：展开日期模式下只显示有操作的行
    const filteredVirtualRows = useMemo(() => {
        if (expandedDay === null) {
            return virtualRows;
        }

        const dayStartHour = expandedDay * 24;
        const dayEndHour = (expandedDay + 1) * 24;

        // 找出在展开日期有操作的 operation node IDs 和它们所属的 stage IDs
        const operationIdsOnDay = new Set<string>();
        const stageIdsWithOperations = new Set<string>();

        timeBlocks.forEach(block => {
            if (block.isStage || block.isTimeWindow) return;
            const blockStartHour = block.start_hour;
            const blockEndHour = block.start_hour + block.duration_hours;
            // 检查是否与展开日期有重叠
            if (!(blockEndHour <= dayStartHour || blockStartHour >= dayEndHour)) {
                operationIdsOnDay.add(block.node_id);
                // 找到该操作所属的 stage
                const operationRow = virtualRows.find(r => r.id === block.node_id);
                if (operationRow?.parentId) {
                    stageIdsWithOperations.add(operationRow.parentId);
                }
            }
        });

        // 过滤行：保留 template、有操作的 stage，以及在展开日期有操作的 operation
        return virtualRows.filter(row => {
            const node = row.node;
            if (node.type === 'template') {
                return true;
            }
            if (node.type === 'stage') {
                return stageIdsWithOperations.has(row.id);
            }
            return operationIdsOnDay.has(row.id);
        });
    }, [virtualRows, expandedDay, timeBlocks]);

    // 创建过滤后的行索引映射（用于展开模式下的条位置计算）
    const filteredRowIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        filteredVirtualRows.forEach((row, index) => {
            map.set(row.id, index);
        });
        return map;
    }, [filteredVirtualRows]);

    // 根据展开模式选择使用哪个 rowIndexMap
    const effectiveRowIndexMap = expandedDay !== null ? filteredRowIndexMap : rowIndexMap;

    const stageColorMap = useMemo(() => {
        const map = new Map<number, string>();
        const paletteKeys = Object.keys(STAGE_COLORS).filter(key => key !== 'DEFAULT');
        stages.forEach((stage, index) => {
            const paletteKey = paletteKeys[index % paletteKeys.length] || 'DEFAULT';
            map.set(stage.id, STAGE_COLORS[paletteKey as keyof typeof STAGE_COLORS]);
        });
        return map;
    }, [stages]);

    const activeOperationSet = useMemo(
        () => new Set(interaction.activeHighlight.operations),
        [interaction.activeHighlight.operations]
    );

    const conflictOperationSet = useMemo(() => {
        const set = new Set<string>();
        if (interaction.validationResult?.conflicts) {
            interaction.validationResult.conflicts.forEach(conflict => {
                conflict.operationScheduleIds?.forEach(id => {
                    set.add(`operation_${id}`);
                });
            });
        }
        return set;
    }, [interaction.validationResult]);

    const conflictConstraintSet = useMemo(
        () => new Set(interaction.validationResult?.conflicts?.flatMap(c => c.constraintIds || []) || []),
        [interaction.validationResult]
    );

    const activeConstraintSet = useMemo(
        () => new Set(interaction.activeHighlight.constraints),
        [interaction.activeHighlight.constraints]
    );

    const headerRef = useRef<HTMLDivElement>(null);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        handleGanttScroll(e);
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: TOKENS.background }}>
            <GanttHeader
                template={template}
                onBack={onBack}
                zoomScale={zoomScale}
                setZoomScale={setZoomScale}
                handleZoomIn={handleZoomIn}
                handleZoomOut={handleZoomOut}
                handleZoomReset={handleZoomReset}
                isDirty={externalIsDirty ?? interaction.isDirty}
                handleSaveTemplate={onExternalSave ?? interaction.handleSaveTemplate}
                handleAutoSchedule={interaction.handleAutoSchedule}
                scheduling={interaction.scheduling}
                onToggleSharePanel={() => setShareGroupPanelVisible(true)}
                shareGroupCount={interaction.shareGroups?.length || 0}
                isShareGroupMode={isShareGroupMode}
                selectedOperationCount={selectedOperationIds.length}
                onEnterShareGroupMode={handleEnterShareGroupMode}
                onConfirmShareGroup={handleConfirmShareGroup}
                onCancelShareGroup={handleCancelShareGroup}
            />

            <div style={{ flex: 1, background: TOKENS.background, overflow: 'visible' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `${LEFT_PANEL_WIDTH}px minmax(0, 1fr)`,
                        gridTemplateRows: `${HEADER_HEIGHT}px 1fr`,
                        height: '100%'
                    }}
                >
                    {/* Sidebar Header */}
                    <div style={{
                        gridColumn: '1 / 2',
                        gridRow: '1 / 2',
                        background: TOKENS.card,
                        borderBottom: `1px solid ${TOKENS.border}`,
                        borderRight: `1px solid ${TOKENS.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 16,
                        fontWeight: 600,
                        color: TOKENS.textSecondary
                    }}>
                        结构
                    </div>

                    {/* Gantt Axis Header */}
                    <div
                        ref={headerRef}
                        style={{
                            gridColumn: '2 / 3',
                            gridRow: '1 / 2',
                            overflow: 'hidden',
                            background: TOKENS.card,
                            borderBottom: `1px solid ${TOKENS.border}`
                        }}
                    >
                        <GanttAxis
                            startDay={effectiveStartDay}
                            endDay={effectiveEndDay}
                            hourWidth={effectiveHourWidth}
                            baseDate={externalData?.baseDate}
                            expandedDay={expandedDay}
                            originalStartDay={startDay}
                            originalEndDay={endDay}
                            onDayDoubleClick={handleDayDoubleClick}
                            onCollapseDay={handleCollapseDay}
                            onPrevDay={handlePrevDay}
                            onNextDay={handleNextDay}
                            dailyPeaks={dailyPeaks}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / 2', gridRow: '2 / 3', background: TOKENS.card, borderRight: `1px solid ${TOKENS.border}`, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            <GanttSidebar
                                virtualRows={filteredVirtualRows}
                                virtualOffsetY={virtualOffsetY}
                                totalHeight={totalHeight}
                                selectedNode={interaction.editingNode}
                                setSelectedNode={isExternalMode ? (() => { }) : interaction.setEditingNode}
                                toggleNodeExpanded={(row) => {
                                    if (!row.hasChildren) return;
                                    setExpandedKeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(row.id) && row.id !== template.id.toString()) {
                                            next.delete(row.id);
                                        } else {
                                            next.add(row.id);
                                        }
                                        if (!next.has(template.id.toString())) {
                                            next.add(template.id.toString());
                                        }
                                        return Array.from(next);
                                    });
                                }}
                                handleAddNode={isExternalMode ? (() => { }) : interaction.handleCreateNode}
                                handleEditNode={isExternalMode ? (node) => {
                                    // 批次模式下，使用 onOperationClick 回调
                                    if (node.type === 'operation' && node.data && onOperationClick) {
                                        const scheduleId = Number(node.id.replace('operation_', ''));
                                        onOperationClick(scheduleId, node.data as StageOperation);
                                    }
                                } : interaction.handleEditNode}
                                handleDeleteNode={isExternalMode ? (() => { }) : interaction.handleDeleteNode}
                                stageColorMap={stageColorMap}
                                setHoveredRow={interaction.setHoveredRow}
                                isShareGroupMode={isShareGroupMode}
                                selectedOperationIds={selectedOperationIds}
                                onOperationCheck={handleOperationCheck}
                            />
                        </div>
                    </div>

                    <div
                        ref={ganttContentRef}
                        className="gantt-scroll-container"
                        style={{
                            gridColumn: '2 / 3',
                            gridRow: '2 / 3',
                            background: TOKENS.background,
                            overflow: 'auto',
                            position: 'relative',
                            cursor: isPanningRef.current ? 'grabbing' : 'grab'
                        }}
                        onScroll={handleScroll}
                        onMouseDown={handleGanttMouseDown}
                    // onMouseMove={...} (Removed)
                    // onClick={...} (Removed)
                    >
                        {!flattenedRows.length || timeBlocks.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <Empty description="暂无数据" />
                            </div>
                        ) : (
                            <div style={{ position: 'relative', width: effectiveHeaderWidth, minWidth: effectiveHeaderWidth }}>
                                <GanttTimeline
                                    startDay={effectiveStartDay}
                                    endDay={effectiveEndDay}
                                    hourWidth={effectiveHourWidth}
                                    totalHeight={totalHeight}
                                    virtualRows={filteredVirtualRows}
                                    visibleStartIndex={visibleStartIndex}
                                    stageColorMap={stageColorMap}
                                    setHoveredRow={interaction.setHoveredRow}
                                    baseDate={externalData?.baseDate}
                                />
                                <GanttBars
                                    timeBlocks={timeBlocks}
                                    nodeMap={nodeMap} // Pass the nodeMap here
                                    rowIndexMap={effectiveRowIndexMap}
                                    visibleStartIndex={visibleStartIndex}
                                    visibleEndIndex={visibleEndIndex}
                                    overscanCount={overscanCount}
                                    startDay={effectiveStartDay}
                                    endDay={effectiveEndDay}
                                    hourWidth={effectiveHourWidth}
                                    stageColorMap={stageColorMap}
                                    activeOperationSet={activeOperationSet}
                                    conflictOperationSet={conflictOperationSet}
                                    scheduleConflicts={interaction.scheduleConflicts}
                                    onEditNode={isExternalMode ? (node) => {
                                        // 批次模式下，使用 onOperationClick 回调
                                        if (node.type === 'operation' && node.data && onOperationClick) {
                                            const scheduleId = Number(node.id.replace('operation_', ''));
                                            onOperationClick(scheduleId, node.data as StageOperation);
                                        }
                                    } : interaction.handleEditNode}
                                    setHoveredRow={interaction.setHoveredRow}
                                    expandedDay={expandedDay}
                                    onDragStart={handleDragStart}
                                    readOnlyOperations={readOnlyOperations}
                                // isDrawingShareMode={...} (Removed)
                                // onShareDrawClick={...} (Removed)
                                // drawingSelectedScheduleId={...} (Removed)
                                />
                                <ConstraintLayer
                                    ganttConstraints={externalConstraints ?? interaction.ganttConstraints}
                                    rowIndexMap={effectiveRowIndexMap}
                                    operationBlockMap={operationBlockMap}
                                    visibleStartIndex={visibleStartIndex}
                                    visibleEndIndex={visibleEndIndex}
                                    overscanCount={overscanCount}
                                    startDay={effectiveStartDay}
                                    hourWidth={effectiveHourWidth}
                                    totalHeight={totalHeight}
                                    conflictConstraintSet={conflictConstraintSet}
                                    activeConstraintSet={activeConstraintSet}
                                />
                                {/* 共享关系连线层 */}
                                <ShareLinkLayer
                                    shareLinks={shareLinks}
                                    operationBlockMap={operationBlockMap}
                                    containerWidth={headerWidth}
                                    containerHeight={totalHeight}
                                    scrollLeft={0}
                                    scrollTop={0}
                                    hourWidth={effectiveHourWidth}
                                    rowIndexMap={effectiveRowIndexMap}
                                    startDay={effectiveStartDay}
                                    isDrawingMode={false}
                                    drawingLine={null}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <GanttModals
                editModalVisible={interaction.editModalVisible}
                setEditModalVisible={interaction.setEditModalVisible}
                editingNode={interaction.editingNode}
                setEditingNode={interaction.setEditingNode}
                form={interaction.form}
                handleSaveNode={interaction.handleSaveNode}
                availableOperations={availableOperations}
                openOperationModal={interaction.openOperationModal}
                operationConstraints={interaction.operationConstraints}
                constraintForm={interaction.constraintForm}
                availableOperationsForConstraints={interaction.availableOperationsForConstraints}
                handleSaveConstraint={interaction.handleSaveConstraint}
                handleDeleteConstraint={interaction.handleDeleteConstraint}
                shareGroups={interaction.shareGroups}
                operationShareGroups={interaction.operationShareGroups}
                assignGroupForm={interaction.assignGroupForm}
                shareGroupForm={interaction.shareGroupForm}
                shareGroupModalVisible={interaction.shareGroupModalVisible}
                setShareGroupModalVisible={interaction.setShareGroupModalVisible}
                handleAssignShareGroup={interaction.handleAssignShareGroup}
                handleRemoveShareGroup={interaction.handleRemoveShareGroup}
                handleCreateShareGroup={interaction.handleCreateShareGroup}
                assigningGroup={interaction.assigningGroup}
                creatingGroup={interaction.creatingGroup}
                validationDrawerVisible={interaction.validationDrawerVisible}
                setValidationDrawerVisible={interaction.setValidationDrawerVisible}
                handleValidateConstraints={interaction.handleValidateConstraints}
                validationLoading={interaction.validationLoading}
                validationResult={interaction.validationResult}
                handleConflictHighlight={interaction.handleConflictHighlight}
                clearActiveHighlight={interaction.clearActiveHighlight}
                operationModalVisible={interaction.operationModalVisible}
                setOperationModalVisible={interaction.setOperationModalVisible}
                operationForm={interaction.operationForm}
                handleOperationSubmit={interaction.handleOperationSubmit}
                operationSubmitting={interaction.operationSubmitting}
                templateId={template.id} // [New] Pass templateId
                loadShareGroups={interaction.loadShareGroups}
                onResourceRulesChanged={refreshData}
            />

            {/* 共享组管理抽屉 */}
            <Drawer
                title="共享组管理"
                placement="right"
                width={400}
                open={shareGroupPanelVisible}
                onClose={() => setShareGroupPanelVisible(false)}
                styles={{ body: { padding: 0 } }}
            >
                <ShareGroupPanel
                    templateId={template.id}
                    onGroupChange={() => {
                        interaction.loadShareGroups();
                    }}
                    operations={flattenedRows
                        .filter(row => row.node.type === 'operation' && row.node.data)
                        .map(row => {
                            const op = row.node.data as StageOperation;
                            return {
                                scheduleId: op.id,
                                operationName: op.operation_name,
                                stageName: row.node.title,
                                requiredPeople: op.required_people || 1
                            };
                        })
                    }
                />
            </Drawer>

            <style>{`
        .gantt-scroll-container::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .gantt-scroll-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .gantt-scroll-container::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
          transition: background 0.2s ease;
        }
        .gantt-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .gantt-scroll-container::-webkit-scrollbar-corner {
          background: #E5E7EB;
        }
      `}</style>
        </div>
    );
};

export default ProcessTemplateGantt;
