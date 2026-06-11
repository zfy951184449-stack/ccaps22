/**
 * SolveMonitorV5Drawer — 求解监视器全屏抽屉
 *
 * F4 实现要点：
 * - 100vw WxbDrawer，从右滑入
 * - 共享 useSolveStreamV5 实例：通过 props 传入 state，不双开 EventSource 连接
 * - 关闭抽屉不断 SSE（关闭只隐藏 UI，连接在 SolveProgressV5Modal 持有）
 * - 布局：左主栏（区块 c 收敛曲线 + 区块 d 分量堆叠 + 区块 e 中间解预览）
 *          右侧栏（区块 a 阶段时间轴 + 区块 b 模型统计 + 区块 f 搜索强度）
 *          底部全宽（区块 g 实时日志）
 * - 小屏（< 1280px）退化为单列堆叠
 * - 所有子区块缺数据时降级（§3.7 铁律）
 * - 无 emoji 图标（内联 SVG 或 WxbIcon）
 * - 颜色仅 var(--wx-*) CSS 变量，无硬编码 hex
 *
 * 区块组件来自：
 *   F5: ConvergenceChart (c), ObjectiveBreakdownChart (d)
 *   F6: PhaseTimeline (a), ModelBuildStats (b), IncumbentPreview (e), SearchIntensity (f)
 */

import React, { useState, useCallback } from 'react';
import { WxbDrawer, WxbButton, WxbTag } from '../../wxb-ui';
import type { WxbTagColor } from '../../wxb-ui';
import type { SolveStreamState } from './monitorTypes';
import { ConvergenceChart } from './ConvergenceChart';
import { ObjectiveBreakdownChart } from './ObjectiveBreakdownChart';
import PhaseTimeline from './PhaseTimeline';
import ModelBuildStats from './ModelBuildStats';
import IncumbentPreview from './IncumbentPreview';
import SearchIntensity from './SearchIntensity';
import SolveLogPanel from './SolveLogPanel';
import InfeasibilityPanel from './InfeasibilityPanel';
import './SolveMonitor.css';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SolveMonitorV5DrawerProps {
  /** 抽屉是否可见 */
  visible: boolean;
  /** 来自 SolveProgressV5Modal 持有的 useSolveStreamV5 state（不新建 EventSource） */
  state: SolveStreamState;
  /** 当前求解 run ID（用于标题展示） */
  runId: number | null;
  /** 是否已终止（terminal=COMPLETED|APPLIED|FAILED） */
  isTerminal: boolean;
  /** 关闭抽屉（不断 SSE） */
  onClose: () => void;
  /** 停止排班（可选，由父组件提供） */
  onStop?: () => void;
  /**
   * 无解诊断「跳到配置→」回调：关闭监视器 → 打开配置弹窗并高亮对应 config_keys
   * 未传则不显示跳转按钮（F8 降级）
   */
  onOpenConfig?: (configKeys: string[]) => void;
}

// ── 衍生：run 状态 Tag 颜色 ────────────────────────────────────────────────────

function statusColor(status: string): WxbTagColor {
  if (status === 'COMPLETED' || status === 'APPLIED') return 'green';
  if (status === 'FAILED') return 'red';
  if (status === 'STOPPING') return 'amber';
  if (status === 'RUNNING') return 'blue';
  return 'neutral';
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const SolveMonitorV5Drawer: React.FC<SolveMonitorV5DrawerProps> = ({
  visible,
  state,
  runId,
  isTerminal,
  onClose,
  onStop,
  onOpenConfig,
}) => {
  const [logsExpanded, setLogsExpanded] = useState(true);

  const handleToggleLogs = useCallback(() => {
    setLogsExpanded(v => !v);
  }, []);

  // 衍生 gap 显示
  const latestInc = state.incumbents.length > 0
    ? state.incumbents[state.incumbents.length - 1]
    : null;
  const gapDisplay = latestInc ? `Gap ${(latestInc.gap * 100).toFixed(1)}%` : null;

  // 是否处于停止中（不允许再次点停止）
  const isStopping = state.status === 'STOPPING';

  const runIdLabel = runId ? `#V5-${runId}` : '';

  // 抽屉标题（作为 title prop）
  const drawerTitle = (
    <div className="solve-monitor-header">
      {/* 返回箭头内联 SVG */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M10 3L5 8l5 5"
          stroke="var(--wx-blue-600)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="solve-monitor-title">求解监视器</span>
      {runIdLabel && (
        <span className="solve-monitor-run-id">{runIdLabel}</span>
      )}
      <WxbTag color={statusColor(state.status)}>{state.status}</WxbTag>
      {gapDisplay && (
        <span className="solve-monitor-gap-badge">{gapDisplay}</span>
      )}
      <div className="solve-monitor-header-actions">
        {/* 停止按钮（仅在未终止时显示） */}
        {!isTerminal && onStop && (
          <WxbButton
            type="button"
            variant="danger"
            size="sm"
            disabled={isStopping}
            onClick={onStop}
          >
            {isStopping ? '停止中...' : '停止'}
          </WxbButton>
        )}
        {/* 收起按钮 */}
        <WxbButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          {/* 内联 SVG：收起图标（双箭头向右） */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M5 2l5 5-5 5"
              stroke="var(--wx-fg-2)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 2l5 5-5 5"
              stroke="var(--wx-fg-2)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          收起
        </WxbButton>
      </div>
    </div>
  );

  return (
    <WxbDrawer
      open={visible}
      onClose={onClose}
      // 关闭时不断 SSE（父组件 SolveProgressV5Modal 持有 EventSource）
      destroyOnClose={false}
      width="100vw"
      placement="right"
      closable={false}
      title={drawerTitle}
      className="solve-monitor-drawer"
      bodyStyle={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', overflow: 'hidden', height: '100%' }}
    >
      <div className="solve-monitor-body">
        {/* ── 主内容网格（左主栏 + 右侧栏） ─────────────────────────────────── */}
        <div className="solve-monitor-content">

          {/* 左主栏 */}
          <div className="solve-monitor-main">
            {/* 区块 c：目标收敛曲线 */}
            <div className="solve-monitor-block">
              <div className="solve-monitor-block-title">目标收敛曲线</div>
              <ConvergenceChart
                incumbents={state.incumbents}
                headless
              />
            </div>

            {/* 区块 d：目标分量堆叠图（缺 breakdown 时整块隐藏，F5 保证返回 null） */}
            {state.incumbents.some(p => p.breakdown) && (
              <div className="solve-monitor-block">
                <div className="solve-monitor-block-title">目标分量分解</div>
                <ObjectiveBreakdownChart
                  incumbents={state.incumbents}
                  headless
                />
              </div>
            )}

            {/* 区块 e：中间解快照预览 */}
            <div className="solve-monitor-block">
              <div className="solve-monitor-block-title">
                中间解预览
                {latestInc && latestInc.solution_count > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--wx-fg-3)',
                      fontWeight: 400,
                      marginLeft: 6,
                    }}
                  >
                    第 {latestInc.solution_count} 次改进
                  </span>
                )}
              </div>
              <IncumbentPreview
                preview={state.latestPreview}
                solutionCount={latestInc?.solution_count}
              />
            </div>

            {/* 区块 h（F8）：无解诊断面板（仅 FAILED + 有 infeasibility 时显示） */}
            {state.status === 'FAILED' && state.infeasibility && (
              <div className="solve-monitor-block">
                <div className="solve-monitor-block-title">无解诊断</div>
                <InfeasibilityPanel
                  groups={state.infeasibility.groups}
                  located={state.infeasibility.located}
                  onOpenConfig={onOpenConfig
                    ? (configKeys: string[]) => {
                        onClose();
                        onOpenConfig(configKeys);
                      }
                    : undefined
                  }
                />
              </div>
            )}
          </div>

          {/* 右侧栏 */}
          <div className="solve-monitor-sidebar">
            {/* 区块 a：求解阶段时间轴 */}
            <div className="solve-monitor-block">
              <div className="solve-monitor-block-title">阶段时间轴</div>
              <PhaseTimeline
                stage={state.stage}
                phase={state.phase}
                phaseTimings={state.phaseTimings}
              />
            </div>

            {/* 区块 b：模型构建统计 */}
            <div className="solve-monitor-block">
              <div className="solve-monitor-block-title">模型构建统计</div>
              <ModelBuildStats modelStats={state.modelStats} />
            </div>

            {/* 区块 f：搜索强度（search_stats 缺失时 SearchIntensity 内部降级隐藏） */}
            <div className="solve-monitor-block">
              <div className="solve-monitor-block-title">搜索强度</div>
              <SearchIntensity
                searchStats={state.searchStats}
                branchHistory={state.searchHistory.branches}
                conflictHistory={state.searchHistory.conflicts}
              />
            </div>
          </div>
        </div>

        {/* ── 底部全宽日志区（区块 g） ──────────────────────────────────────── */}
        <div className="solve-monitor-log-section">
          <div
            className="solve-monitor-log-toggle-bar"
            role="button"
            tabIndex={0}
            onClick={handleToggleLogs}
            onKeyDown={e => e.key === 'Enter' && handleToggleLogs()}
            aria-expanded={logsExpanded}
          >
            {/* 内联 SVG：日志图标 */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="11" height="11" rx="2" stroke="var(--wx-fg-2)" strokeWidth="1.4" fill="none" />
              <path d="M3 4h7M3 6.5h5M3 9h7" stroke="var(--wx-fg-2)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            实时日志
            <span className="solve-monitor-log-count">({state.logs.length})</span>
            <span className="solve-monitor-log-caret" aria-hidden="true">
              {logsExpanded ? '▲' : '▼'}
            </span>
          </div>

          {logsExpanded && (
            <SolveLogPanel
              logs={state.logs}
              isTerminal={isTerminal}
              maxHeight={240}
              autoScroll
            />
          )}
        </div>
      </div>
    </WxbDrawer>
  );
};

export default SolveMonitorV5Drawer;
