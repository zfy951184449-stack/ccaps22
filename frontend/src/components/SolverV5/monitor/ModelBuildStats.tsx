/**
 * ModelBuildStats — 区块 b：模型构建统计
 *
 * 设计约束（§5.1 / F6 工单）：
 * - WxbBarChart（垂直柱 + 旋转/缩写标签，无 horizontal prop）
 * - 约束数读 by_constraint[name].count（OFF 计 0）
 * - 变量数读 by_constraint[name].vars
 * - WxbSegmented 切换「约束数」/「变量数」两个视图
 * - 缺数据（model_stats=null）时显示空态降级（§3.7）
 * - 颜色全 var(--wx-*) CSS 变量
 * - 无 emoji 图标
 */

import React, { useState } from 'react';
import { WxbBarChart, WxbSegmented } from '../../wxb-ui';
import type { WxbSegmentedOption } from '../../wxb-ui';
import type { ModelStats } from './monitorTypes';
import { MONITOR_COLORS } from './monitorColors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ModelBuildStatsProps {
  modelStats: ModelStats | null;
  className?: string;
}

// ── 约束名缩写映射（较长名称旋转标签时缩写）──────────────────────────────────

const CONSTRAINT_ABBR: Record<string, string> = {
  ShiftAssignment: '班次分配',
  ShareGroup: '共享组',
  NightShiftInterval: '夜班间隔',
  NightRest: '夜班休息',
  ConsecutiveDays: '连续天数',
  LockedOperations: '锁定操作',
  LockedShifts: '锁定班次',
  SpecialShiftCoverage: '专项覆盖',
  SpecialShiftJointCoverage: '专项联合',
  SpecialShortage: '专项欠配',
  UniqueEmployee: '唯一员工',
  StandardHours: '标准工时',
  TaskPlacement: '任务放置',
  Vacancy: '空缺',
  LeaderCoverage: '领导覆盖',
  NightShiftBalance: '夜班均衡',
  WeekendBalance: '周末均衡',
};

function abbr(name: string): string {
  return CONSTRAINT_ABBR[name] ?? (name.length > 6 ? name.slice(0, 6) + '..' : name);
}

// ── 切换项 ────────────────────────────────────────────────────────────────────

const VIEW_OPTIONS: WxbSegmentedOption[] = [
  { label: '约束数', value: 'count' },
  { label: '变量数', value: 'vars' },
];

type ViewKey = 'count' | 'vars';

// ── 组件 ──────────────────────────────────────────────────────────────────────

const ModelBuildStats: React.FC<ModelBuildStatsProps> = ({ modelStats, className = '' }) => {
  const [view, setView] = useState<ViewKey>('count');

  // 缺数据降级
  if (!modelStats) {
    return (
      <div
        className={`model-build-stats-empty ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--wx-fg-3)',
          fontSize: 12,
          padding: '16px 0',
          gap: 6,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="14" width="4" height="7" rx="1" fill="var(--wx-fg-4)" />
          <rect x="9" y="10" width="4" height="11" rx="1" fill="var(--wx-fg-4)" />
          <rect x="15" y="6" width="4" height="15" rx="1" fill="var(--wx-fg-4)" />
          <line x1="2" y1="22" x2="22" y2="22" stroke="var(--wx-divider)" strokeWidth="1.5" />
        </svg>
        建模统计不可用
      </div>
    );
  }

  const { by_constraint, num_vars, num_constraints } = modelStats;

  // 构建图表数据
  const entries = Object.entries(by_constraint);

  const chartData = entries
    .map(([name, stat]) => {
      const rawCount = stat.count === 'OFF' ? 0 : stat.count;
      const value = view === 'count' ? rawCount : stat.vars;
      return {
        label: abbr(name),
        value,
        color:
          view === 'count'
            ? MONITOR_COLORS.phase_building
            : MONITOR_COLORS.phase_presolve,
        // OFF 的约束灰色显示
        ...(stat.count === 'OFF'
          ? { color: 'var(--wx-fg-4, #C5CDD7)' }
          : {}),
      };
    })
    // 排序：从大到小
    .sort((a, b) => b.value - a.value)
    // 过滤掉全 0（不显示 OFF 约束的变量数行）
    .filter((d) => d.value > 0 || view === 'count');

  return (
    <div className={`model-build-stats ${className}`} style={{ width: '100%' }}>
      {/* 汇总行 */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 8,
          fontSize: 12,
          color: 'var(--wx-fg-2, #4B5563)',
        }}
      >
        <span>
          <strong style={{ color: 'var(--wx-fg-1)' }}>{num_constraints.toLocaleString()}</strong>
          {' '}条约束
        </span>
        <span>
          <strong style={{ color: 'var(--wx-fg-1)' }}>{num_vars.toLocaleString()}</strong>
          {' '}个变量
        </span>
      </div>

      {/* 切换器 */}
      <div style={{ marginBottom: 8 }}>
        <WxbSegmented
          options={VIEW_OPTIONS}
          value={view}
          onChange={(v) => setView(v as ViewKey)}
        />
      </div>

      {/* 柱状图 */}
      {chartData.length > 0 ? (
        <WxbBarChart
          data={chartData}
          height={180}
          unit={view === 'count' ? '' : ''}
        />
      ) : (
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--wx-fg-3)',
            fontSize: 12,
          }}
        >
          暂无数据
        </div>
      )}

      {/* by_layer 摘要（可选，仅 count 视图下显示） */}
      {view === 'count' && modelStats.by_layer && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 12px',
            marginTop: 6,
            fontSize: 11,
            color: 'var(--wx-fg-3)',
          }}
        >
          {Object.entries(modelStats.by_layer).map(([layer, count]) => (
            <span key={layer}>
              {LAYER_LABEL[layer] ?? layer}:{' '}
              <strong style={{ color: 'var(--wx-fg-2)' }}>{count}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// 层级标签
const LAYER_LABEL: Record<string, string> = {
  assignments: '分配',
  shift: '班次',
  vacancy: '空缺',
  special_cover: '专项覆盖',
  special_shortage: '专项欠配',
  task_placement: '任务',
};

export default React.memo(ModelBuildStats, (prev, next) => {
  // 只有 model_stats 引用变了才重渲染（MODEL_STATS 事件一次性，后续无变化）
  return prev.modelStats === next.modelStats && prev.className === next.className;
});
