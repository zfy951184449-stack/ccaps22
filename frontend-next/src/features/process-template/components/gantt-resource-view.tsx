/* ── Gantt Resource View – Equipment Swimlane ────────────────────────
 *
 * Tab 3: shows each equipment/resource as a row with operation bars.
 * Includes virtual "Unassigned" row for operations without resource bindings.
 */

"use client";

import React from "react";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import { useResourceTimeline, type ResourceRow } from "../hooks/use-resource-timeline";
import { RESOURCE_TYPE_MAP, STAGE_COLORS } from "../constants";

interface GanttResourceViewProps {
  stages: ProcessStage[];
  operationsByStage: Record<string, StageOperation[]>;
}

// ── Time calculation helpers ────────────────────────────────────────

const BASE_DATE = new Date(2024, 0, 1, 0, 0, 0);

function dateToDayHour(date: Date): { day: number; hour: number } {
  const diff = date.getTime() - BASE_DATE.getTime();
  const totalHours = diff / 3600_000;
  return { day: Math.floor(totalHours / 24), hour: totalHours % 24 };
}

// ── Component ───────────────────────────────────────────────────────

export function GanttResourceView({
  stages,
  operationsByStage,
}: GanttResourceViewProps) {
  const rows = useResourceTimeline(stages, operationsByStage);

  // Calculate total days for the timeline
  const totalDays = Math.max(
    28,
    ...stages.map((s) => {
      const ops = operationsByStage[String(s.id)] ?? [];
      const maxOpEnd = Math.max(
        0,
        ...ops.map(
          (op) =>
            s.startDay + (op.operationDay ?? 0) + Math.ceil((op.standardTime ?? 4) / 24),
        ),
      );
      return maxOpEnd;
    }),
  );

  const dayWidth = 48; // px per day
  const rowHeight = 40;
  const sidebarWidth = 180;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-sm text-[var(--pl-text-tertiary)]">
        <p className="text-lg">📦</p>
        <p className="mt-2">暂无设备占用数据</p>
        <p className="mt-0.5 text-[11px]">请先为工序配置设备需求</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="overflow-hidden rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]">
        {/* Timeline container */}
        <div className="flex">
          {/* Sidebar: resource names */}
          <div
            className="shrink-0 border-r border-[var(--pl-border)] bg-[var(--pl-surface)]"
            style={{ width: sidebarWidth }}
          >
            {/* Header */}
            <div
              className="flex items-center border-b border-[var(--pl-border)] px-3 text-[11px] font-semibold text-[var(--pl-text-tertiary)]"
              style={{ height: 32 }}
            >
              设备/资源
            </div>
            {/* Resource rows */}
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 border-b border-[var(--pl-border)] px-3"
                style={{ height: rowHeight }}
              >
                <span className="text-sm">{row.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-[var(--pl-text-primary)]">
                    {row.name}
                  </div>
                  <div className="text-[10px] text-[var(--pl-text-tertiary)]">
                    {RESOURCE_TYPE_MAP[row.type]?.label ?? row.type}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div className="flex-1 overflow-x-auto">
            {/* Day headers */}
            <div
              className="flex border-b border-[var(--pl-border)]"
              style={{ height: 32 }}
            >
              {Array.from({ length: totalDays }, (_, d) => (
                <div
                  key={d}
                  className="flex shrink-0 items-center justify-center border-r border-[var(--pl-border)]/30 text-[10px] font-medium text-[var(--pl-text-tertiary)]"
                  style={{ width: dayWidth }}
                >
                  D{d}
                </div>
              ))}
            </div>

            {/* Resource rows with task bars */}
            {rows.map((row) => (
              <ResourceRowBar
                key={row.id}
                row={row}
                totalDays={totalDays}
                dayWidth={dayWidth}
                rowHeight={rowHeight}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resource Row with Task Bars ─────────────────────────────────────

function ResourceRowBar({
  row,
  totalDays,
  dayWidth,
  rowHeight,
}: {
  row: ResourceRow;
  totalDays: number;
  dayWidth: number;
  rowHeight: number;
}) {
  const isUnassigned = row.type === "UNASSIGNED";

  return (
    <div
      className={[
        "relative border-b border-[var(--pl-border)]",
        isUnassigned ? "bg-[var(--pl-danger-soft)]/20" : "",
      ].join(" ")}
      style={{ height: rowHeight, width: totalDays * dayWidth }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: totalDays }, (_, d) => (
          <div
            key={d}
            className="shrink-0 border-r border-[var(--pl-border)]/10"
            style={{ width: dayWidth }}
          />
        ))}
      </div>

      {/* Task bars */}
      {row.tasks.map((task, i) => {
        const { day: startDay, hour: startHour } = dateToDayHour(task.start);
        const left = startDay * dayWidth + (startHour / 24) * dayWidth;
        const durationHours = task.duration;
        const width = Math.max(8, (durationHours / 24) * dayWidth);
        const color = STAGE_COLORS[(task._stageIndex ?? 0) % STAGE_COLORS.length];

        return (
          <div
            key={`${task.id}-${i}`}
            className="absolute top-1.5 rounded-[3px] px-1.5 text-[10px] font-medium leading-[22px] text-white shadow-sm transition-shadow duration-150 hover:shadow-md"
            style={{
              left,
              width,
              height: rowHeight - 12,
              backgroundColor: color.border,
              borderLeft: isUnassigned ? `2px dashed ${color.border}` : undefined,
              opacity: isUnassigned ? 0.7 : 1,
            }}
            title={`${task.text}\n${durationHours}h · ${task._requiredPeople ?? 1}人`}
          >
            <span className="block truncate">{task.text}</span>
          </div>
        );
      })}
    </div>
  );
}
