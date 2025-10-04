import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import dayjs from 'dayjs'
import {
  HeuristicScoringService,
  DEFAULT_SCORING_WEIGHTS,
  type CandidateProfile as HeuristicProfile,
  type OperationContext
} from '../services/heuristicScoringService'
import SchedulingService from '../services/schedulingService'

const buildCandidate = (partial: Partial<HeuristicProfile>): HeuristicProfile => ({
  employeeId: partial.employeeId ?? 1,
  employeeCode: partial.employeeCode ?? 'E001',
  employeeName: partial.employeeName ?? '默认员工',
  qualifications:
    partial.qualifications ?? [{ qualificationId: 1, qualificationLevel: 2 }],
  weeklyHours: partial.weeklyHours ?? 20,
  monthlyHours: partial.monthlyHours ?? 80,
  consecutiveDays: partial.consecutiveDays ?? 2,
  preferences: partial.preferences,
  lastAssignedOperationId: partial.lastAssignedOperationId,
  lastAssignedShiftCode: partial.lastAssignedShiftCode
})

const buildOperationContext = (partial: Partial<OperationContext>): OperationContext => ({
  operationPlanId: partial.operationPlanId ?? 10,
  operationId: partial.operationId ?? 20,
  operationName: partial.operationName ?? '测试工序',
  stageName: partial.stageName ?? '阶段A',
  requiredPeople: partial.requiredPeople ?? 1,
  requiredQualifications: partial.requiredQualifications ?? [{ qualificationId: 1, minLevel: 1 }],
  startTime: partial.startTime ?? '2025-10-01T08:00:00Z',
  endTime: partial.endTime ?? '2025-10-01T16:00:00Z',
  shiftCode: partial.shiftCode ?? 'DAY',
  isCritical: partial.isCritical ?? true
})

describe('HeuristicScoringService', () => {
  test('scoreCandidates 会按得分排序并生成详细原因', () => {
    const service = new HeuristicScoringService()
    const operation = buildOperationContext({ requiredPeople: 1, shiftCode: 'DAY' })
    const strongCandidate = buildCandidate({
      employeeId: 101,
      employeeCode: 'E101',
      qualifications: [{ qualificationId: 1, qualificationLevel: 3 }],
      weeklyHours: 10,
      monthlyHours: 40,
      preferences: { preferredShifts: ['DAY'], nightShiftWillingness: 0.7 },
      consecutiveDays: 1,
      lastAssignedShiftCode: 'NIGHT'
    })
    const weakCandidate = buildCandidate({
      employeeId: 102,
      employeeCode: 'E102',
      qualifications: [{ qualificationId: 1, qualificationLevel: 0 }],
      weeklyHours: 50,
      monthlyHours: 200,
      preferences: { preferredShifts: ['NIGHT'], nightShiftWillingness: 0.2 },
      consecutiveDays: 6,
      lastAssignedShiftCode: 'DAY'
    })

    const [first, second] = service.scoreCandidates([weakCandidate, strongCandidate], operation)

    expect(first.candidate.employeeId).toBe(101)
    expect(second.candidate.employeeId).toBe(102)
    expect(first.totalScore).toBeGreaterThan(second.totalScore)
    expect(first.reasons.some((reason) => reason.includes('qualificationMatch'))).toBe(true)
    expect(second.reasons.some((reason) => reason.includes('缺少必要资质'))).toBe(true)
  })

  test('setWeights 会影响评分贡献', () => {
    const service = new HeuristicScoringService()
    const operation = buildOperationContext({ requiredPeople: 1 })
    const candidate = buildCandidate({ employeeId: 103 })

    const baseScore = service.scoreCandidates([candidate], operation)[0].totalScore

    service.setWeights({ qualificationMatch: DEFAULT_SCORING_WEIGHTS.qualificationMatch * 2 })
    const boostedScore = service.scoreCandidates([candidate], operation)[0].totalScore

    expect(boostedScore).toBeGreaterThan(baseScore)
  })
})

const baseContext = () => ({
  heuristicConfig: { maxBacktrackingDepth: 0, minPrimaryScore: 0 },
  heuristicHotspots: [] as any[],
  heuristicLogs: new Map<number, any>(),
  candidateProfiles: new Map<number, any>(),
  operationQualifications: new Map<number, Array<{ qualificationId: number; minLevel: number }>>(),
  heuristicEngine: undefined,
  heuristicWeights: undefined
})

describe('SchedulingService 启发式调度逻辑', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('runHeuristicSelection 会返回排序结果与选中名单', () => {
    const context: any = {
      ...baseContext(),
      candidateProfiles: new Map<number, HeuristicProfile>(),
      operationQualifications: new Map<number, Array<{ qualificationId: number; minLevel: number }>>()
    }

    const opSummary = {
      operationPlanId: 500,
      operationId: 300,
      operationName: '装配',
      stageName: '阶段1',
      batchPlanId: 1,
      batchCode: 'BATCH-1',
      plannedStart: '2025-10-01T08:00:00Z',
      plannedEnd: '2025-10-01T16:00:00Z',
      requiredPeople: 1
    }

    context.operationQualifications.set(500, [{ qualificationId: 1, minLevel: 1 }])

    const candidateA = buildCandidate({ employeeId: 1, employeeCode: 'A', qualifications: [{ qualificationId: 1, qualificationLevel: 2 }], weeklyHours: 10, monthlyHours: 40 })
    const candidateB = buildCandidate({ employeeId: 2, employeeCode: 'B', qualifications: [{ qualificationId: 1, qualificationLevel: 1 }], weeklyHours: 60, monthlyHours: 240 })
    context.candidateProfiles.set(1, candidateA)
    context.candidateProfiles.set(2, candidateB)

    const shift = {
      id: 1,
      shiftCode: 'DAY',
      shiftName: '白班',
      startTime: '08:00',
      endTime: '16:00',
      isCrossDay: false,
      nominalHours: 8
    }

    const diagnostics = (SchedulingService as any).runHeuristicSelection(
      context,
      opSummary,
      [1, 2],
      shift
    )

    expect(diagnostics.candidateScores).toHaveLength(2)
    expect(diagnostics.selectedEmployeeIds).toEqual([1])
    expect(diagnostics.fallbackReason).toBeUndefined()
  })

  test('applyBacktrackingIfNeeded 在满足需求时不会生成热点', () => {
    const context: any = { ...baseContext(), heuristicHotspots: [] }
    const baseDiagnostic = {
      operationPlanId: 600,
      planDate: '2025-10-02',
      requiredPeople: 1,
      candidateScores: [
        {
          candidate: buildCandidate({ employeeId: 11 }),
          totalScore: 5,
          rawBreakdown: {},
          weightedBreakdown: {},
          reasons: []
        }
      ],
      selectedEmployeeIds: [11],
      timestamp: dayjs().toISOString()
    }

    const result = (SchedulingService as any).applyBacktrackingIfNeeded(
      context,
      {
        operationPlanId: 600,
        operationId: 1,
        operationName: '检测',
        stageName: '阶段2',
        batchPlanId: 1,
        batchCode: 'BATCH-2',
        plannedStart: '2025-10-02T08:00:00Z',
        plannedEnd: '2025-10-02T12:00:00Z',
        requiredPeople: 1
      },
      baseDiagnostic,
      [11],
      undefined,
      4,
      0
    )

    expect(result.diagnostic.backtrackingAttempted).toBeUndefined()
    expect(context.heuristicHotspots).toHaveLength(0)
  })

  test('applyBacktrackingIfNeeded 在候选不足时会创建热点', () => {
    const context: any = {
      ...baseContext(),
      heuristicConfig: { maxBacktrackingDepth: 2, minPrimaryScore: 3 },
      heuristicHotspots: []
    }

    const baseDiagnostic = {
      operationPlanId: 700,
      planDate: '2025-10-03',
      requiredPeople: 2,
      candidateScores: [
        {
          candidate: buildCandidate({ employeeId: 21 }),
          totalScore: 1,
          rawBreakdown: {},
          weightedBreakdown: {},
          reasons: []
        }
      ],
      selectedEmployeeIds: [21],
      fallbackReason: 'INSUFFICIENT_CANDIDATES',
      timestamp: dayjs().toISOString()
    }

    const result = (SchedulingService as any).applyBacktrackingIfNeeded(
      context,
      {
        operationPlanId: 700,
        operationId: 2,
        operationName: '焊接',
        stageName: '阶段3',
        batchPlanId: 2,
        batchCode: 'BATCH-3',
        plannedStart: '2025-10-03T08:00:00Z',
        plannedEnd: '2025-10-03T14:00:00Z',
        requiredPeople: 2
      },
      baseDiagnostic,
      [21],
      undefined,
      6,
      0
    )

    expect(result.diagnostic.backtrackingAttempted).toBe(true)
    expect(context.heuristicHotspots).toHaveLength(1)
    const hotspot = context.heuristicHotspots[0]
    expect(hotspot.deficit).toBe(1)
    expect(hotspot.reason).toBe('INSUFFICIENT_CANDIDATES')
    expect(Array.isArray(hotspot.notes)).toBe(true)
  })

  test('createHotspot 会写入核心字段', () => {
    const context: any = { ...baseContext(), heuristicHotspots: [] }
    const operation = {
      operationPlanId: 900,
      operationId: 90,
      operationName: '包装',
      stageName: '阶段4',
      batchPlanId: 9,
      batchCode: 'BATCH-9',
      plannedStart: '2025-10-05T08:00:00Z',
      plannedEnd: '2025-10-05T12:00:00Z',
      requiredPeople: 3
    }
    const diagnostic = {
      operationPlanId: 900,
      planDate: '2025-10-05',
      requiredPeople: 3,
      candidateScores: [],
      selectedEmployeeIds: [31],
      fallbackReason: 'QUALIFICATION_GAP',
      timestamp: dayjs().toISOString(),
      notes: ['无符合资质的人员']
    }

    const hotspot = (SchedulingService as any).createHotspot(context, operation, diagnostic, 2)

    expect(typeof hotspot.id).toBe('string')
    expect(hotspot.id).toMatch(/[0-9a-fA-F-]{36}/)
    expect(hotspot.planDate).toBe('2025-10-05')
    expect(hotspot.deficit).toBe(2)
    expect(hotspot.notes).toContain('无符合资质的人员')
    expect(hotspot.relatedOperations).toEqual([])
  })
})
