export interface PersonnelSummary {
  id: number
  employee_code?: string
  employee_name: string
  role?: string
  qualifications?: string[]
  employment_status?: string
  shopfloor_baseline_pct?: number | null
  shopfloor_upper_pct?: number | null
}
