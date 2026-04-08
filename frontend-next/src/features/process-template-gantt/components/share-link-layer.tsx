/* ── ShareLinkLayer ───────────────────────────────────────────────
 *
 * SVG overlay rendering share group connections between operations.
 */

"use client";

import React from "react";
import type { ShareGroup, TimeBlock } from "../types";
import { GANTT_LAYOUT } from "../types";

interface ShareLinkLayerProps {
  shareGroups: ShareGroup[];
  timeBlocks: TimeBlock[];
  hourWidth: number;
  startDay: number;
  rowIndexMap: Map<string, number>;
  totalWidth: number;
  totalHeight: number;
}

const SHARE_GROUP_COLORS = [
  "#7C3AED", // violet
  "#0F766E", // teal
  "#B91C1C", // red
  "#D97706", // amber
  "#2563EB", // blue
];

export function ShareLinkLayer({
  shareGroups,
  timeBlocks,
  hourWidth,
  startDay,
  rowIndexMap,
  totalWidth,
  totalHeight,
}: ShareLinkLayerProps) {
  if (!shareGroups.length) return null;

  const originPx = startDay * 24 * hourWidth;

  // Build schedule position lookup from recommended blocks
  const schedulePosMap = new Map<
    number,
    { cx: number; cy: number }
  >();
  for (const block of timeBlocks) {
    if (!block.isRecommended) continue;
    const scheduleId = parseInt(block.nodeId.replace("operation_", ""));
    const rowIndex = rowIndexMap.get(block.nodeId);
    if (rowIndex === undefined) continue;
    schedulePosMap.set(scheduleId, {
      cx: block.startHour * hourWidth - originPx + (block.durationHours * hourWidth) / 2,
      cy: rowIndex * GANTT_LAYOUT.rowHeight + GANTT_LAYOUT.rowHeight / 2,
    });
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={totalWidth}
      height={Math.max(totalHeight, 400)}
      style={{ overflow: "visible" }}
    >
      {shareGroups.map((group, gi) => {
        if (!group.members?.length) return null;
        const color = SHARE_GROUP_COLORS[gi % SHARE_GROUP_COLORS.length];
        const memberPositions = group.members
          .map((m) => schedulePosMap.get(m.scheduleId))
          .filter(Boolean) as { cx: number; cy: number }[];

        if (memberPositions.length < 2) return null;

        // Draw lines connecting members
        const lines: React.ReactNode[] = [];
        for (let i = 0; i < memberPositions.length - 1; i++) {
          const from = memberPositions[i];
          const to = memberPositions[i + 1];
          lines.push(
            <line
              key={`${group.id}-${i}`}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.6}
            />,
          );
        }

        // Draw dots at member positions
        const dots = memberPositions.map((pos, mi) => (
          <circle
            key={`${group.id}-dot-${mi}`}
            cx={pos.cx}
            cy={pos.cy}
            r={4}
            fill={color}
            opacity={0.7}
          />
        ));

        return (
          <g key={group.id}>
            {lines}
            {dots}
          </g>
        );
      })}
    </svg>
  );
}
