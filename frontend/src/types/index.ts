export interface Employee {
  id?: number;
  employee_code: string;
  employee_name: string;
  department_id?: number | null;
  department_name?: string | null;
  primary_team_id?: number | null;
  primary_team_name?: string | null;
  primary_role_id?: number | null;
  primary_role_name?: string | null;
  employment_status?: string;
  hire_date?: string | null;
  shopfloor_baseline_pct?: number | null;
  shopfloor_upper_pct?: number | null;
  qualifications?: string[];
  org_role?: 'FRONTLINE' | 'SHIFT_LEADER' | 'GROUP_LEADER' | 'TEAM_LEADER' | 'DEPT_MANAGER';
  direct_leader_ids?: number[];
  direct_subordinate_ids?: number[];
  employeeCode?: string;
  employeeName?: string;
  departmentId?: number | null;
  departmentName?: string | null;
  primaryTeamId?: number | null;
  primaryTeamName?: string | null;
  primaryRoleId?: number | null;
  primaryRoleName?: string | null;
  employmentStatus?: string;
  hireDate?: string | null;
  shopfloorBaselinePct?: number | null;
  shopfloorUpperPct?: number | null;
  orgRole?: string;
  directLeaderIds?: number[];
  directSubordinateIds?: number[];
}

export type OrgUnitType = 'DEPARTMENT' | 'TEAM' | 'GROUP' | 'SHIFT';

export interface OrgLeaderNode {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
  directSubordinateCount: number;
  shiftLeaderCount: number;
  hasShiftLeaderGap: boolean;
}

export interface OrgUnitNode {
  id: number;
  parentId: number | null;
  unitType: OrgUnitType;
  unitCode: string | null;
  unitName: string;
  defaultShiftCode: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  leaders: OrgLeaderNode[];
  memberCount: number;
  children: OrgUnitNode[];
}

export interface OrgHierarchyStats {
  totalUnits: number;
  totalLeaders: number;
  orphanUnits: number;
  emptyLeadershipNodes: number;
}

export interface UnassignedEmployeeSummary {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
}

export interface OrgHierarchyResponse {
  units: OrgUnitNode[];
  unassignedEmployees: UnassignedEmployeeSummary[];
  stats: OrgHierarchyStats;
}

export interface EmployeeOrgMembership {
  unitId: number;
  unitType: OrgUnitType;
  unitName: string;
  unitCode: string | null;
  assignmentType: 'PRIMARY' | 'SECONDARY';
  roleAtUnit: 'LEADER' | 'MEMBER' | 'SUPPORT';
  startDate: string | null;
  endDate: string | null;
}

export interface EmployeeOrgReference {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
}

export interface EmployeeOrgContext {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
  memberships: EmployeeOrgMembership[];
  directLeaders: EmployeeOrgReference[];
  directSubordinates: EmployeeOrgReference[];
  reportingChain: EmployeeOrgReference[];
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
  recommended_day_offset?: number;
  window_start_time: number;
  window_start_day_offset?: number;
  window_end_time: number;
  window_end_day_offset?: number;
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

export type ShiftDefinitionCategory = 'STANDARD' | 'SPECIAL' | 'TEMPORARY';

export interface ShiftDefinition {
  id?: number;
  shift_code: string;
  shift_name: string;
  category: ShiftDefinitionCategory;
  start_time: string;
  end_time: string;
  is_cross_day: boolean;
  nominal_hours: number;
  max_extension_hours?: number;
  description?: string | null;
  is_active: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface BatchPlan {
  id: number;
  batch_code: string;
  batch_name: string;
  template_id: number;
  template_name?: string;
  project_code?: string | null;
  planned_start_date: string;
  planned_end_date?: string | null;
  template_duration_days?: number | null;
  plan_status: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED';
  description?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  operation_count?: number | null;
  total_required_people?: number | null;
  assigned_people_count?: number | null;
}

export interface BatchTemplateSummary {
  id: number;
  template_code: string;
  template_name: string;
  total_days?: number | null;
  calculated_duration?: number | null;
  stage_count?: number | null;
  operation_count?: number | null;
}

export interface BatchStatistics {
  total_batches: number;
  draft_count: number;
  planned_count: number;
  approved_count: number;
  cancelled_count: number;
}

export type SchedulingRunStage =
  | 'QUEUED'
  | 'PREPARING'
  | 'LOADING_DATA'
  | 'PLANNING'
  | 'PERSISTING'
  | 'COMPLETED'
  | 'FAILED';

export type SchedulingRunEventStatus =
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'SUCCESS'
  | 'PROGRESS';

export interface SchedulingRunEvent {
  id: number;
  run_id: number;
  event_key: string;
  stage: SchedulingRunStage;
  status: SchedulingRunEventStatus;
  message?: string | null;
  metadata?: any;
  created_at?: string;
}

export interface Department {
  id?: number;
  parent_id?: number | null;
  parentId?: number | null;
  unit_code?: string | null;
  unitCode?: string | null;
  unit_name?: string;
  unitName?: string;
  dept_code?: string | null;
  deptCode?: string | null;
  dept_name?: string;
  deptName?: string;
  description?: string | null;
  sort_order?: number | null;
  sortOrder?: number | null;
  is_active?: boolean | number;
  isActive?: boolean | number;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  unitType?: 'DEPARTMENT';
}

export interface Team {
  id?: number;
  department_id?: number | null;
  departmentId?: number | null;
  parent_id?: number | null;
  parentId?: number | null;
  unit_code?: string | null;
  unitCode?: string | null;
  unit_name?: string;
  unitName?: string;
  team_code?: string | null;
  teamCode?: string | null;
  team_name?: string;
  teamName?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  is_active?: boolean | number;
  isActive?: boolean | number;
  default_shift_code?: string | null;
  defaultShiftCode?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  departmentName?: string | null;
  unitType?: 'TEAM';
}

export interface EmployeeRole {
  id?: number;
  role_code: string;
  role_name: string;
  description?: string | null;
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
  employeeId?: number;
  teamId?: number;
  roleId?: number;
  isPrimary?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  employeeName?: string;
  teamName?: string;
  roleName?: string;
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
  employeeName?: string;
}

export type ConstraintSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ConstraintConflict {
  id: string;
  type: 'STRUCTURAL' | 'TIME';
  subType: string;
  severity: ConstraintSeverity;
  message: string;
  suggestion?: string;
  operationScheduleIds?: number[];
  constraintIds?: number[];
  details?: Record<string, unknown>;
}

export interface ConstraintValidationSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

export interface ConstraintValidationResult {
  hasConflicts: boolean;
  summary: ConstraintValidationSummary;
  conflicts: ConstraintConflict[];
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
  // 关联数据
  shift_name?: string;
  start_time?: string;
  end_time?: string;
  work_hours?: number;
  employee_name?: string;
  employee_code?: string;
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

export interface WorkHoursStatistics {
  employee_id: number;
  employee_name: string;
  period: string;
  total_work_hours: number;
  scheduled_hours: number;
  overtime_hours: number;
  standard_hours: number;
  work_hours_ratio: number;
  average_daily_hours: number;
  work_days: number;
  rest_days: number;
}

export type MetricPeriodType = 'MONTHLY' | 'QUARTERLY';

export type MetricGrade = 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export interface MetricThreshold {
  metricId: string;
  green: string;
  yellow?: string | null;
  red?: string | null;
}

export interface SchedulingMetric {
  id: string;
  name: string;
  grade: MetricGrade;
  value: number;
  unit?: string;
  threshold?: MetricThreshold;
  recommendation?: string;
}

export interface SchedulingMetricsSnapshot {
  snapshotId?: number;
  periodType: MetricPeriodType;
  periodStart: string;
  periodEnd: string;
  overallScore: number;
  grade: MetricGrade;
  metrics: SchedulingMetric[];
  createdAt: string;
  source?: 'AUTO_PLAN' | 'MANUAL';
}

export interface ComputeSchedulingMetricsPayload {
  periodType: MetricPeriodType;
  referenceDate?: string;
  departmentIds?: number[];
  includeDetails?: boolean;
  saveSnapshot?: boolean;
}

export interface HolidayServiceLogEntry {
  id: number;
  year: number;
  source: string;
  time: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  records: number;
  message?: string | null;
}

export interface HolidayServiceStatus {
  keyConfigured: boolean;
  maskedKey: string | null;
  coverage: {
    minDate: string | null;
    maxDate: string | null;
    years: number[];
  };
  recentLogs: HolidayServiceLogEntry[];
  lastSuccessTime: string | null;
  lastFailureTime: string | null;
}
