import { Request, Response } from 'express'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import dayjs from 'dayjs'
import pool from '../config/database'
import {
  createAssignment as createAssignmentService,
  deleteAssignment as deleteAssignmentService,
  updateAssignment as updateAssignmentService,
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

// Helper to get Role ID by Code
export const getRoleIdByCode = async (roleCode: string): Promise<number | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM employee_roles WHERE role_code = ?',
    [roleCode]
  )
  return rows.length > 0 ? rows[0].id : null
}

export const getRoles = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, role_code, role_name FROM employee_roles ORDER BY id'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
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
      orgRole = 'FRONTLINE', // Used to resolve primaryRoleId if not provided
      unitId,
    } = req.body || {};

    if (!employeeCode || !employeeName) {
      res.status(400).json({ error: 'employeeCode and employeeName are required' });
      return;
    }

    // Determine Logic Unit ID from inputs
    // If unitId is provided, use it.
    // Else if primaryTeamId provided, use it.
    // Else if departmentId provided, use it.
    const finalUnitId = unitId ?? primaryTeamId ?? departmentId ?? null;

    const sql = `
      INSERT INTO employees (
        employee_code,
        employee_name,
        unit_id,
        primary_role_id,
        employment_status,
        hire_date,
        shopfloor_baseline_pct,
        shopfloor_upper_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const resolvedRoleId = await getRoleIdByCode(orgRole);
    const finalRoleId = primaryRoleId ?? resolvedRoleId ?? null;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      String(employeeCode).trim(),
      String(employeeName).trim(),
      finalUnitId,
      finalRoleId,
      employmentStatus ? String(employmentStatus) : 'ACTIVE',
      hireDate ? String(hireDate) : null,
      shopfloorBaselinePct ?? null,
      shopfloorUpperPct ?? null,
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
              unit_id AS unitId,
              primary_role_id AS primaryRoleId,
              employment_status AS employmentStatus,
              hire_date AS hireDate,
              shopfloor_baseline_pct AS shopfloorBaselinePct,
              shopfloor_upper_pct AS shopfloorUpperPct
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
      unitId,
      primaryRoleId,
      employmentStatus,
      hireDate,
      shopfloorBaselinePct,
      shopfloorUpperPct,
      orgRole,
    } = req.body || {};

    // Logic for next unit ID:
    // If unitId is explicitly passed, use it.
    // If primaryTeamId is passed, use it (assuming it maps to new unit ID in UI).
    // If departmentId is passed AND primaryTeamId is NOT passed, use departmentId.
    // Fallback to existing logic is tricky because we don't know if values were deliberately unset.
    // However, typical partial update logic: if undefined, keep existing.

    let nextUnitId = existing.unitId;
    if (unitId !== undefined) {
      nextUnitId = unitId;
    } else if (primaryTeamId !== undefined) {
      nextUnitId = primaryTeamId;
    } else if (departmentId !== undefined) {
      nextUnitId = departmentId;
    }

    const updateSql = `
      UPDATE employees
         SET employee_name = COALESCE(?, employee_name),
             unit_id = ?,
             primary_role_id = ?,
             employment_status = COALESCE(?, employment_status),
             hire_date = COALESCE(?, hire_date),
             shopfloor_baseline_pct = COALESCE(?, shopfloor_baseline_pct),
             shopfloor_upper_pct = COALESCE(?, shopfloor_upper_pct)
       WHERE id = ?
       LIMIT 1
    `;

    // Resolve Role ID if orgRole is being updated
    let nextPrimaryRoleId = primaryRoleId ?? existing.primaryRoleId;
    if (orgRole) {
      const resolvedId = await getRoleIdByCode(orgRole);
      if (resolvedId) nextPrimaryRoleId = resolvedId;
    }

    const [result] = await connection.execute<ResultSetHeader>(updateSql, [
      employeeName ? String(employeeName).trim() : null,
      nextUnitId ?? null,
      nextPrimaryRoleId ?? null,
      employmentStatus ? String(employmentStatus) : null,
      hireDate ? String(hireDate) : null,
      shopfloorBaselinePct ?? null,
      shopfloorUpperPct ?? null,
      numericId,
    ]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const resolvedEmployeeName = employeeName ? String(employeeName).trim() : existing.employeeName;
    const resolvedOrgRole = orgRole ? String(orgRole) : existing.orgRole || 'FRONTLINE';

    // Auto-structure logic uses primaryTeamId equivalent which is nextUnitId (if it's a team)
    // We pass nextUnitId. The service verifies if it's a Team.
    if (resolvedOrgRole === 'GROUP_LEADER') {
      await syncGroupStructureForLeader(connection, {
        connection,
        employeeId: numericId,
        employeeName: resolvedEmployeeName,
        primaryTeamId: nextUnitId,
      });
    }

    if (resolvedOrgRole === 'SHIFT_LEADER') {
      await syncShiftStructureForLeader(connection, {
        connection,
        employeeId: numericId,
        employeeName: resolvedEmployeeName,
        primaryTeamId: nextUnitId,
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
    // New simplified query relying strictly on organization_units
    /*
      Heirarchy Logic:
      Employee -> Unit (u1)
      u1 can be Dept, Team, Group, etc.
      We attempt to resolve Department and Team from u1.

      Case 1: u1 is TEAM. Dept = u1.parent.
      Case 2: u1 is DEPT. Dept = u1. Team = null.
      Case 3: u1 is GROUP/SHIFT. Team = u1.parent. Dept = u1.parent.parent.
    */
    const sql = `
      SELECT
        e.id,
        e.employee_code AS employeeCode,
        e.employee_name AS employeeName,
        e.unit_id AS unitId,
        e.primary_role_id AS primaryRoleId,
        e.employment_status AS employmentStatus,
        e.shopfloor_baseline_pct AS shopfloorBaselinePct,
        e.shopfloor_upper_pct AS shopfloorUpperPct,
        e.hire_date AS hireDate,

        u1.unit_name AS u1_name,
        u1.unit_type AS u1_type,
        u1.parent_id AS u1_parent_id,
        
        u2.id AS u2_id,
        u2.unit_name AS u2_name,
        u2.unit_type AS u2_type,
        u2.parent_id AS u2_parent_id,
        
        u3.id AS u3_id,
        u3.unit_name AS u3_name,
        u3.unit_type AS u3_type,

        MAX(r.role_name) AS roleName,
        MAX(r.role_code) AS roleCode,
        GROUP_CONCAT(DISTINCT q.qualification_name ORDER BY q.qualification_name) AS qualificationNames
      FROM employees e
      LEFT JOIN organization_units u1 ON u1.id = e.unit_id
      LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
      LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
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

      // Resolve Dept/Team from unit hierarchy
      let departmentId: number | null = null;
      let departmentName: string | null = null;
      let primaryTeamId: number | null = null;
      let teamName: string | null = null;
      let unitName: string | null = null;

      const u1 = { id: row.unitId, name: row.u1_name, type: row.u1_type, parentId: row.u1_parent_id };
      const u2 = { id: row.u2_id, name: row.u2_name, type: row.u2_type, parentId: row.u2_parent_id };
      const u3 = { id: row.u3_id, name: row.u3_name, type: row.u3_type };

      if (u1.id) {
        unitName = u1.name;
        if (u1.type === 'DEPARTMENT') {
          departmentId = u1.id;
          departmentName = u1.name;
        } else if (u1.type === 'TEAM') {
          primaryTeamId = u1.id;
          teamName = u1.name;
          if (u2.type === 'DEPARTMENT') {
            departmentId = u2.id;
            departmentName = u2.name;
          }
        } else if (['GROUP', 'SHIFT'].includes(u1.type)) {
          // u1 is Group/Shift. Parent (u2) should be Team. Grandparent (u3) should be Dept.
          if (u2.type === 'TEAM') {
            primaryTeamId = u2.id;
            teamName = u2.name;
          }
          if (u3.type === 'DEPARTMENT') {
            departmentId = u3.id;
            departmentName = u3.name;
          }
        }
      }

      return {
        id,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        department_id: departmentId,
        department_name: departmentName,
        primary_team_id: primaryTeamId, // Kept for backward compat in payload
        primary_team_name: teamName,
        unit_id: mapNullableNumber(row.unitId),
        unit_name: unitName,
        primary_role_id: mapNullableNumber(row.primaryRoleId),
        primary_role_name: row.roleName ?? null,
        employment_status: row.employmentStatus,
        shopfloor_baseline_pct: row.shopfloorBaselinePct ? Number(row.shopfloorBaselinePct) : null,
        shopfloor_upper_pct: row.shopfloorUpperPct ? Number(row.shopfloorUpperPct) : null,
        hire_date: row.hireDate ?? null,
        org_role: row.roleCode ?? 'FRONTLINE',
        direct_leader_ids: subordinateToLeaders.get(id) ?? [],
        direct_subordinate_ids: leaderToSubordinates.get(id) ?? [],
        qualifications: row.qualificationNames ? String(row.qualificationNames).split(',') : [],
      };
    });

    res.json(payload);
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    res.status(500).json({ error: 'Failed to fetch employees', details: error.message, sqlMessage: error.sqlMessage })
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
    const { departmentId, primaryTeamId, unitId, primaryRoleId, employmentStatus, hireDate, orgRole } = req.body || {}

    if (!id || Number.isNaN(Number(id))) {
      res.status(400).json({ error: 'Invalid employee id' })
      return
    }

    const finalUnitId = unitId ?? primaryTeamId ?? departmentId ?? null;

    // Resolve Role ID if orgRole is provided
    let finalRoleId = primaryRoleId;
    if (orgRole && !primaryRoleId) {
      finalRoleId = await getRoleIdByCode(orgRole);
    }

    const sql = `
      UPDATE employees
         SET unit_id = ?,
             primary_role_id = COALESCE(?, primary_role_id),
             employment_status = COALESCE(?, employment_status),
             hire_date = COALESCE(?, hire_date)
       WHERE id = ?
       LIMIT 1
    `
    const [result] = await pool.execute<ResultSetHeader>(sql, [
      finalUnitId,
      finalRoleId ?? null,
      employmentStatus ? String(employmentStatus) : null,
      hireDate ? String(hireDate) : null,
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

    // Single-unit architecture: Query employees table directly
    const assignmentSql = `
      SELECT e.id AS id, -- Use employee ID as assignment ID
             e.id AS employeeId,
             e.unit_id AS teamId,
             e.primary_role_id AS roleId,
             1 AS isPrimary, -- Always primary in single-unit model
             DATE_FORMAT(NOW(), '%Y-%m-%d') AS effectiveFrom, -- Dummy date since we track current state
             NULL AS effectiveTo,
             t.unit_name AS teamName,
             r.role_name AS roleName
        FROM employees e
        LEFT JOIN organization_units t ON t.id = e.unit_id
        LEFT JOIN employee_roles r ON r.id = e.primary_role_id
       WHERE e.id = ?
         AND e.unit_id IS NOT NULL`;

    const [rows] = await pool.execute<RowDataPacket[]>(assignmentSql, [Number(id)])

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
      unitId: Number(teamId), // Service updated to accept unitId (aliased as teamId maybe? need to check Service)
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

export const updateEmployeeAssignment = async (req: Request, res: Response) => {
  try {
    const { id, assignmentId } = req.params;
    const { teamId, isPrimary, effectiveFrom, effectiveTo } = req.body || {};

    if (!id || Number.isNaN(Number(id)) || !assignmentId || Number.isNaN(Number(assignmentId))) {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    const updates = {
      unitId: teamId ? Number(teamId) : undefined,
      isPrimary,
      effectiveFrom,
      effectiveTo,
    };

    const result = await updateAssignmentService(Number(assignmentId), Number(id), updates);

    if ('notFound' in result) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
};
