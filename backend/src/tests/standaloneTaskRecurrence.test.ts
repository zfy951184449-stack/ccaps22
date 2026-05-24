import { describe, expect, it } from 'vitest';
import {
  buildRecurringTaskDates,
  getRecurringWindowDays,
  validateStandaloneRecurrenceRule,
} from '../services/standaloneTaskRecurrence';

describe('standalone task recurrence rules', () => {
  it('generates daily tasks with interval from the first day of the month', () => {
    expect(buildRecurringTaskDates({ freq: 'DAILY', interval: 3 }, '2026-05')).toEqual([
      '2026-05-01',
      '2026-05-04',
      '2026-05-07',
      '2026-05-10',
      '2026-05-13',
      '2026-05-16',
      '2026-05-19',
      '2026-05-22',
      '2026-05-25',
      '2026-05-28',
      '2026-05-31',
    ]);
  });

  it('generates weekly tasks from explicit weekday values', () => {
    expect(buildRecurringTaskDates({ freq: 'WEEKLY', interval: 1, weekdays: [1] }, '2026-05')).toEqual([
      '2026-05-04',
      '2026-05-11',
      '2026-05-18',
      '2026-05-25',
    ]);
  });

  it('generates every other week inside the target month when weekly interval is greater than one', () => {
    expect(buildRecurringTaskDates({ freq: 'WEEKLY', interval: 2, weekdays: [5] }, '2026-05')).toEqual([
      '2026-05-01',
      '2026-05-15',
      '2026-05-29',
    ]);
  });

  it('generates monthly tasks from explicit month-day values and skips missing dates', () => {
    expect(buildRecurringTaskDates({ freq: 'MONTHLY', monthly_mode: 'MONTH_DAYS', month_days: [1, 15, 31] }, '2026-02')).toEqual([
      '2026-02-01',
      '2026-02-15',
    ]);
  });

  it('generates monthly tasks by nth weekday', () => {
    expect(buildRecurringTaskDates({
      freq: 'MONTHLY',
      monthly_mode: 'NTH_WEEKDAY',
      nth_week: 2,
      nth_weekday: 3,
    }, '2026-05')).toEqual(['2026-05-13']);
  });

  it('generates monthly tasks by last weekday', () => {
    expect(buildRecurringTaskDates({
      freq: 'MONTHLY',
      monthly_mode: 'NTH_WEEKDAY',
      nth_week: -1,
      nth_weekday: 5,
    }, '2026-05')).toEqual(['2026-05-29']);
  });

  it('generates monthly tasks on the calendar month end', () => {
    expect(buildRecurringTaskDates({ freq: 'MONTHLY', monthly_mode: 'LAST_DAY' }, '2026-02')).toEqual([
      '2026-02-28',
    ]);
  });

  it('does not accept the retired ambiguous days field', () => {
    expect(buildRecurringTaskDates({ freq: 'WEEKLY', interval: 1, days: [1] } as any, '2026-05')).toEqual([]);
    expect(buildRecurringTaskDates({ freq: 'MONTHLY', monthly_mode: 'MONTH_DAYS', days: [1] } as any, '2026-05')).toEqual([]);
  });

  it('normalizes generated flexible-window days', () => {
    expect(getRecurringWindowDays({ freq: 'DAILY', window_days: 3 })).toBe(3);
    expect(getRecurringWindowDays({ freq: 'DAILY', window_days: -1 })).toBe(0);
  });

  it('validates explicit recurrence rule shapes and rejects retired days', () => {
    expect(validateStandaloneRecurrenceRule({ freq: 'WEEKLY', interval: 1, weekdays: [1, 3] })).toBeNull();
    expect(validateStandaloneRecurrenceRule({ freq: 'MONTHLY', monthly_mode: 'LAST_DAY' })).toBeNull();
    expect(validateStandaloneRecurrenceRule({ freq: 'WEEKLY', days: [1] })).toContain('days 已废弃');
    expect(validateStandaloneRecurrenceRule({ freq: 'MONTHLY', monthly_mode: 'MONTH_DAYS', month_days: [] })).toContain('month_days');
  });
});
