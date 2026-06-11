/**
 * SolveLogPanel — 区块 g：实时日志面板
 *
 * F4 实现规则：
 * - 沿用 V4 双格式（logs_full 结构化行 + logs 纯字符串降级）
 * - category pill 过滤（CONSTRAINT/CONFLICT/SOLVER/PROGRESS，GENERAL 不显示 pill）
 * - stripLogIcons：剥掉 emoji
 * - 缺数据时显示空态「等待求解器日志...」
 * - 无 emoji 图标；颜色仅 var(--wx-*) CSS 变量
 * - 日志条目最多渲染 1000 条（从末尾截取，与 hook 上限一致）
 */

import React, { useRef, useEffect, useState } from 'react';
import { stripLogIcons } from './useSolveStreamV5';
import type { LogLine } from './monitorTypes';
import './SolveMonitor.css';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  CONSTRAINT: '约束',
  CONFLICT: '冲突',
  SOLVER: '求解',
  PROGRESS: '进度',
};

const ALL_CATEGORIES = ['CONSTRAINT', 'CONFLICT', 'SOLVER', 'PROGRESS'] as const;
type FilterCategory = typeof ALL_CATEGORIES[number] | 'ALL';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SolveLogPanelProps {
  logs: LogLine[];
  /** 是否处于终止态（COMPLETED/APPLIED/FAILED），终止后停止闪烁光标 */
  isTerminal?: boolean;
  /** 最大高度（px），默认 220 */
  maxHeight?: number;
  /** 是否自动滚动到底（默认 true） */
  autoScroll?: boolean;
  className?: string;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const SolveLogPanel: React.FC<SolveLogPanelProps> = ({
  logs,
  isTerminal = false,
  maxHeight = 220,
  autoScroll = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');

  // 自动滚动到底
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 计算各 category 有无数据（用于显示过滤 pill）
  const usedCategories = ALL_CATEGORIES.filter(cat =>
    logs.some(l => l.category === cat)
  );

  // 过滤
  const visibleLogs =
    activeFilter === 'ALL'
      ? logs
      : logs.filter(l => l.category === activeFilter);

  return (
    <div className={`solve-log-panel-wrap ${className}`}>
      {/* 过滤 pill 组（仅在有多类 category 时显示） */}
      {usedCategories.length > 1 && (
        <div className="solve-log-filter-bar">
          <span
            className={`solve-log-filter-pill${activeFilter === 'ALL' ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveFilter('ALL')}
            onKeyDown={e => e.key === 'Enter' && setActiveFilter('ALL')}
          >
            全部
          </span>
          {usedCategories.map(cat => (
            <span
              key={cat}
              className={`solve-log-filter-pill${activeFilter === cat ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setActiveFilter(cat)}
              onKeyDown={e => e.key === 'Enter' && setActiveFilter(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      )}

      {/* 日志列表 */}
      <div
        ref={containerRef}
        className="solve-log-panel"
        style={{ maxHeight }}
        role="log"
        aria-live="polite"
        aria-label="求解日志"
      >
        {visibleLogs.length === 0 ? (
          <div className="solve-log-panel-empty">
            {logs.length === 0 ? '等待求解器日志...' : '当前过滤无日志'}
          </div>
        ) : (
          visibleLogs.map((line, i) => (
            <div key={i} className="solve-log-line">
              <span className="solve-log-time">[{line.time}]</span>
              {line.category && line.category !== 'GENERAL' && (
                <span
                  className={`solve-log-category solve-log-cat-${line.category.toLowerCase()}`}
                  aria-label={CATEGORY_LABELS[line.category] ?? line.category}
                >
                  {CATEGORY_LABELS[line.category] ?? line.category}
                </span>
              )}
              <span
                className={`solve-log-message solve-log-${line.level.toLowerCase()}`}
              >
                {stripLogIcons(line.message)}
              </span>
            </div>
          ))
        )}
        {/* 闪烁光标（终止后停止） */}
        {!isTerminal && logs.length > 0 && (
          <div aria-hidden="true">
            <span className="solve-log-cursor" />
          </div>
        )}
      </div>
    </div>
  );
};

export default SolveLogPanel;
