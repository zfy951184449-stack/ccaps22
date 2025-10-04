import { Request, Response } from 'express';
import dayjs from 'dayjs';
import SchedulingService from '../services/schedulingService';

export const autoPlan = async (req: Request, res: Response) => {
  try {
    const { batchIds, startDate, endDate, options } = req.body || {};

    const payload = {
      batchIds: Array.isArray(batchIds) ? batchIds.map(Number).filter((id) => !Number.isNaN(id)) : [],
      startDate: startDate ? dayjs(startDate).format('YYYY-MM-DD') : undefined,
      endDate: endDate ? dayjs(endDate).format('YYYY-MM-DD') : undefined,
      options: options || {},
    };

    if (!payload.batchIds.length) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }

    if (payload.startDate && payload.endDate && dayjs(payload.startDate).isAfter(payload.endDate)) {
      return res.status(400).json({ error: 'startDate cannot be later than endDate' });
    }

    const result = await SchedulingService.autoPlan(payload);
    return res.status(202).json(result);
  } catch (error: any) {
    console.error('Error executing autoPlan:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute scheduling' });
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
