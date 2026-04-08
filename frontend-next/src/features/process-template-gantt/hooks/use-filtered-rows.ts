/* ── useFilteredRows ──────────────────────────────────────────────
 *
 * Filters virtual rows when in single-day expanded mode.
 * Extracted from legacy index.tsx inline logic.
 */

"use client";

import { useMemo } from "react";
import type { FlattenedRow, TimeBlock } from "../types";

export function useFilteredRows(
  virtualRows: FlattenedRow[],
  expandedDay: number | null,
  timeBlocks: TimeBlock[],
) {
  const filteredRows = useMemo(() => {
    if (expandedDay === null) return virtualRows;

    const dayStartHour = expandedDay * 24;
    const dayEndHour = (expandedDay + 1) * 24;

    const operationIdsOnDay = new Set<string>();
    const stageIdsWithOps = new Set<string>();

    for (const block of timeBlocks) {
      if (block.isStage || block.isTimeWindow) continue;
      const blockEnd = block.startHour + block.durationHours;
      if (!(blockEnd <= dayStartHour || block.startHour >= dayEndHour)) {
        operationIdsOnDay.add(block.nodeId);
        const row = virtualRows.find((r) => r.id === block.nodeId);
        if (row?.parentId) stageIdsWithOps.add(row.parentId);
      }
    }

    return virtualRows.filter((row) => {
      if (row.node.type === "template") return true;
      if (row.node.type === "stage") return stageIdsWithOps.has(row.id);
      return operationIdsOnDay.has(row.id);
    });
  }, [virtualRows, expandedDay, timeBlocks]);

  const filteredRowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((row, i) => map.set(row.id, i));
    return map;
  }, [filteredRows]);

  return { filteredRows, filteredRowIndexMap };
}
