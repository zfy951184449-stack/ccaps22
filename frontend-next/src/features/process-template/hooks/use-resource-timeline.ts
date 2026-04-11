/* ── useResourceTimeline – Equipment Utilization Hook ─────────────────
 *
 * Builds resource-row data for the "Gantt by Equipment" view.
 * Includes virtual "Unassigned" row for operations without resource bindings.
 */

"use client";

import { useMemo } from "react";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import {
  UNASSIGNED_RESOURCE_ID,
  UNASSIGNED_RESOURCE_NAME,
} from "../constants";
import type { SvarTask } from "../adapters";
import { operationToTask } from "../adapters";

// ── Types ───────────────────────────────────────────────────────────

export interface ResourceRow {
  id: number;
  name: string;
  type: string;
  icon: string;
  tasks: SvarTask[];
}

// ── Hook ────────────────────────────────────────────────────────────

export function useResourceTimeline(
  stages: ProcessStage[],
  operationsByStage: Record<string, StageOperation[]>,
): ResourceRow[] {
  return useMemo(() => {
    const resourceMap = new Map<number, ResourceRow>();

    // Always create unassigned row
    resourceMap.set(UNASSIGNED_RESOURCE_ID, {
      id: UNASSIGNED_RESOURCE_ID,
      name: UNASSIGNED_RESOURCE_NAME,
      type: "UNASSIGNED",
      icon: "⚠️",
      tasks: [],
    });

    for (const [stageIdx, stage] of stages.entries()) {
      const ops = operationsByStage[String(stage.id)] ?? [];

      for (const op of ops) {
        const task = operationToTask(op, stage, stageIdx);
        const requirements = op.resourceRequirements ?? [];

        if (
          requirements.length === 0 ||
          requirements.every((r) => r.candidateResourceIds.length === 0)
        ) {
          // Unassigned: no resource requirements or no candidates
          resourceMap.get(UNASSIGNED_RESOURCE_ID)!.tasks.push(task);
        } else {
          // Assigned: add to each resource row
          for (const rule of requirements) {
            for (const candidate of rule.candidateResources) {
              if (!resourceMap.has(candidate.id)) {
                const typeMap: Record<string, string> = {
                  ROOM: "🏢",
                  EQUIPMENT: "⚗️",
                  VESSEL_CONTAINER: "🔬",
                  TOOLING: "🔧",
                  STERILIZATION_RESOURCE: "🧪",
                };
                resourceMap.set(candidate.id, {
                  id: candidate.id,
                  name: candidate.resourceName,
                  type: candidate.resourceType,
                  icon: typeMap[candidate.resourceType] ?? "📦",
                  tasks: [],
                });
              }
              resourceMap.get(candidate.id)!.tasks.push({ ...task });
            }
          }
        }
      }
    }

    // Sort: unassigned first, then by resource name
    const rows = Array.from(resourceMap.values());
    rows.sort((a, b) => {
      if (a.id === UNASSIGNED_RESOURCE_ID) return -1;
      if (b.id === UNASSIGNED_RESOURCE_ID) return 1;
      return a.name.localeCompare(b.name);
    });

    // Remove unassigned row if empty
    if (rows[0]?.id === UNASSIGNED_RESOURCE_ID && rows[0].tasks.length === 0) {
      rows.shift();
    }

    return rows;
  }, [stages, operationsByStage]);
}
