/**
 * Scheduling V5 - SSE Progress Streaming
 *
 * Handles real-time progress updates via Server-Sent Events and solver callbacks.
 */
import { Request, Response } from 'express';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitterV5 } from './types';
import {
    buildInitialSolverProgressV5,
    appendVizEvents,
    pushConvergencePoint,
    clampVizArrays,
} from './helpers';

// 解析 DB 取回的 solver_progress（可能是字符串或已解析对象），失败回退初始结构。
const parseSolverProgress = (raw: any): any => {
    if (raw == null) {
        return buildInitialSolverProgressV5();
    }
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            return buildInitialSolverProgressV5();
        }
    }
    return raw;
};

/**
 * V5 viz 累积结构的读-改-写（11_backend §2.2）。
 * payload 含 phase/event 等 viz 字段时，单条 SELECT 读出 → JS 侧分派写入 → 裁剪 → 整体 JSON_SET 回写 viz 子树。
 * progress/metrics/status/message 仍走步骤A 的 JSON_MERGE_PATCH（与 V4 同构），本函数只动 viz 子树。
 */
const applyVizUpdate = async (runId: number | string, body: any): Promise<void> => {
    const { phase, event, model_stats, search_stats, incumbent, infeasibility, log_line } = body;

    // 是否携带任何 viz 字段（决定是否需要走读-改-写）。
    const hasViz =
        phase !== undefined ||
        event !== undefined ||
        model_stats !== undefined ||
        search_stats !== undefined ||
        incumbent !== undefined ||
        infeasibility !== undefined ||
        log_line !== undefined;

    if (!hasViz) {
        return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT solver_progress FROM scheduling_runs WHERE id = ?',
        [runId],
    );
    if (rows.length === 0) {
        return;
    }

    const current = parseSolverProgress(rows[0].solver_progress);
    // 补齐缺省的 V5 累积键（兼容历史 run 只有 {logs}）。
    const init = buildInitialSolverProgressV5();
    const sp: any = {
        ...init,
        ...current,
        viz_meta: { ...init.viz_meta, ...(current?.viz_meta || {}) },
    };

    // log_line：沿用 V4 语义追加（裁剪在 clampVizArrays 里顺带做）。
    if (log_line) {
        sp.logs = appendVizEvents(Array.isArray(sp.logs) ? sp.logs : [], log_line);
    }

    // 按 event 类型分派（11_backend §2.2 步骤2）。
    const wallTime = incumbent?.wall_time ?? (typeof body?.metrics?.wall_time === 'number' ? body.metrics.wall_time : null);

    switch (event) {
        case 'MODEL_STATS':
            if (model_stats !== undefined) sp.model_stats = model_stats;
            break;
        case 'SEARCH_STATS':
            if (search_stats !== undefined) sp.search_stats = search_stats;
            break;
        case 'PHASE_ENTER':
            if (phase !== undefined) sp.phase = phase;
            sp.events = appendVizEvents(sp.events, { wall_time: wallTime, type: 'PHASE_ENTER', phase: phase ?? sp.phase ?? null, payload: null });
            sp.viz_meta = { ...sp.viz_meta, events_count: (sp.viz_meta?.events_count || 0) + 1 };
            break;
        case 'NEW_INCUMBENT':
            if (incumbent !== undefined) {
                sp.convergence = pushConvergencePoint(sp.convergence, incumbent);
                sp.viz_meta = { ...sp.viz_meta, convergence_count: (sp.viz_meta?.convergence_count || 0) + 1 };
                sp.events = appendVizEvents(sp.events, { wall_time: incumbent?.wall_time ?? null, type: 'NEW_INCUMBENT', phase: sp.phase ?? null, payload: { obj: incumbent?.obj ?? null } });
                sp.viz_meta = { ...sp.viz_meta, events_count: (sp.viz_meta?.events_count || 0) + 1 };
            }
            break;
        case 'DIAGNOSIS':
            if (infeasibility !== undefined) sp.infeasibility = infeasibility;
            sp.phase = 'DIAGNOSING';
            sp.events = appendVizEvents(sp.events, { wall_time: wallTime, type: 'DIAGNOSIS', phase: 'DIAGNOSING', payload: null });
            sp.viz_meta = { ...sp.viz_meta, events_count: (sp.viz_meta?.events_count || 0) + 1 };
            break;
        default:
            // 无 event 但带 phase（兜底）：覆盖 phase。
            if (phase !== undefined) sp.phase = phase;
            break;
    }

    // 裁剪（有界增长）。
    const clamped = clampVizArrays(sp);

    // 步骤B：JSON_SET 只改 viz 子树，避免覆盖步骤A 刚写入的 progress/metrics。
    await pool.execute(
        `UPDATE scheduling_runs
          SET solver_progress = JSON_SET(
                COALESCE(solver_progress, '{}'),
                '$.logs', CAST(? AS JSON),
                '$.phase', ?,
                '$.model_stats', CAST(? AS JSON),
                '$.search_stats', CAST(? AS JSON),
                '$.convergence', CAST(? AS JSON),
                '$.events', CAST(? AS JSON),
                '$.infeasibility', CAST(? AS JSON),
                '$.viz_meta', CAST(? AS JSON))
          WHERE id = ?`,
        [
            JSON.stringify(clamped.logs ?? []),
            clamped.phase ?? null,
            JSON.stringify(clamped.model_stats ?? null),
            JSON.stringify(clamped.search_stats ?? null),
            JSON.stringify(clamped.convergence ?? []),
            JSON.stringify(clamped.events ?? []),
            JSON.stringify(clamped.infeasibility ?? null),
            JSON.stringify(clamped.viz_meta ?? init.viz_meta),
            runId,
        ],
    );
};

// 200ms 节流：RUNNING 状态下合并多次回调，只发最新一帧；COMPLETED/FAILED/STOPPING 等终态必发。
const THROTTLE_MS = 200;

export const getSolveProgressSSEV5 = async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runIdNum = Number(runId);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendProgress = (data: any) => {
        res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 节流状态：记录最新待发帧 + 定时器 handle。
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingData: any = null;

    const flushPending = () => {
        if (pendingData !== null) {
            sendProgress(pendingData);
            pendingData = null;
        }
        throttleTimer = null;
    };

    const sendThrottled = (data: any) => {
        const isTerminal = ['COMPLETED', 'FAILED', 'APPLIED'].includes(data.status);
        if (isTerminal) {
            // 终态立即冲刷 + 立即发送
            if (throttleTimer !== null) {
                clearTimeout(throttleTimer);
                throttleTimer = null;
            }
            pendingData = null;
            sendProgress(data);
        } else {
            // RUNNING / STOPPING → 节流合并
            pendingData = data;
            if (throttleTimer === null) {
                throttleTimer = setTimeout(flushPending, THROTTLE_MS);
            }
        }
    };

    const onProgressUpdate = (data: any) => {
        sendThrottled(data);
        if (['COMPLETED', 'FAILED'].includes(data.status)) {
            cleanup();
        }
    };

    const eventName = `run:${runIdNum}`;
    progressEmitterV5.on(eventName, onProgressUpdate);

    const cleanup = () => {
        progressEmitterV5.off(eventName, onProgressUpdate);
        clearInterval(fallbackInterval);
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        pendingData = null;
        res.end();
    };

    const fallbackInterval = setInterval(async () => {
        try {
            const [rows] = await pool.execute<RowDataPacket[]>(
                'SELECT status, stage, error_message, solver_progress FROM scheduling_runs WHERE id = ?',
                [runId]
            );

            if (rows.length === 0) {
                res.write(`event: error\ndata: {"error": "Run not found"}\n\n`);
                return cleanup();
            }

            const run = rows[0];
            sendProgress({
                status: run.status,
                stage: run.stage,
                error: run.error_message,
                solver_progress: run.solver_progress
            });

            if (['COMPLETED', 'FAILED'].includes(run.status)) {
                cleanup();
            }
        } catch (e) {
            console.error('SSE Fallback Poll Error:', e);
        }
    }, 5000);

    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, stage, error_message, solver_progress FROM scheduling_runs WHERE id = ?',
            [runId]
        );
        if (rows.length > 0) {
            const run = rows[0];
            sendProgress({
                status: run.status,
                stage: run.stage,
                error: run.error_message,
                solver_progress: run.solver_progress
            });
        }
    } catch (e) {
        console.error('SSE Initial Fetch Error:', e);
    }

    req.on('close', cleanup);
};

export const updateSolveProgressV5 = async (req: Request, res: Response) => {
    try {
        const { run_id, status, progress, metrics, message } = req.body;

        if (!run_id) {
            return res.status(400).json({ error: 'run_id is required' });
        }

        const progressUpdate: any = {};
        if (progress !== undefined) progressUpdate.progress = progress;
        if (metrics) progressUpdate.metrics = metrics;
        if (message) progressUpdate.message = message;

        const updateParams = [status || null, JSON.stringify(progressUpdate), run_id];

        // 步骤A：V4 同构的 merge（status/progress/metrics/message）。
        // 终态守卫：一旦 run 进入 COMPLETED/FAILED/APPLIED，迟到的进度帧（多为求解期攒下、monitor flush
        // 的 RUNNING 心跳）不得把状态打回 RUNNING（此前用裸 COALESCE 会「复活」已完成/已应用的 run）。
        await pool.execute<any>(
            `UPDATE scheduling_runs
            SET
                status = CASE
                    WHEN status IN ('COMPLETED', 'FAILED', 'APPLIED') THEN status
                    ELSE COALESCE(?, status)
                END,
                solver_progress = JSON_MERGE_PATCH(COALESCE(solver_progress, '{}'), ?)
            WHERE id = ?`,
            updateParams
        );

        // 步骤B：V5 viz 累积结构（phase/model_stats/search_stats/convergence/events/infeasibility）
        // + log_line，读-改-写 + 裁剪（11_backend §2.2）。仅当 payload 含 viz/log 字段时触发。
        await applyVizUpdate(run_id, req.body);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, stage, error_message, solver_progress FROM scheduling_runs WHERE id = ?',
            [run_id]
        );

        if (rows.length > 0) {
            const run = rows[0];
            progressEmitterV5.emit(`run:${run_id}`, {
                status: run.status,
                stage: run.stage,
                error: run.error_message,
                solver_progress: run.solver_progress
            });
        }

        res.json({ success: true });

    } catch (error: any) {
        console.error('[SchedulingV5] Progress Update Failed:', error);
        res.status(500).json({ error: error.message });
    }
};
