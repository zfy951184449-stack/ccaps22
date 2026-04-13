import dayjs from 'dayjs';
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';

export type QualificationUsageState =
  | 'UNUSED'
  | 'EMPLOYEE_ONLY'
  | 'OPERATION_ONLY'
  | 'MIXED';

export interface QualificationOverviewItem {
  id: number;
  qualification_name: string;
  employee_binding_count: number;
  operation_binding_count: number;
  total_binding_count: number;
  usage_state: QualificationUsageState;
  deletable: boolean;
}

export interface QualificationOverviewResponse {
  totals: {
    qualification_count: number;
    in_use_count: number;
    employee_binding_count: number;
    operation_binding_count: number;
  };
  items: QualificationOverviewItem[];
}

export interface QualificationImpact {
  qualification: {
    id: number;
    qualification_name: string;
  };
  counts: {
    employees: number;
    operations: number;
  };
  employee_refs: Array<{
    employee_id: number;
    employee_code: string;
    employee_name: string;
  }>;
  operation_refs: Array<{
    operation_id: number;
    operation_code: string;
    operation_name: string;
  }>;
  deletable: boolean;
}

export interface QualificationMatrixEmployee {
  id: number;
  employee_code: string;
  employee_name: string;
  department: string;
  position: string;
  unit_id: number | null;
  unit_name: string;
}

export interface QualificationMatrixAssignment {
  id: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
}

export interface QualificationMatrixResponse {
  employees: QualificationMatrixEmployee[];
  qualifications: Array<{
    id: number;
    qualification_name: string;
  }>;
  assignments: QualificationMatrixAssignment[];
}

export type QualificationShortageMode = 'current_month' | 'all_activated';

export interface QualificationShortageScoreBreakdown {
  coverage_fragility: number;
  coverage_fragility_score: number;
  demand_scale_factor: number;
  demand_scale_score: number;
  gap_rate: number;
  gap_rate_score: number;
  gap_volume_factor: number;
  gap_volume_score: number;
  load_pressure_factor: number;
  load_pressure_score: number;
}

export interface QualificationShortageRiskItem {
  qualification_id: number;
  qualification_name: string;
  required_level: number;
  qualified_employee_count: number;
  demand_hours: number;
  demand_person_instances: number;
  active_batch_count: number;
  active_operation_count: number;
  peak_required_people: number;
  peak_gap_people: number;
  gap_rate: number;
  demand_hours_per_qualified_employee: number;
  coverage_fragility: number;
  risk_score: number;
  score_breakdown: QualificationShortageScoreBreakdown;
}

export interface QualificationShortageQualificationItem {
  qualification_id: number;
  qualification_name: string;
  demand_hours: number;
  demand_person_instances: number;
  active_batch_count: number;
  active_operation_count: number;
  worst_required_level: number;
  worst_peak_gap_people: number;
  worst_risk_score: number;
  level_breakdown: QualificationShortageRiskItem[];
}

export interface QualificationShortageSummary {
  mode: QualificationShortageMode;
  year_month: string | null;
  shortage_count: number;
  high_risk_coverable_count: number;
  total_demand_hours: number;
  average_risk_score: number;
  max_risk_score: number;
  max_peak_gap: number;
}

export interface QualificationShortageResponse {
  summary: QualificationShortageSummary;
  risk_items: QualificationShortageRiskItem[];
  qualification_items: QualificationShortageQualificationItem[];
}

export interface QualificationShortageHeatmapCell {
  qualification_id: number;
  qualification_name: string;
  qualification_rank: number;
  required_level: number;
  risk_score: number | null;
  peak_gap_people: number | null;
  demand_hours: number | null;
}

export interface QualificationShortageTrendPoint {
  year_month: string;
  label: string;
  shortage_count: number;
  high_risk_coverable_count: number;
  average_risk_score: number;
  max_risk_score: number;
  total_demand_hours: number;
}

export interface QualificationShortageMonitoringResponse {
  summary: QualificationShortageSummary;
  ranking: QualificationShortageRiskItem[];
  heatmap: QualificationShortageHeatmapCell[];
  trend: QualificationShortageTrendPoint[];
}

type QualificationOverviewRow = RowDataPacket & {
  id: number;
  qualification_name: string;
  employee_binding_count: number;
  operation_binding_count: number;
};

type QualificationRow = RowDataPacket & {
  id: number;
  qualification_name: string;
};

type EmployeeReferenceRow = RowDataPacket & {
  employee_id: number;
  employee_code: string;
  employee_name: string;
};

type OperationReferenceRow = RowDataPacket & {
  operation_id: number;
  operation_code: string;
  operation_name: string;
};

type QualificationMatrixEmployeeRow = RowDataPacket & {
  id: number;
  employee_code: string;
  employee_name: string;
  department: string | null;
  position: string | null;
  unit_id: number | null;
  unit_name: string | null;
};

type QualificationMatrixAssignmentRow = RowDataPacket & {
  id: number;
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
};

type QualificationSupplyRow = RowDataPacket & {
  employee_id: number;
  qualification_id: number;
  qualification_level: number;
};

type QualificationDemandRow = RowDataPacket & {
  qualification_id: number;
  qualification_name: string;
  operation_plan_id: number;
  batch_plan_id: number;
  planned_duration: number;
  planned_start_datetime: Date | string;
  planned_end_datetime: Date | string;
  required_count: number;
  required_level: number;
};

type MutableQualificationRiskAccumulator = {
  active_batch_ids: Set<number>;
  active_operation_ids: Set<number>;
  demand_hours: number;
  demand_person_instances: number;
  hourly_demand: Map<string, number>;
  qualification_id: number;
  qualification_name: string;
  qualified_employee_count: number;
  required_level: number;
};

type MutableQualificationAggregate = {
  active_batch_ids: Set<number>;
  active_operation_ids: Set<number>;
  demand_hours: number;
  demand_person_instances: number;
  level_breakdown: Map<number, MutableQualificationRiskAccumulator>;
  qualification_id: number;
  qualification_name: string;
};

function buildUsageState(
  employeeBindingCount: number,
  operationBindingCount: number,
): QualificationUsageState {
  if (employeeBindingCount > 0 && operationBindingCount > 0) {
    return 'MIXED';
  }

  if (employeeBindingCount > 0) {
    return 'EMPLOYEE_ONLY';
  }

  if (operationBindingCount > 0) {
    return 'OPERATION_ONLY';
  }

  return 'UNUSED';
}

function toOverviewItem(row: QualificationOverviewRow): QualificationOverviewItem {
  const employeeBindingCount = Number(row.employee_binding_count ?? 0);
  const operationBindingCount = Number(row.operation_binding_count ?? 0);

  return {
    id: Number(row.id),
    qualification_name: String(row.qualification_name),
    employee_binding_count: employeeBindingCount,
    operation_binding_count: operationBindingCount,
    total_binding_count: employeeBindingCount + operationBindingCount,
    usage_state: buildUsageState(employeeBindingCount, operationBindingCount),
    deletable: employeeBindingCount === 0 && operationBindingCount === 0,
  };
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function toQualifiedEmployeeCount(
  supplyMap: Map<number, Map<number, number>>,
  qualificationId: number,
  requiredLevel: number,
) {
  const qualificationSupply = supplyMap.get(qualificationId);
  if (!qualificationSupply) {
    return 0;
  }

  let count = 0;
  for (const [employeeId, qualificationLevel] of qualificationSupply.entries()) {
    if (employeeId && qualificationLevel >= requiredLevel) {
      count += 1;
    }
  }

  return count;
}

function expandHourlyBuckets(
  startValue: Date | string,
  endValue: Date | string,
) {
  const start = dayjs(startValue).startOf('hour');
  const end = dayjs(endValue);

  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
    return start.isValid() ? [start.format('YYYY-MM-DD HH:00:00')] : [];
  }

  const buckets: string[] = [];
  let cursor = start;

  while (cursor.isBefore(end)) {
    buckets.push(cursor.format('YYYY-MM-DD HH:00:00'));
    cursor = cursor.add(1, 'hour');
  }

  return buckets;
}

export async function getQualificationOverview(): Promise<QualificationOverviewResponse> {
  const [rows] = await pool.execute<QualificationOverviewRow[]>(
    `
      SELECT
        q.id,
        q.qualification_name,
        COUNT(DISTINCT eq.id) AS employee_binding_count,
        COUNT(DISTINCT oqr.id) AS operation_binding_count
      FROM qualifications q
      LEFT JOIN employee_qualifications eq ON eq.qualification_id = q.id
      LEFT JOIN operation_qualification_requirements oqr ON oqr.qualification_id = q.id
      GROUP BY q.id, q.qualification_name
      ORDER BY q.qualification_name ASC, q.id ASC
    `,
  );

  const items = rows.map(toOverviewItem);

  return {
    totals: {
      qualification_count: items.length,
      in_use_count: items.filter((item) => item.total_binding_count > 0).length,
      employee_binding_count: items.reduce(
        (total, item) => total + item.employee_binding_count,
        0,
      ),
      operation_binding_count: items.reduce(
        (total, item) => total + item.operation_binding_count,
        0,
      ),
    },
    items,
  };
}

export async function getQualificationImpact(
  qualificationId: number,
): Promise<QualificationImpact | null> {
  const [qualificationRows] = await pool.execute<QualificationRow[]>(
    'SELECT id, qualification_name FROM qualifications WHERE id = ?',
    [qualificationId],
  );

  if (!qualificationRows.length) {
    return null;
  }

  const qualification = qualificationRows[0];

  const [employeeRows] = await pool.execute<EmployeeReferenceRow[]>(
    `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name
      FROM employee_qualifications eq
      JOIN employees e ON e.id = eq.employee_id
      WHERE eq.qualification_id = ?
      ORDER BY e.employee_code ASC, e.employee_name ASC
    `,
    [qualificationId],
  );

  const [operationRows] = await pool.execute<OperationReferenceRow[]>(
    `
      SELECT
        o.id AS operation_id,
        o.operation_code,
        o.operation_name
      FROM operation_qualification_requirements oqr
      JOIN operations o ON o.id = oqr.operation_id
      WHERE oqr.qualification_id = ?
      GROUP BY o.id, o.operation_code, o.operation_name
      ORDER BY o.operation_code ASC, o.operation_name ASC
    `,
    [qualificationId],
  );

  return {
    qualification: {
      id: Number(qualification.id),
      qualification_name: String(qualification.qualification_name),
    },
    counts: {
      employees: employeeRows.length,
      operations: operationRows.length,
    },
    employee_refs: employeeRows.map((row) => ({
      employee_id: Number(row.employee_id),
      employee_code: String(row.employee_code),
      employee_name: String(row.employee_name),
    })),
    operation_refs: operationRows.map((row) => ({
      operation_id: Number(row.operation_id),
      operation_code: String(row.operation_code),
      operation_name: String(row.operation_name),
    })),
    deletable: employeeRows.length === 0 && operationRows.length === 0,
  };
}

export async function getQualificationMatrix(): Promise<QualificationMatrixResponse> {
  const [employeeRows] = await pool.execute<QualificationMatrixEmployeeRow[]>(
    `
      SELECT
        e.id,
        e.employee_code,
        e.employee_name,
        e.unit_id,
        COALESCE(u1.unit_name, '') AS unit_name,
        COALESCE(
          CASE
            WHEN u1.unit_type = 'DEPARTMENT' THEN u1.unit_name
            WHEN u1.unit_type = 'TEAM' AND u2.unit_type = 'DEPARTMENT' THEN u2.unit_name
            WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u3.unit_type = 'DEPARTMENT' THEN u3.unit_name
            ELSE NULL
          END,
          ''
        ) AS department,
        COALESCE(r.role_name, '') AS position
      FROM employees e
      LEFT JOIN organization_units u1 ON u1.id = e.unit_id
      LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
      LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
      LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      WHERE e.employment_status = 'ACTIVE'
      ORDER BY e.employee_name ASC, e.employee_code ASC
    `,
  );

  const [qualificationRows] = await pool.execute<QualificationRow[]>(
    `
      SELECT id, qualification_name
      FROM qualifications
      ORDER BY qualification_name ASC, id ASC
    `,
  );

  const [assignmentRows] = await pool.execute<QualificationMatrixAssignmentRow[]>(
    `
      SELECT
        eq.id,
        eq.employee_id,
        eq.qualification_id,
        eq.qualification_level
      FROM employee_qualifications eq
      JOIN employees e ON e.id = eq.employee_id
      WHERE e.employment_status = 'ACTIVE'
      ORDER BY eq.employee_id ASC, eq.qualification_id ASC
    `,
  );

  return {
    employees: employeeRows.map((row) => ({
      id: Number(row.id),
      employee_code: String(row.employee_code),
      employee_name: String(row.employee_name),
      department: String(row.department ?? ''),
      position: String(row.position ?? ''),
      unit_id: row.unit_id === null ? null : Number(row.unit_id),
      unit_name: String(row.unit_name ?? ''),
    })),
    qualifications: qualificationRows.map((row) => ({
      id: Number(row.id),
      qualification_name: String(row.qualification_name),
    })),
    assignments: assignmentRows.map((row) => ({
      id: Number(row.id),
      employee_id: Number(row.employee_id),
      qualification_id: Number(row.qualification_id),
      qualification_level: Number(row.qualification_level),
    })),
  };
}

function buildSupplyMap(supplyRows: QualificationSupplyRow[]) {
  const supplyMap = new Map<number, Map<number, number>>();

  for (const row of supplyRows) {
    const qualificationId = Number(row.qualification_id);
    const employeeId = Number(row.employee_id);
    const qualificationLevel = Number(row.qualification_level);
    const qualificationSupply =
      supplyMap.get(qualificationId) ?? new Map<number, number>();
    qualificationSupply.set(employeeId, qualificationLevel);
    supplyMap.set(qualificationId, qualificationSupply);
  }

  return supplyMap;
}

function compareRiskItems(
  left: QualificationShortageRiskItem,
  right: QualificationShortageRiskItem,
) {
  if (right.risk_score !== left.risk_score) {
    return right.risk_score - left.risk_score;
  }

  if (right.peak_gap_people !== left.peak_gap_people) {
    return right.peak_gap_people - left.peak_gap_people;
  }

  if (right.demand_hours !== left.demand_hours) {
    return right.demand_hours - left.demand_hours;
  }

  const nameComparison = left.qualification_name.localeCompare(right.qualification_name);
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.required_level - right.required_level;
}

function buildRiskScore(
  metrics: {
    coverageFragility: number;
    demandHours: number;
    demandHoursPerQualifiedEmployee: number;
    gapRate: number;
    peakGapPeople: number;
  },
  maxima: {
    maxDemandHours: number;
    maxLoadPressure: number;
    maxPeakGapPeople: number;
  },
) {
  const gapVolumeFactor =
    maxima.maxPeakGapPeople > 0
      ? metrics.peakGapPeople / maxima.maxPeakGapPeople
      : 0;
  const demandScaleFactor =
    maxima.maxDemandHours > 0
      ? metrics.demandHours / maxima.maxDemandHours
      : 0;
  const loadPressureFactor =
    maxima.maxLoadPressure > 0
      ? metrics.demandHoursPerQualifiedEmployee / maxima.maxLoadPressure
      : 0;

  // When there is no actual gap (supply >= peak demand), demand volume and
  // load pressure are far less critical.  Apply a decay factor so that
  // high-volume but fully-supplied "basic" qualifications do not outrank
  // genuinely scarce ones.
  const noGapDecay = metrics.peakGapPeople > 0 ? 1.0 : 0.3;

  const scoreBreakdown: QualificationShortageScoreBreakdown = {
    coverage_fragility: roundMetric(metrics.coverageFragility),
    coverage_fragility_score: roundMetric(metrics.coverageFragility * 10 * noGapDecay),
    demand_scale_factor: roundMetric(demandScaleFactor),
    demand_scale_score: roundMetric(demandScaleFactor * 20 * noGapDecay),
    gap_rate: roundMetric(metrics.gapRate),
    gap_rate_score: roundMetric(metrics.gapRate * 35),
    gap_volume_factor: roundMetric(gapVolumeFactor),
    gap_volume_score: roundMetric(gapVolumeFactor * 20),
    load_pressure_factor: roundMetric(loadPressureFactor),
    load_pressure_score: roundMetric(loadPressureFactor * 15 * noGapDecay),
  };

  const riskScore = Math.round(
    scoreBreakdown.gap_rate_score +
      scoreBreakdown.gap_volume_score +
      scoreBreakdown.demand_scale_score +
      scoreBreakdown.load_pressure_score +
      scoreBreakdown.coverage_fragility_score,
  );

  return {
    riskScore: Math.min(100, Math.max(0, riskScore)),
    scoreBreakdown,
  };
}

function buildQualificationShortageSnapshot(options: {
  demandRows: QualificationDemandRow[];
  mode: QualificationShortageMode;
  supplyRows: QualificationSupplyRow[];
  yearMonth: string | null;
}): QualificationShortageResponse {
  const supplyMap = buildSupplyMap(options.supplyRows);
  const riskAccumulatorMap = new Map<string, MutableQualificationRiskAccumulator>();
  const qualificationAccumulatorMap = new Map<number, MutableQualificationAggregate>();

  for (const row of options.demandRows) {
    const qualificationId = Number(row.qualification_id);
    const requiredLevel = Math.max(1, Number(row.required_level) || 1);
    const requiredCount = Math.max(1, Number(row.required_count) || 1);
    const plannedDuration = Math.max(0, Number(row.planned_duration) || 0);
    const demandHours = plannedDuration * requiredCount;
    const riskKey = `${qualificationId}:${requiredLevel}`;

    const riskAccumulator =
      riskAccumulatorMap.get(riskKey) ?? {
        active_batch_ids: new Set<number>(),
        active_operation_ids: new Set<number>(),
        demand_hours: 0,
        demand_person_instances: 0,
        hourly_demand: new Map<string, number>(),
        qualification_id: qualificationId,
        qualification_name: String(row.qualification_name),
        qualified_employee_count: toQualifiedEmployeeCount(
          supplyMap,
          qualificationId,
          requiredLevel,
        ),
        required_level: requiredLevel,
      };

    riskAccumulator.demand_hours += demandHours;
    riskAccumulator.demand_person_instances += requiredCount;
    riskAccumulator.active_batch_ids.add(Number(row.batch_plan_id));
    riskAccumulator.active_operation_ids.add(Number(row.operation_plan_id));

    for (const hourBucket of expandHourlyBuckets(
      row.planned_start_datetime,
      row.planned_end_datetime,
    )) {
      riskAccumulator.hourly_demand.set(
        hourBucket,
        (riskAccumulator.hourly_demand.get(hourBucket) ?? 0) + requiredCount,
      );
    }

    riskAccumulatorMap.set(riskKey, riskAccumulator);

    const qualificationAccumulator =
      qualificationAccumulatorMap.get(qualificationId) ?? {
        active_batch_ids: new Set<number>(),
        active_operation_ids: new Set<number>(),
        demand_hours: 0,
        demand_person_instances: 0,
        level_breakdown: new Map<number, MutableQualificationRiskAccumulator>(),
        qualification_id: qualificationId,
        qualification_name: String(row.qualification_name),
      };

    qualificationAccumulator.demand_hours += demandHours;
    qualificationAccumulator.demand_person_instances += requiredCount;
    qualificationAccumulator.active_batch_ids.add(Number(row.batch_plan_id));
    qualificationAccumulator.active_operation_ids.add(Number(row.operation_plan_id));
    qualificationAccumulator.level_breakdown.set(requiredLevel, riskAccumulator);
    qualificationAccumulatorMap.set(qualificationId, qualificationAccumulator);
  }

  const rawRiskItems = Array.from(riskAccumulatorMap.values()).map((accumulator) => {
    const peakRequiredPeople = Math.max(
      0,
      ...Array.from(accumulator.hourly_demand.values()),
    );
    const peakGapPeople = Math.max(
      0,
      peakRequiredPeople - accumulator.qualified_employee_count,
    );
    const gapRate =
      peakRequiredPeople > 0 ? peakGapPeople / peakRequiredPeople : 0;
    const demandHoursPerQualifiedEmployee =
      accumulator.qualified_employee_count > 0
        ? accumulator.demand_hours / accumulator.qualified_employee_count
        : accumulator.demand_hours;
    const coverageFragility =
      peakRequiredPeople > 0
        ? Math.min(
            1,
            peakRequiredPeople / Math.max(1, accumulator.qualified_employee_count),
          )
        : 0;

    return {
      active_batch_count: accumulator.active_batch_ids.size,
      active_operation_count: accumulator.active_operation_ids.size,
      coverage_fragility: roundMetric(coverageFragility),
      demand_hours: roundMetric(accumulator.demand_hours),
      demand_hours_per_qualified_employee: roundMetric(
        demandHoursPerQualifiedEmployee,
      ),
      demand_person_instances: accumulator.demand_person_instances,
      gap_rate: roundMetric(gapRate),
      peak_gap_people: peakGapPeople,
      peak_required_people: peakRequiredPeople,
      qualification_id: accumulator.qualification_id,
      qualification_name: accumulator.qualification_name,
      qualified_employee_count: accumulator.qualified_employee_count,
      required_level: accumulator.required_level,
    };
  });

  const maxima = {
    maxDemandHours: Math.max(0, ...rawRiskItems.map((item) => item.demand_hours)),
    maxLoadPressure: Math.max(
      0,
      ...rawRiskItems.map((item) => item.demand_hours_per_qualified_employee),
    ),
    maxPeakGapPeople: Math.max(0, ...rawRiskItems.map((item) => item.peak_gap_people)),
  };

  const riskItems = rawRiskItems
    .map((item) => {
      const { riskScore, scoreBreakdown } = buildRiskScore(
        {
          coverageFragility: item.coverage_fragility,
          demandHours: item.demand_hours,
          demandHoursPerQualifiedEmployee:
            item.demand_hours_per_qualified_employee,
          gapRate: item.gap_rate,
          peakGapPeople: item.peak_gap_people,
        },
        maxima,
      );

      return {
        ...item,
        risk_score: riskScore,
        score_breakdown: scoreBreakdown,
      } satisfies QualificationShortageRiskItem;
    })
    .sort(compareRiskItems);

  const qualificationItems = Array.from(qualificationAccumulatorMap.values())
    .map((accumulator) => {
      const levelBreakdown = riskItems
        .filter((item) => item.qualification_id === accumulator.qualification_id)
        .sort((left, right) => left.required_level - right.required_level);
      const worstItem = [...levelBreakdown].sort(compareRiskItems)[0];

      return {
        qualification_id: accumulator.qualification_id,
        qualification_name: accumulator.qualification_name,
        demand_hours: roundMetric(accumulator.demand_hours),
        demand_person_instances: accumulator.demand_person_instances,
        active_batch_count: accumulator.active_batch_ids.size,
        active_operation_count: accumulator.active_operation_ids.size,
        worst_required_level: worstItem?.required_level ?? 1,
        worst_peak_gap_people: worstItem?.peak_gap_people ?? 0,
        worst_risk_score: worstItem?.risk_score ?? 0,
        level_breakdown: levelBreakdown,
      } satisfies QualificationShortageQualificationItem;
    })
    .sort((left, right) => {
      if (right.worst_risk_score !== left.worst_risk_score) {
        return right.worst_risk_score - left.worst_risk_score;
      }

      if (right.worst_peak_gap_people !== left.worst_peak_gap_people) {
        return right.worst_peak_gap_people - left.worst_peak_gap_people;
      }

      return left.qualification_name.localeCompare(right.qualification_name);
    });

  return {
    summary: {
      mode: options.mode,
      year_month: options.yearMonth,
      shortage_count: riskItems.filter((item) => item.peak_gap_people > 0).length,
      high_risk_coverable_count: riskItems.filter(
        (item) => item.peak_gap_people === 0 && item.risk_score >= 40,
      ).length,
      total_demand_hours: roundMetric(
        riskItems.reduce((total, item) => total + item.demand_hours, 0),
      ),
      average_risk_score: roundMetric(
        riskItems.length > 0
          ? riskItems.reduce((total, item) => total + item.risk_score, 0) /
              riskItems.length
          : 0,
      ),
      max_risk_score: Math.max(0, ...riskItems.map((item) => item.risk_score)),
      max_peak_gap: Math.max(0, ...riskItems.map((item) => item.peak_gap_people)),
    },
    risk_items: riskItems,
    qualification_items: qualificationItems,
  };
}

async function fetchQualificationSupplyRows() {
  const [rows] = await pool.execute<QualificationSupplyRow[]>(
    `
      SELECT
        eq.employee_id,
        eq.qualification_id,
        eq.qualification_level
      FROM employee_qualifications eq
      JOIN employees e ON e.id = eq.employee_id
      WHERE e.employment_status = 'ACTIVE'
      ORDER BY eq.qualification_id ASC, eq.employee_id ASC
    `,
  );

  return rows;
}

async function fetchQualificationDemandRows(options?: {
  startDateTime?: string;
  endDateTimeExclusive?: string;
}) {
  const demandParams: Array<string | number> = [];
  const clauses: string[] = [];

  if (options?.startDateTime && options?.endDateTimeExclusive) {
    clauses.push(
      'bop.planned_start_datetime >= ?',
      'bop.planned_start_datetime < ?',
    );
    demandParams.push(options.startDateTime, options.endDateTimeExclusive);
  }

  const [rows] = await pool.execute<QualificationDemandRow[]>(
    `
      SELECT
        q.id AS qualification_id,
        q.qualification_name,
        bop.id AS operation_plan_id,
        pbp.id AS batch_plan_id,
        bop.planned_duration,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        COALESCE(oqr.required_count, 1) AS required_count,
        COALESCE(oqr.required_level, oqr.min_level, 1) AS required_level
      FROM operation_qualification_requirements oqr
      JOIN qualifications q ON q.id = oqr.qualification_id
      JOIN batch_operation_plans bop ON bop.operation_id = oqr.operation_id
      JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      WHERE pbp.plan_status = 'ACTIVATED'
      ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY q.qualification_name ASC, bop.planned_start_datetime ASC, bop.id ASC
    `,
    demandParams,
  );

  return rows;
}

function filterDemandRowsByYearMonth(
  demandRows: QualificationDemandRow[],
  yearMonth: string,
) {
  const monthStart = dayjs(`${yearMonth}-01`).startOf('month');
  const monthEndExclusive = monthStart.add(1, 'month');

  return demandRows.filter((row) => {
    const start = dayjs(row.planned_start_datetime);
    return start.isValid() && !start.isBefore(monthStart) && start.isBefore(monthEndExclusive);
  });
}

export async function getQualificationShortages(options: {
  mode: QualificationShortageMode;
  yearMonth?: string | null;
}): Promise<QualificationShortageResponse> {
  const mode = options.mode;
  const yearMonth =
    mode === 'current_month'
      ? options.yearMonth ?? dayjs().format('YYYY-MM')
      : null;

  const [supplyRows, demandRows] = await Promise.all([
    fetchQualificationSupplyRows(),
    mode === 'current_month' && yearMonth
      ? fetchQualificationDemandRows({
          startDateTime: dayjs(`${yearMonth}-01`)
            .startOf('month')
            .format('YYYY-MM-DD HH:mm:ss'),
          endDateTimeExclusive: dayjs(`${yearMonth}-01`)
            .startOf('month')
            .add(1, 'month')
            .format('YYYY-MM-DD HH:mm:ss'),
        })
      : fetchQualificationDemandRows(),
  ]);

  return buildQualificationShortageSnapshot({
    demandRows,
    mode,
    supplyRows,
    yearMonth,
  });
}

export async function getQualificationShortageMonitoring(options: {
  mode: QualificationShortageMode;
  yearMonth?: string | null;
  months?: number;
}): Promise<QualificationShortageMonitoringResponse> {
  const months = Math.max(1, Math.min(12, options.months ?? 6));
  const anchorYearMonth = options.yearMonth ?? dayjs().format('YYYY-MM');
  const anchorMonth = dayjs(`${anchorYearMonth}-01`).startOf('month');
  const trendStartMonth = anchorMonth.subtract(months - 1, 'month');
  const trendEndExclusive = anchorMonth.add(1, 'month');

  const [snapshot, supplyRows, trendDemandRows] = await Promise.all([
    getQualificationShortages({
      mode: options.mode,
      yearMonth: options.mode === 'current_month' ? anchorYearMonth : null,
    }),
    fetchQualificationSupplyRows(),
    fetchQualificationDemandRows({
      startDateTime: trendStartMonth.format('YYYY-MM-DD HH:mm:ss'),
      endDateTimeExclusive: trendEndExclusive.format('YYYY-MM-DD HH:mm:ss'),
    }),
  ]);

  const ranking = snapshot.risk_items.slice(0, 20);
  const topQualifications = snapshot.qualification_items.slice(0, 12);
  const heatmap: QualificationShortageHeatmapCell[] = topQualifications.flatMap(
    (item, index) =>
      Array.from({ length: 5 }, (_, levelIndex) => {
        const requiredLevel = levelIndex + 1;
        const levelRisk = item.level_breakdown.find(
          (breakdown) => breakdown.required_level === requiredLevel,
        );

        return {
          qualification_id: item.qualification_id,
          qualification_name: item.qualification_name,
          qualification_rank: index + 1,
          required_level: requiredLevel,
          risk_score: levelRisk?.risk_score ?? null,
          peak_gap_people: levelRisk?.peak_gap_people ?? null,
          demand_hours: levelRisk?.demand_hours ?? null,
        };
      }),
  );

  const trend: QualificationShortageTrendPoint[] = Array.from(
    { length: months },
    (_, monthIndex) => trendStartMonth.add(monthIndex, 'month'),
  ).map((monthPoint) => {
    const yearMonth = monthPoint.format('YYYY-MM');
    const monthSnapshot = buildQualificationShortageSnapshot({
      demandRows: filterDemandRowsByYearMonth(trendDemandRows, yearMonth),
      mode: 'current_month',
      supplyRows,
      yearMonth,
    });

    return {
      year_month: yearMonth,
      label: yearMonth,
      shortage_count: monthSnapshot.summary.shortage_count,
      high_risk_coverable_count: monthSnapshot.summary.high_risk_coverable_count,
      average_risk_score: monthSnapshot.summary.average_risk_score,
      max_risk_score: monthSnapshot.summary.max_risk_score,
      total_demand_hours: monthSnapshot.summary.total_demand_hours,
    };
  });

  return {
    summary: snapshot.summary,
    ranking,
    heatmap,
    trend,
  };
}
