import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import dayjs from 'dayjs';

interface GanttOperation {
    id: number;
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
    // Off-screen metadata for connection lines
    isOffScreen?: boolean;
    offScreenDirection?: 'left' | 'right';
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

export const getGanttHierarchy = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, status } = req.query;

        // Validate params
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        // Filter by status (default to DRAFT,ACTIVATED if not specified)
        let statusFilter = "pbp.plan_status IN ('DRAFT', 'ACTIVATED')";
        if (status) {
            const statuses = String(status).split(',').map(s => `'${s.trim()}'`).join(',');
            statusFilter = `pbp.plan_status IN (${statuses})`;
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
        o.operation_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        bop.window_start_datetime, -- NEW
        bop.window_end_datetime,   -- NEW
        bop.planned_duration,
        bop.required_people,
        -- Assignment Status
        COUNT(bpa.employee_id) AS assigned_people
      FROM production_batch_plans pbp
      JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
      JOIN operations o ON bop.operation_id = o.id
      -- Stage Mapping (Try to get from template schedule if exists, or fallback)
      LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      LEFT JOIN process_stages ps ON sos.stage_id = ps.id
      -- Assignments
      LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id 
        AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
      WHERE 
        bop.planned_start_datetime <= ? 
        AND bop.planned_end_datetime >= ?
        AND ${statusFilter}
      GROUP BY bop.id
      ORDER BY pbp.id, ps.id, bop.planned_start_datetime
    `;

        const [rows] = await pool.execute<RowDataPacket[]>(query, [end_date, start_date]);

        // 2. Reconstruct Tree Structure
        const batchMap = new Map<number, GanttBatch>();

        rows.forEach(row => {
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
            if (row.assigned_people >= row.required_people) opStatus = 'COMPLETED'; // Simplified logic

            stage.operations.push({
                id: row.operation_id,
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
                assignedPeople: row.assigned_people
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

        // 3. Fetch Off-Screen Operations (V2 - separate from batch hierarchy)
        // These are operations that have constraints with visible operations but are outside the date range
        interface OffScreenOp {
            id: number;
            direction: 'left' | 'right';
            linkedToOpId: number;
        }
        const offScreenOperations: OffScreenOp[] = [];

        const visibleOpIds = rows.map(r => r.operation_id);
        if (visibleOpIds.length > 0) {
            // Query for operations linked via constraints but not in current view
            const offScreenQuery = `
                SELECT DISTINCT
                    bop.id AS operation_id,
                    bop.planned_start_datetime,
                    bop.planned_end_datetime,
                    CASE 
                        WHEN boc.predecessor_batch_operation_plan_id = bop.id 
                        THEN boc.batch_operation_plan_id 
                        ELSE boc.predecessor_batch_operation_plan_id 
                    END AS linked_op_id
                FROM batch_operation_constraints boc
                JOIN batch_operation_plans bop ON 
                    (boc.predecessor_batch_operation_plan_id = bop.id OR boc.batch_operation_plan_id = bop.id)
                JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                WHERE 
                    (boc.predecessor_batch_operation_plan_id IN (${visibleOpIds.join(',')}) 
                     OR boc.batch_operation_plan_id IN (${visibleOpIds.join(',')}))
                    AND bop.id NOT IN (${visibleOpIds.join(',')})
                    AND ${statusFilter.replace(/pbp\./g, 'pbp.')}
            `;

            try {
                const [offScreenRows] = await pool.execute<RowDataPacket[]>(offScreenQuery);

                offScreenRows.forEach(row => {
                    const opStart = dayjs(row.planned_start_datetime);
                    const opEnd = dayjs(row.planned_end_datetime);
                    const viewStart = dayjs(String(start_date));
                    const viewEnd = dayjs(String(end_date));

                    let direction: 'left' | 'right' = 'left';
                    if (opEnd.isBefore(viewStart)) {
                        direction = 'left';
                    } else if (opStart.isAfter(viewEnd)) {
                        direction = 'right';
                    }

                    // Only add if linkedOpId is in visible operations
                    if (visibleOpIds.includes(row.linked_op_id)) {
                        offScreenOperations.push({
                            id: row.operation_id,
                            direction,
                            linkedToOpId: row.linked_op_id
                        });
                    }
                });
            } catch (offScreenError) {
                console.error('Error fetching off-screen constraint operations:', offScreenError);
            }

            // 3b. Also fetch off-screen operations from share groups
            // Find share group members that are off-screen but have at least one member in view
            const shareGroupQuery = `
                SELECT DISTINCT
                    bop_offscreen.id AS operation_id,
                    bop_offscreen.planned_start_datetime,
                    bop_offscreen.planned_end_datetime,
                    bop_visible.id AS linked_op_id
                FROM batch_share_groups bsg
                JOIN batch_share_group_members bsgm_offscreen ON bsg.id = bsgm_offscreen.group_id
                JOIN batch_share_group_members bsgm_visible ON bsg.id = bsgm_visible.group_id
                JOIN batch_operation_plans bop_offscreen ON bsgm_offscreen.batch_operation_plan_id = bop_offscreen.id
                JOIN batch_operation_plans bop_visible ON bsgm_visible.batch_operation_plan_id = bop_visible.id
                WHERE 
                    bop_visible.id IN (${visibleOpIds.join(',')})
                    AND bop_offscreen.id NOT IN (${visibleOpIds.join(',')})
            `;

            try {
                const [shareGroupRows] = await pool.execute<RowDataPacket[]>(shareGroupQuery);

                shareGroupRows.forEach(row => {
                    // Skip if already added from constraint query
                    if (offScreenOperations.some(o => o.id === row.operation_id)) return;

                    const opStart = dayjs(row.planned_start_datetime);
                    const opEnd = dayjs(row.planned_end_datetime);
                    const viewStart = dayjs(String(start_date));
                    const viewEnd = dayjs(String(end_date));

                    let direction: 'left' | 'right' = 'left';
                    if (opEnd.isBefore(viewStart)) {
                        direction = 'left';
                    } else if (opStart.isAfter(viewEnd)) {
                        direction = 'right';
                    }

                    offScreenOperations.push({
                        id: row.operation_id,
                        direction,
                        linkedToOpId: row.linked_op_id
                    });
                });
            } catch (shareGroupError) {
                console.error('Error fetching off-screen share group operations:', shareGroupError);
            }
        }

        res.json({
            batches,
            offScreenOperations
        });
    } catch (error) {
        console.error('Error fetching Gantt hierarchy:', error);
        res.status(500).json({ error: 'Failed to fetch Gantt data' });
    }
};

export const getGanttDependencies = async (req: Request, res: Response) => {
    try {
        const { batch_ids } = req.query;

        // If no batch_ids provided, look for all relevant constraints
        // This could be optimized later to only fetch constraints for visible batches
        const query = `
            SELECT 
                boc.id,
                boc.batch_operation_plan_id AS successor_id,
                boc.predecessor_batch_operation_plan_id AS predecessor_id,
                boc.constraint_type,
                boc.time_lag
            FROM batch_operation_constraints boc
            JOIN batch_operation_plans bop ON boc.batch_operation_plan_id = bop.id
            JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
            WHERE pbp.plan_status IN ('DRAFT', 'ACTIVATED', 'PLANNED')
        `;

        const [rows] = await pool.execute<RowDataPacket[]>(query);

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

export const updateGanttOperation = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { startDate, endDate, windowStartDate, windowEndDate, newOperationId, plannedDuration, requiredPeople } = req.body;

        // Validation: Window Constraint
        // Although frontend validates, double-check to prevent bypassing
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        const winStart = windowStartDate ? dayjs(windowStartDate) : null;
        const winEnd = windowEndDate ? dayjs(windowEndDate) : null;

        if (winStart && start.isBefore(winStart)) {
            return res.status(400).json({ error: 'Start date cannot be earlier than window start date' });
        }
        if (winEnd && end.isAfter(winEnd)) {
            return res.status(400).json({ error: 'End date cannot be later than window end date' });
        }

        await connection.beginTransaction();

        // Update Operation Plan
        // Note: is_locked is NOT set automatically per V4 Solver logic (Time is fixed input)
        let updateQuery = `
            UPDATE batch_operation_plans
            SET 
                planned_start_datetime = ?,
                planned_end_datetime = ?,
                window_start_datetime = ?,
                window_end_datetime = ?
        `;

        const params: any[] = [
            startDate,
            endDate,
            windowStartDate || null,
            windowEndDate || null
        ];

        // If replacing operation (Phase 3)
        if (newOperationId) {
            updateQuery += `, operation_id = ?, planned_duration = ?, required_people = ?`;
            params.push(newOperationId, plannedDuration, requiredPeople);
        }

        updateQuery += ` WHERE id = ?`;
        params.push(id);

        await connection.execute(updateQuery, params);

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
