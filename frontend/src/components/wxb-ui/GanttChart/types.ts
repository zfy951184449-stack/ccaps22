/**
 * WxbGanttChart — Type Definitions
 */

// ===== Data Types =====

export interface GanttTask {
  id: string;
  label: string;
  /** Start time in hours offset from timeline origin */
  start: number;
  /** End time in hours offset from timeline origin */
  end: number;
  /** Group label for display */
  group?: string;
  /** Group ID for tree association */
  groupId?: string;
  /** Bar color (CSS color string) */
  color?: string;
  /** Progress percentage 0-100 */
  progress?: number;
  /** Status text */
  status?: string;
  /** Custom tooltip content */
  tooltip?: React.ReactNode;
  /** Whether drag is enabled */
  draggable?: boolean;
  /** Time window start (hours) */
  windowStart?: number;
  /** Time window end (hours) */
  windowEnd?: number;
}

export interface GanttGroup {
  id: string;
  label: string;
  /** Parent group ID for nested hierarchy */
  parentId?: string;
  /** Whether this group is collapsed */
  collapsed?: boolean;
  /** Group accent color */
  color?: string;
}

export interface GanttDependency {
  id: string;
  /** Source task ID */
  from: string;
  /** Target task ID */
  to: string;
  /** Dependency type */
  type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag time in hours */
  lag?: number;
  /** Display label */
  label?: string;
  /** Line color override */
  color?: string;
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
}

// ===== Component Props =====

export interface WxbGanttChartProps {
  /** Task data */
  tasks: GanttTask[];
  /** Hierarchical group definitions */
  groups?: GanttGroup[];
  /** Dependency connections between tasks */
  dependencies?: GanttDependency[];
  /** Share group links */
  links?: GanttLink[];
  /** Time range override (auto-detected from tasks if omitted) */
  timeRange?: { start: number; end: number };
  /** Time axis unit */
  timeUnit?: 'hour' | 'day' | 'week';
  /** Row height in pixels (default: 32) */
  rowHeight?: number;
  /** Sidebar width in pixels (default: 180) */
  sidebarWidth?: number;
  /** Show grid lines (default: true) */
  showGrid?: boolean;
  /** Show today marker (default: true) */
  showToday?: boolean;
  /** Show progress fill (default: true) */
  showProgress?: boolean;
  /** Zoom range in pixels per day [min, max] (default: [40, 600]) */
  zoomRange?: [number, number];
  /** Task click handler */
  onTaskClick?: (task: GanttTask) => void;
  /** Task double-click handler */
  onTaskDoubleClick?: (task: GanttTask) => void;
  /** Task drag end handler */
  onTaskDragEnd?: (taskId: string, newStart: number, newEnd: number) => void;
  /** Group toggle handler */
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
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
}

export interface ThemeColors {
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
}

export interface CanvasViewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  startRow: number;
  endRow: number;
}
