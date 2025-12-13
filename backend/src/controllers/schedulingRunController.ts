import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import SchedulingPersistenceService, {
  SchedulingPersistenceError,
  SolverResult,
} from '../services/schedulingPersistenceService';
import solverProgressService, { SolverProgress } from '../services/solverProgressService';

const SOLVER_BASE_URL = process.env.SOLVER_BASE_URL || 'http://localhost:5005';

interface SchedulingRunEventRow extends RowDataPacket {
  id: number;
  run_id: number;
  event_key: string;
  stage: string;
  status: string;
  message: string | null;
  metadata: string | null;
  created_at: string;
}

const safeParseJSON = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  // If already an object (MySQL JSON column auto-parsed), return as-is
  if (typeof value === 'object') {
    return value;
  }
  // If string, try to parse
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

export const listSchedulingRuns = async (req: Request, res: Response) => {
  try {
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

    const [runRows] = await pool.query<RowDataPacket[]>(
      `SELECT id,
              run_key,
              trigger_type,
              status,
              period_start,
              period_end,
              options_json,
              summary_json,
              warnings_json,
              created_by,
              created_at,
              updated_at,
              completed_at
         FROM scheduling_runs
        ORDER BY id DESC
        LIMIT ${limit}`,
    );

    const runIds = runRows.map((row) => Number(row.id));
    const batchMap = new Map<
      number,
      { ids: number[]; windowStart?: string | null; windowEnd?: string | null }
    >();

    if (runIds.length) {
      const placeholders = runIds.map(() => '?').join(',');
      const [batchRows] = await pool.execute<RowDataPacket[]>(
        `SELECT run_id,
                batch_plan_id,
                window_start,
                window_end
           FROM scheduling_run_batches
          WHERE run_id IN (${placeholders})`,
        runIds,
      );
      batchRows.forEach((row) => {
        const runId = Number(row.run_id);
        const entry = batchMap.get(runId) || { ids: [], windowStart: null, windowEnd: null };
        const batchId = Number(row.batch_plan_id);
        if (Number.isFinite(batchId)) {
          entry.ids.push(batchId);
        }
        const start = row.window_start as string | null;
        const end = row.window_end as string | null;
        if (start && (!entry.windowStart || start < entry.windowStart)) {
          entry.windowStart = start;
        }
        if (end && (!entry.windowEnd || end > entry.windowEnd)) {
          entry.windowEnd = end;
        }
        batchMap.set(runId, entry);
      });
    }

    const mapped = runRows.map((row) => {
      const options = safeParseJSON(row.options_json);
      const summary = safeParseJSON(row.summary_json);
      const warnings = safeParseJSON(row.warnings_json);
      const batchInfo = batchMap.get(Number(row.id));
      const solverTimeLimit = options?.solverTimeLimit
        ?? options?.solver_time_limit
        ?? summary?.solverTimeLimit
        ?? null;
      const stage = summary?.stage || row.status;

      return {
        id: row.id,
        run_code: row.run_key,
        trigger_type: row.trigger_type,
        stage,
        status: row.status,
        window_start: batchInfo?.windowStart || null,
        window_end: batchInfo?.windowEnd || null,
        target_batch_ids: batchInfo?.ids || [],
        solver_time_limit: solverTimeLimit ? Number(solverTimeLimit) : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        completed_at: row.completed_at,
        metadata: {
          options,
          summary,
          warnings,
          createdBy: row.created_by,
          batchCount: batchInfo?.ids?.length || 0,
          period: {
            start: row.period_start,
            end: row.period_end,
          },
        },
      };
    });

    res.json(mapped);
  } catch (error) {
    console.error('Failed to load scheduling runs:', error);
    res.status(500).json({ error: '无法获取排班任务列表' });
  }
};

export const listSchedulingRunEvents = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const [runRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM scheduling_runs WHERE id = ? LIMIT 1',
      [runId],
    );
    if (!Array.isArray(runRows) || runRows.length === 0) {
      res.status(404).json({ error: '排班任务不存在' });
      return;
    }

    const [rows] = await pool.execute<SchedulingRunEventRow[]>(
      `SELECT id,
              run_id,
              event_key,
              stage,
              status,
              message,
              metadata,
              created_at
         FROM scheduling_run_events
        WHERE run_id = ?
        ORDER BY id ASC`,
      [runId],
    );

    const mapped = rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      event_key: row.event_key,
      stage: row.stage,
      status: row.status,
      message: row.message,
      metadata: safeParseJSON(row.metadata),
      created_at: row.created_at,
    }));

    res.json(mapped);
  } catch (error) {
    console.error(`Failed to load scheduling run events for run ${runId}:`, error);
    res.status(500).json({ error: '无法获取排班事件日志' });
  }
};

/**
 * Create a new scheduling run
 * POST /api/scheduling-runs
 */
export const createSchedulingRun = async (req: Request, res: Response) => {
  try {
    const { periodStart, periodEnd, batchIds, options, triggerType } = req.body;

    if (!periodStart || !periodEnd) {
      res.status(400).json({ error: '缺少必填参数: periodStart, periodEnd' });
      return;
    }

    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      res.status(400).json({ error: '至少需要选择一个批次' });
      return;
    }

    const result = await SchedulingPersistenceService.createRun({
      triggerType: triggerType || 'AUTO_PLAN',
      periodStart,
      periodEnd,
      batchIds,
      options,
      createdBy: (req as any).user?.id ?? null,
    });

    res.status(201).json({
      runId: result.runId,
      runKey: result.runKey,
      message: '排班任务已创建',
    });
  } catch (error) {
    console.error('Failed to create scheduling run:', error);
    res.status(500).json({ error: '创建排班任务失败' });
  }
};

/**
 * Get a scheduling run by ID
 * GET /api/scheduling-runs/:runId
 */
export const getSchedulingRunById = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const run = await SchedulingPersistenceService.getRunById(runId);
    if (!run) {
      res.status(404).json({ error: '排班任务不存在' });
      return;
    }

    // Also get batches
    const [batchRows] = await pool.execute<RowDataPacket[]>(
      `SELECT batch_plan_id, batch_code, window_start, window_end, total_operations
       FROM scheduling_run_batches WHERE run_id = ?`,
      [runId],
    );

    res.json({
      ...run,
      batches: batchRows,
    });
  } catch (error) {
    console.error(`Failed to get scheduling run ${runId}:`, error);
    res.status(500).json({ error: '获取排班任务失败' });
  }
};

/**
 * Trigger solver for a scheduling run
 * POST /api/scheduling-runs/:runId/solve
 */
export const triggerSolve = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const run = await SchedulingPersistenceService.getRunById(runId);
    if (!run) {
      res.status(404).json({ error: '排班任务不存在' });
      return;
    }

    // Record planning start event
    await SchedulingPersistenceService.recordEvent(runId, 'PLANNING', 'PROGRESS', '开始调用求解器');

    // Get solver payload from request body
    const solverPayload = req.body;

    if (!solverPayload || !solverPayload.operationDemands || !solverPayload.employeeProfiles) {
      res.status(400).json({ error: '缺少求解器必需的 payload 数据' });
      return;
    }

    // Add requestId
    solverPayload.requestId = `run-${runId}-${Date.now()}`;

    // Call solver API
    const solverResponse = await fetch(`${SOLVER_BASE_URL}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(solverPayload),
    });

    if (!solverResponse.ok) {
      const errorText = await solverResponse.text();
      throw new Error(`Solver API error: ${solverResponse.status} - ${errorText}`);
    }

    const solverResult = (await solverResponse.json()) as SolverResult;

    // Store the result
    await SchedulingPersistenceService.storeResult(
      runId,
      solverResult,
      (req as any).user?.id ?? null,
    );

    // Record completion event
    await SchedulingPersistenceService.recordEvent(
      runId,
      'PLANNING',
      solverResult.status === 'COMPLETED' || solverResult.status === 'RUNNING' ? 'SUCCESS' : 'ERROR',
      solverResult.summary || '求解完成',
      {
        status: solverResult.status,
        assignmentsCount: solverResult.details?.assignments?.length || 0,
        shiftPlansCount: solverResult.details?.shiftPlans?.length || 0,
      },
    );

    res.json({
      runId,
      status: solverResult.status,
      summary: solverResult.summary,
      assignmentsCount: solverResult.details?.assignments?.length || 0,
      shiftPlansCount: solverResult.details?.shiftPlans?.length || 0,
      skippedCount: solverResult.details?.skippedOperations?.length || 0,
    });
  } catch (error) {
    console.error(`Failed to trigger solve for run ${runId}:`, error);

    // Record failure
    try {
      await SchedulingPersistenceService.recordEvent(
        runId,
        'PLANNING',
        'ERROR',
        `求解失败: ${(error as Error).message}`,
      );
      await SchedulingPersistenceService.updateRunStatus(runId, 'FAILED');
    } catch {
      // Ignore secondary errors
    }

    res.status(500).json({ error: `求解失败: ${(error as Error).message}` });
  }
};

/**
 * Get stored result for a scheduling run
 * GET /api/scheduling-runs/:runId/result
 */
export const getSchedulingResult = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const result = await SchedulingPersistenceService.getStoredResult(runId);
    if (!result) {
      res.status(404).json({ error: '未找到排班结果' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error(`Failed to get result for run ${runId}:`, error);
    res.status(500).json({ error: '获取排班结果失败' });
  }
};

/**
 * Apply scheduling result to production tables
 * POST /api/scheduling-runs/:runId/apply
 */
export const applySchedulingResult = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const run = await SchedulingPersistenceService.getRunById(runId);
    if (!run) {
      res.status(404).json({ error: '排班任务不存在' });
      return;
    }

    if (run.status === 'PUBLISHED') {
      res.status(409).json({ error: '排班结果已应用，不可重复应用' });
      return;
    }

    const result = await SchedulingPersistenceService.applyResult(runId);

    res.json({
      runId,
      message: '排班结果已成功应用',
      ...result,
    });
  } catch (error) {
    console.error(`Failed to apply result for run ${runId}:`, error);

    if (error instanceof SchedulingPersistenceError) {
      res.status(400).json({ error: error.message, code: error.code, details: error.details });
      return;
    }

    res.status(500).json({ error: `应用排班结果失败: ${(error as Error).message}` });
  }
};

/**
 * Receive progress update from solver and broadcast via WebSocket
 * POST /api/scheduling-runs/:runId/progress
 */
export const receiveProgress = async (req: Request, res: Response) => {
  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: '无效的 runId' });
    return;
  }

  try {
    const progress: SolverProgress = {
      runId,
      stage: req.body.stage || 'SOLVING',
      progress: req.body.progress || 0,
      objective: req.body.objective,
      elapsed: req.body.elapsed,
      message: req.body.message,
      solutionsFound: req.body.solutionsFound,
    };

    // Broadcast progress to connected WebSocket clients
    solverProgressService.broadcastProgress(progress);

    // Also record as event for persistence
    if (progress.stage === 'COMPLETED' || progress.stage === 'FAILED') {
      await SchedulingPersistenceService.recordEvent(
        runId,
        progress.stage === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        progress.stage === 'COMPLETED' ? 'SUCCESS' : 'ERROR',
        progress.message || (progress.stage === 'COMPLETED' ? '求解完成' : '求解失败'),
        { objective: progress.objective, elapsed: progress.elapsed },
      );
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`Failed to process progress for run ${runId}:`, error);
    res.status(500).json({ error: '处理进度更新失败' });
  }
};
