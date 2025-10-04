import { Request, Response } from 'express';
import pool from '../config/database';
import { Qualification } from '../models/types';

export const getQualifications = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM qualifications ORDER BY id');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch qualifications' });
  }
};

export const createQualification = async (req: Request, res: Response) => {
  try {
    const { qualification_name }: Qualification = req.body;
    
    const [result] = await pool.execute(
      'INSERT INTO qualifications (qualification_name) VALUES (?)',
      [qualification_name]
    );
    
    const insertId = (result as any).insertId;
    const [newQualification] = await pool.execute('SELECT * FROM qualifications WHERE id = ?', [insertId]);
    
    res.status(201).json((newQualification as any[])[0]);
  } catch (error) {
    console.error('Error creating qualification:', error);
    res.status(500).json({ error: 'Failed to create qualification' });
  }
};

export const updateQualification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { qualification_name }: Qualification = req.body;
    
    await pool.execute(
      'UPDATE qualifications SET qualification_name = ? WHERE id = ?',
      [qualification_name, id]
    );
    
    const [updatedQualification] = await pool.execute('SELECT * FROM qualifications WHERE id = ?', [id]);
    
    res.json((updatedQualification as any[])[0]);
  } catch (error) {
    console.error('Error updating qualification:', error);
    res.status(500).json({ error: 'Failed to update qualification' });
  }
};

export const deleteQualification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM qualifications WHERE id = ?', [id]);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting qualification:', error);
    res.status(500).json({ error: 'Failed to delete qualification' });
  }
};