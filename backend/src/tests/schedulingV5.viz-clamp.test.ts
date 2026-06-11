/**
 * B3 验收 — V5 solver_progress viz 累积结构的写入与裁剪（纯函数，无 DB）。
 *
 * 覆盖 11_backend §2.2：
 *  - 350 个 NEW_INCUMBENT → convergence.length <= 300 且 viz_meta.convergence_count == 350
 *  - 250 个 event → events.length <= 200（FIFO，优先项保留）
 *  - DIAGNOSIS → infeasibility 非空
 *  - convergence 点含 wall_time 键（非 t）
 */
import { describe, expect, test } from 'vitest';
import {
    buildInitialSolverProgressV5,
    appendVizEvents,
    pushConvergencePoint,
    clampVizArrays,
    extractInfeasibilityAnalysis,
    VIZ_CONVERGENCE_CAP,
    VIZ_EVENTS_CAP,
    VIZ_LOG_CAP,
} from '../controllers/schedulingV5/helpers';

describe('B3 — V5 viz 累积结构裁剪', () => {
    test('初始结构含 V5 全部累积键', () => {
        const sp = buildInitialSolverProgressV5();
        expect(sp).toHaveProperty('logs');
        expect(sp).toHaveProperty('phase', null);
        expect(sp).toHaveProperty('model_stats', null);
        expect(sp).toHaveProperty('search_stats', null);
        expect(sp.convergence).toEqual([]);
        expect(sp.events).toEqual([]);
        expect(sp).toHaveProperty('infeasibility', null);
        expect(sp.viz_meta).toEqual({ convergence_count: 0, events_count: 0 });
    });

    test('350 个 NEW_INCUMBENT → convergence<=300，count==350，含 wall_time', () => {
        let sp: any = buildInitialSolverProgressV5();
        for (let i = 0; i < 350; i++) {
            const incumbent = {
                wall_time: i * 0.1,
                obj: 1000 - i,
                bound: 500 + i,
                gap: (500 - i) / 1000,
                breakdown: { vacancy_penalty: i },
            };
            sp.convergence = pushConvergencePoint(sp.convergence, incumbent);
            sp.viz_meta = { ...sp.viz_meta, convergence_count: sp.viz_meta.convergence_count + 1 };
            sp = clampVizArrays(sp);
        }
        expect(sp.convergence.length).toBeLessThanOrEqual(VIZ_CONVERGENCE_CAP);
        expect(sp.viz_meta.convergence_count).toBe(350);
        // 每个点都有 wall_time 键（不是 t）
        for (const p of sp.convergence) {
            expect(p).toHaveProperty('wall_time');
            expect(p).not.toHaveProperty('t');
        }
        // 保头：首点 wall_time==0；保尾：末点 wall_time==349*0.1
        expect(sp.convergence[0].wall_time).toBe(0);
        expect(sp.convergence[sp.convergence.length - 1].wall_time).toBeCloseTo(349 * 0.1, 5);
    });

    test('250 个 event → events<=200（FIFO，优先项 NEW_INCUMBENT 保留）', () => {
        let sp: any = buildInitialSolverProgressV5();
        for (let i = 0; i < 250; i++) {
            const type = i % 10 === 0 ? 'NEW_INCUMBENT' : 'PHASE_ENTER';
            sp.events = appendVizEvents(sp.events, { wall_time: i, type, phase: 'SOLVING', payload: null });
            sp.viz_meta = { ...sp.viz_meta, events_count: sp.viz_meta.events_count + 1 };
            sp = clampVizArrays(sp);
        }
        expect(sp.events.length).toBeLessThanOrEqual(VIZ_EVENTS_CAP);
        expect(sp.viz_meta.events_count).toBe(250);
        // 所有 25 个 NEW_INCUMBENT 优先项必须全部保留
        const incumbents = sp.events.filter((e: any) => e.type === 'NEW_INCUMBENT');
        expect(incumbents.length).toBe(25);
    });

    test('logs 超 1000 行 → 保尾最近 1000 行', () => {
        let sp: any = buildInitialSolverProgressV5();
        for (let i = 0; i < 1500; i++) {
            sp.logs = appendVizEvents(sp.logs, `log line ${i}`);
            sp = clampVizArrays(sp);
        }
        expect(sp.logs.length).toBe(VIZ_LOG_CAP);
        // 保尾：最后一条是 1499
        expect(sp.logs[sp.logs.length - 1]).toBe('log line 1499');
        // 最旧的被丢
        expect(sp.logs[0]).toBe('log line 500');
    });

    test('DIAGNOSIS → infeasibility 覆盖且非空，phase=DIAGNOSING', () => {
        let sp: any = buildInitialSolverProgressV5();
        const infeasibility = {
            located: true,
            groups: [
                {
                    group: 'POSITION_MUST_FILL',
                    lit_key: 'lit_fill',
                    message_zh: '岗位必填冲突',
                    suggestion_zh: '放宽必填岗位',
                    config_keys: ['enable_position_must_fill'],
                },
            ],
        };
        sp.infeasibility = infeasibility;
        sp.phase = 'DIAGNOSING';
        sp = clampVizArrays(sp);
        expect(sp.infeasibility).not.toBeNull();
        expect(sp.infeasibility.groups[0].group).toBe('POSITION_MUST_FILL');
        expect(sp.phase).toBe('DIAGNOSING');
    });

    test('未超限时 clampVizArrays 不改动数组', () => {
        let sp: any = buildInitialSolverProgressV5();
        sp.convergence = [{ wall_time: 0, obj: 1, bound: 0, gap: 1, breakdown: null }];
        sp.events = [{ wall_time: 0, type: 'PHASE_ENTER', phase: 'BUILDING', payload: null }];
        const clamped = clampVizArrays(sp);
        expect(clamped.convergence.length).toBe(1);
        expect(clamped.events.length).toBe(1);
    });

    test('extractInfeasibilityAnalysis 原样返回 result.infeasibility_analysis', () => {
        expect(extractInfeasibilityAnalysis(null)).toBeNull();
        expect(extractInfeasibilityAnalysis({})).toBeNull();
        const ia = { is_infeasible: true, located: true, minimal_conflict_groups: [] };
        expect(extractInfeasibilityAnalysis({ infeasibility_analysis: ia })).toBe(ia);
    });

    test('pushConvergencePoint 容错缺字段（用 null 占位）', () => {
        const out = pushConvergencePoint([], { wall_time: 1.5 });
        expect(out[0]).toEqual({ wall_time: 1.5, obj: null, bound: null, gap: null, breakdown: null });
    });
});
