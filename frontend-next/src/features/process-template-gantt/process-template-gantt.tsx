/* ── ProcessTemplateGantt ─────────────────────────────────────────
 *
 * Main orchestrator component. Composes all hooks and sub-components.
 * Supports template mode (API-driven) and batch mode (external data).
 */

"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import type { ProcessTemplateGanttProps, GanttNode } from "./types";
import { GANTT_LAYOUT, STAGE_COLORS } from "./types";
import { collectAllExpandableKeys, findNodeById } from "./utils";
import styles from "./gantt.module.css";

import { useGanttData } from "./hooks/use-gantt-data";
import { useGanttViewport } from "./hooks/use-gantt-viewport";
import { useGanttDrag } from "./hooks/use-gantt-drag";
import { useGanttInteraction } from "./hooks/use-gantt-interaction";
import { usePeakPersonnel } from "./hooks/use-peak-personnel";
import { useFilteredRows } from "./hooks/use-filtered-rows";

import { GanttHeader } from "./components/gantt-header";
import { GanttSidebar } from "./components/gantt-sidebar";
import { GanttAxis } from "./components/gantt-axis";
import { GanttTimeline } from "./components/gantt-timeline";
import { GanttBars } from "./components/gantt-bars";
import { ConstraintLayer } from "./components/constraint-layer";
import { ShareLinkLayer } from "./components/share-link-layer";
import {
  StageEditSheet,
  OperationEditSheet,
  OperationAddSheet,
  ValidationDrawer,
  ShareGroupPanel,
} from "./components/gantt-modals";

export function ProcessTemplateGantt({
  mode,
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
  externalShareGroups,
}: ProcessTemplateGanttProps) {
  // ── Data ──
  const ganttData = useGanttData({ mode, template, externalData });
  const {
    stages,
    ganttNodes,
    setGanttNodes,
    timeBlocks,
    expandedKeys,
    setExpandedKeys,
    refreshData,
    availableOperations,
    isExternalMode,
    isLoading,
    isError,
    error,
    constraints: dataConstraints,
    shareGroups: dataShareGroups,
  } = ganttData;

  const effectiveConstraints = externalConstraints ?? dataConstraints;
  const effectiveShareGroups = externalShareGroups ?? dataShareGroups;

  // ── Viewport ──
  const viewport = useGanttViewport(ganttNodes, expandedKeys, timeBlocks);
  const {
    flattenedRows,
    virtualRows,
    totalHeight,
    handleGanttScroll,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    zoomScale,
    hourWidth,
    headerWidth,
    startDay,
    endDay,
    rowIndexMap,
    operationBlockMap,
    handleGanttMouseDown,
    nodeMap,
  } = viewport;

  // ── Interaction ──
  const interaction = useGanttInteraction(
    template.id,
    ganttNodes,
    flattenedRows,
    refreshData,
    availableOperations,
    expandedKeys,
    setExpandedKeys,
    effectiveConstraints,
    effectiveShareGroups,
  );

  // ── Drag ──
  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setGanttNodes((prev) => {
        const clone = JSON.parse(JSON.stringify(prev)) as GanttNode[];
        const node = findNodeById(clone, nodeId);
        if (node) {
          if (updates.operationDay !== undefined) node.startDay = updates.operationDay as number;
          if (updates.recommendedTime !== undefined) node.startHour = updates.recommendedTime as number;
        }
        return clone;
      });
    },
    [setGanttNodes],
  );

  const dragEndHandler = useCallback(
    async (
      scheduleId: number,
      stageId: number,
      updates: Partial<{
        operationDay: number;
        recommendedTime: number;
        windowStartTime: number;
        windowStartDayOffset: number;
        windowEndTime: number;
        windowEndDayOffset: number;
      }>,
    ) => {
      if (onCustomDragEnd) {
        await onCustomDragEnd(scheduleId, stageId, updates);
      } else {
        await interaction.handleOperationDragEnd(scheduleId, stageId, updates);
      }
      await refreshData();
    },
    [onCustomDragEnd, interaction, refreshData],
  );

  const { handleDragStart } = useGanttDrag({
    hourWidth,
    startDay,
    endDay,
    onDragEnd: dragEndHandler,
    onNodeUpdate: handleNodeUpdate,
  });

  // ── Peak personnel ──
  const dailyPeaks = usePeakPersonnel({
    timeBlocks,
    ganttNodes,
    startDay,
    endDay,
    constraints: effectiveConstraints,
    shareGroups: effectiveShareGroups,
  });

  // ── Day expansion ──
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const originalStartDay = startDay;
  const originalEndDay = endDay;

  const handleDayDoubleClick = useCallback(
    (day: number) => {
      if (expandedDay === day) {
        setExpandedDay(null);
      } else {
        setExpandedDay(day);
        // Auto-expand all stages when entering day mode
        const allKeys = collectAllExpandableKeys(ganttNodes);
        setExpandedKeys(allKeys);
      }
    },
    [expandedDay, ganttNodes, setExpandedKeys],
  );

  const { filteredRows, filteredRowIndexMap } = useFilteredRows(
    virtualRows,
    expandedDay,
    timeBlocks,
  );

  const activeRows = expandedDay !== null ? filteredRows : virtualRows;
  const activeRowIndexMap = expandedDay !== null ? filteredRowIndexMap : rowIndexMap;
  const activeTotalHeight = activeRows.length * GANTT_LAYOUT.rowHeight;

  // ── Stage color map ──
  const stageColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const stage of stages) {
      map.set(stage.id, STAGE_COLORS[stage.stageCode] ?? STAGE_COLORS.DEFAULT);
    }
    return map;
  }, [stages]);

  // ── Share group selection mode ──
  const [isShareGroupMode, setIsShareGroupMode] = useState(false);
  const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>([]);

  const handleOperationCheck = useCallback(
    (opId: string, checked: boolean) => {
      setSelectedOperationIds((prev) =>
        checked ? [...prev, opId] : prev.filter((id) => id !== opId),
      );
    },
    [],
  );

  const handleConfirmShareGroup = useCallback(async () => {
    const memberScheduleIds = selectedOperationIds.map((id) =>
      parseInt(id.replace("operation_", "")),
    );
    await interaction.handleCreateShareGroup({
      groupName: `共享组 ${(interaction.shareGroups?.length ?? 0) + 1}`,
      shareMode: "SAME_TEAM",
      memberIds: memberScheduleIds,
    });
    setIsShareGroupMode(false);
    setSelectedOperationIds([]);
  }, [selectedOperationIds, interaction]);

  // ── Share group panel ──
  const [shareGroupPanelOpen, setShareGroupPanelOpen] = useState(false);

  // ── Scroll sync ──
  const sidebarRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleTimelineScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (sidebarRef.current) sidebarRef.current.scrollTop = el.scrollTop;
      if (axisRef.current) axisRef.current.scrollLeft = el.scrollLeft;
      handleGanttScroll(e);
    },
    [handleGanttScroll],
  );

  // ── Toggle expand ──
  const handleToggleExpand = useCallback(
    (row: { id: string }) => {
      setExpandedKeys((prev) =>
        prev.includes(row.id)
          ? prev.filter((k) => k !== row.id)
          : [...prev, row.id],
      );
    },
    [setExpandedKeys],
  );

  // ── Selected node ──
  const [selectedNode, setSelectedNode] = useState<GanttNode | null>(null);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--pl-surface)]">
        <div className="text-sm text-[var(--pl-text-tertiary)]">加载甘特图数据…</div>
      </div>
    );
  }

  // ── Error Boundary ──
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--pl-surface)]">
        <div className="rounded-md border border-[var(--pl-danger)] px-6 py-4 text-center bg-white shadow-sm">
          <h3 className="mb-2 font-medium text-[var(--pl-danger)]">加载甘特图数据失败</h3>
          <p className="text-xs text-[var(--pl-text-secondary)]">
            请检查操作接口和约束字典的契约定义，或者网络连接是否正常。
          </p>
          {error instanceof Error && (
            <p className="mt-2 font-mono text-[10px] text-[var(--pl-text-tertiary)]">
              {error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-[var(--pl-danger)] px-4 py-1.5 text-[13px] text-white hover:bg-opacity-90 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ── Determine effective isDirty / save ──
  const effectiveDirty = externalIsDirty ?? interaction.isDirty;
  const effectiveSave = onExternalSave ?? interaction.handleSaveTemplate;

  return (
    <div className={styles.ganttRoot}>
      {/* Header toolbar */}
      <GanttHeader
        template={template}
        onBack={onBack}
        zoomScale={zoomScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        isDirty={effectiveDirty}
        onSave={effectiveSave}
        onAutoSchedule={interaction.handleAutoSchedule}
        scheduling={interaction.scheduling}
        onToggleSharePanel={() => setShareGroupPanelOpen((v) => !v)}
        shareGroupCount={effectiveShareGroups.length}
        isShareGroupMode={isShareGroupMode}
        selectedOperationCount={selectedOperationIds.length}
        onEnterShareGroupMode={() => setIsShareGroupMode(true)}
        onConfirmShareGroup={handleConfirmShareGroup}
        onCancelShareGroup={() => {
          setIsShareGroupMode(false);
          setSelectedOperationIds([]);
        }}
        onValidate={interaction.handleValidateConstraints}
        readOnly={readOnly}
      />

      {/* Body: sidebar + canvas */}
      <div className={styles.ganttBody}>
        {/* Sidebar */}
        <div className={styles.sidebarContainer} ref={sidebarRef}>
          <GanttSidebar
            virtualRows={activeRows}
            totalHeight={activeTotalHeight}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            onToggleExpand={handleToggleExpand}
            onAddNode={interaction.handleCreateNode}
            onEditNode={interaction.handleEditNode}
            onDeleteNode={interaction.handleDeleteNode}
            stageColorMap={stageColorMap}
            onHoverRow={interaction.setHoveredRow}
            isShareGroupMode={isShareGroupMode}
            selectedOperationIds={selectedOperationIds}
            onOperationCheck={handleOperationCheck}
            readOnly={readOnly}
          />
        </div>

        {/* Canvas */}
        <div className={styles.canvasContainer}>
          {/* Axis */}
          <div className={styles.axisRow}>
            <div className={styles.axisScroll} ref={axisRef}>
              <GanttAxis
                startDay={startDay}
                endDay={endDay}
                hourWidth={hourWidth}
                expandedDay={expandedDay}
                originalStartDay={originalStartDay}
                originalEndDay={originalEndDay}
                onDayDoubleClick={handleDayDoubleClick}
                onCollapseDay={() => setExpandedDay(null)}
                onPrevDay={() =>
                  setExpandedDay((d) =>
                    d !== null ? Math.max(originalStartDay, d - 1) : null,
                  )
                }
                onNextDay={() =>
                  setExpandedDay((d) =>
                    d !== null ? Math.min(originalEndDay, d + 1) : null,
                  )
                }
                dailyPeaks={dailyPeaks}
              />
            </div>
          </div>

          {/* Timeline + bars + overlays */}
          <div
            className={styles.timelineScroll}
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            onMouseDown={handleGanttMouseDown}
          >
            <div
              className="relative"
              style={{
                width: headerWidth,
                height: Math.max(activeTotalHeight, 400),
              }}
            >
              <GanttTimeline
                startDay={startDay}
                endDay={endDay}
                hourWidth={hourWidth}
                totalHeight={activeTotalHeight}
                virtualRows={activeRows}
                stageColorMap={stageColorMap}
                onHoverRow={interaction.setHoveredRow}
              />

              <GanttBars
                virtualRows={activeRows}
                timeBlocks={timeBlocks}
                hourWidth={hourWidth}
                startDay={startDay}
                rowIndexMap={activeRowIndexMap}
                onDragStart={handleDragStart}
                onNodeDoubleClick={interaction.handleEditNode}
                readOnly={readOnly}
                readOnlyOperations={readOnlyOperations}
                activeHighlightOps={interaction.activeHighlight.operations}
                hoveredRow={interaction.hoveredRow}
                nodeMap={nodeMap}
              />

              <ConstraintLayer
                constraints={effectiveConstraints}
                timeBlocks={timeBlocks}
                hourWidth={hourWidth}
                startDay={startDay}
                rowIndexMap={activeRowIndexMap}
                totalWidth={headerWidth}
                totalHeight={activeTotalHeight}
                activeHighlightConstraints={
                  interaction.activeHighlight.constraints
                }
              />

              <ShareLinkLayer
                shareGroups={effectiveShareGroups}
                timeBlocks={timeBlocks}
                hourWidth={hourWidth}
                startDay={startDay}
                rowIndexMap={activeRowIndexMap}
                totalWidth={headerWidth}
                totalHeight={activeTotalHeight}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {interaction.editingNode?.type === "stage" && (
        <StageEditSheet
          open={interaction.editModalVisible}
          onClose={() => interaction.setEditModalVisible(false)}
          node={interaction.editingNode}
          onSave={interaction.handleSaveNode}
        />
      )}

      {interaction.editingNode?.type === "operation" && (
        <OperationEditSheet
          open={interaction.editModalVisible}
          onClose={() => interaction.setEditModalVisible(false)}
          node={interaction.editingNode}
          onSave={interaction.handleSaveNode}
        />
      )}

      <OperationAddSheet
        open={interaction.operationModalVisible}
        onClose={() => interaction.setOperationModalVisible(false)}
        availableOperations={availableOperations}
        onSubmit={interaction.handleOperationSubmit}
        submitting={interaction.operationSubmitting}
      />

      <ValidationDrawer
        open={interaction.validationDrawerVisible}
        onClose={() => {
          interaction.setValidationDrawerVisible(false);
          interaction.clearActiveHighlight();
        }}
        result={interaction.validationResult}
        loading={interaction.validationLoading}
        onHighlight={interaction.handleConflictHighlight}
      />

      <ShareGroupPanel
        open={shareGroupPanelOpen}
        onClose={() => setShareGroupPanelOpen(false)}
        shareGroups={effectiveShareGroups}
        onDelete={(groupId) => {
          /* handled via loadShareGroups after delete */
        }}
      />
    </div>
  );
}
