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
    isSuccessfulSolverResult,
    normalizeSpecialShiftRequirements,
    buildSpecialShiftRunSummary,
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
                ...buildSpecialShiftRunSummary(
                    normalizeSpecialShiftRequirements(solverRequest.special_shift_requirements || []),
                ),
            },
        );

        await updateRunStatus(runId, 'RUNNING', null, 'SOLVING');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

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
            'SELECT status, result_summary FROM scheduling_runs WHERE id = ?',
            [runId]
        );

        if (rows.length > 0 && rows[0].status === 'COMPLETED' && rows[0].result_summary) {
            console.log(`[SchedulingV4] Run ${runId} already marked COMPLETED by callback, skipping FAILED status.`);
        } else {
            await updateRunStatus(runId, 'FAILED', error.message);
        }
    }
}
