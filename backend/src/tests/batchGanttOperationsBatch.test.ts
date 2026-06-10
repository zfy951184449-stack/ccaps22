import { beforeEach, describe, expect, it, vi } from 'vitest';

// 复用 stageOperationFromCanvas.test.ts 的 DB mock 套路：劫持 ../config/database，
// 用一个 fake connection 驱动 controller，断言事务提交/回滚行为。
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
    execute: vi.fn().mockResolvedValue([[], []]),
  },
}));

import { updateGanttOperationsBatch } from '../controllers/batchGanttV5Controller';
import pool from '../config/database';

const mockPool = pool as unknown as {
  getConnection: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

// 取所有 UPDATE batch_operation_plans 的调用（按出现顺序）。
const getUpdateCalls = () =>
  mockConnection.execute.mock.calls.filter(
    ([sql]) => typeof sql === 'string' && sql.includes('UPDATE batch_operation_plans'),
  );

describe('updateGanttOperationsBatch - 原子批量落库', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
    if (mockPool.execute) mockPool.execute.mockResolvedValue([[], []]);
    // 默认每条 UPDATE 影响 1 行（命中存在的 operation）。
    mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
  });

  it('全部成功 → 单事务提交，每条各一次 UPDATE', async () => {
    const res = createResponse();
    await updateGanttOperationsBatch(
      {
        body: {
          operations: [
            { operationId: 101, startDate: '2026-06-10 08:00:00', endDate: '2026-06-10 14:00:00' },
            { operationId: 102, startDate: '2026-06-11 08:00:00', endDate: '2026-06-11 14:00:00' },
          ],
        },
      } as any,
      res,
    );

    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);

    const updates = getUpdateCalls();
    expect(updates).toHaveLength(2);
    // 列顺序：start, end, winStart, winEnd, ..., id（最后一位是 operationId）。
    expect(updates[0][1][updates[0][1].length - 1]).toBe(101);
    expect(updates[1][1][updates[1][1].length - 1]).toBe(102);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('中途一条不存在(affectedRows=0) → 全部回滚 + 400 带失败 operationId', async () => {
    const res = createResponse();
    // 第 1 条命中，第 2 条 0 行（已被删除/不存在）。
    mockConnection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await updateGanttOperationsBatch(
      {
        body: {
          operations: [
            { operationId: 201, startDate: '2026-06-10 08:00:00', endDate: '2026-06-10 14:00:00' },
            { operationId: 202, startDate: '2026-06-11 08:00:00', endDate: '2026-06-11 14:00:00' },
          ],
        },
      } as any,
      res,
    );

    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 202 }),
    );
  });

  it('窗口越界(start 早于 window_start) → 不开事务，400 带失败 operationId', async () => {
    const res = createResponse();
    await updateGanttOperationsBatch(
      {
        body: {
          operations: [
            { operationId: 301, startDate: '2026-06-10 08:00:00', endDate: '2026-06-10 14:00:00' },
            {
              operationId: 302,
              startDate: '2026-06-11 06:00:00',
              endDate: '2026-06-11 14:00:00',
              windowStartDate: '2026-06-11 08:00:00',
            },
          ],
        },
      } as any,
      res,
    );

    // 预校验在开事务前完成，DB 完全没被触碰。
    expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    expect(mockConnection.execute).not.toHaveBeenCalled();
    expect(mockConnection.rollback).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 302 }),
    );
  });

  it('空 operations → 400，不取连接', async () => {
    const res = createResponse();
    await updateGanttOperationsBatch({ body: { operations: [] } } as any, res);

    expect(mockPool.getConnection).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
