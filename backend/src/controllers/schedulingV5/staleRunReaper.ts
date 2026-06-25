/**
 * Scheduling V5 - Stale Run Reaper
 *
 * 与 V4 同构的「带外终态写入器」（见 controllers/schedulingV4/staleRunReaper.ts 的完整背景）。
 * V5 此前完全没有 reaper：一旦后端进程在求解中途重启/崩溃、或 solver 进程被杀，终态回写永久丢失，
 * V5 行会卡死在 RUNNING/QUEUED/STOPPING 而无人收尾。这里补上 V5 版本。
 *
 * 判活阈值「跟随本次求解时间上限」：进入求解后阈值 = time_limit_seconds + STALE_GRACE_SECONDS(默认 180)，
 * 与 orchestrator 的中止定时器(max_time + 180 / lex 2×max_time + 180)同源——进程存活时由进程内 abort/catch
 * 先写终态，reaper 仅在「进程真的死了、终态回写丢失」时兜底。尚未进入求解(QUEUED/INIT，无 time_limit_seconds)
 * 的行回退到固定 STALE_FALLBACK_SECONDS(默认 240s)。仅作用于 run_code LIKE 'V5-%'，不触碰 V4/LEGACY。
 */
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitterV5 } from './types';
import { V5_TERMINAL_STATUSES } from './helpers';

// 兜底判活阈值（秒）：仅用于尚未进入求解、没有记录 time_limit_seconds 的行（QUEUED/INIT）。
const STALE_FALLBACK_SECONDS = Number(process.env.V5_RUN_STALE_TIMEOUT_SECONDS) > 0
    ? Number(process.env.V5_RUN_STALE_TIMEOUT_SECONDS)
    : 240;

// 进入求解后，判活阈值 = 本次 time_limit_seconds + 该缓冲。与 orchestrator 中止定时器同源。
const STALE_GRACE_SECONDS = Number(process.env.V5_RUN_STALE_GRACE_SECONDS) > 0
    ? Number(process.env.V5_RUN_STALE_GRACE_SECONDS)
    : 180;

const SWEEP_INTERVAL_MS = Number(process.env.V5_RUN_REAPER_INTERVAL_MS) > 0
    ? Number(process.env.V5_RUN_REAPER_INTERVAL_MS)
    : 60 * 1000;

const STALE_ERROR_MESSAGE =
    '运行超时未响应，已由系统自动标记为失败（可能因后端或求解进程重启/中断，终态回写丢失）。';

const TERMINAL_LIST = V5_TERMINAL_STATUSES.map(() => '?').join(', ');

/**
 * 扫描并收尾孤儿运行。返回本轮被收尾的行数。幂等：再次运行不会改动已是终态的行。
 */
export async function reapStaleRunsV5(): Promise<number> {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM scheduling_runs
              WHERE run_code LIKE 'V5-%'
                AND status NOT IN (${TERMINAL_LIST})
                AND TIMESTAMPDIFF(SECOND, updated_at, NOW()) > COALESCE(time_limit_seconds + ?, ?)`,
            [...V5_TERMINAL_STATUSES, STALE_GRACE_SECONDS, STALE_FALLBACK_SECONDS],
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
            [STALE_ERROR_MESSAGE, ...ids, ...V5_TERMINAL_STATUSES],
        );

        for (const id of ids) {
            console.warn(`[SchedulingV5][Reaper] Run ${id} 超过判活阈值(time_limit+${STALE_GRACE_SECONDS}s，无 time_limit 时兜底 ${STALE_FALLBACK_SECONDS}s)无写入，已自动标记 FAILED`);
            progressEmitterV5.emit(`run:${id}`, {
                status: 'FAILED',
                stage: 'DONE',
                error: STALE_ERROR_MESSAGE,
                solver_progress: null,
            });
        }

        return ids.length;
    } catch (err) {
        console.error('[SchedulingV5][Reaper] 清扫孤儿运行失败:', err);
        return 0;
    }
}

let reaperTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动 reaper：先做一次「启动对账」（收尾上次进程存活期间残留的孤儿行），再周期性清扫。
 */
export function startStaleRunReaperV5(): void {
    void reapStaleRunsV5().then((n) => {
        if (n > 0) {
            console.log(`[SchedulingV5][Reaper] 启动对账：清理 ${n} 条孤儿运行`);
        }
    });

    if (reaperTimer) {
        clearInterval(reaperTimer);
    }
    reaperTimer = setInterval(() => {
        void reapStaleRunsV5();
    }, SWEEP_INTERVAL_MS);

    console.log(`[SchedulingV5][Reaper] 已启动（判活阈值 time_limit+${STALE_GRACE_SECONDS}s / 兜底 ${STALE_FALLBACK_SECONDS}s，清扫周期 ${SWEEP_INTERVAL_MS}ms）`);
}

export function stopStaleRunReaperV5(): void {
    if (reaperTimer) {
        clearInterval(reaperTimer);
        reaperTimer = null;
    }
}
