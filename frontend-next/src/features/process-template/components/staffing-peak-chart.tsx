/* ── Staffing Peak Chart ─────────────────────────────────────────────
 *
 * recharts bar chart showing daily personnel demand with dynamic threshold.
 */

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";
import { useStaffingPeaks } from "../hooks/use-staffing-peaks";

interface StaffingPeakChartProps {
  stages: ProcessStage[];
  operationsByStage: Record<string, StageOperation[]>;
  teamId?: number | null;
  totalDays?: number;
}

export function StaffingPeakChart({
  stages,
  operationsByStage,
  teamId,
  totalDays = 28,
}: StaffingPeakChartProps) {
  const { peaks, threshold, maxPeople } = useStaffingPeaks(
    stages,
    operationsByStage,
    teamId,
    totalDays,
  );

  if (peaks.every((p) => p.people === 0)) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-[var(--pl-text-tertiary)]">
        暂无人员需求数据
      </div>
    );
  }

  const showThreshold = threshold.dailyCapacity < Infinity;
  const yMax = Math.max(maxPeople, showThreshold ? threshold.dailyCapacity : 0) + 2;

  return (
    <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--pl-text-primary)]">
          人员峰值分布
        </h3>
        {showThreshold && (
          <span className="text-[11px] text-[var(--pl-text-tertiary)]">
            阈值: {threshold.dailyCapacity}人 ({threshold.source})
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={peaks} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--pl-border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--pl-text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(totalDays / 14) - 1)}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 10, fill: "var(--pl-text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border)",
              borderRadius: "var(--pl-radius-sm)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--pl-text-primary)" }}
            formatter={(val) => [`${val}人`, "需求"]}
          />
          {showThreshold && (
            <ReferenceLine
              y={threshold.dailyCapacity}
              stroke="var(--pl-danger)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `阈值 ${threshold.dailyCapacity}`,
                fontSize: 10,
                fill: "var(--pl-danger)",
                position: "right",
              }}
            />
          )}
          <Bar dataKey="people" radius={[2, 2, 0, 0]} maxBarSize={18}>
            {peaks.map((entry) => (
              <Cell
                key={entry.day}
                fill={entry.exceeds ? "var(--pl-danger)" : "var(--pl-accent)"}
                fillOpacity={entry.people === 0 ? 0 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
