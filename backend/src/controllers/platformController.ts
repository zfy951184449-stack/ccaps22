import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';

const normalizeProjectKey = (projectId: string): string => projectId.replace(/^legacy:/, '');

const buildProjectFilterClause = (projectKey?: string): { clause: string; params: string[] } => {
  if (!projectKey) {
    return { clause: '', params: [] };
  }

  return {
    clause: " AND COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) = ?",
    params: [projectKey],
  };
};

export const getPlatformOverview = async (_req: Request, res: Response) => {
  try {
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
    res.json({
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
      recent_runs: runRows,
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
        personnel_conflict_count: Number(personnelConflictRows[0]?.personnel_conflict_count ?? 0),
        maintenance_block_count: 0,
        missing_master_data_count: 0,
        departments: [],
        recent_runs: runRows,
        warnings: [`Platform resource model is not available because table ${extractMissingTableName(error) ?? 'resources'} is missing.`],
      });
    }
    console.error('Error fetching platform overview:', error);
    res.status(500).json({ error: 'Failed to fetch platform overview' });
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
        GROUP_CONCAT(DISTINCT ou.unit_code ORDER BY ou.unit_code) AS department_codes
      FROM production_batch_plans pbp
      LEFT JOIN project_batch_relations pbr ON pbr.batch_plan_id = pbp.id
      LEFT JOIN project_plans pp
        ON pp.id = pbr.project_plan_id
        OR (pp.project_code IS NOT NULL AND pp.project_code = pbp.project_code)
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
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
          GROUP_CONCAT(DISTINCT ou.unit_code ORDER BY ou.unit_code) AS department_codes
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
          SUM(CASE WHEN pbp.plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_batch_count
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
      },
      batches: batchRows,
      operations_summary: {
        total_operations: Number(opsRows[0]?.total_operations ?? 0),
        missing_resource_requirement_count: Number(opsRows[0]?.missing_resource_requirement_count ?? 0),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      const projectKey = normalizeProjectKey(req.params.id);
      const [projectRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            CONCAT('legacy:', COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code)) AS id,
            COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
            COALESCE(NULLIF(pbp.project_code, ''), MAX(pbp.batch_name)) AS project_name,
            MIN(pbp.planned_start_date) AS planned_start_date,
            MAX(COALESCE(pbp.planned_end_date, pbp.planned_start_date)) AS planned_end_date,
            COUNT(*) AS batch_count,
            SUM(CASE WHEN pbp.plan_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_batch_count
         FROM production_batch_plans pbp
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

      return res.json({
        project: {
          ...projectRows[0],
          batch_count: Number(projectRows[0].batch_count ?? 0),
          activated_batch_count: Number(projectRows[0].activated_batch_count ?? 0),
        },
        batches: batchRows,
        operations_summary: {
          total_operations: 0,
          missing_resource_requirement_count: 0,
        },
        warnings: [`Platform resource model is not available because table ${extractMissingTableName(error) ?? 'project_plans'} is missing.`],
      });
    }
    console.error('Error fetching platform project detail:', error);
    res.status(500).json({ error: 'Failed to fetch platform project detail' });
  }
};

export const getPlatformConflicts = async (req: Request, res: Response) => {
  try {
    const projectKey = typeof req.query.project_key === 'string' ? req.query.project_key : undefined;
    const limit = Number(req.query.limit ?? 20);
    const projectFilter = buildProjectFilterClause(projectKey);

    const [missingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('missing-resource-', bop.id) AS id,
          'MISSING_MASTER_DATA' AS conflict_type,
          'HIGH' AS severity,
          CONCAT('操作缺少资源需求定义: ', o.operation_name) AS title,
          ou.unit_code AS department_code,
          COALESCE(NULLIF(pbp.project_code, ''), pbp.batch_code) AS project_code,
          NULL AS resource_name,
          NULL AS employee_name,
          bop.planned_start_datetime AS window_start,
          bop.planned_end_datetime AS window_end,
          CONCAT('Batch ', pbp.batch_code, ' / Operation ', o.operation_code) AS details
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       JOIN operations o ON o.id = bop.operation_id
       LEFT JOIN process_templates pt ON pt.id = pbp.template_id
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       LEFT JOIN operation_resource_requirements orr ON orr.operation_id = bop.operation_id
       WHERE pbp.plan_status = 'ACTIVATED'
         AND orr.id IS NULL
         ${projectFilter.clause}
       ORDER BY bop.planned_start_datetime
       LIMIT ?`,
      [...projectFilter.params, limit],
    );

    const [resourceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('resource-conflict-', rc1.id, '-', rc2.id) AS id,
          'RESOURCE_CONFLICT' AS conflict_type,
          'HIGH' AS severity,
          CONCAT('资源占用冲突: ', r.resource_name) AS title,
          r.department_code,
          NULL AS project_code,
          r.resource_name,
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
       ORDER BY window_start
       LIMIT ?`,
      [limit],
    );

    const [maintenanceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('maintenance-block-', rc.id, '-', mw.id) AS id,
          'MAINTENANCE_BLOCK' AS conflict_type,
          'HIGH' AS severity,
          CONCAT('维护窗口阻断: ', r.resource_name) AS title,
          r.department_code,
          NULL AS project_code,
          r.resource_name,
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
       ORDER BY window_start
       LIMIT ?`,
      [limit],
    );

    const [personnelRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          CONCAT('personnel-conflict-', a1.id, '-', a2.id) AS id,
          'PERSONNEL_CONFLICT' AS conflict_type,
          'MEDIUM' AS severity,
          CONCAT('人员时段冲突: ', e.employee_name) AS title,
          NULL AS department_code,
          NULL AS project_code,
          NULL AS resource_name,
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
       ORDER BY window_start
       LIMIT ?`,
      [limit],
    );

    res.json([...missingRows, ...resourceRows, ...maintenanceRows, ...personnelRows]);
  } catch (error) {
    if (isMissingTableError(error)) {
      const limit = Number(req.query.limit ?? 20);
      const [personnelRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            CONCAT('personnel-conflict-', a1.id, '-', a2.id) AS id,
            'PERSONNEL_CONFLICT' AS conflict_type,
            'MEDIUM' AS severity,
            CONCAT('人员时段冲突: ', e.employee_name) AS title,
            NULL AS department_code,
            NULL AS project_code,
            NULL AS resource_name,
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
         ORDER BY window_start
         LIMIT ?`,
        [limit],
      );

      return res.json(personnelRows);
    }
    console.error('Error fetching platform conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch platform conflicts' });
  }
};
