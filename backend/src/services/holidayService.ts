import https from 'https';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import SystemSettingsService from './systemSettingsService';

interface CalendarEntry {
  date: string;
  isWorkday: boolean;
  holidayName: string | null;
  holidayType: 'LEGAL_HOLIDAY' | 'WEEKEND_ADJUSTMENT' | 'MAKEUP_WORK' | 'WORKDAY';
  source: 'PRIMARY' | 'SECONDARY' | 'MANUAL';
  confidence: number;
  notes?: string | null;
}

interface TianApiHolidayRecord {
  holiday: string;
  name: string;
  vacation: string[] | string;
  remark?: string[] | string;
  wage?: string[] | string;
  tip?: string;
}

interface TianApiResponse {
  code: number;
  msg?: string;
  result?: {
    update?: boolean;
    list?: TianApiHolidayRecord[];
  };
}

interface ImportResult {
  year: number;
  inserted: number;
  updated: number;
  totalDays: number;
  primaryCount: number;
  fallbackCount: number;
  workingDays: number;
  restDays: number;
  warnings: string[];
}

export class HolidayService {
  private static ongoingImports: Map<number, Promise<ImportResult>> = new Map();
  private static apiCallCache: Map<string, { data: any; expires: number }> = new Map();
  private static readonly API_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存
  private static readonly MAX_CONCURRENT_CALLS = 3;
  private static activeCalls = 0;

  static async importYear(year: number): Promise<ImportResult> {
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new Error('年份无效');
    }

    const existing = HolidayService.ongoingImports.get(year);
    if (existing) {
      return existing;
    }

    const task = HolidayService.performImport(year);
    HolidayService.ongoingImports.set(year, task);
    try {
      const result = await task;
      const status = result.warnings.length ? 'PARTIAL' : 'SUCCESS';
      const source = result.primaryCount > 0 ? 'TIANAPI' : 'FALLBACK';
      const message = result.warnings.length ? JSON.stringify({ warnings: result.warnings }) : null;
      await HolidayService.recordUpdateLog({
        year,
        source,
        status,
        records: result.totalDays,
        message,
      });
      return result;
    } catch (error: any) {
      await HolidayService.recordUpdateLog({
        year,
        source: 'TIANAPI',
        status: 'FAILED',
        records: 0,
        message: error?.message || 'Holiday import failed',
      });
      throw error;
    } finally {
      HolidayService.ongoingImports.delete(year);
    }
  }

  static async ensureCalendarCoverage(startDate: string, endDate: string): Promise<void> {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    if (!start.isValid() || !end.isValid()) {
      return;
    }

    const years = new Set<number>();
    for (let year = start.year(); year <= end.year(); year += 1) {
      years.add(year);
    }

    // 批量检查缺失的年份
    const missingYears: number[] = [];
    for (const year of years) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM calendar_workdays WHERE YEAR(calendar_date) = ?',
        [year],
      );
      const total = rows.length ? Number(rows[0].total || 0) : 0;
      if (total === 0) {
        missingYears.push(year);
      }
    }

    // 并发批量导入缺失的年份（限制并发数）
    if (missingYears.length > 0) {
      console.log(`批量导入缺失的年份数据: ${missingYears.join(', ')}`);
      const batchSize = 3; // 每批最多3个并发请求
      for (let i = 0; i < missingYears.length; i += batchSize) {
        const batch = missingYears.slice(i, i + batchSize);
        await Promise.all(batch.map(year => HolidayService.importYear(year)));
      }
    }
  }

  private static async performImport(year: number): Promise<ImportResult> {
    const { calendar, primaryCount, fallbackCount, warnings } = await HolidayService.buildCalendar(year);

    const connection = await pool.getConnection();
    let inserted = 0;
    let updated = 0;

    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM calendar_workdays WHERE YEAR(calendar_date) = ?', [year]);

      const dates = Array.from(calendar.values());
      for (const entry of dates) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO calendar_workdays
             (calendar_date, is_workday, holiday_name, holiday_type, source, confidence, fetched_at, last_verified_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
           ON DUPLICATE KEY UPDATE
             is_workday = VALUES(is_workday),
             holiday_name = VALUES(holiday_name),
             holiday_type = VALUES(holiday_type),
             source = VALUES(source),
             confidence = VALUES(confidence),
             fetched_at = VALUES(fetched_at),
             last_verified_at = VALUES(last_verified_at),
             notes = VALUES(notes)` ,
          [
            entry.date,
            entry.isWorkday ? 1 : 0,
            entry.holidayName,
            entry.holidayType,
            entry.source,
            entry.confidence,
            entry.notes || null,
          ],
        );

        if (result.affectedRows === 1) {
          inserted += 1;
        } else if (result.affectedRows === 2) {
          updated += 1;
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const workingDays = Array.from(calendar.values()).filter((item) => item.isWorkday).length;
    const restDays = Array.from(calendar.values()).length - workingDays;

    return {
      year,
      inserted,
      updated,
      totalDays: calendar.size,
      primaryCount,
      fallbackCount,
      workingDays,
      restDays,
      warnings,
    };
  }

  private static async buildCalendar(year: number) {
    const start = dayjs(`${year}-01-01`);
    const end = start.endOf('year');
    const calendar = new Map<string, CalendarEntry>();

    const fallbackData = await HolidayService.fetchFallbackData(year);
    const fallbackSet = new Set<string>();

    for (let current = start; current.isSameOrBefore(end); current = current.add(1, 'day')) {
      const date = current.format('YYYY-MM-DD');
      const isWeekend = [6, 0].includes(current.day());
      calendar.set(date, {
        date,
        isWorkday: isWeekend ? false : true,
        holidayName: null,
        holidayType: 'WORKDAY',
        source: 'MANUAL',
        confidence: 50,
      });
    }

    let fallbackCount = 0;
    if (fallbackData) {
      fallbackData.days.forEach((day: { name: string; date: string; isOffDay: boolean }) => {
        const entry = calendar.get(day.date);
        if (!entry) {
          return;
        }
        fallbackSet.add(day.date);
        fallbackCount += 1;
        entry.holidayName = day.name || null;
        entry.isWorkday = !day.isOffDay;
        entry.holidayType = day.isOffDay ? 'LEGAL_HOLIDAY' : 'MAKEUP_WORK';
        entry.source = 'SECONDARY';
        entry.confidence = 80;
        entry.notes = day.isOffDay ? 'fallback:休假' : 'fallback:调休上班';
      });
    }

    let primaryCount = 0;
    const warnings = [...(fallbackData?.warnings || [])];
    try {
      const primaryHolidays = await HolidayService.fetchPrimaryData(year);
      primaryCount = HolidayService.applyPrimaryData(calendar, primaryHolidays);
    } catch (error: any) {
      warnings.push(`TianAPI 节假日接口获取失败: ${error?.message || error}`);
    }

    return { calendar, primaryCount, fallbackCount, warnings };
  }

  private static async fetchPrimaryData(year: number): Promise<TianApiHolidayRecord[]> {
    const storedKey = await SystemSettingsService.getSetting('TIANAPI_KEY');
    const apiKey = storedKey || process.env.TIANAPI_KEY || process.env.TIAN_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 TIANAPI_KEY');
    }

    const cacheKey = `tianapi_${year}`;
    const now = Date.now();

    // 检查缓存
    const cached = HolidayService.apiCallCache.get(cacheKey);
    if (cached && cached.expires > now) {
      console.log(`使用缓存的TianAPI数据: ${year}年`);
      return cached.data;
    }

    // 并发限制
    while (HolidayService.activeCalls >= HolidayService.MAX_CONCURRENT_CALLS) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    HolidayService.activeCalls++;
    try {
      const url = new URL('https://apis.tianapi.com/jiejiari/index');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('date', String(year));
      url.searchParams.set('type', '1');

      console.log(`调用TianAPI获取${year}年节假日数据`);
      const response = await HolidayService.fetchJson<TianApiResponse>(url.toString());
      if (!response || response.code !== 200) {
        throw new Error(response?.msg || '节假日接口请求失败');
      }

      const data = response.result?.list || [];

      // 缓存结果
      HolidayService.apiCallCache.set(cacheKey, {
        data,
        expires: now + HolidayService.API_CACHE_TTL
      });

      return data;
    } finally {
      HolidayService.activeCalls--;
    }
  }

  private static applyPrimaryData(calendar: Map<string, CalendarEntry>, holidays: TianApiHolidayRecord[]): number {
    let primaryCount = 0;

    holidays.forEach((holiday) => {
      const vacationDates = HolidayService.parseDateList(holiday.vacation);
      const makeUpDates = HolidayService.parseDateList(holiday.remark);
      const legalHolidayDates = new Set(HolidayService.parseDateList(holiday.wage));

      vacationDates.forEach((date) => {
        const entry = calendar.get(date);
        if (!entry) {
          return;
        }
        primaryCount += 1;
        entry.holidayName = holiday.name || entry.holidayName || holiday.holiday;
        entry.isWorkday = false;
        entry.holidayType = legalHolidayDates.has(date) ? 'LEGAL_HOLIDAY' : 'WEEKEND_ADJUSTMENT';
        entry.source = 'PRIMARY';
        entry.confidence = legalHolidayDates.has(date) ? 100 : 95;
        entry.notes = `tianapi:${holiday.holiday}`;
      });

      makeUpDates.forEach((date) => {
        const entry = calendar.get(date);
        if (!entry) {
          return;
        }
        entry.holidayName = holiday.name || entry.holidayName || holiday.holiday;
        entry.isWorkday = true;
        entry.holidayType = 'MAKEUP_WORK';
        entry.source = 'PRIMARY';
        entry.confidence = 95;
        entry.notes = 'tianapi:调休上班';
      });
    });

    return primaryCount;
  }

  private static parseDateList(value?: string[] | string | null): string[] {
    if (!value) {
      return [];
    }

    const rawList = Array.isArray(value)
      ? value
      : value
          .split(/\||,|\s+/)
          .map((item) => item.trim())
          .filter(Boolean);

    return rawList
      .map((date) => {
        const normalized = dayjs(date);
        return normalized.isValid() ? normalized.format('YYYY-MM-DD') : '';
      })
      .filter(Boolean);
  }

  private static async fetchFallbackData(year: number): Promise<{ days: Array<{ name: string; date: string; isOffDay: boolean }>; warnings?: string[] } | null> {
    const url = `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;
    try {
      const json = await HolidayService.fetchJson(url);
      if (json && Array.isArray(json.days)) {
        return { days: json.days };
      }
      return { days: [], warnings: ['备用节假日数据格式异常'] };
    } catch (error) {
      return { days: [], warnings: ['无法获取备用节假日数据'] };
    }
  }

  private static fetchJson<T = any>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { 'User-Agent': 'APS-Holiday-Service' } }, (res) => {
          const { statusCode } = res;
          if (!statusCode || statusCode >= 400) {
            reject(new Error(`请求失败: ${statusCode}`));
            res.resume();
            return;
          }
          let rawData = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(rawData);
              resolve(parsed as T);
            } catch (e) {
              reject(e);
            }
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  private static async recordUpdateLog(params: {
    year: number;
    source: string;
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    records: number;
    message?: string | null;
  }): Promise<void> {
    try {
      await pool.execute(
        `INSERT INTO holiday_update_log (update_year, update_source, records_count, update_status, error_message)
         VALUES (?, ?, ?, ?, ?)` ,
        [params.year, params.source, params.records, params.status, params.message || null],
      );
    } catch (error) {
      console.error('Failed to record holiday update log:', error);
    }
  }

  /**
   * 清理过期缓存
   */
  static cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    HolidayService.apiCallCache.forEach((value, key) => {
      if (value.expires <= now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => HolidayService.apiCallCache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`清理了 ${keysToDelete.length} 个过期的API缓存`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  static getCacheStats(): { apiCacheSize: number; importTasksSize: number } {
    return {
      apiCacheSize: HolidayService.apiCallCache.size,
      importTasksSize: HolidayService.ongoingImports.size
    };
  }

  /**
   * 预加载未来年份数据
   */
  static async preloadFutureYears(yearsAhead: number = 2): Promise<void> {
    const currentYear = dayjs().year();
    const targetYears: number[] = [];

    for (let i = 0; i <= yearsAhead; i++) {
      targetYears.push(currentYear + i);
    }

    console.log(`预加载未来${yearsAhead}年节假日数据: ${targetYears.join(', ')}`);

    // 并发预加载，但限制并发数
    const batchSize = 2;
    for (let i = 0; i < targetYears.length; i += batchSize) {
      const batch = targetYears.slice(i, i + batchSize);
      await Promise.all(batch.map(async (year) => {
        try {
          // 只预加载到缓存，不写入数据库
          await HolidayService.fetchPrimaryData(year);
          console.log(`预加载完成: ${year}年`);
        } catch (error) {
          console.warn(`预加载失败 ${year}年:`, error);
        }
      }));
    }
  }
}

export default HolidayService;
dayjs.extend(isSameOrBefore);
