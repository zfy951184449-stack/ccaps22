/**
 * SearchIntensity — 区块 f：搜索强度
 *
 * 设计约束（§5.1 / F6 工单）：
 * - WxbSparkline ×2（分支 branches + 冲突 conflicts）滚动窗口最近 60 点
 * - WxbKpiCard 显当前数值
 * - search_stats 缺失时隐藏（§3.7 降级铁律）
 * - 颜色全 var(--wx-*) CSS 变量（MONITOR_COLORS）
 * - 无 emoji 图标
 */

import React from 'react';
import { WxbSparkline } from '../../wxb-ui';
import type { SearchStats } from './monitorTypes';
import { MONITOR_COLORS } from './monitorColors';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SearchIntensityProps {
  /** 最新 search_stats（每 5s 心跳推送，可为 null） */
  searchStats: SearchStats | null;
  /** 滚动历史数组（最近 60 点，来自 searchHistory.branches）*/
  branchHistory: number[];
  /** 滚动历史数组（最近 60 点，来自 searchHistory.conflicts）*/
  conflictHistory: number[];
  className?: string;
}

// ── 辅助：格式化大数字（缩写 K/M）────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const SearchIntensity: React.FC<SearchIntensityProps> = ({
  searchStats,
  branchHistory,
  conflictHistory,
  className = '',
}) => {
  // 缺数据降级：search_stats=null 且无历史时隐藏
  if (!searchStats && branchHistory.length === 0) {
    return (
      <div
        className={`search-intensity-empty ${className}`}
        style={{ color: 'var(--wx-fg-3)', fontSize: 12, padding: '8px 0' }}
      >
        搜索强度不可用
      </div>
    );
  }

  const branches = searchStats?.branches ?? 0;
  const conflicts = searchStats?.conflicts ?? 0;
  const booleans = searchStats?.booleans ?? 0;

  return (
    <div
      className={`search-intensity ${className}`}
      style={{ width: '100%' }}
    >
      {/* 两个指标行 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* 分支数行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: '0 0 80px' }}>
            <div style={{ fontSize: 11, color: 'var(--wx-fg-3)', marginBottom: 2 }}>分支数</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--wx-blue-700, #0B3D7F)',
                lineHeight: 1.2,
              }}
            >
              {fmtNum(branches)}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {branchHistory.length > 1 ? (
              <WxbSparkline
                data={branchHistory}
                width={120}
                height={28}
                color={MONITOR_COLORS.branches}
                showDot
              />
            ) : (
              <div
                style={{
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <svg
                  width="120"
                  height="28"
                  viewBox="0 0 120 28"
                  fill="none"
                  aria-hidden="true"
                >
                  <line
                    x1="0"
                    y1="14"
                    x2="120"
                    y2="14"
                    stroke="var(--wx-divider, #EEF2F7)"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* 冲突数行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: '0 0 80px' }}>
            <div style={{ fontSize: 11, color: 'var(--wx-fg-3)', marginBottom: 2 }}>冲突数</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--wx-red-500, #EF4444)',
                lineHeight: 1.2,
              }}
            >
              {fmtNum(conflicts)}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {conflictHistory.length > 1 ? (
              <WxbSparkline
                data={conflictHistory}
                width={120}
                height={28}
                color={MONITOR_COLORS.conflicts}
                showDot
              />
            ) : (
              <div
                style={{
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <svg
                  width="120"
                  height="28"
                  viewBox="0 0 120 28"
                  fill="none"
                  aria-hidden="true"
                >
                  <line
                    x1="0"
                    y1="14"
                    x2="120"
                    y2="14"
                    stroke="var(--wx-divider, #EEF2F7)"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 布尔变量数（汇总，次要信息）*/}
      {booleans > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--wx-divider, #EEF2F7)',
            fontSize: 11,
            color: 'var(--wx-fg-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4" stroke="var(--wx-fg-4)" strokeWidth="1.5" fill="none" />
            <circle cx="6" cy="6" r="1.5" fill="var(--wx-fg-4)" />
          </svg>
          布尔变量:{' '}
          <strong style={{ color: 'var(--wx-fg-2)' }}>{fmtNum(booleans)}</strong>
        </div>
      )}
    </div>
  );
};

export default React.memo(SearchIntensity, (prev, next) => {
  return (
    prev.searchStats === next.searchStats &&
    prev.branchHistory === next.branchHistory &&
    prev.conflictHistory === next.conflictHistory &&
    prev.className === next.className
  );
});
