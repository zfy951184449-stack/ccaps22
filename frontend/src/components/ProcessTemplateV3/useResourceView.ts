/**
 * useResourceView — Resource Gantt View Hook
 *
 * Transforms the standard operation-centric Gantt data into
 * equipment-centric groupings for the resource Gantt view.
 *
 * Responsibilities:
 * 1. Load resource bindings (operation → equipment) from API
 * 2. Build Stage▸Equipment / pure Equipment group hierarchies
 * 3. Remap task.groupId to point to new equipment-based groups
 * 4. Render non-overlapping operations inline on equipment rows
 * 5. Split overlapping operations into conflict lanes and mark them
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { GanttGroup, GanttTask, YAxisMode } from '../wxb-ui/GanttChart/types';
import type { GanttNode } from '../ProcessTemplateGantt/types';
import { processTemplateV2Api } from '../../services';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BindingRecord {
  template_schedule_id: number;
  resource_node_id: number;
  binding_mode: string;
  binding_role: string;
  node_name: string;
  node_class: string;
  equipment_system_type: string | null;
  equipment_class: string | null;
}

export interface EquipmentInfo {
  resourceNodeId: number;
  name: string;
  nodeClass: string;
  systemType: string | null;
  equipmentClass: string | null;
}

export interface UseResourceViewResult {
  /** Transformed groups (equipment-based) */
  resourceGroups: GanttGroup[];
  /** Tasks with remapped groupId + conflictType */
  resourceTasks: GanttTask[];
  /** Whether binding data is loading */
  loading: boolean;
  /** Force-refresh binding data (after a bind/unbind action) */
  refreshBindings: () => Promise<void>;
  /** Get the primary (优选) equipment binding for a schedule ID — drives Gantt lanes + menu. */
  getBindingForSchedule: (scheduleId: number) => EquipmentInfo | null;
  /** Get the alternative (备选 / AUXILIARY) equipment for a schedule ID — display only. */
  getCandidatesForSchedule: (scheduleId: number) => EquipmentInfo[];
}

type ResourceTaskUpdate = {
  groupId: string;
  conflictType?: 'OVERLAP';
  color?: string;
  renderOnGroupRow?: boolean;
};

// ---------------------------------------------------------------------------
// Stage color palette (extended for ≥6 stages)
// ---------------------------------------------------------------------------

// Data visualization palette for stage coloring — intentionally hardcoded hex values
// as these are chart-specific colors, not theme-dependent UI elements.
const STAGE_COLOR_PALETTE = [
  '#0B3D7F', '#2E9D6E', '#3AA8C1', '#E8B53C', '#D6493A',
  '#7C4DFF', '#00BFA5', '#F57C00', '#C62828', '#283593',
];

// ---------------------------------------------------------------------------
// Overlap detection: greedy layer assignment
// ---------------------------------------------------------------------------

/**
 * Split tasks into non-overlapping layers using a greedy algorithm.
 * Each layer contains tasks whose time ranges don't overlap.
 * Returns layers array — if length > 1, there's overlap.
 */
function splitIntoLayers(tasks: GanttTask[]): GanttTask[][] {
  if (tasks.length <= 1) return [tasks];

  const sorted = [...tasks].sort((a, b) => a.start - b.start || a.end - b.end);
  const layers: { end: number; tasks: GanttTask[] }[] = [];

  for (const task of sorted) {
    let placed = false;
    for (const layer of layers) {
      if (layer.end <= task.start) {
        layer.end = task.end;
        layer.tasks.push(task);
        placed = true;
        break;
      }
    }
    if (!placed) {
      layers.push({ end: task.end, tasks: [task] });
    }
  }

  return layers.map(l => l.tasks);
}

/**
 * Return the task IDs whose time range overlaps at least one sibling task.
 *
 * O(n log n) sweep-line implementation:
 * Sort by start, then walk forward maintaining a list of active (not-yet-ended)
 * tasks.  Whenever a new task arrives and there are still active tasks, both
 * the new task and every active task are marked as overlapping.
 *
 * Correctness: two tasks A and B overlap iff A.start < B.end && B.start < A.end.
 * After sorting by start (A.start ≤ B.start), the condition simplifies to
 * A.end > B.start.  The active set contains exactly the tasks whose end is
 * greater than the current task's start, so any non-empty active set at
 * arrival time means the current task overlaps all active tasks — identical
 * to the O(n²) double-loop result.
 *
 * Edge cases (all match the strict-inequality double loop):
 *  - Adjacent tasks (A.end === B.start): trim drops A before B is checked
 *    (active[k].end > task.start is false), so they are NOT marked — correct,
 *    touching-but-not-overlapping is not a conflict.
 *  - Zero-length task T (start === end) sharing a start with a normal task P
 *    (P.start === T.start, P.end > T.start): the secondary sort key a.end-b.end
 *    orders T (end === start) before P, and when P arrives T has already been
 *    trimmed (T.end === T.start ≤ P.start), so neither is marked — correct,
 *    since P.start < T.end is false in the double loop.
 *  - Zero-length task strictly inside another (P.start < T < P.end): P is still
 *    active when T arrives, so both are marked — correct.
 *  NOTE invariant: operation tasks reaching this function are never zero-length —
 *  ProcessTemplateGantt/utils.ts coerces any standard_time ≤ 0 to a 4h default
 *  before a GanttTask is built, so duration_hours > 0 always. The zero-length
 *  reasoning above is a defensive guarantee, not a live code path; the edge-case
 *  tests pin the behaviour should that invariant ever change upstream.
 */
function findOverlappingTaskIds(tasks: GanttTask[]): Set<string> {
  if (tasks.length <= 1) return new Set<string>();

  const overlappingIds = new Set<string>();
  const sorted = [...tasks].sort((a, b) => a.start - b.start || a.end - b.end);

  // active: tasks whose end > current task's start (still "alive")
  // kept as an array sorted by end for cheap trimming
  const active: GanttTask[] = [];

  for (const task of sorted) {
    // Remove tasks that have already ended (end <= task.start means no overlap)
    let writeIdx = 0;
    for (let k = 0; k < active.length; k++) {
      if (active[k].end > task.start) {
        active[writeIdx++] = active[k];
      }
    }
    active.length = writeIdx;

    if (active.length > 0) {
      // Current task overlaps every still-active task
      overlappingIds.add(task.id);
      for (const a of active) overlappingIds.add(a.id);
    }

    active.push(task);
  }

  return overlappingIds;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract stage info from ganttNodes tree */
function extractStages(ganttNodes: GanttNode[]): Array<{
  id: string;
  name: string;
  code: string;
  order: number;
}> {
  const stages: Array<{ id: string; name: string; code: string; order: number }> = [];
  let order = 0;

  const traverse = (nodes: GanttNode[]) => {
    for (const node of nodes) {
      if (node.type === 'stage') {
        stages.push({
          id: node.id,
          name: node.title,
          code: node.stage_code || 'DEFAULT',
          order: order++,
        });
      }
      if (node.children) traverse(node.children);
    }
  };

  traverse(ganttNodes);
  return stages;
}

/** Extract schedule ID from task ID (e.g., "operation_123" → 123) */
function extractScheduleId(taskId: string): number | null {
  const parts = taskId.split('_');
  const num = Number(parts[parts.length - 1]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

// ---------------------------------------------------------------------------
// Group builders
// ---------------------------------------------------------------------------

function buildStageEquipmentGroups(
  stages: Array<{ id: string; name: string; code: string; order: number }>,
  tasks: GanttTask[],
  bindingMap: Map<number, EquipmentInfo>,
  equipmentMap: Map<number, EquipmentInfo>,
): { groups: GanttGroup[]; taskUpdates: Map<string, ResourceTaskUpdate> } {
  const groups: GanttGroup[] = [];
  const taskUpdates = new Map<string, ResourceTaskUpdate>();

  for (const stage of stages) {
    const stageColor = STAGE_COLOR_PALETTE[stage.order % STAGE_COLOR_PALETTE.length];

    // Stage header group
    groups.push({
      id: `res-stage-${stage.id}`,
      label: stage.name,
      color: stageColor,
      type: 'stage',
      showSummaryBar: true,
    });

    // Collect tasks for this stage
    const stageTasks = tasks.filter(t => {
      const stageId = t.data?.stageId;
      return stageId !== undefined && `stage_${stageId}` === stage.id;
    });

    // Group by equipment
    const byEquipment = new Map<string, GanttTask[]>();

    for (const task of stageTasks) {
      const scheduleId = extractScheduleId(task.id);
      const binding = scheduleId ? bindingMap.get(scheduleId) : null;
      const key = binding
        ? `equip-${binding.resourceNodeId}`
        : `res-stage-${stage.id}-unbound`;
      if (!byEquipment.has(key)) byEquipment.set(key, []);
      byEquipment.get(key)!.push(task);
    }

    // Create equipment sub-groups
    for (const [equipGroupId, eqTasks] of Array.from(byEquipment.entries())) {
      const isUnbound = equipGroupId.endsWith('-unbound');
      const equipInfo = !isUnbound
        ? equipmentMap.get(Number(equipGroupId.replace('equip-', '')))
        : null;

      const equipLabel = isUnbound
        ? '[未绑定] 设备'
        : (equipInfo?.name ?? equipGroupId);

      // Create the equipment group under the stage
      const fullEquipGroupId = `${stage.id}__${equipGroupId}`;
      groups.push({
        id: fullEquipGroupId,
        label: equipLabel,
        parentId: `res-stage-${stage.id}`,
        color: isUnbound ? 'var(--wx-fg-4)' : stageColor,
        type: 'equipment',
        showSummaryBar: true,
      });

      const layers = splitIntoLayers(eqTasks);
      const overlappingTaskIds = findOverlappingTaskIds(eqTasks);
      layers.forEach((layerTasks, index) => {
        const laneGroupId = `${fullEquipGroupId}__lane-${index + 1}`;
        groups.push({
          id: laneGroupId,
          label: `轨道 ${index + 1}`,
          parentId: fullEquipGroupId,
          color: isUnbound ? 'var(--wx-fg-4)' : stageColor,
          showSummaryBar: false,
          isSubRow: true,
        });

        for (const task of layerTasks) {
          taskUpdates.set(task.id, {
            groupId: laneGroupId,
            conflictType: overlappingTaskIds.has(task.id) ? 'OVERLAP' : undefined,
            renderOnGroupRow: true,
          });
        }
      });
    }
  }

  return { groups, taskUpdates };
}

function buildEquipmentGroups(
  tasks: GanttTask[],
  bindingMap: Map<number, EquipmentInfo>,
  equipmentMap: Map<number, EquipmentInfo>,
  stages: Array<{ id: string; name: string; code: string; order: number }>,
): { groups: GanttGroup[]; taskUpdates: Map<string, ResourceTaskUpdate> } {
  const groups: GanttGroup[] = [];
  const taskUpdates = new Map<string, ResourceTaskUpdate>();

  // Group all tasks by equipment (ignoring stage)
  const byEquipment = new Map<string, GanttTask[]>();

  for (const task of tasks) {
    if (task.type === 'timeWindow') continue; // Skip time windows
    const scheduleId = extractScheduleId(task.id);
    const binding = scheduleId ? bindingMap.get(scheduleId) : null;
    const key = binding ? `equip-${binding.resourceNodeId}` : 'unbound';
    if (!byEquipment.has(key)) byEquipment.set(key, []);
    byEquipment.get(key)!.push(task);
  }

  // Build stage color lookup for task coloring
  const stageColorMap = new Map<string, string>();
  for (const stage of stages) {
    stageColorMap.set(
      stage.id,
      STAGE_COLOR_PALETTE[stage.order % STAGE_COLOR_PALETTE.length],
    );
  }

  for (const [equipKey, eqTasks] of Array.from(byEquipment.entries())) {
    const isUnbound = equipKey === 'unbound';
    const equipInfo = !isUnbound
      ? equipmentMap.get(Number(equipKey.replace('equip-', '')))
      : null;

    const equipLabel = isUnbound
      ? `[未绑定] 设备 (${eqTasks.length})`
      : (equipInfo?.name ?? equipKey);

    groups.push({
      id: `res-${equipKey}`,
      label: equipLabel,
      color: isUnbound ? 'var(--wx-fg-4)' : 'var(--wx-blue-800)',
      type: 'equipment',
      showSummaryBar: true,
    });

    const groupId = `res-${equipKey}`;
    const layers = splitIntoLayers(eqTasks);
    const overlappingTaskIds = findOverlappingTaskIds(eqTasks);

    layers.forEach((layerTasks, index) => {
      const laneGroupId = `${groupId}__lane-${index + 1}`;
      groups.push({
        id: laneGroupId,
        label: `轨道 ${index + 1}`,
        parentId: groupId,
        color: isUnbound ? 'var(--wx-fg-4)' : 'var(--wx-blue-800)',
        showSummaryBar: false,
        isSubRow: true,
      });

      for (const task of layerTasks) {
        // Color by stage
        const stageId = task.data?.stageId;
        const stageFullId = stageId !== undefined ? `stage_${stageId}` : undefined;
        const color = stageFullId ? stageColorMap.get(stageFullId) : undefined;

        taskUpdates.set(task.id, {
          groupId: laneGroupId,
          conflictType: overlappingTaskIds.has(task.id) ? 'OVERLAP' : undefined,
          color,
          renderOnGroupRow: true,
        });
      }
    });
  }

  return { groups, taskUpdates };
}

// ---------------------------------------------------------------------------
// Main Hook
// ---------------------------------------------------------------------------

export function useResourceView(
  templateId: number,
  ganttNodes: GanttNode[],
  tasks: GanttTask[],
  groups: GanttGroup[],
  yAxisMode: YAxisMode,
): UseResourceViewResult {
  // ---- Binding data ----
  const [bindings, setBindings] = useState<BindingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedTemplateRef = useRef<number>(0);

  // Load bindings once per template, regardless of Y-axis mode — the operation view's
  // right-click menu and the edit modal also rely on binding state.
  useEffect(() => {
    if (loadedTemplateRef.current === templateId) return; // already loaded

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await processTemplateV2Api.listBindingsByTemplate(templateId);
        if (!cancelled) {
          setBindings(data);
          loadedTemplateRef.current = templateId;
        }
      } catch (err) {
        console.error('Failed to load resource bindings:', err);
        if (!cancelled) setBindings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [templateId, yAxisMode]);

  // ---- Derived maps ----
  // A single operation can now own multiple binding rows (1 PRIMARY + 0..N AUXILIARY).
  //  - bindingMap (schedule → PRIMARY EquipmentInfo) drives Gantt Y-axis lanes + the
  //    right-click menu; AUXILIARY rows are intentionally excluded so layout is unchanged.
  //  - candidateMap (schedule → AUXILIARY EquipmentInfo[]) is display-only (tags/tooltips).
  //  - equipmentMap (node id → EquipmentInfo) caches every node we've seen for labels.
  const { bindingMap, candidateMap, equipmentMap } = useMemo(() => {
    const bMap = new Map<number, EquipmentInfo>();
    const cMap = new Map<number, EquipmentInfo[]>();
    const eMap = new Map<number, EquipmentInfo>();

    for (const b of bindings) {
      const info: EquipmentInfo = {
        resourceNodeId: b.resource_node_id,
        name: b.node_name,
        nodeClass: b.node_class,
        systemType: b.equipment_system_type,
        equipmentClass: b.equipment_class,
      };
      eMap.set(b.resource_node_id, info);

      if (!b.binding_role || b.binding_role === 'PRIMARY') {
        // PRIMARY (or legacy rows without a role) → the one device used everywhere downstream.
        bMap.set(b.template_schedule_id, info);
      } else {
        // AUXILIARY → alternative candidate, never gets its own Gantt lane.
        const list = cMap.get(b.template_schedule_id) ?? [];
        list.push(info);
        cMap.set(b.template_schedule_id, list);
      }
    }

    return { bindingMap: bMap, candidateMap: cMap, equipmentMap: eMap };
  }, [bindings]);

  // ---- Stage info ----
  const stages = useMemo(() => extractStages(ganttNodes), [ganttNodes]);

  // ---- Only operation tasks (exclude timeWindow) ----
  const opTasks = useMemo(
    () => tasks.filter(t => t.type !== 'timeWindow'),
    [tasks],
  );

  // ---- Build resource groups + task updates ----
  const { resourceGroups, resourceTasks } = useMemo(() => {
    if (yAxisMode === 'operation') {
      return { resourceGroups: groups, resourceTasks: tasks };
    }

    let result: {
      groups: GanttGroup[];
      taskUpdates: Map<string, ResourceTaskUpdate>;
    };

    if (yAxisMode === 'stage-equipment') {
      result = buildStageEquipmentGroups(stages, opTasks, bindingMap, equipmentMap);
    } else {
      result = buildEquipmentGroups(opTasks, bindingMap, equipmentMap, stages);
    }

    // Apply task updates (groupId remap + conflictType + color)
    const updatedTasks = tasks.map(task => {
      const update = result.taskUpdates.get(task.id);
      if (!update) {
        // timeWindow tasks or tasks not in resource view → hide
        if (task.type === 'timeWindow') {
          return null; // Filter out timeWindows in resource view
        }
        return task;
      }
      return {
        ...task,
        groupId: update.groupId,
        conflictType: update.conflictType ?? task.conflictType,
        color: (update as any).color ?? task.color,
        renderOnGroupRow: update.renderOnGroupRow ?? task.renderOnGroupRow,
      };
    }).filter(Boolean) as GanttTask[];

    return {
      resourceGroups: result.groups,
      resourceTasks: updatedTasks,
    };
  }, [yAxisMode, tasks, opTasks, groups, stages, bindingMap, equipmentMap]);

  // ---- Refresh function (imperative, for binding UI) ----
  const refreshBindings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await processTemplateV2Api.listBindingsByTemplate(templateId);
      setBindings(data);
      loadedTemplateRef.current = templateId;
    } catch (err) {
      console.error('Failed to refresh resource bindings:', err);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  // ---- Lookup for menu rendering ----
  const getBindingForSchedule = useCallback(
    (scheduleId: number): EquipmentInfo | null => {
      return bindingMap.get(scheduleId) ?? null;
    },
    [bindingMap],
  );

  // ---- Lookup for candidate (备选) equipment — display only, never drives lanes ----
  const getCandidatesForSchedule = useCallback(
    (scheduleId: number): EquipmentInfo[] => {
      return candidateMap.get(scheduleId) ?? [];
    },
    [candidateMap],
  );

  return {
    resourceGroups,
    resourceTasks,
    loading,
    refreshBindings,
    getBindingForSchedule,
    getCandidatesForSchedule,
  };
}
