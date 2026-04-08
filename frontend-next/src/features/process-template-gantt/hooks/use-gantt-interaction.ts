/* ── useGanttInteraction ──────────────────────────────────────────
 *
 * All editing interactions for template mode:
 * - Stage/operation CRUD
 * - Constraint management
 * - Share group management
 * - Validation
 * - Dirty state tracking
 */

"use client";

import { useState, useCallback } from "react";
import type {
  GanttNode,
  GanttConstraint,
  ShareGroup,
  ConstraintValidationResult,
  ScheduleConflict,
  FlattenedRow,
  Operation,
  StageOperation,
} from "../types";
import * as api from "@/services/process-template-api";

interface ActiveHighlight {
  operations: string[];
  constraints: number[];
}

export function useGanttInteraction(
  templateId: number,
  ganttNodes: GanttNode[],
  flattenedRows: FlattenedRow[],
  refreshData: () => Promise<void>,
  availableOperations: Operation[],
  expandedKeys: string[],
  setExpandedKeys: (keys: string[] | ((prev: string[]) => string[])) => void,
  constraints: GanttConstraint[],
  shareGroupsData: ShareGroup[],
) {
  // ── Editing state ──
  const [editingNode, setEditingNode] = useState<GanttNode | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── Operation modal ──
  const [operationModalVisible, setOperationModalVisible] = useState(false);
  const [operationSubmitting, setOperationSubmitting] = useState(false);

  // ── Constraint state ──
  const [ganttConstraints, setGanttConstraints] = useState<GanttConstraint[]>([]);
  const [operationConstraints, setOperationConstraints] = useState<unknown[]>([]);

  // ── Share group state ──
  const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
  const [operationShareGroups, setOperationShareGroups] = useState<ShareGroup[]>([]);
  const [shareGroupModalVisible, setShareGroupModalVisible] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── Validation state ──
  const [validationDrawerVisible, setValidationDrawerVisible] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ConstraintValidationResult | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight>({
    operations: [],
    constraints: [],
  });
  const [scheduleConflicts, setScheduleConflicts] = useState<ScheduleConflict[]>([]);

  // ── Scheduling state ──
  const [scheduling, setScheduling] = useState(false);

  // ── Hovered row ──
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Sync external constraints/share groups
  if (constraints.length && !ganttConstraints.length) {
    setGanttConstraints(constraints);
  }
  if (shareGroupsData.length && !shareGroups.length) {
    setShareGroups(shareGroupsData);
  }

  // ── Node CRUD ──

  const handleCreateNode = useCallback(
    async (parentNode: GanttNode) => {
      if (parentNode.type === "template") {
        const stageCount = parentNode.children?.length ?? 0;
        await api.createStage(templateId, {
          stageName: `新阶段 ${stageCount + 1}`,
          stageOrder: stageCount + 1,
          startDay: 0,
        });
        await refreshData();
        setIsDirty(true);
      } else if (parentNode.type === "stage") {
        setEditingNode(parentNode);
        setOperationModalVisible(true);
      }
    },
    [templateId, refreshData],
  );

  const handleEditNode = useCallback((node: GanttNode) => {
    setEditingNode(node);
    setEditModalVisible(true);

    if (node.type === "operation") {
      const scheduleId = parseInt(node.id.replace("operation_", ""));
      api.getOperationConstraints(scheduleId).then(setOperationConstraints);
      api.listOperationShareGroups(scheduleId).then(setOperationShareGroups);
    }
  }, []);

  const handleDeleteNode = useCallback(
    async (node: GanttNode) => {
      if (node.type === "stage") {
        const stageId = parseInt(node.id.replace("stage_", ""));
        await api.deleteStage(stageId);
      } else if (node.type === "operation") {
        const scheduleId = parseInt(node.id.replace("operation_", ""));
        await api.deleteStageOperation(scheduleId);
      }
      await refreshData();
      setIsDirty(true);
    },
    [refreshData],
  );

  const handleSaveNode = useCallback(
    async (values: Record<string, unknown>) => {
      if (!editingNode) return;

      if (editingNode.type === "stage") {
        const stageId = parseInt(editingNode.id.replace("stage_", ""));
        await api.updateStage(stageId, {
          stageName: (values.stageName as string) ?? "",
          stageOrder: (values.stageOrder as number) ?? 0,
          startDay: (values.startDay as number) ?? 0,
          description: values.description as string | null,
        });
      } else if (editingNode.type === "operation") {
        const scheduleId = parseInt(editingNode.id.replace("operation_", ""));
        await api.updateStageOperation(scheduleId, {
          operationDay: values.operationDay as number,
          recommendedTime: values.recommendedTime as number,
          windowStartTime: values.windowStartTime as number,
          windowEndTime: values.windowEndTime as number,
          windowStartDayOffset: values.windowStartDayOffset as number,
          windowEndDayOffset: values.windowEndDayOffset as number,
        });
      }

      setEditModalVisible(false);
      await refreshData();
      setIsDirty(true);
    },
    [editingNode, refreshData],
  );

  // ── Operation creation ──

  const handleOperationSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!editingNode) return;
      setOperationSubmitting(true);
      try {
        const stageId = parseInt(editingNode.id.replace("stage_", ""));
        await api.createStageOperation(stageId, {
          operationId: values.operationId as number,
          operationDay: (values.operationDay as number) ?? 0,
          recommendedTime: (values.recommendedTime as number) ?? 9,
          windowStartTime: (values.windowStartTime as number) ?? 7,
          windowEndTime: (values.windowEndTime as number) ?? 18,
        });
        setOperationModalVisible(false);
        await refreshData();
        setIsDirty(true);
      } finally {
        setOperationSubmitting(false);
      }
    },
    [editingNode, refreshData],
  );

  // ── Drag end ──

  const handleOperationDragEnd = useCallback(
    async (
      scheduleId: number,
      _stageId: number,
      updates: Partial<{
        operationDay: number;
        recommendedTime: number;
        windowStartTime: number;
        windowStartDayOffset: number;
        windowEndTime: number;
        windowEndDayOffset: number;
      }>,
    ) => {
      await api.updateStageOperation(scheduleId, updates);
      setIsDirty(true);
    },
    [],
  );

  // ── Save template ──

  const handleSaveTemplate = useCallback(async () => {
    await refreshData();
    setIsDirty(false);
  }, [refreshData]);

  // ── Auto schedule ──

  const handleAutoSchedule = useCallback(async () => {
    setScheduling(true);
    try {
      await api.autoSchedule(templateId);
      await refreshData();
    } finally {
      setScheduling(false);
    }
  }, [templateId, refreshData]);

  // ── Validation ──

  const handleValidateConstraints = useCallback(async () => {
    setValidationLoading(true);
    try {
      const result = await api.validateConstraints(templateId);
      setValidationResult(result);
      setValidationDrawerVisible(true);
    } finally {
      setValidationLoading(false);
    }
  }, [templateId]);

  const handleConflictHighlight = useCallback(
    (ops: string[], constraints: number[]) => {
      setActiveHighlight({ operations: ops, constraints });
    },
    [],
  );

  const clearActiveHighlight = useCallback(() => {
    setActiveHighlight({ operations: [], constraints: [] });
  }, []);

  // ── Share groups ──

  const loadShareGroups = useCallback(async () => {
    const groups = await api.listOperationShareGroups(templateId);
    setShareGroups(groups);
  }, [templateId]);

  const handleCreateShareGroup = useCallback(
    async (payload: {
      groupName: string;
      shareMode: "SAME_TEAM" | "DIFFERENT";
      memberIds: number[];
    }) => {
      setCreatingGroup(true);
      try {
        await api.createShareGroup(templateId, payload);
        await loadShareGroups();
      } finally {
        setCreatingGroup(false);
      }
    },
    [templateId, loadShareGroups],
  );

  const handleAssignShareGroup = useCallback(
    async (scheduleId: number, groupId: number) => {
      setAssigningGroup(true);
      try {
        await api.assignOperationToShareGroup(scheduleId, groupId);
        await loadShareGroups();
      } finally {
        setAssigningGroup(false);
      }
    },
    [loadShareGroups],
  );

  const handleRemoveShareGroup = useCallback(
    async (scheduleId: number, groupId: number) => {
      await api.removeOperationFromShareGroup(scheduleId, groupId);
      await loadShareGroups();
    },
    [loadShareGroups],
  );

  // ── Constraint CRUD ──

  const handleSaveConstraint = useCallback(
    async (payload: Record<string, unknown>) => {
      if (payload.constraintId) {
        await api.updateConstraint(payload.constraintId as number, payload);
      } else {
        await api.createConstraint(payload);
      }
      await refreshData();
      setIsDirty(true);
    },
    [refreshData],
  );

  const handleDeleteConstraint = useCallback(
    async (constraintId: number) => {
      await api.deleteConstraint(constraintId);
      await refreshData();
      setIsDirty(true);
    },
    [refreshData],
  );

  return {
    // Node editing
    editingNode,
    setEditingNode,
    editModalVisible,
    setEditModalVisible,
    handleCreateNode,
    handleEditNode,
    handleDeleteNode,
    handleSaveNode,

    // Operation modal
    operationModalVisible,
    setOperationModalVisible,
    handleOperationSubmit,
    operationSubmitting,
    openOperationModal: () => setOperationModalVisible(true),

    // Drag
    handleOperationDragEnd,

    // Save / auto-schedule
    isDirty,
    handleSaveTemplate,
    handleAutoSchedule,
    scheduling,

    // Constraints
    ganttConstraints,
    operationConstraints,
    handleSaveConstraint,
    handleDeleteConstraint,

    // Share groups
    shareGroups,
    operationShareGroups,
    shareGroupModalVisible,
    setShareGroupModalVisible,
    handleCreateShareGroup,
    handleAssignShareGroup,
    handleRemoveShareGroup,
    assigningGroup,
    creatingGroup,
    loadShareGroups,

    // Validation
    validationDrawerVisible,
    setValidationDrawerVisible,
    validationLoading,
    validationResult,
    handleValidateConstraints,
    handleConflictHighlight,
    clearActiveHighlight,
    activeHighlight,
    scheduleConflicts,

    // Hover
    hoveredRow,
    setHoveredRow,
  };
}
