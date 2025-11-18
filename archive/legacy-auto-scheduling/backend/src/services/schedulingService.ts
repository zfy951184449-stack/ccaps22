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
import * as SchedulingRunService from "./schedulingRunService";
import type {
  SchedulingRun,
  SchedulingRunEventStatus,
  SchedulingRunStage,
} from "../models/types";
import type { RunPublishContext } from "./schedulingRunService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrAfter);

export interface AutoPlanRequest {
  batchIds: number[];
  startDate?: string;
  endDate?: string;
  options?: {
    includeBaseRoster?: boolean;
    dryRun?: boolean;
    operatorId?: number;
    iterationCount?: number;
    randomizationStrength?: number;
    randomSeed?: number;
    asyncProgress?: boolean;
    allowedOrgRoles?: string[];
    monthHourTolerance?: number;
    adaptiveParams?: boolean;
    earlyStop?: boolean;
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
  templateScheduleId: number;
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
  run: {
    id: number;
    key: string;
    status: 'RUNNING' | 'DRAFT' | 'PENDING_PUBLISH' | 'PUBLISHED' | 'ROLLED_BACK' | 'FAILED';
    resultId: number;
  };
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
  metricsSummary?: any;
  heuristicSummary?: any;
  heuristicHotspots?: HeuristicHotspot[];
  iterationSummary?: IterationSummary;
  async?: boolean;
  // v4新增字段
  optimizationMetrics?: {
    populationSize: number;
    generations: number;
    actualGenerations?: number;
    computationTime?: number;
    paretoFrontSize: number;
  };
  comprehensiveWorkTimeStatus?: {
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
  };
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

export interface RetryOperationPlanResult {
  operationPlanId: number;
  status: "NOT_IMPLEMENTED" | "RECOMMENDATION_ONLY";
  message: string;
  recommendation: OperationRecommendationResult;
}

interface SchedulingContext {
  period: SchedulingPeriod;
  batches: BatchWindow[];
  operations: OperationPlanSummary[];
  warnings: string[];
  logs: string[];
  runId?: number;
  runKey?: string;
  runResultId?: number;
  employees: EmployeeProfile[];
  baseRosterAssignments: BaseRosterAssignment[];
  productionAssignments: ProductionAssignment[];
  baseRosterIndex: Map<string, BaseRosterAssignment[]>;
  productionIndex: Map<string, ProductionAssignment[]>;
  employeeStats: Map<number, EmployeeStats>;
  shiftDefinitions: ShiftDefinition[];
  shiftTypeLookup: Map<string, number>;
  quarterStandardHours?: number;
  monthlyStandardHours: Map<string, number>;
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
  sharedPreferences: Map<number, Set<number>>;
  operationShareGroups: Map<
    number,
    Array<{
      groupId: number;
      priority: number;
      color?: string | null;
      groupName?: string | null;
    }>
  >;
  shareGroupMembers: Map<number, Set<number>>;
  shareGroupAssignments: Map<number, Set<number>>;
  employeeDailyAssignments: Map<
    string,
    Map<number, Array<{ start: number; end: number; operationPlanId: number }>>
  >;
  operationAssignments: Map<number, Set<number>>;
  shareStats: {
    totalGroupOperations: number;
    groupReuseSuccess: number;
    groupReusePartial: number;
    totalPreferenceOperations: number;
    preferenceReuseSuccess: number;
    preferenceReusePartial: number;
  };
  shareGroupDetails: Map<number, ShareGroupDetail>;
  sharePreferenceDetails: SharePreferenceDetail[];
  employeeLabelCache: Map<number, string>;
  heuristicWeights?: HeuristicScoringWeights;
  heuristicEngine?: HeuristicScoringService;
  heuristicConfig: HeuristicConfig;
  heuristicHotspots: HeuristicHotspot[];
  employeeRoleTier: Map<number, EmployeeRoleTier>;
  employeeHourEnvelope: Map<number, EmployeeHourEnvelope>;
  dailyProductionSnapshot: Map<string, Map<number, DailyProductionStat>>;
  iterationSettings?: IterationSettings;
  iterationSummary?: IterationSummary;
  nightShiftCounts: Map<number, number>;
  operationAllowedEmployeeIds?: Set<number>;
  monthHourTolerance: number;
}

interface EmployeeProfile {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  department?: string;
  role?: string;
  orgRole?: string;
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
  startDateTime?: string | null;
  endDateTime?: string | null;
}

interface ShareGroupDetail {
  groupId: number;
  groupName?: string | null;
  color?: string | null;
  operations: ShareGroupOperationDetail[];
  preferredEmployeeIds: Set<number>;
  reusedEmployeeIds: Set<number>;
  unmetReasons: string[];
}

interface ShareGroupOperationDetail {
  operationPlanId: number;
  operationName: string;
  planDate: string;
  assignedEmployees: string[];
  reusedEmployees: string[];
  missingPreferredEmployees: string[];
  reason?: string;
}

interface SharePreferenceDetail {
  operationPlanId: number;
  operationName: string;
  planDate: string;
  preferredEmployees: string[];
  assignedEmployees: string[];
  unmetEmployees: string[];
  reason?: string;
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
  iterationCount?: number;
  bestIteration?: number;
  iterationScores?: number[];
  randomizationStrength?: number;
  bestIterationScore?: number;
  combinationDetail?: CombinationScoreDetail;
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

type EmployeeRoleTier = "FRONTLINE" | "LEADER";

interface EmployeeHourEnvelope {
  upperBound: number;
  lowerBound: number;
  remaining: number;
  allowance: number;
  risk: "NORMAL" | "LOW" | "CRITICAL";
}

interface IterationSettings {
  count: number;
  randomizationStrength: number;
  seed?: number;
}

interface IterationSummary {
  totalIterations: number;
  evaluatedOperations: number;
  bestScore?: number;
  bestIteration?: number;
  bestOperationPlanId?: number;
  bestOperationName?: string;
  bestPlanDate?: string;
  scores?: number[];
}

interface CombinationScoreDetail {
  iteration: number;
  score: number;
  avgIndividualScore: number;
  stdDeviation: number;
  overtimePenalty: number;
  shareBonus: number;
  leaderPenalty: number;
  explorationBonus: number;
  nightVariancePenalty: number;
  isNightShift: boolean;
}

interface CombinationScoreWeights {
  avgIndividual: number;
  balancePenalty: number;
  overtimePenalty: number;
  shareBonus: number;
  leaderPenalty: number;
  explorationBonus: number;
  nightPenalty: number;
}

const DEFAULT_COMBINATION_WEIGHTS: CombinationScoreWeights = {
  avgIndividual: 0.6,
  balancePenalty: 0.2,
  overtimePenalty: 0.15,
  shareBonus: 0.25,
  leaderPenalty: 0.2,
  explorationBonus: 0.05,
  nightPenalty: 0.25,
};

const CANDIDATE_JITTER_SCALE = 0.02;
const SCORE_COMPARISON_EPSILON = 0.0001;

interface DailyProductionStat {
  totalHours: number;
  overtimeHours: number;
  hasLocked: boolean;
  operationCount: number;
}

interface CandidateSelectionResult {
  allCandidates: number[];
  candidates: number[];
  frontlineCandidates: number[];
  leaderCandidates: number[];
  forcedToUseLeaders: boolean;
  filteredByHourLimit: number[];
  filteredByConsecutiveLimit: number[];
  filteredByNightRest: number[];
  nightRestPenalty: Map<number, { penalty: number; restDays: number }>;
}

interface ShiftDefinition {
  id: number | null;
  shiftCode: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  isCrossDay: boolean;
  nominalHours: number;
  needsSync?: boolean;
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
    await SchedulingService.initializeRun(context, request);
    return SchedulingService.executeAutoPlanPipeline(context, request);
  }

  static async autoPlanAsync(request: AutoPlanRequest): Promise<AutoPlanResult> {
    if (!request.batchIds || request.batchIds.length === 0) {
      throw new Error("batchIds is required");
    }

    const context = await SchedulingService.prepareContext(request);
    await SchedulingService.initializeRun(context, request);

    const totalIterations = Math.max(
      1,
      Math.min(1000, Math.floor(request.options?.iterationCount ?? 1)),
    );
    const placeholderIterationSummary: IterationSummary | undefined =
      totalIterations > 1
        ? {
            totalIterations,
            evaluatedOperations: 0,
          }
        : undefined;

    const placeholder: AutoPlanResult = {
      message: "自动排班任务已启动，请关注进度。",
      period: context.period,
      batches: context.batches,
      warnings: context.warnings,
      run: {
        id: context.runId ?? 0,
        key: context.runKey ?? randomUUID(),
        status: "RUNNING",
        resultId: context.runResultId ?? 0,
      },
      summary: {
        employeesTouched: 0,
        operationsCovered: context.operations.length,
        overtimeEntries: 0,
        baseRosterRows: 0,
        operationsAssigned: 0,
      },
      diagnostics: {},
      logs: [],
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
      metricsSummary: placeholderIterationSummary
        ? {
            coverageRate: 0,
            totalOperations: context.operations.length,
            fullyCovered: 0,
            gapTotals: {
              headcount: 0,
              qualification: 0,
              other: 0,
            },
            warnings: context.warnings.length,
            overtimeEntries: 0,
            employeesTouched: 0,
            generatedAt: dayjs().toISOString(),
            iterationSummary: placeholderIterationSummary,
          }
        : undefined,
      heuristicSummary: {
        hotspotCount: 0,
        weights: {},
        generatedAt: dayjs().toISOString(),
      },
      heuristicHotspots: [],
      iterationSummary: placeholderIterationSummary,
      async: true,
    };

    setImmediate(async () => {
      try {
        await SchedulingService.executeAutoPlanPipeline(context, request);
      } catch (error) {
        console.error(
          `Async auto-plan run #${context.runId ?? "unknown"} failed:`,
          error,
        );
      }
    });

    return placeholder;
  }

  static async autoPlanV2(
    request: AutoPlanRequest,
  ): Promise<AutoPlanResult> {
    if (!request.batchIds || request.batchIds.length === 0) {
      throw new Error("batchIds is required");
    }

    const context = await SchedulingService.prepareContext(request);
    await SchedulingService.initializeRun(context, request);
    return SchedulingService.executeAutoPlanPipeline(context, request, "exhaustive");
  }

  private static async executeAutoPlanPipeline(
    context: SchedulingContext,
    request: AutoPlanRequest,
    planner: "heuristic" | "exhaustive" = "heuristic",
  ): Promise<AutoPlanResult> {
    const runOptions = request.options ? { ...request.options } : undefined;
    let iterationSettings =
      SchedulingService.resolveIterationSettings(runOptions);
    if (runOptions?.monthHourTolerance !== undefined) {
      context.monthHourTolerance = Math.max(0, runOptions.monthHourTolerance);
    }

    if (planner === "exhaustive") {
      iterationSettings = {
        count: 1,
        randomizationStrength: 0,
        seed: runOptions?.randomSeed,
      };
      context.logs.push(
        "Exhaustive planner selected: all candidate combinations will be evaluated for each operation.",
      );
    } else {
      context.logs.push(
        `Iteration settings resolved: count=${iterationSettings.count}, randomization=${iterationSettings.randomizationStrength}, seed=${iterationSettings.seed ?? "none"}.`,
      );
    }

    context.iterationSettings = iterationSettings;

    await SchedulingService.recordRunEvent(
      context,
      "LOADING_DATA",
      "PROGRESS",
      "开始加载基础数据与员工信息。",
    );

    try {
      await SchedulingService.loadQuarterStandardHours(context);
      await SchedulingService.loadShiftDefinitions(context);
      await SchedulingService.loadEmployeeProfiles(context);
      SchedulingService.applyOrgRoleFilter(context, runOptions?.allowedOrgRoles);
      await SchedulingService.loadEmployeeQualifications(context);
      await SchedulingService.loadShiftPreferences(context);
      await SchedulingService.loadLockedShiftPlans(context);
      await SchedulingService.loadHistoricalWorkload(context);
      await SchedulingService.loadPreviousAssignments(context);
      await SchedulingService.loadOperationQualificationRequirements(context);
      await SchedulingService.loadSharedPreferences(context);
      await SchedulingService.loadLockedOperations(context);

      await SchedulingService.recordRunEvent(
        context,
        "LOADING_DATA",
        "SUCCESS",
        "基础数据加载完成。",
      );

      await SchedulingService.recordRunEvent(
        context,
        "PLANNING",
        "PROGRESS",
        "开始生成排班草案。",
      );

      if (planner === "heuristic") {
        await SchedulingService.generateBaseRoster(context, runOptions);
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "基础班表草案生成完成。",
          { type: "SUB_STAGE", code: "BASE_ROSTER" },
        );
      } else {
        context.logs.push(
          "Base roster generation skipped for exhaustive planner. / 组合遍历模式跳过基础班表生成",
        );
        SchedulingService.rebuildEmployeeStats(context);
        SchedulingService.refreshHourEnvelopes(context);
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "组合遍历模式：基础班表阶段已跳过。",
          { type: "SUB_STAGE", code: "BASE_ROSTER_SKIPPED" },
        );
      }
      SchedulingService.buildCandidateProfiles(context);
      await SchedulingService.recordRunEvent(
        context,
        "PLANNING",
        "PROGRESS",
        "候选画像构建完成。",
        { type: "SUB_STAGE", code: "CANDIDATES_PREPARED" },
      );

      if (planner === "heuristic") {
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "开始迭代排班。",
          { type: "SUB_STAGE", code: "ITERATION_IN_PROGRESS" },
        );
        await SchedulingService.planProductionLoads(
          context,
          runOptions,
          iterationSettings,
        );
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "迭代排班完成，执行工时校验。",
          { type: "SUB_STAGE", code: "ITERATION_COMPLETE" },
        );
      } else {
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "开始组合排班。",
          { type: "SUB_STAGE", code: "COMBINATIONAL_IN_PROGRESS" },
        );
        await SchedulingService.planProductionLoadsExhaustive(
          context,
          runOptions,
        );
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          "组合排班完成，执行工时校验。",
          { type: "SUB_STAGE", code: "COMBINATIONAL_COMPLETE" },
        );
      }

      SchedulingService.ensureStandardHoursCompliance(context);
      SchedulingService.ensureMonthlyHoursCompliance(context);
      await SchedulingService.recordRunEvent(
        context,
        "PLANNING",
        "PROGRESS",
        "工时校验完成。",
        { type: "SUB_STAGE", code: "POST_PROCESSING" },
      );

      let persistenceSummary = {
        baseInserted: 0,
        productionInserted: 0,
        overtimeInserted: 0,
      };

      if (request.options?.dryRun) {
        context.logs.push(
          "Dry-run mode enabled: scheduling results were not persisted.",
        );
        await SchedulingService.recordRunEvent(
          context,
          "PERSISTING",
          "PROGRESS",
          "干跑模式：跳过写入数据库。",
          { type: "SUB_STAGE", code: "PERSISTING_SKIP" },
        );
        await SchedulingService.recordRunEvent(
          context,
          "PERSISTING",
          "INFO",
          "干跑模式：排班结果未写入数据库。",
        );
      } else {
        await SchedulingService.recordRunEvent(
          context,
          "PERSISTING",
          "PROGRESS",
          "正在写入排班结果。",
          { type: "SUB_STAGE", code: "PERSISTING_START" },
        );
        persistenceSummary = await SchedulingService.persistScheduling(
          context,
          context.runId,
        );
        await SchedulingService.recordRunEvent(
          context,
          "PERSISTING",
          "SUCCESS",
          "排班结果已写入数据库。",
          persistenceSummary,
        );
      }

      await SchedulingService.evaluateCoverage(context);

      const coverageSummary = SchedulingService.buildCoverageSummary(context);

      await SchedulingService.recordRunEvent(
        context,
        "PLANNING",
        "SUCCESS",
        "排班草案生成完成。",
        {
          coverageRate: coverageSummary.coverageRate,
          warnings: context.warnings.length,
        },
      );

      const summary = {
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
      };

      const runStatus: "DRAFT" | "PENDING_PUBLISH" | "PUBLISHED" =
        request.options?.dryRun ? "DRAFT" : "PUBLISHED";

      const shareGroupSummaries =
        SchedulingService.buildShareGroupSummaries(context);
      const sharePreferenceSummaries =
        SchedulingService.buildSharePreferenceSummaries(context);

      const metricsSummary = {
        coverageRate: coverageSummary.coverageRate,
        totalOperations: coverageSummary.totalOperations,
        fullyCovered: coverageSummary.fullyCovered,
        gapTotals: coverageSummary.gapTotals,
        warnings: context.warnings.length,
        overtimeEntries: summary.overtimeEntries,
        employeesTouched: summary.employeesTouched,
        generatedAt: dayjs().toISOString(),
        shareStats: {
          totalGroupOperations: context.shareStats.totalGroupOperations,
          groupReuseSuccess: context.shareStats.groupReuseSuccess,
          groupReusePartial: context.shareStats.groupReusePartial,
          totalPreferenceOperations: context.shareStats.totalPreferenceOperations,
          preferenceReuseSuccess: context.shareStats.preferenceReuseSuccess,
          preferenceReusePartial: context.shareStats.preferenceReusePartial,
          trackedOperations: context.shareStats.totalGroupOperations,
          activeGroups: context.shareGroupDetails.size,
          groupDetails: shareGroupSummaries,
          preferenceDetails: sharePreferenceSummaries,
        },
        iterationSummary: context.iterationSummary,
      };

      const heuristicSummary = {
        hotspotCount: context.heuristicHotspots.length,
        weights: {},
        generatedAt: dayjs().toISOString(),
      };

      if (context.runId) {
        const persistPayload = {
          period: context.period,
          baseRosterAssignments: context.baseRosterAssignments,
          productionAssignments: context.productionAssignments,
          operations: context.operations,
          lockedOperationIds: Array.from(context.lockedOperations.values()),
        };

        await SchedulingRunService.updateResultState(
          context.runId,
          runStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          persistPayload,
          coverageSummary,
          metricsSummary,
          context.heuristicHotspots,
          context.logs,
          runStatus === "PUBLISHED" ? dayjs().toISOString() : null,
        );

        await SchedulingRunService.markRunStatus(
          context.runId,
          runStatus,
          summary,
          context.warnings,
          metricsSummary,
          heuristicSummary,
        );
      }

      await SchedulingService.recordRunEvent(
        context,
        "COMPLETED",
        "SUCCESS",
        runStatus === "PUBLISHED"
          ? "自动排班已完成并写入生产数据。"
          : "自动排班草案已生成（干跑模式）。",
        {
          runStatus,
        },
      );

      const result: AutoPlanResult = {
        message:
          runStatus === "PUBLISHED"
            ? "自动排班已生成并发布至生产数据。"
            : "自动排班草案已生成，请确认后发布至生产数据。",
        period: context.period,
        batches: context.batches,
        warnings: context.warnings,
        run: {
          id: context.runId ?? 0,
          key: context.runKey ?? randomUUID(),
          status: runStatus,
          resultId: context.runResultId ?? 0,
        },
        summary,
        diagnostics: {
          missingCalendar:
            context.warnings.some((warning) => warning.includes("节假日")) ||
            undefined,
        },
        logs: context.logs,
        coverage: coverageSummary,
        metricsSummary,
        heuristicSummary,
        heuristicHotspots: context.heuristicHotspots,
        iterationSummary: context.iterationSummary,
      };

      return result;
    } catch (error: any) {
      await SchedulingService.handleRunFailure(context, error);
      throw error;
    }
  }

  private static async initializeRun(
    context: SchedulingContext,
    request: AutoPlanRequest,
  ) {
    if (context.runId) {
      return;
    }

    const draftRun = await SchedulingRunService.createDraftRun({
      periodStart: context.period.startDate,
      periodEnd: context.period.endDate,
      options: request.options ?? {},
      summary: {},
      warnings: context.warnings,
      batches: context.batches.map((batch) => ({
        batchPlanId: batch.batchPlanId,
        batchCode: batch.batchCode,
        windowStart: batch.start,
        windowEnd: batch.end,
        totalOperations: batch.totalOperations,
      })),
      assignmentsPayload: {
        period: context.period,
        baseRosterAssignments: [],
        productionAssignments: [],
        operations: context.operations,
        lockedOperationIds: [],
      },
      coveragePayload: undefined,
      metricsSummary: undefined,
      heuristicSummary: undefined,
      metricsPayload: undefined,
      hotspotsPayload: [],
      logsPayload: [],
      operatorId: request.options?.operatorId ?? null,
    });

    context.runId = draftRun.runId;
    context.runKey = draftRun.runKey;
    context.runResultId = draftRun.resultId;
    context.logs.push(
      `Scheduling draft run created: #${draftRun.runId} (${draftRun.runKey}).`,
    );

    await SchedulingService.recordRunEvent(
      context,
      "PREPARING",
      "PROGRESS",
      "排班任务已排队，准备执行环境。",
      {
        batchIds: request.batchIds,
        period: context.period,
      },
    );
  }

  private static async recordRunEvent(
    context: SchedulingContext,
    stage: SchedulingRunStage,
    status: SchedulingRunEventStatus,
    message: string,
    metadata?: any,
  ) {
    if (!context.runId) {
      return;
    }

    await SchedulingRunService.addRunEvent(context.runId, {
      stage,
      status,
      message,
      metadata,
    });
  }

  private static async handleRunFailure(
    context: SchedulingContext,
    error: any,
  ) {
    const message =
      error instanceof Error ? error.message : String(error ?? "未知错误");

    await SchedulingService.recordRunEvent(
      context,
      "FAILED",
      "ERROR",
      `自动排班失败：${message}`,
    );

    if (context.runId) {
      await SchedulingRunService.markRunStatus(
        context.runId,
        "FAILED",
        undefined,
        context.warnings,
        undefined,
        undefined,
      );
    }
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

  static async retryOperationPlan(
    operationPlanId: number,
  ): Promise<RetryOperationPlanResult> {
    const recommendation = await SchedulingService.recommendForOperation(
      operationPlanId,
    );

    return {
      operationPlanId,
      status: "RECOMMENDATION_ONLY",
      message:
        "单操作自动重试功能尚未完成，已提供候选人推荐结果，请参考后手动调整。",
      recommendation,
    };
  }

  static async exportCoverageGaps(
    runId: number,
  ): Promise<{ fileName: string; csv: string }> {
    const context = await SchedulingRunService.loadRunContext(runId);
    if (!context) {
      throw new Error("指定的排班运行不存在");
    }

    const coverage = (context.result.coverage_payload ?? undefined) as
      | CoverageSummary
      | undefined;
    const gaps = coverage?.gaps ?? [];

    const header = [
      "RunId",
      "BatchCode",
      "StageName",
      "OperationName",
      "PlanDate",
      "Category",
      "Required",
      "Assigned",
      "AvailableHeadcount",
      "AvailableQualified",
      "Suggestions",
      "Notes",
    ];

    const rows: string[][] = [header];

    if (!gaps.length) {
      rows.push([
        String(runId),
        "",
        "",
        "",
        "",
        "",
        "0",
        "0",
        "0",
        "0",
        "全部操作已覆盖",
        "",
      ]);
    } else {
      gaps.forEach((gap) => {
        rows.push([
          String(runId),
          gap.batchCode,
          gap.stageName,
          gap.operationName,
          gap.planDate,
          gap.category,
          String(gap.requiredPeople ?? 0),
          String(gap.assignedPeople ?? 0),
          String(gap.availableHeadcount ?? 0),
          String(gap.availableQualified ?? 0),
          (gap.suggestions ?? []).join("; "),
          (gap.notes ?? []).join("; "),
        ]);
      });
    }

    const csvBody = rows
      .map((row) =>
        row.map((cell) => SchedulingService.formatCsvCell(cell)).join(","),
      )
      .join("\n");

    const csv = `\uFEFF${csvBody}`;
    const fileName = `coverage-gaps-run-${runId}-${dayjs().format(
      "YYYYMMDDHHmmss",
    )}.csv`;

    return {
      fileName,
      csv,
    };
  }

  static async listRuns(limit = 20): Promise<SchedulingRun[]> {
    return SchedulingRunService.listRecentRuns(limit);
  }

  static async getRun(runId: number): Promise<RunPublishContext | null> {
    return SchedulingRunService.loadRunContext(runId);
  }

  static async publishRun(
    runId: number,
    operatorId: number | null,
  ): Promise<RunPublishContext> {
    const context = await SchedulingRunService.loadRunContext(runId);
    if (!context) {
      throw new Error("指定的排班运行不存在");
    }

    const now = dayjs().toISOString();
    const fromState = context.result.result_state;
    const warnings = Array.isArray(context.run.warnings_json)
      ? context.run.warnings_json
      : undefined;

    await SchedulingRunService.updateResultState(
      runId,
      "PUBLISHED",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      now,
    );

    await SchedulingRunService.markRunStatus(
      runId,
      "PUBLISHED",
      context.run.summary_json ?? undefined,
      warnings,
      context.run.metrics_summary_json ?? undefined,
      context.run.heuristic_summary_json ?? undefined,
    );

    await SchedulingRunService.insertResultDiff({
      run_id: runId,
      from_state: fromState,
      to_state: "PUBLISHED",
      diff_payload: {
        operatorId,
        publishedAt: now,
      },
    });

    await SchedulingRunService.addRunEvent(runId, {
      stage: "COMPLETED",
      status: "SUCCESS",
      message: "排班结果已发布至生产环境。",
      metadata: {
        operatorId,
      },
    });

    const updated = await SchedulingRunService.loadRunContext(runId);
    if (!updated) {
      throw new Error("排班结果发布后无法读取最新状态");
    }
    return updated;
  }

  static async rollbackRun(
    runId: number,
    operatorId: number | null,
  ): Promise<RunPublishContext> {
    const context = await SchedulingRunService.loadRunContext(runId);
    if (!context) {
      throw new Error("指定的排班运行不存在");
    }

    const now = dayjs().toISOString();
    const fromState = context.result.result_state;
    const warnings = Array.isArray(context.run.warnings_json)
      ? context.run.warnings_json
      : undefined;

    await SchedulingRunService.updateResultState(
      runId,
      "DRAFT",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
    );

    await pool.execute(
      `DELETE FROM batch_personnel_assignments WHERE scheduling_run_id = ?`,
      [runId],
    );
    await pool.execute(
      `DELETE FROM employee_shift_plans WHERE scheduling_run_id = ?`,
      [runId],
    );

    await SchedulingRunService.markRunStatus(
      runId,
      "ROLLED_BACK",
      context.run.summary_json ?? undefined,
      warnings,
      context.run.metrics_summary_json ?? undefined,
      context.run.heuristic_summary_json ?? undefined,
    );

    await SchedulingRunService.insertResultDiff({
      run_id: runId,
      from_state: fromState,
      to_state: "ROLLED_BACK",
      diff_payload: {
        operatorId,
        rolledBackAt: now,
      },
    });

    await SchedulingRunService.addRunEvent(runId, {
      stage: "COMPLETED",
      status: "INFO",
      message: "排班结果已回滚至草稿状态。",
      metadata: {
        operatorId,
      },
    });

    const updated = await SchedulingRunService.loadRunContext(runId);
    if (!updated) {
      throw new Error("排班结果回滚后无法读取最新状态");
    }
    return updated;
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
      runId: undefined,
      runKey: undefined,
      runResultId: undefined,
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
      monthlyStandardHours: new Map(),
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
      sharedPreferences: new Map(),
      operationShareGroups: new Map(),
      shareGroupMembers: new Map(),
      shareGroupAssignments: new Map(),
      employeeDailyAssignments: new Map(),
      operationAssignments: new Map(),
      shareStats: {
        totalGroupOperations: 0,
        groupReuseSuccess: 0,
        groupReusePartial: 0,
        totalPreferenceOperations: 0,
        preferenceReuseSuccess: 0,
        preferenceReusePartial: 0,
      },
      shareGroupDetails: new Map(),
      sharePreferenceDetails: [],
      employeeLabelCache: new Map(),
      heuristicWeights: undefined,
      heuristicEngine: undefined,
      heuristicConfig: {
        maxBacktrackingDepth: 3,
        minPrimaryScore: 0,
      },
      heuristicHotspots: [],
      employeeRoleTier: new Map(),
      employeeHourEnvelope: new Map(),
      dailyProductionSnapshot: new Map(),
      iterationSettings: undefined,
      iterationSummary: undefined,
      nightShiftCounts: new Map(),
      operationAllowedEmployeeIds: undefined,
      monthHourTolerance: Math.max(
        0,
        request.options?.monthHourTolerance ?? 8,
      ),
    };
  }

  private static async loadQuarterStandardHours(context: SchedulingContext) {
    const periodStart = dayjs(context.period.startDate);
    const periodEnd = dayjs(context.period.endDate);

    let totalStandardHours = 0;
    let cursor = periodStart.startOf("quarter");
    let segmentIndex = 0;
    let standardHoursTableAvailable: boolean | null = null;

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
      let rows: RowDataPacket[] = [];
      let skipStandardTableLookup = false;
      if (standardHoursTableAvailable !== false) {
        try {
          const [result] = await pool.execute<RowDataPacket[]>(
            `SELECT standard_hours FROM quarterly_standard_hours WHERE year = ? AND quarter = ? LIMIT 1`,
            [year, quarter],
          );
          rows = result;
          standardHoursTableAvailable = true;
        } catch (error: any) {
          if (error?.code === "ER_NO_SUCH_TABLE") {
            standardHoursTableAvailable = false;
            skipStandardTableLookup = true;
            context.logs.push(
              "季度标准工时表缺失，改用节假日日历推算标准工时。",
            );
          } else {
            throw error;
          }
        }
      } else {
        skipStandardTableLookup = true;
      }

      const coversWholeQuarter =
        segmentStart.isSame(quarterStart, "day") &&
        segmentEnd.isSame(quarterEnd, "day");

      if (!skipStandardTableLookup && rows.length && coversWholeQuarter) {
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

    const monthlyStandard = new Map<string, number>();
    let monthCursor = periodStart.startOf("month");
    while (monthCursor.isBefore(periodEnd) || monthCursor.isSame(periodEnd, "month")) {
      const monthKey = monthCursor.format("YYYY-MM");
      const segmentMonthStart = monthCursor.isBefore(periodStart)
        ? periodStart
        : monthCursor;
      const monthEnd = monthCursor.endOf("month");
      const segmentMonthEnd = monthEnd.isAfter(periodEnd) ? periodEnd : monthEnd;
      if (segmentMonthStart.isAfter(segmentMonthEnd)) {
        monthCursor = monthCursor.add(1, "month").startOf("month");
        continue;
      }
      const workdays = await SchedulingService.countWorkdays(
        segmentMonthStart.format("YYYY-MM-DD"),
        segmentMonthEnd.format("YYYY-MM-DD"),
      );
      monthlyStandard.set(monthKey, workdays * 8);
      monthCursor = monthCursor.add(1, "month").startOf("month");
    }
    context.monthlyStandardHours = monthlyStandard;

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
      SchedulingService.refreshHourEnvelopes(context);
      return;
    }

    const segmentCount = Math.max(context.standardHourSegments || 1, 1);
    const upperTolerance = 36 * segmentCount;
    const lowerTolerance = 0;

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
          `员工 ${employee.employeeName}(${employee.employeeCode}) 本季度工时低于标准值 ${quarterLimit.toFixed(1)}h，缺口 ${Math.abs(diff).toFixed(1)}h。`,
        );
      }
    });

    SchedulingService.refreshHourEnvelopes(context);
  }

  private static ensureMonthlyHoursCompliance(context: SchedulingContext) {
    const tolerance = Math.max(0, context.monthHourTolerance ?? 0);
    const standardMap = context.monthlyStandardHours ?? new Map<string, number>();
    if (!standardMap.size) {
      return;
    }

    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        return;
      }
      const monthKeys = new Set<string>([
        ...standardMap.keys(),
        ...stats.monthHours.keys(),
      ]);
      monthKeys.forEach((monthKey) => {
        const standard = standardMap.get(monthKey);
        if (standard === undefined || standard <= 0) {
          return;
        }
        const actual = stats.monthHours.get(monthKey) ?? 0;
        const toleranceText =
          tolerance > 0 ? `（容差 ±${tolerance.toFixed(1)}h）` : "";
        if (actual > standard + tolerance + 0.0001) {
          context.warnings.push(
            `员工 ${employee.employeeName}(${employee.employeeCode}) 在 ${monthKey} 月度工时 ${actual.toFixed(1)}h，高于标准 ${standard.toFixed(1)}h${toleranceText}。`,
          );
        } else if (actual < standard - tolerance - 0.0001) {
          context.warnings.push(
            `员工 ${employee.employeeName}(${employee.employeeCode}) 在 ${monthKey} 月度工时 ${actual.toFixed(1)}h，低于标准 ${standard.toFixed(1)}h${toleranceText}。`,
          );
        }
      });
    });
  }

  private static refreshHourEnvelopes(
    context: SchedulingContext,
    filterEmployeeIds?: Iterable<number>,
  ) {
    const targets = filterEmployeeIds
      ? Array.from(filterEmployeeIds)
      : context.employees.map((emp) => emp.employeeId);
    const nominalDayHours = SchedulingService.getNominalDayHours(context);

    if (!context.quarterStandardHours) {
      targets.forEach((employeeId) => {
        const stats = context.employeeStats.get(employeeId);
        if (!stats) {
          return;
        }
        context.employeeHourEnvelope.set(employeeId, {
          upperBound: Number.POSITIVE_INFINITY,
          lowerBound: 0,
          remaining: Number.POSITIVE_INFINITY,
          allowance: stats.quarterHours,
          risk: "NORMAL",
        });
      });
      return;
    }

    const segmentCount = Math.max(context.standardHourSegments || 1, 1);
    const upperBound =
      context.quarterStandardHours + 36 * segmentCount;
    const lowerBound = Math.max(0, context.quarterStandardHours ?? 0);

    targets.forEach((employeeId) => {
      const stats = context.employeeStats.get(employeeId);
      if (!stats) {
        return;
      }
      const remaining = Number.parseFloat(
        (upperBound - stats.quarterHours).toFixed(4),
      );
      const allowance = Number.parseFloat(
        (stats.quarterHours - lowerBound).toFixed(4),
      );
      let risk: EmployeeHourEnvelope["risk"] = "NORMAL";
      if (remaining <= 0) {
        risk = "CRITICAL";
      } else if (remaining < nominalDayHours) {
        risk = "LOW";
      }
      context.employeeHourEnvelope.set(employeeId, {
        upperBound,
        lowerBound,
        remaining,
        allowance,
        risk,
      });
    });
  }

  private static getNominalDayHours(context: SchedulingContext): number {
    const dayShift = context.shiftDefinitions.find(
      (def) => def.shiftCode.toUpperCase() === "DAY",
    );
    if (dayShift && dayShift.nominalHours > 0) {
      return dayShift.nominalHours;
    }
    const fallback = context.shiftDefinitions
      .map((def) => def.nominalHours)
      .filter((value) => value > 0);
    if (fallback.length) {
      return (
        fallback.reduce((sum, value) => sum + value, 0) / fallback.length
      );
    }
    return 8;
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
        templateScheduleId: Number(row.templateScheduleId),
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
      const existing = definitions.find(
        (def) => def.shiftCode.toUpperCase() === code.toUpperCase(),
      );
      if (existing) {
        let changed = false;
        if (Math.abs(existing.nominalHours - nominalHours) > 0.01) {
          existing.nominalHours = nominalHours;
          changed = true;
        }
        if (existing.startTime !== start) {
          existing.startTime = start;
          changed = true;
        }
        if (existing.endTime !== end) {
          existing.endTime = end;
          changed = true;
        }
        if (existing.isCrossDay !== isCrossDay) {
          existing.isCrossDay = isCrossDay;
          changed = true;
        }
        if (existing.shiftName !== name && existing.shiftName !== "") {
          // Preserve user-defined names unless empty; avoid unnecessary overwrite.
        } else if (existing.shiftName !== name) {
          existing.shiftName = name;
          changed = true;
        }
        if (changed) {
          existing.needsSync = true;
        }
        return;
      }

      context.logs.push(`Shift definition ${code} not found, using fallback.`);
      definitions.push({
        id: null,
        shiftCode: code,
        shiftName: name,
        startTime: start,
        endTime: end,
        isCrossDay,
        nominalHours,
        needsSync: true,
      });
    };

    ensureShift("DAY", "常日班", 8, "08:30:00", "17:00:00");
    ensureShift("LONGDAY", "长白班", 12, "09:00:00", "21:00:00");
    ensureShift("NIGHT", "夜班", 12, "20:30:00", "09:00:00", true);

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
    context.employeeRoleTier.clear();

    const query = `
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

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    const quarterStandardHours = context.quarterStandardHours;
    context.employees = rows.map((row) => ({
      employeeId: Number(row.employeeId),
      employeeCode: String(row.employeeCode),
      employeeName: String(row.employeeName),
      department: row.department ? String(row.department) : undefined,
      role: row.role ? String(row.role) : undefined,
      orgRole: row.orgRole ? String(row.orgRole) : undefined,
      limits: {
        quarterStandardHours,
        monthStandardHours: undefined,
        maxDailyHours: 11,
        maxConsecutiveDays: 6,
      },
      qualifications: [],
    }));

    context.employees.forEach((employee) => {
      const tier = SchedulingService.resolveEmployeeRoleTier(employee.role);
      context.employeeRoleTier.set(employee.employeeId, tier);
    });

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

  private static applyOrgRoleFilter(
    context: SchedulingContext,
    allowedRoles?: string[],
  ) {
    if (!allowedRoles || allowedRoles.length === 0) {
      context.operationAllowedEmployeeIds = undefined;
      return;
    }

    const normalized = new Set(
      allowedRoles.map((role) => role.toUpperCase().trim()).filter(Boolean),
    );
    if (!normalized.size) {
      context.operationAllowedEmployeeIds = undefined;
      return;
    }

    const filtered = context.employees.filter((employee) => {
      const role = (employee.orgRole ?? "FRONTLINE").toUpperCase();
      return normalized.has(role);
    });

    if (!filtered.length) {
      context.logs.push(
        `Org-role filter applied but no employees matched roles: ${Array.from(
          normalized.values(),
        ).join(", ")}.`,
      );
      context.warnings.push(
        "所选组织角色下没有可用员工，排班将不会生成任何人员分配。",
      );
      context.operationAllowedEmployeeIds = new Set();
      return;
    }

    if (filtered.length !== context.employees.length) {
      context.logs.push(
        `Org-role filter applied (operations only): kept ${filtered.length}/${context.employees.length} employees for roles ${Array.from(
          normalized.values(),
        ).join(", ")}.`,
      );
    } else {
      context.logs.push(
        `Org-role filter applied: all ${filtered.length} employees match roles ${Array.from(
          normalized.values(),
        ).join(", ")}.`,
      );
    }

    context.operationAllowedEmployeeIds = new Set(
      filtered.map((employee) => employee.employeeId),
    );
  }

  private static resolveEmployeeRoleTier(role?: string | null): EmployeeRoleTier {
    if (!role) {
      return "FRONTLINE";
    }
    const normalized = role.trim().toLowerCase();
    if (!normalized) {
      return "FRONTLINE";
    }
    const leaderKeywords = [
      "leader",
      "lead",
      "主管",
      "经理",
      "班长",
      "supervisor",
      "manager",
      "director",
      "组长",
    ];
    return leaderKeywords.some((keyword) => normalized.includes(keyword))
      ? "LEADER"
      : "FRONTLINE";
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
             sd.shift_code AS shiftCode,
             bop.planned_start_datetime AS plannedStart,
             bop.planned_end_datetime AS plannedEnd
        FROM employee_shift_plans esp
        LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
        LEFT JOIN batch_operation_plans bop ON bop.id = esp.batch_operation_plan_id
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
          const plannedStart = row.plannedStart
            ? dayjs(row.plannedStart).format("YYYY-MM-DD HH:mm:ss")
            : null;
          const plannedEnd = row.plannedEnd
            ? dayjs(row.plannedEnd).format("YYYY-MM-DD HH:mm:ss")
            : null;
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
            startDateTime: plannedStart,
            endDateTime: plannedEnd,
          };
          context.productionAssignments.push(assignment);
          SchedulingService.indexProductionAssignment(context, assignment);
          SchedulingService.trackDailyProduction(
            context,
            planDate,
            employeeId,
            assignment.planHours,
            {
              locked: true,
              overtime: planCategory === "OVERTIME",
            },
          );

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

          if (plannedStart && plannedEnd && planDate && assignment.operationPlanId) {
            SchedulingService.recordDailyAssignment(
              context,
              planDate,
              employeeId,
              assignment.operationPlanId,
              plannedStart,
              plannedEnd,
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

    const baseQuery = `
      SELECT bop.id AS operationPlanId,
             oqr.qualification_id AS qualificationId,
             %COLUMN_EXPR% AS minLevel
        FROM batch_operation_plans bop
        LEFT JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
       WHERE bop.id IN (${placeholders})
    `;

    let rows: RowDataPacket[] = [];
    try {
      const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.min_level');
      const [result] = await pool.execute<RowDataPacket[]>(query, planIds);
      rows = result;
    } catch (error: any) {
      if (error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054) {
        const query = baseQuery.replace('%COLUMN_EXPR%', 'oqr.required_level');
        const [result] = await pool.execute<RowDataPacket[]>(query, planIds);
        rows = result;
        context.logs.push(
          'min_level 列不存在，已回退使用 required_level 作为最低资质等级。',
        );
      } else {
        throw error;
      }
    }
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

  private static async loadSharedPreferences(context: SchedulingContext) {
    context.sharedPreferences.clear();
    context.operationShareGroups.clear();
    context.shareGroupMembers.clear();
    context.shareGroupAssignments.clear();
    context.operationAssignments.clear();
    context.shareStats = {
      totalGroupOperations: 0,
      groupReuseSuccess: 0,
      groupReusePartial: 0,
      totalPreferenceOperations: 0,
      preferenceReuseSuccess: 0,
      preferenceReusePartial: 0,
    };
    context.shareGroupDetails.clear();
    context.sharePreferenceDetails = [];
    context.employeeLabelCache.clear();

    if (!context.operations.length) {
      return;
    }

    const planIds = context.operations.map((op) => op.operationPlanId);
    const scheduleIdMap = new Map<number, number>();
    context.operations.forEach((op) => {
      const scheduleId = Number(op.templateScheduleId);
      if (Number.isFinite(scheduleId)) {
        scheduleIdMap.set(scheduleId, op.operationPlanId);
      }
    });

    const scheduleIds = Array.from(scheduleIdMap.keys());

    if (scheduleIds.length) {
      const placeholders = scheduleIds.map(() => "?").join(",");
      const shareGroupQuery = `
        SELECT
          osgr.schedule_id,
          osgr.share_group_id,
          osgr.priority,
          psg.group_code,
          psg.group_name,
          psg.color
        FROM operation_share_group_relations osgr
        JOIN personnel_share_groups psg ON osgr.share_group_id = psg.id
        WHERE osgr.schedule_id IN (${placeholders})
      `;
      try {
        const [rows] = await pool.execute<RowDataPacket[]>(
          shareGroupQuery,
          scheduleIds,
        );
        rows.forEach((row) => {
          const scheduleId = Number(row.schedule_id);
          const operationId = scheduleIdMap.get(scheduleId);
          if (!operationId) {
            return;
          }
          const groupId = Number(row.share_group_id);
          const priority =
            row.priority !== null && row.priority !== undefined
              ? Number(row.priority)
              : 1;
          const groups =
            context.operationShareGroups.get(operationId) ?? [];
          groups.push({
            groupId,
            priority,
            color: row.color ?? null,
            groupName: row.group_name ?? row.group_code ?? null,
          });
          context.operationShareGroups.set(operationId, groups);

          const members =
            context.shareGroupMembers.get(groupId) || new Set<number>();
          members.add(operationId);
          context.shareGroupMembers.set(groupId, members);

          if (!context.shareGroupAssignments.has(groupId)) {
            context.shareGroupAssignments.set(groupId, new Set<number>());
          }
        });

        context.operationShareGroups.forEach((groups) => {
          groups.sort(
            (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
          );
        });

        if (context.operationShareGroups.size) {
          context.logs.push(
            `Loaded ${context.operationShareGroups.size} operations with share groups. / 已载入 ${context.operationShareGroups.size} 个操作的共享组配置`,
          );
        }
      } catch (error) {
        context.logs.push(
          `Failed to load operation share groups: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const templateConstraintQuery = `
        SELECT schedule_id, predecessor_schedule_id
          FROM operation_constraints
         WHERE share_personnel = 1
           AND schedule_id IN (${placeholders})
      `;
      try {
        const [rows] = await pool.execute<RowDataPacket[]>(
          templateConstraintQuery,
          scheduleIds,
        );
        rows.forEach((row) => {
          const currentSchedule = Number(row.schedule_id);
          const predecessorSchedule = Number(row.predecessor_schedule_id);
          const currentPlanId = scheduleIdMap.get(currentSchedule);
          const predecessorPlanId = scheduleIdMap.get(predecessorSchedule);
          if (!currentPlanId || !predecessorPlanId) {
            return;
          }
          const set =
            context.sharedPreferences.get(currentPlanId) ||
            new Set<number>();
          set.add(predecessorPlanId);
          context.sharedPreferences.set(currentPlanId, set);
        });
      } catch (error) {
        context.logs.push(
          `Failed to load template share preferences: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (planIds.length) {
      const placeholders = planIds.map(() => "?").join(",");
      const batchConstraintQuery = `
        SELECT
          batch_operation_plan_id AS current_id,
          predecessor_batch_operation_plan_id AS predecessor_id
        FROM batch_operation_constraints
        WHERE share_personnel = 1
          AND batch_operation_plan_id IN (${placeholders})
      `;
      try {
        const [rows] = await pool.execute<RowDataPacket[]>(
          batchConstraintQuery,
          planIds,
        );
        rows.forEach((row) => {
          const currentId = Number(row.current_id);
          const predecessorId = Number(row.predecessor_id);
          if (!currentId || !predecessorId) {
            return;
          }
          const set =
            context.sharedPreferences.get(currentId) ||
            new Set<number>();
          set.add(predecessorId);
          context.sharedPreferences.set(currentId, set);
        });
      } catch (error) {
        context.logs.push(
          `Failed to load batch share preferences: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (context.sharedPreferences.size) {
      context.logs.push(
        `Loaded share-personnel preferences for ${context.sharedPreferences.size} operations. / 已载入 ${context.sharedPreferences.size} 个操作的共享人员偏好`,
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
      const envelope = context.employeeHourEnvelope.get(employee.employeeId);

      const profile: CandidateProfile = {
        employeeId: employee.employeeId,
        employeeCode: employee.employeeCode,
        employeeName: employee.employeeName,
        department: employee.department,
        role: employee.role,
        orgRole: employee.orgRole,
        qualifications: employee.qualifications,
        weeklyHours: workload?.last7DaysHours ?? 0,
        monthlyHours: workload?.last30DaysHours ?? 0,
        consecutiveDays:
          stats?.consecutiveDays ?? workload?.recentConsecutiveDays ?? 0,
        quarterRemaining: envelope?.remaining,
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

  private static resolveIterationSettings(
    options: AutoPlanRequest["options"],
  ): IterationSettings {
    const iterationCount = Math.max(
      1,
      Math.min(1000, Math.floor(options?.iterationCount ?? 1)),
    );
    const randomizationStrength = Math.max(
      0,
      Math.min(options?.randomizationStrength ?? 0.15, 10),
    );
    const rawSeed =
      options?.randomSeed !== undefined
        ? Number(options.randomSeed)
        : undefined;
    const seed =
      rawSeed !== undefined && Number.isFinite(rawSeed) ? Math.floor(rawSeed) : undefined;
    return {
      count: iterationCount,
      randomizationStrength,
      seed,
    };
  }

  private static ensureHeuristicEngine(
    context: SchedulingContext,
  ): HeuristicScoringService {
    if (!context.heuristicEngine) {
      const weights = {
        ...DEFAULT_SCORING_WEIGHTS,
        ...(context.heuristicWeights ?? {}),
      };
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
    nightRestPenalty?: Map<number, { penalty: number; restDays: number }>,
  ): OperationHeuristicDiagnostics {
    const engine = SchedulingService.ensureHeuristicEngine(context);
    const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");

    const candidateProfiles: CandidateProfile[] = candidateEmployeeIds
      .map((employeeId) => context.candidateProfiles.get(employeeId))
      .filter((profile): profile is CandidateProfile => Boolean(profile));

    if (!candidateProfiles.length && candidateEmployeeIds.length) {
      context.logs.push(
        `No candidate profiles for operation ${operation.operationName} (plan ${operation.operationPlanId}); candidates=${candidateEmployeeIds.join(",")}.`,
      );
    }

    const opContext = SchedulingService.resolveOperationContext(
      context,
      operation,
      shift,
    );
    const scored = engine.scoreCandidates(candidateProfiles, opContext);

    if (nightRestPenalty && nightRestPenalty.size) {
      scored.forEach((detail) => {
        const info = nightRestPenalty.get(detail.candidate.employeeId);
        if (!info) {
          return;
        }
        detail.rawBreakdown.nightRestPenalty = -info.penalty;
        detail.weightedBreakdown.nightRestPenalty = -info.penalty;
        detail.totalScore = Number(
          (detail.totalScore - info.penalty).toFixed(4),
        );
        detail.reasons.push(`夜班后仅休 ${info.restDays} 天`);
      });
      scored.sort((a, b) => b.totalScore - a.totalScore);
    }

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

  private static async applyIterationSearch(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    baseDiagnostic: OperationHeuristicDiagnostics,
    candidateResult: CandidateSelectionResult,
    shift: ShiftDefinition | undefined,
    productionHours: number,
    overtimeHours: number,
    iterationSettings: IterationSettings,
  ): Promise<{
    selectedEmployeeIds: number[];
    diagnostic: OperationHeuristicDiagnostics;
  }> {
    const requiredPeople = Math.max(operation.requiredPeople, 1);
    const availableCandidates = candidateResult.candidates;
    if (
      availableCandidates.length === 0 ||
      baseDiagnostic.candidateScores.length === 0 ||
      requiredPeople === 0
    ) {
      return {
        selectedEmployeeIds: baseDiagnostic.selectedEmployeeIds.slice(),
        diagnostic: baseDiagnostic,
      };
    }

    const candidateScoreMap = new Map<number, HeuristicCandidateScoreDetail>();
    baseDiagnostic.candidateScores.forEach((detail) => {
      candidateScoreMap.set(detail.candidate.employeeId, detail);
    });

    const iterationScores: number[] = [];
    const progressInterval = Math.max(
      1,
      Math.ceil(iterationSettings.count / 20),
    );
    let bestScoreSoFar = Number.NEGATIVE_INFINITY;
    let bestIterationSoFar = 0;
    let baseIterationScore: number | undefined;
    let bestResult:
      | {
          iteration: number;
          score: number;
          selectedIds: number[];
          candidateScores: HeuristicCandidateScoreDetail[];
          detail: CombinationScoreDetail;
        }
      | undefined;

    for (let iteration = 0; iteration < iterationSettings.count; iteration += 1) {
      const iterationNoiseScale =
        iteration === 0 ? 0 : iterationSettings.randomizationStrength;
      const noiseSeed =
        iteration === 0 || iterationSettings.seed === undefined
          ? undefined
          : iterationSettings.seed ^
            (operation.operationPlanId * 7919) ^
            ((iteration + 1) * 2654435761);
      const rng =
        iteration === 0
          ? () => 0.5
          : SchedulingService.createRandomGenerator(noiseSeed);

      const candidateEntries = availableCandidates
        .map((employeeId) => {
          const detail = candidateScoreMap.get(employeeId);
          if (!detail) {
            return undefined;
          }
          const baseScore = detail.totalScore;
          const magnitude = Math.max(Math.abs(baseScore), 1);
          const noise =
            iterationNoiseScale > 0
              ? (rng() - 0.5) * 2 * iterationNoiseScale * magnitude
              : 0;
          return {
            detail,
            baseScore,
            noise,
            priority: baseScore + noise,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
              detail: HeuristicCandidateScoreDetail;
              baseScore: number;
              noise: number;
              priority: number;
            } => Boolean(entry),
        );

      if (!candidateEntries.length) {
        if (iteration === 0) {
          context.logs.push(
            `Iteration search skipped for operation ${operation.operationName} (plan ${operation.operationPlanId}) – candidateEntries empty despite ${availableCandidates.length} candidates.`,
          );
        }
        continue;
      }

      candidateEntries.sort((a, b) => b.priority - a.priority);
      const selectedDetails = candidateEntries
        .slice(0, requiredPeople)
        .map((entry) => entry.detail);
      const selectedIds = selectedDetails.map(
        (detail) => detail.candidate.employeeId,
      );

      const combinationDetail = SchedulingService.calculateCombinationScore(
        context,
        operation,
        shift,
        selectedDetails,
        candidateResult,
        productionHours,
        overtimeHours,
        candidateEntries,
        iterationSettings,
        iteration,
      );
      const score = combinationDetail.score;
      iterationScores.push(Number(score.toFixed(4)));
      if (baseIterationScore === undefined) {
        baseIterationScore = score;
      }
      if (score > bestScoreSoFar) {
        bestScoreSoFar = score;
        bestIterationSoFar = iteration;
      }

      if (
        !bestResult ||
        score > bestResult.score + SCORE_COMPARISON_EPSILON
      ) {
        bestResult = {
          iteration,
          score,
          selectedIds,
          candidateScores: candidateEntries.map((entry) => entry.detail),
          detail: combinationDetail,
        };
      }

      const shouldEmitProgress =
        iterationSettings.count <= 1 ||
        iteration === iterationSettings.count - 1 ||
        iteration === 0 ||
        ((iteration + 1) % progressInterval === 0 &&
          iterationSettings.count > 1);

      if (shouldEmitProgress && context.runId) {
        const bestScoreOverall =
          bestResult && bestResult.score > bestScoreSoFar
            ? bestResult.score
            : bestScoreSoFar;
        await SchedulingService.recordRunEvent(
          context,
          "PLANNING",
          "PROGRESS",
          `迭代 ${iteration + 1}/${iterationSettings.count}，组合评分 ${score.toFixed(2)}`,
          {
            type: "ITERATION_PROGRESS",
            operationPlanId: operation.operationPlanId,
            operationName: operation.operationName,
            iteration: iteration + 1,
            totalIterations: iterationSettings.count,
            comboScore: Number(score.toFixed(4)),
            bestScore: Number(bestScoreSoFar.toFixed(4)),
            bestIteration: bestIterationSoFar + 1,
            bestOverallScore: Number(bestScoreOverall.toFixed(4)),
            nightPenalty: Number(
              combinationDetail.nightVariancePenalty.toFixed(4),
            ),
            explorationBonus: Number(
              combinationDetail.explorationBonus.toFixed(4),
            ),
          },
        );
      }
    }

    if (!bestResult) {
      return {
        selectedEmployeeIds: baseDiagnostic.selectedEmployeeIds.slice(),
        diagnostic: baseDiagnostic,
      };
    }

    const diagnostic: OperationHeuristicDiagnostics = {
      ...baseDiagnostic,
      candidateScores: bestResult.candidateScores,
      selectedEmployeeIds: bestResult.selectedIds.slice(),
      iterationCount: iterationSettings.count,
      bestIteration: bestResult.iteration + 1,
      iterationScores,
      randomizationStrength: iterationSettings.randomizationStrength,
      bestIterationScore: Number(bestResult.score.toFixed(4)),
      combinationDetail: bestResult.detail,
    };

    const baseScore =
      baseIterationScore !== undefined
        ? Number(baseIterationScore.toFixed(4))
        : diagnostic.bestIterationScore;
    const improvement = Number(
      (bestResult.score - (baseIterationScore ?? bestResult.score)).toFixed(4),
    );

    const summaryParts = [
      `组合评分 ${bestResult.detail.score.toFixed(2)}`,
      `平均 ${bestResult.detail.avgIndividualScore.toFixed(2)}`,
      `均衡惩罚 ${bestResult.detail.stdDeviation.toFixed(2)}`,
    ];
    if (bestResult.detail.nightVariancePenalty > 0) {
      summaryParts.push(
        `夜班惩罚 ${bestResult.detail.nightVariancePenalty.toFixed(2)}`,
      );
    }
    if (iterationSettings.count > 1) {
      summaryParts.push(
        `最佳迭代 ${bestResult.iteration + 1}/${iterationSettings.count}`,
      );
      if (improvement > 0) {
        summaryParts.push(`提升 ${improvement.toFixed(2)}`);
      }
    }

    diagnostic.notes = [...(diagnostic.notes ?? []), summaryParts.join("，")];
    if (iterationSettings.count > 1) {
      context.logs.push(
        `Iterative heuristic search for ${operation.operationName} on ${diagnostic.planDate}: best iteration ${diagnostic.bestIteration}/${iterationSettings.count}, combo score ${diagnostic.bestIterationScore}.`,
      );
    }

    return {
      selectedEmployeeIds: diagnostic.selectedEmployeeIds,
      diagnostic,
    };
  }

  private static calculateCombinationScore(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    shift: ShiftDefinition | undefined,
    selectedDetails: HeuristicCandidateScoreDetail[],
    candidateResult: CandidateSelectionResult,
    productionHours: number,
    overtimeHours: number,
    candidateEntries: Array<{
      detail: HeuristicCandidateScoreDetail;
      baseScore: number;
      noise: number;
      priority: number;
    }>,
    iterationSettings: IterationSettings,
    iteration: number,
  ): CombinationScoreDetail {
    if (!selectedDetails.length) {
      return {
        iteration,
        score: -Infinity,
        avgIndividualScore: 0,
        stdDeviation: 0,
        overtimePenalty: 0,
        shareBonus: 0,
        leaderPenalty: 0,
        explorationBonus: 0,
        nightVariancePenalty: 0,
        isNightShift: SchedulingService.isNightShiftOperation(shift, operation),
      };
    }

    const weights = DEFAULT_COMBINATION_WEIGHTS;
    const nightCounts = context.nightShiftCounts ?? new Map<number, number>();
    if (!context.nightShiftCounts) {
      context.nightShiftCounts = nightCounts;
    }
    const avgIndividualScore =
      selectedDetails.reduce(
        (sum, detail) => sum + detail.totalScore,
        0,
      ) / selectedDetails.length;

    const stdDeviation = SchedulingService.computeStandardDeviation(
      selectedDetails.map((detail) => detail.totalScore),
    );

    const assignmentHours = Math.max(0, productionHours + overtimeHours);
    let overtimePenaltyTotal = 0;
    let shareContributionTotal = 0;
    let leaderCount = 0;
    let noiseTotal = 0;

    const noiseMap = new Map<number, number>();
    candidateEntries.forEach((entry) => {
      noiseMap.set(entry.detail.candidate.employeeId, entry.noise);
    });

    selectedDetails.forEach((detail) => {
      const employeeId = detail.candidate.employeeId;
      const envelope = context.employeeHourEnvelope.get(employeeId);
      if (envelope) {
        if (envelope.risk === "CRITICAL") {
          overtimePenaltyTotal += 1.5;
        } else if (envelope.risk === "LOW") {
          overtimePenaltyTotal += 0.5;
        }
        if (
          Number.isFinite(envelope.remaining) &&
          envelope.remaining < assignmentHours
        ) {
          overtimePenaltyTotal += 1;
        }
      } else if (assignmentHours > 0) {
        overtimePenaltyTotal += 0.5;
      }

      const rawBreakdown = detail.rawBreakdown ?? {};
      const shareGroup = Number(rawBreakdown.shareGroupBonus ?? 0);
      const sharePreference = Number(rawBreakdown.sharePreferenceBonus ?? 0);
      shareContributionTotal += shareGroup + sharePreference;

      const tier = context.employeeRoleTier.get(employeeId) || "FRONTLINE";
      if (tier === "LEADER") {
        leaderCount += 1;
      }

      const noise = Math.abs(noiseMap.get(employeeId) ?? 0);
      noiseTotal += noise;
    });

    const overtimePenalty = overtimePenaltyTotal / selectedDetails.length;
    const shareBonus =
      shareContributionTotal / selectedDetails.length;

    let leaderPenalty = leaderCount / selectedDetails.length;
    if (
      leaderCount > 0 &&
      candidateResult.frontlineCandidates.length >= selectedDetails.length
    ) {
      leaderPenalty *= 1.5;
    }

    const explorationBonus =
      selectedDetails.length > 0
        ? noiseTotal / selectedDetails.length
        : 0;

    const isNightShift = SchedulingService.isNightShiftOperation(shift, operation);
    let nightVariancePenalty = 0;
    if (isNightShift) {
      const counts = selectedDetails.map((detail) => {
        const baseCount =
          nightCounts.get(detail.candidate.employeeId) ?? 0;
        return baseCount + 1;
      });
      const nightStd = SchedulingService.computeStandardDeviation(counts);
      const nightRange =
        counts.length > 0 ? Math.max(...counts) - Math.min(...counts) : 0;
      nightVariancePenalty = nightStd + nightRange * 0.1;
    }

    const score =
      weights.avgIndividual * avgIndividualScore -
      weights.balancePenalty * stdDeviation -
      weights.overtimePenalty * overtimePenalty +
      weights.shareBonus * Math.max(shareBonus, 0) -
      weights.leaderPenalty * leaderPenalty +
      weights.explorationBonus * explorationBonus -
      weights.nightPenalty * nightVariancePenalty;

    return {
      iteration,
      score,
      avgIndividualScore,
      stdDeviation,
      overtimePenalty,
      shareBonus,
      leaderPenalty,
      explorationBonus,
      nightVariancePenalty,
      isNightShift,
    };
  }

  private static computeStandardDeviation(values: number[]): number {
    if (!values.length) {
      return 0;
    }
    if (values.length === 1) {
      return 0;
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce(
        (sum, value) => sum + (value - mean) * (value - mean),
        0,
      ) / values.length;
    return Math.sqrt(Math.max(variance, 0));
  }

  private static isNightShiftOperation(
    shift: ShiftDefinition | undefined,
    operation: OperationPlanSummary,
  ): boolean {
    if (shift?.shiftCode) {
      const code = shift.shiftCode.toUpperCase();
      if (code.includes("NIGHT")) {
        return true;
      }
    }
    const start = dayjs(operation.plannedStart);
    const end = dayjs(operation.plannedEnd);
    const startHour = start.hour() + start.minute() / 60;
    const endHour =
      end.hour() +
      end.minute() / 60 +
      (end.isAfter(start, "day") ? 24 : 0);
    return startHour >= 19 || endHour > 24;
  }

  private static isNightShiftCode(shiftCode?: string | null): boolean {
    if (!shiftCode) {
      return false;
    }
    const code = shiftCode.toUpperCase();
    if (code.includes("NIGHT")) {
      return true;
    }
    return false;
  }

  private static createRandomGenerator(seed?: number): () => number {
    if (seed === undefined || !Number.isFinite(seed)) {
      return Math.random;
    }
    let t = Math.trunc(seed);
    if (t === 0) {
      t = 0x1a2b3c4d;
    }
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private static buildIterationSummary(
    context: SchedulingContext,
    iterationSettings?: IterationSettings,
  ): IterationSummary | undefined {
    if (!iterationSettings || iterationSettings.count <= 1) {
      return undefined;
    }

    const diagnostics = Array.from(context.heuristicLogs.values()).filter(
      (diag) => Array.isArray(diag.iterationScores) && diag.iterationScores.length > 0,
    );
    const evaluatedOperations = diagnostics.length;

    if (!evaluatedOperations) {
      return {
        totalIterations: iterationSettings.count,
        evaluatedOperations: 0,
      };
    }

    let bestDiagnostic: OperationHeuristicDiagnostics | undefined;
    let bestScore = -Infinity;

    diagnostics.forEach((diag) => {
      const scores = diag.iterationScores ?? [];
      if (!scores.length) {
        return;
      }
      const diagBestScore =
        diag.bestIterationScore !== undefined
          ? diag.bestIterationScore
          : Math.max(...scores);
      if (!Number.isFinite(diagBestScore)) {
        return;
      }
      if (diagBestScore > bestScore) {
        bestScore = diagBestScore;
        bestDiagnostic = diag;
      }
    });

    if (!bestDiagnostic || !Number.isFinite(bestScore)) {
      return {
        totalIterations: iterationSettings.count,
        evaluatedOperations,
      };
    }

    const relatedOperation = context.operations.find(
      (op) => op.operationPlanId === bestDiagnostic!.operationPlanId,
    );

    return {
      totalIterations: iterationSettings.count,
      evaluatedOperations,
      bestScore: Number(bestScore.toFixed(4)),
      bestIteration: bestDiagnostic.bestIteration,
      bestOperationPlanId: bestDiagnostic.operationPlanId,
      bestOperationName:
        relatedOperation?.operationName ??
        `Operation#${bestDiagnostic.operationPlanId}`,
      bestPlanDate: bestDiagnostic.planDate,
      scores: bestDiagnostic.iterationScores?.slice(),
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
    const preferredData = SchedulingService.collectPreferredEmployees(
      context,
      operation,
    );
    const hasGroupPriority = preferredData.groupPreferred.length > 0;
    const hasPreferencePriority = preferredData.preferencePreferred.length > 0;
    const shareGroupWeightMultiplier = hasGroupPriority ? 1.8 : 1;
    const sharePreferenceWeightMultiplier = hasPreferencePriority ? 1.5 : 1;
    const workloadWeightMultiplier =
      hasGroupPriority || hasPreferencePriority ? 0.75 : 1;
    const changeCostWeightMultiplier =
      hasGroupPriority || hasPreferencePriority ? 0.85 : 1;

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
      preferredGroupEmployeeIds: preferredData.groupPreferred,
      preferredPreferenceEmployeeIds: preferredData.preferencePreferred,
      shareGroupWeightMultiplier,
      sharePreferenceWeightMultiplier,
      workloadWeightMultiplier,
      changeCostWeightMultiplier,
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

    const isDryRun = Boolean(options?.dryRun);
    if (isDryRun) {
      context.logs.push(
        "Dry-run mode: base roster will be generated in-memory only. / 干跑模式：仍生成基础班表但不写入数据库",
      );
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

    SchedulingService.refreshHourEnvelopes(
      context,
      context.employees.map((employee) => employee.employeeId),
    );
  }

  private static async planProductionLoads(
    context: SchedulingContext,
    options: AutoPlanRequest["options"],
    iterationSettings: IterationSettings,
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
    context.iterationSettings = iterationSettings;
    context.nightShiftCounts = context.nightShiftCounts ?? new Map();

    const qualifiedMap =
      await SchedulingService.fetchQualifiedCandidatesForOperations(context);
    context.qualifiedCandidates = qualifiedMap;
    SchedulingService.seedAssignmentCaches(context);
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
        operationsAssigned += 1;
        continue;
      }

      const { shift, productionHours, overtimeHours } =
        SchedulingService.determineShiftForOperation(context, operation);
      const qualifiedSet = qualifiedMap.get(operation.operationPlanId);

      const availableHeadcount = SchedulingService.calculateAvailableHeadcount(
        context,
        planDate,
      );
      const candidateResult = SchedulingService.findCandidateEmployees(
        context,
        operation,
        shift,
        productionHours,
        overtimeHours,
        qualifiedSet,
      );
      const candidateEmployees = candidateResult.candidates;
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
        candidateEmployeeIds: candidateResult.allCandidates.slice(),
        assignedEmployeeIds: [],
      });
      if (candidateResult.filteredByHourLimit.length) {
        const labels = candidateResult.filteredByHourLimit
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `因标准工时余量不足排除：${labels.join(", ")}`,
        );
      }
      if (candidateResult.filteredByConsecutiveLimit.length) {
        const labels = candidateResult.filteredByConsecutiveLimit
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `因连续上班天数已达上限排除：${labels.join(", ")}`,
        );
        context.logs.push(
          `Skipped candidates for ${operation.operationName} on ${planDate} due to consecutive-day limit: ${labels.join(", ")}`,
        );
      }
      if (candidateResult.filteredByNightRest.length) {
        const labels = candidateResult.filteredByNightRest
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `夜班后强制休息未满要求：${labels.join(", ")}`,
        );
        context.logs.push(
          `Night-shift rest enforced for ${operation.operationName} on ${planDate}; excluded: ${labels.join(", ")}`,
        );
      }
      if (candidateResult.nightRestPenalty.size) {
        const penaltyNotes: string[] = [];
        candidateResult.nightRestPenalty.forEach((info, id) => {
          const label = SchedulingService.resolveEmployeeLabel(context, id);
          if (label) {
            penaltyNotes.push(`${label}(夜班后仅休 ${info.restDays} 天)`);
          }
        });
        if (penaltyNotes.length) {
          diagnostics.notes = diagnostics.notes ?? [];
          diagnostics.notes.push(
            `夜班休息仅1天：${penaltyNotes.join(", ")}`,
          );
        }
      }
      if (candidateResult.forcedToUseLeaders) {
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push("已启用管理人员兜底候选 / Leader fallback engaged");
        context.logs.push(
          `Leader fallback for operation ${operation.operationName} on ${planDate}: frontline不足 ${candidateResult.frontlineCandidates.length}/${requiredPeople}.`,
        );
      }
      context.logs.push(
        `Operation ${operation.operationPlanId} (${operation.operationName}) on ${planDate} requires ${operation.requiredPeople} people, found ${candidateEmployees.length} candidate(s).` +
          ` / 操作 ${operation.operationName}（ID=${operation.operationPlanId}，${planDate}）需 ${operation.requiredPeople} 人，候选 ${candidateEmployees.length}`,
      );

      if (!candidateEmployees.length) {
        context.warnings.push(
          `操作 ${operation.operationName} 在 ${planDate} 缺少可分配人员，请手动处理 / Operation ${operation.operationName} lacks candidates on ${planDate}`,
        );
      }

      let heuristicDiagnostics = SchedulingService.runHeuristicSelection(
        context,
        operation,
        candidateEmployees,
        shift,
        candidateResult.nightRestPenalty,
      );
      if (candidateEmployees.length > 0 && requiredPeople > 0) {
        const iterationResult = await SchedulingService.applyIterationSearch(
          context,
          operation,
          heuristicDiagnostics,
          candidateResult,
          shift,
          productionHours,
          overtimeHours,
          iterationSettings,
        );
        heuristicDiagnostics = iterationResult.diagnostic;
      }
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
      const preferredDataForStats = SchedulingService.collectPreferredEmployees(
        context,
        operation,
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

      SchedulingService.applySelectedEmployeesToOperation(
        context,
        operation,
        planDate,
        selected,
        shift,
        productionHours,
        overtimeHours,
        diagnostics,
        diagnostic,
        requiredPeople,
        preferredDataForStats,
      );
    }
    SchedulingService.reconcileBaseRosterWithProduction(context);
    await SchedulingService.evaluateCoverage(context);
    if (
      context.shareStats.totalGroupOperations > 0 ||
      context.shareStats.totalPreferenceOperations > 0
    ) {
      context.logs.push(
        `Shared reuse stats - groups: ${context.shareStats.groupReuseSuccess}/${context.shareStats.totalGroupOperations} successful; preferences: ${context.shareStats.preferenceReuseSuccess}/${context.shareStats.totalPreferenceOperations} successful. / 共享复用统计：共享组成功 ${context.shareStats.groupReuseSuccess}/${context.shareStats.totalGroupOperations}，人员偏好成功 ${context.shareStats.preferenceReuseSuccess}/${context.shareStats.totalPreferenceOperations}`,
      );
    }
    context.logs.push(
      `Production overlay completed: ${operationsAssigned} operations assigned, ${context.productionAssignments.length} total assignment records. / 生产叠加完成：分配 ${operationsAssigned} 个操作，共写入 ${context.productionAssignments.length} 条记录`,
    );

    context.iterationSummary = SchedulingService.buildIterationSummary(
      context,
      iterationSettings,
    );
    SchedulingService.balanceQuarterHours(context);
  }

  private static async planProductionLoadsExhaustive(
    context: SchedulingContext,
    _options: AutoPlanRequest["options"],
  ) {
    context.logs.push(
      `Processing ${context.operations.length} operations for production overlay (exhaustive). / 正在执行组合遍历排班：共 ${context.operations.length} 个操作`,
    );
    if (context.operations.length === 0) {
      context.logs.push("No operations to schedule. / 无需排程的操作");
      return;
    }

    const qualifiedMap =
      await SchedulingService.fetchQualifiedCandidatesForOperations(context);
    context.qualifiedCandidates = qualifiedMap;
    SchedulingService.seedAssignmentCaches(context);

    let operationsAssigned = 0;
    let abortedByCoverage = false;
    let abortIndex: number | null = null;
    let failedOperations = 0; // 添加变量声明
    const totalOperations = context.operations.length;
    const coverageThresholdCount = Math.ceil(totalOperations * 0.9);
    const rng =
      context.iterationSettings?.seed !== undefined
        ? SchedulingService.createRandomGenerator(context.iterationSettings?.seed)
        : undefined;

    mainLoop: for (let index = 0; index < context.operations.length; index += 1) {
      const operation = context.operations[index];
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
        operationsAssigned += 1;
        continue;
      }

      const { shift, productionHours, overtimeHours } =
        SchedulingService.determineShiftForOperation(context, operation);
      const qualifiedSet = qualifiedMap.get(operation.operationPlanId);
      const availableHeadcount = SchedulingService.calculateAvailableHeadcount(
        context,
        planDate,
      );
      const candidateResult = SchedulingService.findCandidateEmployees(
        context,
        operation,
        shift,
        productionHours,
        overtimeHours,
        qualifiedSet,
      );
      const candidatePool = candidateResult.allCandidates.slice();
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
        availableQualified: candidatePool.length,
        candidateEmployeeIds: candidatePool.slice(),
        assignedEmployeeIds: [],
      });

      if (candidateResult.filteredByHourLimit.length) {
        const labels = candidateResult.filteredByHourLimit
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `因标准工时余量不足排除：${labels.join(", ")}`,
        );
      }
      if (candidateResult.filteredByConsecutiveLimit.length) {
        const labels = candidateResult.filteredByConsecutiveLimit
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `因连续上班天数已达上限排除：${labels.join(", ")}`,
        );
        context.logs.push(
          `Skipped candidates for ${operation.operationName} on ${planDate} due to consecutive-day limit: ${labels.join(", ")}`,
        );
      }
      if (candidateResult.filteredByNightRest.length) {
        const labels = candidateResult.filteredByNightRest
          .map((id) => SchedulingService.resolveEmployeeLabel(context, id))
          .filter(Boolean);
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push(
          `夜班后强制休息未满要求：${labels.join(", ")}`,
        );
        context.logs.push(
          `Night-shift rest enforced for ${operation.operationName} on ${planDate}; excluded: ${labels.join(", ")}`,
        );
      }
      if (candidateResult.nightRestPenalty.size) {
        const penaltyNotes: string[] = [];
        candidateResult.nightRestPenalty.forEach((info, id) => {
          const label = SchedulingService.resolveEmployeeLabel(context, id);
          if (label) {
            penaltyNotes.push(`${label}(夜班后仅休 ${info.restDays} 天)`);
          }
        });
        if (penaltyNotes.length) {
          diagnostics.notes = diagnostics.notes ?? [];
          diagnostics.notes.push(
            `夜班休息仅1天：${penaltyNotes.join(", ")}`,
          );
        }
      }
      if (candidateResult.forcedToUseLeaders) {
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push("已启用管理人员兜底候选 / Leader fallback engaged");
        context.logs.push(
          `Leader fallback for operation ${operation.operationName} on ${planDate}: frontline不足 ${candidateResult.frontlineCandidates.length}/${requiredPeople}.`,
        );
      }
      context.logs.push(
        `Operation ${operation.operationPlanId} (${operation.operationName}) on ${planDate} requires ${operation.requiredPeople} people, found ${candidatePool.length} candidate(s).` +
          ` / 操作 ${operation.operationName}（ID=${operation.operationPlanId}，${planDate}）需 ${operation.requiredPeople} 人，候选 ${candidatePool.length}`,
      );

      const diagnostic: OperationHeuristicDiagnostics = {
        operationPlanId: operation.operationPlanId,
        planDate,
        requiredPeople,
        candidateScores: [],
        selectedEmployeeIds: [],
        timestamp: dayjs().toISOString(),
        notes: [],
      };

      if (candidatePool.length < requiredPeople) {
        diagnostics.notes = diagnostics.notes ?? [];
        diagnostics.notes.push("候选人数不足，无法生成组合");
        diagnostic.fallbackReason = "INSUFFICIENT_CANDIDATES";
        const hotspot = SchedulingService.createHotspot(
          context,
          operation,
          diagnostic,
          0,
        );
        context.heuristicHotspots.push(hotspot);
        context.heuristicLogs.set(operation.operationPlanId, diagnostic);
        context.warnings.push(
          `操作 ${operation.operationName} 在 ${planDate} 缺少可分配人员，请手动处理 / Operation ${operation.operationName} lacks candidates on ${planDate}`,
        );
        failedOperations += 1;
        const remainingOps = totalOperations - (index + 1);
        const maxPotential = operationsAssigned + remainingOps;
        if (maxPotential < coverageThresholdCount) {
          abortedByCoverage = true;
          abortIndex = index + 1;
          context.warnings.push(
            '覆盖率已无法维持在 90% 以上，后续操作将跳过自动排班。',
          );
          break mainLoop;
        }
        continue;
      }

      if (index === 0 && candidatePool.length > 1) {
        SchedulingService.shuffleArray(candidatePool, rng);
      }

      let combinationCount = 0;
      let conflictCount = 0;
      let selectedCombo: number[] | undefined;

      SchedulingService.forEachCombination(candidatePool, requiredPeople, (combo) => {
        combinationCount += 1;
        if (
          !SchedulingService.isCombinationFeasible(
            context,
            operation,
            combo,
            shift,
            productionHours,
            overtimeHours,
          )
        ) {
          conflictCount += 1;
          return false;
        }
        selectedCombo = combo.slice();
        return true;
      });

      diagnostics.notes = diagnostics.notes ?? [];
      diagnostics.notes.push(
        `组合总数：${combinationCount}，冲突组合：${conflictCount}`,
      );
      diagnostic.notes = diagnostic.notes ?? [];
      diagnostic.notes.push(
        `组合总数：${combinationCount}，冲突组合：${conflictCount}`,
      );

      if (!selectedCombo) {
        diagnostic.fallbackReason = "NO_FEASIBLE_COMBINATION";
        const hotspot = SchedulingService.createHotspot(
          context,
          operation,
          diagnostic,
          combinationCount,
        );
        context.heuristicHotspots.push(hotspot);
        context.heuristicLogs.set(operation.operationPlanId, diagnostic);
        context.warnings.push(
          `操作 ${operation.operationName} 在 ${planDate} 未找到有效组合，请手动处理 / Operation ${operation.operationName} has no feasible combination on ${planDate}`,
        );
        failedOperations += 1;
        const remainingOps = totalOperations - (index + 1);
        const maxPotential = operationsAssigned + remainingOps;
        if (maxPotential < coverageThresholdCount) {
          abortedByCoverage = true;
          abortIndex = index + 1;
          context.warnings.push(
            '覆盖率已无法维持在 90% 以上，后续操作将跳过自动排班。',
          );
          break mainLoop;
        }
        continue;
      }

      diagnostic.selectedEmployeeIds = selectedCombo.slice();
      const preferredDataForStats =
        SchedulingService.collectPreferredEmployees(context, operation);

      SchedulingService.applySelectedEmployeesToOperation(
        context,
        operation,
        planDate,
        selectedCombo,
        shift,
        productionHours,
        overtimeHours,
        diagnostics,
        diagnostic,
        requiredPeople,
        preferredDataForStats,
      );

      context.heuristicLogs.set(operation.operationPlanId, diagnostic);
      operationsAssigned += 1;
    }

    if (abortedByCoverage && abortIndex !== null) {
      const skippedCount = totalOperations - abortIndex;
      context.logs.push(
        `Coverage pruning triggered after ${failedOperations} failure(s): skipped ${skippedCount} remaining operation(s). / 覆盖率剪枝触发：因 ${failedOperations} 个操作失败，跳过 ${skippedCount} 个剩余操作`,
      );
      for (let j = abortIndex; j < totalOperations; j += 1) {
        const skippedOp = context.operations[j];
        const skippedDate = dayjs(skippedOp.plannedStart).format("YYYY-MM-DD");
        const skippedDiagnostics = SchedulingService.ensureCoverageDiagnostics(context, {
          operationPlanId: skippedOp.operationPlanId,
          planDate: skippedDate,
          requiredPeople: Math.max(skippedOp.requiredPeople, 1),
          batchPlanId: skippedOp.batchPlanId,
          batchCode: skippedOp.batchCode,
          stageName: skippedOp.stageName,
          operationId: skippedOp.operationId,
          operationName: skippedOp.operationName,
          availableHeadcount: SchedulingService.calculateAvailableHeadcount(
            context,
            skippedDate,
          ),
          qualifiedPoolSize: 0,
          availableQualified: 0,
          candidateEmployeeIds: [],
          assignedEmployeeIds: [],
        });
        skippedDiagnostics.fallbackReason = "COVERAGE_THRESHOLD";
        skippedDiagnostics.notes = [
          ...(skippedDiagnostics.notes || []),
          '因覆盖率低于90%被剪枝，未执行自动排班',
        ];
      }
    }

    SchedulingService.reconcileBaseRosterWithProduction(context);
    await SchedulingService.evaluateCoverage(context);
    context.logs.push(
      `Exhaustive assignment completed: ${operationsAssigned} operations assigned, ${context.productionAssignments.length} total assignment records. / 组合遍历排班完成：分配 ${operationsAssigned} 个操作，共写入 ${context.productionAssignments.length} 条记录`,
    );
    context.iterationSummary = undefined;
    SchedulingService.balanceQuarterHours(context);
  }

  private static applySelectedEmployeesToOperation(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    planDate: string,
    selected: number[],
    shift: ShiftDefinition | undefined,
    productionHours: number,
    overtimeHours: number,
    coverageDiagnostics: OperationCoverageDiagnostics,
    heuristicDiagnostic: OperationHeuristicDiagnostics,
    requiredPeople: number,
    preferredDataForStats: {
      combined: number[];
      groupPreferred: number[];
      preferencePreferred: number[];
    },
  ) {
    if (!selected.length) {
      return;
    }

    const selectedSet = new Set(selected);

    if (preferredDataForStats.groupPreferred.length) {
      context.shareStats.totalGroupOperations += 1;
      const aggregatedPreferredSet = new Set(
        preferredDataForStats.groupPreferred,
      );
      const reusedGroupCount = selected.filter((id) =>
        aggregatedPreferredSet.has(id),
      ).length;
      const requiredGroupMatches = Math.min(
        requiredPeople,
        preferredDataForStats.groupPreferred.length,
      );
      const missingGroupIds = preferredDataForStats.groupPreferred.filter(
        (id) => !selectedSet.has(id),
      );
      const bestSelectedScore = SchedulingService.findBestSelectedScore(
        heuristicDiagnostic,
        selectedSet,
      );
      let aggregatedReason: string | undefined;

      if (reusedGroupCount >= requiredGroupMatches && reusedGroupCount > 0) {
        context.shareStats.groupReuseSuccess += 1;
      } else {
        context.shareStats.groupReusePartial += 1;
        const topPreferred = heuristicDiagnostic.candidateScores.find((score) =>
          aggregatedPreferredSet.has(score.candidate.employeeId),
        );
        aggregatedReason = SchedulingService.describeCandidateScoreReason(
          topPreferred,
          bestSelectedScore,
          "共享组候选综合评分较低",
        );
        heuristicDiagnostic.notes = heuristicDiagnostic.notes ?? [];
        heuristicDiagnostic.notes.push(
          `共享组复用未达标：${aggregatedReason}`,
        );
      }

      const groupsForOperation =
        context.operationShareGroups.get(operation.operationPlanId) ?? [];
      if (groupsForOperation.length) {
        groupsForOperation.forEach((groupInfo) => {
          const groupPreferredIds = SchedulingService.collectGroupPreferredMembers(
            context,
            groupInfo.groupId,
            operation.operationPlanId,
          );
          const groupPreferredSet = new Set(groupPreferredIds);
          const reusedIds = selected.filter((id) =>
            groupPreferredSet.has(id),
          );
          const missingIds = groupPreferredIds.filter(
            (id) => !selectedSet.has(id),
          );
          let groupReason = aggregatedReason;
          if (missingIds.length) {
            const topGroupCandidate = heuristicDiagnostic.candidateScores.find(
              (score) => missingIds.includes(score.candidate.employeeId),
            );
            groupReason = SchedulingService.describeCandidateScoreReason(
              topGroupCandidate,
              bestSelectedScore,
              aggregatedReason ?? "共享组候选综合评分较低",
            );
          }
          const detail = SchedulingService.ensureShareGroupDetail(
            context,
            groupInfo,
          );
          const effectiveReason =
            missingIds.length > 0 ? groupReason : undefined;
          SchedulingService.recordShareGroupOperation(
            context,
            detail,
            operation,
            planDate,
            groupPreferredIds,
            selected,
            reusedIds,
            missingIds,
            effectiveReason,
          );
          if (missingIds.length && groupReason) {
            const label = groupInfo.groupName || `Group#${groupInfo.groupId}`;
            context.logs.push(
              `Share group ${label} reuse gap on ${planDate}: ${groupReason}. / 共享组 ${label} 于 ${planDate} 未完全复用：${groupReason}`,
            );
          }
        });
      }
    } else {
      const groupsForOperation =
        context.operationShareGroups.get(operation.operationPlanId) ?? [];
      if (groupsForOperation.length) {
        groupsForOperation.forEach((groupInfo) => {
          const detail = SchedulingService.ensureShareGroupDetail(
            context,
            groupInfo,
          );
          SchedulingService.recordShareGroupOperation(
            context,
            detail,
            operation,
            planDate,
            [],
            selected,
            [],
            [],
            undefined,
          );
        });
      }
    }

    if (preferredDataForStats.preferencePreferred.length) {
      context.shareStats.totalPreferenceOperations += 1;
      const preferenceSet = new Set(
        preferredDataForStats.preferencePreferred,
      );
      const reusedPreference = selected.filter((id) =>
        preferenceSet.has(id),
      ).length;
      const requiredPreferenceMatches = Math.min(
        requiredPeople,
        preferredDataForStats.preferencePreferred.length,
      );
      const missingPreferenceIds = preferredDataForStats.preferencePreferred.filter(
        (id) => !selectedSet.has(id),
      );
      const bestSelectedScore = SchedulingService.findBestSelectedScore(
        heuristicDiagnostic,
        selectedSet,
      );

      if (
        reusedPreference >= requiredPreferenceMatches &&
        reusedPreference > 0
      ) {
        context.shareStats.preferenceReuseSuccess += 1;
      } else {
        context.shareStats.preferenceReusePartial += 1;
        const topPreference = heuristicDiagnostic.candidateScores.find(
          (score) => preferenceSet.has(score.candidate.employeeId),
        );
        const reason = SchedulingService.describeCandidateScoreReason(
          topPreference,
          bestSelectedScore,
          "共享偏好候选综合评分较低",
        );
        heuristicDiagnostic.notes = heuristicDiagnostic.notes ?? [];
        heuristicDiagnostic.notes.push(`共享偏好未满足：${reason}`);
        context.logs.push(
          `Share preference unmet for ${operation.operationName} on ${planDate}: ${reason}. / 共享偏好未满足（${operation.operationName}，${planDate}）：${reason}`,
        );
        if (missingPreferenceIds.length) {
          SchedulingService.recordSharePreferenceFailure(
            context,
            operation,
            planDate,
            preferredDataForStats.preferencePreferred,
            selected,
            missingPreferenceIds,
            reason,
          );
        }
      }
    }

    selected.forEach((employeeId) => {
      const stats = context.employeeStats.get(employeeId);
      if (!stats) {
        return;
      }

      coverageDiagnostics.assignedEmployeeIds.push(employeeId);

      const baseAssignments = context.baseRosterIndex.get(planDate) || [];
      const baseAssignment = baseAssignments.find(
        (item) => item.employeeId === employeeId,
      );
      if (baseAssignment) {
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
        operation.plannedStart,
        operation.plannedEnd,
      );

      SchedulingService.updateConsecutiveCounters(context, employeeId, planDate);
    });

    SchedulingService.refreshHourEnvelopes(context, selected);
  }

  private static registerProductionAssignment(
    context: SchedulingContext,
    operationPlanId: number,
    employeeId: number,
    planDate: string,
    shiftCode: string,
    productionHours: number,
    overtimeHours: number,
    startDateTime?: string,
    endDateTime?: string,
  ) {
    const productionAssignment: ProductionAssignment = {
      operationPlanId,
      employeeId,
      planDate,
      shiftCode,
      category: "PRODUCTION",
      planHours: productionHours,
      startDateTime,
      endDateTime,
    };
    context.productionAssignments.push(productionAssignment);
    if (SchedulingService.isNightShiftCode(shiftCode)) {
      const current = context.nightShiftCounts.get(employeeId) ?? 0;
      context.nightShiftCounts.set(employeeId, current + 1);
    }
    SchedulingService.indexProductionAssignment(context, productionAssignment);
    if (productionHours > 0) {
      SchedulingService.trackDailyProduction(context, planDate, employeeId, productionHours, {
        locked: false,
        overtime: false,
      });
    }

    if (startDateTime && endDateTime) {
      SchedulingService.recordDailyAssignment(
        context,
        planDate,
        employeeId,
        operationPlanId,
        startDateTime,
        endDateTime,
      );
    }

    const operationSet =
      context.operationAssignments.get(operationPlanId) || new Set<number>();
    operationSet.add(employeeId);
    context.operationAssignments.set(operationPlanId, operationSet);

    const groups = context.operationShareGroups.get(operationPlanId) ?? [];
    if (groups.length) {
      groups.forEach((group) => {
        const assigned =
          context.shareGroupAssignments.get(group.groupId) ||
          new Set<number>();
        assigned.add(employeeId);
        context.shareGroupAssignments.set(group.groupId, assigned);
      });
    }

    if (overtimeHours > 0) {
      const overtimeAssignment: ProductionAssignment = {
        operationPlanId,
        employeeId,
        planDate,
        shiftCode,
        category: "OVERTIME",
        planHours: overtimeHours,
        startDateTime,
        endDateTime,
      };
      context.productionAssignments.push(overtimeAssignment);
      SchedulingService.indexProductionAssignment(context, overtimeAssignment);
      SchedulingService.trackDailyProduction(
        context,
        planDate,
        employeeId,
        overtimeHours,
        {
          locked: false,
          overtime: true,
        },
      );
    }
  }

  private static trackDailyProduction(
    context: SchedulingContext,
    planDate: string,
    employeeId: number,
    hours: number,
    options?: { locked?: boolean; overtime?: boolean },
  ) {
    if (!planDate || !Number.isFinite(hours) || hours <= 0) {
      return;
    }
    const dayBucket =
      context.dailyProductionSnapshot.get(planDate) ||
      new Map<number, DailyProductionStat>();
    const current =
      dayBucket.get(employeeId) ?? {
        totalHours: 0,
        overtimeHours: 0,
        hasLocked: false,
        operationCount: 0,
      };
    current.totalHours = Number((current.totalHours + hours).toFixed(4));
    if (options?.overtime) {
      current.overtimeHours = Number(
        (current.overtimeHours + hours).toFixed(4),
      );
    }
    if (options?.locked) {
      current.hasLocked = true;
    }
    current.operationCount += 1;
    dayBucket.set(employeeId, current);
    context.dailyProductionSnapshot.set(planDate, dayBucket);
  }

  private static reconcileBaseRosterWithProduction(context: SchedulingContext) {
    if (!context.baseRosterAssignments.length) {
      SchedulingService.rebuildEmployeeStats(context);
      SchedulingService.refreshHourEnvelopes(context);
      return;
    }

    const dateSet = new Set<string>();
    context.baseRosterIndex.forEach((_value, key) => {
      dateSet.add(key);
    });
    context.dailyProductionSnapshot.forEach((_value, key) => {
      dateSet.add(key);
    });

    if (!dateSet.size) {
      SchedulingService.rebuildEmployeeStats(context);
      SchedulingService.refreshHourEnvelopes(context);
      return;
    }

    const sortedDates = Array.from(dateSet.values()).sort();
    const overageBudget = new Map<number, number>();
    const hasTarget = typeof context.quarterStandardHours === "number";
    const epsilon = 0.01;
    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        overageBudget.set(employee.employeeId, 0);
        return;
      }
      if (hasTarget) {
        const diff = stats.quarterHours - (context.quarterStandardHours ?? 0);
        overageBudget.set(employee.employeeId, diff > epsilon ? diff : 0);
      } else {
        const envelope = context.employeeHourEnvelope.get(employee.employeeId);
        if (!envelope) {
          overageBudget.set(employee.employeeId, 0);
          return;
        }
        const remaining = envelope.remaining;
        overageBudget.set(
          employee.employeeId,
          Number.isFinite(remaining) && remaining < -epsilon
            ? Math.abs(remaining)
            : 0,
        );
      }
    });

    let convertedToRest = 0;
    let trimmedHours = 0;
    let restoredWorkdays = 0;

    sortedDates.forEach((planDate) => {
      const baseAssignments = context.baseRosterIndex.get(planDate) || [];
      const baseMap = new Map<number, BaseRosterAssignment>();
      baseAssignments.forEach((assignment) => {
        baseMap.set(assignment.employeeId, assignment);
      });
      const productionMap =
        context.dailyProductionSnapshot.get(planDate) ||
        new Map<number, DailyProductionStat>();

      context.employees.forEach((employee) => {
        const employeeId = employee.employeeId;
        const assignment = baseMap.get(employeeId);
        const production = productionMap.get(employeeId);
        const productionHours = production?.totalHours ?? 0;
        const hasProduction = productionHours > 0.0001;

        if (!assignment && !hasProduction) {
          return;
        }

        if (!assignment && hasProduction) {
          const synthesized: BaseRosterAssignment = {
            employeeId,
            planDate,
            shiftCode: "DAY",
            planHours: Number(productionHours.toFixed(4)),
            source: "AUTO_BASE",
          };
          context.baseRosterAssignments.push(synthesized);
          SchedulingService.indexBaseAssignment(context, synthesized);
          baseMap.set(employeeId, synthesized);
        }

        const current = baseMap.get(employeeId);
        if (!current) {
          return;
        }

        if (!hasProduction) {
          if (current.source === "LOCKED") {
            return;
          }
          if (current.planHours > 0) {
            const overage = overageBudget.get(employeeId) ?? 0;
            if (overage <= 0.0001) {
              return;
            }
            const removable = Math.min(current.planHours, overage);
            const remainingHours = Number(
              (current.planHours - removable).toFixed(4),
            );
            overageBudget.set(
              employeeId,
              Math.max(0, overage - removable),
            );
            if (remainingHours <= 0.0001) {
              trimmedHours += removable;
              current.planHours = 0;
              current.shiftCode = "REST";
              convertedToRest += 1;
            } else {
              current.planHours = remainingHours;
              trimmedHours += removable;
            }
          }
          return;
        }

        if (current.source !== "LOCKED") {
          const neededHours = Number(
            Math.max(current.planHours, productionHours).toFixed(4),
          );
          if (current.planHours < neededHours) {
            current.planHours = neededHours;
          }
          if (current.shiftCode === "REST") {
            current.shiftCode = "DAY";
            restoredWorkdays += 1;
          }
        }
      });
    });

    const nightRestAdjustments =
      SchedulingService.ensureNightShiftRestDays(context);
    if (nightRestAdjustments > 0) {
      convertedToRest += nightRestAdjustments;
      context.logs.push(
        `Night-shift rest enforced (primary/secondary): converted ${nightRestAdjustments} day(s) to REST after night duty. / 夜班后自动安排（含首日/次日）休息 ${nightRestAdjustments} 天`,
      );
    }

    if (convertedToRest > 0 || restoredWorkdays > 0 || trimmedHours > 0.0001) {
      context.logs.push(
        `Base roster reconciled with production: ${convertedToRest} rest day(s) added, trimmed ${trimmedHours.toFixed(2)}h, ${restoredWorkdays} work day(s) restored. / 基础班表对齐生产：新增休息 ${convertedToRest} 天，削减工时 ${trimmedHours.toFixed(2)} 小时，恢复出勤 ${restoredWorkdays} 天`,
      );
    }

    SchedulingService.rebuildEmployeeStats(context);
    SchedulingService.refreshHourEnvelopes(context);
    SchedulingService.buildCandidateProfiles(context);
  }

  private static balanceQuarterHours(context: SchedulingContext) {
    if (!context.quarterStandardHours) {
      return;
    }

    const target = context.quarterStandardHours;
    const epsilon = 0.01;
    const dayShift =
      context.shiftDefinitions.find(
        (def) => def.shiftCode.toUpperCase() === "DAY",
      ) ?? context.shiftDefinitions[0];
    if (!dayShift) {
      return;
    }
    const defaultShiftCode = dayShift.shiftCode;
    const defaultShiftHours =
      dayShift.nominalHours > 0 ? dayShift.nominalHours : 8;

    const assignmentLookup = new Map<number, Map<string, BaseRosterAssignment>>();
    context.baseRosterAssignments.forEach((assignment) => {
      let map = assignmentLookup.get(assignment.employeeId);
      if (!map) {
        map = new Map();
        assignmentLookup.set(assignment.employeeId, map);
      }
      map.set(assignment.planDate, assignment);
    });

    const productionByEmployeeDate = new Map<number, Set<string>>();
    context.productionAssignments.forEach((assignment) => {
      if (
        assignment.category === "PRODUCTION" ||
        assignment.category === "OVERTIME"
      ) {
        const dateKey = dayjs(assignment.planDate).format("YYYY-MM-DD");
        const set =
          productionByEmployeeDate.get(assignment.employeeId) ||
          new Set<string>();
        set.add(dateKey);
        productionByEmployeeDate.set(assignment.employeeId, set);
      }
    });

    const isWorkDay = (employeeId: number, dateKey: string): boolean => {
      const assignment = assignmentLookup.get(employeeId)?.get(dateKey);
      const baseHours = assignment?.planHours ?? 0;
      if (baseHours > epsilon) {
        return true;
      }
      return productionByEmployeeDate.get(employeeId)?.has(dateKey) ?? false;
    };

    const countWorkDays = (
      employeeId: number,
      referenceDate: string,
      direction: 1 | -1,
      limit: number,
    ): number => {
      let cursor = dayjs(referenceDate);
      let total = 0;
      for (let i = 0; i < limit; i += 1) {
        cursor = cursor.add(direction, "day");
        const key = cursor.format("YYYY-MM-DD");
        if (!isWorkDay(employeeId, key)) {
          break;
        }
        total += 1;
        if (total >= limit) {
          break;
        }
      }
      return total;
    };

    const shortages: Array<{ employeeId: number; needed: number }> = [];
    const overages: Array<{ employeeId: number; excess: number }> = [];

    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        return;
      }
      const diff = Number((target - stats.quarterHours).toFixed(4));
      if (diff > epsilon) {
        shortages.push({ employeeId: employee.employeeId, needed: diff });
      } else if (diff < -epsilon) {
        overages.push({ employeeId: employee.employeeId, excess: -diff });
      }
    });

    if (!shortages.length && !overages.length) {
      context.logs.push(
        "Quarter-hours already balanced to target; no adjustments needed.",
      );
      return;
    }

    let restConverted = 0;
    let addedHours = 0;

    shortages.forEach((item) => {
      if (item.needed <= epsilon) {
        return;
      }

      const employee = context.employees.find(
        (emp) => emp.employeeId === item.employeeId,
      );
      if (!employee) {
        return;
      }
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        return;
      }
      const maxDaily =
        employee.limits?.maxDailyHours && employee.limits.maxDailyHours > 0
          ? employee.limits.maxDailyHours
          : defaultShiftHours;

      const restAssignments = context.baseRosterAssignments
        .filter(
          (assignment) =>
            assignment.employeeId === item.employeeId &&
            assignment.source === "AUTO_BASE" &&
            assignment.planHours <= epsilon &&
            assignment.shiftCode === "REST",
        )
        .sort((a, b) => a.planDate.localeCompare(b.planDate));

      restAssignments.forEach((assignment) => {
        if (item.needed <= epsilon) {
          return;
        }
        let hoursToAdd = Math.min(
          item.needed,
          Math.min(defaultShiftHours, maxDaily),
        );
        if (hoursToAdd <= epsilon) {
          return;
        }
        const maxConsecutive = employee.limits?.maxConsecutiveDays ?? 6;
        if (maxConsecutive > 0) {
          const leftWork = countWorkDays(
            employee.employeeId,
            assignment.planDate,
            -1,
            maxConsecutive,
          );
          if (leftWork + 1 > maxConsecutive) {
            return;
          }
          const remainingRightWindow = Math.max(
            maxConsecutive - leftWork - 1,
            0,
          );
          let rightWork = 0;
          if (remainingRightWindow > 0) {
            rightWork = countWorkDays(
              employee.employeeId,
              assignment.planDate,
              1,
              remainingRightWindow,
            );
          }
          if (leftWork + 1 + rightWork > maxConsecutive) {
            return;
          }
        }
        const monthKey = assignment.planDate.slice(0, 7);
        const monthStandard = context.monthlyStandardHours.get(monthKey);
        if (monthStandard !== undefined) {
          const monthUpper = monthStandard + context.monthHourTolerance;
          const currentMonthHours = stats.monthHours.get(monthKey) ?? 0;
          if (currentMonthHours >= monthUpper - epsilon) {
            return;
          }
          const remainingMonthCapacity = Math.max(
            0,
            monthUpper - currentMonthHours,
          );
          hoursToAdd = Math.min(hoursToAdd, remainingMonthCapacity);
          if (hoursToAdd <= epsilon) {
            return;
          }
        }
        assignment.planHours = Number(hoursToAdd.toFixed(4));
        assignment.shiftCode = defaultShiftCode;
        restConverted += 1;
        addedHours += hoursToAdd;
        item.needed = Number((item.needed - hoursToAdd).toFixed(4));
      });
    });

    if (restConverted > 0) {
      context.logs.push(
        `Balanced quarter-hours by converting ${restConverted} rest slot(s) into base shifts, adding ${addedHours.toFixed(2)}h.`,
      );
      SchedulingService.rebuildEmployeeStats(context);
      SchedulingService.refreshHourEnvelopes(context);
      SchedulingService.buildCandidateProfiles(context);
    }

    SchedulingService.trimBaseRosterForOverages(context, target);

    const remainingShortages: Array<{ employee: string; diff: number }> = [];
    const remainingOverages: Array<{ employee: string; diff: number }> = [];
    context.employees.forEach((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      if (!stats) {
        return;
      }
      const diff = Number((target - stats.quarterHours).toFixed(4));
      if (diff > epsilon) {
        remainingShortages.push({
          employee: `${employee.employeeName}(${employee.employeeCode})`,
          diff,
        });
      } else if (diff < -epsilon) {
        remainingOverages.push({
          employee: `${employee.employeeName}(${employee.employeeCode})`,
          diff: -diff,
        });
      }
    });

    if (!remainingShortages.length && !remainingOverages.length) {
      context.logs.push("Quarter-hours balanced to target for all employees.");
      return;
    }

    const segmentCount = Math.max(context.standardHourSegments || 1, 1);
    const upperTolerance = 36 * segmentCount;
    const lowerTolerance = 4 * segmentCount;

    const warnShortages = remainingShortages
      .map(
        (item) =>
          `${item.employee} 少 ${item.diff.toFixed(2)}h (允许下限 ${lowerTolerance}h)`,
      )
      .join("；");
    const warnOverages = remainingOverages
      .map(
        (item) =>
          `${item.employee} 多 ${item.diff.toFixed(2)}h (允许上限 ${upperTolerance}h)`,
      )
      .join("；");

    if (warnShortages || warnOverages) {
      const message =
        "已按上下限处理，但仍存在无法完全调平的人员工时：" +
        [warnShortages, warnOverages].filter(Boolean).join("；");
      context.warnings.push(message);
      context.logs.push(message);
    }
  }

  private static trimBaseRosterForOverages(
    context: SchedulingContext,
    quarterTarget: number,
  ) {
    const epsilon = 0.01;
    const MIN_BACKUP_PER_DAY = 2;
    const MAX_CONSECUTIVE_REST = 2;
    const WEEKLY_REMOVAL_LIMIT = 2;
    const W_BACKUP = 5;
    const W_MONTH = 3;
    const W_QUARTER = 2;
    const W_WEEK = 4;
    const W_STREAK = 6;
    const W_DAY_CLUSTER = 4;
    const W_NEIGHBOR_CLUSTER = 1.5;
    const W_WEEKEND_PROTECTION = 8;
    const W_PRODUCTION_LOAD = 0.5;
    const W_PRODUCTION_PEAK = 2;
    const BONUS_DOUBLE_REST = 3;
    const NEIGHBOR_CLUSTER_WINDOW = 2;

    const overageEmployees = context.employees.filter((employee) => {
      const stats = context.employeeStats.get(employee.employeeId);
      return stats ? stats.quarterHours - quarterTarget > epsilon : false;
    });

    if (!overageEmployees.length) {
      return;
    }

    const productionByDate = new Map<string, number>();
    const productionByEmployeeDate = new Map<number, Set<string>>();
    context.productionAssignments.forEach((assignment) => {
      if (
        assignment.category === "PRODUCTION" ||
        assignment.category === "OVERTIME"
      ) {
        const planDate = dayjs(assignment.planDate).format("YYYY-MM-DD");
        productionByDate.set(
          planDate,
          (productionByDate.get(planDate) || 0) + 1,
        );
        const set =
          productionByEmployeeDate.get(assignment.employeeId) ||
          new Set<string>();
        set.add(planDate);
        productionByEmployeeDate.set(assignment.employeeId, set);
      }
    });

    let totalProductionAssignments = 0;
    productionByDate.forEach((count) => {
      totalProductionAssignments += count;
    });
    const productionDays = productionByDate.size || 1;
    const averageProduction =
      totalProductionAssignments / Math.max(productionDays, 1);
    const productionPeakThreshold = Math.max(
      MIN_BACKUP_PER_DAY + 1,
      averageProduction * 1.2,
    );

    const baseCountByDate = new Map<string, number>();
    context.baseRosterAssignments.forEach((assignment) => {
      if ((assignment.planHours ?? 0) > epsilon) {
        baseCountByDate.set(
          assignment.planDate,
          (baseCountByDate.get(assignment.planDate) || 0) + 1,
        );
      }
    });

    const assignmentLookup = new Map<
      number,
      Map<string, BaseRosterAssignment>
    >();
    const autoBaseAssignments = new Map<number, BaseRosterAssignment[]>();
    context.baseRosterAssignments.forEach((assignment) => {
      let dateMap = assignmentLookup.get(assignment.employeeId);
      if (!dateMap) {
        dateMap = new Map();
        assignmentLookup.set(assignment.employeeId, dateMap);
      }
      dateMap.set(assignment.planDate, assignment);
      if (
        assignment.source === "AUTO_BASE" &&
        assignment.planHours > epsilon
      ) {
        const arr =
          autoBaseAssignments.get(assignment.employeeId) || [];
        arr.push(assignment);
        autoBaseAssignments.set(assignment.employeeId, arr);
      }
    });
    autoBaseAssignments.forEach((arr) =>
      arr.sort((a, b) => a.planDate.localeCompare(b.planDate)),
    );

    const weeklyRemovalCount = new Map<number, Map<string, number>>();
    const removedCountByDate = new Map<string, number>();
    let removals = 0;
    let removedHours = 0;
    let iterations = 0;

    const hasProduction = (employeeId: number, planDate: string) =>
      productionByEmployeeDate.get(employeeId)?.has(planDate) ?? false;

    const getWeekKey = (planDate: string) =>
      dayjs(planDate).startOf("week").format("YYYY-MM-DD");

    const countRestDays = (
      employeeId: number,
      fromDate: string,
      direction: 1 | -1,
    ) => {
      const map = assignmentLookup.get(employeeId);
      if (!map) {
        return 0;
      }
      let cursor = dayjs(fromDate);
      let count = 0;
      for (let i = 0; i < MAX_CONSECUTIVE_REST; i += 1) {
        cursor = cursor.add(direction, "day");
        const key = cursor.format("YYYY-MM-DD");
        const assignment = map.get(key);
        if (!assignment) {
          break;
        }
        if (hasProduction(employeeId, key)) {
          break;
        }
        if ((assignment.planHours ?? 0) > epsilon) {
          break;
        }
        count += 1;
      }
      return count;
    };

    const monthTargetCache = new Map<number, Map<string, number>>();
    const getMonthTargets = (employeeId: number, stats: EmployeeStats) => {
      if (monthTargetCache.has(employeeId)) {
        return monthTargetCache.get(employeeId)!;
      }
      const map = new Map<string, number>();
      if (context.monthlyStandardHours.size) {
        context.monthlyStandardHours.forEach((value, key) => {
          map.set(key, value);
        });
      } else {
        const months = Array.from(stats.monthHours.keys());
        const count = Math.max(months.length, 1);
        const base = quarterTarget / count;
        months.forEach((key) => map.set(key, base));
      }
      monthTargetCache.set(employeeId, map);
      return map;
    };

    const periodStart = dayjs(context.period.startDate);
    const totalPeriodDays =
      dayjs(context.period.endDate).diff(periodStart, "day") + 1;
    const periodCenter = totalPeriodDays > 0 ? totalPeriodDays / 2 : 0;

    type TrimCandidate = {
      assignment: BaseRosterAssignment;
      employeeId: number;
      planDate: string;
      hours: number;
      weekKey: string;
      monthKey: string;
      score: number;
      restSpan: number;
      backupSlack: number;
      productionCount: number;
      removedThisDate: number;
      neighborRemovalLoad: number;
      dayIndex: number;
    };

    while (true) {
      iterations += 1;
      if (iterations > 10000) {
        context.logs.push(
          "Trim base roster reached iteration guard; remaining overages may persist.",
        );
        break;
      }

      let bestCandidate: TrimCandidate | null = null;

      context.employees.forEach((employee) => {
        const stats = context.employeeStats.get(employee.employeeId);
        if (!stats) {
          return;
        }
        const quarterExcess = stats.quarterHours - quarterTarget;
        if (quarterExcess <= epsilon) {
          return;
        }

        const assignments =
          autoBaseAssignments.get(employee.employeeId) || [];
        if (!assignments.length) {
          return;
        }

        const monthTargets = getMonthTargets(employee.employeeId, stats);

        assignments.forEach((assignment) => {
          const hours = assignment.planHours;
          if (!hours || hours <= epsilon) {
            return;
          }

          const planDate = assignment.planDate;
          if (hasProduction(employee.employeeId, planDate)) {
            return;
          }

          const baseCount = baseCountByDate.get(planDate) || 0;
          const productionCount = productionByDate.get(planDate) || 0;
          if (
            baseCount - 1 <
            productionCount + MIN_BACKUP_PER_DAY
          ) {
            return;
          }

          const weekKey = getWeekKey(planDate);
          const weekMap =
            weeklyRemovalCount.get(employee.employeeId) ||
            new Map<string, number>();
          const removedThisWeek = weekMap.get(weekKey) || 0;
          if (removedThisWeek >= WEEKLY_REMOVAL_LIMIT) {
            return;
          }

          const leftRest = countRestDays(employee.employeeId, planDate, -1);
          const rightRest = countRestDays(employee.employeeId, planDate, 1);
          if (leftRest + 1 + rightRest > MAX_CONSECUTIVE_REST) {
            return;
          }

          const monthKey = planDate.slice(0, 7);
          const baseTarget =
            monthTargets.get(monthKey) ??
            quarterTarget / Math.max(stats.monthHours.size || 1, 1);
          const monthUpper = baseTarget + context.monthHourTolerance;
          const monthLower = Math.max(0, baseTarget - context.monthHourTolerance);
          const monthHours = stats.monthHours.get(monthKey) ?? 0;
          if (monthHours <= monthLower + epsilon) {
            return;
          }
          if (monthHours - hours < monthLower - epsilon) {
            return;
          }
          const monthExcess = monthHours - monthUpper;

          const backupSlack =
            baseCount -
            1 -
            productionCount -
            MIN_BACKUP_PER_DAY;
          if (backupSlack < 0) {
            return;
          }

          const removedThisDate = removedCountByDate.get(planDate) || 0;
          let neighborRemovalLoad = 0;
          for (
            let offset = -NEIGHBOR_CLUSTER_WINDOW;
            offset <= NEIGHBOR_CLUSTER_WINDOW;
            offset += 1
          ) {
            if (offset === 0) {
              continue;
            }
            const neighborKey = dayjs(planDate)
              .add(offset, "day")
              .format("YYYY-MM-DD");
            neighborRemovalLoad += removedCountByDate.get(neighborKey) || 0;
          }

          const restSpan = leftRest + 1 + rightRest;
          const doubleRestBonus = restSpan === 2 ? BONUS_DOUBLE_REST : 0;

          const dayOfWeek = dayjs(planDate).day();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          let weekendPenalty = 0;
          if (isWeekend) {
            weekendPenalty =
              productionCount > 0
                ? W_WEEKEND_PROTECTION / 2
                : W_WEEKEND_PROTECTION;
          }

          let productionPenalty = productionCount * W_PRODUCTION_LOAD;
          if (productionCount >= productionPeakThreshold) {
            productionPenalty +=
              (productionCount - productionPeakThreshold + 1) *
              W_PRODUCTION_PEAK;
          }

          const score =
            backupSlack * W_BACKUP +
            Math.max(monthExcess, 0) * W_MONTH +
            Math.max(quarterExcess, 0) * W_QUARTER -
            removedThisWeek * W_WEEK -
            (leftRest + rightRest) * W_STREAK +
            doubleRestBonus -
            removedThisDate * W_DAY_CLUSTER -
            neighborRemovalLoad * W_NEIGHBOR_CLUSTER -
            weekendPenalty -
            productionPenalty;

          const dayIndex = dayjs(planDate).diff(periodStart, "day");

          let shouldReplace = false;
          if (!bestCandidate) {
            shouldReplace = true;
          } else if (score > bestCandidate.score) {
            shouldReplace = true;
          } else if (score === bestCandidate.score) {
            if (restSpan > bestCandidate.restSpan) {
              shouldReplace = true;
            } else if (restSpan === bestCandidate.restSpan) {
              if (backupSlack > bestCandidate.backupSlack) {
                shouldReplace = true;
              } else if (backupSlack === bestCandidate.backupSlack) {
                if (productionCount < bestCandidate.productionCount) {
                  shouldReplace = true;
                } else if (
                  productionCount === bestCandidate.productionCount
                ) {
                  if (removedThisDate < bestCandidate.removedThisDate) {
                    shouldReplace = true;
                  } else if (
                    removedThisDate === bestCandidate.removedThisDate
                  ) {
                    if (
                      neighborRemovalLoad < bestCandidate.neighborRemovalLoad
                    ) {
                      shouldReplace = true;
                    } else if (
                      neighborRemovalLoad === bestCandidate.neighborRemovalLoad
                    ) {
                      const currentDistance = Math.abs(
                        dayIndex - periodCenter,
                      );
                      const bestDistance = Math.abs(
                        bestCandidate.dayIndex - periodCenter,
                      );
                      if (currentDistance < bestDistance) {
                        shouldReplace = true;
                      } else if (
                        currentDistance === bestDistance &&
                        dayIndex > bestCandidate.dayIndex
                      ) {
                        shouldReplace = true;
                      }
                    }
                  }
                }
              }
            }
          }

          if (shouldReplace) {
            bestCandidate = {
              assignment,
              employeeId: employee.employeeId,
              planDate,
              hours,
              weekKey,
              monthKey,
              score,
              restSpan,
              backupSlack,
              productionCount,
              removedThisDate,
              neighborRemovalLoad,
              dayIndex,
            };
          }
        });
      });

      if (bestCandidate === null) {
        break;
      }

      const candidate = bestCandidate as TrimCandidate;
      const assignment: BaseRosterAssignment = candidate.assignment;
      const employeeId: number = candidate.employeeId;
      const planDate: string = candidate.planDate;
      const hours: number = candidate.hours;
      const weekKey: string = candidate.weekKey;
      const monthKey: string = candidate.monthKey;
      const stats = context.employeeStats.get(employeeId);
      if (!stats) {
        break;
      }

      assignment.planHours = 0;
      assignment.shiftCode = "REST";
      baseCountByDate.set(
        planDate,
        Math.max((baseCountByDate.get(planDate) || 0) - 1, 0),
      );

      stats.quarterHours = Number(
        (stats.quarterHours - hours).toFixed(4),
      );
      const monthHours = stats.monthHours.get(monthKey) ?? 0;
      stats.monthHours.set(
        monthKey,
        Number((monthHours - hours).toFixed(4)),
      );
      stats.dailyHours.set(planDate, 0);
      monthTargetCache.delete(employeeId);

      const weekMap =
        weeklyRemovalCount.get(employeeId) || new Map<string, number>();
      weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
      weeklyRemovalCount.set(employeeId, weekMap);
      removedCountByDate.set(
        planDate,
        (removedCountByDate.get(planDate) || 0) + 1,
      );

      removedHours += hours;
      removals += 1;
    }

    if (removals > 0) {
      SchedulingService.rebuildEmployeeStats(context);
      SchedulingService.refreshHourEnvelopes(context);
      SchedulingService.buildCandidateProfiles(context);
      context.logs.push(
        `Trimmed ${removals} base shift(s) totaling ${removedHours.toFixed(
          2,
        )}h to balance workload.`,
      );
    }
  }

  private static rebuildEmployeeStats(context: SchedulingContext) {
    const newStats = new Map<number, EmployeeStats>();
    context.employees.forEach((employee) => {
      newStats.set(employee.employeeId, {
        quarterHours: 0,
        monthHours: new Map(),
        dailyHours: new Map(),
        consecutiveDays: 0,
      });
    });

    const dateSet = new Set<string>();
    context.baseRosterAssignments.forEach((assignment) => {
      dateSet.add(assignment.planDate);
    });
    const sortedDates = Array.from(dateSet.values()).sort();
    const consecutiveTracker = new Map<number, number>();

    sortedDates.forEach((planDate) => {
      const assignments = context.baseRosterIndex.get(planDate) || [];
      const assignmentMap = new Map<number, BaseRosterAssignment>();
      assignments.forEach((assignment) => {
        assignmentMap.set(assignment.employeeId, assignment);
      });

      context.employees.forEach((employee) => {
        const stats = newStats.get(employee.employeeId);
        if (!stats) {
          return;
        }
        const assignment = assignmentMap.get(employee.employeeId);
        const hours = assignment ? assignment.planHours : 0;
        stats.dailyHours.set(planDate, hours);
        const monthKey = planDate.slice(0, 7);
        stats.monthHours.set(
          monthKey,
          (stats.monthHours.get(monthKey) || 0) + hours,
        );
        stats.quarterHours += hours;
        const prev = consecutiveTracker.get(employee.employeeId) || 0;
        const next = hours > 0 ? prev + 1 : 0;
        consecutiveTracker.set(employee.employeeId, next);
        stats.consecutiveDays = next;
      });
    });

    context.employeeStats = newStats;
  }

  private static formatCsvCell(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }
    const normalized = String(value).replace(/\r?\n/g, " ").trim();
    if (!normalized.length) {
      return "";
    }
    if (/[",]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  }

  private static shuffleArray<T>(items: T[], rng?: () => number): void {
    const random = rng ?? Math.random;
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
  }

  private static forEachCombination<T>(
    source: T[],
    size: number,
    visit: (combination: T[]) => boolean | void,
  ): boolean {
    if (size <= 0) {
      return visit([]) === true;
    }
    if (size > source.length) {
      return false;
    }

    const combination: T[] = new Array(size);
    const backtrack = (start: number, depth: number): boolean => {
      if (depth === size) {
        return visit(combination.slice()) === true;
      }
      for (
        let i = start;
        i <= source.length - (size - depth);
        i += 1
      ) {
        combination[depth] = source[i];
        if (backtrack(i + 1, depth + 1)) {
          return true;
        }
      }
      return false;
    };

    return backtrack(0, 0);
  }

  private static isCombinationFeasible(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    combination: number[],
    _shift: ShiftDefinition | undefined,
    _productionHours: number,
    _overtimeHours: number,
  ): boolean {
    const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");
    const startDateTime = operation.plannedStart;
    const endDateTime = operation.plannedEnd;

    for (const employeeId of combination) {
      if (
        SchedulingService.hasAssignmentConflict(
          context,
          planDate,
          employeeId,
          startDateTime,
          endDateTime,
        )
      ) {
        return false;
      }
      const before = SchedulingService.countConsecutiveWorkdays(
        context,
        employeeId,
        planDate,
        -1,
        6,
      );
      const after = SchedulingService.countConsecutiveWorkdays(
        context,
        employeeId,
        planDate,
        1,
        6,
      );
      if (before + 1 + after >= 7) {
        return false;
      }
    }

    return true;
  }

  private static hasAssignmentConflict(
    context: SchedulingContext,
    planDate: string,
    employeeId: number,
    startDateTime?: string | null,
    endDateTime?: string | null,
  ): boolean {
    if (!startDateTime || !endDateTime) {
      return false;
    }

    const start = dayjs(startDateTime);
    const end = dayjs(endDateTime);
    if (!start.isValid() || !end.isValid()) {
      return false;
    }

    const dayStart = dayjs(`${planDate} 00:00:00`);
    if (!dayStart.isValid()) {
      return false;
    }

    let startHour = start.diff(dayStart, "minute") / 60;
    let endHour = end.diff(dayStart, "minute") / 60;
    if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
      return false;
    }
    if (endHour <= startHour) {
      while (endHour <= startHour) {
        endHour += 24;
      }
    }

    const dailyAssignments = context.employeeDailyAssignments.get(planDate);
    if (!dailyAssignments) {
      return false;
    }
    const slots = dailyAssignments.get(employeeId);
    if (!slots || !slots.length) {
      return false;
    }

    return slots.some((slot) =>
      SchedulingService.intervalsOverlap(
        slot.start,
        slot.end,
        startHour,
        endHour,
      ),
    );
  }

  private static collectPreferredEmployees(
    context: SchedulingContext,
    operation: OperationPlanSummary,
  ): {
    combined: number[];
    groupPreferred: number[];
    preferencePreferred: number[];
  } {
    const combined: number[] = [];
    const combinedSeen = new Set<number>();
    const groupPreferred: number[] = [];
    const groupSeen = new Set<number>();
    const preferencePreferred: number[] = [];
    const preferenceSeen = new Set<number>();

    const addCombined = (employeeId: number) => {
      if (!combinedSeen.has(employeeId)) {
        combinedSeen.add(employeeId);
        combined.push(employeeId);
      }
    };

    const addGroup = (employeeId: number) => {
      if (!groupSeen.has(employeeId)) {
        groupSeen.add(employeeId);
        groupPreferred.push(employeeId);
        addCombined(employeeId);
      }
    };

    const addPreference = (employeeId: number) => {
      if (!preferenceSeen.has(employeeId)) {
        preferenceSeen.add(employeeId);
        preferencePreferred.push(employeeId);
        addCombined(employeeId);
      }
    };

    const groupInfo =
      context.operationShareGroups.get(operation.operationPlanId) ?? [];
    if (groupInfo.length) {
      const sortedGroups = [...groupInfo].sort(
        (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
      );
      sortedGroups.forEach((group) => {
        const memberOps =
          context.shareGroupMembers.get(group.groupId) || new Set<number>();
        memberOps.forEach((memberOpId) => {
          if (memberOpId === operation.operationPlanId) {
            return;
          }
          const assigned = context.operationAssignments.get(memberOpId);
          if (assigned) {
            assigned.forEach((employeeId) => {
              if (Number.isFinite(employeeId)) {
                addGroup(employeeId);
              }
            });
          }
        });

        const groupAssigned = context.shareGroupAssignments.get(group.groupId);
        if (groupAssigned) {
          groupAssigned.forEach((employeeId) => {
            if (Number.isFinite(employeeId)) {
              addGroup(employeeId);
            }
          });
        }
      });
    }

    const preferenceSet =
      context.sharedPreferences.get(operation.operationPlanId);
    if (preferenceSet?.size) {
      preferenceSet.forEach((predecessorOpId) => {
        const assigned = context.operationAssignments.get(predecessorOpId);
        if (assigned) {
          assigned.forEach((employeeId) => {
            if (Number.isFinite(employeeId)) {
              addPreference(employeeId);
            }
          });
        }
      });
    }

    return {
      combined,
      groupPreferred,
      preferencePreferred,
    };
  }

  private static collectGroupPreferredMembers(
    context: SchedulingContext,
    groupId: number,
    currentOperationId: number,
  ): number[] {
    const result = new Set<number>();
    const memberOps = context.shareGroupMembers.get(groupId) || new Set<number>();
    memberOps.forEach((operationId) => {
      if (operationId === currentOperationId) {
        return;
      }
      const assigned = context.operationAssignments.get(operationId);
      if (assigned) {
        assigned.forEach((employeeId) => {
          if (Number.isFinite(employeeId)) {
            result.add(employeeId);
          }
        });
      }
    });

    const priorAssignments = context.shareGroupAssignments.get(groupId);
    if (priorAssignments) {
      priorAssignments.forEach((employeeId) => {
        if (Number.isFinite(employeeId)) {
          result.add(employeeId);
        }
      });
    }

    return Array.from(result.values());
  }

  private static ensureShareGroupDetail(
    context: SchedulingContext,
    group: {
      groupId: number;
      groupName?: string | null;
      color?: string | null;
    },
  ): ShareGroupDetail {
    let detail = context.shareGroupDetails.get(group.groupId);
    if (!detail) {
      detail = {
        groupId: group.groupId,
        groupName: group.groupName ?? null,
        color: group.color ?? null,
        operations: [],
        preferredEmployeeIds: new Set<number>(),
        reusedEmployeeIds: new Set<number>(),
        unmetReasons: [],
      };
      context.shareGroupDetails.set(group.groupId, detail);
    }
    return detail;
  }

  private static recordShareGroupOperation(
    context: SchedulingContext,
    detail: ShareGroupDetail,
    operation: OperationPlanSummary,
    planDate: string,
    groupPreferredIds: number[],
    assignedIds: number[],
    reusedIds: number[],
    missingIds: number[],
    reason?: string,
  ) {
    groupPreferredIds.forEach((id) => detail.preferredEmployeeIds.add(id));
    reusedIds.forEach((id) => detail.reusedEmployeeIds.add(id));
    if (reason) {
      detail.unmetReasons.push(reason);
    }

    const assignedNames = assignedIds.map((id) =>
      SchedulingService.resolveEmployeeLabel(context, id),
    );
    const reusedNames = reusedIds.map((id) =>
      SchedulingService.resolveEmployeeLabel(context, id),
    );
    const missingNames = missingIds.map((id) =>
      SchedulingService.resolveEmployeeLabel(context, id),
    );

    detail.operations.push({
      operationPlanId: operation.operationPlanId,
      operationName: operation.operationName,
      planDate,
      assignedEmployees: assignedNames,
      reusedEmployees: reusedNames,
      missingPreferredEmployees: missingNames,
      reason,
    });
  }

  private static recordSharePreferenceFailure(
    context: SchedulingContext,
    operation: OperationPlanSummary,
    planDate: string,
    preferredIds: number[],
    assignedIds: number[],
    missingIds: number[],
    reason?: string,
  ) {
    context.sharePreferenceDetails.push({
      operationPlanId: operation.operationPlanId,
      operationName: operation.operationName,
      planDate,
      preferredEmployees: preferredIds.map((id) =>
        SchedulingService.resolveEmployeeLabel(context, id),
      ),
      assignedEmployees: assignedIds.map((id) =>
        SchedulingService.resolveEmployeeLabel(context, id),
      ),
      unmetEmployees: missingIds.map((id) =>
        SchedulingService.resolveEmployeeLabel(context, id),
      ),
      reason,
    });
  }

  private static resolveEmployeeLabel(
    context: SchedulingContext,
    employeeId: number,
  ): string {
    const cached = context.employeeLabelCache.get(employeeId);
    if (cached) {
      return cached;
    }

    const profile = context.candidateProfiles.get(employeeId);
    if (profile) {
      const label = `${profile.employeeName} (${profile.employeeCode})`;
      context.employeeLabelCache.set(employeeId, label);
      return label;
    }

    const employee = context.employees.find(
      (item) => item.employeeId === employeeId,
    );
    if (employee) {
      const label = `${employee.employeeName} (${employee.employeeCode})`;
      context.employeeLabelCache.set(employeeId, label);
      return label;
    }

    const fallback = `员工#${employeeId}`;
    context.employeeLabelCache.set(employeeId, fallback);
    return fallback;
  }

  private static findBestSelectedScore(
    diagnostic: OperationHeuristicDiagnostics,
    selectedIds: Set<number>,
  ): HeuristicCandidateScoreDetail | undefined {
    return diagnostic.candidateScores.find((score) =>
      selectedIds.has(score.candidate.employeeId),
    );
  }

  private static describeCandidateScoreReason(
    score: HeuristicCandidateScoreDetail | undefined,
    bestSelected: HeuristicCandidateScoreDetail | undefined,
    fallback: string,
  ): string {
    if (!score) {
      return fallback;
    }
    const weighted = score.weightedBreakdown ?? {};
    const entries = Object.entries(weighted);
    let weakest: [string, number] | undefined;
    entries.forEach(([key, value]) => {
      if (!weakest || value < weakest[1]) {
        weakest = [key, value];
      }
    });

    const reasonDictionary: Record<string, string> = {
      workloadBalance: "为平衡工时",
      consecutiveShiftRisk: "连续班次风险较高",
      changeCost: "减少换人成本",
      rolePenalty: "角色优先级较低",
      qualificationMatch: "资质匹配度不足",
      preferenceMatch: "班次偏好得分较低",
      shareGroupBonus: "共享组加权不足",
      sharePreferenceBonus: "共享偏好加权不足",
      criticalOperationBonus: "关键操作加权不足",
    };
    const factorLabels: Record<string, string> = {
      workloadBalance: "工时均衡",
      consecutiveShiftRisk: "连续风险",
      changeCost: "变更成本",
      rolePenalty: "角色权重",
      qualificationMatch: "资质匹配",
      preferenceMatch: "班次偏好",
      shareGroupBonus: "共享组",
      sharePreferenceBonus: "共享偏好",
      criticalOperationBonus: "关键操作",
    };

    let message: string;
    if (weakest && weakest[1] < 0) {
      const descriptor = reasonDictionary[weakest[0]] ?? "综合评分较低";
      const factorLabel = factorLabels[weakest[0]] ?? weakest[0];
      message = `${descriptor}（${factorLabel} ${weakest[1].toFixed(2)}）`;
    } else {
      message = fallback;
    }

    if (bestSelected) {
      const diff = Number(
        (bestSelected.totalScore - score.totalScore).toFixed(2),
      );
      if (diff > 0) {
        message = `${message}，比分差 ${diff.toFixed(2)}`;
      }
    }

    return message;
  }

  private static buildShareGroupSummaries(
    context: SchedulingContext,
  ): Array<{
    groupId: number;
    groupName?: string | null;
    color?: string | null;
    reuseSatisfied: boolean;
    totalPreferred: number;
    totalReused: number;
    operations: ShareGroupOperationDetail[];
    unmetReasons: string[];
  }> {
    return Array.from(context.shareGroupDetails.values()).map((detail) => {
      const totalPreferred = detail.preferredEmployeeIds.size;
      const totalReused = detail.reusedEmployeeIds.size;
      const reuseSatisfied =
        totalPreferred === 0 || totalReused >= totalPreferred;
      return {
        groupId: detail.groupId,
        groupName: detail.groupName ?? null,
        color: detail.color ?? null,
        reuseSatisfied,
        totalPreferred,
        totalReused,
        operations: detail.operations,
        unmetReasons: detail.unmetReasons,
      };
    });
  }

  private static buildSharePreferenceSummaries(
    context: SchedulingContext,
  ): SharePreferenceDetail[] {
    return context.sharePreferenceDetails.slice();
  }

  private static seedAssignmentCaches(context: SchedulingContext) {
    context.operationAssignments.clear();
    context.shareGroupAssignments.forEach((set) => set.clear());
    context.employeeDailyAssignments.clear();

    context.productionAssignments.forEach((assignment) => {
      if (!assignment || assignment.category !== "PRODUCTION") {
        return;
      }
      if (!assignment.operationPlanId || !assignment.employeeId) {
        return;
      }

      const opSet =
        context.operationAssignments.get(assignment.operationPlanId) ||
        new Set<number>();
      opSet.add(assignment.employeeId);
      context.operationAssignments.set(assignment.operationPlanId, opSet);

      if (assignment.startDateTime && assignment.endDateTime) {
        SchedulingService.recordDailyAssignment(
          context,
          assignment.planDate,
          assignment.employeeId,
          assignment.operationPlanId,
          assignment.startDateTime,
          assignment.endDateTime,
        );
      }

      const groups =
        context.operationShareGroups.get(assignment.operationPlanId) ?? [];
      if (!groups.length) {
        return;
      }
      groups.forEach((group) => {
        const assigned =
          context.shareGroupAssignments.get(group.groupId) ||
          new Set<number>();
        assigned.add(assignment.employeeId);
        context.shareGroupAssignments.set(group.groupId, assigned);
      });
    });
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
    const endHour = startHour + duration;

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
  ): CandidateSelectionResult {
    const planDate = dayjs(operation.plannedStart).format("YYYY-MM-DD");
    const NIGHT_REST_ONE_DAY_PENALTY = 1.2;
    const baseAssignments = context.baseRosterIndex.get(planDate) || [];
    const dailyAssignments = context.employeeDailyAssignments.get(planDate);
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

    const opWindow = SchedulingService.getOperationWindowHours(
      operation,
      planDate,
    );

    const filteredByHourLimit: number[] = [];
    const filteredByConsecutiveLimit: number[] = [];
    const filteredByNightRest: number[] = [];
    const nightRestPenalty = new Map<number, { penalty: number; restDays: number }>();
    const candidateIds: number[] = [];
    const requiredPeople = Math.max(operation.requiredPeople, 1);

    const baseAssignmentMap = new Map<number, BaseRosterAssignment>();
    baseAssignments.forEach((assignment) => {
      baseAssignmentMap.set(assignment.employeeId, assignment);
    });

    baseAssignments.forEach((assignment) => {
      const employeeId = assignment.employeeId;
      const stats = context.employeeStats.get(employeeId);
      const profile = context.employees.find(
        (emp) => emp.employeeId === employeeId,
      );
      if (!stats || !profile) {
        return;
      }
      if (
        context.operationAssignments
          .get(operation.operationPlanId)
          ?.has(employeeId)
      ) {
        return;
      }
      if (qualifiedSet && !qualifiedSet.has(employeeId)) {
        return;
      }
      if (
        context.operationAllowedEmployeeIds &&
        !context.operationAllowedEmployeeIds.has(employeeId)
      ) {
        return;
      }
      if (lockedEmployees.has(employeeId)) {
        return;
      }

      if (opWindow && dailyAssignments) {
        const slots =
          dailyAssignments.get(employeeId) ??
          ([] as Array<{ start: number; end: number; operationPlanId: number }>);
        const conflict = slots.some((slot) =>
          SchedulingService.intervalsOverlap(
            slot.start,
            slot.end,
            opWindow.startHour,
            opWindow.endHour,
          ),
        );
        if (conflict) {
          return;
        }
      }

      const baseHours = assignment.planHours || 0;
      const shiftHours = shift?.nominalHours ?? null;

      const effectiveWorkingHours = shiftHours
        ? Math.max(shiftHours, productionHours)
        : Math.max(baseHours, productionHours);

      let requiredDailyHours = Math.max(baseHours, effectiveWorkingHours);
      if (!shift && overtimeHours > 0) {
        requiredDailyHours += overtimeHours;
      } else if (shift && overtimeHours > 0) {
        requiredDailyHours = Math.max(
          requiredDailyHours,
          effectiveWorkingHours + overtimeHours,
        );
      }

      const limit = profile.limits;
      const enforceDailyLimit = limit && !shift;
      if (
        enforceDailyLimit &&
        requiredDailyHours > (limit.maxDailyHours ?? 0) + 0.01
      ) {
        return;
      }

      let additionalQuarterHours = Math.max(
        0,
        effectiveWorkingHours - baseHours,
      );
      if (overtimeHours > 0) {
        additionalQuarterHours += overtimeHours;
      }

      const envelope = context.employeeHourEnvelope.get(employeeId);
      if (
        envelope &&
        additionalQuarterHours > 0 &&
        envelope.remaining < additionalQuarterHours - 0.0001
      ) {
        filteredByHourLimit.push(employeeId);
        return;
      }

      if (!envelope && limit?.quarterStandardHours) {
        const upperBound =
          limit.quarterStandardHours +
          36 * Math.max(context.standardHourSegments || 1, 1);
        if (
          stats.quarterHours + additionalQuarterHours >
          upperBound + 0.0001
        ) {
          filteredByHourLimit.push(employeeId);
          return;
        }
      }

      const maxConsecutive = limit?.maxConsecutiveDays ?? 0;
      if (maxConsecutive > 0) {
        const workedBefore = SchedulingService.countConsecutiveWorkdays(
          context,
          employeeId,
          planDate,
          -1,
          maxConsecutive,
        );
        if (workedBefore >= maxConsecutive) {
          filteredByConsecutiveLimit.push(employeeId);
          return;
        }
      }

      const daysSinceNightShift =
        SchedulingService.daysSinceLastNightShift(context, employeeId, planDate);
      if (daysSinceNightShift !== null) {
        if (daysSinceNightShift <= 1) {
          filteredByNightRest.push(employeeId);
          return;
        }
        const restDays = daysSinceNightShift - 1;
        if (restDays === 1) {
          nightRestPenalty.set(employeeId, {
            penalty: NIGHT_REST_ONE_DAY_PENALTY,
            restDays,
          });
        }
      }

      candidateIds.push(employeeId);
    });

    const jitterStrength =
      (context.iterationSettings?.randomizationStrength ?? 0) * CANDIDATE_JITTER_SCALE;
    let candidateNoise: Map<number, number> | undefined;
    if (jitterStrength > 0.00001) {
      const baseSeed = context.iterationSettings?.seed;
      const normalizedDate = Number(planDate.replace(/-/g, ""));
      const seed =
        baseSeed !== undefined
          ? baseSeed ^ (operation.operationPlanId * 10007) ^ normalizedDate
          : undefined;
      const rng = SchedulingService.createRandomGenerator(seed);
      candidateNoise = new Map();
      candidateIds.forEach((employeeId) => {
        const noise = (rng() - 0.5) * 2 * jitterStrength;
        candidateNoise!.set(employeeId, noise);
      });
    }

    const { combined: preferredOrder } =
      SchedulingService.collectPreferredEmployees(context, operation);
    const preferredPriority = new Map<number, number>();
    preferredOrder.forEach((employeeId, index) => {
      preferredPriority.set(employeeId, index);
    });

    const sorted = candidateIds.sort((a, b) => {
      const prefA = preferredPriority.has(a);
      const prefB = preferredPriority.has(b);
      if (prefA && !prefB) {
        return -1;
      }
      if (!prefA && prefB) {
        return 1;
      }
      if (prefA && prefB) {
        const diff =
          (preferredPriority.get(a) ?? 0) - (preferredPriority.get(b) ?? 0);
        if (diff !== 0) {
          return diff;
        }
      }

      const restPenaltyA = nightRestPenalty.get(a);
      const restPenaltyB = nightRestPenalty.get(b);
      const hasRestPenaltyA = restPenaltyA !== undefined;
      const hasRestPenaltyB = restPenaltyB !== undefined;
      if (hasRestPenaltyA !== hasRestPenaltyB) {
        return hasRestPenaltyA ? 1 : -1;
      }
      if (hasRestPenaltyA && hasRestPenaltyB) {
        const penaltyDiff = restPenaltyA!.penalty - restPenaltyB!.penalty;
        if (Math.abs(penaltyDiff) > 0.0001) {
          return penaltyDiff > 0 ? 1 : -1;
        }
      }

      const envelopeA = context.employeeHourEnvelope.get(a);
      const envelopeB = context.employeeHourEnvelope.get(b);
      const remainingA = envelopeA?.remaining ?? Number.POSITIVE_INFINITY;
      const remainingB = envelopeB?.remaining ?? Number.POSITIVE_INFINITY;
      if (Math.abs(remainingA - remainingB) > 0.001) {
        return remainingB - remainingA;
      }

      const tierA = context.employeeRoleTier.get(a) || "FRONTLINE";
      const tierB = context.employeeRoleTier.get(b) || "FRONTLINE";
      if (tierA !== tierB) {
        return tierA === "FRONTLINE" ? -1 : 1;
      }

      const statsA = context.employeeStats.get(a);
      const statsB = context.employeeStats.get(b);
      if (statsA && statsB) {
        if (statsA.quarterHours !== statsB.quarterHours) {
          return statsA.quarterHours - statsB.quarterHours;
        }
        return (
          (statsA.dailyHours.get(planDate) || 0) -
          (statsB.dailyHours.get(planDate) || 0)
        );
      }
      if (candidateNoise) {
        const noiseDiff =
          (candidateNoise.get(b) ?? 0) - (candidateNoise.get(a) ?? 0);
        if (Math.abs(noiseDiff) > 1e-6) {
          return noiseDiff > 0 ? 1 : -1;
        }
      }
      return 0;
    });

    const frontlineCandidates = sorted.filter(
      (id) =>
        (context.employeeRoleTier.get(id) || "FRONTLINE") === "FRONTLINE",
    );
    const leaderCandidates = sorted.filter(
      (id) => context.employeeRoleTier.get(id) === "LEADER",
    );

    let forcedToUseLeaders = false;
    let visibleCandidates = sorted.slice();

    if (frontlineCandidates.length >= requiredPeople) {
      visibleCandidates = frontlineCandidates.slice();
    } else if (frontlineCandidates.length > 0 && leaderCandidates.length) {
      forcedToUseLeaders = true;
      visibleCandidates = [
        ...frontlineCandidates,
        ...leaderCandidates.filter(
          (id) => !frontlineCandidates.includes(id),
        ),
      ];
    } else if (!frontlineCandidates.length && leaderCandidates.length) {
      forcedToUseLeaders = true;
      visibleCandidates = leaderCandidates.slice();
    }

    return {
      allCandidates: sorted,
      candidates: visibleCandidates,
      frontlineCandidates,
      leaderCandidates,
      forcedToUseLeaders,
      filteredByHourLimit,
      filteredByConsecutiveLimit,
      filteredByNightRest,
      nightRestPenalty,
    };
  }

  private static hasScheduledWorkOnDate(
    context: SchedulingContext,
    employeeId: number,
    dateKey: string,
  ): boolean {
    const assignments = context.baseRosterIndex.get(dateKey);
    if (assignments) {
      const assignment = assignments.find(
        (item) => item.employeeId === employeeId,
      );
      if (assignment && (assignment.planHours ?? 0) > 0.0001) {
        return true;
      }
    }

    const productionSnapshot = context.dailyProductionSnapshot.get(dateKey);
    if (productionSnapshot) {
      const stats = productionSnapshot.get(employeeId);
      if (stats && (stats.totalHours ?? 0) > 0.0001) {
        return true;
      }
    }

    return false;
  }

  private static hasNightShiftOnDate(
    context: SchedulingContext,
    employeeId: number,
    dateKey: string,
  ): boolean {
    const baseAssignments = context.baseRosterIndex.get(dateKey) || [];
    const baseAssignment = baseAssignments.find(
      (item) => item.employeeId === employeeId,
    );
    if (
      baseAssignment &&
      (baseAssignment.planHours ?? 0) > 0.0001 &&
      SchedulingService.isNightShiftCode(baseAssignment.shiftCode)
    ) {
      return true;
    }

    const productionAssignments =
      context.productionIndex.get(dateKey) || [];
    if (
      productionAssignments.some(
        (assignment) =>
          assignment.employeeId === employeeId &&
          SchedulingService.isNightShiftCode(assignment.shiftCode),
      )
    ) {
      return true;
    }

    return false;
  }

  private static daysSinceLastNightShift(
    context: SchedulingContext,
    employeeId: number,
    planDate: string,
  ): number | null {
    const target = dayjs(planDate);
    let cursor = target.subtract(1, "day");
    const periodStart = dayjs(context.period.startDate);
    let steps = 0;
    while (cursor.isSameOrAfter(periodStart)) {
      const dateKey = cursor.format("YYYY-MM-DD");
      if (SchedulingService.hasNightShiftOnDate(context, employeeId, dateKey)) {
        return target.diff(cursor, "day");
      }
      cursor = cursor.subtract(1, "day");
      steps += 1;
      if (steps > 60) {
        break;
      }
    }
    return null;
  }

  private static ensureNightShiftRestDays(
    context: SchedulingContext,
  ): number {
    const epsilon = 0.0001;
    type RestRequestType = "PRIMARY" | "SECONDARY";
    const targets = new Map<string, Map<number, RestRequestType>>();
    const periodEnd = dayjs(context.period.endDate);
    const processedNightKeys = new Set<string>();

    const addTarget = (
      dateKey: string,
      employeeId: number,
      type: RestRequestType,
    ) => {
      if (!targets.has(dateKey)) {
        targets.set(dateKey, new Map<number, RestRequestType>());
      }
      const employeeTargets = targets.get(dateKey)!;
      const existing = employeeTargets.get(employeeId);
      if (existing === "PRIMARY") {
        return;
      }
      if (!existing || type === "PRIMARY") {
        employeeTargets.set(employeeId, type);
      }
    };

    const registerNightShift = (planDate: string, employeeId: number) => {
      const key = `${employeeId}-${planDate}`;
      if (processedNightKeys.has(key)) {
        return;
      }
      processedNightKeys.add(key);

      const firstRest = dayjs(planDate).add(1, "day");
      if (!firstRest.isAfter(periodEnd)) {
        addTarget(firstRest.format("YYYY-MM-DD"), employeeId, "PRIMARY");
      }

      const secondRest = dayjs(planDate).add(2, "day");
      if (!secondRest.isAfter(periodEnd)) {
        addTarget(secondRest.format("YYYY-MM-DD"), employeeId, "SECONDARY");
      }
    };

    context.baseRosterAssignments.forEach((assignment) => {
      if (
        (assignment.planHours ?? 0) > epsilon &&
        SchedulingService.isNightShiftCode(assignment.shiftCode)
      ) {
        registerNightShift(assignment.planDate, assignment.employeeId);
      }
    });

    context.productionAssignments.forEach((assignment) => {
      if (
        assignment.planHours > epsilon &&
        SchedulingService.isNightShiftCode(assignment.shiftCode)
      ) {
        registerNightShift(assignment.planDate, assignment.employeeId);
      }
    });

    let adjustments = 0;
    const failedPrimary: Array<{ employeeId: number; date: string }> = [];
    const failedSecondary: Array<{ employeeId: number; date: string }> = [];

    targets.forEach((employeeMap, restDate) => {
      const assignments = context.baseRosterIndex.get(restDate) || [];
      const assignmentMap = new Map<number, BaseRosterAssignment>();
      assignments.forEach((assignment) => {
        assignmentMap.set(assignment.employeeId, assignment);
      });

      employeeMap.forEach((requestType, employeeId) => {
        const assignment = assignmentMap.get(employeeId);
        if (assignment) {
          if (assignment.source === "LOCKED") {
            (requestType === "PRIMARY" ? failedPrimary : failedSecondary).push({
              employeeId,
              date: restDate,
            });
            return;
          }
          if (
            (assignment.planHours ?? 0) > epsilon ||
            assignment.shiftCode !== "REST"
          ) {
            assignment.planHours = 0;
            assignment.shiftCode = "REST";
            adjustments += 1;
          }
          return;
        }

        const restAssignment: BaseRosterAssignment = {
          employeeId,
          planDate: restDate,
          shiftCode: "REST",
          planHours: 0,
          source: "AUTO_BASE",
        };
        context.baseRosterAssignments.push(restAssignment);
        SchedulingService.indexBaseAssignment(context, restAssignment);
        adjustments += 1;
      });
    });

    const logRestFailure = (
      items: Array<{ employeeId: number; date: string }>,
      label: string,
      localizedLabel: string,
    ) => {
      if (!items.length) {
        return;
      }
      const sample = items
        .slice(0, 5)
        .map((item) => `${item.employeeId}@${item.date}`)
        .join(", ");
      const suffix = items.length > 5 ? " ..." : "";
      const message = `Night-shift ${label} rest skipped for ${items.length} day(s): ${sample}${suffix}`;
      context.logs.push(
        `${message} / 夜班${localizedLabel}休息有 ${items.length} 天因锁定或关键排班未能调整`,
      );
      context.warnings.push(
        `夜班${localizedLabel}休息未全部保障（${items.length} 天）`,
      );
    };

    logRestFailure(failedPrimary, "primary-day", "首日");
    logRestFailure(failedSecondary, "secondary-day", "次日");

    return adjustments;
  }

  private static countConsecutiveWorkdays(
    context: SchedulingContext,
    employeeId: number,
    referenceDate: string,
    direction: 1 | -1,
    limit = 60,
  ): number {
    let total = 0;
    let cursor = dayjs(referenceDate);
    for (let i = 0; i < limit; i += 1) {
      cursor = cursor.add(direction, "day");
      const dateKey = cursor.format("YYYY-MM-DD");
      if (
        !context.baseRosterIndex.has(dateKey) &&
        !context.dailyProductionSnapshot.has(dateKey)
      ) {
        break;
      }
      const worked = SchedulingService.hasScheduledWorkOnDate(
        context,
        employeeId,
        dateKey,
      );
      if (!worked) {
        break;
      }
      total += 1;
    }
    return total;
  }

  private static updateConsecutiveCounters(
    context: SchedulingContext,
    employeeId: number,
    planDate: string,
  ) {
    const stats = context.employeeStats.get(employeeId);
    if (!stats) {
      return;
    }

    const dateKey = dayjs(planDate).format("YYYY-MM-DD");
    const workedToday = SchedulingService.hasScheduledWorkOnDate(
      context,
      employeeId,
      dateKey,
    );
    if (workedToday) {
      const previous = SchedulingService.countConsecutiveWorkdays(
        context,
        employeeId,
        dateKey,
        -1,
      );
      stats.consecutiveDays = previous + 1;
    } else {
      stats.consecutiveDays = 0;
    }

    const profile = context.candidateProfiles.get(employeeId);
    if (profile) {
      profile.consecutiveDays = stats.consecutiveDays;
    }
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

  private static recordDailyAssignment(
    context: SchedulingContext,
    planDate: string,
    employeeId: number,
    operationPlanId: number,
    startDateTime?: string | null,
    endDateTime?: string | null,
  ) {
    if (!startDateTime || !endDateTime) {
      return;
    }
    const start = dayjs(startDateTime);
    const end = dayjs(endDateTime);
    if (!start.isValid() || !end.isValid()) {
      return;
    }
    const dayStart = dayjs(`${planDate} 00:00:00`);
    if (!dayStart.isValid()) {
      return;
    }
    let startHour = start.diff(dayStart, "minute") / 60;
    let endHour = end.diff(dayStart, "minute") / 60;

    if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
      return;
    }

    if (endHour <= startHour) {
      while (endHour <= startHour) {
        endHour += 24;
      }
    }

    const forDate =
      context.employeeDailyAssignments.get(planDate) || new Map<number, any[]>();
    const slots = forDate.get(employeeId) || [];
    slots.push({ start: startHour, end: endHour, operationPlanId });
    forDate.set(employeeId, slots);
    context.employeeDailyAssignments.set(planDate, forDate);
  }

  private static getOperationWindowHours(
    operation: OperationPlanSummary,
    planDate: string,
  ): { startHour: number; endHour: number } | null {
    const start = dayjs(operation.plannedStart);
    const end = dayjs(operation.plannedEnd);
    if (!start.isValid() || !end.isValid()) {
      return null;
    }
    const dayStart = dayjs(`${planDate} 00:00:00`);
    if (!dayStart.isValid()) {
      return null;
    }
    let startHour = start.diff(dayStart, "minute") / 60;
    let endHour = end.diff(dayStart, "minute") / 60;
    if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
      return null;
    }
    if (endHour <= startHour) {
      while (endHour <= startHour) {
        endHour += 24;
      }
    }
    return { startHour, endHour };
  }

  private static intervalsOverlap(
    startA: number,
    endA: number,
    startB: number,
    endB: number,
  ): boolean {
    return !(endA <= startB || endB <= startA);
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

    const allowedSet = context.operationAllowedEmployeeIds;

    const requirementQuery = `
      SELECT bop.id AS operationPlanId,
             COUNT(DISTINCT CASE
               WHEN oqr.qualification_id IS NOT NULL THEN CONCAT_WS('-', oqr.qualification_id, oqr.min_level)
               ELSE NULL
             END) AS requirementCount
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
          COUNT(DISTINCT CASE
            WHEN oqr.qualification_id IS NOT NULL THEN CONCAT_WS('-', oqr.qualification_id, oqr.min_level)
            ELSE NULL
          END) AS matchedCount
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
        const employeeId = Number(row.employeeId);
        if (allowedSet && !allowedSet.has(employeeId)) {
          return;
        }
        const planId = Number(row.operationPlanId);
        const matchedCount = Number(row.matchedCount || 0);
        const required = requirementMap.get(planId) || 0;
        if (matchedCount === required) {
          const set = map.get(planId) || new Set<number>();
          set.add(employeeId);
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
      const allEmployees = allowedSet
        ? Array.from(allowedSet.values())
        : context.employees.map((emp) => emp.employeeId);
      zeroRequirementOps.forEach((planId) => {
        map.set(planId, new Set(allEmployees));
      });
    }

    return map;
  }

  private static async persistScheduling(
    context: SchedulingContext,
    runId?: number,
  ): Promise<{
    baseInserted: number;
    productionInserted: number;
    overtimeInserted: number;
  }> {
    if (!context.employees.length) {
      context.logs.push("Skipping persistence: no employees to schedule.");
      return {
        baseInserted: 0,
        productionInserted: 0,
        overtimeInserted: 0,
      };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Ensure fallback shift definitions exist in the database so that downstream
      // inserts referencing shift_code do not violate foreign key constraints.
      for (const def of context.shiftDefinitions) {
        if (!def.shiftCode) {
          continue;
        }

        if (def.id === null || def.id === undefined) {
          const [existing] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM shift_definitions WHERE shift_code = ? LIMIT 1`,
            [def.shiftCode],
          );
          if (existing.length) {
            def.id = Number(existing[0].id);
          } else {
            const category =
              def.shiftCode.toUpperCase() === "DAY" ? "STANDARD" : "SPECIAL";
            const [insertResult] = await connection.execute<ResultSetHeader>(
              `INSERT INTO shift_definitions
                 (shift_code, shift_name, category, start_time, end_time, is_cross_day, nominal_hours, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                def.shiftCode,
                def.shiftName || def.shiftCode,
                category,
                def.startTime,
                def.endTime,
                def.isCrossDay ? 1 : 0,
                def.nominalHours,
              ],
            );
            def.id = Number(insertResult.insertId);
          }
        } else if (def.needsSync) {
          await connection.execute(
            `UPDATE shift_definitions
                SET shift_name = COALESCE(?, shift_name),
                    start_time = ?,
                    end_time = ?,
                    is_cross_day = ?,
                    nominal_hours = ?
              WHERE id = ?`,
            [
              def.shiftName || def.shiftCode,
              def.startTime,
              def.endTime,
              def.isCrossDay ? 1 : 0,
              def.nominalHours,
              def.id,
            ],
          );
        }
      }

      const employeeIds = context.employees.map((emp) => emp.employeeId);
      const operationsToPersist = context.operations.filter(
        (op) => !context.lockedOperations.has(op.operationPlanId),
      );
      const operationPlanIds = operationsToPersist.map(
        (op) => op.operationPlanId,
      );

      if (employeeIds.length) {
        const placeholders = employeeIds.map(() => "?").join(",");
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
             (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, is_generated, batch_operation_plan_id, scheduling_run_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, 0, 1, NULL, ?, NULL, NULL)`,
          [
            assignment.employeeId,
            assignment.planDate,
            shiftId,
            planCategory,
            assignment.planHours,
            runId ?? null,
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
             (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, is_generated, batch_operation_plan_id, scheduling_run_id, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, 1, ?, ?, NULL, NULL)`,
          [
            assignment.employeeId,
            assignment.planDate,
            shiftId,
            planCategory,
            assignment.planHours,
            overtimeHours,
            assignment.operationPlanId,
            runId ?? null,
          ],
        );

        const shiftPlanId = planResult.insertId;

        await connection.execute(
          `INSERT INTO batch_personnel_assignments
             (batch_operation_plan_id, employee_id, shift_plan_id, shift_code, plan_category, plan_hours, is_overtime, overtime_hours, assignment_origin, last_validated_at, scheduling_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', NOW(), ?)`,
          [
            assignment.operationPlanId,
            assignment.employeeId,
            shiftPlanId,
            assignment.shiftCode,
            planCategory,
            assignment.planHours,
            isOvertime,
            overtimeHours,
            runId ?? null,
          ],
        );

        productionInserted += 1;
        if (isOvertime) {
          overtimeInserted += 1;
        }
      }

      const persistedAssignments = context.productionAssignments.filter(
        (assignment) => !assignment.locked,
      );
      if (persistedAssignments.length) {
        const affectedEmployees = new Set(
          persistedAssignments.map((item) => item.employeeId),
        );
        context.logs.push(
          `Generated ${persistedAssignments.length} production assignments covering ${affectedEmployees.size} employees.`,
        );
      }

      await connection.commit();
      context.logs.push(
        `Persisted ${baseInserted} base roster rows and ${productionInserted} production assignments.`,
      );
      if (overtimeInserted > 0) {
        context.logs.push(`Overtime entries persisted: ${overtimeInserted}.`);
      }
      return {
        baseInserted,
        productionInserted,
        overtimeInserted,
      };
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
