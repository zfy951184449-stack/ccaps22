/* ── Template Summary Strip ──────────────────────────────────────────
 *
 * Compact row of stat cards summarizing the template.
 */

"use client";

import type { ProcessTemplate, ProcessStage } from "@/features/process-template-gantt/types";

interface TemplateSummaryStripProps {
  template: ProcessTemplate;
  stages: ProcessStage[];
  allOperations: Array<{ requiredPeople?: number }>;
}

export function TemplateSummaryStrip({
  template,
  stages,
  allOperations,
}: TemplateSummaryStripProps) {
  const totalOps = allOperations.length;
  const totalPeople = allOperations.reduce(
    (acc, op) => acc + (op.requiredPeople ?? 1),
    0,
  );

  const stats = [
    { label: "阶段", value: stages.length, unit: "个" },
    { label: "工序", value: totalOps, unit: "个" },
    { label: "总天数", value: template.totalDays, unit: "天" },
    { label: "总人次", value: totalPeople, unit: "人次" },
    { label: "团队", value: template.teamName ?? "—", unit: "" },
  ];

  return (
    <div className="flex items-center gap-4 px-6 py-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex items-baseline gap-1.5 rounded-[var(--pl-radius-sm)] bg-[var(--pl-surface)] px-3 py-1.5"
        >
          <span className="text-[11px] font-medium text-[var(--pl-text-tertiary)]">
            {s.label}
          </span>
          <span className="text-sm font-semibold tabular-nums text-[var(--pl-text-primary)]">
            {s.value}
          </span>
          {s.unit && (
            <span className="text-[11px] text-[var(--pl-text-tertiary)]">
              {s.unit}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
