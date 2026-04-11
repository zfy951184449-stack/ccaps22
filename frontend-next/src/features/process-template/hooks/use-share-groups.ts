/* ── useShareGroups – Share Group CRUD + Selection Mode ───────────────
 *
 * Manages share group data, creation, deletion, and the selection mode
 * for adding operations to a new share group.
 */

"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/process-template-api";

export function useShareGroups(templateId: number) {
  const queryClient = useQueryClient();
  const queryKey = ["process-template-detail", templateId];

  // ── Selection mode state ──────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [newGroupMode, setNewGroupMode] = useState<"SAME_TEAM" | "DIFFERENT">("SAME_TEAM");

  const enterSelectMode = useCallback(() => {
    setIsSelectMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((scheduleId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: {
      groupName: string;
      shareMode: "SAME_TEAM" | "DIFFERENT";
      memberIds: number[];
    }) => api.createShareGroup(templateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      exitSelectMode();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: number) => api.deleteShareGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // ── Create flow ───────────────────────────────────────────────────

  const confirmCreate = useCallback(
    (groupName: string) => {
      if (selectedIds.size < 2) return;
      createMutation.mutate({
        groupName,
        shareMode: newGroupMode,
        memberIds: Array.from(selectedIds),
      });
    },
    [selectedIds, newGroupMode, createMutation],
  );

  return {
    // Selection mode
    isSelectMode,
    selectedIds,
    newGroupMode,
    setNewGroupMode,
    enterSelectMode,
    exitSelectMode,
    toggleSelect,
    confirmCreate,
    // Mutations
    deleteGroup: deleteMutation,
    isCreating: createMutation.isPending,
  };
}
