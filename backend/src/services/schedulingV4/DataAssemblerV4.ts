/**
 * V4 Data Assembler
 * 
 * Assembles data for Solver V4, including the critical "Candidate Filtering" optimization.
 * This assembly process pre-calculates the list of qualified employees (candidates) for each
 * position requirement, significantly reducing the solver's search space.
 */

import { RowDataPacket } from 'mysql2';
import pool from '../../config/database';
import dayjs from 'dayjs';

// --- Interfaces matching Solver V4 Contracts (to be defined in Python) ---

export interface V4SolverRequest {
    request_id: string;
    window: V4SchedulingWindow;
    operation_demands: V4OperationDemand[];
    employee_profiles: V4EmployeeProfile[];
    calendar: V4CalendarDay[];
    shift_definitions: V4ShiftDefinition[];
    shared_preferences: V4SharedPreference[];
    locked_operations: V4LockedOperation[];
    locked_shifts: V4LockedShift[];
    historical_shifts: V4HistoricalShift[];
    resources: V4Resource[];
    resource_calendars: V4ResourceCalendarEntry[];
    operation_resource_requirements: V4OperationResourceRequirement[];
    maintenance_windows: V4MaintenanceWindow[];
    config?: any;
}

interface V4SchedulingWindow {
    start_date: string;
    end_date: string;
}

interface V4OperationDemand {
    operation_plan_id: number;
    batch_id: number;
    batch_code: string;
    operation_id: number;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    planned_duration_minutes: number;
    required_people: number;
    position_qualifications: V4PositionQualification[];
    // Extended fields for Task Pool
    scheduling_mode?: string;
    earliest_start?: string;
    deadline?: string;
    source_type?: string;
    standalone_task_id?: number | null;
    preferred_shift_ids?: number[] | null;
}

interface V4PositionQualification {
    position_number: number;
    qualifications: { qualification_id: number; min_level: number; is_mandatory: boolean }[];
    candidate_employee_ids: number[]; // [OPTIMIZATION] Pre-filtered candidates
}

interface V4EmployeeProfile {
    employee_id: number;
    employee_code: string;
    employee_name: string;
    qualifications: { qualification_id: number; level: number }[];
    unavailable_periods: { start_datetime: string; end_datetime: string }[];
}

interface V4CalendarDay {
    date: string;
    is_workday: boolean;
    is_triple_salary: boolean;
}

interface V4ShiftDefinition {
    shift_id: number;
    shift_code: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    nominal_hours: number;
    is_night_shift: boolean;
    plan_category: string; // Added to sync with Solver Contract
}

interface V4SharedPreference {
    share_group_id: number;
    share_group_name: string;
    share_mode: string;
    members: { operation_plan_id: number; required_people: number }[];
}

interface V4LockedOperation {
    operation_plan_id: number;
    enforced_employee_ids: number[];
}

interface V4LockedShift {
    employee_id: number;
    date: string;
    shift_id?: number | null;
    plan_category: 'WORK' | 'REST';
}

interface V4HistoricalShift {
    employee_id: number;
    date: string;
    is_work: boolean;
    is_night: boolean;
    consecutive_work_days: number; // 截止该日期的连续工作天数
}

interface V4Resource {
    resource_id: number;
    resource_code: string;
    resource_name: string;
    resource_type: string;
    department_code: string;
    owner_org_unit_id: number | null;
    status: string;
    capacity: number;
    location: string | null;
    clean_level: string | null;
    is_shared: boolean;
    is_schedulable: boolean;
    metadata: Record<string, unknown> | null;
}

interface V4ResourceCalendarEntry {
    resource_id: number;
    start_datetime: string;
    end_datetime: string;
    event_type: string;
    source_type: string;
    source_id?: number | null;
    notes?: string | null;
}

interface V4OperationResourceRequirement {
    operation_plan_id: number;
    resource_type: string;
    required_count: number;
    is_mandatory: boolean;
    requires_exclusive_use: boolean;
    prep_minutes: number;
    changeover_minutes: number;
    cleanup_minutes: number;
}

interface V4MaintenanceWindow {
    resource_id: number;
    start_datetime: string;
    end_datetime: string;
    window_type: string;
    is_hard_block: boolean;
    notes?: string | null;
}


export class DataAssemblerV4 {

    static async assemble(
        startDate: string,
        endDate: string,
        batchIds: number[],
        teamIds: number[] = [] // Optional Team Filtering
    ): Promise<V4SolverRequest> {
        const requestId = `V4-${Date.now()}`;

        console.time('DataAssemblerV4');

        // Parallel data fetching
        const [
            operationsData,
            employees,
            shifts,
            calendar,
            shareGroupsRaw,
            lockedOperations,
            lockedShifts,
            historicalShifts
        ] = await Promise.all([
            this.fetchOperations(startDate, endDate, batchIds),
            this.fetchEmployees(startDate, endDate, teamIds),
            this.fetchShifts(),
            this.fetchCalendar(startDate, endDate),
            this.fetchShareGroups(startDate, endDate, batchIds),
            this.fetchLockedOperations(batchIds),
            this.fetchLockedShifts(startDate, endDate),
            this.fetchHistoricalShifts(startDate)
        ]);

        // [OPTIMIZATION] Calculate Candidate Lists
        // We perform this here to offload complexity from the Python solver
        const enrichedOperations = await this.enrichOperationsWithCandidates(operationsData, employees);

        // [NEW] Fetch and enrich Standalone Tasks
        const standaloneTasks = await this.fetchAndEnrichStandaloneTasks(startDate, endDate, employees);

        // Merge operations and standalone tasks
        const allDemands = [...enrichedOperations, ...standaloneTasks];

        const [
            resources,
            resourceCalendars,
            maintenanceWindows,
            operationResourceRequirements
        ] = await Promise.all([
            this.fetchResources(teamIds),
            this.fetchResourceCalendars(startDate, endDate, teamIds),
            this.fetchMaintenanceWindows(startDate, endDate, teamIds),
            this.fetchOperationResourceRequirements(enrichedOperations)
        ]);

        console.timeEnd('DataAssemblerV4');

        return {
            request_id: requestId,
            window: { start_date: startDate, end_date: endDate },
            operation_demands: allDemands,
            employee_profiles: employees,
            calendar: calendar,
            shift_definitions: shifts,
            shared_preferences: this.formatShareGroups(shareGroupsRaw),
            locked_operations: lockedOperations,
            locked_shifts: lockedShifts,
            historical_shifts: historicalShifts,
            resources: resources,
            resource_calendars: resourceCalendars,
            operation_resource_requirements: operationResourceRequirements,
            maintenance_windows: maintenanceWindows,
            config: {} // TODO: Add config if needed
        };
    }

    // --- Private Fetchers ---

    private static async fetchAndEnrichStandaloneTasks(startDate: string, endDate: string, employees: V4EmployeeProfile[]): Promise<V4OperationDemand[]> {
        // Fetch valid standalone tasks that overlap with the scheduling window
        const [taskRows] = await pool.execute<RowDataPacket[]>(`
            SELECT id, task_code, task_name, task_type, earliest_start, deadline, duration_minutes, required_people, preferred_shift_ids, related_batch_id
            FROM standalone_tasks
            WHERE status IN ('PENDING', 'SCHEDULED')
              AND earliest_start <= ? AND deadline >= ?
        `, [endDate, startDate]);

        if (taskRows.length === 0) return [];

        const taskIds = taskRows.map(r => r.id);
        const [qualRows] = await pool.execute<RowDataPacket[]>(`
            SELECT task_id, position_number, qualification_id, min_level, is_mandatory
            FROM standalone_task_qualifications
            WHERE task_id IN (${taskIds.join(',')})
        `);

        // Group qualifications
        const qualMap = new Map<number, any[]>();
        qualRows.forEach(q => {
            if (!qualMap.has(q.task_id)) qualMap.set(q.task_id, []);
            qualMap.get(q.task_id)!.push(q);
        });

        const demands: V4OperationDemand[] = [];

        for (const task of taskRows) {
            const reqs = qualMap.get(task.id) || [];
            const posQuals: V4PositionQualification[] = [];

            const numPositions = task.required_people || 1;

            // Build candidates just like enrichOperationsWithCandidates but considering earliest_start/deadline for availability loosely.
            // Since it's a flexible window, we don't do hard availability filtering here. The Python solver handles it.
            // We just do qualification-based filtering.

            // Group requirements by position
            const posReqMap = new Map<number, typeof reqs>();
            reqs.forEach(r => {
                if (!posReqMap.has(r.position_number)) posReqMap.set(r.position_number, []);
                posReqMap.get(r.position_number)!.push(r);
            });

            for (let i = 1; i <= numPositions; i++) {
                const specificReqs = posReqMap.get(i) || [];
                const candidates = employees.filter(emp => {
                    for (const req of specificReqs) {
                        if (req.is_mandatory) {
                            const empQual = emp.qualifications.find(q => q.qualification_id === req.qualification_id);
                            if (!empQual || empQual.level < req.min_level) return false;
                        }
                    }
                    return true;
                }).map(e => e.employee_id);

                posQuals.push({
                    position_number: i,
                    qualifications: specificReqs.map(r => ({
                        qualification_id: r.qualification_id,
                        min_level: r.min_level,
                        is_mandatory: !!r.is_mandatory
                    })),
                    candidate_employee_ids: candidates
                });
            }

            demands.push({
                operation_plan_id: -task.id, // Use negative ID to distinguish or just rely on source_type
                batch_id: task.related_batch_id || 0,
                batch_code: "STANDALONE",
                operation_id: 0,
                operation_name: `${task.task_code} - ${task.task_name}`,
                planned_start: dayjs().toISOString(), // Dummy dates for flexible
                planned_end: dayjs().toISOString(),
                planned_duration_minutes: task.duration_minutes,
                required_people: task.required_people,
                position_qualifications: posQuals,
                scheduling_mode: task.task_type === 'FLEXIBLE' ? 'FLEXIBLE' : 'FIXED', // Simplification
                earliest_start: task.earliest_start ? dayjs(task.earliest_start).format('YYYY-MM-DD') : undefined,
                deadline: task.deadline ? dayjs(task.deadline).format('YYYY-MM-DD') : undefined,
                source_type: 'STANDALONE',
                standalone_task_id: task.id,
                preferred_shift_ids: task.preferred_shift_ids ? (typeof task.preferred_shift_ids === 'string' ? JSON.parse(task.preferred_shift_ids) : task.preferred_shift_ids) : null
            });
        }

        return demands;
    }

    private static async fetchOperations(startDate: string, endDate: string, batchIds: number[]) {
        if (batchIds.length === 0) return [];

        const placeholders = batchIds.map(() => '?').join(',');
        const query = `
            SELECT 
                bop.id as operation_plan_id,
                bop.batch_plan_id as batch_id,
                pbp.batch_code,
                bop.operation_id,
                o.operation_name,
                bop.planned_start_datetime as planned_start,
                bop.planned_end_datetime as planned_end,
                TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) as planned_duration_minutes,
                bop.required_people
            FROM batch_operation_plans bop
            JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
            JOIN operations o ON bop.operation_id = o.id
            WHERE pbp.id IN (${placeholders})
              AND bop.planned_start_datetime BETWEEN ? AND ?
              AND pbp.plan_status = 'ACTIVATED'
            ORDER BY bop.planned_start_datetime
        `;

        const [rows] = await pool.execute<RowDataPacket[]>(query, [...batchIds, startDate + ' 00:00:00', endDate + ' 23:59:59']);

        return rows as any[];
    }

    private static async enrichOperationsWithCandidates(
        operations: any[],
        employees: V4EmployeeProfile[]
    ): Promise<V4OperationDemand[]> {
        if (operations.length === 0) return [];

        const operationIds = [...new Set(operations.map(op => op.operation_id))];
        const requirementsMap = await this.fetchRequirements(operationIds);

        const result: V4OperationDemand[] = [];

        // Pre-build a lookup for employees to speed up matching
        // Map<QualificationID, Set<EmployeeID with >= specific level>>? 
        // Or just iterate. Given N employees (~100) and M operations, iteration is fine in Node.

        for (const op of operations) {
            const reqs = requirementsMap.get(op.operation_id) || [];
            const posQuals: V4PositionQualification[] = [];

            // If no specific requirements, it implies "Any Active Employee" is a candidate
            // But we still need to respect required_people count.
            // We usually treat "Position 1", "Position 2" etc.

            const numPositions = op.required_people || 1;

            if (reqs.length === 0) {
                // No specific quals -> Filter only by availability
                const opStart = dayjs(op.planned_start);
                const opEnd = dayjs(op.planned_end);

                const availableEmployeeIds = employees.filter(emp => {
                    // Check unavailability periods
                    for (const period of emp.unavailable_periods) {
                        const unavailStart = dayjs(period.start_datetime);
                        const unavailEnd = dayjs(period.end_datetime);

                        if (opStart.isBefore(unavailEnd) && opEnd.isAfter(unavailStart)) {
                            return false; // Employee unavailable during operation
                        }
                    }
                    return true;
                }).map(e => e.employee_id);

                for (let i = 1; i <= numPositions; i++) {
                    posQuals.push({
                        position_number: i,
                        qualifications: [],
                        candidate_employee_ids: availableEmployeeIds
                    });
                }
            } else {
                // Group requirements by position
                const posReqMap = new Map<number, typeof reqs>();
                reqs.forEach(r => {
                    if (!posReqMap.has(r.position_number)) posReqMap.set(r.position_number, []);
                    posReqMap.get(r.position_number)!.push(r);
                });

                // Ensure we cover all positions from 1 to required_people
                // Some positions might not have specific requirements defined in DB
                for (let i = 1; i <= numPositions; i++) {
                    const specificReqs = posReqMap.get(i) || [];

                    // Filter Candidates
                    const candidates = employees.filter(emp => {
                        // 1. Qualification Check (existing logic)
                        // Must satisfy ALL mandatory requirements for this position
                        for (const req of specificReqs) {
                            if (req.is_mandatory) {
                                const empQual = emp.qualifications.find(q => q.qualification_id === req.qualification_id);
                                if (!empQual || empQual.level < req.required_level) {
                                    return false; // Fail qualification
                                }
                            }
                        }

                        // 2. [NEW] Unavailability Check
                        // Exclude employees whose unavailable periods overlap with operation time
                        const opStart = dayjs(op.planned_start);
                        const opEnd = dayjs(op.planned_end);

                        for (const period of emp.unavailable_periods) {
                            const unavailStart = dayjs(period.start_datetime);
                            const unavailEnd = dayjs(period.end_datetime);

                            // Overlap: op.start < unavail.end AND op.end > unavail.start
                            if (opStart.isBefore(unavailEnd) && opEnd.isAfter(unavailStart)) {
                                return false; // Employee unavailable during operation
                            }
                        }

                        return true; // Pass all checks
                    }).map(e => e.employee_id);

                    posQuals.push({
                        position_number: i,
                        qualifications: specificReqs.map(r => ({
                            qualification_id: r.qualification_id,
                            min_level: r.required_level,
                            is_mandatory: !!r.is_mandatory
                        })),
                        candidate_employee_ids: candidates
                    });
                }
            }

            result.push({
                operation_plan_id: op.operation_plan_id,
                batch_id: op.batch_id,
                batch_code: op.batch_code,
                operation_id: op.operation_id,
                operation_name: op.operation_name,
                planned_start: dayjs(op.planned_start).toISOString(),
                planned_end: dayjs(op.planned_end).toISOString(),
                planned_duration_minutes: op.planned_duration_minutes,
                required_people: op.required_people,
                position_qualifications: posQuals
            });
        }

        return result;
    }

    private static async fetchRequirements(operationIds: number[]) {
        const map = new Map<number, any[]>();
        if (operationIds.length === 0) return map;

        const [rows] = await pool.execute<RowDataPacket[]>(`
            SELECT operation_id, position_number, qualification_id, required_level, is_mandatory 
            FROM operation_qualification_requirements 
            WHERE operation_id IN (${operationIds.join(',')})
        `);

        rows.forEach(row => {
            if (!map.has(row.operation_id)) map.set(row.operation_id, []);
            map.get(row.operation_id)!.push(row);
        });
        return map;
    }

    private static async fetchEmployees(startDate: string, endDate: string, teamIds: number[] = []): Promise<V4EmployeeProfile[]> {
        // Fetch basic info
        let query = "SELECT id, employee_code, employee_name FROM employees WHERE employment_status = 'ACTIVE'";
        const params: any[] = [];

        if (teamIds.length > 0) {
            // Use recursive CTE to get all descendant unit_ids
            // This ensures that selecting a parent unit (e.g., "USP") includes employees from child groups
            const placeholders = teamIds.map(() => '?').join(',');
            query = `
                WITH RECURSIVE unit_tree AS (
                    SELECT id FROM organization_units WHERE id IN (${placeholders})
                    UNION ALL
                    SELECT ou.id FROM organization_units ou
                    INNER JOIN unit_tree ut ON ou.parent_id = ut.id
                )
                SELECT e.id, e.employee_code, e.employee_name 
                FROM employees e
                WHERE e.employment_status = 'ACTIVE'
                  AND e.unit_id IN (SELECT id FROM unit_tree)
            `;
            params.push(...teamIds);
        }

        const [empRows] = await pool.execute<RowDataPacket[]>(query, params);

        const empIds = empRows.map(r => r.id);
        if (empIds.length === 0) return [];

        // Fetch Qualifications
        const [qualRows] = await pool.execute<RowDataPacket[]>(
            `SELECT employee_id, qualification_id, qualification_level FROM employee_qualifications WHERE employee_id IN (${empIds.join(',')})`
        );
        const qualMap = new Map<number, any[]>();
        qualRows.forEach(row => {
            if (!qualMap.has(row.employee_id)) qualMap.set(row.employee_id, []);
            qualMap.get(row.employee_id)!.push(row);
        });

        // Fetch Unavailability
        const [unavailRows] = await pool.execute<RowDataPacket[]>(
            `SELECT employee_id, start_datetime, end_datetime 
             FROM employee_unavailability 
             WHERE employee_id IN (${empIds.join(',')})
               AND start_datetime <= ? AND end_datetime >= ?`,
            [endDate + ' 23:59:59', startDate + ' 00:00:00']
        );
        const unavailMap = new Map<number, any[]>();
        unavailRows.forEach(row => {
            if (!unavailMap.has(row.employee_id)) unavailMap.set(row.employee_id, []);
            unavailMap.get(row.employee_id)!.push(row);
        });

        return empRows.map(emp => ({
            employee_id: emp.id,
            employee_code: emp.employee_code,
            employee_name: emp.employee_name,
            qualifications: (qualMap.get(emp.id) || []).map(q => ({
                qualification_id: q.qualification_id,
                level: q.qualification_level
            })),
            unavailable_periods: (unavailMap.get(emp.id) || []).map(u => ({
                start_datetime: dayjs(u.start_datetime).toISOString(),
                end_datetime: dayjs(u.end_datetime).toISOString()
            }))
        }));
    }

    private static async fetchShifts(): Promise<V4ShiftDefinition[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            "SELECT id, shift_code, shift_name, category, start_time, end_time, nominal_hours, is_night_shift FROM shift_definitions WHERE is_active = 1"
        );
        return rows.map(r => ({
            shift_id: r.id,
            shift_code: r.shift_code,
            shift_name: r.shift_name,
            start_time: r.start_time,
            end_time: r.end_time,
            nominal_hours: parseFloat(r.nominal_hours),
            is_night_shift: !!r.is_night_shift,
            plan_category: r.category // Map DB 'category' to Solver 'plan_category'
        }));
    }

    private static async fetchCalendar(startDate: string, endDate: string): Promise<V4CalendarDay[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                DATE_FORMAT(cw.calendar_date, '%Y-%m-%d') as date,
                cw.is_workday,
                COALESCE(hsc.salary_multiplier >= 3, 0) as is_triple_salary
             FROM calendar_workdays cw
             LEFT JOIN holiday_salary_config hsc 
               ON cw.calendar_date = hsc.calendar_date
             WHERE cw.calendar_date BETWEEN ? AND ?`,
            [startDate, endDate]
        );
        return rows.map(r => ({
            date: r.date,
            is_workday: !!r.is_workday,
            is_triple_salary: !!r.is_triple_salary
        }));
    }

    private static async fetchShareGroups(startDate: string, endDate: string, batchIds: number[]) {
        // Fetch share groups relevant to the operations in this window AND belonging to the target batches
        if (!batchIds.length) return [];

        const placeholders = batchIds.map(() => '?').join(',');
        const query = `
            SELECT DISTINCT bsg.id, bsg.group_name, bsg.share_mode, bsgm.batch_operation_plan_id, bop.required_people
            FROM batch_share_groups bsg
            JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
            JOIN batch_operation_plans bop ON bsgm.batch_operation_plan_id = bop.id
            WHERE bop.planned_start_datetime BETWEEN ? AND ?
              AND bop.batch_plan_id IN (${placeholders})
        `;
        const [rows] = await pool.execute<RowDataPacket[]>(query, [startDate + ' 00:00:00', endDate + ' 23:59:59', ...batchIds]);
        return rows;
    }

    private static formatShareGroups(rows: RowDataPacket[]): V4SharedPreference[] {
        const map = new Map<number, V4SharedPreference>();
        rows.forEach(row => {
            if (!map.has(row.id)) {
                map.set(row.id, {
                    share_group_id: row.id,
                    share_group_name: row.group_name,
                    share_mode: row.share_mode || 'SAME_TEAM',
                    members: []
                });
            }
            map.get(row.id)!.members.push({
                operation_plan_id: row.batch_operation_plan_id,
                required_people: row.required_people
            });
        });
        return Array.from(map.values());
    }

    private static async fetchResources(teamIds: number[] = []): Promise<V4Resource[]> {
        let query = `
            SELECT
                r.id,
                r.resource_code,
                r.resource_name,
                r.resource_type,
                r.department_code,
                r.owner_org_unit_id,
                r.status,
                r.capacity,
                r.location,
                r.clean_level,
                r.is_shared,
                r.is_schedulable,
                r.metadata
            FROM resources r
            WHERE r.is_schedulable = 1
        `;
        const params: number[] = [];

        if (teamIds.length > 0) {
            const placeholders = teamIds.map(() => '?').join(',');
            query = `
                WITH RECURSIVE unit_tree AS (
                    SELECT id FROM organization_units WHERE id IN (${placeholders})
                    UNION ALL
                    SELECT ou.id FROM organization_units ou
                    INNER JOIN unit_tree ut ON ou.parent_id = ut.id
                )
                SELECT
                    r.id,
                    r.resource_code,
                    r.resource_name,
                    r.resource_type,
                    r.department_code,
                    r.owner_org_unit_id,
                    r.status,
                    r.capacity,
                    r.location,
                    r.clean_level,
                    r.is_shared,
                    r.is_schedulable,
                    r.metadata
                FROM resources r
                WHERE r.is_schedulable = 1
                  AND r.owner_org_unit_id IN (SELECT id FROM unit_tree)
            `;
            params.push(...teamIds);
        }

        query += ' ORDER BY r.department_code, r.resource_type, r.resource_name';

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        return rows.map((row) => ({
            resource_id: row.id,
            resource_code: row.resource_code,
            resource_name: row.resource_name,
            resource_type: row.resource_type,
            department_code: row.department_code,
            owner_org_unit_id: row.owner_org_unit_id ?? null,
            status: row.status,
            capacity: Number(row.capacity ?? 1),
            location: row.location ?? null,
            clean_level: row.clean_level ?? null,
            is_shared: !!row.is_shared,
            is_schedulable: !!row.is_schedulable,
            metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null
        }));
    }

    private static async fetchResourceCalendars(startDate: string, endDate: string, teamIds: number[] = []): Promise<V4ResourceCalendarEntry[]> {
        const resourceFilter = await this.buildResourceIdFilter(teamIds);
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT resource_id, start_datetime, end_datetime, event_type, source_type, source_id, notes
             FROM resource_calendars
             WHERE start_datetime <= ? AND end_datetime >= ?
             ${resourceFilter.clause}
             ORDER BY start_datetime`,
            [endDate + ' 23:59:59', startDate + ' 00:00:00', ...resourceFilter.params]
        );

        return rows.map((row) => ({
            resource_id: row.resource_id,
            start_datetime: dayjs(row.start_datetime).toISOString(),
            end_datetime: dayjs(row.end_datetime).toISOString(),
            event_type: row.event_type,
            source_type: row.source_type,
            source_id: row.source_id ?? null,
            notes: row.notes ?? null
        }));
    }

    private static async fetchMaintenanceWindows(startDate: string, endDate: string, teamIds: number[] = []): Promise<V4MaintenanceWindow[]> {
        const resourceFilter = await this.buildResourceIdFilter(teamIds);
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT resource_id, start_datetime, end_datetime, window_type, is_hard_block, notes
             FROM maintenance_windows
             WHERE start_datetime <= ? AND end_datetime >= ?
             ${resourceFilter.clause}
             ORDER BY start_datetime`,
            [endDate + ' 23:59:59', startDate + ' 00:00:00', ...resourceFilter.params]
        );

        return rows.map((row) => ({
            resource_id: row.resource_id,
            start_datetime: dayjs(row.start_datetime).toISOString(),
            end_datetime: dayjs(row.end_datetime).toISOString(),
            window_type: row.window_type,
            is_hard_block: !!row.is_hard_block,
            notes: row.notes ?? null
        }));
    }

    private static async fetchOperationResourceRequirements(operations: V4OperationDemand[]): Promise<V4OperationResourceRequirement[]> {
        const operationIds = [...new Set(operations.map((operation) => operation.operation_id).filter((operationId) => operationId > 0))];
        if (operationIds.length === 0) {
            return [];
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT operation_id, resource_type, required_count, is_mandatory, requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes
             FROM operation_resource_requirements
             WHERE operation_id IN (${operationIds.join(',')})`
        );

        const grouped = new Map<number, RowDataPacket[]>();
        rows.forEach((row) => {
            if (!grouped.has(row.operation_id)) {
                grouped.set(row.operation_id, []);
            }
            grouped.get(row.operation_id)!.push(row);
        });

        return operations.flatMap((operation) =>
            (grouped.get(operation.operation_id) || []).map((row) => ({
                operation_plan_id: operation.operation_plan_id,
                resource_type: row.resource_type,
                required_count: Number(row.required_count ?? 1),
                is_mandatory: !!row.is_mandatory,
                requires_exclusive_use: !!row.requires_exclusive_use,
                prep_minutes: Number(row.prep_minutes ?? 0),
                changeover_minutes: Number(row.changeover_minutes ?? 0),
                cleanup_minutes: Number(row.cleanup_minutes ?? 0)
            }))
        );
    }

    private static async buildResourceIdFilter(teamIds: number[]): Promise<{ clause: string; params: number[] }> {
        if (teamIds.length === 0) {
            return { clause: '', params: [] };
        }

        const placeholders = teamIds.map(() => '?').join(',');
        const [rows] = await pool.execute<RowDataPacket[]>(
            `WITH RECURSIVE unit_tree AS (
                SELECT id FROM organization_units WHERE id IN (${placeholders})
                UNION ALL
                SELECT ou.id FROM organization_units ou
                INNER JOIN unit_tree ut ON ou.parent_id = ut.id
             )
             SELECT id FROM resources WHERE owner_org_unit_id IN (SELECT id FROM unit_tree)`,
            teamIds
        );

        const resourceIds = rows
            .map((row) => Number(row.id))
            .filter((resourceId) => Number.isFinite(resourceId));

        if (resourceIds.length === 0) {
            return { clause: ' AND 1 = 0', params: [] };
        }

        return {
            clause: ` AND resource_id IN (${resourceIds.map(() => '?').join(',')})`,
            params: resourceIds
        };
    }

    private static async fetchLockedOperations(batchIds: number[]): Promise<V4LockedOperation[]> {
        if (!batchIds.length) {
            return [];
        }

        const placeholders = batchIds.map(() => '?').join(',');
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT
                bop.id AS operation_plan_id,
                bpa.employee_id
             FROM batch_operation_plans bop
             JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
             JOIN batch_personnel_assignments bpa ON bpa.batch_operation_plan_id = bop.id
             WHERE pbp.id IN (${placeholders})
               AND (
                    IFNULL(bpa.is_locked, 0) = 1
                    OR IFNULL(bop.is_locked, 0) = 1
               )
               AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')`,
            batchIds
        );

        const lockedMap = new Map<number, Set<number>>();
        rows.forEach(row => {
            if (!lockedMap.has(row.operation_plan_id)) {
                lockedMap.set(row.operation_plan_id, new Set<number>());
            }
            lockedMap.get(row.operation_plan_id)!.add(Number(row.employee_id));
        });

        return Array.from(lockedMap.entries()).map(([operationPlanId, employeeIds]) => ({
            operation_plan_id: operationPlanId,
            enforced_employee_ids: Array.from(employeeIds.values())
        }));
    }

    private static async fetchLockedShifts(startDate: string, endDate: string): Promise<V4LockedShift[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT
                employee_id,
                plan_date,
                plan_category,
                shift_id
             FROM employee_shift_plans
             WHERE plan_date BETWEEN ? AND ?
               AND IFNULL(is_locked, 0) = 1`,
            [startDate, endDate]
        );

        return rows.map(row => ({
            employee_id: Number(row.employee_id),
            date: dayjs(row.plan_date).format('YYYY-MM-DD'),
            shift_id: row.shift_id ? Number(row.shift_id) : null,
            plan_category: row.plan_category === 'REST' ? 'REST' : 'WORK'
        }));
    }

    /**
     * Fetch historical shifts for boundary constraint handling.
     * Calculates consecutive work days for each employee ending at window start - 1.
     */
    private static async fetchHistoricalShifts(
        windowStartDate: string,
        lookbackDays: number = 6
    ): Promise<V4HistoricalShift[]> {
        const historyEndDate = dayjs(windowStartDate).subtract(1, 'day').format('YYYY-MM-DD');
        const historyStartDate = dayjs(windowStartDate).subtract(lookbackDays, 'day').format('YYYY-MM-DD');

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT
                esp.employee_id,
                esp.plan_date,
                esp.plan_category,
                COALESCE(sd.is_night_shift, 0) AS is_night_shift
             FROM employee_shift_plans esp
             LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
             WHERE esp.plan_date BETWEEN ? AND ?
             ORDER BY esp.employee_id, esp.plan_date`,
            [historyStartDate, historyEndDate]
        );

        // PRODUCTION and BASE count as work
        const isWorkCategory = (cat: string): boolean => {
            return cat === 'PRODUCTION' || cat === 'BASE';
        };

        // Build per-employee data map
        const employeeMap = new Map<number, {
            dateRecords: { date: string; isWork: boolean; isNight: boolean }[]
        }>();

        rows.forEach(row => {
            const empId = row.employee_id;
            const dateStr = dayjs(row.plan_date).format('YYYY-MM-DD');
            const isWork = isWorkCategory(row.plan_category);
            const isNight = Boolean(row.is_night_shift);

            if (!employeeMap.has(empId)) {
                employeeMap.set(empId, { dateRecords: [] });
            }
            employeeMap.get(empId)!.dateRecords.push({ date: dateStr, isWork, isNight });
        });

        // Calculate consecutive work days for each employee
        // Walking backward from historyEndDate
        const result: V4HistoricalShift[] = [];

        employeeMap.forEach((data, empId) => {
            // Sort by date descending (most recent first)
            const sorted = data.dateRecords.sort((a, b) => b.date.localeCompare(a.date));

            let consecutiveWorkDays = 0;
            let lastIsWork = false;
            let lastIsNight = false;

            // Count consecutive work days from window start - 1 going backwards
            for (let i = 0; i < sorted.length; i++) {
                const record = sorted[i];
                if (i === 0) {
                    lastIsWork = record.isWork;
                    lastIsNight = record.isNight;
                }

                if (record.isWork) {
                    consecutiveWorkDays++;
                } else {
                    // Stop counting on first rest day
                    break;
                }
            }

            // Return one record per employee with the consecutive count
            // Using the most recent date (historyEndDate or closest available)
            const latestDate = sorted.length > 0 ? sorted[0].date : historyEndDate;

            result.push({
                employee_id: empId,
                date: latestDate,
                is_work: lastIsWork,
                is_night: lastIsNight,
                consecutive_work_days: consecutiveWorkDays
            });
        });

        return result;
    }
}
