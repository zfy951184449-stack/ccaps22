import { beforeEach, describe, expect, it, vi } from 'vitest';

// 复用 batchGanttOperationsBatch.test.ts 的 DB mock 套路：劫持 ../config/database，
// 用一个 fake connection 驱动 controller，验证「跨批次共享组」端点不带同批次限制。
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

import { mergeBatchOperationsToShareGroup } from '../controllers/shareGroupController';
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

// 取所有插入成员的调用（按出现顺序），返回每条插入的 batch_operation_plan_id。
const getInsertedMemberOpIds = () =>
  mockConnection.execute.mock.calls
    .filter(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO batch_share_group_members'))
    .map(([, params]) => params[1]);

describe('mergeBatchOperationsToShareGroup - 跨批次共享组', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
  });

  it('目标操作(批次1) 可并入来自不同批次(批次2/批次3)的成员，无同批次限制', async () => {
    const res = createResponse();

    // 目标操作 id=10（批次 1）尚未归属任何组 → 走「新建组」分支。
    mockConnection.execute.mockImplementation((sql: string) => {
      if (sql.includes('FROM batch_share_groups bsg') && sql.includes('JOIN batch_share_group_members')) {
        // 1. 查目标操作所属组 → 空
        return Promise.resolve([[], []]);
      }
      if (sql.includes('SELECT batch_plan_id FROM batch_operation_plans')) {
        // 2. 取目标操作 batch_plan_id → 批次 1
        return Promise.resolve([[{ batch_plan_id: 1 }], []]);
      }
      if (sql.includes('INSERT INTO batch_share_groups')) {
        // 3. 新建组 → groupId = 77
        return Promise.resolve([{ insertId: 77 }, []]);
      }
      // DELETE / INSERT members 等
      return Promise.resolve([{ affectedRows: 1 }, []]);
    });

    await mergeBatchOperationsToShareGroup(
      {
        body: {
          target_operation_id: 10,      // 批次 1
          member_operation_ids: [20, 30], // 20 属批次 2，30 属批次 3（跨批次）
        },
      } as any,
      res,
    );

    // 事务正常提交，没有回滚。
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);

    // 目标操作 10 + 跨批次成员 20、30 都被插入同一组——证明端点不按批次过滤成员。
    const insertedOpIds = getInsertedMemberOpIds();
    expect(insertedOpIds).toEqual(expect.arrayContaining([10, 20, 30]));

    // 任何 INSERT/查询都不应包含「同批次」过滤条件（如对成员校验 batch_plan_id 相等）。
    const sqlText = mockConnection.execute.mock.calls
      .map(([sql]: any[]) => String(sql))
      .join('\n');
    expect(sqlText).not.toMatch(/batch_plan_id\s*=\s*\?[^]*batch_operation_plan_id/i);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 77 }),
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('缺少 member_operation_ids 数组 → 400', async () => {
    const res = createResponse();
    await mergeBatchOperationsToShareGroup(
      { body: { target_operation_id: 10 } } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
