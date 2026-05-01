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
  /** Custom tooltip content */
  tooltip?: React.ReactNode;
  /** Passthrough business data */
  data?: Record<string, unknown>;
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
  type?: 'batch' | 'stage' | 'template';
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
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void;
  /** Group toggle handler */
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
  /** View mode change handler */
  onViewModeChange?: (mode: ViewMode) => void;
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
  groupType?: 'batch' | 'stage' | 'template';
}

export interface DragState {
  type: 'move' | 'resize-start' | 'resize-end';
  taskId: string;
  startMouseX: number;
  startMouseY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHour: number;
  endHour: number;
  isDragging: boolean;
  windowMinX?: number;
  windowMaxX?: number;
}

export interface HitTestResult {
  taskId: string;
  task: GanttTask;
  edge: 'body' | 'resize-start' | 'resize-end';
  row: number;
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
