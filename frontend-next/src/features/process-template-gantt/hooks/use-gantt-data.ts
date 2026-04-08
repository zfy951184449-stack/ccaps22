/* ── useGanttData ──────────────────────────────────────────────────
 *
 * Loads template data (template mode) or accepts external data (batch mode).
 * Produces: ganttNodes, stages, timeBlocks, expandedKeys.
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  GanttMode,
  ProcessTemplate,
  ProcessStage,
  StageOperation,
  GanttNode,
  TimeBlock,
} from "../types";
import { buildGanttNodes, generateTimeBlocks } from "../utils";
import * as api from "@/services/process-template-api";

interface UseGanttDataOptions {
  mode: GanttMode;
  template: ProcessTemplate;
  externalData?: {
    ganttNodes: GanttNode[];
    startDay: number;
    endDay: number;
    baseDate?: string;
  };
}

export function useGanttData({ mode, template, externalData }: UseGanttDataOptions) {
  const isExternalMode = mode === "batch" && !!externalData;

  // Template mode: fetch from API
  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ["template-gantt", template.id],
    queryFn: () => api.fetchTemplateGanttData(template.id),
    enabled: !isExternalMode,
    staleTime: 30_000,
  });

  const stages: ProcessStage[] = useMemo(
    () => (isExternalMode ? [] : data?.stages ?? []),
    [isExternalMode, data?.stages],
  );

  const stageOpsMap: Record<string, StageOperation[]> = useMemo(
    () => (isExternalMode ? {} : (data?.operations ?? {}) as Record<string, StageOperation[]>),
    [isExternalMode, data?.operations],
  );

  // Build or use external nodes
  const [localNodes, setLocalNodes] = useState<GanttNode[]>([]);

  const ganttNodes: GanttNode[] = useMemo(() => {
    if (isExternalMode) return externalData!.ganttNodes;
    if (!data) { console.log("[GanttData] data is null/undefined"); return []; }
    console.log("[GanttData] building nodes:", { template: data.template?.templateName, stagesCount: stages.length, opsKeys: Object.keys(stageOpsMap) });
    const built = buildGanttNodes(data.template, stages, stageOpsMap);
    console.log("[GanttData] built nodes:", JSON.stringify(built.map(n => ({ id: n.id, title: n.title, childrenCount: n.children?.length }))));
    return built;
  }, [isExternalMode, externalData, data, stages, stageOpsMap]);

  // Allow local overrides (for drag updates without API re-fetch)
  const effectiveNodes = localNodes.length > 0 ? localNodes : ganttNodes;

  const setGanttNodes = useCallback((updater: GanttNode[] | ((prev: GanttNode[]) => GanttNode[])) => {
    setLocalNodes((prev) => {
      const base = prev.length > 0 ? prev : ganttNodes;
      return typeof updater === "function" ? updater(base) : updater;
    });
  }, [ganttNodes]);

  const timeBlocks: TimeBlock[] = useMemo(
    () => generateTimeBlocks(effectiveNodes, stages),
    [effectiveNodes, stages],
  );

  // Expanded keys state
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => [
    template.id.toString(),
  ]);

  // Available operations library (for creating new operations)
  const { data: availableOperations = [] } = useQuery({
    queryKey: ["operation-library"],
    queryFn: api.listOperations,
    enabled: !isExternalMode,
    staleTime: 60_000,
  });

  const refreshData = useCallback(async () => {
    setLocalNodes([]);
    await refetch();
  }, [refetch]);

  return {
    stages,
    ganttNodes: effectiveNodes,
    setGanttNodes,
    timeBlocks,
    expandedKeys,
    setExpandedKeys,
    refreshData,
    availableOperations,
    isExternalMode,
    isLoading,
    isError,
    error,
    constraints: data?.constraints ?? [],
    shareGroups: data?.shareGroups ?? [],
  };
}
