/* ── Gantt Phase View – SVAR Summary Folding ─────────────────────────
 *
 * Tab 2: SVAR React Gantt with stage-level summary folding.
 * Each stage collapses to a single summary bar.
 */

"use client";

import React, { useMemo } from "react";
import { Gantt } from "@svar-ui/react-gantt";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import { buildPhaseGanttData } from "../adapters";

interface GanttPhaseViewProps {
  stages: ProcessStage[];
  operationsByStage: Record<string, StageOperation[]>;
}

export function GanttPhaseView({
  stages,
  operationsByStage,
}: GanttPhaseViewProps) {
  const { tasks } = useMemo(
    () => buildPhaseGanttData(stages, operationsByStage),
    [stages, operationsByStage],
  );

  // Transform to SVAR format — only summary tasks get `open` property
  const svarTasks = useMemo(() => {
    return tasks.map((t) => {
      const base = {
        id: t.id,
        text: t.text,
        start: t.start,
        end: t.end,
        duration: t.duration,
        progress: t.progress,
        parent: t.parent ?? 0,
        type: t.type ?? "task",
      };
      // Only summary/parent tasks need the open flag
      if (t.type === "summary") {
        return { ...base, open: false };
      }
      return base;
    });
  }, [tasks]);

  const svarLinks = useMemo<never[]>(() => [], []);

  // SVAR columns config
  const columns = useMemo(
    () => [
      { id: "text", header: "阶段 / 工序", width: 220 },
    ],
    [],
  );

  // SVAR scales — use proper date format function
  const scales = useMemo(
    () => [
      {
        unit: "month" as const,
        step: 1,
        format: (date: Date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      },
      {
        unit: "day" as const,
        step: 1,
        format: (date: Date) => String(date.getDate()),
      },
    ],
    [],
  );

  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[var(--pl-text-tertiary)]">
        暂无阶段数据，请先在「阶段编排」中添加阶段
      </div>
    );
  }

  return (
    <div className="h-full px-6 py-4">
      <div
        className="overflow-hidden rounded-[var(--pl-radius-md)] border border-[var(--pl-border)]"
        style={{ height: "calc(100vh - 300px)", minHeight: 400 }}
      >
        <Gantt
          tasks={svarTasks}
          links={svarLinks}
          columns={columns}
          scales={scales}
          cellWidth={40}
          cellHeight={28}
        />
      </div>
    </div>
  );
}
