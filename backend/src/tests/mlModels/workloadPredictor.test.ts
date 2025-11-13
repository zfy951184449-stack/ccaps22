import { describe, test, expect, beforeEach, vi } from 'vitest';
import WorkloadPredictor from '../../services/mlModels/workloadPredictor';
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';

// Mock数据库连接
vi.mock('../../config/database', () => ({
  default: {
    execute: vi.fn(),
  },
}));

describe('WorkloadPredictor', () => {
  let predictor: WorkloadPredictor;

  beforeEach(() => {
    predictor = new WorkloadPredictor();
    vi.clearAllMocks();
  });

  test('应该正确预测工作负载', async () => {
    // Mock历史数据
    const mockHistoricalData: RowDataPacket[] = [
      {
        date: '2024-01-01',
        active_employees: 10,
        total_schedules: 20,
        total_hours: 160,
        total_overtime_hours: 0,
        avg_hours: 8,
        day_of_week: 1,
        month: 1,
        quarter: 1,
        is_holiday: 0,
      },
      {
        date: '2024-01-02',
        active_employees: 12,
        total_schedules: 24,
        total_hours: 192,
        total_overtime_hours: 0,
        avg_hours: 8,
        day_of_week: 2,
        month: 1,
        quarter: 1,
        is_holiday: 0,
      },
      // ... 更多历史数据
    ];

    // Mock节假日数据
    const mockHolidayData: RowDataPacket[] = [];

    // 设置mock返回值
    vi.mocked(pool.execute).mockResolvedValueOnce([mockHistoricalData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([mockHolidayData, []]);

    const request = {
      startDate: '2024-01-03',
      endDate: '2024-01-05',
    };

    const predictions = await predictor.predictWorkload(request);

    expect(predictions).toBeDefined();
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0]).toHaveProperty('date');
    expect(predictions[0]).toHaveProperty('predictedWorkload');
    expect(predictions[0]).toHaveProperty('confidenceInterval');
    expect(predictions[0]).toHaveProperty('features');
  });

  test('应该验证日期格式', async () => {
    const request = {
      startDate: 'invalid-date',
      endDate: '2024-01-05',
    };

    await expect(predictor.predictWorkload(request)).rejects.toThrow('Invalid date format');
  });

  test('应该验证开始日期不能晚于结束日期', async () => {
    const request = {
      startDate: '2024-01-05',
      endDate: '2024-01-03',
    };

    await expect(predictor.predictWorkload(request)).rejects.toThrow('Start date must be before end date');
  });

  test('应该处理空历史数据', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      startDate: '2024-01-03',
      endDate: '2024-01-05',
    };

    const predictions = await predictor.predictWorkload(request);

    expect(predictions).toBeDefined();
    expect(predictions.length).toBe(3);
    // 没有历史数据时，预测值应该为0或很小的值
    expect(predictions[0].predictedWorkload).toBeGreaterThanOrEqual(0);
  });

  test('应该考虑节假日因素', async () => {
    const mockHistoricalData: RowDataPacket[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      active_employees: 10,
      total_schedules: 20,
      total_hours: 160,
      total_overtime_hours: 0,
      avg_hours: 8,
      day_of_week: ((i + 1) % 7) + 1,
      month: 1,
      quarter: 1,
      is_holiday: i === 0 ? 1 : 0, // 第一天是节假日
    }));

    const mockHolidayData: RowDataPacket[] = [
      { holiday_date: '2024-01-03' }, // 预测的第一天是节假日
    ];

    vi.mocked(pool.execute).mockResolvedValueOnce([mockHistoricalData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([mockHolidayData, []]);

    const request = {
      startDate: '2024-01-03',
      endDate: '2024-01-03',
    };

    const predictions = await predictor.predictWorkload(request);

    expect(predictions[0].features.isHoliday).toBe(true);
  });

  test('应该计算置信区间', async () => {
    const mockHistoricalData: RowDataPacket[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      active_employees: 10,
      total_schedules: 20,
      total_hours: 160 + (i % 5) * 10, // 添加一些变化
      total_overtime_hours: 0,
      avg_hours: 8,
      day_of_week: ((i + 1) % 7) + 1,
      month: 1,
      quarter: 1,
      is_holiday: 0,
    }));

    vi.mocked(pool.execute).mockResolvedValueOnce([mockHistoricalData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      startDate: '2024-01-31',
      endDate: '2024-01-31',
    };

    const predictions = await predictor.predictWorkload(request);

    expect(predictions[0].confidenceInterval.lower).toBeLessThanOrEqual(predictions[0].predictedWorkload);
    expect(predictions[0].confidenceInterval.upper).toBeGreaterThanOrEqual(predictions[0].predictedWorkload);
  });
});

