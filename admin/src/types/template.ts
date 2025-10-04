export interface TemplateSummary {
  id: number
  template_code: string
  template_name: string
  total_days?: number
  stage_count?: number
  operation_count?: number
  updated_at?: string
  plan_status?: string
}

export interface TemplateListResponse extends Array<TemplateSummary> {}
