import https from 'https';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

interface CalendarEntry {
  date: string;
  isWorkday: boolean;
  holidayName: string | null;
  holidayType: 'LEGAL_HOLIDAY' | 'WEEKEND_ADJUSTMENT' | 'MAKEUP_WORK' | 'WORKDAY';
  source: 'PRIMARY' | 'SECONDARY' | 'MANUAL';
  confidence: number;
  notes?: string | null;
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
      return await task;
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

    for (const year of years) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM calendar_workdays WHERE YEAR(calendar_date) = ?',
        [year],
      );
      const total = rows.length ? Number(rows[0].total || 0) : 0;
      if (total === 0) {
        await HolidayService.importYear(year);
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
    try {
      const primaryHolidays = await HolidayService.fetchPrimaryData(year);
      primaryHolidays.forEach((holiday) => {
        const entry = calendar.get(holiday.date);
        if (!entry) {
          return;
        }
        primaryCount += 1;
        entry.holidayName = holiday.localName || holiday.name;
        entry.isWorkday = false;
        entry.holidayType = 'LEGAL_HOLIDAY';
        entry.source = 'PRIMARY';
        entry.confidence = 100;
        entry.notes = 'primary';
      });
    } catch (error) {
      // If primary fetch fails, fallback-only is used.
    }

    return { calendar, primaryCount, fallbackCount, warnings: fallbackData?.warnings || [] };
  }

  private static fetchPrimaryData(year: number): Promise<Array<{ date: string; localName: string; name: string }>> {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/CN`;
    return HolidayService.fetchJson(url);
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
}

export default HolidayService;
dayjs.extend(isSameOrBefore);
