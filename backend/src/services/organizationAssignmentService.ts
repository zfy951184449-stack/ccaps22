import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/database';

interface AssignmentCreateInput {
  employeeId: number;
  teamId: number;
  roleId: number;
  isPrimary?: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

interface AssignmentUpdateInput {
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

const syncEmployeePrimary = async (connection: PoolConnection, employeeId: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT etr.id,
            etr.is_primary AS isPrimary,
            etr.team_id AS teamId,
            etr.role_id AS roleId,
            t.department_id AS departmentId
       FROM employee_team_roles etr
       LEFT JOIN teams t ON t.id = etr.team_id
      WHERE etr.employee_id = ?
      ORDER BY etr.is_primary DESC,
               (etr.effective_to IS NULL) DESC,
               etr.effective_from DESC,
               etr.id DESC
      LIMIT 1`,
    [employeeId],
  );

  if (!rows.length || !rows[0].isPrimary) {
    await connection.execute<ResultSetHeader>(
      `UPDATE employees
          SET primary_team_id = NULL,
              primary_role_id = NULL
        WHERE id = ?`,
      [employeeId],
    );
    return;
  }

  const { teamId, roleId, departmentId } = rows[0];

  const params: Array<number | null> = [teamId ?? null, roleId ?? null];
  let updateSql = `UPDATE employees
                      SET primary_team_id = ?,
                          primary_role_id = ?`;

  if (departmentId !== null && departmentId !== undefined) {
    updateSql += ', department_id = ?';
    params.push(departmentId);
  }

  params.push(employeeId);

  updateSql += ' WHERE id = ?';

  await connection.execute<ResultSetHeader>(updateSql, params);
};

const resetExistingPrimary = async (connection: PoolConnection, employeeId: number) => {
  await connection.execute<ResultSetHeader>(
    'UPDATE employee_team_roles SET is_primary = 0 WHERE employee_id = ?',
    [employeeId],
  );
};

export const createAssignment = async (input: AssignmentCreateInput) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    await connection.beginTransaction();

    if (input.isPrimary) {
      await resetExistingPrimary(connection, input.employeeId);
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO employee_team_roles (employee_id, team_id, role_id, is_primary, effective_from, effective_to)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.employeeId,
        input.teamId,
        input.roleId,
        input.isPrimary ? 1 : 0,
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ],
    );

    if (input.isPrimary) {
      await syncEmployeePrimary(connection, input.employeeId);
    }

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
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
    await connection.beginTransaction();

    let resolvedEmployeeId = employeeId;

    if (!resolvedEmployeeId) {
      const [infoRows] = await connection.execute<RowDataPacket[]>(
        `SELECT employee_id AS employeeId
           FROM employee_team_roles
          WHERE id = ?
          LIMIT 1`,
        [assignmentId],
      );

      if (!infoRows.length) {
        await connection.rollback();
        return { notFound: true } as const;
      }

      resolvedEmployeeId = Number(infoRows[0].employeeId);
    }

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, is_primary AS isPrimary
         FROM employee_team_roles
        WHERE id = ? AND employee_id = ?
        LIMIT 1`,
      [assignmentId, resolvedEmployeeId],
    );

    if (!existingRows.length) {
      await connection.rollback();
      return { notFound: true } as const;
    }

    const wasPrimary = Boolean(existingRows[0].isPrimary);
    const nextPrimary = updates.isPrimary ?? wasPrimary;

    if (updates.isPrimary) {
      await resetExistingPrimary(connection, resolvedEmployeeId);
    }

    const fields: string[] = [];
    const params: Array<number | string | null> = [];

    if (updates.isPrimary !== undefined) {
      fields.push('is_primary = ?');
      params.push(updates.isPrimary ? 1 : 0);
    }
    if (updates.effectiveFrom !== undefined) {
      fields.push('effective_from = ?');
      params.push(updates.effectiveFrom ?? null);
    }
    if (updates.effectiveTo !== undefined) {
      fields.push('effective_to = ?');
      params.push(updates.effectiveTo ?? null);
    }

    if (fields.length) {
      params.push(assignmentId);
      await connection.execute<ResultSetHeader>(
        `UPDATE employee_team_roles
            SET ${fields.join(', ')}
          WHERE id = ?
          LIMIT 1`,
        params,
      );
    }

    if (wasPrimary || nextPrimary) {
      await syncEmployeePrimary(connection, resolvedEmployeeId);
    }

    await connection.commit();
    return { success: true } as const;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    releaseConnection(connection, managed);
  }
};

export const deleteAssignment = async (assignmentId: number, employeeId?: number) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    await connection.beginTransaction();

    let resolvedEmployeeId = employeeId;

    if (!resolvedEmployeeId) {
      const [infoRows] = await connection.execute<RowDataPacket[]>(
        `SELECT employee_id AS employeeId
           FROM employee_team_roles
          WHERE id = ?
          LIMIT 1`,
        [assignmentId],
      );

      if (!infoRows.length) {
        await connection.rollback();
        return { notFound: true } as const;
      }

      resolvedEmployeeId = Number(infoRows[0].employeeId);
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT is_primary AS isPrimary
         FROM employee_team_roles
        WHERE id = ? AND employee_id = ?
        LIMIT 1`,
      [assignmentId, resolvedEmployeeId],
    );

    if (!rows.length) {
      await connection.rollback();
      return { notFound: true } as const;
    }

    await connection.execute<ResultSetHeader>(
      'DELETE FROM employee_team_roles WHERE id = ? AND employee_id = ? LIMIT 1',
      [assignmentId, resolvedEmployeeId],
    );

    if (rows[0].isPrimary) {
      await syncEmployeePrimary(connection, resolvedEmployeeId);
    }

    await connection.commit();
    return { success: true } as const;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    releaseConnection(connection, managed);
  }
};

export const syncPrimaryForEmployee = async (employeeId: number) => {
  const connection = await ensureConnection();
  const managed = true;

  try {
    await syncEmployeePrimary(connection, employeeId);
  } finally {
    releaseConnection(connection, managed);
  }
};
