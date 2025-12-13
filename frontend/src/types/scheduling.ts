export type ShiftPlanCategory = 'BASE' | 'PRODUCTION' | 'OVERTIME' | 'REST' | string;

export interface PlanOperation {
  operation_plan_id?: number;
  operation_name?: string;
  operation_start?: string;
  operation_end?: string;
  stage_name?: string;
  batch_code?: string;
  assignment_plan_hours?: string;
  assignment_plan_category?: string;
}

export interface ShiftPlanRecord {
  plan_id: number;
  employee_id: number;
  employee_code: string;
  employee_name: string;
  org_role?: string;
  primary_team_id?: number | null;
  primary_team_name?: string | null;
  plan_date: string;
  plan_category: ShiftPlanCategory;
  plan_state: string;
  plan_hours?: string | number;
  shift_nominal_hours?: number | null;
  overtime_hours?: string | number;
  is_generated?: number;
  shift_id?: number | null;
  shift_code?: string;
  shift_name?: string;
  shift_start_time?: string;
  shift_end_time?: string;
  shift_is_cross_day?: number;
  operations?: PlanOperation[];
}
