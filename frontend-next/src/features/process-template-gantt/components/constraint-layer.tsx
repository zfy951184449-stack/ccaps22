/* ── ConstraintLayer ──────────────────────────────────────────────
 *
 * SVG overlay rendering constraint arrows between operations.
 */

"use client";

import React from "react";
import type { GanttConstraint, TimeBlock } from "../types";
import { GANTT_LAYOUT } from "../types";

interface ConstraintLayerProps {
  constraints: GanttConstraint[];
  timeBlocks: TimeBlock[];
  hourWidth: number;
  startDay: number;
  rowIndexMap: Map<string, number>;
  totalWidth: number;
  totalHeight: number;
  activeHighlightConstraints: number[];
}

interface ArrowPath {
  constraintId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHighlighted: boolean;
}

export function ConstraintLayer({
  constraints,
  timeBlocks,
  hourWidth,
  startDay,
  rowIndexMap,
  totalWidth,
  totalHeight,
  activeHighlightConstraints,
}: ConstraintLayerProps) {
  if (!constraints.length) return null;

  const originPx = startDay * 24 * hourWidth;

  // Build block position lookup
  const blockPosMap = new Map<
    number,
    { left: number; width: number; top: number }
  >();
  for (const block of timeBlocks) {
    if (!block.isRecommended) continue;
    const scheduleId = parseInt(block.nodeId.replace("operation_", ""));
    const rowIndex = rowIndexMap.get(block.nodeId);
    if (rowIndex === undefined) continue;
    blockPosMap.set(scheduleId, {
      left: block.startHour * hourWidth - originPx,
      width: block.durationHours * hourWidth,
      top: rowIndex * GANTT_LAYOUT.rowHeight + GANTT_LAYOUT.rowHeight / 2,
    });
  }

  const arrows: ArrowPath[] = [];

  for (const c of constraints) {
    const from = blockPosMap.get(c.fromScheduleId);
    const to = blockPosMap.get(c.toScheduleId);
    if (!from || !to) continue;

    arrows.push({
      constraintId: c.constraintId,
      x1: from.left + from.width,
      y1: from.top,
      x2: to.left,
      y2: to.top,
      isHighlighted: activeHighlightConstraints.includes(c.constraintId),
    });
  }

  if (!arrows.length) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={totalWidth}
      height={Math.max(totalHeight, 400)}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="gantt-arrow"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="var(--pl-text-tertiary)"
            opacity="0.6"
          />
        </marker>
        <marker
          id="gantt-arrow-active"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="var(--pl-accent)"
          />
        </marker>
      </defs>

      {arrows.map((a) => {
        const dx = a.x2 - a.x1;
        const dy = a.y2 - a.y1;
        const cx = a.x1 + dx * 0.5;
        const cpOffset = Math.min(Math.abs(dy) * 0.3, 40);

        const path =
          Math.abs(dy) < 4
            ? `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`
            : `M ${a.x1} ${a.y1} C ${cx} ${a.y1 + cpOffset * Math.sign(dy)}, ${cx} ${a.y2 - cpOffset * Math.sign(dy)}, ${a.x2} ${a.y2}`;

        return (
          <path
            key={a.constraintId}
            d={path}
            fill="none"
            stroke={a.isHighlighted ? "var(--pl-accent)" : "var(--pl-text-tertiary)"}
            strokeWidth={a.isHighlighted ? 2 : 1}
            strokeDasharray={a.isHighlighted ? "none" : "4 3"}
            opacity={a.isHighlighted ? 1 : 0.5}
            markerEnd={
              a.isHighlighted
                ? "url(#gantt-arrow-active)"
                : "url(#gantt-arrow)"
            }
          />
        );
      })}
    </svg>
  );
}
