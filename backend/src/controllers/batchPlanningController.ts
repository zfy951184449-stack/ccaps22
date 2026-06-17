import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import pool from '../config/database';
import BatchLifecycleService, { BatchLifecycleError } from '../services/batchLifecycleService';
import { generateBatchOperationPlansWithResources } from '../services/batchOperationGenerationService';
import { MfgTemplatePackageService } from '../services/mfgTemplatePackageService';
import { TEMPLATE_MIN_DAY_SQL, getTemplateMinDay } from '../services/templateDayOffsetService';

// 只有 DRAFT 状态的批次可以通过 API 直接修改，ACTIVATED 需要通过生命周期接口
const MUTABLE_BATCH_STATUSES = new Set(['DRAFT']);

// planned_start_date 列存「最早工序日」(= Day0 + min_day)，day0_date 是面向用户的基准日。
// 读侧统一经此片段换算回 Day0；写侧统一经 resolvePlannedStartDate 换算入库。
const DAY0_DATE_SELECT = `DATE_FORMAT(DATE_SUB(pbp.planned_start_date, INTERVAL COALESCE(tmd.min_day, 0) DAY), '%Y-%m-%d') AS day0_date`;
const TEMPLATE_MIN_DAY_JOIN = `LEFT JOIN (${TEMPLATE_MIN_DAY_SQL} GROUP BY ps.template_id) tmd ON tmd.template_id = pbp.template_id`;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class InvalidDay0DateError extends Error {}

// 写入口统一换算：优先 day0_date（新契约，按当前模板 min_day 推回最早工序日），
// 兼容仅传 planned_start_date 的旧调用方（视为最早工序日原样入库）。
const resolvePlannedStartDate = async (
  executor: { execute: typeof pool.execute },
  input: { day0_date?: unknown; planned_start_date?: unknown; template_id: number },
): Promise<string | null> => {
  if (input.day0_date !== undefined && input.day0_date !== null && input.day0_date !== '') {
    const day0 = String(input.day0_date);
    if (!DATE_ONLY_PATTERN.test(day0) || !dayjs(day0).isValid()) {
      throw new InvalidDay0DateError(`非法的基准日期: ${day0}`);
    }
    const minDay = await getTemplateMinDay(executor, input.template_id);
    return dayjs(day0).add(minDay, 'day').format('YYYY-MM-DD');
  }

  if (input.planned_start_date !== undefined && input.planned_start_date !== null && input.planned_start_date !== '') {
    return String(input.planned_start_date);
  }

  return null;
};

// 换模板 / 改开工日会触发存储过程「删旧建新」批次操作计划(DELETE FROM batch_operation_plans)。
// 以下三张表用「无 ON DELETE」的硬外键回引 batch_operation_plans(id)(默认 RESTRICT),
// 一旦该批次已被排班/加班/冲突记录引用,DELETE 会抛 ER_ROW_IS_REFERENCED_2(1451) → 整事务回滚为 500。
// 换模板前先体检,给出可读拦截而非裸 500。各环境为手动迁移、可能缺表,缺表则跳过(由 catch 中的 1451 分支兜底)。
const BATCH_OP_PLAN_REFERENCERS: ReadonlyArray<{ table: string; column: string; label: string }> = [
  { table: 'employee_shift_plans', column: 'batch_operation_plan_id', label: '排班' },
  { table: 'overtime_records', column: 'related_operation_plan_id', label: '加班记录' },
  { table: 'aps_constraint_conflicts', column: 'batch_operation_plan_id', label: '约束冲突' },
];

const findBlockingReferences = async (
  executor: { execute: typeof pool.execute },
  batchPlanId: number,
): Promise<Array<{ label: string; count: number }>> => {
  const blocking: Array<{ label: string; count: number }> = [];
  for (const ref of BATCH_OP_PLAN_REFERENCERS) {
    try {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt
           FROM \`${ref.table}\` r
           JOIN batch_operation_plans bop ON r.\`${ref.column}\` = bop.id
          WHERE bop.batch_plan_id = ?`,
        [batchPlanId],
      );
      const count = Number(rows[0]?.cnt ?? 0);
      if (count > 0) blocking.push({ label: ref.label, count });
    } catch (err: any) {
      // 该环境未建此表(手动迁移可能缺表)时跳过;真正的 FK 阻塞仍由 catch 中的 1451 分支兜底。
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  return blocking;
};

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
    const { status, start_date, end_date } = req.query;

    let query = `
      SELECT 
        pbp.id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.template_id,
        pbp.mfg_package_id,
        pkg.package_code AS mfg_package_code,
        pkg.package_name AS mfg_package_name,
        pt.template_name,
        ou.id as team_id,
        ou.unit_code as team_code,
        ou.unit_name as team_name,
        pbp.project_code,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        ${DAY0_DATE_SELECT},
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
      LEFT JOIN mfg_template_packages pkg ON pbp.mfg_package_id = pkg.id
      LEFT JOIN organization_units ou ON pt.team_id = ou.id
      ${TEMPLATE_MIN_DAY_JOIN}
      WHERE 1=1
    `;

    const params: any[] = [];

    // 状态过滤
    if (status && typeof status === 'string') {
      query += ` AND pbp.plan_status = ?`;
      params.push(status.toUpperCase());
    }

    // 日期范围过滤: 批次的计划日期与请求范围有交集
    if (start_date && end_date && typeof start_date === 'string' && typeof end_date === 'string') {
      // 批次在范围内: planned_start_date <= end_date AND planned_end_date >= start_date
      query += ` AND pbp.planned_start_date <= ? AND pbp.planned_end_date >= ?`;
      params.push(end_date, start_date);
    }

    query += ` ORDER BY pbp.created_at DESC`;

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching batch plans:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch batch plans' });
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
        pbp.mfg_package_id,
        pkg.package_code AS mfg_package_code,
        pkg.package_name AS mfg_package_name,
        pt.template_name,
        pbp.project_code,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        ${DAY0_DATE_SELECT},
        pbp.template_duration_days,
        pbp.plan_status,
        pbp.description,
        pbp.notes,
        pbp.created_at,
        pbp.updated_at
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      LEFT JOIN mfg_template_packages pkg ON pbp.mfg_package_id = pkg.id
      ${TEMPLATE_MIN_DAY_JOIN}
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
      day0_date,
      plan_status = 'DRAFT',
      description,
      notes
    } = req.body;
    const normalizedStatus = (plan_status || 'DRAFT').toString().toUpperCase();
    if (!MUTABLE_BATCH_STATUSES.has(normalizedStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: '非法的批次状态，请通过生命周期接口激活批次' });
    }

    const resolvedStartDate = await resolvePlannedStartDate(connection, {
      day0_date,
      planned_start_date,
      template_id: Number(template_id),
    });
    if (!resolvedStartDate) {
      await connection.rollback();
      return res.status(400).json({ error: '缺少基准日期 (day0_date)' });
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
      resolvedStartDate,
      normalizedStatus,
      description || null,
      notes || null
    ]);

    const batchPlanId = result.insertId;

    await generateBatchOperationPlansWithResources(connection, batchPlanId);

    await connection.commit();

    // Fetch the created batch plan with all calculated fields
    const [newBatch] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        pbp.*,
        pt.template_name,
        pkg.package_code AS mfg_package_code,
        pkg.package_name AS mfg_package_name,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        ${DAY0_DATE_SELECT}
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      LEFT JOIN mfg_template_packages pkg ON pbp.mfg_package_id = pkg.id
      ${TEMPLATE_MIN_DAY_JOIN}
      WHERE pbp.id = ?`,
      [batchPlanId]
    );

    res.status(201).json(newBatch[0]);
  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating batch plan:', error);

    if (error instanceof InvalidDay0DateError) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ER_DUP_ENTRY') {
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

export const createBatchPlanFromMfgPackage = async (req: Request, res: Response) => {
  try {
    const {
      mfg_package_id,
      batch_code,
      batch_name,
      planned_start_date,
      project_code,
      description,
      notes,
    } = req.body;

    if (!mfg_package_id || !batch_code || !batch_name || !planned_start_date) {
      return res.status(400).json({ error: '缺少总包批次生成参数' });
    }

    const batch = await MfgTemplatePackageService.createBatchFromPackage({
      mfg_package_id: Number(mfg_package_id),
      batch_code: String(batch_code).trim(),
      batch_name: String(batch_name).trim(),
      planned_start_date: String(planned_start_date),
      project_code: project_code ?? null,
      description: description ?? null,
      notes: notes ?? null,
    });

    res.status(201).json(batch);
  } catch (error: any) {
    console.error('Error creating batch plan from MFG package:', error);

    if (error?.message?.includes('MFG_PACKAGE_NOT_FOUND')) {
      return res.status(404).json({ error: '总包不存在' });
    }
    if (error?.message?.includes('MFG_PACKAGE_DAY_LINK_CONFLICT')) {
      return res.status(409).json({ error: '总包 Day 锚点存在冲突，不能生成批次' });
    }
    if (error?.message?.includes('MFG_PACKAGE_WITHOUT_OPERATIONS')) {
      return res.status(400).json({ error: '总包没有可生成的工序' });
    }
    if (error?.message?.includes('MFG_PACKAGE_BATCH_CODE_TOO_LONG')) {
      return res.status(400).json({ error: '批次编码过长，请缩短命名前缀或序号' });
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Batch code already exists' });
    }

    res.status(500).json({ error: 'Failed to create batch plan from MFG package' });
  }
};

export const createBatchPlansFromMfgPackageInBulk = async (req: Request, res: Response) => {
  try {
    const {
      mfg_package_id,
      base_start_date,
      base_end_date,
      interval_days,
      batch_prefix,
      start_number,
      batch_number_length,
      project_code,
      description,
      notes,
    } = req.body;

    if (
      !mfg_package_id ||
      !base_start_date ||
      !base_end_date ||
      !interval_days ||
      !batch_prefix ||
      start_number === undefined
    ) {
      return res.status(400).json({ error: '缺少总包批量生成参数' });
    }

    const result = await MfgTemplatePackageService.createBulkBatchesFromPackage({
      mfg_package_id: Number(mfg_package_id),
      base_start_date: String(base_start_date),
      base_end_date: String(base_end_date),
      interval_days: Number(interval_days),
      batch_prefix: String(batch_prefix).trim(),
      start_number: Number(start_number),
      batch_number_length: batch_number_length === undefined ? undefined : Number(batch_number_length),
      project_code: project_code ?? null,
      description: description ?? null,
      notes: notes ?? null,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error bulk creating batch plans from MFG package:', error);

    if (error?.message?.includes('MFG_PACKAGE_NOT_FOUND')) {
      return res.status(404).json({ error: '总包不存在' });
    }
    if (error?.message?.includes('MFG_PACKAGE_DAY_LINK_CONFLICT')) {
      return res.status(409).json({ error: '总包 Day 锚点存在冲突，不能生成批次' });
    }
    if (error?.message?.includes('MFG_PACKAGE_WITHOUT_OPERATIONS')) {
      return res.status(400).json({ error: '总包没有可生成的工序' });
    }
    if (error?.message?.includes('MFG_PACKAGE_BULK_EMPTY_RANGE') || error?.message?.includes('MFG_PACKAGE_BULK_INVALID_PARAMS')) {
      return res.status(400).json({ error: '总包批量生成参数不正确' });
    }
    if (error?.message?.includes('MFG_PACKAGE_BULK_TOO_LARGE')) {
      return res.status(400).json({ error: '单次批量生成不能超过 500 个批次' });
    }
    if (error?.message?.includes('MFG_PACKAGE_BATCH_CODE_TOO_LONG')) {
      return res.status(400).json({ error: '批次编码过长，请缩短命名前缀或序号' });
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '批次编码已存在' });
    }

    res.status(500).json({ error: 'Failed to bulk create batch plans from MFG package' });
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
      day0_date,
      plan_status,
      description,
      notes
    } = req.body;
    // 前端二次确认后回传：允许在清空下游排班数据后强制按新模板重建。
    const forceRebuild = req.body?.force_rebuild === true || req.body?.force_rebuild === 'true';

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
    // day0_date 按目标模板（可能刚被替换）的 min_day 换算，确保「换模板但 Day0 不变」时
    // 各工序仍锚定同一基准日，而不是沿用旧模板偏移出来的最早工序日
    const nextPlannedStartDate =
      (await resolvePlannedStartDate(connection, {
        day0_date,
        planned_start_date,
        template_id: Number(nextTemplateId),
      })) ?? existingPlan.planned_start_date;

    if (
      existingStatus === 'ACTIVATED' &&
      (Number(existingPlan.template_id) !== Number(nextTemplateId) || existingPlan.planned_start_date !== nextPlannedStartDate)
    ) {
      await connection.rollback();
      return res.status(409).json({ error: '激活中的批次禁止直接修改模板或开工日期，请先撤销激活。' });
    }

    const templateChanged = Number(existingPlan.template_id) !== Number(nextTemplateId);
    const plannedStartChanged = String(existingPlan.planned_start_date) !== String(nextPlannedStartDate);

    // 换模板 / 改开工日会让存储过程「删旧建新」批次操作计划。若该批次已被排班/加班/冲突记录等
    // 下游硬外键(无 ON DELETE = RESTRICT)引用,删除会抛 1451。先体检:未确认则要求前端二次确认,
    // 已确认(force_rebuild)则像「撤销激活」一样清空这些下游数据,使随后的重建不被外键阻塞。
    if (templateChanged || plannedStartChanged) {
      const blocking = await findBlockingReferences(connection, Number(id));
      if (blocking.length > 0) {
        if (!forceRebuild) {
          await connection.rollback();
          const detail = blocking.map((b) => `${b.label} ${b.count} 条`).join('、');
          return res.status(409).json({
            error: `该批次已存在排班/加班/冲突等下游数据(${detail})。更换模板或调整开工日期会清空这些数据并按新模板重建,请确认。`,
            requiresConfirmation: true,
            details: { blocking },
          });
        }
        await BatchLifecycleService.clearSchedulingArtifactsForRebuild(connection, Number(id));
      }
    }

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
      await generateBatchOperationPlansWithResources(connection, Number(id));
    }

    await connection.commit();

    // Fetch updated batch plan
    const [updatedBatch] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        pbp.*,
        pt.template_name,
        pkg.package_code AS mfg_package_code,
        pkg.package_name AS mfg_package_name,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') as planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') as planned_end_date,
        ${DAY0_DATE_SELECT}
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      LEFT JOIN mfg_template_packages pkg ON pbp.mfg_package_id = pkg.id
      ${TEMPLATE_MIN_DAY_JOIN}
      WHERE pbp.id = ?`,
      [id]
    );

    res.json(updatedBatch[0]);
  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating batch plan:', error);

    if (error instanceof InvalidDay0DateError) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Batch code already exists' });
    } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      // 重建批次操作计划时,旧行被排班/加班/冲突记录等硬外键引用,DELETE 被拒。
      // 体检漏网(如缺表跳过)或并发新增引用时的兜底,转成可读 409 而非裸 500。
      res.status(409).json({ error: '该批次已被排班/加班/冲突记录引用,更换模板或调整开工日期前请先撤销相关排班。' });
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

    const minDay = await getTemplateMinDay(pool, Number(templateId));
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
      batch_number_length,
      description,
      notes
    } = req.body;

    // 参数验证
    if (!template_id || !day0_start_date || !day0_end_date || !interval_days || !batch_prefix || start_number === undefined) {
      await connection.rollback();
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 获取模版的day0偏移量
    const minDay = await getTemplateMinDay(connection, Number(template_id));

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
      const batchNumberText = String(batchNumber).padStart(Number(batch_number_length ?? 0) || 0, '0');
      const batchCode = `${batch_prefix}${batchNumberText}`;
      const batchName = batchCode;

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

      await generateBatchOperationPlansWithResources(connection, batchPlanId);

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

export const getBatchOperationsTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        bop.id as operation_plan_id,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        o.operation_name,
        COALESCE(ps.id, 0) as stage_id,
        COALESCE(ps.stage_name, '默认阶段') as stage_name
      FROM batch_operation_plans bop
      LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      LEFT JOIN process_stages ps ON sos.stage_id = ps.id
      LEFT JOIN operations o ON bop.operation_id = o.id
      WHERE bop.batch_plan_id = ? AND COALESCE(bop.is_independent, 0) = 0
      ORDER BY ps.stage_order ASC, bop.planned_start_datetime ASC
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);

    // Group by stage
    const stagesMap = new Map<number, any>();

    for (const row of rows) {
      if (!stagesMap.has(row.stage_id)) {
        stagesMap.set(row.stage_id, {
          stage_id: row.stage_id,
          stage_name: row.stage_name,
          operations: []
        });
      }

      stagesMap.get(row.stage_id).operations.push({
        operation_plan_id: row.operation_plan_id,
        operation_name: row.operation_name,
        planned_start_datetime: row.planned_start_datetime,
        planned_end_datetime: row.planned_end_datetime
      });
    }

    res.json(Array.from(stagesMap.values()));
  } catch (error) {
    console.error('Error fetching batch operations tree:', error);
    res.status(500).json({ error: 'Failed to fetch operations tree' });
  }
};
