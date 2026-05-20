/**
 * WxbGanttChart v2 — Unified Type Definitions
 * Covers: BatchGanttV4 + ProcessTemplateGantt full feature matrix
 */

// ===== Data Types =====

export interface GanttTask {
  id: string;
  label: string;
  /** Start time in hours offset from timeline origin */
  start: number;
  /** End time in hours offset from timeline origin */
  end: number;
  /** Group ID for tree association */
  groupId?: string;
  /** Bar color (CSS color string) */
  color?: string;
  /** Progress percentage 0-100 */
  progress?: number;
  /** Status text */
  status?: string;
  /** Whether drag is enabled */
  draggable?: boolean;
  /** Time window start (hours) */
  windowStart?: number;
  /** Time window end (hours) */
  windowEnd?: number;
  /** Required people count */
  requiredPeople?: number;
  /** Assigned people count */
  assignedPeople?: number;
  /** Visual type for rendering */
  type?: 'operation' | 'stage' | 'timeWindow';
  /** Conflict highlight type */
  conflictType?: 'CYCLE' | 'WINDOW' | 'OVERLAP';
  /** Whether this task is read-only (no drag) */
  readOnly?: boolean;
  /** Whether this task supports edge-resize (default: true for type==='timeWindow') */
  resizable?: boolean;
  /** Custom tooltip content */
  tooltip?: React.ReactNode;
  /** Passthrough business data */
  data?: Record<string, unknown>;
  /** Share group badges: array of { id, label, color } */
  shareGroups?: Array<{ id: string; label: string; color: string }>;
  /** Render this task directly on its group row instead of creating a child task row. */
  renderOnGroupRow?: boolean;
}

export interface GanttGroup {
  id: string;
  label: string;
  /** Parent group ID for nested hierarchy (supports 3-level) */
  parentId?: string;
  /** Whether this group is collapsed */
  collapsed?: boolean;
  /** Group accent color */
  color?: string;
  /** Semantic type marker */
  type?: 'batch' | 'stage' | 'template' | 'equipment';
  /** Whether to draw an aggregate summary bar on the group row. Defaults to true. */
  showSummaryBar?: boolean;
  /** Whether this group is a conflict lane under a resource row. */
  isSubRow?: boolean;
}

export interface GanttDependency {
  id: string;
  /** Source task ID */
  from: string;
  /** Target task ID */
  to: string;
  /** Dependency type (FS/SS/FF/SF) */
  type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag time in hours */
  lag?: number;
  /** Display label */
  label?: string;
  /** Line color override */
  color?: string;
  /** Constraint level (1=hard, 2+=soft) */
  level?: number;
  /** Whether this constraint is in conflict */
  isConflict?: boolean;
  /** Whether this constraint is actively highlighted */
  isActive?: boolean;
}

export interface GanttLink {
  id: string;
  /** Task IDs in the share group */
  taskIds: string[];
  /** Display label */
  label?: string;
  /** Line color */
  color?: string;
  /** Line style */
  style?: 'solid' | 'dashed';
  /** Share mode */
  shareMode?: 'SAME_TEAM' | 'DIFFERENT';
}

// ===== Component Props =====

export type ViewMode = 'hour' | 'day' | 'week' | 'month';

/** Y-axis grouping mode for resource Gantt view */
export type YAxisMode = 'operation' | 'stage-equipment' | 'equipment';

export interface WxbGanttChartProps {
  /** Task data */
  tasks: GanttTask[];
  /** Hierarchical group definitions */
  groups?: GanttGroup[];
  /** Dependency connections between tasks */
  dependencies?: GanttDependency[];
  /** Share group links */
  links?: GanttLink[];
  /** Time range override (hours, auto-detected if omitted) */
  timeRange?: { start: number; end: number };
  /** Real calendar date represented by hour 0. When omitted, the axis uses relative Day N labels. */
  timelineOriginDate?: string;
  /** Time axis unit (default: 'day') */
  timeUnit?: ViewMode;
  /** Row height in pixels (default: 32) */
  rowHeight?: number;
  /** Sidebar width in pixels (default: 200) */
  sidebarWidth?: number;
  /** Show grid lines (default: true) */
  showGrid?: boolean;
  /** Show today marker (default: true) */
  showToday?: boolean;
  /** Show progress fill (default: true) */
  showProgress?: boolean;
  /** Show personnel heatmap (default: false) */
  showHeatmap?: boolean;
  /** Show minimap (default: false) */
  showMinimap?: boolean;
  /** Collapse 21:00-09:00 night spans that do not contain operation tasks. */
  collapseEmptyNightShifts?: boolean;
  /** Enable fullscreen button (default: false) */
  enableFullscreen?: boolean;
  /** Read-only mode (default: false) */
  readOnly?: boolean;
  /** Initial day width in px (default: 120) */
  initialDayWidth?: number;
  /** Zoom range [min, max] dayWidth (default: [40, 600]) */
  zoomRange?: [number, number];
  /** Personnel peaks data: Map<day, peakCount> */
  personnelPeaks?: Map<number, { peak: number; peakHour: number }>;
  /** Task click handler */
  onTaskClick?: (task: GanttTask) => void;
  /** Task double-click handler */
  onTaskDoubleClick?: (task: GanttTask) => void;
  /** Task drag end handler */
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void | boolean | Promise<boolean | void>;
  /** Task resize end handler (for edge-drag on timeWindow bars).
   *  If not provided, falls back to onTaskDragEnd. */
  onTaskResizeEnd?: (taskId: string, newStart: number, newEnd: number) => void | boolean | Promise<boolean | void>;
  /** Cascade group drag end handler — consumer decides how to apply the offset */
  onGroupDragEnd?: (groupId: string, deltaHours: number, affectedTaskIds: string[]) => void | boolean | Promise<boolean | void>;
  /** Undo cascade handler — restores tasks to pre-drag snapshots */
  onUndoCascade?: (restorations: Array<{ taskId: string; start: number; end: number }>) => void;
  /** Group toggle handler */
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
  /** View mode change handler */
  onViewModeChange?: (mode: ViewMode) => void;
  // ===== Business Callbacks (routed from context menu / double-click) =====
  /** Task edit request (from right-click → "编辑" or double-click) */
  onTaskEdit?: (task: GanttTask) => void;
  /** Task delete request */
  onTaskDelete?: (task: GanttTask) => void;
  /** Multi-task delete request */
  onTasksDelete?: (tasks: GanttTask[]) => void;
  /** Task duplicate request */
  onTaskDuplicate?: (task: GanttTask) => void;
  /** Context menu action handler (catch-all for custom actions) */
  onContextAction?: (action: string, task: GanttTask | null) => void;
  // ===== Context Menu Customization (consumer overrides) =====
  /** Custom menu items for single-task right-click (overrides defaults) */
  taskMenuItems?: import('./GanttContextMenu').ContextMenuItem[];
  /** Dynamic per-task menu builder (takes priority over taskMenuItems when provided) */
  taskMenuBuilder?: (task: GanttTask) => import('./GanttContextMenu').ContextMenuItem[];
  /** Custom menu items for group-row right-click (overrides defaults) */
  groupMenuItems?: import('./GanttContextMenu').ContextMenuItem[];
  /** Custom menu items for background right-click (overrides defaults) */
  backgroundMenuItems?: import('./GanttContextMenu').ContextMenuItem[];
  /** Show selection panel when tasks are selected (default: true) */
  showSelectionPanel?: boolean;
  /** Highlighted link IDs for share group emphasis */
  highlightedLinkIds?: string[];
  /** Create share group from selection panel (one-click link) */
  onCreateShareGroup?: (selectedTaskIds: string[]) => void;
  /** Extra actions injected into the selection panel by the consumer */
  selectionPanelExtraActions?: React.ReactNode;
  /** CSS class name */
  className?: string;
  /** Inline style */
  style?: React.CSSProperties;
}

// ===== Internal Types =====

export interface FlatRow {
  id: string;
  type: 'group' | 'task';
  label: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  groupId?: string;
  taskId?: string;
  color?: string;
  groupType?: 'batch' | 'stage' | 'template' | 'equipment';
  /** Whether this row is a sub-row created by overlap splitting (Sidebar shows connector, not label) */
  isSubRow?: boolean;
  /** Equipment type label for equipment rows in resource view */
  equipmentType?: string;
}

export interface DragState {
  type: 'move' | 'group-move' | 'resize-start' | 'resize-end';
  /** Primary dragged task/group ID */
  primaryId: string;
  /** All affected task IDs (for cascade / multi-select) */
  affectedTaskIds: string[];
  isDragging: boolean;
  startMouseX: number;
  startMouseY: number;
  /** Original positions of all affected tasks */
  originals: Map<string, { start: number; end: number; row: number }>;
  /** Current drag offset in hours */
  deltaHours: number;
  /** Window constraint bounds (for single task move only) */
  windowMinHour?: number;
  windowMaxHour?: number;
  /** Task visual info for ghost rendering */
  taskColor: string;
  taskLabel: string;
  /** Cascade warning level based on offset magnitude */
  warningLevel: 'normal' | 'warning' | 'danger';
  /** Whether this is a group cascade drag */
  isGroupDrag: boolean;
}

export interface CollapsedTimeInterval {
  start: number;
  end: number;
  kind: 'night';
}

export interface GanttTimeScale {
  startHour: number;
  endHour: number;
  hourWidth: number;
  totalWidth: number;
  collapsedIntervals: CollapsedTimeInterval[];
  hourToX: (hour: number) => number;
  xToHour: (x: number) => number;
  widthBetween: (start: number, end: number) => number;
  isHourCollapsed: (hour: number) => boolean;
  isRangeVisible: (start: number, end: number) => boolean;
  pixelDeltaToHourDelta: (originHour: number, deltaX: number) => number;
}

export interface HitTestResult {
  taskId: string;
  task: GanttTask;
  edge: 'body' | 'resize-start' | 'resize-end';
  row: number;
  /** Whether this hit is on a task bar or a group summary bar */
  hitType: 'task' | 'group';
  /** Group ID when hitType is 'group' */
  groupId?: string;
}

/** Hit result for header area interactions */
export interface HeaderHitResult {
  type: 'day-label' | 'back-button' | 'prev-day' | 'next-day';
  day: number;
}

export interface CanvasViewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  startRow: number;
  endRow: number;
}

export interface GanttTheme {
  primary: string;
  primaryHover: string;
  success: string;
  warning: string;
  danger: string;
  ink: string;
  fg2: string;
  fg3: string;
  fg4: string;
  border: string;
  divider: string;
  surface1: string;
  surface2: string;
  surface3: string;
  bg: string;
  blue500: string;
  blue400: string;
  blue300: string;
  blue100: string;
  green500: string;
  green300: string;
  amber500: string;
  red500: string;
}
