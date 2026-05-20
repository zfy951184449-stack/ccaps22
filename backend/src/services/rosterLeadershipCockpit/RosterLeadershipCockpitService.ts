import dayjs, { Dayjs } from 'dayjs';
import type { RowDataPacket } from 'mysql2';
import pool from '../../config/database';

export type RiskLevel = 'LOW' | 'WATCH' | 'BOTTLENECK' | 'CRITICAL';
export type CockpitDataMode = 'LIVE_READONLY' | 'MOCK_FALLBACK';

export interface WorkforceTrendPoint {
  date: string;
  label: string;
  taskRequiredPeople: number;
  rosteredPeople: number;
  qualifiedAvailablePeople: number;
  flexiblePeople: number;
  gapPeople: number;
}

export interface HourTrendPoint {
  date: string;
  label: string;
  taskDemandHours: number;
  rosterProvidedHours: number;
  qualifiedAvailableHours: number;
  assignedHours: number;
  flexibleHours: number;
  overtimeRiskHours: number;
}

export interface QualificationRiskItem {
  id: number;
  name: string;
  demandCount: number;
  demandHours: number;
  peakConcurrentDemand: number;
  peakQualifiedAvailable: number;
  qualifiedEmployeeCount: number;
  candidateCoverageDepth: number;
  lowCoverageTaskCount: number;
  dependencyScore: number;
  competingHotSkillCount: number;
  absenceSensitivity: number;
  riskScore: number;
  riskLevel: RiskLevel;
  quadrant: QuadrantName;
  reasons: string[];
  affectedTasks: string[];
}

export interface KeyPersonDependency {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  criticalTaskHours: number;
  bottleneckQualifications: string[];
  affectedTaskCount: number;
  affectedSupplyCount: number;
  action: string;
}

export interface ResilienceSummary {
  replaceableGapRate: number;
  unrecoverableGapCount: number;
  averageCandidateDepth: number;
  maxSingleAbsenceImpact: number;
  rerunLikelyCount: number;
  supervisorActionCount: number;
}

export interface CockpitSummary {
  readinessScore: number;
  maxPeopleGap: number;
  maxHourGap: number;
  criticalQualificationCount: number;
  watchQualificationCount: number;
  absenceSensitiveQualificationCount: number;
  highDependencyPeopleCount: number;
  supervisorIssueCount: number;
}

export interface RosterLeadershipCockpitSnapshot {
  dataMode: CockpitDataMode;
  dataSource: CockpitDataMode;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  dataQualityWarnings: string[];
  summary: CockpitSummary;
  insights: string[];
  workforceTrend: WorkforceTrendPoint[];
  hourTrend: HourTrendPoint[];
  qualifications: QualificationRiskItem[];
  quadrantGroups: Record<QuadrantName, QualificationRiskItem[]>;
  keyPeople: KeyPersonDependency[];
  resilience: ResilienceSummary;
  recommendations: string[];
}

interface EmployeeRow extends RowDataPacket {
  id: number;
  employee_code: string | null;
  employee_name: string | null;
  employment_status?: string | null;
}

interface QualificationRow extends RowDataPacket {
  id: number;
  qualification_name: string | null;
}

interface EmployeeQualificationRow extends RowDataPacket {
  employee_id: number;
  qualification_id: number;
  qualification_name: string | null;
  qualification_level: number | null;
}

interface OperationRow extends RowDataPacket {
  operation_plan_id: number;
  batch_plan_id: number;
  batch_code: string | null;
  operation_id: number;
  operation_name: string | null;
  planned_start_datetime: string | Date;
  planned_end_datetime: string | Date;
  planned_duration_minutes: number | null;
  required_people: number | null;
}

interface RequirementRow extends RowDataPacket {
  operation_id: number;
  position_number: number | null;
  qualification_id: number;
  qualification_name: string | null;
  required_level: number | null;
  required_count: number | null;
  is_mandatory: number | null;
}

interface AssignmentRow extends RowDataPacket {
  assignment_id: number;
  operation_plan_id: number;
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  position_number: number | null;
  role: string | null;
}

interface ShiftPlanRow extends RowDataPacket {
  employee_id: number;
  plan_date: string | Date;
  plan_category: string | null;
  plan_hours: number | null;
  overtime_hours: number | null;
}

interface UnavailabilityRow extends RowDataPacket {
  employee_id: number;
  start_datetime: string | Date;
  end_datetime: string | Date;
}

interface CockpitRows {
  employees: EmployeeRow[];
  qualifications: QualificationRow[];
  employeeQualifications: EmployeeQualificationRow[];
  operations: OperationRow[];
  requirements: RequirementRow[];
  assignments: AssignmentRow[];
  shiftPlans: ShiftPlanRow[];
  unavailability: UnavailabilityRow[];
  windowStart: string;
  windowDays: number;
  dataQualityWarnings?: string[];
}

interface NormalizedTask {
  id: number;
  batchCode: string;
  operationId: number;
  operationName: string;
  plannedStart: Dayjs;
  plannedEnd: Dayjs;
  requiredPeople: number;
  durationHours: number;
}

interface MutableQualificationAccumulator {
  affectedTasks: Set<string>;
  candidateDepthSamples: number[];
  demandCount: number;
  demandHours: number;
  hourlyDemand: Map<string, number>;
  id: number;
  lowCoverageTaskCount: number;
  name: string;
  peakCandidateSamples: number[];
  requiredLevels: number[];
}

type QuadrantName =
  | '高需求 / 高脆弱'
  | '高需求 / 低脆弱'
  | '低需求 / 高脆弱'
  | '低需求 / 低脆弱';

const quadrantNames: QuadrantName[] = [
  '高需求 / 高脆弱',
  '高需求 / 低脆弱',
  '低需求 / 高脆弱',
  '低需求 / 低脆弱',
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toMysqlDateTime = (value: Dayjs) => value.format('YYYY-MM-DD HH:mm:ss');

const toDateKey = (value: string | Date | Dayjs) => dayjs(value).format('YYYY-MM-DD');

const makeDateKeys = (start: Dayjs, days: number) => (
  Array.from({ length: days }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'))
);

const expandHourlyBuckets = (start: Dayjs, end: Dayjs) => {
  const buckets: string[] = [];
  let cursor = start.startOf('hour');
  while (cursor.isBefore(end) && buckets.length < 720) {
    buckets.push(cursor.format('YYYY-MM-DD HH:00'));
    cursor = cursor.add(1, 'hour');
  }
  return buckets.length ? buckets : [start.format('YYYY-MM-DD HH:00')];
};

const overlaps = (leftStart: Dayjs, leftEnd: Dayjs, rightStart: Dayjs, rightEnd: Dayjs) => (
  leftStart.isBefore(rightEnd) && leftEnd.isAfter(rightStart)
);

const isWorkCategory = (category: string | null) => (
  Boolean(category) && category !== 'REST' && category !== 'LEAVE' && category !== 'OFF'
);

const emptySummary = (): CockpitSummary => ({
  absenceSensitiveQualificationCount: 0,
  criticalQualificationCount: 0,
  highDependencyPeopleCount: 0,
  maxHourGap: 0,
  maxPeopleGap: 0,
  readinessScore: 100,
  supervisorIssueCount: 0,
  watchQualificationCount: 0,
});

export function classifyQualificationRisk(metrics: {
  absenceSensitivity: number;
  candidateCoverageDepth: number;
  competingHotSkillCount: number;
  demandHours: number;
  dependencyScore: number;
  lowCoverageTaskCount: number;
  peakConcurrentDemand: number;
  peakQualifiedAvailable: number;
  qualifiedEmployeeCount: number;
}, maxima: {
  maxCompetingHotSkillCount: number;
  maxDemandHours: number;
  maxLowCoverageTaskCount: number;
  maxPeakGapPeople: number;
}) {
  const peakGapPeople = Math.max(0, metrics.peakConcurrentDemand - metrics.peakQualifiedAvailable);
  const gapRate = metrics.peakConcurrentDemand > 0 ? peakGapPeople / metrics.peakConcurrentDemand : 0;
  const peakGapFactor = maxima.maxPeakGapPeople > 0 ? peakGapPeople / maxima.maxPeakGapPeople : 0;
  const demandFactor = maxima.maxDemandHours > 0 ? metrics.demandHours / maxima.maxDemandHours : 0;
  const lowCoverageFactor =
    maxima.maxLowCoverageTaskCount > 0
      ? metrics.lowCoverageTaskCount / maxima.maxLowCoverageTaskCount
      : 0;
  const competitionFactor =
    maxima.maxCompetingHotSkillCount > 0
      ? metrics.competingHotSkillCount / maxima.maxCompetingHotSkillCount
      : 0;
  const coverageDepthFragility = 1 / Math.max(1, metrics.candidateCoverageDepth);
  const supplyBreadth =
    metrics.peakConcurrentDemand > 0
      ? metrics.qualifiedEmployeeCount / Math.max(1, metrics.peakConcurrentDemand)
      : metrics.qualifiedEmployeeCount;
  const broadSupplyDiscount =
    peakGapPeople === 0 && supplyBreadth >= 1.8
      ? 18
      : peakGapPeople === 0 && supplyBreadth >= 1.2
        ? 8
        : 0;

  const riskScore = clamp(Math.round(
    gapRate * 30
      + peakGapFactor * 15
      + coverageDepthFragility * 15
      + lowCoverageFactor * 12
      + metrics.dependencyScore * 12
      + metrics.absenceSensitivity * 12
      + demandFactor * 10
      + competitionFactor * 6
      - broadSupplyDiscount,
  ), 0, 100);

  let riskLevel: RiskLevel = 'LOW';
  if (
    riskScore >= 75
    || (peakGapPeople > 0 && metrics.candidateCoverageDepth < 2 && metrics.absenceSensitivity >= 0.5)
  ) {
    riskLevel = 'CRITICAL';
  } else if (
    riskScore >= 58
    || (peakGapPeople > 0 && metrics.candidateCoverageDepth < 2.5)
  ) {
    riskLevel = 'BOTTLENECK';
  } else if (riskScore >= 35) {
    riskLevel = 'WATCH';
  }

  return {
    gapRate,
    peakGapPeople,
    riskLevel,
    riskScore,
  };
}

const buildReasonList = (item: {
  absenceSensitivity: number;
  candidateCoverageDepth: number;
  competingHotSkillCount: number;
  demandCount: number;
  dependencyScore: number;
  lowCoverageTaskCount: number;
  peakConcurrentDemand: number;
  peakGapPeople: number;
  peakQualifiedAvailable: number;
  qualifiedEmployeeCount: number;
  riskLevel: RiskLevel;
}) => {
  if (item.demandCount === 0) {
    return ['当前窗口没有该资质需求，显示为真实资质供给基线，不代表计划瓶颈。'];
  }

  const reasons: string[] = [];
  if (item.peakGapPeople > 0) {
    reasons.push(`峰值并发需求 ${item.peakConcurrentDemand} 人，高峰可用合格人员 ${item.peakQualifiedAvailable} 人，缺口 ${item.peakGapPeople} 人。`);
  } else {
    reasons.push(`峰值并发需求 ${item.peakConcurrentDemand} 人，可用合格人员 ${item.peakQualifiedAvailable} 人，当前没有峰值缺口。`);
  }

  if (item.candidateCoverageDepth < 2) {
    reasons.push(`平均候选人覆盖深度只有 ${round(item.candidateCoverageDepth, 1)}，替补余量很薄。`);
  } else {
    reasons.push(`平均候选人覆盖深度为 ${round(item.candidateCoverageDepth, 1)}，不能只按持证人数判断风险。`);
  }

  if (item.lowCoverageTaskCount > 0) {
    reasons.push(`${item.lowCoverageTaskCount} 个任务候选覆盖偏低，需要提前锁定人员或拆分同班次需求。`);
  }

  if (item.dependencyScore >= 0.55) {
    reasons.push('计划依赖集中度较高，单个 senior operator 不可用时会显著影响供给。');
  }

  if (item.absenceSensitivity >= 0.5) {
    reasons.push('一人临时缺勤会让该资质进入缺口状态或扩大缺口。');
  }

  if (item.competingHotSkillCount > 0) {
    reasons.push(`相关人员还被 ${item.competingHotSkillCount} 个热门资质竞争，真实可调配余量低于名义供给。`);
  }

  if (item.riskLevel === 'LOW' && item.demandCount >= 5 && item.qualifiedEmployeeCount >= item.peakConcurrentDemand * 2) {
    reasons.push('虽然使用频次高，但覆盖面广、峰值供给充足，因此不判为 Critical。');
  }

  return reasons;
};

const normalizeTasks = (rows: OperationRow[]) => rows
  .map((row) => {
    const plannedStart = dayjs(row.planned_start_datetime);
    const plannedEnd = dayjs(row.planned_end_datetime);
    const durationHours = Math.max(
      0.5,
      numberValue(row.planned_duration_minutes, plannedEnd.diff(plannedStart, 'minute')) / 60,
    );
    return {
      batchCode: String(row.batch_code ?? `Batch ${row.batch_plan_id}`),
      durationHours: round(durationHours),
      id: Number(row.operation_plan_id),
      operationId: Number(row.operation_id),
      operationName: String(row.operation_name ?? `Operation ${row.operation_id}`),
      plannedEnd,
      plannedStart,
      requiredPeople: Math.max(1, numberValue(row.required_people, 1)),
    };
  })
  .filter((task) => task.id > 0 && task.operationId > 0 && task.plannedStart.isValid() && task.plannedEnd.isAfter(task.plannedStart));

const buildQualificationMaps = (
  employees: EmployeeRow[],
  employeeQualifications: EmployeeQualificationRow[],
) => {
  const activeEmployeeIds = new Set(employees.map((employee) => Number(employee.id)));
  const levelsByEmployeeQualification = new Map<string, number>();
  const supplyByQualification = new Map<number, Set<number>>();
  const qualificationsByEmployee = new Map<number, Set<number>>();

  employeeQualifications.forEach((item) => {
    const employeeId = Number(item.employee_id);
    const qualificationId = Number(item.qualification_id);
    if (!activeEmployeeIds.has(employeeId) || qualificationId <= 0) return;

    levelsByEmployeeQualification.set(
      `${employeeId}:${qualificationId}`,
      Math.max(
        numberValue(item.qualification_level, 1),
        levelsByEmployeeQualification.get(`${employeeId}:${qualificationId}`) ?? 0,
      ),
    );

    const supply = supplyByQualification.get(qualificationId) ?? new Set<number>();
    supply.add(employeeId);
    supplyByQualification.set(qualificationId, supply);

    const byEmployee = qualificationsByEmployee.get(employeeId) ?? new Set<number>();
    byEmployee.add(qualificationId);
    qualificationsByEmployee.set(employeeId, byEmployee);
  });

  return {
    levelsByEmployeeQualification,
    qualificationsByEmployee,
    supplyByQualification,
  };
};

const makeShiftPlanMap = (rows: ShiftPlanRow[]) => {
  const map = new Map<string, ShiftPlanRow[]>();
  rows.forEach((row) => {
    const key = `${Number(row.employee_id)}:${toDateKey(row.plan_date)}`;
    const existing = map.get(key) ?? [];
    existing.push(row);
    map.set(key, existing);
  });
  return map;
};

const makeWorkShiftEmployeeIdsByDate = (rows: ShiftPlanRow[]) => {
  const map = new Map<string, Set<number>>();
  rows.forEach((row) => {
    if (!isWorkCategory(row.plan_category) || numberValue(row.plan_hours, 8) <= 0) return;
    const date = toDateKey(row.plan_date);
    const current = map.get(date) ?? new Set<number>();
    current.add(Number(row.employee_id));
    map.set(date, current);
  });
  return map;
};

const groupUnavailabilityByEmployee = (rows: UnavailabilityRow[]) => {
  const map = new Map<number, UnavailabilityRow[]>();
  rows.forEach((row) => {
    const employeeId = Number(row.employee_id);
    const current = map.get(employeeId) ?? [];
    current.push(row);
    map.set(employeeId, current);
  });
  return map;
};

const groupAssignmentIntervalsByEmployee = (
  assignments: AssignmentRow[],
  tasksById: Map<number, NormalizedTask>,
) => {
  const map = new Map<number, NormalizedTask[]>();
  assignments.forEach((assignment) => {
    const employeeId = Number(assignment.employee_id);
    const task = tasksById.get(Number(assignment.operation_plan_id));
    if (!task) return;
    const current = map.get(employeeId) ?? [];
    current.push(task);
    map.set(employeeId, current);
  });
  return map;
};

const makeQualifiedEmployeeCache = (
  employees: EmployeeRow[],
  levelsByEmployeeQualification: Map<string, number>,
) => {
  const employeeIds = employees.map((employee) => Number(employee.id));
  const cache = new Map<string, number[]>();

  return (qualificationId: number, requiredLevel: number) => {
    const key = `${qualificationId}:${requiredLevel}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const qualified = employeeIds.filter((employeeId) =>
      hasQualificationLevel(levelsByEmployeeQualification, employeeId, qualificationId, requiredLevel),
    );
    cache.set(key, qualified);
    return qualified;
  };
};

const hasWorkedShift = (shiftPlansByEmployeeDate: Map<string, ShiftPlanRow[]>, employeeId: number, date: string) => (
  (shiftPlansByEmployeeDate.get(`${employeeId}:${date}`) ?? []).some((row) =>
    isWorkCategory(row.plan_category) && numberValue(row.plan_hours, 8) > 0,
  )
);

const workedHours = (shiftPlansByEmployeeDate: Map<string, ShiftPlanRow[]>, employeeId: number, date: string) => (
  (shiftPlansByEmployeeDate.get(`${employeeId}:${date}`) ?? [])
    .filter((row) => isWorkCategory(row.plan_category))
    .reduce((total, row) => total + Math.max(0, numberValue(row.plan_hours, 8)), 0)
);

const overtimeHours = (shiftPlansByEmployeeDate: Map<string, ShiftPlanRow[]>, employeeId: number, date: string) => (
  (shiftPlansByEmployeeDate.get(`${employeeId}:${date}`) ?? [])
    .filter((row) => isWorkCategory(row.plan_category))
    .reduce((total, row) => total + Math.max(0, numberValue(row.overtime_hours, row.plan_category === 'OVERTIME' ? row.plan_hours ?? 0 : 0)), 0)
);

const isUnavailable = (rows: UnavailabilityRow[], employeeId: number, start: Dayjs, end: Dayjs) => (
  rows.some((row) =>
    Number(row.employee_id) === employeeId && overlaps(dayjs(row.start_datetime), dayjs(row.end_datetime), start, end),
  )
);

const hasUnavailableInterval = (rows: UnavailabilityRow[] | undefined, start: Dayjs, end: Dayjs) => (
  (rows ?? []).some((row) => overlaps(dayjs(row.start_datetime), dayjs(row.end_datetime), start, end))
);

const buildAssignmentsByTask = (assignments: AssignmentRow[]) => {
  const map = new Map<number, AssignmentRow[]>();
  assignments.forEach((assignment) => {
    const taskId = Number(assignment.operation_plan_id);
    const existing = map.get(taskId) ?? [];
    existing.push(assignment);
    map.set(taskId, existing);
  });
  return map;
};

const buildRequirementMap = (requirements: RequirementRow[]) => {
  const map = new Map<number, RequirementRow[]>();
  requirements.forEach((requirement) => {
    const operationId = Number(requirement.operation_id);
    const existing = map.get(operationId) ?? [];
    existing.push(requirement);
    map.set(operationId, existing);
  });
  return map;
};

const hasQualificationLevel = (
  levelsByEmployeeQualification: Map<string, number>,
  employeeId: number,
  qualificationId: number,
  requiredLevel: number,
) => (
  (levelsByEmployeeQualification.get(`${employeeId}:${qualificationId}`) ?? 0) >= requiredLevel
);

const isAssignedToOverlappingTask = (
  employeeId: number,
  currentTaskId: number,
  tasksById: Map<number, NormalizedTask>,
  assignments: AssignmentRow[],
  start: Dayjs,
  end: Dayjs,
) => assignments.some((assignment) => {
  if (Number(assignment.employee_id) !== employeeId) return false;
  const operationPlanId = Number(assignment.operation_plan_id);
  if (operationPlanId === currentTaskId) return false;
  const otherTask = tasksById.get(operationPlanId);
  return Boolean(otherTask && overlaps(otherTask.plannedStart, otherTask.plannedEnd, start, end));
});

const hasOverlappingAssignedTask = (
  tasks: NormalizedTask[] | undefined,
  currentTaskId: number,
  start: Dayjs,
  end: Dayjs,
) => (
  (tasks ?? []).some((task) =>
    task.id !== currentTaskId && overlaps(task.plannedStart, task.plannedEnd, start, end),
  )
);

const countAvailableQualifiedEmployees = (input: {
  employees: EmployeeRow[];
  qualificationId: number;
  requiredLevel: number;
  task: NormalizedTask;
  levelsByEmployeeQualification: Map<string, number>;
  workShiftEmployeeIdsByDate: Map<string, Set<number>>;
  unavailabilityByEmployee: Map<number, UnavailabilityRow[]>;
  assignmentIntervalsByEmployee: Map<number, NormalizedTask[]>;
  getQualifiedEmployeeIds: (qualificationId: number, requiredLevel: number) => number[];
  warnings: Set<string>;
}) => {
  const date = input.task.plannedStart.format('YYYY-MM-DD');
  const workedEmployeeIds = input.workShiftEmployeeIdsByDate.get(date);
  const hasAnyShiftRowsForDate = Boolean(workedEmployeeIds);
  if (!input.workShiftEmployeeIdsByDate.size || !hasAnyShiftRowsForDate) {
    input.warnings.add('DATA GAP: 部分候选人深度使用 proxy calculation；缺少完整班表时按资质供给和缺勤记录估算。');
  }

  return input.getQualifiedEmployeeIds(input.qualificationId, input.requiredLevel).filter((employeeId) => {
    if (workedEmployeeIds && !workedEmployeeIds.has(employeeId)) {
      return false;
    }

    if (hasUnavailableInterval(input.unavailabilityByEmployee.get(employeeId), input.task.plannedStart, input.task.plannedEnd)) {
      return false;
    }

    if (hasOverlappingAssignedTask(
      input.assignmentIntervalsByEmployee.get(employeeId),
      input.task.id,
      input.task.plannedStart,
      input.task.plannedEnd,
    )) {
      return false;
    }

    return true;
  }).length;
};

const buildQualificationRisks = (input: {
  employees: EmployeeRow[];
  qualifications: QualificationRow[];
  employeeQualifications: EmployeeQualificationRow[];
  tasks: NormalizedTask[];
  requirements: RequirementRow[];
  assignments: AssignmentRow[];
  shiftPlans: ShiftPlanRow[];
  unavailability: UnavailabilityRow[];
  warnings: Set<string>;
}) => {
  const {
    levelsByEmployeeQualification,
    qualificationsByEmployee,
    supplyByQualification,
  } = buildQualificationMaps(input.employees, input.employeeQualifications);
  const requirementsByOperation = buildRequirementMap(input.requirements);
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const workShiftEmployeeIdsByDate = makeWorkShiftEmployeeIdsByDate(input.shiftPlans);
  const unavailabilityByEmployee = groupUnavailabilityByEmployee(input.unavailability);
  const assignmentIntervalsByEmployee = groupAssignmentIntervalsByEmployee(input.assignments, tasksById);
  const getQualifiedEmployeeIds = makeQualifiedEmployeeCache(input.employees, levelsByEmployeeQualification);
  const accumulators = new Map<number, MutableQualificationAccumulator>();
  const qualificationsById = new Map(input.qualifications.map((qualification) => [
    Number(qualification.id),
    String(qualification.qualification_name ?? `Qualification ${qualification.id}`),
  ]));

  input.tasks.forEach((task) => {
    const taskRequirements = requirementsByOperation.get(task.operationId) ?? [];
    taskRequirements
      .filter((requirement) => numberValue(requirement.is_mandatory, 1) !== 0)
      .forEach((requirement) => {
        const qualificationId = Number(requirement.qualification_id);
        const requiredCount = Math.max(1, numberValue(requirement.required_count, 1));
        const requiredLevel = Math.max(1, numberValue(requirement.required_level, 1));
        const candidateCount = countAvailableQualifiedEmployees({
          assignmentIntervalsByEmployee,
          employees: input.employees,
          getQualifiedEmployeeIds,
          levelsByEmployeeQualification,
          qualificationId,
          requiredLevel,
          task,
          unavailabilityByEmployee,
          workShiftEmployeeIdsByDate,
          warnings: input.warnings,
        });
        const current = accumulators.get(qualificationId) ?? {
          affectedTasks: new Set<string>(),
          candidateDepthSamples: [],
          demandCount: 0,
          demandHours: 0,
          hourlyDemand: new Map<string, number>(),
          id: qualificationId,
          lowCoverageTaskCount: 0,
          name: String(requirement.qualification_name ?? qualificationsById.get(qualificationId) ?? `Qualification ${qualificationId}`),
          peakCandidateSamples: [],
          requiredLevels: [],
        };

        current.demandCount += requiredCount;
        current.demandHours += task.durationHours * requiredCount;
        current.requiredLevels.push(requiredLevel);
        current.candidateDepthSamples.push(candidateCount);
        current.affectedTasks.add(`${task.batchCode} ${task.operationName}`);
        if (candidateCount <= requiredCount + 1) current.lowCoverageTaskCount += 1;

        expandHourlyBuckets(task.plannedStart, task.plannedEnd).forEach((bucket) => {
          const nextDemand = (current.hourlyDemand.get(bucket) ?? 0) + requiredCount;
          current.hourlyDemand.set(bucket, nextDemand);
        });
        current.peakCandidateSamples.push(candidateCount);
        accumulators.set(qualificationId, current);
      });
  });

  const hotQualificationIds = new Set(
    Array.from(accumulators.values())
      .filter((item) => item.demandHours >= 8 || item.demandCount >= 4)
      .map((item) => item.id),
  );

  const rawItems = Array.from(accumulators.values()).map((accumulator) => {
    const supply = supplyByQualification.get(accumulator.id) ?? new Set<number>();
    const peakConcurrentDemand = Math.max(0, ...Array.from(accumulator.hourlyDemand.values()));
    const candidateCoverageDepth =
      accumulator.candidateDepthSamples.length > 0
        ? accumulator.candidateDepthSamples.reduce((total, value) => total + value, 0) / accumulator.candidateDepthSamples.length
        : supply.size;
    const qualifiedEmployeeCount = supply.size;
    const peakQualifiedAvailable =
      accumulator.peakCandidateSamples.length > 0
        ? Math.max(0, ...accumulator.peakCandidateSamples)
        : qualifiedEmployeeCount;
    const absenceSensitivity =
      peakConcurrentDemand > 0
        ? clamp((peakConcurrentDemand - Math.max(0, peakQualifiedAvailable - 1)) / peakConcurrentDemand, 0, 1)
        : 0;
    const employeeCompetition = Array.from(supply).reduce((total, employeeId) => {
      const employeeQualificationIds = qualificationsByEmployee.get(employeeId) ?? new Set<number>();
      const hotSkillCount = Array.from(employeeQualificationIds).filter((id) =>
        id !== accumulator.id && hotQualificationIds.has(id),
      ).length;
      return total + hotSkillCount;
    }, 0);
    const competingHotSkillCount = Math.round(employeeCompetition / Math.max(1, supply.size));
    const dependencyScore = qualifiedEmployeeCount <= 0
      ? 1
      : clamp(Math.max(1 / qualifiedEmployeeCount, 1 / Math.max(1, candidateCoverageDepth)) + (competingHotSkillCount * 0.08), 0, 1);

    return {
      absenceSensitivity,
      affectedTasks: Array.from(accumulator.affectedTasks).slice(0, 5),
      candidateCoverageDepth,
      competingHotSkillCount,
      demandCount: accumulator.demandCount,
      demandHours: accumulator.demandHours,
      dependencyScore,
      id: accumulator.id,
      lowCoverageTaskCount: accumulator.lowCoverageTaskCount,
      name: accumulator.name,
      peakConcurrentDemand,
      peakQualifiedAvailable,
      qualifiedEmployeeCount,
    };
  });

  if (!rawItems.length) {
    return buildQualificationSupplyBaseline(input.qualifications, supplyByQualification);
  }

  const maxima = {
    maxCompetingHotSkillCount: Math.max(0, ...rawItems.map((item) => item.competingHotSkillCount)),
    maxDemandHours: Math.max(0, ...rawItems.map((item) => item.demandHours)),
    maxLowCoverageTaskCount: Math.max(0, ...rawItems.map((item) => item.lowCoverageTaskCount)),
    maxPeakGapPeople: Math.max(
      0,
      ...rawItems.map((item) => Math.max(0, item.peakConcurrentDemand - item.peakQualifiedAvailable)),
    ),
  };
  const demandThreshold = Math.max(6, maxima.maxDemandHours * 0.45);

  return rawItems
    .map((item) => {
      const classification = classifyQualificationRisk(item, maxima);
      const vulnerability =
        (classification.peakGapPeople > 0 ? 0.35 : 0)
        + clamp(1 / Math.max(1, item.candidateCoverageDepth), 0, 1) * 0.3
        + item.absenceSensitivity * 0.25
        + item.dependencyScore * 0.1;
      const highDemand = item.demandHours >= demandThreshold || item.demandCount >= 4;
      const highFragility = vulnerability >= 0.52 || classification.riskLevel === 'CRITICAL' || classification.riskLevel === 'BOTTLENECK';
      const quadrant: QuadrantName = highDemand
        ? (highFragility ? '高需求 / 高脆弱' : '高需求 / 低脆弱')
        : (highFragility ? '低需求 / 高脆弱' : '低需求 / 低脆弱');

      return {
        ...item,
        candidateCoverageDepth: round(item.candidateCoverageDepth),
        demandHours: round(item.demandHours),
        quadrant,
        reasons: buildReasonList({
          ...item,
          peakGapPeople: classification.peakGapPeople,
          riskLevel: classification.riskLevel,
        }),
        riskLevel: classification.riskLevel,
        riskScore: classification.riskScore,
      } satisfies QualificationRiskItem;
    })
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore;
      if (right.demandHours !== left.demandHours) return right.demandHours - left.demandHours;
      return left.name.localeCompare(right.name);
    });
};

const buildQualificationSupplyBaseline = (
  qualifications: QualificationRow[],
  supplyByQualification: Map<number, Set<number>>,
) => qualifications.map((qualification) => {
  const id = Number(qualification.id);
  const supply = supplyByQualification.get(id) ?? new Set<number>();
  return {
    absenceSensitivity: 0,
    affectedTasks: [],
    candidateCoverageDepth: supply.size,
    competingHotSkillCount: 0,
    demandCount: 0,
    demandHours: 0,
    dependencyScore: supply.size > 0 ? round(1 / supply.size, 2) : 1,
    id,
    lowCoverageTaskCount: 0,
    name: String(qualification.qualification_name ?? `Qualification ${id}`),
    peakConcurrentDemand: 0,
    peakQualifiedAvailable: supply.size,
    qualifiedEmployeeCount: supply.size,
    quadrant: '低需求 / 低脆弱' as QuadrantName,
    reasons: buildReasonList({
      absenceSensitivity: 0,
      candidateCoverageDepth: supply.size,
      competingHotSkillCount: 0,
      demandCount: 0,
      dependencyScore: supply.size > 0 ? 1 / supply.size : 1,
      lowCoverageTaskCount: 0,
      peakConcurrentDemand: 0,
      peakGapPeople: 0,
      peakQualifiedAvailable: supply.size,
      qualifiedEmployeeCount: supply.size,
      riskLevel: 'LOW',
    }),
    riskLevel: 'LOW' as RiskLevel,
    riskScore: 0,
  } satisfies QualificationRiskItem;
}).sort((left, right) => left.name.localeCompare(right.name));

const buildWorkforceTrend = (input: {
  dateKeys: string[];
  employees: EmployeeRow[];
  employeeQualifications: EmployeeQualificationRow[];
  tasks: NormalizedTask[];
  requirements: RequirementRow[];
  assignments: AssignmentRow[];
  shiftPlans: ShiftPlanRow[];
  unavailability: UnavailabilityRow[];
}) => {
  const {
    qualificationsByEmployee,
  } = buildQualificationMaps(input.employees, input.employeeQualifications);
  const requirementsByOperation = buildRequirementMap(input.requirements);
  const assignmentsByTask = buildAssignmentsByTask(input.assignments);
  const shiftPlansByEmployeeDate = makeShiftPlanMap(input.shiftPlans);

  return input.dateKeys.map((date) => {
    const dayTasks = input.tasks.filter((task) => task.plannedStart.format('YYYY-MM-DD') === date);
    const demandedQualificationIds = new Set<number>();
    dayTasks.forEach((task) => {
      (requirementsByOperation.get(task.operationId) ?? []).forEach((requirement) => {
        if (numberValue(requirement.is_mandatory, 1) !== 0) {
          demandedQualificationIds.add(Number(requirement.qualification_id));
        }
      });
    });

    const dayTaskIds = new Set(dayTasks.map((task) => task.id));
    const assignedEmployeeIds = new Set(
      input.assignments
        .filter((assignment) => dayTaskIds.has(Number(assignment.operation_plan_id)))
        .map((assignment) => Number(assignment.employee_id)),
    );
    const rosteredEmployees = input.employees.filter((employee) =>
      hasWorkedShift(shiftPlansByEmployeeDate, Number(employee.id), date),
    );
    const qualifiedAvailablePeople = rosteredEmployees.filter((employee) => {
      const employeeId = Number(employee.id);
      if (isUnavailable(input.unavailability, employeeId, dayjs(date).startOf('day'), dayjs(date).endOf('day'))) {
        return false;
      }
      if (!demandedQualificationIds.size) return true;
      const qualificationIds = qualificationsByEmployee.get(employeeId) ?? new Set<number>();
      return Array.from(demandedQualificationIds).some((qualificationId) => qualificationIds.has(qualificationId));
    }).length;
    const taskRequiredPeople = dayTasks.reduce((total, task) => total + task.requiredPeople, 0);
    const assignedPeople = dayTasks.reduce(
      (total, task) => total + (assignmentsByTask.get(task.id) ?? []).length,
      0,
    );
    const flexiblePeople = Math.max(0, rosteredEmployees.length - assignedEmployeeIds.size);
    const effectiveSupply = demandedQualificationIds.size
      ? Math.min(rosteredEmployees.length, qualifiedAvailablePeople + Math.max(0, flexiblePeople - assignedPeople))
      : rosteredEmployees.length;

    return {
      date,
      flexiblePeople,
      gapPeople: Math.max(0, taskRequiredPeople - effectiveSupply),
      label: dayjs(date).format('M/D'),
      qualifiedAvailablePeople,
      rosteredPeople: rosteredEmployees.length,
      taskRequiredPeople,
    };
  });
};

const buildHourTrend = (input: {
  dateKeys: string[];
  employees: EmployeeRow[];
  employeeQualifications: EmployeeQualificationRow[];
  tasks: NormalizedTask[];
  requirements: RequirementRow[];
  assignments: AssignmentRow[];
  shiftPlans: ShiftPlanRow[];
  unavailability: UnavailabilityRow[];
}) => {
  const {
    qualificationsByEmployee,
  } = buildQualificationMaps(input.employees, input.employeeQualifications);
  const requirementsByOperation = buildRequirementMap(input.requirements);
  const assignmentsByTask = buildAssignmentsByTask(input.assignments);
  const shiftPlansByEmployeeDate = makeShiftPlanMap(input.shiftPlans);

  return input.dateKeys.map((date) => {
    const dayTasks = input.tasks.filter((task) => task.plannedStart.format('YYYY-MM-DD') === date);
    const demandedQualificationIds = new Set<number>();
    dayTasks.forEach((task) => {
      (requirementsByOperation.get(task.operationId) ?? []).forEach((requirement) => {
        if (numberValue(requirement.is_mandatory, 1) !== 0) {
          demandedQualificationIds.add(Number(requirement.qualification_id));
        }
      });
    });

    const taskDemandHours = dayTasks.reduce((total, task) => total + task.durationHours * task.requiredPeople, 0);
    const assignedHours = dayTasks.reduce(
      (total, task) => total + task.durationHours * (assignmentsByTask.get(task.id) ?? []).length,
      0,
    );
    const rosterProvidedHours = input.employees.reduce(
      (total, employee) => total + workedHours(shiftPlansByEmployeeDate, Number(employee.id), date),
      0,
    );
    const qualifiedAvailableHours = input.employees
      .filter((employee) => {
        const employeeId = Number(employee.id);
        if (isUnavailable(input.unavailability, employeeId, dayjs(date).startOf('day'), dayjs(date).endOf('day'))) {
          return false;
        }
        if (!demandedQualificationIds.size) return true;
        const qualificationIds = qualificationsByEmployee.get(employeeId) ?? new Set<number>();
        return Array.from(demandedQualificationIds).some((qualificationId) => qualificationIds.has(qualificationId));
      })
      .reduce((total, employee) => total + workedHours(shiftPlansByEmployeeDate, Number(employee.id), date), 0);
    const explicitOvertimeHours = input.employees.reduce(
      (total, employee) => total + overtimeHours(shiftPlansByEmployeeDate, Number(employee.id), date),
      0,
    );

    return {
      assignedHours: round(assignedHours),
      date,
      flexibleHours: round(Math.max(0, rosterProvidedHours - assignedHours)),
      label: dayjs(date).format('M/D'),
      overtimeRiskHours: round(explicitOvertimeHours + Math.max(0, taskDemandHours - qualifiedAvailableHours)),
      qualifiedAvailableHours: round(qualifiedAvailableHours),
      rosterProvidedHours: round(rosterProvidedHours),
      taskDemandHours: round(taskDemandHours),
    };
  });
};

const buildKeyPeople = (
  tasks: NormalizedTask[],
  requirements: RequirementRow[],
  assignments: AssignmentRow[],
  qualifications: QualificationRiskItem[],
) => {
  const highRiskIds = new Set(
    qualifications
      .filter((qualification) => qualification.riskLevel === 'CRITICAL' || qualification.riskLevel === 'BOTTLENECK')
      .map((qualification) => qualification.id),
  );
  const riskNameById = new Map(qualifications.map((qualification) => [qualification.id, qualification.name]));
  const requirementsByOperation = buildRequirementMap(requirements);
  const assignmentsByTask = buildAssignmentsByTask(assignments);
  const people = new Map<number, KeyPersonDependency>();

  tasks.forEach((task) => {
    const taskHighRiskQualificationIds = new Set<number>();
    (requirementsByOperation.get(task.operationId) ?? []).forEach((requirement) => {
      const qualificationId = Number(requirement.qualification_id);
      if (highRiskIds.has(qualificationId)) taskHighRiskQualificationIds.add(qualificationId);
    });

    if (!taskHighRiskQualificationIds.size) return;
    const taskAssignments = assignmentsByTask.get(task.id) ?? [];
    if (!taskAssignments.length) return;

    taskAssignments.forEach((assignment) => {
      const employeeId = Number(assignment.employee_id);
      const current = people.get(employeeId) ?? {
        action: '',
        affectedSupplyCount: 0,
        affectedTaskCount: 0,
        bottleneckQualifications: [],
        criticalTaskHours: 0,
        employeeCode: String(assignment.employee_code ?? employeeId),
        employeeId,
        employeeName: String(assignment.employee_name ?? employeeId),
      };

      current.criticalTaskHours += task.durationHours * Math.max(1, taskHighRiskQualificationIds.size) / taskAssignments.length;
      current.affectedTaskCount += 1;
      taskHighRiskQualificationIds.forEach((qualificationId) => {
        const name = riskNameById.get(qualificationId);
        if (name && !current.bottleneckQualifications.includes(name)) {
          current.bottleneckQualifications.push(name);
        }
      });
      current.affectedSupplyCount = current.bottleneckQualifications.length;
      people.set(employeeId, current);
    });
  });

  return Array.from(people.values())
    .map((person) => ({
      ...person,
      criticalTaskHours: round(person.criticalTaskHours),
      action:
        person.criticalTaskHours >= 12
          ? '提前锁定人员，并给相关资质建立 backup pool。'
          : '避免关键任务继续集中到同一人，安排同班次备援。',
    }))
    .sort((left, right) => right.criticalTaskHours - left.criticalTaskHours)
    .slice(0, 8);
};

const buildResilienceSummary = (
  qualifications: QualificationRiskItem[],
  workforceTrend: WorkforceTrendPoint[],
) => {
  const lowCoverageTotal = qualifications.reduce((total, item) => total + item.lowCoverageTaskCount, 0);
  const repairableLowCoverage = qualifications.reduce((total, item) => (
    total + (item.candidateCoverageDepth >= 2 ? item.lowCoverageTaskCount : 0)
  ), 0);
  const averageCandidateDepth =
    qualifications.length > 0
      ? qualifications.reduce((total, item) => total + item.candidateCoverageDepth, 0) / qualifications.length
      : 0;
  const unrecoverableGapCount = qualifications.filter((item) =>
    item.peakConcurrentDemand > item.peakQualifiedAvailable && item.candidateCoverageDepth < 2,
  ).length;
  const maxSingleAbsenceImpact = Math.max(
    0,
    ...qualifications.map((item) => item.absenceSensitivity * item.peakConcurrentDemand),
    ...workforceTrend.map((item) => item.gapPeople),
  );
  const supervisorActionCount = qualifications.filter((item) =>
    item.riskLevel === 'CRITICAL' || item.riskLevel === 'BOTTLENECK',
  ).length + workforceTrend.filter((item) => item.gapPeople > 0).length;

  return {
    averageCandidateDepth: round(averageCandidateDepth),
    maxSingleAbsenceImpact: round(maxSingleAbsenceImpact),
    replaceableGapRate: lowCoverageTotal > 0 ? Math.round((repairableLowCoverage / lowCoverageTotal) * 100) : 100,
    rerunLikelyCount: qualifications.filter((item) =>
      item.riskLevel === 'CRITICAL' || item.absenceSensitivity >= 0.65,
    ).length,
    supervisorActionCount,
    unrecoverableGapCount,
  };
};

const buildSummary = (
  qualifications: QualificationRiskItem[],
  workforceTrend: WorkforceTrendPoint[],
  hourTrend: HourTrendPoint[],
  keyPeople: KeyPersonDependency[],
  resilience: ResilienceSummary,
) => {
  const criticalQualificationCount = qualifications.filter((item) => item.riskLevel === 'CRITICAL').length;
  const watchQualificationCount = qualifications.filter((item) => item.riskLevel === 'WATCH').length;
  const bottleneckCount = qualifications.filter((item) => item.riskLevel === 'BOTTLENECK').length;
  const maxPeopleGap = Math.max(0, ...workforceTrend.map((item) => item.gapPeople));
  const maxHourGap = Math.max(0, ...hourTrend.map((item) => Math.max(0, item.taskDemandHours - item.qualifiedAvailableHours)));
  const absenceSensitiveQualificationCount = qualifications.filter((item) => item.absenceSensitivity >= 0.55).length;
  const highDependencyPeopleCount = keyPeople.filter((person) => person.criticalTaskHours >= 8 || person.affectedTaskCount >= 2).length;
  const supervisorIssueCount =
    criticalQualificationCount
    + bottleneckCount
    + resilience.unrecoverableGapCount
    + workforceTrend.filter((item) => item.gapPeople > 0).length;
  const readinessScore = clamp(Math.round(
    100
      - maxPeopleGap * 8
      - maxHourGap * 0.8
      - criticalQualificationCount * 12
      - bottleneckCount * 7
      - highDependencyPeopleCount * 5
      - resilience.unrecoverableGapCount * 8,
  ), 0, 100);

  return {
    absenceSensitiveQualificationCount,
    criticalQualificationCount,
    highDependencyPeopleCount,
    maxHourGap: round(maxHourGap),
    maxPeopleGap,
    readinessScore,
    supervisorIssueCount,
    watchQualificationCount,
  };
};

const buildInsights = (
  summary: CockpitSummary,
  qualifications: QualificationRiskItem[],
  keyPeople: KeyPersonDependency[],
  workforceTrend: WorkforceTrendPoint[],
  hourTrend: HourTrendPoint[],
) => {
  const insights: string[] = [];
  const highestRisk = qualifications.find((item) => item.demandCount > 0) ?? qualifications[0];
  const broadFrequent = qualifications.find((item) =>
    item.demandCount >= 5
    && item.riskLevel !== 'CRITICAL'
    && item.qualifiedEmployeeCount >= item.peakConcurrentDemand * 2,
  );
  const highestGapDay = workforceTrend.reduce((best, item) => (
    item.gapPeople > best.gapPeople ? item : best
  ), workforceTrend[0]);
  const highestHourGapDay = hourTrend.reduce((best, item) => {
    const gap = item.taskDemandHours - item.qualifiedAvailableHours;
    const bestGap = best.taskDemandHours - best.qualifiedAvailableHours;
    return gap > bestGap ? item : best;
  }, hourTrend[0]);

  if (summary.maxPeopleGap === 0) {
    insights.push('未来窗口的人力总量没有显示硬性缺口，但仍需关注合格工时和班次分布。');
  } else {
    insights.push(`${highestGapDay.label} 预计出现最大人力缺口 ${summary.maxPeopleGap} 人，需要主管提前协调。`);
  }

  if (highestRisk?.demandCount) {
    insights.push(`${highestRisk.name} 是当前最需要管理层关注的资质，原因是峰值需求、替补深度和单人缺勤敏感性共同影响。`);
  } else {
    insights.push('当前窗口未读取到计划资质需求，资质模块显示真实供给基线，不能替代完整计划风险判断。');
  }

  if (broadFrequent) {
    insights.push(`${broadFrequent.name} 使用频次高，但覆盖深度充足，不应仅因高频被判定为 Critical。`);
  }

  if (keyPeople[0]) {
    insights.push(`当前计划对 ${keyPeople[0].employeeName} 等少数关键人员存在集中依赖，建议建立 backup pool。`);
  }

  if (highestHourGapDay && highestHourGapDay.taskDemandHours > highestHourGapDay.qualifiedAvailableHours) {
    insights.push(`${highestHourGapDay.label} 工时总量看似接近可覆盖，但合格人员可用工时存在 ${round(highestHourGapDay.taskDemandHours - highestHourGapDay.qualifiedAvailableHours)}h 缺口。`);
  } else {
    insights.push('工时总量压力处于可管理区间，重点风险来自合格工时在部分班次的分布。');
  }

  return insights.slice(0, 6);
};

const buildRecommendations = (
  qualifications: QualificationRiskItem[],
  keyPeople: KeyPersonDependency[],
  workforceTrend: WorkforceTrendPoint[],
  resilience: ResilienceSummary,
) => {
  const recommendations: string[] = [];
  const critical = qualifications.find((item) => item.riskLevel === 'CRITICAL');
  const bottleneck = qualifications.find((item) => item.riskLevel === 'BOTTLENECK');
  const maxGapDay = workforceTrend.reduce((best, item) => (
    item.gapPeople > best.gapPeople ? item : best
  ), workforceTrend[0]);

  if (critical) {
    recommendations.push(`优先为 ${critical.name} 建立 backup pool，并把培训计划排到当前窗口前。`);
    recommendations.push(`避免在同一班次集中安排多个需要 ${critical.name} 的任务，必要时错峰或提前锁定人员。`);
  }

  if (!critical && bottleneck) {
    recommendations.push(`提前确认 ${bottleneck.name} 的候选人名单，保持至少 2 人替补深度。`);
  }

  if (keyPeople[0]) {
    recommendations.push(`对 ${keyPeople[0].employeeName} 的关键任务建立备援，不把同一瓶颈资质继续集中到单人。`);
  }

  if (maxGapDay?.gapPeople > 0) {
    recommendations.push(`${maxGapDay.label} 前需要主管确认跨班次调配或临时补班方案。`);
  }

  if (resilience.unrecoverableGapCount > 0) {
    recommendations.push(`对 ${resilience.unrecoverableGapCount} 个不可自动修复缺口提前做人工协调，不等待当天再处理。`);
  }

  if (recommendations.length < 3) {
    recommendations.push('保持本周资质需求和班表供给的每日复核，重点看夜班和高并发窗口。');
  }

  return recommendations.slice(0, 6);
};

const makeQuadrantGroups = (qualifications: QualificationRiskItem[]) => (
  quadrantNames.reduce((groups, name) => {
    groups[name] = qualifications.filter((item) => item.quadrant === name);
    return groups;
  }, {} as Record<QuadrantName, QualificationRiskItem[]>)
);

export function buildRosterLeadershipCockpitSnapshotFromRows(input: CockpitRows): RosterLeadershipCockpitSnapshot {
  const windowDays = clamp(Math.round(numberValue(input.windowDays, 365)), 1, 366);
  const windowStart = dayjs(input.windowStart).startOf('day');
  const windowEnd = windowStart.add(windowDays - 1, 'day');
  const dateKeys = makeDateKeys(windowStart, windowDays);
  const warnings = new Set(input.dataQualityWarnings ?? []);
  warnings.add('DATA GAP: 当前为 proxy calculation；临时缺勤韧性基于候选人深度和峰值缺口估算，未触发 solver。');
  warnings.add('DATA GAP: 资质有效状态按 employee_qualifications 现有记录估算，未做证书到期过滤。');

  const tasks = normalizeTasks(input.operations).filter((task) =>
    dateKeys.includes(task.plannedStart.format('YYYY-MM-DD')),
  );

  if (!tasks.length) {
    warnings.add('DATA GAP: 当前窗口没有激活/计划批次操作，趋势按真实空窗口显示，资质模块显示真实供给基线。');
  }

  const requirementsByOperation = buildRequirementMap(input.requirements);
  const tasksMissingRequirements = tasks.filter((task) => !(requirementsByOperation.get(task.operationId) ?? []).length);
  if (tasksMissingRequirements.length > 0) {
    warnings.add(`DATA GAP: ${tasksMissingRequirements.length} 个 batch operation 缺少可读取的资质要求，瓶颈风险会低估。`);
  }

  const missingRequiredPeopleCount = input.operations.filter((operation) => operation.required_people == null).length;
  if (missingRequiredPeopleCount > 0) {
    warnings.add(`DATA GAP: ${missingRequiredPeopleCount} 个 batch operation 缺少 required_people，已按 1 人 proxy calculation。`);
  }

  if (tasks.length > 0 && input.assignments.length === 0) {
    warnings.add('DATA GAP: 当前窗口没有 batch_personnel_assignments，关键人员依赖按空分配展示。');
  }

  if (tasks.length > 0 && input.shiftPlans.length === 0) {
    warnings.add('DATA GAP: 当前窗口没有 employee_shift_plans，班表供给和候选深度只能降级估算。');
  } else if (tasks.length > 0) {
    warnings.add('DATA GAP: 班次内占用按 day bucket 估算；小时级可调配能力为 proxy calculation。');
  }

  const workforceTrend = buildWorkforceTrend({
    assignments: input.assignments,
    dateKeys,
    employeeQualifications: input.employeeQualifications,
    employees: input.employees,
    requirements: input.requirements,
    shiftPlans: input.shiftPlans,
    tasks,
    unavailability: input.unavailability,
  });
  const hourTrend = buildHourTrend({
    assignments: input.assignments,
    dateKeys,
    employeeQualifications: input.employeeQualifications,
    employees: input.employees,
    requirements: input.requirements,
    shiftPlans: input.shiftPlans,
    tasks,
    unavailability: input.unavailability,
  });
  const qualifications = buildQualificationRisks({
    assignments: input.assignments,
    employeeQualifications: input.employeeQualifications,
    employees: input.employees,
    qualifications: input.qualifications,
    requirements: input.requirements,
    shiftPlans: input.shiftPlans,
    tasks,
    unavailability: input.unavailability,
    warnings,
  });
  const keyPeople = buildKeyPeople(tasks, input.requirements, input.assignments, qualifications);
  const resilience = buildResilienceSummary(qualifications, workforceTrend);
  const summary = qualifications.length || tasks.length
    ? buildSummary(qualifications, workforceTrend, hourTrend, keyPeople, resilience)
    : emptySummary();
  const insights = buildInsights(summary, qualifications, keyPeople, workforceTrend, hourTrend);
  const recommendations = buildRecommendations(qualifications, keyPeople, workforceTrend, resilience);

  return {
    dataMode: 'LIVE_READONLY',
    dataQualityWarnings: Array.from(warnings),
    dataSource: 'LIVE_READONLY',
    generatedAt: dayjs().format('YYYY-MM-DD HH:mm'),
    hourTrend,
    insights,
    keyPeople,
    quadrantGroups: makeQuadrantGroups(qualifications),
    qualifications,
    recommendations,
    resilience,
    summary,
    windowDays,
    windowEnd: windowEnd.format('YYYY-MM-DD'),
    windowStart: windowStart.format('YYYY-MM-DD'),
    workforceTrend,
  };
}

export class RosterLeadershipCockpitService {
  static async getSnapshot(options: { windowDays?: number; windowStart?: string } = {}) {
    const windowDays = clamp(Math.round(numberValue(options.windowDays, 365)), 1, 366);
    const windowStart = dayjs(options.windowStart ?? dayjs().format('YYYY-MM-DD')).startOf('day');
    const windowEndExclusive = windowStart.add(windowDays, 'day');

    const [employees, qualifications, employeeQualifications, operations] = await Promise.all([
      this.fetchEmployees(),
      this.fetchQualifications(),
      this.fetchEmployeeQualifications(),
      this.fetchOperations(windowStart, windowEndExclusive),
    ]);

    const operationPlanIds = operations.map((operation) => Number(operation.operation_plan_id));
    const operationIds = Array.from(new Set(operations.map((operation) => Number(operation.operation_id)).filter(Boolean)));
    const [requirements, assignments, shiftPlans, unavailability] = await Promise.all([
      this.fetchRequirements(operationIds),
      this.fetchAssignments(operationPlanIds),
      this.fetchShiftPlans(windowStart, windowEndExclusive.subtract(1, 'day')),
      this.fetchUnavailability(windowStart, windowEndExclusive),
    ]);

    return buildRosterLeadershipCockpitSnapshotFromRows({
      assignments,
      employeeQualifications,
      employees,
      operations,
      qualifications,
      requirements,
      shiftPlans,
      unavailability,
      windowDays,
      windowStart: windowStart.format('YYYY-MM-DD'),
    });
  }

  private static async fetchEmployees() {
    const [rows] = await pool.execute<EmployeeRow[]>(
      `SELECT id, employee_code, employee_name, employment_status
       FROM employees
       WHERE IFNULL(employment_status, 'ACTIVE') = 'ACTIVE'
       ORDER BY employee_code ASC, employee_name ASC`,
    );
    return rows;
  }

  private static async fetchQualifications() {
    const [rows] = await pool.execute<QualificationRow[]>(
      `SELECT q.id, q.qualification_name
       FROM qualifications q
       WHERE EXISTS (
         SELECT 1
         FROM operation_qualification_requirements oqr
         WHERE oqr.qualification_id = q.id
       )
       ORDER BY (
         SELECT COUNT(*)
         FROM operation_qualification_requirements oqr_count
         WHERE oqr_count.qualification_id = q.id
       ) DESC, q.qualification_name ASC, q.id ASC`,
    );
    return rows;
  }

  private static async fetchEmployeeQualifications() {
    const [rows] = await pool.execute<EmployeeQualificationRow[]>(
      `SELECT eq.employee_id,
              eq.qualification_id,
              q.qualification_name,
              COALESCE(eq.qualification_level, 1) AS qualification_level
       FROM employee_qualifications eq
       JOIN employees e ON e.id = eq.employee_id
       JOIN qualifications q ON q.id = eq.qualification_id
       WHERE IFNULL(e.employment_status, 'ACTIVE') = 'ACTIVE'`,
    );
    return rows;
  }

  private static async fetchOperations(windowStart: Dayjs, windowEndExclusive: Dayjs) {
    const [rows] = await pool.execute<OperationRow[]>(
      `SELECT bop.id AS operation_plan_id,
              bop.batch_plan_id,
              pbp.batch_code,
              bop.operation_id,
              o.operation_name,
              bop.planned_start_datetime,
              bop.planned_end_datetime,
              TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) AS planned_duration_minutes,
              bop.required_people
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       JOIN operations o ON o.id = bop.operation_id
       WHERE bop.planned_start_datetime < ?
         AND bop.planned_end_datetime > ?
         AND pbp.plan_status IN ('ACTIVATED', 'PLANNED', 'SCHEDULED')
       ORDER BY bop.planned_start_datetime ASC, bop.id ASC`,
      [toMysqlDateTime(windowEndExclusive), toMysqlDateTime(windowStart)],
    );
    return rows;
  }

  private static async fetchRequirements(operationIds: number[]) {
    if (!operationIds.length) return [];
    const placeholders = operationIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RequirementRow[]>(
      `SELECT oqr.operation_id,
              oqr.position_number,
              oqr.qualification_id,
              q.qualification_name,
              COALESCE(oqr.required_level, oqr.min_level, 1) AS required_level,
              COALESCE(oqr.required_count, 1) AS required_count,
              IFNULL(oqr.is_mandatory, 1) AS is_mandatory
       FROM operation_qualification_requirements oqr
       JOIN qualifications q ON q.id = oqr.qualification_id
       WHERE oqr.operation_id IN (${placeholders})
       ORDER BY oqr.operation_id ASC, oqr.position_number ASC, oqr.qualification_id ASC`,
      operationIds,
    );
    return rows;
  }

  private static async fetchAssignments(operationPlanIds: number[]) {
    if (!operationPlanIds.length) return [];
    const placeholders = operationPlanIds.map(() => '?').join(',');
    const [rows] = await pool.execute<AssignmentRow[]>(
      `SELECT bpa.id AS assignment_id,
              bpa.batch_operation_plan_id AS operation_plan_id,
              bpa.employee_id,
              e.employee_code,
              e.employee_name,
              bpa.position_number,
              bpa.role
       FROM batch_personnel_assignments bpa
       JOIN employees e ON e.id = bpa.employee_id
       WHERE bpa.batch_operation_plan_id IN (${placeholders})
         AND IFNULL(bpa.assignment_status, 'PLANNED') IN ('PLANNED', 'CONFIRMED')
       ORDER BY bpa.batch_operation_plan_id ASC, bpa.position_number ASC, bpa.id ASC`,
      operationPlanIds,
    );
    return rows;
  }

  private static async fetchShiftPlans(windowStart: Dayjs, windowEndInclusive: Dayjs) {
    const [rows] = await pool.execute<ShiftPlanRow[]>(
      `SELECT esp.employee_id,
              esp.plan_date,
              esp.plan_category,
              COALESCE(esp.plan_hours, sd.nominal_hours, 8) AS plan_hours,
              COALESCE(esp.overtime_hours, CASE WHEN esp.plan_category = 'OVERTIME' THEN COALESCE(esp.plan_hours, sd.nominal_hours, 8) ELSE 0 END) AS overtime_hours
       FROM employee_shift_plans esp
       LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND IFNULL(esp.plan_state, 'PLANNED') <> 'VOID'`,
      [windowStart.format('YYYY-MM-DD'), windowEndInclusive.format('YYYY-MM-DD')],
    );
    return rows;
  }

  private static async fetchUnavailability(windowStart: Dayjs, windowEndExclusive: Dayjs) {
    const [rows] = await pool.execute<UnavailabilityRow[]>(
      `SELECT employee_id, start_datetime, end_datetime
       FROM employee_unavailability
       WHERE start_datetime < ?
         AND end_datetime > ?`,
      [toMysqlDateTime(windowEndExclusive), toMysqlDateTime(windowStart)],
    );
    return rows;
  }
}
