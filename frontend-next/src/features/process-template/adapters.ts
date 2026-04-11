/* ── Adapters – Domain Model ↔ SVAR Gantt Mapping ────────────────────
 *
 * Transforms StageOperation / ProcessStage into SVAR React Gantt Task
 * format for both phase-based and resource-based views.
 */

import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import { STAGE_COLORS } from "./constants";

// ── SVAR Task Types ─────────────────────────────────────────────────

export interface SvarTask {
  id: number;
  text: string;
  start: Date;
  end: Date;
  duration: number;
  progress: number;
  parent?: number;
  type?: "task" | "summary";
  /** custom data for our rendering */
  _stageIndex?: number;
  _requiredPeople?: number;
  _operationCode?: string;
}

export interface SvarLink {
  id: number;
  source: number;
  target: number;
  type: "e2s" | "s2s" | "e2e" | "s2e"; // FS / SS / FF / SF
}

// ── Reference epoch ─────────────────────────────────────────────────
// We use a fixed base date to convert relative day/hour into absolute dates.
const BASE_DATE = new Date(2024, 0, 1, 0, 0, 0);

function dayHourToDate(day: number, hour: number): Date {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ── Stage → Summary Task ────────────────────────────────────────────

export function stageToSummaryTask(
  stage: ProcessStage,
  operations: StageOperation[],
  stageIndex: number,
): SvarTask {
  // Compute span from operations
  let minStart = dayHourToDate(stage.startDay, 0);
  let maxEnd = dayHourToDate(stage.startDay + 1, 0);

  if (operations.length > 0) {
    const starts = operations.map((op) =>
      dayHourToDate(stage.startDay + (op.operationDay ?? 0), op.recommendedTime),
    );
    const ends = operations.map((op) => {
      const s = dayHourToDate(stage.startDay + (op.operationDay ?? 0), op.recommendedTime);
      return new Date(s.getTime() + (op.standardTime ?? 4) * 3600_000);
    });
    minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
    maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  }

  return {
    id: -stage.id, // negative to avoid ID collision with operations
    text: `${stage.stageName} (Day ${stage.startDay})`,
    start: minStart,
    end: maxEnd,
    duration: Math.ceil((maxEnd.getTime() - minStart.getTime()) / 3600_000),
    progress: 0,
    type: "summary",
    _stageIndex: stageIndex,
  };
}

// ── Operation → Task ────────────────────────────────────────────────

export function operationToTask(
  op: StageOperation,
  stage: ProcessStage,
  stageIndex: number,
): SvarTask {
  const start = dayHourToDate(
    stage.startDay + (op.operationDay ?? 0),
    op.recommendedTime,
  );
  const durationHours = op.standardTime ?? 4;
  const end = new Date(start.getTime() + durationHours * 3600_000);

  return {
    id: op.id,
    text: op.operationName,
    start,
    end,
    duration: durationHours,
    progress: 0,
    parent: -stage.id, // reference to summary task
    type: "task",
    _stageIndex: stageIndex,
    _requiredPeople: op.requiredPeople ?? 1,
    _operationCode: op.operationCode,
  };
}

// ── Build full task set for SVAR ────────────────────────────────────

export function buildPhaseGanttData(
  stages: ProcessStage[],
  operationsByStage: Record<string, StageOperation[]>,
): { tasks: SvarTask[]; links: SvarLink[] } {
  const tasks: SvarTask[] = [];

  stages.forEach((stage, idx) => {
    const ops = operationsByStage[String(stage.id)] ?? [];
    tasks.push(stageToSummaryTask(stage, ops, idx));
    ops.forEach((op) => tasks.push(operationToTask(op, stage, idx)));
  });

  return { tasks, links: [] };
}

// ── Color for a stage by index ──────────────────────────────────────

export function getStageColor(stageIndex: number) {
  return STAGE_COLORS[stageIndex % STAGE_COLORS.length];
}
