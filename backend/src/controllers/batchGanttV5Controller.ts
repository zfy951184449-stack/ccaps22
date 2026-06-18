import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import dayjs from 'dayjs';

interface GanttOperation {
    id: number;
    templateScheduleId?: number | null;
    stage_id: number;
    name: string;
    startDate: string;
    endDate: string;
    // New fields for V5
    windowStartDate?: string;
    windowEndDate?: string;
    status: string;
    color: string;
    progress: number;
    duration: number;
    requiredPeople: number;
    assignedPeople: number;
    personnelAssignments: GanttPersonnelAssignment[];
    resourceNodeId?: number | null;
    resourceName?: string | null;
    resourceNodeClass?: string | null;
    resourceSystemType?: string | null;
    resourceEquipmentClass?: string | null;
}

interface GanttPersonnelAssignment {
    id: number;
    positionNumber: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string | null;
    role: string | null;
    status: string;
    shiftPlanId: number | null;
    shiftCode: string | null;
    shiftName: string | null;
    planDate: string | null;
}

interface GanttStage {
    id: number;
    batch_id: number;
    name: string;
    startDate: string;
    endDate: string;
    progress: number;
    operations: GanttOperation[];
}

interface GanttBatch {
    id: number;
    name: string;
    code: string;
    startDate: string;
    endDate: string;
    status: string;
    color: string;
    stages: GanttStage[];
}

const DEFAULT_BATCH_STATUSES = ['DRAFT', 'ACTIVATED', 'PLANNED'];
const ALLOWED_BATCH_STATUSES = new Set([
    ...DEFAULT_BATCH_STATUSES,
    'PAUSED',
    'COMPLETED'
]);

const parseCsvNumberList = (value: unknown): number[] => {
    const rawValue = Array.isArray(value) ? value.join(',') : String(value ?? '');
    return rawValue
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0);
};

const placeholders = (items: unknown[]) => items.map(() => '?').join(',');

const parseStatusFilter = (value: unknown): string[] => {
    const rawValue = Array.isArray(value) ? value.join(',') : String(value ?? '');
    const statuses = rawValue
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => ALLOWED_BATCH_STATUSES.has(item));

    return statuses.length > 0 ? statuses : DEFAULT_BATCH_STATUSES;
};

const normalizeDateTimeForMysql = (value: unknown): string | null => {
    const rawValue = value === null || value === undefined ? '' : String(value).trim();
    if (!rawValue) {
        return null;
    }

    const localDateTime = rawValue.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
    if (localDateTime) {
        return `${localDateTime[1]} ${localDateTime[2]}:${localDateTime[3] ?? '00'}`;
    }

    const parsed = dayjs(rawValue);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : rawValue;
};

export const getGanttHierarchy = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, status } = req.query;
        const statuses = parseStatusFilter(status);
        const batchIds = parseCsvNumberList(req.query.batch_ids);

        // Validate params
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const hierarchyWhereClauses = [
            'bop.planned_start_datetime <= ?',
            'bop.planned_end_datetime >= ?',
            `pbp.plan_status IN (${statuses.map(() => '?').join(',')})`
        ];
        const hierarchyParams: Array<string | number> = [String(end_date), String(start_date), ...statuses];

        if (batchIds.length > 0) {
            hierarchyWhereClauses.push(`pbp.id IN (${batchIds.map(() => '?').join(',')})`);
            hierarchyParams.push(...batchIds);
        }

        // 1. Fetch Hierarchy Data (Join Batch -> Op -> Stage)
        // We fetch flat data and reconstruct the tree in JS to avoid N+1 queries
        // ADDED: bop.window_start_datetime, bop.window_end_datetime
        const query = `
      SELECT 
        -- Batch Info
        pbp.id AS batch_id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.plan_status AS batch_status,
        pbp.batch_color,
        pbp.planned_start_date AS batch_start_date,
        -- Stage Info (Derived from operations or joined table)
        ps.id AS stage_id,
        ps.stage_name,
        ps.id AS stage_order, -- simplified ordering
        -- Operation Info
        bop.id AS operation_id,
        bop.template_schedule_id,
        o.operation_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        bop.window_start_datetime, -- NEW
        bop.window_end_datetime,   -- NEW
        bop.planned_duration,
        COALESCE(o.required_people, bop.required_people) AS required_people,
        MAX(tsb.resource_node_id) AS resource_node_id,
        MAX(rn.node_name) AS resource_name,
        MAX(rn.node_class) AS resource_node_class,
        MAX(rn.equipment_system_type) AS resource_system_type,
        MAX(rn.equipment_class) AS resource_equipment_class,
        -- Assignment Status
        COUNT(bpa.employee_id) AS assigned_people
      FROM production_batch_plans pbp
      JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
      JOIN operations o ON bop.operation_id = o.id
      -- Stage Mapping (Try to get from template schedule if exists, or fallback)
      LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      LEFT JOIN process_stages ps ON sos.stage_id = ps.id
      LEFT JOIN template_stage_operation_resource_bindings tsb
        ON tsb.template_schedule_id = bop.template_schedule_id
        AND (tsb.binding_role = 'PRIMARY' OR tsb.binding_role IS NULL)
      LEFT JOIN resource_nodes rn ON rn.id = tsb.resource_node_id
      -- Assignments
      LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id 
        AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
      WHERE 
        ${hierarchyWhereClauses.join('\n        AND ')}
      GROUP BY bop.id
      ORDER BY pbp.id, ps.id, bop.planned_start_datetime
    `;

        const [rows] = await pool.execute<RowDataPacket[]>(query, hierarchyParams);

        const visibleOperationPlanIds = rows.map((row) => Number(row.operation_id)).filter(Number.isFinite);
        const assignmentsByOperation = new Map<number, GanttPersonnelAssignment[]>();

        if (visibleOperationPlanIds.length > 0) {
            const [assignmentRows] = await pool.execute<RowDataPacket[]>(
                `
                    SELECT
                        bpa.id,
                        bpa.batch_operation_plan_id,
                        bpa.position_number,
                        bpa.employee_id,
                        e.employee_code,
                        e.employee_name,
                        bpa.role,
                        bpa.assignment_status,
                        bpa.shift_plan_id,
                        esp.plan_date,
                        sd.shift_code,
                        sd.shift_name
                    FROM batch_personnel_assignments bpa
                    LEFT JOIN employees e ON e.id = bpa.employee_id
                    LEFT JOIN employee_shift_plans esp ON esp.id = bpa.shift_plan_id
                    LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
                    WHERE bpa.batch_operation_plan_id IN (${placeholders(visibleOperationPlanIds)})
                      AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
                    ORDER BY bpa.batch_operation_plan_id, bpa.position_number, bpa.id
                `,
                visibleOperationPlanIds
            );

            assignmentRows.forEach((row) => {
                const operationPlanId = Number(row.batch_operation_plan_id);
                if (!assignmentsByOperation.has(operationPlanId)) {
                    assignmentsByOperation.set(operationPlanId, []);
                }

                assignmentsByOperation.get(operationPlanId)!.push({
                    id: Number(row.id),
                    positionNumber: Number(row.position_number ?? 1),
                    employeeId: Number(row.employee_id),
                    employeeCode: row.employee_code ?? null,
                    employeeName: row.employee_name ?? null,
                    role: row.role ?? null,
                    status: row.assignment_status,
                    shiftPlanId: row.shift_plan_id ? Number(row.shift_plan_id) : null,
                    shiftCode: row.shift_code ?? null,
                    shiftName: row.shift_name ?? null,
                    planDate: row.plan_date ? dayjs(row.plan_date).format('YYYY-MM-DD') : null
                });
            });
        }

        // 2. Reconstruct Tree Structure
        const batchMap = new Map<number, GanttBatch>();

        rows.forEach(row => {
            const personnelAssignments = assignmentsByOperation.get(Number(row.operation_id)) ?? [];
            const assignedPeople = personnelAssignments.length;
            // Find or Create Batch
            if (!batchMap.has(row.batch_id)) {
                batchMap.set(row.batch_id, {
                    id: row.batch_id,
                    name: row.batch_name,
                    code: row.batch_code,
                    status: row.batch_status,
                    color: row.batch_color || '#1890ff',
                    startDate: row.batch_start_date, // Will update based on ops
                    endDate: row.batch_start_date,   // Will update based on ops
                    stages: []
                });
            }
            const batch = batchMap.get(row.batch_id)!;

            // Find or Create Stage
            // Note: Some operations might not have a stage (independent), we group them in 'Uncategorized'
            const stageId = row.stage_id || -1;
            let stage = batch.stages.find(s => s.id === stageId);
            if (!stage) {
                stage = {
                    id: stageId,
                    batch_id: row.batch_id,
                    name: row.stage_name || 'General Operations',
                    startDate: row.planned_start_datetime, // Init
                    endDate: row.planned_end_datetime,     // Init
                    progress: 0,
                    operations: []
                };
                batch.stages.push(stage);
            }

            // Add Operation
            // Determine status/color based on assignments or lock state
            let opStatus = 'PENDING';
            if (row.batch_status === 'ACTIVATED') opStatus = 'READY';
            if (assignedPeople >= row.required_people) opStatus = 'COMPLETED'; // Simplified logic

            stage.operations.push({
                id: row.operation_id,
                templateScheduleId: row.template_schedule_id ? Number(row.template_schedule_id) : null,
                stage_id: stageId,
                name: row.operation_name,
                startDate: row.planned_start_datetime,
                endDate: row.planned_end_datetime,
                windowStartDate: row.window_start_datetime, // Map new field
                windowEndDate: row.window_end_datetime,     // Map new field
                status: opStatus,
                color: batch.color,
                progress: 0,
                duration: row.planned_duration,
                requiredPeople: row.required_people,
                assignedPeople,
                personnelAssignments,
                resourceNodeId: row.resource_node_id ? Number(row.resource_node_id) : null,
                resourceName: row.resource_name || null,
                resourceNodeClass: row.resource_node_class || null,
                resourceSystemType: row.resource_system_type || null,
                resourceEquipmentClass: row.resource_equipment_class || null
            });

            // Update Stage Times (Expand specific stage range)
            if (dayjs(row.planned_start_datetime).isBefore(stage.startDate)) stage.startDate = row.planned_start_datetime;
            if (dayjs(row.planned_end_datetime).isAfter(stage.endDate)) stage.endDate = row.planned_end_datetime;

            // Update Batch Times
            if (dayjs(row.planned_start_datetime).isBefore(batch.startDate)) batch.startDate = row.planned_start_datetime;
            if (dayjs(row.planned_end_datetime).isAfter(batch.endDate)) batch.endDate = row.planned_end_datetime;
        });

        const batches = Array.from(batchMap.values());

        // Sort batches by startDate ascending
        batches.sort((a, b) => {
            return dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf();
        });

        res.json({ batches });
    } catch (error) {
        console.error('Error fetching Gantt hierarchy:', error);
        res.status(500).json({ error: 'Failed to fetch Gantt data' });
    }
};

export const getGanttDependencies = async (req: Request, res: Response) => {
    try {
        const batchIds = parseCsvNumberList(req.query.batch_ids);
        const statuses = parseStatusFilter(req.query.status);
        const { start_date, end_date } = req.query;
        const whereClauses = [
            `successor_batch.plan_status IN (${statuses.map(() => '?').join(',')})`,
            `predecessor_batch.plan_status IN (${statuses.map(() => '?').join(',')})`
        ];
        const params: Array<string | number> = [...statuses, ...statuses];

        if (start_date && end_date) {
            whereClauses.push(`(
                (successor_bop.planned_start_datetime <= ? AND successor_bop.planned_end_datetime >= ?)
                OR
                (predecessor_bop.planned_start_datetime <= ? AND predecessor_bop.planned_end_datetime >= ?)
            )`);
            params.push(String(end_date), String(start_date), String(end_date), String(start_date));
        }

        if (batchIds.length > 0) {
            whereClauses.push(`(successor_batch.id IN (${batchIds.map(() => '?').join(',')}) OR predecessor_batch.id IN (${batchIds.map(() => '?').join(',')}))`);
            params.push(...batchIds, ...batchIds);
        }

        const query = `
            SELECT DISTINCT
                boc.id,
                boc.batch_operation_plan_id AS successor_id,
                boc.predecessor_batch_operation_plan_id AS predecessor_id,
                boc.constraint_type,
                boc.time_lag
            FROM batch_operation_constraints boc
            JOIN batch_operation_plans successor_bop ON boc.batch_operation_plan_id = successor_bop.id
            JOIN production_batch_plans successor_batch ON successor_bop.batch_plan_id = successor_batch.id
            JOIN batch_operation_plans predecessor_bop ON boc.predecessor_batch_operation_plan_id = predecessor_bop.id
            JOIN production_batch_plans predecessor_batch ON predecessor_bop.batch_plan_id = predecessor_batch.id
            WHERE ${whereClauses.join('\n            AND ')}
        `;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        const dependencies = rows.map(row => ({
            id: row.id,
            from: row.predecessor_id, // Arrow starts from Predecessor
            to: row.successor_id,     // Arrow points to Successor
            type: row.constraint_type
        }));

        res.json(dependencies);
    } catch (error) {
        console.error('Error fetching dependencies:', error);
        res.status(500).json({ error: 'Failed to fetch dependencies' });
    }
}

// ===== Shared operation-time update helpers =====
// Single-operation and batch endpoints share these so the validation and SQL stay
// in lock-step (window constraint + optional operation replacement). Changing the
// rules in one place updates both paths.

interface NormalizedOperationTime {
    startDate: string;
    endDate: string;
    windowStartDate: string | null;
    windowEndDate: string | null;
    newOperationId?: number | null;
    plannedDuration?: number | null;
    requiredPeople?: number | null;
}

// Normalize raw request body into MySQL-ready datetimes. Returns an error reason
// (caller maps to a 400) when the required start/end are missing.
const normalizeOperationTimePayload = (
    body: any,
): { value?: NormalizedOperationTime; error?: string } => {
    const normalizedStartDate = normalizeDateTimeForMysql(body?.startDate);
    const normalizedEndDate = normalizeDateTimeForMysql(body?.endDate);
    const normalizedWindowStartDate = normalizeDateTimeForMysql(body?.windowStartDate);
    const normalizedWindowEndDate = normalizeDateTimeForMysql(body?.windowEndDate);

    if (!normalizedStartDate || !normalizedEndDate) {
        return { error: 'Start date and end date are required' };
    }

    return {
        value: {
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            windowStartDate: normalizedWindowStartDate,
            windowEndDate: normalizedWindowEndDate,
            newOperationId: body?.newOperationId,
            plannedDuration: body?.plannedDuration,
            requiredPeople: body?.requiredPeople,
        },
    };
};

// Hard time-window guard. Although the frontend validates, double-check here to
// prevent bypassing. Returns an error reason or null when valid.
const validateOperationTimeWindow = (normalized: NormalizedOperationTime): string | null => {
    const start = dayjs(normalized.startDate);
    const end = dayjs(normalized.endDate);
    const winStart = normalized.windowStartDate ? dayjs(normalized.windowStartDate) : null;
    const winEnd = normalized.windowEndDate ? dayjs(normalized.windowEndDate) : null;

    if (winStart && start.isBefore(winStart)) {
        return 'Start date cannot be earlier than window start date';
    }
    if (winEnd && end.isAfter(winEnd)) {
        return 'End date cannot be later than window end date';
    }
    return null;
};

// Build the UPDATE statement + params for one operation. Mirrors the single-update
// behaviour: time fields always, plus optional operation replacement (Phase 3).
// Note: is_locked is NOT set automatically per V4 Solver logic (time is fixed input).
const buildOperationUpdate = (
    operationId: number | string,
    normalized: NormalizedOperationTime,
): { query: string; params: any[] } => {
    let query = `
            UPDATE batch_operation_plans
            SET
                planned_start_datetime = ?,
                planned_end_datetime = ?,
                window_start_datetime = ?,
                window_end_datetime = ?
        `;

    const params: any[] = [
        normalized.startDate,
        normalized.endDate,
        normalized.windowStartDate,
        normalized.windowEndDate,
    ];

    if (normalized.newOperationId) {
        query += `, operation_id = ?, planned_duration = ?, required_people = ?`;
        params.push(normalized.newOperationId, normalized.plannedDuration, normalized.requiredPeople);
    }

    query += ` WHERE id = ?`;
    params.push(operationId);

    return { query, params };
};

export const updateGanttOperation = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;

        const { value: normalized, error: normalizeError } = normalizeOperationTimePayload(req.body);
        if (!normalized) {
            return res.status(400).json({ error: normalizeError });
        }

        const windowError = validateOperationTimeWindow(normalized);
        if (windowError) {
            return res.status(400).json({ error: windowError });
        }

        await connection.beginTransaction();

        const { query, params } = buildOperationUpdate(id, normalized);
        await connection.execute(query, params);

        await connection.commit();
        res.json({ message: 'Operation updated successfully', id });

    } catch (error) {
        await connection.rollback();
        console.error('Error updating operation:', error);
        res.status(500).json({ error: 'Failed to update operation' });
    } finally {
        connection.release();
    }
};

// Atomic batch time update — used by the gantt group/multi-select drag so a single
// rejected operation rolls back the whole move (all-or-nothing). Reuses the same
// normalize + window validation + UPDATE builder as the single endpoint.
export const updateGanttOperationsBatch = async (req: Request, res: Response) => {
    const operations = req.body?.operations;
    if (!Array.isArray(operations) || operations.length === 0) {
        return res.status(400).json({ error: 'operations array is required' });
    }

    // Pre-validate every item before opening a transaction so a bad payload fails
    // fast with the offending operationId, without touching the DB.
    const prepared: Array<{ operationId: number; query: string; params: any[] }> = [];
    for (const op of operations) {
        const operationId = Number(op?.operationId);
        if (!Number.isInteger(operationId) || operationId <= 0) {
            return res.status(400).json({ error: 'Each operation requires a valid operationId', operationId: op?.operationId ?? null });
        }

        const { value: normalized, error: normalizeError } = normalizeOperationTimePayload(op);
        if (!normalized) {
            return res.status(400).json({ error: normalizeError, operationId });
        }

        const windowError = validateOperationTimeWindow(normalized);
        if (windowError) {
            return res.status(400).json({ error: windowError, operationId });
        }

        prepared.push({ operationId, ...buildOperationUpdate(operationId, normalized) });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of prepared) {
            const [result] = await connection.execute(item.query, item.params) as any;
            // A zero-row update means the operation no longer exists — fail the whole
            // batch rather than silently dropping part of the move.
            if (result && typeof result.affectedRows === 'number' && result.affectedRows === 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Operation not found',
                    operationId: item.operationId,
                });
            }
        }

        await connection.commit();
        res.json({ message: 'Operations updated successfully', count: prepared.length });

    } catch (error) {
        await connection.rollback();
        console.error('Error batch-updating operations:', error);
        res.status(500).json({ error: 'Failed to update operations' });
    } finally {
        connection.release();
    }
};

export const deleteGanttOperation = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;

        await connection.beginTransaction();

        // 1. Check if the operation exists
        const [existing] = await connection.execute('SELECT id, operation_id FROM batch_operation_plans WHERE id = ?', [id]) as any;
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Operation not found' });
        }

        // 2. Delete related constraints (both where it is source or target)
        await connection.execute('DELETE FROM batch_operation_constraints WHERE batch_operation_plan_id = ? OR predecessor_batch_operation_plan_id = ?', [id, id]);

        // 3. Delete related assignments
        await connection.execute('DELETE FROM batch_personnel_assignments WHERE batch_operation_plan_id = ?', [id]);

        // 4. Delete share group memberships
        await connection.execute('DELETE FROM batch_share_group_members WHERE batch_operation_plan_id = ?', [id]);

        // 5. Delete the operation plan itself
        await connection.execute('DELETE FROM batch_operation_plans WHERE id = ?', [id]);

        await connection.commit();
        res.json({ message: 'Operation deleted successfully' });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting operation:', error);
        res.status(500).json({ error: 'Failed to delete operation' });
    } finally {
        connection.release();
    }
};
