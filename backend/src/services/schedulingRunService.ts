import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';
import type {
  SchedulingRun,
  SchedulingRunBatch,
  SchedulingResultRecord,
  SchedulingResultDiffRecord,
  SchedulingRunEventRecord,
  SchedulingRunStage,
  SchedulingRunEventStatus,
} from '../models/types';

export interface DraftRunOptions {
  triggerType?: 'AUTO_PLAN' | 'RETRY' | 'MANUAL';
  periodStart: string;
  periodEnd: string;
  options?: any;
  summary?: any;
  warnings?: string[];
  batches: Array<{
    batchPlanId: number;
    batchCode: string;
    windowStart?: string | null;
    windowEnd?: string | null;
    totalOperations: number;
  }>;
  assignmentsPayload: any;
  coveragePayload?: any;
  metricsSummary?: any;
  heuristicSummary?: any;
  metricsPayload?: any;
  hotspotsPayload?: any;
  logsPayload?: any;
  operatorId?: number | null;
}

export interface RunPublishContext {
  run: SchedulingRun;
  batches: SchedulingRunBatch[];
  result: SchedulingResultRecord;
}

interface RunEventInsertInput {
  stage: SchedulingRunStage;
  status?: SchedulingRunEventStatus;
  message?: string | null;
  metadata?: any;
  eventKey?: string;
  connection?: PoolConnection | null;
}

function normalizeDateTimeForMySQL(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD HH:mm:ss');
  }

  const cleaned = value.replace('T', ' ').replace('Z', '');
  const [head] = cleaned.split('.');
  return head.trim() || null;
}

function mapRunEventRow(row: RowDataPacket): SchedulingRunEventRecord {
  return {
    id: Number(row.id),
    run_id: Number(row.run_id),
    event_key: String(row.event_key),
    stage: row.stage as SchedulingRunStage,
    status: row.status as SchedulingRunEventStatus,
    message: row.message ?? null,
    metadata: row.metadata ? parseJsonField<any>(row.metadata) : undefined,
    created_at: row.created_at ? dayjs(row.created_at).toISOString() : undefined,
  };
}

function parseJsonField<T>(value: any): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      return undefined;
    }
  }
  return value as T;
}

export async function createDraftRun(draft: DraftRunOptions): Promise<{ runId: number; runKey: string; resultId: number; }>
{
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const runKey = randomUUID();
    const trigger = draft.triggerType ?? 'AUTO_PLAN';
    const warnings = draft.warnings ?? [];

    const [runResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO scheduling_runs
         (run_key, trigger_type, status, period_start, period_end, options_json, summary_json, warnings_json, metrics_summary_json, heuristic_summary_json, created_by)
       VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        runKey,
        trigger,
        draft.periodStart,
        draft.periodEnd,
        draft.options ? JSON.stringify(draft.options) : null,
        draft.summary ? JSON.stringify(draft.summary) : null,
        warnings.length ? JSON.stringify(warnings) : null,
        draft.metricsSummary ? JSON.stringify(draft.metricsSummary) : null,
        draft.heuristicSummary ? JSON.stringify(draft.heuristicSummary) : null,
        draft.operatorId ?? null,
      ],
    );

    const runId = Number(runResult.insertId);

    if (draft.batches?.length) {
      const batchValues = draft.batches.map((batch) => [
        runId,
        batch.batchPlanId,
        batch.batchCode,
        batch.windowStart ?? null,
        batch.windowEnd ?? null,
        batch.totalOperations,
      ]);

      await connection.query(
        `INSERT INTO scheduling_run_batches
           (run_id, batch_plan_id, batch_code, window_start, window_end, total_operations)
         VALUES ?`,
        [batchValues],
      );
    }

    const [resultInsert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO scheduling_results
         (run_id, result_state, version, assignments_payload, coverage_payload, metrics_payload, hotspots_payload, logs_payload, created_by)
       VALUES (?, 'DRAFT', 1, ?, ?, ?, ?, ?, ?)` ,
      [
        runId,
        JSON.stringify(draft.assignmentsPayload ?? {}),
        draft.coveragePayload ? JSON.stringify(draft.coveragePayload) : null,
        draft.metricsPayload ? JSON.stringify(draft.metricsPayload) : null,
        draft.hotspotsPayload ? JSON.stringify(draft.hotspotsPayload) : null,
        draft.logsPayload ? JSON.stringify(draft.logsPayload) : null,
        draft.operatorId ?? null,
      ],
    );

    await addRunEvent(runId, {
      connection,
      stage: 'QUEUED',
      status: 'PROGRESS',
      message: 'Scheduling run drafted and queued.',
      metadata: {
        trigger,
      },
    });

    await connection.commit();

    return {
      runId,
      runKey,
      resultId: Number(resultInsert.insertId),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addRunEvent(
  runId: number,
  input: RunEventInsertInput,
): Promise<SchedulingRunEventRecord> {
  const executor = input.connection ?? pool;
  const eventKey = input.eventKey ?? randomUUID();
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO scheduling_run_events
       (run_id, event_key, stage, status, message, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      runId,
      eventKey,
      input.stage,
      input.status ?? 'INFO',
      input.message ?? null,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
    ],
  );

  const insertedId = Number(result.insertId);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT *
       FROM scheduling_run_events
      WHERE id = ?`,
    [insertedId],
  );

  if (!rows.length) {
    return {
      id: insertedId,
      run_id: runId,
      event_key: eventKey,
      stage: input.stage,
      status: input.status ?? 'INFO',
      message: input.message ?? null,
    };
  }

  return mapRunEventRow(rows[0]);
}

export async function listRunEvents(
  runId: number,
  sinceId?: number,
  limit = 200,
): Promise<SchedulingRunEventRecord[]> {
  const params: Array<number> = [runId];
  let query = `
    SELECT *
      FROM scheduling_run_events
     WHERE run_id = ?
  `;

  if (sinceId !== undefined) {
    query += ' AND id > ?';
    params.push(sinceId);
  }

  const requestedLimit = Number(limit);
  const normalizedLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 1000))
    : 200;

  query += ` ORDER BY id ASC LIMIT ${normalizedLimit}`;

  const [rows] = await pool.execute<RowDataPacket[]>(query, params);
  return rows.map(mapRunEventRow);
}

export async function loadRunContext(runId: number): Promise<RunPublishContext | null> {
  const [runRows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM scheduling_runs WHERE id = ? LIMIT 1`,
    [runId],
  );
  if (!runRows.length) {
    return null;
  }

  const runRow = runRows[0];
  const run: SchedulingRun = {
    id: Number(runRow.id),
    run_key: String(runRow.run_key),
    trigger_type: runRow.trigger_type,
    status: runRow.status,
    period_start: dayjs(runRow.period_start).format('YYYY-MM-DD'),
    period_end: dayjs(runRow.period_end).format('YYYY-MM-DD'),
    options_json: parseJsonField(runRow.options_json),
    summary_json: parseJsonField(runRow.summary_json),
    warnings_json: parseJsonField(runRow.warnings_json),
    metrics_summary_json: parseJsonField(runRow.metrics_summary_json),
    heuristic_summary_json: parseJsonField(runRow.heuristic_summary_json),
    created_by: runRow.created_by ? Number(runRow.created_by) : null,
    created_at: runRow.created_at ? dayjs(runRow.created_at).toISOString() : undefined,
    updated_at: runRow.updated_at ? dayjs(runRow.updated_at).toISOString() : undefined,
    completed_at: runRow.completed_at ? dayjs(runRow.completed_at).toISOString() : undefined,
  };

  const [batchRows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM scheduling_run_batches WHERE run_id = ? ORDER BY id`,
    [runId],
  );

  const batches: SchedulingRunBatch[] = batchRows.map((row) => ({
    id: Number(row.id),
    run_id: Number(row.run_id),
    batch_plan_id: Number(row.batch_plan_id),
    batch_code: String(row.batch_code),
    window_start: row.window_start ? dayjs(row.window_start).toISOString() : null,
    window_end: row.window_end ? dayjs(row.window_end).toISOString() : null,
    total_operations: Number(row.total_operations || 0),
    created_at: row.created_at ? dayjs(row.created_at).toISOString() : undefined,
  }));

  const [resultRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
       FROM scheduling_results
      WHERE run_id = ?
        AND id = (
          SELECT MAX(id)
            FROM scheduling_results
           WHERE run_id = ?
        )`,
    [runId, runId],
  );

  if (!resultRows.length) {
    return {
      run,
      batches,
      result: {
        id: 0,
        run_id: runId,
        result_state: 'DRAFT',
        version: 1,
        assignments_payload: {},
      },
    };
  }

  const resultRow = resultRows[0];
  const result: SchedulingResultRecord = {
    id: Number(resultRow.id),
    run_id: Number(resultRow.run_id),
    result_state: resultRow.result_state,
    version: Number(resultRow.version || 1),
    assignments_payload: parseJsonField(resultRow.assignments_payload) ?? {},
    coverage_payload: parseJsonField(resultRow.coverage_payload),
    metrics_payload: parseJsonField(resultRow.metrics_payload),
    hotspots_payload: parseJsonField(resultRow.hotspots_payload),
    logs_payload: parseJsonField(resultRow.logs_payload),
    created_by: resultRow.created_by ? Number(resultRow.created_by) : null,
    created_at: resultRow.created_at ? dayjs(resultRow.created_at).toISOString() : undefined,
    published_at: resultRow.published_at ? dayjs(resultRow.published_at).toISOString() : undefined,
  };

  return { run, batches, result };
}

export async function markRunStatus(
  runId: number,
  status: SchedulingRun['status'],
  summary?: any,
  warnings?: string[],
  metricsSummary?: any,
  heuristicSummary?: any,
): Promise<void> {
  await pool.execute(
    `UPDATE scheduling_runs
        SET status = ?,
            summary_json = ?,
            warnings_json = ?,
            metrics_summary_json = ?,
            heuristic_summary_json = ?,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = CASE WHEN ? IN ('PUBLISHED', 'FAILED', 'ROLLED_BACK', 'CANCELLED') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?`,
    [
      status,
      summary ? JSON.stringify(summary) : null,
      warnings && warnings.length ? JSON.stringify(warnings) : null,
      metricsSummary ? JSON.stringify(metricsSummary) : null,
      heuristicSummary ? JSON.stringify(heuristicSummary) : null,
      status,
      runId,
    ],
  );
}

export async function updateResultState(
  runId: number,
  state: 'DRAFT' | 'PUBLISHED',
  assignmentsPayload?: any,
  coveragePayload?: any,
  metricsPayload?: any,
  hotspotsPayload?: any,
  logsPayload?: any,
  publishedAt?: string | null,
): Promise<void> {
  const normalizedPublishedAt = normalizeDateTimeForMySQL(publishedAt);

  await pool.execute(
    `UPDATE scheduling_results
        SET result_state = ?,
            assignments_payload = COALESCE(?, assignments_payload),
            coverage_payload = COALESCE(?, coverage_payload),
            metrics_payload = COALESCE(?, metrics_payload),
            hotspots_payload = COALESCE(?, hotspots_payload),
            logs_payload = COALESCE(?, logs_payload),
            published_at = CASE WHEN ? = 'PUBLISHED' THEN COALESCE(?, CURRENT_TIMESTAMP) ELSE published_at END
      WHERE run_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [
      state,
      assignmentsPayload ? JSON.stringify(assignmentsPayload) : null,
      coveragePayload ? JSON.stringify(coveragePayload) : null,
      metricsPayload ? JSON.stringify(metricsPayload) : null,
      hotspotsPayload ? JSON.stringify(hotspotsPayload) : null,
      logsPayload ? JSON.stringify(logsPayload) : null,
      state,
      normalizedPublishedAt,
      runId,
    ],
  );
}

export async function insertResultDiff(diff: Omit<SchedulingResultDiffRecord, 'id' | 'created_at'>): Promise<void> {
  await pool.execute(
    `INSERT INTO scheduling_result_diffs
       (run_id, from_state, to_state, diff_payload)
     VALUES (?, ?, ?, ?)` ,
    [
      diff.run_id,
      diff.from_state,
      diff.to_state,
      JSON.stringify(diff.diff_payload ?? {}),
    ],
  );
}

export async function listRecentRuns(limit = 20): Promise<SchedulingRun[]> {
  const requestedLimit = Number(limit);
  const normalizedLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 200))
    : 20;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM scheduling_runs ORDER BY id DESC LIMIT ${normalizedLimit}`,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    run_key: String(row.run_key),
    trigger_type: row.trigger_type,
    status: row.status,
    period_start: dayjs(row.period_start).format('YYYY-MM-DD'),
    period_end: dayjs(row.period_end).format('YYYY-MM-DD'),
    options_json: parseJsonField(row.options_json),
    summary_json: parseJsonField(row.summary_json),
    warnings_json: parseJsonField(row.warnings_json),
    metrics_summary_json: parseJsonField(row.metrics_summary_json),
    heuristic_summary_json: parseJsonField(row.heuristic_summary_json),
    created_by: row.created_by ? Number(row.created_by) : null,
    created_at: row.created_at ? dayjs(row.created_at).toISOString() : undefined,
    updated_at: row.updated_at ? dayjs(row.updated_at).toISOString() : undefined,
    completed_at: row.completed_at ? dayjs(row.completed_at).toISOString() : undefined,
  }));
}

export async function deleteRun(runId: number): Promise<void> {
  await pool.execute(`DELETE FROM scheduling_runs WHERE id = ?`, [runId]);
}
