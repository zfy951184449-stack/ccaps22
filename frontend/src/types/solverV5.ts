/**
 * V5 求解器前端类型定义
 *
 * 冻结契约来源：docs/solver_v5/design/20_IMPLEMENTATION_PLAN.md §1
 * SolverConfig = SolverConfigV4Base & SolverConfigV5Extension（87 字段不动 + 3 增强键）
 */

// ── §4 SolverConfig V4 基础字段（87 字段，原样复制 V4，键名/默认值一字不改）─────

export type LeaderOpsPolicy = 'allow' | 'soft' | 'ban';

/** V4 原有 87 字段（§5 B 铁律：绝不改键名/默认值） */
export interface SolverConfigV4Base {
  enable_share_group: boolean;
  enable_unique_employee: boolean;
  enable_one_position: boolean;
  enable_locked_operations: boolean;
  enable_locked_shifts: boolean;
  strict_locked_shifts: boolean;
  enable_shift_assignment: boolean;
  enable_max_consecutive_work_days: boolean;
  enable_max_consecutive_rest_days: boolean;
  enable_standard_hours: boolean;
  enable_night_rest: boolean;
  enable_no_isolated_night_shift: boolean;
  enable_night_shift_interval: boolean;
  enable_balance_night_shifts: boolean;
  enable_prefer_standard_shift: boolean;

  // 上班/休息节奏约束
  enable_consecutive_work_rest_pattern: boolean;
  min_consecutive_work_days_pattern: number;
  max_consecutive_work_days_pattern: number;
  min_consecutive_rest_days_pattern: number;
  max_consecutive_rest_days_pattern: number;

  // Parameters
  max_consecutive_rest_days: number;
  min_night_shift_interval: number;
  min_rest_after_night_block: number;

  // Night Rest Extension (soft)
  enable_prefer_extended_night_rest: boolean;
  preferred_night_rest_days: number;
  objective_weight_night_rest_extend: number;

  team_ids?: number[];

  // Objectives
  enable_minimize_deviation: boolean;
  enable_minimize_special_shifts: boolean;
  objective_weight_deviation: number;
  objective_weight_special_shifts: number;
  objective_weight_night_balance: number;
  enable_balance_weekend_work: boolean;
  objective_weight_weekend_balance: number;
  enable_minimize_triple_salary: boolean;
  objective_weight_triple_salary: number;

  // Vacancy
  allow_position_vacancy: boolean;
  objective_weight_vacancy: number;
  off_hours_multiplier: number;

  // Standalone Tasks
  enable_standalone_tasks: boolean;
  allow_standalone_vacancy: boolean;
  objective_weight_standalone_vacancy: number;

  // Leadership Coverage
  enable_leadership_coverage: boolean;
  enable_leader_production_coverage: boolean;
  leader_ops_policy_group_leader: LeaderOpsPolicy;
  leader_ops_policy_team_leader: LeaderOpsPolicy;
  leader_ops_policy_dept_manager: LeaderOpsPolicy;
  leader_weekend_policy_group_leader: LeaderOpsPolicy;
  leader_weekend_policy_team_leader: LeaderOpsPolicy;
  leader_weekend_policy_dept_manager: LeaderOpsPolicy;
  objective_weight_leader_nonworkday: number;
  objective_weight_leader_workday_rest: number;
  objective_weight_leader_ops: number;
  objective_weight_leader_special: number;

  // Solver Time Control
  max_time_seconds: number;
  stagnation_limit: number;

  // Special Shift Coverage
  enable_special_shift_coverage?: boolean;

  // Special Joint Coverage
  enable_special_shift_joint_coverage?: boolean;
}

/** V5 新增 3 个增强键（§1.6 冻结默认值） */
export interface SolverConfigV5Extension {
  /** 软 hint 加速，绝不 fix。默 true */
  enable_solution_hint: boolean;
  /** L4 分阶段，默 false；关=与 V4 等价 */
  enable_lexicographic_l4: boolean;
  /** 仅控可视化上报，纯观测变量。默 true */
  enable_objective_breakdown: boolean;
}

/** V5 完整 SolverConfig = V4 基础 + V5 增强（§4） */
export type SolverConfig = SolverConfigV4Base & SolverConfigV5Extension;

/** V5 config 默认值（§1.6 冻结） */
export const DEFAULT_SOLVER_CONFIG_V5: SolverConfig = {
  // ── V4 原有默认值（与 V4 SolverConfigurationModal.tsx DEFAULT_SOLVER_CONFIG 逐字节一致）──
  enable_share_group: true,
  enable_unique_employee: true,
  enable_one_position: true,
  enable_locked_operations: true,
  enable_locked_shifts: true,
  strict_locked_shifts: false,
  enable_shift_assignment: true,
  enable_max_consecutive_work_days: true,
  enable_max_consecutive_rest_days: true,
  enable_standard_hours: true,
  enable_night_rest: true,
  enable_no_isolated_night_shift: true,
  enable_night_shift_interval: true,
  enable_balance_night_shifts: true,
  enable_prefer_standard_shift: false,

  enable_consecutive_work_rest_pattern: false,
  min_consecutive_work_days_pattern: 2,
  max_consecutive_work_days_pattern: 3,
  min_consecutive_rest_days_pattern: 2,
  max_consecutive_rest_days_pattern: 3,

  max_consecutive_rest_days: 4,
  min_night_shift_interval: 7,
  min_rest_after_night_block: 2,

  enable_prefer_extended_night_rest: true,
  preferred_night_rest_days: 2,
  objective_weight_night_rest_extend: 15,

  team_ids: [],

  enable_minimize_deviation: true,
  enable_minimize_special_shifts: true,
  objective_weight_deviation: 1,
  objective_weight_special_shifts: 100,
  objective_weight_night_balance: 5,
  enable_balance_weekend_work: true,
  objective_weight_weekend_balance: 5,
  enable_minimize_triple_salary: true,
  objective_weight_triple_salary: 10,

  allow_position_vacancy: false,
  objective_weight_vacancy: 10000,
  off_hours_multiplier: 1.5,

  enable_standalone_tasks: true,
  allow_standalone_vacancy: true,
  objective_weight_standalone_vacancy: 5000,

  enable_leadership_coverage: true,
  enable_leader_production_coverage: true,
  leader_ops_policy_group_leader: 'soft',
  leader_ops_policy_team_leader: 'ban',
  leader_ops_policy_dept_manager: 'ban',
  leader_weekend_policy_group_leader: 'soft',
  leader_weekend_policy_team_leader: 'ban',
  leader_weekend_policy_dept_manager: 'soft',
  objective_weight_leader_nonworkday: 20,
  objective_weight_leader_workday_rest: 10,
  objective_weight_leader_ops: 30,
  objective_weight_leader_special: 50,

  max_time_seconds: 300,
  stagnation_limit: 300,

  // ── V5 新增默认值（§1.6 冻结）──
  enable_solution_hint: true,
  enable_lexicographic_l4: false,
  enable_objective_breakdown: true,
};

// ── V5 求解运行结果类型（§1.3-1.5）─────────────────────────────────────────────

/** objective_breakdown 9 分量（§1.4） */
export interface ObjectiveBreakdown {
  special_shortage_penalty: number;
  vacancy_penalty: number;
  special_impact: number;
  hours_deviation_scaled: number;
  special_shift_count: number;
  night_shift_variance: number;
  weekend_work_variance: number;
  triple_salary_count: number;
  leadership_penalty: number;
}

/** weights_applied（§1.4） */
export interface WeightsApplied {
  special_impact: number;
  hours_deviation: number;
  special_shifts: number;
  night_balance: number;
  weekend_balance: number;
  triple_salary: number;
}

/** infeasibility_analysis result 路径（§1.5）*/
export interface InfeasibilityConflictGroup {
  group: InfeasibilityGroupId;
  lit_key: string;
  message_zh: string;
  suggestion_zh: string;
  config_keys: string[];
  related_employees?: number[];
  related_dates?: string[];
}

/** §1.5 七组 group 标识符（冻结，三方逐字符一致） */
export type InfeasibilityGroupId =
  | 'STANDARD_HOURS'
  | 'LOCKED_OPERATIONS'
  | 'CONSECUTIVE_DAYS'
  | 'SPECIAL_SHIFT_COVERAGE'
  | 'LEADERSHIP_COVERAGE'
  | 'LOCKED_SHIFTS'
  | 'POSITION_MUST_FILL';

export interface InfeasibilityAnalysis {
  is_infeasible: true;
  located: boolean;
  diagnosed_at: string;
  minimal_conflict_groups: InfeasibilityConflictGroup[];
}

/** V5 solve result（在 V4 基础上追加 metrics.objective_breakdown + infeasibility_analysis） */
export interface SolveResultV5Metrics {
  assigned_count?: number;
  objective_value?: number;
  best_bound?: number;
  gap?: number;
  total_deviation_hours?: number;
  objective_breakdown?: ObjectiveBreakdown & { weights_applied?: WeightsApplied };
  [key: string]: unknown;
}

export interface SolveResultV5 {
  status?: string;
  schedules?: unknown[];
  unassigned_jobs?: unknown[];
  metrics?: SolveResultV5Metrics;
  infeasibility_analysis?: InfeasibilityAnalysis;
  [key: string]: unknown;
}

/** V5 run 记录 */
export interface SolveRunV5 {
  id: number;
  run_code: string;
  status: string;
  stage?: string;
  created_at: string;
  updated_at?: string;
  batch_ids?: number[];
  solve_start_date?: string;
  solve_end_date?: string;
  result?: SolveResultV5;
  [key: string]: unknown;
}
