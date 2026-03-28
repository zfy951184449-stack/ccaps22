import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
  },
}));

import app from '../server';
import pool from '../config/database';

const mockPool = pool as unknown as {
  execute: ReturnType<typeof vi.fn>;
};

describe('Qualification Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns overview totals and usage states', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('FROM qualifications q')) {
        return [[
          {
            id: 1,
            qualification_name: '无菌灌装',
            employee_binding_count: 3,
            operation_binding_count: 2,
          },
          {
            id: 2,
            qualification_name: '清场检查',
            employee_binding_count: 0,
            operation_binding_count: 0,
          },
        ], []];
      }

      return [[], []];
    });

    const response = await request(app).get('/api/qualifications/overview');

    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual({
      qualification_count: 2,
      in_use_count: 1,
      employee_binding_count: 3,
      operation_binding_count: 2,
    });
    expect(response.body.items[0].usage_state).toBe('MIXED');
    expect(response.body.items[1].deletable).toBe(true);
  });

  it('returns impact details for a qualification', async () => {
    mockPool.execute.mockImplementation(async (query: string, params?: unknown[]) => {
      if (query.includes('FROM qualifications WHERE id = ?')) {
        return [[{ id: params?.[0], qualification_name: '洁净服认证' }], []];
      }

      if (query.includes('FROM employee_qualifications eq')) {
        return [[
          {
            employee_id: 11,
            employee_code: 'E011',
            employee_name: '张三',
          },
        ], []];
      }

      if (query.includes('FROM operation_qualification_requirements oqr')) {
        return [[
          {
            operation_id: 18,
            operation_code: 'OP-018',
            operation_name: '无菌灌装',
          },
        ], []];
      }

      return [[], []];
    });

    const response = await request(app).get('/api/qualifications/7/impact');

    expect(response.status).toBe(200);
    expect(response.body.qualification.qualification_name).toBe('洁净服认证');
    expect(response.body.counts).toEqual({ employees: 1, operations: 1 });
    expect(response.body.deletable).toBe(false);
  });

  it('blocks deleting a qualification that is still in use', async () => {
    mockPool.execute.mockImplementation(async (query: string, params?: unknown[]) => {
      if (query.includes('FROM qualifications WHERE id = ?')) {
        return [[{ id: params?.[0], qualification_name: '洁净服认证' }], []];
      }

      if (query.includes('FROM employee_qualifications eq')) {
        return [[
          {
            employee_id: 11,
            employee_code: 'E011',
            employee_name: '张三',
          },
        ], []];
      }

      if (query.includes('FROM operation_qualification_requirements oqr')) {
        return [[], []];
      }

      return [[], []];
    });

    const response = await request(app).delete('/api/qualifications/7');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('QUALIFICATION_IN_USE');
    expect(response.body.impact.deletable).toBe(false);
    expect(mockPool.execute).not.toHaveBeenCalledWith(
      'DELETE FROM qualifications WHERE id = ?',
      [7],
    );
  });

  it('deletes an unused qualification', async () => {
    mockPool.execute.mockImplementation(async (query: string, params?: unknown[]) => {
      if (query.includes('FROM qualifications WHERE id = ?')) {
        return [[{ id: params?.[0], qualification_name: '清场检查' }], []];
      }

      if (query.includes('FROM employee_qualifications eq')) {
        return [[], []];
      }

      if (query.includes('FROM operation_qualification_requirements oqr')) {
        return [[], []];
      }

      if (query === 'DELETE FROM qualifications WHERE id = ?') {
        return [{ affectedRows: 1 }, []];
      }

      return [[], []];
    });

    const response = await request(app).delete('/api/qualifications/9');

    expect(response.status).toBe(204);
    expect(mockPool.execute).toHaveBeenCalledWith(
      'DELETE FROM qualifications WHERE id = ?',
      [9],
    );
  });

  it('returns active employees, qualifications, and assignments for the next matrix view', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('LEFT JOIN organization_units u1')) {
        return [[
          {
            id: 11,
            employee_code: 'E011',
            employee_name: '张三',
            unit_id: 301,
            unit_name: '无菌一班',
            department: '无菌车间',
            position: '操作员',
          },
          {
            id: 12,
            employee_code: 'E012',
            employee_name: '李四',
            unit_id: 302,
            unit_name: '无菌二班',
            department: '无菌车间',
            position: '班长',
          },
        ], []];
      }

      if (query.includes('FROM qualifications') && !query.includes('WHERE id = ?')) {
        return [[
          { id: 1, qualification_name: '洁净服认证' },
          { id: 2, qualification_name: '无菌灌装' },
        ], []];
      }

      if (
        query.includes('eq.qualification_level') &&
        query.includes("WHERE e.employment_status = 'ACTIVE'")
      ) {
        return [[
          {
            id: 101,
            employee_id: 11,
            qualification_id: 1,
            qualification_level: 4,
          },
          {
            id: 102,
            employee_id: 12,
            qualification_id: 2,
            qualification_level: 5,
          },
        ], []];
      }

      return [[], []];
    });

    const response = await request(app).get('/api/qualifications/matrix');

    expect(response.status).toBe(200);
    expect(response.body.employees).toHaveLength(2);
    expect(response.body.employees[0]).toMatchObject({
      unit_id: 301,
      unit_name: '无菌一班',
    });
    expect(response.body.qualifications).toHaveLength(2);
    expect(response.body.assignments).toEqual([
      {
        id: 101,
        employee_id: 11,
        qualification_id: 1,
        qualification_level: 4,
      },
      {
        id: 102,
        employee_id: 12,
        qualification_id: 2,
        qualification_level: 5,
      },
    ]);
  });

  it('returns demand-weighted qualification shortages for activated plans only', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (
        query.includes('eq.employee_id') &&
        query.includes('FROM employee_qualifications eq') &&
        query.includes("e.employment_status = 'ACTIVE'")
      ) {
        return [[
          {
            employee_id: 11,
            qualification_id: 1,
            qualification_level: 4,
          },
          {
            employee_id: 12,
            qualification_id: 1,
            qualification_level: 3,
          },
          {
            employee_id: 13,
            qualification_id: 2,
            qualification_level: 2,
          },
        ], []];
      }

      if (query.includes('JOIN batch_operation_plans bop ON bop.operation_id = oqr.operation_id')) {
        return [[
          {
            qualification_id: 1,
            qualification_name: '无菌灌装',
            operation_plan_id: 201,
            batch_plan_id: 301,
            planned_duration: 6,
            planned_start_datetime: '2026-03-03 08:15:00',
            planned_end_datetime: '2026-03-03 12:15:00',
            required_count: 2,
            required_level: 4,
          },
          {
            qualification_id: 1,
            qualification_name: '无菌灌装',
            operation_plan_id: 202,
            batch_plan_id: 302,
            planned_duration: 3,
            planned_start_datetime: '2026-03-03 09:05:00',
            planned_end_datetime: '2026-03-03 11:30:00',
            required_count: 1,
            required_level: 4,
          },
          {
            qualification_id: 2,
            qualification_name: '清场检查',
            operation_plan_id: 203,
            batch_plan_id: 301,
            planned_duration: 2,
            planned_start_datetime: '2026-03-05 10:00:00',
            planned_end_datetime: '2026-03-05 12:00:00',
            required_count: 1,
            required_level: 2,
          },
        ], []];
      }

      return [[], []];
    });

    const response = await request(app).get(
      '/api/qualifications/shortages?mode=current_month&year_month=2026-03',
    );

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      mode: 'current_month',
      year_month: '2026-03',
      shortage_count: 1,
      high_risk_coverable_count: 0,
      total_demand_hours: 17,
      average_risk_score: 51.5,
      max_risk_score: 88,
      max_peak_gap: 2,
    });

    expect(response.body.risk_items[0]).toMatchObject({
      qualification_id: 1,
      qualification_name: '无菌灌装',
      required_level: 4,
      qualified_employee_count: 1,
      demand_hours: 15,
      demand_person_instances: 3,
      active_batch_count: 2,
      active_operation_count: 2,
      peak_required_people: 3,
      peak_gap_people: 2,
      gap_rate: 0.67,
      demand_hours_per_qualified_employee: 15,
      coverage_fragility: 1,
      risk_score: 88,
    });
    expect(response.body.risk_items[0].score_breakdown).toMatchObject({
      gap_rate: 0.67,
      gap_rate_score: 23.45,
      gap_volume_factor: 1,
      gap_volume_score: 20,
      demand_scale_factor: 1,
      demand_scale_score: 20,
      load_pressure_factor: 1,
      load_pressure_score: 15,
      coverage_fragility: 1,
      coverage_fragility_score: 10,
    });
    expect(response.body.qualification_items[0]).toMatchObject({
      qualification_id: 1,
      qualification_name: '无菌灌装',
      worst_required_level: 4,
      worst_peak_gap_people: 2,
      worst_risk_score: 88,
    });
    expect(response.body.qualification_items[0].level_breakdown).toEqual([
      {
        qualification_id: 1,
        qualification_name: '无菌灌装',
        required_level: 4,
        qualified_employee_count: 1,
        demand_hours: 15,
        demand_person_instances: 3,
        active_batch_count: 2,
        active_operation_count: 2,
        peak_required_people: 3,
        peak_gap_people: 2,
        gap_rate: 0.67,
        demand_hours_per_qualified_employee: 15,
        coverage_fragility: 1,
        risk_score: 88,
        score_breakdown: {
          gap_rate: 0.67,
          gap_rate_score: 23.45,
          gap_volume_factor: 1,
          gap_volume_score: 20,
          demand_scale_factor: 1,
          demand_scale_score: 20,
          load_pressure_factor: 1,
          load_pressure_score: 15,
          coverage_fragility: 1,
          coverage_fragility_score: 10,
        },
      },
    ]);
    expect(response.body.risk_items[1]).toMatchObject({
      qualification_id: 2,
      qualification_name: '清场检查',
      peak_gap_people: 0,
      risk_score: 15,
    });
  });

  it('returns shortage monitoring charts and monthly trend data', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (
        query.includes('eq.employee_id') &&
        query.includes('FROM employee_qualifications eq') &&
        query.includes("e.employment_status = 'ACTIVE'")
      ) {
        return [[
          {
            employee_id: 11,
            qualification_id: 1,
            qualification_level: 4,
          },
          {
            employee_id: 12,
            qualification_id: 2,
            qualification_level: 2,
          },
        ], []];
      }

      if (query.includes('JOIN batch_operation_plans bop ON bop.operation_id = oqr.operation_id')) {
        return [[
          {
            qualification_id: 1,
            qualification_name: '无菌灌装',
            operation_plan_id: 201,
            batch_plan_id: 301,
            planned_duration: 6,
            planned_start_datetime: '2026-03-03 08:15:00',
            planned_end_datetime: '2026-03-03 12:15:00',
            required_count: 2,
            required_level: 4,
          },
          {
            qualification_id: 1,
            qualification_name: '无菌灌装',
            operation_plan_id: 204,
            batch_plan_id: 304,
            planned_duration: 4,
            planned_start_datetime: '2026-02-08 08:00:00',
            planned_end_datetime: '2026-02-08 12:00:00',
            required_count: 1,
            required_level: 4,
          },
          {
            qualification_id: 2,
            qualification_name: '清场检查',
            operation_plan_id: 203,
            batch_plan_id: 301,
            planned_duration: 2,
            planned_start_datetime: '2026-03-05 10:00:00',
            planned_end_datetime: '2026-03-05 12:00:00',
            required_count: 1,
            required_level: 2,
          },
        ], []];
      }

      return [[], []];
    });

    const response = await request(app).get(
      '/api/qualifications/shortages/monitoring?mode=current_month&year_month=2026-03&months=6',
    );

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      mode: 'current_month',
      year_month: '2026-03',
      shortage_count: 1,
      max_risk_score: 83,
    });
    expect(response.body.ranking[0]).toMatchObject({
      qualification_name: '无菌灌装',
      required_level: 4,
      risk_score: 83,
    });
    expect(response.body.heatmap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualification_name: '无菌灌装',
          qualification_rank: 1,
          required_level: 4,
          risk_score: 83,
        }),
      ]),
    );
    expect(response.body.trend).toHaveLength(6);
    expect(response.body.trend.at(-1)).toMatchObject({
      year_month: '2026-03',
      shortage_count: 1,
      max_risk_score: 83,
    });
  });

  it('rejects invalid shortage month parameters', async () => {
    const response = await request(app).get(
      '/api/qualifications/shortages?mode=current_month&year_month=2026-99',
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid year_month. Expected YYYY-MM.');
  });

  it('rejects invalid shortage monitoring month windows', async () => {
    const response = await request(app).get(
      '/api/qualifications/shortages/monitoring?months=13',
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid months. Expected integer between 1 and 12.');
  });
});
