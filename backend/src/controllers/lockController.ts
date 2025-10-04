import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

const OPERATION_LOCK_REASON = 'OPERATION_LOCK';

const sanitizeReason = (reason?: string): string | null => {
  if (!reason) {
    return null;
  }
  return reason.length > 255 ? reason.slice(0, 255) : reason;
};

const normalizeLockedBy = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const lockShiftPlan = async (req: Request, res: Response) => {
  const shiftPlanId = Number(req.params.shiftPlanId);
  if (!Number.isFinite(shiftPlanId) || shiftPlanId <= 0) {
    res.status(400).json({ error: 'shiftPlanId must be a positive number' });
    return;
  }

  const lockedBy = normalizeLockedBy(req.body?.lockedBy);
  const reason = sanitizeReason(req.body?.reason) ?? '手动锁定';

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE employee_shift_plans
          SET plan_state = 'LOCKED',
              is_locked = 1,
              locked_by = ?,
              locked_at = NOW(),
              lock_reason = ?
        WHERE id = ?`,
      [lockedBy, reason, shiftPlanId],
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM employee_shift_plans WHERE id = ?',
        [shiftPlanId],
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Shift plan not found' });
        return;
      }
    }

    res.json({ message: 'Shift plan locked successfully', locked: true });
  } catch (error) {
    console.error('[LockController] lockShiftPlan failed:', error);
    res.status(500).json({ error: 'Failed to lock shift plan' });
  }
};

export const unlockShiftPlan = async (req: Request, res: Response) => {
  const shiftPlanId = Number(req.params.shiftPlanId);
  if (!Number.isFinite(shiftPlanId) || shiftPlanId <= 0) {
    res.status(400).json({ error: 'shiftPlanId must be a positive number' });
    return;
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE employee_shift_plans
          SET plan_state = 'PLANNED',
              is_locked = 0,
              locked_by = NULL,
              locked_at = NULL,
              lock_reason = NULL
        WHERE id = ?`,
      [shiftPlanId],
    );

    if (result.affectedRows === 0) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM employee_shift_plans WHERE id = ?',
        [shiftPlanId],
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Shift plan not found' });
        return;
      }
    }

    res.json({ message: 'Shift plan unlocked successfully', locked: false });
  } catch (error) {
    console.error('[LockController] unlockShiftPlan failed:', error);
    res.status(500).json({ error: 'Failed to unlock shift plan' });
  }
};

export const lockOperationPlan = async (req: Request, res: Response) => {
  const operationPlanId = Number(req.params.operationId);
  if (!Number.isFinite(operationPlanId) || operationPlanId <= 0) {
    res.status(400).json({ error: 'operationPlanId must be a positive number' });
    return;
  }

  const lockedBy = normalizeLockedBy(req.body?.lockedBy);
  const reason = sanitizeReason(req.body?.reason) ?? '手动锁定';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE batch_operation_plans
          SET is_locked = 1,
              locked_by = ?,
              locked_at = NOW(),
              lock_reason = ?
        WHERE id = ?`,
      [lockedBy, reason, operationPlanId],
    );

    if (result.affectedRows === 0) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM batch_operation_plans WHERE id = ?',
        [operationPlanId],
      );
      if (!rows.length) {
        await connection.rollback();
        res.status(404).json({ error: 'Operation plan not found' });
        return;
      }
    }

    await connection.execute(
      `UPDATE employee_shift_plans
          SET plan_state = 'LOCKED',
              is_locked = 1,
              locked_by = COALESCE(?, locked_by),
              locked_at = NOW(),
              lock_reason = ?
        WHERE batch_operation_plan_id = ?
          AND IFNULL(is_locked, 0) = 0`,
      [lockedBy, OPERATION_LOCK_REASON, operationPlanId],
    );

    await connection.commit();
    res.json({ message: 'Operation locked successfully', locked: true });
  } catch (error) {
    await connection.rollback();
    console.error('[LockController] lockOperationPlan failed:', error);
    res.status(500).json({ error: 'Failed to lock operation plan' });
  } finally {
    connection.release();
  }
};

export const unlockOperationPlan = async (req: Request, res: Response) => {
  const operationPlanId = Number(req.params.operationId);
  if (!Number.isFinite(operationPlanId) || operationPlanId <= 0) {
    res.status(400).json({ error: 'operationPlanId must be a positive number' });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE batch_operation_plans
          SET is_locked = 0,
              locked_by = NULL,
              locked_at = NULL,
              lock_reason = NULL
        WHERE id = ?`,
      [operationPlanId],
    );

    if (result.affectedRows === 0) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM batch_operation_plans WHERE id = ?',
        [operationPlanId],
      );
      if (!rows.length) {
        await connection.rollback();
        res.status(404).json({ error: 'Operation plan not found' });
        return;
      }
    }

    await connection.execute(
      `UPDATE employee_shift_plans
          SET plan_state = 'PLANNED',
              is_locked = 0,
              locked_by = NULL,
              locked_at = NULL,
              lock_reason = NULL
        WHERE batch_operation_plan_id = ?
          AND lock_reason = ?`,
      [operationPlanId, OPERATION_LOCK_REASON],
    );

    await connection.commit();
    res.json({ message: 'Operation unlocked successfully', locked: false });
  } catch (error) {
    await connection.rollback();
    console.error('[LockController] unlockOperationPlan failed:', error);
    res.status(500).json({ error: 'Failed to unlock operation plan' });
  } finally {
    connection.release();
  }
};
