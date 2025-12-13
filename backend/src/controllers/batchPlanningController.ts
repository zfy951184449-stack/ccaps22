import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import BatchLifecycleService, { BatchLifecycleError } from '../services/batchLifecycleService';

// 只有 DRAFT 状态的批次可以通过 API 直接修改，ACTIVATED 需要通过生命周期接口
const MUTABLE_BATCH_STATUSES = new Set(['DRAFT']);

interface BatchPlan {
  id: number;
  batch_code: string;
  batch_name: string;
  template_id: number;
  template_name?: string;
  project_code?: string;
  planned_start_date: string;
  planned_end_date: string;
  template_duration_days: number;
  plan_status: 'DRAFT' | 'ACTIVATED';
  description?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  operation_count?: number;
  total_required_people?: number;
  assigned_people_count?: number;
}

export const getAllBatchPlans = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        pbp.id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.template_id,
        pt.template_name,
        pbp.project_code,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        pbp.template_duration_days,
        pbp.plan_status,
        pbp.description,
        pbp.notes,
        pbp.created_at,
        pbp.updated_at,
        (SELECT COUNT(*) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS operation_count,
        (SELECT SUM(required_people) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS total_required_people,
        (SELECT COUNT(DISTINCT employee_id) 
         FROM batch_personnel_assignments bpa
         JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
         WHERE bop.batch_plan_id = pbp.id AND bpa.assignment_status != 'CANCELLED') AS assigned_people_count
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      ORDER BY pbp.created_at DESC
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching batch plans:', error);
    res.status(500).json({ error: 'Failed to fetch batch plans' });
  }
};

export const getBatchPlanById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        pbp.id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.template_id,
        pt.template_name,
        pbp.project_code,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        pbp.template_duration_days,
        pbp.plan_status,
        pbp.description,
        pbp.notes,
        pbp.created_at,
        pbp.updated_at
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      WHERE pbp.id = ?
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Batch plan not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching batch plan:', error);
    res.status(500).json({ error: 'Failed to fetch batch plan' });
  }
};

export const createBatchPlan = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      batch_code,
      batch_name,
      template_id,
      project_code,
      planned_start_date,
      plan_status = 'DRAFT',
      description,
      notes
    } = req.body;
    const normalizedStatus = (plan_status || 'DRAFT').toString().toUpperCase();
    if (!MUTABLE_BATCH_STATUSES.has(normalizedStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: '非法的批次状态，请通过生命周期接口激活批次' });
    }

    const insertQuery = `
      INSERT INTO production_batch_plans (
        batch_code, batch_name, template_id, project_code,
        planned_start_date, plan_status, description, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result]: any = await connection.execute(insertQuery, [
      batch_code,
      batch_name,
      template_id,
      project_code || null,
      planned_start_date,
      normalizedStatus,
      description || null,
      notes || null
    ]);

    const batchPlanId = result.insertId;

    // Call stored procedure to generate batch operation plans
    await connection.execute('CALL generate_batch_operation_plans(?)', [batchPlanId]);

    await connection.commit();

    // Fetch the created batch plan with all calculated fields
    const [newBatch] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        pbp.*,
        pt.template_name,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      WHERE pbp.id = ?`,
      [batchPlanId]
    );

    res.status(201).json(newBatch[0]);
  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating batch plan:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Batch code already exists' });
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(400).json({ error: 'Invalid template ID' });
    } else {
      res.status(500).json({ error: 'Failed to create batch plan' });
    }
  } finally {
    connection.release();
  }
};

export const updateBatchPlan = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      batch_code,
      batch_name,
      template_id,
      project_code,
      planned_start_date,
      plan_status,
      description,
      notes
    } = req.body;

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, template_id, DATE_FORMAT(planned_start_date, '%Y-%m-%d') AS planned_start_date, plan_status
         FROM production_batch_plans
        WHERE id = ?
        FOR UPDATE`,
      [id]
    );

    if (existingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Batch plan not found' });
    }

    const existingPlan = existingRows[0];
    const existingStatus = String(existingPlan.plan_status || '').toUpperCase();

    const requestedStatus = (plan_status ?? existingStatus).toString().toUpperCase();
    if (!MUTABLE_BATCH_STATUSES.has(requestedStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: '非法的批次状态，请通过生命周期接口激活或撤销批次' });
    }

    if (existingStatus === 'ACTIVATED' && requestedStatus !== existingStatus) {
      await connection.rollback();
      return res.status(400).json({ error: '激活中的批次请通过生命周期接口调整状态' });
    }

    const nextPlanStatus = existingStatus === 'ACTIVATED' ? existingStatus : requestedStatus;

    const nextTemplateId = template_id ?? existingPlan.template_id;
    const nextPlannedStartDate = planned_start_date ?? existingPlan.planned_start_date;

    if (
      existingStatus === 'ACTIVATED' &&
      (Number(existingPlan.template_id) !== Number(nextTemplateId) || existingPlan.planned_start_date !== nextPlannedStartDate)
    ) {
      await connection.rollback();
      return res.status(409).json({ error: '激活中的批次禁止直接修改模板或开工日期，请先撤销激活。' });
    }

    const templateChanged = Number(existingPlan.template_id) !== Number(nextTemplateId);
    const plannedStartChanged = String(existingPlan.planned_start_date) !== String(nextPlannedStartDate);

    const updateQuery = `
      UPDATE production_batch_plans
      SET batch_code = ?, batch_name = ?, template_id = ?, 
          project_code = ?, planned_start_date = ?, plan_status = ?,
          description = ?, notes = ?
      WHERE id = ?
    `;

    const [result]: any = await connection.execute(updateQuery, [
      batch_code,
      batch_name,
      nextTemplateId,
      project_code || null,
      nextPlannedStartDate,
      nextPlanStatus,
      description || null,
      notes || null,
      id
    ]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Batch plan not found' });
    }

    if (templateChanged || plannedStartChanged) {
      await connection.execute('CALL generate_batch_operation_plans(?)', [id]);
    }

    await connection.commit();

    // Fetch updated batch plan
    const [updatedBatch] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        pbp.*,
        pt.template_name,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      WHERE pbp.id = ?`,
      [id]
    );

    res.json(updatedBatch[0]);
  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating batch plan:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Batch code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update batch plan' });
    }
  } finally {
    connection.release();
  }
};

export const deleteBatchPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operatorId = (req as any).user?.id ?? null;
    const force = req.query.force === 'true';

    const result = await BatchLifecycleService.remove(Number(id), {
      operatorId,
      force,
    });

    res.json({
      message: '批次删除完成',
      ...result,
    });
  } catch (error: any) {
    console.error('Error deleting batch plan:', error);
    if (error instanceof BatchLifecycleError) {
      const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : error.code === 'RESIDUAL_DATA' ? 409 : 400;
      res.status(statusCode).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    res.status(500).json({ error: 'Failed to delete batch plan' });
  }
};

export const activateBatchPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operatorId = (req as any).user?.id ?? null;
    const { color } = req.body;

    const result = await BatchLifecycleService.activate(Number(id), {
      operatorId,
      color,
    });

    res.json({
      message: '批次激活完成',
      ...result,
    });
  } catch (error: any) {
    console.error('Error activating batch plan:', error);
    if (error instanceof BatchLifecycleError) {
      const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    res.status(500).json({ error: 'Failed to activate batch plan' });
  }
};

export const deactivateBatchPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operatorId = (req as any).user?.id ?? null;

    const result = await BatchLifecycleService.deactivate(Number(id), {
      operatorId,
    });

    res.json({
      message: '批次撤销激活完成',
      ...result,
    });
  } catch (error: any) {
    console.error('Error deactivating batch plan:', error);
    if (error instanceof BatchLifecycleError) {
      const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    res.status(500).json({ error: 'Failed to deactivate batch plan' });
  }
};

export const getBatchStatistics = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN plan_status = 'DRAFT' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) as activated_count
      FROM production_batch_plans
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching batch statistics:', error);
    res.status(500).json({ error: 'Failed to fetch batch statistics' });
  }
};

export const getTemplatesForBatch = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        pt.id,
        pt.template_code,
        pt.template_name,
        pt.total_days,
        calculate_template_duration(pt.id) as calculated_duration,
        COUNT(DISTINCT ps.id) as stage_count,
        COUNT(DISTINCT sos.id) as operation_count
      FROM process_templates pt
      LEFT JOIN process_stages ps ON pt.id = ps.template_id
      LEFT JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
      GROUP BY pt.id
      ORDER BY pt.template_name
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};
