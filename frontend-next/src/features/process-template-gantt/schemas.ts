/* ── Zod Schemas for API Response Parsing ───────────────────────────
 *
 * All snake_case → camelCase conversion happens here.
 * Components never do `typeof x === 'string' ? parseFloat(x)`.
 */

import { z } from "zod";

// ── Helpers ─────────────────────────────────────────────────────────

const coerceNumber = z.coerce.number();
const optionalNumber = z.coerce.number().optional();
const nullableNumber = z.coerce.number().nullable().optional();
const nullableString = z.string().nullable().optional();

// ── Process Template ────────────────────────────────────────────────

export const processTemplateSchema = z
  .object({
    id: coerceNumber,
    template_code: z.string(),
    template_name: z.string(),
    description: z.string().nullable().default(""),
    total_days: coerceNumber,
    team_id: nullableNumber,
    team_code: nullableString,
    team_name: nullableString,
    stage_count: optionalNumber,
    created_at: nullableString,
    updated_at: nullableString,
  })
  .transform((d) => ({
    id: d.id,
    templateCode: d.template_code,
    templateName: d.template_name,
    description: d.description,
    totalDays: d.total_days,
    teamId: d.team_id,
    teamCode: d.team_code,
    teamName: d.team_name,
    stageCount: d.stage_count,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));

export const processTemplateListSchema = z.array(processTemplateSchema);

// ── Process Stage ───────────────────────────────────────────────────

export const processStageSchema = z
  .object({
    id: coerceNumber,
    template_id: coerceNumber,
    stage_code: z.string(),
    stage_name: z.string(),
    stage_order: coerceNumber,
    start_day: coerceNumber,
    description: nullableString,
  })
  .transform((d) => ({
    id: d.id,
    templateId: d.template_id,
    stageCode: d.stage_code,
    stageName: d.stage_name,
    stageOrder: d.stage_order,
    startDay: d.start_day,
    description: d.description,
  }));

// ── Stage Operation ─────────────────────────────────────────────────

export const stageOperationSchema = z
  .object({
    id: coerceNumber,
    stage_id: coerceNumber,
    operation_id: coerceNumber,
    operation_code: z.string(),
    operation_name: z.string(),
    operation_day: z.coerce.number().default(0),
    recommended_time: z.coerce.number().default(9),
    recommended_day_offset: z.coerce.number().default(0).optional(),
    window_start_time: z.coerce.number().default(7),
    window_start_day_offset: z.coerce.number().default(0).optional(),
    window_end_time: z.coerce.number().default(18),
    window_end_day_offset: z.coerce.number().default(0).optional(),
    operation_order: z.coerce.number().default(0),
    standard_time: z.coerce.number().default(4).optional(),
    required_people: z.coerce.number().default(1).optional(),
    resource_rule_source_scope: nullableString,
    resource_summary: nullableString,
  })
  .transform((d) => ({
    id: d.id,
    stageId: d.stage_id,
    operationId: d.operation_id,
    operationCode: d.operation_code,
    operationName: d.operation_name,
    operationDay: d.operation_day,
    recommendedTime: d.recommended_time,
    recommendedDayOffset: d.recommended_day_offset,
    windowStartTime: d.window_start_time,
    windowStartDayOffset: d.window_start_day_offset,
    windowEndTime: d.window_end_time,
    windowEndDayOffset: d.window_end_day_offset,
    operationOrder: d.operation_order,
    standardTime: d.standard_time,
    requiredPeople: d.required_people,
    resourceRuleSourceScope: d.resource_rule_source_scope,
    resourceSummary: d.resource_summary,
  }));

// ── Gantt Constraint ────────────────────────────────────────────────

export const ganttConstraintSchema = z
  .object({
    constraint_id: coerceNumber,
    from_schedule_id: coerceNumber,
    from_operation_id: coerceNumber,
    from_operation_name: z.string(),
    from_operation_code: z.string(),
    to_schedule_id: coerceNumber,
    to_operation_id: coerceNumber,
    to_operation_name: z.string(),
    to_operation_code: z.string(),
    constraint_type: coerceNumber,
    lag_time: z.coerce.number().default(0),
    share_mode: z.string().default("NONE").optional(),
    constraint_level: optionalNumber,
    constraint_name: nullableString,
    from_stage: z.string().optional(),
    to_stage: z.string().optional(),
    from_stage_name: z.string().optional().default(""),
    to_stage_name: z.string().optional().default(""),
    from_operation_day: z.coerce.number().default(0),
    from_recommended_time: z.coerce.number().default(0),
    to_operation_day: z.coerce.number().default(0),
    to_recommended_time: z.coerce.number().default(0),
    from_stage_start_day: z.coerce.number().default(0),
    to_stage_start_day: z.coerce.number().default(0),
  })
  .transform((d) => ({
    constraintId: d.constraint_id,
    fromScheduleId: d.from_schedule_id,
    fromOperationId: d.from_operation_id,
    fromOperationName: d.from_operation_name,
    fromOperationCode: d.from_operation_code,
    toScheduleId: d.to_schedule_id,
    toOperationId: d.to_operation_id,
    toOperationName: d.to_operation_name,
    toOperationCode: d.to_operation_code,
    constraintType: d.constraint_type,
    lagTime: d.lag_time,
    shareMode: d.share_mode as "NONE" | "SAME_TEAM" | "DIFFERENT" | undefined,
    constraintLevel: d.constraint_level,
    constraintName: d.constraint_name,
    fromStageName: d.from_stage_name || d.from_stage || "",
    toStageName: d.to_stage_name || d.to_stage || "",
    fromOperationDay: d.from_operation_day,
    fromRecommendedTime: d.from_recommended_time,
    toOperationDay: d.to_operation_day,
    toRecommendedTime: d.to_recommended_time,
    fromStageStartDay: d.from_stage_start_day,
    toStageStartDay: d.to_stage_start_day,
  }));

// ── Share Group ─────────────────────────────────────────────────────

const shareGroupMemberSchema = z
  .object({
    id: coerceNumber,
    schedule_id: coerceNumber,
    operation_name: z.string(),
    required_people: z.coerce.number().default(1),
    stage_name: z.string().default(""),
  })
  .transform((d) => ({
    id: d.id,
    scheduleId: d.schedule_id,
    operationName: d.operation_name,
    requiredPeople: d.required_people,
    stageName: d.stage_name,
  }));

export const shareGroupSchema = z
  .object({
    id: coerceNumber,
    template_id: coerceNumber,
    group_code: z.string(),
    group_name: z.string(),
    share_mode: z.string(),
    description: nullableString,
    color: nullableString,
    operation_count: optionalNumber,
    priority: optionalNumber,
    members: z.array(shareGroupMemberSchema).default([]),
  })
  .transform((d) => ({
    id: d.id,
    templateId: d.template_id,
    groupCode: d.group_code,
    groupName: d.group_name,
    shareMode: d.share_mode as "SAME_TEAM" | "DIFFERENT",
    description: d.description,
    color: d.color,
    operationCount: d.operation_count,
    priority: d.priority,
    members: d.members,
  }));

// ── Operation (library item) ────────────────────────────────────────

export const operationSchema = z
  .object({
    id: coerceNumber,
    operation_code: z.string(),
    operation_name: z.string(),
    standard_time: z.coerce.number().default(0),
    required_people: z.coerce.number().default(1),
    description: nullableString,
  })
  .transform((d) => ({
    id: d.id,
    operationCode: d.operation_code,
    operationName: d.operation_name,
    standardTime: d.standard_time,
    requiredPeople: d.required_people,
    description: d.description,
  }));

// ── Validation Result ───────────────────────────────────────────────

export const constraintValidationResultSchema = z.object({
  isValid: z.boolean().default(true),
  conflicts: z
    .array(
      z.object({
        constraintIds: z.array(coerceNumber).default([]),
        operationScheduleIds: z.array(coerceNumber).default([]),
        message: z.string(),
        severity: z.enum(["error", "warning"]).default("error"),
      }),
    )
    .default([]),
});

// ── Composite: Template Gantt Data ──────────────────────────────────

export const templateGanttDataSchema = z
  .object({
    template: processTemplateSchema,
    stages: z.array(processStageSchema).default([]),
    operations: z.record(z.string(), z.array(stageOperationSchema)).default({}),
    constraints: z.array(ganttConstraintSchema).default([]),
    share_groups: z.array(shareGroupSchema).default([]),
  })
  .transform((d) => ({
    template: d.template,
    stages: d.stages,
    operations: d.operations,
    constraints: d.constraints,
    shareGroups: d.share_groups,
  }));
