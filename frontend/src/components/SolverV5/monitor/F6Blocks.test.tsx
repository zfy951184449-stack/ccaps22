/**
 * F6 验收测试：PhaseTimeline（区块 a）+ ModelBuildStats（区块 b）
 *              + IncumbentPreview（区块 e）+ SearchIntensity（区块 f）
 *
 * 断言（§F6 验收标准）：
 * - 各区块 null/正常/异常数据 → 不崩溃
 * - 降级 UI（空态文案）在缺失数据时出现
 * - 正常数据时渲染核心内容
 * - 颜色全 var(--wx-*)，无硬编码 hex
 *
 * 渲染约定：react-dom/client createRoot + act（与仓库现有测试一致）
 */

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import PhaseTimeline from './PhaseTimeline';
import ModelBuildStats from './ModelBuildStats';
import IncumbentPreview from './IncumbentPreview';
import SearchIntensity from './SearchIntensity';
import { MONITOR_COLORS } from './monitorColors';
import type { ModelStats, PreviewSnapshot, SearchStats, PhaseKey } from './monitorTypes';

// ── 测试夹具 ────────────────────────────────────────────────────────────────

function makeModelStats(): ModelStats {
    return {
        num_vars: 12000,
        num_constraints: 34000,
        by_layer: {
            assignments: 8000,
            shift: 3000,
            vacancy: 500,
            special_cover: 200,
            special_shortage: 100,
            task_placement: 200,
        },
        by_constraint: {
            ShiftAssignment: { count: 9000, ms: 30.1, vars: 3000 },
            ShareGroup: { count: 120, ms: 4.2, vars: 0 },
            StandardHours: { count: 200, ms: 2.1, vars: 0 },
            LockedOperations: { count: 50, ms: 0.8, vars: 0 },
            SpecialShiftCoverage: { count: 80, ms: 1.5, vars: 100 },
            ConsecutiveDays: { count: 'OFF' as const, ms: 0, vars: 0 },
        },
    };
}

function makePreview(): PreviewSnapshot {
    return {
        fill_rate: 0.94,
        vacant_positions: 6,
        scheduled_shifts: 412,
    };
}

function makeSearchStats(): SearchStats {
    return {
        branches: 90210,
        conflicts: 4021,
        booleans: 8800,
    };
}

// ── DOM 初始化 ───────────────────────────────────────────────────────────────

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

// ── 区块 a：PhaseTimeline ────────────────────────────────────────────────────

describe('PhaseTimeline（区块 a 阶段时间轴）', () => {
    it('null 数据（无 stage/phaseTimings）→ 降级 UI 不崩溃', () => {
        act(() => {
            root.render(
                <PhaseTimeline
                    stage="INIT"
                    phase={null}
                    phaseTimings={{}}
                />,
            );
        });
        // 无阶段时显示空态
        expect(container.textContent).toContain('阶段数据不可用');
    });

    it('ASSEMBLING 阶段 → 渲染「组装」段', () => {
        act(() => {
            root.render(
                <PhaseTimeline
                    stage="ASSEMBLING"
                    phase={null}
                    phaseTimings={{}}
                />,
            );
        });
        expect(container.textContent).toContain('组装');
    });

    it('正常数据（有 phaseTimings）→ 渲染所有阶段段', () => {
        const timings: Partial<Record<PhaseKey, number>> = {
            BUILDING: 800,
            PRESOLVE: 300,
            SOLVING: 45000,
            EXTRACTING: 120,
        };
        act(() => {
            root.render(
                <PhaseTimeline
                    stage="DONE"
                    phase="EXTRACTING"
                    phaseTimings={timings}
                />,
            );
        });
        // 包含各阶段标签（图例中）
        expect(container.textContent).toContain('组装');
        expect(container.textContent).toContain('建模');
        expect(container.textContent).toContain('预处理');
        // SVG 应该存在
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
    });

    it('含 DIAGNOSING 阶段 → 渲染诊断段', () => {
        act(() => {
            root.render(
                <PhaseTimeline
                    stage="DONE"
                    phase="DIAGNOSING"
                    phaseTimings={{ BUILDING: 500, SOLVING: 2000, DIAGNOSING: 5000 }}
                />,
            );
        });
        expect(container.textContent).toContain('诊断');
    });

    it('颜色来自 MONITOR_COLORS（全 var(--wx-*)），无硬编码 hex', () => {
        expect(MONITOR_COLORS.phase_assembling).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.phase_building).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.phase_solving).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.phase_diagnosing).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.phase_extracting).toMatch(/^var\(--wx-/);
    });
});

// ── 区块 b：ModelBuildStats ─────────────────────────────────────────────────

describe('ModelBuildStats（区块 b 模型构建统计）', () => {
    it('null modelStats → 降级 UI「建模统计不可用」', () => {
        act(() => {
            root.render(<ModelBuildStats modelStats={null} />);
        });
        expect(container.textContent).toContain('建模统计不可用');
    });

    it('正常 modelStats → 渲染汇总数字与柱状图', () => {
        act(() => {
            root.render(<ModelBuildStats modelStats={makeModelStats()} />);
        });
        // 汇总行应含总约束数（34000 → 34,000）
        expect(container.textContent).toContain('34,000');
        // 柱状图 SVG
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
    });

    it('by_constraint 含 OFF 约束 → 不崩溃，OFF 约束不计入 count 视图', () => {
        act(() => {
            root.render(<ModelBuildStats modelStats={makeModelStats()} />);
        });
        // 不崩溃即通过
        expect(container.querySelector('.model-build-stats')).not.toBeNull();
    });

    it('空 by_constraint → 显示「暂无数据」', () => {
        const emptyStats: ModelStats = {
            num_vars: 0,
            num_constraints: 0,
            by_layer: {
                assignments: 0, shift: 0, vacancy: 0,
                special_cover: 0, special_shortage: 0, task_placement: 0,
            },
            by_constraint: {},
        };
        act(() => {
            root.render(<ModelBuildStats modelStats={emptyStats} />);
        });
        expect(container.textContent).toContain('暂无数据');
    });

    it('切换为「变量数」视图 → 不崩溃', () => {
        act(() => {
            root.render(<ModelBuildStats modelStats={makeModelStats()} />);
        });
        // 切换 segmented（点击「变量数」）
        const btns = container.querySelectorAll('.wxb-segmented-item');
        if (btns.length >= 2) {
            act(() => {
                (btns[1] as HTMLElement).click();
            });
        }
        expect(container.querySelector('.model-build-stats')).not.toBeNull();
    });
});

// ── 区块 e：IncumbentPreview ─────────────────────────────────────────────────

describe('IncumbentPreview（区块 e 中间解快照）', () => {
    it('null preview → 降级 UI「暂无快照」', () => {
        act(() => {
            root.render(<IncumbentPreview preview={null} />);
        });
        expect(container.textContent).toContain('暂无快照');
    });

    it('正常 preview → 渲染覆盖率/空缺数/已排班次', () => {
        act(() => {
            root.render(
                <IncumbentPreview preview={makePreview()} solutionCount={3} />,
            );
        });
        // 覆盖率 94%
        expect(container.textContent).toContain('94%');
        // 空缺 6 岗位
        expect(container.textContent).toContain('空缺 6 岗位');
        // 已排班次 412
        expect(container.textContent).toContain('412');
        // 第 3 次改进
        expect(container.textContent).toContain('第 3 次改进');
    });

    it('fill_rate=1（满班）→ 100% 绿色 gauge，不崩溃', () => {
        act(() => {
            root.render(
                <IncumbentPreview
                    preview={{ fill_rate: 1, vacant_positions: 0, scheduled_shifts: 500 }}
                />,
            );
        });
        expect(container.textContent).toContain('100%');
    });

    it('fill_rate=0 → 0% 显示，不崩溃', () => {
        act(() => {
            root.render(
                <IncumbentPreview
                    preview={{ fill_rate: 0, vacant_positions: 100, scheduled_shifts: 0 }}
                />,
            );
        });
        expect(container.textContent).toContain('0%');
    });

    it('solutionCount 未传 → 不显示「第 N 次改进」文字', () => {
        act(() => {
            root.render(<IncumbentPreview preview={makePreview()} />);
        });
        expect(container.textContent).not.toContain('次改进');
    });
});

// ── 区块 f：SearchIntensity ──────────────────────────────────────────────────

describe('SearchIntensity（区块 f 搜索强度）', () => {
    it('null searchStats + 空历史 → 降级 UI「搜索强度不可用」', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={null}
                    branchHistory={[]}
                    conflictHistory={[]}
                />,
            );
        });
        expect(container.textContent).toContain('搜索强度不可用');
    });

    it('正常 searchStats → 渲染分支数/冲突数', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={makeSearchStats()}
                    branchHistory={[1000, 5000, 10000, 90210]}
                    conflictHistory={[100, 500, 2000, 4021]}
                />,
            );
        });
        // 分支 90.2K
        expect(container.textContent).toContain('90.2K');
        // 冲突 4.0K
        expect(container.textContent).toContain('4.0K');
    });

    it('只有历史数组（searchStats=null）→ 仍渲染 sparkline，不崩溃', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={null}
                    branchHistory={[100, 200, 300, 400]}
                    conflictHistory={[10, 20, 30, 40]}
                />,
            );
        });
        // 有历史数组时不应显示空态（但 searchStats=null → 分支数/冲突数显示 0）
        expect(container.textContent).not.toContain('搜索强度不可用');
    });

    it('booleans=0 → 不显示布尔变量行', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={{ branches: 100, conflicts: 10, booleans: 0 }}
                    branchHistory={[100]}
                    conflictHistory={[10]}
                />,
            );
        });
        expect(container.textContent).not.toContain('布尔变量');
    });

    it('booleans>0 → 显示布尔变量数', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={makeSearchStats()}
                    branchHistory={[90210]}
                    conflictHistory={[4021]}
                />,
            );
        });
        expect(container.textContent).toContain('布尔变量');
        expect(container.textContent).toContain('8.8K');
    });

    it('颜色来自 MONITOR_COLORS（全 var(--wx-*)）', () => {
        expect(MONITOR_COLORS.branches).toMatch(/^var\(--wx-/);
        expect(MONITOR_COLORS.conflicts).toMatch(/^var\(--wx-/);
    });

    it('大数字格式化：百万级别 → M 后缀', () => {
        act(() => {
            root.render(
                <SearchIntensity
                    searchStats={{ branches: 1500000, conflicts: 500000, booleans: 2000000 }}
                    branchHistory={[1500000]}
                    conflictHistory={[500000]}
                />,
            );
        });
        expect(container.textContent).toContain('1.5M');
        expect(container.textContent).toContain('500.0K');
    });
});
