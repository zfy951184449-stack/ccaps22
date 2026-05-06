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
 * 4. Detect overlapping tasks on same equipment & split into sub-rows (via extra groups)
 * 5. Mark overlapping tasks with conflictType='OVERLAP' for red highlighting
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
  /** Get the primary equipment binding for a schedule ID */
  getBindingForSchedule: (scheduleId: number) => EquipmentInfo | null;
}

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
): { groups: GanttGroup[]; taskUpdates: Map<string, { groupId: string; conflictType?: 'OVERLAP' }> } {
  const groups: GanttGroup[] = [];
  const taskUpdates = new Map<string, { groupId: string; conflictType?: 'OVERLAP' }>();

  for (const stage of stages) {
    const stageColor = STAGE_COLOR_PALETTE[stage.order % STAGE_COLOR_PALETTE.length];

    // Stage header group
    groups.push({
      id: `res-stage-${stage.id}`,
      label: stage.name,
      color: stageColor,
      type: 'stage',
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
        color: isUnbound ? 'var(--wx-fg-4, #8898A8)' : stageColor,
      });

      // Overlap split
      const layers = splitIntoLayers(eqTasks);
      const hasOverlap = layers.length > 1;

      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layerGroupId = layerIdx === 0
          ? fullEquipGroupId
          : `${fullEquipGroupId}__sub${layerIdx}`;

        // Create sub-row groups for overflow layers
        if (layerIdx > 0) {
          groups.push({
            id: layerGroupId,
            label: '',  // Sub-row: no label
            parentId: `res-stage-${stage.id}`,
            color: stageColor,
          });
        }

        for (const task of layers[layerIdx]) {
          taskUpdates.set(task.id, {
            groupId: layerGroupId,
            conflictType: hasOverlap ? 'OVERLAP' : undefined,
          });
        }
      }
    }
  }

  return { groups, taskUpdates };
}

function buildEquipmentGroups(
  tasks: GanttTask[],
  bindingMap: Map<number, EquipmentInfo>,
  equipmentMap: Map<number, EquipmentInfo>,
  stages: Array<{ id: string; name: string; code: string; order: number }>,
): { groups: GanttGroup[]; taskUpdates: Map<string, { groupId: string; conflictType?: 'OVERLAP'; color?: string }> } {
  const groups: GanttGroup[] = [];
  const taskUpdates = new Map<string, { groupId: string; conflictType?: 'OVERLAP'; color?: string }>();

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
      color: isUnbound ? 'var(--wx-fg-4, #8898A8)' : 'var(--wx-blue-800, #0B3D7F)',
    });

    // Overlap split
    const layers = splitIntoLayers(eqTasks);
    const hasOverlap = layers.length > 1;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layerGroupId = layerIdx === 0
        ? `res-${equipKey}`
        : `res-${equipKey}__sub${layerIdx}`;

      if (layerIdx > 0) {
        groups.push({
          id: layerGroupId,
          label: '',
          parentId: `res-${equipKey}`,
          color: 'var(--wx-blue-800, #0B3D7F)',
        });
      }

      for (const task of layers[layerIdx]) {
        // Color by stage
        const stageId = task.data?.stageId;
        const stageFullId = stageId !== undefined ? `stage_${stageId}` : undefined;
        const color = stageFullId ? stageColorMap.get(stageFullId) : undefined;

        taskUpdates.set(task.id, {
          groupId: layerGroupId,
          conflictType: hasOverlap ? 'OVERLAP' : undefined,
          color,
        });
      }
    }
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

  // Load bindings when mode changes from 'operation' or on first resource view
  useEffect(() => {
    if (yAxisMode === 'operation') return;
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
  const { bindingMap, equipmentMap } = useMemo(() => {
    const bMap = new Map<number, EquipmentInfo>();
    const eMap = new Map<number, EquipmentInfo>();

    for (const b of bindings) {
      // Only use PRIMARY bindings for Gantt Y-axis grouping
      if (b.binding_role && b.binding_role !== 'PRIMARY') continue;

      const info: EquipmentInfo = {
        resourceNodeId: b.resource_node_id,
        name: b.node_name,
        nodeClass: b.node_class,
        systemType: b.equipment_system_type,
        equipmentClass: b.equipment_class,
      };
      bMap.set(b.template_schedule_id, info);
      eMap.set(b.resource_node_id, info);
    }

    return { bindingMap: bMap, equipmentMap: eMap };
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
      taskUpdates: Map<string, { groupId: string; conflictType?: 'OVERLAP'; color?: string }>;
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

  return { resourceGroups, resourceTasks, loading, refreshBindings, getBindingForSchedule };
}
