/**
 * F5 验收测试：ConvergenceChart（区块 c） + ObjectiveBreakdownChart（区块 d）
 *
 * 断言（§F5 验收标准）：
 * 1. 喂 incumbents mock → 收敛曲线渲染（obj/bound 系列、gap region、referenceLine）
 * 2. 堆叠正确：O0-O8 九系列、堆叠柱条数 == incumbents 条数
 * 3. 缺 breakdown 时区块 d 隐藏（返回 null，无 DOM）
 * 4. 空态：incumbents=[] → 收敛曲线显示空态、堆叠图隐藏
 * 5. 单点态：incumbents.length==1 → 不崩溃、正常渲染
 * 6. 收敛终点 obj == 末 incumbent.obj（自洽，与结果页 metrics.objective_value 对齐）
 *
 * 渲染约定：react-dom/client createRoot + act（与仓库现有监视器测试一致）
 */

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { ConvergenceChart } from './ConvergenceChart';
import { ObjectiveBreakdownChart } from './ObjectiveBreakdownChart';
import {
    BREAKDOWN_FIELD_NAMES,
    BREAKDOWN_COLOR_KEYS,
    MONITOR_COLORS,
} from './monitorColors';
import type { IncumbentPoint, IncumbentBreakdown } from './monitorTypes';

// ── 测试夹具 ────────────────────────────────────────────────────────────────────

function makeBreakdown(scale: number): IncumbentBreakdown {
    return {
        special_shortage_penalty: 0,
        vacancy_penalty: 20000 * scale,
        special_impact: 0,
        hours_deviation_scaled: 1500 * scale,
        special_shift_count: 300 * scale,
        night_shift_variance: 12 * scale,
        weekend_work_variance: 8 * scale,
        triple_salary_count: 40 * scale,
        leadership_penalty: 60 * scale,
    };
}

function makeIncumbents(count: number, withBreakdown = true): IncumbentPoint[] {
    const out: IncumbentPoint[] = [];
    for (let i = 0; i < count; i++) {
        const scale = 1 - i * 0.1;
        out.push({
            wall_time: (i + 1) * 5.5,
            obj: 200000 - i * 10000,
            bound: 140000 + i * 2000,
            gap: 0.3 - i * 0.02,
            solution_count: i + 1,
            breakdown: withBreakdown ? makeBreakdown(scale) : undefined,
        });
    }
    return out;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
        root = createRoot(container);
    });
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
});

function renderConvergence(incumbents: IncumbentPoint[]) {
    act(() => {
        root.render(<ConvergenceChart incumbents={incumbents} />);
    });
}

function renderBreakdown(incumbents: IncumbentPoint[]) {
    act(() => {
        root.render(<ObjectiveBreakdownChart incumbents={incumbents} />);
    });
}

// ── 区块 c：ConvergenceChart ────────────────────────────────────────────────────

describe('ConvergenceChart（区块 c 收敛曲线）', () => {
    it('喂 incumbents → 渲染 obj/bound 两系列折线', () => {
        renderConvergence(makeIncumbents(5));
        // 两条系列（图例项）
        const legend = container.querySelectorAll('.wxb-chart-legend-item');
        expect(legend.length).toBe(2);
        // 至少一条 polyline（obj 折线）
        const polylines = container.querySelectorAll('polyline');
        expect(polylines.length).toBeGreaterThanOrEqual(2);
    });

    it('gap region 阴影 + best_bound referenceLine 注解存在', () => {
        renderConvergence(makeIncumbents(5));
        // referenceLine 标签「当前下界」
        expect(container.textContent).toContain('当前下界');
        // region 矩形：rx=2 的 rect（annotation region 渲染为 rect）
        const rects = container.querySelectorAll('rect');
        expect(rects.length).toBeGreaterThan(0);
    });

    it('空态：incumbents=[] → 渲染空态文案，不崩溃', () => {
        renderConvergence([]);
        expect(container.textContent).toContain('等待求解器产出首个可行解');
        // 空态下无折线
        expect(container.querySelectorAll('polyline').length).toBe(0);
    });

    it('单点态：incumbents.length==1 → 正常渲染不崩溃', () => {
        renderConvergence(makeIncumbents(1));
        expect(container.textContent).toContain('单点');
    });

    it('收敛终点自洽：末点 obj 值可在 tooltip 数据中复现', () => {
        const inc = makeIncumbents(4);
        renderConvergence(inc);
        // 末点 obj == 170000，格式化为 170.0k
        const last = inc[inc.length - 1];
        expect(last.obj).toBe(170000);
        // 图表标题副标题含格式化 obj
        expect(container.textContent).toContain('170.0k');
    });

    it('颜色全部 var(--wx-*)，无硬编码 hex', () => {
        renderConvergence(makeIncumbents(3));
        const html = container.innerHTML;
        // monitorColors 的值均为 var(--wx-*)
        expect(MONITOR_COLORS.objective).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.bound).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.gapRegion).toMatch(/^var\(--wx-/);
        // obj 主线颜色出现在 DOM（stroke 属性）
        expect(html).toContain('var(--wx-blue-700)');
    });
});

// ── 区块 d：ObjectiveBreakdownChart ─────────────────────────────────────────────

describe('ObjectiveBreakdownChart（区块 d 分量堆叠）', () => {
    it('喂带 breakdown 的 incumbents → 九系列堆叠柱', () => {
        const inc = makeIncumbents(4, true);
        renderBreakdown(inc);
        // 九系列图例
        const legend = container.querySelectorAll('.wxb-chart-legend-item');
        expect(legend.length).toBe(BREAKDOWN_FIELD_NAMES.length);
        expect(BREAKDOWN_FIELD_NAMES.length).toBe(9);
        // 堆叠柱 rect 数量 == 9 分量 × 4 时刻（含可能的 annotation/grid rect，至少 36 个数据柱）
        const rects = container.querySelectorAll('rect');
        expect(rects.length).toBeGreaterThanOrEqual(9 * 4);
    });

    it('缺 breakdown（全无）→ 区块隐藏，无 DOM 输出', () => {
        renderBreakdown(makeIncumbents(4, false));
        // 返回 null：container 内无图表卡片
        expect(container.querySelector('.wxb-chart-card')).toBeNull();
        expect(container.querySelectorAll('.wxb-chart-legend-item').length).toBe(0);
    });

    it('空态：incumbents=[] → 隐藏（返回 null）', () => {
        renderBreakdown([]);
        expect(container.querySelector('.wxb-chart-card')).toBeNull();
    });

    it('部分缺 breakdown → 缺失柱视作全 0，不崩溃', () => {
        const inc = makeIncumbents(3, true);
        inc[1].breakdown = undefined; // 中间点缺失
        renderBreakdown(inc);
        // 仍渲染（有至少一个点带 breakdown）
        const legend = container.querySelectorAll('.wxb-chart-legend-item');
        expect(legend.length).toBe(9);
    });

    it('单点态：1 个带 breakdown 的 incumbent → 正常渲染', () => {
        renderBreakdown(makeIncumbents(1, true));
        expect(container.textContent).toContain('单点');
    });

    it('堆叠系列配色取自 BREAKDOWN_COLOR_KEYS（全 var(--wx-*)）', () => {
        renderBreakdown(makeIncumbents(2, true));
        const html = container.innerHTML;
        // O0 专项欠配 = red-500
        expect(MONITOR_COLORS[BREAKDOWN_COLOR_KEYS[0]]).toBe('var(--wx-red-500)');
        expect(html).toContain('var(--wx-red-500)');
        // 全部分量色均为 var(--wx-*)
        for (const key of BREAKDOWN_COLOR_KEYS) {
            expect(MONITOR_COLORS[key]).toMatch(/^var\(--wx-/);
        }
    });
});
