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

export type SchedulingRunStatus =
  | 'RUNNING'
  | 'DRAFT'
  | 'PENDING_PUBLISH'
  | 'PUBLISHED'
  | 'ROLLED_BACK'
  | 'FAILED'

export interface OptimizationMetrics {
  populationSize: number
  generations: number
  actualGenerations?: number
  computationTime?: number
  paretoFrontSize: number
}

export interface ComprehensiveWorkTimeMonthlyStatus {
  month: string
  hours: number
  status: 'COMPLIANT' | 'WARNING' | 'VIOLATION'
}

export interface ComprehensiveWorkTimeEmployeeStatus {
  employeeId: number
  employeeName: string
  quarterHours: number
  quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION'
  monthlyStatus: ComprehensiveWorkTimeMonthlyStatus[]
  restDays: number
  restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION'
}

export interface ComprehensiveWorkTimeStatus {
  employees: ComprehensiveWorkTimeEmployeeStatus[]
  quarterTargetHours?: number
  quarterMinHours?: number
  quarterMaxHours?: number
  monthToleranceHours?: number
}

export interface AutoPlanV4CoverageGap {
  operationPlanId: number
  operationId?: number
  operationName: string
  batchPlanId: number
  batchCode: string
  stageName?: string
  planDate: string
  requiredPeople: number
  assignedPeople: number
  availableHeadcount?: number
  availableQualified?: number
  qualifiedPoolSize?: number
  category: 'HEADCOUNT' | 'QUALIFICATION' | 'OTHER'
  status?: 'UNASSIGNED' | 'PARTIAL'
  notes: string[]
  suggestions: string[]
}

export interface AutoPlanV4CoverageSummary {
  totalOperations: number
  fullyCovered: number
  coverageRate: number
  gaps: AutoPlanV4CoverageGap[]
  gapTotals: {
    headcount: number
    qualification: number
    other: number
  }
}

export interface AutoPlanV4Result {
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
  run?: {
    id: number
    key: string
    status: SchedulingRunStatus
    resultId: number
  }
  summary: {
    employeesTouched: number
    operationsCovered: number
    overtimeEntries: number
    baseRosterRows: number
    operationsAssigned: number
  }
  logs: string[]
  coverage: AutoPlanV4CoverageSummary
  optimizationMetrics?: OptimizationMetrics
  comprehensiveWorkTimeStatus?: ComprehensiveWorkTimeStatus
  metricsSummary?: Record<string, unknown>
}

export interface BatchPlanSummary {
  id: number
  batchCode: string
  batchName: string
  plannedStartDate: string
  plannedEndDate: string
  planStatus: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED'
}
