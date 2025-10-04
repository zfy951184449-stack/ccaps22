import { Request, Response } from 'express';
import pool from '../config/database';
import { EmployeeQualification } from '../models/types';

export const getEmployeeQualifications = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        eq.*,
        e.employee_name,
        e.employee_code,
        q.qualification_name
      FROM employee_qualifications eq
      JOIN employees e ON eq.employee_id = e.id
      JOIN qualifications q ON eq.qualification_id = q.id
      ORDER BY e.employee_name, q.qualification_name
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch employee qualifications' });
  }
};

export const getEmployeeQualificationsByEmployeeId = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        eq.*,
        q.qualification_name
      FROM employee_qualifications eq
      JOIN qualifications q ON eq.qualification_id = q.id
      WHERE eq.employee_id = ?
      ORDER BY q.qualification_name
    `, [employeeId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employee qualifications by employee ID:', error);
    res.status(500).json({ error: 'Failed to fetch employee qualifications' });
  }
};

export const createEmployeeQualification = async (req: Request, res: Response) => {
  try {
    const { employee_id, qualification_id, qualification_level }: EmployeeQualification = req.body;
    
    // 检查是否已存在相同的人员资质组合
    const [existing] = await pool.execute(
      'SELECT id FROM employee_qualifications WHERE employee_id = ? AND qualification_id = ?',
      [employee_id, qualification_id]
    );
    
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ error: 'Employee already has this qualification' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES (?, ?, ?)',
      [employee_id, qualification_id, qualification_level]
    );
    
    const insertId = (result as any).insertId;
    const [newEmployeeQualification] = await pool.execute(`
      SELECT 
        eq.*,
        e.employee_name,
        e.employee_code,
        q.qualification_name
      FROM employee_qualifications eq
      JOIN employees e ON eq.employee_id = e.id
      JOIN qualifications q ON eq.qualification_id = q.id
      WHERE eq.id = ?
    `, [insertId]);
    
    res.status(201).json((newEmployeeQualification as any[])[0]);
  } catch (error) {
    console.error('Error creating employee qualification:', error);
    res.status(500).json({ error: 'Failed to create employee qualification' });
  }
};

export const updateEmployeeQualification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employee_id, qualification_id, qualification_level }: EmployeeQualification = req.body;
    
    // 检查是否存在相同的人员资质组合（排除当前记录）
    const [existing] = await pool.execute(
      'SELECT id FROM employee_qualifications WHERE employee_id = ? AND qualification_id = ? AND id != ?',
      [employee_id, qualification_id, id]
    );
    
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ error: 'Employee already has this qualification' });
    }
    
    await pool.execute(
      'UPDATE employee_qualifications SET employee_id = ?, qualification_id = ?, qualification_level = ? WHERE id = ?',
      [employee_id, qualification_id, qualification_level, id]
    );
    
    const [updatedEmployeeQualification] = await pool.execute(`
      SELECT 
        eq.*,
        e.employee_name,
        e.employee_code,
        q.qualification_name
      FROM employee_qualifications eq
      JOIN employees e ON eq.employee_id = e.id
      JOIN qualifications q ON eq.qualification_id = q.id
      WHERE eq.id = ?
    `, [id]);
    
    res.json((updatedEmployeeQualification as any[])[0]);
  } catch (error) {
    console.error('Error updating employee qualification:', error);
    res.status(500).json({ error: 'Failed to update employee qualification' });
  }
};

export const deleteEmployeeQualification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM employee_qualifications WHERE id = ?', [id]);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting employee qualification:', error);
    res.status(500).json({ error: 'Failed to delete employee qualification' });
  }
};