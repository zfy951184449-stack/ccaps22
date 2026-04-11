/* ── useStaffingPeaks – Dynamic Staffing Peak Computation ────────────
 *
 * Computes per-day personnel demand from operations and calculates
 * a dynamic threshold based on team size or shift capacity.
 */

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/services/http/client";
import type { ProcessStage, StageOperation } from "@/features/process-template-gantt/types";

// ── Types ───────────────────────────────────────────────────────────

interface DailyPeak {
  day: number;
  label: string;
  people: number;
  exceeds: boolean;
}

interface StaffingThreshold {
  dailyCapacity: number;
  source: string;
}

interface StaffingPeaksResult {
  peaks: DailyPeak[];
  threshold: StaffingThreshold;
  maxPeople: number;
  totalDays: number;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStaffingPeaks(
  stages: ProcessStage[],
  operationsByStage: Record<string, StageOperation[]>,
  teamId?: number | null,
  totalDays: number = 28,
): StaffingPeaksResult {
  // Fetch team members count if teamId available
  const { data: teamData } = useQuery({
    queryKey: ["team-members-count", teamId],
    queryFn: async () => {
      if (!teamId) return null;
      const teams = await apiFetch<{ id: number; team_name: string }[]>(
        `/organization/teams`,
      );
      return teams.find((t) => t.id === teamId) ?? null;
    },
    enabled: !!teamId,
  });

  // Fetch shift capacity
  const { data: shiftData } = useQuery({
    queryKey: ["shift-capacity"],
    queryFn: () =>
      apiFetch<{ id: number; max_people_per_shift?: number }[]>(
        `/shift-definitions`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  // ── Compute threshold ─────────────────────────────────────────────
  const threshold = useMemo<StaffingThreshold>(() => {
    // Priority 1: shift capacity
    if (shiftData?.length) {
      const maxShift = Math.max(
        ...shiftData.map((s) => s.max_people_per_shift ?? 0),
      );
      if (maxShift > 0) {
        return { dailyCapacity: maxShift, source: `班次容量: ${maxShift}人` };
      }
    }

    // Priority 2: team member count (placeholder – real API returns count)
    if (teamData) {
      return {
        dailyCapacity: Infinity, // Until we have real member count
        source: `团队: ${teamData.team_name}`,
      };
    }

    // Fallback: no threshold
    return { dailyCapacity: Infinity, source: "未配置团队/班次" };
  }, [teamData, shiftData]);

  // ── Compute daily peaks ───────────────────────────────────────────
  const peaks = useMemo<DailyPeak[]>(() => {
    const dayMap = new Map<number, number>();

    for (const stage of stages) {
      const ops = operationsByStage[String(stage.id)] ?? [];
      for (const op of ops) {
        const absDay = stage.startDay + (op.operationDay ?? 0);
        const durationDays = Math.ceil((op.standardTime ?? 4) / 24) || 1;
        const people = op.requiredPeople ?? 1;

        for (let d = absDay; d < absDay + durationDays; d++) {
          dayMap.set(d, (dayMap.get(d) ?? 0) + people);
        }
      }
    }

    const result: DailyPeak[] = [];
    for (let d = 0; d < totalDays; d++) {
      const people = dayMap.get(d) ?? 0;
      result.push({
        day: d,
        label: `D${d}`,
        people,
        exceeds: people > threshold.dailyCapacity,
      });
    }
    return result;
  }, [stages, operationsByStage, totalDays, threshold.dailyCapacity]);

  const maxPeople = Math.max(0, ...peaks.map((p) => p.people));

  return { peaks, threshold, maxPeople, totalDays };
}
