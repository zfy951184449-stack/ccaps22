/**
 * ProcessTemplateGantt → WxbGanttChart Data Adapter
 *
 * Pure functions: no state, no hooks, no side-effects.
 * Consumers call these inside useMemo() for automatic memoization.
 *
 * Conversion map:
 *   GanttNode (tree)      → GanttGroup[]   (flat hierarchy)
 *   TimeBlock[]           → GanttTask[]    (operations + timeWindows)
 *   GanttConstraint[]     → GanttDependency[]
 *   ShareGroup[]          → GanttLink[]
 */
import type {
  GanttTask,
  GanttGroup,
  GanttDependency,
  GanttLink,
} from '../wxb-ui/GanttChart/types';
import type {
  GanttNode,
  TimeBlock,
  GanttConstraint,
  ShareGroup,
  StageOperation,
} from './types';
import { STAGE_COLORS } from './constants';

// ============================================================================
// 1. toGanttTasks — TimeBlock[] → GanttTask[]
// ============================================================================

export interface ToGanttTasksOptions {
  /** Set of node IDs that should be read-only (e.g. locked operations) */
  readOnlyOperations?: Set<string>;
  /** Map<scheduleId, conflictType> from auto-schedule results */
  conflictMap?: Record<number, string>;
  /** All share groups (to attach badges to operations) */
  shareGroups?: ShareGroup[];
  /**
   * When true, timeWindow blocks are NOT emitted as separate GanttTask rows.
   * Instead, window data is only surfaced via windowStart/windowEnd on the
   * operation task and rendered as an inline background layer.
   * Default: false (backward compat — legacy charts still get separate rows).
   */
  mergeTimeWindows?: boolean;
}

/**
 * Convert legacy TimeBlock[] + GanttNode[] to WxbGanttChart GanttTask[].
 *
 * - Stage TimeBlocks are skipped (stages become GanttGroup via toGanttGroups).
 * - TimeWindow blocks → GanttTask with type='timeWindow', resizable=true.
 * - Operation blocks → GanttTask with type='operation', draggable=true.
 */
export function toGanttTasks(
  timeBlocks: TimeBlock[],
  ganttNodes: GanttNode[],
  options?: ToGanttTasksOptions,
): GanttTask[] {
  const tasks: GanttTask[] = [];
  const nodeMap = buildNodeMap(ganttNodes);

  // Pre-compute window lookup: nodeId → { start, end }
  const windowMap = new Map<string, { start: number; end: number }>();
  for (const block of timeBlocks) {
    if (block.isTimeWindow) {
      windowMap.set(block.node_id, {
        start: block.start_hour,
        end: block.start_hour + block.duration_hours,
      });
    }
  }

  for (const block of timeBlocks) {
    // Skip stage blocks — they become GanttGroup
    if (block.isStage) continue;

    const node = nodeMap.get(block.node_id);
    const opData = node?.data as StageOperation | undefined;
    const scheduleId = opData?.id;
    const isReadOnly = options?.readOnlyOperations?.has(block.node_id) ?? false;

    if (block.isTimeWindow) {
      // When mergeTimeWindows is enabled, skip standalone timeWindow rows.
      // The window data is already attached to the operation task via
      // windowStart/windowEnd (computed from windowMap below).
      if (options?.mergeTimeWindows) continue;

      // Time window → resizable bar (legacy mode)
      tasks.push({
        id: block.id,                // 'window_operation_123'
        label: block.title,
        start: block.start_hour,
        end: block.start_hour + block.duration_hours,
        groupId: node?.parent_id,    // 'stage_X'
        color: block.color,
        type: 'timeWindow',
        resizable: !isReadOnly,
        readOnly: isReadOnly,
        draggable: false,            // timeWindows are resized, not moved
        data: {
          nodeId: block.node_id,
          scheduleId,
          stageId: opData?.stage_id,
        },
      });
    } else {
      // Operation → draggable bar
      const conflictType = scheduleId && options?.conflictMap?.[scheduleId]
        ? mapConflictType(options.conflictMap[scheduleId])
        : undefined;

      // Find share groups this operation belongs to
      const taskShareGroups = options?.shareGroups
        ?.filter(sg => sg.members?.some(m => m.schedule_id === scheduleId))
        .map(sg => ({
          id: String(sg.id),
          label: sg.group_name,
          color: sg.color || '#1890ff',
        }));

      // Window constraints for drag clamping
      const win = windowMap.get(block.node_id);

      tasks.push({
        id: block.node_id,           // 'operation_123'
        label: node?.title || block.title,
        start: block.start_hour,
        end: block.start_hour + block.duration_hours,
        groupId: node?.parent_id,    // 'stage_X'
        color: block.color,
        type: 'operation',
        draggable: !isReadOnly,
        readOnly: isReadOnly,
        requiredPeople: node?.required_people,
        conflictType,
        shareGroups: taskShareGroups?.length ? taskShareGroups : undefined,
        windowStart: win?.start,
        windowEnd: win?.end,
        data: {
          nodeId: block.node_id,
          scheduleId,
          stageId: opData?.stage_id,
        },
      });
    }
  }

  return tasks;
}

// ============================================================================
// 2. toGanttGroups — GanttNode[] → GanttGroup[]
// ============================================================================

/**
 * Convert legacy tree GanttNode[] to flat GanttGroup[].
 * Only template and stage nodes become groups (operations are tasks).
 */
export function toGanttGroups(ganttNodes: GanttNode[]): GanttGroup[] {
  const groups: GanttGroup[] = [];

  const traverse = (nodes: GanttNode[], parentId?: string) => {
    for (const node of nodes) {
      if (node.type === 'template' || node.type === 'stage') {
        const stageCode = node.stage_code || 'DEFAULT';
        groups.push({
          id: node.id,
          label: node.title,
          parentId,
          type: node.type === 'template' ? 'template' : 'stage',
          color: STAGE_COLORS[stageCode] || STAGE_COLORS.DEFAULT,
        });
        if (node.children) {
          traverse(node.children, node.id);
        }
      }
    }
  };

  traverse(ganttNodes);
  return groups;
}

// ============================================================================
// 3. toGanttDeps — GanttConstraint[] → GanttDependency[]
// ============================================================================

/**
 * Convert legacy GanttConstraint[] to WxbGanttChart GanttDependency[].
 */
export function toGanttDeps(constraints: GanttConstraint[]): GanttDependency[] {
  return constraints.map(c => ({
    id: `constraint_${c.constraint_id}`,
    from: `operation_${c.from_schedule_id}`,
    to: `operation_${c.to_schedule_id}`,
    type: mapConstraintType(c.constraint_type),
    lag: c.lag_time || 0,
    level: c.constraint_level,
    label: c.constraint_name,
  }));
}

// ============================================================================
// 4. toGanttLinks — ShareGroup[] → GanttLink[]
// ============================================================================

/**
 * Convert legacy ShareGroup[] to WxbGanttChart GanttLink[].
 * Only groups with ≥2 members produce links (otherwise nothing to connect).
 */
export function toGanttLinks(shareGroups: ShareGroup[]): GanttLink[] {
  return shareGroups
    .filter(sg => sg.members && sg.members.length >= 2)
    .map(sg => ({
      id: `share_${sg.id}`,
      taskIds: sg.members!.map(m => `operation_${m.schedule_id}`),
      label: sg.group_name,
      color: sg.color,
      shareMode: sg.share_mode,
    }));
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build a flat Map<nodeId, GanttNode> from the tree for O(1) lookup.
 */
function buildNodeMap(nodes: GanttNode[]): Map<string, GanttNode> {
  const map = new Map<string, GanttNode>();
  const traverse = (ns: GanttNode[]) => {
    for (const n of ns) {
      map.set(n.id, n);
      if (n.children) traverse(n.children);
    }
  };
  traverse(nodes);
  return map;
}

/**
 * Map numeric constraint_type to dependency type string.
 * Legacy convention: 1=FS, 2=SS, 3=FF, 4=SF
 */
function mapConstraintType(type: number): 'FS' | 'SS' | 'FF' | 'SF' {
  switch (type) {
    case 1: return 'FS';
    case 2: return 'SS';
    case 3: return 'FF';
    case 4: return 'SF';
    default: return 'FS';
  }
}

/**
 * Map conflict type string to GanttTask conflictType enum.
 */
function mapConflictType(type: string): 'CYCLE' | 'WINDOW' | 'OVERLAP' | undefined {
  if (type === 'CYCLE') return 'CYCLE';
  if (type === 'WINDOW') return 'WINDOW';
  if (type === 'OVERLAP') return 'OVERLAP';
  return undefined;
}
