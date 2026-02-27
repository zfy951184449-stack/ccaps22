/**
 * V4 Scheduling Controller
 * 
 * Handles HTTP requests for Solver V4.
 * - Triggers solver tasks via `DataAssemblerV4`.
 * - Provides SSE endpoint for real-time progress updates.
 */

import { Request, Response } from 'express';
import { DataAssemblerV4 } from '../services/schedulingV4/DataAssemblerV4';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import { EventEmitter } from 'events';

// In-memory event emitter for real-time progress broadcasting
// This eliminates the 1-second database polling delay
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100); // Allow many concurrent SSE connections


interface EnrichedAssignment {
    operation_plan_id: number;
    operation_name: string;
    batch_code: string;
    position_number: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    planned_start: string | Date;
    planned_end: string | Date;
}

interface ResultSummaryV4 {
    metrics: {
        completion_rate: number;
        coverage_rate: number;
        satisfaction: number;
        solve_time: number;
    };
    details: {
        total_positions: number;
        assigned_positions: number;
        total_operations: number;
        covered_operations: number;
    };
    assignments: EnrichedAssignment[];
    shift_schedule: ShiftScheduleItem[] | null;  // From solver, null if not provided
    operations?: any[];
}

// Shift schedule item from solver output (reserved for future)
interface ShiftScheduleItem {
    employee_id: number;
    date: string;
    shift_id: number;
}

// V4 Solver Service URL
const SOLVER_V4_URL = process.env.SOLVER_V4_URL || 'http://localhost:5005';

export const createSolveTaskV4 = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, batch_ids, config } = req.body;

        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        // 1. Create a Run Record (DB)
        const runId = await createRunRecord(start_date, end_date, batch_ids);

        // 2. Asynchronously Trigger Assembly & Solve
        // We do not await this, so the UI gets immediate feedback
        triggerSolveAsync(runId, start_date, end_date, batch_ids, config).catch(err => {
            console.error(`[SchedulingV4] Background Task Error (Run ${runId}):`, err);
            updateRunStatus(runId, 'FAILED', err.message);
        });

        res.json({
            success: true,
            data: {
                runId,
                status: 'QUEUED',
                message: 'V4 Solve Task Initiated'
            }
        });

    } catch (error: any) {
        console.error('[SchedulingV4] Create Task Failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Background Task: Assemble Data -> Call Python Solver
 */
async function triggerSolveAsync(runId: number, startDate: string, endDate: string, batchIds: number[], config: any) {
    try {
        await updateRunStatus(runId, 'RUNNING', null, 'ASSEMBLING');

        // Extract team_ids from config if present
        const teamIds = config?.team_ids || [];

        // A. Assemble Data
        const solverRequest = await DataAssemblerV4.assemble(startDate, endDate, batchIds, teamIds);

        // Inject runId into config/payload if needed for callback correlation,
        // though V4 usually uses the URL or a specific field. 
        // We'll stick to the V4 contracts.
        // The DataAssembler generates a `request_id`, but we might want to map it to our DB `runId`.
        // Let's rely on the Python side echoing back `request_id`.

        console.log(`[SchedulingV4] Data Assembled for Run ${runId}. RequestID: ${solverRequest.request_id}`);
        console.log(`[SchedulingV4] Candidate Stats: ${solverRequest.operation_demands.length} ops, ${solverRequest.employee_profiles.length} employees`);

        // B. Call Solver
        await updateRunStatus(runId, 'RUNNING', null, 'SOLVING');

        // ⚠️ 设置超长超时时间，因为求解可能需要 5-10 分钟
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 分钟超时

        const response = await fetch(`${SOLVER_V4_URL}/api/v4/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...solverRequest,
                config: {
                    ...config, // Frontend-passed config (constraint toggles)
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

        // Note: For a long-running solve, this fetch might timeout if it waits for completion.
        // However, usually we want an async "start" and then poll or SSE.
        // IF the V4 API is synchronous-blocking (waiting for result), this is fine for short solves.
        // If V4 is async (returns "Job Started"), we handle that.
        // Assuming V4 is synchronous for now like V2/V3 simple mode, OR supports a callback.

        // Actually, for "Auto-Scheduling", we often want feedback.
        // Let's assume V4 /solve is blocking and returns the final result. 
        // (Or we use the stream endpoint).

        const result = await response.json() as { status?: string; message?: string;[key: string]: any };

        // Determine Run Status based on Solver Result
        const validStatuses = ['OPTIMAL', 'FEASIBLE', 'FEASIBLE (Forced)'];
        const isSuccess = validStatuses.includes(result.status || '');
        const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';
        const errorMsg = isSuccess ? null : (result.message || `Solver returned status: ${result.status}`);

        // C. Persist Result
        await updateRunStatus(runId, finalStatus, errorMsg, 'DONE');
        // Always save results (even if failed, we might have metrics)
        await saveResults(runId, result);

    } catch (error: any) {
        console.error(`[SchedulingV4] Run ${runId} Failed:`, error);

        // 🔧 Check if the callback already saved the result before marking as FAILED
        // This handles the case where HTTP response failed but callback succeeded
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

/**
 * SSE Endpoint for Progress
 * Uses EventEmitter for real-time updates instead of database polling
 */
export const getSolveProgressSSEV4 = async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runIdNum = Number(runId);

    // Setup SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Helper to send progress event
    const sendProgress = (data: any) => {
        res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Handler for real-time events
    const onProgressUpdate = (data: any) => {
        sendProgress(data);
        if (['COMPLETED', 'FAILED'].includes(data.status)) {
            cleanup();
        }
    };

    // Subscribe to real-time events for this run
    const eventName = `run:${runIdNum}`;
    progressEmitter.on(eventName, onProgressUpdate);

    // Cleanup function
    const cleanup = () => {
        progressEmitter.off(eventName, onProgressUpdate);
        clearInterval(fallbackInterval);
        res.end();
    };

    // Fallback: Also poll DB every 5 seconds in case events are missed
    // This is a safety net, not the primary mechanism
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
    }, 5000); // 5 seconds fallback, not 1 second

    // Initial fetch to get current state
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

/**
 * Internal API: Receive Progress Callback from Solver
 * POST /api/v4/scheduling/callback/progress
 */
export const updateSolveProgressV4 = async (req: Request, res: Response) => {
    try {
        const { run_id, status, progress, metrics, message, log_line, type } = req.body;

        if (!run_id) {
            return res.status(400).json({ error: 'run_id is required' });
        }

        // 1. Fetch current progress to append logs if needed
        // For efficiency, we might just append to a JSON array in DB, 
        // but MySQL JSON manipulation can be tricky with large logs.
        // Simplified approach: Update the entire progress JSON or append to a specific field.
        // Assuming 'solver_progress' column stores the latest snapshot + logs buffer.

        // However, for high frequency logs, updating the DB row every time is heavy.
        // But per design, we push on "Solution Found" or "Interval".

        let sql = `UPDATE scheduling_runs SET 
                   status = COALESCE(?, status), 
                   solver_progress = JSON_MERGE_PATCH(COALESCE(solver_progress, '{}'), ?) 
                   WHERE id = ?`;

        // Construct the progress object to merge
        const progressUpdate: any = {};
        if (progress !== undefined) progressUpdate.progress = progress;
        if (metrics) progressUpdate.metrics = metrics;
        if (message) progressUpdate.message = message;
        if (log_line) {
            // MySQL 5.7+ JSON_ARRAY_APPEND is safer, but JSON_MERGE_PATCH replaces arrays.
            // We'll handle logs slightly differently if possible, or just overwrite 'latest_log'.
            // Storing ALL logs in one JSON column will exceed limits.
            // Strategy: Store "latest_log" in JSON, and maybe "logs" as a truncated list if really needed for terminal.
            // For the "Terminal" effect, the frontend needs a stream of logs.
            // Since we use SSE polling the DB, we need the DB to hold the logs.
            // Be careful of size. Let's just store the LAST 50 lines or so, or just the new line?
            // Actually, usually we append.
            // Let's rely on frontend appending. We just store "latest_log_events" in DB?

            // Revising Plan:
            // To support "Streaming" feel via SSE (which polls DB):
            // We can push the new log line into a 'logs' array in the JSON.
            // But we need to clear it somehow? No, SSE sends the whole JSON?
            // If payload is big, SSE is heavy.

            // Better: Store timestamped logs in a separate table? No, too complex.
            // Simple: 'solver_progress' has a 'logs' array. We append to it. 
            // If it gets too big (>100 lines), we truncate?
            // Let's implement JSON_ARRAY_APPEND logic.
        }

        // Simpler implementation for "Snapshot" update:
        // We update 'solver_progress' with the whole object provided by Python?
        // No, Python sends incremental updates.

        // Let's use a specialized query for Logs.
        const updateParams = [status || null, JSON.stringify(progressUpdate), run_id];

        await pool.execute<any>(
            `UPDATE scheduling_runs 
            SET 
                status = COALESCE(?, status),
                solver_progress = JSON_MERGE_PATCH(COALESCE(solver_progress, '{}'), ?)
            WHERE id = ?`,
            updateParams
        );

        // Handle Logs separately to append
        if (log_line) {
            // Append to 'logs' array in the JSON
            // JSON_ARRAY_APPEND(json_doc, path, val[, path, val] ...)
            // path must exist.
            // Initialize logs array if not exists
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

        // 🔔 Emit real-time event to all connected SSE clients
        // Fetch the updated solver_progress from DB to get complete state
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

// API: Get Enriched Result for V4 Run
export const getSolveResultV4 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        // 1. Fetch Run Record & Raw Result (including solve window)
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT result_summary, target_batch_ids, window_start, window_end FROM scheduling_runs WHERE id = ?',
            [runId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Run not found" });
        }

        const run = rows[0];
        if (!run.result_summary) {
            return res.json({ success: false, message: "No result available yet" });
        }

        const rawResult = typeof run.result_summary === 'string'
            ? JSON.parse(run.result_summary)
            : run.result_summary;

        const rawAssignments: any[] = rawResult.assignments || [];

        // 2. Fetch Context Data for Enrichment
        const batchIds = typeof run.target_batch_ids === 'string'
            ? JSON.parse(run.target_batch_ids || '[]')
            : (run.target_batch_ids || []);

        // Get solve window for date filtering
        const windowStart = run.window_start;
        const windowEnd = run.window_end;

        // 2a. Fetch Operations Metadata (filtered by solve window, with share groups)
        let opMap = new Map<number, any>();
        if (batchIds.length > 0 && windowStart && windowEnd) {
            const placeholders = batchIds.map(() => '?').join(',');
            const [opRows] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    bop.id as operation_plan_id,
                    pbp.batch_code,
                    o.operation_name,
                    bop.required_people,
                    bop.planned_start_datetime,
                    bop.planned_end_datetime,
                    GROUP_CONCAT(DISTINCT bsg.id ORDER BY bsg.id) as share_group_ids,
                    MIN(bsg.group_name) as share_group_name
                FROM batch_operation_plans bop
                JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                JOIN operations o ON bop.operation_id = o.id
                LEFT JOIN batch_share_group_members bsgm ON bsgm.batch_operation_plan_id = bop.id
                LEFT JOIN batch_share_groups bsg ON bsg.id = bsgm.group_id
                WHERE pbp.id IN (${placeholders})
                  AND bop.planned_start_datetime >= ?
                  AND bop.planned_start_datetime <= DATE_ADD(?, INTERVAL 1 DAY)
                GROUP BY bop.id, pbp.batch_code, o.operation_name, bop.required_people, 
                         bop.planned_start_datetime, bop.planned_end_datetime
            `, [...batchIds, windowStart, windowEnd]);


            opRows.forEach(r => opMap.set(r.operation_plan_id, r));
        }

        // 2b. Fetch Employees (from BOTH assignments AND shift_schedule, OR from Unified schedules)
        let empIds: number[] = [];
        if (Array.isArray(rawResult.schedules)) {
            empIds = rawResult.schedules.map((s: any) => s.employee_id);
        } else {
            const empIdsFromAssignments = rawAssignments.map((a: any) => a.employee_id);
            const empIdsFromShifts = (rawResult.shift_schedule || []).map((s: any) => s.employee_id);
            empIds = [...empIdsFromAssignments, ...empIdsFromShifts];
        }
        empIds = [...new Set(empIds)];

        let empMap = new Map<number, any>();
        if (empIds.length > 0) {
            const empPlaceholders = empIds.map(() => '?').join(',');
            const [empRows] = await pool.execute<RowDataPacket[]>(`
                SELECT id, employee_name, employee_code 
                FROM employees 
                WHERE id IN (${empPlaceholders})
            `, empIds);

            empRows.forEach(r => empMap.set(r.id, r));
        }

        // 2c. Fetch Shift Definitions
        const [shiftRows] = await pool.execute<RowDataPacket[]>('SELECT id, shift_name, shift_code, nominal_hours FROM shift_definitions');
        const shiftMap = new Map<number, any>();
        shiftRows.forEach(r => shiftMap.set(r.id, r));

        // 2d. Fetch Workday Calendar for standard hours calculation
        // 标准工时 = 工作日数 × 8h（与求解器逻辑一致）
        let workdayCount = 0;
        let calendarDays: { date: string; is_workday: boolean }[] = [];
        if (windowStart && windowEnd) {
            const [calRows] = await pool.execute<RowDataPacket[]>(
                `SELECT calendar_date as date, is_workday FROM calendar_workdays 
                 WHERE calendar_date >= ? AND calendar_date <= ?
                 ORDER BY calendar_date`,
                [windowStart, windowEnd]
            );
            calendarDays = calRows.map(r => ({
                date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0],
                is_workday: Boolean(r.is_workday)
            }));
            workdayCount = calendarDays.filter(d => d.is_workday).length;
        }
        // Detect Output Format
        const hasUnifiedSchedules = Array.isArray(rawResult.schedules);

        let enrichedAssignments: EnrichedAssignment[] = [];
        let shiftPlans: any[] = [];
        const coveredOps = new Set<number>();

        if (hasUnifiedSchedules) {
            // New Format Logic
            rawResult.schedules.forEach((sched: any) => {
                const emp = empMap.get(sched.employee_id);
                // sched.shift from solver might be minimal, so we trust our DB shiftMap for details
                const shiftId = sched.shift?.shift_id;
                const shiftDef = shiftMap.get(shiftId);

                // If the solver returns a shift object, usage it, but prefer DB for hours
                const shiftName = shiftDef?.shift_name || sched.shift?.name || 'Unknown';
                const shiftCode = shiftDef?.shift_code || sched.shift?.code || '';
                const startTime = shiftDef?.start_time || sched.shift?.start || '00:00'; // DB format is HH:mm:ss usually
                const endTime = shiftDef?.end_time || sched.shift?.end || '00:00';
                const nominalHours = shiftDef?.nominal_hours ? parseFloat(shiftDef.nominal_hours) : 0;
                const isNight = !!shiftDef?.is_night_shift;

                // 1. Build Shift Plan
                const ops = sched.tasks.map((t: any) => {
                    // Enrichment for Task
                    const opMeta = opMap.get(t.operation_id); // optional extra meta
                    return {
                        operation_plan_id: t.operation_id,
                        planned_start: t.start,
                        planned_end: t.end,
                        duration_minutes: (new Date(t.end).getTime() - new Date(t.start).getTime()) / 60000,
                        operation_name: t.operation_name,
                        batch_code: t.batch_code
                    };
                });

                // Helper format time
                const formatTime = (t: string) => {
                    if (t.length >= 5) return t.substring(0, 5);
                    return t;
                };

                shiftPlans.push({
                    employee_id: sched.employee_id,
                    employee_name: emp?.employee_name || 'Unknown',
                    employee_code: emp?.employee_code || '',
                    date: sched.date,
                    shift_id: shiftId,
                    shift_name: shiftName,
                    shift_code: shiftCode,
                    start_time: formatTime(startTime),
                    end_time: formatTime(endTime),
                    shift_nominal_hours: nominalHours,
                    is_night_shift: isNight,
                    plan_type: (shiftId !== 99 && shiftId !== 0) ? 'WORK' : 'REST',
                    plan_hours: nominalHours,
                    operations: ops,
                    workshop_minutes: ops.reduce((sum: number, op: any) => sum + op.duration_minutes, 0),
                    is_overtime: false,
                    is_buffer: false
                });

                // 2. Flatten for enrichedAssignments (needed for metrics/validation)
                sched.tasks.forEach((t: any) => {
                    if (emp) {
                        // Only count assignments for operations that are in our requested window/batch scope
                        const opMeta = opMap.get(t.operation_id);
                        if (opMeta) {
                            enrichedAssignments.push({
                                operation_plan_id: t.operation_id,
                                operation_name: t.operation_name,
                                batch_code: t.batch_code,
                                position_number: t.position_number,
                                employee_id: sched.employee_id,
                                employee_name: emp.employee_name,
                                employee_code: emp.employee_code,
                                planned_start: t.start,
                                planned_end: t.end
                            });
                            coveredOps.add(t.operation_id);
                        }
                    }
                });
            });

        } else {
            // Old Format Logic (Fallback)
            rawAssignments.forEach((a: any) => {
                const op = opMap.get(a.operation_id);
                const emp = empMap.get(a.employee_id);

                if (op && emp) {
                    enrichedAssignments.push({
                        operation_plan_id: a.operation_id,
                        operation_name: op.operation_name,
                        batch_code: op.batch_code,
                        position_number: a.position_number,
                        employee_id: a.employee_id,
                        employee_name: emp.employee_name,
                        employee_code: emp.employee_code,
                        planned_start: op.planned_start_datetime,
                        planned_end: op.planned_end_datetime
                    });
                    coveredOps.add(a.operation_id);
                }
            });

            // Flatten logic for Shift Plans (Old style)
            const empDateOpsMap = new Map<string, any[]>();
            enrichedAssignments.forEach(assign => {
                const formatDate = (dateStr: string | Date) => {
                    const d = new Date(dateStr);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };
                const dateKey = `${assign.employee_id}_${formatDate(assign.planned_start)}`;
                if (!empDateOpsMap.has(dateKey)) {
                    empDateOpsMap.set(dateKey, []);
                }
                empDateOpsMap.get(dateKey)!.push({
                    operation_plan_id: assign.operation_plan_id,
                    planned_start: assign.planned_start,
                    planned_end: assign.planned_end,
                    duration_minutes: (new Date(assign.planned_end).getTime() - new Date(assign.planned_start).getTime()) / 60000,
                    operation_name: assign.operation_name
                });
            });

            if (rawResult.shift_schedule) {
                rawResult.shift_schedule.forEach((s: any) => {
                    const emp = empMap.get(s.employee_id);
                    const shift = shiftMap.get(s.shift_id);
                    const dateKey = `${s.employee_id}_${s.date}`;
                    const ops = empDateOpsMap.get(dateKey) || [];

                    shiftPlans.push({
                        employee_id: s.employee_id,
                        employee_name: emp?.employee_name || 'Unknown',
                        employee_code: emp?.employee_code || '',
                        date: s.date,
                        shift_id: s.shift_id,
                        shift_name: shift?.shift_name || 'Unknown',
                        shift_code: shift?.shift_code || '',
                        start_time: shift?.start_time || '00:00',
                        end_time: shift?.end_time || '00:00',
                        shift_nominal_hours: shift?.nominal_hours || 0,
                        is_night_shift: shift?.is_night_shift || false,
                        plan_type: s.shift_id ? 'WORK' : 'REST',
                        plan_hours: shift?.nominal_hours || 0,
                        operations: ops,
                        workshop_minutes: ops.reduce((sum: number, op: any) => sum + op.duration_minutes, 0),
                        is_overtime: false,
                        is_buffer: false
                    });
                });
            }
        }

        // --- Common Logic: Metrics & Operations Map ---

        // Metrics Calculation
        const totalOpsCount = opMap.size;
        const totalPositionsCount = Array.from(opMap.values()).reduce((sum, Op) => sum + (Op.required_people || 1), 0);
        const assignedCount = enrichedAssignments.length;

        // Build Operations array for frontend grouping
        const operationsMap = new Map<number, any>();

        opMap.forEach((op, opId) => {
            operationsMap.set(opId, {
                operation_plan_id: opId,
                batch_code: op.batch_code,
                operation_name: op.operation_name,
                planned_start: op.planned_start_datetime,
                planned_end: op.planned_end_datetime,
                required_people: op.required_people,
                share_group_ids: op.share_group_ids || null,
                share_group_name: op.share_group_name || null,
                positions: []
            });

            // Initialize positions
            for (let i = 1; i <= (op.required_people || 1); i++) {
                operationsMap.get(opId).positions.push({
                    position_number: i,
                    employee: null,
                    status: 'UNASSIGNED'
                });
            }
        });

        // Fill in assigned employees
        enrichedAssignments.forEach(a => {
            const opEntry = operationsMap.get(a.operation_plan_id);
            if (opEntry) {
                const pos = opEntry.positions.find((p: any) => p.position_number === a.position_number);
                if (pos) {
                    pos.employee = {
                        id: a.employee_id,
                        name: a.employee_name,
                        code: a.employee_code
                    };
                    pos.status = 'ASSIGNED';
                }
            }
        });

        // Calculate operation-level status
        operationsMap.forEach(op => {
            const totalPos = op.positions.length;
            const assignedPos = op.positions.filter((p: any) => p.status === 'ASSIGNED').length;
            op.status = assignedPos === totalPos ? 'COMPLETE' : (assignedPos > 0 ? 'PARTIAL' : 'UNASSIGNED');
        });

        const response: ResultSummaryV4 = {
            metrics: {
                completion_rate: totalPositionsCount > 0 ? Math.round((assignedCount / totalPositionsCount) * 100) : 0,
                coverage_rate: totalOpsCount > 0 ? Math.round((coveredOps.size / totalOpsCount) * 100) : 0,
                satisfaction: 100,
                solve_time: rawResult.metrics?.solve_time || 0
            },
            details: {
                total_positions: totalPositionsCount,
                assigned_positions: assignedCount,
                total_operations: totalOpsCount,
                covered_operations: coveredOps.size
            },
            assignments: enrichedAssignments,
            shift_plans: shiftPlans,
            shift_assignments: shiftPlans.map((sp: any) => ({
                employee_id: sp.employee_id,
                employee_name: sp.employee_name,
                employee_code: sp.employee_code,
                date: sp.date,
                shift_id: sp.shift_id,
                shift_name: sp.shift_name,
                shift_code: sp.shift_code,
                start_time: sp.start_time || '00:00',
                end_time: sp.end_time || '00:00',
                nominal_hours: sp.shift_nominal_hours
            })),
            operations: Array.from(operationsMap.values()),
            // 日历数据（用于前端计算标准工时和连续天数）
            calendar_days: calendarDays,
            workday_count: workdayCount,
            standard_hours: workdayCount * 8  // 标准工时 = 工作日数 × 8h
        } as any;

        res.json({ success: true, data: response });

    } catch (error: any) {
        console.error('[SchedulingV4] Get Result Failed:', error);
        res.status(500).json({ error: error.message });
    }
}

// --- Helpers ---

async function createRunRecord(start: string, end: string, batchIds: number[]) {
    const runCode = `V4-${Date.now()}`;
    const [res] = await pool.execute<any>(
        `INSERT INTO scheduling_runs (run_code, run_key, status, stage, window_start, window_end, period_start, period_end, target_batch_ids, solver_progress, created_at)
         VALUES (?, ?, 'QUEUED', 'INIT', ?, ?, ?, ?, ?, '{"logs": []}', NOW())`,
        [runCode, runCode, start, end, start, end, JSON.stringify(batchIds)]
    );
    return res.insertId;
}

async function updateRunStatus(runId: number, status: string, error?: string | null, stage?: string) {
    let sql = 'UPDATE scheduling_runs SET status = ?';
    const params: any[] = [status];

    if (error !== undefined) {
        sql += ', error_message = ?';
        params.push(error);
    }
    if (stage) {
        sql += ', stage = ?';
        params.push(stage);
    }

    sql += ' WHERE id = ?';
    params.push(runId);

    await pool.execute(sql, params);
}

async function saveResults(runId: number, result: any) {
    try {
        // Placeholder for result saving logic specific to V4 structure
        if (result.assignments) {
            // ... save assignments ...
        }

        // For now, just mark as complete
        await pool.execute('UPDATE scheduling_runs SET result_summary = ? WHERE id = ?', [JSON.stringify(result), runId]);
    } catch (error) {
        console.error(`[SchedulingV4] Failed to save results for Run ${runId}:`, error);
        // Don't re-throw, to avoid marking the whole run as FAILED if just saving summary failed?
        // Actually we SHOULD mark as FAILED if results aren't saved.
        throw error;
    }
}

/**
 * Internal API: Receive Final Result from Solver Callback
 * POST /api/v4/scheduling/callback/result
 * 
 * This endpoint receives the complete solve result from the solver callback,
 * ensuring results are saved even if the main HTTP response fails.
 */
export const receiveSolveResultV4 = async (req: Request, res: Response) => {
    try {
        const { run_id, result } = req.body;

        if (!run_id || !result) {
            return res.status(400).json({ error: 'run_id and result are required' });
        }

        console.log(`[SchedulingV4] Received final result via callback for Run ${run_id}`);

        // Determine final status
        const validStatuses = ['OPTIMAL', 'FEASIBLE', 'FEASIBLE (Forced)'];
        const isSuccess = validStatuses.includes(result.status);
        const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';
        const errorMsg = isSuccess ? null : (result.message || `Solver returned status: ${result.status}`);

        // Save result_summary and update status
        await pool.execute<any>(
            `UPDATE scheduling_runs 
             SET status = ?, 
                 stage = 'DONE',
                 error_message = ?,
                 result_summary = ?
             WHERE id = ?`,
            [finalStatus, errorMsg, JSON.stringify(result), run_id]
        );

        console.log(`[SchedulingV4] Run ${run_id} updated to ${finalStatus} via callback`);

        // Emit SSE event 
        progressEmitter.emit(`run:${run_id}`, {
            status: finalStatus,
            stage: 'DONE',
            error: errorMsg,
            solver_progress: null // Full result is now in result_summary
        });

        res.json({ success: true });

    } catch (error: any) {
        console.error('[SchedulingV4] Receive Result Failed:', error);
        res.status(500).json({ error: error.message });
    }
};


// API: Stop Solver
export const stopSolveV4 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        console.log(`[SchedulingV4] User requested to STOP run ${runId}`);

        // 1. Update Status to STOPPING (DB)
        await updateRunStatus(Number(runId), 'STOPPING');

        // 2. [NEW] Call Solver V4 Abort API directly for immediate interrupt
        // This bypasses the polling delay in Python
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
            // Non-fatal, fallback to DB polling
        }

        // 3. Emit event so UI updates immediately
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

// API: Get Status (Optimized for polling)
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
        // Minimal logging for high-freq polling
        res.status(500).json({ error: error.message });
    }
};

/**
 * API: Apply Solver Result to Production Tables
 * POST /api/v4/scheduling/runs/:runId/apply
 * 
 * Persists the solver result to:
 * - batch_personnel_assignments (for DailyAssignmentsPanel)
 * - employee_shift_plans (for PersonnelCalendar)
 */
export const applySolveResultV4 = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        const { runId } = req.params;
        const runIdNum = Number(runId);

        console.log(`[SchedulingV4] Applying result for Run ${runId}...`);

        // 1. Fetch Run Record & Raw Result
        const [runRows] = await connection.execute<RowDataPacket[]>(
            'SELECT result_summary, window_start, window_end, status FROM scheduling_runs WHERE id = ?',
            [runId]
        );

        if (runRows.length === 0) {
            return res.status(404).json({ error: 'Run not found' });
        }

        const run = runRows[0];

        if (run.status === 'APPLIED') {
            return res.status(400).json({ error: 'Result already applied' });
        }

        if (!run.result_summary) {
            return res.status(400).json({ error: 'No result available to apply' });
        }

        const rawResult = typeof run.result_summary === 'string'
            ? JSON.parse(run.result_summary)
            : run.result_summary;

        const assignments: { operation_id: number; position_number: number; employee_id: number }[] = rawResult.assignments || [];
        const shiftSchedule: { employee_id: number; date: string; shift_id: number }[] = rawResult.shift_schedule || [];

        const windowStart = run.window_start;
        const windowEnd = run.window_end;

        await connection.beginTransaction();

        // 2. Cleanup: Delete existing assignments for operations in this time window
        if (windowStart && windowEnd) {
            await connection.execute(
                `DELETE bpa FROM batch_personnel_assignments bpa
                 JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
                 WHERE bop.planned_start_datetime >= ? AND bop.planned_start_datetime < DATE_ADD(?, INTERVAL 1 DAY)
                   AND bpa.scheduling_run_id IS NOT NULL`,
                [windowStart, windowEnd]
            );
            console.log(`[SchedulingV4] Cleaned up old assignments in window ${windowStart} ~ ${windowEnd}`);

            // Cleanup: Delete auto-generated shift plans in this window
            await connection.execute(
                `DELETE FROM employee_shift_plans 
                 WHERE plan_date >= ? AND plan_date <= ?
                   AND is_generated = 1`,
                [windowStart, windowEnd]
            );
            console.log(`[SchedulingV4] Cleaned up old shift plans in window ${windowStart} ~ ${windowEnd}`);
        }

        // 3. Insert new assignments to batch_personnel_assignments
        let assignmentsInserted = 0;
        for (const assignment of assignments) {
            try {
                await connection.execute(
                    `INSERT INTO batch_personnel_assignments 
                        (batch_operation_plan_id, employee_id, position_number, role, assignment_status, scheduling_run_id)
                     VALUES (?, ?, ?, 'OPERATOR', 'PLANNED', ?)
                     ON DUPLICATE KEY UPDATE
                        employee_id = VALUES(employee_id),
                        assignment_status = 'PLANNED',
                        scheduling_run_id = VALUES(scheduling_run_id)`,
                    [assignment.operation_id, assignment.employee_id, assignment.position_number, runIdNum]
                );
                assignmentsInserted++;
            } catch (err: any) {
                console.warn(`[SchedulingV4] Failed to insert assignment: Op ${assignment.operation_id} Pos ${assignment.position_number} -> Emp ${assignment.employee_id}: ${err.message}`);
            }
        }

        // 4. Insert new shift plans to employee_shift_plans
        // First, build shift_id -> shift_code mapping for plan_category detection
        const [shiftDefRows] = await connection.execute<RowDataPacket[]>(
            'SELECT id, shift_code, nominal_hours FROM shift_definitions WHERE is_active = 1'
        );
        const shiftMap = new Map<number, { code: string; hours: number }>();
        shiftDefRows.forEach(r => shiftMap.set(r.id, { code: r.shift_code, hours: r.nominal_hours }));

        let shiftPlansInserted = 0;
        for (const plan of shiftSchedule) {
            try {
                const shiftInfo = shiftMap.get(plan.shift_id);
                const planCategory = 'BASE'; // Default to BASE, can be enhanced later
                const planHours = shiftInfo?.hours || 8;

                await connection.execute(
                    `INSERT INTO employee_shift_plans 
                        (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, scheduling_run_id, is_generated)
                     VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, 1)
                     ON DUPLICATE KEY UPDATE
                        shift_id = VALUES(shift_id),
                        plan_category = VALUES(plan_category),
                        plan_hours = VALUES(plan_hours),
                        scheduling_run_id = VALUES(scheduling_run_id),
                        updated_at = NOW()`,
                    [plan.employee_id, plan.date, plan.shift_id, planCategory, planHours, runIdNum]
                );
                shiftPlansInserted++;
            } catch (err: any) {
                console.warn(`[SchedulingV4] Failed to insert shift plan: Emp ${plan.employee_id} ${plan.date} -> Shift ${plan.shift_id}: ${err.message}`);
            }
        }

        // 5. Update run status to APPLIED
        await connection.execute(
            'UPDATE scheduling_runs SET status = ? WHERE id = ?',
            ['APPLIED', runIdNum]
        );

        await connection.commit();

        console.log(`[SchedulingV4] Applied result for Run ${runId}: ${assignmentsInserted} assignments, ${shiftPlansInserted} shift plans`);

        res.json({
            success: true,
            data: {
                assignments_inserted: assignmentsInserted,
                shift_plans_inserted: shiftPlansInserted
            }
        });

    } catch (error: any) {
        await connection.rollback();
        console.error('[SchedulingV4] Apply Result Failed:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// NOTE: deriveShiftAssignments removed - shift_schedule now comes directly from solver output

