/**
 * IncumbentPreview — 区块 e：中间解快照预览
 *
 * 设计约束（§5.1 / F6 工单，方案 A 轻量聚合）：
 * - WxbGauge 覆盖率进度环（fill_rate × 100%）
 * - WxbBadge 空缺数徽章（vacant_positions）
 * - scheduled_shifts 数值卡
 * - 非员工×日期热力图（preview 只发聚合指标，无矩阵数据）
 * - incumbent.preview 缺失时显示空态（§3.7 降级铁律）
 * - 颜色全 var(--wx-*) CSS 变量
 * - 无 emoji 图标
 */

import React from 'react';
import { WxbGauge, WxbBadge } from '../../wxb-ui';
import type { PreviewSnapshot } from './monitorTypes';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface IncumbentPreviewProps {
  /** 最新中间解快照（来自 latestPreview，可为 null） */
  preview: PreviewSnapshot | null;
  /** 当前已到第几次改进（solution_count） */
  solutionCount?: number;
  className?: string;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const IncumbentPreview: React.FC<IncumbentPreviewProps> = ({
  preview,
  solutionCount,
  className = '',
}) => {
  // 空态降级（§3.7）
  if (!preview) {
    return (
      <div
        className={`incumbent-preview-empty ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 0',
          gap: 8,
          color: 'var(--wx-fg-3)',
          fontSize: 12,
        }}
      >
        {/* 简单空态图示 */}
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="13" stroke="var(--wx-surface-3, #EDF1F6)" strokeWidth="4" fill="none" />
          <circle cx="16" cy="16" r="13" stroke="var(--wx-fg-4, #C5CDD7)" strokeWidth="4"
            fill="none" strokeDasharray="10 72" />
        </svg>
        暂无快照
      </div>
    );
  }

  const fillPercent = Math.round(preview.fill_rate * 100);
  const vacant = preview.vacant_positions;
  const scheduled = preview.scheduled_shifts;

  // 根据覆盖率选色：≥95% 绿，80-95% 蓝，<80% 琥珀
  const gaugeColor =
    fillPercent >= 95
      ? 'var(--wx-green-500, #22C55E)'
      : fillPercent >= 80
      ? 'var(--wx-blue-700, #0B3D7F)'
      : 'var(--wx-amber-500, #F59E0B)';

  const vacantStatus: 'success' | 'warning' | 'error' =
    vacant === 0 ? 'success' : vacant <= 5 ? 'warning' : 'error';

  return (
    <div
      className={`incumbent-preview ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
      }}
    >
      {/* 第 N 次改进提示 */}
      {solutionCount != null && solutionCount > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--wx-fg-3)',
            alignSelf: 'flex-end',
            paddingRight: 4,
          }}
        >
          第 {solutionCount} 次改进
        </div>
      )}

      {/* 覆盖率进度环 */}
      <WxbGauge
        percent={fillPercent}
        size={120}
        title="岗位覆盖率"
        color={gaugeColor}
        label={`${fillPercent}%`}
      />

      {/* 空缺数 + 排班班次 */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <WxbBadge
            label={`空缺 ${vacant} 岗位`}
            status={vacantStatus}
            variant="bar"
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--wx-fg-1, #1A2231)',
              lineHeight: 1.2,
            }}
          >
            {scheduled.toLocaleString()}
          </span>
          <span style={{ fontSize: 11, color: 'var(--wx-fg-3)' }}>已排班次</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(IncumbentPreview, (prev, next) => {
  return (
    prev.preview === next.preview &&
    prev.solutionCount === next.solutionCount &&
    prev.className === next.className
  );
});
