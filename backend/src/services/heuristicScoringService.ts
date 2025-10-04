export interface CandidateProfile {
  employeeId: number
  employeeCode: string
  employeeName: string
  department?: string
  role?: string
  qualifications: Array<{ qualificationId: number; qualificationLevel: number }>
  weeklyHours: number
  monthlyHours: number
  consecutiveDays: number
  preferences?: {
    preferredShifts?: string[]
    nightShiftWillingness?: number
  }
  lastAssignedOperationId?: number
  lastAssignedShiftCode?: string
}

export interface OperationContext {
  operationPlanId: number
  operationId: number
  operationName: string
  stageName: string
  requiredPeople: number
  requiredQualifications: Array<{ qualificationId: number; minLevel: number }>
  startTime: string
  endTime: string
  shiftCode?: string
  isCritical?: boolean
}

export interface ScoringWeights {
  qualificationMatch: number
  workloadBalance: number
  consecutiveShiftRisk: number
  preferenceMatch: number
  rolePenalty: number
  changeCost: number
  criticalOperationBonus: number
}

export interface CandidateScoreDetail {
  candidate: CandidateProfile
  totalScore: number
  rawBreakdown: Record<string, number>
  weightedBreakdown: Record<string, number>
  reasons: string[]
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  qualificationMatch: 5,
  workloadBalance: 2,
  consecutiveShiftRisk: 3,
  preferenceMatch: 1,
  rolePenalty: 2,
  changeCost: 3,
  criticalOperationBonus: 2
}

export class HeuristicScoringService {
  private weights: ScoringWeights

  constructor(weights?: ScoringWeights) {
    this.weights = {
      ...(weights ?? DEFAULT_SCORING_WEIGHTS),
    }
  }

  scoreCandidates(candidates: CandidateProfile[], operation: OperationContext) {
    return candidates
      .map((profile) => this.scoreCandidate(profile, operation))
      .sort((a, b) => b.totalScore - a.totalScore)
  }

  setWeights(weights: Partial<ScoringWeights>) {
    this.weights = {
      ...this.weights,
      ...weights,
    }
  }

  getWeights(): ScoringWeights {
    return { ...this.weights }
  }

  private scoreCandidate(candidate: CandidateProfile, operation: OperationContext): CandidateScoreDetail {
    const rawBreakdown: Record<string, number> = {}
    const reasons: string[] = []

    const qualificationScore = this.calculateQualificationMatch(candidate, operation)
    rawBreakdown.qualificationMatch = qualificationScore
    if (qualificationScore <= 0) {
      reasons.push('缺少必要资质或等级不足')
    }

    const workloadScore = this.calculateWorkloadBalance(candidate)
    rawBreakdown.workloadBalance = workloadScore

    const consecutiveRiskScore = this.calculateConsecutiveShiftRisk(candidate, operation)
    rawBreakdown.consecutiveShiftRisk = consecutiveRiskScore

    const preferenceScore = this.calculatePreferenceMatch(candidate, operation)
    rawBreakdown.preferenceMatch = preferenceScore

    const roleScore = this.calculateRolePenalty(candidate)
    rawBreakdown.rolePenalty = roleScore

    const changeCostScore = this.calculateChangeCost(candidate, operation)
    rawBreakdown.changeCost = changeCostScore

    const criticalScore = this.calculateCriticalBonus(candidate, operation)
    rawBreakdown.criticalOperationBonus = criticalScore

    const weightedBreakdown: Record<string, number> = {}
    let totalScore = 0
    Object.entries(rawBreakdown).forEach(([key, raw]) => {
      const factor = key as keyof ScoringWeights
      const weight = this.weights[factor] ?? 1
      const contribution = raw * weight
      weightedBreakdown[key] = Number(contribution.toFixed(4))
      totalScore += contribution

      if (raw > 0) {
        reasons.push(`${key}: +${raw.toFixed(2)} × ${weight.toFixed(2)} => +${contribution.toFixed(2)}`)
      } else if (raw < 0) {
        reasons.push(`${key}: ${raw.toFixed(2)} × ${weight.toFixed(2)} => ${contribution.toFixed(2)}`)
      }
    })

    totalScore = Number(totalScore.toFixed(4))

    return {
      candidate,
      totalScore,
      rawBreakdown,
      weightedBreakdown,
      reasons
    }
  }

  private calculateQualificationMatch(candidate: CandidateProfile, operation: OperationContext): number {
    if (!operation.requiredQualifications?.length) {
      return 1
    }

    let score = 0
    for (const requirement of operation.requiredQualifications) {
      const match = candidate.qualifications.find((qual) => qual.qualificationId === requirement.qualificationId)
      if (!match || match.qualificationLevel < requirement.minLevel) {
        return 0
      }
      score += Math.min(1, match.qualificationLevel / requirement.minLevel)
    }
    return score / operation.requiredQualifications.length
  }

  private calculateWorkloadBalance(candidate: CandidateProfile): number {
    const weeklyThreshold = 40
    const monthlyThreshold = 160

    const weeklyScore = Math.max(0, (weeklyThreshold - candidate.weeklyHours) / weeklyThreshold)
    const monthlyScore = Math.max(0, (monthlyThreshold - candidate.monthlyHours) / monthlyThreshold)

    return (weeklyScore + monthlyScore) / 2
  }

  private calculateConsecutiveShiftRisk(candidate: CandidateProfile, operation: OperationContext): number {
    const maxConsecutive = 6
    const consecutiveRatio = candidate.consecutiveDays / maxConsecutive
    if (consecutiveRatio >= 1) {
      return -1
    }

    if (operation.shiftCode && candidate.lastAssignedShiftCode === operation.shiftCode) {
      return -consecutiveRatio
    }

    return 0.5 * (1 - consecutiveRatio)
  }

  private calculatePreferenceMatch(candidate: CandidateProfile, operation: OperationContext): number {
    if (!candidate.preferences || !operation.shiftCode) {
      return 0
    }

    const { preferredShifts, nightShiftWillingness } = candidate.preferences
    const shiftCode = operation.shiftCode.toUpperCase()
    let score = 0

    if (preferredShifts?.includes(shiftCode)) {
      score += 1
    }

    const isNightShift = shiftCode.includes('NIGHT')
    if (isNightShift && typeof nightShiftWillingness === 'number') {
      score += nightShiftWillingness - 0.5
    }

    return score
  }

  private calculateRolePenalty(candidate: CandidateProfile): number {
    if (!candidate.role) {
      return 0
    }

    const role = candidate.role.toUpperCase()
    if (role.includes('SUPERVISOR') || role.includes('MANAGER')) {
      return -1
    }

    return 0
  }

  private calculateChangeCost(candidate: CandidateProfile, operation: OperationContext): number {
    if (!candidate.lastAssignedOperationId) {
      return 0
    }

    if (candidate.lastAssignedOperationId === operation.operationPlanId) {
      return 1
    }

    return -0.5
  }

  private calculateCriticalBonus(candidate: CandidateProfile, operation: OperationContext): number {
    if (!operation.isCritical) {
      return 0
    }

    return this.calculateQualificationMatch(candidate, operation)
  }
}

export default HeuristicScoringService

