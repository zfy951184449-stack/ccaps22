/**
 * 监视器图表配色表
 *
 * 规则：值一律 var(--wx-*) CSS 变量，无硬编码 hex（AGENTS.md 铁律）。
 * 来源：docs/solver_v5/design/12_frontend_design.md §5.2
 */

export const MONITOR_COLORS = {
  // ── 收敛曲线（区块 c） ──
  /** obj 主线（深海蓝） */
  objective: 'var(--wx-blue-700)',
  /** best_bound（交互蓝，虚线） */
  bound: 'var(--wx-blue-500)',
  /** gap 阴影（淡蓝 region） */
  gapRegion: 'var(--wx-blue-100)',

  // ── 目标分量 O0-O8（区块 d）—— 语义色 + 蓝绿梯度区分（9 色）──
  /** O0 special_shortage_penalty（最痛）红 */
  o0_special_shortage: 'var(--wx-red-500)',
  /** O1 vacancy_penalty 琥珀 */
  o1_vacancy: 'var(--wx-amber-500)',
  /** O2 special_impact */
  o2_special_impact: 'var(--wx-blue-100)',
  /** O3 hours_deviation_scaled */
  o3_hours_dev: 'var(--wx-blue-500)',
  /** O4 special_shift_count */
  o4_special_shift: 'var(--wx-blue-700)',
  /** O5 night_shift_variance */
  o5_night_var: 'var(--wx-green-500)',
  /** O6 weekend_work_variance */
  o6_weekend_var: 'var(--wx-fg-3)',
  /** O7 triple_salary_count */
  o7_triple_salary: 'var(--wx-fg-4)',
  /** O8 leadership_penalty */
  o8_leadership: 'var(--wx-fg-2)',

  // ── 阶段时间轴（区块 a） ──
  phase_assembling: 'var(--wx-fg-4)',
  phase_building: 'var(--wx-blue-500)',
  phase_presolve: 'var(--wx-blue-100)',
  phase_solving: 'var(--wx-blue-700)',
  phase_extracting: 'var(--wx-green-500)',
  phase_diagnosing: 'var(--wx-amber-500)',

  // ── 搜索强度（区块 f） ──
  branches: 'var(--wx-blue-500)',
  conflicts: 'var(--wx-red-500)',

  // ── 通用 ──
  grid: 'var(--wx-divider)',
  border: 'var(--wx-border)',
} as const;

export type MonitorColorKey = keyof typeof MONITOR_COLORS;

/** O0-O8 分量名到颜色键的映射（区块 d 堆叠图） */
export const BREAKDOWN_COLOR_KEYS = [
  'o0_special_shortage',
  'o1_vacancy',
  'o2_special_impact',
  'o3_hours_dev',
  'o4_special_shift',
  'o5_night_var',
  'o6_weekend_var',
  'o7_triple_salary',
  'o8_leadership',
] as const;

/** breakdown 字段名顺序（O0-O8，§1.4 冻结） */
export const BREAKDOWN_FIELD_NAMES = [
  'special_shortage_penalty',
  'vacancy_penalty',
  'special_impact',
  'hours_deviation_scaled',
  'special_shift_count',
  'night_shift_variance',
  'weekend_work_variance',
  'triple_salary_count',
  'leadership_penalty',
] as const;
