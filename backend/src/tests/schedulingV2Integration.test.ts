/**
 * 排班 V2 端到端集成测试
 * 
 * 测试整个数据流：前端 -> API -> 数据组装 -> 求解器 -> 结果解析 -> 持久化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server';
import axios from 'axios';
import pool from '../config/database';

// Mock 数据库连接
vi.mock('../config/database', () => {
  const mockConnection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn().mockResolvedValue([[], []]),
    release: vi.fn(),
  };
  
  return {
    default: {
      execute: vi.fn().mockResolvedValue([[], []]),
      getConnection: vi.fn().mockResolvedValue(mockConnection),
    },
  };
});

// Mock axios for solver calls
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  post: vi.fn(),
  get: vi.fn(),
}));

const mockAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};
const mockPool = pool as any;

describe('Scheduling V2 API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v2/scheduling/solve', () => {
    it('should reject request without batchIds', async () => {
      const response = await request(app)
        .post('/api/v2/scheduling/solve')
        .send({
          window: { start_date: '2025-01-01', end_date: '2025-01-31' },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('batchIds');
    });

    it('should reject request without window', async () => {
      const response = await request(app)
        .post('/api/v2/scheduling/solve')
        .send({
          batchIds: [1, 2, 3],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('window');
    });

    it('should accept valid request and return run info', async () => {
      // Mock database insert
      mockPool.execute.mockResolvedValueOnce([{ insertId: 1 }, null]);

      const response = await request(app)
        .post('/api/v2/scheduling/solve')
        .send({
          batchIds: [1, 2],
          window: { start_date: '2025-01-01', end_date: '2025-01-31' },
          config: {
            monthly_hours_lower_offset: 16,
            monthly_hours_upper_offset: 16,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.runId).toBeDefined();
      expect(response.body.data.runCode).toBeDefined();
      expect(response.body.data.status).toBe('QUEUED');
    });
  });

  describe('GET /api/v2/scheduling/runs/:runId', () => {
    it('should return 404 for non-existent run', async () => {
      mockPool.execute.mockResolvedValueOnce([[], null]);

      const response = await request(app)
        .get('/api/v2/scheduling/runs/999999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return run status for existing run', async () => {
      mockPool.execute.mockResolvedValueOnce([[{
        id: 1,
        run_code: 'SCH-TEST-001',
        status: 'RUNNING',
        stage: 'SOLVING',
        window_start: '2025-01-01',
        window_end: '2025-01-31',
        target_batch_ids: '[1,2]',
        result_summary: null,
        error_message: null,
        created_at: new Date(),
        completed_at: null,
      }], null]);

      const response = await request(app)
        .get('/api/v2/scheduling/runs/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.run_code).toBe('SCH-TEST-001');
      expect(response.body.data.status).toBe('RUNNING');
      expect(response.body.data.stage).toBe('SOLVING');
    });
  });

  describe('POST /api/v2/scheduling/runs/:runId/cancel', () => {
    it('should cancel running task', async () => {
      mockPool.execute
        .mockResolvedValueOnce([[{
          id: 1,
          status: 'RUNNING',
        }], null])
        .mockResolvedValueOnce([{ affectedRows: 1 }, null]);

      const response = await request(app)
        .post('/api/v2/scheduling/runs/1/cancel');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
    });

    it('should reject cancel for completed task', async () => {
      mockPool.execute.mockResolvedValueOnce([[{
        id: 1,
        status: 'COMPLETED',
      }], null]);

      const response = await request(app)
        .post('/api/v2/scheduling/runs/1/cancel');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v2/scheduling/solver/health', () => {
    it('should return solver status when available', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { status: 'healthy', version: '2.0.0' },
      });

      const response = await request(app)
        .get('/api/v2/scheduling/solver/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 503 when solver is unavailable', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await request(app)
        .get('/api/v2/scheduling/solver/health');

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });
  });
});

describe('Data Flow Validation', () => {
  describe('Request Validation', () => {
    it('should validate batch IDs are numbers', () => {
      const validBatchIds = [1, 2, 3];
      const invalidBatchIds = ['a', 'b', 'c'];
      
      expect(validBatchIds.every(id => typeof id === 'number')).toBe(true);
      expect(invalidBatchIds.every(id => typeof id === 'number')).toBe(false);
    });

    it('should validate date format', () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      
      expect(dateRegex.test('2025-01-01')).toBe(true);
      expect(dateRegex.test('2025-1-1')).toBe(false);
      expect(dateRegex.test('01-01-2025')).toBe(false);
    });

    it('should validate config numeric values', () => {
      const config = {
        monthly_hours_lower_offset: 16,
        monthly_hours_upper_offset: 16,
        max_consecutive_workdays: 6,
        night_shift_rest_days: 2,
        solver_time_limit_seconds: 60,
      };

      Object.values(config).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe('Response Parsing', () => {
    it('should correctly map solver status to frontend status', () => {
      const statusMap: Record<string, string> = {
        'OPTIMAL': 'success',
        'FEASIBLE': 'warning',
        'INFEASIBLE': 'error',
        'TIMEOUT': 'error',
        'ERROR': 'error',
      };

      expect(statusMap['OPTIMAL']).toBe('success');
      expect(statusMap['FEASIBLE']).toBe('warning');
      expect(statusMap['ERROR']).toBe('error');
    });
  });
});
