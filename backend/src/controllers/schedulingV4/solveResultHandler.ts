/**
 * Scheduling V4 - Solve Result Handler
 * 
 * Handles fetching enriched results and receiving solver callbacks.
 */
import { Request, Response } from 'express';
import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import { progressEmitter, EnrichedAssignment, ResultSummaryV4 } from './types';
import {
    parseRunSummary,
    isSuccessfulSolverResult,
    normalizeSpecialShiftAssignments,
    normalizeSpecialShiftShortages,
    saveResults,
    updateRunStatus,
} from './helpers';

export const getSolveResultV4 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

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

        const batchIds = typeof run.target_batch_ids === 'string'
            ? JSON.parse(run.target_batch_ids || '[]')
            : (run.target_batch_ids || []);

        const windowStart = run.window_start;
        const windowEnd = run.window_end;

        let opMap = new Map<number, any>();
        if (batchIds.length > 0 && windowStart && windowEnd) {
            const placeholders = batchIds.map(() => '?').join(',');
            const [opRows] = await pool.execute<RowDataPacket[]>(`
                SELECT
                    bop.id as operation_plan_id,
                    bop.operation_id,
                    pbp.batch_code,
                    o.operation_name,
                    bop.required_people,
                    bop.planned_start_datetime,
                    bop.planned_end_datetime,
                    GROUP_CONCAT(DISTINCT bsg.id ORDER BY bsg.id) as share_group_ids,
                    MIN(bsg.group_name) as share_group_name,
                    ps.stage_name
                FROM batch_operation_plans bop
                JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                JOIN operations o ON bop.operation_id = o.id
                LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
                LEFT JOIN process_stages ps ON sos.stage_id = ps.id
                LEFT JOIN batch_share_group_members bsgm ON bsgm.batch_operation_plan_id = bop.id
                LEFT JOIN batch_share_groups bsg ON bsg.id = bsgm.group_id
                WHERE pbp.id IN (${placeholders})
                  AND bop.planned_start_datetime >= ?
                  AND bop.planned_start_datetime <= DATE_ADD(?, INTERVAL 1 DAY)
                GROUP BY bop.id, bop.operation_id, pbp.batch_code, bop.required_people,
                         bop.planned_start_datetime, bop.planned_end_datetime, o.operation_name, ps.stage_name
            `, [...batchIds, windowStart, windowEnd]);

            opRows.forEach(r => opMap.set(r.operation_plan_id, r));
        }

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
                SELECT id, task_code, task_name, required_people, earliest_start, deadline, allowed_employee_ids
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
                    allowed_employee_ids: taskRow.allowed_employee_ids ?? null,
                });
            });
        }

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

        const [shiftRows] = await pool.execute<RowDataPacket[]>('SELECT id, shift_name, shift_code, nominal_hours FROM shift_definitions');
        const shiftMap = new Map<number, any>();
        shiftRows.forEach(r => shiftMap.set(r.id, r));

        let workdayCount = 0;
        let calendarDays: { date: string; is_workday: boolean }[] = [];
        if (windowStart && windowEnd) {
            const [calRows] = await pool.execute<RowDataPacket[]>(
                `SELECT calendar_date as date, is_workday FROM calendar_workdays 
                 WHERE calendar_date >= ? AND calendar_date <= ?
                 ORDER BY calendar_date`,
                [windowStart, windowEnd]
            );
            calendarDays = calRows.map(r => {
                let dateStr: string;
                if (r.date instanceof Date) {
                    // Use local-time getters to avoid UTC timezone shift
                    const y = r.date.getFullYear();
                    const m = String(r.date.getMonth() + 1).padStart(2, '0');
                    const d = String(r.date.getDate()).padStart(2, '0');
                    dateStr = `${y}-${m}-${d}`;
                } else {
                    dateStr = String(r.date).split('T')[0];
                }
                return { date: dateStr, is_workday: Boolean(r.is_workday) };
            });
            workdayCount = calendarDays.filter(d => d.is_workday).length;
        }

        const hasUnifiedSchedules = Array.isArray(rawResult.schedules);

        let enrichedAssignments: EnrichedAssignment[] = [];
        let shiftPlans: any[] = [];
        const coveredOps = new Set<number>();

        if (hasUnifiedSchedules) {
            rawResult.schedules.forEach((sched: any) => {
                const emp = empMap.get(sched.employee_id);
                const shiftId = sched.shift?.shift_id;
                const shiftDef = shiftMap.get(shiftId);

                const shiftName = shiftDef?.shift_name || sched.shift?.name || 'Unknown';
                const shiftCode = shiftDef?.shift_code || sched.shift?.code || '';
                const startTime = shiftDef?.start_time || sched.shift?.start || '00:00';
                const endTime = shiftDef?.end_time || sched.shift?.end || '00:00';
                const nominalHours = shiftDef?.nominal_hours ? parseFloat(shiftDef.nominal_hours) : 0;
                const isNight = !!shiftDef?.is_night_shift;

                const ops = sched.tasks.map((t: any) => {
                    const opMeta = opMap.get(t.operation_id);
                    return {
                        operation_plan_id: t.operation_id,
                        planned_start: t.start,
                        planned_end: t.end,
                        duration_minutes: (new Date(t.end).getTime() - new Date(t.start).getTime()) / 60000,
                        operation_name: t.operation_name,
                        batch_code: t.batch_code,
                        stage_name: opMeta?.stage_name || null
                    };
                });

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

                sched.tasks.forEach((t: any) => {
                    if (emp) {
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
                                planned_end: t.end,
                                stage_name: opMeta?.stage_name || null
                            });
                            coveredOps.add(t.operation_id);
                        }
                    }
                });
            });

        } else {
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
                        planned_end: op.planned_end_datetime,
                        stage_name: op.stage_name || null
                    });
                    coveredOps.add(a.operation_id);
                }
            });

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

        const totalOpsCount = opMap.size;
        const totalPositionsCount = Array.from(opMap.values()).reduce((sum, Op) => sum + (Op.required_people || 1), 0);
        const assignedCount = enrichedAssignments.length;

        // ── Qualification requirements + eligible employees per position ──
        // Same eligibility rule as DataAssemblerV4: every mandatory requirement must be
        // met at >= required_level; standalone tasks additionally honor allowed_employee_ids.
        const defOperationIds = [...new Set(
            Array.from(opMap.values())
                .map(op => Number(op.operation_id))
                .filter(id => Number.isFinite(id) && id > 0)
        )];

        const opReqMap = new Map<number, any[]>();
        if (defOperationIds.length > 0) {
            const ph = defOperationIds.map(() => '?').join(',');
            const [reqRows] = await pool.execute<RowDataPacket[]>(`
                -- 资质门槛取 min_level(操作管理界面唯一真相源);required_level 为兼容旧逻辑死列
                SELECT oqr.operation_id, oqr.position_number, oqr.qualification_id,
                       oqr.min_level AS required_level, oqr.is_mandatory, q.qualification_name
                FROM operation_qualification_requirements oqr
                LEFT JOIN qualifications q ON q.id = oqr.qualification_id
                WHERE oqr.operation_id IN (${ph})
            `, defOperationIds);
            reqRows.forEach(r => {
                if (!opReqMap.has(r.operation_id)) opReqMap.set(r.operation_id, []);
                opReqMap.get(r.operation_id)!.push(r);
            });
        }

        const taskReqMap = new Map<number, any[]>();
        if (standaloneTaskIds.size > 0) {
            const taskIds = Array.from(standaloneTaskIds);
            const ph = taskIds.map(() => '?').join(',');
            const [reqRows] = await pool.execute<RowDataPacket[]>(`
                SELECT stq.task_id, stq.position_number, stq.qualification_id,
                       stq.min_level AS required_level, stq.is_mandatory, q.qualification_name
                FROM standalone_task_qualifications stq
                LEFT JOIN qualifications q ON q.id = stq.qualification_id
                WHERE stq.task_id IN (${ph})
            `, taskIds);
            reqRows.forEach(r => {
                if (!taskReqMap.has(r.task_id)) taskReqMap.set(r.task_id, []);
                taskReqMap.get(r.task_id)!.push(r);
            });
        }

        const empQualMap = new Map<number, { qualification_id: number; qualification_level: number }[]>();
        if (empIds.length > 0 && (opReqMap.size > 0 || taskReqMap.size > 0)) {
            const ph = empIds.map(() => '?').join(',');
            const [eqRows] = await pool.execute<RowDataPacket[]>(`
                SELECT employee_id, qualification_id, qualification_level
                FROM employee_qualifications
                WHERE employee_id IN (${ph})
            `, empIds);
            eqRows.forEach(r => {
                if (!empQualMap.has(r.employee_id)) empQualMap.set(r.employee_id, []);
                empQualMap.get(r.employee_id)!.push({
                    qualification_id: r.qualification_id,
                    qualification_level: r.qualification_level,
                });
            });
        }

        const computeEligible = (posReqs: any[], allowedSet: Set<number> | null): number[] | null => {
            const mandatory = posReqs.filter(r => !!r.is_mandatory);
            if (mandatory.length === 0 && !allowedSet) return null;
            return empIds.filter(empId => {
                if (allowedSet && !allowedSet.has(empId)) return false;
                const quals = empQualMap.get(empId) || [];
                return mandatory.every(req =>
                    quals.some(q => q.qualification_id === req.qualification_id
                        && q.qualification_level >= Number(req.required_level))
                );
            });
        };

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
                stage_name: op.stage_name || null,
                positions: []
            });

            const reqs = opId < 0
                ? (taskReqMap.get(-opId) || [])
                : (opReqMap.get(Number(op.operation_id)) || []);
            const reqsByPos = new Map<number, any[]>();
            reqs.forEach(r => {
                const pn = Number(r.position_number) || 1;
                if (!reqsByPos.has(pn)) reqsByPos.set(pn, []);
                reqsByPos.get(pn)!.push(r);
            });

            let allowedSet: Set<number> | null = null;
            if (opId < 0 && op.allowed_employee_ids) {
                try {
                    const arr = typeof op.allowed_employee_ids === 'string'
                        ? JSON.parse(op.allowed_employee_ids)
                        : op.allowed_employee_ids;
                    if (Array.isArray(arr) && arr.length > 0) {
                        allowedSet = new Set(arr.map(Number).filter(Number.isFinite));
                    }
                } catch {
                    allowedSet = null;
                }
            }

            for (let i = 1; i <= (op.required_people || 1); i++) {
                const posReqs = reqsByPos.get(i) || [];
                operationsMap.get(opId).positions.push({
                    position_number: i,
                    employee: null,
                    status: 'UNASSIGNED',
                    qualification_requirements: posReqs.map(r => ({
                        qualification_id: r.qualification_id,
                        qualification_name: r.qualification_name || `资质${r.qualification_id}`,
                        required_level: Number(r.required_level),
                        is_mandatory: !!r.is_mandatory,
                    })),
                    eligible_employee_ids: computeEligible(posReqs, allowedSet),
                });
            }
        });

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
            calendar_days: calendarDays,
            workday_count: workdayCount,
            standard_hours: workdayCount * 8
        } as any;

        res.json({ success: true, data: response });

    } catch (error: any) {
        console.error('[SchedulingV4] Get Result Failed:', error);
        res.status(500).json({ error: error.message });
    }
}

export const receiveSolveResultV4 = async (req: Request, res: Response) => {
    try {
        const { run_id, result } = req.body;

        if (!run_id || !result) {
            return res.status(400).json({ error: 'run_id and result are required' });
        }

        console.log(`[SchedulingV4] Received final result via callback for Run ${run_id}`);

        const isSuccess = isSuccessfulSolverResult(result);
        const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';
        const errorMsg = isSuccess ? null : (result.message || `Solver returned status: ${result.status}`);

        await saveResults(Number(run_id), result);
        await updateRunStatus(Number(run_id), finalStatus, errorMsg, 'DONE');

        console.log(`[SchedulingV4] Run ${run_id} updated to ${finalStatus} via callback`);

        progressEmitter.emit(`run:${run_id}`, {
            status: finalStatus,
            stage: 'DONE',
            error: errorMsg,
            solver_progress: null
        });

        res.json({ success: true });

    } catch (error: any) {
        console.error('[SchedulingV4] Receive Result Failed:', error);
        res.status(500).json({ error: error.message });
    }
};
