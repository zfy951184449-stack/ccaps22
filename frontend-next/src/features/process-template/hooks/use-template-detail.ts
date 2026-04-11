/* ── useTemplateDetail – Process Template Detail Hook ─────────────────
 *
 * Fetches template + stages + operations + constraints + shareGroups.
 * Wraps the composite `fetchTemplateGanttData` API.
 */

"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/process-template-api";

// Stable empty references to avoid re-render loops
const EMPTY_STAGES: never[] = [];
const EMPTY_OPS: Record<string, never[]> = {};
const EMPTY_CONSTRAINTS: never[] = [];
const EMPTY_SHARE_GROUPS: never[] = [];

export function useTemplateDetail(templateId: number) {
  const queryClient = useQueryClient();
  const queryKey = ["process-template-detail", templateId] as const;

  // ── Composite fetch ───────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => api.fetchTemplateGanttData(templateId),
    enabled: templateId > 0,
  });

  // ── Mutations ─────────────────────────────────────────────────────

  const updateTemplateMutation = useMutation({
    mutationFn: (payload: {
      templateName: string;
      teamId?: number | null;
      description?: string | null;
    }) => api.updateTemplate(templateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const createStageMutation = useMutation({
    mutationFn: (payload: {
      stageName: string;
      stageOrder?: number;
      startDay?: number;
    }) =>
      api.createStage(templateId, {
        stageName: payload.stageName,
        stageOrder: payload.stageOrder ?? ((data?.stages?.length ?? 0) + 1),
        startDay: payload.startDay ?? computeNextStartDay(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const addOperationMutation = useMutation({
    mutationFn: (payload: {
      stageId: number;
      operationId: number;
      operationDay?: number;
      recommendedTime?: number;
    }) =>
      api.createStageOperation(payload.stageId, {
        operationId: payload.operationId,
        operationDay: payload.operationDay ?? 0,
        recommendedTime: payload.recommendedTime ?? 9,
        windowStartTime: 7,
        windowEndTime: 18,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteOperationMutation = useMutation({
    mutationFn: (scheduleId: number) =>
      api.deleteStageOperation(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Derived data (stable references) ──────────────────────────────
  const template = data?.template ?? null;
  const stages = data?.stages ?? EMPTY_STAGES;
  const operationsByStage = data?.operations ?? EMPTY_OPS;
  const constraints = data?.constraints ?? EMPTY_CONSTRAINTS;
  const shareGroups = data?.shareGroups ?? EMPTY_SHARE_GROUPS;

  // Memoized flat list of all operations across stages
  const allOperations = useMemo(
    () =>
      stages.flatMap((s) =>
        (operationsByStage[String(s.id)] ?? []).map((op) => ({
          ...op,
          stage: s,
        })),
      ),
    [stages, operationsByStage],
  );

  /** Compute suggested start_day for a new stage based on last stage's end. */
  function computeNextStartDay(): number {
    if (stages.length === 0) return 0;
    const lastStage = stages[stages.length - 1];
    const lastStageOps = operationsByStage[String(lastStage.id)] ?? [];
    if (lastStageOps.length === 0) return lastStage.startDay + 1;
    const maxDay = Math.max(
      ...lastStageOps.map((op) => op.operationDay + Math.ceil((op.standardTime ?? 4) / 24)),
    );
    return lastStage.startDay + maxDay;
  }

  return {
    template,
    stages,
    operationsByStage,
    constraints,
    shareGroups,
    allOperations,
    isLoading,
    isError,
    error,
    computeNextStartDay,
    // mutations
    updateTemplate: updateTemplateMutation,
    createStage: createStageMutation,
    addOperation: addOperationMutation,
    deleteOperation: deleteOperationMutation,
    invalidate: () => queryClient.invalidateQueries({ queryKey }),
  };
}
