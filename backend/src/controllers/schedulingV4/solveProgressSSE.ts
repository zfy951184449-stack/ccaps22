/**
 * Scheduling V4 - SSE Progress Streaming
 * 
 * Handles real-time progress updates via Server-Sent Events and solver callbacks.
 */
import { Request, Response } from 'express';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitter } from './types';

export const getSolveProgressSSEV4 = async (req: Request, res: Response) => {
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

    const onProgressUpdate = (data: any) => {
        sendProgress(data);
        if (['COMPLETED', 'FAILED'].includes(data.status)) {
            cleanup();
        }
    };

    const eventName = `run:${runIdNum}`;
    progressEmitter.on(eventName, onProgressUpdate);

    const cleanup = () => {
        progressEmitter.off(eventName, onProgressUpdate);
        clearInterval(fallbackInterval);
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

export const updateSolveProgressV4 = async (req: Request, res: Response) => {
    try {
        const { run_id, status, progress, metrics, message, log_line, type } = req.body;

        if (!run_id) {
            return res.status(400).json({ error: 'run_id is required' });
        }

        const progressUpdate: any = {};
        if (progress !== undefined) progressUpdate.progress = progress;
        if (metrics) progressUpdate.metrics = metrics;
        if (message) progressUpdate.message = message;

        const updateParams = [status || null, JSON.stringify(progressUpdate), run_id];

        await pool.execute<any>(
            `UPDATE scheduling_runs 
            SET 
                status = COALESCE(?, status),
                solver_progress = JSON_MERGE_PATCH(COALESCE(solver_progress, '{}'), ?)
            WHERE id = ?`,
            updateParams
        );

        if (log_line) {
            await pool.execute(
                `UPDATE scheduling_runs SET solver_progress = JSON_SET(COALESCE(solver_progress, '{}'), '$.logs', JSON_ARRAY()) 
                  WHERE id = ? AND JSON_EXTRACT(solver_progress, '$.logs') IS NULL`,
                [run_id]
            );

            await pool.execute(
                `UPDATE scheduling_runs 
                  SET solver_progress = JSON_ARRAY_APPEND(solver_progress, '$.logs', ?)
                  WHERE id = ?`,
                [log_line, run_id]
            );
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, stage, error_message, solver_progress FROM scheduling_runs WHERE id = ?',
            [run_id]
        );

        if (rows.length > 0) {
            const run = rows[0];
            progressEmitter.emit(`run:${run_id}`, {
                status: run.status,
                stage: run.stage,
                error: run.error_message,
                solver_progress: run.solver_progress
            });
        }

        res.json({ success: true });

    } catch (error: any) {
        console.error('[SchedulingV4] Progress Update Failed:', error);
        res.status(500).json({ error: error.message });
    }
};
