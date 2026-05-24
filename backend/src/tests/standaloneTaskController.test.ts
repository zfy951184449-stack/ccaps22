import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnection } = vi.hoisted(() => ({
  mockConnection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn(),
    release: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: {
    getConnection: vi.fn().mockResolvedValue(mockConnection),
  },
}));

import { createTask, generateRecurringTasks } from '../controllers/standaloneTaskController';
import pool from '../config/database';

const mockPool = pool as unknown as {
  getConnection: ReturnType<typeof vi.fn>;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('standalone task controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
  });

  it('generates recurring instances only for the requested template id', async () => {
    mockConnection.execute.mockImplementation(async (query: string, params?: unknown[]) => {
      if (query.includes('SELECT * FROM standalone_tasks')) {
        return [[{
          id: 7,
          task_name: '长白',
          required_people: 1,
          duration_minutes: 660,
          team_id: 2,
          preferred_shift_ids: JSON.stringify([6]),
          related_batch_id: null,
          operation_id: null,
          recurrence_rule: JSON.stringify({ freq: 'MONTHLY', monthly_mode: 'MONTH_DAYS', month_days: [1, 15] }),
        }], []];
      }

      if (query.includes('SELECT task_code FROM standalone_tasks')) {
        return [[{ task_code: 'ST-00041' }], []];
      }

      if (query.includes('SELECT COUNT(*) as cnt')) {
        return [[{ cnt: 0 }], []];
      }

      if (query.includes('INSERT INTO standalone_tasks')) {
        return [{ insertId: 101 }, []];
      }

      if (query.includes('FROM standalone_task_qualifications')) {
        return [[], []];
      }

      return [[], []];
    });

    const res = createResponse();
    await generateRecurringTasks({
      body: { target_month: '2026-07', template_id: 7 },
    } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'Recurring tasks generated successfully',
      generated_count: 2,
    });

    const recurringSelectCall = mockConnection.execute.mock.calls.find((call) =>
      String(call[0]).includes('SELECT * FROM standalone_tasks'),
    );
    expect(String(recurringSelectCall?.[0])).toContain('AND id = ?');
    expect(recurringSelectCall?.[1]).toEqual([7]);

    const insertedTaskNames = mockConnection.execute.mock.calls
      .filter((call) => String(call[0]).includes('INSERT INTO standalone_tasks'))
      .map((call) => (call[1] as unknown[])[1]);
    expect(insertedTaskNames).toEqual(['长白 (2026-07-01)', '长白 (2026-07-15)']);
  });

  it('returns 404 when a requested recurring template does not exist', async () => {
    mockConnection.execute.mockImplementation(async (query: string) => {
      if (query.includes('SELECT * FROM standalone_tasks')) {
        return [[], []];
      }
      return [[], []];
    });

    const res = createResponse();
    await generateRecurringTasks({
      body: { target_month: '2026-07', template_id: 404 },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'RECURRING template not found' });
    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
  });

  it('creates AD_HOC tasks with exact datetime windows and derived duration', async () => {
    mockConnection.execute.mockImplementation(async (query: string) => {
      if (query.includes('SELECT task_code FROM standalone_tasks')) {
        return [[{ task_code: 'ST-00041' }], []];
      }

      if (query.includes('INSERT INTO standalone_tasks')) {
        return [{ insertId: 102 }, []];
      }

      return [[], []];
    });

    const res = createResponse();
    await createTask({
      body: {
        task_name: '临时接种支援',
        task_type: 'AD_HOC',
        required_people: 3,
        earliest_start: '2026-07-03 08:30:00',
        deadline: '2026-07-03 11:00:00',
        preferred_shift_ids: [6],
      },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const insertCall = mockConnection.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO standalone_tasks'),
    );
    expect(insertCall?.[1]).toEqual([
      'ST-00042',
      '临时接种支援',
      'AD_HOC',
      3,
      150,
      null,
      '2026-07-03 08:30:00',
      '2026-07-03 11:00:00',
      JSON.stringify([6]),
      null,
      null,
      7,
      null,
      null,
    ]);
    expect(mockConnection.commit).toHaveBeenCalled();
  });
});
