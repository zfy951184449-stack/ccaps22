/**
 * InfeasibilityPanel — 无解诊断面板（F8）
 *
 * 实现要点（§F8 + §1.5 冻结契约）：
 * - 实时路径：state.infeasibility.groups[]（来自 DIAGNOSIS 事件）
 * - 结果路径：infeasibility_analysis.minimal_conflict_groups[]（来自 result 落库）
 * - 两路径组项字段集相同：group/lit_key/message_zh/suggestion_zh/config_keys/related_*（可选）
 * - WxbCard + WxbTag red 每组一卡
 * - 「跳到配置→」：调 onOpenConfig(configKeys) → 父组件打开配置弹窗并高亮对应行
 * - 缺字段降级：无 groups / located=false → 显示 V4 风格红字
 * - 七组 group 标识符：§1.5 冻结集（POSITION_MUST_FILL 等）
 * - 无 emoji 图标（内联 SVG 或 WxbIcon）
 * - 颜色仅 var(--wx-*) CSS 变量，无硬编码 hex
 */

import React from 'react';
import { WxbCard, WxbTag, WxbButton, WxbEmpty } from '../../wxb-ui';
import type { InfeasibilityGroupId } from '../../../types/solverV5';
import type { InfeasibilityGroup } from './monitorTypes';

// ── §1.5 七组 group 标识符冻结文案映射 ───────────────────────────────────────

const GROUP_LABEL_MAP: Record<InfeasibilityGroupId, { label: string; detail: string }> = {
  STANDARD_HOURS: {
    label: '标准工时',
    detail: '员工工时约束（最大/最小工时、工时合规）',
  },
  LOCKED_OPERATIONS: {
    label: '锁定操作',
    detail: '已锁定的操作分配与其他约束存在冲突',
  },
  CONSECUTIVE_DAYS: {
    label: '连续天数',
    detail: '连续工作/休息天数约束',
  },
  SPECIAL_SHIFT_COVERAGE: {
    label: '特殊班次覆盖',
    detail: '特殊班次或操作必须有人覆盖的约束',
  },
  LEADERSHIP_COVERAGE: {
    label: '领导在岗',
    detail: '生产日必须有管理岗在岗的约束',
  },
  LOCKED_SHIFTS: {
    label: '锁定班次',
    detail: '已锁定的员工班次与其他约束存在冲突',
  },
  POSITION_MUST_FILL: {
    label: '岗位必填',
    detail: '关键岗位必须有人分配（allow_position_vacancy=false）',
  },
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface InfeasibilityPanelProps {
  /**
   * 冲突组列表（两路径组项字段相同，§1.5）：
   * - 实时路径：InfeasibilityResult.groups
   * - 结果路径：InfeasibilityAnalysis.minimal_conflict_groups
   */
  groups: InfeasibilityGroup[] | null | undefined;
  /**
   * 诊断是否定位到原因（located=true 时有组列表，false 时诊断失败无组）
   * 缺省视为 false（降级展示）
   */
  located?: boolean;
  /**
   * 点「跳到配置→」时的回调，传 config_keys 列表
   * 未传则不显示该按钮
   */
  onOpenConfig?: (configKeys: string[]) => void;
  className?: string;
  style?: React.CSSProperties;
}

// ── 单个冲突卡片 ────────────────────────────────────────────────────────────────

interface ConflictCardProps {
  group: InfeasibilityGroup;
  onOpenConfig?: (configKeys: string[]) => void;
}

const ConflictCard: React.FC<ConflictCardProps> = ({ group, onOpenConfig }) => {
  const meta = GROUP_LABEL_MAP[group.group as InfeasibilityGroupId];
  const groupLabel = meta?.label ?? group.group;
  const hasConfigKeys = group.config_keys && group.config_keys.length > 0;

  return (
    <WxbCard
      className="infeasibility-conflict-card"
      style={{
        borderLeft: '3px solid var(--wx-red-500)',
        padding: '12px 14px',
        marginBottom: 8,
      }}
    >
      {/* 卡片顶部：组标签 + lit_key */}
      <div className="infeasibility-card-header">
        <WxbTag color="red">{groupLabel}</WxbTag>
        {group.lit_key && (
          <span className="infeasibility-lit-key">{group.lit_key}</span>
        )}
      </div>

      {/* 冲突说明 */}
      <div className="infeasibility-card-message">
        {group.message_zh}
      </div>

      {/* 建议 */}
      {group.suggestion_zh && (
        <div className="infeasibility-card-suggestion">
          {/* 内联 SVG：灯泡图标 */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <circle
              cx="6.5"
              cy="5.5"
              r="3.5"
              stroke="var(--wx-amber-500)"
              strokeWidth="1.3"
              fill="none"
            />
            <path
              d="M5 9h3M5.5 10.5h2"
              stroke="var(--wx-amber-500)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <span>{group.suggestion_zh}</span>
        </div>
      )}

      {/* 关联员工 / 日期（可选字段） */}
      {((group.related_employees && group.related_employees.length > 0) ||
        (group.related_dates && group.related_dates.length > 0)) && (
        <div className="infeasibility-card-related">
          {group.related_employees && group.related_employees.length > 0 && (
            <span className="infeasibility-related-item">
              {/* 内联 SVG：人员图标 */}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <circle cx="5.5" cy="3.5" r="2" stroke="var(--wx-fg-3)" strokeWidth="1.2" fill="none" />
                <path d="M1.5 10c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="var(--wx-fg-3)" strokeWidth="1.2" fill="none" />
              </svg>
              员工 {group.related_employees.slice(0, 5).join(', ')}
              {group.related_employees.length > 5 && ` +${group.related_employees.length - 5}`}
            </span>
          )}
          {group.related_dates && group.related_dates.length > 0 && (
            <span className="infeasibility-related-item">
              {/* 内联 SVG：日历图标 */}
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="9" height="8.5" rx="1.5" stroke="var(--wx-fg-3)" strokeWidth="1.2" fill="none" />
                <path d="M1 5h9" stroke="var(--wx-fg-3)" strokeWidth="1.2" />
                <path d="M3.5 1v2M7.5 1v2" stroke="var(--wx-fg-3)" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {group.related_dates.slice(0, 3).join(', ')}
              {group.related_dates.length > 3 && ` +${group.related_dates.length - 3}`}
            </span>
          )}
        </div>
      )}

      {/* 跳到配置按钮（仅 hasConfigKeys + onOpenConfig 时渲染） */}
      {hasConfigKeys && onOpenConfig && (
        <div className="infeasibility-card-action">
          <WxbButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenConfig(group.config_keys)}
          >
            {/* 内联 SVG：跳转图标 */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7"
                stroke="var(--wx-blue-600)"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M7 1h4v4M11 1L6.5 5.5"
                stroke="var(--wx-blue-600)"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            跳到配置
          </WxbButton>
        </div>
      )}
    </WxbCard>
  );
};

// ── 主组件 ─────────────────────────────────────────────────────────────────────

export const InfeasibilityPanel: React.FC<InfeasibilityPanelProps> = ({
  groups,
  located,
  onOpenConfig,
  className,
  style,
}) => {
  // ── 降级路径 1：无数据（groups 为 null/undefined/空，且 located 非 true）──
  if (!groups || groups.length === 0) {
    if (located === false) {
      // 诊断运行了但定位失败
      return (
        <div
          className={`infeasibility-panel infeasibility-panel-fallback ${className ?? ''}`}
          style={style}
        >
          {/* V4 风格红字降级 */}
          <div className="infeasibility-fallback-banner">
            {/* 内联 SVG：警告圆 */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="var(--wx-red-500)" strokeWidth="1.5" fill="none" />
              <path d="M8 4.5v4M8 10.5v1" stroke="var(--wx-red-500)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>无可行解：诊断运行完毕，但未能精确定位冲突来源。请检查约束参数组合。</span>
          </div>
        </div>
      );
    }

    if (located === true) {
      // located=true 但 groups 为空（异常情况）
      return (
        <div
          className={`infeasibility-panel ${className ?? ''}`}
          style={style}
        >
          <WxbEmpty description="诊断完成，无具体冲突组（可能已被其他机制处理）" />
        </div>
      );
    }

    // 缺字段（V4 降级：仅显示无解红字）
    return (
      <div
        className={`infeasibility-panel infeasibility-panel-fallback ${className ?? ''}`}
        style={style}
      >
        <div className="infeasibility-fallback-banner">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="var(--wx-red-500)" strokeWidth="1.5" fill="none" />
            <path d="M8 4.5v4M8 10.5v1" stroke="var(--wx-red-500)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>无可行解：约束条件互相冲突，无法生成满足所有条件的排班方案。请检查配置。</span>
        </div>
      </div>
    );
  }

  // ── 有组列表：正常展示 ──────────────────────────────────────────────────────

  return (
    <div
      className={`infeasibility-panel ${className ?? ''}`}
      style={style}
    >
      {/* 面板标题 */}
      <div className="infeasibility-panel-header">
        {/* 内联 SVG：冲突警告图标 */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path
            d="M7.5 1.5L13.5 13.5H1.5L7.5 1.5Z"
            stroke="var(--wx-red-500)"
            strokeWidth="1.4"
            fill="var(--wx-red-50, var(--wx-red-100))"
            strokeLinejoin="round"
          />
          <path d="M7.5 5.5v3.5M7.5 10.5v1" stroke="var(--wx-red-600)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="infeasibility-panel-title">
          无可行解诊断
        </span>
        <WxbTag color="red">{groups.length} 个冲突组</WxbTag>
      </div>

      <p className="infeasibility-panel-desc">
        以下约束组合导致排班问题无解，请根据建议调整配置：
      </p>

      {/* 冲突卡片列表 */}
      <div className="infeasibility-group-list">
        {groups.map((g, i) => (
          <ConflictCard
            key={`${g.group}-${g.lit_key}-${i}`}
            group={g}
            onOpenConfig={onOpenConfig}
          />
        ))}
      </div>
    </div>
  );
};

export default InfeasibilityPanel;
