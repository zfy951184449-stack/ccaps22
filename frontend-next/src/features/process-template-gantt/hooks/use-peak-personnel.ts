/* ── usePeakPersonnel ─────────────────────────────────────────────
 *
 * Calculates daily peak personnel count considering share groups.
 */

"use client";

import { useMemo } from "react";
import type {
  GanttNode,
  GanttConstraint,
  ShareGroup,
  TimeBlock,
} from "../types";

interface UsePeakPersonnelOptions {
  timeBlocks: TimeBlock[];
  ganttNodes: GanttNode[];
  startDay: number;
  endDay: number;
  constraints: GanttConstraint[];
  shareGroups: ShareGroup[];
}

interface DailyPeak {
  day: number;
  peakCount: number;
  avgCount: number;
}

export function usePeakPersonnel({
  timeBlocks,
  ganttNodes,
  startDay,
  endDay,
  shareGroups,
}: UsePeakPersonnelOptions): DailyPeak[] {
  return useMemo(() => {
    if (!timeBlocks.length) return [];

    // Build shared group membership set
    const sharedOps = new Map<number, number[]>(); // scheduleId → group member scheduleIds
    for (const group of shareGroups) {
      if (!group.members?.length) continue;
      const memberIds = group.members.map((m) => m.scheduleId);
      for (const member of group.members) {
        sharedOps.set(member.scheduleId, memberIds);
      }
    }

    // Build node lookup for required_people
    const nodePersonnel = new Map<string, number>();
    const traverse = (nodes: GanttNode[]) => {
      for (const n of nodes) {
        if (n.type === "operation") {
          nodePersonnel.set(n.id, n.requiredPeople ?? 1);
        }
        if (n.children) traverse(n.children);
      }
    };
    traverse(ganttNodes);

    const dailyPeaks: DailyPeak[] = [];

    for (let day = startDay; day <= endDay; day++) {
      const dayStart = day * 24;
      const dayEnd = (day + 1) * 24;
      let peakCount = 0;

      // For each hour in the day, sum personnel
      for (let hour = dayStart; hour < dayEnd; hour++) {
        let count = 0;
        const countedGroups = new Set<string>();

        for (const block of timeBlocks) {
          if (block.isStage || block.isTimeWindow) continue;
          const blockEnd = block.startHour + block.durationHours;
          if (block.startHour <= hour && blockEnd > hour) {
            const people = nodePersonnel.get(block.nodeId) ?? 1;
            const scheduleId = parseInt(block.nodeId.replace("operation_", ""));
            const groupMembers = sharedOps.get(scheduleId);

            if (groupMembers) {
              const groupKey = groupMembers.sort().join(",");
              if (!countedGroups.has(groupKey)) {
                countedGroups.add(groupKey);
                count += people; // Shared group: count once
              }
            } else {
              count += people;
            }
          }
        }

        peakCount = Math.max(peakCount, count);
      }

      dailyPeaks.push({ day, peakCount, avgCount: peakCount });
    }

    return dailyPeaks;
  }, [timeBlocks, ganttNodes, startDay, endDay, shareGroups]);
}
