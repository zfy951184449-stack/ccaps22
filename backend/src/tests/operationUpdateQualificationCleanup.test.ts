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

// 找到对 operation_qualification_requirements 做高位收口的那条 DELETE 调用。
const findOrphanCleanupCall = () =>
  mockConnection.execute.mock.calls.find(
    ([sql]) =>
      typeof sql === 'string' &&
      sql.includes('DELETE FROM operation_qualification_requirements') &&
      sql.includes('position_number >'),
  );

describe('updateOperation — operation_qualification_requirements 高位孤儿行清理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
    mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
  });

  it('减小所需人数时，在同一事务内删除 position_number 超出新人数的资质行', async () => {
    const response = await request(app)
      .put('/api/operations/42')
      .send({
        operation_name: '无菌灌装',
        standard_time: 6,
        required_people: 2,
        description: null,
        operation_type_id: null,
      });

    expect(response.status).toBe(200);

    // 事务边界：开启、提交、释放；未回滚。
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);

    // 收口 DELETE 命中：阈值取新人数(2)，删除 position_number > 2 的孤儿行。
    const cleanupCall = findOrphanCleanupCall();
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall?.[1]).toEqual(['42', 2]);

    // 收口必须发生在 operations UPDATE 之后（同一连接，UPDATE 先于 DELETE）。
    const updateIdx = mockConnection.execute.mock.calls.findIndex(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE operations SET'),
    );
    const cleanupIdx = mockConnection.execute.mock.calls.findIndex(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('DELETE FROM operation_qualification_requirements') &&
        sql.includes('position_number >'),
    );
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(cleanupIdx).toBeGreaterThan(updateIdx);
  });

  it('人数缺省回落为 1 时，按阈值 1 收口（幂等，命中 0 行也安全）', async () => {
    const response = await request(app)
      .put('/api/operations/7')
      .send({
        operation_name: '配液',
        standard_time: 3,
        // 不传 required_people → 回落为 1
      });

    expect(response.status).toBe(200);

    const cleanupCall = findOrphanCleanupCall();
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall?.[1]).toEqual(['7', 1]);
  });

  it('操作不存在时回滚事务、不执行收口 DELETE、返回 404', async () => {
    mockConnection.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE operations SET')) {
        return [{ affectedRows: 0 }, []];
      }
      return [{ affectedRows: 0 }, []];
    });

    const response = await request(app)
      .put('/api/operations/999')
      .send({
        operation_name: '不存在',
        standard_time: 1,
        required_people: 2,
      });

    expect(response.status).toBe(404);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
    expect(findOrphanCleanupCall()).toBeUndefined();
  });
});
