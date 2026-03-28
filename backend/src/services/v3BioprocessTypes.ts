export const V3_ZOOM_LEVELS = ['week', 'day', 'hour', 'minute'] as const;

export type V3ZoomLevel = (typeof V3_ZOOM_LEVELS)[number];

export const V3_EQUIPMENT_STATE_VALUES = [
  'setup',
  'media_holding',
  'processing',
  'dirty_hold',
  'cleaning_cip',
  'sterilizing_sip',
  'clean_hold',
  'changeover',
  'maintenance',
] as const;

export type V3EquipmentStateValue = (typeof V3_EQUIPMENT_STATE_VALUES)[number];

export const V3_MATERIAL_STATE_VALUES = [
  'prepared',
  'in_hold',
  'expired',
  'consumed',
  'quarantined',
] as const;

export type V3MaterialStateValue = (typeof V3_MATERIAL_STATE_VALUES)[number];

export type V3EquipmentMode = 'SS' | 'SUS' | 'ANY' | 'UNKNOWN';

export type V3ProjectionOperationRole = 'MAIN' | 'AUXILIARY';

export type V3ProjectionOperationSource =
  | 'EXISTING_BATCH'
  | 'TEMPLATE_PROJECTION'
  | 'SYSTEM_DERIVED'
  | 'PACKAGE_MEMBER';

export type V3RiskSeverity = 'INFO' | 'WARNING' | 'BLOCKING';
export type V3StorageMode = 'schema' | 'fallback';

export type V3RiskType =
  | 'UNBOUND_RESOURCE'
  | 'MISSING_MIRROR_RESOURCE'
  | 'MAINTENANCE_CONFLICT'
  | 'ASSIGNMENT_CONFLICT'
  | 'STATE_GAP'
  | 'WINDOW_VIOLATION'
  | 'MATERIAL_HOLD_RISK';

export type V3TriggerMode =
  | 'PACKAGE_BEFORE_START'
  | 'WINDOW'
  | 'RECURRING_WINDOW'
  | 'FOLLOW_DEPENDENCY'
  | 'STATE_GATE';

export type V3AnchorMode = 'NODE_START' | 'NODE_END' | 'RULE_END' | 'PACKAGE_END';

export interface V3TemplateSummary {
  id: number;
  template_code: string;
  template_name: string;
  domain_code: 'USP' | 'DSP' | 'SPI';
  equipment_mode_scope: 'MIXED' | 'SS' | 'SUS';
  description: string | null;
  node_count: number;
  trigger_rule_count: number;
  package_count: number;
  main_equipment_codes: string[];
}

export interface V3MainFlowNode {
  id: number;
  template_id: number;
  node_key: string;
  semantic_key: string;
  display_name: string;
  phase_code: 'USP' | 'DSP' | 'SPI';
  equipment_mode: V3EquipmentMode;
  default_duration_minutes: number;
  sequence_order: number;
  default_equipment_code: string | null;
  default_material_code: string | null;
  metadata: Record<string, unknown>;
}

export interface V3MainFlowEdge {
  predecessor_node_id: number;
  successor_node_id: number;
  relationship_type: 'FINISH_START' | 'START_START' | 'STATE_GATE';
  min_offset_minutes: number;
}

export interface V3TriggerRule {
  id: number;
  template_id: number;
  rule_code: string;
  target_node_id: number | null;
  anchor_mode: V3AnchorMode;
  anchor_ref_code: string | null;
  trigger_mode: V3TriggerMode;
  operation_code: string | null;
  operation_name: string | null;
  operation_role: 'AUXILIARY';
  default_duration_minutes: number;
  earliest_offset_minutes: number | null;
  recommended_offset_minutes: number | null;
  latest_offset_minutes: number | null;
  repeat_every_minutes: number | null;
  repeat_until_node_id: number | null;
  dependency_rule_code: string | null;
  generator_package_id: number | null;
  target_equipment_state: V3EquipmentStateValue | null;
  target_material_state: V3MaterialStateValue | null;
  is_blocking: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
}

export interface V3OperationPackage {
  id: number;
  template_id: number | null;
  package_code: string;
  package_name: string;
  package_type: 'SETUP' | 'MEDIA_FILL' | 'CIP_SIP' | 'CHANGEOVER' | 'MATERIAL_PREP';
  target_entity_type: 'EQUIPMENT' | 'MATERIAL';
  equipment_mode: V3EquipmentMode;
  description: string | null;
  is_reusable: boolean;
  metadata: Record<string, unknown>;
  members: V3OperationPackageMember[];
}

export interface V3TemplateDetail {
  template: V3TemplateSummary;
  nodes: V3MainFlowNode[];
  edges: V3MainFlowEdge[];
  rules: V3TriggerRule[];
  packages: V3OperationPackage[];
  storage_mode: V3StorageMode;
}

export interface V3OperationPackageMember {
  id: number;
  package_id: number;
  member_code: string;
  operation_code: string;
  operation_name: string;
  member_order: number;
  relative_day_offset: number;
  relative_minute_offset: number;
  duration_minutes: number;
  predecessor_member_id: number | null;
  target_equipment_state: V3EquipmentStateValue | null;
  target_material_state: V3MaterialStateValue | null;
  metadata: Record<string, unknown>;
}

export interface V3EquipmentStateSegment {
  segment_key: string;
  equipment_code: string;
  equipment_name: string | null;
  equipment_mode: V3EquipmentMode;
  state_code: V3EquipmentStateValue;
  source_mode: 'CONFIRMED' | 'PLANNED' | 'PREDICTED';
  start_datetime: string;
  end_datetime: string;
  metadata: Record<string, unknown>;
}

export interface V3MaterialStateSegment {
  segment_key: string;
  material_code: string;
  material_name: string | null;
  state_code: V3MaterialStateValue;
  source_mode: 'CONFIRMED' | 'PLANNED' | 'PREDICTED';
  start_datetime: string;
  end_datetime: string;
  metadata: Record<string, unknown>;
}

export interface V3ProjectionOperation {
  operation_key: string;
  operation_code: string;
  operation_name: string;
  role: V3ProjectionOperationRole;
  source: V3ProjectionOperationSource;
  equipment_code: string | null;
  equipment_name: string | null;
  equipment_mode: V3EquipmentMode;
  material_state_ref: string | null;
  start_datetime: string;
  end_datetime: string;
  window_start_datetime: string | null;
  window_end_datetime: string | null;
  generator_rule_id: number | null;
  generator_rule_code: string | null;
  generator_package_id: number | null;
  generator_package_code: string | null;
  is_user_adjusted: boolean;
  metadata: Record<string, unknown>;
}

export interface V3ProjectionRisk {
  risk_code: string;
  risk_type: V3RiskType;
  severity: V3RiskSeverity;
  equipment_code: string | null;
  material_code: string | null;
  operation_key: string | null;
  trigger_ref_code: string | null;
  window_start_datetime: string | null;
  window_end_datetime: string | null;
  message: string;
  is_blocking: boolean;
  metadata: Record<string, unknown>;
}

export interface V3TimelineContextWindow {
  window_key: string;
  window_type: 'MAINTENANCE' | 'EXISTING_ASSIGNMENT';
  label: string;
  start_datetime: string;
  end_datetime: string;
  severity: V3RiskSeverity;
}

export interface V3EquipmentTimelineRow {
  equipment_code: string;
  equipment_name: string;
  equipment_mode: V3EquipmentMode;
  domain_code: 'USP' | 'DSP' | 'SPI' | 'CROSS';
  main_operations: V3ProjectionOperation[];
  aux_operations: V3ProjectionOperation[];
  state_segments: V3EquipmentStateSegment[];
  risk_markers: V3ProjectionRisk[];
  context_windows: V3TimelineContextWindow[];
}

export interface V3DraftStateSegment {
  segment_key?: string;
  equipment_code: string;
  equipment_mode?: V3EquipmentMode;
  state_code: V3EquipmentStateValue;
  start_datetime: string;
  end_datetime: string;
  locked?: boolean;
  metadata?: Record<string, unknown>;
}

export interface V3DraftNodeBindingOverride {
  node_key: string;
  equipment_code: string | null;
  equipment_mode?: V3EquipmentMode;
}

export interface V3DraftMainOperationOverride {
  node_key: string;
  start_datetime: string;
}

export interface V3ProjectionPreviewRequest {
  template_id: number;
  planned_start_datetime: string;
  horizon_days?: number;
  equipment_codes?: string[];
  visible_equipment_codes?: string[];
  draft_state_segments?: V3DraftStateSegment[];
  draft_node_bindings?: V3DraftNodeBindingOverride[];
  draft_main_operation_overrides?: V3DraftMainOperationOverride[];
  persist_run?: boolean;
}

export interface V3ProjectionPreviewResponse {
  run_id: number | null;
  template: V3TemplateSummary;
  planned_start_datetime: string;
  horizon_end_datetime: string;
  rows: V3EquipmentTimelineRow[];
  material_state_segments: V3MaterialStateSegment[];
  risks: V3ProjectionRisk[];
  zoom_presets: {
    default_level: 'week';
    levels: typeof V3_ZOOM_LEVELS;
    minimum_snap_minutes: 5;
  };
  sync_snapshot: {
    last_sync_at: string | null;
    last_sync_status: 'RUNNING' | 'SUCCESS' | 'FAILED' | null;
  };
}

export interface V3MasterSyncStatus {
  last_sync_id: number | null;
  storage_mode: V3StorageMode;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | null;
  started_at: string | null;
  finished_at: string | null;
  summary: Record<string, unknown> | null;
  error_message: string | null;
}

export interface V3MasterSyncResponse extends V3MasterSyncStatus {
  synced_counts: Record<string, number>;
}
