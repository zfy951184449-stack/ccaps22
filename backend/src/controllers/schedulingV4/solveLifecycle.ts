/**
 * Scheduling V4 - Solve Lifecycle
 * 
 * Handles stopping, status polling, and run history listing.
 */
import { Request, Response } from 'express';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitter, SOLVER_V4_URL } from './types';
import { updateRunStatus } from './helpers';

export const stopSolveV4 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        console.log(`[SchedulingV4] User requested to STOP run ${runId}`);

        await updateRunStatus(Number(runId), 'STOPPING');

        try {
            console.log(`[SchedulingV4] Sending ABORT signal to Solver V4 for Run ${runId}...`);
            const abortRes = await fetch(`${SOLVER_V4_URL}/api/v4/abort/${runId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (abortRes.ok) {
                console.log(`[SchedulingV4] Solver V4 acknowledged abort for Run ${runId}`);
            } else {
                console.warn(`[SchedulingV4] Solver V4 abort endpoint returned ${abortRes.status}`);
            }
        } catch (netErr) {
            console.warn(`[SchedulingV4] Failed to contact Solver V4 abort endpoint: ${netErr}`);
        }

        progressEmitter.emit(`run:${runId}`, {
            status: 'STOPPING',
            message: 'Stopping initiated by user...'
        });

        res.json({ success: true, message: "Stop signal sent" });

    } catch (error: any) {
        console.error('[SchedulingV4] Stop Failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getSolveStatusV4 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, stage, error_message FROM scheduling_runs WHERE id = ?',
            [runId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Run not found" });
        }

        const run = rows[0];
        res.json({
            success: true,
            data: {
                status: run.status,
                stage: run.stage,
                error: run.error_message
            }
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const listRunsV4 = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, run_code, status, stage, window_start, window_end, solve_start, solve_end,
                    result_summary, created_at, completed_at
             FROM scheduling_runs 
             WHERE run_code LIKE 'V4-%'
             ORDER BY created_at DESC 
             LIMIT 50`
        );

        const data = rows.map(row => {
            let solverStatus = null;
            let gap = null;
            let fillRate = null;
            let solveTime = null;

            if (row.result_summary) {
                try {
                    const summary = typeof row.result_summary === 'string'
                        ? JSON.parse(row.result_summary)
                        : row.result_summary;
                    solverStatus = summary.status || null;
                    gap = summary.metrics?.gap ?? null;
                    fillRate = summary.metrics?.fill_rate ?? null;
                    solveTime = summary.metrics?.solve_time ?? null;
                } catch (e) {
                    // Ignore JSON parse errors
                }
            }

            return {
                id: row.id,
                run_code: row.run_code,
                status: row.status,
                stage: row.stage,
                solver_status: solverStatus,
                gap,
                fill_rate: fillRate,
                solve_time: solveTime,
                window_start: row.window_start,
                window_end: row.window_end,
                solve_start: row.solve_start || null,
                solve_end: row.solve_end || null,
                is_interval_solve: !!(row.solve_start && row.solve_end),
                created_at: row.created_at,
                completed_at: row.completed_at,
            };
        });

        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[SchedulingV4] List Runs Failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
