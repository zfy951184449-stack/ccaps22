/**
 * 排班求解器 V2 类型定义
 * 
 * 本文件定义了求解器输入输出的 TypeScript 类型。
 * 与 Python contracts 模块保持一致。
 */

// ==================== 枚举类型 ====================

export type QualificationMatchMode = 'EXACT' | 'MINIMUM';

export type PlanCategory = 'WORK' | 'REST';

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'TIMEOUT' | 'ERROR';

export type WarningType =
  | 'OPERATION_SKIPPED'
  | 'INSUFFICIENT_CANDIDATES'
  | 'SHIFT_MISMATCH'
  | 'QUALIFICATION_MISMATCH'
  | 'CAPACITY_WARNING'
  | 'CONSTRAINT_RELAXED';

export type ConflictType =
  | 'NO_CANDIDATES'
  | 'ALL_UNAVAILABLE'
  | 'DEMAND_OVERFLOW'
  | 'NIGHT_REST';

export type ConflictSeverity = 'CRITICAL' | 'WARNING';

// ==================== 请求相关类型 ====================

/**
 * 员工资质信息
 */
export interface EmployeeQualification {
  qualification_id: number;
  qualification_code: string;
  qualification_name: string;
  level: number;
}

/**
 * 员工档案
 */
export interface EmployeeProfile {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  org_role: string;
  department_id?: number | null;
  team_id?: number | null;
  qualifications: EmployeeQualification[];
}

/**
 * 资质需求
 */
export interface QualificationRequirement {
  qualification_id: number;
  min_level: number;
}

/**
 * 岗位资质需求
 * 
 * 一个操作可能有多个岗位，每个岗位有不同的资质要求。
 * 例如：某操作需要3人，岗位1需要高级资质，岗位2/3只需要初级资质。
 */
export interface PositionQualification {
  position_number: number;                    // 岗位编号（从1开始）
  qualifications: QualificationRequirement[]; // 该岗位的资质需求
}

/**
 * 操作需求
 */
export interface OperationDemand {
  operation_plan_id: number;
  batch_id: number;
  batch_code: string;
  operation_id: number;
  operation_code: string;
  operation_name: string;
  stage_id?: number | null;
  stage_name?: string | null;

  // 时间信息
  planned_start: string;
  planned_end: string;
  planned_duration_minutes: number;

  // 人员需求
  required_people: number;
  position_qualifications: PositionQualification[]; // 按岗位的资质需求

  // 窗口信息
  window_start?: string | null;
  window_end?: string | null;

  // 状态
  is_locked: boolean;
}

/**
 * 日历日信息
 */
export interface CalendarDay {
  date: string;
  is_workday: boolean;
  is_triple_salary: boolean;
  holiday_name?: string | null;
  holiday_type?: string | null;
  standard_hours: number;
}

/**
 * 班次定义
 */
export interface ShiftDefinition {
  shift_id: number;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  nominal_hours: number;
  is_cross_day: boolean;
  is_night_shift: boolean;
  priority: number;
}

/**
 * 共享组成员
 */
export interface SharedPreferenceMember {
  operation_plan_id: number;
  required_people: number;
}

/**
 * 共享偏好（共享组）
 */
export interface SharedPreference {
  share_group_id: string;
  share_group_name?: string | null;
  share_mode: 'SAME_TEAM' | 'DIFFERENT';  // 共享模式
  members: SharedPreferenceMember[];
}

/**
 * 锁定的操作分配
 */
export interface LockedOperation {
  operation_plan_id: number;
  enforced_employee_ids: number[];
}

/**
 * 锁定的班次
 */
export interface LockedShift {
  employee_id: number;
  date: string;
  plan_category: PlanCategory;
  shift_id?: number | null;
}

/**
 * 历史班次记录
 * 
 * 用于连续工作约束和夜班休息约束的边界检查。
 * 存储求解区间之前的班次记录（不一定是锁定的）。
 */
export interface HistoricalShift {
  employee_id: number;
  date: string;
  is_work: boolean;  // 是否上班（PRODUCTION/BASE 为 true，REST/OVERTIME 为 false）
  is_night: boolean; // 是否夜班
}

/**
 * 员工不可用时间段
 */
export interface EmployeeUnavailability {
  employee_id: number;
  start_datetime: string;
  end_datetime: string;
  reason_code?: string | null;
  reason_label?: string | null;
}

/**
 * 求解器配置
 */
export interface SolverConfig {
  // ==================== 操作分配模块 ====================
  enable_operation_assignment?: boolean;      // 模块开关（默认 true）
  skip_position_penalty: number;              // 跳过位置（缺员）罚分
  sharing_violation_penalty: number;          // 共享人员不满足罚分

  // ==================== 月度工时约束（硬约束） ====================
  // 月度排班工时范围: [标准工时 - lower_offset, 标准工时 + upper_offset]
  monthly_hours_lower_offset: number;  // 月度工时下限偏移（小时），即可以少于标准工时的最大值
  monthly_hours_upper_offset: number;  // 月度工时上限偏移（小时），即可以超过标准工时的最大值
  enforce_monthly_hours: boolean;

  // ==================== 季度工时约束（硬约束） ====================
  enforce_quarter_hours: boolean;

  // ==================== 连续工作约束（硬约束） ====================
  max_consecutive_workdays: number;  // 可在前端调整
  enforce_consecutive_limit: boolean;

  // ==================== 夜班约束 ====================
  night_rest_hard_days: number;   // x: 夜班后硬约束休息天数（默认1天）
  night_rest_soft_days: number;   // y: 夜班后软约束休息天数（默认2天，y >= x）
  night_rest_reward: number;      // 满足软约束奖励分（每人次）
  night_rest_penalty: number;     // 不满足软约束惩罚分（每人次）
  enforce_night_rest: boolean;

  // ==================== 三倍工资日约束（软约束） ====================
  minimize_triple_holiday_staff: boolean;

  // ==================== 缓冲期配置（已废弃） ====================
  buffer_days_before_production: number;  // 生产期前缓冲天数
  buffer_days_after_production: number;   // 生产期后缓冲天数

  // ==================== 班次一致性模块 ====================
  shift_matching_tolerance_minutes: number;
  workday_rest_penalty: number;             // 工作日休息罚分
  non_workday_work_penalty: number;         // 非工作日上班罚分

  // ==================== 求解器参数 ====================
  solver_time_limit_seconds: number;
  solver_improvement_timeout: number;

  // ==================== 主管约束模块 ====================
  enforce_supervisor_constraints: boolean;
  group_leader_operation_penalty: number;     // S1a: GROUP_LEADER参与操作的罚分（每人每小时）
  no_group_leader_operation_reward: number;   // S1b: 操作中无GROUP_LEADER的奖励（每操作）
  no_supervisor_on_duty_penalty: number;      // S2a: 有操作日无主管在岗罚分（硬约束降级，每天）
  extra_supervisor_non_workday_penalty: number; // S2b: 非工作日多余主管罚分（硬约束降级，每人次）
  team_leader_non_workday_penalty: number;    // S4: TEAM_LEADER非工作日上班罚分（每人次）
  rotation_violation_penalty: number;         // S6: 轮流值班违规罚分（每次）

  // ==================== 公平性约束模块 ====================
  enforce_fairness: boolean;                  // 是否启用公平性约束
  night_shift_unfair_penalty: number;         // F1: 夜班数量不公平罚分（每差1次）
  day_shift_unfair_penalty: number;           // F2: 长白班数量不公平罚分（每差1次）
  night_interval_unfair_penalty: number;      // F3: 夜班间隔不均匀罚分（每次）
  operation_time_unfair_penalty: number;      // F4: 操作时长不公平罚分（每差1小时）

  // ==================== 其他 ====================
  enforce_employee_unavailability: boolean;
}

/**
 * 求解时间窗口
 */
export interface SchedulingWindow {
  start_date: string;
  end_date: string;
}

/**
 * 求解器请求
 */
export interface SolverRequest {
  request_id: string;
  window: SchedulingWindow;
  operation_demands: OperationDemand[];
  employee_profiles: EmployeeProfile[];
  calendar: CalendarDay[];
  shift_definitions: ShiftDefinition[];

  config: SolverConfig;
  shared_preferences: SharedPreference[];
  locked_operations: LockedOperation[];
  locked_shifts: LockedShift[];
  employee_unavailability: EmployeeUnavailability[];
  historical_shifts: HistoricalShift[];  // 历史班次（用于连续工作边界检查）

  target_batch_ids: number[];
  created_by?: number | null;
}

// ==================== 响应相关类型 ====================

/**
 * 操作分配结果
 */
export interface OperationAssignment {
  operation_plan_id: number;
  position_number: number;    // 岗位编号
  employee_id: number;
}

/**
 * 班次计划中的操作详情
 */
export interface ShiftPlanOperation {
  operation_plan_id: number;
  planned_start: string;
  planned_end: string;
  duration_minutes: number;
}

/**
 * 班次计划
 */
export interface ShiftPlan {
  employee_id: number;
  date: string;
  plan_type: PlanCategory;
  plan_hours: number;

  shift_id?: number | null;
  shift_code?: string | null;
  shift_name?: string | null;
  shift_nominal_hours?: number | null;
  is_night_shift: boolean;

  operations: ShiftPlanOperation[];
  workshop_minutes: number;
  is_overtime: boolean;
  is_buffer: boolean;  // 是否缓冲期（无操作但有班次）
}

/**
 * 工时统计摘要
 */
export interface HoursSummary {
  employee_id: number;
  month: string;

  scheduled_hours: number;
  standard_hours: number;
  hours_deviation: number;

  workshop_hours: number;
  overtime_hours: number;

  work_days: number;
  rest_days: number;
  buffer_days: number;  // 缓冲期天数

  is_within_bounds: boolean;
}

/**
 * 求解器警告
 */
export interface SolverWarning {
  type: WarningType;
  message: string;
  count?: number | null;
  operation_ids: number[];
  employee_ids: number[];
}

/**
 * 求解器诊断信息
 */
export interface SolverDiagnostics {
  // 输入统计
  total_operations: number;
  total_employees: number;
  total_days: number;

  // 输出统计
  assigned_operations: number;
  skipped_operations: number;
  shift_plans_created: number;

  // 求解统计
  solve_time_seconds: number;
  solutions_found: number;
  objective_value?: number | null;

  // 约束满足情况
  monthly_hours_violations: number;
  consecutive_work_violations: number;
  night_rest_violations: number;

  // 资源利用率
  employee_utilization_rate: number;
  operation_fulfillment_rate: number;
}

/**
 * 操作约束冲突
 */
export interface OperationConflict {
  op_id: number;
  op_name: string;
  date: string;
  conflict_type: ConflictType;
  severity: ConflictSeverity;
  reason: string;
  details: string[];
}

/**
 * 冲突检测报告
 */
export interface ConflictReport {
  critical_conflicts: OperationConflict[];
  warnings: OperationConflict[];
  summary?: string;
}

/**
 * 求解器响应
 */
export interface SolverResponse {
  request_id: string;
  status: SolverStatus;
  summary: string;

  assignments: OperationAssignment[];
  shift_plans: ShiftPlan[];
  hours_summaries: HoursSummary[];

  warnings: SolverWarning[];
  diagnostics?: SolverDiagnostics | null;
  conflict_report?: ConflictReport | null;

  error_message?: string | null;
  error_details?: Record<string, unknown> | null;
}

// ==================== 默认配置 ====================

/**
 * 默认求解器配置
 */
export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  // 操作分配模块
  enable_operation_assignment: true,
  skip_position_penalty: 1000,
  sharing_violation_penalty: 1000,

  // 月度工时约束（硬约束）
  // 下限：标准工时 - 4h，上限：标准工时 + 32h
  monthly_hours_lower_offset: 4,
  monthly_hours_upper_offset: 32,
  enforce_monthly_hours: true,

  // 季度工时约束（硬约束）
  enforce_quarter_hours: true,

  // 连续工作约束（硬约束）
  max_consecutive_workdays: 6,
  enforce_consecutive_limit: true,

  // 夜班约束
  night_rest_hard_days: 1,    // x: 夜班后硬约束休息天数
  night_rest_soft_days: 2,    // y: 夜班后软约束休息天数
  night_rest_reward: 100,     // 满足软约束奖励分
  night_rest_penalty: 300,    // 不满足软约束惩罚分
  enforce_night_rest: true,

  // 三倍工资日约束（软约束）
  minimize_triple_holiday_staff: true,

  // 缓冲期配置
  buffer_days_before_production: 0,
  buffer_days_after_production: 0,

  // 班次一致性模块
  shift_matching_tolerance_minutes: 30,
  workday_rest_penalty: 10,
  non_workday_work_penalty: 1000,

  // 求解器参数
  solver_time_limit_seconds: 60,
  solver_improvement_timeout: 30,

  // 主管约束模块
  enforce_supervisor_constraints: true,
  group_leader_operation_penalty: 300,     // S1a: GROUP_LEADER参与操作罚分（每人每小时）
  no_group_leader_operation_reward: 100,   // S1b: 操作中无GROUP_LEADER奖励（每操作）
  no_supervisor_on_duty_penalty: 5000,     // S2a: 有操作日无主管在岗罚分（硬约束降级，每天）
  extra_supervisor_non_workday_penalty: 3000, // S2b: 非工作日多余主管罚分（硬约束降级，每人次）
  team_leader_non_workday_penalty: 500,    // S4: TEAM_LEADER非工作日上班罚分（每人次）
  rotation_violation_penalty: 200,         // S6: 轮流值班违规罚分（每次）

  // 公平性约束模块
  enforce_fairness: true,
  night_shift_unfair_penalty: 200,         // F1: 夜班数量不公平罚分（每差1次）
  day_shift_unfair_penalty: 200,           // F2: 长白班数量不公平罚分（每差1次）
  night_interval_unfair_penalty: 100,      // F3: 夜班间隔不均匀罚分（每次）
  operation_time_unfair_penalty: 50,       // F4: 操作时长不公平罚分（每差1小时）

  // 其他
  enforce_employee_unavailability: true,
};

// ==================== 工具函数 ====================

/**
 * 创建错误响应
 */
export function createErrorResponse(requestId: string, message: string, details?: Record<string, unknown>): SolverResponse {
  return {
    request_id: requestId,
    status: 'ERROR',
    summary: `求解失败: ${message}`,
    assignments: [],
    shift_plans: [],
    hours_summaries: [],
    warnings: [],
    error_message: message,
    error_details: details,
  };
}

/**
 * 创建无可行解响应
 */
export function createInfeasibleResponse(requestId: string, reason: string, diagnostics?: SolverDiagnostics): SolverResponse {
  return {
    request_id: requestId,
    status: 'INFEASIBLE',
    summary: `无可行解: ${reason}`,
    assignments: [],
    shift_plans: [],
    hours_summaries: [],
    warnings: [],
    diagnostics,
    error_message: reason,
  };
}
