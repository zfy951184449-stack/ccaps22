/* ── GanttBars ────────────────────────────────────────────────────
 *
 * Operation bars + time windows + stage blocks rendered on the timeline.
 */

"use client";

import React from "react";
import type { FlattenedRow, TimeBlock, GanttNode, StageOperation } from "../types";
import { GANTT_LAYOUT } from "../types";

interface GanttBarsProps {
  virtualRows: FlattenedRow[];
  timeBlocks: TimeBlock[];
  hourWidth: number;
  startDay: number;
  rowIndexMap: Map<string, number>;
  onDragStart: (
    e: React.PointerEvent,
    nodeId: string,
    blockType: "operation" | "window-start" | "window-end",
    startHour: number,
    durationHours: number,
    scheduleId: number,
    stageId: number,
  ) => void;
  onNodeDoubleClick: (node: GanttNode) => void;
  readOnly?: boolean;
  readOnlyOperations?: Set<string>;
  activeHighlightOps: string[];
  hoveredRow: string | null;
  nodeMap: Map<string, GanttNode>;
}

export function GanttBars({
  virtualRows,
  timeBlocks,
  hourWidth,
  startDay,
  rowIndexMap,
  onDragStart,
  onNodeDoubleClick,
  readOnly,
  readOnlyOperations,
  activeHighlightOps,
  hoveredRow,
  nodeMap,
}: GanttBarsProps) {
  const originPx = startDay * 24 * hourWidth;

  return (
    <div className="pointer-events-none absolute inset-0">
      {timeBlocks.map((block) => {
        const rowIndex = rowIndexMap.get(block.nodeId);
        if (rowIndex === undefined) return null;

        const leftPx = block.startHour * hourWidth - originPx;
        const widthPx = block.durationHours * hourWidth;
        const topPx = rowIndex * GANTT_LAYOUT.rowHeight;

        if (block.isStage) {
          return (
            <div
              key={block.id}
              className="pointer-events-none absolute"
              style={{
                left: leftPx,
                top: topPx + 2,
                width: widthPx,
                height: GANTT_LAYOUT.rowHeight - 4,
                backgroundColor: block.color,
                borderRadius: 4,
              }}
            />
          );
        }

        if (block.isTimeWindow) {
          return (
            <div
              key={block.id}
              className="pointer-events-none absolute"
              style={{
                left: leftPx,
                top: topPx + 4,
                width: widthPx,
                height: GANTT_LAYOUT.rowHeight - 8,
                backgroundColor: block.color,
                borderRadius: 3,
                border: `1px dashed ${block.color.replace(/[\d.]+\)$/, "0.4)")}`,
              }}
            />
          );
        }

        // Operation block
        const isHighlighted = activeHighlightOps.includes(block.nodeId);
        const isHovered = hoveredRow === block.nodeId;
        const node = nodeMap.get(block.nodeId);
        const opData = node?.data as StageOperation | undefined;
        const scheduleId = opData?.id ?? parseInt(block.nodeId.replace("operation_", ""));
        const stageIdStr = node?.parentId?.replace("stage_", "") ?? "0";
        const stageId = parseInt(stageIdStr);
        const canDrag = !readOnly && !readOnlyOperations?.has(block.nodeId);

        return (
          <div
            key={block.id}
            className={`pointer-events-auto absolute flex items-center overflow-hidden transition-shadow ${
              canDrag ? "cursor-grab active:cursor-grabbing" : ""
            } ${isHighlighted ? "ring-2 ring-[var(--pl-accent)] ring-offset-1" : ""} ${
              isHovered ? "z-10 shadow-md" : ""
            }`}
            style={{
              left: leftPx,
              top: topPx + 4,
              width: Math.max(widthPx, 8),
              height: GANTT_LAYOUT.rowHeight - 8,
              backgroundColor: block.color,
              borderRadius: 4,
            }}
            onPointerDown={(e) => {
              if (canDrag && e.button === 0) {
                onDragStart(
                  e,
                  block.nodeId,
                  "operation",
                  block.startHour,
                  block.durationHours,
                  scheduleId,
                  stageId,
                );
              }
            }}
            onDoubleClick={() => {
              if (node) onNodeDoubleClick(node);
            }}
            title={block.title}
          >
            {widthPx > 40 && (
              <span className="truncate px-1.5 text-[11px] font-medium text-white drop-shadow-sm">
                {node?.title ?? ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
