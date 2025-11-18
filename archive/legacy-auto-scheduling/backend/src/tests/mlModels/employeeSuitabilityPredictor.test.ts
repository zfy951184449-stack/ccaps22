import { describe, test, expect, beforeEach, vi } from 'vitest';
import EmployeeSuitabilityPredictor from '../../services/mlModels/employeeSuitabilityPredictor';
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';

// Mock数据库连接
vi.mock('../../config/database', () => ({
  default: {
    execute: vi.fn(),
  },
}));

describe('EmployeeSuitabilityPredictor', () => {
  let predictor: EmployeeSuitabilityPredictor;

  beforeEach(() => {
    predictor = new EmployeeSuitabilityPredictor();
    vi.clearAllMocks();
  });

  test('应该正确计算技能匹配度', async () => {
    // Mock员工数据
    const mockEmployeeData = [
      {
        employeeCode: 'E001',
        employeeName: '测试员工',
      },
    ] as RowDataPacket[];

    const mockQualificationData = [
      {
        qualificationId: 1,
        qualificationLevel: 3,
      },
      {
        qualificationId: 2,
        qualificationLevel: 2,
      },
    ] as RowDataPacket[];

    vi.mocked(pool.execute).mockResolvedValueOnce([mockEmployeeData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([mockQualificationData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]); // 历史表现查询
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]); // 偏好查询
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]); // 工时制查询

    const request = {
      employeeId: 1,
      operationId: 1,
      operationPlanId: 1,
      operationName: '测试操作',
      requiredQualifications: [
        { qualificationId: 1, minLevel: 2 },
        { qualificationId: 2, minLevel: 1 },
      ],
      startTime: '2024-01-01T08:00:00Z',
      endTime: '2024-01-01T16:00:00Z',
      shiftCode: 'DAY',
    };

    const result = await predictor.predictSuitability(request);

    expect(result).toBeDefined();
    expect(result.employeeId).toBe(1);
    expect(result.suitabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.suitabilityScore).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.factors.skillMatch).toBeGreaterThan(0); // 技能匹配
    expect(result.factors).toHaveProperty('skillMatch');
    expect(result.factors).toHaveProperty('historicalPerformance');
    expect(result.factors).toHaveProperty('fatigueLevel');
    expect(result.factors).toHaveProperty('preferenceMatch');
    expect(result.explanation).toBeDefined();
    expect(Array.isArray(result.explanation)).toBe(true);
  });

  test('应该检测技能不匹配', async () => {
    const mockEmployeeData = [
      {
        employeeCode: 'E001',
        employeeName: '测试员工',
      },
    ] as RowDataPacket[];

    const mockQualificationData = [
      {
        qualificationId: 1,
        qualificationLevel: 1, // 等级不足
      },
    ] as RowDataPacket[];

    vi.mocked(pool.execute).mockResolvedValueOnce([mockEmployeeData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([mockQualificationData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      employeeId: 1,
      operationId: 1,
      operationPlanId: 1,
      operationName: '测试操作',
      requiredQualifications: [
        { qualificationId: 1, minLevel: 3 }, // 需要等级3
      ],
      startTime: '2024-01-01T08:00:00Z',
      endTime: '2024-01-01T16:00:00Z',
    };

    const result = await predictor.predictSuitability(request);

    expect(result.factors.skillMatch).toBe(0); // 技能不匹配
    expect(result.explanation.some((e) => e.includes('技能不匹配'))).toBe(true);
  });

  test('应该处理无资质要求的操作', async () => {
    const mockEmployeeData = [
      {
        employeeCode: 'E001',
        employeeName: '测试员工',
      },
    ] as RowDataPacket[];

    vi.mocked(pool.execute).mockResolvedValueOnce([mockEmployeeData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]); // 无资质
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      employeeId: 1,
      operationId: 1,
      operationPlanId: 1,
      operationName: '测试操作',
      requiredQualifications: [], // 无资质要求
      startTime: '2024-01-01T08:00:00Z',
      endTime: '2024-01-01T16:00:00Z',
    };

    const result = await predictor.predictSuitability(request);

    expect(result.factors.skillMatch).toBe(1.0); // 无要求，完全匹配
  });

  test('应该考虑疲劳度', async () => {
    const mockEmployeeData = [
      {
        employeeCode: 'E001',
        employeeName: '测试员工',
      },
    ] as RowDataPacket[];

    vi.mocked(pool.execute).mockResolvedValueOnce([mockEmployeeData, []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      employeeId: 1,
      operationId: 1,
      operationPlanId: 1,
      operationName: '测试操作',
      requiredQualifications: [],
      startTime: '2024-01-01T08:00:00Z',
      endTime: '2024-01-01T16:00:00Z',
      currentSchedule: [
        { date: '2023-12-25', hours: 8 },
        { date: '2023-12-26', hours: 8 },
        { date: '2023-12-27', hours: 8 },
        { date: '2023-12-28', hours: 8 },
        { date: '2023-12-29', hours: 8 },
        { date: '2023-12-30', hours: 8 },
        { date: '2023-12-31', hours: 8 }, // 连续7天
      ],
    };

    const result = await predictor.predictSuitability(request);

    expect(result.factors.fatigueLevel).toBeGreaterThan(0);
    expect(result.explanation.some((e) => e.includes('疲劳度'))).toBe(true);
  });

  test('应该处理找不到员工的情况', async () => {
    vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

    const request = {
      employeeId: 999,
      operationId: 1,
      operationPlanId: 1,
      operationName: '测试操作',
      requiredQualifications: [],
      startTime: '2024-01-01T08:00:00Z',
      endTime: '2024-01-01T16:00:00Z',
    };

    await expect(predictor.predictSuitability(request)).rejects.toThrow('not found');
  });
});

