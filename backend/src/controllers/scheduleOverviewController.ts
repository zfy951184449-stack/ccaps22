import { Request, Response } from 'express';
import pool from '../config/database';
import dayjs from 'dayjs';

export const getScheduleOverview = async (req: Request, res: Response) => {
    try {
        const { month } = req.query; // format YYYY-MM
        let startDate = dayjs().startOf('month').format('YYYY-MM-DD');
        let endDate = dayjs().endOf('month').format('YYYY-MM-DD');

        if (month && typeof month === 'string' && month.match(/^\d{4}-\d{2}$/)) {
            startDate = dayjs(month).startOf('month').format('YYYY-MM-DD');
            endDate = dayjs(month).endOf('month').format('YYYY-MM-DD');
        }

        // 1. Fetch batch operations (simplified: we join production_batch_plans and batch_operation_plans)
        const [batchOpsRows] = await pool.execute(
            `SELECT 
         bop.id, bop.batch_plan_id as batch_id, pbp.batch_code, bop.operation_id, o.operation_name,
         bop.planned_start_datetime as planned_start_time, bop.planned_end_datetime as planned_end_time, bop.required_people, pbp.plan_status as status
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       JOIN operations o ON bop.operation_id = o.id
       WHERE (DATE(bop.planned_start_datetime) BETWEEN ? AND ?)
          OR (DATE(bop.planned_end_datetime) BETWEEN ? AND ?)
          OR pbp.planned_start_date BETWEEN ? AND ?`,
            [startDate, endDate, startDate, endDate, startDate, endDate]
        ) as any;

        // 2. Fetch standalone tasks
        const [standaloneRows] = await pool.execute(
            `SELECT st.*, ou.unit_name as team_name
       FROM standalone_tasks st
       LEFT JOIN organization_units ou ON st.team_id = ou.id
       WHERE (st.earliest_start BETWEEN ? AND ?)
          OR (st.deadline BETWEEN ? AND ?)
          OR (st.earliest_start <= ? AND st.deadline >= ?)
          OR st.status IN ('PENDING', 'SCHEDULED') -- Always include active tasks just in case`,
            [startDate, endDate, startDate, endDate, startDate, endDate]
        ) as any;

        res.json({
            startDate,
            endDate,
            batchOperations: batchOpsRows,
            standaloneTasks: standaloneRows
        });
    } catch (error) {
        console.error('Error fetching schedule overview:', error);
        res.status(500).json({ error: 'Failed to fetch schedule overview' });
    }
};
