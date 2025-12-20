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

// 获取模版的day0偏移量（即模版最早操作的天数，可能为负）
export const getTemplateDay0Offset = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    // 查询模版中所有操作的最小天数（相对于day0）
    const query = `
      SELECT 
        COALESCE(MIN(ps.start_day + sos.operation_day), 0) as min_day
      FROM process_stages ps
      JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
      WHERE ps.template_id = ?
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [templateId]);

    if (rows.length === 0) {
      return res.json({ offset: 0, min_day: 0 });
    }

    const minDay = Number(rows[0].min_day) || 0;
    // offset是负数表示有day-x操作，0表示从day0开始
    // 如果min_day=0，表示从day0开始，offset=0
    // 如果min_day=-1，表示有day-1操作，offset=-1
    // 如果min_day=1，表示从day1开始（没有day0操作），offset=1
    res.json({
      offset: minDay,
      min_day: minDay,
      has_pre_day0: minDay < 0,
      pre_day0_count: minDay < 0 ? Math.abs(minDay) : 0
    });
  } catch (error) {
    console.error('Error fetching template day0 offset:', error);
    res.status(500).json({ error: 'Failed to fetch template day0 offset' });
  }
};

// 批量创建批次
export const createBatchPlansInBulk = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      template_id,
      day0_start_date,      // Day0开始日期
      day0_end_date,        // Day0结束日期
      interval_days,        // 间隔天数
      batch_prefix,         // 批次编码前缀
      start_number,         // 起始序号
      description,
      notes
    } = req.body;

    // 参数验证
    if (!template_id || !day0_start_date || !day0_end_date || !interval_days || !batch_prefix || start_number === undefined) {
      await connection.rollback();
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 获取模版的day0偏移量
    const [offsetRows] = await connection.execute<RowDataPacket[]>(`
      SELECT COALESCE(MIN(ps.start_day + sos.operation_day), 0) as min_day
      FROM process_stages ps
      JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
      WHERE ps.template_id = ?
    `, [template_id]);

    const minDay = Number(offsetRows[0]?.min_day) || 0;

    // 计算所有Day0日期
    const startDate = new Date(day0_start_date);
    const endDate = new Date(day0_end_date);
    const day0Dates: Date[] = [];

    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      day0Dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + interval_days);
    }

    if (day0Dates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: '日期范围或间隔设置不正确，无法生成批次' });
    }

    const createdBatches: any[] = [];

    for (let i = 0; i < day0Dates.length; i++) {
      const day0Date = day0Dates[i];
      // 计算实际开始日期 = Day0日期 + offset（offset可能为负）
      const actualStartDate = new Date(day0Date);
      actualStartDate.setDate(actualStartDate.getDate() + minDay);

      const batchNumber = start_number + i;
      const batchCode = `${batch_prefix}${batchNumber}`;
      const batchName = `${batch_prefix}${batchNumber}`;

      // 格式化日期为 YYYY-MM-DD
      const formattedStartDate = actualStartDate.toISOString().split('T')[0];

      // 检查批次编码是否已存在
      const [existingRows] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM production_batch_plans WHERE batch_code = ?',
        [batchCode]
      );

      if (existingRows.length > 0) {
        await connection.rollback();
        return res.status(400).json({ error: `批次编码 ${batchCode} 已存在` });
      }

      // 创建批次
      const insertQuery = `
        INSERT INTO production_batch_plans (
          batch_code, batch_name, template_id, project_code,
          planned_start_date, plan_status, description, notes
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)
      `;

      const [result]: any = await connection.execute(insertQuery, [
        batchCode,
        batchName,
        template_id,
        null,
        formattedStartDate,
        description || null,
        notes || null
      ]);

      const batchPlanId = result.insertId;

      // 生成批次操作计划
      await connection.execute('CALL generate_batch_operation_plans(?)', [batchPlanId]);

      createdBatches.push({
        id: batchPlanId,
        batch_code: batchCode,
        batch_name: batchName,
        day0_date: day0Date.toISOString().split('T')[0],
        planned_start_date: formattedStartDate
      });
    }

    await connection.commit();

    res.status(201).json({
      message: `成功创建 ${createdBatches.length} 个批次`,
      batches: createdBatches
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating batch plans in bulk:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: '批次编码已存在' });
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(400).json({ error: '无效的模版ID' });
    } else {
      res.status(500).json({ error: '批量创建批次失败' });
    }
  } finally {
    connection.release();
  }
};
