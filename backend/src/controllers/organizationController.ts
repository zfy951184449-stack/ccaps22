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

const isTableMissingError = (error: any) => {
  const code = error?.code;
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR';
};

const parseMetadata = (metadata: unknown): Record<string, unknown> | null => {
  if (!metadata) {
    return null;
  }
  if (typeof metadata === 'object') {
    return metadata as Record<string, unknown>;
  }
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (err) {
      console.warn('[OrganizationController] Failed to parse metadata JSON:', err);
      return null;
    }
  }
  return null;
};

const mapDepartmentUnitRow = (row: any) => {
  const metadata = parseMetadata(row.metadata);
  const description =
    metadata && typeof metadata.description === 'string'
      ? (metadata.description as string)
      : null;
  const normalizedIsActive = Boolean(row.is_active ?? row.isActive ?? 1);

  return {
    id: row.id,
    parentId: row.parent_id ?? row.parentId ?? null,
    parent_id: row.parent_id ?? row.parentId ?? null,
    deptCode: row.unit_code ?? row.dept_code ?? row.deptCode ?? null,
    dept_code: row.unit_code ?? row.dept_code ?? row.deptCode ?? null,
    deptName: row.unit_name ?? row.dept_name ?? row.deptName ?? '',
    dept_name: row.unit_name ?? row.dept_name ?? row.deptName ?? '',
    unitCode: row.unit_code ?? row.dept_code ?? row.deptCode ?? null,
    unit_code: row.unit_code ?? row.dept_code ?? row.deptCode ?? null,
    unitName: row.unit_name ?? row.dept_name ?? row.deptName ?? '',
    unit_name: row.unit_name ?? row.dept_name ?? row.deptName ?? '',
    description,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    sort_order: row.sort_order ?? row.sortOrder ?? 0,
    isActive: normalizedIsActive,
    is_active: normalizedIsActive,
    metadata,
    createdAt: row.created_at ?? row.createdAt ?? null,
    created_at: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    unitType: 'DEPARTMENT',
  };
};

const mapTeamUnitRow = (row: any) => {
  const metadata = parseMetadata(row.metadata);
  const description =
    metadata && typeof metadata.description === 'string'
      ? (metadata.description as string)
      : null;
  const departmentIdFromMeta =
    metadata && typeof metadata.departmentId === 'number'
      ? (metadata.departmentId as number)
      : null;
  const parentDepartmentId =
    typeof row.parent_id === 'number'
      ? row.parent_id
      : row.department_id ?? row.departmentId ?? null;
  const departmentId = departmentIdFromMeta ?? parentDepartmentId ?? null;
  const normalizedIsActive = Boolean(row.is_active ?? row.isActive ?? 1);

  return {
    id: row.id,
    departmentId,
    department_id: departmentId,
    parentId: row.parent_id ?? row.parentId ?? null,
    parent_id: row.parent_id ?? row.parentId ?? null,
    teamCode: row.unit_code ?? row.team_code ?? row.teamCode ?? null,
    team_code: row.unit_code ?? row.team_code ?? row.teamCode ?? null,
    unitCode: row.unit_code ?? row.team_code ?? row.teamCode ?? null,
    unit_code: row.unit_code ?? row.team_code ?? row.teamCode ?? null,
    teamName: row.unit_name ?? row.team_name ?? row.teamName ?? '',
    team_name: row.unit_name ?? row.team_name ?? row.teamName ?? '',
    unitName: row.unit_name ?? row.team_name ?? row.teamName ?? '',
    unit_name: row.unit_name ?? row.team_name ?? row.teamName ?? '',
    description,
    defaultShiftCode:
      row.default_shift_code ?? row.defaultShiftCode ?? row.default_shiftCode ?? null,
    default_shift_code:
      row.default_shift_code ?? row.defaultShiftCode ?? row.default_shiftCode ?? null,
    isActive: normalizedIsActive,
    is_active: normalizedIsActive,
    metadata,
    createdAt: row.created_at ?? row.createdAt ?? null,
    created_at: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    departmentName: row.parent_unit_name ?? row.departmentName ?? null,
    unitType: 'TEAM',
  };
};

export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT id,
             parent_id,
             unit_code,
             unit_name,
             sort_order,
             is_active,
             metadata,
             created_at,
             updated_at
        FROM organization_units
       WHERE unit_type = 'DEPARTMENT'
       ORDER BY sort_order, unit_name`;

    const [unitRows] = await pool.execute<RowDataPacket[]>(sql);
    res.json(unitRows.map(mapDepartmentUnitRow));
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to fetch departments');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy departments table');
  }

  try {
    const legacySql = `
      SELECT id,
             parent_id,
             dept_code,
             dept_name,
             description,
             sort_order,
             is_active,
             NULL AS metadata,
             created_at,
             updated_at
        FROM departments
       ORDER BY sort_order, dept_name`;

    const [legacyRows] = await pool.execute<RowDataPacket[]>(legacySql);
    res.json(legacyRows.map(mapDepartmentUnitRow));
  } catch (legacyError: any) {
    if (isTableMissingError(legacyError)) {
      res.json([]);
      return;
    }
    respondWithError(res, legacyError, 'Failed to fetch departments');
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  const payload = req.body || {};
  const deptCodeInput = payload.deptCode ?? payload.dept_code ?? payload.code ?? null;
  const deptNameInput = payload.deptName ?? payload.dept_name ?? payload.name ?? null;
  const parentIdInput = payload.parentId ?? payload.parent_id ?? null;
  const descriptionInput = payload.description ?? payload.desc ?? null;
  const sortOrderInput = payload.sortOrder ?? payload.sort_order ?? 0;
  const isActiveInput = payload.isActive ?? payload.is_active ?? 1;

  if (!deptCodeInput || !deptNameInput) {
    res.status(400).json({ error: 'deptCode and deptName are required' });
    return;
  }

  const normalizedCode = String(deptCodeInput).trim();
  const normalizedName = String(deptNameInput).trim();

  try {
    let parentUnitId: number | null = null;
    if (parentIdInput !== null && parentIdInput !== undefined) {
      const parentIdNumber = Number(parentIdInput);
      if (!Number.isFinite(parentIdNumber) || parentIdNumber <= 0) {
        res.status(400).json({ error: 'Invalid parent department id' });
        return;
      }
      const [parentRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id
           FROM organization_units
          WHERE id = ?
            AND unit_type = 'DEPARTMENT'
          LIMIT 1`,
        [parentIdNumber],
      );
      if (!parentRows.length) {
        res.status(400).json({ error: 'Parent department not found' });
        return;
      }
      parentUnitId = parentIdNumber;
    }

    const [exists] = await pool.execute<RowDataPacket[]>(
      `SELECT id
         FROM organization_units
        WHERE unit_type = 'DEPARTMENT'
          AND unit_code = ?
        LIMIT 1`,
      [normalizedCode],
    );

    if (exists.length) {
      res.status(409).json({ error: 'Department code already exists' });
      return;
    }

    const sortOrderValue = Number.isFinite(Number(sortOrderInput))
      ? Number(sortOrderInput)
      : 0;
    const isActiveValue = Number(isActiveInput) ? 1 : 0;
    const descriptionText =
      typeof descriptionInput === 'string' ? descriptionInput.trim() : descriptionInput;
    const metadataObject: Record<string, unknown> = {};
    if (descriptionText) {
      metadataObject.description = descriptionText;
    }
    const metadataJson =
      Object.keys(metadataObject).length > 0 ? JSON.stringify(metadataObject) : null;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO organization_units
        (parent_id, unit_type, unit_code, unit_name, default_shift_code, sort_order, is_active, metadata)
       VALUES (?, 'DEPARTMENT', ?, ?, NULL, ?, ?, ?)`,
      [parentUnitId ?? null, normalizedCode, normalizedName, sortOrderValue, isActiveValue, metadataJson],
    );

    res.status(201).json({ id: result.insertId, unitType: 'DEPARTMENT' });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      if (error?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'Department code already exists' });
        return;
      }
      respondWithError(res, error, 'Failed to create department');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy departments table');
  }

  try {
    const [existsLegacy] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM departments WHERE dept_code = ? LIMIT 1',
      [normalizedCode],
    );

    if (existsLegacy.length) {
      res.status(409).json({ error: 'Department code already exists' });
      return;
    }

    const [resultLegacy] = await pool.execute<ResultSetHeader>(
      `INSERT INTO departments (dept_code, dept_name, parent_id, description, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalizedCode,
        normalizedName,
        parentIdInput ?? null,
        descriptionInput ? String(descriptionInput) : null,
        Number.isFinite(Number(sortOrderInput)) ? Number(sortOrderInput) : 0,
        Number(isActiveInput) ? 1 : 0,
      ],
    );

    res.status(201).json({ id: resultLegacy.insertId });
  } catch (legacyError: any) {
    if (legacyError?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Department code already exists' });
      return;
    }
    respondWithError(res, legacyError, 'Failed to create department');
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid department id' });
    return;
  }

  const payload = req.body || {};
  const deptNameInput = payload.deptName ?? payload.dept_name ?? null;
  const parentIdInput = payload.parentId ?? payload.parent_id;
  const descriptionInput = payload.description ?? payload.desc;
  const sortOrderInput = payload.sortOrder ?? payload.sort_order;
  const isActiveInput = payload.isActive ?? payload.is_active;

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT unit_name,
              parent_id,
              sort_order,
              is_active,
              metadata
         FROM organization_units
        WHERE id = ?
          AND unit_type = 'DEPARTMENT'
        LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    const existing = rows[0];
    const nextName = deptNameInput ? String(deptNameInput).trim() : existing.unit_name;

    let nextParentId: number | null | undefined = existing.parent_id ?? null;
    if (parentIdInput !== undefined) {
      if (parentIdInput === null) {
        nextParentId = null;
      } else {
        const parentIdNumber = Number(parentIdInput);
        if (!Number.isFinite(parentIdNumber) || parentIdNumber <= 0) {
          res.status(400).json({ error: 'Invalid parent department id' });
          return;
        }
        if (parentIdNumber === id) {
          res.status(400).json({ error: 'Parent department cannot be itself' });
          return;
        }
        const [parentRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id
             FROM organization_units
            WHERE id = ?
              AND unit_type = 'DEPARTMENT'
            LIMIT 1`,
          [parentIdNumber],
        );
        if (!parentRows.length) {
          res.status(400).json({ error: 'Parent department not found' });
          return;
        }
        nextParentId = parentIdNumber;
      }
    }

    const nextSortOrder =
      sortOrderInput === null || sortOrderInput === undefined
        ? existing.sort_order ?? 0
        : Number.isFinite(Number(sortOrderInput))
        ? Number(sortOrderInput)
        : existing.sort_order ?? 0;
    const nextIsActive =
      isActiveInput === null || isActiveInput === undefined
        ? Number(existing.is_active ?? 1) ? 1 : 0
        : Number(isActiveInput) ? 1 : 0;

    const existingMetadata = parseMetadata(existing.metadata);
    const metadataObj: Record<string, unknown> = existingMetadata ? { ...existingMetadata } : {};
    if (descriptionInput !== undefined) {
      const descriptionValue =
        descriptionInput === null
          ? null
          : typeof descriptionInput === 'string'
          ? descriptionInput.trim()
          : String(descriptionInput);
      if (descriptionValue) {
        metadataObj.description = descriptionValue;
      } else {
        delete metadataObj.description;
      }
    }
    const metadataJson =
      Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

    await pool.execute<ResultSetHeader>(
      `UPDATE organization_units
          SET unit_name = ?,
              parent_id = ?,
              sort_order = ?,
              is_active = ?,
              metadata = ?
        WHERE id = ?
          AND unit_type = 'DEPARTMENT'`,
      [nextName, nextParentId ?? null, nextSortOrder, nextIsActive, metadataJson, id],
    );

    res.json({ success: true });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to update department');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy departments table');
  }

  try {
    const sql = `
      UPDATE departments
         SET dept_name = COALESCE(?, dept_name),
             parent_id = ?,
             description = COALESCE(?, description),
             sort_order = COALESCE(?, sort_order),
             is_active = COALESCE(?, is_active)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      deptNameInput ? String(deptNameInput).trim() : null,
      parentIdInput ?? null,
      descriptionInput ? String(descriptionInput) : null,
      sortOrderInput === null || sortOrderInput === undefined
        ? null
        : Number.isFinite(Number(sortOrderInput))
        ? Number(sortOrderInput)
        : null,
      isActiveInput === null || isActiveInput === undefined ? null : Number(isActiveInput) ? 1 : 0,
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    res.json({ success: true });
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to update department');
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid department id' });
    return;
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id
         FROM organization_units
        WHERE id = ?
          AND unit_type = 'DEPARTMENT'
        LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    const [childRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS childCount
         FROM organization_units
        WHERE parent_id = ?`,
      [id],
    );

    if (childRows[0]?.childCount > 0) {
      await pool.execute<ResultSetHeader>(
        `UPDATE organization_units SET is_active = 0 WHERE id = ?`,
        [id],
      );
      res.json({ success: true, softDeleted: true });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM organization_units
        WHERE id = ?
          AND unit_type = 'DEPARTMENT'
        LIMIT 1`,
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Department not found' });
      return;
    }

    res.json({ success: true });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to delete department');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy departments table');
  }

  try {
    const [dependency] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS teamCount FROM teams WHERE department_id = ?',
      [id],
    );

    if (dependency[0]?.teamCount > 0) {
      await pool.execute<ResultSetHeader>('UPDATE departments SET is_active = 0 WHERE id = ?', [id]);
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
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to delete department');
  }
};

export const getTeams = async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT t.id,
             t.parent_id,
             t.unit_code,
             t.unit_name,
             t.default_shift_code,
             t.sort_order,
             t.is_active,
             t.metadata,
             t.created_at,
             t.updated_at,
             parent.unit_name AS parent_unit_name
        FROM organization_units t
        LEFT JOIN organization_units parent ON parent.id = t.parent_id
       WHERE t.unit_type = 'TEAM'
       ORDER BY COALESCE(parent.sort_order, 0),
                parent.unit_name,
                t.sort_order,
                t.unit_name`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql);
    res.json(rows.map(mapTeamUnitRow));
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to fetch teams');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy teams table');
  }

  try {
    const legacySql = `
      SELECT t.id,
             t.department_id,
             t.team_code,
             t.team_name,
             t.description,
             t.is_active,
             t.default_shift_code,
             t.created_at,
             t.updated_at,
             d.dept_name AS departmentName
        FROM teams t
        JOIN departments d ON d.id = t.department_id
       ORDER BY d.sort_order, d.dept_name, t.team_name`;

    const [legacyRows] = await pool.execute<RowDataPacket[]>(legacySql);
    res.json(legacyRows.map(mapTeamUnitRow));
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to fetch teams');
  }
};

export const createTeam = async (req: Request, res: Response) => {
  const payload = req.body || {};
  const departmentIdInput =
    payload.departmentId ?? payload.department_id ?? payload.deptId ?? null;
  const teamCodeInput = payload.teamCode ?? payload.team_code ?? payload.code ?? null;
  const teamNameInput = payload.teamName ?? payload.team_name ?? payload.name ?? null;
  const descriptionInput = payload.description ?? payload.desc ?? null;
  const isActiveInput = payload.isActive ?? payload.is_active ?? 1;
  const defaultShiftCodeInput =
    payload.defaultShiftCode ?? payload.default_shift_code ?? null;

  if (!departmentIdInput || !teamCodeInput || !teamNameInput) {
    res.status(400).json({ error: 'departmentId, teamCode and teamName are required' });
    return;
  }

  const normalizedCode = String(teamCodeInput).trim();
  const normalizedName = String(teamNameInput).trim();

  try {
    const departmentIdNumber = Number(departmentIdInput);
    if (!Number.isFinite(departmentIdNumber) || departmentIdNumber <= 0) {
      res.status(400).json({ error: 'departmentId must be a positive number' });
      return;
    }

    const [parentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id
         FROM organization_units
        WHERE id = ?
          AND unit_type = 'DEPARTMENT'
        LIMIT 1`,
      [departmentIdNumber],
    );

    if (!parentRows.length) {
      res.status(400).json({ error: 'Parent department not found' });
      return;
    }

    const [exists] = await pool.execute<RowDataPacket[]>(
      `SELECT id
         FROM organization_units
        WHERE unit_type = 'TEAM'
          AND unit_code = ?
        LIMIT 1`,
      [normalizedCode],
    );

    if (exists.length) {
      res.status(409).json({ error: 'Team code already exists' });
      return;
    }

    const descriptionText =
      typeof descriptionInput === 'string' ? descriptionInput.trim() : descriptionInput;
    const metadataObj: Record<string, unknown> = { departmentId: departmentIdNumber };
    if (descriptionText) {
      metadataObj.description = descriptionText;
    }
    const metadataJson = JSON.stringify(metadataObj);

    const isActiveValue = Number(isActiveInput) ? 1 : 0;
    const defaultShiftCodeValue = defaultShiftCodeInput
      ? String(defaultShiftCodeInput).trim()
      : null;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO organization_units
        (parent_id, unit_type, unit_code, unit_name, default_shift_code, sort_order, is_active, metadata)
       VALUES (?, 'TEAM', ?, ?, ?, 0, ?, ?)`,
      [departmentIdNumber, normalizedCode, normalizedName, defaultShiftCodeValue, isActiveValue, metadataJson],
    );

    res.status(201).json({ id: result.insertId, unitType: 'TEAM' });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to create team');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy teams table');
  }

  try {
    const [existsLegacy] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM teams WHERE team_code = ? LIMIT 1',
      [normalizedCode],
    );

    if (existsLegacy.length) {
      res.status(409).json({ error: 'Team code already exists' });
      return;
    }

    const sql = `
      INSERT INTO teams (department_id, team_code, team_name, description, is_active, default_shift_code)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      Number(departmentIdInput),
      normalizedCode,
      normalizedName,
      descriptionInput ? String(descriptionInput) : null,
      Number(isActiveInput) ? 1 : 0,
      defaultShiftCodeInput ? String(defaultShiftCodeInput).trim() : null,
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to create team');
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid team id' });
    return;
  }

  const payload = req.body || {};
  const departmentIdInput = payload.departmentId ?? payload.department_id;
  const teamNameInput = payload.teamName ?? payload.team_name ?? null;
  const descriptionInput = payload.description ?? payload.desc;
  const isActiveInput = payload.isActive ?? payload.is_active;
  const defaultShiftCodeInput =
    payload.defaultShiftCode ?? payload.default_shift_code;

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT unit_name,
              parent_id,
              default_shift_code,
              is_active,
              metadata
         FROM organization_units
        WHERE id = ?
          AND unit_type = 'TEAM'
        LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const existing = rows[0];
    const nextName = teamNameInput ? String(teamNameInput).trim() : existing.unit_name;

    let nextDepartmentId: number | null | undefined = existing.parent_id ?? null;
    if (departmentIdInput !== undefined) {
      if (departmentIdInput === null) {
        nextDepartmentId = null;
      } else {
        const departmentIdNumber = Number(departmentIdInput);
        if (!Number.isFinite(departmentIdNumber) || departmentIdNumber <= 0) {
          res.status(400).json({ error: 'Invalid department id' });
          return;
        }
        const [parentRows] = await pool.execute<RowDataPacket[]>(
          `SELECT id
             FROM organization_units
            WHERE id = ?
              AND unit_type = 'DEPARTMENT'
            LIMIT 1`,
          [departmentIdNumber],
        );
        if (!parentRows.length) {
          res.status(400).json({ error: 'Department not found' });
          return;
        }
        nextDepartmentId = departmentIdNumber;
      }
    }

    const nextIsActive =
      isActiveInput === null || isActiveInput === undefined
        ? Number(existing.is_active ?? 1) ? 1 : 0
        : Number(isActiveInput) ? 1 : 0;

    let nextDefaultShiftCode: string | null;
    if (defaultShiftCodeInput === undefined) {
      nextDefaultShiftCode = existing.default_shift_code ?? null;
    } else if (defaultShiftCodeInput === null || defaultShiftCodeInput === '') {
      nextDefaultShiftCode = null;
    } else {
      nextDefaultShiftCode = String(defaultShiftCodeInput).trim();
    }

    const existingMetadata = parseMetadata(existing.metadata);
    const metadataObj: Record<string, unknown> = existingMetadata ? { ...existingMetadata } : {};
    if (nextDepartmentId !== undefined) {
      if (nextDepartmentId === null) {
        delete metadataObj.departmentId;
      } else {
        metadataObj.departmentId = nextDepartmentId;
      }
    }
    if (descriptionInput !== undefined) {
      const descriptionValue =
        descriptionInput === null
          ? null
          : typeof descriptionInput === 'string'
          ? descriptionInput.trim()
          : String(descriptionInput);
      if (descriptionValue) {
        metadataObj.description = descriptionValue;
      } else {
        delete metadataObj.description;
      }
    }

    const metadataJson =
      Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

    await pool.execute<ResultSetHeader>(
      `UPDATE organization_units
          SET unit_name = ?,
              parent_id = ?,
              default_shift_code = ?,
              is_active = ?,
              metadata = ?
        WHERE id = ?
          AND unit_type = 'TEAM'`,
      [nextName, nextDepartmentId ?? null, nextDefaultShiftCode, nextIsActive, metadataJson, id],
    );

    res.json({ success: true });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to update team');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy teams table');
  }

  try {
    const sql = `
      UPDATE teams
         SET department_id = COALESCE(?, department_id),
             team_name = COALESCE(?, team_name),
             description = COALESCE(?, description),
             is_active = COALESCE(?, is_active),
             default_shift_code = COALESCE(?, default_shift_code)
       WHERE id = ?`;

    const [result] = await pool.execute<ResultSetHeader>(sql, [
      departmentIdInput ?? null,
      teamNameInput ? String(teamNameInput).trim() : null,
      descriptionInput ? String(descriptionInput) : null,
      isActiveInput === null || isActiveInput === undefined ? null : Number(isActiveInput) ? 1 : 0,
      defaultShiftCodeInput ? String(defaultShiftCodeInput).trim() : null,
      id,
    ]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ success: true });
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to update team');
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid team id' });
    return;
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id
         FROM organization_units
        WHERE id = ?
          AND unit_type = 'TEAM'
        LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const [childRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS childCount
         FROM organization_units
        WHERE parent_id = ?`,
      [id],
    );

    if (childRows[0]?.childCount > 0) {
      await pool.execute<ResultSetHeader>(
        `UPDATE organization_units SET is_active = 0 WHERE id = ?`,
        [id],
      );
      res.json({ success: true, softDeleted: true });
      return;
    }

    try {
      const [assignmentRows] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM employee_team_roles WHERE team_id = ?',
        [id],
      );
      if (assignmentRows[0]?.cnt > 0) {
        await pool.execute<ResultSetHeader>(
          `UPDATE organization_units SET is_active = 0 WHERE id = ?`,
          [id],
        );
        res.json({ success: true, softDeleted: true });
        return;
      }
    } catch (assignmentError: any) {
      if (!isTableMissingError(assignmentError)) {
        console.warn('[OrganizationController] Failed to check team assignments during delete:', assignmentError);
      }
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM organization_units
        WHERE id = ?
          AND unit_type = 'TEAM'
        LIMIT 1`,
      [id],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ success: true });
    return;
  } catch (error: any) {
    if (!isTableMissingError(error)) {
      respondWithError(res, error, 'Failed to delete team');
      return;
    }
    console.warn('[OrganizationController] organization_units missing, fallback to legacy teams table');
  }

  try {
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
  } catch (legacyError) {
    respondWithError(res, legacyError, 'Failed to delete team');
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
