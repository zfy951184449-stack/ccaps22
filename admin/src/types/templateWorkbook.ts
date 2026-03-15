export type WorkbookImportMode = 'create' | 'replace'

export interface WorkbookTemplateRow {
  template_code: string
  template_name: string
  description: string | null
  team_code: string | null
  total_days: number | null
}

export interface WorkbookStageRow {
  template_code: string
  stage_code: string
  stage_name: string
  stage_order: number
  start_day: number
  description: string | null
}

export interface WorkbookOperationRow {
  template_code: string
  stage_code: string
  schedule_key: string
  operation_code: string
  operation_name: string | null
  operation_day: number
  recommended_time: number
  recommended_day_offset: number
  window_start_time: number
  window_start_day_offset: number
  window_end_time: number
  window_end_day_offset: number
  operation_order: number
}

export interface WorkbookConstraintRow {
  template_code: string
  constraint_name: string | null
  from_schedule_key: string
  to_schedule_key: string
  constraint_type: 'FS' | 'SS' | 'FF' | 'SF'
  constraint_level: number
  lag_time: number
  lag_type: string
  lag_min: number
  lag_max: number | null
  share_mode: string
  description: string | null
}

export interface WorkbookShareGroupRow {
  template_code: string
  group_code: string
  group_name: string | null
  share_mode: string
}

export interface WorkbookShareGroupMemberRow {
  template_code: string
  group_code: string
  schedule_key: string
}

export interface WorkbookResourceBindingRow {
  template_code: string
  schedule_key: string
  resource_node_code: string
}

export interface WorkbookResourceRequirementRow {
  template_code: string
  schedule_key: string
  requirement_order: number
  resource_type: string
  required_count: number
  is_mandatory: boolean
  requires_exclusive_use: boolean
  prep_minutes: number
  changeover_minutes: number
  cleanup_minutes: number
  candidate_resource_codes: string[]
}

export interface ProcessTemplateWorkbookData {
  format_version: 'process-template-workbook-v1'
  exported_at: string
  warnings: string[]
  templates: WorkbookTemplateRow[]
  stages: WorkbookStageRow[]
  operations: WorkbookOperationRow[]
  constraints: WorkbookConstraintRow[]
  share_groups: WorkbookShareGroupRow[]
  share_group_members: WorkbookShareGroupMemberRow[]
  resource_bindings: WorkbookResourceBindingRow[]
  resource_requirements: WorkbookResourceRequirementRow[]
}

export interface ProcessTemplateWorkbookImportPayload extends ProcessTemplateWorkbookData {
  mode: WorkbookImportMode
}

export interface ProcessTemplateWorkbookImportResult {
  message: string
  mode: WorkbookImportMode
  created_count: number
  replaced_count: number
  warnings: string[]
  templates: Array<{
    template_code: string
    template_id: number
    action: 'created' | 'replaced'
  }>
}
