import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/database';

interface AssignmentCreateInput {
  employeeId: number;
  unitId: number;
  roleId: number;
  isPrimary?: boolean; // Ignored in single-unit mode (always primary)
  effectiveFrom?: string; // Stored in employees or ignored if no field? (employees has no effective_from, maybe ignore for now or add column if needed? Schema implies employees has no effective_from. We will ignore date fields for now or just log them as legacy).
  effectiveTo?: string | null;
}

interface AssignmentUpdateInput {
  unitId?: number;
  isPrimary?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

const ensureConnection = async (connection?: PoolConnection) => {
  if (connection) {
    return connection;
  }
  return pool.getConnection();
};

const releaseConnection = (connection?: PoolConnection, managed = false) => {
  if (connection && managed) {
    connection.release();
  }
};

export const createAssignment = async (input: AssignmentCreateInput) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    // In single-unit mode, "creating" an assignment just means updating the employee record
    // We overwrite whatever was there.
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE employees
          SET unit_id = ?,
              primary_role_id = ?
        WHERE id = ?`,
      [input.unitId, input.roleId, input.employeeId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Employee not found');
    }

    // Return employeeId as the "assignmentId" since they are 1:1
    return input.employeeId;
  } finally {
    releaseConnection(connection, managed);
  }
};

export const updateAssignment = async (
  assignmentId: number,
  employeeId: number | undefined,
  updates: AssignmentUpdateInput,
) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    // In single-unit mode, assignmentId IS the employeeId (conceptually)
    // But if provided employeeId differs, we should respect employeeId.
    const targetId = employeeId || assignmentId;

    const fields: string[] = [];
    const params: Array<number | string | null> = [];

    if (updates.unitId !== undefined) {
      fields.push('unit_id = ?');
      params.push(updates.unitId);
    }

    // Note: roleId is not in AssignmentUpdateInput currently (it was passed as separate call or not updatable via this specific function in legacy code?)
    // The previous implementation didn't update roleId in updateAssignment?
    // Let's check the interface... The previous interface had unitId, isPrimary, dates. 
    // If role needs update, it might be separate. 
    // For now, only update what's passed.

    if (fields.length) {
      params.push(targetId);
      await connection.execute<ResultSetHeader>(
        `UPDATE employees
            SET ${fields.join(', ')}
          WHERE id = ?
          LIMIT 1`,
        params,
      );
    }

    return { success: true } as const;
  } finally {
    releaseConnection(connection, managed);
  }
};

export const deleteAssignment = async (assignmentId: number, employeeId?: number) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    const targetId = employeeId || assignmentId;

    // Only clear unit_id, preserve primary_role_id (employee's position should be retained)
    await connection.execute<ResultSetHeader>(
      `UPDATE employees
          SET unit_id = NULL
        WHERE id = ?
        LIMIT 1`,
      [targetId],
    );

    return { success: true } as const;
  } finally {
    releaseConnection(connection, managed);
  }
};

export const syncPrimaryForEmployee = async (employeeId: number) => {
  // No-op in single-unit mode
  return;
};
