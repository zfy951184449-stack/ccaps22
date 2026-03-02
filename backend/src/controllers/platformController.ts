import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  replaceCandidateMappings,
  toCandidateResourceIds,
  validateCandidateResources,
} from '../services/operationResourceBindingService';
import { upsertBatchOperationRule } from '../services/batchResourceSnapshotService';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';
import {
  isBatchResourceSnapshotsEnabled,
  isRuntimeResourceSnapshotReadEnabled,
} from '../utils/featureFlags';

const PLATFORM_DOMAINS = ['USP', 'DSP', 'SPI', 'MAINT'] as const;

type PlatformDomain = typeof PLATFORM_DOMAINS[number];

type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type PlatformConflictRow = {
  id: string;
  conflict_type: string;
  severity: ConflictSeverity;
  title: string;
  department_code: string | null;
  project_code: string | null;
  resource_name: string | null;
  resource_id?: number | null;
  employee_name: string | null;
  window_start: string;
  window_end: string;
  details: string;
};

type ConflictFilters = {
  projectKey?: string;
  domainCode?: string;
  conflictType?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
};

const normalizeProjectKey = (projectId: string): string => projectId.replace(/^legacy:/, '');

const toSqlDateTime = (value?: string | null, fallback?: string): string | undefined => {
  if (!value) {
    return fallback;
  }

  const normalized = value.replace('T', ' ').slice(0, 19);
  return normalized || fallback;
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const parseJson = <T = Record<string, unknown>>(value: unknown): T | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value as T;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (_error) {
    return null;
  }
};

const runtimeSnapshotReadEnabled = () =>
  isBatchResourceSnapshotsEnabled() && isRuntimeResourceSnapshotReadEnabled();

const projectTimelineResourceSummaryJoin = () => runtimeSnapshotReadEnabled()
  ? `
      LEFT JOIN (
        SELECT
          batch_operation_plan_id,
          GROUP_CONCAT(CONCAT(resource_type, ' x', required_count) ORDER BY resource_type SEPARATOR ', ') AS resource_summary
        FROM batch_operation_resource_requirements
        GROUP BY batch_operation_plan_id
      ) batch_req ON batch_req.batch_operation_plan_id = bop.id
      LEFT JOIN (
        SELECT
          operation_id,
          GROUP_CONCAT(CONCAT(resource_type, ' x', required_count) ORDER BY resource_type SEPARATOR ', ') AS resource_summary
        FROM operation_resource_requirements
        GROUP BY operation_id
      ) op_req ON op_req.operation_id = bop.operation_id
    `
  : `
      LEFT JOIN (
        SELECT
          operation_id,
          GROUP_CONCAT(CONCAT(resource_type, ' x', required_count) ORDER BY resource_type SEPARATOR ', ') AS resource_summary
        FROM operation_resource_requirements
        GROUP BY operation_id
      ) req ON req.operation_id = bop.operation_id
    `;

const projectTimelineResourceSummarySelect = () => runtimeSnapshotReadEnabled()
  ? 'COALESCE(batch_req.resource_summary, op_req.resource_summary) AS resource_summary'
  : 'req.resource_summary';

const domainFromUnitSql = (alias: string): string => `
  CASE
    WHEN ${alias}.unit_code = 'SP&I' THEN 'SPI'
    WHEN ${alias}.unit_code IN ('USP', 'DSP', 'SPI', 'MAINT') THEN ${alias}.unit_code
    ELSE NULL
  END
`;

const domainFromProjectSql = (projectAlias: string, orgAlias: string): string => `
  COALESCE(${projectAlias}.department_code, ${domainFromUnitSql(orgAlias)})
`;

const fixedReadinessSkeleton = () =>
  PLATFORM_DOMAINS.map((domainCode) => ({
    domain_code: domainCode,
    project_count: 0,
    resource_count: 0,
    resource_requirement_coverage: 0,
    candidate_binding_coverage: 0,
    conflict_count: 0,
    maintenance_block_count: 0,
    readiness_status: 'NOT_READY',
  }));

const computeReadinessStatus = (params: {
  projectCount: number;
  resourceCount: number;
  requirementCoverage: number;
  candidateCoverage: number;
  conflictCount: number;
  maintenanceBlockCount: number;
}): 'READY' | 'AT_RISK' | 'MODELING_GAP' | 'NOT_READY' => {
  const {
    projectCount,
    resourceCount,
    requirementCoverage,
    candidateCoverage,
    conflictCount,
    maintenanceBlockCount,
  } = params;

  if (projectCount === 0 && resourceCount === 0) {
    return 'NOT_READY';
  }

  if (requirementCoverage < 0.5 || (resourceCount === 0 && projectCount > 0)) {
    return 'MODELING_GAP';
  }

  if (conflictCount > 0 || maintenanceBlockCount > 0 || candidateCoverage < 0.5) {
    return 'AT_RISK';
  }

  return 'READY';
};

const buildProjectFilterClause = (projectKey?: string): { clause: string; params: string[] } => {
  if (!projectKey) {
    return { clause: '', params: [] };
  }

  return {
    clause: " AND COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?",
    params: [projectKey],
  };
};

const buildWindowClause = (startColumn: string, endColumn: string, from?: string, to?: string) => {
  const clauses: string[] = [];
  const params: string[] = [];

  if (from) {
    clauses.push(` AND ${endColumn} >= ?`);
    params.push(from);
  }

  if (to) {
    clauses.push(` AND ${startColumn} <= ?`);
    params.push(to);
  }

  return { clause: clauses.join(''), params };
};

const serializeConflictRow = (row: RowDataPacket): PlatformConflictRow => ({
  id: String(row.id),
  conflict_type: String(row.conflict_type),
  severity: (row.severity ?? 'MEDIUM') as ConflictSeverity,
  title: String(row.title),
  department_code: row.department_code ? String(row.department_code) : null,
  project_code: row.project_code ? String(row.project_code) : null,
  resource_name: row.resource_name ? String(row.resource_name) : null,
  resource_id: row.resource_id ? Number(row.resource_id) : null,
  employee_name: row.employee_name ? String(row.employee_name) : null,
  window_start: String(row.window_start),
  window_end: String(row.window_end),
  details: String(row.details),
});

const loadReadiness = async () => {
  const readinessMap = new Map(
    fixedReadinessSkeleton().map((row) => [
      row.domain_code,
      {
        ...row,
        total_operations: 0,
        operations_with_requirement: 0,
        requirements_with_candidates: 0,
      },
    ]),
  );

  const [projectRows] = await pool.execute<RowDataPacket[]>(`
    SELECT domain_code, COUNT(DISTINCT project_key) AS project_count
    FROM (
      SELECT
        ${domainFromProjectSql('pp', 'ou')} AS domain_code,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_key
      FROM production_batch_plans pbp
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      WHERE pbp.plan_status <> 'CANCELLED'
    ) projects
    WHERE domain_code IS NOT NULL
    GROUP BY domain_code
  `);

  projectRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.project_count = Number(row.project_count ?? 0);
    }
  });

  const [resourceRows] = await pool.execute<RowDataPacket[]>(`
    SELECT department_code AS domain_code, COUNT(*) AS resource_count
    FROM resources
    WHERE is_schedulable = 1
    GROUP BY department_code
  `);

  resourceRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.resource_count = Number(row.resource_count ?? 0);
    }
  });

  const [coverageRows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      ${domainFromProjectSql('pp', 'ou')} AS domain_code,
      COUNT(*) AS total_operations,
      SUM(CASE WHEN orr.id IS NOT NULL THEN 1 ELSE 0 END) AS operations_with_requirement,
      SUM(
        CASE
          WHEN orr.id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM operation_resource_candidates orc
            WHERE orc.requirement_id = orr.id
          )
          THEN 1 ELSE 0
        END
      ) AS requirements_with_candidates
    FROM batch_operation_plans bop
    JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
    LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
    LEFT JOIN project_plans pp
      ON pp.id = pbr.project_plan_id
      OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
    LEFT JOIN process_templates pt ON pt.id = pbp.template_id
    LEFT JOIN organization_units ou ON ou.id = pt.team_id
    LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
    WHERE pbp.plan_status <> 'CANCELLED'
    GROUP BY ${domainFromProjectSql('pp', 'ou')}
  `);

  coverageRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.total_operations = Number(row.total_operations ?? 0);
      current.operations_with_requirement = Number(row.operations_with_requirement ?? 0);
      current.requirements_with_candidates = Number(row.requirements_with_candidates ?? 0);
    }
  });

  const [missingRows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      ${domainFromProjectSql('pp', 'ou')} AS domain_code,
      COUNT(*) AS conflict_count
    FROM batch_operation_plans bop
    JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
    LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
    LEFT JOIN project_plans pp
      ON pp.id = pbr.project_plan_id
      OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
    LEFT JOIN process_templates pt ON pt.id = pbp.template_id
    LEFT JOIN organization_units ou ON ou.id = pt.team_id
    LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
    WHERE pbp.plan_status = 'ACTIVATED'
      AND orr.id IS NULL
    GROUP BY ${domainFromProjectSql('pp', 'ou')}
  `);

  missingRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.conflict_count += Number(row.conflict_count ?? 0);
    }
  });

  const [resourceConflictRows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      r.department_code AS domain_code,
      COUNT(*) AS conflict_count
    FROM resource_calendars rc1
    JOIN resource_calendars rc2
      ON rc1.resource_id = rc2.resource_id
     AND rc1.id < rc2.id
     AND rc1.start_datetime < rc2.end_datetime
     AND rc1.end_datetime > rc2.start_datetime
    JOIN resources r ON r.id = rc1.resource_id
    WHERE rc1.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
      AND rc2.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
    GROUP BY r.department_code
  `);

  resourceConflictRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.conflict_count += Number(row.conflict_count ?? 0);
    }
  });

  const [maintenanceRows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      r.department_code AS domain_code,
      COUNT(*) AS maintenance_block_count
    FROM resource_calendars rc
    JOIN maintenance_windows mw
      ON mw.resource_id = rc.resource_id
     AND rc.start_datetime < mw.end_datetime
     AND rc.end_datetime > mw.start_datetime
    JOIN resources r ON r.id = rc.resource_id
    WHERE rc.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
    GROUP BY r.department_code
  `);

  maintenanceRows.forEach((row) => {
    const current = readinessMap.get(String(row.domain_code) as PlatformDomain);
    if (current) {
      current.maintenance_block_count = Number(row.maintenance_block_count ?? 0);
    }
  });

  return PLATFORM_DOMAINS.map((domainCode) => {
    const current = readinessMap.get(domainCode)!;
    const requirementCoverage =
      current.total_operations > 0 ? current.operations_with_requirement / current.total_operations : 0;
    const candidateCoverage =
      current.operations_with_requirement > 0
        ? current.requirements_with_candidates / current.operations_with_requirement
        : 0;

    return {
      domain_code: domainCode,
      project_count: current.project_count,
      resource_count: current.resource_count,
      resource_requirement_coverage: Number(requirementCoverage.toFixed(4)),
      candidate_binding_coverage: Number(candidateCoverage.toFixed(4)),
      conflict_count: current.conflict_count,
      maintenance_block_count: current.maintenance_block_count,
      readiness_status: computeReadinessStatus({
        projectCount: current.project_count,
        resourceCount: current.resource_count,
        requirementCoverage,
        candidateCoverage,
        conflictCount: current.conflict_count,
        maintenanceBlockCount: current.maintenance_block_count,
      }),
    };
  });
};

const loadTopResources = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      r.id,
      r.resource_code,
      r.resource_name,
      r.department_code,
      (
        SELECT COUNT(*)
        FROM maintenance_windows mw
        WHERE mw.resource_id = r.id
          AND mw.end_datetime >= NOW()
      ) AS maintenance_window_count,
      (
        SELECT COUNT(*)
        FROM resource_calendars rc
        WHERE rc.resource_id = r.id
          AND rc.end_datetime >= NOW()
      ) AS active_calendar_count,
      (
        SELECT COUNT(*)
        FROM resource_assignments ra
        WHERE ra.resource_id = r.id
          AND ra.assignment_status <> 'CANCELLED'
      ) AS assignment_count
    FROM resources r
    ORDER BY maintenance_window_count DESC, assignment_count DESC, active_calendar_count DESC, r.resource_code
    LIMIT 6
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    resource_code: row.resource_code,
    resource_name: row.resource_name,
    department_code: row.department_code,
    maintenance_window_count: Number(row.maintenance_window_count ?? 0),
    active_calendar_count: Number(row.active_calendar_count ?? 0),
    assignment_count: Number(row.assignment_count ?? 0),
  }));
};

const loadTopProjects = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT
      COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
      COALESCE(MAX(pp.project_name), COALESCE(NULLIF(MAX(pbp.project_code), ''), MAX(pbp.batch_name))) AS project_name,
      COUNT(DISTINCT pbp.id) AS batch_count,
      SUM(CASE WHEN orr.id IS NULL THEN 1 ELSE 0 END) AS missing_resource_requirement_count
    FROM production_batch_plans pbp
    LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
    LEFT JOIN project_plans pp
      ON pp.id = pbr.project_plan_id
      OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
    LEFT JOIN batch_operation_plans bop ON bop.batch_plan_id = pbp.id
    LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
    WHERE pbp.plan_status <> 'CANCELLED'
    GROUP BY COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)
    ORDER BY missing_resource_requirement_count DESC, batch_count DESC, project_code
    LIMIT 6
  `);

  return rows.map((row) => ({
    project_code: row.project_code,
    project_name: row.project_name,
    batch_count: Number(row.batch_count ?? 0),
    missing_resource_requirement_count: Number(row.missing_resource_requirement_count ?? 0),
  }));
};

const loadPlatformConflicts = async (filters: ConflictFilters = {}): Promise<PlatformConflictRow[]> => {
  const {
    projectKey,
    domainCode,
    conflictType,
    severity,
    from = '1970-01-01 00:00:00',
    to = '2999-12-31 23:59:59',
    limit = 20,
  } = filters;

  const projectFilter = buildProjectFilterClause(projectKey);
  const operationWindow = buildWindowClause('bop.planned_start_datetime', 'bop.planned_end_datetime', from, to);
  const resourceWindow = buildWindowClause('rc1.start_datetime', 'rc1.end_datetime', from, to);
  const maintenanceWindow = buildWindowClause('rc.start_datetime', 'rc.end_datetime', from, to);
  const personnelWindow = buildWindowClause('bop1.planned_start_datetime', 'bop1.planned_end_datetime', from, to);

  const loadMissing = async () => {
    if (conflictType && conflictType !== 'MISSING_MASTER_DATA') {
      return [];
    }

    const params: unknown[] = [];
    let query = `
      SELECT
        CONCAT('missing-resource-', bop.id) AS id,
        'MISSING_MASTER_DATA' AS conflict_type,
        'HIGH' AS severity,
        CONCAT('操作缺少资源需求定义: ', o.operation_name) AS title,
        ${domainFromProjectSql('pp', 'ou')} AS department_code,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        NULL AS resource_name,
        NULL AS resource_id,
        NULL AS employee_name,
        bop.planned_start_datetime AS window_start,
        bop.planned_end_datetime AS window_end,
        CONCAT('Batch ', pbp.batch_code, ' / Operation ', o.operation_code) AS details
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      JOIN operations o ON o.id = bop.operation_id
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
      WHERE pbp.plan_status = 'ACTIVATED'
        AND orr.id IS NULL
        ${projectFilter.clause}
        ${operationWindow.clause}
    `;
    params.push(...projectFilter.params, ...operationWindow.params);

    if (domainCode) {
      query += ` AND ${domainFromProjectSql('pp', 'ou')} = ?`;
      params.push(domainCode);
    }

    query += ' ORDER BY bop.planned_start_datetime LIMIT ?';
    params.push(limit);

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map(serializeConflictRow);
  };

  const loadResourceConflicts = async () => {
    if (conflictType && conflictType !== 'RESOURCE_CONFLICT') {
      return [];
    }

    const params: unknown[] = [];
    let query = `
      SELECT
        CONCAT('resource-conflict-', rc1.id, '-', rc2.id) AS id,
        'RESOURCE_CONFLICT' AS conflict_type,
        'HIGH' AS severity,
        CONCAT('资源占用冲突: ', r.resource_name) AS title,
        r.department_code,
        NULL AS project_code,
        r.resource_name,
        r.id AS resource_id,
        NULL AS employee_name,
        GREATEST(rc1.start_datetime, rc2.start_datetime) AS window_start,
        LEAST(rc1.end_datetime, rc2.end_datetime) AS window_end,
        CONCAT('Calendar entries ', rc1.id, ' and ', rc2.id, ' overlap') AS details
      FROM resource_calendars rc1
      JOIN resource_calendars rc2
        ON rc1.resource_id = rc2.resource_id
       AND rc1.id < rc2.id
       AND rc1.start_datetime < rc2.end_datetime
       AND rc1.end_datetime > rc2.start_datetime
      JOIN resources r ON r.id = rc1.resource_id
      WHERE rc1.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
        AND rc2.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
        ${resourceWindow.clause}
    `;
    params.push(...resourceWindow.params);

    if (domainCode) {
      query += ' AND r.department_code = ?';
      params.push(domainCode);
    }

    query += ' ORDER BY window_start LIMIT ?';
    params.push(limit);

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map(serializeConflictRow);
  };

  const loadMaintenanceConflicts = async () => {
    if (conflictType && conflictType !== 'MAINTENANCE_BLOCK') {
      return [];
    }

    const params: unknown[] = [];
    let query = `
      SELECT
        CONCAT('maintenance-block-', rc.id, '-', mw.id) AS id,
        'MAINTENANCE_BLOCK' AS conflict_type,
        'HIGH' AS severity,
        CONCAT('维护窗口阻断: ', r.resource_name) AS title,
        r.department_code,
        NULL AS project_code,
        r.resource_name,
        r.id AS resource_id,
        NULL AS employee_name,
        GREATEST(rc.start_datetime, mw.start_datetime) AS window_start,
        LEAST(rc.end_datetime, mw.end_datetime) AS window_end,
        CONCAT('Maintenance window ', mw.window_type, ' overlaps entry ', rc.id) AS details
      FROM resource_calendars rc
      JOIN maintenance_windows mw
        ON mw.resource_id = rc.resource_id
       AND rc.start_datetime < mw.end_datetime
       AND rc.end_datetime > mw.start_datetime
      JOIN resources r ON r.id = rc.resource_id
      WHERE rc.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
        ${maintenanceWindow.clause}
    `;
    params.push(...maintenanceWindow.params);

    if (domainCode) {
      query += ' AND r.department_code = ?';
      params.push(domainCode);
    }

    query += ' ORDER BY window_start LIMIT ?';
    params.push(limit);

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map(serializeConflictRow);
  };

  const loadPersonnelConflicts = async () => {
    if (conflictType && conflictType !== 'PERSONNEL_CONFLICT') {
      return [];
    }

    const params: unknown[] = [];
    let query = `
      SELECT
        CONCAT('personnel-conflict-', a1.id, '-', a2.id) AS id,
        'PERSONNEL_CONFLICT' AS conflict_type,
        'MEDIUM' AS severity,
        CONCAT('人员时段冲突: ', e.employee_name) AS title,
        NULL AS department_code,
        NULL AS project_code,
        NULL AS resource_name,
        NULL AS resource_id,
        e.employee_name,
        GREATEST(bop1.planned_start_datetime, bop2.planned_start_datetime) AS window_start,
        LEAST(bop1.planned_end_datetime, bop2.planned_end_datetime) AS window_end,
        CONCAT('Assignments ', a1.id, ' and ', a2.id, ' overlap') AS details
      FROM batch_personnel_assignments a1
      JOIN batch_personnel_assignments a2
        ON a1.employee_id = a2.employee_id
       AND a1.id < a2.id
      JOIN batch_operation_plans bop1 ON bop1.id = a1.batch_operation_plan_id
      JOIN batch_operation_plans bop2 ON bop2.id = a2.batch_operation_plan_id
      JOIN employees e ON e.id = a1.employee_id
      WHERE bop1.planned_start_datetime < bop2.planned_end_datetime
        AND bop1.planned_end_datetime > bop2.planned_start_datetime
        AND a1.assignment_status <> 'CANCELLED'
        AND a2.assignment_status <> 'CANCELLED'
        ${personnelWindow.clause}
    `;
    params.push(...personnelWindow.params);

    query += ' ORDER BY window_start LIMIT ?';
    params.push(limit);

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.map(serializeConflictRow);
  };

  const combined = await Promise.all([loadMissing(), loadResourceConflicts(), loadMaintenanceConflicts(), loadPersonnelConflicts()]);

  return combined
    .flat()
    .filter((row) => !severity || row.severity === severity)
    .sort((left, right) => new Date(left.window_start).getTime() - new Date(right.window_start).getTime())
    .slice(0, limit);
};

const loadConflictDetail = async (conflictId: string) => {
  if (conflictId.startsWith('missing-resource-')) {
    const operationPlanId = Number(conflictId.replace('missing-resource-', ''));
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        bop.id AS operation_plan_id,
        bop.operation_id,
        pbp.id AS batch_id,
        pbp.batch_code,
        pbp.batch_name,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        o.operation_code,
        o.operation_name,
        ${domainFromProjectSql('pp', 'ou')} AS department_code,
        bop.planned_start_datetime,
        bop.planned_end_datetime
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      JOIN operations o ON o.id = bop.operation_id
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      WHERE bop.id = ?
      LIMIT 1
    `, [operationPlanId]);

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      id: conflictId,
      conflict_type: 'MISSING_MASTER_DATA',
      severity: 'HIGH',
      title: `操作缺少资源需求定义: ${row.operation_name}`,
      department_code: row.department_code,
      project_code: row.project_code,
      resource_name: null,
      employee_name: null,
      window_start: row.planned_start_datetime,
      window_end: row.planned_end_datetime,
      details: `Batch ${row.batch_code} / Operation ${row.operation_code}`,
      related_projects: [{ project_code: row.project_code }],
      related_batches: [{ id: Number(row.batch_id), batch_code: row.batch_code, batch_name: row.batch_name }],
      related_operations: [{ id: Number(row.operation_plan_id), operation_id: Number(row.operation_id), operation_code: row.operation_code, operation_name: row.operation_name }],
      related_resources: [],
      related_maintenance_windows: [],
      recommended_routes: [
        { key: 'project', path: `/project-planning-center?projectId=legacy:${row.project_code}`, label: '查看项目排产' },
        { key: 'rules', path: `/business-rules-center?operationId=${row.operation_id}`, label: '补充资源规则' },
      ],
    };
  }

  if (conflictId.startsWith('resource-conflict-')) {
    const [, leftId, rightId] = conflictId.match(/^resource-conflict-(\d+)-(\d+)$/) ?? [];
    if (!leftId || !rightId) {
      return null;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        rc1.id AS left_entry_id,
        rc2.id AS right_entry_id,
        r.id AS resource_id,
        r.resource_code,
        r.resource_name,
        r.department_code,
        GREATEST(rc1.start_datetime, rc2.start_datetime) AS window_start,
        LEAST(rc1.end_datetime, rc2.end_datetime) AS window_end,
        rc1.notes AS left_notes,
        rc2.notes AS right_notes
      FROM resource_calendars rc1
      JOIN resource_calendars rc2
        ON rc1.resource_id = rc2.resource_id
       AND rc1.id < rc2.id
      JOIN resources r ON r.id = rc1.resource_id
      WHERE rc1.id = ?
        AND rc2.id = ?
      LIMIT 1
    `, [leftId, rightId]);

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      id: conflictId,
      conflict_type: 'RESOURCE_CONFLICT',
      severity: 'HIGH',
      title: `资源占用冲突: ${row.resource_name}`,
      department_code: row.department_code,
      project_code: null,
      resource_name: row.resource_name,
      employee_name: null,
      window_start: row.window_start,
      window_end: row.window_end,
      details: `Calendar entries ${row.left_entry_id} and ${row.right_entry_id} overlap`,
      related_projects: [],
      related_batches: [],
      related_operations: [],
      related_resources: [{ id: Number(row.resource_id), resource_code: row.resource_code, resource_name: row.resource_name }],
      related_maintenance_windows: [],
      recommended_routes: [
        { key: 'resource', path: `/resource-center?resourceId=${row.resource_id}`, label: '查看资源占用' },
      ],
    };
  }

  if (conflictId.startsWith('maintenance-block-')) {
    const [, calendarId, windowId] = conflictId.match(/^maintenance-block-(\d+)-(\d+)$/) ?? [];
    if (!calendarId || !windowId) {
      return null;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        rc.id AS calendar_entry_id,
        mw.id AS maintenance_window_id,
        r.id AS resource_id,
        r.resource_code,
        r.resource_name,
        r.department_code,
        mw.window_type,
        mw.notes AS maintenance_notes,
        GREATEST(rc.start_datetime, mw.start_datetime) AS window_start,
        LEAST(rc.end_datetime, mw.end_datetime) AS window_end
      FROM resource_calendars rc
      JOIN maintenance_windows mw
        ON mw.resource_id = rc.resource_id
       AND rc.start_datetime < mw.end_datetime
       AND rc.end_datetime > mw.start_datetime
      JOIN resources r ON r.id = rc.resource_id
      WHERE rc.id = ?
        AND mw.id = ?
      LIMIT 1
    `, [calendarId, windowId]);

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      id: conflictId,
      conflict_type: 'MAINTENANCE_BLOCK',
      severity: 'HIGH',
      title: `维护窗口阻断: ${row.resource_name}`,
      department_code: row.department_code,
      project_code: null,
      resource_name: row.resource_name,
      employee_name: null,
      window_start: row.window_start,
      window_end: row.window_end,
      details: `Maintenance window ${row.window_type} overlaps calendar entry ${row.calendar_entry_id}`,
      related_projects: [],
      related_batches: [],
      related_operations: [],
      related_resources: [{ id: Number(row.resource_id), resource_code: row.resource_code, resource_name: row.resource_name }],
      related_maintenance_windows: [{ id: Number(row.maintenance_window_id), window_type: row.window_type, notes: row.maintenance_notes }],
      recommended_routes: [
        { key: 'maintenance', path: `/maintenance-windows?windowId=${row.maintenance_window_id}`, label: '查看维护窗口' },
        { key: 'resource', path: `/resource-center?resourceId=${row.resource_id}`, label: '查看资源中心' },
      ],
    };
  }

  if (conflictId.startsWith('personnel-conflict-')) {
    const [, leftAssignmentId, rightAssignmentId] = conflictId.match(/^personnel-conflict-(\d+)-(\d+)$/) ?? [];
    if (!leftAssignmentId || !rightAssignmentId) {
      return null;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        a1.id AS left_assignment_id,
        a2.id AS right_assignment_id,
        e.id AS employee_id,
        e.employee_name,
        GREATEST(bop1.planned_start_datetime, bop2.planned_start_datetime) AS window_start,
        LEAST(bop1.planned_end_datetime, bop2.planned_end_datetime) AS window_end
      FROM batch_personnel_assignments a1
      JOIN batch_personnel_assignments a2
        ON a1.employee_id = a2.employee_id
       AND a1.id < a2.id
      JOIN batch_operation_plans bop1 ON bop1.id = a1.batch_operation_plan_id
      JOIN batch_operation_plans bop2 ON bop2.id = a2.batch_operation_plan_id
      JOIN employees e ON e.id = a1.employee_id
      WHERE a1.id = ?
        AND a2.id = ?
      LIMIT 1
    `, [leftAssignmentId, rightAssignmentId]);

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      id: conflictId,
      conflict_type: 'PERSONNEL_CONFLICT',
      severity: 'MEDIUM',
      title: `人员时段冲突: ${row.employee_name}`,
      department_code: null,
      project_code: null,
      resource_name: null,
      employee_name: row.employee_name,
      window_start: row.window_start,
      window_end: row.window_end,
      details: `Assignments ${row.left_assignment_id} and ${row.right_assignment_id} overlap`,
      related_projects: [],
      related_batches: [],
      related_operations: [],
      related_resources: [],
      related_maintenance_windows: [],
      recommended_routes: [],
    };
  }

  return null;
};

const loadOverviewWarnings = (overview: {
  resourceCount: number;
  missingMasterDataCount: number;
  readiness: Array<{ domain_code: string; project_count: number; resource_count: number; readiness_status: string }>;
}) => {
  const warnings: string[] = [];

  if (overview.resourceCount === 0) {
    warnings.push('资源主数据仍为空，平台资源排产只具备骨架能力。');
  }

  if (overview.missingMasterDataCount > 0) {
    warnings.push(`当前仍有 ${overview.missingMasterDataCount} 个激活操作缺少资源需求定义。`);
  }

  overview.readiness
    .filter((row) => row.project_count > 0 && row.resource_count === 0)
    .forEach((row) => {
      warnings.push(`${row.domain_code} 已有项目数据，但资源主数据尚未进入平台模型。`);
    });

  return warnings;
};

export const getPlatformOverview = async (req: Request, res: Response) => {
  try {
    const readiness = await loadReadiness();
    const [summaryRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(DISTINCT COALESCE(NULLIF(project_code, ''), batch_code))
         FROM production_batch_plans
         WHERE plan_status <> 'CANCELLED') AS project_count,
        (SELECT COUNT(*)
         FROM production_batch_plans
         WHERE plan_status = 'ACTIVATED') AS active_batch_count,
        (SELECT COUNT(*) FROM resources WHERE is_schedulable = 1) AS resource_count,
        (SELECT COUNT(*) FROM maintenance_windows WHERE end_datetime >= NOW()) AS maintenance_block_count,
        (SELECT COUNT(*)
         FROM batch_operation_plans bop
         JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
         LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
         WHERE pbp.plan_status = 'ACTIVATED'
           AND orr.id IS NULL) AS missing_master_data_count
    `);

    const [resourceConflictRows] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS resource_conflict_count
      FROM (
        SELECT rc1.id
        FROM resource_calendars rc1
        JOIN resource_calendars rc2
          ON rc1.resource_id = rc2.resource_id
         AND rc1.id < rc2.id
         AND rc1.start_datetime < rc2.end_datetime
         AND rc1.end_datetime > rc2.start_datetime
        WHERE rc1.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
          AND rc2.event_type IN ('OCCUPIED', 'LOCKED', 'CHANGEOVER')
      ) conflicts
    `);

    const [personnelConflictRows] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS personnel_conflict_count
      FROM (
        SELECT a1.id
        FROM batch_personnel_assignments a1
        JOIN batch_personnel_assignments a2
          ON a1.employee_id = a2.employee_id
         AND a1.id < a2.id
        JOIN batch_operation_plans bop1 ON bop1.id = a1.batch_operation_plan_id
        JOIN batch_operation_plans bop2 ON bop2.id = a2.batch_operation_plan_id
        WHERE bop1.planned_start_datetime < bop2.planned_end_datetime
          AND bop1.planned_end_datetime > bop2.planned_start_datetime
          AND a1.assignment_status <> 'CANCELLED'
          AND a2.assignment_status <> 'CANCELLED'
      ) conflicts
    `);

    const [departmentRows] = await pool.execute<RowDataPacket[]>(`
      SELECT department_code, COUNT(*) AS resource_count
      FROM resources
      GROUP BY department_code
      ORDER BY department_code
    `);

    const [runRows] = await pool.execute<RowDataPacket[]>(`
      SELECT id, run_code, status, stage, created_at, completed_at
      FROM scheduling_runs
      ORDER BY created_at DESC
      LIMIT 6
    `);

    const summary = summaryRows[0] || {};
    const overview = {
      project_count: Number(summary.project_count ?? 0),
      active_batch_count: Number(summary.active_batch_count ?? 0),
      resource_count: Number(summary.resource_count ?? 0),
      resource_conflict_count: Number(resourceConflictRows[0]?.resource_conflict_count ?? 0),
      personnel_conflict_count: Number(personnelConflictRows[0]?.personnel_conflict_count ?? 0),
      maintenance_block_count: Number(summary.maintenance_block_count ?? 0),
      missing_master_data_count: Number(summary.missing_master_data_count ?? 0),
      departments: departmentRows.map((row) => ({
        department_code: row.department_code,
        resource_count: Number(row.resource_count ?? 0),
      })),
      recent_runs: runRows.map((row) => ({
        id: Number(row.id),
        run_code: row.run_code,
        status: row.status,
        stage: row.stage,
        created_at: row.created_at,
        completed_at: row.completed_at,
      })),
      readiness,
      top_resources: await loadTopResources(),
      top_projects: await loadTopProjects(),
    };

    res.json({
      ...overview,
      warnings: loadOverviewWarnings({
        resourceCount: overview.resource_count,
        missingMasterDataCount: overview.missing_master_data_count,
        readiness: overview.readiness,
      }),
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      const [summaryRows] = await pool.execute<RowDataPacket[]>(`
        SELECT
          (SELECT COUNT(DISTINCT COALESCE(NULLIF(project_code, ''), batch_code))
           FROM production_batch_plans
           WHERE plan_status <> 'CANCELLED') AS project_count,
          (SELECT COUNT(*)
           FROM production_batch_plans
           WHERE plan_status = 'ACTIVATED') AS active_batch_count
      `);
      const [runRows] = await pool.execute<RowDataPacket[]>(`
        SELECT id, run_code, status, stage, created_at, completed_at
        FROM scheduling_runs
        ORDER BY created_at DESC
        LIMIT 6
      `);
      const summary = summaryRows[0] || {};

      return res.json({
        project_count: Number(summary.project_count ?? 0),
        active_batch_count: Number(summary.active_batch_count ?? 0),
        resource_count: 0,
        resource_conflict_count: 0,
        personnel_conflict_count: 0,
        maintenance_block_count: 0,
        missing_master_data_count: 0,
        departments: [],
        recent_runs: runRows,
        readiness: fixedReadinessSkeleton(),
        top_resources: [],
        top_projects: [],
        warnings: [`Platform resource model is not available because table ${extractMissingTableName(error) ?? 'resources'} is missing.`],
      });
    }

    console.error('Error fetching platform overview:', error);
    res.status(500).json({ error: 'Failed to fetch platform overview' });
  }
};

export const getPlatformOverviewReadiness = async (_req: Request, res: Response) => {
  try {
    res.json(await loadReadiness());
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json(fixedReadinessSkeleton());
    }

    console.error('Error fetching platform readiness:', error);
    res.status(500).json({ error: 'Failed to fetch platform readiness' });
  }
};

export const getPlatformProjects = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        CONCAT('legacy:', COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)) AS id,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        COALESCE(MAX(pp.project_name), COALESCE(NULLIF(pbp.project_code, ''), MAX(pbp.batch_name))) AS project_name,
        MIN(pbp.planned_start_date) AS planned_start_date,
        MAX(COALESCE(pbp.planned_end_date, pbp.planned_start_date)) AS planned_end_date,
        COUNT(*) AS batch_count,
        SUM(CASE WHEN pbp.plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_batch_count,
        COUNT(DISTINCT pt.team_id) AS team_count,
        GROUP_CONCAT(DISTINCT ou.unit_code ORDER BY ou.unit_code) AS department_codes,
        SUM(CASE WHEN orr.id IS NULL THEN 1 ELSE 0 END) AS missing_resource_requirement_count
      FROM production_batch_plans pbp
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      LEFT JOIN batch_operation_plans bop ON bop.batch_plan_id = pbp.id
      LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
      WHERE pbp.plan_status <> 'CANCELLED'
      GROUP BY COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)
      ORDER BY planned_start_date DESC, project_code DESC
    `);

    res.json(
      rows.map((row) => ({
        ...row,
        batch_count: Number(row.batch_count ?? 0),
        activated_batch_count: Number(row.activated_batch_count ?? 0),
        team_count: Number(row.team_count ?? 0),
        missing_resource_requirement_count: Number(row.missing_resource_requirement_count ?? 0),
        department_codes: row.department_codes ? String(row.department_codes).split(',') : [],
      })),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT
          CONCAT('legacy:', COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)) AS id,
          COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
          COALESCE(NULLIF(pbp.project_code, ''), MAX(pbp.batch_name)) AS project_name,
          MIN(pbp.planned_start_date) AS planned_start_date,
          MAX(COALESCE(pbp.planned_end_date, pbp.planned_start_date)) AS planned_end_date,
          COUNT(*) AS batch_count,
          SUM(CASE WHEN pbp.plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_batch_count,
          COUNT(DISTINCT pt.team_id) AS team_count,
          GROUP_CONCAT(DISTINCT ou.unit_code ORDER BY ou.unit_code) AS department_codes,
          0 AS missing_resource_requirement_count
        FROM production_batch_plans pbp
        LEFT JOIN process_templates pt ON pt.id = pbp.template_id
        LEFT JOIN organization_units ou ON ou.id = pt.team_id
        WHERE pbp.plan_status <> 'CANCELLED'
        GROUP BY COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)
        ORDER BY planned_start_date DESC, project_code DESC
      `);

      return res.json(
        rows.map((row) => ({
          ...row,
          batch_count: Number(row.batch_count ?? 0),
          activated_batch_count: Number(row.activated_batch_count ?? 0),
          team_count: Number(row.team_count ?? 0),
          missing_resource_requirement_count: Number(row.missing_resource_requirement_count ?? 0),
          department_codes: row.department_codes ? String(row.department_codes).split(',') : [],
        })),
      );
    }

    console.error('Error fetching platform projects:', error);
    res.status(500).json({ error: 'Failed to fetch platform projects' });
  }
};

export const getPlatformProjectById = async (req: Request, res: Response) => {
  try {
    const projectKey = normalizeProjectKey(req.params.id);
    const [projectRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('legacy:', COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)) AS id,
          COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
          COALESCE(MAX(pp.project_name), COALESCE(NULLIF(pbp.project_code, ''), MAX(pbp.batch_name))) AS project_name,
          MIN(pbp.planned_start_date) AS planned_start_date,
          MAX(COALESCE(pbp.planned_end_date, pbp.planned_start_date)) AS planned_end_date,
          COUNT(*) AS batch_count,
          SUM(CASE WHEN pbp.plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_batch_count,
          GROUP_CONCAT(DISTINCT ou.unit_code ORDER BY ou.unit_code) AS department_codes
       FROM production_batch_plans pbp
       LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
       LEFT JOIN project_plans pp
         ON pp.id = pbr.project_plan_id
         OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
       LEFT JOIN process_templates pt ON pt.id = pbp.template_id
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?
       GROUP BY COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)`,
      [projectKey],
    );

    if (!projectRows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [batchRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          pbp.id,
          pbp.batch_code,
          pbp.batch_name,
          pbp.plan_status,
          pbp.planned_start_date,
          pbp.planned_end_date,
          pt.template_name,
          ou.unit_code AS team_code,
          ou.unit_name AS team_name
       FROM production_batch_plans pbp
       LEFT JOIN process_templates pt ON pt.id = pbp.template_id
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?
       ORDER BY pbp.planned_start_date`,
      [projectKey],
    );

    const [opsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          COUNT(*) AS total_operations,
          SUM(CASE WHEN orr.id IS NULL THEN 1 ELSE 0 END) AS missing_resource_requirement_count
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?`,
      [projectKey],
    );

    res.json({
      project: {
        ...projectRows[0],
        batch_count: Number(projectRows[0].batch_count ?? 0),
        activated_batch_count: Number(projectRows[0].activated_batch_count ?? 0),
        department_codes: projectRows[0].department_codes ? String(projectRows[0].department_codes).split(',') : [],
      },
      batches: batchRows,
      operations_summary: {
        total_operations: Number(opsRows[0]?.total_operations ?? 0),
        missing_resource_requirement_count: Number(opsRows[0]?.missing_resource_requirement_count ?? 0),
      },
    });
  } catch (error) {
    console.error('Error fetching platform project detail:', error);
    res.status(500).json({ error: 'Failed to fetch platform project detail' });
  }
};

export const getPlatformProjectTimeline = async (req: Request, res: Response) => {
  try {
    const projectKey = normalizeProjectKey(req.params.id);
    const from = toSqlDateTime(typeof req.query.from === 'string' ? req.query.from : undefined, '1970-01-01 00:00:00')!;
    const to = toSqlDateTime(typeof req.query.to === 'string' ? req.query.to : undefined, '2999-12-31 23:59:59')!;

    const [projectRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('legacy:', COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)) AS id,
          COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
          COALESCE(MAX(pp.project_name), COALESCE(NULLIF(pbp.project_code, ''), MAX(pbp.batch_name))) AS project_name,
          MIN(pbp.planned_start_date) AS planned_start_date,
          MAX(COALESCE(pbp.planned_end_date, pbp.planned_start_date)) AS planned_end_date
       FROM production_batch_plans pbp
       LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
       LEFT JOIN project_plans pp
         ON pp.id = pbr.project_plan_id
         OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?
       GROUP BY COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)`,
      [projectKey],
    );

    if (!projectRows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [operationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          bop.id AS operation_plan_id,
          bop.operation_id,
          bop.batch_plan_id,
          bop.planned_start_datetime,
          bop.planned_end_datetime,
          bop.notes,
          bop.required_people,
          bop.is_locked,
          pbp.batch_code,
          pbp.batch_name,
          pbp.plan_status,
          ps.id AS stage_id,
          ps.stage_name,
          o.operation_code,
          o.operation_name,
          ${domainFromProjectSql('pp', 'ou')} AS domain_code,
          ${projectTimelineResourceSummarySelect()}
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       JOIN stage_operation_schedules sos ON sos.id = bop.template_schedule_id
       JOIN process_stages ps ON ps.id = sos.stage_id
       JOIN operations o ON o.id = bop.operation_id
       LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
       LEFT JOIN project_plans pp
         ON pp.id = pbr.project_plan_id
         OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
       LEFT JOIN process_templates pt ON pt.id = pbp.template_id
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       ${projectTimelineResourceSummaryJoin()}
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?
         AND bop.planned_end_datetime >= ?
         AND bop.planned_start_datetime <= ?
       ORDER BY pbp.batch_code, ps.id, bop.planned_start_datetime`,
      [projectKey, from, to],
    );

    const [dependencyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          boc.id,
          boc.predecessor_batch_operation_plan_id AS from_item_id,
          boc.batch_operation_plan_id AS to_item_id,
          boc.lag_type,
          boc.constraint_name
       FROM batch_operation_constraints boc
       JOIN production_batch_plans pbp ON pbp.id = boc.batch_plan_id
       WHERE COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?
       ORDER BY boc.id`,
      [projectKey],
    );

    const conflicts = await loadPlatformConflicts({ projectKey, from, to, limit: 100 });
    const conflictOperationIds = new Set(
      conflicts
        .filter((row) => row.id.startsWith('missing-resource-'))
        .map((row) => Number(row.id.replace('missing-resource-', '')))
        .filter((value) => Number.isFinite(value)),
    );
    const conflictResourceIds = new Set(
      conflicts
        .map((row) => row.resource_id)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    );

    const lanes: Array<Record<string, unknown>> = [];
    const laneIds = new Set<string>();
    const items = operationRows.map((row) => {
      const laneId = `batch-${row.batch_plan_id}-stage-${row.stage_id}`;
      if (!laneIds.has(laneId)) {
        laneIds.add(laneId);
        lanes.push({
          id: laneId,
          label: `${row.batch_code} / ${row.stage_name}`,
          group_label: row.batch_code,
          domain_code: row.domain_code,
          lane_type: 'OPERATION',
        });
      }

      return {
        id: `operation-${row.operation_plan_id}`,
        lane_id: laneId,
        item_type: 'OPERATION',
        title: row.operation_name,
        subtitle: `${row.operation_code} · ${row.batch_code}`,
        start_datetime: row.planned_start_datetime,
        end_datetime: row.planned_end_datetime,
        color: row.domain_code === 'DSP' ? '#1677ff' : row.domain_code === 'SPI' ? '#13c2c2' : '#52c41a',
        status: row.plan_status,
        domain_code: row.domain_code,
        is_conflicted: conflictOperationIds.has(Number(row.operation_plan_id)),
        maintenance_blocked: false,
        resource_conflicted: Array.from(conflictResourceIds).length > 0,
        metadata: {
          operationPlanId: Number(row.operation_plan_id),
          operationId: Number(row.operation_id),
          batchPlanId: Number(row.batch_plan_id),
          batchCode: row.batch_code,
          notes: row.notes,
          requiredPeople: Number(row.required_people ?? 0),
          isLocked: toBoolean(row.is_locked),
          resourceSummary: row.resource_summary ?? null,
        },
      };
    });

    res.json({
      project: projectRows[0],
      lanes,
      items,
      dependencies: dependencyRows.map((row) => ({
        id: Number(row.id),
        from_item_id: `operation-${row.from_item_id}`,
        to_item_id: `operation-${row.to_item_id}`,
        type: row.lag_type ?? 'FIXED',
        label: row.constraint_name ?? row.lag_type ?? '依赖',
      })),
      conflicts,
      window_start: from,
      window_end: to,
    });
  } catch (error) {
    console.error('Error fetching platform project timeline:', error);
    res.status(500).json({ error: 'Failed to fetch platform project timeline' });
  }
};

export const updatePlatformOperation = async (req: Request, res: Response) => {
  try {
    const operationPlanId = Number(req.params.operationPlanId);
    const plannedStart = toSqlDateTime(req.body.planned_start_datetime);
    const plannedEnd = toSqlDateTime(req.body.planned_end_datetime);
    const notes = req.body.notes;

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, planned_start_datetime, planned_end_datetime, notes
       FROM batch_operation_plans
       WHERE id = ?
       LIMIT 1`,
      [operationPlanId],
    );

    if (!existingRows.length) {
      return res.status(404).json({ error: 'Operation plan not found' });
    }

    const current = existingRows[0];
    const nextStart = plannedStart ?? current.planned_start_datetime;
    const nextEnd = plannedEnd ?? current.planned_end_datetime;

    if (new Date(nextStart).getTime() >= new Date(nextEnd).getTime()) {
      return res.status(400).json({ error: 'planned_start_datetime must be earlier than planned_end_datetime' });
    }

    await pool.execute(
      `UPDATE batch_operation_plans
       SET
         planned_start_datetime = ?,
         planned_end_datetime = ?,
         planned_duration = ROUND(TIMESTAMPDIFF(MINUTE, ?, ?) / 60, 2),
         notes = ?
       WHERE id = ?`,
      [nextStart, nextEnd, nextStart, nextEnd, notes ?? current.notes ?? null, operationPlanId],
    );

    res.json({ message: 'Operation plan updated successfully' });
  } catch (error) {
    console.error('Error updating platform operation:', error);
    res.status(500).json({ error: 'Failed to update operation plan' });
  }
};

export const updatePlatformOperationResourceBinding = async (req: Request, res: Response) => {
  const operationPlanId = Number(req.params.operationPlanId);

  try {
    const {
      resource_type,
      required_count,
      candidate_resource_ids,
      prep_minutes,
      changeover_minutes,
      cleanup_minutes,
      is_mandatory,
      requires_exclusive_use,
    } = req.body;

    if (!resource_type) {
      return res.status(400).json({ error: 'resource_type is required' });
    }

    const [operationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT operation_id
       FROM batch_operation_plans
       WHERE id = ?
       LIMIT 1`,
      [operationPlanId],
    );

    if (!operationRows.length) {
      return res.status(404).json({ error: 'Operation plan not found' });
    }

    const operationId = Number(operationRows[0].operation_id);
    const candidateResourceIds = toCandidateResourceIds(candidate_resource_ids);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (runtimeSnapshotReadEnabled()) {
        await upsertBatchOperationRule(connection, operationPlanId, {
          resource_type,
          required_count,
          candidate_resource_ids: candidateResourceIds,
          prep_minutes,
          changeover_minutes,
          cleanup_minutes,
          is_mandatory,
          requires_exclusive_use,
        });
        await connection.commit();

        return res.json({ message: 'Batch operation resource binding updated successfully' });
      }

      const validation = await validateCandidateResources(connection, candidateResourceIds, resource_type);
      if (!validation.valid) {
        await connection.rollback();
        return res.status(400).json({ error: validation.message });
      }

      const [existingRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM operation_resource_requirements
         WHERE operation_id = ?
           AND resource_type = ?
         LIMIT 1`,
        [operationId, resource_type],
      );

      let requirementId: number;

      if (existingRows.length) {
        requirementId = Number(existingRows[0].id);
        await connection.execute(
          `UPDATE operation_resource_requirements
           SET
             required_count = ?,
             is_mandatory = ?,
             requires_exclusive_use = ?,
             prep_minutes = ?,
             changeover_minutes = ?,
             cleanup_minutes = ?
           WHERE id = ?`,
          [
            required_count ?? 1,
            is_mandatory === false ? 0 : 1,
            requires_exclusive_use === false ? 0 : 1,
            prep_minutes ?? 0,
            changeover_minutes ?? 0,
            cleanup_minutes ?? 0,
            requirementId,
          ],
        );
      } else {
        const [insertResult] = await connection.execute<RowDataPacket[] & { insertId?: number }>(
          `INSERT INTO operation_resource_requirements (
            operation_id, resource_type, required_count, is_mandatory, requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            operationId,
            resource_type,
            required_count ?? 1,
            is_mandatory === false ? 0 : 1,
            requires_exclusive_use === false ? 0 : 1,
            prep_minutes ?? 0,
            changeover_minutes ?? 0,
            cleanup_minutes ?? 0,
          ],
        );
        requirementId = Number((insertResult as unknown as { insertId: number }).insertId);
      }

      await replaceCandidateMappings(connection, requirementId, candidateResourceIds);
      await connection.commit();

      res.json({ message: 'Operation resource binding updated successfully', requirement_id: requirementId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating platform operation resource binding:', error);
    res.status(500).json({ error: 'Failed to update operation resource binding' });
  }
};

export const getPlatformConflicts = async (req: Request, res: Response) => {
  try {
    const rows = await loadPlatformConflicts({
      projectKey: typeof req.query.project_key === 'string' ? req.query.project_key : undefined,
      domainCode: typeof req.query.domain_code === 'string' ? req.query.domain_code : undefined,
      conflictType: typeof req.query.conflict_type === 'string' ? req.query.conflict_type : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
      from: toSqlDateTime(typeof req.query.from === 'string' ? req.query.from : undefined, '1970-01-01 00:00:00'),
      to: toSqlDateTime(typeof req.query.to === 'string' ? req.query.to : undefined, '2999-12-31 23:59:59'),
      limit: Number(req.query.limit ?? 20),
    });

    res.json(rows);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json([]);
    }

    console.error('Error fetching platform conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch platform conflicts' });
  }
};

export const getPlatformConflictById = async (req: Request, res: Response) => {
  try {
    const detail = await loadConflictDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'Conflict not found' });
    }

    res.json(detail);
  } catch (error) {
    console.error('Error fetching platform conflict detail:', error);
    res.status(500).json({ error: 'Failed to fetch platform conflict detail' });
  }
};

export const getPlatformResourceTimeline = async (req: Request, res: Response) => {
  try {
    const from = toSqlDateTime(typeof req.query.from === 'string' ? req.query.from : undefined, '1970-01-01 00:00:00')!;
    const to = toSqlDateTime(typeof req.query.to === 'string' ? req.query.to : undefined, '2999-12-31 23:59:59')!;
    const resourceType = typeof req.query.resource_type === 'string' ? req.query.resource_type : undefined;
    const departmentCode = typeof req.query.department_code === 'string' ? req.query.department_code : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const conflictOnly = toBoolean(req.query.conflict_only);
    const resourceId = req.query.resource_id ? Number(req.query.resource_id) : undefined;

    const filters: string[] = [];
    const params: unknown[] = [];
    if (resourceType) {
      filters.push('r.resource_type = ?');
      params.push(resourceType);
    }
    if (departmentCode) {
      filters.push('r.department_code = ?');
      params.push(departmentCode);
    }
    if (status) {
      filters.push('r.status = ?');
      params.push(status);
    }
    if (resourceId) {
      filters.push('r.id = ?');
      params.push(resourceId);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [resourceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*
       FROM resources r
       ${whereClause}
       ORDER BY r.department_code, r.resource_type, r.resource_name`,
      params,
    );

    const selectedIds = resourceRows.map((row) => Number(row.id));
    if (!selectedIds.length) {
      return res.json({ resources: [], lanes: [], items: [], conflicts: [], window_start: from, window_end: to });
    }

    const placeholders = selectedIds.map(() => '?').join(', ');
    const [calendarRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          rc.id,
          rc.resource_id,
          rc.start_datetime,
          rc.end_datetime,
          rc.event_type,
          rc.source_type,
          rc.source_id,
          rc.notes
       FROM resource_calendars rc
       WHERE rc.resource_id IN (${placeholders})
         AND rc.end_datetime >= ?
         AND rc.start_datetime <= ?`,
      [...selectedIds, from, to],
    );

    const [maintenanceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          mw.id,
          mw.resource_id,
          mw.start_datetime,
          mw.end_datetime,
          mw.window_type,
          mw.is_hard_block,
          mw.notes
       FROM maintenance_windows mw
       WHERE mw.resource_id IN (${placeholders})
         AND mw.end_datetime >= ?
         AND mw.start_datetime <= ?`,
      [...selectedIds, from, to],
    );

    const [assignmentRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        ra.id,
        ra.resource_id,
        ra.start_datetime,
        ra.end_datetime,
        ra.batch_operation_plan_id,
        ra.notes,
        pbp.batch_code,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        o.operation_code,
        o.operation_name
      FROM resource_assignments ra
      LEFT JOIN batch_operation_plans bop ON bop.id = ra.batch_operation_plan_id
      LEFT JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      LEFT JOIN operations o ON o.id = bop.operation_id
      WHERE ra.resource_id IN (${placeholders})
        AND ra.assignment_status <> 'CANCELLED'
        AND ra.end_datetime >= ?
        AND ra.start_datetime <= ?`,
      [...selectedIds, from, to]);

    const conflictRows = await loadPlatformConflicts({
      domainCode: departmentCode,
      conflictType: 'RESOURCE_CONFLICT',
      from,
      to,
      limit: 200,
    });
    const conflictedResourceIds = new Set(
      conflictRows
        .map((row) => row.resource_id)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    );

    const resources: Array<RowDataPacket & {
      id: number;
      resource_code: string;
      resource_name: string;
      resource_type: string;
      department_code: string;
      capacity: number;
      is_shared: boolean;
      is_schedulable: boolean;
    }> = resourceRows
      .filter((row) => !conflictOnly || conflictedResourceIds.has(Number(row.id)))
      .map((row) => ({
        ...row,
        id: Number(row.id),
        resource_code: String(row.resource_code),
        resource_name: String(row.resource_name),
        resource_type: String(row.resource_type),
        department_code: String(row.department_code),
        capacity: Number(row.capacity ?? 0),
        is_shared: toBoolean(row.is_shared),
        is_schedulable: toBoolean(row.is_schedulable),
      }));

    const visibleIds = new Set(resources.map((row) => row.id));
    const lanes = resources.map((row) => ({
      id: `resource-${row.id}`,
      label: `${row.resource_code} / ${row.resource_name}`,
      group_label: row.department_code,
      domain_code: row.department_code,
      lane_type: row.resource_type,
    }));

    const items = [
      ...calendarRows
        .filter((row) => visibleIds.has(Number(row.resource_id)))
        .map((row) => ({
          id: `calendar-${row.id}`,
          lane_id: `resource-${row.resource_id}`,
          item_type: 'RESOURCE_EVENT',
          title: row.event_type,
          subtitle: row.notes ?? row.source_type,
          start_datetime: row.start_datetime,
          end_datetime: row.end_datetime,
          color: row.event_type === 'LOCKED' ? '#fa8c16' : row.event_type === 'CHANGEOVER' ? '#722ed1' : '#1677ff',
          status: row.source_type,
          metadata: {
            resourceId: Number(row.resource_id),
            eventId: Number(row.id),
            eventType: row.event_type,
            sourceType: row.source_type,
            sourceId: row.source_id ? Number(row.source_id) : null,
            notes: row.notes ?? null,
          },
        })),
      ...maintenanceRows
        .filter((row) => visibleIds.has(Number(row.resource_id)))
        .map((row) => ({
          id: `maintenance-${row.id}`,
          lane_id: `resource-${row.resource_id}`,
          item_type: 'MAINTENANCE',
          title: row.window_type,
          subtitle: row.notes ?? (toBoolean(row.is_hard_block) ? '硬阻断' : '提示'),
          start_datetime: row.start_datetime,
          end_datetime: row.end_datetime,
          color: toBoolean(row.is_hard_block) ? '#cf1322' : '#d48806',
          status: toBoolean(row.is_hard_block) ? 'HARD_BLOCK' : 'WARNING',
          metadata: {
            resourceId: Number(row.resource_id),
            maintenanceWindowId: Number(row.id),
            windowType: row.window_type,
            isHardBlock: toBoolean(row.is_hard_block),
            notes: row.notes ?? null,
          },
        })),
      ...assignmentRows
        .filter((row) => visibleIds.has(Number(row.resource_id)))
        .map((row) => ({
          id: `assignment-${row.id}`,
          lane_id: `resource-${row.resource_id}`,
          item_type: 'ASSIGNMENT',
          title: row.operation_name ?? '排产占用',
          subtitle: [row.project_code, row.batch_code, row.operation_code].filter(Boolean).join(' / '),
          start_datetime: row.start_datetime,
          end_datetime: row.end_datetime,
          color: '#52c41a',
          status: 'SCHEDULING',
          metadata: {
            resourceId: Number(row.resource_id),
            assignmentId: Number(row.id),
            projectCode: row.project_code ?? null,
            batchCode: row.batch_code ?? null,
            operationCode: row.operation_code ?? null,
            operationName: row.operation_name ?? null,
            notes: row.notes ?? null,
          },
        })),
    ].sort((left, right) => new Date(left.start_datetime).getTime() - new Date(right.start_datetime).getTime());

    res.json({
      resources,
      lanes,
      items,
      conflicts: conflictRows.filter((row) => !row.resource_id || visibleIds.has(Number(row.resource_id))),
      window_start: from,
      window_end: to,
    });
  } catch (error) {
    console.error('Error fetching platform resource timeline:', error);
    res.status(500).json({ error: 'Failed to fetch resource timeline' });
  }
};

export const getPlatformMaintenanceImpact = async (req: Request, res: Response) => {
  try {
    const resourceId = Number(req.query.resource_id);
    const from = toSqlDateTime(typeof req.query.from === 'string' ? req.query.from : undefined, '1970-01-01 00:00:00')!;
    const to = toSqlDateTime(typeof req.query.to === 'string' ? req.query.to : undefined, '2999-12-31 23:59:59')!;

    if (!resourceId) {
      return res.status(400).json({ error: 'resource_id is required' });
    }

    const [operationRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        ra.id AS resource_assignment_id,
        bop.id AS operation_plan_id,
        pbp.id AS batch_id,
        pbp.batch_code,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        o.operation_code,
        o.operation_name,
        ra.start_datetime,
        ra.end_datetime
      FROM resource_assignments ra
      LEFT JOIN batch_operation_plans bop ON bop.id = ra.batch_operation_plan_id
      LEFT JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      LEFT JOIN operations o ON o.id = bop.operation_id
      WHERE ra.resource_id = ?
        AND ra.assignment_status <> 'CANCELLED'
        AND ra.end_datetime >= ?
        AND ra.start_datetime <= ?`,
      [resourceId, from, to],
    );

    const [calendarRows] = await pool.execute<RowDataPacket[]>(`
      SELECT id, event_type, source_type, start_datetime, end_datetime, notes
      FROM resource_calendars
      WHERE resource_id = ?
        AND end_datetime >= ?
        AND start_datetime <= ?`,
      [resourceId, from, to],
    );

    const projectMap = new Map<string, { project_code: string }>();
    const batchMap = new Map<number, { id: number; batch_code: string }>();

    operationRows.forEach((row) => {
      if (row.project_code) {
        projectMap.set(String(row.project_code), { project_code: String(row.project_code) });
      }
      if (row.batch_id) {
        batchMap.set(Number(row.batch_id), { id: Number(row.batch_id), batch_code: String(row.batch_code) });
      }
    });

    res.json({
      affected_projects: Array.from(projectMap.values()),
      affected_batches: Array.from(batchMap.values()),
      affected_operations: operationRows.map((row) => ({
        operation_plan_id: Number(row.operation_plan_id),
        operation_code: row.operation_code,
        operation_name: row.operation_name,
        batch_code: row.batch_code,
        project_code: row.project_code,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
      })),
      affected_resources: [{ resource_id: resourceId, overlapping_events: calendarRows.length + operationRows.length }],
    });
  } catch (error) {
    console.error('Error fetching maintenance impact:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance impact' });
  }
};

export const getPlatformBusinessRulesCoverage = async (_req: Request, res: Response) => {
  try {
    const readiness = await loadReadiness();

    const [missingRuleRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        bop.id AS operation_plan_id,
        bop.operation_id,
        o.operation_code,
        o.operation_name,
        pbp.batch_code,
        COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
        ${domainFromProjectSql('pp', 'ou')} AS domain_code
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      JOIN operations o ON o.id = bop.operation_id
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
      WHERE pbp.plan_status <> 'CANCELLED'
        AND orr.id IS NULL
      ORDER BY bop.planned_start_datetime
      LIMIT 120
    `);

    const [missingBindingRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        orr.id AS requirement_id,
        orr.operation_id,
        o.operation_code,
        o.operation_name,
        orr.resource_type,
        orr.required_count
      FROM operation_resource_requirements orr
      JOIN operations o ON o.id = orr.operation_id
      LEFT JOIN operation_resource_candidates orc ON orc.requirement_id = orr.id
      WHERE orc.id IS NULL
      ORDER BY o.operation_name, orr.resource_type
      LIMIT 120
    `);

    const [mismatchRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        orr.id AS requirement_id,
        orr.operation_id,
        o.operation_code,
        o.operation_name,
        orr.resource_type,
        GROUP_CONCAT(DISTINCT r.resource_type ORDER BY r.resource_type) AS candidate_resource_types
      FROM operation_resource_requirements orr
      JOIN operations o ON o.id = orr.operation_id
      JOIN operation_resource_candidates orc ON orc.requirement_id = orr.id
      JOIN resources r ON r.id = orc.resource_id
      WHERE r.resource_type <> orr.resource_type
      GROUP BY orr.id, orr.operation_id, o.operation_code, o.operation_name, orr.resource_type
      ORDER BY o.operation_name
      LIMIT 120
    `);

    res.json({
      coverage_by_domain: readiness,
      missing_rule_operations: missingRuleRows.map((row) => ({
        operation_plan_id: Number(row.operation_plan_id),
        operation_id: Number(row.operation_id),
        operation_code: row.operation_code,
        operation_name: row.operation_name,
        batch_code: row.batch_code,
        project_code: row.project_code,
        domain_code: row.domain_code,
      })),
      missing_candidate_bindings: missingBindingRows.map((row) => ({
        requirement_id: Number(row.requirement_id),
        operation_id: Number(row.operation_id),
        operation_code: row.operation_code,
        operation_name: row.operation_name,
        resource_type: row.resource_type,
        required_count: Number(row.required_count ?? 0),
      })),
      mismatched_candidates: mismatchRows.map((row) => ({
        requirement_id: Number(row.requirement_id),
        operation_id: Number(row.operation_id),
        operation_code: row.operation_code,
        operation_name: row.operation_name,
        resource_type: row.resource_type,
        candidate_resource_types: row.candidate_resource_types ? String(row.candidate_resource_types).split(',') : [],
      })),
    });
  } catch (error) {
    console.error('Error fetching business rules coverage:', error);
    res.status(500).json({ error: 'Failed to fetch business rules coverage' });
  }
};

export const getPlatformRunDetail = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const [runRows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM scheduling_runs
       WHERE id = ?
       LIMIT 1`,
      [runId],
    );

    if (!runRows.length) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const run = runRows[0];
    const targetBatchIds = parseJson<number[]>(run.target_batch_ids) ?? [];
    const [eventRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, event_key, stage, status, message, metadata, created_at
       FROM scheduling_run_events
       WHERE run_id = ?
       ORDER BY created_at DESC`,
      [runId],
    );

    let relatedProjects: Array<Record<string, unknown>> = [];
    if (targetBatchIds.length) {
      const placeholders = targetBatchIds.map(() => '?').join(', ');
      const [projectRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            pbp.id AS batch_id,
            pbp.batch_code,
            COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code
         FROM production_batch_plans pbp
         WHERE pbp.id IN (${placeholders})`,
        targetBatchIds,
      );

      const projectMap = new Map<string, { project_code: string; batches: string[] }>();
      projectRows.forEach((row) => {
        const projectCode = String(row.project_code);
        const current = projectMap.get(projectCode) ?? { project_code: projectCode, batches: [] };
        current.batches.push(String(row.batch_code));
        projectMap.set(projectCode, current);
      });
      relatedProjects = Array.from(projectMap.values());
    }

    const runWindowStart = toSqlDateTime(run.window_start ?? run.period_start, '1970-01-01 00:00:00');
    const runWindowEnd = toSqlDateTime(run.window_end ?? run.period_end, '2999-12-31 23:59:59');
    const relatedConflicts = await loadPlatformConflicts({
      from: runWindowStart,
      to: runWindowEnd,
      limit: 12,
    });

    res.json({
      id: Number(run.id),
      run_code: run.run_code,
      status: run.status,
      stage: run.stage,
      created_at: run.created_at,
      completed_at: run.completed_at,
      window_start: run.window_start ?? run.period_start,
      window_end: run.window_end ?? run.period_end,
      solver_summary: parseJson(run.summary_json) ?? parseJson(run.result_summary),
      apply_summary: parseJson(run.metrics_summary_json),
      warnings: parseJson<string[]>(run.warnings_json) ?? [],
      error_message: run.error_message ?? null,
      target_batch_ids: targetBatchIds,
      related_projects: relatedProjects,
      related_conflicts: relatedConflicts,
      events: eventRows.map((row) => ({
        id: Number(row.id),
        event_key: row.event_key,
        stage: row.stage,
        status: row.status,
        message: row.message,
        metadata: parseJson(row.metadata),
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching platform run detail:', error);
    res.status(500).json({ error: 'Failed to fetch platform run detail' });
  }
};
