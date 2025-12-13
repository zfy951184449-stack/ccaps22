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

type SchedulingSettings = {
  // 基础约束
  monthlyToleranceHours?: number;
  monthlyMinHours?: number;
  monthlyMaxHours?: number;
  maxConsecutiveWorkdays?: number;
  enforceMonthlyHours?: boolean;
  enforceQuarterHours?: boolean;
  enforceConsecutiveLimit?: boolean;
  enforceEmployeeUnavailability?: boolean;

  // 夜班约束
  nightShiftPreferredRestDays?: number;
  nightShiftMinimumRestDays?: number;
  enforceNightRest?: boolean;
  enforceNightFairness?: boolean;
  maxConsecutiveNightShifts?: number;
  nightShiftWindowDays?: number;
  maxNightShiftsPerWindow?: number;
  nightShiftMinGapDays?: number;
  nightShiftFairnessWeight?: number;

  // 主管约束
  preferNoLeaderNight?: boolean;
  leaderNightPenaltyWeight?: number;
  leaderLongDayThresholdHours?: number;
  leaderLongDayPenaltyWeight?: number;
  leaderTier1Threshold?: number;
  leaderTier2Threshold?: number;
  leaderTier3Threshold?: number;

  // 公平性约束
  preferFrontlineEmployees?: boolean;
  enableWorkshopFairness?: boolean;
  workshopFairnessToleranceHours?: number;
  workshopFairnessWeight?: number;
  nightShiftFrontlineFairnessWeight?: number;

  // 休息约束
  maxConsecutiveRestDays?: number;
  consecutiveRestPenaltyWeight?: number;

  // 节假日约束
  minimizeTripleHolidayHeadcount?: boolean;
  tripleHolidayPenaltyWeight?: number;

  // 求解器配置
  solverTimeLimit?: number;
  solverImprovementTimeoutSeconds?: number;
  shiftMatchingTolerance?: number;
};

const SCHEDULING_SETTINGS_KEY = 'SCHEDULING_SETTINGS';

const defaultSchedulingSettings: SchedulingSettings = {
  // 基础约束
  monthlyToleranceHours: 16,
  monthlyMinHours: -16,
  monthlyMaxHours: 16,
  maxConsecutiveWorkdays: 6,
  enforceMonthlyHours: true,
  enforceQuarterHours: true,
  enforceConsecutiveLimit: true,
  enforceEmployeeUnavailability: true,

  // 夜班约束
  nightShiftPreferredRestDays: 2,
  nightShiftMinimumRestDays: 1,
  enforceNightRest: true,
  enforceNightFairness: true,
  maxConsecutiveNightShifts: 1,
  nightShiftWindowDays: 14,
  maxNightShiftsPerWindow: 4,
  nightShiftMinGapDays: 2,
  nightShiftFairnessWeight: 10,

  // 主管约束
  preferNoLeaderNight: true,
  leaderNightPenaltyWeight: 50,
  leaderLongDayThresholdHours: 10,
  leaderLongDayPenaltyWeight: 30,
  leaderTier1Threshold: 6,
  leaderTier2Threshold: 10,
  leaderTier3Threshold: 17,

  // 公平性约束
  preferFrontlineEmployees: true,
  enableWorkshopFairness: false,
  workshopFairnessToleranceHours: 8,
  workshopFairnessWeight: 1,
  nightShiftFrontlineFairnessWeight: 20,

  // 休息约束
  maxConsecutiveRestDays: 3,
  consecutiveRestPenaltyWeight: 50,

  // 节假日约束
  minimizeTripleHolidayHeadcount: true,
  tripleHolidayPenaltyWeight: 10,

  // 求解器配置
  solverTimeLimit: 30,
  solverImprovementTimeoutSeconds: 60,
  shiftMatchingTolerance: 30,
};

export const getSchedulingSettings = async (req: Request, res: Response) => {
  try {
    const raw = await SystemSettingsService.getSetting(SCHEDULING_SETTINGS_KEY);
    if (!raw) {
      res.json(defaultSchedulingSettings);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      res.json({ ...defaultSchedulingSettings, ...parsed });
    } catch (error) {
      console.warn('Failed to parse scheduling settings, falling back to default', error);
      res.json(defaultSchedulingSettings);
    }
  } catch (error: any) {
    console.error('Failed to load scheduling settings:', error);
    res.status(500).json({ error: '无法获取排班参数' });
  }
};

export const updateSchedulingSettings = async (req: Request, res: Response) => {
  try {
    const settings: SchedulingSettings = req.body || {};

    const num = (value: any, fallback: number | undefined) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const bool = (value: any, fallback: boolean | undefined) => {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return fallback;
    };

    const merged: SchedulingSettings = {
      ...defaultSchedulingSettings,
      ...settings,
      // 基础约束
      enforceMonthlyHours: bool(settings.enforceMonthlyHours, defaultSchedulingSettings.enforceMonthlyHours),
      monthlyToleranceHours: num(settings.monthlyToleranceHours, defaultSchedulingSettings.monthlyToleranceHours),
      monthlyMinHours: num(
        settings.monthlyMinHours,
        settings.monthlyToleranceHours ? -Math.abs(Number(settings.monthlyToleranceHours)) : defaultSchedulingSettings.monthlyMinHours,
      ),
      monthlyMaxHours: num(
        settings.monthlyMaxHours,
        settings.monthlyToleranceHours ? Math.abs(Number(settings.monthlyToleranceHours)) : defaultSchedulingSettings.monthlyMaxHours,
      ),
      enforceQuarterHours: bool(settings.enforceQuarterHours, defaultSchedulingSettings.enforceQuarterHours),
      enforceConsecutiveLimit: bool(settings.enforceConsecutiveLimit, defaultSchedulingSettings.enforceConsecutiveLimit),
      maxConsecutiveWorkdays: num(settings.maxConsecutiveWorkdays, defaultSchedulingSettings.maxConsecutiveWorkdays),
      enforceEmployeeUnavailability: bool(settings.enforceEmployeeUnavailability, defaultSchedulingSettings.enforceEmployeeUnavailability),

      // 夜班约束
      enforceNightRest: bool(settings.enforceNightRest, defaultSchedulingSettings.enforceNightRest),
      nightShiftPreferredRestDays: num(settings.nightShiftPreferredRestDays, defaultSchedulingSettings.nightShiftPreferredRestDays),
      nightShiftMinimumRestDays: num(settings.nightShiftMinimumRestDays, defaultSchedulingSettings.nightShiftMinimumRestDays),
      enforceNightFairness: bool(settings.enforceNightFairness, defaultSchedulingSettings.enforceNightFairness),
      maxConsecutiveNightShifts: num(settings.maxConsecutiveNightShifts, defaultSchedulingSettings.maxConsecutiveNightShifts),
      nightShiftWindowDays: num(settings.nightShiftWindowDays, defaultSchedulingSettings.nightShiftWindowDays),
      maxNightShiftsPerWindow: num(settings.maxNightShiftsPerWindow, defaultSchedulingSettings.maxNightShiftsPerWindow),
      nightShiftMinGapDays: num(settings.nightShiftMinGapDays, defaultSchedulingSettings.nightShiftMinGapDays),

      // 主管约束
      preferNoLeaderNight: bool(settings.preferNoLeaderNight, defaultSchedulingSettings.preferNoLeaderNight),
      leaderNightPenaltyWeight: num(settings.leaderNightPenaltyWeight, defaultSchedulingSettings.leaderNightPenaltyWeight),
      leaderLongDayThresholdHours: num(settings.leaderLongDayThresholdHours, defaultSchedulingSettings.leaderLongDayThresholdHours),
      leaderLongDayPenaltyWeight: num(settings.leaderLongDayPenaltyWeight, defaultSchedulingSettings.leaderLongDayPenaltyWeight),
      leaderTier1Threshold: num(settings.leaderTier1Threshold, defaultSchedulingSettings.leaderTier1Threshold),
      leaderTier2Threshold: num(settings.leaderTier2Threshold, defaultSchedulingSettings.leaderTier2Threshold),
      leaderTier3Threshold: num(settings.leaderTier3Threshold, defaultSchedulingSettings.leaderTier3Threshold),

      // 公平性约束
      preferFrontlineEmployees: bool(settings.preferFrontlineEmployees, defaultSchedulingSettings.preferFrontlineEmployees),
      nightShiftFairnessWeight: num(settings.nightShiftFairnessWeight, defaultSchedulingSettings.nightShiftFairnessWeight),
      nightShiftFrontlineFairnessWeight: num(settings.nightShiftFrontlineFairnessWeight, defaultSchedulingSettings.nightShiftFrontlineFairnessWeight),
      enableWorkshopFairness: bool(settings.enableWorkshopFairness, defaultSchedulingSettings.enableWorkshopFairness),
      workshopFairnessToleranceHours: num(settings.workshopFairnessToleranceHours, defaultSchedulingSettings.workshopFairnessToleranceHours),
      workshopFairnessWeight: num(settings.workshopFairnessWeight, defaultSchedulingSettings.workshopFairnessWeight),

      // 休息约束
      maxConsecutiveRestDays: num(settings.maxConsecutiveRestDays, defaultSchedulingSettings.maxConsecutiveRestDays),
      consecutiveRestPenaltyWeight: num(settings.consecutiveRestPenaltyWeight, defaultSchedulingSettings.consecutiveRestPenaltyWeight),

      // 节假日约束
      minimizeTripleHolidayHeadcount: bool(settings.minimizeTripleHolidayHeadcount, defaultSchedulingSettings.minimizeTripleHolidayHeadcount),
      tripleHolidayPenaltyWeight: num(settings.tripleHolidayPenaltyWeight, defaultSchedulingSettings.tripleHolidayPenaltyWeight),

      // 求解器配置
      solverTimeLimit: num(settings.solverTimeLimit, defaultSchedulingSettings.solverTimeLimit),
      solverImprovementTimeoutSeconds: num(settings.solverImprovementTimeoutSeconds, defaultSchedulingSettings.solverImprovementTimeoutSeconds),
      shiftMatchingTolerance: num(settings.shiftMatchingTolerance, defaultSchedulingSettings.shiftMatchingTolerance),
    };

    await SystemSettingsService.setSetting(
      SCHEDULING_SETTINGS_KEY,
      JSON.stringify(merged),
      { description: '自动排班求解参数' },
    );
    res.json(merged);
  } catch (error: any) {
    console.error('Failed to update scheduling settings:', error);
    res.status(500).json({ error: '无法保存排班参数' });
  }
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
