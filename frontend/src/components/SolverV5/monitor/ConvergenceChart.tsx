/**
 * ConvergenceChart — 区块 c：目标收敛曲线（核心可视化）
 *
 * F5 实现要点：
 * - WxbChartCard 多系列模式：obj 实线 + best_bound 虚线（line geometry）
 * - gap region 阴影（annotations type=region，覆盖整宽，淡蓝）
 * - 末解的 best_bound referenceLine（收敛参考线）
 * - X 轴读 incumbents[i].wall_time（§1.2/§1.3 冻结字段名）
 * - 与区块 d 共用同一份 incumbents 降采样数组（hook 已软上限 300 点）
 * - 空态（无 incumbent）/ 单点态优雅降级
 * - React.memo：仅在 incumbents.length 或末点变化时重渲染
 * - 配色全部走 monitorColors（var(--wx-*)），无硬编码 hex、无 emoji
 *
 * 数据契约：docs/solver_v5/design/20_IMPLEMENTATION_PLAN.md §1.2-1.4
 */

import React from 'react';
import {
    WxbChartCard,
    WxbEmpty,
    type WxbChartSeriesConfig,
    type WxbChartPoint,
    type WxbChartAnnotation,
} from '../../wxb-ui';
import { MONITOR_COLORS } from './monitorColors';
import type { IncumbentPoint } from './monitorTypes';

export interface ConvergenceChartProps {
    incumbents: IncumbentPoint[];
    /** 卡片标题（默认「目标收敛」） */
    title?: string;
    className?: string;
    style?: React.CSSProperties;
    /** headless：只画图，不带卡片 chrome（监视器内嵌时用外层标题） */
    headless?: boolean;
}

// ── 时间轴标签：秒数格式化（mm:ss 或 12.3s）─────────────────────────────────────

function fmtWallTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0s';
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m${s.toString().padStart(2, '0')}`;
}

// ── 数值格式化：大数收缩 k/M ────────────────────────────────────────────────────

function fmtObj(v: number): string {
    if (!Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const SERIES: WxbChartSeriesConfig[] = [
    {
        key: 'obj',
        label: '目标值 obj',
        color: MONITOR_COLORS.objective,
        geometry: 'line',
        lineWidth: 2,
        showPoints: true,
    },
    {
        key: 'bound',
        label: '下界 best_bound',
        color: MONITOR_COLORS.bound,
        geometry: 'line',
        lineWidth: 1.6,
        dash: [5, 4],
        showPoints: false,
    },
];

const ConvergenceChartImpl: React.FC<ConvergenceChartProps> = ({
    incumbents,
    title = '目标收敛',
    className,
    style,
    headless = false,
}) => {
    const n = incumbents.length;

    // ── 空态：未产出任何中间解 ───────────────────────────────────────────────────
    if (n === 0) {
        const empty = (
            <WxbEmpty description="等待求解器产出首个可行解…" />
        );
        if (headless) {
            return (
                <div className={className} style={style}>
                    {empty}
                </div>
            );
        }
        return (
            <div className={`wxb-chart-card ${className ?? ''}`} style={style}>
                <div className="wxb-chart-head">
                    <h3 className="wxb-chart-title">{title}</h3>
                </div>
                <div className="wxb-chart-sub">obj 实线 · best_bound 虚线 · gap 阴影</div>
                {empty}
            </div>
        );
    }

    // ── 组装多系列点（X 轴 = wall_time）──────────────────────────────────────────
    const points: WxbChartPoint[] = incumbents.map((p) => {
        const gapPct = Number.isFinite(p.gap) ? p.gap : 0;
        return {
            label: fmtWallTime(p.wall_time),
            values: { obj: p.obj, bound: p.bound },
            extra: [
                {
                    label: 'gap',
                    value: `${(gapPct * (gapPct <= 1 ? 100 : 1)).toFixed(2)}%`,
                    color: MONITOR_COLORS.bound,
                },
                { label: '解序号', value: `#${p.solution_count}` },
            ],
        };
    });

    const last = incumbents[n - 1];

    // ── 注解：gap region（obj 与 bound 之间的全宽淡蓝阴影）+ best_bound 收敛参考线 ──
    const annotations: WxbChartAnnotation[] = [];
    if (n > 1) {
        // gap region：覆盖整条曲线宽度，提示 obj↔bound 的间隙在收敛中收窄
        annotations.push({
            type: 'region',
            xStart: 0,
            xEnd: n - 1,
            color: MONITOR_COLORS.gapRegion,
            opacity: 0.18,
        });
    }
    if (Number.isFinite(last.bound)) {
        annotations.push({
            type: 'referenceLine',
            yValue: last.bound,
            label: '当前下界',
            color: MONITOR_COLORS.bound,
            dash: [4, 4],
        });
    }

    const subtitle =
        n === 1
            ? `单点 · obj ${fmtObj(last.obj)} · 等待后续中间解`
            : `${n} 个中间解 · obj ${fmtObj(last.obj)} · 下界 ${fmtObj(last.bound)}`;

    return (
        <WxbChartCard
            title={title}
            subtitle={subtitle}
            className={className}
            style={style}
            headless={headless}
            seriesConfig={SERIES}
            points={points}
            annotations={annotations}
            tooltipFormatter={fmtObj}
        />
    );
};

/**
 * React.memo 比较：incumbents 长度相同且末点（wall_time/obj/bound）一致时跳过重渲染。
 * 收敛流是「只追加」的，末点不变即整体不变。
 */
function areEqual(a: ConvergenceChartProps, b: ConvergenceChartProps): boolean {
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
    return (
        pa.wall_time === pb.wall_time &&
        pa.obj === pb.obj &&
        pa.bound === pb.bound
    );
}

export const ConvergenceChart = React.memo(ConvergenceChartImpl, areEqual);
ConvergenceChart.displayName = 'ConvergenceChart';

export default ConvergenceChart;
