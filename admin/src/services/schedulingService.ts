import apiClient from './apiClient'
import type {
  AutoPlanV4Result,
  BatchPlanSummary,
  WorkloadSnapshot,
  SchedulingMetricsSnapshot,
  ComputeMetricsPayload
} from '../types/scheduling'

export interface WorkloadQuery {
  startDate: string
  endDate: string
}

export interface AutoPlanV4Options {
  batchIds: number[]
  startDate?: string
  endDate?: string
  options?: {
    dryRun?: boolean
    includeBaseRoster?: boolean
    adaptiveParams?: boolean
    earlyStop?: boolean
    monthHourTolerance?: number
  }
}

export const fetchWorkloadSnapshot = async ({ startDate, endDate }: WorkloadQuery) => {
  const response = await apiClient.get<WorkloadSnapshot>('/scheduling/workload', {
    params: { startDate, endDate }
  })
  return response.data
}

export const fetchBatchPlans = async (): Promise<BatchPlanSummary[]> => {
  const response = await apiClient.get<BatchPlanSummary[]>('/batch-plans')
  return response.data
}

export const runAutoPlanV4 = async (options: AutoPlanV4Options): Promise<AutoPlanV4Result> => {
  const response = await apiClient.post<AutoPlanV4Result>('/scheduling/auto-plan/v4', options)
  return response.data
}

export const computeSchedulingMetrics = async (
  payload: ComputeMetricsPayload
): Promise<SchedulingMetricsSnapshot> => {
  const response = await apiClient.post<SchedulingMetricsSnapshot>(
    '/scheduling/metrics/compute',
    payload
  )
  return response.data
}

export const fetchMetricsSnapshot = async (
  snapshotId: number
): Promise<SchedulingMetricsSnapshot> => {
  const response = await apiClient.get<SchedulingMetricsSnapshot>(
    `/scheduling/metrics/${snapshotId}`
  )
  return response.data
}

export const fetchMetricsHistory = async (limit = 20): Promise<SchedulingMetricsSnapshot[]> => {
  const response = await apiClient.get<SchedulingMetricsSnapshot[]>('/scheduling/metrics/history', {
    params: { limit }
  })
  return response.data
}
