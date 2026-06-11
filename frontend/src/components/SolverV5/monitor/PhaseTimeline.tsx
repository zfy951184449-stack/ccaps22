/**
 * PhaseTimeline — 区块 a：求解阶段时间轴
 *
 * 设计约束（§5.1 / F6 工单）：
 * - 手写 SVG 横向甘特，每阶段一段，宽 = 耗时占比
 * - ASSEMBLING 从外层 stage 渲染（backend 侧，非 solver 内部阶段）
 * - solver 内部 5 值（BUILDING/PRESOLVE/SOLVING/EXTRACTING/DIAGNOSING）从 phaseTimings 读
 * - 缺数据时显示空态降级 UI（§3.7）
 * - 颜色全部 var(--wx-*) CSS 变量（MONITOR_COLORS）
 * - 无 emoji 图标
 */

import React from 'react';
import { MONITOR_COLORS } from './monitorColors';
import type { PhaseKey, SolveStreamState } from './monitorTypes';

// ── 阶段定义 ──────────────────────────────────────────────────────────────────

interface PhaseSegment {
  key: string;
  label: string;
  color: string;
  durationMs: number;
}

const PHASE_LABEL_MAP: Record<string, string> = {
  ASSEMBLING: '组装',
  BUILDING: '建模',
  PRESOLVE: '预处理',
  SOLVING: '求解',
  EXTRACTING: '提取',
  DIAGNOSING: '诊断',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PhaseTimelineProps {
  /** 外层 stage（INIT|ASSEMBLING|SOLVING|DONE），用于渲染 ASSEMBLING 段 */
  stage: string;
  /** solver 内部阶段（5 值） */
  phase: PhaseKey | null;
  /** 各阶段耗时 ms（累积，solver 内部段） */
  phaseTimings: Partial<Record<PhaseKey, number>>;
  className?: string;
}

// ── 辅助：格式化 ms → 合适单位 ───────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}m`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const PhaseTimeline: React.FC<PhaseTimelineProps> = ({
  stage,
  phase,
  phaseTimings,
  className = '',
}) => {
  // 构建阶段段列表
  const segments: PhaseSegment[] = [];

  // ASSEMBLING 段：stage=ASSEMBLING 或 stage=SOLVING|DONE 时已经过了组装，估算 500ms 占位
  const hasAssembling =
    stage === 'ASSEMBLING' || stage === 'SOLVING' || stage === 'DONE';
  if (hasAssembling) {
    segments.push({
      key: 'ASSEMBLING',
      label: PHASE_LABEL_MAP['ASSEMBLING'],
      color: MONITOR_COLORS.phase_assembling,
      // 无实际计时，用 500ms 占位（后端不发 assembling 耗时）
      durationMs: 500,
    });
  }

  // solver 内部阶段顺序
  const SOLVER_PHASES: PhaseKey[] = [
    'BUILDING',
    'PRESOLVE',
    'SOLVING',
    'EXTRACTING',
    'DIAGNOSING',
  ];

  const PHASE_COLOR_MAP: Record<PhaseKey, string> = {
    BUILDING: MONITOR_COLORS.phase_building,
    PRESOLVE: MONITOR_COLORS.phase_presolve,
    SOLVING: MONITOR_COLORS.phase_solving,
    EXTRACTING: MONITOR_COLORS.phase_extracting,
    DIAGNOSING: MONITOR_COLORS.phase_diagnosing,
  };

  for (const pk of SOLVER_PHASES) {
    const ms = phaseTimings[pk];
    if (ms !== undefined && ms > 0) {
      segments.push({
        key: pk,
        label: PHASE_LABEL_MAP[pk] ?? pk,
        color: PHASE_COLOR_MAP[pk],
        durationMs: ms,
      });
    } else if (pk === phase) {
      // 当前正在进行中的阶段（无耗时，用 100ms 占位展示当前活跃段）
      segments.push({
        key: pk,
        label: PHASE_LABEL_MAP[pk] ?? pk,
        color: PHASE_COLOR_MAP[pk],
        durationMs: 100,
      });
    }
  }

  // 缺数据降级
  if (segments.length === 0) {
    return (
      <div
        className={`phase-timeline-empty ${className}`}
        style={{ color: 'var(--wx-fg-3)', fontSize: 12, padding: '8px 0' }}
      >
        阶段数据不可用
      </div>
    );
  }

  const totalMs = segments.reduce((s, seg) => s + seg.durationMs, 0) || 1;

  // SVG 尺寸
  const SVG_W = 460;
  const ROW_H = 28;
  const LABEL_W = 52;
  const BAR_H = 16;
  const BAR_Y_OFFSET = 6;
  const TICK_H = 12;
  const SVG_H = ROW_H + TICK_H + 8;
  const BAR_AREA_W = SVG_W - LABEL_W - 8;

  return (
    <div
      className={`phase-timeline ${className}`}
      style={{ width: '100%', overflowX: 'auto' }}
    >
      <svg
        width="100%"
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="求解阶段时间轴"
      >
        {/* 背景轨道 */}
        <rect
          x={LABEL_W}
          y={BAR_Y_OFFSET}
          width={BAR_AREA_W}
          height={BAR_H}
          rx={3}
          fill="var(--wx-surface-3, #EDF1F6)"
        />

        {/* 各阶段彩色段 */}
        {(() => {
          let offsetX = 0;
          return segments.map((seg) => {
            const segW = Math.max(2, (seg.durationMs / totalMs) * BAR_AREA_W);
            const x = LABEL_W + offsetX;
            offsetX += segW;
            const isActive = seg.key === phase || (seg.key === 'ASSEMBLING' && stage === 'ASSEMBLING');
            return (
              <g key={seg.key}>
                <rect
                  x={x}
                  y={BAR_Y_OFFSET}
                  width={segW}
                  height={BAR_H}
                  rx={segW > 6 ? 3 : 0}
                  fill={seg.color}
                  opacity={isActive ? 1 : 0.75}
                />
                {/* 当前活跃段脉冲指示器 */}
                {isActive && (
                  <rect
                    x={x + segW - 3}
                    y={BAR_Y_OFFSET - 1}
                    width={3}
                    height={BAR_H + 2}
                    rx={1}
                    fill="var(--wx-bg, #fff)"
                    opacity={0.7}
                  />
                )}
              </g>
            );
          });
        })()}

        {/* 阶段标签（小字，旋转防遮挡） */}
        {(() => {
          let offsetX = 0;
          return segments.map((seg) => {
            const segW = Math.max(2, (seg.durationMs / totalMs) * BAR_AREA_W);
            const midX = LABEL_W + offsetX + segW / 2;
            offsetX += segW;
            const showLabel = segW >= 32;
            return showLabel ? (
              <text
                key={`lbl-${seg.key}`}
                x={midX}
                y={BAR_Y_OFFSET + BAR_H / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--wx-bg, #fff)"
                fontSize={10}
                style={{ pointerEvents: 'none', fontWeight: 500 }}
              >
                {seg.label}
              </text>
            ) : null;
          });
        })()}

        {/* 耗时刻度（底部小字） */}
        {(() => {
          let offsetX = 0;
          return segments.map((seg) => {
            const segW = Math.max(2, (seg.durationMs / totalMs) * BAR_AREA_W);
            const midX = LABEL_W + offsetX + segW / 2;
            offsetX += segW;
            const showDuration = segW >= 28 && seg.durationMs > 100;
            return showDuration ? (
              <text
                key={`dur-${seg.key}`}
                x={midX}
                y={ROW_H + TICK_H - 2}
                textAnchor="middle"
                fill="var(--wx-fg-3, #8E99AA)"
                fontSize={9}
                style={{ pointerEvents: 'none' }}
              >
                {fmtMs(seg.durationMs)}
              </text>
            ) : null;
          });
        })()}

        {/* 左侧标签 */}
        <text
          x={LABEL_W - 6}
          y={BAR_Y_OFFSET + BAR_H / 2 + 1}
          textAnchor="end"
          dominantBaseline="middle"
          fill="var(--wx-fg-2, #4B5563)"
          fontSize={11}
        >
          阶段
        </text>
      </svg>

      {/* 图例（阶段色块 + 名称） */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 12px',
          marginTop: 4,
          paddingLeft: LABEL_W,
        }}
      >
        {segments.map((seg) => (
          <span
            key={`legend-${seg.key}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--wx-fg-2, #4B5563)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: seg.color,
                opacity: 0.85,
                flexShrink: 0,
              }}
            />
            {seg.label}
            {seg.durationMs > 100 && (
              <span style={{ color: 'var(--wx-fg-3, #8E99AA)', fontSize: 10 }}>
                {fmtMs(seg.durationMs)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

export default React.memo(PhaseTimeline);
