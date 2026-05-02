/**
 * WxbGanttChart v2 — Main Component
 * Assembles: Toolbar + Sidebar + Canvas + Tooltip + Minimap
 */
import React, { useRef, useMemo, useCallback, useState } from 'react';
import type { WxbGanttChartProps, GanttTask } from './types';
import { useGanttStore } from './useGanttStore';
import { useGanttLayout } from './useGanttLayout';
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH, SIDEBAR_WIDTH } from './constants';
import GanttToolbar from './GanttToolbar';
import GanttSidebar from './GanttSidebar';
import GanttCanvas from './GanttCanvas';
import GanttTooltip from './GanttTooltip';
import GanttMinimap from './GanttMinimap';
import GanttContextMenu, { DEFAULT_TASK_MENU_ITEMS, DEFAULT_BG_MENU_ITEMS } from './GanttContextMenu';
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

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean; x: number; y: number; task: GanttTask | null;
  }>({ visible: false, x: 0, y: 0, task: null });

  const handleContextMenu = useCallback((task: GanttTask | null, x: number, y: number) => {
    setCtxMenu({ visible: true, x, y, task });
  }, []);

  const handleCtxClose = useCallback(() => {
    setCtxMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const handleCtxAction = useCallback((key: string, task: GanttTask | null) => {
    // Built-in view actions
    if (key === 'expand-all') {
      dispatch({ type: 'EXPAND_ALL' });
    } else if (key === 'collapse-all') {
      const groupIds = groups.map(g => g.id);
      dispatch({ type: 'COLLAPSE_ALL', groupIds });
    }
    // Route to business callbacks
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
  }, [dispatch, groups, onTaskEdit, onTaskDelete, onTaskDuplicate, onContextAction]);

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
          onTooltipShow={handleTooltipShow}
          onTooltipHide={handleTooltipHide}
          onContextMenu={handleContextMenu}
        />

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
        items={ctxMenu.task ? DEFAULT_TASK_MENU_ITEMS : DEFAULT_BG_MENU_ITEMS}
        onAction={handleCtxAction}
        onClose={handleCtxClose}
      />
    </div>
  );
};

export default WxbGanttChart;
