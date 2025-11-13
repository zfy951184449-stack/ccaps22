import { Request, Response } from 'express';
import pool from '../config/database';
import { ShiftDefinition } from '../models/types';

const mapRow = (row: any): ShiftDefinition => ({
  id: Number(row.id),
  shift_code: row.shift_code,
  shift_name: row.shift_name,
  category: row.category,
  start_time: row.start_time,
  end_time: row.end_time,
  is_cross_day: Boolean(row.is_cross_day),
  nominal_hours: Number(row.nominal_hours),
  max_extension_hours: row.max_extension_hours !== null ? Number(row.max_extension_hours) : undefined,
  description: row.description,
  is_active: Boolean(row.is_active),
  created_by: row.created_by !== null ? Number(row.created_by) : null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const listShiftDefinitions = async (req: Request, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive ?? '').toLowerCase() === 'true';
    const query = `
      SELECT id, shift_code, shift_name, category, start_time, end_time, is_cross_day,
             nominal_hours, max_extension_hours, description, is_active, created_by,
             created_at, updated_at
        FROM shift_definitions
       ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY shift_code ASC
    `;
    const [rows] = await pool.query(query);
    res.json((rows as any[]).map(mapRow));
  } catch (error) {
    console.error('Failed to list shift definitions:', error);
    res.status(500).json({ error: '无法获取班次定义列表' });
  }
};

export const getShiftDefinition = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT id, shift_code, shift_name, category, start_time, end_time, is_cross_day,
              nominal_hours, max_extension_hours, description, is_active, created_by,
              created_at, updated_at
         FROM shift_definitions
        WHERE id = ?`,
      [id],
    );
    const records = rows as any[];
    if (!records.length) {
      res.status(404).json({ error: '班次定义不存在' });
      return;
    }
    res.json(mapRow(records[0]));
  } catch (error) {
    console.error('Failed to fetch shift definition:', error);
    res.status(500).json({ error: '无法获取班次定义详情' });
  }
};

export const createShiftDefinition = async (req: Request, res: Response) => {
  try {
    const payload: ShiftDefinition = req.body;
    const [result] = await pool.execute(
      `INSERT INTO shift_definitions
         (shift_code, shift_name, category, start_time, end_time, is_cross_day,
          nominal_hours, max_extension_hours, description, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.shift_code,
        payload.shift_name,
        payload.category,
        payload.start_time,
        payload.end_time,
        payload.is_cross_day ? 1 : 0,
        payload.nominal_hours,
        payload.max_extension_hours ?? 0,
        payload.description ?? null,
        payload.is_active ?? true ? 1 : 0,
        payload.created_by ?? null,
      ],
    );
    const insertResult = result as any;
    res.status(201).json({
      id: insertResult.insertId,
      ...payload,
      is_active: payload.is_active ?? true,
    });
  } catch (error: any) {
    console.error('Failed to create shift definition:', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: '班次编码已存在' });
      return;
    }
    res.status(500).json({ error: '无法创建班次定义' });
  }
};

export const updateShiftDefinition = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload: Partial<ShiftDefinition> = req.body;
    const [result] = await pool.execute(
      `UPDATE shift_definitions
          SET shift_code = COALESCE(?, shift_code),
              shift_name = COALESCE(?, shift_name),
              category = COALESCE(?, category),
              start_time = COALESCE(?, start_time),
              end_time = COALESCE(?, end_time),
              is_cross_day = COALESCE(?, is_cross_day),
              nominal_hours = COALESCE(?, nominal_hours),
              max_extension_hours = COALESCE(?, max_extension_hours),
              description = COALESCE(?, description),
              is_active = COALESCE(?, is_active)
        WHERE id = ?`,
      [
        payload.shift_code ?? null,
        payload.shift_name ?? null,
        payload.category ?? null,
        payload.start_time ?? null,
        payload.end_time ?? null,
        payload.is_cross_day !== undefined ? (payload.is_cross_day ? 1 : 0) : null,
        payload.nominal_hours ?? null,
        payload.max_extension_hours ?? null,
        payload.description ?? null,
        payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : null,
        id,
      ],
    );
    const updateResult = result as any;
    if (!updateResult.affectedRows) {
      res.status(404).json({ error: '班次定义不存在' });
      return;
    }
    res.json({ message: '班次定义已更新' });
  } catch (error: any) {
    console.error('Failed to update shift definition:', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: '班次编码已存在' });
      return;
    }
    res.status(500).json({ error: '无法更新班次定义' });
  }
};

export const deleteShiftDefinition = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'UPDATE shift_definitions SET is_active = 0 WHERE id = ?',
      [id],
    );
    const deleteResult = result as any;
    if (!deleteResult.affectedRows) {
      res.status(404).json({ error: '班次定义不存在' });
      return;
    }
    res.json({ message: '班次定义已停用' });
  } catch (error) {
    console.error('Failed to delete shift definition:', error);
    res.status(500).json({ error: '无法停用班次定义' });
  }
};
