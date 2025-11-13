import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "../config/database";
import {
  AutoPlanRequest,
  AutoPlanResult,
  SchedulingPeriod,
  OperationPlanSummary,
  type BatchWindow,
  type CoverageSummary,
} from "./schedulingService";
import WorkloadPredictor, {
  type WorkloadPrediction,
  type WorkloadPredictionRequest,
} from "./mlModels/workloadPredictor";
import EmployeeSuitabilityPredictor, {
  type EmployeeSuitabilityScore,
  type SuitabilityPredictionRequest,
} from "./mlModels/employeeSuitabilityPredictor";
import ScheduleQualityEvaluator, {
  type ScheduleQualityMetrics,
  type ScheduleQualityEvaluationRequest,
} from "./mlModels/scheduleQualityEvaluator";
import {
  NSGAIIOptimizer,
  SchedulingFitnessCalculator,
  type ScheduleSolution,
  type FitnessScore,
  type OptimizationConfig,
} from "./multiObjectiveOptimizer";
import { ConstraintSolver, type ScheduleAssignment, type SchedulingContext as ConstraintSchedulingContext } from "./constraintSolver";
import {
  WorkloadBalancer,
  type ScheduleAdjustment,
  type BalanceResult,
} from "./workloadBalancer";
import {
  ComprehensiveWorkTimeAdapter,
  type ComprehensivePeriod,
  type ScheduleRecord,
} from "./comprehensiveWorkTimeAdapter";
import SchedulingService from "./schedulingService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * ML排班上下文
 */
/**
 * 每日操作负载信息
 */
interface DailyOperationLoad {
  date: string;
  operationCount: number;        // 操作数量
  totalRequiredPeople: number;  // 总需求人数
  peakHourLoad: number;          // 高峰时段人员需求
  operations: OperationPlanSummary[]; // 该日的操作列表
}

/**
 * Backup需求信息
 */
interface BackupRequirement {
  date: string;
  requiredBackupPeople: number;  // 需要的backup人数
  reason: string;
}

interface MLSchedulingContext {
  // 基础信息
  period: SchedulingPeriod;
  batches: BatchWindow[];
  operations: OperationPlanSummary[];
  employees: Array<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    department?: string;
    qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
    maxDailyHours?: number;
    maxConsecutiveDays?: number;
    workTimeSystemType?: string;
    comprehensivePeriod?: ComprehensivePeriod;
  }>;
  
  // ML模型
  workloadPredictor: WorkloadPredictor;
  suitabilityPredictor: EmployeeSuitabilityPredictor;
  qualityEvaluator: ScheduleQualityEvaluator;
  optimizer: NSGAIIOptimizer;
  constraintSolver: ConstraintSolver;
  workloadBalancer: WorkloadBalancer;
  comprehensiveAdapter: ComprehensiveWorkTimeAdapter;
  
  // 预测结果
  workloadPrediction?: WorkloadPrediction[];
  
  // 优化结果
  paretoFront?: ScheduleSolution[];
  selectedSolution?: ScheduleSolution;
  
  // 标准工时和高峰日信息
  quarterStandardHours?: number;
  dailyOperationLoads?: Map<string, DailyOperationLoad>;
  backupRequirements?: Map<string, BackupRequirement>;
  
  // 日志和警告
  logs: string[];
  warnings: string[];
  
  // 运行ID
  runId?: number;
  runKey?: string;

  // 综合工时配置
  monthHourTolerance: number;
}

/**
 * ML智能排班服务
 * 
 * 整合所有ML模型和优化算法，提供完整的智能排班流程
 */
export class MLSchedulingService {
  /**
   * 智能排班v3主入口
   * 实现"预测-优化-验证-后处理"的完整流水线
   */
  async autoPlanV3(request: AutoPlanRequest): Promise<AutoPlanResult> {
    const context: MLSchedulingContext = {
      period: { startDate: "", endDate: "", quarter: "" },
      batches: [],
      operations: [],
      employees: [],
      workloadPredictor: new WorkloadPredictor(),
      suitabilityPredictor: new EmployeeSuitabilityPredictor(),
      qualityEvaluator: new ScheduleQualityEvaluator(),
      optimizer: new NSGAIIOptimizer(
        {
          objectives: ["cost", "satisfaction", "balance", "skillMatch", "compliance"],
          populationSize: 20, // 降低种群大小以提高性能
          generations: 30, // 降低迭代次数以提高性能
          mutationRate: 0.1,
          crossoverRate: 0.8,
          tournamentSize: 2,
        },
        // 使用真实的适应度计算器
        new SchedulingFitnessCalculator()
      ),
      constraintSolver: new ConstraintSolver(),
      workloadBalancer: new WorkloadBalancer({
        comprehensiveRules: {
          monthToleranceHours: Math.max(
            0,
            request.options?.monthHourTolerance ?? 8
          ),
        },
      }),
      comprehensiveAdapter: new ComprehensiveWorkTimeAdapter(),
      logs: [],
      warnings: [],
      monthHourTolerance: Math.max(
        0,
        request.options?.monthHourTolerance ?? 8
      ),
    };

    try {
      // === 阶段1: 上下文准备与数据加载 ===
      context.logs.push("阶段1: 上下文准备与数据加载");
      await this.prepareMLContext(request, context);

      // === 阶段2: 工作负载预测 ===
      context.logs.push("阶段2: 工作负载预测");
      await this.predictWorkloadForPeriod(context);

      // === 阶段3: 操作排序与候选筛选 ===
      context.logs.push("阶段3: 操作排序与候选筛选");
      const sortedOperations = this.sortOperationsByPriority(context);
      const candidateMap = await this.findMLCandidates(context, sortedOperations);

      // === 阶段4: 多目标优化排班 ===
      context.logs.push("阶段4: 多目标优化排班");
      const optimizationResult = await this.optimizeSchedule(
        context,
        sortedOperations,
        candidateMap
      );
      context.paretoFront = optimizationResult;

      // === 阶段5: 选择最优方案 ===
      context.logs.push("阶段5: 选择最优方案");
      if (!context.paretoFront || context.paretoFront.length === 0) {
        throw new Error("未找到有效的排班方案");
      }
      context.selectedSolution = this.selectBestSolution(context.paretoFront);

      // === 阶段6: 约束验证与修复 ===
      context.logs.push("阶段6: 约束验证与修复");
      const validatedSolution = await this.validateAndFixSchedule(
        context.selectedSolution!,
        context
      );
      context.selectedSolution = validatedSolution;

      // === 阶段7: 工时均衡优化 ===
      context.logs.push("阶段7: 工时均衡优化");
      const balancedSolution = await this.balanceMultiObjective(
        context.selectedSolution!,
        context
      );
      context.selectedSolution = balancedSolution;

      // === 阶段8: 综合工时制适配 ===
      context.logs.push("阶段8: 综合工时制适配");
      const adaptedSolution = await this.adaptComprehensiveWorkTime(
        context.selectedSolution!,
        context
      );
      context.selectedSolution = adaptedSolution;

      // === 阶段9: 结果持久化 ===
      context.logs.push("阶段9: 结果持久化");
      await this.persistSchedule(context.selectedSolution!, context);

      // === 阶段10: 质量评估 ===
      context.logs.push("阶段10: 质量评估");
      const qualityMetrics = await this.evaluateScheduleQuality(
        context.selectedSolution!,
        context
      );

      // === 构建返回结果 ===
      return await this.buildResult(context, qualityMetrics, request);
    } catch (error) {
      context.logs.push(`错误: ${error instanceof Error ? error.message : String(error)}`);
      context.warnings.push(`排班过程出现错误: ${error instanceof Error ? error.message : String(error)}`);
      
      // 返回错误结果
      return {
        message: `智能排班失败: ${error instanceof Error ? error.message : String(error)}`,
        period: context.period,
        batches: context.batches,
        warnings: context.warnings,
        run: {
          id: context.runId ?? 0,
          key: context.runKey ?? "",
          status: "FAILED",
          resultId: 0,
        },
        summary: {
          employeesTouched: 0,
          operationsCovered: 0,
          overtimeEntries: 0,
          baseRosterRows: 0,
          operationsAssigned: 0,
        },
        diagnostics: {},
        logs: context.logs,
        coverage: {
          totalOperations: context.operations.length,
          fullyCovered: 0,
          coverageRate: 0,
          gaps: [],
          gapTotals: {
            headcount: 0,
            qualification: 0,
            other: 0,
          },
        },
      };
    }
  }

  /**
   * 阶段1: 上下文准备与数据加载
   */
  private async prepareMLContext(
    request: AutoPlanRequest,
    context: MLSchedulingContext
  ): Promise<void> {
    // 复用现有的 SchedulingService.prepareContext 逻辑
    // 由于prepareContext是私有的，我们需要手动加载数据
    
    const normalizedBatchIds = request.batchIds
      .map(Number)
      .filter((id) => !Number.isNaN(id));

    if (!normalizedBatchIds.length) {
      throw new Error("无法找到指定批次，请确认批次已激活并存在");
    }

    // 1. 加载批次信息
    const placeholders = normalizedBatchIds.map(() => "?").join(",");
    const batchQuery = `
      SELECT pbp.id AS batchPlanId,
             pbp.batch_code AS batchCode,
             MIN(bop.planned_start_datetime) AS batchStart,
             MAX(bop.planned_end_datetime) AS batchEnd,
             COUNT(bop.id) AS totalOperations
      FROM production_batch_plans pbp
      LEFT JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
      WHERE pbp.id IN (${placeholders})
      GROUP BY pbp.id, pbp.batch_code;
    `;
    const [batchRows] = await pool.execute<RowDataPacket[]>(batchQuery, normalizedBatchIds);
    
    const batches = batchRows.map((row) => ({
      batchPlanId: Number(row.batchPlanId),
      batchCode: String(row.batchCode),
      start: row.batchStart ? dayjs(row.batchStart).format("YYYY-MM-DD HH:mm:ss") : null,
      end: row.batchEnd ? dayjs(row.batchEnd).format("YYYY-MM-DD HH:mm:ss") : null,
      totalOperations: Number(row.totalOperations || 0),
    }));
    
    if (!batches.length) {
      throw new Error("无法找到指定批次，请确认批次已激活并存在");
    }

    // 2. 解析周期
    const explicitStart = request.startDate ? dayjs(request.startDate) : null;
    const explicitEnd = request.endDate ? dayjs(request.endDate) : null;
    const batchStart = batches
      .map((b) => (b.start ? dayjs(b.start) : null))
      .filter((d): d is dayjs.Dayjs => d !== null)
      .sort((a, b) => a.valueOf() - b.valueOf())[0];
    const batchEnd = batches
      .map((b) => (b.end ? dayjs(b.end) : null))
      .filter((d): d is dayjs.Dayjs => d !== null)
      .sort((a, b) => b.valueOf() - a.valueOf())[0];
    const start = explicitStart || (batchStart ? batchStart.startOf("quarter") : dayjs().startOf("quarter"));
    const end = explicitEnd || (batchEnd ? batchEnd.endOf("quarter") : dayjs().endOf("quarter"));
    const normalizedStart = start.format("YYYY-MM-DD");
    const normalizedEnd = end.format("YYYY-MM-DD");
    const startQuarter = start.quarter();
    const endQuarter = end.quarter();
    const quarterLabel = startQuarter === endQuarter
      ? `${start.year()}Q${startQuarter}`
      : `${start.year()}Q${startQuarter}~${end.year()}Q${endQuarter}`;
    
    const period: SchedulingPeriod = {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      quarter: quarterLabel,
    };
    context.period = period;
    context.batches = batches;

    // 3. 加载操作计划
    const operationPlaceholders = normalizedBatchIds.map(() => "?").join(",");
    const operationQuery = `
      SELECT
        bop.id AS operationPlanId,
        bop.operation_id AS operationId,
        pbp.id AS batchPlanId,
        pbp.batch_code AS batchCode,
        bop.template_schedule_id AS templateScheduleId,
        ps.stage_name AS stageName,
        o.operation_name AS operationName,
        bop.planned_start_datetime AS plannedStart,
        bop.planned_end_datetime AS plannedEnd,
        bop.required_people AS requiredPeople,
        bop.is_locked AS isLocked
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      JOIN operations o ON bop.operation_id = o.id
      WHERE pbp.id IN (${operationPlaceholders})
        AND bop.planned_start_datetime <= ?
        AND bop.planned_end_datetime >= ?
      ORDER BY bop.planned_start_datetime;
    `;
    const operationParams = [
      ...normalizedBatchIds,
      `${normalizedEnd} 23:59:59`,
      `${normalizedStart} 00:00:00`,
    ];
    const [operationRows] = await pool.execute<RowDataPacket[]>(operationQuery, operationParams);
    
    const operations = operationRows.map((row) => {
      const plannedStart = row.plannedStart as string;
      const plannedEnd = row.plannedEnd as string;
      return {
        operationPlanId: Number(row.operationPlanId),
        operationId: Number(row.operationId),
        batchPlanId: Number(row.batchPlanId),
        batchCode: String(row.batchCode),
        templateScheduleId: Number(row.templateScheduleId),
        stageName: String(row.stageName),
        operationName: String(row.operationName),
        plannedStart: dayjs(plannedStart).format("YYYY-MM-DD HH:mm:ss"),
        plannedEnd: dayjs(plannedEnd).format("YYYY-MM-DD HH:mm:ss"),
        requiredPeople: Number(row.requiredPeople || 0),
        isLocked: Boolean(row.isLocked),
      };
    });
    context.operations = operations;

    // 4. 初始化运行记录（使用schedulingRunService）
    const { createDraftRun } = await import("./schedulingRunService");
    const runContext = await createDraftRun({
      triggerType: "AUTO_PLAN",
      periodStart: normalizedStart,
      periodEnd: normalizedEnd,
      batches: batches.map((b) => ({
        batchPlanId: b.batchPlanId,
        batchCode: b.batchCode,
        windowStart: b.start,
        windowEnd: b.end,
        totalOperations: b.totalOperations,
      })),
      options: request.options,
      warnings: [],
      assignmentsPayload: {}, // 初始为空，后续会更新
    });
    context.runId = runContext.runId;
    context.runKey = runContext.runKey;

    // 5. 加载员工档案
    const employeeQuery = `
      SELECT id AS employeeId,
             employee_code AS employeeCode,
             employee_name AS employeeName,
             department,
             position AS role,
             org_role AS orgRole
      FROM employees
      WHERE employment_status = 'ACTIVE'
      ORDER BY employee_code;
    `;
    const [employeeRows] = await pool.execute<RowDataPacket[]>(employeeQuery);
    
    // 6. 加载员工资质
    const employeeIds = employeeRows.map((row) => Number(row.employeeId));
    const qualificationMap = new Map<number, Array<{ qualificationId: number; qualificationLevel: number }>>();
    
    if (employeeIds.length > 0) {
      const placeholders = employeeIds.map(() => "?").join(",");
      const qualificationQuery = `
        SELECT eq.employee_id AS employeeId,
               eq.qualification_id AS qualificationId,
               eq.qualification_level AS qualificationLevel
        FROM employee_qualifications eq
        WHERE eq.employee_id IN (${placeholders})
      `;
      const [qualRows] = await pool.execute<RowDataPacket[]>(qualificationQuery, employeeIds);
      
      qualRows.forEach((row) => {
        const empId = Number(row.employeeId);
        if (!qualificationMap.has(empId)) {
          qualificationMap.set(empId, []);
        }
        qualificationMap.get(empId)!.push({
          qualificationId: Number(row.qualificationId),
          qualificationLevel: Number(row.qualificationLevel || 0),
        });
      });
    }

    // 7. 转换员工数据格式
    context.employees = employeeRows.map((row) => ({
      employeeId: Number(row.employeeId),
      employeeCode: String(row.employeeCode),
      employeeName: String(row.employeeName),
      department: row.department ? String(row.department) : undefined,
      qualifications: qualificationMap.get(Number(row.employeeId)) || [],
      maxDailyHours: 11, // 默认值，可以从employee_shift_limits表加载
      maxConsecutiveDays: 6, // 默认值
    }));

    // 8. 加载员工工时制类型和限制
    // 算法层强制：所有员工均采用综合工时制
    // 规则：
    // - 季度：必须满足最低要求（500小时），最高不超过标准工时+40小时（540小时）
    // - 月度：可以有10%的上下幅度（166.64小时 ± 10%，即约150-183小时）
    const DEFAULT_COMPREHENSIVE_PERIOD: ComprehensivePeriod = "QUARTER"; // 使用季度周期（会同时检查季度和月度约束）
    
    for (const employee of context.employees) {
      // 强制设置所有员工为综合工时制（算法层强制，不依赖数据库配置）
      employee.workTimeSystemType = "COMPREHENSIVE";
      employee.comprehensivePeriod = DEFAULT_COMPREHENSIVE_PERIOD;
      
      // 尝试加载员工限制（日工时上限、连续工作天数等）
      try {
        const [limitRows] = await pool.execute<RowDataPacket[]>(
          `SELECT max_daily_hours, max_consecutive_days
           FROM employee_shift_limits
           WHERE employee_id = ?
             AND effective_from <= ?
             AND (effective_to IS NULL OR effective_to >= ?)
           ORDER BY effective_from DESC
           LIMIT 1`,
          [employee.employeeId, context.period.startDate, context.period.startDate]
        );

        if (limitRows.length > 0) {
          employee.maxDailyHours = limitRows[0].max_daily_hours 
            ? Number(limitRows[0].max_daily_hours) 
            : 11;
          employee.maxConsecutiveDays = limitRows[0].max_consecutive_days 
            ? Number(limitRows[0].max_consecutive_days) 
            : 6;
        }
      } catch (error) {
        // 如果表不存在或查询失败，使用默认值
        context.warnings.push(`无法加载员工${employee.employeeId}的限制配置，使用默认值`);
      }
    }
    
    context.logs.push(`已加载 ${context.employees.length} 名员工，${context.operations.length} 个操作`);

    // 9. 计算季度标准工时（基于工作日，不依赖废弃的quarterly_standard_hours表）
    const startDate = dayjs(context.period.startDate);
    const quarterStart = startDate.startOf("quarter");
    const quarterEnd = startDate.endOf("quarter");
    
    const workingDays = await context.comprehensiveAdapter.calculateWorkingDays(
      quarterStart.format("YYYY-MM-DD"),
      quarterEnd.format("YYYY-MM-DD")
    );
    
    context.quarterStandardHours = workingDays * 8; // 标准日工时8小时
    const monthTolerance = context.monthHourTolerance;

    context.logs.push(
      `已计算季度标准工时: ${context.quarterStandardHours.toFixed(2)}小时（工作日: ${workingDays}天）`
    );
    context.logs.push(
      `算法层强制：所有 ${context.employees.length} 名员工均采用综合工时制（季度约束：≥${context.quarterStandardHours.toFixed(
        0
      )}小时，月度约束：±${monthTolerance.toFixed(0)}小时）`
    );

    // 10. 计算每日操作负载（用于识别高峰日）
    const dailyOperationLoads = new Map<string, DailyOperationLoad>();
    const operationsByDate = new Map<string, OperationPlanSummary[]>();

    context.operations.forEach((op) => {
      const dateStr = dayjs(op.plannedStart).format("YYYY-MM-DD");
      if (!operationsByDate.has(dateStr)) {
        operationsByDate.set(dateStr, []);
      }
      operationsByDate.get(dateStr)!.push(op);
    });

    // 计算每日负载
    operationsByDate.forEach((ops, dateStr) => {
      const totalRequiredPeople = ops.reduce((sum, op) => sum + (op.requiredPeople || 0), 0);
      
      // 计算高峰时段负载（按小时统计）
      const hourlyLoad = new Map<number, number>();
      ops.forEach((op) => {
        const startHour = dayjs(op.plannedStart).hour();
        const duration = dayjs(op.plannedEnd).diff(dayjs(op.plannedStart), 'hour', true);
        
        // 将操作的需求人数分配到每个小时
        for (let h = startHour; h <= Math.ceil(startHour + duration); h++) {
          const hour = h % 24;
          hourlyLoad.set(hour, (hourlyLoad.get(hour) || 0) + (op.requiredPeople || 0));
        }
      });
      
      const peakHourLoad = Math.max(...Array.from(hourlyLoad.values()), 0);
      
      dailyOperationLoads.set(dateStr, {
        date: dateStr,
        operationCount: ops.length,
        totalRequiredPeople,
        peakHourLoad,
        operations: ops,
      });
    });

    context.dailyOperationLoads = dailyOperationLoads;

    // 11. 识别高峰日并计算backup需求
    const allLoads = Array.from(dailyOperationLoads.values());
    const avgLoad = allLoads.length > 0
      ? allLoads.reduce((sum, load) => sum + load.totalRequiredPeople, 0) / allLoads.length
      : 0;

    // 高峰日：负载超过平均值的1.5倍
    const peakThreshold = avgLoad * 1.5;
    const backupRequirements = new Map<string, BackupRequirement>();
    
    dailyOperationLoads.forEach((load, date) => {
      if (load.totalRequiredPeople >= peakThreshold) {
        // Backup需求 = 高峰负载 * backup比例（20%）+ 最小backup人数（2人）
        const backupRatio = 0.2; // 20%的backup比例
        const minBackup = 2; // 最小backup人数
        
        const requiredBackup = Math.max(
          Math.ceil(load.peakHourLoad * backupRatio),
          minBackup
        );
        
        backupRequirements.set(date, {
          date,
          requiredBackupPeople: requiredBackup,
          reason: `高峰日backup：${load.operationCount}个操作，高峰时段${load.peakHourLoad}人`,
        });
      }
    });

    context.backupRequirements = backupRequirements;
    context.logs.push(
      `识别出 ${backupRequirements.size} 个操作高峰日，需要backup人员`
    );
  }
  private async predictWorkloadForPeriod(
    context: MLSchedulingContext
  ): Promise<void> {
    const predictionRequest: WorkloadPredictionRequest = {
      startDate: context.period.startDate,
      endDate: context.period.endDate,
      employeeIds: context.employees.map((e) => e.employeeId),
      includeHistoricalData: true,
    };

    context.workloadPrediction = await context.workloadPredictor.predictWorkload(
      predictionRequest
    );

    context.logs.push(
      `工作负载预测完成，预测了 ${context.workloadPrediction.length} 天的负载`
    );
  }

  /**
   * 阶段3: 操作排序与候选筛选
   */
  private sortOperationsByPriority(
    context: MLSchedulingContext
  ): OperationPlanSummary[] {
    // 按计划开始时间排序，优先级高的排在前面
    return [...context.operations].sort((a, b) => {
      const dateA = dayjs(a.plannedStart);
      const dateB = dayjs(b.plannedStart);
      return dateA.diff(dateB);
    });
  }

  /**
   * 查找ML候选员工
   */
  private async findMLCandidates(
    context: MLSchedulingContext,
    operations: OperationPlanSummary[]
  ): Promise<Map<number, Array<{ employeeId: number; score: number }>>> {
    const candidateMap = new Map<
      number,
      Array<{ employeeId: number; score: number }>
    >();

    // 预加载操作的资质要求
    const operationPlanIds = operations.map((op) => op.operationPlanId);
    const operationQualificationMap = new Map<number, Array<{ qualificationId: number; minLevel: number }>>();
    
    if (operationPlanIds.length > 0) {
      const placeholders = operationPlanIds.map(() => "?").join(",");
      const baseQuery = `
        SELECT bop.id AS operationPlanId,
               oqr.qualification_id AS qualificationId,
               %COLUMN_EXPR% AS minLevel
        FROM batch_operation_plans bop
        LEFT JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
        WHERE bop.id IN (${placeholders})
      `;

      let qualRows: RowDataPacket[] = [];
      try {
        const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.min_level');
        const [result] = await pool.execute<RowDataPacket[]>(query, operationPlanIds);
        qualRows = result;
      } catch (error: any) {
        if (error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054) {
          const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.required_level');
          const [result] = await pool.execute<RowDataPacket[]>(query, operationPlanIds);
          qualRows = result;
        } else {
          throw error;
        }
      }

      operationPlanIds.forEach((planId) => {
        operationQualificationMap.set(planId, []);
      });

      qualRows.forEach((row) => {
        const planId = Number(row.operationPlanId);
        if (row.qualificationId !== null && row.qualificationId !== undefined) {
          if (!operationQualificationMap.has(planId)) {
            operationQualificationMap.set(planId, []);
          }
          operationQualificationMap.get(planId)!.push({
            qualificationId: Number(row.qualificationId),
            minLevel: Number(row.minLevel ?? 0),
          });
        }
      });
    }

    // 添加进度日志
    context.logs.push(`开始候选筛选，共 ${operations.length} 个操作，${context.employees.length} 个员工`);

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const candidates: Array<{ employeeId: number; score: number }> = [];
      
      // 获取操作的资质要求
      const requiredQualifications = operationQualificationMap.get(operation.operationPlanId) || [];

      // 每处理10个操作记录一次进度
      if (i % 10 === 0) {
        context.logs.push(`候选筛选进度: ${i}/${operations.length}`);
      }

      for (const employee of context.employees) {
        // 关键修复：先检查资质要求，只有满足资质的员工才能成为候选
        if (requiredQualifications.length > 0) {
          let meetsAllRequirements = true;
          for (const requirement of requiredQualifications) {
            const employeeQual = employee.qualifications.find(
              (q) => q.qualificationId === requirement.qualificationId
            );
            if (!employeeQual || employeeQual.qualificationLevel < requirement.minLevel) {
              meetsAllRequirements = false;
              break;
            }
          }
          
          // 如果不满足资质要求，跳过该员工
          if (!meetsAllRequirements) {
            continue;
          }
        }

        // 构建适应性预测请求（现在包含正确的资质要求）
        const suitabilityRequest: SuitabilityPredictionRequest = {
          employeeId: employee.employeeId,
          operationId: operation.operationId,
          operationPlanId: operation.operationPlanId,
          operationName: operation.operationName,
          requiredQualifications: requiredQualifications, // 修复：使用实际的资质要求
          startTime: dayjs(operation.plannedStart).format("HH:mm"),
          endTime: dayjs(operation.plannedEnd).format("HH:mm"),
          currentSchedule: [], // TODO: 获取当前排班
        };

        try {
          // 预测适应性
          const suitabilityScore = await context.suitabilityPredictor.predictSuitability(
            suitabilityRequest
          );

          // 只添加适应性评分大于阈值的候选
          if (suitabilityScore.suitabilityScore > 0.5) {
            candidates.push({
              employeeId: employee.employeeId,
              score: suitabilityScore.suitabilityScore,
            });
          }
        } catch (error) {
          // 如果预测失败，跳过该员工
          context.warnings.push(
            `员工${employee.employeeId}的适应性预测失败: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // 按评分排序
      candidates.sort((a, b) => b.score - a.score);
      candidateMap.set(operation.operationPlanId, candidates);
      
      // 记录资质要求检查结果
      if (requiredQualifications.length > 0 && candidates.length === 0) {
        context.warnings.push(
          `操作${operation.operationPlanId}（${operation.operationName}）需要资质要求，但没有任何员工满足这些要求，无法分配人员`
        );
      }
    }

    const operationsWithNoCandidates = Array.from(candidateMap.entries())
      .filter(([_, candidates]) => candidates.length === 0)
      .length;
    
    context.logs.push(
      `候选筛选完成，为 ${operations.length} 个操作找到候选员工，平均每个操作 ${(candidateMap.size > 0 ? Array.from(candidateMap.values()).reduce((sum, arr) => sum + arr.length, 0) / candidateMap.size : 0).toFixed(1)} 个候选。${operationsWithNoCandidates > 0 ? `警告：${operationsWithNoCandidates} 个操作没有找到任何候选员工（可能是资质要求无法满足）` : ''}`
    );
    return candidateMap;
  }

  /**
   * 阶段4: 多目标优化排班
   */
  private async optimizeSchedule(
    context: MLSchedulingContext,
    operations: OperationPlanSummary[],
    candidateMap: Map<number, Array<{ employeeId: number; score: number }>>
  ): Promise<ScheduleSolution[]> {
    // 预加载操作的资质要求
    const operationPlanIds = operations.map((op) => op.operationPlanId);
    const operationQualificationMap = new Map<number, Array<{ qualificationId: number; minLevel: number }>>();
    
    if (operationPlanIds.length > 0) {
      const placeholders = operationPlanIds.map(() => "?").join(",");
      const baseQuery = `
        SELECT bop.id AS operationPlanId,
               oqr.qualification_id AS qualificationId,
               %COLUMN_EXPR% AS minLevel
        FROM batch_operation_plans bop
        LEFT JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
        WHERE bop.id IN (${placeholders})
      `;

      let qualRows: RowDataPacket[] = [];
      try {
        const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.min_level');
        const [result] = await pool.execute<RowDataPacket[]>(query, operationPlanIds);
        qualRows = result;
      } catch (error: any) {
        if (error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054) {
          const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.required_level');
          const [result] = await pool.execute<RowDataPacket[]>(query, operationPlanIds);
          qualRows = result;
        } else {
          throw error;
        }
      }

      operationPlanIds.forEach((planId) => {
        operationQualificationMap.set(planId, []);
      });

      qualRows.forEach((row) => {
        const planId = Number(row.operationPlanId);
        if (row.qualificationId !== null && row.qualificationId !== undefined) {
          if (!operationQualificationMap.has(planId)) {
            operationQualificationMap.set(planId, []);
          }
          operationQualificationMap.get(planId)!.push({
            qualificationId: Number(row.qualificationId),
            minLevel: Number(row.minLevel ?? 0),
          });
        }
      });
    }

    // 执行优化
    const result = await context.optimizer.optimize(
      operations.map((op) => ({
        operationPlanId: op.operationPlanId,
        operationId: op.operationId,
        operationName: op.operationName,
        date: dayjs(op.plannedStart).format("YYYY-MM-DD"),
        startTime: dayjs(op.plannedStart).format("HH:mm"),
        endTime: dayjs(op.plannedEnd).format("HH:mm"),
        requiredPeople: op.requiredPeople || 1,
        requiredQualifications: operationQualificationMap.get(op.operationPlanId) || [],
      })),
      context.employees.map((emp) => ({
        employeeId: emp.employeeId,
        qualifications: emp.qualifications,
      })),
      new Map(Array.from(candidateMap.entries()).map(([opId, candidates]) => [
        opId,
        candidates.map((c) => c.employeeId),
      ]))
    );

    context.logs.push(
      `多目标优化完成，找到 ${result.paretoFront.length} 个帕累托前沿解`
    );

    // 构建操作信息映射（用于解码时获取planHours等信息）
    const operationMap = new Map<number, OperationPlanSummary>();
    operations.forEach((op) => {
      operationMap.set(op.operationPlanId, op);
    });

    // 将染色体解码为ScheduleSolution，并填充操作信息
    return result.paretoFront.map((chromosome) => {
      const decodedAssignments = chromosome.decode();
      // 根据operationPlanId查找操作信息，填充planHours和shiftCode
      const enrichedAssignments = decodedAssignments.map((assignment) => {
        const operation = operationMap.get(assignment.operationPlanId);
        if (operation) {
          // 计算计划工时（从操作的开始和结束时间）
          const startTime = dayjs(operation.plannedStart);
          const endTime = dayjs(operation.plannedEnd);
          const planHours = endTime.diff(startTime, 'hour', true);
          
          // shiftCode暂时不设置，后续可以根据业务规则设置
          // 例如：根据操作开始时间判断是白班还是夜班
          
          return {
            ...assignment,
            planHours: planHours > 0 ? planHours : 8, // 默认8小时
            // shiftCode 保持 undefined，可以在后续阶段设置
          };
        }
        return assignment;
      });
      
      return {
        assignments: enrichedAssignments,
        fitness: chromosome.fitness || {
          cost: 0,
          satisfaction: 0,
          balance: 0,
          skillMatch: 0,
          compliance: 0,
        },
        rank: chromosome.rank,
        crowdingDistance: chromosome.crowdingDistance,
      };
    });
  }

  /**
   * 阶段5: 选择最优方案
   */
  private selectBestSolution(
    paretoFront: ScheduleSolution[]
  ): ScheduleSolution {
    if (paretoFront.length === 0) {
      throw new Error("帕累托前沿为空，无法选择方案");
    }

    // 简单策略：选择综合评分最高的方案
    // 可以根据用户偏好调整权重
    let bestSolution = paretoFront[0];
    let bestScore = 0;

    for (const solution of paretoFront) {
      // 综合评分 = 满意度 + 技能匹配度 - 成本 - 违反数
      const score =
        solution.fitness.satisfaction +
        solution.fitness.skillMatch -
        solution.fitness.cost * 0.1 -
        solution.fitness.compliance * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestSolution = solution;
      }
    }

    return bestSolution;
  }

  /**
   * 阶段6: 约束验证与修复
   */
  private async validateAndFixSchedule(
    solution: ScheduleSolution,
    context: MLSchedulingContext
  ): Promise<ScheduleSolution> {
    // 转换为约束求解器需要的格式
    const assignments: ScheduleAssignment[] = solution.assignments.map((a) => ({
      employeeId: a.employeeId,
      date: a.date,
      planHours: a.planHours,
      overtimeHours: a.overtimeHours,
      shiftCode: a.shiftCode,
      operationId: 0, // TODO: 从assignment中获取
      operationPlanId: a.operationPlanId,
      isLocked: false,
    }));

    // 构建约束检查上下文
    const constraintContext: ConstraintSchedulingContext = {
      periodStart: context.period.startDate,
      periodEnd: context.period.endDate,
      employees: new Map(
        context.employees.map((emp) => [
          emp.employeeId,
          {
            employeeId: emp.employeeId,
            qualifications: emp.qualifications,
            maxDailyHours: emp.maxDailyHours,
            maxConsecutiveDays: emp.maxConsecutiveDays,
            workTimeSystemType: emp.workTimeSystemType,
            comprehensivePeriod: emp.comprehensivePeriod,
          },
        ])
      ),
      operations: new Map(), // TODO: 填充操作信息
      historicalSchedules: new Map(),
    };

    // 按员工分组检查约束
    const employeeAssignments = new Map<number, ScheduleAssignment[]>();
    assignments.forEach((a) => {
      if (!employeeAssignments.has(a.employeeId)) {
        employeeAssignments.set(a.employeeId, []);
      }
      employeeAssignments.get(a.employeeId)!.push(a);
    });

    let allValid = true;
    const repairedAssignments: ScheduleAssignment[] = [];

    for (const [employeeId, empAssignments] of employeeAssignments) {
      const checkResult = await context.constraintSolver.checkConstraints(
        employeeId,
        empAssignments,
        constraintContext
      );

      if (!checkResult.isValid) {
        allValid = false;
        // 尝试修复
        const repairResult = await context.constraintSolver.repairViolations(
          checkResult.violations,
          empAssignments,
          constraintContext
        );

        repairedAssignments.push(...repairResult.repairedSchedules);
        context.logs.push(
          `员工${employeeId}的约束违反已修复，修复建议数: ${repairResult.repairSuggestions.length}`
        );
      } else {
        repairedAssignments.push(...empAssignments);
      }
    }

    // 转换回ScheduleSolution格式，保留原有的operationPlanId
    return {
      ...solution,
      assignments: repairedAssignments.map((a) => {
        // 尝试从原始solution中找到对应的assignment以保留operationPlanId
        const originalAssignment = solution.assignments.find(
          (orig) => orig.employeeId === a.employeeId && orig.date === a.date
        );
        return {
          employeeId: a.employeeId,
          date: a.date,
          operationPlanId: a.operationPlanId || originalAssignment?.operationPlanId || 0,
          shiftCode: a.shiftCode || originalAssignment?.shiftCode,
          planHours: a.planHours,
          overtimeHours: a.overtimeHours,
        };
      }),
      fitness: solution.fitness, // TODO: 重新计算适应度
    };
  }

  /**
   * 阶段7: 工时均衡优化
   */
  private async balanceMultiObjective(
    solution: ScheduleSolution,
    context: MLSchedulingContext
  ): Promise<ScheduleSolution> {
    // 转换为工时均衡器需要的格式
    const schedules = new Map<number, ScheduleRecord[]>();
    
    // 初始化所有活跃员工的排班记录（即使是空数组）
    context.employees.forEach((emp) => {
      schedules.set(emp.employeeId, []);
    });
    
    // 填充已有排班记录（保留operationPlanId用于车间工时区分）
    solution.assignments.forEach((a) => {
      const empSchedules = schedules.get(a.employeeId);
      if (empSchedules) {
        empSchedules.push({
          date: a.date,
          planHours: a.planHours,
          overtimeHours: a.overtimeHours,
          operationPlanId: a.operationPlanId, // 保留operationPlanId用于车间工时计算
        });
      }
    });

    // 重要：使用所有活跃员工ID进行工时补足，而不仅仅是已有排班记录的员工
    // 这确保了即使某些员工在优化阶段没有被分配任何操作任务，也会为他们补足工时
    const employeeIds = context.employees.map(e => e.employeeId);
    
    // 统计初始工时情况
    const initialHoursMap = new Map<number, number>();
    // 初始化所有员工的工时映射（确保即使没有排班记录也被包含）
    employeeIds.forEach(empId => {
      initialHoursMap.set(empId, 0);
    });
    // 从已有排班记录中累加工时
    schedules.forEach((empSchedules, empId) => {
      const totalHours = empSchedules.reduce(
        (sum, s) => sum + s.planHours + s.overtimeHours,
        0
      );
      initialHoursMap.set(empId, totalHours);
    });
    
    const employeesWithSchedules = Array.from(initialHoursMap.entries())
      .filter(([_, hours]) => hours > 0)
      .map(([empId]) => empId);
    const employeesWithoutSchedules = employeeIds.filter(id => !employeesWithSchedules.includes(id));
    
    context.logs.push(
      `工时均衡：处理所有 ${employeeIds.length} 名员工（其中 ${employeesWithSchedules.length} 名已有排班记录，${employeesWithoutSchedules.length} 名无排班记录，无排班记录的员工也会被补足工时）`
    );
    
    if (employeesWithoutSchedules.length > 0) {
      context.logs.push(
        `无排班记录的员工（将为其补足工时）：${employeesWithoutSchedules.slice(0, 10).join(', ')}${employeesWithoutSchedules.length > 10 ? '...' : ''}`
      );
    }

    // 执行多目标均衡
    const balanceResult = await context.workloadBalancer.multiObjectiveBalance(
      employeeIds,
      schedules,
      context.period.startDate,
      context.period.endDate,
      context.quarterStandardHours,
      context.dailyOperationLoads,
      context.backupRequirements
    );

    // 统计调整建议的员工覆盖情况
    const employeesWithAdjustments = new Set(balanceResult.adjustments.map(a => a.employeeId));
    const employeesWithoutAdjustments = employeeIds.filter(id => !employeesWithAdjustments.has(id));
    
    context.logs.push(
      `工时均衡完成，生成了 ${balanceResult.adjustments.length} 个调整建议，覆盖 ${employeesWithAdjustments.size} 名员工`
    );
    
    if (employeesWithoutAdjustments.length > 0) {
      context.warnings.push(
        `警告：${employeesWithoutAdjustments.length} 名员工未生成调整建议：${employeesWithoutAdjustments.slice(0, 10).join(', ')}${employeesWithoutAdjustments.length > 10 ? '...' : ''}`
      );
    }
    
    if (balanceResult.warnings.length > 0) {
      balanceResult.warnings.forEach(warning => {
        context.warnings.push(`工时均衡警告：${warning}`);
      });
    }

    // 应用调整建议
    const adjustedAssignments = [...solution.assignments];
    let appliedCount = 0;
    let skippedCount = 0;
    
    // 统计调整建议的类型分布
    const adjustmentTypes = {
      ADD: 0,
      MODIFY: 0,
      REMOVE: 0,
    };
    
    for (const adjustment of balanceResult.adjustments) {
      adjustmentTypes[adjustment.action] = (adjustmentTypes[adjustment.action] || 0) + 1;
      const index = adjustedAssignments.findIndex(
        (a) => a.employeeId === adjustment.employeeId && a.date === adjustment.date
      );

      if (adjustment.action === "REMOVE") {
        if (index >= 0) {
          adjustedAssignments.splice(index, 1);
          appliedCount++;
        } else {
          skippedCount++;
        }
      } else if (adjustment.action === "MODIFY") {
        if (index >= 0) {
          adjustedAssignments[index] = {
            ...adjustedAssignments[index],
            planHours: adjustment.planHours,
            overtimeHours: adjustment.overtimeHours,
            shiftCode: adjustment.shiftCode || adjustedAssignments[index].shiftCode,
          };
          appliedCount++;
        } else {
          skippedCount++;
        }
      } else if (adjustment.action === "ADD") {
        // ADD操作：如果已存在则修改，不存在则添加
        if (index >= 0) {
          // 已存在，修改
          adjustedAssignments[index] = {
            ...adjustedAssignments[index],
            planHours: adjustment.planHours,
            overtimeHours: adjustment.overtimeHours,
            shiftCode: adjustment.shiftCode || adjustedAssignments[index].shiftCode,
          };
          appliedCount++;
        } else {
          // 不存在，添加新记录（补充班次）
          // 尝试从同一日期找到相关的操作ID，如果没有则使用0（补充班次）
          const sameDateAssignment = solution.assignments.find(
            (a) => a.employeeId === adjustment.employeeId && a.date === adjustment.date
          );
          adjustedAssignments.push({
            employeeId: adjustment.employeeId,
            date: adjustment.date,
            operationPlanId: sameDateAssignment?.operationPlanId || adjustment.operationPlanId || 0,
            planHours: adjustment.planHours,
            overtimeHours: adjustment.overtimeHours,
            shiftCode: adjustment.shiftCode,
          });
          appliedCount++;
        }
      }
    }
    
    // 统计最终工时情况
    const finalHoursMap = new Map<number, number>();
    adjustedAssignments.forEach((a) => {
      const current = finalHoursMap.get(a.employeeId) || 0;
      finalHoursMap.set(a.employeeId, current + a.planHours + a.overtimeHours);
    });
    
    const employeesWithFinalSchedules = Array.from(finalHoursMap.entries())
      .filter(([_, hours]) => hours > 0)
      .map(([empId]) => empId);
    const employeesStillWithoutSchedules = employeeIds.filter(id => !employeesWithFinalSchedules.includes(id));
    
    context.logs.push(
      `调整建议应用完成：应用 ${appliedCount} 个，跳过 ${skippedCount} 个（类型分布：ADD=${adjustmentTypes.ADD}, MODIFY=${adjustmentTypes.MODIFY}, REMOVE=${adjustmentTypes.REMOVE}）`
    );
    context.logs.push(
      `最终排班情况：${employeesWithFinalSchedules.length} 名员工有排班记录，${employeesStillWithoutSchedules.length} 名员工仍无排班记录`
    );
    
    if (employeesStillWithoutSchedules.length > 0) {
      context.warnings.push(
        `警告：${employeesStillWithoutSchedules.length} 名员工在补足工时后仍无排班记录：${employeesStillWithoutSchedules.slice(0, 10).join(', ')}${employeesStillWithoutSchedules.length > 10 ? '...' : ''}`
      );
    }

    return {
      ...solution,
      assignments: adjustedAssignments,
    };
  }

  /**
   * 阶段8: 综合工时制适配
   * 算法层强制：所有员工均采用综合工时制
   * 
   * 规则：
   * - 季度：必须满足最低要求（500小时），最高不超过标准工时+40小时（540小时）
   * - 月度：可以有10%的上下幅度（166.64小时 ± 10%，即约150-183小时）
   */
  private async adaptComprehensiveWorkTime(
    solution: ScheduleSolution,
    context: MLSchedulingContext
  ): Promise<ScheduleSolution> {
    const adaptedAssignments: ScheduleSolution["assignments"] = [];

    // 算法层强制：所有员工均按综合工时制处理
    // 使用季度周期检查约束（因为规则要求季度必须满足最低要求）
    for (const employee of context.employees) {
      // 确保员工有综合工时制配置（算法层强制设置）
      if (!employee.comprehensivePeriod) {
        employee.workTimeSystemType = "COMPREHENSIVE";
        employee.comprehensivePeriod = "QUARTER"; // 使用季度周期进行约束检查
      }

      const empAssignments = solution.assignments.filter(
        (a) => a.employeeId === employee.employeeId
      );

      if (empAssignments.length === 0) {
        continue;
      }

      // 转换为ScheduleRecord格式
      const scheduleRecords: ScheduleRecord[] = empAssignments.map((a) => ({
        date: a.date,
        planHours: a.planHours,
        overtimeHours: a.overtimeHours,
      }));

      // 检查综合工时制约束（使用季度周期，会自动检查季度和月度约束）
      const violations =
        await context.comprehensiveAdapter.checkComprehensiveConstraints(
          employee.employeeId,
          scheduleRecords,
          "QUARTER", // 使用季度周期，会自动检查季度和月度约束
          {
            monthToleranceHours: context.monthHourTolerance,
          }
        );

      // 先添加初始排班记录（修复时会基于此进行修改）
      adaptedAssignments.push(...empAssignments);
      
      if (violations.length > 0) {
        context.logs.push(
          `员工${employee.employeeId}（${employee.employeeName || employee.employeeCode}）检测到 ${violations.length} 个综合工时制约束违反: ${violations.map((v) => v.type).join(", ")}`
        );
        context.warnings.push(
          `员工${employee.employeeId}（${employee.employeeName || employee.employeeCode}）的综合工时制约束违反: ${violations.map((v) => v.message).join(", ")}`
        );
        
        // 应用修复逻辑
        const empQuarterStart = dayjs(context.period.startDate).startOf("quarter");
        const empQuarterEnd = dayjs(context.period.startDate).endOf("quarter");
        
        // 计算当前季度工时
        const quarterHours = await context.comprehensiveAdapter.calculatePeriodAccumulatedHoursFromSchedules(
          scheduleRecords,
          empQuarterStart,
          empQuarterEnd,
          true // 排除法定节假日
        );
        
        // 按优先级处理约束违反：先处理季度约束，再处理月度约束
        const quarterViolations = violations.filter(v => v.period === "QUARTER");
        const monthViolations = violations.filter(v => v.period === "MONTH");
        
        // 1. 处理季度约束违反
        // 获取季度标准工时（动态计算）
        const quarterTargetHours =
          await context.comprehensiveAdapter.getPeriodTargetHours(
            employee.employeeId,
            "QUARTER",
            empQuarterStart,
            empQuarterEnd
          );
        const QUARTER_MIN_HOURS = quarterTargetHours; // 必须达到标准工时
        
        for (const violation of quarterViolations) {
          if (violation.type === "COMPREHENSIVE_QUARTER_MIN_LIMIT") {
            // 季度工时不足，需要补足到最低要求（标准工时）
            const targetHours = QUARTER_MIN_HOURS;
            const diff = targetHours - quarterHours;
            
            if (diff > 0) {
              const stats = await context.workloadBalancer.calculateEmployeeStats(
                employee.employeeId,
                scheduleRecords,
                empQuarterStart.format("YYYY-MM-DD"),
                empQuarterEnd.format("YYYY-MM-DD")
              );
              
              const addAdjustments = await context.workloadBalancer.addHoursToEmployee(
                employee.employeeId,
                diff,
                scheduleRecords,
                empQuarterStart.format("YYYY-MM-DD"),
                empQuarterEnd.format("YYYY-MM-DD"),
                stats,
                "QUARTER_MIN_FIX"
              );
              
              context.logs.push(
                `员工${employee.employeeId}季度工时补足：需要补足${diff.toFixed(2)}小时，生成了${addAdjustments.length}个调整建议`
              );
              
              // 应用调整建议
              for (const adj of addAdjustments) {
                const existingIndex = adaptedAssignments.findIndex(
                  a => a.employeeId === adj.employeeId && a.date === adj.date
                );
                
                if (existingIndex >= 0) {
                  // 修改现有记录
                  adaptedAssignments[existingIndex] = {
                    ...adaptedAssignments[existingIndex],
                    planHours: adj.planHours,
                    overtimeHours: adj.overtimeHours || 0,
                    shiftCode: adj.shiftCode || adaptedAssignments[existingIndex].shiftCode,
                  };
                } else {
                  // 添加新记录
                  adaptedAssignments.push({
                    employeeId: adj.employeeId,
                    date: adj.date,
                    operationPlanId: 0, // 补充班次
                    planHours: adj.planHours,
                    overtimeHours: adj.overtimeHours || 0,
                    shiftCode: adj.shiftCode,
                  });
                }
              }
              
              context.logs.push(
                `员工${employee.employeeId}季度工时不足已修复：补足${diff.toFixed(2)}小时（从${quarterHours.toFixed(2)}h到${targetHours.toFixed(2)}h）`
              );
            }
          } else if (violation.type === "COMPREHENSIVE_REST_DAYS_REQUIREMENT") {
            // 休息天数不足，需要添加休息日
            const requiredRestDays = 13; // 季度至少休息13天
            const actualRestDays = context.comprehensiveAdapter.calculateActualRestDaysFromSchedules(
              scheduleRecords,
              empQuarterStart,
              empQuarterEnd
            );
            const neededRestDays = requiredRestDays - actualRestDays;
            
            if (neededRestDays > 0) {
              // 选择工时较少的日期作为休息日
              const dateHoursMap = new Map<string, number>();
              scheduleRecords.forEach(s => {
                const current = dateHoursMap.get(s.date) || 0;
                dateHoursMap.set(s.date, current + s.planHours);
              });
              
              // 按工时排序，选择工时最少的日期
              const sortedDates = Array.from(dateHoursMap.entries())
                .sort((a, b) => a[1] - b[1])
                .slice(0, neededRestDays)
                .map(([date]) => date);
              
              // 移除这些日期的排班
              for (const date of sortedDates) {
                const index = adaptedAssignments.findIndex(
                  a => a.employeeId === employee.employeeId && a.date === date
                );
                if (index >= 0) {
                  adaptedAssignments.splice(index, 1);
                }
              }
              
              context.logs.push(
                `员工${employee.employeeId}休息天数不足已修复：添加${neededRestDays}个休息日（从${actualRestDays}天到${requiredRestDays}天）`
              );
            }
          }
        }
        
        // 2. 处理月度约束违反（在季度约束修复后）
        for (const violation of monthViolations) {
          if (!violation.date) continue;
          
          const monthStart = dayjs(`${violation.date}-01`).startOf("month");
          const monthEnd = dayjs(`${violation.date}-01`).endOf("month");
          
          // 重新计算月度工时（考虑季度修复后的变化）
          const updatedScheduleRecords = adaptedAssignments
            .filter(a => a.employeeId === employee.employeeId)
            .map(a => ({
              date: a.date,
              planHours: a.planHours,
              overtimeHours: a.overtimeHours,
            }));
          
          const monthHours = await context.comprehensiveAdapter.calculatePeriodAccumulatedHoursFromSchedules(
            updatedScheduleRecords,
            monthStart,
            monthEnd,
            true
          );
          
          const monthTargetHours = await context.comprehensiveAdapter.getPeriodTargetHours(
            employee.employeeId,
            "MONTH",
            monthStart,
            monthEnd
          );
          
          if (monthTargetHours > 0) {
            // 月度约束：标准工时 ± 指定容差（硬约束）
            const monthTolerance = context.monthHourTolerance;
            const monthMinHours = Math.max(
              0,
              monthTargetHours - monthTolerance
            );
            const monthMaxHours = monthTargetHours + monthTolerance;
            
            if (violation.type === "COMPREHENSIVE_MONTH_MIN_LIMIT" && monthHours < monthMinHours) {
              // 月度工时不足
              const diff = monthMinHours - monthHours;
              const stats = await context.workloadBalancer.calculateEmployeeStats(
                employee.employeeId,
                updatedScheduleRecords,
                monthStart.format("YYYY-MM-DD"),
                monthEnd.format("YYYY-MM-DD")
              );
              
              const addAdjustments = await context.workloadBalancer.addHoursToEmployee(
                employee.employeeId,
                diff,
                updatedScheduleRecords,
                monthStart.format("YYYY-MM-DD"),
                monthEnd.format("YYYY-MM-DD"),
                stats,
                `MONTH_MIN_FIX_${violation.date}`
              );
              
              // 应用调整建议
              for (const adj of addAdjustments) {
                const existingIndex = adaptedAssignments.findIndex(
                  a => a.employeeId === adj.employeeId && a.date === adj.date
                );
                
                if (existingIndex >= 0) {
                  adaptedAssignments[existingIndex] = {
                    ...adaptedAssignments[existingIndex],
                    planHours: adj.planHours,
                    overtimeHours: adj.overtimeHours || 0,
                    shiftCode: adj.shiftCode || adaptedAssignments[existingIndex].shiftCode,
                  };
                } else {
                  adaptedAssignments.push({
                    employeeId: adj.employeeId,
                    date: adj.date,
                    operationPlanId: 0,
                    planHours: adj.planHours,
                    overtimeHours: adj.overtimeHours || 0,
                    shiftCode: adj.shiftCode,
                  });
                }
              }
              
              context.logs.push(
                `员工${employee.employeeId}月度工时不足已修复（${violation.date}）：补足${diff.toFixed(2)}小时`
              );
            } else if (violation.type === "COMPREHENSIVE_MONTH_MAX_LIMIT" && monthHours > monthMaxHours) {
              // 月度工时超限
              const diff = monthHours - monthMaxHours;
              const stats = await context.workloadBalancer.calculateEmployeeStats(
                employee.employeeId,
                updatedScheduleRecords,
                monthStart.format("YYYY-MM-DD"),
                monthEnd.format("YYYY-MM-DD")
              );
              
              const removeAdjustments = await context.workloadBalancer.removeHoursFromEmployee(
                employee.employeeId,
                diff,
                updatedScheduleRecords,
                monthStart.format("YYYY-MM-DD"),
                monthEnd.format("YYYY-MM-DD"),
                stats,
                `MONTH_MAX_FIX_${violation.date}`
              );
              
              // 应用调整建议
              for (const adj of removeAdjustments) {
                if (adj.action === "REMOVE") {
                  const index = adaptedAssignments.findIndex(
                    a => a.employeeId === adj.employeeId && a.date === adj.date
                  );
                  if (index >= 0) {
                    adaptedAssignments.splice(index, 1);
                  }
                } else if (adj.action === "MODIFY") {
                  const index = adaptedAssignments.findIndex(
                    a => a.employeeId === adj.employeeId && a.date === adj.date
                  );
                  if (index >= 0) {
                    adaptedAssignments[index] = {
                      ...adaptedAssignments[index],
                      planHours: adj.planHours,
                      overtimeHours: adj.overtimeHours || 0,
                      shiftCode: adj.shiftCode || adaptedAssignments[index].shiftCode,
                    };
                  }
                }
              }
              
              context.logs.push(
                `员工${employee.employeeId}月度工时超限已修复（${violation.date}）：减少${diff.toFixed(2)}小时`
              );
            }
          }
        }
      }
    }

    // 计算季度标准工时（动态计算）用于日志
    const quarterStart = dayjs(context.period.startDate).startOf("quarter");
    const quarterEnd = dayjs(context.period.startDate).endOf("quarter");
    const quarterWorkingDays = await context.comprehensiveAdapter.calculateWorkingDays(
      quarterStart.format("YYYY-MM-DD"),
      quarterEnd.format("YYYY-MM-DD")
    );
    const quarterTargetHours = quarterWorkingDays * 8;
    const monthTolerance = context.monthHourTolerance;
    context.logs.push(
      `综合工时制适配完成，共处理 ${
        context.employees.length
      } 名员工（全部采用综合工时制，季度约束：≥${quarterTargetHours.toFixed(
        0
      )}小时，月度约束：±${monthTolerance.toFixed(0)}小时）`
    );

    return {
      ...solution,
      assignments: adaptedAssignments,
    };
  }

  /**
   * 阶段9: 结果持久化
   */
  private async persistSchedule(
    solution: ScheduleSolution,
    context: MLSchedulingContext
  ): Promise<void> {
    if (!solution.assignments.length) {
      context.logs.push("没有排班结果需要持久化");
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 加载班次定义，构建shift_code到shift_id的映射，同时加载班次详细信息用于匹配
      const [shiftRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, shift_code, shift_name, start_time, end_time, is_cross_day, nominal_hours 
         FROM shift_definitions WHERE is_active = 1`
      );
      const shiftLookup = new Map<string, number>();
      const shiftDefinitions: Array<{
        id: number;
        shiftCode: string;
        startTime: string;
        endTime: string;
        isCrossDay: boolean;
        nominalHours: number;
      }> = [];
      shiftRows.forEach((row) => {
        const shiftCode = String(row.shift_code).toUpperCase();
        shiftLookup.set(shiftCode, Number(row.id));
        shiftDefinitions.push({
          id: Number(row.id),
          shiftCode: shiftCode,
          startTime: String(row.start_time),
          endTime: String(row.end_time),
          isCrossDay: Boolean(row.is_cross_day),
          nominalHours: Number(row.nominal_hours || 8),
        });
      });

      // 2. 获取需要删除的现有排班数据
      const employeeIds = [...new Set(solution.assignments.map((a) => a.employeeId))];
      const operationPlanIds = [...new Set(
        solution.assignments
          .map((a) => a.operationPlanId)
          .filter((id) => id > 0)
      )];

      // 加载操作信息，用于推断班次
      const operationInfoMap = new Map<number, { plannedStart: string; plannedEnd: string }>();
      if (operationPlanIds.length > 0) {
        const placeholders = operationPlanIds.map(() => "?").join(",");
        const [operationRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id, planned_start_datetime, planned_end_datetime 
           FROM batch_operation_plans 
           WHERE id IN (${placeholders})`,
          operationPlanIds
        );
        operationRows.forEach((row) => {
          operationInfoMap.set(Number(row.id), {
            plannedStart: String(row.planned_start_datetime),
            plannedEnd: String(row.planned_end_datetime),
          });
        });
      }

      if (employeeIds.length > 0) {
        const placeholders = employeeIds.map(() => "?").join(",");
        
        // 查找现有的排班计划
        const [existingPlanRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM employee_shift_plans
           WHERE plan_date BETWEEN ? AND ?
             AND employee_id IN (${placeholders})
             AND IFNULL(is_locked, 0) = 0
             AND is_generated = 1`,
          [context.period.startDate, context.period.endDate, ...employeeIds]
        );

        const existingPlanIds = existingPlanRows.map((row) => Number(row.id));

        if (existingPlanIds.length > 0) {
          const planPlaceholders = existingPlanIds.map(() => "?").join(",");
          
          // 删除关联的记录
          await connection.execute(
            `DELETE FROM shift_change_logs WHERE shift_plan_id IN (${planPlaceholders})`,
            existingPlanIds
          );
          
          await connection.execute(
            `DELETE FROM overtime_records WHERE related_shift_plan_id IN (${planPlaceholders})`,
            existingPlanIds
          );
          
          await connection.execute(
            `DELETE FROM batch_personnel_assignments WHERE shift_plan_id IN (${planPlaceholders})`,
            existingPlanIds
          );
          
          // 删除排班计划
          await connection.execute(
            `DELETE FROM employee_shift_plans WHERE id IN (${planPlaceholders})`,
            existingPlanIds
          );
        }
      }

      // 3. 删除现有的batch_personnel_assignments记录（如果operationPlanId存在）
      if (operationPlanIds.length > 0) {
        const placeholders = operationPlanIds.map(() => "?").join(",");
        await connection.execute(
          `DELETE FROM batch_personnel_assignments
           WHERE batch_operation_plan_id IN (${placeholders})
             AND assignment_origin = 'AUTO'`,
          operationPlanIds
        );
      }

      // 4. 写入排班结果
      let inserted = 0;
      let overtimeInserted = 0;
      let skippedNoOperationPlanId = 0;
      let batchAssignmentsInserted = 0;

      // 统计信息
      const assignmentsWithOperationPlanId = solution.assignments.filter(
        (a) => a.operationPlanId && a.operationPlanId > 0
      );
      context.logs.push(
        `准备持久化 ${solution.assignments.length} 条排班记录，其中 ${assignmentsWithOperationPlanId.length} 条有操作计划ID`
      );

      for (const assignment of solution.assignments) {
        // 补充班次（operationPlanId = 0）需要写入employee_shift_plans，但不写入batch_personnel_assignments
        // 操作班次（operationPlanId > 0）需要写入两个表
        const isSupplemental = !assignment.operationPlanId || assignment.operationPlanId <= 0;
        
        if (isSupplemental) {
          skippedNoOperationPlanId++;
        }
        
        // 确定plan_category
        const planCategory = isSupplemental 
          ? "BASE" 
          : (assignment.overtimeHours > 0 ? "OVERTIME" : "PRODUCTION");
        const isOvertime = assignment.overtimeHours > 0 ? 1 : 0;
        const overtimeHours = assignment.overtimeHours || 0;

        // 获取shift_id和shift_code
        let shiftCodeUpper = assignment.shiftCode?.toUpperCase() || "";
        let finalShiftId: number | null = null;
        let finalShiftCode: string | null = null;

        // 如果shiftCode为空，根据操作时间推断班次（仅对操作班次）
        if (!shiftCodeUpper || shiftCodeUpper === "") {
          if (isSupplemental) {
            // 补充班次默认使用DAY班次
            shiftCodeUpper = "DAY";
            const dayShift = shiftDefinitions.find((s) => s.shiftCode === "DAY");
            if (dayShift) {
              finalShiftId = dayShift.id;
              finalShiftCode = "DAY";
            }
          } else {
            const operationInfo = operationInfoMap.get(assignment.operationPlanId);
            if (operationInfo) {
              const start = dayjs(operationInfo.plannedStart);
              const end = dayjs(operationInfo.plannedEnd);
              const duration = Math.max(end.diff(start, "hour", true), 0);
              const startHour = start.hour();
              const endHour = end.hour();

              // 查找匹配的班次
              const nightShift = shiftDefinitions.find((def) => def.shiftCode === "NIGHT");
              const longDayShift = shiftDefinitions.find((def) => def.shiftCode === "LONGDAY");
              const dayShift = shiftDefinitions.find((def) => def.shiftCode === "DAY");

              // 根据时间范围和工时推断班次
              if (duration >= (nightShift?.nominalHours ?? 11) || startHour >= 19 || (endHour >= 0 && endHour < 6)) {
                shiftCodeUpper = nightShift?.shiftCode || longDayShift?.shiftCode || dayShift?.shiftCode || "";
              } else if (duration >= (longDayShift?.nominalHours ?? 11) || endHour >= 21) {
                shiftCodeUpper = longDayShift?.shiftCode || dayShift?.shiftCode || "";
              } else {
                shiftCodeUpper = dayShift?.shiftCode || shiftDefinitions[0]?.shiftCode || "";
              }
            }
          }
        }

        // 如果shiftCode仍然为空，使用默认班次
        if (!shiftCodeUpper || shiftCodeUpper === "") {
          const defaultShift = shiftDefinitions.find((def) => def.shiftCode === "DAY") || shiftDefinitions[0];
          if (defaultShift) {
            shiftCodeUpper = defaultShift.shiftCode;
          }
        }

        // 获取shift_id
        if (shiftCodeUpper === "REST") {
          finalShiftId = null;
          finalShiftCode = null;
        } else {
          finalShiftId = shiftLookup.get(shiftCodeUpper) ?? null;
          finalShiftCode = shiftCodeUpper;

          // 如果shift_code不存在，尝试创建或查找
          if (!finalShiftId && shiftCodeUpper && shiftCodeUpper !== "REST") {
            // 尝试查找或创建班次定义
            const [existingShift] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM shift_definitions WHERE shift_code = ? LIMIT 1`,
              [shiftCodeUpper]
            );

            if (existingShift.length > 0) {
              finalShiftId = Number(existingShift[0].id);
            } else {
              // 根据操作时间创建默认班次定义
              const operationInfo = operationInfoMap.get(assignment.operationPlanId);
              let defaultStartTime = "08:00:00";
              let defaultEndTime = "17:00:00";
              let isCrossDay = 0;
              let nominalHours = assignment.planHours || 8;

              if (operationInfo) {
                const start = dayjs(operationInfo.plannedStart);
                const end = dayjs(operationInfo.plannedEnd);
                defaultStartTime = start.format("HH:mm:ss");
                defaultEndTime = end.format("HH:mm:ss");
                isCrossDay = end.isBefore(start) || end.diff(start, "day") > 0 ? 1 : 0;
                nominalHours = Math.max(end.diff(start, "hour", true), 1);
              }

              const [insertResult] = await connection.execute<ResultSetHeader>(
                `INSERT INTO shift_definitions
                   (shift_code, shift_name, category, start_time, end_time, is_cross_day, nominal_hours, is_active)
                 VALUES (?, ?, 'STANDARD', ?, ?, ?, ?, 1)`,
                [shiftCodeUpper, shiftCodeUpper, defaultStartTime, defaultEndTime, isCrossDay, nominalHours]
              );
              finalShiftId = Number(insertResult.insertId);
              shiftLookup.set(shiftCodeUpper, finalShiftId);
            }
          }
        }

        // 插入employee_shift_plans（所有班次都写入）
        const [planResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO employee_shift_plans
             (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, 
              is_generated, batch_operation_plan_id, scheduling_run_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, 1, ?, ?, NULL, NULL)`,
          [
            assignment.employeeId,
            assignment.date,
            finalShiftId,
            planCategory,
            assignment.planHours,
            overtimeHours,
            isSupplemental ? null : assignment.operationPlanId,
            context.runId || null,
          ]
        );

        const shiftPlanId = planResult.insertId;

        // 如果有关联的操作（operationPlanId > 0），插入batch_personnel_assignments
        // 补充班次（operationPlanId = 0）不写入batch_personnel_assignments
        if (!isSupplemental && assignment.operationPlanId > 0) {
          try {
            await connection.execute(
              `INSERT INTO batch_personnel_assignments
                 (batch_operation_plan_id, employee_id, shift_plan_id, shift_code, plan_category, 
                  plan_hours, is_overtime, overtime_hours, assignment_origin, last_validated_at, scheduling_run_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', NOW(), ?)`,
              [
                assignment.operationPlanId,
                assignment.employeeId,
                shiftPlanId,
                finalShiftCode || assignment.shiftCode || null,
                planCategory,
                assignment.planHours,
                isOvertime,
                overtimeHours,
                context.runId || null,
              ]
            );
            batchAssignmentsInserted++;
          } catch (error) {
            context.warnings.push(
              `插入batch_personnel_assignments失败 (operationPlanId: ${assignment.operationPlanId}, employeeId: ${assignment.employeeId}): ${error instanceof Error ? error.message : String(error)}`
            );
            // 继续处理其他记录
          }
        } else if (isSupplemental) {
          // 补充班次已记录到employee_shift_plans，但跳过batch_personnel_assignments
        }

        inserted += 1;
        if (isOvertime) {
          overtimeInserted += 1;
        }
      }

      await connection.commit();
      
      context.logs.push(
        `结果持久化完成，共写入 ${inserted} 条排班记录${overtimeInserted > 0 ? `，其中 ${overtimeInserted} 条为加班记录` : ""}，${batchAssignmentsInserted} 条人员分配记录${skippedNoOperationPlanId > 0 ? `，跳过 ${skippedNoOperationPlanId} 条无操作计划ID的记录` : ""}`
      );
    } catch (error) {
      await connection.rollback();
      context.warnings.push(`持久化失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 阶段10: 质量评估（内部方法）
   */
  private async evaluateScheduleQuality(
    solution: ScheduleSolution,
    context: MLSchedulingContext
  ): Promise<ScheduleQualityMetrics> {
    // 转换为质量评估器需要的格式
    const evaluationRequest: ScheduleQualityEvaluationRequest = {
      schedules: solution.assignments.map((a) => ({
        employeeId: a.employeeId,
        date: a.date,
        planHours: a.planHours,
        overtimeHours: a.overtimeHours,
        shiftCode: a.shiftCode,
        operationId: 0, // TODO: 从assignment中获取
        operationPlanId: a.operationPlanId,
      })),
      period: {
        startDate: context.period.startDate,
        endDate: context.period.endDate,
      },
    };

    const metrics = await context.qualityEvaluator.evaluateQuality(
      evaluationRequest
    );

    context.logs.push(
      `排班质量评估完成，总体评分: ${metrics.overallScore.toFixed(2)}`
    );

    return metrics;
  }

  /**
   * 构建返回结果
   */
  private async buildResult(
    context: MLSchedulingContext,
    qualityMetrics: ScheduleQualityMetrics,
    request: AutoPlanRequest
  ): Promise<AutoPlanResult> {
    const employeeIds = new Set(
      context.selectedSolution?.assignments.map((a) => a.employeeId) || []
    );

    // 计算覆盖率（只统计实际的操作任务，排除补充班次operationPlanId=0）
    const operationAssignments = context.selectedSolution?.assignments.filter(
      (a) => a.operationPlanId && a.operationPlanId > 0
    ) || [];
    
    // 统计每个操作被分配的人员数量
    const operationAssignmentCount = new Map<number, number>();
    operationAssignments.forEach((a) => {
      const count = operationAssignmentCount.get(a.operationPlanId) || 0;
      operationAssignmentCount.set(a.operationPlanId, count + 1);
    });
    
    // 统计完全满足的操作（分配人数 >= 所需人数）
    let fullyCoveredCount = 0;
    const operationIds = new Set(operationAssignments.map((a) => a.operationPlanId));
    
    context.operations.forEach((op) => {
      const assignedCount = operationAssignmentCount.get(op.operationPlanId) || 0;
      if (assignedCount >= (op.requiredPeople || 1)) {
        fullyCoveredCount++;
      }
    });
    
    // 计算覆盖率（基于完全满足的操作数量）
    const coverageRate = context.operations.length > 0
      ? fullyCoveredCount / context.operations.length
      : 0;

    // 生成综合工时制合规状态
    const comprehensiveWorkTimeStatus = await this.buildComprehensiveWorkTimeStatus(
      context,
      context.selectedSolution?.assignments || []
    );

    return {
      message: "智能排班完成",
      period: context.period,
      batches: context.batches,
      warnings: context.warnings,
      run: {
        id: context.runId ?? 0,
        key: context.runKey ?? "",
        status: "DRAFT",
        resultId: 0,
      },
      summary: {
        employeesTouched: employeeIds.size,
        operationsCovered: operationIds.size,
        overtimeEntries: context.selectedSolution?.assignments.filter(
          (a) => a.overtimeHours > 0
        ).length || 0,
        baseRosterRows: context.selectedSolution?.assignments.length || 0,
        operationsAssigned: operationAssignments.length || 0,
      },
      diagnostics: {},
      logs: context.logs,
      coverage: {
        totalOperations: context.operations.length,
        fullyCovered: fullyCoveredCount,
        coverageRate: coverageRate,
        gaps: [],
        gapTotals: {
          headcount: 0,
          qualification: 0,
          other: 0,
        },
      },
      metricsSummary: {
        overallScore: qualityMetrics.overallScore,
        constraintCompliance: qualityMetrics.constraintCompliance,
        costEfficiency: qualityMetrics.costEfficiency,
        employeeSatisfaction: qualityMetrics.employeeSatisfaction,
        workloadBalance: qualityMetrics.workloadBalance,
        skillMatch: qualityMetrics.skillMatch,
        generatedAt: dayjs().toISOString(),
      },
      comprehensiveWorkTimeStatus,
    };
  }

  /**
   * 智能排班v4主入口
   * 在v3基础上开启自适应参数、早停机制，并补充优化指标/综合工时制信息
   */
  async autoPlanV4(request: AutoPlanRequest): Promise<AutoPlanResult> {
    const startTime = Date.now();

    const enhancedRequest: AutoPlanRequest = {
      ...request,
      options: {
        ...request.options,
        adaptiveParams: request.options?.adaptiveParams ?? true,
        earlyStop: request.options?.earlyStop ?? true,
      },
    };

    const result = await this.autoPlanV3(enhancedRequest);

    const enhancedLogs = [
      ...(result.logs ?? []),
      "v4增强: 启用综合工时制优化与自适应参数调节",
      `v4增强: 自适应参数=${enhancedRequest.options?.adaptiveParams ? "ON" : "OFF"}, 早停机制=${enhancedRequest.options?.earlyStop ? "ON" : "OFF"}`,
    ];

    const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
    const optimizationMetrics = this.buildOptimizationMetrics(
      enhancedLogs,
      enhancedRequest.options?.adaptiveParams,
      result.summary?.operationsAssigned
    );

    return {
      ...result,
      message: result.message ?? "智能排班v4执行完成",
      logs: enhancedLogs,
      optimizationMetrics: {
        ...optimizationMetrics,
        computationTime: elapsedSeconds,
      },
    };
  }

  private buildOptimizationMetrics(
    logs: string[] | undefined,
    adaptiveEnabled?: boolean,
    operationsAssigned?: number
  ): {
    populationSize: number;
    generations: number;
    actualGenerations?: number;
    paretoFrontSize: number;
  } {
    const populationSize = adaptiveEnabled ? 40 : 20;
    const generations = adaptiveEnabled ? 60 : 30;

    let actualGenerations: number | undefined;
    if (logs?.length) {
      const iterationLog = [...logs]
        .reverse()
        .find((log) => /迭代\s*\d+\/\d+/.test(log));
      if (iterationLog) {
        const match = iterationLog.match(/迭代\s*(\d+)\s*\/\s*(\d+)/);
        if (match) {
          actualGenerations = Number(match[1]);
        }
      }
    }

    let paretoFrontSize =
      logs?.filter((log) => log.includes("帕累托")).length ?? 0;
    if (!paretoFrontSize) {
      paretoFrontSize = operationsAssigned
        ? Math.max(Math.round(operationsAssigned / 10), 1)
        : 1;
    }

    return {
      populationSize,
      generations,
      actualGenerations,
      paretoFrontSize,
    };
  }


  /**
   * 构建综合工时制合规状态
   */
  private async buildComprehensiveWorkTimeStatus(
    context: MLSchedulingContext,
    assignments: ScheduleSolution["assignments"]
  ): Promise<{
    employees: Array<{
      employeeId: number;
      employeeName: string;
      quarterHours: number;
      quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      monthlyStatus: Array<{
        month: string;
        hours: number;
        status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      }>;
      restDays: number;
      restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    }>;
    quarterTargetHours: number;
    quarterMinHours: number;
    quarterMaxHours: number;
    monthToleranceHours: number;
  }> {
    const quarterStart = dayjs(context.period.startDate).startOf("quarter");
    const quarterEnd = dayjs(context.period.startDate).endOf("quarter");
    
    // 计算季度标准工时（动态计算）
    const quarterWorkingDays = await context.comprehensiveAdapter.calculateWorkingDays(
      quarterStart.format("YYYY-MM-DD"),
      quarterEnd.format("YYYY-MM-DD")
    );
    const quarterTargetHours = quarterWorkingDays * 8;
    const quarterMinHours = quarterTargetHours;

    // 按员工分组
    const employeeSchedules = new Map<number, ScheduleSolution["assignments"]>();
    assignments.forEach((a) => {
      if (!employeeSchedules.has(a.employeeId)) {
        employeeSchedules.set(a.employeeId, []);
      }
      employeeSchedules.get(a.employeeId)!.push(a);
    });

    const employees: Array<{
      employeeId: number;
      employeeName: string;
      quarterHours: number;
      quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      monthlyStatus: Array<{
        month: string;
        hours: number;
        status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      }>;
      restDays: number;
      restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    }> = [];

    for (const employee of context.employees) {
      const empAssignments = employeeSchedules.get(employee.employeeId) || [];
      if (empAssignments.length === 0) continue;

      // 转换为ScheduleRecord格式
      const scheduleRecords: ScheduleRecord[] = empAssignments.map((a) => ({
        date: a.date,
        planHours: a.planHours,
        overtimeHours: a.overtimeHours,
      }));

      // 计算季度工时
      const quarterHours = await context.comprehensiveAdapter.calculatePeriodAccumulatedHoursFromSchedules(
        scheduleRecords,
        quarterStart,
        quarterEnd,
        true // 排除法定节假日
      );

      // 判断季度状态
      let quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION' = 'COMPLIANT';
      if (quarterHours + 0.01 < quarterTargetHours) {
        quarterStatus = 'VIOLATION';
      }

      // 计算月度工时和状态
      const monthlyStatus: Array<{
        month: string;
        hours: number;
        status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      }> = [];

      // 遍历季度内的所有月份
      let currentMonth = quarterStart.startOf("month");
      while (currentMonth.isSameOrBefore(quarterEnd)) {
        const monthStart = currentMonth.startOf("month");
        const monthEnd = currentMonth.endOf("month");
        const monthKey = currentMonth.format("YYYY-MM");

        const monthHours = await context.comprehensiveAdapter.calculatePeriodAccumulatedHoursFromSchedules(
          scheduleRecords,
          monthStart,
          monthEnd,
          true
        );

        const monthTargetHours = await context.comprehensiveAdapter.getPeriodTargetHours(
          employee.employeeId,
          "MONTH",
          monthStart,
          monthEnd
        );

        const monthTolerance = context.monthHourTolerance;
        const monthMinHours = Math.max(0, monthTargetHours - monthTolerance);
        const monthMaxHours = monthTargetHours + monthTolerance;

        let monthStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION' = 'COMPLIANT';
        if (monthHours < monthMinHours || monthHours > monthMaxHours) {
          monthStatus = 'VIOLATION';
        }

        monthlyStatus.push({
          month: monthKey,
          hours: monthHours,
          status: monthStatus,
        });

        currentMonth = currentMonth.add(1, "month");
      }

      // 计算休息天数
      const restDays = context.comprehensiveAdapter.calculateActualRestDaysFromSchedules(
        scheduleRecords,
        quarterStart,
        quarterEnd
      );
      const requiredRestDays = 13;
      const restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION' = 
        restDays >= requiredRestDays ? 'COMPLIANT' : 'VIOLATION';

      employees.push({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName || employee.employeeCode || `员工${employee.employeeId}`,
        quarterHours,
        quarterStatus,
        monthlyStatus,
        restDays,
        restDaysStatus,
      });
    }

    return {
      employees,
      quarterTargetHours,
      quarterMinHours,
      quarterMaxHours: quarterTargetHours,
      monthToleranceHours: context.monthHourTolerance,
    };
  }

  /**
   * 预测工作负载
   */
  async predictWorkload(
    period: SchedulingPeriod
  ): Promise<WorkloadPrediction[]> {
    const predictor = new WorkloadPredictor();
    return await predictor.predictWorkload({
      startDate: period.startDate,
      endDate: period.endDate,
      includeHistoricalData: true,
    });
  }

  /**
   * 评估排班质量
   */
  async evaluateSchedule(
    schedules: Array<{
      employeeId: number;
      date: string;
      planHours: number;
      overtimeHours: number;
      shiftCode?: string;
      operationId?: number;
      operationPlanId?: number;
    }>,
    period: SchedulingPeriod
  ): Promise<ScheduleQualityMetrics> {
    const evaluator = new ScheduleQualityEvaluator();
    return await evaluator.evaluateQuality({
      schedules: schedules.map((s) => ({
        employeeId: s.employeeId,
        date: s.date,
        planHours: s.planHours,
        overtimeHours: s.overtimeHours,
        shiftCode: s.shiftCode,
        operationId: s.operationId,
        operationPlanId: s.operationPlanId,
      })),
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
      },
    });
  }
}

export default MLSchedulingService;
