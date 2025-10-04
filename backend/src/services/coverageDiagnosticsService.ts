import pool from '../config/database'

export type CoverageCategory = 'HEADCOUNT' | 'QUALIFICATION' | 'OTHER'

export interface CoverageDiagnosticInput {
  operationPlanId: number
  operationId: number
  operationName: string
  batchPlanId: number
  batchCode: string
  stageName: string
  planDate: string
  requiredPeople: number
  assignedPeople: number
  qualifiedCandidateIds: number[]
}

export interface CoverageGapDetail {
  operationPlanId: number
  operationId: number
  operationName: string
  batchPlanId: number
  batchCode: string
  stageName: string
  planDate: string
  requiredPeople: number
  assignedPeople: number
  availableHeadcount: number
  availableQualified: number
  qualifiedPoolSize: number
  category: CoverageCategory
  status: 'UNASSIGNED' | 'PARTIAL'
  notes: string[]
  suggestions: string[]
}

export interface CoverageSummaryResult {
  totalOperations: number
  fullyCovered: number
  coverageRate: number
  gaps: CoverageGapDetail[]
  gapTotals: {
    headcount: number
    qualification: number
    other: number
  }
}

export class CoverageDiagnosticsService {
  static async evaluate(operations: CoverageDiagnosticInput[]): Promise<CoverageSummaryResult> {
    const gaps: CoverageGapDetail[] = []
    let fullyCovered = 0

    for (const op of operations) {
      if (op.assignedPeople >= op.requiredPeople) {
        fullyCovered += 1
        continue
      }

      const summary = await CoverageDiagnosticsService.fetchOperationSummary(op.operationPlanId)
      const qualifiedAvailable = op.qualifiedCandidateIds.length
      const headcountAvailable = summary.availableHeadcount
      const remaining = Math.max(0, op.requiredPeople - op.assignedPeople)

      let category: CoverageCategory = 'OTHER'
      if (headcountAvailable <= 0) {
        category = 'HEADCOUNT'
      } else if (qualifiedAvailable < remaining) {
        category = 'QUALIFICATION'
      }

      const notes = [`需 ${op.requiredPeople} 人，当前仅分配 ${op.assignedPeople} 人`]
      if (headcountAvailable <= 0) {
        notes.push('当前班组无可用人员')
      }
      if (qualifiedAvailable === 0) {
        notes.push('无任何满足资质的候选人')
      } else if (qualifiedAvailable < remaining) {
        notes.push(`满足资质的候选仅 ${qualifiedAvailable} 人，低于缺口 ${remaining}`)
      }

      const suggestions: string[] = []
      if (category === 'HEADCOUNT') {
        suggestions.push('建议增加排班资源或调整班次；必要时安排加班或外援')
      }
      if (category === 'QUALIFICATION') {
        suggestions.push('建议调配具备所需资质的人员，或启动资质培训/升级')
      }
      if (category === 'OTHER') {
        suggestions.push('检查时间窗、依赖或冲突约束，可尝试局部重排方案')
      }

      gaps.push({
        operationPlanId: op.operationPlanId,
        operationId: op.operationId,
        operationName: op.operationName,
        batchPlanId: op.batchPlanId,
        batchCode: op.batchCode,
        stageName: op.stageName,
        planDate: op.planDate,
        requiredPeople: op.requiredPeople,
        assignedPeople: op.assignedPeople,
        availableHeadcount: headcountAvailable,
        availableQualified: qualifiedAvailable,
        qualifiedPoolSize: summary.qualifiedPoolSize,
        category,
        status: op.assignedPeople === 0 ? 'UNASSIGNED' : 'PARTIAL',
        notes,
        suggestions
      })
    }

    const totalOperations = operations.length
    const coverageRate = totalOperations > 0 ? Number((fullyCovered / totalOperations).toFixed(4)) : 1
    const gapTotals = {
      headcount: gaps.filter((gap) => gap.category === 'HEADCOUNT').length,
      qualification: gaps.filter((gap) => gap.category === 'QUALIFICATION').length,
      other: gaps.filter((gap) => gap.category === 'OTHER').length
    }

    return {
      totalOperations,
      fullyCovered,
      coverageRate,
      gaps,
      gapTotals
    }
  }

  private static async fetchOperationSummary(operationPlanId: number) {
    const [rows] = await pool.execute(
      `SELECT
         (SELECT COUNT(*)
            FROM employee_shift_plans esp
           WHERE esp.batch_operation_plan_id = bop.id
             AND esp.plan_state <> 'VOID') AS assigned,
         (SELECT COUNT(DISTINCT esp.employee_id)
            FROM employee_shift_plans esp
           WHERE esp.plan_date = DATE(bop.planned_start_datetime)
             AND esp.plan_category <> 'REST'
             AND esp.plan_state <> 'VOID') AS availableHeadcount,
         (SELECT COUNT(DISTINCT eq.employee_id)
            FROM operation_qualification_requirements oqr
            JOIN employee_qualifications eq ON oqr.qualification_id = eq.qualification_id
           WHERE oqr.operation_id = bop.operation_id
             AND eq.qualification_level >= oqr.min_level) AS qualifiedPoolSize
       FROM batch_operation_plans bop
       WHERE bop.id = ?
       LIMIT 1`,
      [operationPlanId]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        availableHeadcount: 0,
        qualifiedPoolSize: 0
      }
    }

    const row: any = rows[0]
    return {
      availableHeadcount: Number(row.availableHeadcount || 0),
      qualifiedPoolSize: Number(row.qualifiedPoolSize || 0)
    }
  }
}

export default CoverageDiagnosticsService

