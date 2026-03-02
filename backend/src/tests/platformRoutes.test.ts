import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

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
    execute: vi.fn(),
    getConnection: vi.fn().mockResolvedValue(mockConnection),
  },
}));

import app from '../server';
import pool from '../config/database';

const mockPool = pool as unknown as {
  execute: ReturnType<typeof vi.fn>;
  getConnection: ReturnType<typeof vi.fn>;
};

describe('Platform API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
  });

  it('returns aggregated overview payload with readiness and top risks', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('COUNT(DISTINCT project_key) AS project_count')) {
        return [[{ domain_code: 'USP', project_count: 2 }], []];
      }
      if (query.includes('SELECT department_code AS domain_code, COUNT(*) AS resource_count') && query.includes('FROM resources')) {
        return [[{ domain_code: 'USP', resource_count: 3 }], []];
      }
      if (query.includes('COUNT(*) AS total_operations')) {
        return [[{ domain_code: 'USP', total_operations: 10, operations_with_requirement: 8, requirements_with_candidates: 6 }], []];
      }
      if (query.includes('pbp.plan_status = \'ACTIVATED\'') && query.includes('orr.id IS NULL') && query.includes('COUNT(*) AS conflict_count')) {
        return [[{ domain_code: 'USP', conflict_count: 2 }], []];
      }
      if (query.includes('resource_calendars rc1') && query.includes('GROUP BY r.department_code')) {
        return [[{ domain_code: 'USP', conflict_count: 1 }], []];
      }
      if (query.includes('maintenance_windows mw') && query.includes('GROUP BY r.department_code')) {
        return [[{ domain_code: 'USP', maintenance_block_count: 1 }], []];
      }
      if (query.includes('SELECT') && query.includes('project_count') && query.includes('active_batch_count') && query.includes('resource_count')) {
        return [[{ project_count: 4, active_batch_count: 7, resource_count: 3, maintenance_block_count: 1, missing_master_data_count: 2 }], []];
      }
      if (query.includes('resource_conflict_count')) {
        return [[{ resource_conflict_count: 1 }], []];
      }
      if (query.includes('personnel_conflict_count')) {
        return [[{ personnel_conflict_count: 2 }], []];
      }
      if (query.includes('SELECT department_code, COUNT(*) AS resource_count')) {
        return [[{ department_code: 'USP', resource_count: 3 }], []];
      }
      if (query.includes('FROM scheduling_runs')) {
        return [[{ id: 10, run_code: 'RUN-001', status: 'COMPLETED', stage: 'COMPLETED', created_at: '2026-03-01 10:00:00', completed_at: '2026-03-01 10:10:00' }], []];
      }
      if (query.includes('maintenance_window_count')) {
        return [[{ id: 1, resource_code: 'EQ-001', resource_name: 'Bioreactor-1', department_code: 'USP', maintenance_window_count: 2, active_calendar_count: 3, assignment_count: 4 }], []];
      }
      if (query.includes('missing_resource_requirement_count')) {
        return [[{ project_code: 'P-001', project_name: 'Project 1', batch_count: 2, missing_resource_requirement_count: 2 }], []];
      }
      return [[], []];
    });

    const response = await request(app).get('/api/platform/overview');

    expect(response.status).toBe(200);
    expect(response.body.project_count).toBe(4);
    expect(response.body.readiness).toHaveLength(4);
    expect(response.body.readiness[0].domain_code).toBe('USP');
    expect(response.body.top_resources[0].resource_code).toBe('EQ-001');
    expect(response.body.top_projects[0].project_code).toBe('P-001');
  });

  it('rejects resource binding update when candidate resource type mismatches', async () => {
    mockPool.execute.mockResolvedValueOnce([[{ operation_id: 88 }], []]);
    mockConnection.execute.mockImplementation(async (query: string) => {
      if (query.includes('SELECT id, resource_type') && query.includes('FROM resources')) {
        return [[{ id: 101, resource_type: 'ROOM' }], []];
      }
      return [[], []];
    });

    const response = await request(app)
      .patch('/api/platform/operations/99/resource-binding')
      .send({
        resource_type: 'EQUIPMENT',
        candidate_resource_ids: [101],
        required_count: 1,
        is_mandatory: true,
        requires_exclusive_use: true,
        prep_minutes: 0,
        changeover_minutes: 0,
        cleanup_minutes: 0,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('resource_type');
    expect(mockConnection.rollback).toHaveBeenCalled();
  });
});
