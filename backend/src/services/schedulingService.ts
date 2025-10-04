import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "../config/database";
import HolidayService from "./holidayService";
import CoverageDiagnosticsService, {
  CoverageDiagnosticInput,
} from "./coverageDiagnosticsService";
import HeuristicScoringService, {
  DEFAULT_SCORING_WEIGHTS,
  CandidateProfile as HeuristicCandidateProfile,
  CandidateScoreDetail as HeuristicCandidateScoreDetail,
  OperationContext as HeuristicOperationContext,
  ScoringWeights as HeuristicScoringWeights,
} from "./heuristicScoringService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrAfter);

export interface AutoPlanRequest {
  batchIds: number[];
  startDate?: string;
  endDate?: string;
  options?: {
    includeBaseRoster?: boolean;
    dryRun?: boolean;
  };
}

export interface SchedulingPeriod {
  startDate: string;
  endDate: string;
  quarter: string;
}

export interface BatchWindow {
  batchPlanId: number;
  batchCode: string;
  start: string | null;
  end: string | null;
  totalOperations: number;
}

export interface OperationPlanSummary {
  operationPlanId: number;
  operationId: number;
  batchPlanId: number;
  batchCode: string;
  stageName: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  requiredPeople: number;
  isLocked?: boolean;
}

export interface AutoPlanResult {
  message: string;
  period: SchedulingPeriod;
  batches: BatchWindow[];
  warnings: string[];
  summary: {
    employeesTouched: number;
    operationsCovered: number;
    overtimeEntries: number;
    baseRosterRows: number;
    operationsAssigned: number;
  };
  diagnostics: {
    missingCalendar?: boolean;
  };
  logs: string[];
  coverage: CoverageSummary;
  heuristicHotspots?: HeuristicHotspot[];
}

export interface CoverageGap {
  operationPlanId: number;
  operationId: number;
  operationName: string;
  batchPlanId: number;
  batchCode: string;
  stageName: string;
  planDate: string;
  requiredPeople: number;
  assignedPeople: number;
  availableHeadcount: number;
  availableQualified: number;
  qualifiedPoolSize: number;
  category: "HEADCOUNT" | "QUALIFICATION" | "OTHER";
  status: "UNASSIGNED" | "PARTIAL";
  notes: string[];
  suggestions: string[];
}

export interface CoverageSummary {
  totalOperations: number;
  fullyCovered: number;
  coverageRate: number;
  gaps: CoverageGap[];
  gapTotals: {
    headcount: number;
    qualification: number;
    other: number;
  };
}

export interface WorkloadSnapshotEntry {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  totalPlannedHours: number;
  totalOvertimeHours: number;
  daysWorked: number;
  consecutiveDays?: number;
}

export interface WorkloadSnapshotResult {
  period: SchedulingPeriod;
  employees: WorkloadSnapshotEntry[];
  warnings: string[];
}

export interface OperationRecommendationResult {
  operationPlanId: number;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  requiredPeople: number;
  candidates: Array<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    matchScore: number;
    plannedHours: number;
    overtimeRisk: boolean;
  }>;
  suggestions: string[];
}

interface SchedulingContext {
  period: SchedulingPeriod;
  batches: BatchWindow[];
  operations: OperationPlanSummary[];
  warnings: string[];
  logs: string[];
  employees: EmployeeProfile[];
  baseRosterAssignments: BaseRosterAssignment[];
  productionAssignments: ProductionAssignment[];
  baseRosterIndex: Map<string, BaseRosterAssignment[]>;
  productionIndex: Map<string, ProductionAssignment[]>;
  employeeStats: Map<number, EmployeeStats>;
  shiftDefinitions: ShiftDefinition[];
  shiftTypeLookup: Map<string, number>;
  quarterStandardHours?: number;
  standardHourSegments: number;
  coverageGaps: CoverageGap[];
  coverageDiagnostics: Map<number, OperationCoverageDiagnostics>;
  coverageSummary?: CoverageSummary;
  candidateProfiles: Map<number, CandidateProfile>;
  heuristicLogs: Map<number, OperationHeuristicDiagnostics>;
  historicalWorkload: Map<number, HistoricalWorkloadStats>;
  qualifiedCandidates: Map<number, Set<number>>;
  shiftPreferences: Map<number, ShiftPreferenceInfo>;
  lastAssignments: Map<number, LastAssignmentInfo>;
  operationQualifications: Map<number, OperationQualificationRequirement[]>;
  lockedOperations: Set<number>;
  lockedOperationAssignments: Map<number, Set<number>>;
  heuristicWeights?: HeuristicScoringWeights;
  heuristicEngine?: HeuristicScoringService;
  heuristicConfig: HeuristicConfig;
  heuristicHotspots: HeuristicHotspot[];
}

interface EmployeeProfile {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  department?: string;
  role?: string;
  limits?: EmployeeShiftLimit;
  qualifications: EmployeeQualification[];
}

interface EmployeeQualification {
  qualificationId: number;
  qualificationLevel: number;
}

interface EmployeeShiftLimit {
  quarterStandardHours?: number;
  monthStandardHours?: number;
  maxDailyHours: number;
  maxConsecutiveDays: number;
}

interface BaseRosterAssignment {
  employeeId: number;
  planDate: string;
  shiftCode: string;
  planHours: number;
  source: "AUTO_BASE" | "LOCKED";
}

interface ProductionAssignment {
  operationPlanId: number;
  employeeId: number;
  planDate: string;
  shiftCode: string;
  category: "PRODUCTION" | "OVERTIME";
  planHours: number;
  locked?: boolean;
}

interface OperationDetail {
  operationPlanId: number;
  operationId: number;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  requiredPeople: number;
}

interface QualifiedEmployeeRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  matchScore: number;
  plannedHours: number;
  overtimeRisk: boolean;
}

interface EmployeeStats {
  quarterHours: number;
  monthHours: Map<string, number>;
  dailyHours: Map<string, number>;
  consecutiveDays: number;
}

interface HistoricalWorkloadStats {
  last7DaysHours: number;
  last30DaysHours: number;
  recentConsecutiveDays: number;
}

interface OperationCoverageDiagnostics {
  operationPlanId: number;
  planDate: string;
  requiredPeople: number;
  batchPlanId: number;
  batchCode: string;
  stageName: string;
  operationId: number;
  operationName: string;
  availableHeadcount: number;
  qualifiedPoolSize: number;
  availableQualified: number;
  candidateEmployeeIds: number[];
  assignedEmployeeIds: number[];
  notes?: string[];
  fallbackReason?: string;
}

interface OperationHeuristicDiagnostics {
  operationPlanId: number;
  planDate: string;
  requiredPeople: number;
  candidateScores: HeuristicCandidateScoreDetail[];
  selectedEmployeeIds: number[];
  fallbackReason?: string;
  timestamp: string;
  backtrackingAttempted?: boolean;
  backtrackingDepth?: number;
  notes?: string[];
}

interface ShiftPreferenceInfo {
  preferredShifts?: string[];
  nightShiftWillingness?: number;
}

interface LastAssignmentInfo {
  lastOperationId?: number;
  lastShiftCode?: string;
  lastPlanDate?: string;
}

interface CandidateProfile extends HeuristicCandidateProfile {
  weeklyHours: number;
  monthlyHours: number;
  consecutiveDays: number;
  preferences?: ShiftPreferenceInfo;
  lastAssignedOperationId?: number;
  lastAssignedShiftCode?: string;
}

interface OperationQualificationRequirement {
  qualificationId: number;
  minLevel: number;
}

interface HeuristicConfig {
  maxBacktrackingDepth: number;
  minPrimaryScore: number;
}

interface HeuristicHotspot {
  id: string;
  operationPlanId: number;
  operationName: string;
  planDate: string;
  /** Number of missing people after heuristic pass */
  deficit: number;
  /** How many backtracking attempts were made (currently 0 in stub) */
  attempts: number;
  reason: string;
  notes: string[];
  relatedOperations: number[];
  createdAt: string;
}

interface ShiftDefinition {
  id: number | null;
  shiftCode: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  isCrossDay: boolean;
  nominalHours: number;
}

export class SchedulingService {
  /**
   * Core entry for automatic scheduling workflow. Currently a placeholder so that
   * API contract is available for front-end integration while detailed algorithm
   * is implemented iteratively.
   */
  static async autoPlan(request: AutoPlanRequest): Promise<AutoPlanResult> {
    if (!request.batchIds || request.batchIds.length === 0) {
      throw new Error("batchIds is required");
    }

    const context = await SchedulingService.prepareContext(request);
    await SchedulingService.loadQuarterStandardHours(context);
    await SchedulingService.loadShiftDefinitions(context);
    await SchedulingService.loadEmployeeProfiles(context);
    await SchedulingService.loadEmployeeQualifications(context);
    await SchedulingService.loadShiftPreferences(context);
    await SchedulingService.loadLockedShiftPlans(context);
    await SchedulingService.loadHistoricalWorkload(context);
    await SchedulingService.loadPreviousAssignments(context);
    await SchedulingService.loadOperationQualificationRequirements(context);
    await SchedulingService.loadLockedOperations(context);
    SchedulingService.buildCandidateProfiles(context);
    await SchedulingService.generateBaseRoster(context, request.options);
    await SchedulingService.planProductionLoads(context, request.options);
    SchedulingService.ensureStandardHoursCompliance(context);
    if (request.options?.dryRun) {
      context.logs.push(
        "Dry-run mode enabled: scheduling results were not persisted.",
      );
    } else {
      await SchedulingService.persistScheduling(context);
    }

    await SchedulingService.evaluateCoverage(context);

    return {
      message:
        "Auto scheduling pipeline executed (base roster + production overlay).",
      period: context.period,
      batches: context.batches,
      warnings: context.warnings,
      summary: {
        employeesTouched: new Set([
          ...context.baseRosterAssignments.map((item) => item.employeeId),
          ...context.productionAssignments.map((item) => item.employeeId),
        ]).size,
        operationsCovered: context.operations.length,
        overtimeEntries: context.productionAssignments.filter(
          (item) => item.category === "OVERTIME",
        ).length,
        baseRosterRows: context.baseRosterAssignments.length,
        operationsAssigned: new Set(
          context.productionAssignments.map((item) => item.operationPlanId),
        ).size,
      },
      diagnostics: {
        missingCalendar:
          context.warnings.some((w) => w.includes("节假日")) || undefined,
      },
      logs: context.logs,
      coverage: SchedulingService.buildCoverageSummary(context),
      heuristicHotspots: context.heuristicHotspots,
    };
  }

  static async getWorkloadSnapshot(
    startDate: string,
    endDate: string,
  ): Promise<WorkloadSnapshotResult> {
    const period: SchedulingPeriod = {
      startDate,
      endDate,
      quarter: `${dayjs(startDate).year()}Q${dayjs(startDate).quarter()}`,
    };

    const query = `
      SELECT
        e.id AS employeeId,
        e.employee_code AS employeeCode,
        e.employee_name AS employeeName,
        COALESCE(SUM(CASE WHEN esp.plan_category = 'OVERTIME' THEN esp.plan_hours ELSE 0 END), 0) AS overtimeHours,
        COALESCE(SUM(CASE WHEN esp.plan_category <> 'OVERTIME' THEN esp.plan_hours ELSE 0 END), 0) AS regularHours,
        COUNT(DISTINCT CASE WHEN esp.plan_hours > 0 THEN esp.plan_date END) AS daysWorked
      FROM employees e
      LEFT JOIN employee_shift_plans esp
        ON esp.employee_id = e.id
       AND esp.plan_date BETWEEN ? AND ?
       AND esp.plan_state <> 'VOID'
      WHERE e.employment_status = 'ACTIVE'
      GROUP BY e.id, e.employee_code, e.employee_name
      ORDER BY e.employee_code;
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [
      startDate,
      endDate,
    ]);

    const employees: WorkloadSnapshotEntry[] = rows.map((row) => ({
      employeeId: Number(row.employeeId),
      employeeCode: String(row.employeeCode),
      employeeName: String(row.employeeName),
      totalPlannedHours: Number(row.regularHours || 0),
      totalOvertimeHours: Number(row.overtimeHours || 0),
      daysWorked: Number(row.daysWorked || 0),
      consecutiveDays: undefined,
    }));

    const warnings: string[] = [];
    if (!employees.length) {
      warnings.push(
        "选定周期内没有排班数据，可能尚未执行自动排班或数据尚未保存。",
      );
    }

    return {
      period,
      employees,
      warnings,
    };
  }

  static async recommendForOperation(
    operationPlanId: number,
  ): Promise<OperationRecommendationResult> {
    const operation =
      await SchedulingService.fetchOperationDetail(operationPlanId);
    if (!operation) {
      throw new Error("操作计划不存在或未激活");
    }

    const planDate = operation.plannedStart.slice(0, 10);
    const candidateRows =
      await SchedulingService.fetchQualificationMatchedEmployees(
        operation.operationId,
        planDate,
      );

    const busyEmployees =
      await SchedulingService.fetchEmployeesBusyOnDate(planDate);
    const busySet = new Set(busyEmployees);

    const candidates = candidateRows
      .filter((cand) => !busySet.has(cand.employeeId))
      .map((cand) => ({
        employeeId: cand.employeeId,
        employeeCode: cand.employeeCode,
        employeeName: cand.employeeName,
        matchScore: cand.matchScore,
        plannedHours: cand.plannedHours,
        overtimeRisk: cand.overtimeRisk,
      }));

    const suggestions: string[] = [];
    if (!candidates.length) {
      suggestions.push("无可用候选人，请调整班次或选择加班方案。");
    } else if (candidates.length < operation.requiredPeople) {
      suggestions.push(
        `仅找到 ${candidates.length}/${operation.requiredPeople} 名候选人，可考虑拆分或加班。`,
      );
    } else {
      suggestions.push("按匹配评分排序的候选人列表已提供，可直接择优分配。");
    }

    return {
      operationPlanId,
      operationName: operation.operationName,
      plannedStart: operation.plannedStart,
      plannedEnd: operation.plannedEnd,
      requiredPeople: operation.requiredPeople,
      candidates,
      suggestions,
    };
  }

  private static async prepareContext(
    request: AutoPlanRequest,
  ): Promise<SchedulingContext> {
    const normalizedBatchIds = request.batchIds
      .map(Number)
      .filter((id) => !Number.isNaN(id));

    const batches =
      await SchedulingService.fetchBatchWindows(normalizedBatchIds);
    if (!batches.length) {
      throw new Error("无法找到指定批次，请确认批次已激活并存在");
    }

    const period = SchedulingService.resolvePeriod(request, batches);

    const operations = await SchedulingService.fetchOperationPlans(
      normalizedBatchIds,
      period.startDate,
      period.endDate,
    );

    const warnings: string[] = [];
    if (!operations.length) {
      warnings.push("在指定周期内未找到批次操作，后续排班将仅生成基础班表");
    }

    await HolidayService.ensureCalendarCoverage(
      period.startDate,
      period.endDate,
    );

    const calendarCount = await SchedulingService.countCalendarDays(
      period.startDate,
      period.endDate,
    );
    if (calendarCount === 0) {
      warnings.push("节假日/工作日历为空，请先导入节假日数据");
    }

    return {
      period,
      batches,
      operations,
      warnings,
      logs: [],
      employees: [],
      baseRosterAssignments: [],
      productionAssignments: [],
      baseRosterIndex: new Map(),
      productionIndex: new Map(),
      employeeStats: new Map(),
      shiftDefinitions: [],
      shiftTypeLookup: new Map(),
      quarterStandardHours: undefined,
      standardHourSegments: 0,
      coverageGaps: [],
      coverageDiagnostics: new Map(),
      coverageSummary: undefined,
      candidateProfiles: new Map(),
      heuristicLogs: new Map(),
      historicalWorkload: new Map(),
      qualifiedCandidates: new Map(),
      shiftPreferences: new Map(),
      lastAssignments: new Map(),
      operationQualifications: new Map(),
      lockedOperations: new Set(),
      lockedOperationAssignments: new Map(),
      heuristicWeights: undefined,
      heuristicEngine: undefined,
      heuristicConfig: {
        maxBacktrackingDepth: 3,
        minPrimaryScore: 0,
      },
      heuristicHotspots: [],
    };
  }

  private static async loadQuarterStandardHours(context: SchedulingContext) {
    const periodStart = dayjs(context.period.startDate);
    const periodEnd = dayjs(context.period.endDate);

    let totalStandardHours = 0;
    let cursor = periodStart.startOf("quarter");
    let segmentIndex = 0;

    while (cursor.isBefore(periodEnd) || cursor.isSame(periodEnd, "day")) {
      const quarterStart = cursor;
      const quarterEnd = quarterStart.endOf("quarter");
      const segmentStart = periodStart.isAfter(quarterStart)
        ? periodStart
        : quarterStart;
      const segmentEnd = periodEnd.isBefore(quarterEnd)
        ? periodEnd
        : quarterEnd;

      if (segmentStart.isAfter(segmentEnd)) {
        cursor = quarterStart.add(1, "quarter");
        continue;
      }

      const year = quarterStart.year();
      const quarter = quarterStart.quarter();

      let segmentHours: number | undefined;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT standard_hours FROM quarterly_standard_hours WHERE year = ? AND quarter = ? LIMIT 1`,
        [year, quarter],
      );

      const coversWholeQuarter =
        segmentStart.isSame(quarterStart, "day") &&
        segmentEnd.isSame(quarterEnd, "day");

      if (rows.length && coversWholeQuarter) {
        const value = Number(rows[0].standard_hours);
        if (!Number.isNaN(value) && value > 0) {
          segmentHours = value;
        }
      }

      if (segmentHours === undefined) {
        const workdayCount = await SchedulingService.countWorkdays(
          segmentStart.format("YYYY-MM-DD"),
          segmentEnd.format("YYYY-MM-DD"),
        );
        if (workdayCount > 0) {
          segmentHours = workdayCount * 8;
        } else {
          segmentHours = 0;
        }
      }

      totalStandardHours += segmentHours;
      segmentIndex += 1;
      cursor = quarterStart.add(1, "quarter");
    }

    context.quarterStandardHours =
      totalStandardHours > 0 ? totalStandardHours : undefined;
    context.standardHourSegments = segmentIndex > 0 ? segmentIndex : 0;
    if (context.quarterStandardHours !== undefined) {
      const startLabel = `${periodStart.year()}Q${periodStart.quarter()}`;
      const endLabel = `${periodEnd.year()}Q${periodEnd.quarter()}`;
      const label =
        context.standardHourSegments === 1 && startLabel === endLabel
          ? startLabel
          : `${startLabel}~${endLabel}`;
      context.logs.push(
        `Loaded standard hours: ${context.quarterStandardHours}h for period ${label}. / 读取排程周期 ${label} 标准工时 ${context.quarterStandardHours} 小时`,
      );
    } else {
      context.warnings.push("未获取到标准工时配置，无法进行工时偏差校验。");
    }
  }

  private static ensureStandardHoursCompliance(context: SchedulingContext) {
    const quarterLimit = context.quarterStandardHours;
    if (!quarterLimit) {
      return;
    }

    const segmentCount = Math.max(context.standardHourSegments || 1, 1);
    const upperTolerance = 36 * segmentCount;
    const lowerTolerance = 4 * segmentCount;

    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        return;
      }

      const diff = stats.quarterHours - quarterLimit;
      if (diff > upperTolerance + 0.0001) {
        context.warnings.push(
          `员工 ${employee.employeeName}(${employee.employeeCode}) 本季度超出标准工时 ${diff.toFixed(1)}h，已超过允许上限 ${upperTolerance}h。`,
        );
      } else if (diff < -lowerTolerance - 0.0001) {
        context.warnings.push(
          `员工 ${employee.employeeName}(${employee.employeeCode}) 本季度少于标准工时 ${Math.abs(diff).toFixed(1)}h，已超过允许下限 ${lowerTolerance}h。`,
        );
      }
    });
  }

  private static resolvePeriod(
    request: AutoPlanRequest,
    batches: BatchWindow[],
  ): SchedulingPeriod {
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

    const start =
      explicitStart ||
      (batchStart ? batchStart.startOf("quarter") : dayjs().startOf("quarter"));
    const end =
      explicitEnd ||
      (batchEnd ? batchEnd.endOf("quarter") : dayjs().endOf("quarter"));

    const normalizedStart = start.format("YYYY-MM-DD");
    const normalizedEnd = end.format("YYYY-MM-DD");

    const startQuarter = start.quarter();
    const endQuarter = end.quarter();
    const quarterLabel =
      startQuarter === endQuarter
      ? `${start.year()}Q${startQuarter}`
      : `${start.year()}Q${startQuarter}~${end.year()}Q${endQuarter}`;

    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      quarter: quarterLabel,
    };
  }

  private static async fetchBatchWindows(
    batchIds: number[],
  ): Promise<BatchWindow[]> {
    if (!batchIds.length) {
      return [];
    }

    const placeholders = batchIds.map(() => "?").join(",");
    const query = `
      SELECT
        pbp.id AS batchPlanId,
        pbp.batch_code AS batchCode,
        MIN(bop.planned_start_datetime) AS batchStart,
        MAX(bop.planned_end_datetime) AS batchEnd,
        COUNT(bop.id) AS totalOperations
      FROM production_batch_plans pbp
      LEFT JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
      WHERE pbp.id IN (${placeholders})
      GROUP BY pbp.id, pbp.batch_code
      ORDER BY pbp.batch_code;
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, batchIds);

    return rows.map((row) => {
      const batchStart = row.batchStart as string | null;
      const batchEnd = row.batchEnd as string | null;
      return {
        batchPlanId: Number(row.batchPlanId),
        batchCode: String(row.batchCode),
        start: batchStart
          ? dayjs(batchStart).format("YYYY-MM-DD HH:mm:ss")
          : null,
        end: batchEnd ? dayjs(batchEnd).format("YYYY-MM-DD HH:mm:ss") : null,
        totalOperations: Number(row.totalOperations || 0),
      };
    });
  }

  private static async fetchOperationPlans(
    batchIds: number[],
    startDate: string,
    endDate: string,
  ): Promise<OperationPlanSummary[]> {
    if (!batchIds.length) {
      return [];
    }

    const placeholders = batchIds.map(() => "?").join(",");
    const query = `
      SELECT
        bop.id AS operationPlanId,
        bop.operation_id AS operationId,
        pbp.id AS batchPlanId,
        pbp.batch_code AS batchCode,
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
      WHERE pbp.id IN (${placeholders})
        AND bop.planned_start_datetime <= ?
        AND bop.planned_end_datetime >= ?
      ORDER BY bop.planned_start_datetime;
    `;

    const params = [
      ...batchIds,
      `${endDate} 23:59:59`,
      `${startDate} 00:00:00`,
    ];
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);

    return rows.map((row) => {
      const plannedStart = row.plannedStart as string;
      const plannedEnd = row.plannedEnd as string;
      return {
        operationPlanId: Number(row.operationPlanId),
        operationId: Number(row.operationId),
        batchPlanId: Number(row.batchPlanId),
        batchCode: String(row.batchCode),
        stageName: String(row.stageName),
        operationName: String(row.operationName),
        plannedStart: dayjs(plannedStart).format("YYYY-MM-DD HH:mm:ss"),
        plannedEnd: dayjs(plannedEnd).format("YYYY-MM-DD HH:mm:ss"),
        requiredPeople: Number(row.requiredPeople || 0),
        isLocked: Boolean(row.isLocked),
      };
    });
  }

  private static async countCalendarDays(
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const query = `
      SELECT COUNT(*) AS dayCount
      FROM calendar_workdays
      WHERE calendar_date BETWEEN ? AND ?;
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [
      startDate,
      endDate,
    ]);
    if (!rows.length) {
      return 0;
    }
    return Number(rows[0].dayCount || 0);
  }

  private static async countWorkdays(
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(is_workday), 0) AS workdayCount
      FROM calendar_workdays
      WHERE calendar_date BETWEEN ? AND ?;
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [
      startDate,
      endDate,
    ]);
    if (!rows.length) {
      return 0;
    }
    return Number(rows[0].workdayCount || 0);
  }

  private static async loadShiftDefinitions(context: SchedulingContext) {
    const shiftTypeRowsQuery = `
      SELECT id, shift_code
      FROM shift_types
      WHERE is_active = 1;
    `;
    const [shiftTypeRows] =
      await pool.execute<RowDataPacket[]>(shiftTypeRowsQuery);
    const shiftTypeLookup =
      context.shiftTypeLookup || new Map<string, number>();
    shiftTypeLookup.clear();
    const normalizeCode = (code: string) =>
      code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    shiftTypeRows.forEach((row) => {
      const rawCode = String(row.shift_code || "").toUpperCase();
      if (!rawCode) {
        return;
      }
      const id = Number(row.id);
      shiftTypeLookup.set(rawCode, id);
      shiftTypeLookup.set(normalizeCode(rawCode), id);
    });

    const query = `
      SELECT id, shift_code, shift_name, start_time, end_time, is_cross_day, nominal_hours
      FROM shift_definitions
      WHERE is_active = 1;
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    const definitions: ShiftDefinition[] = rows.map((row) => ({
      id: row.id ? Number(row.id) : null,
      shiftCode: String(row.shift_code),
      shiftName: String(row.shift_name),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      isCrossDay: Boolean(row.is_cross_day),
      nominalHours: Number(row.nominal_hours || 0),
    }));

    const ensureShift = (
      code: string,
      name: string,
      nominalHours: number,
      start: string,
      end: string,
      isCrossDay = false,
    ) => {
      if (
        !definitions.some(
          (def) => def.shiftCode.toUpperCase() === code.toUpperCase(),
        )
      ) {
        context.logs.push(
          `Shift definition ${code} not found, using fallback.`,
        );
        definitions.push({
          id: null,
          shiftCode: code,
          shiftName: name,
          startTime: start,
          endTime: end,
          isCrossDay,
          nominalHours,
        });
      }
    };

    ensureShift("DAY", "常日班", 8, "08:30:00", "17:00:00");
    ensureShift("LONGDAY", "长白班", 11, "08:30:00", "21:00:00");
    ensureShift("NIGHT", "夜班", 11, "20:30:00", "09:00:00", true);

    const aliasMappings: Array<[string, string[]]> = [
      ["DAY", ["DAY_SHIFT", "DAYSHIFT"]],
      ["LONGDAY", ["LONG_DAY_SHIFT", "LONGDAY_SHIFT", "LONGDAYSHIFT"]],
      ["NIGHT", ["NIGHT_SHIFT", "NIGHTSHIFT"]],
    ];
    aliasMappings.forEach(([code, aliases]) => {
      const codeUpper = code.toUpperCase();
      const normalizedCode = normalizeCode(codeUpper);
      if (
        !shiftTypeLookup.has(codeUpper) &&
        !shiftTypeLookup.has(normalizedCode)
      ) {
        for (const alias of aliases) {
          const aliasUpper = alias.toUpperCase();
          const aliasNormalized = normalizeCode(aliasUpper);
          const found =
            shiftTypeLookup.get(aliasUpper) ||
            shiftTypeLookup.get(aliasNormalized);
          if (found) {
            shiftTypeLookup.set(codeUpper, found);
            shiftTypeLookup.set(normalizedCode, found);
            break;
          }
        }
      } else {
        const existing =
          shiftTypeLookup.get(codeUpper) || shiftTypeLookup.get(normalizedCode);
        if (existing) {
          shiftTypeLookup.set(codeUpper, existing);
          shiftTypeLookup.set(normalizedCode, existing);
        }
      }
    });

    context.shiftDefinitions = definitions;
    context.shiftTypeLookup = shiftTypeLookup;
  }

  private static async loadEmployeeProfiles(context: SchedulingContext) {
    const query = `
      SELECT id AS employeeId, employee_code AS employeeCode, employee_name AS employeeName, department, position AS role
      FROM employees
      WHERE employment_status = 'ACTIVE'
      ORDER BY employee_code;
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    const quarterStandardHours = context.quarterStandardHours;
    context.employees = rows.map((row) => ({
      employeeId: Number(row.employeeId),
      employeeCode: String(row.employeeCode),
      employeeName: String(row.employeeName),
      department: row.department ? String(row.department) : undefined,
      role: row.role ? String(row.role) : undefined,
      limits: {
        quarterStandardHours,
        monthStandardHours: undefined,
        maxDailyHours: 11,
        maxConsecutiveDays: 6,
      },
      qualifications: [],
    }));

    context.employeeStats = new Map();
    context.employees.forEach((employee) => {
      context.employeeStats.set(employee.employeeId, {
        quarterHours: 0,
        monthHours: new Map(),
        dailyHours: new Map(),
        consecutiveDays: 0,
      });
    });

    if (!context.employees.length) {
      context.warnings.push("没有找到在职员工，无法生成排班。");
    }
  }

  private static async loadEmployeeQualifications(context: SchedulingContext) {
    if (!context.employees.length) {
      return;
    }

    const employeeIds = context.employees.map((emp) => emp.employeeId);
    const placeholders = employeeIds.map(() => "?").join(",");
    const query = `
      SELECT eq.employee_id AS employeeId,
             eq.qualification_id AS qualificationId,
             eq.qualification_level AS qualificationLevel
        FROM employee_qualifications eq
       WHERE eq.employee_id IN (${placeholders})
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, employeeIds);
    const qualificationMap = new Map<number, EmployeeQualification[]>();
    rows.forEach((row) => {
      const employeeId = Number(row.employeeId);
      const collection = qualificationMap.get(employeeId) || [];
      collection.push({
        qualificationId: Number(row.qualificationId),
        qualificationLevel: Number(row.qualificationLevel || 0),
      });
      qualificationMap.set(employeeId, collection);
    });

    context.employees.forEach((employee) => {
      employee.qualifications = qualificationMap.get(employee.employeeId) || [];
    });
  }

  private static async loadShiftPreferences(context: SchedulingContext) {
    context.shiftPreferences.clear();

    if (!context.employees.length) {
      return;
    }

    const employeeIds = context.employees.map((emp) => emp.employeeId);
    const placeholders = employeeIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const query = `
      SELECT esp.employee_id AS employeeId,
             st.shift_code AS shiftCode,
             esp.preference_score AS preferenceScore,
             esp.is_available AS isAvailable
        FROM employee_shift_preferences esp
        JOIN shift_types st ON st.id = esp.shift_type_id
       WHERE esp.employee_id IN (${placeholders})
    `;

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(query, employeeIds);
      const bucketMap = new Map<
        number,
        {
          shiftScores: Array<{ code: string; score: number }>;
          nightScores: number[];
        }
      >();

      rows.forEach((row) => {
        const employeeId = Number(row.employeeId);
        if (!employeeId) {
          return;
        }

        const rawCode = row.shiftCode
          ? String(row.shiftCode).trim().toUpperCase()
          : "";
        if (!rawCode) {
          return;
        }

        const isAvailable =
          row.isAvailable === null || Number(row.isAvailable) !== 0;
        if (!isAvailable) {
          return;
        }

        const score = Number(row.preferenceScore ?? 0);
        const bucket = bucketMap.get(employeeId) || {
          shiftScores: [],
          nightScores: [],
        };
        bucket.shiftScores.push({ code: rawCode, score });
        if (rawCode.includes("NIGHT")) {
          bucket.nightScores.push(score);
        }
        bucketMap.set(employeeId, bucket);
      });

      bucketMap.forEach((bucket, employeeId) => {
        const preferred = bucket.shiftScores
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((item) => item.code);

        let nightShiftWillingness: number | undefined;
        if (bucket.nightScores.length) {
          const maxScore = bucket.nightScores.reduce(
            (acc, value) => Math.max(acc, value),
            -10,
          );
          const bounded = Math.max(-10, Math.min(10, maxScore));
          nightShiftWillingness = Number(((bounded + 10) / 20).toFixed(2));
        }

        const info: ShiftPreferenceInfo = {};
        if (preferred.length) {
          info.preferredShifts = preferred;
        }
        if (nightShiftWillingness !== undefined) {
          info.nightShiftWillingness = nightShiftWillingness;
        }

        if (info.preferredShifts || info.nightShiftWillingness !== undefined) {
          context.shiftPreferences.set(employeeId, info);
        }
      });

      if (context.shiftPreferences.size) {
        context.logs.push(
          `Loaded shift preferences for ${context.shiftPreferences.size} employees. / 已载入 ${context.shiftPreferences.size} 名员工的班次偏好`,
        );
      }
    } catch (error) {
      context.warnings.push("加载班次偏好失败，评分模型将使用默认偏好。");
      context.logs.push(
        `Failed to load shift preferences: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static async loadHistoricalWorkload(context: SchedulingContext) {
    context.historicalWorkload.clear();

    if (!context.employees.length) {
      return;
    }

    const employeeIds = context.employees.map((emp) => emp.employeeId);
    const placeholders = employeeIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const periodStart = dayjs(context.period.startDate);
    if (!periodStart.isValid()) {
      return;
    }

    const historyEnd = periodStart.subtract(1, "day");
    const start30 = historyEnd.subtract(29, "day");
    const start7 = historyEnd.subtract(6, "day");

    const endDateStr = historyEnd.format("YYYY-MM-DD");
    const start30Str = start30.format("YYYY-MM-DD");

    const query = `
      SELECT esp.employee_id AS employeeId,
             esp.plan_date AS planDate,
             SUM(esp.plan_hours) AS totalHours
        FROM employee_shift_plans esp
       WHERE esp.plan_state <> 'VOID'
         AND esp.employee_id IN (${placeholders})
         AND esp.plan_date BETWEEN ? AND ?
       GROUP BY esp.employee_id, esp.plan_date
       ORDER BY esp.employee_id, esp.plan_date;
    `;

    try {
      const params = [...employeeIds, start30Str, endDateStr];
      const [rows] = await pool.execute<RowDataPacket[]>(query, params);

      const dayBuckets = new Map<number, Map<string, number>>();
      rows.forEach((row) => {
        const employeeId = Number(row.employeeId);
        if (!employeeId) {
          return;
        }
        const dateKey = row.planDate
          ? dayjs(row.planDate).format("YYYY-MM-DD")
          : null;
        if (!dateKey) {
          return;
        }
        const hours = Number(row.totalHours || 0);
        const bucket = dayBuckets.get(employeeId) || new Map<string, number>();
        bucket.set(dateKey, (bucket.get(dateKey) || 0) + hours);
        dayBuckets.set(employeeId, bucket);
      });

      employeeIds.forEach((employeeId) => {
        const dayMap = dayBuckets.get(employeeId) || new Map<string, number>();
        let last7Hours = 0;
        let last30Hours = 0;

        dayMap.forEach((hours, dateKey) => {
          const date = dayjs(dateKey);
          if (
            date.isSameOrAfter(start30, "day") &&
            date.isSameOrBefore(historyEnd, "day")
          ) {
            last30Hours += hours;
          }
          if (
            date.isSameOrAfter(start7, "day") &&
            date.isSameOrBefore(historyEnd, "day")
          ) {
            last7Hours += hours;
          }
        });

        let consecutive = 0;
        let cursor = historyEnd;
        while (cursor.isSameOrAfter(start30, "day")) {
          const key = cursor.format("YYYY-MM-DD");
          const hours = dayMap.get(key) || 0;
          if (hours > 0) {
            consecutive += 1;
            cursor = cursor.subtract(1, "day");
          } else {
            break;
          }
        }

        context.historicalWorkload.set(employeeId, {
          last7DaysHours: Number(
            (Math.round(last7Hours * 100) / 100).toFixed(2),
          ),
          last30DaysHours: Number(
            (Math.round(last30Hours * 100) / 100).toFixed(2),
          ),
          recentConsecutiveDays: consecutive,
        });
      });

      if (context.historicalWorkload.size) {
        context.logs.push(
          `Loaded historical workload stats for ${context.historicalWorkload.size} employees (lookback start ${start30Str}). / 已载入 ${context.historicalWorkload.size} 名员工近30天工时`,
        );
      }
    } catch (error) {
      context.warnings.push("加载历史工时统计失败，评分模型将使用实时工时。");
      context.logs.push(
        `Failed to load historical workload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static async loadPreviousAssignments(context: SchedulingContext) {
    context.lastAssignments.clear();

    if (!context.employees.length) {
      return;
    }

    const employeeIds = context.employees.map((emp) => emp.employeeId);
    const placeholders = employeeIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const cutoffDate = dayjs(context.period.startDate).format("YYYY-MM-DD");
    const query = `
      SELECT esp.employee_id AS employeeId,
             esp.plan_date AS planDate,
             esp.batch_operation_plan_id AS operationPlanId,
             sd.shift_code AS shiftCode
        FROM employee_shift_plans esp
        LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE esp.employee_id IN (${placeholders})
         AND esp.plan_state <> 'VOID'
         AND esp.plan_category IN ('PRODUCTION', 'OVERTIME')
         AND esp.batch_operation_plan_id IS NOT NULL
         AND esp.plan_date < ?
       ORDER BY esp.employee_id, esp.plan_date DESC;
    `;

    try {
      const params = [...employeeIds, cutoffDate];
      const [rows] = await pool.execute<RowDataPacket[]>(query, params);

      rows.forEach((row) => {
        const employeeId = Number(row.employeeId);
        if (!employeeId || context.lastAssignments.has(employeeId)) {
          return;
        }

        const operationPlanId = row.operationPlanId
          ? Number(row.operationPlanId)
          : undefined;
        const shiftCode = row.shiftCode
          ? String(row.shiftCode).trim().toUpperCase()
          : undefined;
        const planDate = row.planDate
          ? dayjs(row.planDate).format("YYYY-MM-DD")
          : undefined;

        context.lastAssignments.set(employeeId, {
          lastOperationId: operationPlanId,
          lastShiftCode: shiftCode,
          lastPlanDate: planDate,
        });
      });

      if (context.lastAssignments.size) {
        context.logs.push(
          `Loaded previous assignment snapshots for ${context.lastAssignments.size} employees. / 已载入 ${context.lastAssignments.size} 名员工的历史指派`,
        );
      }
    } catch (error) {
      context.warnings.push("加载历史指派信息失败，最小扰动评分可能不准确。");
      context.logs.push(
        `Failed to load previous assignments: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static async loadLockedShiftPlans(context: SchedulingContext) {
    context.baseRosterAssignments = context.baseRosterAssignments.filter(
      (assignment) => assignment.source !== "LOCKED",
    );
    context.baseRosterIndex.clear();
    context.productionAssignments = context.productionAssignments.filter(
      (assignment) => !assignment.locked,
    );
    context.productionIndex.clear();
    context.lockedOperationAssignments.clear();

    if (!context.employees.length) {
      return;
    }

    const employeeIds = context.employees.map((emp) => emp.employeeId);
    const placeholders = employeeIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const query = `
      SELECT esp.id AS shiftPlanId,
             esp.employee_id AS employeeId,
             esp.plan_date AS planDate,
             esp.plan_category AS planCategory,
             esp.plan_hours AS planHours,
             esp.overtime_hours AS overtimeHours,
             esp.batch_operation_plan_id AS operationPlanId,
             esp.shift_id AS shiftId,
             sd.shift_code AS shiftCode
        FROM employee_shift_plans esp
        LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE esp.employee_id IN (${placeholders})
         AND esp.plan_date BETWEEN ? AND ?
         AND (esp.plan_state = 'LOCKED' OR IFNULL(esp.is_locked, 0) = 1)
    `;

    const params = [
      ...employeeIds,
      context.period.startDate,
      context.period.endDate,
    ];

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      if (!rows.length) {
        return;
      }

      const shiftCodeFallback = (row: any): string => {
        const category = String(row.planCategory || "").toUpperCase();
        if (category === "REST") {
          return "REST";
        }
        const code = row.shiftCode ? String(row.shiftCode).toUpperCase() : "";
        if (code) {
          return code;
        }
        if (category === "OVERTIME") {
          return "OVERTIME";
        }
        if (category === "PRODUCTION") {
          return "PRODUCTION";
        }
        return "DAY";
      };

      rows.forEach((row) => {
        const employeeId = Number(row.employeeId);
        const planDate = row.planDate
          ? dayjs(row.planDate).format("YYYY-MM-DD")
          : null;
        if (!employeeId || !planDate) {
          return;
        }

        const planCategory = String(row.planCategory || "BASE").toUpperCase();
        const shiftNominalHours = (() => {
          const shiftId = row.shiftId ? Number(row.shiftId) : null;
          if (!shiftId) {
            return 0;
          }
          const matched = context.shiftDefinitions.find(
            (def) => def.id === shiftId,
          );
          return matched ? matched.nominalHours : 0;
        })();

        const baseAssignment: BaseRosterAssignment = {
          employeeId,
          planDate,
          shiftCode: shiftCodeFallback(row),
          planHours:
            planCategory === "REST"
              ? 0
              : Number(
                  row.planHours !== null && row.planHours !== undefined
                    ? row.planHours
                    : shiftNominalHours,
                ),
          source: "LOCKED",
        };

        if (planCategory === "BASE" || planCategory === "REST") {
          context.baseRosterAssignments.push(baseAssignment);
          SchedulingService.indexBaseAssignment(context, baseAssignment);
        }

        if (planCategory === "PRODUCTION" || planCategory === "OVERTIME") {
          const productionHours = Number(row.planHours ?? 0);
          const overtimeHours = Number(row.overtimeHours ?? 0);
          const assignment: ProductionAssignment = {
            operationPlanId: row.operationPlanId
              ? Number(row.operationPlanId)
              : 0,
            employeeId,
            planDate,
            shiftCode: shiftCodeFallback(row),
            category: planCategory === "OVERTIME" ? "OVERTIME" : "PRODUCTION",
            planHours:
              planCategory === "OVERTIME" && overtimeHours > 0
                ? overtimeHours
                : Math.max(productionHours, overtimeHours),
            locked: true,
          };
          context.productionAssignments.push(assignment);
          SchedulingService.indexProductionAssignment(context, assignment);

          if (assignment.operationPlanId) {
            const bucket =
              context.lockedOperationAssignments.get(
                assignment.operationPlanId,
              ) || new Set<number>();
            bucket.add(employeeId);
            context.lockedOperationAssignments.set(
              assignment.operationPlanId,
              bucket,
            );
          }
        }
      });

      context.logs.push(
        `Loaded ${rows.length} locked shift plans within scheduling window. / 已加载 ${rows.length} 条锁定班次`,
      );
    } catch (error) {
      context.warnings.push("加载锁定班次失败，系统将忽略锁定信息。");
      context.logs.push(
        `Failed to load locked shift plans: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private static async loadOperationQualificationRequirements(
    context: SchedulingContext,
  ) {
    context.operationQualifications.clear();

    if (!context.operations.length) {
      return;
    }

    const planIds = context.operations.map((op) => op.operationPlanId);
    const placeholders = planIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const query = `
      SELECT bop.id AS operationPlanId,
             oqr.qualification_id AS qualificationId,
             oqr.min_level AS minLevel
        FROM batch_operation_plans bop
        LEFT JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
       WHERE bop.id IN (${placeholders})
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, planIds);
    planIds.forEach((planId) => {
      context.operationQualifications.set(planId, []);
    });

    rows.forEach((row) => {
      const planId = Number(row.operationPlanId);
      if (!context.operationQualifications.has(planId)) {
        context.operationQualifications.set(planId, []);
      }
      if (row.qualificationId !== null && row.qualificationId !== undefined) {
        context.operationQualifications.get(planId)!.push({
          qualificationId: Number(row.qualificationId),
          minLevel: Number(row.minLevel ?? 0),
        });
      }
    });

    if (context.operationQualifications.size) {
      context.logs.push(
        `Loaded qualification requirements for ${context.operationQualifications.size} operations. / 已加载 ${context.operationQualifications.size} 个操作的资质要求`,
      );
    }
  }

  private static async loadLockedOperations(context: SchedulingContext) {
    context.lockedOperations.clear();

    if (!context.operations.length) {
      return;
    }

    const operationIds = context.operations.map((op) => op.operationPlanId);
    const placeholders = operationIds.map(() => "?").join(",");
    if (!placeholders) {
      return;
    }

    const query = `
      SELECT id
        FROM batch_operation_plans
       WHERE id IN (${placeholders})
         AND IFNULL(is_locked, 0) = 1
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, operationIds);

    rows.forEach((row) => {
      const id = Number(row.id);
      if (Number.isFinite(id)) {
        context.lockedOperations.add(id);
      }
    });

    if (!context.lockedOperations.size) {
      return;
    }

    context.operations.forEach((op) => {
      op.isLocked = context.lockedOperations.has(op.operationPlanId);
    });

    const lockedIds = Array.from(context.lockedOperations.values());
    const lockedPlaceholders = lockedIds.map(() => "?").join(",");

    const [assignmentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT batch_operation_plan_id AS operationPlanId,
              employee_id AS employeeId
         FROM batch_personnel_assignments
        WHERE batch_operation_plan_id IN (${lockedPlaceholders})
          AND assignment_status IN ('PLANNED', 'CONFIRMED')`,
      lockedIds,
    );

    assignmentRows.forEach((row) => {
      const planId = Number(row.operationPlanId);
      const employeeId = Number(row.employeeId);
      if (!planId || !employeeId) {
        return;
      }
      const bucket = context.lockedOperationAssignments.get(planId) || new Set<number>();
      bucket.add(employeeId);
      context.lockedOperationAssignments.set(planId, bucket);
    });

    context.logs.push(
      `Detected ${context.lockedOperations.size} locked operations. / 检测到 ${context.lockedOperations.size} 个锁定操作`,
    );
  }

  private static buildCandidateProfiles(context: SchedulingContext) {
    context.candidateProfiles.clear();

    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      const preferences = context.shiftPreferences.get(employee.employeeId);
      const lastAssignment = context.lastAssignments.get(employee.employeeId);
      const workload = context.historicalWorkload.get(employee.employeeId);

      const profile: CandidateProfile = {
        employeeId: employee.employeeId,
        employeeCode: employee.employeeCode,
        employeeName: employee.employeeName,
        department: employee.department,
        role: employee.role,
        qualifications: employee.qualifications,
        weeklyHours: workload?.last7DaysHours ?? 0,
        monthlyHours: workload?.last30DaysHours ?? 0,
        consecutiveDays:
          stats?.consecutiveDays ?? workload?.recentConsecutiveDays ?? 0,
        preferences,
        lastAssignedOperationId: lastAssignment?.lastOperationId,
        lastAssignedShiftCode: lastAssignment?.lastShiftCode,
      };

      context.candidateProfiles.set(employee.employeeId, profile);
    });

    if (context.candidateProfiles.size) {
      context.logs.push(
        `Candidate profiles constructed for ${context.candidateProfiles.size} employees. / 已构建 ${context.candidateProfiles.size} 名员工的候选画像`,
      );
    }
  }

  private static ensureHeuristicEngine(
    context: SchedulingContext,
  ): HeuristicScoringService {
    if (!context.heuristicEngine) {
      const weights = context.heuristicWeights ?? DEFAULT_SCORING_WEIGHTS;
      context.heuristicWeights = { ...weights };
      context.heuristicEngine = new HeuristicScoringService(weights);
    }
    return context.heuristicEngine;
  }

  private static runHeuristicSelection(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    candidateEmployeeIds: number[],
    shift: ShiftDefinition | undefined,
  ): OperationHeuristicDiagnostics {
    const engine = SchedulingService.ensureHeuristicEngine(context);
    const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");

    const candidateProfiles: CandidateProfile[] = candidateEmployeeIds
      .map((employeeId) => context.candidateProfiles.get(employeeId))
      .filter((profile): profile is CandidateProfile => Boolean(profile));

    const opContext = SchedulingService.resolveOperationContext(
      context,
      operation,
      shift,
    );
    const scored = engine.scoreCandidates(candidateProfiles, opContext);

    const requiredPeople = Math.max(operation.requiredPeople, 1);
    const selected = scored
      .slice(0, requiredPeople)
      .map((item) => item.candidate.employeeId);

    const diagnostic: OperationHeuristicDiagnostics = {
      operationPlanId: operation.operationPlanId,
      planDate,
      requiredPeople,
      candidateScores: scored,
      selectedEmployeeIds: selected,
      timestamp: dayjs().toISOString(),
    };

    if (selected.length < requiredPeople) {
      diagnostic.fallbackReason = "INSUFFICIENT_CANDIDATES";
      diagnostic.notes = [`仅选出 ${selected.length}/${requiredPeople} 人`];
    }

    return diagnostic;
  }

  private static applyBacktrackingIfNeeded(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    baseDiagnostic: OperationHeuristicDiagnostics,
    candidateEmployeeIds: number[],
    shift: ShiftDefinition | undefined,
    productionHours: number,
    overtimeHours: number,
  ): {
    selectedEmployeeIds: number[];
    diagnostic: OperationHeuristicDiagnostics;
  } {
    const config = context.heuristicConfig || {
      maxBacktrackingDepth: 0,
      minPrimaryScore: 0,
    };
    const candidateScores = baseDiagnostic.candidateScores;
    const topScore = candidateScores.length
      ? candidateScores[0].totalScore
      : -Infinity;
    const requiredPeople = Math.max(operation.requiredPeople, 1);

    const needsHotspot =
      baseDiagnostic.selectedEmployeeIds.length < requiredPeople ||
      topScore < config.minPrimaryScore;

    if (!needsHotspot || config.maxBacktrackingDepth <= 0) {
      return {
        selectedEmployeeIds: baseDiagnostic.selectedEmployeeIds,
        diagnostic: baseDiagnostic,
      };
    }

    const diagnosticWithNotes: OperationHeuristicDiagnostics = {
      ...baseDiagnostic,
      backtrackingAttempted: true,
      backtrackingDepth: 0,
      notes: [...(baseDiagnostic.notes || []), "候选不足，标记热点待人工处理"],
    };
    const hotspot = SchedulingService.createHotspot(
      context,
      operation,
      diagnosticWithNotes,
      0,
    );
    context.heuristicHotspots.push(hotspot);

    return {
      selectedEmployeeIds: baseDiagnostic.selectedEmployeeIds,
      diagnostic: diagnosticWithNotes,
    };
  }

  private static createHotspot(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    diagnostic: OperationHeuristicDiagnostics,
    attempts: number,
  ): HeuristicHotspot {
    const deficit = Math.max(
      0,
      diagnostic.requiredPeople - diagnostic.selectedEmployeeIds.length,
    );
    const reason = diagnostic.fallbackReason || "UNRESOLVED";
    const relatedOps: number[] = [];

    return {
      id: randomUUID(),
      operationPlanId: operation.operationPlanId,
      operationName: operation.operationName,
      planDate: dayjs(operation.plannedStart).format("YYYY-MM-DD"),
      deficit,
      attempts,
      reason,
      notes: diagnostic.notes || [],
      relatedOperations: relatedOps,
      createdAt: dayjs().toISOString(),
    };
  }

  private static resolveOperationContext(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    shift: ShiftDefinition | undefined,
  ): HeuristicOperationContext {
    const requirements =
      context.operationQualifications.get(operation.operationPlanId) || [];

    return {
      operationPlanId: operation.operationPlanId,
      operationId: operation.operationId,
      operationName: operation.operationName,
      stageName: operation.stageName,
      requiredPeople: Math.max(operation.requiredPeople, 1),
      requiredQualifications: requirements.map((item) => ({
        qualificationId: item.qualificationId,
        minLevel: item.minLevel,
      })),
      startTime: operation.plannedStart,
      endTime: operation.plannedEnd,
      shiftCode:
        shift?.shiftCode ??
        SchedulingService.deriveShiftCodeFromOperation(context, operation),
      isCritical: SchedulingService.isCriticalOperation(operation),
    };
  }

  private static deriveShiftCodeFromOperation(
    context: SchedulingContext,
    operation: OperationPlanSummary,
  ): string | undefined {
    const definitions = context.shiftDefinitions;
    if (!definitions.length) {
      return undefined;
    }

    const start = dayjs(operation.plannedStart);
    const end = dayjs(operation.plannedEnd);
    const duration = Math.max(end.diff(start, "hour", true), 0);

    const night = definitions.find(
      (def) => def.shiftCode.toUpperCase() === "NIGHT",
    );
    const long = definitions.find(
      (def) => def.shiftCode.toUpperCase() === "LONGDAY",
    );
    const day = definitions.find(
      (def) => def.shiftCode.toUpperCase() === "DAY",
    );

    if (duration >= (night?.nominalHours ?? 11) || start.hour() >= 19) {
      return night?.shiftCode ?? long?.shiftCode ?? day?.shiftCode;
    }
    if (duration >= (long?.nominalHours ?? 11) || end.hour() >= 21) {
      return long?.shiftCode ?? day?.shiftCode;
    }
    return day?.shiftCode ?? definitions[0].shiftCode;
  }

  private static isCriticalOperation(operation: OperationPlanSummary): boolean {
    const name = operation.operationName.toUpperCase();
    return (
      name.includes("关键") ||
      name.includes("CRITICAL") ||
      name.includes("CORE") ||
      name.includes("核心")
    );
  }

  private static async generateBaseRoster(
    context: SchedulingContext,
    options: AutoPlanRequest["options"],
  ) {
    context.logs.push(
      `Generating base roster from ${context.period.startDate} to ${context.period.endDate}. / 生成基础班表：${context.period.startDate} ~ ${context.period.endDate}`,
    );

    if (!context.employees.length) {
      context.logs.push("跳过基础班表生成：无可用员工。");
      return;
    }

    if (options?.dryRun) {
      context.logs.push(
        "Dry-run mode: base roster generation skipped. / 干跑模式：跳过基础班表生成",
      );
      return;
    }

    const calendarQuery = `
      SELECT calendar_date, is_workday
      FROM calendar_workdays
      WHERE calendar_date BETWEEN ? AND ?
      ORDER BY calendar_date;
    `;
    const [dateRows] = await pool.execute<RowDataPacket[]>(calendarQuery, [
      context.period.startDate,
      context.period.endDate,
    ]);
    if (!dateRows.length) {
      context.logs.push(
        "未在工作日历中找到目标周期的日期 / No calendar records found for target period",
      );
      return;
    }

    const dayShift = context.shiftDefinitions.find(
      (def) => def.shiftCode.toUpperCase() === "DAY",
    );
    const defaultShiftCode = dayShift?.shiftCode || "DAY";
    const defaultShiftHours = dayShift?.nominalHours || 8;

    dateRows.forEach((row) => {
      const planDate = dayjs(row.calendar_date).format("YYYY-MM-DD");
      const isWorkday = Boolean(row.is_workday);
      context.employees.forEach((employee) => {
        const stats = context.employeeStats.get(employee.employeeId);
        if (!stats) {
          return;
        }

        const limit = employee.limits;
        const maxDailyHours = limit?.maxDailyHours ?? defaultShiftHours;
        const monthKey = planDate.slice(0, 7);
        const todayAssignments = context.baseRosterIndex.get(planDate) || [];
        const lockedAssignment = todayAssignments.find(
          (item) =>
            item.source === "LOCKED" && item.employeeId === employee.employeeId,
        );

        if (lockedAssignment) {
          SchedulingService.applyLockedBaseAssignment(
            stats,
            lockedAssignment,
            planDate,
            monthKey,
          );
          return;
        }

        if (!isWorkday) {
          stats.consecutiveDays = 0;
          stats.dailyHours.set(planDate, 0);
          const restAssignment: BaseRosterAssignment = {
            employeeId: employee.employeeId,
            planDate,
            shiftCode: "REST",
            planHours: 0,
            source: "AUTO_BASE",
          };
          context.baseRosterAssignments.push(restAssignment);
          SchedulingService.indexBaseAssignment(context, restAssignment);
          return;
        }

        if (limit && stats.consecutiveDays >= limit.maxConsecutiveDays) {
          stats.consecutiveDays = 0;
          stats.dailyHours.set(planDate, 0);
          const forcedRest: BaseRosterAssignment = {
            employeeId: employee.employeeId,
            planDate,
            shiftCode: "REST",
            planHours: 0,
            source: "AUTO_BASE",
          };
          context.baseRosterAssignments.push(forcedRest);
          SchedulingService.indexBaseAssignment(context, forcedRest);
          context.logs.push(
            `Employee ${employee.employeeCode} forced rest on ${planDate} due to consecutive limit. / 员工 ${employee.employeeCode} 连续上限已达，在 ${planDate} 强制休息`,
          );
          return;
        }

        const rosterHours = Math.min(defaultShiftHours, maxDailyHours);

        const assignment: BaseRosterAssignment = {
          employeeId: employee.employeeId,
          planDate,
          shiftCode: defaultShiftCode,
          planHours: rosterHours,
          source: "AUTO_BASE",
        };
        context.baseRosterAssignments.push(assignment);
        SchedulingService.indexBaseAssignment(context, assignment);

        stats.quarterHours += rosterHours;
        stats.monthHours.set(
          monthKey,
          (stats.monthHours.get(monthKey) || 0) + rosterHours,
        );
        stats.dailyHours.set(planDate, rosterHours);
        stats.consecutiveDays += 1;
      });
    });

    context.logs.push(
      `Base roster drafted for ${context.employees.length} employees across ${dateRows.length} days. / 基础班表草拟：共 ${context.employees.length} 人，${dateRows.length} 天`,
    );
  }

  private static async planProductionLoads(
    context: SchedulingContext,
    options: AutoPlanRequest["options"],
  ) {
    context.logs.push(
      `Processing ${context.operations.length} operations for production overlay. / 正在叠加生产任务：共 ${context.operations.length} 个操作`,
    );
    if (context.operations.length === 0) {
      context.logs.push("No operations to schedule. / 无需排程的操作");
      return;
    }
    const isDryRun = Boolean(options?.dryRun);
    if (isDryRun) {
      context.logs.push(
        "Dry-run mode: overlay results retained in-memory only. / 干跑模式：仅生成内存排程结果",
      );
    }

    const qualifiedMap =
      await SchedulingService.fetchQualifiedCandidatesForOperations(context);
    context.qualifiedCandidates = qualifiedMap;
    let operationsAssigned = 0;

    for (const operation of context.operations) {
      const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");
      const requiredPeople = Math.max(operation.requiredPeople, 1);

      if (context.lockedOperations.has(operation.operationPlanId)) {
        const manualSet =
          context.lockedOperationAssignments.get(operation.operationPlanId) ||
          new Set<number>();
        const manualAssigned = Array.from(manualSet.values());
        const diagnostics = SchedulingService.ensureCoverageDiagnostics(context, {
          operationPlanId: operation.operationPlanId,
          planDate,
          requiredPeople,
          batchPlanId: operation.batchPlanId,
          batchCode: operation.batchCode,
          stageName: operation.stageName,
          operationId: operation.operationId,
          operationName: operation.operationName,
          availableHeadcount: SchedulingService.calculateAvailableHeadcount(
            context,
            planDate,
          ),
          qualifiedPoolSize: manualAssigned.length,
          availableQualified: manualAssigned.length,
          candidateEmployeeIds: manualAssigned.slice(),
          assignedEmployeeIds: manualAssigned.slice(),
        });
        diagnostics.notes = [
          ...(diagnostics.notes || []),
          manualAssigned.length
            ? "操作已锁定，保留手动分配 / Operation locked, keep manual assignments"
            : "操作已锁定但无人员分配 / Operation locked without assignees",
        ];
        if (!manualAssigned.length) {
          diagnostics.fallbackReason = "LOCKED_WITHOUT_ASSIGNEES";
        }
        context.logs.push(
          `Operation ${operation.operationPlanId} (${operation.operationName}) is locked; skipping auto assignment. / 操作 ${operation.operationName} 已锁定，跳过自动排班`,
        );
        continue;
      }

      const { shift, productionHours, overtimeHours } =
        SchedulingService.determineShiftForOperation(context, operation);
      const qualifiedSet = qualifiedMap.get(operation.operationPlanId);

      const availableHeadcount = SchedulingService.calculateAvailableHeadcount(
        context,
        planDate,
      );
      const candidateEmployees = SchedulingService.findCandidateEmployees(
        context,
        operation,
        shift,
        productionHours,
        overtimeHours,
        qualifiedSet,
      );
      const diagnostics = SchedulingService.ensureCoverageDiagnostics(context, {
        operationPlanId: operation.operationPlanId,
        planDate,
        requiredPeople,
        batchPlanId: operation.batchPlanId,
        batchCode: operation.batchCode,
        stageName: operation.stageName,
        operationId: operation.operationId,
        operationName: operation.operationName,
        availableHeadcount,
        qualifiedPoolSize: qualifiedSet
          ? qualifiedSet.size
          : context.employees.length,
        availableQualified: candidateEmployees.length,
        candidateEmployeeIds: candidateEmployees.slice(),
        assignedEmployeeIds: [],
      });
      context.logs.push(
        `Operation ${operation.operationPlanId} (${operation.operationName}) on ${planDate} requires ${operation.requiredPeople} people, found ${candidateEmployees.length} candidate(s).` +
          ` / 操作 ${operation.operationName}（ID=${operation.operationPlanId}，${planDate}）需 ${operation.requiredPeople} 人，候选 ${candidateEmployees.length}`,
      );

      if (!candidateEmployees.length) {
        context.warnings.push(
          `操作 ${operation.operationName} 在 ${planDate} 缺少可分配人员，请手动处理 / Operation ${operation.operationName} lacks candidates on ${planDate}`,
        );
      }

      const heuristicDiagnostics = SchedulingService.runHeuristicSelection(
        context,
        operation,
        candidateEmployees,
        shift,
      );
      const { selectedEmployeeIds: selected, diagnostic } =
        SchedulingService.applyBacktrackingIfNeeded(
          context,
          operation,
          heuristicDiagnostics,
          candidateEmployees,
          shift,
          productionHours,
          overtimeHours,
        );
      context.heuristicLogs.set(operation.operationPlanId, diagnostic);

      if (selected.length < requiredPeople) {
        context.warnings.push(
          `操作 ${operation.operationName} 在 ${planDate} 仅分配到 ${selected.length}/${requiredPeople} 人 / Assigned ${selected.length}/${requiredPeople} for ${operation.operationName}`,
        );
      }

      if (selected.length > 0) {
        operationsAssigned += 1;
      }

      const previouslyAssigned = context.productionIndex.get(planDate) || [];
      const assignedIds = new Set(
        previouslyAssigned.map((assignment) => assignment.employeeId),
      );

      selected.forEach((employeeId) => {
        const stats = context.employeeStats.get(employeeId);
        if (!stats) {
          return;
        }

        if (assignedIds.has(employeeId)) {
          return;
        }

        diagnostics.assignedEmployeeIds.push(employeeId);

        const baseAssignments = context.baseRosterIndex.get(planDate) || [];
        const baseAssignment = baseAssignments.find(
          (item) => item.employeeId === employeeId,
        );
        if (baseAssignment) {
          const originalHours = baseAssignment.planHours;
          if (shift && baseAssignment.shiftCode !== shift.shiftCode) {
            baseAssignment.shiftCode = shift.shiftCode;
          }
          if (shift && baseAssignment.planHours < shift.nominalHours) {
            const diff = shift.nominalHours - baseAssignment.planHours;
            baseAssignment.planHours = shift.nominalHours;
            stats.quarterHours += diff;
            const monthKey = planDate.slice(0, 7);
            stats.monthHours.set(
              monthKey,
              (stats.monthHours.get(monthKey) || 0) + diff,
            );
            stats.dailyHours.set(
              planDate,
              (stats.dailyHours.get(planDate) || 0) + diff,
            );
          }
          if (!shift) {
            const updatedHours = Math.max(
              baseAssignment.planHours,
              productionHours,
            );
            const diff = updatedHours - baseAssignment.planHours;
            if (diff > 0) {
              baseAssignment.planHours = updatedHours;
              stats.quarterHours += diff;
              const monthKey = planDate.slice(0, 7);
              stats.monthHours.set(
                monthKey,
                (stats.monthHours.get(monthKey) || 0) + diff,
              );
              stats.dailyHours.set(
                planDate,
                (stats.dailyHours.get(planDate) || 0) + diff,
              );
            }
          }
        }

        SchedulingService.registerProductionAssignment(
          context,
          operation.operationPlanId,
          employeeId,
          planDate,
          shift ? shift.shiftCode : "DAY",
          productionHours,
          overtimeHours,
        );
      });
    }
    await SchedulingService.evaluateCoverage(context);
    context.logs.push(
      `Production overlay completed: ${operationsAssigned} operations assigned, ${context.productionAssignments.length} total assignment records. / 生产叠加完成：分配 ${operationsAssigned} 个操作，共写入 ${context.productionAssignments.length} 条记录`,
    );
  }

  private static registerProductionAssignment(
    context: SchedulingContext,
    operationPlanId: number,
    employeeId: number,
    planDate: string,
    shiftCode: string,
    productionHours: number,
    overtimeHours: number,
  ) {
        const productionAssignment: ProductionAssignment = {
      operationPlanId,
          employeeId,
          planDate,
      shiftCode,
      category: "PRODUCTION",
          planHours: productionHours,
        };
        context.productionAssignments.push(productionAssignment);
        SchedulingService.indexProductionAssignment(context, productionAssignment);

        if (overtimeHours > 0) {
          const overtimeAssignment: ProductionAssignment = {
        operationPlanId,
            employeeId,
            planDate,
        shiftCode,
        category: "OVERTIME",
            planHours: overtimeHours,
          };
          context.productionAssignments.push(overtimeAssignment);
          SchedulingService.indexProductionAssignment(context, overtimeAssignment);
    }
  }

  private static calculateAvailableHeadcount(
    context: SchedulingContext,
    planDate: string,
  ): number {
    const baseAssignments = context.baseRosterIndex.get(planDate) || [];
    if (!baseAssignments.length) {
      return 0;
    }
    const assignedSet = new Set(
      (context.productionIndex.get(planDate) || []).map(
        (item) => item.employeeId,
      ),
    );
    return baseAssignments.filter(
      (assignment) =>
        assignment.shiftCode !== "REST" &&
        assignment.planHours > 0 &&
        !assignedSet.has(assignment.employeeId),
    ).length;
  }

  private static ensureCoverageDiagnostics(
    context: SchedulingContext,
    payload: OperationCoverageDiagnostics,
  ): OperationCoverageDiagnostics {
    const existing = context.coverageDiagnostics.get(payload.operationPlanId);
    if (existing) {
      existing.availableHeadcount = payload.availableHeadcount;
      existing.availableQualified = payload.availableQualified;
      existing.qualifiedPoolSize = payload.qualifiedPoolSize;
      existing.candidateEmployeeIds = payload.candidateEmployeeIds;
      existing.requiredPeople = payload.requiredPeople;
      existing.batchPlanId = payload.batchPlanId;
      existing.batchCode = payload.batchCode;
      existing.stageName = payload.stageName;
      existing.operationId = payload.operationId;
      existing.operationName = payload.operationName;
      existing.planDate = payload.planDate;
      existing.assignedEmployeeIds = [];
      if (payload.notes) {
        existing.notes = payload.notes.slice();
      } else if (!existing.notes) {
        existing.notes = [];
      }
      if (payload.fallbackReason !== undefined) {
        existing.fallbackReason = payload.fallbackReason;
      }
      return existing;
    }
    const normalized: OperationCoverageDiagnostics = {
      ...payload,
      assignedEmployeeIds: payload.assignedEmployeeIds?.slice() ?? [],
      notes: payload.notes?.slice(),
      fallbackReason: payload.fallbackReason,
    };
    if (!normalized.notes) {
      normalized.notes = [];
    }
    context.coverageDiagnostics.set(payload.operationPlanId, normalized);
    return normalized;
  }

  private static async evaluateCoverage(context: SchedulingContext) {
    const inputs: CoverageDiagnosticInput[] = context.operations.map(
      (operation) => {
        const diagnostics = context.coverageDiagnostics.get(
          operation.operationPlanId,
        );
        const assignedCount = diagnostics
          ? diagnostics.assignedEmployeeIds.length
          : context.productionAssignments.filter(
              (assignment) =>
                assignment.operationPlanId === operation.operationPlanId &&
                assignment.category === "PRODUCTION",
            ).length;
        return {
          operationPlanId: operation.operationPlanId,
          operationId: operation.operationId,
          operationName: operation.operationName,
          batchPlanId: operation.batchPlanId,
          batchCode: operation.batchCode,
          stageName: operation.stageName,
          planDate:
            diagnostics?.planDate ??
            dayjs(operation.plannedStart).format("YYYY-MM-DD"),
          requiredPeople: operation.requiredPeople,
          assignedPeople: assignedCount,
          qualifiedCandidateIds: diagnostics?.candidateEmployeeIds ?? [],
        };
      },
    );

    const summary = await CoverageDiagnosticsService.evaluate(inputs);
    context.coverageGaps = summary.gaps.map((gap) => ({
      operationPlanId: gap.operationPlanId,
      operationId: gap.operationId,
      operationName: gap.operationName,
      batchPlanId: gap.batchPlanId,
      batchCode: gap.batchCode,
      stageName: gap.stageName,
      planDate: gap.planDate,
      requiredPeople: gap.requiredPeople,
      assignedPeople: gap.assignedPeople,
      availableHeadcount: gap.availableHeadcount,
      availableQualified: gap.availableQualified,
      qualifiedPoolSize: gap.qualifiedPoolSize,
      category: gap.category,
      status: gap.status,
      notes: gap.notes,
      suggestions: gap.suggestions,
    }));
    context.coverageSummary = summary;
    context.logs.push(
      `Coverage check completed: ${summary.fullyCovered}/${summary.totalOperations} operations fully covered.` +
        ` / 覆盖率校验：${summary.fullyCovered}/${summary.totalOperations} 个操作已满足要求，缺口 ${summary.gaps.length} 个`,
    );
  }

  private static buildCoverageSummary(
    context: SchedulingContext,
  ): CoverageSummary {
    if (context.coverageSummary) {
      return {
        ...context.coverageSummary,
        gapTotals: context.coverageSummary.gapTotals ?? {
          headcount: 0,
          qualification: 0,
          other: 0,
        },
      };
    }

    return {
      totalOperations: context.operations.length,
      fullyCovered: context.operations.length,
      coverageRate: 1,
      gaps: [],
      gapTotals: {
        headcount: 0,
        qualification: 0,
        other: 0,
      },
    };
  }

  private static determineShiftForOperation(
    context: SchedulingContext,
    operation: OperationPlanSummary,
  ) {
    const start = dayjs(operation.plannedStart);
    const end = dayjs(operation.plannedEnd);
    const duration = Math.max(end.diff(start, "hour", true), 0);

    const dayShift = context.shiftDefinitions.find(
      (def) => def.shiftCode.toUpperCase() === "DAY",
    );
    const longShift = context.shiftDefinitions.find(
      (def) => def.shiftCode.toUpperCase() === "LONGDAY",
    );
    const nightShift = context.shiftDefinitions.find(
      (def) => def.shiftCode.toUpperCase() === "NIGHT",
    );

    const startHour = start.hour() + start.minute() / 60;
    const endHour =
      end.hour() + end.minute() / 60 + (end.day() > start.day() ? 24 : 0);

    let chosenShift: ShiftDefinition | undefined;

    if (startHour >= 19 || endHour > 24 || end.isAfter(start.add(1, "day"))) {
      chosenShift = nightShift || longShift || dayShift;
    } else if (duration > (dayShift?.nominalHours || 8) + 0.5 || endHour > 21) {
      chosenShift = longShift || dayShift;
    } else {
      chosenShift = dayShift;
    }

    const shiftHours =
      chosenShift?.nominalHours || (duration > 0 ? Math.min(duration, 8) : 8);
    const productionHours = Math.min(duration, shiftHours);
    const overtimeHours = Math.max(0, duration - shiftHours);

    return { shift: chosenShift, productionHours, overtimeHours };
  }

  private static resolveShiftTypeId(
    context: SchedulingContext,
    shiftCode: string,
  ): number | null {
    if (!shiftCode) {
      return null;
    }
    const lookup = context.shiftTypeLookup;
    if (!lookup) {
      return null;
    }
    const normalizeCode = (code: string) =>
      code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const codeUpper = shiftCode.toUpperCase();
    const normalized = normalizeCode(codeUpper);
    const candidates = [
      codeUpper,
      normalized,
      `${codeUpper}_SHIFT`,
      `${normalized}_SHIFT`,
      `${codeUpper}SHIFT`,
      `${normalized}SHIFT`,
    ];
    for (const candidate of candidates) {
      const found = lookup.get(candidate);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private static findCandidateEmployees(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    shift: ShiftDefinition | undefined,
    productionHours: number,
    overtimeHours: number,
    qualifiedSet?: Set<number>,
  ): number[] {
    const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");
    const baseAssignments = context.baseRosterIndex.get(planDate) || [];
    const assignedSet = new Set(
      (context.productionIndex.get(planDate) || []).map(
        (item) => item.employeeId,
      ),
    );
    const lockedEmployees = new Set<number>();
    context.operations.forEach((op) => {
      if (!context.lockedOperations.has(op.operationPlanId)) {
        return;
      }
      const opDate = dayjs(op.plannedStart).format("YYYY-MM-DD");
      if (opDate !== planDate) {
        return;
      }
      const set = context.lockedOperationAssignments.get(op.operationPlanId);
      if (set) {
        set.forEach((id) => lockedEmployees.add(id));
      }
    });
    const operationHours = Math.max(
      dayjs(operation.plannedEnd).diff(
        dayjs(operation.plannedStart),
        "hour",
        true,
      ),
      0,
    );

    const candidates = baseAssignments
      .filter((assignment) => !assignedSet.has(assignment.employeeId))
      .map((assignment) => assignment.employeeId)
      .filter((employeeId) => {
        const stats = context.employeeStats.get(employeeId);
        const profile = context.employees.find(
          (emp) => emp.employeeId === employeeId,
        );
        if (!stats || !profile) {
          return false;
        }
        if (qualifiedSet && !qualifiedSet.has(employeeId)) {
          return false;
        }
        if (lockedEmployees.has(employeeId)) {
          return false;
        }
        const baseAssignment = baseAssignments.find(
          (item) => item.employeeId === employeeId,
        );
        const baseHours = baseAssignment?.planHours || 0;
        const shiftHours =
          shift?.nominalHours ||
          (baseHours > 0 ? baseHours : Math.min(operationHours, 8));
        const requiredDailyHours =
          Math.max(baseHours, shiftHours) + overtimeHours;
        const limit = profile.limits;
        if (limit && requiredDailyHours > limit.maxDailyHours + 0.01) {
          return false;
        }

        const quarterLimit = limit?.quarterStandardHours;
        if (quarterLimit) {
          let additionalQuarterHours = productionHours + overtimeHours;
          if (baseAssignment) {
            if (shift) {
              if (shift.nominalHours > baseHours) {
                additionalQuarterHours += shift.nominalHours - baseHours;
              }
            } else {
              const updatedHours = Math.max(baseHours, productionHours);
              if (updatedHours > baseHours) {
                additionalQuarterHours += updatedHours - baseHours;
              }
            }
          }

          if (
            stats.quarterHours + additionalQuarterHours >
            quarterLimit + 36.0001
          ) {
            return false;
          }
        }
        return true;
      });

    const sorted = candidates.sort((a, b) => {
      const statsA = context.employeeStats.get(a);
      const statsB = context.employeeStats.get(b);
      if (!statsA || !statsB) return 0;
      const profileA = context.employees.find((emp) => emp.employeeId === a);
      const profileB = context.employees.find((emp) => emp.employeeId === b);
      const limitA = profileA?.limits?.quarterStandardHours;
      const limitB = profileB?.limits?.quarterStandardHours;
      const scoreA = limitA
        ? limitA - statsA.quarterHours
        : Number.POSITIVE_INFINITY;
      const scoreB = limitB
        ? limitB - statsB.quarterHours
        : Number.POSITIVE_INFINITY;
      if (Math.abs(scoreA - scoreB) > 0.001) {
        return scoreB - scoreA;
      }
      if (statsA.quarterHours !== statsB.quarterHours) {
        return statsA.quarterHours - statsB.quarterHours;
      }
      return (
        (statsA.dailyHours.get(planDate) || 0) -
        (statsB.dailyHours.get(planDate) || 0)
      );
    });

    return sorted;
  }

  private static indexBaseAssignment(
    context: SchedulingContext,
    assignment: BaseRosterAssignment,
  ) {
    const list = context.baseRosterIndex.get(assignment.planDate) || [];
    list.push(assignment);
    context.baseRosterIndex.set(assignment.planDate, list);
  }

  private static applyLockedBaseAssignment(
    stats: EmployeeStats,
    assignment: BaseRosterAssignment,
    planDate: string,
    monthKey: string,
  ) {
    const hours = Number(assignment.planHours || 0);
    stats.dailyHours.set(planDate, hours);
    if (hours > 0) {
      stats.quarterHours += hours;
      stats.monthHours.set(
        monthKey,
        (stats.monthHours.get(monthKey) || 0) + hours,
      );
      stats.consecutiveDays += 1;
    } else {
      stats.consecutiveDays = 0;
    }
  }

  private static indexProductionAssignment(
    context: SchedulingContext,
    assignment: ProductionAssignment,
  ) {
    const list = context.productionIndex.get(assignment.planDate) || [];
    list.push(assignment);
    context.productionIndex.set(assignment.planDate, list);
  }

  private static async fetchQualifiedCandidatesForOperations(
    context: SchedulingContext,
  ): Promise<Map<number, Set<number>>> {
    const map = new Map<number, Set<number>>();
    if (!context.operations.length) {
      return map;
    }

    const planIds = context.operations.map((op) => op.operationPlanId);
    const placeholders = planIds.map(() => "?").join(",");

    const requirementQuery = `
      SELECT bop.id AS operationPlanId,
             COUNT(DISTINCT CONCAT_WS('-', oqr.qualification_id, oqr.min_level)) AS requirementCount
      FROM batch_operation_plans bop
      LEFT JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
      WHERE bop.id IN (${placeholders})
      GROUP BY bop.id;
    `;

    const [requirementRows] = await pool.execute<RowDataPacket[]>(
      requirementQuery,
      planIds,
    );
    const requirementMap = new Map<number, number>();
    requirementRows.forEach((row) => {
      requirementMap.set(
        Number(row.operationPlanId),
        Number(row.requirementCount || 0),
      );
    });

    const opsWithRequirements = planIds.filter(
      (id) => (requirementMap.get(id) || 0) > 0,
    );
    if (opsWithRequirements.length) {
      const placeholdersWithReq = opsWithRequirements.map(() => "?").join(",");
      const matchQuery = `
        SELECT
          bop.id AS operationPlanId,
          e.id AS employeeId,
          COUNT(DISTINCT CONCAT_WS('-', oqr.qualification_id, oqr.min_level)) AS matchedCount
        FROM batch_operation_plans bop
        JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
        JOIN employee_qualifications eq ON eq.qualification_id = oqr.qualification_id
        JOIN employees e ON e.id = eq.employee_id
        WHERE bop.id IN (${placeholdersWithReq})
          AND e.employment_status = 'ACTIVE'
          AND eq.qualification_level >= oqr.min_level
        GROUP BY bop.id, e.id;
      `;
      const [matchRows] = await pool.execute<RowDataPacket[]>(
        matchQuery,
        opsWithRequirements,
      );
      matchRows.forEach((row) => {
        const planId = Number(row.operationPlanId);
        const matchedCount = Number(row.matchedCount || 0);
        const required = requirementMap.get(planId) || 0;
        if (matchedCount === required) {
          const set = map.get(planId) || new Set<number>();
          set.add(Number(row.employeeId));
          map.set(planId, set);
        }
      });

      opsWithRequirements.forEach((planId) => {
        if (!map.has(planId)) {
          map.set(planId, new Set());
        }
      });
    }

    const zeroRequirementOps = planIds.filter(
      (id) => (requirementMap.get(id) || 0) === 0,
    );
    if (zeroRequirementOps.length) {
      const allEmployees = context.employees.map((emp) => emp.employeeId);
      zeroRequirementOps.forEach((planId) => {
        map.set(planId, new Set(allEmployees));
      });
    }

    return map;
  }

  private static async persistScheduling(context: SchedulingContext) {
    if (!context.employees.length) {
      context.logs.push("Skipping persistence: no employees to schedule.");
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const employeeIds = context.employees.map((emp) => emp.employeeId);
      const operationsToPersist = context.operations.filter(
        (op) => !context.lockedOperations.has(op.operationPlanId),
      );
      const operationPlanIds = operationsToPersist.map(
        (op) => op.operationPlanId,
      );

      if (employeeIds.length) {
        const placeholders = employeeIds.map(() => "?").join(",");

        await connection.execute(
          `DELETE FROM personnel_schedules
            WHERE schedule_date BETWEEN ? AND ?
              AND employee_id IN (${placeholders})`,
          [context.period.startDate, context.period.endDate, ...employeeIds],
        );

        const [shiftPlanRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id
             FROM employee_shift_plans
            WHERE plan_date BETWEEN ? AND ?
              AND employee_id IN (${placeholders})
              AND IFNULL(is_locked, 0) = 0`,
          [context.period.startDate, context.period.endDate, ...employeeIds],
        );

        const shiftPlanIds = shiftPlanRows.map((row) => Number(row.id));

        if (shiftPlanIds.length) {
          const shiftPlaceholders = shiftPlanIds.map(() => "?").join(",");

          await connection.execute(
            `DELETE FROM shift_change_logs
              WHERE shift_plan_id IN (${shiftPlaceholders})`,
            shiftPlanIds,
          );

          await connection.execute(
            `DELETE FROM overtime_records
              WHERE related_shift_plan_id IN (${shiftPlaceholders})`,
            shiftPlanIds,
          );

          await connection.execute(
            `DELETE FROM batch_personnel_assignments
              WHERE shift_plan_id IN (${shiftPlaceholders})`,
            shiftPlanIds,
          );

          await connection.execute(
            `DELETE FROM employee_shift_plans
              WHERE id IN (${shiftPlaceholders})`,
            shiftPlanIds,
          );
        }
      }

      if (operationPlanIds.length) {
        const placeholders = operationPlanIds.map(() => "?").join(",");
        await connection.execute(
          `DELETE FROM batch_personnel_assignments
            WHERE batch_operation_plan_id IN (${placeholders})`,
          operationPlanIds,
        );
      }

      const shiftLookup = new Map<string, ShiftDefinition>();
      context.shiftDefinitions.forEach((def) => {
        shiftLookup.set(def.shiftCode.toUpperCase(), def);
      });

      let baseInserted = 0;
      for (const assignment of context.baseRosterAssignments) {
        if (assignment.source === "LOCKED") {
          continue;
        }
        const codeUpper = assignment.shiftCode.toUpperCase();
        const shiftDef = shiftLookup.get(codeUpper);
        const shiftId = codeUpper === "REST" ? null : (shiftDef?.id ?? null);
        const planCategory = assignment.shiftCode === "REST" ? "REST" : "BASE";

        await connection.execute(
          `INSERT INTO employee_shift_plans
             (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, is_generated, batch_operation_plan_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, 0, 1, NULL, NULL, NULL)`,
          [
            assignment.employeeId,
            assignment.planDate,
            shiftId,
            planCategory,
            assignment.planHours,
          ],
        );
        baseInserted += 1;
      }

      let productionInserted = 0;
      let overtimeInserted = 0;
      for (const assignment of context.productionAssignments) {
        if (assignment.locked) {
          continue;
        }
        const shiftDef = shiftLookup.get(assignment.shiftCode.toUpperCase());
        const shiftId = shiftDef?.id ?? null;
        const planCategory = assignment.category;
        const isOvertime = planCategory === "OVERTIME" ? 1 : 0;
        const overtimeHours = isOvertime ? assignment.planHours : 0;

        const [planResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO employee_shift_plans
             (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, is_generated, batch_operation_plan_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, 1, ?, NULL, NULL)`,
          [
            assignment.employeeId,
            assignment.planDate,
            shiftId,
            planCategory,
            assignment.planHours,
            overtimeHours,
            assignment.operationPlanId,
          ],
        );

        const shiftPlanId = planResult.insertId;

        await connection.execute(
          `INSERT INTO batch_personnel_assignments
             (batch_operation_plan_id, employee_id, shift_plan_id, shift_code, plan_category, plan_hours, is_overtime, overtime_hours, assignment_origin, last_validated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', NOW())`,
          [
            assignment.operationPlanId,
            assignment.employeeId,
            shiftPlanId,
            assignment.shiftCode,
            planCategory,
            assignment.planHours,
            isOvertime,
            overtimeHours,
          ],
        );

        productionInserted += 1;
        if (isOvertime) {
          overtimeInserted += 1;
        }
      }

      const autoScheduleNote = "AUTO_GENERATED";
      const persistedAssignments = context.productionAssignments.filter(
        (assignment) => !assignment.locked,
      );
      if (persistedAssignments.length) {
        const scheduleEmployeeIds = Array.from(
          new Set(persistedAssignments.map((item) => item.employeeId)),
        );
        if (scheduleEmployeeIds.length) {
          const placeholders = scheduleEmployeeIds.map(() => "?").join(",");
          await connection.execute(
            `DELETE FROM personnel_schedules
              WHERE schedule_date BETWEEN ? AND ?
                AND employee_id IN (${placeholders})`,
            [
              context.period.startDate,
              context.period.endDate,
              ...scheduleEmployeeIds,
            ],
          );
        }

        type ScheduleDraft = {
          employeeId: number;
          planDate: string;
          shiftCode: string;
          shiftTypeId: number | null;
          isOvertime: boolean;
          overtimeHours: number;
        };

        const scheduleDraftMap = new Map<string, ScheduleDraft>();
        for (const assignment of persistedAssignments) {
          const key = `${assignment.employeeId}-${assignment.planDate}`;
          let draft = scheduleDraftMap.get(key);
          if (!draft) {
            draft = {
              employeeId: assignment.employeeId,
              planDate: assignment.planDate,
              shiftCode: assignment.shiftCode,
              shiftTypeId: SchedulingService.resolveShiftTypeId(
                context,
                assignment.shiftCode,
              ),
              isOvertime: assignment.category === "OVERTIME",
              overtimeHours:
                assignment.category === "OVERTIME" ? assignment.planHours : 0,
            };
            scheduleDraftMap.set(key, draft);
          } else {
            if (!draft.shiftTypeId) {
              draft.shiftTypeId = SchedulingService.resolveShiftTypeId(
                context,
                assignment.shiftCode,
              );
            }
            if (assignment.category === "OVERTIME") {
              draft.isOvertime = true;
              draft.overtimeHours += assignment.planHours;
            }
          }
        }

        const schedulePlaceholders: string[] = [];
        const scheduleValues: any[] = [];

        scheduleDraftMap.forEach((draft) => {
          const shiftTypeId =
            draft.shiftTypeId ??
            SchedulingService.resolveShiftTypeId(context, draft.shiftCode);
          if (!shiftTypeId) {
            context.logs.push(
              `Shift type not found for ${draft.shiftCode}, skip personnel schedule for employee ${draft.employeeId} on ${draft.planDate}. / 未找到班次 ${draft.shiftCode} 的班型ID，跳过员工 ${draft.employeeId} 在 ${draft.planDate} 的排班`,
            );
            return;
          }
          const overtimeHours = draft.isOvertime
            ? Math.round(draft.overtimeHours * 100) / 100
            : 0;
          schedulePlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
          scheduleValues.push(
            draft.employeeId,
            draft.planDate,
            shiftTypeId,
            "SCHEDULED",
            draft.isOvertime ? 1 : 0,
            overtimeHours,
            autoScheduleNote,
            null,
          );
        });

        if (schedulePlaceholders.length) {
          await connection.execute(
            `INSERT INTO personnel_schedules
               (employee_id, schedule_date, shift_type_id, status, is_overtime, overtime_hours, notes, created_by)
             VALUES ${schedulePlaceholders.join(", ")}`,
            scheduleValues,
          );
        }
      }

      await connection.commit();
      context.logs.push(
        `Persisted ${baseInserted} base roster rows and ${productionInserted} production assignments.`,
      );
      if (overtimeInserted > 0) {
        context.logs.push(`Overtime entries persisted: ${overtimeInserted}.`);
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private static async fetchOperationDetail(
    operationPlanId: number,
  ): Promise<(OperationDetail & { operationId: number }) | null> {
    const query = `
      SELECT
        bop.id AS operationPlanId,
        bop.operation_id AS operationId,
        o.operation_name AS operationName,
        bop.planned_start_datetime AS plannedStart,
        bop.planned_end_datetime AS plannedEnd,
        bop.required_people AS requiredPeople
      FROM batch_operation_plans bop
      JOIN operations o ON bop.operation_id = o.id
      WHERE bop.id = ?;
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [
      operationPlanId,
    ]);
    if (!rows.length) {
      return null;
    }
    const row = rows[0];
    return {
      operationPlanId: Number(row.operationPlanId),
      operationId: Number(row.operationId),
      operationName: String(row.operationName),
      plannedStart: dayjs(row.plannedStart).format("YYYY-MM-DD HH:mm:ss"),
      plannedEnd: dayjs(row.plannedEnd).format("YYYY-MM-DD HH:mm:ss"),
      requiredPeople: Number(row.requiredPeople || 0),
    };
  }

  private static async fetchQualificationMatchedEmployees(
    operationId: number,
    planDate: string,
  ): Promise<QualifiedEmployeeRow[]> {
    const query = `
      SELECT
        e.id AS employeeId,
        e.employee_code AS employeeCode,
        e.employee_name AS employeeName,
        COUNT(DISTINCT eq.qualification_id) AS matchedQualifications,
        SUM(COALESCE(eq.qualification_level, 0)) AS totalQualificationLevel,
        COALESCE(plan_stats.total_hours, 0) AS plannedHours,
        CASE WHEN COALESCE(plan_stats.total_hours, 0) > 10 THEN 1 ELSE 0 END AS overtimeRisk
      FROM employees e
      JOIN employee_qualifications eq ON eq.employee_id = e.id
      LEFT JOIN (
        SELECT employee_id, SUM(plan_hours) AS total_hours
        FROM employee_shift_plans
        WHERE plan_date = ?
          AND plan_state <> 'VOID'
        GROUP BY employee_id
      ) plan_stats ON plan_stats.employee_id = e.id
      WHERE e.employment_status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1
          FROM operation_qualification_requirements oqr
          WHERE oqr.operation_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM employee_qualifications eq2
              WHERE eq2.employee_id = e.id
                AND eq2.qualification_id = oqr.qualification_id
                AND eq2.qualification_level >= oqr.min_level
            )
        )
      GROUP BY e.id, e.employee_code, e.employee_name
      ORDER BY totalQualificationLevel DESC, matchedQualifications DESC, e.employee_code;
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [
      planDate,
      operationId,
    ]);
    return rows.map((row) => ({
      employeeId: Number(row.employeeId),
      employeeCode: String(row.employeeCode),
      employeeName: String(row.employeeName),
      matchScore: Number(row.totalQualificationLevel || 0),
      plannedHours: Number(row.plannedHours || 0),
      overtimeRisk: Number(row.overtimeRisk || 0) > 0,
    }));
  }

  private static async fetchEmployeesBusyOnDate(
    planDate: string,
  ): Promise<number[]> {
    const query = `
      SELECT DISTINCT employee_id AS employeeId
      FROM employee_shift_plans
      WHERE plan_date = ?
        AND plan_state <> 'VOID'
        AND plan_category IN ('PRODUCTION', 'OVERTIME');
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [planDate]);
    return rows.map((row) => Number(row.employeeId));
  }
}

export default SchedulingService;
