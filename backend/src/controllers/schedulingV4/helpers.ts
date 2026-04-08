/**
 * Scheduling V4 - Helper / Utility Functions
 * 
 * Pure functions for data normalization, key building, and result parsing.
 */
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import SpecialShiftWindowService from '../../services/specialShiftWindowService';
import {
    ShiftPlanCategory,
    ShiftDefinitionInfo,
    SpecialShiftRunRequirement,
    SpecialShiftSolverAssignment,
    SpecialShiftSolverShortage,
} from './types';

export const buildStoredResult = (result: any) => {
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

export const buildShiftKey = (employeeId: number, date: string, shiftId?: number) =>
    `${employeeId}:${date}:${shiftId ?? 'none'}`;

export const buildAssignmentKey = (operationId: number, positionNumber: number) =>
    `${operationId}:${positionNumber}`;

export const isSuccessfulSolverResult = (result: any) =>
    ['OPTIMAL', 'FEASIBLE', 'FEASIBLE (Forced)'].includes(result?.status || '');

export const normalizeSpecialShiftRequirements = (value: unknown): SpecialShiftRunRequirement[] => {
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

export const buildSpecialShiftRunSummary = (requirements: SpecialShiftRunRequirement[]) => ({
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

export const normalizeSpecialShiftAssignments = (value: unknown): SpecialShiftSolverAssignment[] => {
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

export const normalizeSpecialShiftShortages = (value: unknown): SpecialShiftSolverShortage[] => {
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

export const parseRunSummary = (summary: any) => {
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

export const updateRunSummary = async (runId: number, patch: Record<string, any>) => {
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

export const markSpecialShiftOccurrencesScheduled = async (runId: number) => {
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

export const derivePlanCategory = (
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

export async function createRunRecord(start: string, end: string, batchIds: number[], solveStart?: string, solveEnd?: string) {
    const runCode = `V4-${Date.now()}`;
    const [res] = await pool.execute<any>(
        `INSERT INTO scheduling_runs (run_code, run_key, status, stage, window_start, window_end, period_start, period_end, solve_start, solve_end, target_batch_ids, solver_progress, created_at)
         VALUES (?, ?, 'QUEUED', 'INIT', ?, ?, ?, ?, ?, ?, ?, '{"logs": []}', NOW())`,
        [runCode, runCode, start, end, start, end, solveStart || null, solveEnd || null, JSON.stringify(batchIds)]
    );
    return res.insertId;
}

export async function updateRunStatus(runId: number, status: string, error?: string | null, stage?: string) {
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

export async function saveResults(runId: number, result: any) {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT summary_json FROM scheduling_runs WHERE id = ?',
            [runId],
        );
        const runSummary = rows.length > 0 ? parseRunSummary(rows[0].summary_json) : {};
        const storedResult = buildStoredResult(result);
        const specialShiftAssignmentsResult = normalizeSpecialShiftAssignments(result?.special_shift_assignments);
        const specialShiftShortagesResult = normalizeSpecialShiftShortages(result?.special_shift_shortages);
        if (storedResult.summary) {
            storedResult.summary = {
                ...storedResult.summary,
                special_shift_requirement_count: Number(runSummary.special_shift_requirement_count || 0),
                special_shift_occurrence_count: Number(runSummary.special_shift_occurrence_count || 0),
                special_shift_required_headcount_total: Number(runSummary.special_shift_required_headcount_total || 0),
                special_shift_assigned_headcount_total: specialShiftAssignmentsResult.length,
                special_shift_shortage_total: specialShiftShortagesResult.reduce((sum, item) => sum + item.shortage_people, 0),
                special_shift_unmet_occurrence_count: specialShiftShortagesResult.length,
                special_shift_partial_occurrence_count: specialShiftShortagesResult.length,
            };
        }
        storedResult.special_shift_assignments = specialShiftAssignmentsResult;
        storedResult.special_shift_shortages = specialShiftShortagesResult;
        const nextRunSummary = {
            ...runSummary,
            special_shift_assigned_headcount_total: specialShiftAssignmentsResult.length,
            special_shift_shortage_total: specialShiftShortagesResult.reduce((sum, item) => sum + item.shortage_people, 0),
            special_shift_unmet_occurrence_count: specialShiftShortagesResult.length,
            special_shift_partial_occurrence_count: specialShiftShortagesResult.length,
            special_shift_assignments: specialShiftAssignmentsResult,
            special_shift_shortages: specialShiftShortagesResult,
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
        throw error;
    }
}
