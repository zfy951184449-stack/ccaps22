/* ── Process Template API Service ───────────────────────────────────
 *
 * All process template Gantt API calls go through this module.
 * Uses `apiFetch` with Zod schema validation at the boundary.
 */

import { apiFetch } from "@/services/http/client";
import {
  processTemplateListSchema,
  processTemplateSchema,
  processStageSchema,
  stageOperationSchema,
  ganttConstraintSchema,
  shareGroupSchema,
  operationSchema,
  constraintValidationResultSchema,
} from "@/features/process-template-gantt/schemas";
import { z } from "zod";

// ── Template CRUD ───────────────────────────────────────────────────

export async function listTemplates(teamId?: string) {
  const params = teamId && teamId !== "all" ? `?team_id=${teamId}` : "";
  return apiFetch(`/process-templates${params}`, {
    schema: processTemplateListSchema,
  });
}

export async function getTemplate(templateId: number) {
  return apiFetch(`/process-templates/${templateId}`, {
    schema: processTemplateSchema,
  });
}

export async function createTemplate(payload: {
  templateName: string;
  teamId?: number | null;
  description?: string;
}) {
  return apiFetch(`/process-templates`, {
    method: "POST",
    body: JSON.stringify({
      template_name: payload.templateName,
      team_id: payload.teamId ?? null,
      description: payload.description ?? null,
    }),
    schema: processTemplateSchema,
  });
}

export async function updateTemplate(
  templateId: number,
  payload: {
    templateName: string;
    teamId?: number | null;
    description?: string | null;
  },
) {
  await apiFetch(`/process-templates/${templateId}`, {
    method: "PUT",
    body: JSON.stringify({
      template_name: payload.templateName,
      team_id: payload.teamId ?? null,
      description: payload.description ?? null,
    }),
  });
}

export async function deleteTemplate(templateId: number) {
  await apiFetch(`/process-templates/${templateId}`, { method: "DELETE" });
}

export async function copyTemplate(templateId: number, newName?: string) {
  const result = await apiFetch<{
    new_template_id: number;
    new_template_code: string;
  }>(`/process-templates/${templateId}/copy`, {
    method: "POST",
    body: JSON.stringify({ new_name: newName ?? null }),
  });
  return {
    newTemplateId: Number(result.new_template_id),
    newTemplateCode: result.new_template_code,
  };
}

// ── Gantt Data (composite fetch) ────────────────────────────────────

export async function fetchTemplateGanttData(templateId: number) {
  const [template, stagesRaw, constraintsRaw, shareGroupsRaw] =
    await Promise.all([
      apiFetch(`/process-templates/${templateId}`, {
        schema: processTemplateSchema,
      }),
      apiFetch(`/process-stages/template/${templateId}`, {
        schema: z.array(processStageSchema),
      }),
      apiFetch(`/constraints/template/${templateId}`, {
        schema: z.array(ganttConstraintSchema),
      }),
      apiFetch(`/share-groups/template/${templateId}`, {
        schema: z.array(shareGroupSchema),
      }),
    ]);

  // Fetch operations for each stage in parallel
  const stageOpsEntries = await Promise.all(
    stagesRaw.map(async (stage) => {
      const ops = await apiFetch(
        `/stage-operations/stage/${stage.id}`,
        { schema: z.array(stageOperationSchema) },
      );
      return [stage.id, ops] as const;
    }),
  );

  const operations = Object.fromEntries(stageOpsEntries);

  return {
    template,
    stages: stagesRaw,
    operations,
    constraints: constraintsRaw,
    shareGroups: shareGroupsRaw,
  };
}

// ── Stage CRUD ──────────────────────────────────────────────────────

export async function createStage(
  templateId: number,
  payload: {
    stageName: string;
    stageOrder: number;
    startDay: number;
    description?: string | null;
  },
) {
  return apiFetch(`/process-stages/template/${templateId}`, {
    method: "POST",
    body: JSON.stringify({
      stage_name: payload.stageName,
      stage_order: payload.stageOrder,
      start_day: payload.startDay,
      description: payload.description ?? null,
    }),
    schema: processStageSchema,
  });
}

export async function updateStage(
  stageId: number,
  payload: {
    stageName: string;
    stageOrder: number;
    startDay: number;
    description?: string | null;
  },
) {
  await apiFetch(`/process-stages/${stageId}`, {
    method: "PUT",
    body: JSON.stringify({
      stage_name: payload.stageName,
      stage_order: payload.stageOrder,
      start_day: payload.startDay,
      description: payload.description ?? null,
    }),
  });
}

export async function deleteStage(stageId: number) {
  await apiFetch(`/process-stages/${stageId}`, { method: "DELETE" });
}

// ── Stage Operation CRUD ────────────────────────────────────────────

export async function createStageOperation(
  stageId: number,
  payload: {
    operationId: number;
    operationDay: number;
    recommendedTime: number;
    recommendedDayOffset?: number;
    windowStartTime: number;
    windowStartDayOffset?: number;
    windowEndTime: number;
    windowEndDayOffset?: number;
  },
) {
  const result = await apiFetch<{ id: number }>(
    `/stage-operations/stage/${stageId}`,
    {
      method: "POST",
      body: JSON.stringify({
        operation_id: payload.operationId,
        operation_day: payload.operationDay,
        recommended_time: payload.recommendedTime,
        recommended_day_offset: payload.recommendedDayOffset ?? 0,
        window_start_time: payload.windowStartTime,
        window_start_day_offset: payload.windowStartDayOffset ?? 0,
        window_end_time: payload.windowEndTime,
        window_end_day_offset: payload.windowEndDayOffset ?? 0,
      }),
    },
  );
  return Number(result.id);
}

export async function updateStageOperation(
  scheduleId: number,
  payload: {
    operationDay?: number;
    recommendedTime?: number;
    recommendedDayOffset?: number;
    windowStartTime?: number;
    windowStartDayOffset?: number;
    windowEndTime?: number;
    windowEndDayOffset?: number;
    operationOrder?: number;
  },
) {
  await apiFetch(`/stage-operations/${scheduleId}`, {
    method: "PUT",
    body: JSON.stringify({
      operation_day: payload.operationDay,
      recommended_time: payload.recommendedTime,
      recommended_day_offset: payload.recommendedDayOffset,
      window_start_time: payload.windowStartTime,
      window_start_day_offset: payload.windowStartDayOffset,
      window_end_time: payload.windowEndTime,
      window_end_day_offset: payload.windowEndDayOffset,
      operation_order: payload.operationOrder,
    }),
  });
}

export async function deleteStageOperation(scheduleId: number) {
  await apiFetch(`/stage-operations/${scheduleId}`, { method: "DELETE" });
}

// ── Constraints ─────────────────────────────────────────────────────

export async function getOperationConstraints(scheduleId: number) {
  return apiFetch<unknown[]>(`/constraints/operation/${scheduleId}`);
}

export async function createConstraint(payload: Record<string, unknown>) {
  return apiFetch(`/constraints`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateConstraint(
  constraintId: number,
  payload: Record<string, unknown>,
) {
  return apiFetch(`/constraints/${constraintId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteConstraint(constraintId: number) {
  await apiFetch(`/constraints/${constraintId}`, { method: "DELETE" });
}

export async function validateConstraints(templateId: number) {
  return apiFetch(`/constraints/template/${templateId}/validate`, {
    method: "POST",
    schema: constraintValidationResultSchema,
  });
}

// ── Share Groups ────────────────────────────────────────────────────

export async function createShareGroup(
  templateId: number,
  payload: {
    groupName: string;
    shareMode: "SAME_TEAM" | "DIFFERENT";
    memberIds: number[];
  },
) {
  return apiFetch(`/share-groups/template/${templateId}`, {
    method: "POST",
    body: JSON.stringify({
      group_name: payload.groupName,
      share_mode: payload.shareMode,
      member_ids: payload.memberIds,
    }),
  });
}

export async function deleteShareGroup(groupId: number) {
  await apiFetch(`/share-groups/${groupId}`, { method: "DELETE" });
}

export async function listOperationShareGroups(scheduleId: number) {
  return apiFetch(`/share-groups/operation/${scheduleId}`, {
    schema: z.array(shareGroupSchema),
  });
}

export async function assignOperationToShareGroup(
  scheduleId: number,
  groupId: number,
) {
  return apiFetch(`/share-groups/assign`, {
    method: "POST",
    body: JSON.stringify({
      schedule_id: scheduleId,
      share_group_id: groupId,
    }),
  });
}

export async function removeOperationFromShareGroup(
  scheduleId: number,
  groupId: number,
) {
  await apiFetch(`/share-groups/operation/${scheduleId}/group/${groupId}`, {
    method: "DELETE",
  });
}

// ── Operations Library ──────────────────────────────────────────────

export async function listOperations() {
  return apiFetch(`/operations`, {
    schema: z.array(operationSchema),
  });
}

// ── Auto Schedule ───────────────────────────────────────────────────

export async function autoSchedule(templateId: number) {
  return apiFetch(`/process-templates/${templateId}/auto-schedule`, {
    method: "POST",
  });
}
