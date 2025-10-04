export interface WorkloadPeriod {
  startDate: string
  endDate: string
  quarter: string
}

export interface WorkloadEmployeeEntry {
  employeeId: number
  employeeCode: string
  employeeName: string
  totalPlannedHours: number
  totalOvertimeHours: number
  daysWorked: number
  consecutiveDays?: number
}

export interface WorkloadSnapshot {
  period: WorkloadPeriod
  employees: WorkloadEmployeeEntry[]
  warnings: string[]
}

export type MetricPeriodType = 'MONTHLY' | 'QUARTERLY'

export type MetricGrade = 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL'

export interface MetricThreshold {
  green: string
  yellow?: string
  red?: string
}

export interface SchedulingMetricDetail {
  [key: string]: unknown
}

export interface SchedulingMetric {
  id: string
  name: string
  value: number
  unit?: string
  grade: MetricGrade
  threshold?: MetricThreshold
  details?: SchedulingMetricDetail
  recommendation?: string
}

export interface SchedulingMetricsSnapshot {
  snapshotId?: number
  periodType: MetricPeriodType
  periodStart: string
  periodEnd: string
  overallScore: number
  grade: MetricGrade
  metrics: SchedulingMetric[]
  source: 'AUTO_PLAN' | 'MANUAL'
  metadata?: Record<string, unknown>
  createdAt?: string
}

export interface ComputeMetricsPayload {
  periodType: MetricPeriodType
  referenceDate?: string
  departmentIds?: number[]
  includeDetails?: boolean
  saveSnapshot?: boolean
}

export interface HeuristicHotspot {
  id: string
  operationPlanId: number
  operationName: string
  planDate: string
  deficit: number
  attempts: number
  reason: string
  notes: string[]
  relatedOperations: number[]
  createdAt: string
}

export interface CoverageDetailGap {
  operationPlanId: number
  operationName: string
  planDate: string
  required: number
  assigned: number
  deficit: number
  shortageReason?: string
}

export interface OperationCoverageDetail extends CoverageDetailGap {
  batchPlanId: number
  batchCode: string
  stageName: string
}

export interface CoverageSummary {
  operations: OperationCoverageDetail[]
  totals: {
    requiredPeople: number
    assignedPeople: number
    deficitPeople: number
  }
}

export interface AutoPlanResult {
  message: string
  period: WorkloadPeriod
  batches: Array<{
    batchPlanId: number
    batchCode: string
    start: string | null
    end: string | null
    totalOperations: number
  }>
  warnings: string[]
  summary: {
    employeesTouched: number
    operationsCovered: number
    overtimeEntries: number
    baseRosterRows: number
    operationsAssigned: number
  }
  diagnostics: {
    missingCalendar?: boolean
  }
  logs: string[]
  coverage: CoverageSummary
  heuristicHotspots?: HeuristicHotspot[]
}

export interface BatchPlanSummary {
  id: number
  batchCode: string
  batchName: string
  plannedStartDate: string
  plannedEndDate: string
  planStatus: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED'
}
