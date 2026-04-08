/**
 * V4 Scheduling Controller
 * 
 * Handles HTTP requests for Solver V4.
 * - Triggers solver tasks via `DataAssemblerV4`.
 * - Provides SSE endpoint for real-time progress updates.
 */

import { Request, Response } from 'express';
import { DataAssemblerV4 } from '../services/schedulingV4/DataAssemblerV4';
import ShiftPlanLinkService from '../services/shiftPlanLinkService';
import SpecialShiftWindowService from '../services/specialShiftWindowService';
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
        special_shift_requirement_count?: number;
        special_shift_occurrence_count?: number;
        special_shift_required_headcount_total?: number;
        special_shift_assigned_headcount_total?: number;
        special_shift_shortage_total?: number;
        special_shift_unmet_occurrence_count?: number;
        special_shift_partial_occurrence_count?: number;
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
    special_shift_assignments?: SpecialShiftSolverAssignment[];
    special_shift_shortages?: SpecialShiftSolverShortage[];
}

// Shift schedule item from solver output (reserved for future)
interface ShiftScheduleItem {
    employee_id: number;
    date: string;
    shift_id: number;
}

interface FlattenedAssignment {
    operation_id: number;
    position_number: number;
    employee_id: number;
    is_standalone: boolean;
    date?: string;
    shift_id?: number;
}

type ShiftPlanCategory = 'BASE' | 'PRODUCTION' | 'OVERTIME' | 'REST';

interface SpecialShiftRunRequirement {
    occurrence_id: number;
    window_id: number;
    window_code?: string;
    date: string;
    shift_id: number;
    required_people: number;
    eligible_employee_ids: number[];
    fulfillment_mode: 'HARD' | 'SOFT';
    priority_level: 'CRITICAL' | 'HIGH' | 'NORMAL';
    candidates?: Array<{
        employee_id: number;
        impact_cost: number;
    }>;
    plan_category: 'BASE' | 'OVERTIME';
    lock_after_apply?: boolean;
}

interface SpecialShiftSolverAssignment {
    occurrence_id: number;
    employee_id: number;
    date: string;
    shift_id: number;
}

interface SpecialShiftSolverShortage {
    occurrence_id: number;
    shortage_people: number;
}

interface ShiftDefinitionInfo {
    code: string;
    hours: number;
    category: string;
}

// V4 Solver Service URL
const SOLVER_V4_URL = process.env.SOLVER_V4_URL || 'http://localhost:5005';

const buildStoredResult = (result: any) => {
    const schedules = Array.isArray(result?.schedules) ? result.schedules : [];
    const assignedTasks = schedules.reduce((total: number, schedule: any) => total + (schedule.tasks?.length || 0), 0);
    const unassignedJobs = Array.isArray(result?.unassigned_jobs) ? result.unassigned_jobs.length : 0;

    return {
        ...result,
        summary: {
            status: result?.status || 'UNKNOWN',
            scheduled_shifts: schedules.length,
            assigned_tasks: assignedTasks,
            unassigned_jobs: unassignedJobs,
            fill_rate: result?.metrics?.fill_rate ?? null,
            saved_at: new Date().toISOString()
        }
    };
};

const buildShiftKey = (employeeId: number, date: string, shiftId?: number) =>
    `${employeeId}:${date}:${shiftId ?? 'none'}`;

const buildAssignmentKey = (operationId: number, positionNumber: number) =>
    `${operationId}:${positionNumber}`;

const isSuccessfulSolverResult = (result: any) => ['OPTIMAL', 'FEASIBLE', 'FEASIBLE (Forced)'].includes(result?.status || '');

const normalizeSpecialShiftRequirements = (value: unknown): SpecialShiftRunRequirement[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item: any) => {
            const planCategory: 'BASE' | 'OVERTIME' =
                String(item?.plan_category || 'BASE') === 'OVERTIME' ? 'OVERTIME' : 'BASE';
            const fulfillmentMode: 'HARD' | 'SOFT' =
                String(item?.fulfillment_mode || 'HARD').toUpperCase() === 'SOFT' ? 'SOFT' : 'HARD';
            const priorityLevel: 'CRITICAL' | 'HIGH' | 'NORMAL' =
                String(item?.priority_level || 'HIGH').toUpperCase() === 'CRITICAL'
                    ? 'CRITICAL'
                    : (String(item?.priority_level || 'HIGH').toUpperCase() === 'NORMAL' ? 'NORMAL' : 'HIGH');

            return {
                occurrence_id: Number(item?.occurrence_id),
                window_id: Number(item?.window_id),
                window_code: item?.window_code ? String(item.window_code) : undefined,
                date: String(item?.date || ''),
                shift_id: Number(item?.shift_id),
                required_people: Number(item?.required_people),
                eligible_employee_ids: Array.isArray(item?.eligible_employee_ids)
                    ? item.eligible_employee_ids.map((employeeId: unknown) => Number(employeeId)).filter((employeeId: number) => Number.isFinite(employeeId) && employeeId > 0)
                    : [],
                fulfillment_mode: fulfillmentMode,
                priority_level: priorityLevel,
                candidates: Array.isArray(item?.candidates)
                    ? item.candidates
                        .map((candidate: any) => ({
                            employee_id: Number(candidate?.employee_id),
                            impact_cost: Number(candidate?.impact_cost || 0),
                        }))
                        .filter((candidate: { employee_id: number; impact_cost: number }) => Number.isFinite(candidate.employee_id) && candidate.employee_id > 0)
                    : [],
                plan_category: planCategory,
                lock_after_apply: item?.lock_after_apply !== undefined ? Boolean(item.lock_after_apply) : true,
            };
        })
        .filter((item) =>
            Number.isFinite(item.occurrence_id) &&
            item.occurrence_id > 0 &&
            Number.isFinite(item.window_id) &&
            item.window_id > 0 &&
            item.date &&
            Number.isFinite(item.shift_id) &&
            item.shift_id > 0 &&
            Number.isFinite(item.required_people) &&
            item.required_people > 0,
        );
};

const buildSpecialShiftRunSummary = (requirements: SpecialShiftRunRequirement[]) => ({
    special_shift_requirement_count: requirements.length,
    special_shift_occurrence_count: requirements.length,
    special_shift_required_headcount_total: requirements.reduce((sum, requirement) => sum + requirement.required_people, 0),
    special_shift_assigned_headcount_total: 0,
    special_shift_shortage_total: 0,
    special_shift_unmet_occurrence_count: 0,
    special_shift_partial_occurrence_count: 0,
    special_shift_requirements: requirements,
    special_shift_assignments: [],
    special_shift_shortages: [],
});

const normalizeSpecialShiftAssignments = (value: unknown): SpecialShiftSolverAssignment[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item: any) => ({
            occurrence_id: Number(item?.occurrence_id),
            employee_id: Number(item?.employee_id),
            date: String(item?.date || ''),
            shift_id: Number(item?.shift_id),
        }))
        .filter((item) =>
            Number.isFinite(item.occurrence_id) &&
            item.occurrence_id > 0 &&
            Number.isFinite(item.employee_id) &&
            item.employee_id > 0 &&
            item.date &&
            Number.isFinite(item.shift_id) &&
            item.shift_id > 0,
        );
};

const normalizeSpecialShiftShortages = (value: unknown): SpecialShiftSolverShortage[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item: any) => ({
            occurrence_id: Number(item?.occurrence_id),
            shortage_people: Number(item?.shortage_people || 0),
        }))
        .filter((item) =>
            Number.isFinite(item.occurrence_id) &&
            item.occurrence_id > 0 &&
            Number.isFinite(item.shortage_people) &&
            item.shortage_people > 0,
        );
};

const parseRunSummary = (summary: any) => {
    if (!summary) {
        return {};
    }
    if (typeof summary === 'string') {
        try {
            return JSON.parse(summary);
        } catch (error) {
            return {};
        }
    }
    return summary;
};

const updateRunSummary = async (runId: number, patch: Record<string, any>) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT summary_json FROM scheduling_runs WHERE id = ?',
        [runId],
    );
    const current = rows.length > 0 ? parseRunSummary(rows[0].summary_json) : {};
    const nextSummary = {
        ...current,
        ...patch,
    };
    await pool.execute(
        'UPDATE scheduling_runs SET summary_json = ? WHERE id = ?',
        [JSON.stringify(nextSummary), runId],
    );
};

const markSpecialShiftOccurrencesScheduled = async (runId: number) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT summary_json FROM scheduling_runs WHERE id = ?',
        [runId],
    );
    if (!rows.length) {
        return;
    }

    const summary = parseRunSummary(rows[0].summary_json);
    const specialShiftRequirements = normalizeSpecialShiftRequirements(summary.special_shift_requirements);
    const occurrenceIds = Array.from(new Set(specialShiftRequirements.map((requirement) => requirement.occurrence_id)));
    if (!occurrenceIds.length) {
        return;
    }

    await SpecialShiftWindowService.markOccurrencesScheduled(runId, occurrenceIds);
};

const derivePlanCategory = (
    shiftInfo: ShiftDefinitionInfo | undefined,
    hasAssignedTasks: boolean
): ShiftPlanCategory => {
    const normalizedCategory = shiftInfo?.category?.toUpperCase();

    if (normalizedCategory === 'REST' || shiftInfo?.code === 'REST' || (shiftInfo?.hours ?? 0) <= 0) {
        return 'REST';
    }

    if (normalizedCategory === 'OVERTIME') {
        return 'OVERTIME';
    }

    return hasAssignedTasks ? 'PRODUCTION' : 'BASE';
};

const applySpecialShiftCoverage = async (
    connection: any,
    runId: number,
    requirements: SpecialShiftRunRequirement[],
    solverAssignments: SpecialShiftSolverAssignment[],
    solverShortages: SpecialShiftSolverShortage[],
    shiftPlanIdByShiftKey: Map<string, number>,
) => {
    if (!requirements.length) {
        return {
            assignmentsInserted: 0,
            lockedShiftPlans: 0,
            shortageTotal: 0,
            partialOccurrences: 0,
        };
    }

    const occurrenceIds = Array.from(new Set(requirements.map((requirement) => requirement.occurrence_id)));
    const placeholders = occurrenceIds.map(() => '?').join(',');
    await connection.execute(
        `DELETE FROM special_shift_occurrence_assignments WHERE occurrence_id IN (${placeholders})`,
        occurrenceIds,
    );

    const assignmentsByOccurrence = new Map<number, SpecialShiftSolverAssignment[]>();
    solverAssignments.forEach((assignment) => {
        if (!assignmentsByOccurrence.has(assignment.occurrence_id)) {
            assignmentsByOccurrence.set(assignment.occurrence_id, []);
        }
        assignmentsByOccurrence.get(assignment.occurrence_id)!.push(assignment);
    });
    const shortageByOccurrence = new Map<number, number>();
    solverShortages.forEach((shortage) => {
        shortageByOccurrence.set(shortage.occurrence_id, shortage.shortage_people);
    });

    let assignmentsInserted = 0;
    let lockedShiftPlans = 0;
    let shortageTotal = 0;
    let partialOccurrences = 0;

    for (const requirement of requirements) {
        const shortagePeople = shortageByOccurrence.get(requirement.occurrence_id) || 0;
        shortageTotal += shortagePeople;

        if (requirement.fulfillment_mode === 'HARD' && shortagePeople > 0) {
            throw new Error(
                `Special shift occurrence ${requirement.occurrence_id} 为 HARD 规则，不能存在 ${shortagePeople} 人欠配`,
            );
        }

        const eligibleSet = new Set(requirement.eligible_employee_ids);
        const selectedAssignments = (assignmentsByOccurrence.get(requirement.occurrence_id) || [])
            .filter((assignment) =>
                eligibleSet.has(assignment.employee_id) &&
                assignment.date === requirement.date &&
                assignment.shift_id === requirement.shift_id,
            )
            .sort((a, b) => a.employee_id - b.employee_id)
            .map((assignment) => {
                const shiftPlanId = shiftPlanIdByShiftKey.get(
                    buildShiftKey(assignment.employee_id, assignment.date, assignment.shift_id),
                );
                return shiftPlanId
                    ? { employeeId: assignment.employee_id, shiftPlanId }
                    : null;
            })
            .filter((assignment): assignment is { employeeId: number; shiftPlanId: number } => Boolean(assignment));

        const expectedAssignedCount = requirement.required_people - shortagePeople;
        if (selectedAssignments.length !== expectedAssignedCount) {
            throw new Error(
                `Special shift occurrence ${requirement.occurrence_id} 命中人数与 shortage 不一致: 期望 ${expectedAssignedCount}, 实际 ${selectedAssignments.length}`,
            );
        }

        for (const [index, assignment] of selectedAssignments.entries()) {
            await connection.execute(
                `
                    INSERT INTO special_shift_occurrence_assignments
                      (
                        occurrence_id,
                        position_number,
                        employee_id,
                        shift_plan_id,
                        scheduling_run_id,
                        assignment_status,
                        is_locked
                      )
                    VALUES (?, ?, ?, ?, ?, 'PLANNED', ?)
                    ON DUPLICATE KEY UPDATE
                      shift_plan_id = VALUES(shift_plan_id),
                      scheduling_run_id = VALUES(scheduling_run_id),
                      assignment_status = VALUES(assignment_status),
                      is_locked = VALUES(is_locked),
                      assigned_at = NOW()
                `,
                [
                    requirement.occurrence_id,
                    index + 1,
                    assignment.employeeId,
                    assignment.shiftPlanId,
                    runId,
                    requirement.lock_after_apply ? 1 : 0,
                ],
            );
            assignmentsInserted++;
        }

        const shiftPlanIds = selectedAssignments.map((assignment) => assignment.shiftPlanId);
        const shiftPlanPlaceholders = shiftPlanIds.map(() => '?').join(',');

        if (shiftPlanIds.length > 0 && requirement.plan_category === 'OVERTIME') {
            await connection.execute(
                `UPDATE employee_shift_plans
                 SET plan_category = 'OVERTIME'
                 WHERE id IN (${shiftPlanPlaceholders})`,
                shiftPlanIds,
            );
        }

        if (shiftPlanIds.length > 0 && requirement.lock_after_apply) {
            await connection.execute(
                `UPDATE employee_shift_plans
                 SET plan_state = 'LOCKED',
                     is_locked = 1,
                     locked_at = NOW(),
                     lock_reason = CASE
                       WHEN lock_reason IS NULL OR lock_reason = '' THEN ?
                       ELSE lock_reason
                     END
                 WHERE id IN (${shiftPlanPlaceholders})`,
                [`SPECIAL_SHIFT_WINDOW:${requirement.window_id}`, ...shiftPlanIds],
            );
            lockedShiftPlans += shiftPlanIds.length;
        }

        const nextStatus = shortagePeople > 0 ? 'PARTIAL' : 'APPLIED';
        if (nextStatus === 'PARTIAL') {
            partialOccurrences += 1;
        }
        await connection.execute(
            `
                UPDATE special_shift_occurrences
                SET status = ?,
                    scheduling_run_id = ?
                WHERE id = ?
            `,
            [nextStatus, runId, requirement.occurrence_id],
        );
    }

    return {
        assignmentsInserted,
        lockedShiftPlans,
        shortageTotal,
        partialOccurrences,
    };
};

export const createSolveTaskV4 = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, batch_ids, config, solve_start_date, solve_end_date } = req.body;

        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        // Validate solve range if provided
        const solveRange = (solve_start_date && solve_end_date)
            ? { start_date: solve_start_date, end_date: solve_end_date }
            : undefined;

        if (solveRange) {
            if (solveRange.start_date < start_date || solveRange.end_date > end_date) {
                return res.status(400).json({ error: 'solve range must be within the full window' });
            }
            console.log(`[SchedulingV4] Interval solve requested: ${solveRange.start_date} ~ ${solveRange.end_date} within ${start_date} ~ ${end_date}`);
        }

        // 1. Create a Run Record (DB)
        const runId = await createRunRecord(start_date, end_date, batch_ids, solveRange?.start_date, solveRange?.end_date);

        // 2. Asynchronously Trigger Assembly & Solve
        // We do not await this, so the UI gets immediate feedback
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

/**
 * Background Task: Assemble Data -> Call Python Solver
 */
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

        // Extract team_ids from config if present
        const teamIds = config?.team_ids || [];

        // A. Assemble Data (with optional solve range for interval solving)
        const solverRequest = await DataAssemblerV4.assemble(startDate, endDate, batchIds, teamIds, solveRange);

        // Inject runId into config/payload if needed for callback correlation,
        // though V4 usually uses the URL or a specific field. 
        // We'll stick to the V4 contracts.
        // The DataAssembler generates a `request_id`, but we might want to map it to our DB `runId`.
        // Let's rely on the Python side echoing back `request_id`.

        console.log(`[SchedulingV4] Data Assembled for Run ${runId}. RequestID: ${solverRequest.request_id}`);
        console.log(`[SchedulingV4] Candidate Stats: ${solverRequest.operation_demands.length} ops, ${solverRequest.employee_profiles.length} employees`);
        await updateRunSummary(
            runId,
            buildSpecialShiftRunSummary(
                normalizeSpecialShiftRequirements(solverRequest.special_shift_requirements || []),
            ),
        );

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
        const isSuccess = isSuccessfulSolverResult(result);
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
            'SELECT result_summary, summary_json, target_batch_ids, window_start, window_end FROM scheduling_runs WHERE id = ?',
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
        const runSummary = parseRunSummary(run.summary_json);
        const specialShiftAssignments = normalizeSpecialShiftAssignments(rawResult.special_shift_assignments);
        const specialShiftShortages = normalizeSpecialShiftShortages(rawResult.special_shift_shortages);

        const rawAssignments: any[] = rawResult.assignments || [];

        // 2. Fetch Context Data for Enrichment
        const batchIds = typeof run.target_batch_ids === 'string'
            ? JSON.parse(run.target_batch_ids || '[]')
            : (run.target_batch_ids || []);

        // Get solve window for date filtering
        const windowStart = run.window_start;
        const windowEnd = run.window_end;

        // 2a. Fetch Batch Operations Metadata (filtered by solve window, with share groups)
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

        // 2a-2. Fetch Standalone Task Metadata from solver output (negative operation IDs)
        const standaloneTaskIds = new Set<number>();
        if (Array.isArray(rawResult.schedules)) {
            rawResult.schedules.forEach((sched: any) => {
                (sched.tasks || []).forEach((task: any) => {
                    const opId = Number(task.operation_id);
                    if (Number.isFinite(opId) && opId < 0) {
                        standaloneTaskIds.add(Math.abs(opId));
                    }
                });
            });
        } else {
            rawAssignments.forEach((assignment: any) => {
                const opId = Number(assignment.operation_id);
                if (Number.isFinite(opId) && opId < 0) {
                    standaloneTaskIds.add(Math.abs(opId));
                }
            });
        }

        if (standaloneTaskIds.size > 0) {
            const taskIds = Array.from(standaloneTaskIds);
            const placeholders = taskIds.map(() => '?').join(',');
            const [taskRows] = await pool.execute<RowDataPacket[]>(`
                SELECT id, task_code, task_name, required_people, earliest_start, deadline
                FROM standalone_tasks
                WHERE id IN (${placeholders})
            `, taskIds);

            taskRows.forEach((taskRow) => {
                const opId = -Number(taskRow.id);
                const taskCode = String(taskRow.task_code || 'STANDALONE');
                const taskName = String(taskRow.task_name || `Task ${taskRow.id}`);
                opMap.set(opId, {
                    operation_plan_id: opId,
                    batch_code: 'STANDALONE',
                    operation_name: `${taskCode} - ${taskName}`,
                    required_people: Number(taskRow.required_people || 1),
                    planned_start_datetime: taskRow.earliest_start || taskRow.deadline || null,
                    planned_end_datetime: taskRow.deadline || taskRow.earliest_start || null,
                    share_group_ids: null,
                    share_group_name: null,
                });
            });
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
                solve_time: rawResult.metrics?.solve_time || 0,
                special_shift_requirement_count: Number(runSummary.special_shift_requirement_count || rawResult.summary?.special_shift_requirement_count || 0),
                special_shift_occurrence_count: Number(runSummary.special_shift_occurrence_count || rawResult.summary?.special_shift_occurrence_count || 0),
                special_shift_required_headcount_total: Number(runSummary.special_shift_required_headcount_total || rawResult.summary?.special_shift_required_headcount_total || 0),
                special_shift_assigned_headcount_total: specialShiftAssignments.length,
                special_shift_shortage_total: specialShiftShortages.reduce((sum, item) => sum + item.shortage_people, 0),
                special_shift_unmet_occurrence_count: specialShiftShortages.length,
                special_shift_partial_occurrence_count: specialShiftShortages.length,
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
            special_shift_assignments: specialShiftAssignments,
            special_shift_shortages: specialShiftShortages,
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

async function createRunRecord(start: string, end: string, batchIds: number[], solveStart?: string, solveEnd?: string) {
    const runCode = `V4-${Date.now()}`;
    const [res] = await pool.execute<any>(
        `INSERT INTO scheduling_runs (run_code, run_key, status, stage, window_start, window_end, period_start, period_end, solve_start, solve_end, target_batch_ids, solver_progress, created_at)
         VALUES (?, ?, 'QUEUED', 'INIT', ?, ?, ?, ?, ?, ?, ?, '{"logs": []}', NOW())`,
        [runCode, runCode, start, end, start, end, solveStart || null, solveEnd || null, JSON.stringify(batchIds)]
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
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT summary_json FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const runSummary = rows.length > 0 ? parseRunSummary(rows[0].summary_json) : {};
        const storedResult = buildStoredResult(result);
        const specialShiftAssignments = normalizeSpecialShiftAssignments(result?.special_shift_assignments);
        const specialShiftShortages = normalizeSpecialShiftShortages(result?.special_shift_shortages);
        if (storedResult.summary) {
            storedResult.summary = {
                ...storedResult.summary,
                special_shift_requirement_count: Number(runSummary.special_shift_requirement_count || 0),
                special_shift_occurrence_count: Number(runSummary.special_shift_occurrence_count || 0),
                special_shift_required_headcount_total: Number(runSummary.special_shift_required_headcount_total || 0),
                special_shift_assigned_headcount_total: specialShiftAssignments.length,
                special_shift_shortage_total: specialShiftShortages.reduce((sum, item) => sum + item.shortage_people, 0),
                special_shift_unmet_occurrence_count: specialShiftShortages.length,
                special_shift_partial_occurrence_count: specialShiftShortages.length,
            };
        }
        storedResult.special_shift_assignments = specialShiftAssignments;
        storedResult.special_shift_shortages = specialShiftShortages;
        const nextRunSummary = {
            ...runSummary,
            special_shift_assigned_headcount_total: specialShiftAssignments.length,
            special_shift_shortage_total: specialShiftShortages.reduce((sum, item) => sum + item.shortage_people, 0),
            special_shift_unmet_occurrence_count: specialShiftShortages.length,
            special_shift_partial_occurrence_count: specialShiftShortages.length,
            special_shift_assignments: specialShiftAssignments,
            special_shift_shortages: specialShiftShortages,
        };
        await pool.execute(
            'UPDATE scheduling_runs SET result_summary = ?, summary_json = ? WHERE id = ?',
            [JSON.stringify(storedResult), JSON.stringify(nextRunSummary), runId]
        );
        if (isSuccessfulSolverResult(result)) {
            await markSpecialShiftOccurrencesScheduled(runId);
        }
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
        const isSuccess = isSuccessfulSolverResult(result);
        const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';
        const errorMsg = isSuccess ? null : (result.message || `Solver returned status: ${result.status}`);

        await saveResults(Number(run_id), result);
        await updateRunStatus(Number(run_id), finalStatus, errorMsg, 'DONE');

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
            'SELECT result_summary, summary_json, window_start, window_end, solve_start, solve_end, status FROM scheduling_runs WHERE id = ?',
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
        const runSummary = parseRunSummary(run.summary_json);
        const specialShiftRequirements = normalizeSpecialShiftRequirements(runSummary.special_shift_requirements);
        const specialShiftAssignments = normalizeSpecialShiftAssignments(rawResult.special_shift_assignments);
        const specialShiftShortages = normalizeSpecialShiftShortages(rawResult.special_shift_shortages);

        // 兼容 Solver V4 统一 schedules 格式 & 旧版 assignments/shift_schedule 格式
        // Diagnostic: Log the keys present in the rawResult to debug format detection
        const resultKeys = Object.keys(rawResult);
        const schedulesPresent = Array.isArray(rawResult.schedules);
        const schedulesLength = schedulesPresent ? rawResult.schedules.length : 0;
        const totalTasksInSchedules = schedulesPresent
            ? rawResult.schedules.reduce((sum: number, s: any) => sum + (s.tasks?.length || 0), 0)
            : 0;
        console.log(`[SchedulingV4][Diag] Result keys: [${resultKeys.join(', ')}]`);
        console.log(`[SchedulingV4][Diag] schedules present: ${schedulesPresent}, count: ${schedulesLength}, total tasks: ${totalTasksInSchedules}`);
        console.log(`[SchedulingV4][Diag] assignments present: ${Array.isArray(rawResult.assignments)}, shift_schedule present: ${Array.isArray(rawResult.shift_schedule)}`);

        let assignments: FlattenedAssignment[] = [];
        let shiftSchedule: ShiftScheduleItem[] = [];

        if (Array.isArray(rawResult.schedules) && rawResult.schedules.length > 0) {
            // 统一格式：从 schedules 中展平
            for (const sched of rawResult.schedules) {
                if (sched.shift?.shift_id) {
                    shiftSchedule.push({
                        employee_id: sched.employee_id,
                        date: sched.date,
                        shift_id: sched.shift.shift_id
                    });
                }
                for (const task of (sched.tasks || [])) {
                    assignments.push({
                        operation_id: task.operation_id, // For standalone, this is -task.id
                        position_number: task.position_number,
                        employee_id: sched.employee_id,
                        is_standalone: task.batch_code === 'STANDALONE',
                        date: sched.date,
                        shift_id: sched.shift?.shift_id
                    });
                }
            }
            console.log(`[SchedulingV4] 展平 ${rawResult.schedules.length} 条 schedules → ${assignments.length} 条人员分配, ${shiftSchedule.length} 条班次计划`);
        } else {
            // 旧格式兜底
            assignments = rawResult.assignments || [];
            shiftSchedule = rawResult.shift_schedule || [];
        }

        const windowStart = run.window_start;
        const windowEnd = run.window_end;
        // For interval solving, use solve_start/solve_end for cleanup
        // This ensures we only clear data within the solve range, preserving frozen data outside
        const cleanupStart = run.solve_start || windowStart;
        const cleanupEnd = run.solve_end || windowEnd;
        const isIntervalSolve = !!(run.solve_start && run.solve_end);
        if (isIntervalSolve) {
            console.log(`[SchedulingV4] Interval solve mode: cleanup range ${cleanupStart} ~ ${cleanupEnd} (full window ${windowStart} ~ ${windowEnd})`);
        }
        const assignmentsByShiftKey = new Map<string, FlattenedAssignment[]>();
        assignments.forEach(assignment => {
            if (!assignment.date) {
                return;
            }
            const shiftKey = buildShiftKey(assignment.employee_id, assignment.date, assignment.shift_id);
            if (!assignmentsByShiftKey.has(shiftKey)) {
                assignmentsByShiftKey.set(shiftKey, []);
            }
            assignmentsByShiftKey.get(shiftKey)!.push(assignment);
        });

        await connection.beginTransaction();

        const lockedAssignmentKeys = new Map<string, number>();
        const lockedShiftByEmployeeDate = new Map<string, { id: number; shift_id: number | null; plan_category: string }>();

        // 2. Cleanup: Clear non-locked data in the solve range, but preserve manual locks.
        if (cleanupStart && cleanupEnd) {
            const [lockedAssignmentRows] = await connection.execute<RowDataPacket[]>(
                `SELECT
                    bpa.batch_operation_plan_id,
                    bpa.position_number,
                    bpa.employee_id
                 FROM batch_personnel_assignments bpa
                 JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
                 WHERE DATE(bop.planned_start_datetime) BETWEEN ? AND ?
                   AND IFNULL(bpa.is_locked, 0) = 1`,
                [cleanupStart, cleanupEnd]
            );
            lockedAssignmentRows.forEach(row => {
                lockedAssignmentKeys.set(
                    buildAssignmentKey(Number(row.batch_operation_plan_id), Number(row.position_number)),
                    Number(row.employee_id)
                );
            });

            const [lockedShiftRows] = await connection.execute<RowDataPacket[]>(
                `SELECT id, employee_id, plan_date, shift_id, plan_category
                 FROM employee_shift_plans
                 WHERE plan_date BETWEEN ? AND ?
                   AND IFNULL(is_locked, 0) = 1`,
                [cleanupStart, cleanupEnd]
            );
            lockedShiftRows.forEach(row => {
                const planDate = row.plan_date instanceof Date
                    ? row.plan_date.toISOString().split('T')[0]
                    : String(row.plan_date).split('T')[0];
                lockedShiftByEmployeeDate.set(
                    `${Number(row.employee_id)}:${planDate}`,
                    {
                        id: Number(row.id),
                        shift_id: row.shift_id ? Number(row.shift_id) : null,
                        plan_category: String(row.plan_category || 'BASE')
                    }
                );
            });

            const [shiftPlansToDelete] = await connection.execute<RowDataPacket[]>(
                `SELECT id
                 FROM employee_shift_plans
                 WHERE plan_date BETWEEN ? AND ?
                   AND IFNULL(is_locked, 0) = 0`,
                [cleanupStart, cleanupEnd]
            );

            if (shiftPlansToDelete.length > 0) {
                const shiftPlanIds = shiftPlansToDelete.map(row => Number(row.id));
                const placeholders = shiftPlanIds.map(() => '?').join(',');

                await connection.execute(
                    `UPDATE batch_personnel_assignments
                     SET shift_plan_id = NULL
                     WHERE shift_plan_id IN (${placeholders})
                       AND IFNULL(is_locked, 0) = 0`,
                    shiftPlanIds
                );

                const [lockedRefs] = await connection.execute<RowDataPacket[]>(
                    `SELECT DISTINCT shift_plan_id
                     FROM batch_personnel_assignments
                     WHERE shift_plan_id IN (${placeholders})
                       AND IFNULL(is_locked, 0) = 1`,
                    shiftPlanIds
                );

                const lockedShiftPlanIds = new Set(lockedRefs.map(row => Number(row.shift_plan_id)));
                const safeToDeleteIds = shiftPlanIds.filter(id => !lockedShiftPlanIds.has(id));

                if (safeToDeleteIds.length > 0) {
                    const safePlaceholders = safeToDeleteIds.map(() => '?').join(',');
                    await connection.execute(
                        `DELETE FROM employee_shift_plans
                         WHERE id IN (${safePlaceholders})`,
                        safeToDeleteIds
                    );
                }
            }

            await connection.execute(
                `DELETE bpa FROM batch_personnel_assignments bpa
                 JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
                 WHERE DATE(bop.planned_start_datetime) BETWEEN ? AND ?
                   AND IFNULL(bpa.is_locked, 0) = 0`,
                [cleanupStart, cleanupEnd]
            );
            console.log(`[SchedulingV4] Cleaned up non-locked assignments in ${isIntervalSolve ? 'solve range' : 'window'} ${cleanupStart} ~ ${cleanupEnd}`);

            // Cleanup: standalone task assignments
            await connection.execute(
                `DELETE sta FROM standalone_task_assignments sta
                 WHERE sta.scheduling_run_id IS NOT NULL 
                   AND sta.assigned_date >= ? AND sta.assigned_date <= ?`,
                [cleanupStart, cleanupEnd]
            );
        }

        // 3. Insert new assignments to batch_personnel_assignments and standalone_task_assignments
        let assignmentsInserted = 0;
        let standaloneAssignmentsInserted = 0;
        let lockedAssignmentsSkipped = 0;
        const assignedStandaloneTaskIds = new Set<number>();

        for (const assignment of assignments) {
            try {
                if (assignment.is_standalone) {
                    const taskId = Math.abs(assignment.operation_id);
                    const standaloneAssignmentParams: any[] = [
                        taskId,
                        assignment.position_number,
                        assignment.employee_id,
                        runIdNum,
                        assignment.date ?? null,
                        assignment.shift_id ?? null,
                    ];
                    await connection.execute(
                        `INSERT INTO standalone_task_assignments 
                           (task_id, position_number, employee_id, status, scheduling_run_id, assigned_date, assigned_shift_id)
                         VALUES (?, ?, ?, 'PLANNED', ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                           employee_id = VALUES(employee_id),
                           status = 'PLANNED',
                           scheduling_run_id = VALUES(scheduling_run_id),
                           assigned_date = VALUES(assigned_date),
                           assigned_shift_id = VALUES(assigned_shift_id)`,
                        standaloneAssignmentParams
                    );
                    assignedStandaloneTaskIds.add(taskId);
                    standaloneAssignmentsInserted++;
                } else {
                    const assignmentKey = buildAssignmentKey(assignment.operation_id, assignment.position_number);
                    if (lockedAssignmentKeys.has(assignmentKey)) {
                        const lockedEmployeeId = lockedAssignmentKeys.get(assignmentKey);
                        if (lockedEmployeeId !== assignment.employee_id) {
                            console.warn(
                                `[SchedulingV4] Skip locked assignment conflict: Op ${assignment.operation_id} Pos ${assignment.position_number} locked to Emp ${lockedEmployeeId}, solver returned Emp ${assignment.employee_id}`
                            );
                        }
                        lockedAssignmentsSkipped++;
                        continue;
                    }

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
                }
            } catch (err: any) {
                console.warn(`[SchedulingV4] Failed to insert assignment: Op ${assignment.operation_id} Pos ${assignment.position_number} -> Emp ${assignment.employee_id}: ${err.message}`);
            }
        }

        // Update status of standalone tasks to 'SCHEDULED' if they were processed
        if (assignedStandaloneTaskIds.size > 0) {
            const placeholders = Array.from(assignedStandaloneTaskIds).map(() => '?').join(',');
            await connection.execute(
                `UPDATE standalone_tasks SET status = 'SCHEDULED' WHERE id IN (${placeholders})`,
                Array.from(assignedStandaloneTaskIds)
            );
        }

        // 4. Insert new shift plans to employee_shift_plans
        // First, build shift_id metadata for plan_category detection.
        const [shiftDefRows] = await connection.execute<RowDataPacket[]>(
            'SELECT id, shift_code, nominal_hours, category FROM shift_definitions WHERE is_active = 1'
        );
        const shiftMap = new Map<number, ShiftDefinitionInfo>();
        shiftDefRows.forEach(r => shiftMap.set(Number(r.id), {
            code: String(r.shift_code),
            hours: Number(r.nominal_hours),
            category: String(r.category || 'BASE')
        }));

        let shiftPlansInserted = 0;
        let shiftPlansReused = 0;
        let lockedShiftConflicts = 0;
        const shiftPlanIdByShiftKey = new Map<string, number>();

        for (const plan of shiftSchedule) {
            try {
                const dayKey = `${plan.employee_id}:${plan.date}`;
                const lockedShiftPlan = lockedShiftByEmployeeDate.get(dayKey);
                if (lockedShiftPlan) {
                    if (lockedShiftPlan.shift_id !== plan.shift_id) {
                        console.warn(
                            `[SchedulingV4] Skip locked shift conflict: Emp ${plan.employee_id} ${plan.date} locked to Shift ${lockedShiftPlan.shift_id}, solver returned Shift ${plan.shift_id}`
                        );
                        lockedShiftConflicts++;
                        continue;
                    }

                    shiftPlanIdByShiftKey.set(buildShiftKey(plan.employee_id, plan.date, plan.shift_id), lockedShiftPlan.id);
                    shiftPlansReused++;
                    continue;
                }

                const relatedAssignments = assignmentsByShiftKey.get(buildShiftKey(plan.employee_id, plan.date, plan.shift_id)) || [];
                const shiftInfo = shiftMap.get(plan.shift_id);
                const firstBatchOperationId = relatedAssignments.find(item => !item.is_standalone)?.operation_id ?? null;
                const planCategory = derivePlanCategory(shiftInfo, relatedAssignments.length > 0);
                const planHours = shiftInfo?.hours ?? (planCategory === 'REST' ? 0 : 8);

                await connection.execute(
                    `INSERT INTO employee_shift_plans 
                        (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, batch_operation_plan_id, scheduling_run_id, is_generated)
                     VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE
                        shift_id = VALUES(shift_id),
                        plan_category = VALUES(plan_category),
                        plan_hours = VALUES(plan_hours),
                        batch_operation_plan_id = COALESCE(VALUES(batch_operation_plan_id), batch_operation_plan_id),
                        scheduling_run_id = VALUES(scheduling_run_id),
                        updated_at = NOW()`,
                    [plan.employee_id, plan.date, plan.shift_id, planCategory, planHours, firstBatchOperationId, runIdNum]
                );

                const [shiftPlanRows] = await connection.execute<RowDataPacket[]>(
                    `SELECT id
                     FROM employee_shift_plans
                     WHERE employee_id = ?
                       AND plan_date = ?
                       AND shift_id <=> ?
                     ORDER BY id DESC
                     LIMIT 1`,
                    [plan.employee_id, plan.date, plan.shift_id]
                );

                if (shiftPlanRows.length > 0) {
                    shiftPlanIdByShiftKey.set(
                        buildShiftKey(plan.employee_id, plan.date, plan.shift_id),
                        Number(shiftPlanRows[0].id)
                    );
                }

                shiftPlansInserted++;
            } catch (err: any) {
                console.warn(`[SchedulingV4] Failed to insert shift plan: Emp ${plan.employee_id} ${plan.date} -> Shift ${plan.shift_id}: ${err.message}`);
            }
        }

        for (const [shiftKey, shiftPlanId] of shiftPlanIdByShiftKey.entries()) {
            const relatedAssignments = assignmentsByShiftKey.get(shiftKey) || [];
            const batchOperationIds = Array.from(
                new Set(
                    relatedAssignments
                        .filter(item => !item.is_standalone)
                        .map(item => item.operation_id)
                )
            );

            if (!batchOperationIds.length) {
                continue;
            }

            const employeeId = relatedAssignments[0]?.employee_id;
            if (!employeeId) {
                continue;
            }

            const placeholders = batchOperationIds.map(() => '?').join(',');
            await connection.execute(
                `UPDATE batch_personnel_assignments
                 SET shift_plan_id = ?
                 WHERE batch_operation_plan_id IN (${placeholders})
                   AND employee_id = ?
                   AND IFNULL(is_locked, 0) = 0`,
                [shiftPlanId, ...batchOperationIds, employeeId]
            );
        }

        const shiftLinkBackfill = await ShiftPlanLinkService.backfillMissingShiftPlanLinks(connection, {
            runId: runIdNum,
        });
        if (shiftLinkBackfill.updatedAssignments > 0 || shiftLinkBackfill.ambiguousAssignments > 0 || shiftLinkBackfill.missingAssignments > 0) {
            console.log(
                `[SchedulingV4] Reconciled shift links for Run ${runId}: ` +
                `updated=${shiftLinkBackfill.updatedAssignments}, ` +
                `ambiguous=${shiftLinkBackfill.ambiguousAssignments}, ` +
                `missing=${shiftLinkBackfill.missingAssignments}`
            );
        }

        const specialShiftApplyResult = await applySpecialShiftCoverage(
            connection,
            runIdNum,
            specialShiftRequirements,
            specialShiftAssignments,
            specialShiftShortages,
            shiftPlanIdByShiftKey,
        );

        const nextRunSummary = {
            ...runSummary,
            special_shift_assigned_headcount_total: specialShiftApplyResult.assignmentsInserted,
            special_shift_shortage_total: specialShiftApplyResult.shortageTotal,
            special_shift_partial_occurrence_count: specialShiftApplyResult.partialOccurrences,
            special_shift_unmet_occurrence_count: specialShiftShortages.length,
            special_shift_assignments: specialShiftAssignments,
            special_shift_shortages: specialShiftShortages,
        };
        await connection.execute(
            'UPDATE scheduling_runs SET status = ?, summary_json = ? WHERE id = ?',
            ['APPLIED', JSON.stringify(nextRunSummary), runIdNum]
        );

        await connection.commit();

        console.log(
            `[SchedulingV4] Applied result for Run ${runId}: ${assignmentsInserted} batch assignments, ` +
            `${standaloneAssignmentsInserted} standalone assignments, ${shiftPlansInserted} new shift plans, ` +
            `${shiftPlansReused} reused locked shift plans, ` +
            `${specialShiftApplyResult.assignmentsInserted} special coverage assignments`
        );

        res.json({
            success: true,
            data: {
                batch_assignments_inserted: assignmentsInserted,
                standalone_assignments_inserted: standaloneAssignmentsInserted,
                shift_plans_inserted: shiftPlansInserted,
                shift_plans_reused: shiftPlansReused,
                locked_assignments_skipped: lockedAssignmentsSkipped,
                locked_shift_conflicts: lockedShiftConflicts,
                backfilled_shift_links: shiftLinkBackfill.updatedAssignments,
                shift_link_backfill_ambiguous: shiftLinkBackfill.ambiguousAssignments,
                shift_link_backfill_missing: shiftLinkBackfill.missingAssignments,
                special_shift_assignments_inserted: specialShiftApplyResult.assignmentsInserted,
                special_shift_locked_plans: specialShiftApplyResult.lockedShiftPlans,
                special_shift_shortage_total: specialShiftApplyResult.shortageTotal,
                special_shift_partial_occurrences: specialShiftApplyResult.partialOccurrences,
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

/**
 * List V4 Solver Run History
 * GET /api/v4/scheduling/runs
 */
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

// NOTE: deriveShiftAssignments removed - shift_schedule now comes directly from solver output
