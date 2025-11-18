import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import HolidayService from '../services/holidayService';
import SystemSettingsService from '../services/systemSettingsService';

interface HolidayLogRow extends RowDataPacket {
  id: number;
  update_year: number;
  update_source: string;
  update_time: string;
  records_count: number;
  update_status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  error_message?: string | null;
}

const maskKey = (key: string): string => {
  if (!key) {
    return '';
  }
  if (key.length <= 6) {
    return `${key[0]}***${key[key.length - 1]}`;
  }
  return `${key.slice(0, 3)}****${key.slice(-3)}`;
};

export const getHolidayServiceStatus = async (req: Request, res: Response) => {
  try {
    const storedKey = await SystemSettingsService.getSetting('TIANAPI_KEY');
    const keyConfigured = Boolean(storedKey || process.env.TIANAPI_KEY || process.env.TIAN_API_KEY);

    const [logs] = await pool.execute<HolidayLogRow[]>(
      `SELECT id, update_year, update_source, update_time, records_count, update_status, error_message
       FROM holiday_update_log
       ORDER BY update_time DESC
       LIMIT 20`,
    );

    const recentLogs = (logs || []).map((log) => ({
      id: log.id,
      year: log.update_year,
      source: log.update_source,
      time: log.update_time,
      status: log.update_status,
      records: log.records_count,
      message: log.error_message || null,
    }));

    const lastSuccess = recentLogs.find((log) => log.status === 'SUCCESS');
    const lastFailure = recentLogs.find((log) => log.status === 'FAILED');

    const [coverageRangeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT MIN(calendar_date) AS minDate, MAX(calendar_date) AS maxDate FROM calendar_workdays`,
    );
    const coverageRange = Array.isArray(coverageRangeRows) && coverageRangeRows.length > 0
      ? {
          minDate: coverageRangeRows[0].minDate || null,
          maxDate: coverageRangeRows[0].maxDate || null,
        }
      : { minDate: null, maxDate: null };

    const [yearRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT YEAR(calendar_date) AS year FROM calendar_workdays ORDER BY year ASC`,
    );
    const coverageYears = (yearRows || [])
      .map((row) => (row.year !== null && row.year !== undefined ? Number(row.year) : null))
      .filter((year): year is number => Number.isFinite(year));

    res.json({
      keyConfigured,
      maskedKey: storedKey ? maskKey(storedKey) : null,
      coverage: {
        ...coverageRange,
        years: coverageYears,
      },
      recentLogs,
      lastSuccessTime: lastSuccess?.time || null,
      lastFailureTime: lastFailure?.time || null,
    });
  } catch (error: any) {
    console.error('Failed to load holiday service status:', error);
    res.status(500).json({ error: error?.message || '无法获取节假日服务状态' });
  }
};

export const updateHolidayApiKey = async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 16) {
      return res.status(400).json({ error: '请提供至少16位的有效密钥' });
    }

    const operator = (req as any)?.user?.username || (req as any)?.user?.id || 'system';
    await SystemSettingsService.setSetting('TIANAPI_KEY', apiKey.trim(), {
      description: '天行节假日API密钥',
      updatedBy: operator,
    });

    res.json({
      keyConfigured: true,
      maskedKey: maskKey(apiKey.trim()),
    });
  } catch (error: any) {
    console.error('Failed to update TianAPI key:', error);
    res.status(500).json({ error: error?.message || '无法更新密钥' });
  }
};

export const triggerHolidayImport = async (req: Request, res: Response) => {
  try {
    const { year } = req.body || {};
    const numericYear = Number(year);
    if (!Number.isFinite(numericYear) || numericYear < 2000 || numericYear > 2100) {
      return res.status(400).json({ error: '请提供介于2000-2100的有效年份' });
    }

    const result = await HolidayService.importYear(numericYear);
    res.json(result);
  } catch (error: any) {
    console.error('Failed to import holidays via system endpoint:', error);
    res.status(500).json({ error: error?.message || '节假日导入失败' });
  }
};
