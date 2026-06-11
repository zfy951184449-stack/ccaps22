/**
 * ObjectiveBreakdownChart — 区块 d：目标分量堆叠图（核心可视化）
 *
 * F5 实现要点：
 * - WxbChartCard geometry='bar' 堆叠模式：O0-O8 九分量，一柱一时刻
 * - X 轴 = incumbent.wall_time（与区块 c 共用同一份 incumbents 降采样数组）
 * - 随 incumbent 演进：每个中间解一根堆叠柱，直观看到各惩罚项如何收敛
 * - 配色 monitorColors（BREAKDOWN_COLOR_KEYS，9 色语义区分），无硬编码 hex
 * - 缺 breakdown 时：整块隐藏（返回 null），不渲染空壳
 * - 全部点都缺 breakdown → 隐藏；部分缺失 → 该柱视作全 0（堆叠高度 0）
 * - React.memo：仅在 incumbents.length 或末点 breakdown 变化时重渲染
 *
 * 数据契约：docs/solver_v5/design/20_IMPLEMENTATION_PLAN.md §1.2/§1.4
 */

import React from 'react';
import {
    WxbChartCard,
    type WxbChartSeriesConfig,
    type WxbChartPoint,
} from '../../wxb-ui';
import {
    MONITOR_COLORS,
    BREAKDOWN_COLOR_KEYS,
    BREAKDOWN_FIELD_NAMES,
} from './monitorColors';
import type { IncumbentPoint, IncumbentBreakdown } from './monitorTypes';

export interface ObjectiveBreakdownChartProps {
    incumbents: IncumbentPoint[];
    /** 卡片标题（默认「目标分量构成」） */
    title?: string;
    className?: string;
    style?: React.CSSProperties;
    headless?: boolean;
}

// ── O0-O8 中文短标签（与 BREAKDOWN_FIELD_NAMES 同序）─────────────────────────────

const BREAKDOWN_LABELS: Record<string, string> = {
    special_shortage_penalty: '专项欠配',
    vacancy_penalty: '岗位空缺',
    special_impact: '专项影响',
    hours_deviation_scaled: '工时偏差',
    special_shift_count: '专项班次',
    night_shift_variance: '夜班方差',
    weekend_work_variance: '周末方差',
    triple_salary_count: '三薪计数',
    leadership_penalty: '领导参与',
};

// ── 堆叠系列配置：O0-O8 按 §1.4 冻结顺序，配 monitorColors ────────────────────────

const SERIES: WxbChartSeriesConfig[] = BREAKDOWN_FIELD_NAMES.map((field, i) => ({
    key: field,
    label: BREAKDOWN_LABELS[field] ?? field,
    color: MONITOR_COLORS[BREAKDOWN_COLOR_KEYS[i]],
    geometry: 'bar',
}));

// ── 时间轴标签 ──────────────────────────────────────────────────────────────────

function fmtWallTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0s';
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m${s.toString().padStart(2, '0')}`;
}

function fmtVal(v: number): string {
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function breakdownValues(b: IncumbentBreakdown | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    for (const field of BREAKDOWN_FIELD_NAMES) {
        const v = b ? (b as unknown as Record<string, number>)[field] : 0;
        out[field] = Number.isFinite(v) ? v : 0;
    }
    return out;
}

const ObjectiveBreakdownChartImpl: React.FC<ObjectiveBreakdownChartProps> = ({
    incumbents,
    title = '目标分量构成',
    className,
    style,
    headless = false,
}) => {
    // ── 降级：无任何带 breakdown 的中间解 → 整块隐藏 ───────────────────────────────
    const hasAnyBreakdown = incumbents.some((p) => p.breakdown !== undefined);
    if (incumbents.length === 0 || !hasAnyBreakdown) {
        return null;
    }

    const points: WxbChartPoint[] = incumbents.map((p) => {
        const values = breakdownValues(p.breakdown);
        const total = BREAKDOWN_FIELD_NAMES.reduce((s, f) => s + (values[f] ?? 0), 0);
        return {
            label: fmtWallTime(p.wall_time),
            values,
            extra: [{ label: '合计', value: fmtVal(total) }],
        };
    });

    const n = points.length;
    const subtitle =
        n === 1
            ? '单点 · 九分量堆叠 · 等待后续中间解'
            : `${n} 个时刻 · 九分量随收敛演进`;

    return (
        <WxbChartCard
            title={title}
            subtitle={subtitle}
            className={className}
            style={style}
            headless={headless}
            seriesConfig={SERIES}
            points={points}
            tooltipFormatter={fmtVal}
        />
    );
};

/**
 * React.memo 比较：长度相同且末点 breakdown 一致时跳过重渲染。
 */
function areEqual(
    a: ObjectiveBreakdownChartProps,
    b: ObjectiveBreakdownChartProps,
): boolean {
    if (
        a.title !== b.title ||
        a.headless !== b.headless ||
        a.className !== b.className
    ) {
        return false;
    }
    const la = a.incumbents.length;
    const lb = b.incumbents.length;
    if (la !== lb) return false;
    if (la === 0) return true;
    const pa = a.incumbents[la - 1];
    const pb = b.incumbents[lb - 1];
    if (pa.wall_time !== pb.wall_time) return false;
    // 末点 breakdown 逐分量比对
    const ba = pa.breakdown;
    const bb = pb.breakdown;
    if (ba === undefined && bb === undefined) return true;
    if (ba === undefined || bb === undefined) return false;
    for (const field of BREAKDOWN_FIELD_NAMES) {
        const ka = (ba as unknown as Record<string, number>)[field];
        const kb = (bb as unknown as Record<string, number>)[field];
        if (ka !== kb) return false;
    }
    return true;
}

export const ObjectiveBreakdownChart = React.memo(
    ObjectiveBreakdownChartImpl,
    areEqual,
);
ObjectiveBreakdownChart.displayName = 'ObjectiveBreakdownChart';

export default ObjectiveBreakdownChart;
