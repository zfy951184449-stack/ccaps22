import dayjs from 'dayjs';

export type RiskLevel = 'LOW' | 'WATCH' | 'BOTTLENECK' | 'CRITICAL';
export type CockpitDataMode = 'LIVE_READONLY' | 'MOCK_FALLBACK';
export type CockpitDataSource = CockpitDataMode;

export interface RawCockpitEmployee {
  id: number;
  code: string;
  name: string;
}

export interface RawEmployeeQualification {
  employeeId: number;
  qualificationId: number;
  qualificationName: string;
  level: number;
}

export interface RawTaskQualification {
  qualificationId: number;
  qualificationName: string;
  requiredLevel: number;
  isMandatory: boolean;
}

export interface RawTaskPosition {
  positionNumber: number;
  availableCount: number;
  totalCount: number;
  qualifications: RawTaskQualification[];
}

export interface RawAssignedPerson {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
}

export interface RawCockpitTask {
  id: number;
  batchCode: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  requiredPeople: number;
  assignedPeople: number;
  durationHours: number;
  positions: RawTaskPosition[];
  assignedPersonnel: RawAssignedPerson[];
}

export interface RawShiftCell {
  type: 'WORK' | 'REST' | 'LEAVE' | 'UNKNOWN';
  hours?: number;
  isOvertime?: boolean;
}

export interface RawRosterEmployee {
  id: number;
  code: string;
  name: string;
  shifts: Record<string, RawShiftCell>;
}

export interface RawQualificationRiskSeed {
  qualificationId: number;
  riskScore: number;
  peakGapPeople: number;
  demandHours: number;
}

export interface BuildCockpitInput {
  employees: RawCockpitEmployee[];
  employeeQualifications: RawEmployeeQualification[];
  tasks: RawCockpitTask[];
  rosterEmployees: RawRosterEmployee[];
  windowStart: string;
  windowDays: number;
  dataSource: CockpitDataMode;
  dataQualityWarnings: string[];
  riskSeeds?: RawQualificationRiskSeed[];
}

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
  quadrant: '高需求 / 高脆弱' | '高需求 / 低脆弱' | '低需求 / 高脆弱' | '低需求 / 低脆弱';
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
  quadrantGroups: Record<QualificationRiskItem['quadrant'], QualificationRiskItem[]>;
  keyPeople: KeyPersonDependency[];
  resilience: ResilienceSummary;
  recommendations: string[];
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
  requiredLevels: number[];
}

const quadrantNames = [
  '高需求 / 高脆弱',
  '高需求 / 低脆弱',
  '低需求 / 高脆弱',
  '低需求 / 低脆弱',
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toDateKey = (value: string | Date) => dayjs(value).format('YYYY-MM-DD');

const hoursBetween = (start: string, end: string) => {
  const startAt = dayjs(start);
  const endAt = dayjs(end);
  if (!startAt.isValid() || !endAt.isValid() || !endAt.isAfter(startAt)) return 0;
  return round(endAt.diff(startAt, 'minute') / 60, 1);
};

const makeDateKeys = (start: string, days: number) => {
  const startAt = dayjs(start).startOf('day');
  return Array.from({ length: days }, (_, index) => startAt.add(index, 'day').format('YYYY-MM-DD'));
};

const expandHourlyBuckets = (start: string, end: string) => {
  const startAt = dayjs(start).startOf('hour');
  const endAt = dayjs(end);
  if (!startAt.isValid() || !endAt.isValid() || !endAt.isAfter(startAt)) {
    return [startAt.format('YYYY-MM-DD HH:00')];
  }

  const buckets: string[] = [];
  let cursor = startAt;
  while (cursor.isBefore(endAt) && buckets.length < 240) {
    buckets.push(cursor.format('YYYY-MM-DD HH:00'));
    cursor = cursor.add(1, 'hour');
  }
  return buckets;
};

const getWorkedHours = (employee: RawRosterEmployee, date: string) => {
  const shift = employee.shifts[date];
  if (!shift || shift.type !== 'WORK') return 0;
  return Math.max(0, Number(shift.hours ?? 8) || 0);
};

const getTaskDuration = (task: RawCockpitTask) =>
  Math.max(0.5, Number(task.durationHours) || hoursBetween(task.plannedStart, task.plannedEnd) || 1);

const normalizeTask = (task: RawCockpitTask): RawCockpitTask => ({
  ...task,
  durationHours: getTaskDuration(task),
  requiredPeople: Math.max(1, Number(task.requiredPeople) || 1),
  assignedPeople: Math.max(0, Number(task.assignedPeople) || 0),
});

const buildQualificationSupply = (
  employees: RawCockpitEmployee[],
  employeeQualifications: RawEmployeeQualification[],
) => {
  const activeEmployeeIds = new Set(employees.map((employee) => employee.id));
  const supplyByQualification = new Map<number, Set<number>>();
  const qualificationNameById = new Map<number, string>();
  const qualificationsByEmployee = new Map<number, Set<number>>();

  employeeQualifications.forEach((item) => {
    if (!activeEmployeeIds.has(item.employeeId)) return;

    const byQualification = supplyByQualification.get(item.qualificationId) ?? new Set<number>();
    byQualification.add(item.employeeId);
    supplyByQualification.set(item.qualificationId, byQualification);
    qualificationNameById.set(item.qualificationId, item.qualificationName);

    const byEmployee = qualificationsByEmployee.get(item.employeeId) ?? new Set<number>();
    byEmployee.add(item.qualificationId);
    qualificationsByEmployee.set(item.employeeId, byEmployee);
  });

  return {
    qualificationNameById,
    qualificationsByEmployee,
    supplyByQualification,
  };
};

const buildDemandedQualificationIds = (tasks: RawCockpitTask[]) => {
  const ids = new Set<number>();
  tasks.forEach((task) => {
    task.positions.forEach((position) => {
      position.qualifications.forEach((qualification) => {
        if (qualification.isMandatory) ids.add(qualification.qualificationId);
      });
    });
  });
  return ids;
};

const hasAnyQualification = (
  employeeId: number,
  qualificationIds: Set<number>,
  qualificationsByEmployee: Map<number, Set<number>>,
) => {
  if (qualificationIds.size === 0) return true;
  const employeeQualifications = qualificationsByEmployee.get(employeeId);
  if (!employeeQualifications) return false;
  return Array.from(qualificationIds).some((id) => employeeQualifications.has(id));
};

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
    reasons.push(`计划依赖集中度较高，单个 senior operator 不可用时会显著影响供给。`);
  }

  if (item.absenceSensitivity >= 0.5) {
    reasons.push(`一人临时缺勤会让该资质进入缺口状态或扩大缺口。`);
  }

  if (item.competingHotSkillCount > 0) {
    reasons.push(`相关人员还被 ${item.competingHotSkillCount} 个热门资质竞争，真实可调配余量低于名义供给。`);
  }

  if (item.riskLevel === 'LOW' && item.demandCount >= 5 && item.qualifiedEmployeeCount >= item.peakConcurrentDemand * 2) {
    reasons.push(`虽然使用频次高，但覆盖面广、峰值供给充足，因此不判为 Critical。`);
  }

  return reasons;
};

const buildQualificationAccumulators = (tasks: RawCockpitTask[]) => {
  const map = new Map<number, MutableQualificationAccumulator>();

  tasks.forEach((task) => {
    const durationHours = getTaskDuration(task);
    task.positions.forEach((position) => {
      position.qualifications
        .filter((qualification) => qualification.isMandatory)
        .forEach((qualification) => {
          const current = map.get(qualification.qualificationId) ?? {
            affectedTasks: new Set<string>(),
            candidateDepthSamples: [],
            demandCount: 0,
            demandHours: 0,
            hourlyDemand: new Map<string, number>(),
            id: qualification.qualificationId,
            lowCoverageTaskCount: 0,
            name: qualification.qualificationName,
            requiredLevels: [],
          };

          current.demandCount += 1;
          current.demandHours += durationHours;
          current.requiredLevels.push(qualification.requiredLevel);
          current.candidateDepthSamples.push(Math.max(0, position.availableCount));
          current.affectedTasks.add(`${task.batchCode} ${task.operationName}`);
          if (position.availableCount <= 2) current.lowCoverageTaskCount += 1;

          expandHourlyBuckets(task.plannedStart, task.plannedEnd).forEach((bucket) => {
            current.hourlyDemand.set(bucket, (current.hourlyDemand.get(bucket) ?? 0) + 1);
          });

          map.set(qualification.qualificationId, current);
        });
    });
  });

  return Array.from(map.values());
};

const buildAssignmentDependency = (
  tasks: RawCockpitTask[],
  qualificationRisks: QualificationRiskItem[],
) => {
  const highRiskQualificationIds = new Set(
    qualificationRisks
      .filter((item) => item.riskLevel === 'CRITICAL' || item.riskLevel === 'BOTTLENECK')
      .map((item) => item.id),
  );
  const riskNameById = new Map(qualificationRisks.map((item) => [item.id, item.name]));
  const employeeMap = new Map<number, KeyPersonDependency>();

  tasks.forEach((task) => {
    const taskQualificationIds = new Set<number>();
    task.positions.forEach((position) => {
      position.qualifications.forEach((qualification) => {
        if (highRiskQualificationIds.has(qualification.qualificationId)) {
          taskQualificationIds.add(qualification.qualificationId);
        }
      });
    });

    if (taskQualificationIds.size === 0 || task.assignedPersonnel.length === 0) return;

    const taskHours = getTaskDuration(task) * Math.max(1, taskQualificationIds.size);
    task.assignedPersonnel.forEach((person) => {
      const current = employeeMap.get(person.employeeId) ?? {
        action: '',
        affectedSupplyCount: 0,
        affectedTaskCount: 0,
        bottleneckQualifications: [],
        criticalTaskHours: 0,
        employeeCode: person.employeeCode,
        employeeId: person.employeeId,
        employeeName: person.employeeName,
      };

      current.criticalTaskHours += taskHours / task.assignedPersonnel.length;
      current.affectedTaskCount += 1;
      taskQualificationIds.forEach((qualificationId) => {
        const name = riskNameById.get(qualificationId);
        if (name && !current.bottleneckQualifications.includes(name)) {
          current.bottleneckQualifications.push(name);
        }
      });
      current.affectedSupplyCount = current.bottleneckQualifications.length;
      employeeMap.set(person.employeeId, current);
    });
  });

  return Array.from(employeeMap.values())
    .map((person) => ({
      ...person,
      criticalTaskHours: round(person.criticalTaskHours, 1),
      action:
        person.criticalTaskHours >= 12
          ? '提前锁定人员，并给相关资质建立 backup pool。'
          : '避免关键任务继续集中到同一人，安排同班次备援。'
    }))
    .sort((left, right) => right.criticalTaskHours - left.criticalTaskHours)
    .slice(0, 5);
};

const buildWorkforceTrend = (
  dates: string[],
  tasks: RawCockpitTask[],
  rosterEmployees: RawRosterEmployee[],
  qualificationsByEmployee: Map<number, Set<number>>,
) => dates.map((date) => {
  const dayTasks = tasks.filter((task) => toDateKey(task.plannedStart) === date);
  const taskRequiredPeople = dayTasks.reduce((total, task) => total + task.requiredPeople, 0);
  const assignedPeople = dayTasks.reduce((total, task) => total + task.assignedPeople, 0);
  const demandedQualificationIds = buildDemandedQualificationIds(dayTasks);
  const rosteredEmployees = rosterEmployees.filter((employee) => getWorkedHours(employee, date) > 0);
  const qualifiedAvailablePeople = rosteredEmployees.filter((employee) =>
    hasAnyQualification(employee.id, demandedQualificationIds, qualificationsByEmployee),
  ).length;
  const flexiblePeople = Math.max(0, rosteredEmployees.length - assignedPeople);
  const effectiveSupply = demandedQualificationIds.size > 0
    ? Math.min(rosteredEmployees.length, qualifiedAvailablePeople + flexiblePeople)
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

const buildHourTrend = (
  dates: string[],
  tasks: RawCockpitTask[],
  rosterEmployees: RawRosterEmployee[],
  qualificationsByEmployee: Map<number, Set<number>>,
) => dates.map((date) => {
  const dayTasks = tasks.filter((task) => toDateKey(task.plannedStart) === date);
  const demandedQualificationIds = buildDemandedQualificationIds(dayTasks);
  const taskDemandHours = dayTasks.reduce(
    (total, task) => total + getTaskDuration(task) * task.requiredPeople,
    0,
  );
  const assignedHours = dayTasks.reduce(
    (total, task) => total + getTaskDuration(task) * task.assignedPeople,
    0,
  );
  const rosterProvidedHours = rosterEmployees.reduce(
    (total, employee) => total + getWorkedHours(employee, date),
    0,
  );
  const qualifiedAvailableHours = rosterEmployees
    .filter((employee) => hasAnyQualification(employee.id, demandedQualificationIds, qualificationsByEmployee))
    .reduce((total, employee) => total + getWorkedHours(employee, date), 0);
  const explicitOvertimeHours = rosterEmployees.reduce((total, employee) => {
    const shift = employee.shifts[date];
    return total + (shift?.isOvertime ? Math.max(0, Number(shift.hours ?? 0)) : 0);
  }, 0);

  return {
    assignedHours: round(assignedHours),
    date,
    flexibleHours: round(Math.max(0, rosterProvidedHours - assignedHours)),
    label: dayjs(date).format('M/D'),
    overtimeRiskHours: round(explicitOvertimeHours + Math.max(0, taskDemandHours - rosterProvidedHours)),
    qualifiedAvailableHours: round(qualifiedAvailableHours),
    rosterProvidedHours: round(rosterProvidedHours),
    taskDemandHours: round(taskDemandHours),
  };
});

const buildQualificationRisks = (
  tasks: RawCockpitTask[],
  employees: RawCockpitEmployee[],
  supplyByQualification: Map<number, Set<number>>,
  qualificationsByEmployee: Map<number, Set<number>>,
  riskSeeds?: RawQualificationRiskSeed[],
) => {
  const accumulators = buildQualificationAccumulators(tasks);
  const demandedQualificationIds = new Set(accumulators.map((item) => item.id));
  const hotQualificationIds = new Set(
    accumulators
      .filter((item) => item.demandHours >= 8 || item.demandCount >= 4)
      .map((item) => item.id),
  );
  const seedByQualification = new Map((riskSeeds ?? []).map((seed) => [seed.qualificationId, seed]));

  const rawItems = accumulators.map((accumulator) => {
    const supply = supplyByQualification.get(accumulator.id) ?? new Set<number>();
    const peakConcurrentDemand = Math.max(0, ...Array.from(accumulator.hourlyDemand.values()));
    const averageCandidateDepth =
      accumulator.candidateDepthSamples.length > 0
        ? accumulator.candidateDepthSamples.reduce((total, value) => total + value, 0) / accumulator.candidateDepthSamples.length
        : supply.size;
    const qualifiedEmployeeCount = supply.size;
    const seed = seedByQualification.get(accumulator.id);
    const peakQualifiedAvailable = Math.max(0, qualifiedEmployeeCount - Math.max(0, (seed?.peakGapPeople ?? 0)));
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
      : clamp(Math.max(1 / qualifiedEmployeeCount, 1 / Math.max(1, averageCandidateDepth)) + (competingHotSkillCount * 0.08), 0, 1);

    return {
      absenceSensitivity,
      affectedTasks: Array.from(accumulator.affectedTasks).slice(0, 4),
      candidateCoverageDepth: averageCandidateDepth,
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
      const quadrant: QualificationRiskItem['quadrant'] = highDemand
        ? (highFragility ? '高需求 / 高脆弱' : '高需求 / 低脆弱')
        : (highFragility ? '低需求 / 高脆弱' : '低需求 / 低脆弱');

      return {
        ...item,
        candidateCoverageDepth: round(item.candidateCoverageDepth, 1),
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
    .filter((item) => demandedQualificationIds.has(item.id))
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore;
      if (right.demandHours !== left.demandHours) return right.demandHours - left.demandHours;
      return left.name.localeCompare(right.name);
    });
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
    averageCandidateDepth: round(averageCandidateDepth, 1),
    maxSingleAbsenceImpact: round(maxSingleAbsenceImpact, 1),
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
  const highestRisk = qualifications[0];
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
    insights.push('未来窗口的人力总量基本可以覆盖计划，但仍需关注资质和班次分布。');
  } else {
    insights.push(`${highestGapDay.label} 预计出现最大人力缺口 ${summary.maxPeopleGap} 人，需要主管提前协调。`);
  }

  if (highestRisk) {
    insights.push(`${highestRisk.name} 是当前最需要管理层关注的资质，原因是峰值需求、替补深度和单人缺勤敏感性同时偏高。`);
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
  }, {} as Record<QualificationRiskItem['quadrant'], QualificationRiskItem[]>)
);

export function buildRosterLeadershipCockpitSnapshot(
  input: BuildCockpitInput,
): RosterLeadershipCockpitSnapshot {
  const dates = makeDateKeys(input.windowStart, input.windowDays);
  const normalizedTasks = input.tasks
    .map(normalizeTask)
    .filter((task) => dates.includes(toDateKey(task.plannedStart)));
  const {
    qualificationsByEmployee,
    supplyByQualification,
  } = buildQualificationSupply(input.employees, input.employeeQualifications);
  const workforceTrend = buildWorkforceTrend(
    dates,
    normalizedTasks,
    input.rosterEmployees,
    qualificationsByEmployee,
  );
  const hourTrend = buildHourTrend(
    dates,
    normalizedTasks,
    input.rosterEmployees,
    qualificationsByEmployee,
  );
  const qualifications = buildQualificationRisks(
    normalizedTasks,
    input.employees,
    supplyByQualification,
    qualificationsByEmployee,
    input.riskSeeds,
  );
  const keyPeople = buildAssignmentDependency(normalizedTasks, qualifications);
  const resilience = buildResilienceSummary(qualifications, workforceTrend);
  const summary = buildSummary(qualifications, workforceTrend, hourTrend, keyPeople, resilience);
  const insights = buildInsights(summary, qualifications, keyPeople, workforceTrend, hourTrend);
  const recommendations = buildRecommendations(qualifications, keyPeople, workforceTrend, resilience);

  return {
    dataQualityWarnings: input.dataQualityWarnings,
    dataMode: input.dataSource,
    dataSource: input.dataSource,
    generatedAt: dayjs().format('YYYY-MM-DD HH:mm'),
    hourTrend,
    insights,
    keyPeople,
    quadrantGroups: makeQuadrantGroups(qualifications),
    qualifications,
    recommendations,
    resilience,
    summary,
    windowDays: input.windowDays,
    windowEnd: dayjs(input.windowStart).add(input.windowDays - 1, 'day').format('YYYY-MM-DD'),
    windowStart: dayjs(input.windowStart).format('YYYY-MM-DD'),
    workforceTrend,
  };
}

const buildMockShifts = (dateKeys: string[], employeeId: number): Record<string, RawShiftCell> => (
  dateKeys.reduce((shifts, date, index) => {
    const isRest = (index + employeeId) % 6 === 0;
    shifts[date] = isRest
      ? { type: 'REST', hours: 0 }
      : { type: 'WORK', hours: (index === 4 && employeeId <= 3) ? 10 : 8, isOvertime: index === 4 && employeeId <= 3 };
    return shifts;
  }, {} as Record<string, RawShiftCell>)
);

export function buildMockCockpitInput(windowDays = 14): BuildCockpitInput {
  const windowStart = dayjs().startOf('day').format('YYYY-MM-DD');
  const dates = makeDateKeys(windowStart, windowDays);
  const employees: RawCockpitEmployee[] = [
    { id: 1, code: 'OP-001', name: '王晨' },
    { id: 2, code: 'OP-002', name: '李敏' },
    { id: 3, code: 'OP-003', name: '赵磊' },
    { id: 4, code: 'OP-004', name: '陈楠' },
    { id: 5, code: 'OP-005', name: '周琪' },
    { id: 6, code: 'OP-006', name: '黄睿' },
    { id: 7, code: 'OP-007', name: '孙悦' },
    { id: 8, code: 'OP-008', name: '吴珂' },
    { id: 9, code: 'OP-009', name: '何宁' },
  ];
  const qualificationMap = {
    base: { id: 101, name: '基础上岗' },
    uspNight: { id: 102, name: 'USP 夜班巡检' },
    viralFilter: { id: 103, name: '病毒过滤 L3' },
    chromatography: { id: 104, name: '层析切换 L2' },
    weigh: { id: 105, name: '称量复核' },
  };
  const employeeQualifications: RawEmployeeQualification[] = employees.flatMap((employee) => {
    const base = [{
      employeeId: employee.id,
      qualificationId: qualificationMap.base.id,
      qualificationName: qualificationMap.base.name,
      level: 2,
    }];
    if ([1, 2, 3, 4].includes(employee.id)) {
      base.push({
        employeeId: employee.id,
        qualificationId: qualificationMap.uspNight.id,
        qualificationName: qualificationMap.uspNight.name,
        level: 3,
      });
    }
    if ([1, 2].includes(employee.id)) {
      base.push({
        employeeId: employee.id,
        qualificationId: qualificationMap.viralFilter.id,
        qualificationName: qualificationMap.viralFilter.name,
        level: 4,
      });
    }
    if ([1, 3, 4].includes(employee.id)) {
      base.push({
        employeeId: employee.id,
        qualificationId: qualificationMap.chromatography.id,
        qualificationName: qualificationMap.chromatography.name,
        level: 3,
      });
    }
    if ([1, 2, 3, 4, 5, 6, 7, 8].includes(employee.id)) {
      base.push({
        employeeId: employee.id,
        qualificationId: qualificationMap.weigh.id,
        qualificationName: qualificationMap.weigh.name,
        level: 2,
      });
    }
    return base;
  });

  const position = (
    positionNumber: number,
    availableCount: number,
    qualification: { id: number; name: string },
    level = 1,
  ): RawTaskPosition => ({
    availableCount,
    positionNumber,
    qualifications: [{
      isMandatory: true,
      qualificationId: qualification.id,
      qualificationName: qualification.name,
      requiredLevel: level,
    }],
    totalCount: employees.length,
  });

  const task = (
    id: number,
    dayIndex: number,
    startHour: number,
    durationHours: number,
    operationName: string,
    requiredPeople: number,
    positions: RawTaskPosition[],
    assignedPersonnel: RawAssignedPerson[],
  ): RawCockpitTask => {
    const plannedStart = dayjs(dates[dayIndex]).hour(startHour).minute(0).second(0);
    return {
      assignedPeople: Math.min(requiredPeople, assignedPersonnel.length),
      assignedPersonnel,
      batchCode: `RB-${String(dayIndex + 1).padStart(3, '0')}`,
      durationHours,
      id,
      operationName,
      plannedEnd: plannedStart.add(durationHours, 'hour').format(),
      plannedStart: plannedStart.format(),
      positions,
      requiredPeople,
    };
  };

  const assigned = (...ids: number[]): RawAssignedPerson[] => ids.map((id) => {
    const employee = employees.find((item) => item.id === id)!;
    return {
      employeeCode: employee.code,
      employeeId: employee.id,
      employeeName: employee.name,
    };
  });

  const tasks: RawCockpitTask[] = [
    task(1, 0, 8, 4, '现场巡检与记录整理', 5, [1, 2, 3, 4, 5].map((pos) => position(pos, 9, qualificationMap.base)), assigned(1, 3, 4, 5, 6)),
    task(2, 1, 8, 4, '现场巡检与记录整理', 5, [1, 2, 3, 4, 5].map((pos) => position(pos, 9, qualificationMap.base)), assigned(2, 3, 5, 6, 7)),
    task(3, 2, 8, 4, '现场巡检与记录整理', 5, [1, 2, 3, 4, 5].map((pos) => position(pos, 9, qualificationMap.base)), assigned(1, 4, 6, 7, 8)),
    task(4, 3, 20, 8, 'USP 夜班连续巡检', 2, [position(1, 4, qualificationMap.uspNight, 3), position(2, 4, qualificationMap.uspNight, 3)], assigned(1, 3)),
    task(5, 4, 9, 5, '病毒过滤并发窗口 A', 1, [position(1, 2, qualificationMap.viralFilter, 3)], assigned(1)),
    task(6, 4, 10, 4, '病毒过滤并发窗口 B', 1, [position(1, 2, qualificationMap.viralFilter, 3)], assigned(2)),
    task(7, 4, 11, 4, '病毒过滤并发窗口 C', 1, [position(1, 2, qualificationMap.viralFilter, 3)], assigned(1)),
    task(8, 5, 9, 6, '层析切换与缓冲液连接', 2, [position(1, 3, qualificationMap.chromatography, 2), position(2, 3, qualificationMap.chromatography, 2)], assigned(1, 4)),
    task(9, 6, 8, 3, '称量复核与物料交接', 2, [position(1, 8, qualificationMap.weigh), position(2, 8, qualificationMap.weigh)], assigned(5, 6)),
    task(10, 7, 8, 4, '现场巡检与记录整理', 5, [1, 2, 3, 4, 5].map((pos) => position(pos, 9, qualificationMap.base)), assigned(2, 4, 5, 8, 9)),
    task(11, 8, 20, 8, 'USP 夜班连续巡检', 2, [position(1, 4, qualificationMap.uspNight, 3), position(2, 4, qualificationMap.uspNight, 3)], assigned(1, 4)),
    task(12, 9, 9, 5, '病毒过滤补充窗口', 1, [position(1, 2, qualificationMap.viralFilter, 3)], assigned(1)),
  ];

  return {
    dataQualityWarnings: [
      'MOCK_FALLBACK: 当前浏览器会优先读取现有只读接口；仅在接口不可用时使用此示例数据。',
      'DATA GAP: 当前页面无法从现有汇总接口稳定取得所有岗位级实际分配与班次内小时级占用，因此候选深度和单人缺勤影响按可用数据估算。',
    ],
    dataSource: 'MOCK_FALLBACK',
    employeeQualifications,
    employees,
    riskSeeds: [
      { demandHours: 18, peakGapPeople: 1, qualificationId: qualificationMap.viralFilter.id, riskScore: 86 },
      { demandHours: 20, peakGapPeople: 0, qualificationId: qualificationMap.base.id, riskScore: 14 },
    ],
    rosterEmployees: employees.map((employee) => ({
      code: employee.code,
      id: employee.id,
      name: employee.name,
      shifts: buildMockShifts(dates, employee.id),
    })),
    tasks,
    windowDays,
    windowStart,
  };
}

export function buildMockRosterLeadershipCockpitSnapshot(windowDays = 14) {
  return buildRosterLeadershipCockpitSnapshot(buildMockCockpitInput(windowDays));
}
