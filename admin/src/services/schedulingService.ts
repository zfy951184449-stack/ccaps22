import apiClient from './apiClient'
import type {
  AutoPlanResult,
  BatchPlanSummary,
  WorkloadSnapshot,
  SchedulingMetricsSnapshot,
  ComputeMetricsPayload
} from '../types/scheduling'

export interface WorkloadQuery {
  startDate: string
  endDate: string
}

export interface AutoPlanOptions {
  batchIds: number[]
  dryRun?: boolean
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

export const runAutoPlan = async (options: AutoPlanOptions): Promise<AutoPlanResult> => {
  const response = await apiClient.post<AutoPlanResult>('/scheduling/auto-plan', options)
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
