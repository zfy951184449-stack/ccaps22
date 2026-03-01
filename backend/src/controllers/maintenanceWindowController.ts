import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

export const getMaintenanceWindows = async (req: Request, res: Response) => {
  try {
    const { resource_id, window_type, from, to, active_only } = req.query;
    let query = `
      SELECT mw.*, r.resource_name, r.resource_code, r.department_code
      FROM maintenance_windows mw
      JOIN resources r ON r.id = mw.resource_id
      WHERE 1 = 1
    `;
    const params: unknown[] = [];

    if (resource_id) {
      query += ' AND mw.resource_id = ?';
      params.push(resource_id);
    }
    if (window_type) {
      query += ' AND mw.window_type = ?';
      params.push(window_type);
    }
    if (from) {
      query += ' AND mw.end_datetime >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND mw.start_datetime <= ?';
      params.push(to);
    }
    if (active_only !== undefined && toBoolean(active_only)) {
      query += ' AND mw.end_datetime >= NOW()';
    }

    query += ' ORDER BY mw.start_datetime DESC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows.map((row) => ({ ...row, is_hard_block: toBoolean(row.is_hard_block) })));
  } catch (error) {
    console.error('Error fetching maintenance windows:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance windows' });
  }
};

export const createMaintenanceWindow = async (req: Request, res: Response) => {
  try {
    const { resource_id, window_type, start_datetime, end_datetime, is_hard_block, owner_dept_code, notes } = req.body;

    if (!resource_id || !window_type || !start_datetime || !end_datetime) {
      return res.status(400).json({ error: 'resource_id, window_type, start_datetime and end_datetime are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO maintenance_windows (
        resource_id, window_type, start_datetime, end_datetime, is_hard_block, owner_dept_code, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [resource_id, window_type, start_datetime, end_datetime, is_hard_block === false ? 0 : 1, owner_dept_code || 'MAINT', notes || null],
    ) as { insertId: number }[];

    res.status(201).json({ id: result.insertId, message: 'Maintenance window created successfully' });
  } catch (error) {
    console.error('Error creating maintenance window:', error);
    res.status(500).json({ error: 'Failed to create maintenance window' });
  }
};

export const updateMaintenanceWindow = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'resource_id',
      'window_type',
      'start_datetime',
      'end_datetime',
      'is_hard_block',
      'owner_dept_code',
      'notes',
    ] as const;

    const updates: string[] = [];
    const params: unknown[] = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(field === 'is_hard_block' ? (req.body[field] ? 1 : 0) : req.body[field]);
      }
    });

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await pool.execute(`UPDATE maintenance_windows SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Maintenance window updated successfully' });
  } catch (error) {
    console.error('Error updating maintenance window:', error);
    res.status(500).json({ error: 'Failed to update maintenance window' });
  }
};
