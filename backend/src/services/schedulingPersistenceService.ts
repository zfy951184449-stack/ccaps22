import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import pool from '../config/database';
import type {
  SchedulingRun,
  SchedulingRunStage,
  SchedulingRunEventStatus,
} from '../models/types';

// ----------- Types -----------

export interface CreateRunOptions {
  triggerType?: 'AUTO_PLAN' | 'RETRY' | 'MANUAL';
  periodStart: string;
  periodEnd: string;
  batchIds: number[];
  options?: Record<string, any>;
  createdBy?: number | null;
}

export interface SolverAssignment {
  operationPlanId: number;
  employeeId: number;
}

export interface SolverShiftPlan {
  employeeId: number;
  date: string;
  planType: string;
  planHours: number;
  shiftCode?: string | null;
  shiftName?: string | null;
  shiftId?: number | null;
  isNightShift?: boolean;
  operations?: Array<{
    operationPlanId: number;
    plannedStart: string;
    plannedEnd: string;
    durationMinutes: number;
  }>;
}

export interface SolverResult {
  status: string;
  summary: string;
  details?: {
    assignments?: SolverAssignment[];
    shiftPlans?: SolverShiftPlan[];
    skippedOperations?: number[];
    diagnostic?: any;
  };
}

export interface PersistenceResult {
  assignmentsInserted: number;
  shiftPlansInserted: number;
  warnings: string[];
}

// ----------- Error Classes -----------

export class SchedulingPersistenceError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ----------- Service -----------

export class SchedulingPersistenceService {
  /**
   * Create a new scheduling run record
   */
  static async createRun(options: CreateRunOptions): Promise<{ runId: number; runKey: string }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const runKey = randomUUID();
      const triggerType = options.triggerType || 'AUTO_PLAN';

      // Insert scheduling_runs
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO scheduling_runs 
          (run_key, trigger_type, status, period_start, period_end, options_json, created_by)
         VALUES (?, ?, 'DRAFT', ?, ?, ?, ?)`,
        [
          runKey,
          triggerType,
          options.periodStart,
          options.periodEnd,
          options.options ? JSON.stringify(options.options) : null,
          options.createdBy ?? null,
        ],
      );

      const runId = result.insertId;

      // Insert scheduling_run_batches
      if (options.batchIds.length > 0) {
        const batchValues: any[][] = [];
        for (const batchId of options.batchIds) {
          // Fetch batch info
          const [batchRows] = await connection.execute<RowDataPacket[]>(
            `SELECT 
               pbp.batch_code,
               MIN(bop.planned_start_datetime) as window_start,
               MAX(bop.planned_end_datetime) as window_end,
               COUNT(bop.id) as total_operations
             FROM production_batch_plans pbp
             LEFT JOIN batch_operation_plans bop ON bop.batch_plan_id = pbp.id
             WHERE pbp.id = ?
             GROUP BY pbp.id`,
            [batchId],
          );

          if (batchRows.length > 0) {
            const batch = batchRows[0];
            batchValues.push([
              runId,
              batchId,
              batch.batch_code || `BATCH-${batchId}`,
              batch.window_start || null,
              batch.window_end || null,
              batch.total_operations || 0,
            ]);
          }
        }

        if (batchValues.length > 0) {
          const placeholders = batchValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          const flatValues = batchValues.flat();
          await connection.execute(
            `INSERT INTO scheduling_run_batches 
              (run_id, batch_plan_id, batch_code, window_start, window_end, total_operations)
             VALUES ${placeholders}`,
            flatValues,
          );
        }
      }

      // Record initial event
      await SchedulingPersistenceService.recordEventInternal(
        connection,
        runId,
        'QUEUED',
        'INFO',
        '排班任务已创建',
        { batchCount: options.batchIds.length },
      );

      await connection.commit();

      return { runId, runKey };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Record an event for a scheduling run
   */
  static async recordEvent(
    runId: number,
    stage: SchedulingRunStage,
    status: SchedulingRunEventStatus,
    message: string,
    metadata?: any,
  ): Promise<void> {
    const eventKey = randomUUID();
    await pool.execute(
      `INSERT INTO scheduling_run_events 
        (run_id, event_key, stage, status, message, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, eventKey, stage, status, message, metadata ? JSON.stringify(metadata) : null],
    );
  }

  private static async recordEventInternal(
    connection: PoolConnection,
    runId: number,
    stage: SchedulingRunStage,
    status: SchedulingRunEventStatus,
    message: string,
    metadata?: any,
  ): Promise<void> {
    const eventKey = randomUUID();
    await connection.execute(
      `INSERT INTO scheduling_run_events 
        (run_id, event_key, stage, status, message, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, eventKey, stage, status, message, metadata ? JSON.stringify(metadata) : null],
    );
  }

  /**
   * Update run status
   */
  static async updateRunStatus(
    runId: number,
    status: SchedulingRun['status'],
    summary?: any,
    warnings?: string[],
  ): Promise<void> {
    const completedAt = ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(status)
      ? dayjs().format('YYYY-MM-DD HH:mm:ss')
      : null;

    await pool.execute(
      `UPDATE scheduling_runs
          SET status = ?,
              summary_json = COALESCE(?, summary_json),
              warnings_json = COALESCE(?, warnings_json),
              completed_at = COALESCE(?, completed_at),
              updated_at = NOW()
        WHERE id = ?`,
      [
        status,
        summary ? JSON.stringify(summary) : null,
        warnings ? JSON.stringify(warnings) : null,
        completedAt,
        runId,
      ],
    );
  }

  /**
   * Store solver result (without persisting to production tables)
   */
  static async storeResult(runId: number, result: SolverResult, createdBy?: number): Promise<void> {
    // Check if result already exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM scheduling_results WHERE run_id = ? AND result_state = 'DRAFT' LIMIT 1`,
      [runId],
    );

    const payload = {
      assignments: result.details?.assignments || [],
      shiftPlans: result.details?.shiftPlans || [],
      skippedOperations: result.details?.skippedOperations || [],
      diagnostic: result.details?.diagnostic || null,
    };

    if (existing.length > 0) {
      // Update existing
      await pool.execute(
        `UPDATE scheduling_results
            SET assignments_payload = ?,
                version = version + 1
          WHERE id = ?`,
        [JSON.stringify(payload), existing[0].id],
      );
    } else {
      // Insert new
      await pool.execute(
        `INSERT INTO scheduling_results 
          (run_id, result_state, version, assignments_payload, created_by)
         VALUES (?, 'DRAFT', 1, ?, ?)`,
        [runId, JSON.stringify(payload), createdBy ?? null],
      );
    }

    // Update run summary
    await SchedulingPersistenceService.updateRunStatus(runId, 'DRAFT', {
      status: result.status,
      summary: result.summary,
      assignmentsCount: result.details?.assignments?.length || 0,
      shiftPlansCount: result.details?.shiftPlans?.length || 0,
      skippedCount: result.details?.skippedOperations?.length || 0,
    });
  }

  /**
   * Apply solver result to production tables (batch_personnel_assignments & employee_shift_plans)
   */
  static async applyResult(runId: number): Promise<PersistenceResult> {
    const connection = await pool.getConnection();
    const warnings: string[] = [];

    try {
      await connection.beginTransaction();

      // Load the stored result
      const [resultRows] = await connection.execute<RowDataPacket[]>(
        `SELECT assignments_payload FROM scheduling_results 
         WHERE run_id = ? AND result_state = 'DRAFT' 
         ORDER BY version DESC LIMIT 1`,
        [runId],
      );

      if (resultRows.length === 0) {
        throw new SchedulingPersistenceError('NO_RESULT', '未找到待应用的排班结果');
      }

      let payload: any;
      try {
        payload =
          typeof resultRows[0].assignments_payload === 'string'
            ? JSON.parse(resultRows[0].assignments_payload)
            : resultRows[0].assignments_payload;
      } catch {
        throw new SchedulingPersistenceError('INVALID_PAYLOAD', '排班结果格式无效');
      }

      const assignments: SolverAssignment[] = payload.assignments || [];
      const shiftPlans: SolverShiftPlan[] = payload.shiftPlans || [];

      // Record event
      await SchedulingPersistenceService.recordEventInternal(
        connection,
        runId,
        'PERSISTING',
        'PROGRESS',
        '开始写入排班数据',
        { assignmentsCount: assignments.length, shiftPlansCount: shiftPlans.length },
      );

      // 1. Persist assignments to batch_personnel_assignments
      let assignmentsInserted = 0;
      for (const assignment of assignments) {
        try {
          await connection.execute(
            `INSERT INTO batch_personnel_assignments 
              (batch_operation_plan_id, employee_id, role, assignment_status, scheduling_run_id)
             VALUES (?, ?, 'OPERATOR', 'PLANNED', ?)
             ON DUPLICATE KEY UPDATE 
               assignment_status = 'PLANNED',
               scheduling_run_id = VALUES(scheduling_run_id)`,
            [assignment.operationPlanId, assignment.employeeId, runId],
          );
          assignmentsInserted++;
        } catch (err: any) {
          warnings.push(
            `分配失败: 操作${assignment.operationPlanId} → 员工${assignment.employeeId}: ${err.message}`,
          );
        }
      }

      // 2. Persist shift plans to employee_shift_plans
      let shiftPlansInserted = 0;

      // Build a map of shift_code to shift_id
      const [shiftDefRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, shift_code FROM shift_definitions WHERE is_active = 1`,
      );
      const shiftCodeToId: Record<string, number> = {};
      for (const row of shiftDefRows) {
        shiftCodeToId[row.shift_code] = row.id;
      }

      for (const plan of shiftPlans) {
        try {
          const planCategory = (plan.planType || 'BASE').toUpperCase();
          // Ensure shiftId is null (not undefined) if not found
          let shiftId: number | null = null;
          if (plan.shiftId != null) {
            shiftId = plan.shiftId;
          } else if (plan.shiftCode && shiftCodeToId[plan.shiftCode] != null) {
            shiftId = shiftCodeToId[plan.shiftCode];
          }

          // Find batch_operation_plan_id from operations (if available)
          let batchOperationPlanId: number | null = null;
          if (plan.operations && plan.operations.length > 0 && plan.operations[0].operationPlanId != null) {
            batchOperationPlanId = plan.operations[0].operationPlanId;
          }

          // Ensure all params are not undefined (use null instead)
          const employeeId = plan.employeeId ?? null;
          const planDate = plan.date ?? null;
          const planHours = plan.planHours ?? null;

          await connection.execute(
            `INSERT INTO employee_shift_plans 
              (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, 
               batch_operation_plan_id, scheduling_run_id, is_generated)
             VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE 
               shift_id = VALUES(shift_id),
               plan_category = VALUES(plan_category),
               plan_hours = VALUES(plan_hours),
               batch_operation_plan_id = COALESCE(VALUES(batch_operation_plan_id), batch_operation_plan_id),
               scheduling_run_id = VALUES(scheduling_run_id),
               updated_at = NOW()`,
            [
              employeeId,
              planDate,
              shiftId,
              planCategory,
              planHours,
              batchOperationPlanId,
              runId,
            ],
          );
          shiftPlansInserted++;
        } catch (err: any) {
          warnings.push(`班次计划失败: 员工${plan.employeeId} ${plan.date}: ${err.message}`);
        }
      }

      // Update scheduling_results to PUBLISHED
      await connection.execute(
        `UPDATE scheduling_results 
            SET result_state = 'PUBLISHED',
                published_at = NOW()
          WHERE run_id = ? AND result_state = 'DRAFT'`,
        [runId],
      );

      // Update run status
      await connection.execute(
        `UPDATE scheduling_runs
            SET status = 'PUBLISHED',
                completed_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [runId],
      );

      // Record completion event
      await SchedulingPersistenceService.recordEventInternal(
        connection,
        runId,
        'COMPLETED',
        'SUCCESS',
        '排班数据写入完成',
        { assignmentsInserted, shiftPlansInserted, warningsCount: warnings.length },
      );

      await connection.commit();

      return { assignmentsInserted, shiftPlansInserted, warnings };
    } catch (error) {
      await connection.rollback();

      // Record failure event
      try {
        await SchedulingPersistenceService.recordEvent(
          runId,
          'FAILED',
          'ERROR',
          `写入失败: ${(error as Error).message}`,
        );
        await SchedulingPersistenceService.updateRunStatus(runId, 'FAILED');
      } catch {
        // Ignore secondary errors
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get run by ID
   */
  static async getRunById(runId: number): Promise<SchedulingRun | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM scheduling_runs WHERE id = ?`,
      [runId],
    );
    return rows.length > 0 ? (rows[0] as SchedulingRun) : null;
  }

  /**
   * Get stored result for a run
   */
  static async getStoredResult(runId: number): Promise<any | null> {
    // Use subquery to avoid sorting large payload data
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.assignments_payload, r.result_state, r.version, r.published_at 
       FROM scheduling_results r
       INNER JOIN (
         SELECT MAX(version) as max_version 
         FROM scheduling_results 
         WHERE run_id = ?
       ) latest ON r.version = latest.max_version
       WHERE r.run_id = ?`,
      [runId, runId],
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    let payload: any;
    try {
      payload =
        typeof row.assignments_payload === 'string'
          ? JSON.parse(row.assignments_payload)
          : row.assignments_payload;
    } catch {
      payload = {};
    }

    return {
      ...payload,
      resultState: row.result_state,
      version: row.version,
      publishedAt: row.published_at,
    };
  }
}

export default SchedulingPersistenceService;

