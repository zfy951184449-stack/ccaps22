import dayjs from "dayjs";
import EmployeeSuitabilityPredictor from "./mlModels/employeeSuitabilityPredictor";

/**
 * 适应度评分
 */
export interface FitnessScore {
  cost: number; // 成本（越小越好）
  satisfaction: number; // 员工满意度（越大越好）
  balance: number; // 工时均衡度（方差越小越好，所以用负值）
  skillMatch: number; // 技能匹配度（越大越好）
  compliance: number; // 规则遵循度（违反越少越好，所以用负值）
}

/**
 * 排班方案（解码后的染色体）
 */
export interface ScheduleSolution {
  assignments: Array<{
    employeeId: number;
    date: string;
    operationPlanId: number;
    shiftCode?: string;
    planHours: number;
    overtimeHours: number;
    operationDuration?: number; // 操作实际时长（小时），用于车间工时计算
  }>;
  fitness: FitnessScore;
  rank?: number; // 帕累托前沿等级
  crowdingDistance?: number; // 拥挤距离
}

/**
 * 染色体编码
 */
export class ScheduleChromosome {
  // 编码：三维数组 [员工索引][日期索引][操作索引] = 分配状态(0/1)
  genes: number[][][];
  
  // 元数据
  employeeIds: number[];
  dates: string[];
  operationIds: number[];
  
  // 适应度
  fitness?: FitnessScore;
  rank?: number;
  crowdingDistance?: number;

  constructor(
    employeeIds: number[],
    dates: string[],
    operationIds: number[]
  ) {
    this.employeeIds = employeeIds;
    this.dates = dates;
    this.operationIds = operationIds;
    
    // 初始化基因：所有分配为0（未分配）
    this.genes = employeeIds.map(() =>
      dates.map(() => new Array(operationIds.length).fill(0))
    );
  }

  /**
   * 复制染色体
   */
  clone(): ScheduleChromosome {
    const cloned = new ScheduleChromosome(
      this.employeeIds,
      this.dates,
      this.operationIds
    );
    
    cloned.genes = this.genes.map((empGenes) =>
      empGenes.map((dateGenes) => [...dateGenes])
    );
    
    cloned.fitness = this.fitness ? { ...this.fitness } : undefined;
    cloned.rank = this.rank;
    cloned.crowdingDistance = this.crowdingDistance;
    
    return cloned;
  }

  /**
   * 设置分配
   */
  setAssignment(
    employeeIndex: number,
    dateIndex: number,
    operationIndex: number,
    value: number
  ): void {
    if (
      employeeIndex >= 0 &&
      employeeIndex < this.genes.length &&
      dateIndex >= 0 &&
      dateIndex < this.genes[employeeIndex].length &&
      operationIndex >= 0 &&
      operationIndex < this.genes[employeeIndex][dateIndex].length
    ) {
      this.genes[employeeIndex][dateIndex][operationIndex] = value;
    }
  }

  /**
   * 获取分配
   */
  getAssignment(
    employeeIndex: number,
    dateIndex: number,
    operationIndex: number
  ): number {
    if (
      employeeIndex >= 0 &&
      employeeIndex < this.genes.length &&
      dateIndex >= 0 &&
      dateIndex < this.genes[employeeIndex].length &&
      operationIndex >= 0 &&
      operationIndex < this.genes[employeeIndex][dateIndex].length
    ) {
      return this.genes[employeeIndex][dateIndex][operationIndex];
    }
    return 0;
  }

  /**
   * 解码为排班方案
   */
  decode(): ScheduleSolution["assignments"] {
    const assignments: ScheduleSolution["assignments"] = [];

    for (let empIdx = 0; empIdx < this.employeeIds.length; empIdx++) {
      for (let dateIdx = 0; dateIdx < this.dates.length; dateIdx++) {
        for (let opIdx = 0; opIdx < this.operationIds.length; opIdx++) {
          if (this.genes[empIdx][dateIdx][opIdx] === 1) {
            assignments.push({
              employeeId: this.employeeIds[empIdx],
              date: this.dates[dateIdx],
              operationPlanId: this.operationIds[opIdx],
              planHours: 8, // 默认8小时（DAY班次标准工时），后续会在enrich阶段根据操作时间推断班次并更新
              overtimeHours: 0,
            });
          }
        }
      }
    }

    return assignments;
  }
}

/**
 * 优化配置
 */
export interface OptimizationConfig {
  objectives: Array<keyof FitnessScore>;
  weights?: Partial<Record<keyof FitnessScore, number>>;
  constraints?: any;
  populationSize: number;
  generations: number;
  crossoverRate?: number;
  mutationRate?: number;
  tournamentSize?: number;
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  paretoFront: ScheduleChromosome[]; // 帕累托前沿解
  statistics: {
    generation: number;
    populationSize: number;
    paretoFrontSize: number;
    averageFitness: FitnessScore;
    bestFitness: FitnessScore;
    actualGenerations?: number; // v4新增：实际迭代次数（可能早停）
  };
}

/**
 * 适应度计算器接口
 */
export interface FitnessCalculator {
  calculateFitness(
    chromosome: ScheduleChromosome,
    operations: any[],
    employees: Array<{
      employeeId: number;
      orgRole?: string; // v4新增：组织层级角色
      workTimeSystemType?: string; // v4新增：工时制类型
      comprehensivePeriod?: string; // v4新增：综合工时制周期
      qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    }>
  ): Promise<FitnessScore>;
}

/**
 * NSGA-II多目标优化器
 */
export class NSGAIIOptimizer {
  private config: OptimizationConfig;
  private fitnessCalculator: FitnessCalculator;

  constructor(
    config: OptimizationConfig,
    fitnessCalculator: FitnessCalculator
  ) {
    this.config = {
      crossoverRate: 0.8,
      mutationRate: 0.1,
      tournamentSize: 2,
      ...config,
    };
    this.fitnessCalculator = fitnessCalculator;
  }

  /**
   * 执行优化
   */
  async optimize(
    operations: Array<{
      operationPlanId: number;
      operationId: number;
      date: string;
      requiredPeople: number;
      startTime: string;
      endTime: string;
      requiredQualifications?: Array<{ qualificationId: number; minLevel: number }>;
    }>,
    employees: Array<{
      employeeId: number;
      orgRole?: string; // v4新增：组织层级角色
      workTimeSystemType?: string; // v4新增：工时制类型
      comprehensivePeriod?: string; // v4新增：综合工时制周期
      qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    }>,
    candidateMap: Map<number, number[]>, // operationPlanId -> employeeIds[]
    options?: {
      adaptiveParams?: boolean; // v4新增：是否使用自适应参数
      earlyStop?: boolean; // v4新增：是否启用早停
      onProgress?: (generation: number, bestFitness: FitnessScore) => void; // v4新增：进度回调
    }
  ): Promise<OptimizationResult> {
    // v4新增：自适应参数调整
    let actualPopulationSize = this.config.populationSize;
    let actualGenerations = this.config.generations;
    
    if (options?.adaptiveParams) {
      const problemSize = operations.length * employees.length;
      if (problemSize < 2500) { // 小规模问题（<50操作）
        actualPopulationSize = 10;
        actualGenerations = 20;
      } else if (problemSize < 10000) { // 中规模问题（50-100操作）
        actualPopulationSize = 20;
        actualGenerations = 30;
      } else { // 大规模问题（>100操作）
        actualPopulationSize = 30;
        actualGenerations = 40;
      }
    }

    // 1. 初始化种群
    let population = this.initializePopulation(
      operations,
      employees,
      candidateMap,
      actualPopulationSize
    );

    // v4新增：早停机制
    let noImprovementCount = 0;
    const NO_IMPROVEMENT_THRESHOLD = 5; // 连续5代无改进则早停
    let bestCompliance = Infinity; // 记录最佳compliance值（越小越好）
    let generation = 0; // v4修复：将generation变量声明移到循环外部，以便在循环外访问

    // 2. 迭代优化
    for (generation = 0; generation < actualGenerations; generation++) {
      // 每10代记录一次进度
      if (generation % 10 === 0 || generation === actualGenerations - 1) {
        console.log(`[NSGA-II] 代数 ${generation + 1}/${actualGenerations}`);
      }

      // 2.1 计算适应度
      await this.evaluateFitness(population, operations, employees);

      // 2.2 非支配排序
      const fronts = this.nonDominatedSort(population);

      // 2.3 计算拥挤距离
      this.calculateCrowdingDistance(fronts);

      // v4新增：检查是否有改进
      if (options?.earlyStop && fronts.length > 0 && fronts[0].length > 0) {
        const bestSolution = fronts[0][0];
        if (bestSolution.fitness) {
          const currentCompliance = Math.abs(bestSolution.fitness.compliance);
          if (currentCompliance < bestCompliance) {
            bestCompliance = currentCompliance;
            noImprovementCount = 0;
          } else {
            noImprovementCount++;
          }

          // v4新增：进度回调
          if (options.onProgress) {
            options.onProgress(generation, bestSolution.fitness);
          }

          // v4新增：早停检查 - 如果找到完全满足所有硬约束的解（compliance = 0），提前终止
          if (currentCompliance === 0) {
            console.log(`[NSGA-II] 找到完全满足约束的解，提前终止于第 ${generation + 1} 代`);
            break;
          }

          // v4新增：早停检查 - 连续无改进
          if (noImprovementCount >= NO_IMPROVEMENT_THRESHOLD) {
            console.log(`[NSGA-II] 连续 ${NO_IMPROVEMENT_THRESHOLD} 代无改进，提前终止于第 ${generation + 1} 代`);
            break;
          }
        }
      }

      // 2.4 选择父代（锦标赛选择）
      const parents = this.tournamentSelection(population);

      // 2.5 交叉和变异
      const offspring = await this.generateOffspring(
        parents,
        operations,
        employees,
        candidateMap
      );

      // 2.6 合并父代和子代
      const combined = [...population, ...offspring];

      // 2.7 环境选择（保留精英）
      population = this.environmentalSelection(combined, actualPopulationSize);
    }

    // 3. 返回帕累托前沿
    await this.evaluateFitness(population, operations, employees);
    const finalFronts = this.nonDominatedSort(population);
    const paretoFront = finalFronts.length > 0 ? finalFronts[0] : [];

    const statistics = this.calculateStatistics(population);
    statistics.generation = actualGenerations; // 更新实际迭代次数
    statistics.actualGenerations = generation + 1; // v4新增：记录实际迭代次数（可能早停）

    return {
      paretoFront,
      statistics,
    };
  }

  /**
   * 初始化种群
   */
  private initializePopulation(
    operations: Array<{
      operationPlanId: number;
      date: string;
      requiredPeople: number;
    }>,
    employees: Array<{ employeeId: number }>,
    candidateMap: Map<number, number[]>,
    populationSize?: number
  ): ScheduleChromosome[] {
    const dates = Array.from(
      new Set(operations.map((op) => op.date))
    ).sort();
    const operationIds = operations.map((op) => op.operationPlanId);
    const employeeIds = employees.map((emp) => emp.employeeId);

    const population: ScheduleChromosome[] = [];
    const size = populationSize || this.config.populationSize;

    for (let i = 0; i < size; i++) {
      const chromosome = new ScheduleChromosome(
        employeeIds,
        dates,
        operationIds
      );

      // 随机初始化：为每个操作随机分配员工
      for (const operation of operations) {
        const candidates = candidateMap.get(operation.operationPlanId) || [];
        if (candidates.length === 0) {
          continue;
        }

        const dateIndex = dates.indexOf(operation.date);
        const operationIndex = operationIds.indexOf(operation.operationPlanId);

        // 随机选择所需人数的员工
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, operation.requiredPeople);

        for (const employeeId of selected) {
          const employeeIndex = employeeIds.indexOf(employeeId);
          if (employeeIndex >= 0 && dateIndex >= 0 && operationIndex >= 0) {
            chromosome.setAssignment(employeeIndex, dateIndex, operationIndex, 1);
          }
        }
      }

      population.push(chromosome);
    }

    return population;
  }

  /**
   * 计算适应度
   */
  private async evaluateFitness(
    population: ScheduleChromosome[],
    operations: any[],
    employees: any[]
  ): Promise<void> {
    for (const chromosome of population) {
      if (!chromosome.fitness) {
        chromosome.fitness = await this.fitnessCalculator.calculateFitness(
          chromosome,
          operations,
          employees
        );
      }
    }
  }

  /**
   * 非支配排序
   */
  private nonDominatedSort(
    population: ScheduleChromosome[]
  ): ScheduleChromosome[][] {
    const fronts: ScheduleChromosome[][] = [];
    const dominatedBy: Map<ScheduleChromosome, number> = new Map();
    const dominates: Map<ScheduleChromosome, ScheduleChromosome[]> = new Map();

    // 初始化
    population.forEach((p) => {
      dominatedBy.set(p, 0);
      dominates.set(p, []);
    });

    // 计算支配关系
    for (let i = 0; i < population.length; i++) {
      for (let j = i + 1; j < population.length; j++) {
        const p1 = population[i];
        const p2 = population[j];

        if (!p1.fitness || !p2.fitness) {
          continue;
        }

        const isP1DominatesP2 = this.dominates(p1.fitness, p2.fitness);
        const isP2DominatesP1 = this.dominates(p2.fitness, p1.fitness);

        if (isP1DominatesP2) {
          dominates.get(p1)!.push(p2);
          dominatedBy.set(p2, (dominatedBy.get(p2) || 0) + 1);
        } else if (isP2DominatesP1) {
          dominates.get(p2)!.push(p1);
          dominatedBy.set(p1, (dominatedBy.get(p1) || 0) + 1);
        }
      }
    }

    // 找到第一层（非支配解）
    const front0: ScheduleChromosome[] = [];
    population.forEach((p) => {
      if ((dominatedBy.get(p) || 0) === 0) {
        front0.push(p);
        p.rank = 0;
      }
    });
    fronts.push(front0);

    // 迭代找到后续层
    let currentFront = front0;
    while (currentFront.length > 0) {
      const nextFront: ScheduleChromosome[] = [];
      
      currentFront.forEach((p) => {
        const dominated = dominates.get(p) || [];
        dominated.forEach((q) => {
          const count = (dominatedBy.get(q) || 0) - 1;
          dominatedBy.set(q, count);
          if (count === 0) {
            nextFront.push(q);
            q.rank = fronts.length;
          }
        });
      });

      if (nextFront.length > 0) {
        fronts.push(nextFront);
      }
      currentFront = nextFront;
    }

    return fronts;
  }

  /**
   * 判断是否支配
   */
  private dominates(fitness1: FitnessScore, fitness2: FitnessScore): boolean {
    // 所有目标都不差，且至少有一个目标更好
    const allBetterOrEqual =
      fitness1.cost <= fitness2.cost &&
      fitness1.satisfaction >= fitness2.satisfaction &&
      fitness1.balance >= fitness2.balance &&
      fitness1.skillMatch >= fitness2.skillMatch &&
      fitness1.compliance >= fitness2.compliance;

    const atLeastOneBetter =
      fitness1.cost < fitness2.cost ||
      fitness1.satisfaction > fitness2.satisfaction ||
      fitness1.balance > fitness2.balance ||
      fitness1.skillMatch > fitness2.skillMatch ||
      fitness1.compliance > fitness2.compliance;

    return allBetterOrEqual && atLeastOneBetter;
  }

  /**
   * 计算拥挤距离
   */
  private calculateCrowdingDistance(fronts: ScheduleChromosome[][]): void {
    fronts.forEach((front) => {
      if (front.length === 0) {
        return;
      }

      // 初始化拥挤距离
      front.forEach((p) => {
        p.crowdingDistance = 0;
      });

      // 边界解设置为无穷大
      if (front.length <= 2) {
        front.forEach((p) => {
          p.crowdingDistance = Infinity;
        });
        return;
      }

      // 对每个目标计算拥挤距离
      const objectives: Array<keyof FitnessScore> = [
        "cost",
        "satisfaction",
        "balance",
        "skillMatch",
        "compliance",
      ];

      objectives.forEach((obj) => {
        // 按当前目标排序
        front.sort((a, b) => {
          const aVal = a.fitness?.[obj] ?? 0;
          const bVal = b.fitness?.[obj] ?? 0;
          return aVal - bVal;
        });

        // 边界解设置为无穷大
        front[0].crowdingDistance = Infinity;
        front[front.length - 1].crowdingDistance = Infinity;

        // 计算其他解的拥挤距离
        const minVal = front[0].fitness?.[obj] ?? 0;
        const maxVal = front[front.length - 1].fitness?.[obj] ?? 0;
        const range = maxVal - minVal;

        if (range > 0) {
          for (let i = 1; i < front.length - 1; i++) {
            const prevVal = front[i - 1].fitness?.[obj] ?? 0;
            const nextVal = front[i + 1].fitness?.[obj] ?? 0;
            const distance = (nextVal - prevVal) / range;
            front[i].crowdingDistance =
              (front[i].crowdingDistance || 0) + distance;
          }
        }
      });
    });
  }

  /**
   * 锦标赛选择
   */
  private tournamentSelection(
    population: ScheduleChromosome[]
  ): ScheduleChromosome[] {
    const parents: ScheduleChromosome[] = [];
    const tournamentSize = this.config.tournamentSize || 2;

    while (parents.length < population.length) {
      // 随机选择锦标赛参与者
      const tournament: ScheduleChromosome[] = [];
      for (let i = 0; i < tournamentSize; i++) {
        const randomIndex = Math.floor(Math.random() * population.length);
        tournament.push(population[randomIndex]);
      }

      // 选择最优解（优先比较rank，然后比较crowdingDistance）
      tournament.sort((a, b) => {
        const rankA = a.rank ?? Infinity;
        const rankB = b.rank ?? Infinity;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        const distA = a.crowdingDistance ?? 0;
        const distB = b.crowdingDistance ?? 0;
        return distB - distA; // 拥挤距离越大越好
      });

      parents.push(tournament[0].clone());
    }

    return parents;
  }

  /**
   * 生成子代
   */
  private async generateOffspring(
    parents: ScheduleChromosome[],
    operations: any[],
    employees: any[],
    candidateMap: Map<number, number[]>
  ): Promise<ScheduleChromosome[]> {
    const offspring: ScheduleChromosome[] = [];
    const crossoverRate = this.config.crossoverRate || 0.8;
    const mutationRate = this.config.mutationRate || 0.1;

    // 交叉
    for (let i = 0; i < parents.length - 1; i += 2) {
      if (Math.random() < crossoverRate) {
        const [child1, child2] = this.crossover(parents[i], parents[i + 1]);
        offspring.push(child1, child2);
      } else {
        offspring.push(parents[i].clone(), parents[i + 1].clone());
      }
    }

    // 变异
    offspring.forEach((child) => {
      if (Math.random() < mutationRate) {
        this.mutate(child, operations, candidateMap);
      }
    });

    // 修复约束违反
    for (const child of offspring) {
      await this.repairConstraints(child, operations, employees, candidateMap);
    }

    return offspring;
  }

  /**
   * 交叉操作（两点交叉）
   */
  private crossover(
    parent1: ScheduleChromosome,
    parent2: ScheduleChromosome
  ): [ScheduleChromosome, ScheduleChromosome] {
    const child1 = parent1.clone();
    const child2 = parent2.clone();

    // 随机选择交叉点
    const employeeCrossoverPoint = Math.floor(
      Math.random() * parent1.employeeIds.length
    );
    const dateCrossoverPoint = Math.floor(
      Math.random() * parent1.dates.length
    );

    // 交换基因片段
    for (
      let empIdx = employeeCrossoverPoint;
      empIdx < parent1.employeeIds.length;
      empIdx++
    ) {
      for (
        let dateIdx = dateCrossoverPoint;
        dateIdx < parent1.dates.length;
        dateIdx++
      ) {
        for (let opIdx = 0; opIdx < parent1.operationIds.length; opIdx++) {
          const temp = child1.genes[empIdx][dateIdx][opIdx];
          child1.genes[empIdx][dateIdx][opIdx] =
            child2.genes[empIdx][dateIdx][opIdx];
          child2.genes[empIdx][dateIdx][opIdx] = temp;
        }
      }
    }

    // 清除适应度（需要重新计算）
    child1.fitness = undefined;
    child2.fitness = undefined;

    return [child1, child2];
  }

  /**
   * 变异操作
   */
  private mutate(
    chromosome: ScheduleChromosome,
    operations: Array<{
      operationPlanId: number;
      date: string;
      requiredPeople: number;
    }>,
    candidateMap: Map<number, number[]>
  ): void {
    // 随机选择一个操作
    const operationIndex = Math.floor(
      Math.random() * operations.length
    );
    const operation = operations[operationIndex];
    const dateIndex = chromosome.dates.indexOf(operation.date);
    const opIndex = chromosome.operationIds.indexOf(operation.operationPlanId);

    if (dateIndex < 0 || opIndex < 0) {
      return;
    }

    // 随机选择一个员工
    const candidates = candidateMap.get(operation.operationPlanId) || [];
    if (candidates.length === 0) {
      return;
    }

    const randomEmployeeId =
      candidates[Math.floor(Math.random() * candidates.length)];
    const employeeIndex = chromosome.employeeIds.indexOf(randomEmployeeId);

    if (employeeIndex < 0) {
      return;
    }

    // 翻转分配状态
    const current = chromosome.getAssignment(employeeIndex, dateIndex, opIndex);
    chromosome.setAssignment(
      employeeIndex,
      dateIndex,
      opIndex,
      current === 1 ? 0 : 1
    );

    // 清除适应度（需要重新计算）
    chromosome.fitness = undefined;
  }

  /**
   * 修复约束违反
   */
  private async repairConstraints(
    chromosome: ScheduleChromosome,
    operations: any[],
    employees: any[],
    candidateMap: Map<number, number[]>
  ): Promise<void> {
    // 简化实现：确保每个操作有足够的人员
    for (let opIdx = 0; opIdx < operations.length; opIdx++) {
      const operation = operations[opIdx];
      const dateIndex = chromosome.dates.indexOf(operation.date);
      const operationIndex = chromosome.operationIds.indexOf(
        operation.operationPlanId
      );

      if (dateIndex < 0 || operationIndex < 0) {
        continue;
      }

      // 统计当前分配的人数
      let assignedCount = 0;
      for (let empIdx = 0; empIdx < chromosome.employeeIds.length; empIdx++) {
        if (
          chromosome.getAssignment(empIdx, dateIndex, operationIndex) === 1
        ) {
          assignedCount++;
        }
      }

      // 如果人数不足，随机添加
      if (assignedCount < operation.requiredPeople) {
        const candidates = candidateMap.get(operation.operationPlanId) || [];
        const available = candidates.filter(
          (empId) =>
            chromosome.getAssignment(
              chromosome.employeeIds.indexOf(empId),
              dateIndex,
              operationIndex
            ) === 0
        );

        const needed = operation.requiredPeople - assignedCount;
        const toAdd = available.slice(0, needed);

        for (const empId of toAdd) {
          const empIdx = chromosome.employeeIds.indexOf(empId);
          if (empIdx >= 0) {
            chromosome.setAssignment(empIdx, dateIndex, operationIndex, 1);
          }
        }
      }

      // 如果人数过多，随机移除
      if (assignedCount > operation.requiredPeople) {
        const assigned = [];
        for (let empIdx = 0; empIdx < chromosome.employeeIds.length; empIdx++) {
          if (
            chromosome.getAssignment(empIdx, dateIndex, operationIndex) === 1
          ) {
            assigned.push(empIdx);
          }
        }

        const toRemove = assigned
          .sort(() => Math.random() - 0.5)
          .slice(0, assignedCount - operation.requiredPeople);

        for (const empIdx of toRemove) {
          chromosome.setAssignment(empIdx, dateIndex, operationIndex, 0);
        }
      }
    }
  }

  /**
   * 环境选择（保留精英）
   */
  private environmentalSelection(
    combined: ScheduleChromosome[],
    populationSize?: number
  ): ScheduleChromosome[] {
    // 重新计算适应度和排序
    const fronts = this.nonDominatedSort(combined);
    this.calculateCrowdingDistance(fronts);

    // 按rank和crowdingDistance排序
    combined.sort((a, b) => {
      const rankA = a.rank ?? Infinity;
      const rankB = b.rank ?? Infinity;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const distA = a.crowdingDistance ?? 0;
      const distB = b.crowdingDistance ?? 0;
      return distB - distA; // 拥挤距离越大越好
    });

    // 选择前populationSize个
    const size = populationSize || this.config.populationSize;
    return combined.slice(0, size);
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(
    population: ScheduleChromosome[]
  ): OptimizationResult["statistics"] {
    const validFitness = population.filter((p) => p.fitness);
    
    if (validFitness.length === 0) {
      return {
        generation: this.config.generations,
        populationSize: population.length,
        paretoFrontSize: 0,
        averageFitness: {
          cost: 0,
          satisfaction: 0,
          balance: 0,
          skillMatch: 0,
          compliance: 0,
        },
        bestFitness: {
          cost: 0,
          satisfaction: 0,
          balance: 0,
          skillMatch: 0,
          compliance: 0,
        },
      };
    }

    // 计算平均适应度
    const avgFitness: FitnessScore = {
      cost: 0,
      satisfaction: 0,
      balance: 0,
      skillMatch: 0,
      compliance: 0,
    };

    validFitness.forEach((p) => {
      if (p.fitness) {
        avgFitness.cost += p.fitness.cost;
        avgFitness.satisfaction += p.fitness.satisfaction;
        avgFitness.balance += p.fitness.balance;
        avgFitness.skillMatch += p.fitness.skillMatch;
        avgFitness.compliance += p.fitness.compliance;
      }
    });

    const count = validFitness.length;
    avgFitness.cost /= count;
    avgFitness.satisfaction /= count;
    avgFitness.balance /= count;
    avgFitness.skillMatch /= count;
    avgFitness.compliance /= count;

    // 找到最优适应度（帕累托前沿中的第一个）
    const fronts = this.nonDominatedSort(population);
    const bestFitness =
      fronts.length > 0 && fronts[0].length > 0 && fronts[0][0].fitness
        ? fronts[0][0].fitness
        : avgFitness;

    return {
      generation: this.config.generations,
      populationSize: population.length,
      paretoFrontSize: fronts.length > 0 ? fronts[0].length : 0,
      averageFitness: avgFitness,
      bestFitness,
      actualGenerations: this.config.generations, // 默认值，会在optimize方法中更新
    };
  }
}

/**
 * 排班适应度计算器实现
 */
export class SchedulingFitnessCalculator implements FitnessCalculator {
  private employeeSuitabilityPredictor: EmployeeSuitabilityPredictor;
  private comprehensiveAdapter?: any; // v4新增：综合工时制适配器（可选，延迟加载）

  constructor(comprehensiveAdapter?: any) {
    this.employeeSuitabilityPredictor = new EmployeeSuitabilityPredictor();
    this.comprehensiveAdapter = comprehensiveAdapter;
  }

  /**
   * 计算适应度
   */
  async calculateFitness(
    chromosome: ScheduleChromosome,
    operations: Array<{
      operationPlanId: number;
      operationId: number;
      operationName: string;
      date: string;
      requiredPeople: number;
      startTime: string;
      endTime: string;
      requiredQualifications?: Array<{ qualificationId: number; minLevel: number }>;
    }>,
    employees: Array<{
      employeeId: number;
      orgRole?: string; // v4新增：组织层级角色
      workTimeSystemType?: string; // v4新增：工时制类型
      comprehensivePeriod?: string; // v4新增：综合工时制周期
      qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    }>
  ): Promise<FitnessScore> {
    const assignments = chromosome.decode();

    // 1. 计算成本
    const cost = await this.calculateCost(assignments);

    // 2. 计算员工满意度
    const satisfaction = await this.calculateSatisfaction(
      assignments,
      operations,
      employees
    );

    // 3. 计算工时均衡度（总工时）
    const totalBalance = this.calculateWorkloadBalance(assignments);

    // 3.1 计算车间工时均衡度（操作任务工时）
    const allEmployeeIds = employees.map(e => e.employeeId);
    const shopfloorBalance = this.calculateShopfloorWorkloadBalance(
      assignments,
      allEmployeeIds
    );

    // 3.2 v4新增：计算一线员工工时均衡度
    const frontlineBalance = this.calculateFrontlineWorkloadBalance(
      assignments,
      employees
    );

    // 3.3 合并总工时均衡、车间工时均衡和一线员工工时均衡
    // v4强调一线员工操作时间均衡：权重调整为总工时30%，车间工时20%，一线员工工时50%
    // 这样确保在分配阶段就优先考虑一线员工操作时间均衡
    const balance = totalBalance * 0.3 + shopfloorBalance * 0.2 + frontlineBalance * 0.5;

    // 4. 计算技能匹配度
    const skillMatch = this.calculateSkillMatch(
      assignments,
      operations,
      employees
    );

    // 5. 计算规则遵循度
    const baseCompliance = await this.calculateRuleCompliance(
      assignments,
      operations
    );

    // 5.1 v4新增：计算综合工时制约束惩罚
    const comprehensivePenalty = await this.calculateComprehensiveWorkTimePenalty(
      assignments,
      employees
    );

    // 5.2 v4新增：计算管理层员工参与惩罚
    const managementPenalty = this.calculateManagementPenalty(
      assignments,
      employees
    );

    // 合并所有惩罚
    const compliance = baseCompliance + comprehensivePenalty + managementPenalty;

    return {
      cost: -cost, // 成本越小越好，所以用负值
      satisfaction,
      balance: -balance, // 方差越小越好，所以用负值（包含总工时、车间工时和一线员工工时均衡）
      skillMatch,
      compliance: -compliance, // 违反越少越好，所以用负值
    };
  }

  /**
   * 计算成本
   */
  private async calculateCost(
    assignments: ScheduleSolution["assignments"]
  ): Promise<number> {
    // 基础成本（假设每小时100元）
    const baseHourlyRate = 100;
    const overtimeMultiplier = 1.5;

    let totalCost = 0;

    for (const assignment of assignments) {
      const baseCost = assignment.planHours * baseHourlyRate;
      const overtimeCost =
        assignment.overtimeHours * baseHourlyRate * overtimeMultiplier;
      totalCost += baseCost + overtimeCost;
    }

    // 添加管理成本（10%）
    totalCost *= 1.1;

    return totalCost;
  }

  /**
   * 计算员工满意度
   */
  private async calculateSatisfaction(
    assignments: Array<{
      employeeId: number;
      shiftCode?: string;
      operationPlanId: number;
    }>,
    operations: Array<{
      operationPlanId: number;
      operationId: number;
      operationName: string;
      startTime: string;
      endTime: string;
      requiredQualifications?: Array<{ qualificationId: number; minLevel: number }>;
    }>,
    employees: Array<{
      employeeId: number;
      qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    }>
  ): Promise<number> {
    if (assignments.length === 0) {
      return 0;
    }

    let totalSatisfaction = 0;
    let count = 0;

    for (const assignment of assignments) {
      const operation = operations.find(
        (op) => op.operationPlanId === assignment.operationPlanId
      );
      if (!operation) {
        continue;
      }

      try {
        const suitability = await this.employeeSuitabilityPredictor.predictSuitability(
          {
            employeeId: assignment.employeeId,
            operationId: operation.operationId,
            operationPlanId: operation.operationPlanId,
            operationName: operation.operationName,
            requiredQualifications: operation.requiredQualifications || [],
            startTime: operation.startTime,
            endTime: operation.endTime,
            shiftCode: assignment.shiftCode,
          }
        );

        totalSatisfaction += suitability.suitabilityScore;
        count++;
      } catch (error) {
        console.error(
          `Failed to calculate suitability for employee ${assignment.employeeId}:`,
          error
        );
        // 使用默认评分
        totalSatisfaction += 0.5;
        count++;
      }
    }

    return count > 0 ? totalSatisfaction / count : 0;
  }

  /**
   * 计算工时均衡度（方差）
   * 注意：总工时只计算planHours，不包括overtimeHours（加班工时不计入总工时）
   */
  private calculateWorkloadBalance(
    assignments: Array<{ employeeId: number; planHours: number; overtimeHours: number }>
  ): number {
    // 按员工分组计算工时
    // 总工时只计算planHours，不包括overtimeHours
    const employeeHours = new Map<number, number>();
    assignments.forEach((assignment) => {
      const current = employeeHours.get(assignment.employeeId) || 0;
      employeeHours.set(
        assignment.employeeId,
        current + assignment.planHours // 只计算planHours
      );
    });

    const hoursArray = Array.from(employeeHours.values());
    if (hoursArray.length === 0) {
      return 0;
    }

    // 计算平均值
    const mean = hoursArray.reduce((sum, h) => sum + h, 0) / hoursArray.length;

    // 计算方差
    const variance =
      hoursArray.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
      hoursArray.length;

    return variance;
  }

  /**
   * 计算车间工时均衡度（方差）
   * 车间工时 = 执行操作的时间（operationPlanId > 0 的工时）
   * 目的：确保员工之间执行操作任务的工时相对均衡，实现劳动公平性
   */
  private calculateShopfloorWorkloadBalance(
    assignments: Array<{ employeeId: number; operationPlanId: number; planHours: number; overtimeHours: number; operationDuration?: number }>,
    allEmployeeIds: number[]
  ): number {
    // 按员工分组计算车间工时（只统计操作任务工时）
    const shopfloorHours = new Map<number, number>();
    
    // 初始化所有员工的车间工时为0
    allEmployeeIds.forEach(empId => {
      shopfloorHours.set(empId, 0);
    });
    
    // 只统计 operationPlanId > 0 的工时（操作任务）
    // 车间工时应该使用操作实际时长（operationDuration），而不是planHours（班次标准工时）
    assignments.forEach((assignment) => {
      if (assignment.operationPlanId > 0) {
        const current = shopfloorHours.get(assignment.employeeId) || 0;
        // 优先使用operationDuration（操作实际时长），如果没有则使用planHours + overtimeHours
        const operationHours = assignment.operationDuration ?? (assignment.planHours + assignment.overtimeHours);
        shopfloorHours.set(
          assignment.employeeId,
          current + operationHours
        );
      }
    });

    const hoursArray = Array.from(shopfloorHours.values());
    if (hoursArray.length === 0) {
      return 0;
    }

    // 计算平均值
    const mean = hoursArray.reduce((sum, h) => sum + h, 0) / hoursArray.length;
    
    if (mean === 0) {
      return 0; // 如果平均车间工时为0，返回0（无需均衡）
    }

    // 计算方差
    const variance =
      hoursArray.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
      hoursArray.length;

    return variance;
  }

  /**
   * 计算技能匹配度
   */
  private calculateSkillMatch(
    assignments: Array<{
      employeeId: number;
      operationPlanId: number;
    }>,
    operations: Array<{
      operationPlanId: number;
      requiredQualifications?: Array<{ qualificationId: number; minLevel: number }>;
    }>,
    employees: Array<{
      employeeId: number;
      qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    }>
  ): number {
    if (assignments.length === 0) {
      return 1.0;
    }

    let totalMatch = 0;
    let count = 0;

    for (const assignment of assignments) {
      const operation = operations.find(
        (op) => op.operationPlanId === assignment.operationPlanId
      );
      if (!operation || !operation.requiredQualifications?.length) {
        totalMatch += 1.0; // 无要求，完全匹配
        count++;
        continue;
      }

      const employee = employees.find(
        (emp) => emp.employeeId === assignment.employeeId
      );
      if (!employee) {
        totalMatch += 0; // 找不到员工，不匹配
        count++;
        continue;
      }

      // 计算技能匹配度
      let matchScore = 0;
      let allMatch = true;

      for (const req of operation.requiredQualifications) {
        const empQual = employee.qualifications.find(
          (q) => q.qualificationId === req.qualificationId
        );

        if (!empQual || empQual.qualificationLevel < req.minLevel) {
          allMatch = false;
          break;
        }

        matchScore += Math.min(1, empQual.qualificationLevel / req.minLevel);
      }

      const finalScore = allMatch ? matchScore / operation.requiredQualifications.length : 0;
      totalMatch += finalScore;
      count++;
    }

    return count > 0 ? totalMatch / count : 0;
  }

  /**
   * 计算规则遵循度（违反数量）
   */
  private async calculateRuleCompliance(
    assignments: Array<{
      employeeId: number;
      date: string;
      planHours: number;
      overtimeHours: number;
      shiftCode?: string;
      operationPlanId: number;
    }>,
    operations: Array<{
      operationPlanId: number;
      date: string;
      requiredPeople: number;
    }>
  ): Promise<number> {
    let violations = 0;

    // 按员工分组
    const employeeAssignments = new Map<
      number,
      Array<{
        date: string;
        planHours: number;
        overtimeHours: number;
        shiftCode?: string;
        operationPlanId: number;
      }>
    >();

    assignments.forEach((assignment) => {
      if (!employeeAssignments.has(assignment.employeeId)) {
        employeeAssignments.set(assignment.employeeId, []);
      }
      employeeAssignments.get(assignment.employeeId)!.push({
        date: assignment.date,
        planHours: assignment.planHours,
        overtimeHours: assignment.overtimeHours,
        shiftCode: assignment.shiftCode,
        operationPlanId: assignment.operationPlanId,
      });
    });

    // 检查每个员工的约束违反
    for (const [employeeId, empAssignments] of employeeAssignments) {
      const sorted = [...empAssignments].sort((a, b) =>
        dayjs(a.date).diff(dayjs(b.date))
      );

      // 检查连续工作天数
      let consecutiveDays = 0;
      let lastDate: dayjs.Dayjs | null = null;

      for (const assignment of sorted) {
        if (assignment.planHours === 0) {
          consecutiveDays = 0;
          lastDate = null;
          continue;
        }

        const assignmentDate = dayjs(assignment.date);
        if (lastDate === null) {
          consecutiveDays = 1;
          lastDate = assignmentDate;
        } else if (assignmentDate.diff(lastDate, "day") === 1) {
          consecutiveDays++;
          lastDate = assignmentDate;
        } else {
          consecutiveDays = 1;
          lastDate = assignmentDate;
        }

        if (consecutiveDays > 6) {
          violations++;
        }
      }

      // 检查每日工时限制
      // 注意：每日工时限制检查需要包含overtimeHours（因为这是检查每日总工时是否超过11小时）
      sorted.forEach((assignment) => {
        const totalHours = assignment.planHours + assignment.overtimeHours; // 每日限制检查包含overtimeHours
        if (totalHours > 11) {
          violations++;
        }
      });

      // 检查夜班后休息
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        const isNightShift =
          current.shiftCode?.toUpperCase().includes("NIGHT") || false;

        if (isNightShift && next.planHours > 0) {
          const daysDiff = dayjs(next.date).diff(dayjs(current.date), "day");
          if (daysDiff < 1) {
            violations += 2; // 严重违反，加倍扣分
          } else if (daysDiff === 1) {
            violations += 0.5; // 轻微违反
          }
        }
      }
    }

    // 检查操作覆盖
    const operationAssignments = new Map<number, number>();
    assignments.forEach((assignment) => {
      const current = operationAssignments.get(assignment.operationPlanId) || 0;
      operationAssignments.set(assignment.operationPlanId, current + 1);
    });

    operations.forEach((operation) => {
      const assignedCount = operationAssignments.get(operation.operationPlanId) || 0;
      if (assignedCount < operation.requiredPeople) {
        violations += 5 * (operation.requiredPeople - assignedCount); // 未覆盖操作，严重违反
      }
    });

    return violations;
  }

  /**
   * v4新增：计算一线员工工时均衡度（方差）
   * 只统计一线员工（FRONTLINE, SHIFT_LEADER）的车间工时，确保一线员工之间工时相对均衡
   */
  private calculateFrontlineWorkloadBalance(
    assignments: Array<{ employeeId: number; operationPlanId: number; planHours: number; overtimeHours: number; operationDuration?: number }>,
    employees: Array<{ employeeId: number; orgRole?: string }>
  ): number {
    const FRONTLINE_ROLES = ['FRONTLINE', 'SHIFT_LEADER'];
    
    // 识别一线员工
    const frontlineEmployeeIds = new Set(
      employees
        .filter(emp => emp.orgRole && FRONTLINE_ROLES.includes(emp.orgRole.toUpperCase()))
        .map(emp => emp.employeeId)
    );

    if (frontlineEmployeeIds.size === 0) {
      return 0; // 没有一线员工，返回0
    }

    // 按一线员工分组计算车间工时（只统计操作任务工时，operationPlanId > 0）
    const frontlineHours = new Map<number, number>();
    
    // 初始化所有一线员工的车间工时为0
    frontlineEmployeeIds.forEach(empId => {
      frontlineHours.set(empId, 0);
    });
    
    // 只统计 operationPlanId > 0 的工时（操作任务）
    // 车间工时应该使用操作实际时长（operationDuration），而不是planHours（班次标准工时）
    assignments.forEach((assignment) => {
      if (assignment.operationPlanId > 0 && frontlineEmployeeIds.has(assignment.employeeId)) {
        const current = frontlineHours.get(assignment.employeeId) || 0;
        // 优先使用operationDuration（操作实际时长），如果没有则使用planHours + overtimeHours
        const operationHours = assignment.operationDuration ?? (assignment.planHours + assignment.overtimeHours);
        frontlineHours.set(
          assignment.employeeId,
          current + operationHours
        );
      }
    });

    const hoursArray = Array.from(frontlineHours.values());
    if (hoursArray.length === 0) {
      return 0;
    }

    // 计算平均值
    const mean = hoursArray.reduce((sum, h) => sum + h, 0) / hoursArray.length;
    
    if (mean === 0) {
      return 0; // 如果平均车间工时为0，返回0（无需均衡）
    }

    // 计算方差
    const variance =
      hoursArray.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
      hoursArray.length;

    return variance;
  }

  /**
   * v4新增：计算综合工时制约束惩罚
   * 对综合工时制员工，检查季度和月度约束违反
   */
  private async calculateComprehensiveWorkTimePenalty(
    assignments: Array<{ employeeId: number; date: string; planHours: number; overtimeHours: number }>,
    employees: Array<{ employeeId: number; workTimeSystemType?: string; comprehensivePeriod?: string }>
  ): Promise<number> {
    if (!this.comprehensiveAdapter) {
      return 0; // 如果没有适配器，返回0（不惩罚）
    }

    let totalPenalty = 0;

    // 按员工分组
    const employeeAssignments = new Map<number, Array<{ date: string; planHours: number; overtimeHours: number }>>();
    assignments.forEach((assignment) => {
      if (!employeeAssignments.has(assignment.employeeId)) {
        employeeAssignments.set(assignment.employeeId, []);
      }
      employeeAssignments.get(assignment.employeeId)!.push({
        date: assignment.date,
        planHours: assignment.planHours,
        overtimeHours: assignment.overtimeHours,
      });
    });

    // 检查每个综合工时制员工
    for (const employee of employees) {
      if (employee.workTimeSystemType !== 'COMPREHENSIVE' || !employee.comprehensivePeriod) {
        continue;
      }

      const empAssignments = employeeAssignments.get(employee.employeeId) || [];
      if (empAssignments.length === 0) {
        continue;
      }

      try {
        // 转换为ScheduleRecord格式
        const scheduleRecords: Array<{ date: string; planHours: number; overtimeHours: number; operationPlanId?: number }> = empAssignments.map(a => ({
          date: a.date,
          planHours: a.planHours,
          overtimeHours: a.overtimeHours,
          operationPlanId: undefined, // 综合工时制检查不需要operationPlanId
        }));

        // 检查综合工时制约束
        const violations = await this.comprehensiveAdapter.checkComprehensiveConstraints(
          employee.employeeId,
          scheduleRecords as any, // 类型转换，因为ScheduleRecord接口可能包含其他字段
          employee.comprehensivePeriod as any
        );

        // 计算惩罚分数
        violations.forEach(violation => {
          if (violation.severity === 'CRITICAL') {
            totalPenalty += 10; // 严重违反，高惩罚
          } else if (violation.severity === 'HIGH') {
            totalPenalty += 5; // 高级违反，中等惩罚
          } else if (violation.severity === 'MEDIUM') {
            totalPenalty += 2; // 中级违反，低惩罚
          } else {
            totalPenalty += 1; // 低级违反，轻微惩罚
          }
        });
      } catch (error) {
        // 如果检查失败，不惩罚（避免影响优化）
        console.error(`Failed to check comprehensive constraints for employee ${employee.employeeId}:`, error);
      }
    }

    return totalPenalty;
  }

  /**
   * v4新增：计算管理层员工参与惩罚
   * 管理层员工（GROUP_LEADER及以上）参与操作会增加惩罚分数
   */
  private calculateManagementPenalty(
    assignments: Array<{ employeeId: number; operationPlanId: number }>,
    employees: Array<{ employeeId: number; orgRole?: string }>
  ): number {
    const MANAGEMENT_ROLES = ['GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER'];
    const MANAGEMENT_PENALTIES: Record<string, number> = {
      'GROUP_LEADER': 0.5,
      'TEAM_LEADER': 1.0,
      'DEPT_MANAGER': 1.5,
    };

    // 构建员工角色映射
    const employeeRoleMap = new Map<number, string>();
    employees.forEach(emp => {
      if (emp.orgRole) {
        employeeRoleMap.set(emp.employeeId, emp.orgRole.toUpperCase());
      }
    });

    let totalPenalty = 0;

    // 统计管理层员工参与的操作数
    assignments.forEach(assignment => {
      if (assignment.operationPlanId > 0) { // 只统计操作任务
        const role = employeeRoleMap.get(assignment.employeeId);
        if (role && MANAGEMENT_ROLES.includes(role)) {
          const penalty = MANAGEMENT_PENALTIES[role] || 1.0;
          totalPenalty += penalty;
        }
      }
    });

    return totalPenalty;
  }
}

export default NSGAIIOptimizer;
