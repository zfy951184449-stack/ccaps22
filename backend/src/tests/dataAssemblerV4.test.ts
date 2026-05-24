import { describe, expect, it } from 'vitest';
import {
  buildStandaloneDemandTiming,
  toFactoryIsoDateTime,
} from '../services/schedulingV4/DataAssemblerV4';

describe('DataAssemblerV4 factory datetime serialization', () => {
  it('treats MySQL DATETIME strings as China factory local time', () => {
    expect(toFactoryIsoDateTime('2026-07-01 14:30:00')).toBe('2026-07-01T06:30:00.000Z');
    expect(toFactoryIsoDateTime('2026-07-01T16:30:00')).toBe('2026-07-01T08:30:00.000Z');
  });

  it('uses local calendar fields from mysql2 Date objects instead of host timezone offset', () => {
    const mysqlDate = new Date(2026, 6, 1, 14, 30, 0);

    expect(toFactoryIsoDateTime(mysqlDate)).toBe('2026-07-01T06:30:00.000Z');
  });

  it('preserves explicit offsets when the caller already provides an absolute instant', () => {
    expect(toFactoryIsoDateTime('2026-07-01T14:30:00+08:00')).toBe('2026-07-01T06:30:00.000Z');
  });

  it('maps AD_HOC standalone tasks to fixed planned windows', () => {
    expect(buildStandaloneDemandTiming({
      task_type: 'AD_HOC',
      earliest_start: '2026-07-03 08:30:00',
      deadline: '2026-07-03 11:00:00',
    }, '2026-07-01', '2026-07-31')).toEqual({
      schedulingMode: 'FIXED',
      plannedStart: '2026-07-03T00:30:00.000Z',
      plannedEnd: '2026-07-03T03:00:00.000Z',
      earliestStart: undefined,
      deadline: undefined,
    });
  });

  it('keeps FLEXIBLE standalone tasks as date-window placements', () => {
    expect(buildStandaloneDemandTiming({
      task_type: 'FLEXIBLE',
      earliest_start: '2026-07-03',
      deadline: '2026-07-05',
    }, '2026-07-01', '2026-07-31')).toEqual({
      schedulingMode: 'FLEXIBLE',
      plannedStart: '2026-07-02T16:00:00.000Z',
      plannedEnd: '2026-07-04T16:00:00.000Z',
      earliestStart: '2026-07-03',
      deadline: '2026-07-05',
    });
  });
});
