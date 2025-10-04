import { Request, Response } from 'express'
import MetricsService, { MetricPeriodType } from '../services/metricsService'

export const computeMetrics = async (req: Request, res: Response) => {
  try {
    const { periodType = 'MONTHLY', referenceDate, departmentIds, includeDetails, saveSnapshot } = req.body || {}

    const snapshot = await MetricsService.computeMetricsForPeriod({
      periodType: (periodType ?? 'MONTHLY') as MetricPeriodType,
      referenceDate,
      departmentIds: Array.isArray(departmentIds) ? departmentIds : undefined,
      includeDetails: includeDetails ?? false,
      saveSnapshot: Boolean(saveSnapshot),
      source: 'AUTO_PLAN'
    })

    res.status(saveSnapshot ? 201 : 200).json(snapshot)
  } catch (error) {
    console.error('[SchedulingMetricsController] computeMetrics failed:', error)
    res.status(500).json({ error: 'Failed to compute metrics' })
  }
}

export const getMetricsSnapshot = async (req: Request, res: Response) => {
  try {
    const snapshotId = Number(req.params.snapshotId)
    if (Number.isNaN(snapshotId)) {
      res.status(400).json({ error: 'snapshotId must be a number' })
      return
    }

    const snapshot = await MetricsService.getSnapshotById(snapshotId)
    if (!snapshot) {
      res.status(404).json({ error: 'Metrics snapshot not found' })
      return
    }

    res.json(snapshot)
  } catch (error) {
    console.error('[SchedulingMetricsController] getMetricsSnapshot failed:', error)
    res.status(500).json({ error: 'Failed to fetch metrics snapshot' })
  }
}

export const listMetricsSnapshots = async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20
    const snapshots = await MetricsService.listSnapshots(Number.isNaN(limit) ? 20 : limit)
    res.json(snapshots)
  } catch (error) {
    console.error('[SchedulingMetricsController] listMetricsSnapshots failed:', error)
    res.status(500).json({ error: 'Failed to list metrics snapshots' })
  }
}
