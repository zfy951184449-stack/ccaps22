/**
 * 求解监视器 TypeScript 类型定义
 *
 * 字段对齐冻结契约：docs/solver_v5/design/20_IMPLEMENTATION_PLAN.md §1.2-1.5
 */

import type { InfeasibilityGroupId } from '../../../types/solverV5';

// ── 阶段（solver 内部 5 值；不含 ASSEMBLING，ASSEMBLING 来自外层 stage）──────

export type PhaseKey =
  | 'BUILDING'
  | 'PRESOLVE'
  | 'SOLVING'
  | 'EXTRACTING'
  | 'DIAGNOSING';

export interface PhaseInfo {
  phase: PhaseKey;
  /** wall_time（秒）at phase enter */
  wall_time?: number;
}

// ── §1.2 model_stats ──────────────────────────────────────────────────────────

export interface ConstraintStat {
  /** 约束数量，或 "OFF" 表示该约束模块已禁用 */
  count: number | 'OFF';
  /** 建模耗时（ms） */
  ms: number;
  /** 涉及变量数 */
  vars: number;
}

export interface ModelStatsByLayer {
  assignments: number;
  shift: number;
  vacancy: number;
  special_cover: number;
  special_shortage: number;
  task_placement: number;
}

export interface ModelStatsByConstraint {
  [constraintName: string]: ConstraintStat;
}

export interface ModelStats {
  num_vars: number;
  num_constraints: number;
  by_layer: ModelStatsByLayer;
  by_constraint: ModelStatsByConstraint;
  /** 仅 SOLVER_DEBUG=1 时存在 */
  presolve?: {
    vars_before: number;
    vars_after: number;
    ctrs_before: number;
    ctrs_after: number;
  };
}

// ── §1.2 incumbent ────────────────────────────────────────────────────────────

/** objective breakdown 9 分量（§1.4） */
export interface IncumbentBreakdown {
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

/** 轻量聚合快照（方案 A，§1.2 preview） */
export interface PreviewSnapshot {
  fill_rate: number;
  vacant_positions: number;
  scheduled_shifts: number;
  top_assignments?: Array<{ op: number; pos: number; emp: number }>;
}

/** 收敛曲线一个点（push 到 incumbents[]） */
export interface IncumbentPoint {
  /** 来自 incumbent.wall_time（§1.2/§1.3 冻结字段名） */
  wall_time: number;
  obj: number;
  bound: number;
  gap: number;
  solution_count: number;
  breakdown?: IncumbentBreakdown;
  preview?: PreviewSnapshot | null;
}

// ── §1.2 search_stats ─────────────────────────────────────────────────────────

export interface SearchStats {
  branches: number;
  conflicts: number;
  booleans: number;
}

// ── §1.5 infeasibility（实时路径 + 结果路径组项字段相同）────────────────────

export interface InfeasibilityGroup {
  group: InfeasibilityGroupId;
  lit_key: string;
  message_zh: string;
  suggestion_zh: string;
  config_keys: string[];
  related_employees?: number[];
  related_dates?: string[];
}

export interface InfeasibilityResult {
  located: boolean;
  /** 实时路径字段名（§1.2 infeasibility.groups） */
  groups: InfeasibilityGroup[];
}

// ── §1.3 日志行 ───────────────────────────────────────────────────────────────

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type LogCategory = 'GENERAL' | 'CONSTRAINT' | 'CONFLICT' | 'SOLVER' | 'PROGRESS';

export interface LogLine {
  time: string;
  message: string;
  level: LogLevel;
  category?: LogCategory;
}

// ── §6.2 SolveStreamState（useSolveStreamV5 唯一真相源）──────────────────────

export interface SolveStreamState {
  /** 来自外层 SSE status */
  status: string;
  /** 来自外层 SSE stage（INIT|ASSEMBLING|SOLVING|DONE） */
  stage: string;
  /** 0-100 */
  progress: number;
  /** solver 内部阶段（5 值，不含 ASSEMBLING） */
  phase: PhaseKey | null;
  /** 各阶段耗时（ms） */
  phaseTimings: Partial<Record<PhaseKey, number>>;
  modelStats: ModelStats | null;
  /** 收敛曲线点（软上限 300，§8） */
  incumbents: IncumbentPoint[];
  latestPreview: PreviewSnapshot | null;
  searchStats: SearchStats | null;
  /** sparkline 滚动窗口，各保留最近 60 点（§8） */
  searchHistory: { branches: number[]; conflicts: number[] };
  logs: LogLine[];
  infeasibility: InfeasibilityResult | null;
  metrics: {
    assigned: number;
    elapsed: string;
  };
  error: string | null;
}

// ── §1.3 SSE payload 类型（前端接收） ────────────────────────────────────────

/** solver_progress 内部结构（可能是字符串，需先 JSON.parse） */
export interface SolverProgressPayload {
  progress?: number;
  metrics?: { assigned_count?: number; [key: string]: unknown };
  message?: string;
  logs?: string[];
  logs_full?: Array<{ time?: string; message?: string; level?: string; category?: string }>;

  // V5 累积结构
  phase?: PhaseKey | null;
  phase_timings?: Partial<Record<PhaseKey, number>>;
  model_stats?: ModelStats | null;
  search_stats?: SearchStats | null;
  convergence?: IncumbentPoint[];
  events?: Array<{ wall_time: number; type: string; phase?: PhaseKey; payload?: unknown }>;
  infeasibility?: InfeasibilityResult | null;
  viz_meta?: { convergence_count: number; events_count: number };

  // NEW_INCUMBENT 直接字段（来自 callback payload 的 incumbent）
  incumbent?: {
    obj: number;
    bound: number;
    gap: number;
    wall_time: number;
    solution_count: number;
    breakdown?: IncumbentBreakdown;
    preview?: PreviewSnapshot | null;
  };
}

/** SSE 外层 payload（§1.3） */
export interface SseProgressPayload {
  status?: string;
  stage?: string;
  error?: string | null;
  solver_progress?: SolverProgressPayload | string;
}
