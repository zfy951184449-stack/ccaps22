/**
 * WxbGanttChart v2.1 — Main Component
 * Assembles: Toolbar + Sidebar + Canvas + Tooltip + Minimap + ContextMenu + SelectionPanel
 */
import React, { useRef, useMemo, useCallback, useState } from 'react';
import type { WxbGanttChartProps, GanttTask } from './types';
import type { UndoToastData } from './useGanttDrag';
import { useGanttStore } from './useGanttStore';
import { useGanttLayout } from './useGanttLayout';
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH, SIDEBAR_WIDTH } from './constants';
import GanttToolbar from './GanttToolbar';
import GanttSidebar from './GanttSidebar';
import GanttCanvas from './GanttCanvas';
import GanttTooltip from './GanttTooltip';
import GanttMinimap from './GanttMinimap';
import GanttContextMenu, {
  DEFAULT_TASK_MENU_ITEMS,
  DEFAULT_GROUP_MENU_ITEMS,
  DEFAULT_BG_MENU_ITEMS,
} from './GanttContextMenu';
import GanttSelectionPanel from './GanttSelectionPanel';
import './GanttChart.css';

const WxbGanttChart: React.FC<WxbGanttChartProps> = ({
  tasks,
  groups = [],
  dependencies = [],
  links = [],
  timeRange,
  timeUnit = 'day',
  rowHeight = 32,
  sidebarWidth = SIDEBAR_WIDTH,
  showGrid = true,
  showToday = true,
  showProgress = true,
  showHeatmap = false,
  showMinimap = false,
  enableFullscreen = false,
  readOnly = false,
  initialDayWidth = DEFAULT_DAY_WIDTH,
  zoomRange = [MIN_DAY_WIDTH, MAX_DAY_WIDTH],
  personnelPeaks,
  onTaskClick,
  onTaskDoubleClick,
  onTaskDragEnd,
  onGroupToggle,
  onViewModeChange,
  // Business callbacks
  onTaskEdit,
  onTaskDelete,
  onTaskDuplicate,
  onContextAction,
  onGroupDragEnd,
  onUndoCascade,
  // Menu customization
  taskMenuItems,
  groupMenuItems,
  backgroundMenuItems,
  showSelectionPanel = true,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, stateRef } = useGanttStore(initialDayWidth);

  // Compute time range
  const { startHour, endHour } = useMemo(() => {
    if (timeRange) return { startHour: timeRange.start, endHour: timeRange.end };
    if (tasks.length === 0) return { startHour: 0, endHour: 240 };
    let min = Infinity, max = -Infinity;
    for (const t of tasks) {
      if (t.start < min) min = t.start;
      if (t.end > max) max = t.end;
      if (t.windowStart !== undefined && t.windowStart < min) min = t.windowStart;
      if (t.windowEnd !== undefined && t.windowEnd > max) max = t.windowEnd;
    }
    // Add padding: 1 day on each side
    return { startHour: Math.floor(min / 24) * 24 - 24, endHour: Math.ceil(max / 24) * 24 + 24 };
  }, [tasks, timeRange]);

  // Layout
  const { flatRows, taskRowMap } = useGanttLayout(tasks, groups, state.collapsedGroups);

  // Tooltip state
  const [tooltipState, setTooltipState] = useState<{
    task: GanttTask | null; x: number; y: number; visible: boolean
  }>({ task: null, x: 0, y: 0, visible: false });

  const handleTooltipShow = useCallback((task: GanttTask, x: number, y: number) => {
    setTooltipState({ task, x, y, visible: true });
  }, []);
  const handleTooltipHide = useCallback(() => {
    setTooltipState(prev => ({ ...prev, visible: false }));
  }, []);

  // Undo toast state (forwarded from GanttCanvas drag system)
  const [undoToast, setUndoToast] = useState<UndoToastData | null>(null);
  const handleUndoToast = useCallback((data: { message: string; onUndo: () => void } | null) => {
    setUndoToast(data);
  }, []);

  // ===== Context Menu State =====
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    task: GanttTask | null;
    contextType: 'task' | 'group' | 'background';
    groupId?: string;
  }>({ visible: false, x: 0, y: 0, task: null, contextType: 'background' });

  const handleContextMenu = useCallback((
    task: GanttTask | null,
    x: number,
    y: number,
    hitType?: 'task' | 'group',
    groupId?: string
  ) => {
    let contextType: 'task' | 'group' | 'background';
    if (hitType === 'group') contextType = 'group';
    else if (task) contextType = 'task';
    else contextType = 'background';

    setCtxMenu({ visible: true, x, y, task, contextType, groupId });
  }, []);

  const handleCtxClose = useCallback(() => {
    setCtxMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Dynamic menu items based on context
  const activeMenuItems = useMemo(() => {
    if (ctxMenu.contextType === 'group') return groupMenuItems || DEFAULT_GROUP_MENU_ITEMS;
    if (ctxMenu.contextType === 'background') return backgroundMenuItems || DEFAULT_BG_MENU_ITEMS;
    return taskMenuItems || DEFAULT_TASK_MENU_ITEMS;
  }, [ctxMenu.contextType, taskMenuItems, groupMenuItems, backgroundMenuItems]);

  // Helper: collect all descendant group IDs (recursive) for a given root groupId
  const collectDescendantGroupIds = useCallback((rootId: string): Set<string> => {
    const result = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const g of groups) {
        if (g.parentId === current && !result.has(g.id)) {
          result.add(g.id);
          queue.push(g.id);
        }
      }
    }
    return result;
  }, [groups]);

  const handleCtxAction = useCallback((key: string, task: GanttTask | null) => {
    // ===== Built-in view actions =====
    if (key === 'expand-all') {
      dispatch({ type: 'EXPAND_ALL' });
    } else if (key === 'expand-group' && ctxMenu.groupId) {
      // Expand only this group and its descendants (not global)
      const descendantIds = collectDescendantGroupIds(ctxMenu.groupId);
      for (const gid of Array.from(descendantIds)) {
        dispatch({ type: 'TOGGLE_GROUP', groupId: gid });
      }
    } else if (key === 'collapse-all') {
      const groupIds = groups.map(g => g.id);
      dispatch({ type: 'COLLAPSE_ALL', groupIds });
    } else if (key === 'collapse-group' && ctxMenu.groupId) {
      const descendantIds = collectDescendantGroupIds(ctxMenu.groupId);
      dispatch({ type: 'COLLAPSE_ALL', groupIds: Array.from(descendantIds) });
    }
    // ===== Selection actions =====
    else if (key === 'select-all') {
      const allTaskIds = tasks.filter(t => !t.readOnly).map(t => t.id);
      dispatch({ type: 'SELECT_ALL', taskIds: allTaskIds });
    } else if (key === 'select-children' && ctxMenu.groupId) {
      // Recursively collect all tasks under this group and its descendants
      const descendantIds = collectDescendantGroupIds(ctxMenu.groupId);
      const childTaskIds = tasks.filter(t => t.groupId && descendantIds.has(t.groupId)).map(t => t.id);
      dispatch({ type: 'SELECT_ALL', taskIds: childTaskIds });
    } else if (key === 'clear-selection' || key === 'deselect-children') {
      dispatch({ type: 'SELECT_CLEAR' });
    }
    // ===== Route to business callbacks =====
    else if (key === 'edit' && task && onTaskEdit) {
      onTaskEdit(task);
    } else if (key === 'delete' && task && onTaskDelete) {
      onTaskDelete(task);
    } else if (key === 'duplicate' && task && onTaskDuplicate) {
      onTaskDuplicate(task);
    }
    // Catch-all: forward to consumer's generic handler
    if (onContextAction) {
      onContextAction(key, task);
    }
  }, [dispatch, groups, tasks, ctxMenu.groupId, collectDescendantGroupIds, onTaskEdit, onTaskDelete, onTaskDuplicate, onContextAction]);

  // ===== Selection Panel Handlers =====
  const handleDeselectTask = useCallback((taskId: string) => {
    dispatch({ type: 'SELECT_REMOVE', taskId });
  }, [dispatch]);

  const handleDeselectAll = useCallback(() => {
    dispatch({ type: 'SELECT_CLEAR' });
  }, [dispatch]);

  const handleSelectAllInGroup = useCallback((groupId: string) => {
    // Recursively select all tasks under this group and descendants
    const descendantIds = collectDescendantGroupIds(groupId);
    const childTaskIds = tasks.filter(t => t.groupId && descendantIds.has(t.groupId)).map(t => t.id);
    dispatch({ type: 'SELECT_ALL', taskIds: childTaskIds });
  }, [tasks, dispatch, collectDescendantGroupIds]);

  // Minimap: current viewport day + active tasks
  const currentDay = useMemo(() => {
    const hourWidth = state.dayWidth / 24;
    const centerHour = startHour + (state.scrollX + state.canvasW / 2) / hourWidth;
    return Math.floor(centerHour / 24);
  }, [state.scrollX, state.canvasW, state.dayWidth, startHour]);

  const activeMiniTasks = useMemo(() => {
    const dayStart = currentDay * 24;
    const dayEnd = dayStart + 24;
    return tasks
      .filter(t => t.type !== 'timeWindow' && t.type !== 'stage' && t.end > dayStart && t.start < dayEnd)
      .slice(0, 8)
      .map(t => ({ id: t.id, label: t.label }));
  }, [currentDay, tasks]);

  // ESC handler for expanded day
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.expandedDay !== null) {
        dispatch({ type: 'EXPAND_DAY', day: null });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.expandedDay, dispatch]);

  return (
    <div
      ref={containerRef}
      className={`wxb-gantt-chart ${className || ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        borderRadius: 8,
        border: '1px solid var(--wx-border, #E4EAF1)',
        background: 'var(--wx-bg, #fff)',
        ...style,
      }}
    >
      {/* Toolbar */}
      <GanttToolbar
        dayWidth={state.dayWidth}
        viewMode={state.viewMode}
        dispatch={dispatch}
        enableFullscreen={enableFullscreen}
        containerRef={containerRef}
        onViewModeChange={onViewModeChange}
      />

      {/* Body: Sidebar + Canvas */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GanttSidebar
          flatRows={flatRows}
          scrollY={state.scrollY}
          hoveredRow={state.hoveredRow}
          canvasH={state.canvasH}
          showHeatmap={showHeatmap}
          dispatch={dispatch}
          sidebarWidth={sidebarWidth}
          selectedTaskIds={state.selectedTaskIds}
          onGroupToggle={onGroupToggle}
        />

        <GanttCanvas
          tasks={tasks}
          groups={groups}
          flatRows={flatRows}
          taskRowMap={taskRowMap}
          dependencies={dependencies}
          links={links}
          state={state}
          stateRef={stateRef}
          dispatch={dispatch}
          startHour={startHour}
          endHour={endHour}
          showGrid={showGrid}
          showToday={showToday}
          showProgress={showProgress}
          showHeatmap={showHeatmap}
          readOnly={readOnly}
          zoomRange={zoomRange}
          personnelPeaks={personnelPeaks}
          onTaskClick={onTaskClick}
          onTaskDoubleClick={onTaskDoubleClick}
          onTaskDragEnd={onTaskDragEnd}
          onGroupDragEnd={onGroupDragEnd}
          onTooltipShow={handleTooltipShow}
          onTooltipHide={handleTooltipHide}
          onContextMenu={handleContextMenu}
          onUndoToast={handleUndoToast}
        />

        {/* Selection Panel (cart-style) */}
        {showSelectionPanel && state.selectedTaskIds.size > 0 && (
          <GanttSelectionPanel
            selectedTaskIds={state.selectedTaskIds}
            tasks={tasks}
            groups={groups}
            onDeselectTask={handleDeselectTask}
            onDeselectAll={handleDeselectAll}
            onSelectAllInGroup={handleSelectAllInGroup}
          />
        )}

        {/* Minimap */}
        {showMinimap && (
          <GanttMinimap
            visible={showMinimap}
            currentDay={currentDay}
            activeTasks={activeMiniTasks}
          />
        )}
      </div>

      {/* Tooltip overlay */}
      <GanttTooltip
        task={tooltipState.task}
        x={tooltipState.x}
        y={tooltipState.y}
        visible={tooltipState.visible}
      />

      {/* Context menu overlay */}
      <GanttContextMenu
        visible={ctxMenu.visible}
        x={ctxMenu.x}
        y={ctxMenu.y}
        task={ctxMenu.task}
        items={activeMenuItems}
        selectedCount={state.selectedTaskIds.size}
        contextType={ctxMenu.contextType}
        onAction={handleCtxAction}
        onClose={handleCtxClose}
      />

      {/* Undo Toast — 3-second popup for cascade drag */}
      {undoToast && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          background: 'rgba(15, 27, 45, 0.92)',
          color: '#fff',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 100,
          backdropFilter: 'blur(8px)',
          animation: 'fadeInUp 0.2s ease-out',
        }}>
          <span>{undoToast.message}</span>
          <button
            onClick={() => {
              undoToast.onUndo();
              setUndoToast(null);
            }}
            style={{
              padding: '4px 12px',
              background: 'rgba(31, 111, 235, 0.9)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            撤销
          </button>
        </div>
      )}
    </div>
  );
};

export default WxbGanttChart;
