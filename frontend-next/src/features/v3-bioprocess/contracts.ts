import { z } from "zod";

export const timelineZoomLevelSchema = z.enum(["week", "day", "hour", "minute"]);
export const equipmentModeSchema = z.enum(["SS", "SUS", "ANY", "UNKNOWN"]);
export const storageModeSchema = z.enum(["schema", "fallback"]);

export const equipmentStateValueSchema = z.enum([
  "setup",
  "media_holding",
  "processing",
  "dirty_hold",
  "cleaning_cip",
  "sterilizing_sip",
  "clean_hold",
  "changeover",
  "maintenance",
]);

export const materialStateValueSchema = z.enum([
  "prepared",
  "in_hold",
  "expired",
  "consumed",
  "quarantined",
]);

export const riskSeveritySchema = z.enum(["INFO", "WARNING", "BLOCKING"]);

export const riskTypeSchema = z.enum([
  "UNBOUND_RESOURCE",
  "MISSING_MIRROR_RESOURCE",
  "MAINTENANCE_CONFLICT",
  "ASSIGNMENT_CONFLICT",
  "STATE_GAP",
  "WINDOW_VIOLATION",
  "MATERIAL_HOLD_RISK",
]);

export const v3TemplateSummarySchema = z.object({
  id: z.number(),
  template_code: z.string(),
  template_name: z.string(),
  domain_code: z.enum(["USP", "DSP", "SPI"]),
  equipment_mode_scope: z.enum(["MIXED", "SS", "SUS"]),
  description: z.string().nullable(),
  node_count: z.number(),
  trigger_rule_count: z.number(),
  package_count: z.number(),
  main_equipment_codes: z.array(z.string()),
});

export const v3MainFlowNodeSchema = z.object({
  id: z.number(),
  template_id: z.number(),
  node_key: z.string(),
  semantic_key: z.string(),
  display_name: z.string(),
  phase_code: z.enum(["USP", "DSP", "SPI"]),
  equipment_mode: equipmentModeSchema,
  default_duration_minutes: z.number(),
  sequence_order: z.number(),
  default_equipment_code: z.string().nullable(),
  default_material_code: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});

export const v3MainFlowEdgeSchema = z.object({
  predecessor_node_id: z.number(),
  successor_node_id: z.number(),
  relationship_type: z.enum(["FINISH_START", "START_START", "STATE_GATE"]),
  min_offset_minutes: z.number(),
});

export const v3TriggerRuleSchema = z.object({
  id: z.number(),
  template_id: z.number(),
  rule_code: z.string(),
  target_node_id: z.number().nullable(),
  anchor_mode: z.enum(["NODE_START", "NODE_END", "RULE_END", "PACKAGE_END"]),
  anchor_ref_code: z.string().nullable(),
  trigger_mode: z.enum([
    "PACKAGE_BEFORE_START",
    "WINDOW",
    "RECURRING_WINDOW",
    "FOLLOW_DEPENDENCY",
    "STATE_GATE",
  ]),
  operation_code: z.string().nullable(),
  operation_name: z.string().nullable(),
  operation_role: z.literal("AUXILIARY"),
  default_duration_minutes: z.number(),
  earliest_offset_minutes: z.number().nullable(),
  recommended_offset_minutes: z.number().nullable(),
  latest_offset_minutes: z.number().nullable(),
  repeat_every_minutes: z.number().nullable(),
  repeat_until_node_id: z.number().nullable(),
  dependency_rule_code: z.string().nullable(),
  generator_package_id: z.number().nullable(),
  target_equipment_state: equipmentStateValueSchema.nullable(),
  target_material_state: materialStateValueSchema.nullable(),
  is_blocking: z.boolean(),
  sort_order: z.number(),
  metadata: z.record(z.string(), z.unknown()),
});

export const v3OperationPackageMemberSchema = z.object({
  id: z.number(),
  package_id: z.number(),
  member_code: z.string(),
  operation_code: z.string(),
  operation_name: z.string(),
  member_order: z.number(),
  relative_day_offset: z.number(),
  relative_minute_offset: z.number(),
  duration_minutes: z.number(),
  predecessor_member_id: z.number().nullable(),
  target_equipment_state: equipmentStateValueSchema.nullable(),
  target_material_state: materialStateValueSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()),
});

export const v3OperationPackageSchema = z.object({
  id: z.number(),
  template_id: z.number().nullable(),
  package_code: z.string(),
  package_name: z.string(),
  package_type: z.enum([
    "SETUP",
    "MEDIA_FILL",
    "CIP_SIP",
    "CHANGEOVER",
    "MATERIAL_PREP",
  ]),
  target_entity_type: z.enum(["EQUIPMENT", "MATERIAL"]),
  equipment_mode: equipmentModeSchema,
  description: z.string().nullable(),
  is_reusable: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  members: z.array(v3OperationPackageMemberSchema),
});

export const v3TemplateDetailSchema = z.object({
  template: v3TemplateSummarySchema,
  nodes: z.array(v3MainFlowNodeSchema),
  edges: z.array(v3MainFlowEdgeSchema),
  rules: z.array(v3TriggerRuleSchema),
  packages: z.array(v3OperationPackageSchema),
  storage_mode: storageModeSchema,
});

const projectionOperationBaseSchema = z.object({
  operation_key: z.string(),
  operation_code: z.string(),
  operation_name: z.string(),
  source: z.enum([
    "EXISTING_BATCH",
    "TEMPLATE_PROJECTION",
    "SYSTEM_DERIVED",
    "PACKAGE_MEMBER",
  ]),
  equipment_code: z.string().nullable(),
  equipment_name: z.string().nullable(),
  equipment_mode: equipmentModeSchema,
  material_state_ref: z.string().nullable(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  window_start_datetime: z.string().nullable(),
  window_end_datetime: z.string().nullable(),
  generator_rule_id: z.number().nullable(),
  generator_rule_code: z.string().nullable(),
  generator_package_id: z.number().nullable(),
  generator_package_code: z.string().nullable(),
  is_user_adjusted: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

export const mainOperationBarSchema = projectionOperationBaseSchema.extend({
  role: z.literal("MAIN"),
});

export const auxOperationBarSchema = projectionOperationBaseSchema.extend({
  role: z.literal("AUXILIARY"),
});

export const stateBandSegmentSchema = z.object({
  segment_key: z.string(),
  equipment_code: z.string(),
  equipment_name: z.string().nullable(),
  equipment_mode: equipmentModeSchema,
  state_code: equipmentStateValueSchema,
  source_mode: z.enum(["CONFIRMED", "PLANNED", "PREDICTED"]),
  start_datetime: z.string(),
  end_datetime: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const materialStateSegmentSchema = z.object({
  segment_key: z.string(),
  material_code: z.string(),
  material_name: z.string().nullable(),
  state_code: materialStateValueSchema,
  source_mode: z.enum(["CONFIRMED", "PLANNED", "PREDICTED"]),
  start_datetime: z.string(),
  end_datetime: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const riskMarkerSchema = z.object({
  risk_code: z.string(),
  risk_type: riskTypeSchema,
  severity: riskSeveritySchema,
  equipment_code: z.string().nullable(),
  material_code: z.string().nullable(),
  operation_key: z.string().nullable(),
  trigger_ref_code: z.string().nullable(),
  window_start_datetime: z.string().nullable(),
  window_end_datetime: z.string().nullable(),
  message: z.string(),
  is_blocking: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

export const timelineContextWindowSchema = z.object({
  window_key: z.string(),
  window_type: z.enum(["MAINTENANCE", "EXISTING_ASSIGNMENT"]),
  label: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  severity: riskSeveritySchema,
});

export const equipmentTimelineRowSchema = z.object({
  equipment_code: z.string(),
  equipment_name: z.string(),
  equipment_mode: equipmentModeSchema,
  domain_code: z.enum(["USP", "DSP", "SPI", "CROSS"]),
  main_operations: z.array(mainOperationBarSchema),
  aux_operations: z.array(auxOperationBarSchema),
  state_segments: z.array(stateBandSegmentSchema),
  risk_markers: z.array(riskMarkerSchema),
  context_windows: z.array(timelineContextWindowSchema),
});

export const draftStateSegmentSchema = z.object({
  segment_key: z.string().optional(),
  equipment_code: z.string(),
  equipment_mode: equipmentModeSchema.optional(),
  state_code: equipmentStateValueSchema,
  start_datetime: z.string(),
  end_datetime: z.string(),
  locked: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const draftNodeBindingOverrideSchema = z.object({
  node_key: z.string(),
  equipment_code: z.string().nullable(),
  equipment_mode: equipmentModeSchema.optional(),
});

export const draftMainOperationOverrideSchema = z.object({
  node_key: z.string(),
  start_datetime: z.string(),
});

export const v3ProjectionPreviewResponseSchema = z.object({
  run_id: z.number().nullable(),
  template: v3TemplateSummarySchema,
  planned_start_datetime: z.string(),
  horizon_end_datetime: z.string(),
  rows: z.array(equipmentTimelineRowSchema),
  material_state_segments: z.array(materialStateSegmentSchema),
  risks: z.array(riskMarkerSchema),
  zoom_presets: z.object({
    default_level: z.literal("week"),
    levels: z.array(timelineZoomLevelSchema),
    minimum_snap_minutes: z.literal(5),
  }),
  sync_snapshot: z.object({
    last_sync_at: z.string().nullable(),
    last_sync_status: z.enum(["RUNNING", "SUCCESS", "FAILED"]).nullable(),
  }),
});

export const v3ProjectionPreviewRequestSchema = z.object({
  template_id: z.number(),
  planned_start_datetime: z.string().min(1),
  horizon_days: z.number().int().min(1).max(21).default(7),
  equipment_codes: z.array(z.string()).optional(),
  visible_equipment_codes: z.array(z.string()).optional(),
  draft_state_segments: z.array(draftStateSegmentSchema).optional(),
  draft_node_bindings: z.array(draftNodeBindingOverrideSchema).optional(),
  draft_main_operation_overrides: z
    .array(draftMainOperationOverrideSchema)
    .optional(),
  persist_run: z.boolean().default(false),
});

export const v3TemplateListResponseSchema = z.object({
  data: z.array(v3TemplateSummarySchema),
});

export const v3MasterSyncStatusSchema = z.object({
  last_sync_id: z.number().nullable(),
  storage_mode: storageModeSchema,
  status: z.enum(["RUNNING", "SUCCESS", "FAILED"]).nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  summary: z.record(z.string(), z.unknown()).nullable(),
  error_message: z.string().nullable(),
});

export const v3MasterSyncResponseSchema = v3MasterSyncStatusSchema.extend({
  synced_counts: z.record(z.string(), z.number()),
});

export const legacyResourceSchema = z.object({
  id: z.number(),
  resource_code: z.string(),
  resource_name: z.string(),
  resource_type: z.string(),
  department_code: z.string().nullable().optional(),
  owner_org_unit_id: z.number().nullable().optional(),
  owner_unit_name: z.string().nullable().optional(),
  owner_unit_code: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  capacity: z.number().or(z.string()).optional(),
  location: z.string().nullable().optional(),
  clean_level: z.string().nullable().optional(),
  is_shared: z.boolean().optional(),
  is_schedulable: z.boolean().optional(),
  metadata: z.unknown().optional(),
});

export const legacyResourceListResponseSchema = z.union([
  z.array(legacyResourceSchema),
  z.object({
    data: z.array(legacyResourceSchema),
    warnings: z.array(z.string()).optional(),
  }),
]);

export const legacyResourceNodeSchema = z.object({
  id: z.number(),
  node_code: z.string(),
  node_name: z.string(),
  node_class: z.string(),
  node_subtype: z.string().nullable(),
  parent_id: z.number().nullable(),
  node_scope: z.string().nullable().optional(),
  department_code: z.string().nullable(),
  equipment_system_type: z.string().nullable(),
  equipment_class: z.string().nullable(),
  equipment_model: z.string().nullable(),
  bound_resource_id: z.number().nullable(),
  bound_resource_code: z.string().nullable(),
  bound_resource_name: z.string().nullable(),
  bound_resource_type: z.string().nullable().optional(),
  bound_resource_status: z.string().nullable().optional(),
  bound_resource_is_schedulable: z.boolean().optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
  metadata: z.unknown().optional(),
  child_count: z.number().optional(),
});

export const legacyResourceNodeListResponseSchema = z.union([
  z.array(legacyResourceNodeSchema),
  z.object({
    data: z.array(legacyResourceNodeSchema),
    warnings: z.array(z.string()).optional(),
  }),
]);

export const maintenanceWindowSchema = z.object({
  id: z.number(),
  resource_id: z.number(),
  resource_code: z.string(),
  resource_name: z.string(),
  department_code: z.string().nullable().optional(),
  window_type: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string(),
  is_hard_block: z.boolean(),
  owner_dept_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const maintenanceWindowListResponseSchema = z.array(
  maintenanceWindowSchema,
);

export const mutationMessageResponseSchema = z.object({
  id: z.number().optional(),
  message: z.string(),
});

export type TimelineZoomLevel = z.infer<typeof timelineZoomLevelSchema>;
export type StorageMode = z.infer<typeof storageModeSchema>;
export type EquipmentStateValue = z.infer<typeof equipmentStateValueSchema>;
export type V3TemplateSummary = z.infer<typeof v3TemplateSummarySchema>;
export type V3MainFlowNode = z.infer<typeof v3MainFlowNodeSchema>;
export type V3MainFlowEdge = z.infer<typeof v3MainFlowEdgeSchema>;
export type V3TriggerRule = z.infer<typeof v3TriggerRuleSchema>;
export type V3OperationPackage = z.infer<typeof v3OperationPackageSchema>;
export type V3TemplateDetail = z.infer<typeof v3TemplateDetailSchema>;
export type MainOperationBar = z.infer<typeof mainOperationBarSchema>;
export type AuxOperationBar = z.infer<typeof auxOperationBarSchema>;
export type StateBandSegment = z.infer<typeof stateBandSegmentSchema>;
export type RiskMarker = z.infer<typeof riskMarkerSchema>;
export type EquipmentTimelineRow = z.infer<typeof equipmentTimelineRowSchema>;
export type MaterialStateSegment = z.infer<typeof materialStateSegmentSchema>;
export type TimelineContextWindow = z.infer<typeof timelineContextWindowSchema>;
export type DraftStateSegment = z.infer<typeof draftStateSegmentSchema>;
export type DraftNodeBindingOverride = z.infer<
  typeof draftNodeBindingOverrideSchema
>;
export type DraftMainOperationOverride = z.infer<
  typeof draftMainOperationOverrideSchema
>;
export type PinnedEquipmentRow = {
  equipment_code: string;
  equipment_name: string;
  equipment_mode: z.infer<typeof equipmentModeSchema>;
  source: "template" | "pinned";
};
export type V3ProjectionPreviewResponse = z.infer<
  typeof v3ProjectionPreviewResponseSchema
>;
export type V3ProjectionPreviewRequest = z.infer<
  typeof v3ProjectionPreviewRequestSchema
>;
export type V3MasterSyncStatus = z.infer<typeof v3MasterSyncStatusSchema>;
export type V3MasterSyncResponse = z.infer<typeof v3MasterSyncResponseSchema>;
export type LegacyResource = z.infer<typeof legacyResourceSchema>;
export type LegacyResourceNode = z.infer<typeof legacyResourceNodeSchema>;
export type MaintenanceWindow = z.infer<typeof maintenanceWindowSchema>;
