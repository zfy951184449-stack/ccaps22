import { Request, Response } from 'express';
import dayjs from 'dayjs';
import pool from '../config/database';
import { Qualification } from '../models/types';
import {
  getQualificationImpact,
  getQualificationMatrix,
  getQualificationOverview,
  getQualificationShortageMonitoring,
  getQualificationShortages,
} from '../services/qualificationInsightsService';

export const getQualifications = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM qualifications ORDER BY id');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch qualifications' });
  }
};

export const getQualificationsOverview = async (_req: Request, res: Response) => {
  try {
    const overview = await getQualificationOverview();
    res.json(overview);
  } catch (error) {
    console.error('Error fetching qualification overview:', error);
    res.status(500).json({ error: 'Failed to fetch qualification overview' });
  }
};

export const getQualificationMatrixView = async (_req: Request, res: Response) => {
  try {
    const matrix = await getQualificationMatrix();
    res.json(matrix);
  } catch (error) {
    console.error('Error fetching qualification matrix view:', error);
    res.status(500).json({ error: 'Failed to fetch qualification matrix view' });
  }
};

export const getQualificationShortagesView = async (req: Request, res: Response) => {
  try {
    const rawMode = typeof req.query.mode === 'string' ? req.query.mode : 'current_month';
    const mode = rawMode === 'all_activated' ? 'all_activated' : 'current_month';
    const rawYearMonth =
      typeof req.query.year_month === 'string'
        ? req.query.year_month
        : dayjs().format('YYYY-MM');

    if (
      mode === 'current_month' &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(rawYearMonth)
    ) {
      return res.status(400).json({ error: 'Invalid year_month. Expected YYYY-MM.' });
    }

    const shortages = await getQualificationShortages({
      mode,
      yearMonth: mode === 'current_month' ? rawYearMonth : null,
    });

    res.json(shortages);
  } catch (error) {
    console.error('Error fetching qualification shortages:', error);
    res.status(500).json({ error: 'Failed to fetch qualification shortages' });
  }
};

export const getQualificationShortageMonitoringView = async (
  req: Request,
  res: Response,
) => {
  try {
    const rawMode = typeof req.query.mode === 'string' ? req.query.mode : 'current_month';
    const mode = rawMode === 'all_activated' ? 'all_activated' : 'current_month';
    const rawYearMonth =
      typeof req.query.year_month === 'string'
        ? req.query.year_month
        : dayjs().format('YYYY-MM');
    const rawMonths = typeof req.query.months === 'string' ? Number(req.query.months) : 6;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rawYearMonth)) {
      return res.status(400).json({ error: 'Invalid year_month. Expected YYYY-MM.' });
    }

    if (!Number.isInteger(rawMonths) || rawMonths < 1 || rawMonths > 12) {
      return res.status(400).json({ error: 'Invalid months. Expected integer between 1 and 12.' });
    }

    const monitoring = await getQualificationShortageMonitoring({
      mode,
      months: rawMonths,
      yearMonth: rawYearMonth,
    });

    res.json(monitoring);
  } catch (error) {
    console.error('Error fetching qualification shortage monitoring:', error);
    res.status(500).json({ error: 'Failed to fetch qualification shortage monitoring' });
  }
};

export const getQualificationImpactById = async (req: Request, res: Response) => {
  try {
    const qualificationId = Number(req.params.id);

    if (!Number.isFinite(qualificationId)) {
      return res.status(400).json({ error: 'Invalid qualification id' });
    }

    const impact = await getQualificationImpact(qualificationId);

    if (!impact) {
      return res.status(404).json({ error: 'Qualification not found' });
    }

    res.json(impact);
  } catch (error) {
    console.error('Error fetching qualification impact:', error);
    res.status(500).json({ error: 'Failed to fetch qualification impact' });
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
    const qualificationId = Number(req.params.id);

    if (!Number.isFinite(qualificationId)) {
      return res.status(400).json({ error: 'Invalid qualification id' });
    }

    const impact = await getQualificationImpact(qualificationId);

    if (!impact) {
      return res.status(404).json({ error: 'Qualification not found' });
    }

    if (!impact.deletable) {
      return res.status(409).json({
        error: 'QUALIFICATION_IN_USE',
        message:
          'This qualification is still referenced by employees or operations and cannot be deleted.',
        impact,
      });
    }

    await pool.execute('DELETE FROM qualifications WHERE id = ?', [qualificationId]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting qualification:', error);
    res.status(500).json({ error: 'Failed to delete qualification' });
  }
};
