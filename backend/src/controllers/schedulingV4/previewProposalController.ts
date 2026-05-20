/**
 * Scheduling V4 Preview Proposal Controller
 *
 * Preview-only adapter used by Batch Management Workbench V2.
 * It does not create scheduling_runs, does not persist solver results, and does
 * not update production operation or personnel assignment tables.
 */
import { Request, Response } from 'express';
import dayjs from 'dayjs';
import { DataAssemblerV4 } from '../../services/schedulingV4/DataAssemblerV4';
import { SOLVER_V4_URL } from './types';

interface OperationTimeOverride {
    operation_plan_id: number;
    planned_start: string;
    planned_end: string;
}

interface PreviewAssignment {
    operation_plan_id: number;
    position_number: number;
    employee_id: number;
    planned_start: string;
    planned_end: string;
}

const isPositiveNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeIds = (value: unknown): number[] =>
    Array.isArray(value)
        ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
        : [];

const normalizeOverride = (value: unknown): OperationTimeOverride | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value as Record<string, unknown>;
    const operationPlanId = Number(raw.operation_plan_id);
    const plannedStart = dayjs(String(raw.planned_start ?? ''));
    const plannedEnd = dayjs(String(raw.planned_end ?? ''));

    if (!isPositiveNumber(operationPlanId) || !plannedStart.isValid() || !plannedEnd.isValid() || !plannedEnd.isAfter(plannedStart)) {
        return null;
    }

    return {
        operation_plan_id: operationPlanId,
        planned_start: plannedStart.toISOString(),
        planned_end: plannedEnd.toISOString(),
    };
};

const normalizeOverrides = (value: unknown): OperationTimeOverride[] =>
    Array.isArray(value)
        ? value.map(normalizeOverride).filter((item): item is OperationTimeOverride => item !== null)
        : [];

const deriveSolveRange = (
    explicitRange: { start_date?: string; end_date?: string } | undefined,
    overrides: OperationTimeOverride[],
): { start_date: string; end_date: string } | undefined => {
    if (explicitRange?.start_date && explicitRange?.end_date) {
        const start = dayjs(explicitRange.start_date);
        const end = dayjs(explicitRange.end_date);
        if (start.isValid() && end.isValid() && !end.isBefore(start)) {
            return {
                start_date: start.format('YYYY-MM-DD'),
                end_date: end.format('YYYY-MM-DD'),
            };
        }
    }

    if (overrides.length === 0) {
        return undefined;
    }

    const starts = overrides.map((item) => dayjs(item.planned_start));
    const ends = overrides.map((item) => dayjs(item.planned_end));
    const minStart = starts.reduce((min, current) => (current.isBefore(min) ? current : min), starts[0]);
    const maxEnd = ends.reduce((max, current) => (current.isAfter(max) ? current : max), ends[0]);

    return {
        start_date: minStart.format('YYYY-MM-DD'),
        end_date: maxEnd.format('YYYY-MM-DD'),
    };
};

const applyTimeOverrides = (solverRequest: any, overrides: OperationTimeOverride[]) => {
    if (overrides.length === 0) {
        return solverRequest;
    }

    const overrideByOperationId = new Map(overrides.map((item) => [item.operation_plan_id, item]));
    return {
        ...solverRequest,
        operation_demands: (solverRequest.operation_demands ?? []).map((demand: any) => {
            const override = overrideByOperationId.get(Number(demand.operation_plan_id));
            if (!override) {
                return demand;
            }
            return {
                ...demand,
                planned_start: override.planned_start,
                planned_end: override.planned_end,
                planned_duration_minutes: dayjs(override.planned_end).diff(dayjs(override.planned_start), 'minute'),
            };
        }),
    };
};

const extractPreviewAssignments = (solverResult: any): PreviewAssignment[] => {
    if (!Array.isArray(solverResult?.schedules)) {
        return [];
    }

    return solverResult.schedules.flatMap((schedule: any) =>
        Array.isArray(schedule?.tasks)
            ? schedule.tasks.map((task: any) => ({
                operation_plan_id: Number(task.operation_id),
                position_number: Number(task.position_number ?? 1),
                employee_id: Number(schedule.employee_id),
                planned_start: String(task.start ?? ''),
                planned_end: String(task.end ?? ''),
            }))
            : [],
    ).filter((item: PreviewAssignment) =>
        Number.isFinite(item.operation_plan_id) &&
        Number.isFinite(item.position_number) &&
        Number.isFinite(item.employee_id) &&
        item.planned_start &&
        item.planned_end,
    );
};

const summarizePreview = (solverRequest: any, solverResult: any, affectedOperationIds: number[]) => {
    const assignments = extractPreviewAssignments(solverResult);
    const affectedSet = new Set(affectedOperationIds);
    const affectedAssignments = affectedSet.size > 0
        ? assignments.filter((item) => affectedSet.has(item.operation_plan_id))
        : assignments;

    const totalPositions = Number(
        solverResult?.metrics?.total_positions ??
        (solverRequest.operation_demands ?? []).reduce((sum: number, demand: any) => sum + Number(demand.required_people || 0), 0),
    );
    const assignedCount = Number(solverResult?.metrics?.assigned_count ?? assignments.length);
    const vacantPositions = Number(
        solverResult?.metrics?.vacant_positions ??
        Math.max(totalPositions - assignedCount, 0),
    );

    return {
        status: solverResult?.status ?? 'UNKNOWN',
        total_positions: totalPositions,
        assigned_positions: assignedCount,
        vacant_positions: vacantPositions,
        affected_operation_count: affectedSet.size,
        affected_assignment_count: affectedAssignments.length,
        fill_rate: solverResult?.metrics?.fill_rate ?? null,
        scheduled_shift_count: solverResult?.metrics?.scheduled_shifts ?? null,
        assignments,
        unassigned_jobs: Array.isArray(solverResult?.unassigned_jobs) ? solverResult.unassigned_jobs : [],
        risks: [
            {
                constraint_code: 'WORKFORCE_COVERAGE_PREVIEW_ONLY',
                severity: vacantPositions > 0 ? 'warning' : 'info',
                hard_or_soft: 'soft',
                violation_message_template: 'Preview found {vacant_positions} uncovered positions after applying temporary operation time overrides.',
                vacant_positions: vacantPositions,
            },
        ],
    };
};

export const createPreviewProposalV4 = async (req: Request, res: Response) => {
    const { start_date, end_date, batch_ids, config, time_overrides, affected_operation_plan_ids, solve_range } = req.body ?? {};

    if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: 'start_date and end_date are required' });
    }

    const batchIds = normalizeIds(batch_ids);
    if (batchIds.length === 0) {
        return res.status(400).json({ success: false, error: 'batch_ids are required' });
    }

    const start = dayjs(String(start_date));
    const end = dayjs(String(end_date));
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
        return res.status(400).json({ success: false, error: 'Invalid scheduling window' });
    }

    const overrides = normalizeOverrides(time_overrides);
    const affectedOperationIds = normalizeIds(affected_operation_plan_ids);
    const teamIds = normalizeIds(config?.team_ids);
    const effectiveSolveRange = deriveSolveRange(solve_range, overrides);

    try {
        const assembled = await DataAssemblerV4.assemble(
            start.format('YYYY-MM-DD'),
            end.format('YYYY-MM-DD'),
            batchIds,
            teamIds,
            effectiveSolveRange,
            config,
        );

        const solverRequest = applyTimeOverrides(assembled, overrides);
        solverRequest.request_id = `preview-${Date.now()}`;
        solverRequest.config = {
            ...config,
            ...(solverRequest.config || {}),
            metadata: {
                ...(config?.metadata || {}),
                preview_only: true,
                source: 'Batch Management Workbench V2',
            },
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60 * 1000);

        const response = await fetch(`${SOLVER_V4_URL}/api/v4/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solverRequest),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            return res.json({
                success: false,
                preview_only: true,
                capability_gap: {
                    code: 'SOLVER_V4_PREVIEW_FAILED',
                    message: `Solver V4 preview failed: ${response.status} ${response.statusText}`,
                    detail: errorText,
                },
            });
        }

        const solverResult = await response.json();

        return res.json({
            success: true,
            preview_only: true,
            data: {
                mode: 'solver_v4_preview_adapter',
                request_id: solverRequest.request_id,
                applied_time_override_count: overrides.length,
                affected_operation_plan_ids: affectedOperationIds,
                solve_range: effectiveSolveRange,
                proposal: summarizePreview(solverRequest, solverResult, affectedOperationIds),
                solver_result: solverResult,
            },
        });
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            return res.json({
                success: false,
                preview_only: true,
                capability_gap: {
                    code: 'SOLVER_V4_PREVIEW_TIMEOUT',
                    message: 'Solver V4 preview timed out before returning a proposal.',
                },
            });
        }

        const errorMessage = error?.message ?? String(error);
        const solverUnavailable = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(errorMessage);
        return res.json({
            success: false,
            preview_only: true,
            capability_gap: {
                code: solverUnavailable ? 'SOLVER_V4_PREVIEW_UNAVAILABLE' : 'PREVIEW_DATA_ASSEMBLY_GAP',
                message: solverUnavailable
                    ? 'Solver V4 preview service is unavailable for this preview request.'
                    : 'Preview adapter could not assemble solver input from current database state.',
                detail: errorMessage,
            },
        });
    }
};
