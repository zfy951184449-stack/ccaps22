import { ShiftService, ShiftInference } from './shiftService';
import { StandardHoursService } from './standardHoursService';

/**
 * 约束规划求解器
 * 基于回溯搜索实现操作分配的CSP求解
 */
export class ConstraintSolver {
  private shiftService: ShiftService;
  private standardHoursService: StandardHoursService;

  // 求解参数
  private readonly MAX_SOLUTIONS = 10; // 最多寻找10个可行解
  private readonly MAX_BACKTRACK_DEPTH = 1000; // 最大回溯深度
  private readonly TIME_LIMIT_MS = 30000; // 30秒超时

  constructor(shiftService: ShiftService, standardHoursService: StandardHoursService) {
    this.shiftService = shiftService;
    this.standardHoursService = standardHoursService;
  }

  /**
   * 求解操作分配CSP
   */
  async solveOperationAssignment(problem: OperationAssignmentProblem): Promise<SolutionResult> {
    const startTime = Date.now();

    console.log(`[CSP求解器] 开始求解操作分配问题`);
    console.log(`[CSP求解器] 员工数: ${problem.employees.length}, 操作数: ${problem.operations.length}`);

    // 初始化求解状态
    const state: SolverState = {
      problem,
      assignments: new Map(), // operationId -> [employeeId, timeSlot]
      employeeSchedules: new Map(), // employeeId -> schedule
      unassignedOperations: new Set(problem.operations.map(op => op.id)),
      startTime,
      solutions: [],
      backtrackCount: 0
    };

    try {
      // 执行回溯搜索
      const success = await this.backtrackSearch(state, 0);

      const duration = Date.now() - startTime;
      console.log(`[CSP求解器] 求解完成，耗时: ${duration}ms，找到解数: ${state.solutions.length}`);

      if (state.solutions.length > 0) {
        // 返回最好的解
        const bestSolution = this.selectBestSolution(state.solutions);
        return {
          success: true,
          solution: bestSolution,
          statistics: {
            duration,
            solutionsFound: state.solutions.length,
            backtracks: state.backtrackCount,
            constraintChecks: 0 // TODO: 添加约束检查计数
          }
        };
      } else {
        return {
          success: false,
          error: '未找到满足所有约束的可行解',
          statistics: {
            duration,
            solutionsFound: 0,
            backtracks: state.backtrackCount,
            constraintChecks: 0
          }
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[CSP求解器] 求解过程中发生错误:', error);

      return {
        success: false,
        error: `求解失败: ${error instanceof Error ? error.message : String(error)}`,
        statistics: {
          duration,
          solutionsFound: 0,
          backtracks: state.backtrackCount,
          constraintChecks: 0
        }
      };
    }
  }

  /**
   * 回溯搜索算法
   */
  private async backtrackSearch(state: SolverState, depth: number): Promise<boolean> {
    // 超时检查
    if (Date.now() - state.startTime > this.TIME_LIMIT_MS) {
      console.log('[CSP求解器] 求解超时');
      return false;
    }

    // 深度限制检查
    if (depth > this.MAX_BACKTRACK_DEPTH) {
      console.log('[CSP求解器] 达到最大回溯深度');
      return false;
    }

    // 如果所有操作都已分配，验证最终约束
    if (state.unassignedOperations.size === 0) {
      const isValid = await this.validateFinalSolution(state);
      if (isValid) {
        // 找到一个有效解
        const solution = this.buildSolution(state);
        state.solutions.push(solution);

        console.log(`[CSP求解器] 找到第${state.solutions.length}个可行解`);

        // 如果不需要更多解，返回成功
        if (state.solutions.length >= this.MAX_SOLUTIONS) {
          return true;
        }
      }
      return false; // 继续搜索其他解
    }

    // 选择下一个要分配的操作（启发式选择）
    const nextOperation = this.selectNextOperation(state);
    if (!nextOperation) {
      return false;
    }

    // 为该操作尝试所有可能的分配
    const candidates = this.findCandidateAssignments(state, nextOperation);

    for (const candidate of candidates) {
      // 尝试分配
      if (this.tryAssign(state, nextOperation, candidate)) {
        state.backtrackCount++;

        // 递归搜索
        const found = await this.backtrackSearch(state, depth + 1);
        if (found) {
          return true; // 找到解，向上传播
        }

        // 回溯：撤销分配
        this.undoAssign(state, nextOperation, candidate);
      }

      // 检查是否超时
      if (Date.now() - state.startTime > this.TIME_LIMIT_MS) {
        return false;
      }
    }

    // 没有找到可行的分配
    return false;
  }

  /**
   * 选择下一个要分配的操作（MRV启发式）
   */
  private selectNextOperation(state: SolverState): Operation | null {
    // 选择剩余候选人最少的操作（最小剩余值启发式）
    let bestOperation: Operation | null = null;
    let minCandidates = Infinity;

    for (const opId of state.unassignedOperations) {
      const operation = state.problem.operations.find(op => op.id === opId);
      if (!operation) continue;

      const candidates = this.findCandidateAssignments(state, operation);
      if (candidates.length < minCandidates) {
        minCandidates = candidates.length;
        bestOperation = operation;
      }

    }

    return bestOperation;
  }

  /**
   * 查找操作的候选分配
   */
  private findCandidateAssignments(state: SolverState, operation: Operation): CandidateAssignment[] {
    const candidates: CandidateAssignment[] = [];

    // 找到满足资质要求且有空闲时间的员工-时间组合
    for (const employee of state.problem.employees) {
      // 检查资质
      if (!this.checkQualification(employee, operation)) {
        continue;
      }

      // 检查时间可用性
      for (const timeSlot of operation.timeSlots) {
        if (this.checkTimeAvailability(state, employee, timeSlot)) {
          candidates.push({
            employeeId: employee.id,
            timeSlot: timeSlot,
            score: this.calculateAssignmentScore(employee, operation, timeSlot)
          });
        }
      }
    }

    // 按评分排序（启发式）
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * 检查员工是否满足操作资质要求
   */
  private checkQualification(employee: Employee, operation: Operation): boolean {
    // 检查员工是否具备所需资质
    const requiredQualifications = new Set(operation.requiredQualifications);
    const employeeQualifications = new Set(employee.qualifications.map(q => q.id));

    return requiredQualifications.size === 0 ||
           Array.from(requiredQualifications).every(q => employeeQualifications.has(q));
  }

  /**
   * 检查时间是否可用
   */
  private checkTimeAvailability(state: SolverState, employee: Employee, timeSlot: TimeSlot): boolean {
    const employeeSchedule = state.employeeSchedules.get(employee.id);
    if (!employeeSchedule) {
      return true; // 还没有排班，完全可用
    }

    // 检查时间冲突
    for (const assignment of employeeSchedule.assignments) {
      if (this.timeSlotsOverlap(assignment.timeSlot, timeSlot)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查两个时间段是否重叠
   */
  private timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
    return !(slot1.end <= slot2.start || slot2.end <= slot1.start);
  }

  /**
   * 计算分配评分（用于启发式搜索）
   */
  private calculateAssignmentScore(employee: Employee, operation: Operation, timeSlot: TimeSlot): number {
    let score = 0;

    // 资质匹配度
    const qualificationMatch = operation.requiredQualifications.length === 0 ? 1 :
      operation.requiredQualifications.filter(q =>
        employee.qualifications.some(eq => eq.id === q)
      ).length / operation.requiredQualifications.length;
    score += qualificationMatch * 50;

    // 时间偏好（假设有时间偏好数据）
    // TODO: 根据员工的时间偏好调整评分

    return score;
  }

  /**
   * 尝试分配操作
   */
  private tryAssign(state: SolverState, operation: Operation, candidate: CandidateAssignment): boolean {
    // 检查所有约束
    if (!this.checkAllConstraints(state, operation, candidate)) {
      return false;
    }

    // 执行分配
    state.assignments.set(operation.id, {
      employeeId: candidate.employeeId,
      timeSlot: candidate.timeSlot
    });

    // 更新员工排班
    if (!state.employeeSchedules.has(candidate.employeeId)) {
      state.employeeSchedules.set(candidate.employeeId, {
        employeeId: candidate.employeeId,
        assignments: []
      });
    }

    const employeeSchedule = state.employeeSchedules.get(candidate.employeeId)!;
    employeeSchedule.assignments.push({
      operationId: operation.id,
      timeSlot: candidate.timeSlot
    });

    // 从未分配集合中移除
    state.unassignedOperations.delete(operation.id);

    return true;
  }

  /**
   * 撤销分配
   */
  private undoAssign(state: SolverState, operation: Operation, candidate: CandidateAssignment): void {
    state.assignments.delete(operation.id);

    const employeeSchedule = state.employeeSchedules.get(candidate.employeeId);
    if (employeeSchedule) {
      employeeSchedule.assignments = employeeSchedule.assignments.filter(
        a => a.operationId !== operation.id
      );
    }

    state.unassignedOperations.add(operation.id);
  }

  /**
   * 检查所有约束
   */
  private checkAllConstraints(state: SolverState, operation: Operation, candidate: CandidateAssignment): boolean {
    // 1. 资质约束（已在findCandidateAssignments中检查）
    if (!this.checkQualification(
      state.problem.employees.find(e => e.id === candidate.employeeId)!,
      operation
    )) {
      return false;
    }

    // 2. 时间可用性约束（已在findCandidateAssignments中检查）
    if (!this.checkTimeAvailability(state,
      state.problem.employees.find(e => e.id === candidate.employeeId)!,
      candidate.timeSlot
    )) {
      return false;
    }

    // 3. 资源约束（操作所需人数）
    // TODO: 检查该时间段该操作的分配人数是否达到上限

    return true;
  }

  /**
   * 验证最终解的完整性
   */
  private async validateFinalSolution(state: SolverState): Promise<boolean> {
    try {
      // 1. 检查所有操作是否已分配
      if (state.unassignedOperations.size > 0) {
        return false;
      }

      // 2. 检查工时约束（后续会在班次推断阶段验证）
      // 这里只做基本检查

      // 3. 检查连续工作约束（简化检查）
      for (const [employeeId, schedule] of state.employeeSchedules) {
        if (!this.checkWorkContinuity(schedule)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[CSP求解器] 最终解验证失败:', error);
      return false;
    }
  }

  /**
   * 检查工作连续性约束
   */
  private checkWorkContinuity(schedule: EmployeeSchedule): boolean {
    // 简化检查：连续工作不超过6天
    // TODO: 实现完整的连续工作和夜班休息检查

    const workDays = new Set(
      schedule.assignments.map(a =>
        a.timeSlot.date // 假设timeSlot有date字段
      )
    );

    // 简单的连续检查
    const sortedDays = Array.from(workDays).sort();
    let consecutiveDays = 1;
    let maxConsecutive = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      // TODO: 计算实际的连续工作天数
      // 这里需要考虑班次类型和休息规则
    }

    return maxConsecutive <= 6;
  }

  /**
   * 构建解决方案
   */
  private buildSolution(state: SolverState): OperationAssignmentSolution {
    const assignments: OperationAssignment[] = [];

    for (const [operationId, assignment] of state.assignments) {
      assignments.push({
        operationId,
        employeeId: assignment.employeeId,
        timeSlot: assignment.timeSlot
      });
    }

    return {
      assignments,
      metadata: {
        totalOperations: state.problem.operations.length,
        totalEmployees: state.problem.employees.length,
        assignedOperations: assignments.length,
        unassignedOperations: state.unassignedOperations.size
      }
    };
  }

  /**
   * 选择最好的解决方案
   */
  private selectBestSolution(solutions: OperationAssignmentSolution[]): OperationAssignmentSolution {
    // 简单的选择策略：分配操作数最多的解
    return solutions.reduce((best, current) => {
      const bestAssigned = best.metadata.assignedOperations;
      const currentAssigned = current.metadata.assignedOperations;
      return currentAssigned > bestAssigned ? current : best;
    });
  }
}

/**
 * 操作分配问题定义
 */
export interface OperationAssignmentProblem {
  operations: Operation[];
  employees: Employee[];
  timeSlots: TimeSlot[];
}

/**
 * 操作定义
 */
export interface Operation {
  id: number;
  name: string;
  requiredPeople: number;
  requiredQualifications: number[];
  timeSlots: TimeSlot[]; // 可选时间段
  duration: number; // 持续时间（小时）
}

/**
 * 员工定义
 */
export interface Employee {
  id: number;
  name: string;
  qualifications: Array<{
    id: number;
    level: number;
  }>;
}

/**
 * 时间段定义
 */
export interface TimeSlot {
  date: string;
  start: string; // HH:mm
  end: string;   // HH:mm
  duration: number; // 小时数
}

/**
 * 候选分配
 */
interface CandidateAssignment {
  employeeId: number;
  timeSlot: TimeSlot;
  score: number; // 启发式评分
}

/**
 * 求解器状态
 */
interface SolverState {
  problem: OperationAssignmentProblem;
  assignments: Map<number, { employeeId: number; timeSlot: TimeSlot }>; // operationId -> assignment
  employeeSchedules: Map<number, EmployeeSchedule>; // employeeId -> schedule
  unassignedOperations: Set<number>;
  startTime: number;
  solutions: OperationAssignmentSolution[];
  backtrackCount: number;
}

/**
 * 员工排班
 */
interface EmployeeSchedule {
  employeeId: number;
  assignments: Array<{
    operationId: number;
    timeSlot: TimeSlot;
  }>;
}

/**
 * 操作分配解决方案
 */
export interface OperationAssignmentSolution {
  assignments: OperationAssignment[];
  metadata: {
    totalOperations: number;
    totalEmployees: number;
    assignedOperations: number;
    unassignedOperations: number;
  };
}

/**
 * 操作分配
 */
export interface OperationAssignment {
  operationId: number;
  employeeId: number;
  timeSlot: TimeSlot;
}

/**
 * 求解结果
 */
export interface SolutionResult {
  success: boolean;
  solution?: OperationAssignmentSolution;
  error?: string;
  statistics: {
    duration: number;
    solutionsFound: number;
    backtracks: number;
    constraintChecks: number;
  };
}
}