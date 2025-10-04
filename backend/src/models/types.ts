export interface Employee {
  id?: number;
  employee_code: string;
  employee_name: string;
  department?: string;
  position?: string;
}

export interface Qualification {
  id?: number;
  qualification_name: string;
}

export interface EmployeeQualification {
  id?: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
}

export interface Operation {
  id?: number;
  operation_code: string;
  operation_name: string;
  standard_time: number;
  required_people: number;
  description?: string;
}

export interface OperationQualificationRequirement {
  id?: number;
  operation_id: number;
  qualification_id: number;
  required_level: number;
  required_count: number;
  is_mandatory: number;
}

export interface ProcessTemplate {
  id?: number;
  template_code: string;
  template_name: string;
  description?: string;
  total_days?: number;
}

export interface ProcessStage {
  id?: number;
  template_id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description?: string;
}

export interface StageOperationSchedule {
  id?: number;
  stage_id: number;
  operation_id: number;
  operation_day: number;
  recommended_time: number;
  window_start_time: number;
  window_end_time: number;
  operation_order?: number;
}

export interface OperationConstraint {
  id?: number;
  schedule_id: number;
  predecessor_schedule_id: number;
  constraint_type: number;
  time_lag: number;
  constraint_level: number;
  description?: string;
  share_personnel?: boolean;
  constraint_name?: string;
}

// 人员排班系统类型定义
export interface ShiftType {
  id?: number;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  work_hours: number;
  is_night_shift: boolean;
  is_weekend_shift: boolean;
  overtime_rate: number;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PersonnelSchedule {
  id?: number;
  employee_id: number;
  schedule_date: string;
  shift_type_id: number;
  planned_start_time?: string;
  planned_end_time?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  actual_work_hours?: number;
  status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  is_overtime: boolean;
  overtime_hours: number;
  notes?: string;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingRule {
  id?: number;
  rule_name: string;
  rule_type: 'MIN_REST_HOURS' | 'MAX_CONSECUTIVE_DAYS' | 'WEEKEND_REST' | 'NIGHT_SHIFT_LIMIT' | 'LONG_DAY_SHIFT_LIMIT' | 'CROSS_DAY_SHIFT_LIMIT' | 'DAILY_HOURS_LIMIT' | 'OVERTIME_LIMIT';
  rule_value: number;
  rule_unit?: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulingConflict {
  id?: number;
  conflict_type: 'RULE_VIOLATION' | 'DOUBLE_BOOKING' | 'INSUFFICIENT_REST' | 'OVERTIME_EXCEEDED' | 'DAILY_HOURS_EXCEEDED' | 'CONSECUTIVE_DAYS_EXCEEDED' | 'NIGHT_SHIFT_REST_VIOLATION' | 'QUARTERLY_HOURS_INSUFFICIENT' | 'CROSS_DAY_CONFLICT';
  employee_id: number;
  schedule_id?: number;
  conflict_date: string;
  conflict_description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  is_resolved: boolean;
  resolved_by?: number;
  resolved_at?: string;
  resolution_notes?: string;
  created_at?: string;
}

export interface NationalHoliday {
  id?: number;
  year: number;
  holiday_name: string;
  holiday_date: string;
  holiday_type: 'LEGAL_HOLIDAY' | 'WEEKEND_ADJUSTMENT' | 'MAKEUP_WORK';
  is_working_day: boolean;
  description?: string;
  created_at?: string;
}

export interface QuarterlyStandardHours {
  id?: number;
  year: number;
  quarter: number;
  total_days: number;
  weekend_days: number;
  legal_holiday_days: number;
  makeup_work_days: number;
  actual_working_days: number;
  standard_hours: number;
  calculation_details?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeScheduleHistory {
  id?: number;
  employee_id: number;
  schedule_date: string;
  shift_type_id: number;
  start_time: string;
  end_time: string;
  work_hours: number;
  overtime_hours: number;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  created_by?: number;
  created_at?: string;
  updated_by?: number;
  updated_at?: string;
}

export interface ScheduleChangeLog {
  id?: number;
  schedule_history_id: number;
  change_type: 'CREATE' | 'UPDATE' | 'CANCEL' | 'RESCHEDULE' | 'STATUS_CHANGE';
  old_values?: any;
  new_values?: any;
  change_reason?: string;
  changed_by: number;
  changed_at?: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: number;
  approved_at?: string;
  approval_notes?: string;
}

export interface EmployeeShiftPreference {
  id?: number;
  employee_id: number;
  shift_type_id: number;
  preference_score: number;
  is_available: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HolidayUpdateLog {
  id?: number;
  update_year: number;
  update_source: string;
  update_time?: string;
  records_count: number;
  update_status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  error_message?: string;
}

export interface Department {
  id?: number;
  parent_id?: number | null;
  dept_code: string;
  dept_name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Team {
  id?: number;
  department_id: number;
  team_code: string;
  team_name: string;
  description?: string;
  is_active?: boolean;
  default_shift_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Shift {
  id?: number;
  team_id: number;
  shift_code: string;
  shift_name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeRole {
  id?: number;
  role_code: string;
  role_name: string;
  description?: string;
  can_schedule: boolean;
  allowed_shift_codes?: string | null;
  default_skill_level?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeTeamRole {
  id?: number;
  employee_id: number;
  team_id: number;
  role_id: number;
  is_primary: boolean;
  effective_from: string;
  effective_to?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeUnavailability {
  id?: number;
  employee_id: number;
  start_datetime: string;
  end_datetime: string;
  reason_code: string;
  reason_label: string;
  category?: string | null;
  notes?: string | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}
