/**
 * Scheduling V4 - Stale Run Reaper
 *
 * 唯一的「带外终态写入器」。
 *
 * 背景：V4 一次求解的终态（COMPLETED/FAILED）只在两处写：后端进程内那个游离的
 * triggerSolveAsync Promise（同步 fetch 的响应 / catch），以及 solver 的同步结果回调。
 * 两者都要求「后端进程」和「这次 HTTP 往返」都活到结束。一旦后端被重启/崩溃、或 solver 进程被杀，
 * 这次终态写入就永久丢失，行卡死在 RUNNING/QUEUED/STOPPING——而系统此前没有任何对账/清扫去收尾。
 *
 * 判活依据：存活的求解每 ~5s 经 solver 心跳（solver.py 的 log_heartbeat）/进度回调写库，
 * 会刷新 updated_at（列定义 ON UPDATE CURRENT_TIMESTAMP）。进程一中断，再无任何写入，
 * updated_at 即停滞。据此把「非终态且 updated_at 已停滞超过阈值」的行兜底翻成 FAILED。
 *
 * 阈值默认 240s，远大于心跳间隔（5s）、SSE 回退轮询（5s）与常规 assemble 耗时（防止仍在装配数据的
 * 存活求解被误杀），故不会误判存活求解。仅作用于 run_code LIKE 'V4-%'，不触碰 V5/LEGACY 等其它子系统。
 */
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitter } from './types';
import { V4_TERMINAL_STATUSES } from './helpers';

const STALE_TIMEOUT_SECONDS = Number(process.env.V4_RUN_STALE_TIMEOUT_SECONDS) > 0
    ? Number(process.env.V4_RUN_STALE_TIMEOUT_SECONDS)
    : 240;

const SWEEP_INTERVAL_MS = Number(process.env.V4_RUN_REAPER_INTERVAL_MS) > 0
    ? Number(process.env.V4_RUN_REAPER_INTERVAL_MS)
    : 60 * 1000;

const STALE_ERROR_MESSAGE =
    '运行超时未响应，已由系统自动标记为失败（可能因后端或求解进程重启/中断，终态回写丢失）。';

const TERMINAL_LIST = V4_TERMINAL_STATUSES.map(() => '?').join(', ');

/**
 * 扫描并收尾孤儿运行。返回本轮被收尾的行数。
 * 幂等：再次运行不会改动已是终态的行。
 */
export async function reapStaleRuns(): Promise<number> {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM scheduling_runs
              WHERE run_code LIKE 'V4-%'
                AND status NOT IN (${TERMINAL_LIST})
                AND TIMESTAMPDIFF(SECOND, updated_at, NOW()) > ?`,
            [...V4_TERMINAL_STATUSES, STALE_TIMEOUT_SECONDS],
        );

        if (rows.length === 0) {
            return 0;
        }

        const ids = rows.map((r) => Number(r.id));
        const idPlaceholders = ids.map(() => '?').join(', ');

        await pool.execute(
            `UPDATE scheduling_runs
                SET status = 'FAILED',
                    stage = 'DONE',
                    error_message = ?,
                    completed_at = NOW()
              WHERE id IN (${idPlaceholders})
                AND status NOT IN (${TERMINAL_LIST})`,
            [STALE_ERROR_MESSAGE, ...ids, ...V4_TERMINAL_STATUSES],
        );

        for (const id of ids) {
            console.warn(`[SchedulingV4][Reaper] Run ${id} 超过 ${STALE_TIMEOUT_SECONDS}s 无写入，已自动标记 FAILED`);
            // 通知任何仍连着的 SSE 客户端立即收到终态（否则也会在 5s 回退轮询里读到）。
            progressEmitter.emit(`run:${id}`, {
                status: 'FAILED',
                stage: 'DONE',
                error: STALE_ERROR_MESSAGE,
                solver_progress: null,
            });
        }

        return ids.length;
    } catch (err) {
        console.error('[SchedulingV4][Reaper] 清扫孤儿运行失败:', err);
        return 0;
    }
}

let reaperTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动 reaper：先做一次「启动对账」（收尾上次进程存活期间残留的孤儿行），再周期性清扫。
 */
export function startStaleRunReaper(): void {
    void reapStaleRuns().then((n) => {
        if (n > 0) {
            console.log(`[SchedulingV4][Reaper] 启动对账：清理 ${n} 条孤儿运行`);
        }
    });

    if (reaperTimer) {
        clearInterval(reaperTimer);
    }
    reaperTimer = setInterval(() => {
        void reapStaleRuns();
    }, SWEEP_INTERVAL_MS);

    console.log(`[SchedulingV4][Reaper] 已启动（超时阈值 ${STALE_TIMEOUT_SECONDS}s，清扫周期 ${SWEEP_INTERVAL_MS}ms）`);
}

export function stopStaleRunReaper(): void {
    if (reaperTimer) {
        clearInterval(reaperTimer);
        reaperTimer = null;
    }
}
