import { describe, test, expect, beforeEach, vi } from 'vitest';
import ScheduleQualityEvaluator from '../../services/mlModels/scheduleQualityEvaluator';
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';

// Mock数据库连接
vi.mock('../../config/database', () => ({
  default: {
    execute: vi.fn(),
  },
}));

describe('ScheduleQualityEvaluator', () => {
  let evaluator: ScheduleQualityEvaluator;

  beforeEach(() => {
    evaluator = new ScheduleQualityEvaluator();
    vi.clearAllMocks();
  });

  test('应该正确评估排班质量', async () => {
    // Mock季度标准工时
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);

    // Mock偏好数据
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ preferenceScore: 5 }],
      [],
    ]);

    // Mock资质数据
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ qualificationId: 1, minLevel: 2 }],
      [],
    ]);

    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ qualificationId: 1, qualificationLevel: 3 }],
      [],
    ]);

    const request = {
      schedules: [
        {
          employeeId: 1,
          date: '2024-01-01',
          shiftCode: 'DAY',
          planHours: 8,
          overtimeHours: 0,
          operationPlanId: 1,
          operationId: 1,
        },
        {
          employeeId: 2,
          date: '2024-01-01',
          shiftCode: 'DAY',
          planHours: 8,
          overtimeHours: 0,
          operationPlanId: 1,
          operationId: 1,
        },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(result).toBeDefined();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
    expect(result.constraintCompliance).toBeGreaterThanOrEqual(0);
    expect(result.constraintCompliance).toBeLessThanOrEqual(1);
    expect(result.costEfficiency).toBeGreaterThanOrEqual(0);
    expect(result.costEfficiency).toBeLessThanOrEqual(1);
    expect(result.employeeSatisfaction).toBeGreaterThanOrEqual(0);
    expect(result.employeeSatisfaction).toBeLessThanOrEqual(1);
    expect(result.workloadBalance).toBeGreaterThanOrEqual(0);
    expect(result.workloadBalance).toBeLessThanOrEqual(1);
    expect(result.skillMatch).toBeGreaterThanOrEqual(0);
    expect(result.skillMatch).toBeLessThanOrEqual(1);
    expect(result.details).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  test('应该检测连续工作天数违反', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      schedules: [
        // 连续8天工作
        { employeeId: 1, date: '2024-01-01', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-02', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-03', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-04', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-05', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-06', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-07', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
        { employeeId: 1, date: '2024-01-08', planHours: 8, overtimeHours: 0, operationPlanId: 1 },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(result.details.constraintViolations.length).toBeGreaterThan(0);
    expect(
      result.details.constraintViolations.some((v) =>
        v.type === 'CONSECUTIVE_DAYS_EXCEEDED'
      )
    ).toBe(true);
  });

  test('应该检测每日工时超限', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      schedules: [
        {
          employeeId: 1,
          date: '2024-01-01',
          planHours: 8,
          overtimeHours: 4, // 总工时12小时，超过11小时限制
          operationPlanId: 1,
        },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(
      result.details.constraintViolations.some(
        (v) => v.type === 'DAILY_HOURS_EXCEEDED'
      )
    ).toBe(true);
  });

  test('应该检测夜班后休息违反', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      schedules: [
        {
          employeeId: 1,
          date: '2024-01-01',
          shiftCode: 'NIGHT',
          planHours: 8,
          overtimeHours: 0,
          operationPlanId: 1,
        },
        {
          employeeId: 1,
          date: '2024-01-02',
          shiftCode: 'DAY',
          planHours: 8,
          overtimeHours: 0,
          operationPlanId: 1,
        },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(
      result.details.constraintViolations.some(
        (v) => v.type === 'NIGHT_SHIFT_REST_VIOLATION' || v.type === 'NIGHT_SHIFT_REST_INSUFFICIENT'
      )
    ).toBe(true);
  });

  test('应该计算成本效率', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      schedules: [
        {
          employeeId: 1,
          date: '2024-01-01',
          planHours: 8,
          overtimeHours: 0, // 无加班
          operationPlanId: 1,
        },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(result.details.costBreakdown).toBeDefined();
    expect(result.details.costBreakdown.totalCost).toBeGreaterThan(0);
    expect(result.details.costBreakdown.overtimeCost).toBe(0); // 无加班
    expect(result.costEfficiency).toBeGreaterThan(0);
  });

  test('应该生成改进建议', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([
      [{ standard_hours: 480 }],
      [],
    ]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      schedules: [
        {
          employeeId: 1,
          date: '2024-01-01',
          planHours: 8,
          overtimeHours: 2, // 有加班
          operationPlanId: 1,
        },
      ],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(
      result.recommendations.some((r) => r.includes('成本') || r.includes('加班'))
    ).toBe(true);
  });

  test('应该处理空排班', async () => {
    const request = {
      schedules: [],
      period: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      },
    };

    const result = await evaluator.evaluateQuality(request);

    expect(result).toBeDefined();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});

