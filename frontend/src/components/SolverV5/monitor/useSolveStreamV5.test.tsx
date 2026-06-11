/**
 * F3 验收测试：useSolveStreamV5
 *
 * 断言（§F3 验收标准）：
 * 1. 喂 V4-only 序列 → status/progress/logs 正确累积；incumbent 为空
 * 2. 喂 V4+V5 混合序列 → incumbent 累积、latestPreview 更新、phase 更新
 * 3. 字段缺失（V5 字段全无）→ 降级正常，状态不崩溃
 * 4. INFEASIBLE 序列 → infeasibility 写入
 * 5. 350 个 NEW_INCUMBENT → incumbents.length <= 300
 * 6. terminal 状态 → EventSource.close() 被调用
 * 7. new EventSource 调用次数 == 1（单连接）
 * 8. 日志无重复（增量切片）
 *
 * 使用 react.act + createRoot（与仓库现有测试约定一致，无需 @testing-library/react）
 */

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useSolveStreamV5, stripLogIcons } from './useSolveStreamV5';
import type { SolveStreamState } from './monitorTypes';

// ── Mock EventSource ───────────────────────────────────────────────────────────
// 必须在模块顶层赋值（jest 在 beforeAll 里已太晚，hook 的 useEffect 在 act 里才执行）

type ProgressHandler = (e: MessageEvent) => void;

let _mockHandlerProgress: ProgressHandler | null = null;
let _mockClose: jest.Mock = jest.fn();
let _mockNewCount = 0;

function MockEventSource(this: MockEventSource, _url: string) {
    _mockClose = jest.fn();
    _mockHandlerProgress = null;
    _mockNewCount++;
    this.close = _mockClose;
    this.onmessage = null;
    this.onerror = null;
}

interface MockEventSource {
    close: jest.Mock;
    onmessage: ((e: MessageEvent) => void) | null;
    onerror: ((e: Event) => void) | null;
    addEventListener(type: string, handler: EventListenerOrEventListenerObject): void;
    removeEventListener(): void;
    dispatchEvent(): boolean;
}

MockEventSource.prototype.addEventListener = function(
    type: string,
    handler: EventListenerOrEventListenerObject,
) {
    if (type === 'progress') {
        _mockHandlerProgress = handler as ProgressHandler;
    }
};
MockEventSource.prototype.removeEventListener = function() {};
MockEventSource.prototype.dispatchEvent = function() { return true; };

// 在全局注册，这样 hook 里的 `new EventSource(url)` 会用这个 mock
(global as unknown as Record<string, unknown>).EventSource = MockEventSource;

// ── 辅助：推送 SSE 消息 ────────────────────────────────────────────────────────

function pushEvent(data: object): void {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    if (_mockHandlerProgress) {
        _mockHandlerProgress(event);
    }
}

// ── 辅助：用 createRoot 渲染 hook ─────────────────────────────────────────────

interface HookResult {
    state: SolveStreamState;
    isTerminal: boolean;
}

function renderHookHelper(
    runId: number | null,
    open: boolean,
): { getResult: () => HookResult; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);

    let root!: Root;
    let capturedResult: HookResult = {
        state: {
            status: 'INIT', stage: 'INIT', progress: 0, phase: null,
            phaseTimings: {}, modelStats: null, incumbents: [], latestPreview: null,
            searchStats: null, searchHistory: { branches: [], conflicts: [] },
            logs: [], infeasibility: null,
            metrics: { assigned: 0, elapsed: '00:00' },
            error: null,
        },
        isTerminal: false,
    };

    function Capture({ rId, o }: { rId: number | null; o: boolean }) {
        const hookResult = useSolveStreamV5(rId, o);
        // 每次渲染同步捕获（无需 useEffect，渲染本身是同步的）
        capturedResult = hookResult;
        // 阻止 react 警告：useEffect 仅用于标记依赖
        useEffect(() => {}, [hookResult]);
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(<Capture rId={runId} o={open} />);
    });

    return {
        getResult: () => capturedResult,
        unmount: () => {
            act(() => { root.unmount(); });
            if (container.parentNode) container.parentNode.removeChild(container);
        },
    };
}

// ── 工具函数 ───────────────────────────────────────────────────────────────────

function makeLogs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        time: `00:${String(i).padStart(2, '0')}`,
        message: `日志${i}`,
        level: 'INFO',
        category: 'GENERAL',
    }));
}

function makeInc(obj: number, wallTime: number) {
    return {
        obj,
        bound: obj * 0.9,
        gap: 0.1,
        wall_time: wallTime,
        solution_count: 1,
    };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    _mockNewCount = 0;
    _mockHandlerProgress = null;
});

// ── 测试 ───────────────────────────────────────────────────────────────────────

describe('useSolveStreamV5', () => {

    // ── 1. V4-only 序列 ───────────────────────────────────────────────────────

    it('V4-only 序列：正确累积 status/progress/logs，incumbents 为空', () => {
        const { getResult, unmount } = renderHookHelper(1, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: JSON.stringify({
                    progress: 30,
                    metrics: { assigned_count: 10 },
                    logs_full: makeLogs(3),
                }),
            });
        });

        const r = getResult();
        expect(r.state.status).toBe('RUNNING');
        expect(r.state.progress).toBe(30);
        expect(r.state.metrics.assigned).toBe(10);
        expect(r.state.logs).toHaveLength(3);
        expect(r.state.incumbents).toHaveLength(0);
        expect(r.isTerminal).toBe(false);

        unmount();
    });

    // ── 2. V4+V5 混合序列 ────────────────────────────────────────────────────

    it('V4+V5 混合序列：incumbent 累积、latestPreview 更新、phase 更新', () => {
        const { getResult, unmount } = renderHookHelper(2, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: {
                    progress: 40,
                    phase: 'SOLVING',
                    phase_timings: { BUILDING: 800, SOLVING: 2000 },
                    incumbent: {
                        ...makeInc(100000, 5.0),
                        breakdown: {
                            special_shortage_penalty: 0,
                            vacancy_penalty: 5000,
                            special_impact: 0,
                            hours_deviation_scaled: 1000,
                            special_shift_count: 200,
                            night_shift_variance: 100,
                            weekend_work_variance: 50,
                            triple_salary_count: 20,
                            leadership_penalty: 30,
                        },
                        preview: {
                            fill_rate: 0.95,
                            vacant_positions: 5,
                            scheduled_shifts: 400,
                        },
                    },
                },
            });
        });

        const r1 = getResult();
        expect(r1.state.phase).toBe('SOLVING');
        expect(r1.state.phaseTimings['BUILDING']).toBe(800);
        expect(r1.state.incumbents).toHaveLength(1);
        expect(r1.state.incumbents[0].wall_time).toBe(5.0);
        expect(r1.state.incumbents[0].breakdown).toBeDefined();
        expect(r1.state.latestPreview).not.toBeNull();
        expect(r1.state.latestPreview?.fill_rate).toBe(0.95);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: {
                    incumbent: makeInc(95000, 10.0),
                },
            });
        });

        const r2 = getResult();
        expect(r2.state.incumbents).toHaveLength(2);
        expect(r2.state.incumbents[1].obj).toBe(95000);

        unmount();
    });

    // ── 3. 字段缺失降级 ───────────────────────────────────────────────────────

    it('V5 字段全缺失：不崩溃，状态正常', () => {
        const { getResult, unmount } = renderHookHelper(3, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: {
                    progress: 50,
                    metrics: { assigned_count: 20 },
                },
            });
        });

        const r = getResult();
        expect(r.state.phase).toBeNull();
        expect(r.state.modelStats).toBeNull();
        expect(r.state.incumbents).toHaveLength(0);
        expect(r.state.infeasibility).toBeNull();
        expect(r.state.progress).toBe(50);
        expect(r.isTerminal).toBe(false);

        unmount();
    });

    // ── 4. INFEASIBLE 序列 → infeasibility 写入 ──────────────────────────────

    it('INFEASIBLE 序列：infeasibility 写入、terminal 触发', () => {
        const { getResult, unmount } = renderHookHelper(4, true);

        act(() => {
            pushEvent({
                status: 'FAILED',
                solver_progress: {
                    infeasibility: {
                        located: true,
                        groups: [
                            {
                                group: 'STANDARD_HOURS',
                                lit_key: 'lit_hours',
                                message_zh: '工时下限太紧',
                                suggestion_zh: '放宽月度工时容差',
                                config_keys: ['enable_standard_hours'],
                            },
                        ],
                    },
                },
            });
        });

        const r = getResult();
        expect(r.state.status).toBe('FAILED');
        expect(r.state.infeasibility).not.toBeNull();
        expect(r.state.infeasibility?.located).toBe(true);
        expect(r.state.infeasibility?.groups).toHaveLength(1);
        expect(r.state.infeasibility?.groups[0].group).toBe('STANDARD_HOURS');
        expect(r.isTerminal).toBe(true);

        unmount();
    });

    // ── 5. 350 个 incumbent → incumbents.length <= 300 ───────────────────────

    it('350 个 NEW_INCUMBENT → incumbents.length <= 300', () => {
        const { getResult, unmount } = renderHookHelper(5, true);

        act(() => {
            for (let i = 0; i < 350; i++) {
                pushEvent({
                    status: 'RUNNING',
                    solver_progress: {
                        incumbent: makeInc(100000 - i * 10, i * 0.1),
                    },
                });
            }
        });

        const r = getResult();
        expect(r.state.incumbents.length).toBeLessThanOrEqual(300);
        // 末点应当是最后一个 incumbent
        const last = r.state.incumbents[r.state.incumbents.length - 1];
        expect(last.wall_time).toBeCloseTo(349 * 0.1, 1);

        unmount();
    });

    // ── 6. terminal 状态 → EventSource.close() 被调用 ────────────────────────

    it('COMPLETED → EventSource.close() 被调用', () => {
        const { unmount } = renderHookHelper(6, true);
        const closeFn = _mockClose;

        act(() => {
            pushEvent({ status: 'COMPLETED', solver_progress: { progress: 100 } });
        });

        expect(closeFn).toHaveBeenCalled();
        unmount();
    });

    it('APPLIED → EventSource.close() 被调用', () => {
        const { unmount } = renderHookHelper(7, true);
        const closeFn = _mockClose;

        act(() => {
            pushEvent({ status: 'APPLIED', solver_progress: {} });
        });

        expect(closeFn).toHaveBeenCalled();
        unmount();
    });

    // ── 7. new EventSource 调用次数 == 1 ─────────────────────────────────────

    it('每次渲染只新建一个 EventSource（单连接）', () => {
        // beforeEach 已把 _mockNewCount 置 0
        const { unmount } = renderHookHelper(8, true);

        act(() => {
            pushEvent({ status: 'RUNNING', solver_progress: {} });
            pushEvent({ status: 'RUNNING', solver_progress: {} });
        });

        expect(_mockNewCount).toBe(1);
        unmount();
    });

    // ── 8. 日志无重复（增量切片） ─────────────────────────────────────────────

    it('日志增量切片：不重复', () => {
        const { getResult, unmount } = renderHookHelper(9, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: { logs_full: makeLogs(3) },
            });
        });

        expect(getResult().state.logs).toHaveLength(3);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: { logs_full: makeLogs(5) },
            });
        });

        const r = getResult();
        expect(r.state.logs).toHaveLength(5);
        const messages = r.state.logs.map((l) => l.message);
        const unique = new Set(messages);
        expect(unique.size).toBe(5);

        unmount();
    });

    // ── 9. solver_progress 为字符串时先 JSON.parse ───────────────────────────

    it('solver_progress 为字符串时先 JSON.parse', () => {
        const { getResult, unmount } = renderHookHelper(10, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: JSON.stringify({
                    progress: 77,
                    phase: 'PRESOLVE',
                }),
            });
        });

        const r = getResult();
        expect(r.state.progress).toBe(77);
        expect(r.state.phase).toBe('PRESOLVE');

        unmount();
    });

    // ── 10. open=false 时不建连接 ─────────────────────────────────────────────

    it('open=false 时不建立 EventSource', () => {
        const { unmount } = renderHookHelper(11, false);
        expect(_mockNewCount).toBe(0);
        unmount();
    });

    // ── 11. model_stats 写入 ──────────────────────────────────────────────────

    it('MODEL_STATS 事件 → modelStats 写入', () => {
        const { getResult, unmount } = renderHookHelper(12, true);

        act(() => {
            pushEvent({
                status: 'RUNNING',
                solver_progress: {
                    model_stats: {
                        num_vars: 5000,
                        num_constraints: 15000,
                        by_layer: {
                            assignments: 3000, shift: 1000, vacancy: 200,
                            special_cover: 100, special_shortage: 50, task_placement: 150,
                        },
                        by_constraint: {
                            ShareGroup: { count: 120, ms: 4.2, vars: 0 },
                            ShiftAssignment: { count: 9000, ms: 30.1, vars: 3000 },
                        },
                    },
                },
            });
        });

        const r = getResult();
        expect(r.state.modelStats).not.toBeNull();
        expect(r.state.modelStats?.num_vars).toBe(5000);
        expect(r.state.modelStats?.by_constraint['ShareGroup'].count).toBe(120);

        unmount();
    });

    // ── 12. search_stats 写入到 searchHistory ────────────────────────────────

    it('search_stats → searchHistory 追加', () => {
        const { getResult, unmount } = renderHookHelper(13, true);

        act(() => {
            for (let i = 0; i < 3; i++) {
                pushEvent({
                    status: 'RUNNING',
                    solver_progress: {
                        search_stats: { branches: 100 + i, conflicts: 10 + i, booleans: 1000 + i },
                    },
                });
            }
        });

        const r = getResult();
        expect(r.state.searchHistory.branches).toHaveLength(3);
        expect(r.state.searchHistory.branches[0]).toBe(100);
        expect(r.state.searchHistory.conflicts[2]).toBe(12);

        unmount();
    });
});

// ── stripLogIcons ──────────────────────────────────────────────────────────────

describe('stripLogIcons', () => {
    it('普通文字不变', () => {
        expect(stripLogIcons('求解完成')).toBe('求解完成');
    });

    it('含 emoji 的字符串去掉 emoji', () => {
        const input = String.fromCodePoint(0x1F527) + ' 建模完成'; // 🔧 建模完成
        const result = stripLogIcons(input);
        expect(result).toBe('建模完成');
    });

    it('空字符串不崩溃', () => {
        expect(stripLogIcons('')).toBe('');
    });
});
