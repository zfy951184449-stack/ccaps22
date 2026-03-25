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

describe('Template Resource Rule Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_TEMPLATE_RESOURCE_RULES = 'false';
    process.env.ENABLE_BATCH_RESOURCE_SNAPSHOTS = 'false';
    process.env.ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ = 'false';
    mockPool.getConnection.mockResolvedValue(mockConnection);
  });

  it('returns 404 when template resource rules feature is disabled', async () => {
    const response = await request(app).get('/api/template-stage-operations/11/resources');

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('disabled');
  });

  it('returns effective global default rules when template feature is enabled without override rows', async () => {
    process.env.ENABLE_TEMPLATE_RESOURCE_RULES = 'true';

    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('FROM stage_operation_schedules') && query.includes('WHERE id = ?')) {
        return [[{ schedule_id: 11, operation_id: 301 }], []];
      }
      if (query.includes('FROM template_operation_resource_requirements')) {
        return [[], []];
      }
      if (query.includes('FROM operation_resource_requirements')) {
        return [[{
          id: 88,
          operation_id: 301,
          resource_type: 'EQUIPMENT',
          required_count: 1,
          is_mandatory: 1,
          requires_exclusive_use: 1,
          prep_minutes: 10,
          changeover_minutes: 20,
          cleanup_minutes: 30,
        }], []];
      }
      if (query.includes('FROM operation_resource_candidates')) {
        return [[{
          requirement_id: 88,
          id: 9,
          resource_code: 'EQ-001',
          resource_name: 'Bioreactor-1',
          resource_type: 'EQUIPMENT',
        }], []];
      }

      return [[], []];
    });

    const response = await request(app).get('/api/template-stage-operations/11/resources');

    expect(response.status).toBe(200);
    expect(response.body.source_scope).toBe('GLOBAL_DEFAULT');
    expect(response.body.requirements).toHaveLength(1);
    expect(response.body.requirements[0].resource_type).toBe('EQUIPMENT');
    expect(response.body.requirements[0].candidate_resource_ids).toEqual([9]);
  });

  it('rejects batch snapshot writes when snapshot feature is disabled', async () => {
    const response = await request(app)
      .put('/api/batch-operations/99/resources')
      .send({
        requirements: [],
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('disabled');
  });

  it('serves resource node reads for the V2 node-management workspace', async () => {
    mockPool.execute.mockResolvedValue([[], []]);

    const response = await request(app).get('/api/resource-nodes?tree=false');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(mockPool.execute).toHaveBeenCalled();
  });
});
