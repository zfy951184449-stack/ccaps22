/**
 * Scheduling V5 - Helper / Utility Functions
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

// ── V5 viz 累积结构裁剪上限（冻结契约 §1.3 / 11_backend §2.2）──
export const VIZ_CONVERGENCE_CAP = 300;
export const VIZ_EVENTS_CAP = 200;
export const VIZ_LOG_CAP = 1000;

// solver_progress 的 V5 初始累积结构（11_backend §2.1）。
// progress/metrics/message 不在初始值里——沿用 V4 由 JSON_MERGE_PATCH 动态合入的语义。
export const buildInitialSolverProgressV5 = () => ({
    logs: [] as string[],
    phase: null as string | null,
    model_stats: null as any,
    search_stats: null as any,
    convergence: [] as any[],
    events: [] as any[],
    infeasibility: null as any,
    viz_meta: { convergence_count: 0, events_count: 0 },
});

// 向 events 流追加一条事件项 {wall_time, type, phase, payload}（不裁剪，裁剪交给 clampVizArrays）。
export const appendVizEvents = (events: any[], event: any): any[] => {
    const next = Array.isArray(events) ? events.slice() : [];
    next.push(event);
    return next;
};

// 向 convergence 点列 push 一个 incumbent 点 {wall_time, obj, bound, gap, breakdown}。
// wall_time 直接取 incumbent.wall_time（三文档统一用 wall_time，不另造 t 字段）。
export const pushConvergencePoint = (convergence: any[], incumbent: any): any[] => {
    const next = Array.isArray(convergence) ? convergence.slice() : [];
    next.push({
        wall_time: incumbent?.wall_time ?? null,
        obj: incumbent?.obj ?? null,
        bound: incumbent?.bound ?? null,
        gap: incumbent?.gap ?? null,
        breakdown: incumbent?.breakdown ?? null,
    });
    return next;
};

// 等距下采样：把一个数组压到 cap 个元素。保头（第 0 个）+ 保尾（最近 keepTail 个）+ 中段等距抽样。
// 保证收敛曲线形状不失真。
const downsampleKeepHeadTail = (arr: any[], cap: number, keepTail: number): any[] => {
    if (arr.length <= cap) {
        return arr.slice();
    }
    const tailStart = arr.length - keepTail;
    const head = arr[0];
    const tail = arr.slice(tailStart);
    // 中段 = [1, tailStart)，需抽样到 (cap - 1 - keepTail) 个点。
    const middleSlots = cap - 1 - keepTail;
    const result: any[] = [head];
    if (middleSlots > 0) {
        const middleStart = 1;
        const middleLen = tailStart - middleStart; // 可抽样区间长度
        for (let i = 0; i < middleSlots; i++) {
            // 等距取样，落在 [middleStart, tailStart)
            const idx = middleStart + Math.floor((i * middleLen) / middleSlots);
            result.push(arr[idx]);
        }
    }
    return result.concat(tail);
};

/**
 * 裁剪 viz 累积数组（读-改-写的最后一步，11_backend §2.2 步骤3）：
 *  - convergence：上限 VIZ_CONVERGENCE_CAP=300。超限保头 + 下采样中段 + 保尾。
 *    viz_meta.convergence_count 记真实总数（调用方在 push 时自增，本函数不动计数）。
 *  - events：上限 VIZ_EVENTS_CAP=200，FIFO 丢最旧；但 NEW_INCUMBENT / CONFLICT 类优先保留。
 *  - logs：上限 VIZ_LOG_CAP=1000，超限保尾（最近 1000 行）。
 * 纯函数：原地不修改入参，返回新对象。
 */
export const clampVizArrays = (progress: any): any => {
    const next = { ...(progress || {}) };

    // convergence
    if (Array.isArray(next.convergence) && next.convergence.length > VIZ_CONVERGENCE_CAP) {
        // 保尾数量：取上限的 1/3，保证近期解高保真。
        const keepTail = Math.floor(VIZ_CONVERGENCE_CAP / 3);
        next.convergence = downsampleKeepHeadTail(next.convergence, VIZ_CONVERGENCE_CAP, keepTail);
    }

    // events：优先保留 NEW_INCUMBENT / CONFLICT，FIFO 丢弃最旧的 PHASE/INFO 类。
    if (Array.isArray(next.events) && next.events.length > VIZ_EVENTS_CAP) {
        const isPriority = (e: any) => {
            const t = String(e?.type || '');
            return t === 'NEW_INCUMBENT' || t === 'CONFLICT' || t === 'DIAGNOSIS';
        };
        const priority = next.events.filter(isPriority);
        const ordinary = next.events.filter((e: any) => !isPriority(e));
        if (priority.length >= VIZ_EVENTS_CAP) {
            // 优先项本身就超限——对优先项 FIFO 保尾。
            next.events = priority.slice(priority.length - VIZ_EVENTS_CAP);
        } else {
            const room = VIZ_EVENTS_CAP - priority.length;
            // 普通项 FIFO 保尾 room 个，再与优先项按原始顺序合并。
            const keptOrdinary = ordinary.slice(ordinary.length - room);
            const keptSet = new Set<any>([...priority, ...keptOrdinary]);
            next.events = next.events.filter((e: any) => keptSet.has(e));
        }
    }

    // logs：超限保尾。
    if (Array.isArray(next.logs) && next.logs.length > VIZ_LOG_CAP) {
        next.logs = next.logs.slice(next.logs.length - VIZ_LOG_CAP);
    }

    return next;
};

// 从 result JSON 抽取 infeasibility_analysis（结果端点用，11_backend §6）。原样返回，不改字段名。
export const extractInfeasibilityAnalysis = (result: any): any => result?.infeasibility_analysis ?? null;

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

// L1: 只读取 run 的 summary_json 并解析为对象,供 orchestrator 在补写 scope.employee_ids 前读出已有 scope
// (team/batch/is_global),避免 updateRunSummary 的浅合并把它们覆盖掉。
export const getRunSummary = async (runId: number): Promise<Record<string, any>> => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT summary_json FROM scheduling_runs WHERE id = ?',
        [runId],
    );
    return rows.length > 0 ? parseRunSummary(rows[0].summary_json) : {};
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

export async function createRunRecord(
    start: string,
    end: string,
    batchIds: number[],
    teamIds: number[] = [],
    solveStart?: string,
    solveEnd?: string,
) {
    const runCode = `V5-${Date.now()}`;
    // L1: 把"本次求解责任域"快照进 summary_json.scope,apply 时据此把删除范围收窄到本团队/本批次,
    // 避免跨团队覆盖(I1/I2/I3 不变量)。employee_ids 此刻未知,assemble 后由 orchestrator 步骤B补全;
    // 全域(无 team)时 is_global=true、employee_ids 保持 null → apply 退回按时间窗删除(原行为)。
    const normalizedTeamIds = Array.isArray(teamIds) ? teamIds : [];
    const normalizedBatchIds = Array.isArray(batchIds) ? batchIds : [];
    const initialSummary = {
        scope: {
            is_global: normalizedTeamIds.length === 0,
            team_ids: normalizedTeamIds,
            batch_ids: normalizedBatchIds,
            employee_ids: null,
            standalone_task_ids: null,
            scope_version: 1,
        },
    };
    const [res] = await pool.execute<any>(
        `INSERT INTO scheduling_runs (run_code, run_key, status, stage, window_start, window_end, period_start, period_end, solve_start, solve_end, target_batch_ids, summary_json, solver_progress, created_at)
         VALUES (?, ?, 'QUEUED', 'INIT', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [runCode, runCode, start, end, start, end, solveStart || null, solveEnd || null,
         JSON.stringify(normalizedBatchIds), JSON.stringify(initialSummary),
         JSON.stringify(buildInitialSolverProgressV5())]
    );
    return res.insertId;
}

// 终态集合：到达后不再被进度/迟到回调降级（与 V4 对齐，见 updateSolveProgressV5 守卫与 reaper）。
export const V5_TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'APPLIED'];

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
    // 到达终态时落 completed_at（与 V4 对齐：历史列表/对账需要基准时间）。
    if (V5_TERMINAL_STATUSES.includes(status)) {
        sql += ', completed_at = NOW()';
    }

    sql += ' WHERE id = ?';
    params.push(runId);

    await pool.execute(sql, params);
}

// 进入真正求解阶段时记录开始时刻与本次时间上限：供历史展示，也给 reaper 一个跟随 max_time 的判活基准。
export async function markSolveStarted(runId: number, timeLimitSeconds: number | null) {
    await pool.execute(
        `UPDATE scheduling_runs
            SET status = 'RUNNING', stage = 'SOLVING', solve_started_at = NOW(), time_limit_seconds = ?
          WHERE id = ?`,
        [Number.isFinite(timeLimitSeconds as number) ? timeLimitSeconds : null, runId],
    );
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
        console.error(`[SchedulingV5] Failed to save results for Run ${runId}:`, error);
        throw error;
    }
}

// ── B2: solution hint 注入辅助函数（11_backend §1.4.1）──

/**
 * 查找同 window 的最近 APPLIED 或 COMPLETED V5 run，用于 solution hint 注入。
 * 安全降级：任何失败由调用方 try/catch 静默处理。
 */
export async function findLatestAppliedV5Run(
    batchIds: number[],
    window: { start_date: string; end_date: string }
): Promise<{ result_summary: any } | null> {
    if (!batchIds || batchIds.length === 0) {
        return null;
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT result_summary FROM scheduling_runs
         WHERE run_code LIKE 'V5-%'
           AND status IN ('APPLIED', 'COMPLETED')
           AND window_start = ?
           AND window_end = ?
           AND result_summary IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [window.start_date, window.end_date]
    );
    if (!rows.length || !rows[0].result_summary) {
        return null;
    }
    let resultSummary = rows[0].result_summary;
    if (typeof resultSummary === 'string') {
        try {
            resultSummary = JSON.parse(resultSummary);
        } catch {
            return null;
        }
    }
    return { result_summary: resultSummary };
}

/**
 * 从 result_summary 中精简出 hint 结构：
 * { assignments: [{op, pos, emp}], shifts: [{emp, date, shift}] }
 */
export function compactSolution(
    resultSummary: any
): { assignments: Array<{ op: number; pos: number; emp: number }>; shifts: Array<{ emp: number; date: string; shift: number }> } | null {
    if (!resultSummary || typeof resultSummary !== 'object') {
        return null;
    }
    // 从 schedules 数组提取 assignments 和 shifts
    const schedules = Array.isArray(resultSummary.schedules) ? resultSummary.schedules : [];
    const assignments: Array<{ op: number; pos: number; emp: number }> = [];
    const shifts: Array<{ emp: number; date: string; shift: number }> = [];

    for (const schedule of schedules) {
        const empId = Number(schedule?.employee_id);
        if (!Number.isFinite(empId) || empId <= 0) continue;

        // shift
        const date = schedule?.date ? String(schedule.date) : null;
        const shiftId = Number(schedule?.shift_id);
        if (date && Number.isFinite(shiftId) && shiftId > 0) {
            shifts.push({ emp: empId, date, shift: shiftId });
        }

        // tasks -> assignments
        const tasks = Array.isArray(schedule?.tasks) ? schedule.tasks : [];
        for (const task of tasks) {
            const opId = Number(task?.operation_plan_id);
            const posNum = Number(task?.position_number);
            if (Number.isFinite(opId) && opId > 0 && Number.isFinite(posNum) && posNum > 0) {
                assignments.push({ op: opId, pos: posNum, emp: empId });
            }
        }
    }

    return { assignments, shifts };
}

/**
 * 验证 hint 结构合法性（后端侧第一道校验，11_backend §1.4.1）。
 * assignments 为列表，每条含 op/pos/emp 为整数；不符则返回 false 不注入。
 */
export function validateHintShape(
    hint: any
): hint is { assignments: Array<{ op: number; pos: number; emp: number }>; shifts: Array<{ emp: number; date: string; shift: number }> } {
    if (!hint || typeof hint !== 'object') return false;
    if (!Array.isArray(hint.assignments)) return false;
    if (!Array.isArray(hint.shifts)) return false;
    // assignments 每条校验
    for (const a of hint.assignments) {
        if (!a || typeof a !== 'object') return false;
        if (!Number.isFinite(a.op) || a.op <= 0) return false;
        if (!Number.isFinite(a.pos) || a.pos <= 0) return false;
        if (!Number.isFinite(a.emp) || a.emp <= 0) return false;
    }
    // shifts 每条校验
    for (const s of hint.shifts) {
        if (!s || typeof s !== 'object') return false;
        if (!Number.isFinite(s.emp) || s.emp <= 0) return false;
        if (!s.date || typeof s.date !== 'string') return false;
        if (!Number.isFinite(s.shift) || s.shift <= 0) return false;
    }
    return true;
}
