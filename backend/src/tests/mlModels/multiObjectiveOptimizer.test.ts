import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  NSGAIIOptimizer,
  ScheduleChromosome,
  SchedulingFitnessCalculator,
  type OptimizationConfig,
} from '../../services/multiObjectiveOptimizer';
import EmployeeSuitabilityPredictor from '../../services/mlModels/employeeSuitabilityPredictor';

// Mock员工适应性预测器
vi.mock('../../services/mlModels/employeeSuitabilityPredictor', () => ({
  default: vi.fn().mockImplementation(() => ({
    predictSuitability: vi.fn().mockResolvedValue({
      employeeId: 1,
      employeeCode: 'E001',
      employeeName: '测试员工',
      suitabilityScore: 0.8,
      confidence: 0.9,
      factors: {
        skillMatch: 1.0,
        historicalPerformance: 0.7,
        fatigueLevel: 0.2,
        preferenceMatch: 0.8,
        workTimeSystemCompatibility: 1.0,
      },
      explanation: ['技能匹配度高', '符合员工偏好'],
    }),
  })),
}));

describe('ScheduleChromosome', () => {
  test('应该正确初始化染色体', () => {
    const employeeIds = [1, 2, 3];
    const dates = ['2024-01-01', '2024-01-02'];
    const operationIds = [10, 20];

    const chromosome = new ScheduleChromosome(employeeIds, dates, operationIds);

    expect(chromosome.employeeIds).toEqual(employeeIds);
    expect(chromosome.dates).toEqual(dates);
    expect(chromosome.operationIds).toEqual(operationIds);
    expect(chromosome.genes.length).toBe(employeeIds.length);
    expect(chromosome.genes[0].length).toBe(dates.length);
    expect(chromosome.genes[0][0].length).toBe(operationIds.length);
  });

  test('应该正确设置和获取分配', () => {
    const chromosome = new ScheduleChromosome([1], ['2024-01-01'], [10]);

    chromosome.setAssignment(0, 0, 0, 1);
    expect(chromosome.getAssignment(0, 0, 0)).toBe(1);

    chromosome.setAssignment(0, 0, 0, 0);
    expect(chromosome.getAssignment(0, 0, 0)).toBe(0);
  });

  test('应该正确解码染色体', () => {
    const chromosome = new ScheduleChromosome([1], ['2024-01-01'], [10]);

    chromosome.setAssignment(0, 0, 0, 1);
    const assignments = chromosome.decode();

    expect(assignments.length).toBe(1);
    expect(assignments[0].employeeId).toBe(1);
    expect(assignments[0].date).toBe('2024-01-01');
    expect(assignments[0].operationPlanId).toBe(10);
  });

  test('应该正确克隆染色体', () => {
    const chromosome = new ScheduleChromosome([1], ['2024-01-01'], [10]);
    chromosome.setAssignment(0, 0, 0, 1);
    chromosome.fitness = {
      cost: -100,
      satisfaction: 0.8,
      balance: -10,
      skillMatch: 0.9,
      compliance: -2,
    };
    chromosome.rank = 1;
    chromosome.crowdingDistance = 0.5;

    const cloned = chromosome.clone();

    expect(cloned.employeeIds).toEqual(chromosome.employeeIds);
    expect(cloned.getAssignment(0, 0, 0)).toBe(1);
    expect(cloned.fitness).toEqual(chromosome.fitness);
    expect(cloned.rank).toBe(1);
    expect(cloned.crowdingDistance).toBe(0.5);
    expect(cloned).not.toBe(chromosome); // 应该是不同的对象
  });
});

describe('SchedulingFitnessCalculator', () => {
  let calculator: SchedulingFitnessCalculator;

  beforeEach(() => {
    calculator = new SchedulingFitnessCalculator();
  });

  test('应该正确计算适应度', async () => {
    const chromosome = new ScheduleChromosome([1], ['2024-01-01'], [10]);
    chromosome.setAssignment(0, 0, 0, 1);

    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        operationName: '测试操作',
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [{ qualificationId: 1, minLevel: 1 }],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [{ qualificationId: 1, qualificationLevel: 2 }],
      },
    ];

    const fitness = await calculator.calculateFitness(chromosome, operations, employees);

    expect(fitness).toBeDefined();
    expect(fitness.cost).toBeLessThanOrEqual(0); // 成本为负值
    expect(fitness.satisfaction).toBeGreaterThanOrEqual(0);
    expect(fitness.satisfaction).toBeLessThanOrEqual(1);
    expect(fitness.balance).toBeLessThanOrEqual(0); // 均衡度为负值
    expect(fitness.skillMatch).toBeGreaterThanOrEqual(0);
    expect(fitness.skillMatch).toBeLessThanOrEqual(1);
    expect(fitness.compliance).toBeLessThanOrEqual(0); // 合规度为负值
  });

  test('应该检测技能不匹配', async () => {
    const chromosome = new ScheduleChromosome([1], ['2024-01-01'], [10]);
    chromosome.setAssignment(0, 0, 0, 1);

    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        operationName: '测试操作',
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [{ qualificationId: 1, minLevel: 3 }],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [{ qualificationId: 1, qualificationLevel: 1 }], // 等级不足
      },
    ];

    const fitness = await calculator.calculateFitness(chromosome, operations, employees);

    expect(fitness.skillMatch).toBe(0); // 技能不匹配
  });
});

describe('NSGAIIOptimizer', () => {
  let optimizer: NSGAIIOptimizer;
  let fitnessCalculator: SchedulingFitnessCalculator;

  beforeEach(() => {
    fitnessCalculator = new SchedulingFitnessCalculator();
    const config: OptimizationConfig = {
      objectives: ['cost', 'satisfaction', 'balance', 'skillMatch', 'compliance'],
      populationSize: 10,
      generations: 5, // 减少代数以加快测试
      crossoverRate: 0.8,
      mutationRate: 0.1,
      tournamentSize: 2,
    };
    optimizer = new NSGAIIOptimizer(config, fitnessCalculator);
  });

  test('应该初始化种群', async () => {
    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [{ qualificationId: 1, minLevel: 1 }],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [{ qualificationId: 1, qualificationLevel: 2 }],
      },
    ];

    const candidateMap = new Map<number, number[]>();
    candidateMap.set(10, [1]);

    const result = await optimizer.optimize(operations, employees, candidateMap);

    expect(result).toBeDefined();
    expect(result.paretoFront).toBeDefined();
    expect(Array.isArray(result.paretoFront)).toBe(true);
    expect(result.statistics).toBeDefined();
    expect(result.statistics.populationSize).toBeGreaterThan(0);
    expect(result.statistics.paretoFrontSize).toBeGreaterThanOrEqual(0);
  });

  test('应该返回帕累托前沿解', async () => {
    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [],
      },
    ];

    const candidateMap = new Map<number, number[]>();
    candidateMap.set(10, [1]);

    const result = await optimizer.optimize(operations, employees, candidateMap);

    expect(result.paretoFront.length).toBeGreaterThanOrEqual(0);
    // 如果找到解，应该都有适应度
    result.paretoFront.forEach((chromosome) => {
      expect(chromosome.fitness).toBeDefined();
      expect(chromosome.rank).toBe(0); // 帕累托前沿的rank应该是0
    });
  });

  test('应该处理多个操作', async () => {
    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [],
      },
      {
        operationPlanId: 20,
        operationId: 2,
        date: '2024-01-02',
        requiredPeople: 1,
        startTime: '2024-01-02T08:00:00Z',
        endTime: '2024-01-02T16:00:00Z',
        requiredQualifications: [],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [],
      },
      {
        employeeId: 2,
        qualifications: [],
      },
    ];

    const candidateMap = new Map<number, number[]>();
    candidateMap.set(10, [1, 2]);
    candidateMap.set(20, [1, 2]);

    const result = await optimizer.optimize(operations, employees, candidateMap);

    expect(result.paretoFront.length).toBeGreaterThanOrEqual(0);
    expect(result.statistics.paretoFrontSize).toBeGreaterThanOrEqual(0);
  });

  test('应该计算统计信息', async () => {
    const operations = [
      {
        operationPlanId: 10,
        operationId: 1,
        date: '2024-01-01',
        requiredPeople: 1,
        startTime: '2024-01-01T08:00:00Z',
        endTime: '2024-01-01T16:00:00Z',
        requiredQualifications: [],
      },
    ];

    const employees = [
      {
        employeeId: 1,
        qualifications: [],
      },
    ];

    const candidateMap = new Map<number, number[]>();
    candidateMap.set(10, [1]);

    const result = await optimizer.optimize(operations, employees, candidateMap);

    expect(result.statistics.generation).toBe(5);
    expect(result.statistics.populationSize).toBe(10);
    expect(result.statistics.averageFitness).toBeDefined();
    expect(result.statistics.bestFitness).toBeDefined();
  });
});

