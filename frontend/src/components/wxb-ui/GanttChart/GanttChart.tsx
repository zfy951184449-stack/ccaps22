/**
 * WxbGanttChart v2.1 — Main Component
 * Assembles: Toolbar + Sidebar + Canvas + Tooltip + Minimap + ContextMenu + SelectionPanel
 */
import React, { useRef, useMemo, useCallback, useState } from 'react';
import type { WxbGanttChartProps, GanttTask, GanttContextActionContext } from './types';
import type { UndoToastData } from './useGanttDrag';
import { useGanttStore } from './useGanttStore';
import { useGanttLayout } from './useGanttLayout';
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH, SIDEBAR_WIDTH } from './constants';
import GanttToolbar from './GanttToolbar';
import GanttSidebar from './GanttSidebar';
import GanttCanvas from './GanttCanvas';
import GanttTooltip from './GanttTooltip';
import type { GanttAvoidRect } from './GanttTooltip';
import GanttMinimap from './GanttMinimap';
import GanttContextMenu, {
  DEFAULT_TASK_MENU_ITEMS,
  DEFAULT_GROUP_MENU_ITEMS,
  DEFAULT_BG_MENU_ITEMS,
} from './GanttContextMenu';
import GanttSelectionPanel from './GanttSelectionPanel';
import GanttSharePanel from './GanttSharePanel';
import type { ShareHoverTask } from './GanttSharePanel';
import type { GanttLink } from './types';
import { THEME } from './constants';
import './GanttChart.css';

// Shared-operation body colors are derived from WXB tokens. Red is intentionally
// excluded because it is reserved for conflict/error states in the Gantt.
const SHARE_COMPONENT_TOKENS: Array<[string, string]> = [
  ['--wx-blue-500', THEME.blue500],
  ['--wx-green-500', THEME.green500],
  ['--wx-amber-500', THEME.amber500],
  ['--wx-blue-700', THEME.primary],
  ['--wx-blue-400', THEME.blue400],
  ['--wx-green-300', THEME.green300],
  ['--wx-fg-3', THEME.fg3],
  ['--wx-blue-300', THEME.blue300],
  ['--wx-green-700', THEME.green500],
  ['--wx-amber-700', THEME.amber500],
  ['--wx-blue-600', THEME.blue500],
  ['--wx-fg-4', THEME.fg4],
];

function readWxbToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function mixHexColor(a: string, b: string, bWeight: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const weight = Math.max(0, Math.min(1, bWeight));
  const mix = (start: number, end: number) => Math.round(start * (1 - weight) + end * weight);
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  return `#${mix(ar, br).toString(16).padStart(2, '0')}${mix(ag, bg).toString(16).padStart(2, '0')}${mix(ab, bb).toString(16).padStart(2, '0')}`;
}

function getShareComponentColor(index: number): string {
  const [token, fallback] = SHARE_COMPONENT_TOKENS[index % SHARE_COMPONENT_TOKENS.length];
  const color = readWxbToken(token, fallback);
  const round = Math.floor(index / SHARE_COMPONENT_TOKENS.length);
  if (round === 0) return color;

  // Rare overflow path: keep colors WXB-derived by nudging the same token
  // toward ink instead of introducing unrelated hues.
  const weight = Math.min(0.24, round * 0.08);
  return mixHexColor(color, THEME.ink, weight);
}

function getCoveredDays(start: number, end: number): number[] {
  const startDay = Math.floor(start / 24);
  const endDay = Math.max(startDay, Math.ceil(end / 24) - 1);
  const days: number[] = [];
  for (let day = startDay; day <= endDay; day++) days.push(day);
  return days;
}

/** Union-Find to compute transitive closure of share group links */
function buildShareColorMap(
  links: GanttLink[],
  tasks: GanttTask[]
): Map<string, { peers: Set<string>; color: string }> {
  if (!links || links.length === 0) return new Map();

  // Union-Find
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const link of links) {
    if (link.taskIds.length < 2) continue;
    for (let i = 1; i < link.taskIds.length; i++) {
      union(link.taskIds[0], link.taskIds[i]);
    }
  }

  const taskMap = new Map(tasks.map(task => [task.id, task]));

  // Build components with task timing, so colors only need to be unique locally by day.
  const components = new Map<string, {
    root: string;
    members: Set<string>;
    minStart: number;
    maxEnd: number;
    days: number[];
  }>();
  Array.from(parent.keys()).forEach(id => {
    const task = taskMap.get(id);
    if (!task) return;
    const root = find(id);
    if (!components.has(root)) {
      components.set(root, {
        root,
        members: new Set(),
        minStart: task.start,
        maxEnd: task.end,
        days: [],
      });
    }
    const component = components.get(root)!;
    component.members.add(id);
    component.minStart = Math.min(component.minStart, task.start);
    component.maxEnd = Math.max(component.maxEnd, task.end);
  });

  const orderedComponents = Array.from(components.values())
    .filter(component => component.members.size >= 2)
    .map(component => ({
      ...component,
      days: getCoveredDays(component.minStart, component.maxEnd),
    }))
    .sort((a, b) => a.minStart - b.minStart || a.root.localeCompare(b.root));

  const usedColorByDay = new Map<number, Set<number>>();

  // Assign day-local unique colors and build result
  const result = new Map<string, { peers: Set<string>; color: string }>();
  orderedComponents.forEach(component => {
    let colorIndex = 0;
    while (true) {
      let colorUsed = false;
      for (const day of component.days) {
        if (usedColorByDay.get(day)?.has(colorIndex)) {
          colorUsed = true;
          break;
        }
      }
      if (!colorUsed) break;
      colorIndex += 1;
    }

    component.days.forEach(day => {
      if (!usedColorByDay.has(day)) usedColorByDay.set(day, new Set());
      usedColorByDay.get(day)!.add(colorIndex);
    });

    const color = getShareComponentColor(colorIndex);
    Array.from(component.members).forEach(id => {
      result.set(id, { peers: component.members, color });
    });
  });
  return result;
}

const WxbGanttChart: React.FC<WxbGanttChartProps> = ({
  tasks,
  groups = [],
  dependencies = [],
  links = [],
  timeRange,
  timelineOriginDate,
  timeUnit = 'day',
  rowHeight = 32,
  sidebarWidth = SIDEBAR_WIDTH,
  showGrid = true,
  showToday = true,
  showProgress = true,
  showHeatmap = false,
  showMinimap = false,
  collapseEmptyNightShifts = false,
  enableFullscreen = false,
  readOnly = false,
  clampDragToWindow = true,
  initialDayWidth = DEFAULT_DAY_WIDTH,
  zoomRange = [MIN_DAY_WIDTH, MAX_DAY_WIDTH],
  personnelPeaks,
  onTaskClick,
  onTaskDoubleClick,
  onTaskDragEnd,
  onTaskResizeEnd,
  onGroupToggle,
  onViewModeChange,
  // Business callbacks
  onTaskEdit,
  onTaskDelete,
  onTasksDelete,
  onTaskDuplicate,
  onContextAction,
  onGroupDragEnd,
  onTasksDragEnd,
  onUndoCascade,
  // Menu customization
  taskMenuItems,
  taskMenuBuilder,
  groupMenuItems,
  backgroundMenuItems,
  showSelectionPanel = true,
  highlightedLinkIds,
  onCreateShareGroup,
  selectionPanelExtraActions,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, stateRef } = useGanttStore(initialDayWidth);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    task: GanttTask | null; x: number; y: number; visible: boolean; avoidRects: GanttAvoidRect[]
  }>({ task: null, x: 0, y: 0, visible: false, avoidRects: [] });

  const handleTooltipShow = useCallback((task: GanttTask, x: number, y: number, avoidRects: GanttAvoidRect[] = []) => {
    setTooltipState({ task, x, y, visible: true, avoidRects });
  }, []);
  const handleTooltipHide = useCallback(() => {
    setTooltipState(prev => ({ ...prev, visible: false }));
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (error) {
      // Keep toolbar responsive even when the browser denies Fullscreen API.
      setIsFullscreen(prev => !prev);
      setTimeout(() => dispatch({ type: 'MARK_DIRTY' }), 0);
    }
  }, [dispatch]);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
      setTimeout(() => dispatch({ type: 'MARK_DIRTY' }), 0);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [dispatch]);

  // Undo toast state (forwarded from GanttCanvas drag system)
  const [undoToast, setUndoToast] = useState<UndoToastData | null>(null);
  const handleUndoToast = useCallback((data: { message: string; onUndo: () => void } | null) => {
    setUndoToast(data);
  }, []);

  // ===== Share Color Map (Union-Find transitive closure) =====
  const shareColorMap = useMemo(() => buildShareColorMap(links, tasks), [links, tasks]);

  // Share hover panel state
  const [shareHoverState, setShareHoverState] = useState<{
    tasks: ShareHoverTask[];
    color: string;
  } | null>(null);

  const handleShareHover = useCallback((
    tasks: ShareHoverTask[] | null,
    color: string
  ) => {
    if (!tasks || tasks.length === 0) {
      setShareHoverState(null);
    } else {
      setShareHoverState({ tasks, color });
    }
  }, []);

  // Derive share highlight Set for sidebar cross-highlight
  const shareHighlightTaskIds = useMemo(() => {
    if (!shareHoverState) return undefined;
    return new Set(shareHoverState.tasks.map(t => t.id));
  }, [shareHoverState]);

  // ===== Context Menu State =====
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    task: GanttTask | null;
    contextType: 'task' | 'group' | 'background';
    groupId?: string;
    actionContext: GanttContextActionContext;
  }>({
    visible: false,
    x: 0,
    y: 0,
    task: null,
    contextType: 'background',
    actionContext: {
      contextType: 'background',
      x: 0,
      y: 0,
      canvasX: 0,
      canvasY: 0,
    },
  });

  const handleContextMenu = useCallback((
    task: GanttTask | null,
    x: number,
    y: number,
    hitType?: 'task' | 'group',
    groupId?: string,
    context?: GanttContextActionContext,
  ) => {
    let contextType: 'task' | 'group' | 'background';
    if (hitType === 'group') contextType = 'group';
    else if (task) contextType = 'task';
    else contextType = 'background';

    setCtxMenu({
      visible: true,
      x,
      y,
      task,
      contextType,
      groupId,
      actionContext: context ?? {
        contextType,
        groupId,
        x,
        y,
        canvasX: x,
        canvasY: y,
      },
    });
  }, []);

  const handleCtxClose = useCallback(() => {
    setCtxMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const collectDeletableTasks = useCallback((fallbackTask: GanttTask | null = null): GanttTask[] => {
    const selectedIds = stateRef.current.selectedTaskIds;
    const useSelection = selectedIds.size > 0 && (!fallbackTask || selectedIds.has(fallbackTask.id));
    const candidates = useSelection
      ? tasks.filter(task => selectedIds.has(task.id))
      : fallbackTask
        ? [fallbackTask]
        : [];
    const seen = new Set<string>();

    return candidates.filter(task => {
      if (task.readOnly || task.type === 'stage' || task.type === 'timeWindow') return false;
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }, [tasks, stateRef]);

  const requestTaskDeletion = useCallback((fallbackTask: GanttTask | null = null) => {
    if (readOnly) return;
    const targets = collectDeletableTasks(fallbackTask);
    if (targets.length === 0) return;

    if (onTasksDelete) {
      onTasksDelete(targets);
    } else if (targets.length === 1 && onTaskDelete) {
      onTaskDelete(targets[0]);
    }
  }, [readOnly, collectDeletableTasks, onTasksDelete, onTaskDelete]);

  // Dynamic menu items based on context
  const activeMenuItems = useMemo(() => {
    if (ctxMenu.contextType === 'group') return groupMenuItems || DEFAULT_GROUP_MENU_ITEMS;
    if (ctxMenu.contextType === 'background') return backgroundMenuItems || DEFAULT_BG_MENU_ITEMS;
    // Dynamic per-task menu builder takes priority
    if (taskMenuBuilder && ctxMenu.task) return taskMenuBuilder(ctxMenu.task);
    return taskMenuItems || DEFAULT_TASK_MENU_ITEMS;
  }, [ctxMenu.contextType, ctxMenu.task, taskMenuItems, taskMenuBuilder, groupMenuItems, backgroundMenuItems]);

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
    let handled = true;

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
    } else if (key === 'delete') {
      requestTaskDeletion(task);
    } else if (key === 'duplicate' && task && onTaskDuplicate) {
      onTaskDuplicate(task);
    } else {
      handled = false;
    }

    // Catch-all: forward to consumer's generic handler
    if (!handled && onContextAction) {
      onContextAction(key, task, ctxMenu.actionContext);
    }
  }, [dispatch, groups, tasks, ctxMenu.groupId, ctxMenu.actionContext, collectDescendantGroupIds, onTaskEdit, requestTaskDeletion, onTaskDuplicate, onContextAction]);

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

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditingText = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
      if (isEditingText || target?.closest('[role="dialog"], .wxb-modal, .ant-modal')) return;

      if (e.key === 'Escape' && state.expandedDay !== null) {
        dispatch({ type: 'EXPAND_DAY', day: null });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const targets = collectDeletableTasks();
        if (targets.length === 0) return;
        e.preventDefault();
        requestTaskDeletion();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.expandedDay, dispatch, collectDeletableTasks, requestTaskDeletion]);

  return (
    <div
      ref={containerRef}
      className={`wxb-gantt-chart ${isFullscreen ? 'wxb-gantt-chart-fullscreen' : ''} ${className || ''}`}
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
        isFullscreen={isFullscreen}
        onFullscreenToggle={handleFullscreenToggle}
        onViewModeChange={onViewModeChange}
      />

      {/* Body: Sidebar + Canvas */}
      <div className="wxb-gantt-body" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
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
          shareHighlightTaskIds={shareHighlightTaskIds}
          shareHighlightColor={shareHoverState?.color}
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
          timelineOriginDate={timelineOriginDate}
          showGrid={showGrid}
          showToday={showToday}
          showProgress={showProgress}
          showHeatmap={showHeatmap}
          collapseEmptyNightShifts={collapseEmptyNightShifts}
          readOnly={readOnly}
          clampDragToWindow={clampDragToWindow}
          zoomRange={zoomRange}
          personnelPeaks={personnelPeaks}
          onTaskClick={onTaskClick}
          onTaskDoubleClick={onTaskDoubleClick}
          onTaskDragEnd={onTaskDragEnd}
          onTaskResizeEnd={onTaskResizeEnd}
          onGroupDragEnd={onGroupDragEnd}
          onTasksDragEnd={onTasksDragEnd}
          onTooltipShow={handleTooltipShow}
          onTooltipHide={handleTooltipHide}
          onContextMenu={handleContextMenu}
          onUndoToast={handleUndoToast}
          highlightedLinkIds={highlightedLinkIds}
          shareColorMap={shareColorMap}
          onShareHover={handleShareHover}
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
            onCreateShareGroup={onCreateShareGroup}
            extraActions={selectionPanelExtraActions}
          />
        )}

        {/* Share Hover Panel */}
        {shareHoverState && (
          <GanttSharePanel
            tasks={shareHoverState.tasks}
            componentColor={shareHoverState.color}
            selectionPanelVisible={showSelectionPanel && state.selectedTaskIds.size > 0}
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
        avoidRects={tooltipState.avoidRects}
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
