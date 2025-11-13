import { Request, Response } from 'express';
import dayjs from 'dayjs';
import SchedulingService from '../services/schedulingService';
import * as SchedulingRunService from '../services/schedulingRunService';
import MLSchedulingService from '../services/mlSchedulingService';
import { ComprehensiveWorkTimeAdapter } from '../services/comprehensiveWorkTimeAdapter';
import type { ComprehensivePeriod } from '../services/comprehensiveWorkTimeAdapter';

const buildAutoPlanPayload = (body: any) => {
  const { batchIds, startDate, endDate, options } = body || {};

  const payload = {
    batchIds: Array.isArray(batchIds) ? batchIds.map(Number).filter((id) => !Number.isNaN(id)) : [],
    startDate: startDate ? dayjs(startDate).format('YYYY-MM-DD') : undefined,
    endDate: endDate ? dayjs(endDate).format('YYYY-MM-DD') : undefined,
    options: options || {},
  };

  if (Array.isArray(payload.options.allowedOrgRoles)) {
    const allowed = payload.options.allowedOrgRoles
      .map((role: any) => String(role).toUpperCase().trim())
      .filter((role: string) =>
        ['FRONTLINE', 'SHIFT_LEADER', 'GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER'].includes(role)
      );
    if (allowed.length) {
      payload.options.allowedOrgRoles = Array.from(new Set(allowed));
    } else {
      delete payload.options.allowedOrgRoles;
    }
  }

  return payload;
};

export const autoPlan = async (req: Request, res: Response) => {
  try {
    const payload = buildAutoPlanPayload(req.body);

    if (!payload.batchIds.length) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }

    if (payload.startDate && payload.endDate && dayjs(payload.startDate).isAfter(payload.endDate)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    if (payload.options?.asyncProgress) {
      const result = await SchedulingService.autoPlanAsync(payload);
      return res.status(202).json(result);
    }

    const result = await SchedulingService.autoPlan(payload);
    return res.status(202).json(result);
  } catch (error: any) {
    console.error('Error executing autoPlan:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute scheduling' });
  }
};

export const autoPlanV2 = async (req: Request, res: Response) => {
  try {
    const payload = buildAutoPlanPayload(req.body);

    if (!payload.batchIds.length) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }

    if (payload.startDate && payload.endDate && dayjs(payload.startDate).isAfter(payload.endDate)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    // 新算法暂不支持进度异步推送，统一走同步模式
    const sanitizedPayload = {
      ...payload,
      options: {
        ...payload.options,
        asyncProgress: false,
      },
    };

    const result = await SchedulingService.autoPlanV2(sanitizedPayload);
    return res.status(202).json(result);
  } catch (error: any) {
    console.error('Error executing autoPlanV2:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute scheduling (v2)' });
  }
};

export const workloadSnapshot = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const normalizedStart = dayjs(startDate as string).format('YYYY-MM-DD');
    const normalizedEnd = dayjs(endDate as string).format('YYYY-MM-DD');
    if (dayjs(normalizedStart).isAfter(normalizedEnd)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    const result = await SchedulingService.getWorkloadSnapshot(normalizedStart, normalizedEnd);
    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching workload snapshot:', error);
    return res.status(500).json({ error: error?.message || 'Failed to fetch workload snapshot' });
  }
};

export const recommendForOperation = async (req: Request, res: Response) => {
  try {
    const { operationPlanId } = req.params;
    const numericId = Number(operationPlanId);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'operationPlanId must be a number' });
    }

    const result = await SchedulingService.recommendForOperation(numericId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error getting operation recommendation:', error);
    return res.status(500).json({ error: error?.message || 'Failed to fetch recommendation' });
  }
};

export const retryAutoPlan = async (req: Request, res: Response) => {
  try {
    const { operationPlanId } = req.params;
    const numericId = Number(operationPlanId);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'operationPlanId must be a number' });
    }

    const result = await SchedulingService.retryOperationPlan(numericId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error retrying operation plan:', error);
    return res.status(500).json({ error: error?.message || 'Failed to retry operation plan' });
  }
};

export const exportCoverageGaps = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.query.runId);
    if (Number.isNaN(runId)) {
      return res.status(400).json({ error: 'runId query parameter is required' });
    }

    const result = await SchedulingService.exportCoverageGaps(runId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return res.send(result.csv);
  } catch (error: any) {
    console.error('Error exporting coverage gaps:', error);
    return res.status(500).json({ error: error?.message || 'Failed to export coverage gaps' });
  }
};

export const listRuns = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const runs = await SchedulingService.listRuns(Number.isNaN(limit) ? 20 : limit);
    return res.json(runs);
  } catch (error: any) {
    console.error('Error listing scheduling runs:', error);
    return res.status(500).json({ error: error?.message || 'Failed to list runs' });
  }
};

export const getRun = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    if (Number.isNaN(runId)) {
      return res.status(400).json({ error: 'runId must be a number' });
    }

    const run = await SchedulingService.getRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Scheduling run not found' });
    }

    return res.json(run);
  } catch (error: any) {
    console.error('Error fetching scheduling run:', error);
    return res.status(500).json({ error: error?.message || 'Failed to fetch run' });
  }
};

export const publishRun = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    if (Number.isNaN(runId)) {
      return res.status(400).json({ error: 'runId must be a number' });
    }

    const operatorId = (req as any).user?.id ?? null;
    const result = await SchedulingService.publishRun(runId, operatorId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error publishing scheduling run:', error);
    return res.status(500).json({ error: error?.message || 'Failed to publish run' });
  }
};

export const rollbackRun = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    if (Number.isNaN(runId)) {
      return res.status(400).json({ error: 'runId must be a number' });
    }

    const operatorId = (req as any).user?.id ?? null;
    const result = await SchedulingService.rollbackRun(runId, operatorId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error rolling back scheduling run:', error);
    return res.status(500).json({ error: error?.message || 'Failed to rollback run' });
  }
};


export const getRunEvents = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    if (Number.isNaN(runId)) {
      res.status(400).json({ error: 'runId must be a number' });
      return;
    }

    const sinceIdParam = req.query.sinceId;
    const sinceId = sinceIdParam !== undefined ? Number(sinceIdParam) : undefined;
    if (sinceIdParam !== undefined && Number.isNaN(sinceId)) {
      res.status(400).json({ error: 'sinceId must be a number' });
      return;
    }

    const limitParam = req.query.limit;
    const limit = limitParam !== undefined ? Number(limitParam) : undefined;
    if (limitParam !== undefined && Number.isNaN(limit)) {
      res.status(400).json({ error: 'limit must be a number' });
      return;
    }

    const events = await SchedulingRunService.listRunEvents(
      runId,
      sinceId,
      limit && Number.isFinite(limit) ? limit : undefined,
    );
    res.json(events);
  } catch (error: any) {
    console.error('Error fetching run events:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch run events' });
  }
};

export const streamRunProgress = async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    if (Number.isNaN(runId)) {
      res.status(400).json({ error: 'runId must be a number' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let sinceId: number | undefined;
    let closed = false;
    const flush = async () => {
      if (closed) {
        return;
      }
      const events = await SchedulingRunService.listRunEvents(runId, sinceId);
      if (!events.length) {
        return;
      }
      sinceId = events[events.length - 1].id;
      for (const event of events) {
        res.write(`event: progress\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      if (
        events.some(
          (event) =>
            event.stage === 'COMPLETED' ||
            event.stage === 'FAILED',
        )
      ) {
        cleanup();
      }
    };

    const handleError = (error: any) => {
      console.error('Error streaming scheduling run events:', error);
      cleanup();
    };

    const interval = setInterval(() => {
      flush().catch(handleError);
    }, 1000);

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(interval);
      res.end();
    };

    await flush();

    req.on('close', cleanup);
  } catch (error: any) {
    console.error('Error starting run progress stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Failed to stream run progress' });
    } else {
      res.end();
    }
  }
};

/**
 * 智能排班v4 (ML-based with v4 improvements)
 * POST /scheduling/auto-plan/v4
 */
export const autoPlanV4 = async (req: Request, res: Response) => {
  try {
    const payload = buildAutoPlanPayload(req.body);

    if (!payload.batchIds.length) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }

    if (payload.startDate && payload.endDate && dayjs(payload.startDate).isAfter(payload.endDate)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    const mlService = new MLSchedulingService();
    const result = await mlService.autoPlanV4(payload);
    
    return res.status(202).json(result);
  } catch (error: any) {
    console.error('Error executing autoPlanV4:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute ML-based scheduling (v4)' });
  }
};

/**
 * 智能排班v3 (ML-based)
 * POST /scheduling/auto-plan/v3
 */
export const autoPlanV3 = async (req: Request, res: Response) => {
  try {
    const payload = buildAutoPlanPayload(req.body);

    if (!payload.batchIds.length) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }

    if (payload.startDate && payload.endDate && dayjs(payload.startDate).isAfter(payload.endDate)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    const mlService = new MLSchedulingService();
    const result = await mlService.autoPlanV3(payload);
    
    return res.status(202).json(result);
  } catch (error: any) {
    console.error('Error executing autoPlanV3:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute ML-based scheduling (v3)' });
  }
};

/**
 * 预测工作负载
 * POST /scheduling/ml/predict-workload
 */
export const predictWorkload = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const normalizedStart = dayjs(startDate).format('YYYY-MM-DD');
    const normalizedEnd = dayjs(endDate).format('YYYY-MM-DD');
    
    if (dayjs(normalizedStart).isAfter(normalizedEnd)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    // 获取季度信息
    const quarter = dayjs(normalizedStart).quarter().toString();

    const mlService = new MLSchedulingService();
    const predictions = await mlService.predictWorkload({
      startDate: normalizedStart,
      endDate: normalizedEnd,
      quarter,
    });

    return res.json({
      period: {
        startDate: normalizedStart,
        endDate: normalizedEnd,
        quarter,
      },
      predictions,
    });
  } catch (error: any) {
    console.error('Error predicting workload:', error);
    return res.status(500).json({ error: error?.message || 'Failed to predict workload' });
  }
};

/**
 * 评估排班质量
 * POST /scheduling/ml/evaluate
 */
export const evaluateSchedule = async (req: Request, res: Response) => {
  try {
    const { schedules, period } = req.body;

    if (!schedules || !Array.isArray(schedules)) {
      return res.status(400).json({ error: 'schedules array is required' });
    }

    if (!period || !period.startDate || !period.endDate) {
      return res.status(400).json({ error: 'period with startDate and endDate is required' });
    }

    const normalizedStart = dayjs(period.startDate).format('YYYY-MM-DD');
    const normalizedEnd = dayjs(period.endDate).format('YYYY-MM-DD');
    
    if (dayjs(normalizedStart).isAfter(normalizedEnd)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    // 获取季度信息
    const quarter = period.quarter || dayjs(normalizedStart).quarter().toString();

    const mlService = new MLSchedulingService();
    const metrics = await mlService.evaluateSchedule(schedules, {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      quarter,
    });

    return res.json(metrics);
  } catch (error: any) {
    console.error('Error evaluating schedule:', error);
    return res.status(500).json({ error: error?.message || 'Failed to evaluate schedule' });
  }
};

/**
 * 检查综合工时制约束
 * POST /scheduling/comprehensive-work-time/check
 */
export const checkComprehensiveConstraints = async (req: Request, res: Response) => {
  try {
    const { employeeId, schedules, period } = req.body;

    if (!employeeId || typeof employeeId !== 'number') {
      return res.status(400).json({ error: 'employeeId (number) is required' });
    }

    if (!schedules || !Array.isArray(schedules)) {
      return res.status(400).json({ error: 'schedules array is required' });
    }

    if (!period || typeof period !== 'string') {
      return res.status(400).json({ error: 'period (WEEK/MONTH/QUARTER/YEAR) is required' });
    }

    const validPeriods: ComprehensivePeriod[] = ['WEEK', 'MONTH', 'QUARTER', 'YEAR'];
    if (!validPeriods.includes(period as ComprehensivePeriod)) {
      return res.status(400).json({ 
        error: `period must be one of: ${validPeriods.join(', ')}` 
      });
    }

    const adapter = new ComprehensiveWorkTimeAdapter();
    const violations = await adapter.checkComprehensiveConstraints(
      employeeId,
      schedules,
      period as ComprehensivePeriod
    );

    return res.json({
      employeeId,
      period,
      violations,
      isValid: violations.length === 0,
      violationCount: violations.length,
    });
  } catch (error: any) {
    console.error('Error checking comprehensive constraints:', error);
    return res.status(500).json({ error: error?.message || 'Failed to check comprehensive constraints' });
  }
};
