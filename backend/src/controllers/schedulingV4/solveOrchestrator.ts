/**
 * Scheduling V4 - Solve Orchestrator
 * 
 * Handles task creation and asynchronous solver triggering.
 */
import { Request, Response } from 'express';
import { DataAssemblerV4 } from '../../services/schedulingV4/DataAssemblerV4';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { SOLVER_V4_URL } from './types';
import {
    createRunRecord,
    updateRunStatus,
    updateRunSummary,
    getRunSummary,
    saveResults,
    markSolveStarted,
    isSuccessfulSolverResult,
    normalizeSpecialShiftRequirements,
    buildSpecialShiftRunSummary,
    V4_TERMINAL_STATUSES,
} from './helpers';

export const createSolveTaskV4 = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, batch_ids, config, solve_start_date, solve_end_date } = req.body;

        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        const solveRange = (solve_start_date && solve_end_date)
            ? { start_date: solve_start_date, end_date: solve_end_date }
            : undefined;

        if (solveRange) {
            if (solveRange.start_date < start_date || solveRange.end_date > end_date) {
                return res.status(400).json({ error: 'solve range must be within the full window' });
            }
            console.log(`[SchedulingV4] Interval solve requested: ${solveRange.start_date} ~ ${solveRange.end_date} within ${start_date} ~ ${end_date}`);
        }

        // L1: 把团队责任域一并存进 run(createRunRecord 内写入 summary_json.scope)
        const teamIdsForScope = Array.isArray(config?.team_ids) ? config.team_ids : [];
        const runId = await createRunRecord(start_date, end_date, batch_ids, teamIdsForScope, solveRange?.start_date, solveRange?.end_date);

        triggerSolveAsync(runId, start_date, end_date, batch_ids, config, solveRange).catch(err => {
            console.error(`[SchedulingV4] Background Task Error (Run ${runId}):`, err);
            updateRunStatus(runId, 'FAILED', err.message);
        });

        res.json({
            success: true,
            data: {
                runId,
                status: 'QUEUED',
                message: solveRange ? `V4 Interval Solve (${solveRange.start_date} ~ ${solveRange.end_date})` : 'V4 Full Solve Initiated'
            }
        });

    } catch (error: any) {
        console.error('[SchedulingV4] Create Task Failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

async function triggerSolveAsync(
    runId: number,
    startDate: string,
    endDate: string,
    batchIds: number[],
    config: any,
    solveRange?: { start_date: string; end_date: string }
) {
    try {
        await updateRunStatus(runId, 'RUNNING', null, 'ASSEMBLING');

        const teamIds = config?.team_ids || [];
        const solverRequest = await DataAssemblerV4.assemble(startDate, endDate, batchIds, teamIds, solveRange, config);

        console.log(`[SchedulingV4] Data Assembled for Run ${runId}. RequestID: ${solverRequest.request_id}`);
        console.log(`[SchedulingV4] Candidate Stats: ${solverRequest.operation_demands.length} ops, ${solverRequest.employee_profiles.length} employees`);
        // L1: assemble 后把"责任域员工集"快照补进 scope.employee_ids。
        // 必须先读出已有 scope 再展开合并(updateRunSummary 浅合并,直接给整个 scope 会覆盖 team/batch/is_global)。
        // 全域(无 team)时保持 null → apply 退回按时间窗删除(全员本就是整窗责任域)。
        const existingScope = (await getRunSummary(runId))?.scope ?? {};
        const isGlobalScope = existingScope.is_global ?? (teamIds.length === 0);
        const employeeIdsSnapshot = isGlobalScope
            ? null
            : Array.from(new Set(
                (solverRequest.employee_profiles || [])
                    .map((e: any) => Number(e.employee_id))
                    .filter((id: number) => Number.isFinite(id) && id > 0)
            ));
        // L1: 独立任务责任域——从 operation_demands 里挑出 standalone(batch_code==='STANDALONE',
        // operation_plan_id 为 -task.id)的候选任务 id 快照;全域则 null(apply 退回时间窗全删)。
        const standaloneTaskIdsSnapshot = isGlobalScope
            ? null
            : Array.from(new Set(
                (solverRequest.operation_demands || [])
                    .filter((d: any) => d?.batch_code === 'STANDALONE')
                    .map((d: any) => Math.abs(Number(d.operation_plan_id)))
                    .filter((id: number) => Number.isFinite(id) && id > 0)
            ));
        await updateRunSummary(
            runId,
            {
                scope: {
                    ...existingScope,
                    employee_ids: employeeIdsSnapshot,
                    standalone_task_ids: standaloneTaskIdsSnapshot,
                },
                // 记录本次是否启用独立任务,供结果读回路在全域 fallback 时判断(团队范围已由 standalone_task_ids 快照精确表达)
                standalone_enabled: config?.enable_standalone_tasks !== false,
                ...buildSpecialShiftRunSummary(
                    normalizeSpecialShiftRequirements(solverRequest.special_shift_requirements || []),
                ),
            },
        );

        // 求解时间上限（与 solver 内部 max_time_seconds 同源）。记录到 run 上，供历史展示 + reaper/前端判活基准。
        const maxTimeSeconds = Number(config?.max_time_seconds) > 0 ? Number(config.max_time_seconds) : 300;
        await markSolveStarted(runId, maxTimeSeconds);

        const controller = new AbortController();
        // 关键修复：中止超时从「写死 600s」改为「跟随本次求解时间上限 + 180s 缓冲」。
        // 此前 600s 与用户可设到 3600s 的求解时间互相打架：延长时间后必在 600s 处被中止/误判 FAILED。
        // 缓冲覆盖 solver 内部 max_time+10 的硬截止 + 结果抽取 + 结果回传(_push_result_summary 超时 30s)；
        // 正常情况下 solver 先自行收尾返回，此定时器永不触发，仅作为「solver 真的挂死」时的进程内兜底
        // （孤儿行另由 reaper 收尾）。须 < gunicorn --timeout(3900s) 以便后端先于 worker 干净中止。
        const abortAfterMs = (maxTimeSeconds + 180) * 1000;
        const timeoutId = setTimeout(() => controller.abort(), abortAfterMs);

        const response = await fetch(`${SOLVER_V4_URL}/api/v4/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...solverRequest,
                config: {
                    ...config,
                    ...(solverRequest.config || {}),
                    metadata: { run_id: runId }
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Solver V4 Error: ${response.statusText}`);
        }

        const result = await response.json() as { status?: string; message?: string;[key: string]: any };

        const isSuccess = isSuccessfulSolverResult(result);
        const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';
        const errorMsg = isSuccess ? null : (result.message || `Solver returned status: ${result.status}`);

        await updateRunStatus(runId, finalStatus, errorMsg, 'DONE');
        await saveResults(runId, result);

    } catch (error: any) {
        console.error(`[SchedulingV4] Run ${runId} Failed:`, error);

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status FROM scheduling_runs WHERE id = ?',
            [runId]
        );

        // 不要降级任何已到终态的行：solver 回调可能已写入 COMPLETED/FAILED，或用户已 APPLIED，
        // 或 reaper 已兜底为 FAILED。仅当仍处于非终态时才把这次失败写进去。
        if (rows.length > 0 && V4_TERMINAL_STATUSES.includes(rows[0].status)) {
            console.log(`[SchedulingV4] Run ${runId} already terminal (${rows[0].status}), skipping FAILED write.`);
        } else {
            await updateRunStatus(runId, 'FAILED', error.message, 'DONE');
        }
    }
}
