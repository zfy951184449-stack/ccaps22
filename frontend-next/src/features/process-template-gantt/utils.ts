/* ── Gantt Utilities ────────────────────────────────────────────────
 *
 * Pure functions for Gantt node/block construction and layout math.
 */

import type {
  GanttNode,
  FlattenedRow,
  TimeBlock,
  StageOperation,
  ProcessStage,
  ProcessTemplate,
  STAGE_COLORS,
} from "./types";
import { STAGE_COLORS as COLORS } from "./types";

/** Convert hex color to rgba string */
export function toRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Resolve stage color from stage code */
export function getOperationColor(stageCode: string, alpha = 1): string {
  const base = COLORS[stageCode] ?? COLORS.DEFAULT;
  return alpha === 1 ? base : toRgba(base, alpha);
}

/** Collect all expandable node IDs (template + stage) */
export function collectAllExpandableKeys(nodes: GanttNode[]): string[] {
  const keys: string[] = [];
  const traverse = (list: GanttNode[]) => {
    for (const node of list) {
      if (node.type !== "operation") keys.push(node.id);
      if (node.children) traverse(node.children);
    }
  };
  traverse(nodes);
  return keys;
}

/** Flatten tree → flat list honoring expanded state */
export function flattenGanttNodes(
  nodes: GanttNode[],
  expandedKeys: string[],
  depth = 0,
  parentId?: string,
): FlattenedRow[] {
  const expanded = new Set(expandedKeys);
  const result: FlattenedRow[] = [];

  for (const node of nodes) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = expanded.has(node.id);

    result.push({ id: node.id, node, depth, hasChildren, isExpanded, parentId });

    if (hasChildren && isExpanded) {
      result.push(
        ...flattenGanttNodes(node.children!, expandedKeys, depth + 1, node.id),
      );
    }
  }

  return result;
}

/** Build GanttNode tree from domain data */
export function buildGanttNodes(
  template: ProcessTemplate,
  stages: ProcessStage[],
  stageOpsMap: Record<string | number, StageOperation[]>,
): GanttNode[] {
  const templateNode: GanttNode = {
    id: template.id.toString(),
    title: template.templateName,
    type: "template",
    expanded: true,
    children: [],
    level: 0,
  };

  const sortedStages = stages.slice().sort((a, b) => {
    if (a.startDay !== b.startDay) return a.startDay - b.startDay;
    if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
    return a.id - b.id;
  });

  for (const stage of sortedStages) {
    const stageNode: GanttNode = {
      id: `stage_${stage.id}`,
      title: `${stage.stageCode} - ${stage.stageName}`,
      type: "stage",
      parentId: template.id.toString(),
      stageCode: stage.stageCode,
      startDay: stage.startDay,
      startHour: 0,
      expanded: false,
      children: [],
      editable: true,
      level: 1,
      data: stage,
    };

    const operations = (stageOpsMap[stage.id] ?? []).slice().sort((a, b) => {
      const aDay = stage.startDay + a.operationDay + (a.recommendedDayOffset ?? 0);
      const bDay = stage.startDay + b.operationDay + (b.recommendedDayOffset ?? 0);
      const aHour = aDay * 24 + (a.recommendedTime ?? 9);
      const bHour = bDay * 24 + (b.recommendedTime ?? 9);
      return aHour !== bHour ? aHour - bHour : a.operationOrder - b.operationOrder;
    });

    for (const op of operations) {
      const absoluteStartDay =
        stage.startDay + op.operationDay + (op.recommendedDayOffset ?? 0);

      stageNode.children!.push({
        id: `operation_${op.id}`,
        title: op.operationName,
        type: "operation",
        parentId: `stage_${stage.id}`,
        requiredPeople: op.requiredPeople ?? 1,
        standardTime: op.standardTime ?? 4,
        startDay: absoluteStartDay,
        startHour: Math.floor(op.recommendedTime),
        editable: true,
        level: 2,
        data: op,
      });
    }

    templateNode.children!.push(stageNode);
  }

  return [templateNode];
}

/** Generate time blocks from Gantt nodes */
export function generateTimeBlocks(
  nodes: GanttNode[],
  stages: ProcessStage[],
): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  const seen = new Set<string>();

  const processNode = (node: GanttNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);

    if (node.type === "stage") {
      const stageCode = node.stageCode ?? "DEFAULT";
      let stageStartHour = (node.startDay ?? 0) * 24;
      let stageEndHour = stageStartHour + 24;

      if (node.children?.length) {
        let earliest = Infinity;
        let latest = -Infinity;

        for (const child of node.children) {
          const opData = child.data as StageOperation | undefined;
          const day = child.startDay ?? node.startDay ?? 0;
          const time = opData?.recommendedTime ?? 9;
          const start = day * 24 + time;
          const duration = child.standardTime ?? 4;
          earliest = Math.min(earliest, day);
          latest = Math.max(latest, start + duration);
        }

        if (earliest !== Infinity) {
          stageStartHour = earliest * 24;
          stageEndHour = Math.max(stageStartHour + 24, Math.ceil(latest / 24) * 24);
        }
      }

      const dur = stageEndHour - stageStartHour;
      if (!isNaN(stageStartHour) && dur > 0) {
        blocks.push({
          id: `stage_block_${node.id}`,
          nodeId: node.id,
          title: `${stageCode} - ${node.title}`,
          startHour: stageStartHour,
          durationHours: dur,
          color: getOperationColor(stageCode, 0.2),
          isStage: true,
        });
      }
    }

    if (node.type === "operation") {
      let stageCode = "DEFAULT";
      if (node.parentId?.includes("stage_")) {
        const stageId = node.parentId.replace("stage_", "");
        const stage = stages.find((s) => s.id.toString() === stageId);
        stageCode = stage?.stageCode ?? "DEFAULT";
      }

      const opData = node.data as StageOperation | undefined;
      const recTime = opData?.recommendedTime ?? 9;
      const day = node.startDay ?? 0;
      const absStart = day * 24 + recTime;
      const duration = node.standardTime ?? 4;

      // Time window block
      const wStart = opData?.windowStartTime ?? 7;
      const wEnd = opData?.windowEndTime ?? 18;
      const wStartOffset = opData?.windowStartDayOffset ?? 0;
      const wEndOffset = opData?.windowEndDayOffset ?? 0;
      const wStartHour = day * 24 + wStartOffset * 24 + wStart;
      const wEndHour = day * 24 + wEndOffset * 24 + wEnd;

      if (!isNaN(wStartHour) && !isNaN(wEndHour) && wEndHour > wStartHour) {
        blocks.push({
          id: `window_${node.id}`,
          nodeId: node.id,
          title: `${node.title} - 时间窗口`,
          startHour: wStartHour,
          durationHours: wEndHour - wStartHour,
          color: getOperationColor(stageCode, 0.15),
          isTimeWindow: true,
        });
      }

      // Operation block
      if (!isNaN(absStart) && duration > 0) {
        blocks.push({
          id: `block_${node.id}`,
          nodeId: node.id,
          title: `${node.title} (Day${day} ${recTime}:00-${recTime + duration}:00)`,
          startHour: absStart,
          durationHours: duration,
          color: getOperationColor(stageCode),
          isRecommended: true,
        });
      }
    }

    if (node.children) node.children.forEach(processNode);
  };

  nodes.forEach(processNode);
  return blocks;
}

/** Calculate visible time range from blocks */
export function calculateTimeRange(timeBlocks: TimeBlock[]) {
  let minDay = Infinity;
  let maxDay = -Infinity;
  let valid = false;

  for (const block of timeBlocks) {
    if (block.isStage || block.isTimeWindow) continue;
    if (isNaN(block.startHour) || isNaN(block.durationHours)) continue;

    const startDay = Math.floor(block.startHour / 24);
    const endDay = Math.floor((block.startHour + block.durationHours) / 24);

    if (!isNaN(startDay) && !isNaN(endDay)) {
      minDay = Math.min(minDay, startDay);
      maxDay = Math.max(maxDay, endDay);
      valid = true;
    }
  }

  if (!valid) return { startDay: -2, endDay: 10 };
  return { startDay: minDay - 1, endDay: maxDay + 2 };
}

/** Find a node by ID in the tree */
export function findNodeById(
  nodes: GanttNode[],
  id: string,
): GanttNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
