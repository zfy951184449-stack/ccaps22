import dayjs from 'dayjs'
import pool from '../config/database'
import { RowDataPacket } from 'mysql2'

export type MetricPeriodType = 'MONTHLY' | 'QUARTERLY'

export enum MetricGrade {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

const MANAGEMENT_ROLE_CODES = new Set([
  'TEAM_LEADER',
  'GROUP_LEADER',
  'SHIFT_LEADER',
  'DEPT_MANAGER',
  'SUPERVISOR',
  'MANAGER',
]);

export interface MetricThreshold {
  green: string
  yellow?: string
  red?: string
}

export interface SchedulingMetric {
  id: string
  name: string
  value: number
  unit?: string
  grade: MetricGrade
  threshold?: MetricThreshold
  details?: Record<string, unknown>
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
  createdAt?: string
  source: 'AUTO_PLAN' | 'MANUAL'
  metadata?: Record<string, unknown>
}

export interface ComputeMetricsOptions {
  periodType: MetricPeriodType
  referenceDate?: string
  departmentIds?: number[]
  includeDetails?: boolean
  source?: 'AUTO_PLAN' | 'MANUAL'
  saveSnapshot?: boolean
}

export class MetricsService {
  static async computeMetricsForPeriod(options: ComputeMetricsOptions): Promise<SchedulingMetricsSnapshot> {
    const reference = dayjs(options.referenceDate || undefined)
    const periodType = options.periodType

    const { periodStart, periodEnd } = MetricsService.resolvePeriodRange(reference, periodType)

    const metrics: SchedulingMetric[] = []

    const personMetrics = await MetricsService.computePersonalShopfloorBalance(periodStart, periodEnd, options.departmentIds)
    metrics.push(personMetrics)

    const deptMetrics = await MetricsService.computeDepartmentShopfloorBalance(periodStart, periodEnd, options.departmentIds)
    metrics.push(deptMetrics)

    const criticalMetrics = await MetricsService.computeCriticalOperationCoverage(periodStart, periodEnd, options.departmentIds)
    metrics.push(criticalMetrics)

    const nightMetrics = await MetricsService.computeNightShiftFairness(periodStart, periodEnd, options.departmentIds)
    metrics.push(nightMetrics)

    const holidayMetrics = await MetricsService.computeHolidayUtilization(periodStart, periodEnd, options.departmentIds)
    metrics.push(holidayMetrics)

    const snapshot: SchedulingMetricsSnapshot = {
      periodType,
      periodStart,
      periodEnd,
      overallScore: MetricsService.calculateOverallScore(metrics),
      grade: MetricsService.deriveOverallGrade(metrics),
      metrics,
      createdAt: dayjs().toISOString(),
      source: options.source || 'MANUAL',
      metadata: {
        analysedDepartments: options.departmentIds || [],
        includeDetails: options.includeDetails ?? false
      }
    }

    if (options.saveSnapshot) {
      await MetricsService.saveSnapshot(snapshot)
    }

    return snapshot
  }

  private static async computePersonalShopfloorBalance(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ): Promise<SchedulingMetric> {
    const sql = `
      SELECT esp.employee_id AS employeeId,
             SUM(esp.plan_hours + esp.overtime_hours) AS shopfloorHours,
             e.department_id AS departmentId,
             COALESCE(e.shopfloor_baseline_pct, 0.6) AS baselinePct,
             COALESCE(e.shopfloor_upper_pct, 0.9) AS upperPct,
             COALESCE(er.role_code, e.org_role, 'FRONTLINE') AS roleCode
        FROM employee_shift_plans esp
        JOIN employees e ON e.id = esp.employee_id
        LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.plan_category IN ('PRODUCTION', 'OPERATION')
         AND esp.plan_state <> 'VOID'
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY esp.employee_id,
                e.department_id,
                e.shopfloor_baseline_pct,
                e.shopfloor_upper_pct,
                roleCode
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)

    const filtered = rows.filter((row) => !MANAGEMENT_ROLE_CODES.has(String(row.roleCode || '')))
    const hours = filtered.map((row) => Number(row.shopfloorHours || 0))

    if (!hours.length) {
      return {
        id: 'personal_shopfloor_stddev',
        name: '个人车间工时标准差',
        value: 0,
        unit: 'hours',
        grade: MetricGrade.GOOD,
        threshold: { green: '<= 6h', yellow: '6~10h', red: '> 10h' },
        details: { employees: [] },
        recommendation: '无一线人员数据'
      }
    }

    const mean = hours.reduce((acc, value) => acc + value, 0) / hours.length
    const variance = hours.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / hours.length
    const stddev = Math.round(Math.sqrt(variance) * 100) / 100
    const max = Math.max(...hours)
    const min = Math.min(...hours)
    const range = Math.round((max - min) * 100) / 100

    const grade = stddev <= 6 ? MetricGrade.EXCELLENT : stddev <= 10 ? MetricGrade.GOOD : stddev <= 14 ? MetricGrade.WARNING : MetricGrade.CRITICAL

    const detail = filtered.map((row) => {
      const value = Number(row.shopfloorHours || 0)
      return {
        employeeId: row.employeeId,
        departmentId: row.departmentId,
        shopfloorHours: value,
        baselinePct: Number(row.baselinePct || 0),
        upperPct: Number(row.upperPct || 1),
        exceedsUpper: value > Number(row.upperPct || 1) * mean
      }
    })

    const baselineDetails = await MetricsService.computeBaselineRatios(periodStart, periodEnd, departmentIds)
    const exceeds = detail.filter((item) => item.exceedsUpper).length
    let recommendation: string | undefined
    if (exceeds > 0) {
      recommendation = `共有 ${exceeds} 名员工超过配置的车间工时上限，建议回顾排班分配。`
    }

    return {
      id: 'personal_shopfloor_stddev',
      name: '个人车间工时标准差',
      value: stddev,
      unit: 'hours',
      grade,
      threshold: { green: '<= 6h', yellow: '6~10h', red: '> 10h' },
      details: {
        mean: Math.round(mean * 100) / 100,
        range,
        employees: detail,
        baselineUsage: baselineDetails
      },
      recommendation
    }
  }

  private static async computeBaselineRatios(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ) {
    const sql = `
      SELECT esp.employee_id AS employeeId,
             SUM(esp.plan_hours + esp.overtime_hours) AS shopfloorHours,
             e.shopfloor_baseline_pct AS baselinePct,
             e.shopfloor_upper_pct AS upperPct,
             COALESCE(er.role_code, e.org_role, 'FRONTLINE') AS roleCode
        FROM employee_shift_plans esp
        JOIN employees e ON e.id = esp.employee_id
        LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.plan_category IN ('PRODUCTION', 'OPERATION')
         AND esp.plan_state <> 'VOID'
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY esp.employee_id,
                e.shopfloor_baseline_pct,
                e.shopfloor_upper_pct,
                roleCode
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)
    const eligible = rows.filter((row) => !MANAGEMENT_ROLE_CODES.has(String(row.roleCode || '')))

    return eligible.map((row) => {
      const plannedHours = Number(row.shopfloorHours || 0)
      const baselinePct = row.baselinePct ? Number(row.baselinePct) : 0.6
      const upperPct = row.upperPct ? Number(row.upperPct) : 0.9
      return {
        employeeId: Number(row.employeeId),
        plannedHours,
        baselinePct,
        upperPct,
        ratioToBaseline: baselinePct > 0 ? Math.round((plannedHours / baselinePct) * 100) / 100 : null,
        ratioToUpper: upperPct > 0 ? Math.round((plannedHours / upperPct) * 100) / 100 : null
      }
    })
  }

  private static async computeDepartmentShopfloorBalance(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ): Promise<SchedulingMetric> {
    const sql = `
      SELECT e.department_id AS departmentId,
             esp.employee_id AS employeeId,
             SUM(esp.plan_hours + esp.overtime_hours) AS shopfloorHours,
             COALESCE(er.role_code, e.org_role, 'FRONTLINE') AS roleCode
        FROM employee_shift_plans esp
        JOIN employees e ON e.id = esp.employee_id
        LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.plan_category IN ('PRODUCTION', 'OPERATION')
         AND esp.plan_state <> 'VOID'
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY e.department_id,
                esp.employee_id,
                roleCode
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)

    const departmentMap = new Map<number, number[]>()
    rows.forEach((row) => {
      if (MANAGEMENT_ROLE_CODES.has(String(row.roleCode || ''))) {
        return
      }
      const departmentId = Number(row.departmentId)
      if (!departmentId) {
        return
      }
      const arr = departmentMap.get(departmentId) || []
      arr.push(Number(row.shopfloorHours || 0))
      departmentMap.set(departmentId, arr)
    })

    const departmentStdDevs: Array<{ departmentId: number; stddev: number; range: number }> = []
    departmentMap.forEach((hours, departmentId) => {
      if (!hours.length) {
        return
      }
      const mean = hours.reduce((acc, value) => acc + value, 0) / hours.length
      const variance = hours.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / hours.length
      const stddev = Math.round(Math.sqrt(variance) * 100) / 100
      const range = Math.round((Math.max(...hours) - Math.min(...hours)) * 100) / 100
      departmentStdDevs.push({ departmentId, stddev, range })
    })

    if (!departmentStdDevs.length) {
      return {
        id: 'dept_internal_stddev',
        name: '部门内部车间工时标准差',
        value: 0,
        unit: 'hours',
        grade: MetricGrade.GOOD,
        threshold: { green: '<= 8h', yellow: '8~12h', red: '> 12h' },
        details: { departments: [] },
        recommendation: '无部门车间工时数据'
      }
    }

    const worstDept = departmentStdDevs.reduce((prev, current) => (current.stddev > prev.stddev ? current : prev))
    const grade = worstDept.stddev <= 8 ? MetricGrade.EXCELLENT : worstDept.stddev <= 12 ? MetricGrade.GOOD : worstDept.stddev <= 16 ? MetricGrade.WARNING : MetricGrade.CRITICAL

    return {
      id: 'dept_internal_stddev',
      name: '部门内部车间工时标准差',
      value: worstDept.stddev,
      unit: 'hours',
      grade,
      threshold: { green: '<= 8h', yellow: '8~12h', red: '> 12h' },
      details: { departments: departmentStdDevs }
    }
  }

  private static async computeCriticalOperationCoverage(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ): Promise<SchedulingMetric> {
    const sql = `
      SELECT esp.batch_operation_plan_id AS operationPlanId,
             bop.operation_id AS operationId,
             SUM(esp.plan_hours) AS assignedHours,
             MIN(oqr.min_level) AS minLevel,
             GROUP_CONCAT(esp.employee_id) AS assignedEmployees
        FROM employee_shift_plans esp
        JOIN batch_operation_plans bop ON bop.id = esp.batch_operation_plan_id
        JOIN operation_qualification_requirements oqr ON oqr.operation_id = bop.operation_id
        JOIN employees e ON e.id = esp.employee_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.batch_operation_plan_id IS NOT NULL
         AND oqr.min_level >= 4
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY esp.batch_operation_plan_id, bop.operation_id
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)

    if (!rows.length) {
      return {
        id: 'critical_operation_coverage',
        name: '关键操作满足率',
        value: 100,
        unit: 'percent',
        grade: MetricGrade.EXCELLENT,
        threshold: { green: '= 100%', yellow: '95%~99%', red: '< 95%' },
        details: { criticalOperations: [] },
        recommendation: '周期内无关键操作'
      }
    }

    let satisfied = 0
    const details: Array<{ operationPlanId: number; operationId: number; minLevel: number; qualified: boolean }> = []

    for (const row of rows) {
      const assigned = String(row.assignedEmployees || '')
        .split(',')
        .map((id) => Number(id))
        .filter(Boolean)
      const qualified = await MetricsService.checkEmployeesQualification(assigned, Number(row.minLevel))
      if (qualified) {
        satisfied += 1
      }
      details.push({
        operationPlanId: Number(row.operationPlanId),
        operationId: Number(row.operationId),
        minLevel: Number(row.minLevel),
        qualified
      })
    }

    const total = rows.length
    const coverage = total ? Math.round((satisfied / total) * 10000) / 100 : 100
    const grade = coverage >= 100 ? MetricGrade.EXCELLENT : coverage >= 95 ? MetricGrade.GOOD : coverage >= 90 ? MetricGrade.WARNING : MetricGrade.CRITICAL
    let recommendation: string | undefined
    if (grade !== MetricGrade.EXCELLENT) {
      recommendation = '存在关键操作未满足资质要求，建议优先安排高资质员工或增加培训。'
    }

    return {
      id: 'critical_operation_coverage',
      name: '关键操作满足率',
      value: coverage,
      unit: 'percent',
      grade,
      threshold: { green: '= 100%', yellow: '95%~99%', red: '< 95%' },
      details: { criticalOperations: details },
      recommendation
    }
  }

  private static async computeNightShiftFairness(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ): Promise<SchedulingMetric> {
    const sql = `
      SELECT esp.employee_id AS employeeId,
             SUM(esp.plan_hours) AS nightHours,
             COUNT(*) AS nightCount,
             e.department_id AS departmentId,
             COALESCE(er.role_code, e.org_role, 'FRONTLINE') AS roleCode,
             e.night_shift_eligible AS isNightEligible
        FROM employee_shift_plans esp
        JOIN shift_types st ON st.id = esp.shift_id
        JOIN employees e ON e.id = esp.employee_id
        LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.plan_state <> 'VOID'
         AND st.is_night_shift = 1
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY esp.employee_id,
                e.department_id,
                roleCode,
                e.night_shift_eligible
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)

    const eligible = rows.filter(
      (row) =>
        Number(row.isNightEligible) === 1 && !MANAGEMENT_ROLE_CODES.has(String(row.roleCode || ''))
    )

    if (!eligible.length) {
      return {
        id: 'night_shift_fairness',
        name: '夜班公平性',
        value: 0,
        unit: 'count_stddev',
        grade: MetricGrade.GOOD,
        threshold: { green: '<= 2', yellow: '2~4', red: '> 4' },
        details: { employees: [] },
        recommendation: '周期内无夜班或无夜班资格人员'
      }
    }

    const counts = eligible.map((row) => Number(row.nightCount || 0))
    const hours = eligible.map((row) => Number(row.nightHours || 0))

    const countMean = counts.reduce((acc, val) => acc + val, 0) / counts.length
    const countStd = Math.sqrt(counts.reduce((acc, val) => acc + Math.pow(val - countMean, 2), 0) / counts.length)

    const hourMean = hours.reduce((acc, val) => acc + val, 0) / hours.length
    const hourStd = Math.sqrt(hours.reduce((acc, val) => acc + Math.pow(val - hourMean, 2), 0) / hours.length)

    const grade = countStd <= 2 ? MetricGrade.EXCELLENT : countStd <= 4 ? MetricGrade.GOOD : countStd <= 6 ? MetricGrade.WARNING : MetricGrade.CRITICAL

    const details = eligible.map((row) => ({
      employeeId: row.employeeId,
      departmentId: row.departmentId,
      nightCount: Number(row.nightCount || 0),
      nightHours: Number(row.nightHours || 0)
    }))

    let recommendation: string | undefined
    if (grade !== MetricGrade.EXCELLENT) {
      recommendation = '夜班分配倾向集中，建议轮换夜班或者增加夜班补偿。'
    }

    return {
      id: 'night_shift_fairness',
      name: '夜班公平性',
      value: Math.round(countStd * 100) / 100,
      unit: 'count_stddev',
      grade,
      threshold: { green: '<= 2', yellow: '2~4', red: '> 4' },
      details: {
        countStd: Math.round(countStd * 100) / 100,
        hourStd: Math.round(hourStd * 100) / 100,
        employees: details
      },
      recommendation
    }
  }

  private static async computeHolidayUtilization(
    periodStart: string,
    periodEnd: string,
    departmentIds?: number[]
  ): Promise<SchedulingMetric> {
    const sql = `
      SELECT esp.employee_id AS employeeId,
             SUM(esp.plan_hours) AS holidayHours,
             COUNT(*) AS holidayCount,
             h.holiday_type AS holidayType,
             COALESCE(er.role_code, e.org_role, 'FRONTLINE') AS roleCode
        FROM employee_shift_plans esp
        JOIN calendar_workdays h ON h.calendar_date = esp.plan_date
        JOIN employees e ON e.id = esp.employee_id
        LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       WHERE esp.plan_date BETWEEN ? AND ?
         AND esp.plan_state <> 'VOID'
         AND h.holiday_type = 'LEGAL_HOLIDAY'
         ${departmentIds?.length ? `AND e.department_id IN (${departmentIds.map(() => '?').join(',')})` : ''}
       GROUP BY esp.employee_id,
                h.holiday_type,
                roleCode
    `

    const params: any[] = [periodStart, periodEnd]
    if (departmentIds?.length) {
      params.push(...departmentIds)
    }

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)

    if (!rows.length) {
      return {
        id: 'holiday_utilization',
        name: '高薪节假日占用率',
        value: 0,
        unit: 'percent',
        grade: MetricGrade.EXCELLENT,
        threshold: { green: '<= 10%', yellow: '10%~20%', red: '> 20%' },
        details: { employees: [] },
        recommendation: '周期内未安排 3 倍工资法定节假日排班'
      }
    }

    const totalHolidayHours = rows.reduce((acc, row) => acc + Number(row.holidayHours || 0), 0)
    const totalEntries = rows.length
    const averagePerEmployee = totalHolidayHours / rows.length

    const grade = totalEntries <= 2 ? MetricGrade.EXCELLENT : totalEntries <= 5 ? MetricGrade.GOOD : totalEntries <= 10 ? MetricGrade.WARNING : MetricGrade.CRITICAL

    const employees = rows.map((row) => ({
      employeeId: row.employeeId,
      holidayHours: Number(row.holidayHours || 0),
      holidayCount: Number(row.holidayCount || 0),
      roleCode: row.roleCode
    }))

    let recommendation: string | undefined
    if (grade !== MetricGrade.EXCELLENT) {
      recommendation = '节假日排班人数偏多，建议提前规划调休或优化轮班策略。'
    }

    return {
      id: 'holiday_utilization',
      name: '高薪节假日占用率',
      value: Math.round((totalEntries / (rows.length || 1)) * 10000) / 100,
      unit: 'percent',
      grade,
      threshold: { green: '<= 10%', yellow: '10%~20%', red: '> 20%' },
      details: {
        averageHours: Math.round(averagePerEmployee * 100) / 100,
        totalEntries,
        employees
      },
      recommendation
    }
  }

  private static async checkEmployeesQualification(employeeIds: number[], minLevel: number): Promise<boolean> {
    if (!employeeIds.length) {
      return false
    }
    const sql = `
      SELECT COUNT(*) AS qualifiedCount
        FROM employee_qualifications
       WHERE employee_id IN (${employeeIds.map(() => '?').join(',')})
         AND qualification_level >= ?
    `
    const params = [...employeeIds, minLevel]
    const [rows] = await pool.execute<RowDataPacket[]>(sql, params)
    const qualified = rows[0]?.qualifiedCount || 0
    return qualified > 0
  }

  private static calculateOverallScore(metrics: SchedulingMetric[]): number {
    if (!metrics.length) {
      return 0
    }
    const gradeWeights: Record<MetricGrade, number> = {
      [MetricGrade.EXCELLENT]: 1,
      [MetricGrade.GOOD]: 0.75,
      [MetricGrade.WARNING]: 0.4,
      [MetricGrade.CRITICAL]: 0
    }
    const weighted = metrics.reduce((acc, metric) => acc + gradeWeights[metric.grade], 0)
    const normalized = (weighted / metrics.length) * 100
    return Math.round(normalized)
  }

  private static deriveOverallGrade(metrics: SchedulingMetric[]): MetricGrade {
    if (!metrics.length) {
      return MetricGrade.CRITICAL
    }
    if (metrics.some((metric) => metric.grade === MetricGrade.CRITICAL)) {
      return MetricGrade.CRITICAL
    }
    if (metrics.some((metric) => metric.grade === MetricGrade.WARNING)) {
      return MetricGrade.WARNING
    }
    if (metrics.some((metric) => metric.grade === MetricGrade.GOOD)) {
      return MetricGrade.GOOD
    }
    return MetricGrade.EXCELLENT
  }

  private static resolvePeriodRange(reference: dayjs.Dayjs, periodType: MetricPeriodType) {
    const ref = reference.isValid() ? reference : dayjs()
    if (periodType === 'MONTHLY') {
      return {
        periodStart: ref.startOf('month').format('YYYY-MM-DD'),
        periodEnd: ref.endOf('month').format('YYYY-MM-DD')
      }
    }
    return {
      periodStart: ref.startOf('quarter').format('YYYY-MM-DD'),
      periodEnd: ref.endOf('quarter').format('YYYY-MM-DD')
    }
  }

  static async saveSnapshot(snapshot: SchedulingMetricsSnapshot): Promise<void> {
    const sql = `
      INSERT INTO scheduling_metrics_snapshots
        (period_type, period_start, period_end, overall_score, grade, metrics_json, source, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      snapshot.periodType,
      snapshot.periodStart,
      snapshot.periodEnd,
      snapshot.overallScore,
      snapshot.grade,
      JSON.stringify(snapshot.metrics),
      snapshot.source,
      JSON.stringify(snapshot.metadata || {}),
      snapshot.createdAt || dayjs().toISOString()
    ]

    try {
      await pool.execute(sql, params)
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[MetricsService] Failed to persist metrics snapshot:', error)
      }
    }
  }

  static async getSnapshotById(snapshotId: number): Promise<SchedulingMetricsSnapshot | null> {
    const sql = `
      SELECT id, period_type AS periodType, period_start AS periodStart, period_end AS periodEnd,
             overall_score AS overallScore, grade, metrics_json AS metricsJson,
             source, metadata_json AS metadataJson, created_at AS createdAt
        FROM scheduling_metrics_snapshots
       WHERE id = ?
       LIMIT 1
    `
    try {
      const [rows] = await pool.execute<any[]>(sql, [snapshotId])
      if (!rows.length) {
        return null
      }
      const row = rows[0]
      return {
        snapshotId: row.id,
        periodType: row.periodType as MetricPeriodType,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        overallScore: row.overallScore,
        grade: row.grade as MetricGrade,
        metrics: JSON.parse(row.metricsJson || '[]'),
        source: row.source,
        metadata: JSON.parse(row.metadataJson || '{}'),
        createdAt: row.createdAt
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[MetricsService] Failed to fetch metrics snapshot:', error)
      }
      return null
    }
  }

  static async listSnapshots(limit = 20): Promise<SchedulingMetricsSnapshot[]> {
    const sql = `
      SELECT id, period_type AS periodType, period_start AS periodStart, period_end AS periodEnd,
             overall_score AS overallScore, grade, metrics_json AS metricsJson,
             source, metadata_json AS metadataJson, created_at AS createdAt
        FROM scheduling_metrics_snapshots
       ORDER BY created_at DESC
       LIMIT ?
    `
    try {
      const [rows] = await pool.execute<any[]>(sql, [limit])
      return rows.map((row) => ({
        snapshotId: row.id,
        periodType: row.periodType as MetricPeriodType,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        overallScore: row.overallScore,
        grade: row.grade as MetricGrade,
        metrics: JSON.parse(row.metricsJson || '[]'),
        source: row.source,
        metadata: JSON.parse(row.metadataJson || '{}'),
        createdAt: row.createdAt
      }))
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[MetricsService] Failed to list metrics snapshots:', error)
      }
      return []
    }
  }
}

export default MetricsService
