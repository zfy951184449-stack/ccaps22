/* ── Gantt Phase View – SVAR Summary Folding ─────────────────────────
 *
 * Tab 2: SVAR React Gantt with stage-level summary folding.
 * Each stage collapses to a single summary bar.
 *
 * SVAR relies on browser DOM APIs, so we use dynamic import + ssr: false.
 */

"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import { buildPhaseGanttData } from "../adapters";

// Dynamic import SVAR Gantt — it uses browser APIs (DOM, Canvas)
const SvarGantt = dynamic(
  () => import("@svar-ui/react-gantt").then((mod) => ({ default: mod.Gantt })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--pl-text-tertiary)]">
        加载甘特图组件…
      </div>
    ),
  },
);

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
        return { ...base, open: true };
      }
      return base;
    });
  }, [tasks]);

  // Stable empty array for links
  const svarLinks = useMemo<never[]>(() => [], []);

  // SVAR columns config
  const columns = useMemo(
    () => [
      { id: "text", header: "阶段 / 工序", width: 220 },
    ],
    [],
  );

  // SVAR scales — use proper date format functions
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
        <SvarGantt
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
