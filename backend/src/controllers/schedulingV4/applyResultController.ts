/**
 * Scheduling V4 - Apply Result Controller
 * 
 * Persists solver results to production tables using database transactions.
 */
import { Request, Response } from 'express';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import ShiftPlanLinkService from '../../services/shiftPlanLinkService';
import {
    FlattenedAssignment,
    ShiftScheduleItem,
    ShiftDefinitionInfo,
    SpecialShiftSolverAssignment,
    SpecialShiftSolverShortage,
    SpecialShiftRunRequirement,
} from './types';
import {
    parseRunSummary,
    normalizeSpecialShiftRequirements,
    normalizeSpecialShiftAssignments,
    normalizeSpecialShiftShortages,
    buildShiftKey,
    buildAssignmentKey,
    derivePlanCategory,
} from './helpers';

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

export const applySolveResultV4 = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        const { runId } = req.params;
        const runIdNum = Number(runId);

        console.log(`[SchedulingV4] Applying result for Run ${runId}...`);

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
                        operation_id: task.operation_id,
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
            assignments = rawResult.assignments || [];
            shiftSchedule = rawResult.shift_schedule || [];
        }

        const windowStart = run.window_start;
        const windowEnd = run.window_end;
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

            await connection.execute(
                `DELETE sta FROM standalone_task_assignments sta
                 WHERE sta.scheduling_run_id IS NOT NULL 
                   AND sta.assigned_date >= ? AND sta.assigned_date <= ?`,
                [cleanupStart, cleanupEnd]
            );
        }

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

        if (assignedStandaloneTaskIds.size > 0) {
            const placeholders = Array.from(assignedStandaloneTaskIds).map(() => '?').join(',');
            await connection.execute(
                `UPDATE standalone_tasks SET status = 'SCHEDULED' WHERE id IN (${placeholders})`,
                Array.from(assignedStandaloneTaskIds)
            );
        }

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
