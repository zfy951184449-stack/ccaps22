import { Request, Response } from 'express';
import pool from '../config/database';
import { ShiftType } from '../models/types';

export const getShiftTypes = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM shift_types WHERE is_active = 1 ORDER BY shift_code'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting shift types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getShiftTypeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM shift_types WHERE id = ?',
      [id]
    );
    const shiftTypes = rows as ShiftType[];
    
    if (shiftTypes.length === 0) {
      return res.status(404).json({ error: 'Shift type not found' });
    }
    
    res.json(shiftTypes[0]);
  } catch (error) {
    console.error('Error getting shift type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createShiftType = async (req: Request, res: Response) => {
  try {
    const shiftType: ShiftType = req.body;
    
    const [result] = await pool.execute(
      `INSERT INTO shift_types (shift_code, shift_name, start_time, end_time, work_hours, 
       is_night_shift, is_weekend_shift, overtime_rate, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shiftType.shift_code,
        shiftType.shift_name,
        shiftType.start_time,
        shiftType.end_time,
        shiftType.work_hours,
        shiftType.is_night_shift,
        shiftType.is_weekend_shift,
        shiftType.overtime_rate,
        shiftType.description
      ]
    );
    
    const insertResult = result as any;
    const newShiftType = { ...shiftType, id: insertResult.insertId };
    
    res.status(201).json(newShiftType);
  } catch (error) {
    console.error('Error creating shift type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateShiftType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shiftType: Partial<ShiftType> = req.body;
    
    const [result] = await pool.execute(
      `UPDATE shift_types SET 
       shift_code = COALESCE(?, shift_code),
       shift_name = COALESCE(?, shift_name),
       start_time = COALESCE(?, start_time),
       end_time = COALESCE(?, end_time),
       work_hours = COALESCE(?, work_hours),
       is_night_shift = COALESCE(?, is_night_shift),
       is_weekend_shift = COALESCE(?, is_weekend_shift),
       overtime_rate = COALESCE(?, overtime_rate),
       description = COALESCE(?, description),
       is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        shiftType.shift_code,
        shiftType.shift_name,
        shiftType.start_time,
        shiftType.end_time,
        shiftType.work_hours,
        shiftType.is_night_shift,
        shiftType.is_weekend_shift,
        shiftType.overtime_rate,
        shiftType.description,
        shiftType.is_active,
        id
      ]
    );
    
    const updateResult = result as any;
    
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Shift type not found' });
    }
    
    res.json({ message: 'Shift type updated successfully' });
  } catch (error) {
    console.error('Error updating shift type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteShiftType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // 软删除：设置 is_active 为 false
    const [result] = await pool.execute(
      'UPDATE shift_types SET is_active = 0 WHERE id = ?',
      [id]
    );
    
    const deleteResult = result as any;
    
    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Shift type not found' });
    }
    
    res.json({ message: 'Shift type deactivated successfully' });
  } catch (error) {
    console.error('Error deleting shift type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};