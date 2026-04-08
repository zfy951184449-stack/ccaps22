/* ── GanttTimeline ────────────────────────────────────────────────
 *
 * Background layer: day separators, hour gridlines, row stripes.
 */

"use client";

import React from "react";
import type { FlattenedRow } from "../types";
import { GANTT_LAYOUT } from "../types";

interface GanttTimelineProps {
  startDay: number;
  endDay: number;
  hourWidth: number;
  totalHeight: number;
  virtualRows: FlattenedRow[];
  stageColorMap: Map<number, string>;
  onHoverRow: (id: string | null) => void;
  baseDate?: string;
}

export function GanttTimeline({
  startDay,
  endDay,
  hourWidth,
  totalHeight,
  virtualRows,
  stageColorMap,
  onHoverRow,
}: GanttTimelineProps) {
  const days: number[] = [];
  for (let d = startDay; d <= endDay; d++) days.push(d);
  const dayWidth = 24 * hourWidth;
  const totalWidth = days.length * dayWidth;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ width: totalWidth, height: Math.max(totalHeight, 400) }}
    >
      {/* Day separator lines */}
      {days.map((day, i) => (
        <div
          key={`day-${day}`}
          className="absolute top-0 border-r border-[var(--pl-border)]"
          style={{
            left: i * dayWidth,
            width: dayWidth,
            height: "100%",
          }}
        >
          {/* Hour gridlines */}
          {hourWidth >= 3 &&
            Array.from({ length: 24 }, (_, h) =>
              h > 0 ? (
                <div
                  key={h}
                  className="absolute top-0 h-full border-l border-dashed"
                  style={{
                    left: h * hourWidth,
                    borderColor: h % 6 === 0 ? "var(--pl-border)" : "transparent",
                    opacity: h % 6 === 0 ? 0.5 : 0,
                  }}
                />
              ) : null,
            )}
        </div>
      ))}

      {/* Row stripe backgrounds */}
      {virtualRows.map((row, i) => {
        let bgColor = "transparent";
        if (row.node.type === "stage") {
          const stageId = parseInt(row.id.replace("stage_", ""));
          const color = stageColorMap.get(stageId);
          if (color) bgColor = `${color}08`;
        }

        return (
          <div
            key={row.id}
            className="pointer-events-auto absolute w-full border-b border-[var(--pl-border)]"
            style={{
              top: i * GANTT_LAYOUT.rowHeight,
              height: GANTT_LAYOUT.rowHeight,
              backgroundColor: bgColor !== "transparent" ? bgColor : i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
            }}
            onMouseEnter={() => onHoverRow(row.id)}
            onMouseLeave={() => onHoverRow(null)}
          />
        );
      })}
    </div>
  );
}
