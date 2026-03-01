import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const mapResourceRow = (row: Record<string, unknown>) => ({
  ...row,
  is_shared: toBoolean(row.is_shared),
  is_schedulable: toBoolean(row.is_schedulable),
  capacity: Number(row.capacity ?? 0),
});

export const getResources = async (req: Request, res: Response) => {
  try {
    const { resource_type, department_code, status, is_schedulable } = req.query;
    let query = `
      SELECT r.*, ou.unit_name AS owner_unit_name, ou.unit_code AS owner_unit_code
      FROM resources r
      LEFT JOIN organization_units ou ON ou.id = r.owner_org_unit_id
      WHERE 1 = 1
    `;
    const params: unknown[] = [];

    if (resource_type) {
      query += ' AND r.resource_type = ?';
      params.push(resource_type);
    }
    if (department_code) {
      query += ' AND r.department_code = ?';
      params.push(department_code);
    }
    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (is_schedulable !== undefined) {
      query += ' AND r.is_schedulable = ?';
      params.push(toBoolean(is_schedulable) ? 1 : 0);
    }

    query += ' ORDER BY r.department_code, r.resource_type, r.resource_name';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows.map((row) => mapResourceRow(row)));
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json({
        data: [],
        warnings: [`Platform resource model is not available because table ${extractMissingTableName(error) ?? 'resources'} is missing.`],
      });
    }
    console.error('Error fetching resources:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
};

export const createResource = async (req: Request, res: Response) => {
  try {
    const {
      resource_code,
      resource_name,
      resource_type,
      department_code,
      owner_org_unit_id,
      status,
      capacity,
      location,
      clean_level,
      is_shared,
      is_schedulable,
      metadata,
    } = req.body;

    if (!resource_code || !resource_name || !resource_type || !department_code) {
      return res.status(400).json({ error: 'resource_code, resource_name, resource_type and department_code are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO resources (
        resource_code, resource_name, resource_type, department_code, owner_org_unit_id,
        status, capacity, location, clean_level, is_shared, is_schedulable, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resource_code,
        resource_name,
        resource_type,
        department_code,
        owner_org_unit_id || null,
        status || 'ACTIVE',
        capacity || 1,
        location || null,
        clean_level || null,
        is_shared ? 1 : 0,
        is_schedulable === false ? 0 : 1,
        metadata ? JSON.stringify(metadata) : null,
      ],
    ) as { insertId: number }[];

    res.status(201).json({ id: result.insertId, message: 'Resource created successfully' });
  } catch (error) {
    console.error('Error creating resource:', error);
    res.status(500).json({ error: 'Failed to create resource' });
  }
};

export const getResourceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*, ou.unit_name AS owner_unit_name, ou.unit_code AS owner_unit_code
       FROM resources r
       LEFT JOIN organization_units ou ON ou.id = r.owner_org_unit_id
       WHERE r.id = ?`,
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const [statsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          (SELECT COUNT(*) FROM resource_calendars WHERE resource_id = ?) AS calendar_count,
          (SELECT COUNT(*) FROM maintenance_windows WHERE resource_id = ?) AS maintenance_count,
          (SELECT COUNT(*) FROM resource_assignments WHERE resource_id = ?) AS assignment_count`,
      [id, id, id],
    );

    res.json({
      ...mapResourceRow(rows[0]),
      stats: {
        calendar_count: Number(statsRows[0]?.calendar_count ?? 0),
        maintenance_count: Number(statsRows[0]?.maintenance_count ?? 0),
        assignment_count: Number(statsRows[0]?.assignment_count ?? 0),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(404).json({
        error: 'Platform resource model is not available',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'resources'}`,
      });
    }
    console.error('Error fetching resource detail:', error);
    res.status(500).json({ error: 'Failed to fetch resource detail' });
  }
};

export const updateResource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'resource_code',
      'resource_name',
      'resource_type',
      'department_code',
      'owner_org_unit_id',
      'status',
      'capacity',
      'location',
      'clean_level',
      'is_shared',
      'is_schedulable',
      'metadata',
    ] as const;

    const updates: string[] = [];
    const params: unknown[] = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === 'metadata') {
          params.push(req.body[field] ? JSON.stringify(req.body[field]) : null);
        } else if (field === 'is_shared' || field === 'is_schedulable') {
          params.push(req.body[field] ? 1 : 0);
        } else {
          params.push(req.body[field]);
        }
      }
    });

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await pool.execute(`UPDATE resources SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Resource updated successfully' });
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({ error: 'Failed to update resource' });
  }
};

export const getResourceCalendar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    const start = typeof from === 'string' ? from : '1970-01-01 00:00:00';
    const end = typeof to === 'string' ? to : '2999-12-31 23:59:59';

    const [calendarRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, resource_id, start_datetime, end_datetime, event_type, source_type, source_id, notes
       FROM resource_calendars
       WHERE resource_id = ?
         AND start_datetime <= ?
         AND end_datetime >= ?
       ORDER BY start_datetime`,
      [id, end, start],
    );

    const [maintenanceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          id,
          resource_id,
          start_datetime,
          end_datetime,
          'MAINTENANCE' AS event_type,
          'MAINTENANCE' AS source_type,
          id AS source_id,
          notes
       FROM maintenance_windows
       WHERE resource_id = ?
         AND start_datetime <= ?
         AND end_datetime >= ?
       ORDER BY start_datetime`,
      [id, end, start],
    );

    const [assignmentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          ra.id,
          ra.resource_id,
          ra.start_datetime,
          ra.end_datetime,
          'OCCUPIED' AS event_type,
          'SCHEDULING' AS source_type,
          ra.id AS source_id,
          COALESCE(ra.notes, CONCAT('Operation #', ra.batch_operation_plan_id)) AS notes
       FROM resource_assignments ra
       WHERE ra.resource_id = ?
         AND ra.start_datetime <= ?
         AND ra.end_datetime >= ?
         AND ra.assignment_status <> 'CANCELLED'
       ORDER BY ra.start_datetime`,
      [id, end, start],
    );

    const combined = [...calendarRows, ...maintenanceRows, ...assignmentRows]
      .sort((a, b) => new Date(String(a.start_datetime)).getTime() - new Date(String(b.start_datetime)).getTime());

    res.json(combined);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json({
        data: [],
        warnings: [`Resource calendar is unavailable because table ${extractMissingTableName(error) ?? 'resource_calendars'} is missing.`],
      });
    }
    console.error('Error fetching resource calendar:', error);
    res.status(500).json({ error: 'Failed to fetch resource calendar' });
  }
};

export const createResourceCalendarEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { start_datetime, end_datetime, event_type, source_type, source_id, notes } = req.body;

    if (!start_datetime || !end_datetime || !event_type || !source_type) {
      return res.status(400).json({ error: 'start_datetime, end_datetime, event_type and source_type are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO resource_calendars (resource_id, start_datetime, end_datetime, event_type, source_type, source_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, start_datetime, end_datetime, event_type, source_type, source_id || null, notes || null],
    ) as { insertId: number }[];

    res.status(201).json({ id: result.insertId, message: 'Resource calendar entry created successfully' });
  } catch (error) {
    console.error('Error creating resource calendar entry:', error);
    res.status(500).json({ error: 'Failed to create resource calendar entry' });
  }
};
