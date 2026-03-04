import dayjs from 'dayjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DbExecutor } from '../config/database';

export interface SpecialShiftOccurrenceFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
}

export interface SpecialShiftOccurrenceListItem {
  occurrence_id: number;
  date: string;
  shift_id: number;
  shift_name: string;
  required_people: number;
  filled_people: number;
  shortage_people: number;
  fulfillment_mode: 'HARD' | 'SOFT';
  priority_level: 'CRITICAL' | 'HIGH' | 'NORMAL';
  status: string;
  assignments: Array<{
    id: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    position_number: number;
    shift_plan_id: number;
    assignment_status: string;
    is_locked: boolean;
  }>;
  scheduling_run_id: number | null;
}

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseJsonArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

const getWindowDates = (startDate: string, endDate: string): string[] => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const dates: string[] = [];

  for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end, 'day'); cursor = cursor.add(1, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'));
  }

  return dates;
};

export class SpecialShiftOccurrenceService {
  static async rebuildOccurrences(
    connection: DbExecutor,
    windowId: number,
  ): Promise<number> {
    const [windowRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id, start_date, end_date
          FROM special_shift_windows
         WHERE id = ?
         LIMIT 1
      `,
      [windowId],
    );

    if (!windowRows.length) {
      return 0;
    }

    const windowRow = windowRows[0];
    const startDate = dayjs(windowRow.start_date).format('YYYY-MM-DD');
    const endDate = dayjs(windowRow.end_date).format('YYYY-MM-DD');

    const [ruleRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT
          id,
          shift_id,
          required_people,
          plan_category,
          fulfillment_mode,
          priority_level,
          qualification_id,
          min_level,
          days_of_week
        FROM special_shift_window_rules
        WHERE window_id = ?
        ORDER BY id
      `,
      [windowId],
    );

    await connection.execute('DELETE FROM special_shift_occurrences WHERE window_id = ?', [windowId]);

    const dates = getWindowDates(startDate, endDate);
    let inserted = 0;

    for (const rule of ruleRows) {
      const ruleId = Number(rule.id);
      const daysOfWeek = new Set(parseJsonArray(rule.days_of_week));

      for (const date of dates) {
        const day = dayjs(date).day();
        const normalizedDay = day === 0 ? 7 : day;
        if (!daysOfWeek.has(normalizedDay)) {
          continue;
        }

        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO special_shift_occurrences
              (
                window_id,
                rule_id,
                occurrence_date,
                shift_id,
                required_people,
                plan_category,
                fulfillment_mode,
                priority_level,
                qualification_id,
                min_level,
                status,
                scheduling_run_id
              )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL)
          `,
          [
            windowId,
            ruleId,
            date,
            Number(rule.shift_id),
            Number(rule.required_people),
            String(rule.plan_category || 'BASE'),
            String(rule.fulfillment_mode || 'HARD'),
            String(rule.priority_level || 'HIGH'),
            normalizeNumber(rule.qualification_id),
            normalizeNumber(rule.min_level),
          ],
        );
        inserted += 1;
      }
    }

    return inserted;
  }

  static async listOccurrences(
    connection: DbExecutor,
    windowId: number,
    filters: SpecialShiftOccurrenceFilters = {},
  ): Promise<SpecialShiftOccurrenceListItem[]> {
    const where: string[] = ['sso.window_id = ?'];
    const params: Array<string | number> = [windowId];

    if (filters.startDate) {
      where.push('sso.occurrence_date >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      where.push('sso.occurrence_date <= ?');
      params.push(filters.endDate);
    }
    if (filters.status) {
      where.push('sso.status = ?');
      params.push(filters.status);
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT
          sso.id AS occurrence_id,
          sso.occurrence_date,
          sso.shift_id,
          sd.shift_name,
          sso.required_people,
          sso.fulfillment_mode,
          sso.priority_level,
          sso.status,
          sso.scheduling_run_id,
          ssoa.id AS assignment_id,
          ssoa.position_number,
          ssoa.shift_plan_id,
          ssoa.assignment_status,
          ssoa.is_locked,
          e.id AS employee_id,
          e.employee_name,
          e.employee_code
        FROM special_shift_occurrences sso
        JOIN shift_definitions sd ON sd.id = sso.shift_id
        LEFT JOIN special_shift_occurrence_assignments ssoa
          ON ssoa.occurrence_id = sso.id
         AND ssoa.assignment_status <> 'CANCELLED'
        LEFT JOIN employees e ON e.id = ssoa.employee_id
        WHERE ${where.join(' AND ')}
        ORDER BY sso.occurrence_date, sso.id, ssoa.position_number
      `,
      params,
    );

    const occurrenceMap = new Map<number, SpecialShiftOccurrenceListItem>();

    rows.forEach((row) => {
      const occurrenceId = Number(row.occurrence_id);
      if (!occurrenceMap.has(occurrenceId)) {
        occurrenceMap.set(occurrenceId, {
          occurrence_id: occurrenceId,
          date: dayjs(row.occurrence_date).format('YYYY-MM-DD'),
          shift_id: Number(row.shift_id),
          shift_name: String(row.shift_name || ''),
          required_people: Number(row.required_people),
          filled_people: 0,
          shortage_people: Number(row.required_people || 0),
          fulfillment_mode: String(row.fulfillment_mode || 'HARD') === 'SOFT' ? 'SOFT' : 'HARD',
          priority_level: ['CRITICAL', 'NORMAL'].includes(String(row.priority_level || 'HIGH'))
            ? (String(row.priority_level || 'HIGH') as 'CRITICAL' | 'NORMAL')
            : 'HIGH',
          status: String(row.status),
          assignments: [],
          scheduling_run_id: normalizeNumber(row.scheduling_run_id),
        });
      }

      if (row.assignment_id) {
        const occurrence = occurrenceMap.get(occurrenceId)!;
        occurrence.assignments.push({
          id: Number(row.assignment_id),
          employee_id: Number(row.employee_id),
          employee_name: String(row.employee_name || ''),
          employee_code: String(row.employee_code || ''),
          position_number: Number(row.position_number),
          shift_plan_id: Number(row.shift_plan_id),
          assignment_status: String(row.assignment_status),
          is_locked: Boolean(row.is_locked),
        });
        occurrence.filled_people += 1;
        occurrence.shortage_people = Math.max(occurrence.required_people - occurrence.filled_people, 0);
      }
    });

    return Array.from(occurrenceMap.values());
  }
}

export default SpecialShiftOccurrenceService;
