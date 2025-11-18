import { ConstraintSolver, OperationAssignmentProblem, SolutionResult, OperationAssignmentSolution } from './constraintSolver';
import { ShiftService, ShiftInference, OperationTimeRange } from './shiftService';
import { StandardHoursService, EmployeeHoursStatistics } from './standardHoursService';
import { CalendarService } from './calendarService';
import dayjs from 'dayjs';

/**
 * 智能排班优化器
 * 基于约束规划的新一代排班算法
 */
export class SchedulingOptimizer {
  private constraintSolver: ConstraintSolver;
  private shiftService: ShiftService;
  private standardHoursService: StandardHoursService;
  private calendarService: CalendarService;

  constructor(
    constraintSolver: ConstraintSolver,
    shiftService: ShiftService,
    standardHoursService: StandardHoursService,
    calendarService: CalendarService
  ) {
    this.constraintSolver = constraintSolver;
    this.shiftService = shiftService;
    this.standardHoursService = standardHoursService;
    this.calendarService = calendarService;
  }

  /**
   * 执行完整的排班优化流程
   */
  async optimizeSchedule(request: OptimizationRequest): Promise<OptimizationResponse> {
    const startTime = Date.now();
    console.log(`[排班优化器] 开始优化排班，批次: ${request.batchIds.join(', ')}`);

    try {
      // 阶段1: 数据准备
      const context = await this.prepareContext(request);
      console.log(`[排班优化器] 数据准备完成，员工: ${context.employees.length}, 操作: ${context.operations.length}`);

      // 阶段2: 操作分配规划
      const assignmentResult = await this.solveOperationAssignment(context);
      if (!assignmentResult.success) {
        throw new Error(`操作分配失败: ${assignmentResult.error}`);
      }
      console.log(`[排班优化器] 操作分配完成，分配操作数: ${assignmentResult.solution!.assignments.length}`);

      // 阶段3: 班次推断与验证
      const shiftResult = await this.inferShifts(assignmentResult.solution!, context);
      console.log(`[排班优化器] 班次推断完成，推断班次数: ${shiftResult.shiftAssignments.length}`);

      // 阶段4: 工时计算与验证
      const hoursResult = await this.calculateAndValidateHours(shiftResult, context);
      console.log(`[排班优化器] 工时验证完成，合规员工: ${hoursResult.compliantEmployees}/${hoursResult.totalEmployees}`);

      // 阶段5: 结果整合
      const finalResult = this.buildFinalResult(
        assignmentResult.solution!,
        shiftResult,
        hoursResult,
        context
      );

      const duration = Date.now() - startTime;
      console.log(`[排班优化器] 优化完成，耗时: ${duration}ms`);

      return {
        success: true,
        result: finalResult,
        statistics: {
          duration,
          totalOperations: context.operations.length,
          assignedOperations: assignmentResult.solution!.assignments.length,
          totalEmployees: context.employees.length,
          compliantEmployees: hoursResult.compliantEmployees,
          constraintViolations: hoursResult.constraintViolations
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[排班优化器] 优化过程出错:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        statistics: {
          duration,
          totalOperations: 0,
          assignedOperations: 0,
          totalEmployees: 0,
          compliantEmployees: 0,
          constraintViolations: 1
        }
      };
    }
  }

  /**
   * 准备优化上下文
   */
  private async prepareContext(request: OptimizationRequest): Promise<OptimizationContext> {
    // 获取批次信息
    const batches = await this.loadBatchData(request.batchIds);

    // 获取员工信息
    const employees = await this.loadEmployeeData(batches);

    // 获取操作信息
    const operations = await this.loadOperationData(batches);

    // 计算时间范围
    const timeRange = this.calculateTimeRange(batches);

    // 获取标准工时
    const standardHours = await this.calculateStandardHours(timeRange);

    return {
      batches,
      employees,
      operations,
      timeRange,
      standardHours,
      monthlyTolerance: request.options?.monthlyTolerance ?? 16
    };
  }

  /**
   * 求解操作分配问题
   */
  private async solveOperationAssignment(context: OptimizationContext): Promise<SolutionResult> {
    // 构建CSP问题
    const problem: OperationAssignmentProblem = {
      operations: context.operations.map(op => ({
        id: op.id,
        name: op.name,
        requiredPeople: op.requiredPeople,
        requiredQualifications: op.requiredQualifications.map(q => q.id),
        timeSlots: [{
          date: dayjs(op.plannedStart).format('YYYY-MM-DD'),
          start: dayjs(op.plannedStart).format('HH:mm'),
          end: dayjs(op.plannedEnd).format('HH:mm'),
          duration: dayjs(op.plannedEnd).diff(dayjs(op.plannedStart), 'hour', true)
        }],
        duration: dayjs(op.plannedEnd).diff(dayjs(op.plannedStart), 'hour', true)
      })),
      employees: context.employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        qualifications: emp.qualifications
      })),
      timeSlots: [] // CSP求解器会根据操作生成时间段
    };

    // 求解CSP
    return this.constraintSolver.solveOperationAssignment(problem);
  }

  /**
   * 推断班次
   */
  private async inferShifts(
    assignmentSolution: OperationAssignmentSolution,
    context: OptimizationContext
  ): Promise<ShiftInferenceResult> {
    const shiftAssignments: EmployeeShiftAssignment[] = [];
    const shiftInferences: ShiftInference[] = [];

    // 按员工分组操作
    const employeeOperations = new Map<number, OperationTimeRange[]>();
    for (const assignment of assignmentSolution.assignments) {
      const operation = context.operations.find(op => op.id === assignment.operationId);
      if (!operation) continue;

      if (!employeeOperations.has(assignment.employeeId)) {
        employeeOperations.set(assignment.employeeId, []);
      }

      employeeOperations.get(assignment.employeeId)!.push({
        date: assignment.timeSlot.date,
        startTime: assignment.timeSlot.start,
        endTime: assignment.timeSlot.end,
        operationId: assignment.operationId
      });
    }

    // 为每个员工推断班次
    for (const [employeeId, operations] of employeeOperations) {
      // 按日期分组
      const operationsByDate = new Map<string, OperationTimeRange[]>();
      for (const op of operations) {
        if (!operationsByDate.has(op.date)) {
          operationsByDate.set(op.date, []);
        }
        operationsByDate.get(op.date)!.push(op);
      }

      // 为每一天推断班次
      for (const [date, dayOperations] of operationsByDate) {
        const inference = this.shiftService.inferShiftFromOperations(dayOperations);

        if (inference) {
          shiftAssignments.push({
            employeeId,
            date,
            shift: inference.shift,
            operations: dayOperations.map(op => op.operationId),
            scheduledHours: inference.shift.standardHours,
            shopHours: dayOperations.reduce((sum, op) => {
              const operation = context.operations.find(o => o.id === op.operationId);
              return sum + (operation ? dayjs(operation.plannedEnd).diff(dayjs(operation.plannedStart), 'hour', true) : 0);
            }, 0)
          });

          shiftInferences.push(inference);
        } else {
          console.warn(`[班次推断] 员工${employeeId}在${date}无法推断合适的班次`);
        }
      }
    }

    return {
      shiftAssignments,
      shiftInferences
    };
  }

  /**
   * 计算和验证工时
   */
  private async calculateAndValidateHours(
    shiftResult: ShiftInferenceResult,
    context: OptimizationContext
  ): Promise<HoursValidationResult> {
    const employeeHoursStats: EmployeeHoursStatistics[] = [];
    let compliantEmployees = 0;
    let constraintViolations = 0;

    // 计算每个员工的工时统计
    for (const employee of context.employees) {
      const employeeAssignments = shiftResult.shiftAssignments
        .filter(sa => sa.employeeId === employee.id)
        .map(sa => ({
          date: sa.date,
          scheduledHours: sa.scheduledHours,
          shopHours: sa.shopHours
        }));

      const stats = await this.standardHoursService.calculateEmployeeHoursStatistics(
        employee.id,
        employeeAssignments
      );

      employeeHoursStats.push(stats);

      // 检查合规性
      const monthlyCompliant = stats.monthlyHours.every(mh => mh.validation.isValid);
      const quarterlyCompliant = stats.quarterlyValidation.isValid;

      if (monthlyCompliant && quarterlyCompliant) {
        compliantEmployees++;
      } else {
        constraintViolations++;
      }
    }

    return {
      employeeHoursStats,
      compliantEmployees,
      totalEmployees: context.employees.length,
      constraintViolations
    };
  }

  /**
   * 构建最终结果
   */
  private buildFinalResult(
    assignmentSolution: OperationAssignmentSolution,
    shiftResult: ShiftInferenceResult,
    hoursResult: HoursValidationResult,
    context: OptimizationContext
  ): ScheduleResult {
    // 整合所有信息
    const scheduleAssignments: ScheduleAssignment[] = [];

    for (const shiftAssignment of shiftResult.shiftAssignments) {
      scheduleAssignments.push({
        employeeId: shiftAssignment.employeeId,
        employeeName: context.employees.find(e => e.id === shiftAssignment.employeeId)?.name || '',
        date: shiftAssignment.date,
        shiftId: shiftAssignment.shift.id,
        shiftName: shiftAssignment.shift.name,
        scheduledHours: shiftAssignment.scheduledHours,
        shopHours: shiftAssignment.shopHours,
        operations: shiftAssignment.operations.map(opId => {
          const operation = context.operations.find(o => o.id === opId);
          return operation ? {
            id: operation.id,
            name: operation.name,
            startTime: operation.plannedStart,
            endTime: operation.plannedEnd
          } : null;
        }).filter(Boolean)
      });
    }

    return {
      period: context.timeRange,
      assignments: scheduleAssignments,
      hoursStatistics: hoursResult.employeeHoursStats,
      coverage: {
        totalOperations: context.operations.length,
        assignedOperations: assignmentSolution.assignments.length,
        coverageRate: assignmentSolution.assignments.length / context.operations.length
      },
      compliance: {
        compliantEmployees: hoursResult.compliantEmployees,
        totalEmployees: hoursResult.totalEmployees,
        complianceRate: hoursResult.compliantEmployees / hoursResult.totalEmployees,
        constraintViolations: hoursResult.constraintViolations
      }
    };
  }

  // 数据加载方法（暂时使用模拟数据，后续对接数据库）
  private async loadBatchData(batchIds: number[]): Promise<BatchData[]> {
    // TODO: 从数据库加载批次数据
    return [
      {
        id: 38,
        code: 'PPQ2',
        startDate: '2025-10-29',
        endDate: '2025-11-11'
      }
    ];
  }

  private async loadEmployeeData(batches: BatchData[]): Promise<EmployeeData[]> {
    // TODO: 从数据库加载员工数据
    return [
      {
        id: 3,
        name: '郑峰屹',
        qualifications: [
          { id: 1, level: 3 },
          { id: 2, level: 2 }
        ]
      },
      {
        id: 36,
        name: '高嘉玮',
        qualifications: [
          { id: 1, level: 2 },
          { id: 3, level: 3 }
        ]
      }
      // ... 更多员工
    ];
  }

  private async loadOperationData(batches: BatchData[]): Promise<OperationData[]> {
    // TODO: 从数据库加载操作数据
    return [
      {
        id: 287,
        name: '细胞复苏',
        requiredPeople: 2,
        plannedStart: '2025-10-29 09:00:00',
        plannedEnd: '2025-10-29 10:00:00',
        requiredQualifications: [
          { id: 1, minLevel: 2 }
        ]
      }
      // ... 更多操作
    ];
  }

  private calculateTimeRange(batches: BatchData[]): TimeRange {
    const startDates = batches.map(b => b.startDate);
    const endDates = batches.map(b => b.endDate);

    return {
      startDate: startDates.reduce((min, curr) => curr < min ? curr : min),
      endDate: endDates.reduce((max, curr) => curr > max ? curr : max)
    };
  }

  private async calculateStandardHours(timeRange: TimeRange): Promise<StandardHours> {
    const quarterlyHours = await this.standardHoursService.calculateQuarterStandardHours(
      timeRange.startDate,
      timeRange.endDate
    );

    const monthlyHours: { [month: string]: number } = {};

    // 计算每个月的标准工时
    const start = dayjs(timeRange.startDate);
    const end = dayjs(timeRange.endDate);
    let current = start.startOf('month');

    while (current.isSameOrBefore(end)) {
      const monthStart = current.format('YYYY-MM-DD');
      const monthEnd = current.endOf('month').format('YYYY-MM-DD');

      monthlyHours[current.format('YYYY-MM')] = await this.standardHoursService.calculateMonthStandardHours(
        monthStart,
        monthEnd
      );

      current = current.add(1, 'month');
    }

    return {
      quarterly: quarterlyHours,
      monthly: monthlyHours
    };
  }
}

/**
 * 优化请求
 */
export interface OptimizationRequest {
  batchIds: number[];
  options?: {
    monthlyTolerance?: number;
    maxSolutions?: number;
    timeLimit?: number;
  };
}

/**
 * 优化上下文
 */
interface OptimizationContext {
  batches: BatchData[];
  employees: EmployeeData[];
  operations: OperationData[];
  timeRange: TimeRange;
  standardHours: StandardHours;
  monthlyTolerance: number;
}

/**
 * 数据结构定义
 */
interface BatchData {
  id: number;
  code: string;
  startDate: string;
  endDate: string;
}

interface EmployeeData {
  id: number;
  name: string;
  qualifications: Array<{
    id: number;
    level: number;
  }>;
}

interface OperationData {
  id: number;
  name: string;
  requiredPeople: number;
  plannedStart: string;
  plannedEnd: string;
  requiredQualifications: Array<{
    id: number;
    minLevel: number;
  }>;
}

interface TimeRange {
  startDate: string;
  endDate: string;
}

interface StandardHours {
  quarterly: number;
  monthly: { [month: string]: number };
}

/**
 * 班次推断结果
 */
interface ShiftInferenceResult {
  shiftAssignments: EmployeeShiftAssignment[];
  shiftInferences: ShiftInference[];
}

/**
 * 员工班次分配
 */
interface EmployeeShiftAssignment {
  employeeId: number;
  date: string;
  shift: any; // ShiftDefinition
  operations: number[];
  scheduledHours: number;
  shopHours: number;
}

/**
 * 工时验证结果
 */
interface HoursValidationResult {
  employeeHoursStats: EmployeeHoursStatistics[];
  compliantEmployees: number;
  totalEmployees: number;
  constraintViolations: number;
}

/**
 * 排班结果
 */
export interface ScheduleResult {
  period: TimeRange;
  assignments: ScheduleAssignment[];
  hoursStatistics: EmployeeHoursStatistics[];
  coverage: {
    totalOperations: number;
    assignedOperations: number;
    coverageRate: number;
  };
  compliance: {
    compliantEmployees: number;
    totalEmployees: number;
    complianceRate: number;
    constraintViolations: number;
  };
}

/**
 * 排班分配
 */
export interface ScheduleAssignment {
  employeeId: number;
  employeeName: string;
  date: string;
  shiftId: string;
  shiftName: string;
  scheduledHours: number;
  shopHours: number;
  operations: Array<{
    id: number;
    name: string;
    startTime: string;
    endTime: string;
  } | null>;
}

/**
 * 优化响应
 */
export interface OptimizationResponse {
  success: boolean;
  result?: ScheduleResult;
  error?: string;
  statistics: {
    duration: number;
    totalOperations: number;
    assignedOperations: number;
    totalEmployees: number;
    compliantEmployees: number;
    constraintViolations: number;
  };
}
