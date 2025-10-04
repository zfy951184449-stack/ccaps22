import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import dayjs from 'dayjs';
import pool from '../config/database';

export type BatchLifecycleAction = 'ACTIVATE' | 'DEACTIVATE' | 'DELETE';

interface LifecycleOptions {
  color?: string | null;
  operatorId?: number | null;
  force?: boolean;
}

export interface LifecycleResult {
  batchId: number;
  action: BatchLifecycleAction;
  status: 'SUCCESS' | 'NOOP';
  warnings: string[];
  details: Record<string, any>;
}

interface BatchRow extends RowDataPacket {
  id: number;
  batch_code: string;
  plan_status: string;
  activated_at: Date | null;
  activated_by: number | null;
  batch_color: string | null;
  template_id: number;
}

export class BatchLifecycleService {
  static async activate(batchId: number, options: LifecycleOptions = {}): Promise<LifecycleResult> {
    const connection = await pool.getConnection();
    const warnings: string[] = [];

    try {
      await connection.beginTransaction();

      const batch = await BatchLifecycleService.loadBatchForUpdate(connection, batchId);
      if (!batch) {
        throw new BatchLifecycleError('BATCH_NOT_FOUND', '批次不存在或已删除');
      }

      if (batch.plan_status !== 'APPROVED') {
        throw new BatchLifecycleError('INVALID_STATUS', '只有已批准的批次才能激活');
      }

      const residuals = await BatchLifecycleService.detectResidualSchedulingData(connection, batchId);
      if (residuals.hasResidual) {
        warnings.push('发现历史排班数据残留，执行激活前已自动清理。');
        await BatchLifecycleService.cleanupAutoSchedulingData(connection, batchId, residuals);
      }

      await BatchLifecycleService.callActivateProcedure(connection, batchId, options.operatorId ?? null, options.color ?? null);

      await connection.commit();

      return {
        batchId,
        action: 'ACTIVATE',
        status: 'SUCCESS',
        warnings,
        details: {
          activated_at: dayjs().toISOString(),
          activated_by: options.operatorId ?? null,
        },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async deactivate(batchId: number, options: LifecycleOptions = {}): Promise<LifecycleResult> {
    const connection = await pool.getConnection();
    const warnings: string[] = [];

    try {
      await connection.beginTransaction();

      const batch = await BatchLifecycleService.loadBatchForUpdate(connection, batchId);
      if (!batch) {
        throw new BatchLifecycleError('BATCH_NOT_FOUND', '批次不存在或已删除');
      }

      if (batch.plan_status !== 'ACTIVATED') {
        return {
          batchId,
          action: 'DEACTIVATE',
          status: 'NOOP',
          warnings: ['批次未处于激活状态，无需撤销。'],
          details: {},
        };
      }

      const residuals = await BatchLifecycleService.detectResidualSchedulingData(connection, batchId);
      if (!residuals.hasResidual) {
        warnings.push('未检测到自动排班数据残留，继续撤销激活。');
      }

      await BatchLifecycleService.cleanupAutoSchedulingData(connection, batchId, residuals);
      await BatchLifecycleService.resetActivationState(connection, batchId);

      await connection.commit();

      return {
        batchId,
        action: 'DEACTIVATE',
        status: 'SUCCESS',
        warnings,
        details: {
          deactivated_at: dayjs().toISOString(),
        },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async remove(batchId: number, options: LifecycleOptions = {}): Promise<LifecycleResult> {
    const connection = await pool.getConnection();
    const warnings: string[] = [];

    try {
      await connection.beginTransaction();

      const batch = await BatchLifecycleService.loadBatchForUpdate(connection, batchId);
      if (!batch) {
        throw new BatchLifecycleError('BATCH_NOT_FOUND', '批次不存在或已删除');
      }

      if (batch.plan_status === 'ACTIVATED') {
        await BatchLifecycleService.cleanupAutoSchedulingData(connection, batchId);
        await BatchLifecycleService.resetActivationState(connection, batchId);
        warnings.push('批次处于激活态，删除前已自动撤销并清理排班数据。');
      }

      const residuals = await BatchLifecycleService.detectResidualSchedulingData(connection, batchId);
      if (residuals.hasResidual && !options.force) {
        throw new BatchLifecycleError(
          'RESIDUAL_DATA',
          '检测到排班数据残留，请先撤销激活并确认清理，或在删除时启用 force 选项。',
          residuals.summary,
        );
      }

      if (residuals.hasResidual && options.force) {
        warnings.push('删除操作启用 force，将强制清理全部自动排班数据。');
        await BatchLifecycleService.cleanupAutoSchedulingData(connection, batchId, residuals);
      }

      await BatchLifecycleService.deleteBatchArtifacts(connection, batchId);

      await connection.commit();

      return {
        batchId,
        action: 'DELETE',
        status: 'SUCCESS',
        warnings,
        details: {
          deleted_at: dayjs().toISOString(),
        },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private static async loadBatchForUpdate(connection: PoolConnection, batchId: number): Promise<BatchRow | null> {
    const [rows] = await connection.execute<BatchRow[]>(
      `SELECT id, batch_code, plan_status, activated_at, activated_by, batch_color, template_id
         FROM production_batch_plans
        WHERE id = ?
        FOR UPDATE`,
      [batchId],
    );
    return rows.length ? rows[0] : null;
  }

  private static async detectResidualSchedulingData(connection: PoolConnection, batchId: number) {
    const summary: Record<string, number> = {};

    const [operationRows] = await connection.execute<RowDataPacket[]>(
      `SELECT bop.id
         FROM batch_operation_plans bop
        WHERE bop.batch_plan_id = ?`,
      [batchId],
    );

    const operationIds = operationRows.map((row) => Number(row.id));
    if (!operationIds.length) {
      return {
        hasResidual: false,
        summary,
        operationIds,
        shiftPlanIds: [] as number[],
      };
    }

    const opPlaceholders = operationIds.map(() => '?').join(',');

    const [assignmentRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
         FROM batch_personnel_assignments
        WHERE batch_operation_plan_id IN (${opPlaceholders})`,
      operationIds,
    );
    summary.batch_personnel_assignments = Number(assignmentRows[0].count || 0);

    const [shiftPlanRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
         FROM employee_shift_plans
        WHERE batch_operation_plan_id IN (${opPlaceholders})`,
      operationIds,
    );
    const shiftPlanIds = shiftPlanRows.map((row) => Number(row.id));
    summary.employee_shift_plans = shiftPlanIds.length;

    if (shiftPlanIds.length) {
      const shiftPlaceholders = shiftPlanIds.map(() => '?').join(',');

      const [shiftChangeRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
           FROM shift_change_logs
          WHERE shift_plan_id IN (${shiftPlaceholders})`,
        shiftPlanIds,
      );
      summary.shift_change_logs = Number(shiftChangeRows[0].count || 0);

      const [overtimeRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
           FROM overtime_records
          WHERE related_shift_plan_id IN (${shiftPlaceholders})`,
        shiftPlanIds,
      );
      summary.overtime_by_shift = Number(overtimeRows[0].count || 0);

      const [scheduleRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
           FROM personnel_schedules ps
           JOIN employee_shift_plans esp ON ps.employee_id = esp.employee_id
                                        AND ps.schedule_date = esp.plan_date
          WHERE esp.id IN (${shiftPlaceholders})
            AND ps.notes = 'AUTO_GENERATED'`,
        shiftPlanIds,
      );
      summary.personnel_schedules = Number(scheduleRows[0].count || 0);
    }

    const hasResidual = Object.values(summary).some((count) => count > 0);

    return {
      hasResidual,
      summary,
      operationIds,
      shiftPlanIds,
    };
  }

  private static async cleanupAutoSchedulingData(
    connection: PoolConnection,
    batchId: number,
    diagnostics?: {
      operationIds: number[];
      shiftPlanIds: number[];
      summary?: Record<string, number>;
    },
  ) {
    const operationIds = diagnostics?.operationIds;
    if (!operationIds || !operationIds.length) {
      return;
    }

    const opPlaceholders = operationIds.map(() => '?').join(',');

    if (diagnostics?.shiftPlanIds?.length) {
      const shiftPlaceholders = diagnostics.shiftPlanIds.map(() => '?').join(',');

      await connection.execute(
        `DELETE FROM shift_change_logs WHERE shift_plan_id IN (${shiftPlaceholders})`,
        diagnostics.shiftPlanIds,
      );

      await connection.execute(
        `DELETE FROM overtime_records WHERE related_shift_plan_id IN (${shiftPlaceholders})`,
        diagnostics.shiftPlanIds,
      );

      await connection.execute(
        `DELETE ps FROM personnel_schedules ps
              JOIN employee_shift_plans esp ON ps.employee_id = esp.employee_id
                                          AND ps.schedule_date = esp.plan_date
             WHERE ps.notes = 'AUTO_GENERATED'
               AND esp.id IN (${shiftPlaceholders})`,
        diagnostics.shiftPlanIds,
      );

      await connection.execute(
        `DELETE FROM employee_shift_plans WHERE id IN (${shiftPlaceholders})`,
        diagnostics.shiftPlanIds,
      );
    }

    await connection.execute(
      `DELETE FROM batch_personnel_assignments WHERE batch_operation_plan_id IN (${opPlaceholders})`,
      operationIds,
    );

    await connection.execute(
      `DELETE FROM overtime_records WHERE related_operation_plan_id IN (${opPlaceholders})`,
      operationIds,
    );
  }

  private static async resetActivationState(connection: PoolConnection, batchId: number) {
    await connection.execute(
      `UPDATE production_batch_plans
          SET plan_status = 'APPROVED',
              activated_at = NULL,
              activated_by = NULL,
              batch_color = NULL,
              updated_at = NOW()
        WHERE id = ?`,
      [batchId],
    );
  }

  private static async callActivateProcedure(
    connection: PoolConnection,
    batchId: number,
    operatorId: number | null,
    color: string | null,
  ) {
    await connection.execute('CALL activate_batch_plan(?, ?, ?)', [batchId, operatorId ?? null, color ?? null]);
  }

  private static async deleteBatchArtifacts(connection: PoolConnection, batchId: number) {
    const [operationRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM batch_operation_plans WHERE batch_plan_id = ?`,
      [batchId],
    );
    const operationIds = operationRows.map((row) => Number(row.id));

    if (operationIds.length) {
      const placeholders = operationIds.map(() => '?').join(',');

      await connection.execute(
        `DELETE FROM batch_operation_constraints WHERE batch_operation_plan_id IN (${placeholders})`,
        operationIds,
      );

      try {
        await connection.execute(
          `DELETE FROM operation_run_logs WHERE batch_operation_plan_id IN (${placeholders})`,
          operationIds,
        );
      } catch (error: any) {
        if (error?.code !== 'ER_NO_SUCH_TABLE') {
          throw error;
        }
      }
    }

    await connection.execute('DELETE FROM batch_operation_plans WHERE batch_plan_id = ?', [batchId]);
    await connection.execute('DELETE FROM production_batch_plans WHERE id = ?', [batchId]);
  }
}

export class BatchLifecycleError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export default BatchLifecycleService;
