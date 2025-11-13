import { Request, Response } from 'express'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import pool from '../config/database'
import {
  createAssignment as createAssignmentService,
  deleteAssignment as deleteAssignmentService,
} from '../services/organizationAssignmentService'
import { fetchEmployeeOrgContext } from '../services/organizationEmployeeService'
import {
  syncGroupStructureForLeader,
  syncShiftStructureForLeader,
} from '../services/organizationAutoStructureService'

const mapNullableNumber = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const {
      employeeCode,
      employeeName,
      departmentId,
      primaryTeamId,
      primaryRoleId,
      employmentStatus = 'ACTIVE',
      hireDate = null,
      shopfloorBaselinePct = null,
      shopfloorUpperPct = null,
      orgRole = 'FRONTLINE',
    } = req.body || {};

    if (!employeeCode || !employeeName) {
      res.status(400).json({ error: 'employeeCode and employeeName are required' });
      return;
    }

    const sql = `
      INSERT INTO employees (
        employee_code,
        employee_name,
        department_id,
        primary_team_id,
        primary_role_id,
        employment_status,
        hire_date,
        shopfloor_baseline_pct,
        shopfloor_upper_pct,
        org_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      String(employeeCode).trim(),
      String(employeeName).trim(),
      departmentId ?? null,
      primaryTeamId ?? null,
      primaryRoleId ?? null,
      employmentStatus ? String(employmentStatus) : 'ACTIVE',
      hireDate ? String(hireDate) : null,
      shopfloorBaselinePct ?? null,
      shopfloorUpperPct ?? null,
      String(orgRole ?? 'FRONTLINE'),
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Employee code already exists' });
      return;
    }
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  const { id } = req.params;
  const numericId = Number(id);

  if (!id || Number.isNaN(numericId)) {
    res.status(400).json({ error: 'Invalid employee id' });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.execute<RowDataPacket[]>(
      `SELECT id,
              employee_name AS employeeName,
              department_id AS departmentId,
              primary_team_id AS primaryTeamId,
              primary_role_id AS primaryRoleId,
              employment_status AS employmentStatus,
              hire_date AS hireDate,
              shopfloor_baseline_pct AS shopfloorBaselinePct,
              shopfloor_upper_pct AS shopfloorUpperPct,
              org_role AS orgRole
         FROM employees
        WHERE id = ?
        LIMIT 1`,
      [numericId],
    );

    if (!existing) {
      await connection.rollback();
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const {
      employeeName,
      departmentId,
      primaryTeamId,
      primaryRoleId,
      employmentStatus,
      hireDate,
      shopfloorBaselinePct,
      shopfloorUpperPct,
      orgRole,
    } = req.body || {};

    const updateSql = `
      UPDATE employees
         SET employee_name = COALESCE(?, employee_name),
             department_id = ?,
             primary_team_id = ?,
             primary_role_id = ?,
             employment_status = COALESCE(?, employment_status),
             hire_date = COALESCE(?, hire_date),
             shopfloor_baseline_pct = COALESCE(?, shopfloor_baseline_pct),
             shopfloor_upper_pct = COALESCE(?, shopfloor_upper_pct),
             org_role = COALESCE(?, org_role)
       WHERE id = ?
       LIMIT 1
    `;

    const [result] = await connection.execute<ResultSetHeader>(updateSql, [
      employeeName ? String(employeeName).trim() : null,
      departmentId ?? existing.departmentId ?? null,
      primaryTeamId ?? existing.primaryTeamId ?? null,
      primaryRoleId ?? existing.primaryRoleId ?? null,
      employmentStatus ? String(employmentStatus) : null,
      hireDate ? String(hireDate) : null,
      shopfloorBaselinePct ?? null,
      shopfloorUpperPct ?? null,
      orgRole ? String(orgRole) : null,
      numericId,
    ]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const resolvedEmployeeName = employeeName ? String(employeeName).trim() : existing.employeeName;
    const resolvedPrimaryTeamId =
      primaryTeamId !== undefined ? primaryTeamId ?? null : existing.primaryTeamId ?? null;
    const resolvedOrgRole = orgRole ? String(orgRole) : existing.orgRole || 'FRONTLINE';

    if (resolvedOrgRole === 'GROUP_LEADER') {
      await syncGroupStructureForLeader(connection, {
        connection,
        employeeId: numericId,
        employeeName: resolvedEmployeeName,
        primaryTeamId: resolvedPrimaryTeamId,
      });
    }

    if (resolvedOrgRole === 'SHIFT_LEADER') {
      await syncShiftStructureForLeader(connection, {
        connection,
        employeeId: numericId,
        employeeName: resolvedEmployeeName,
        primaryTeamId: resolvedPrimaryTeamId,
      });
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  } finally {
    connection.release();
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM employees WHERE id = ? LIMIT 1',
      [Number(id)],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};

export const getEmployees = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT
        e.id,
        e.employee_code AS employeeCode,
        e.employee_name AS employeeName,
        e.department_id AS departmentId,
        e.primary_team_id AS primaryTeamId,
        e.primary_role_id AS primaryRoleId,
        e.employment_status AS employmentStatus,
        e.shopfloor_baseline_pct AS shopfloorBaselinePct,
        e.shopfloor_upper_pct AS shopfloorUpperPct,
        e.hire_date AS hireDate,
        e.org_role AS orgRole,
        d.dept_name AS departmentName,
        t.team_name AS teamName,
        r.role_name AS roleName,
        GROUP_CONCAT(DISTINCT q.qualification_name ORDER BY q.qualification_name) AS qualificationNames
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN teams t ON t.id = e.primary_team_id
      LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      LEFT JOIN employee_qualifications eq ON eq.employee_id = e.id
      LEFT JOIN qualifications q ON q.id = eq.qualification_id
      GROUP BY e.id
      ORDER BY e.id
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(sql);

    const [reportingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT leader_id AS leaderId, subordinate_id AS subordinateId FROM employee_reporting_relations'
    );

    const leaderToSubordinates = new Map<number, number[]>();
    const subordinateToLeaders = new Map<number, number[]>();

    reportingRows.forEach((row) => {
      const leaderId = Number(row.leaderId);
      const subordinateId = Number(row.subordinateId);
      if (!leaderToSubordinates.has(leaderId)) {
        leaderToSubordinates.set(leaderId, []);
      }
      leaderToSubordinates.get(leaderId)!.push(subordinateId);

      if (!subordinateToLeaders.has(subordinateId)) {
        subordinateToLeaders.set(subordinateId, []);
      }
      subordinateToLeaders.get(subordinateId)!.push(leaderId);
    });

    const payload = rows.map((row) => {
      const id = Number(row.id);
      return {
        id,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        department_id: mapNullableNumber(row.departmentId),
        department_name: row.departmentName ?? null,
        primary_team_id: mapNullableNumber(row.primaryTeamId),
        primary_team_name: row.teamName ?? null,
        primary_role_id: mapNullableNumber(row.primaryRoleId),
        primary_role_name: row.roleName ?? null,
        employment_status: row.employmentStatus,
        shopfloor_baseline_pct: row.shopfloorBaselinePct ? Number(row.shopfloorBaselinePct) : null,
        shopfloor_upper_pct: row.shopfloorUpperPct ? Number(row.shopfloorUpperPct) : null,
        hire_date: row.hireDate ?? null,
        org_role: row.orgRole ?? 'FRONTLINE',
        direct_leader_ids: subordinateToLeaders.get(id) ?? [],
        direct_subordinate_ids: leaderToSubordinates.get(id) ?? [],
        qualifications: row.qualificationNames ? String(row.qualificationNames).split(',') : [],
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching employees:', error)
    res.status(500).json({ error: 'Failed to fetch employees' })
  }
}

export const updateEmployeeWorkloadProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { baselinePct, upperPct } = req.body || {}

    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }
    if (typeof baselinePct !== 'number' || typeof upperPct !== 'number') {
      res.status(400).json({ error: 'baselinePct and upperPct must be numbers' })
      return
    }
    if (baselinePct < 0 || baselinePct > 1 || upperPct < 0 || upperPct > 1) {
      res.status(400).json({ error: 'Percentages must be between 0 and 1' })
      return
    }

    const sql = `
      UPDATE employees
         SET shopfloor_baseline_pct = ?,
             shopfloor_upper_pct = ?
       WHERE id = ?
       LIMIT 1
    `
    const [result] = await pool.execute<ResultSetHeader>(sql, [baselinePct, upperPct, Number(id)])
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating workload profile:', error)
    res.status(500).json({ error: 'Failed to update workload profile' })
  }
}

export const updateEmployeeOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { departmentId, primaryTeamId, primaryRoleId, employmentStatus, hireDate, orgRole } = req.body || {}

    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const sql = `
      UPDATE employees
         SET department_id = ?,
             primary_team_id = ?,
             primary_role_id = ?,
             employment_status = COALESCE(?, employment_status),
             hire_date = COALESCE(?, hire_date),
             org_role = COALESCE(?, org_role)
       WHERE id = ?
       LIMIT 1
    `
    const [result] = await pool.execute<ResultSetHeader>(sql, [
      departmentId ?? null,
      primaryTeamId ?? null,
      primaryRoleId ?? null,
      employmentStatus ? String(employmentStatus) : null,
      hireDate ? String(hireDate) : null,
      orgRole ? String(orgRole) : null,
      Number(id)
    ])

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating employee organization info:', error)
    res.status(500).json({ error: 'Failed to update employee organization info' })
  }
}

export const listEmployeeAssignments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const sql = `
      SELECT etr.id,
             etr.employee_id AS employeeId,
             etr.team_id AS teamId,
             etr.role_id AS roleId,
             etr.is_primary AS isPrimary,
             etr.effective_from AS effectiveFrom,
             etr.effective_to AS effectiveTo,
             t.team_name AS teamName,
             r.role_name AS roleName
        FROM employee_team_roles etr
        JOIN teams t ON t.id = etr.team_id
        JOIN employee_roles r ON r.id = etr.role_id
       WHERE etr.employee_id = ?
       ORDER BY etr.effective_from DESC`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, [Number(id)])
    res.json(rows)
  } catch (error) {
    console.error('Error fetching employee assignments:', error)
    res.status(500).json({ error: 'Failed to fetch employee assignments' })
  }
}

export const createEmployeeAssignment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { teamId, roleId, isPrimary, effectiveFrom, effectiveTo } = req.body || {}

    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }
    if (!teamId || !roleId || !effectiveFrom) {
      res.status(400).json({ error: 'teamId, roleId, effectiveFrom are required' })
      return
    }

    const assignmentId = await createAssignmentService({
      employeeId: Number(id),
      teamId: Number(teamId),
      roleId: Number(roleId),
      isPrimary: Boolean(isPrimary),
      effectiveFrom,
      effectiveTo: effectiveTo || null
    })

    res.status(201).json({ id: assignmentId })
  } catch (error) {
    console.error('Error creating employee assignment:', error)
    res.status(500).json({ error: 'Failed to create employee assignment' })
  }
}

export const getEmployeeReporting = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const employeeId = Number(id)
    const [subRows] = await pool.execute<RowDataPacket[]>(
      'SELECT subordinate_id AS subordinateId FROM employee_reporting_relations WHERE leader_id = ?',
      [employeeId]
    )
    const [leaderRows] = await pool.execute<RowDataPacket[]>(
      'SELECT leader_id AS leaderId FROM employee_reporting_relations WHERE subordinate_id = ?',
      [employeeId]
    )

    res.json({
      leaderIds: leaderRows.map((row) => Number(row.leaderId)),
      directReportIds: subRows.map((row) => Number(row.subordinateId))
    })
  } catch (error) {
    console.error('Error fetching employee reporting:', error)
    res.status(500).json({ error: 'Failed to fetch employee reporting' })
  }
}

export const updateEmployeeDirectReports = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const { directReportIds } = req.body || {}
    if (directReportIds !== undefined && !Array.isArray(directReportIds)) {
      res.status(400).json({ error: 'directReportIds must be an array' })
      return
    }

    const leaderId = Number(id)
    const uniqueIds = Array.isArray(directReportIds)
      ? Array.from(new Set(directReportIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0 && value !== leaderId)))
      : []

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('DELETE FROM employee_reporting_relations WHERE leader_id = ?', [leaderId])

      if (uniqueIds.length) {
        const subordinatePlaceholders = uniqueIds.map(() => '?').join(',')
        await connection.execute(
          `DELETE FROM employee_reporting_relations WHERE subordinate_id IN (${subordinatePlaceholders})`,
          uniqueIds,
        )
        const values: Array<number> = []
        const placeholders = uniqueIds.map(() => '(?, ?)').join(',')
        uniqueIds.forEach((subId) => {
          values.push(leaderId, subId)
        })
        await connection.execute(
          `INSERT INTO employee_reporting_relations (leader_id, subordinate_id) VALUES ${placeholders}`,
          values
        )
      }

      await connection.commit()
      res.json({ success: true, directReportIds: uniqueIds })
    } catch (error) {
      await connection.rollback()
      console.error('Error updating employee reporting:', error)
      res.status(500).json({ error: 'Failed to update employee reporting' })
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('Error updating employee reporting:', error)
    res.status(500).json({ error: 'Failed to update employee reporting' })
  }
}

export const getEmployeeOrgContext = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const context = await fetchEmployeeOrgContext(Number(id))
    if (!context) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }

    res.json(context)
  } catch (error) {
    console.error('Error fetching employee organization context:', error)
    res.status(500).json({ error: 'Failed to fetch employee organization context' })
  }
}

export const deleteEmployeeAssignment = async (req: Request, res: Response) => {
  try {
    const { id, assignmentId } = req.params
    if (!id || Number.isNaN(Number(id)) || !assignmentId || Number.isNaN(Number(assignmentId))) {
      res.status(400).json({ error: 'Invalid parameters' })
      return
    }

    const result = await deleteAssignmentService(Number(assignmentId), Number(id))

    if ('notFound' in result) {
      res.status(404).json({ error: 'Assignment not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting assignment:', error)
    res.status(500).json({ error: 'Failed to delete assignment' })
  }
}
