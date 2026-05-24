import dayjs, { Dayjs } from 'dayjs';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type MonthlyRecurrenceMode = 'MONTH_DAYS' | 'NTH_WEEKDAY' | 'LAST_DAY';

export interface StandaloneRecurrenceRule {
  freq: RecurrenceFrequency;
  interval?: number;
  weekdays?: number[];
  monthly_mode?: MonthlyRecurrenceMode;
  month_days?: number[];
  nth_week?: number;
  nth_weekday?: number;
  window_days?: number;
}

const toPositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const toNonNegativeInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const toIntegerSet = (values: unknown, min: number, max: number): Set<number> => {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= min && value <= max),
  );
};

const normalizeDayjsWeekday = (date: Dayjs): number => {
  const weekday = date.day();
  return weekday === 0 ? 7 : weekday;
};

const isLastWeekdayInMonth = (date: Dayjs): boolean => (
  date.add(7, 'day').month() !== date.month()
);

const getWeekdayOccurrenceInMonth = (date: Dayjs): number => (
  Math.floor((date.date() - 1) / 7) + 1
);

export const getRecurringWindowDays = (rule: StandaloneRecurrenceRule): number => (
  toNonNegativeInteger(rule.window_days, 0)
);

export const validateStandaloneRecurrenceRule = (rule: unknown): string | null => {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return 'recurrence_rule 必须是对象';
  }

  const recurrenceRule = rule as StandaloneRecurrenceRule & { days?: unknown };
  if (Object.prototype.hasOwnProperty.call(recurrenceRule, 'days')) {
    return 'recurrence_rule.days 已废弃，请使用 weekdays 或 month_days';
  }

  const windowDays = Number(recurrenceRule.window_days ?? 0);
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 30) {
    return 'recurrence_rule.window_days 必须是 0 到 30 的整数';
  }

  if (recurrenceRule.freq === 'DAILY') {
    const interval = Number(recurrenceRule.interval ?? 1);
    if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
      return 'DAILY.interval 必须是 1 到 30 的整数';
    }
    return null;
  }

  if (recurrenceRule.freq === 'WEEKLY') {
    const interval = Number(recurrenceRule.interval ?? 1);
    if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
      return 'WEEKLY.interval 必须是 1 到 30 的整数';
    }
    const weekdays = toIntegerSet(recurrenceRule.weekdays, 1, 7);
    if (weekdays.size === 0) {
      return 'WEEKLY.weekdays 至少需要一个 1 到 7 的星期值';
    }
    return null;
  }

  if (recurrenceRule.freq === 'MONTHLY') {
    if (recurrenceRule.monthly_mode === 'MONTH_DAYS') {
      const monthDays = toIntegerSet(recurrenceRule.month_days, 1, 31);
      if (monthDays.size === 0) {
        return 'MONTHLY.month_days 至少需要一个 1 到 31 的日期值';
      }
      return null;
    }

    if (recurrenceRule.monthly_mode === 'NTH_WEEKDAY') {
      const nthWeek = Number(recurrenceRule.nth_week);
      const nthWeekday = Number(recurrenceRule.nth_weekday);
      if (!Number.isInteger(nthWeek) || ![1, 2, 3, 4, 5, -1].includes(nthWeek)) {
        return 'MONTHLY.nth_week 必须是 1、2、3、4、5 或 -1';
      }
      if (!Number.isInteger(nthWeekday) || nthWeekday < 1 || nthWeekday > 7) {
        return 'MONTHLY.nth_weekday 必须是 1 到 7 的星期值';
      }
      return null;
    }

    if (recurrenceRule.monthly_mode === 'LAST_DAY') {
      return null;
    }

    return 'MONTHLY.monthly_mode 必须是 MONTH_DAYS、NTH_WEEKDAY 或 LAST_DAY';
  }

  return 'recurrence_rule.freq 必须是 DAILY、WEEKLY 或 MONTHLY';
};

export const buildRecurringTaskDates = (
  rule: StandaloneRecurrenceRule,
  targetMonth: string,
): string[] => {
  const startOfMonth = dayjs(`${targetMonth}-01`);
  if (!startOfMonth.isValid()) {
    return [];
  }

  const freq = rule.freq;
  const daysInMonth = startOfMonth.daysInMonth();
  const generatedDates: string[] = [];

  if (freq === 'DAILY') {
    const interval = toPositiveInteger(rule.interval, 1);
    for (let day = 1; day <= daysInMonth; day += 1) {
      if ((day - 1) % interval === 0) {
        generatedDates.push(startOfMonth.date(day).format('YYYY-MM-DD'));
      }
    }
    return generatedDates;
  }

  if (freq === 'WEEKLY') {
    const interval = toPositiveInteger(rule.interval, 1);
    const weekdays = toIntegerSet(rule.weekdays, 1, 7);
    if (weekdays.size === 0) {
      return [];
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const currentDate = startOfMonth.date(day);
      const weekIndexInMonth = Math.floor((day - 1) / 7);
      if (weekIndexInMonth % interval === 0 && weekdays.has(normalizeDayjsWeekday(currentDate))) {
        generatedDates.push(currentDate.format('YYYY-MM-DD'));
      }
    }
    return generatedDates;
  }

  if (freq === 'MONTHLY') {
    const monthlyMode = rule.monthly_mode;

    if (monthlyMode === 'MONTH_DAYS') {
      const monthDays = toIntegerSet(rule.month_days, 1, 31);
      for (let day = 1; day <= daysInMonth; day += 1) {
        if (monthDays.has(day)) {
          generatedDates.push(startOfMonth.date(day).format('YYYY-MM-DD'));
        }
      }
      return generatedDates;
    }

    if (monthlyMode === 'LAST_DAY') {
      return [startOfMonth.date(daysInMonth).format('YYYY-MM-DD')];
    }

    if (monthlyMode === 'NTH_WEEKDAY') {
      const nthWeek = Number(rule.nth_week);
      const nthWeekday = Number(rule.nth_weekday);
      if ((!Number.isInteger(nthWeek) || ![1, 2, 3, 4, 5, -1].includes(nthWeek))
        || (!Number.isInteger(nthWeekday) || nthWeekday < 1 || nthWeekday > 7)) {
        return [];
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const currentDate = startOfMonth.date(day);
        if (normalizeDayjsWeekday(currentDate) !== nthWeekday) {
          continue;
        }

        const isMatch = nthWeek === -1
          ? isLastWeekdayInMonth(currentDate)
          : getWeekdayOccurrenceInMonth(currentDate) === nthWeek;

        if (isMatch) {
          generatedDates.push(currentDate.format('YYYY-MM-DD'));
        }
      }
    }
  }

  return generatedDates;
};
