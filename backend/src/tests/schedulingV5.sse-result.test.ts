/**
 * B4 验收 — V5 SSE 透传 + result 端点附字段（集成测试，需要 DB）
 *
 * 覆盖 B4 工单要点：
 *  1. SSE handler 透传 solver_progress（含 convergence/phase），V4 字段（status/stage/error）不丢
 *  2. updateSolveProgressV5 回调落 DB 后 solver_progress 含 V5 viz 字段
 *  3. GET /runs/:id/result 的 data.infeasibility_analysis 非空（从 result_summary 读）
 *  4. GET /runs/:id/result 的 data.objective_breakdown 来自 result.metrics.objective_breakdown
 *  5. GET /runs/:id/result 的 data.viz 从 solver_progress 读取（含 convergence/phase/viz_meta）
 *
 * 连真实本地 MySQL(aps_system)，测试数据用 B4TEST 前缀 + 未来日期(2026-08-05)。
 * afterEach/afterAll 严格清理，避免污染开发库。
 */
import { beforeAll, afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    getSolveResultV5,
    updateSolveProgressV5,
    getSolveProgressSSEV5,
} from '../controllers/schedulingV5';
import { buildInitialSolverProgressV5 } from '../controllers/schedulingV5/helpers';
import { Request, Response } from 'express';

const PREFIX = 'B4TEST';
const D = '2026-08-05';

// ── DB 辅助 ─────────────────────────────────────────────────────────────────

async function insertRun(overrides: Record<string, any> = {}): Promise<number> {
    const runKey = `${PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runCode = `V5-${PREFIX}-${Date.now()}`;
    const base = buildInitialSolverProgressV5();
    const [res] = await pool.execute<any>(
        `INSERT INTO scheduling_runs
             (run_key, run_code, status, stage, period_start, period_end,
              window_start, window_end, target_batch_ids, summary_json, solver_progress)
         VALUES (?, ?, ?, 'DONE', ?, ?, ?, ?, '[]', '{}', ?)`,
        [
            runKey,
            overrides.run_code ?? runCode,
            overrides.status ?? 'COMPLETED',
            D, D, D, D,
            JSON.stringify(overrides.solver_progress ?? base),
        ],
    );
    const id = Number(res.insertId);
    if (overrides.result_summary !== undefined) {
        await pool.execute(
            'UPDATE scheduling_runs SET result_summary = ? WHERE id = ?',
            [JSON.stringify(overrides.result_summary), id],
        );
    }
    return id;
}

async function cleanup() {
    await pool.execute(
        `DELETE FROM scheduling_runs WHERE run_code LIKE '${PREFIX}%' OR run_code LIKE 'V5-${PREFIX}%'`,
    );
}

// ── Mock req/res 工厂 ────────────────────────────────────────────────────────

function makeReqRes(params: Record<string, any> = {}, body: Record<string, any> = {}): [Request, Response, any] {
    const captured: { status?: number; json?: any; end?: boolean; written?: string[] } = { written: [] };
    const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data: any) => { captured.json = data; return res; }),
        write: vi.fn((chunk: string) => { captured.written!.push(chunk); }),
        end: vi.fn(() => { captured.end = true; }),
        writeHead: vi.fn(),
        on: vi.fn(),
    };
    const req: any = { params, body };
    return [req as Request, res as Response, captured];
}

// ── 测试套件 ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
    await cleanup();
});

afterEach(async () => {
    await cleanup();
});

afterAll(async () => {
    await cleanup();
    await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 套件 1：updateSolveProgressV5 回调落 DB + viz 字段写入
// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — updateSolveProgressV5 回调落 DB + V5 viz', () => {
    test('RUNNING 回调后 solver_progress 含 progress / status，DB 已更新', async () => {
        // 非终态起点（QUEUED）→ RUNNING 帧应正常落地（终态守卫只拦「终态→RUNNING」）。
        const runId = await insertRun({ status: 'QUEUED' });

        const [req, res, captured] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'RUNNING',
                progress: 42,
                message: '求解中',
            },
        );

        await updateSolveProgressV5(req, res);
        expect(captured.json?.success).toBe(true);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        expect(rows.length).toBe(1);
        expect(rows[0].status).toBe('RUNNING');
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;
        // V4 字段不丢
        expect(sp.progress).toBe(42);
        expect(sp.message).toBe('求解中');
    });

    test('终态守卫：COMPLETED run 收到迟到 RUNNING 帧不被打回 RUNNING（日志/进度仍合并）', async () => {
        const runId = await insertRun({ status: 'COMPLETED' });

        const [req, res, captured] = makeReqRes(
            {},
            { run_id: runId, status: 'RUNNING', progress: 17, message: '迟到心跳' },
        );

        await updateSolveProgressV5(req, res);
        expect(captured.json?.success).toBe(true);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        // 状态不得被迟到帧复活
        expect(rows[0].status).toBe('COMPLETED');
        // 但进度/消息照常合并
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;
        expect(sp.progress).toBe(17);
        expect(sp.message).toBe('迟到心跳');
    });

    test('NEW_INCUMBENT 回调后 convergence 增一点，含 wall_time 键', async () => {
        const runId = await insertRun();

        const [req, res, captured] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'RUNNING',
                type: 'SOLUTION',
                event: 'NEW_INCUMBENT',
                metrics: { objective_value: 500, best_bound: 200, gap: 0.6, wall_time: 3.5 },
                incumbent: {
                    obj: 500,
                    bound: 200,
                    gap: 0.6,
                    wall_time: 3.5,
                    solution_count: 1,
                    breakdown: { vacancy_penalty: 100, special_shortage_penalty: 400 },
                },
            },
        );

        await updateSolveProgressV5(req, res);
        expect(captured.json?.success).toBe(true);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;

        expect(Array.isArray(sp.convergence)).toBe(true);
        expect(sp.convergence.length).toBe(1);
        const point = sp.convergence[0];
        // 冻结契约 §1.3：字段名 wall_time（非 t）
        expect(point).toHaveProperty('wall_time', 3.5);
        expect(point).toHaveProperty('obj', 500);
        expect(point).toHaveProperty('bound', 200);
        expect(point.breakdown).toMatchObject({ vacancy_penalty: 100 });
        // viz_meta 计数
        expect(sp.viz_meta?.convergence_count).toBe(1);
    });

    test('PHASE_ENTER 回调后 phase 被覆盖，events 增加', async () => {
        const runId = await insertRun();

        const [req, res] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'RUNNING',
                event: 'PHASE_ENTER',
                phase: 'SOLVING',
            },
        );

        await updateSolveProgressV5(req, res);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;

        expect(sp.phase).toBe('SOLVING');
        expect(Array.isArray(sp.events)).toBe(true);
        expect(sp.events.length).toBeGreaterThanOrEqual(1);
        expect(sp.events[0].type).toBe('PHASE_ENTER');
        expect(sp.viz_meta?.events_count).toBe(1);
    });

    test('MODEL_STATS 回调后 model_stats 被写入', async () => {
        const runId = await insertRun();

        const modelStats = {
            num_vars: 5000,
            num_constraints: 2000,
            by_layer: { assignments: 1000, shift: 500, vacancy: 500 },
            by_constraint: { unique_employee: { count: 200, ms: 1.2, vars: 200 } },
        };

        const [req, res] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'RUNNING',
                event: 'MODEL_STATS',
                model_stats: modelStats,
            },
        );

        await updateSolveProgressV5(req, res);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;

        expect(sp.model_stats).not.toBeNull();
        expect(sp.model_stats.num_vars).toBe(5000);
        expect(sp.model_stats.by_constraint.unique_employee.count).toBe(200);
    });

    test('DIAGNOSIS 回调后 infeasibility 非空，phase=DIAGNOSING', async () => {
        const runId = await insertRun();

        const infeasibility = {
            located: true,
            groups: [{
                group: 'POSITION_MUST_FILL',
                lit_key: 'lit_fill',
                message_zh: '岗位必填冲突',
                suggestion_zh: '放宽约束',
                config_keys: [],
            }],
        };

        const [req, res] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'RUNNING',
                event: 'DIAGNOSIS',
                phase: 'DIAGNOSING',
                infeasibility,
            },
        );

        await updateSolveProgressV5(req, res);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;

        expect(sp.infeasibility).not.toBeNull();
        expect(sp.infeasibility.located).toBe(true);
        expect(sp.infeasibility.groups[0].group).toBe('POSITION_MUST_FILL');
        expect(sp.phase).toBe('DIAGNOSING');
    });

    test('纯 status/progress 回调（无 viz 字段）：V4 字段正常写入', async () => {
        const runId = await insertRun();

        const [req, res, captured] = makeReqRes(
            {},
            {
                run_id: runId,
                status: 'COMPLETED',
                progress: 100,
                message: 'Done',
            },
        );

        await updateSolveProgressV5(req, res);
        expect(captured.json?.success).toBe(true);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, solver_progress FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        expect(rows[0].status).toBe('COMPLETED');
        const sp = typeof rows[0].solver_progress === 'string'
            ? JSON.parse(rows[0].solver_progress)
            : rows[0].solver_progress;
        expect(sp.progress).toBe(100);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 套件 2：getSolveResultV5 附字段（infeasibility_analysis / objective_breakdown / viz）
// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — getSolveResultV5 附字段（§1.3-§1.5）', () => {
    // 构造带 infeasibility_analysis + objective_breakdown 的 result_summary
    const makeResult = () => ({
        status: 'OPTIMAL',
        schedules: [],
        unassigned_jobs: [],
        special_shift_assignments: [],
        special_shift_shortages: [],
        assignments: [],
        metrics: {
            objective_value: 300,
            best_bound: 300,
            gap: 0.0,
            solve_time: 10,
            fill_rate: 0.95,
            total_deviation_hours: 0,
            // §1.4 冻结路径：result.metrics.objective_breakdown
            objective_breakdown: {
                special_shortage_penalty: 0,
                vacancy_penalty: 100,
                special_impact: 50,
                hours_deviation_scaled: 30,
                special_shift_count: 20,
                night_shift_variance: 10,
                weekend_work_variance: 5,
                triple_salary_count: 0,
                leadership_penalty: 0,
                weights_applied: { special_impact: 2, hours_deviation: 1 },
            },
        },
        infeasibility_analysis: {
            is_infeasible: true,
            located: true,
            diagnosed_at: '2026-08-05T12:00:00.000Z',
            minimal_conflict_groups: [
                {
                    group: 'STANDARD_HOURS',
                    lit_key: 'lit_hours',
                    message_zh: '标准工时冲突',
                    suggestion_zh: '调整工时配置',
                    config_keys: ['standard_hours'],
                },
            ],
        },
    });

    // solver_progress with viz data
    const makeVizProgress = () => ({
        ...buildInitialSolverProgressV5(),
        phase: 'EXTRACTING',
        convergence: [
            { wall_time: 1.0, obj: 300, bound: 100, gap: 0.67, breakdown: null },
            { wall_time: 5.0, obj: 300, bound: 300, gap: 0.0, breakdown: null },
        ],
        events: [
            { wall_time: 0.5, type: 'PHASE_ENTER', phase: 'BUILDING', payload: null },
        ],
        viz_meta: { convergence_count: 2, events_count: 1 },
    });

    test('result 端点返回 infeasibility_analysis（从 result_summary 读）', async () => {
        const runId = await insertRun({
            result_summary: makeResult(),
            solver_progress: makeVizProgress(),
        });

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        expect(captured.json?.success).toBe(true);
        const data = captured.json?.data;
        expect(data).toBeDefined();

        // §1.5：infeasibility_analysis 非空
        expect(data.infeasibility_analysis).not.toBeNull();
        expect(data.infeasibility_analysis.is_infeasible).toBe(true);
        expect(data.infeasibility_analysis.located).toBe(true);
        expect(data.infeasibility_analysis.minimal_conflict_groups).toHaveLength(1);
        expect(data.infeasibility_analysis.minimal_conflict_groups[0].group).toBe('STANDARD_HOURS');
        expect(data.infeasibility_analysis.minimal_conflict_groups[0].lit_key).toBe('lit_hours');
    });

    test('result 端点返回 objective_breakdown（来自 result.metrics.objective_breakdown）', async () => {
        const runId = await insertRun({
            result_summary: makeResult(),
            solver_progress: makeVizProgress(),
        });

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        const data = captured.json?.data;
        // §1.4：objective_breakdown 来自 metrics
        expect(data.objective_breakdown).not.toBeNull();
        expect(data.objective_breakdown.vacancy_penalty).toBe(100);
        expect(data.objective_breakdown.special_shortage_penalty).toBe(0);
        expect(data.objective_breakdown.weights_applied).toBeDefined();
        expect(data.objective_breakdown.weights_applied.special_impact).toBe(2);
    });

    test('result 端点返回 viz（来自 solver_progress，含 convergence/phase/viz_meta）', async () => {
        const runId = await insertRun({
            result_summary: makeResult(),
            solver_progress: makeVizProgress(),
        });

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        const data = captured.json?.data;
        // §1.3：viz 从 solver_progress 读
        expect(data.viz).not.toBeNull();
        expect(data.viz.phase).toBe('EXTRACTING');
        expect(Array.isArray(data.viz.convergence)).toBe(true);
        expect(data.viz.convergence.length).toBe(2);
        // convergence 点含 wall_time 键（冻结契约 §1.3）
        expect(data.viz.convergence[0]).toHaveProperty('wall_time');
        expect(data.viz.convergence[0]).not.toHaveProperty('t');
        expect(data.viz.viz_meta).toMatchObject({ convergence_count: 2, events_count: 1 });
    });

    test('无 result_summary 时返回 success:false + message', async () => {
        const runId = await insertRun();  // 不设 result_summary

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        // 无 result_summary → 正常响应（非 500），message 说明未就绪
        expect(captured.json?.success).toBe(false);
    });

    test('run 不存在时返回 404', async () => {
        const [req, res, captured] = makeReqRes({ runId: '999999999' });

        await getSolveResultV5(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('无 infeasibility_analysis 时 data.infeasibility_analysis 为 null', async () => {
        const resultWithoutIA = {
            ...makeResult(),
            infeasibility_analysis: undefined,
        };
        const runId = await insertRun({
            result_summary: resultWithoutIA,
            solver_progress: makeVizProgress(),
        });

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        const data = captured.json?.data;
        expect(data.infeasibility_analysis).toBeNull();
    });

    test('无 objective_breakdown 时 data.objective_breakdown 为 null', async () => {
        const resultWithoutOB = {
            ...makeResult(),
            metrics: { objective_value: 100, solve_time: 5 },
        };
        const runId = await insertRun({
            result_summary: resultWithoutOB,
            solver_progress: makeVizProgress(),
        });

        const [req, res, captured] = makeReqRes({ runId: String(runId) });

        await getSolveResultV5(req, res);

        const data = captured.json?.data;
        expect(data.objective_breakdown).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 套件 3：SSE 透传 solver_progress（含 V5 viz + V4 字段不丢）
// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — getSolveProgressSSEV5 透传 solver_progress（V4+V5 字段不丢）', () => {
    test('SSE 初始快照含 V4 字段（status/stage/error）+ V5 viz（convergence/phase）', async () => {
        const vizProgress = {
            ...buildInitialSolverProgressV5(),
            phase: 'SOLVING',
            progress: 55,
            convergence: [
                { wall_time: 2.0, obj: 800, bound: 400, gap: 0.5, breakdown: null },
            ],
            viz_meta: { convergence_count: 1, events_count: 0 },
        };

        const runId = await insertRun({ solver_progress: vizProgress });

        // mock req/res for SSE（writeHead + write 捕获初始帧）
        let writtenFrame: any = null;
        const writtenFrames: string[] = [];
        const res: any = {
            writeHead: vi.fn(),
            write: vi.fn((chunk: string) => { writtenFrames.push(chunk); }),
            end: vi.fn(),
            on: vi.fn(),
        };
        const req: any = {
            params: { runId: String(runId) },
            on: vi.fn((event: string, cb: () => void) => {
                // 注册 close 回调但不触发
            }),
        };

        // 启动 SSE（会立即发初始帧 + 开始轮询，我们只需初始帧）
        const ssePromise = getSolveProgressSSEV5(req as Request, res as Response);

        // 等待一个 tick 让异步初始快照完成
        await new Promise(r => setTimeout(r, 50));

        // 验证至少发送了一帧
        expect(writtenFrames.length).toBeGreaterThan(0);

        // 解析第一帧
        const firstFrame = writtenFrames[0];
        expect(firstFrame).toContain('event: progress');
        const dataLine = firstFrame.split('\n').find((l: string) => l.startsWith('data:'));
        expect(dataLine).toBeDefined();
        const frameData = JSON.parse(dataLine!.replace(/^data:\s*/, ''));

        // V4 字段不丢
        expect(frameData).toHaveProperty('status');
        expect(frameData).toHaveProperty('stage');
        expect(frameData).toHaveProperty('error');
        expect(frameData).toHaveProperty('solver_progress');

        // solver_progress 含 V5 viz 字段
        const sp = typeof frameData.solver_progress === 'string'
            ? JSON.parse(frameData.solver_progress)
            : frameData.solver_progress;
        expect(sp).toHaveProperty('phase', 'SOLVING');
        expect(Array.isArray(sp.convergence)).toBe(true);
        expect(sp.convergence.length).toBe(1);
        expect(sp.convergence[0]).toHaveProperty('wall_time', 2.0);
        expect(sp.convergence[0]).not.toHaveProperty('t');

        // 清理（触发 close）
        res.end();
    });
});
