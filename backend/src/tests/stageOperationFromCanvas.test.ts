import { beforeEach, describe, expect, it, vi } from 'vitest';

// 复用 standaloneTaskController.test.ts 的 DB mock 套路：劫持 ../config/database，
// 用一个 fake connection 喂查询结果，直接驱动 controller。
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
    // updateTemplateTotalDays 用的是 pool.execute（非 connection），给个兜底。
    execute: vi.fn().mockResolvedValue([[], []]),
  },
}));

import { createStageOperationFromCanvas } from '../controllers/stageOperationController';
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

// stage.start_day = 0, operation.standard_time = 6（时长 6h）。
const STAGE_START_DAY = 0;
const STANDARD_TIME = 6;

const wireConnection = () => {
  mockConnection.execute.mockImplementation(async (query: string) => {
    if (query.includes('FROM process_stages WHERE id')) {
      return [[{ id: 10, template_id: 1, start_day: STAGE_START_DAY }], []];
    }
    if (query.includes('FROM operations WHERE id')) {
      return [[{ id: 20, standard_time: STANDARD_TIME }], []];
    }
    if (query.includes('MAX(operation_order)')) {
      return [[{ max_order: 0 }], []];
    }
    if (query.includes('INSERT INTO stage_operation_schedules')) {
      return [{ insertId: 999 }, []];
    }
    // updateTemplateTotalDays 的聚合 + UPDATE，以及其它一律兜底。
    return [[], []];
  });
};

// 取最近一次 INSERT stage_operation_schedules 的参数数组。
const getInsertParams = (): any[] => {
  const call = mockConnection.execute.mock.calls.find(
    ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO stage_operation_schedules'),
  );
  if (!call) throw new Error('INSERT into stage_operation_schedules was not executed');
  return call[1] as any[];
};

// INSERT 列顺序：
// (stage_id, operation_id, operation_day, recommended_time, recommended_day_offset,
//  window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order)
const INSERT_IDX = {
  operationDay: 2,
  recommendedTime: 3,
  recommendedDayOffset: 4,
  windowStartTime: 5,
  windowStartDayOffset: 6,
  windowEndTime: 7,
  windowEndDayOffset: 8,
};

describe('createStageOperationFromCanvas - 时间窗处理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
    if (mockPool.execute) mockPool.execute.mockResolvedValue([[], []]);
    wireConnection();
  });

  it('显式 window_* 不被画布落点覆盖（手动时间窗模式）', async () => {
    const res = createResponse();
    // 落点：absolute_start_hour = 10*24 ... 这里用 stage day0、推荐 9 点的落点；
    // 但手动窗给一个与「推荐±2」明显不同的区间（6 点 ~ 22 点），用来证明没被重算。
    await createStageOperationFromCanvas(
      {
        params: { id: '1' },
        body: {
          stage_id: 10,
          operation_id: 20,
          resource_node_id: null,
          operation_day: 0,
          recommended_time: 9,
          recommended_day_offset: 0,
          window_start_time: 6,
          window_start_day_offset: 0,
          window_end_time: 22,
          window_end_day_offset: 0,
          absolute_start_hour: 9, // stageStartDay(0) + 0 + 0 天，9 点
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const params = getInsertParams();
    // 关键断言：窗原样落库，而非 9-2=7 / 9+max(6,2)=15。
    expect(params[INSERT_IDX.windowStartTime]).toBe(6);
    expect(params[INSERT_IDX.windowEndTime]).toBe(22);
    expect(params[INSERT_IDX.windowStartDayOffset]).toBe(0);
    expect(params[INSERT_IDX.windowEndDayOffset]).toBe(0);
    // 定位仍由 absolute_start_hour 反推：day0 9 点。
    expect(params[INSERT_IDX.recommendedTime]).toBe(9);
    expect(params[INSERT_IDX.operationDay]).toBe(0);
  });

  it('跨日的显式 window_* 与 offset 同样原样保留', async () => {
    const res = createResponse();
    await createStageOperationFromCanvas(
      {
        params: { id: '1' },
        body: {
          stage_id: 10,
          operation_id: 20,
          resource_node_id: null,
          window_start_time: 20,
          window_start_day_offset: 0,
          window_end_time: 4,
          window_end_day_offset: 1, // 次日 4 点结束
          absolute_start_hour: 22, // day0 22 点
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const params = getInsertParams();
    expect(params[INSERT_IDX.windowStartTime]).toBe(20);
    expect(params[INSERT_IDX.windowStartDayOffset]).toBe(0);
    expect(params[INSERT_IDX.windowEndTime]).toBe(4);
    expect(params[INSERT_IDX.windowEndDayOffset]).toBe(1);
  });

  it('未传 window_* 时仍按落点 ±2h / +max(时长,2) 兜底推算（自动模式不变）', async () => {
    const res = createResponse();
    // 不带任何 window_* 字段，只给 absolute_start_hour=9（day0 9 点）。
    await createStageOperationFromCanvas(
      {
        params: { id: '1' },
        body: {
          stage_id: 10,
          operation_id: 20,
          resource_node_id: null,
          absolute_start_hour: 9,
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const params = getInsertParams();
    // 9 - 2 = 7；9 + max(6,2) = 15。
    expect(params[INSERT_IDX.windowStartTime]).toBe(7);
    expect(params[INSERT_IDX.windowEndTime]).toBe(15);
    expect(params[INSERT_IDX.windowStartDayOffset]).toBe(0);
    expect(params[INSERT_IDX.windowEndDayOffset]).toBe(0);
  });
});
