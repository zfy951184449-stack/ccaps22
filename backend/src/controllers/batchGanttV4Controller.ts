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
    status: string;
    color: string;
    progress: number;
    duration: number;
    requiredPeople: number;
    assignedPeople: number;
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

        res.json(batches);
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
                bc.id,
                bc.batch_operation_plan_id AS source, -- This looks inverted, check logic
                bc.predecessor_batch_operation_plan_id AS target,
                bc.constraint_type,
                bc.time_lag
            FROM batch_constraints bc
            JOIN batch_operation_plans bop ON bc.batch_operation_plan_id = bop.id
            JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
            WHERE pbp.plan_status IN ('DRAFT', 'ACTIVATED')
        `;

        const [rows] = await pool.execute<RowDataPacket[]>(query);

        // Map to simpler format: source -> target
        // Note: In Gantt libraries, typically "Predecessor -> Successor"
        // So predecessor_id is source, current_id is target
        const dependencies = rows.map(row => ({
            id: row.id,
            from: row.target, // predecessor
            to: row.source,   // current (successor)
            type: row.constraint_type
        }));

        res.json(dependencies);
    } catch (error) {
        console.error('Error fetching dependencies:', error);
        res.status(500).json({ error: 'Failed to fetch dependencies' });
    }
}
