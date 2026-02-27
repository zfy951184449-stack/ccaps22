import { Dayjs } from 'dayjs';

/**
 * 批次卡片信息
 */
export interface BatchCard {
  batchId: number;
  batchCode: string;
  batchName: string;
  batchColor?: string;
  operationCount: number;
  startDate: string;  // 最早操作开始时间
  endDate: string;    // 最晚操作结束时间
  unassignedCount: number;
  partialCount: number;
  planStatus: string;
}

/**
 * 求解区间
 */
export interface SchedulingWindow {
  startDate: Dayjs;
  endDate: Dayjs;
  rawStartDate: Dayjs;  // 原始开始日期（批次操作的实际开始）
  rawEndDate: Dayjs;    // 原始结束日期（批次操作的实际结束）
  totalDays: number;
  workdays: number;
  triplePayDays: number;
  months: string[];     // 覆盖的月份列表，如 ['2025-01', '2025-02']
}

/**
 * 日历日信息
 */
export interface CalendarDay {
  calendar_date: string;
  is_workday: number | boolean;
  is_triple_salary: boolean;
  holiday_name?: string | null;
}

/**
 * 求解配置 - 按模块组织
 */
export interface SolverConfig {
  // ==================== 操作分配模块 ====================
  enableOperationAssignment: boolean;       // 模块开关
  skipPositionPenalty: number;              // 跳过位置（缺员）罚分
  sharingViolationPenalty: number;          // 共享人员不满足罚分

  // ==================== 班次一致性模块 ====================
  shiftMatchingToleranceMinutes: number;    // 班次匹配容差（分钟）
  workdayRestPenalty: number;               // 工作日休息罚分
  nonWorkdayWorkPenalty: number;            // 非工作日上班罚分

  // ==================== 月度工时模块 ====================
  enableMonthlyHours: boolean;              // 模块开关
  monthlyHoursLowerOffset: number;          // 月度工时下限偏移（小时）
  monthlyHoursUpperOffset: number;          // 月度工时上限偏移（小时）

  // ==================== 连续工作模块 ====================
  enableConsecutiveWork: boolean;           // 模块开关
  maxConsecutiveWorkdays: number;           // 最大连续工作天数

  // ==================== 夜班休息模块 ====================
  enableNightRest: boolean;                 // 模块开关
  nightRestHardDays: number;                // x: 夜班后硬约束休息天数（默认1天）
  nightRestSoftDays: number;                // y: 夜班后软约束休息天数（默认2天，y >= x）
  nightRestReward: number;                  // 满足软约束奖励分（每人次）
  nightRestPenalty: number;                 // 不满足软约束惩罚分（每人次）

  // ==================== 主管约束模块 ====================
  enableSupervisorConstraints: boolean;     // 模块开关
  groupLeaderOperationPenalty: number;      // S1a: GROUP_LEADER参与操作罚分（每人每小时）
  noGroupLeaderOperationReward: number;     // S1b: 操作中无GROUP_LEADER奖励（每操作）
  noSupervisorOnDutyPenalty: number;        // S2a: 有操作日无主管在岗罚分（硬约束降级，每天）
  extraSupervisorNonWorkdayPenalty: number; // S2b: 非工作日多余主管罚分（硬约束降级，每人次）
  teamLeaderNonWorkdayPenalty: number;      // S4: TEAM_LEADER非工作日上班罚分（每人次）
  rotationViolationPenalty: number;         // S6: 轮流值班违规罚分（每次）

  // ==================== 公平性约束模块 ====================
  enableFairness: boolean;                  // 模块开关
  nightShiftUnfairPenalty: number;          // F1: 夜班数量不公平罚分（每差1次）
  dayShiftUnfairPenalty: number;            // F2: 长白班数量不公平罚分（每差1次）
  nightIntervalUnfairPenalty: number;       // F3: 夜班间隔不均匀罚分（每次）
  operationTimeUnfairPenalty: number;       // F4: 操作时长不公平罚分（每差1小时）

  // ==================== 目标函数 ====================
  minimizeTripleHolidayStaff: boolean;      // 最小化三倍工资日人数

  // ==================== 求解器参数 ====================
  solverTimeLimit: number;                  // 求解时间限制（秒）
  solverImprovementTimeout: number;         // 无改进超时（秒）

}

/**
 * 求解摘要统计
 */
export interface SchedulingSummary {
  totalOperations: number;
  totalRequiredPeople: number;
  availableEmployees: number;
  unassignedOperations: number;
  constraintsSummary: {
    maxConsecutiveWorkdays: number;
    monthlyHoursRange: string;
    nightShiftRest: string;
  };
}

/**
 * 激活批次的操作数据（来自 API）
 */
export interface ActiveOperation {
  operation_plan_id: number;
  batch_id: number;
  batch_code: string;
  batch_name: string;
  batch_color?: string;
  plan_status: string;
  stage_name?: string;
  operation_name: string;
  planned_start_datetime: string;
  planned_end_datetime: string;
  planned_duration: number;
  required_people: number;
  assigned_people: number;
  assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED' | string;
}

// ==================== 求解器 V2 类型 ====================

/**
 * 求解任务状态
 */
export type SolveStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * 求解任务阶段
 */
export type SolveStage = 'PREPARING' | 'ASSEMBLING' | 'SOLVING' | 'PARSING' | 'PERSISTING' | 'COMPLETED' | 'ERROR';

/**
 * 求解进度信息
 */
export interface SolverProgress {
  solutions_found: number;       // 已找到的解数量
  best_objective: number | null; // 当前最优目标值
  elapsed_seconds: number;       // 已用时间（秒）
  time_limit_seconds: number;    // 时间限制（秒）
  estimated_remaining: number;   // 预估剩余时间（秒）
  progress_percent: number;      // 进度百分比
}

/**
 * 求解任务运行记录
 */
export interface SolveRun {
  id: number;
  run_code: string;
  status: SolveStatus;
  stage: SolveStage;
  window_start: string;
  window_end: string;
  target_batch_ids: number[];
  solver_progress?: SolverProgress | null;  // 求解进度
  result_summary?: {
    totalAssignments: number;
    totalShiftPlans: number;
    status: string;
    message: string;
  } | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

/**
 * 创建求解任务的请求参数
 */
export interface CreateSolveRequest {
  mode?: 'BATCH' | 'TIME_RANGE';
  batchIds?: number[];
  window: {
    start_date: string;
    end_date: string;
  };
  config?: {
    // 操作分配模块
    enable_operation_assignment?: boolean;
    skip_position_penalty?: number;
    sharing_violation_penalty?: number;

    // 班次一致性模块
    enable_shift_consistency?: boolean;
    shift_matching_tolerance_minutes?: number;
    workday_rest_penalty?: number;
    non_workday_work_penalty?: number;

    // 月度工时模块
    enforce_monthly_hours?: boolean;
    monthly_hours_lower_offset?: number;
    monthly_hours_upper_offset?: number;

    // 连续工作模块
    enforce_consecutive_limit?: boolean;
    max_consecutive_workdays?: number;

    // 夜班休息模块
    enforce_night_rest?: boolean;
    night_rest_hard_days?: number;
    night_rest_soft_days?: number;
    night_rest_reward?: number;
    night_rest_penalty?: number;

    // 主管约束模块
    enforce_supervisor_constraints?: boolean;
    group_leader_operation_penalty?: number;
    no_group_leader_operation_reward?: number;
    no_supervisor_on_duty_penalty?: number;
    extra_supervisor_non_workday_penalty?: number;
    team_leader_non_workday_penalty?: number;
    rotation_violation_penalty?: number;

    // 公平性约束模块
    enforce_fairness?: boolean;
    night_shift_unfair_penalty?: number;
    day_shift_unfair_penalty?: number;
    night_interval_unfair_penalty?: number;
    operation_time_unfair_penalty?: number;

    // 目标函数
    minimize_triple_holiday_staff?: boolean;

    // 求解器参数
    solver_time_limit_seconds?: number;
    solver_improvement_timeout?: number;
  };
}

/**
 * 创建求解任务的响应
 */
export interface CreateSolveResponse {
  success: boolean;
  data?: {
    runId: number;
    runCode: string;
    status: string;
    message: string;
  };
  error?: string;
}

/**
 * 阶段描述映射
 */
export const STAGE_LABELS: Record<SolveStage, string> = {
  PREPARING: '准备中',
  ASSEMBLING: '组装数据',
  SOLVING: '求解中',
  PARSING: '解析结果',
  PERSISTING: '保存结果',
  COMPLETED: '已完成',
  ERROR: '发生错误',
};

/**
 * 阶段进度百分比映射
 */
export const STAGE_PROGRESS: Record<SolveStage, number> = {
  PREPARING: 10,
  ASSEMBLING: 25,
  SOLVING: 50,
  PARSING: 75,
  PERSISTING: 90,
  COMPLETED: 100,
  ERROR: 0,
};

// ==================== 求解结果类型 ====================

/**
 * 操作分配结果
 */
export interface OperationAssignment {
  operation_plan_id: number;
  position_number: number;       // 岗位编号
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  operation_name?: string;
  batch_code?: string;
  planned_start?: string;
  planned_end?: string;
}

/**
 * 班次计划中的操作详情
 */
export interface ShiftPlanOperation {
  operation_plan_id: number;
  planned_start: string;
  planned_end: string;
  duration_minutes: number;
  operation_name?: string;
}

/**
 * 班次计划
 * plan_type 取值: BASE(基础班), PRODUCTION(生产班), OVERTIME(加班), REST(休息)
 */
export interface ShiftPlan {
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  date: string;
  plan_type: 'BASE' | 'PRODUCTION' | 'OVERTIME' | 'REST' | 'WORK' | 'UNAVAILABLE';
  plan_hours: number;
  shift_id?: number | null;
  shift_code?: string | null;
  shift_name?: string | null;
  shift_nominal_hours?: number | null;
  is_night_shift: boolean;
  operations: ShiftPlanOperation[];
  workshop_minutes: number;
  is_overtime: boolean;
  is_buffer: boolean;
}

/**
 * 工时统计摘要
 */
export interface HoursSummary {
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  month: string;
  scheduled_hours: number;       // 排班工时（不含三倍工资日）
  standard_hours: number;        // 标准工时（求解区间内该月工作日 × 8h）
  hours_deviation: number;       // 偏差 = 排班工时 - 标准工时
  workshop_hours: number;        // 车间工时（与排班工时相同）
  overtime_hours: number;        // 加班工时（暂不使用）
  work_days: number;             // 工作日数（不含三倍工资日）
  rest_days: number;             // 休息日数
  triple_salary_days?: number;   // 三倍工资日数（不计入工时）
  buffer_days: number;           // 缓冲日数（暂不使用）
  is_within_bounds: boolean;     // 是否在允许范围内
  min_hours?: number;            // 允许的最低工时
  max_hours?: number;            // 允许的最高工时
}

/**
 * 求解器警告
 */
export interface SolverWarning {
  type: string;
  message: string;
  count?: number | null;
  operation_ids: number[];
  employee_ids: number[];
}

/**
 * 求解器诊断信息
 */
export interface SolverDiagnostics {
  total_operations: number;
  total_positions: number;           // 新增：操作岗位总数
  assigned_operations: number;
  assigned_positions: number;        // 新增：已分配岗位数
  total_employees: number;
  employees_with_shifts: number;     // 新增：安排了班次的员工数
  total_days: number;
  skipped_operations: number;
  skipped_positions: number;         // 新增：未分配岗位数
  shift_plans_created: number;
  solve_time_seconds: number;
  solutions_found: number;
  objective_value?: number | null;
  monthly_hours_violations: number;
  consecutive_work_violations: number;
  night_rest_violations: number;
  employee_utilization_rate: number;
  operation_fulfillment_rate: number;
}

/**
 * 操作需求（用于计算分配状态）
 */
export interface OperationDemand {
  operation_plan_id: number;
  batch_id: number;
  batch_code: string;
  batch_name: string;
  operation_name: string;
  planned_start_datetime: string;
  planned_end_datetime: string;
  required_people: number;
}

/**
 * 班次定义（用于时间校验和统计）
 */
export interface ShiftDefinitionInfo {
  shift_id: number;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  is_cross_day: boolean;
  nominal_hours: number;
  is_night_shift: boolean;
}

/**
 * 操作约束冲突
 */
export interface OperationConflict {
  op_id: number;
  op_name: string;
  date: string;
  conflict_type: string;
  severity: string;
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
 * 求解结果详情
 */
export interface SolveResult {
  request_id: string;
  status: string;
  summary: string;
  assignments: OperationAssignment[];
  shift_plans: ShiftPlan[];
  hours_summaries: HoursSummary[];
  operation_demands?: OperationDemand[];       // 新增
  shift_definitions?: ShiftDefinitionInfo[];   // 新增
  warnings: SolverWarning[];
  diagnostics?: SolverDiagnostics | null;
  conflict_report?: ConflictReport | null;     // 冲突检测报告
  error_message?: string | null;
}

/**
 * 操作分配展示数据（合并岗位）
 */
export interface OperationAssignmentRow {
  operation_plan_id: number;
  batch_code: string;
  batch_name: string;
  operation_name: string;
  planned_start: string;
  planned_end: string;
  required_people: number;
  positions: {
    position_number: number;
    employee_id?: number;
    employee_name?: string;
    employee_code?: string;
    is_assigned: boolean;
  }[];
  assigned_count: number;
  assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
}

/**
 * 班次计划展示数据（增强）
 */
export interface ShiftPlanRow extends ShiftPlan {
  actual_start_time?: string;    // 实际最早操作开始时间
  actual_end_time?: string;      // 实际最晚操作结束时间
  is_time_warning: boolean;      // 是否超出班次时间范围
  operation_count: number;       // 当天操作数量
}

/**
 * 工时统计展示数据（增强）
 */
export interface HoursSummaryRow extends HoursSummary {
  shift_counts: Record<string, number>;  // 各班次天数统计
}

