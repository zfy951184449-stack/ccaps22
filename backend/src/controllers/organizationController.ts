import { Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  createAssignment as createAssignmentService,
  updateAssignment as updateAssignmentService,
  deleteAssignment as deleteAssignmentService,
} from '../services/organizationAssignmentService';

const respondWithError = (res: Response, error: unknown, message: string) => {
  console.error(`[OrganizationController] ${message}:`, error);
  res.status(500).json({ error: message });
};

export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT id,
             parent_id AS parentId,
             dept_code AS deptCode,
             dept_name AS deptName,
             description,
             sort_order AS sortOrder,
             is_active AS isActive,
             created_at AS createdAt,
             updated_at AS updatedAt
        FROM departments
       ORDER BY sort_order, dept_name`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql);
    res.json(rows);
  } catch (error) {
    respondWithError(res, error, 'Failed to fetch departments');
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { deptCode, deptName, parentId, description, sortOrder, isActive } = req.body || {};

    if (!deptCode || !deptName) {
      res.status(400).json({ error: 'deptCode and deptName are required' });
      return;
    }

    const sql = `
      INSERT INTO departments (dept_code, dept_name, parent_id, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      String(deptCode).trim(),
      String(deptName).trim(),
      parentId ?? null,
      description ? String(description) : null,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      isActive === undefined ? 1 : Number(isActive) ? 1 : 0,
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Department code already exists' });
      return;
    }
    respondWithError(res, error, 'Failed to create department');
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid department id' });
      return;
    }

    const { deptName, parentId, description, sortOrder, isActive } = req.body || {};

    const sql = `
      UPDATE departments
         SET dept_name = COALESCE(?, dept_name),
             parent_id = ?,
             description = COALESCE(?, description),
             sort_order = COALESCE(?, sort_order),
             is_active = COALESCE(?, is_active)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      deptName ? String(deptName).trim() : null,
      parentId ?? null,
      description ? String(description) : null,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : null,
      isActive === undefined ? null : Number(isActive) ? 1 : 0,
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to update department');
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid department id' });
      return;
    }

    const [dependency] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS teamCount FROM teams WHERE department_id = ?',
      [id],
    );

    if (dependency[0]?.teamCount > 0) {
      await pool.execute<ResultSetHeader>(
        'UPDATE departments SET is_active = 0 WHERE id = ?',
        [id],
      );
      res.json({ success: true, softDeleted: true });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM departments WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete department');
  }
};

export const getTeams = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT t.id,
             t.department_id AS departmentId,
             t.team_code AS teamCode,
             t.team_name AS teamName,
             t.description,
             t.is_active AS isActive,
             t.default_shift_code AS defaultShiftCode,
             t.created_at AS createdAt,
             t.updated_at AS updatedAt,
             d.dept_name AS departmentName
        FROM teams t
        JOIN departments d ON d.id = t.department_id
       ORDER BY d.sort_order, d.dept_name, t.team_name`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql);
    res.json(rows);
  } catch (error) {
    respondWithError(res, error, 'Failed to fetch teams');
  }
};

export const createTeam = async (req: Request, res: Response) => {
  try {
    const { departmentId, teamCode, teamName, description, isActive, defaultShiftCode } =
      req.body || {};

    if (!departmentId || !teamCode || !teamName) {
      res.status(400).json({ error: 'departmentId, teamCode and teamName are required' });
      return;
    }

    const sql = `
      INSERT INTO teams (department_id, team_code, team_name, description, is_active, default_shift_code)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      Number(departmentId),
      String(teamCode).trim(),
      String(teamName).trim(),
      description ? String(description) : null,
      isActive === undefined ? 1 : Number(isActive) ? 1 : 0,
      defaultShiftCode ? String(defaultShiftCode).trim() : null,
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Team code already exists' });
      return;
    }
    respondWithError(res, error, 'Failed to create team');
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const { departmentId, teamName, description, isActive, defaultShiftCode } = req.body || {};

    const sql = `
      UPDATE teams
         SET department_id = COALESCE(?, department_id),
             team_name = COALESCE(?, team_name),
             description = COALESCE(?, description),
             is_active = COALESCE(?, is_active),
             default_shift_code = COALESCE(?, default_shift_code)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      departmentId ?? null,
      teamName ? String(teamName).trim() : null,
      description ? String(description) : null,
      isActive === undefined ? null : Number(isActive) ? 1 : 0,
      defaultShiftCode ? String(defaultShiftCode).trim() : null,
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to update team');
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid team id' });
      return;
    }

    const [assignmentRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM employee_team_roles WHERE team_id = ?',
      [id],
    );

    if (assignmentRows[0]?.cnt > 0) {
      await pool.execute<ResultSetHeader>('UPDATE teams SET is_active = 0 WHERE id = ?', [id]);
      res.json({ success: true, softDeleted: true });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM teams WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete team');
  }
};

export const getEmployeeRoles = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT id,
             role_code AS roleCode,
             role_name AS roleName,
             description,
             can_schedule AS canSchedule,
             allowed_shift_codes AS allowedShiftCodes,
             default_skill_level AS defaultSkillLevel,
             created_at AS createdAt,
             updated_at AS updatedAt
        FROM employee_roles
       ORDER BY role_name`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql);
    res.json(rows);
  } catch (error) {
    respondWithError(res, error, 'Failed to fetch roles');
  }
};

export const createEmployeeRole = async (req: Request, res: Response) => {
  try {
    const { roleCode, roleName, description, canSchedule, allowedShiftCodes, defaultSkillLevel } =
      req.body || {};

    if (!roleCode || !roleName) {
      res.status(400).json({ error: 'roleCode and roleName are required' });
      return;
    }

    const sql = `
      INSERT INTO employee_roles (role_code, role_name, description, can_schedule, allowed_shift_codes, default_skill_level)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      String(roleCode).trim(),
      String(roleName).trim(),
      description ? String(description) : null,
      canSchedule === undefined ? 1 : Number(canSchedule) ? 1 : 0,
      allowedShiftCodes ? String(allowedShiftCodes) : null,
      defaultSkillLevel === undefined || defaultSkillLevel === null
        ? null
        : Number(defaultSkillLevel),
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Role code already exists' });
      return;
    }
    respondWithError(res, error, 'Failed to create role');
  }
};

export const updateEmployeeRole = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid role id' });
      return;
    }

    const { roleName, description, canSchedule, allowedShiftCodes, defaultSkillLevel } =
      req.body || {};

    const sql = `
      UPDATE employee_roles
         SET role_name = COALESCE(?, role_name),
             description = COALESCE(?, description),
             can_schedule = COALESCE(?, can_schedule),
             allowed_shift_codes = COALESCE(?, allowed_shift_codes),
             default_skill_level = COALESCE(?, default_skill_level)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      roleName ? String(roleName).trim() : null,
      description ? String(description) : null,
      canSchedule === undefined ? null : Number(canSchedule) ? 1 : 0,
      allowedShiftCodes ? String(allowedShiftCodes) : null,
      defaultSkillLevel === undefined || defaultSkillLevel === null
        ? null
        : Number(defaultSkillLevel),
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to update role');
  }
};

export const deleteEmployeeRole = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid role id' });
      return;
    }

    const [usage] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM employee_team_roles WHERE role_id = ?',
      [id],
    );

    if (usage[0]?.cnt > 0) {
      await pool.execute<ResultSetHeader>(
        'UPDATE employee_roles SET can_schedule = 0 WHERE id = ?',
        [id],
      );
      res.json({ success: true, softDeleted: true });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM employee_roles WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete role');
  }
};

export const listEmployeeTeamRoles = async (req: Request, res: Response) => {
  try {
    const { employeeId, teamId } = req.query;
    const filters: string[] = [];
    const params: Array<number> = [];

    if (employeeId) {
      filters.push('etr.employee_id = ?');
      params.push(Number(employeeId));
    }
    if (teamId) {
      filters.push('etr.team_id = ?');
      params.push(Number(teamId));
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const sql = `
      SELECT etr.id,
             etr.employee_id AS employeeId,
             etr.team_id AS teamId,
             etr.role_id AS roleId,
             etr.is_primary AS isPrimary,
             etr.effective_from AS effectiveFrom,
             etr.effective_to AS effectiveTo,
             e.employee_name AS employeeName,
             t.team_name AS teamName,
             r.role_name AS roleName
        FROM employee_team_roles etr
        JOIN employees e ON e.id = etr.employee_id
        JOIN teams t ON t.id = etr.team_id
        JOIN employee_roles r ON r.id = etr.role_id
        ${whereClause}
       ORDER BY e.employee_name, t.team_name, r.role_name, etr.effective_from`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    respondWithError(res, error, 'Failed to fetch employee team roles');
  }
};

export const createEmployeeTeamRole = async (req: Request, res: Response) => {
  try {
    const { employeeId, teamId, roleId, isPrimary, effectiveFrom, effectiveTo } = req.body || {};

    if (!employeeId || !teamId || !roleId || !effectiveFrom) {
      res.status(400).json({ error: 'employeeId, teamId, roleId, effectiveFrom are required' });
      return;
    }

    const id = await createAssignmentService({
      employeeId: Number(employeeId),
      teamId: Number(teamId),
      roleId: Number(roleId),
      isPrimary: Boolean(isPrimary),
      effectiveFrom,
      effectiveTo: effectiveTo || null,
    });

    res.status(201).json({ id });
  } catch (error) {
    respondWithError(res, error, 'Failed to create employee team role');
  }
};

export const updateEmployeeTeamRole = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid assignment id' });
      return;
    }

    const { employeeId, isPrimary, effectiveFrom, effectiveTo } = req.body || {};

    const result = await updateAssignmentService(id, employeeId ? Number(employeeId) : undefined, {
      isPrimary,
      effectiveFrom: effectiveFrom ?? undefined,
      effectiveTo: effectiveTo ?? undefined,
    });

    if ('notFound' in result) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to update employee team role');
  }
};

export const deleteEmployeeTeamRole = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid assignment id' });
      return;
    }

    const result = await deleteAssignmentService(id);

    if ('notFound' in result) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete employee team role');
  }
};

export const listEmployeeUnavailability = async (req: Request, res: Response) => {
  try {
    const { employeeId, from, to } = req.query;
    const filters: string[] = [];
    const params: Array<number | string> = [];

    if (employeeId) {
      filters.push('eu.employee_id = ?');
      params.push(Number(employeeId));
    }
    if (from) {
      filters.push('eu.end_datetime >= ?');
      params.push(String(from));
    }
    if (to) {
      filters.push('eu.start_datetime <= ?');
      params.push(String(to));
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const sql = `
      SELECT eu.id,
             eu.employee_id AS employeeId,
             eu.start_datetime AS startDatetime,
             eu.end_datetime AS endDatetime,
             eu.reason_code AS reasonCode,
             eu.reason_label AS reasonLabel,
             eu.category,
             eu.notes,
             eu.created_by AS createdBy,
             eu.created_at AS createdAt,
             eu.updated_at AS updatedAt,
             e.employee_name AS employeeName
        FROM employee_unavailability eu
        JOIN employees e ON e.id = eu.employee_id
        ${whereClause}
       ORDER BY eu.start_datetime`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    respondWithError(res, error, 'Failed to fetch unavailability');
  }
};

export const createEmployeeUnavailability = async (req: Request, res: Response) => {
  try {
    const { employeeId, startDatetime, endDatetime, reasonCode, reasonLabel, category, notes, createdBy } =
      req.body || {};

    if (!employeeId || !startDatetime || !endDatetime || !reasonCode || !reasonLabel) {
      res.status(400).json({ error: 'employeeId, startDatetime, endDatetime, reasonCode, reasonLabel are required' });
      return;
    }

    const start = new Date(startDatetime);
    const end = new Date(endDatetime);
    if (!(start instanceof Date) || Number.isNaN(start.valueOf()) || !(end instanceof Date) || Number.isNaN(end.valueOf()) || start >= end) {
      res.status(400).json({ error: 'Invalid start/end datetime' });
      return;
    }

    const sql = `
      INSERT INTO employee_unavailability (employee_id, start_datetime, end_datetime, reason_code, reason_label, category, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      Number(employeeId),
      start.toISOString().slice(0, 19).replace('T', ' '),
      end.toISOString().slice(0, 19).replace('T', ' '),
      String(reasonCode).trim(),
      String(reasonLabel).trim(),
      category ? String(category).trim() : null,
      notes ? String(notes) : null,
      createdBy ?? null,
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    respondWithError(res, error, 'Failed to create unavailability record');
  }
};

export const updateEmployeeUnavailability = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid unavailability id' });
      return;
    }

    const { startDatetime, endDatetime, reasonCode, reasonLabel, category, notes } = req.body || {};

    const sql = `
      UPDATE employee_unavailability
         SET start_datetime = COALESCE(?, start_datetime),
             end_datetime = COALESCE(?, end_datetime),
             reason_code = COALESCE(?, reason_code),
             reason_label = COALESCE(?, reason_label),
             category = COALESCE(?, category),
             notes = COALESCE(?, notes)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      startDatetime ? String(startDatetime) : null,
      endDatetime ? String(endDatetime) : null,
      reasonCode ? String(reasonCode).trim() : null,
      reasonLabel ? String(reasonLabel).trim() : null,
      category ? String(category).trim() : null,
      notes ? String(notes) : null,
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Unavailability record not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to update unavailability');
  }
};

export const deleteEmployeeUnavailability = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid unavailability id' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM employee_unavailability WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Unavailability record not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete unavailability');
  }
};
