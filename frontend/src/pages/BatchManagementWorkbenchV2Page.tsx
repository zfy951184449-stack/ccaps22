import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  WxbAlert,
  WxbButton,
  WxbCard,
  WxbCheckbox,
  WxbDataTable,
  WxbDivider,
  WxbEmpty,
  WxbGanttChart,
  WxbIcon,
  WxbInput,
  WxbSelect,
  WxbTag,
  WxbTextarea,
} from '../components/wxb-ui';
import {
  batchWorkbenchV2Api,
  WorkbenchDataMode,
  WorkbenchLiveBatch,
  WorkbenchLiveContextResponse,
  WorkbenchLiveOperation,
  WorkbenchLiveTemplate,
  WorkbenchSolverPreviewResponse,
} from '../services/batchWorkbenchV2Api';
import type {
  ConnectionRule,
  ExceptionDraft,
  HandoffConfig,
  LocalProposal,
  ShiftStrategy,
  TemplateDomain,
  TimelinePreview,
  WorkbenchBatch,
  WorkbenchOperation,
  WorkbenchPalette,
  WorkbenchTemplate,
} from './batch-workbench-v2/model';
import {
  CONNECTION_RULE_OPTIONS,
  DEFAULT_WORKBENCH_PALETTE,
  EXCEPTION_TYPE_OPTIONS,
  SHIFT_STRATEGY_OPTIONS,
  buildGanttModel,
  buildLocalProposal,
  buildPreviewTimeline,
  createExceptionDraft,
  findDefaultHandoffOperation,
  formatDateTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  toTemplateOperationKey,
} from './batch-workbench-v2/model';
import './BatchManagementWorkbenchV2Page.css';

type SolverState = 'idle' | 'running' | 'done' | 'gap';

function useWxbPalette(): WorkbenchPalette {
  const [palette, setPalette] = useState<WorkbenchPalette>(DEFAULT_WORKBENCH_PALETTE);

  useEffect(() => {
    const readToken = (token: string) => window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    setPalette({
      usp: readToken('--wx-blue-600'),
      dsp: readToken('--wx-green-600'),
      original: readToken('--wx-fg-4'),
      preview: readToken('--wx-blue-500'),
      conflict: readToken('--wx-red-500'),
      handoff: readToken('--wx-amber-500'),
      inserted: readToken('--wx-green-500'),
    });
  }, []);

  return palette;
}

function toWorkbenchBatch(batch: WorkbenchLiveBatch, upstreamTemplateId: number | null, downstreamTemplateId: number | null): WorkbenchBatch {
  return {
    id: batch.id,
    batchCode: batch.batchCode,
    batchStatus: batch.batchStatus,
    plannedStart: batch.plannedStart ?? dayjs().startOf('day').toISOString(),
    plannedEnd: batch.plannedEnd ?? dayjs().endOf('day').toISOString(),
    templateSource: `LIVE_READONLY: ${batch.templateCode ?? 'template missing'} / ${batch.templateName ?? 'template missing'}`,
    upstreamTemplateId: upstreamTemplateId ?? batch.templateId,
    downstreamTemplateId: downstreamTemplateId ?? batch.templateId,
    scheduleStatus: batch.assignedPeopleCount > 0 ? `真实 assignment ${batch.assignedPeopleCount} 人` : '暂无当前分配 / DATA GAP',
    solveStatus: '待真实 solver_v4 preview',
  };
}

function toWorkbenchTemplate(template: WorkbenchLiveTemplate): WorkbenchTemplate {
  return {
    id: template.id,
    templateCode: template.templateCode,
    templateName: template.templateName,
    domain: template.domain as TemplateDomain,
    sourceLabel: template.sourceLabel,
    operations: template.operations.map((operation) => ({
      templateOperationId: operation.templateOperationId,
      operationId: operation.operationId,
      operationCode: operation.operationCode,
      operationName: operation.operationName,
      stageId: operation.stageId,
      stageName: operation.stageName,
      stageOrder: operation.stageOrder,
      sequence: operation.sequence,
      offsetHours: operation.offsetHours,
      durationHours: operation.durationHours,
      requiredPeople: operation.requiredPeople,
      assignedPeople: 0,
      currentAssignments: [],
      qualificationRequirementCount: operation.qualificationRequirementCount,
      locked: false,
    })),
  };
}

function toWorkbenchOperation(operation: WorkbenchLiveOperation): WorkbenchOperation | null {
  if (!operation.originalStart || !operation.originalEnd || !operation.previewStart || !operation.previewEnd) {
    return null;
  }

  return {
    id: operation.id,
    operationPlanId: operation.operationPlanId,
    batchId: operation.batchId,
    batchCode: operation.batchCode,
    templateId: operation.templateId,
    templateName: operation.templateName ?? operation.templateCode ?? 'Unknown template',
    source: operation.source as TemplateDomain,
    sourceKind: 'BATCH_OPERATION',
    templateScheduleId: operation.templateScheduleId,
    operationId: operation.operationId,
    operationCode: operation.operationCode,
    stageId: operation.stageId,
    stageName: operation.stageName,
    stageOrder: operation.stageOrder,
    sequence: operation.sequence,
    operationName: operation.operationName,
    originalStart: operation.originalStart,
    originalEnd: operation.originalEnd,
    previewStart: operation.previewStart,
    previewEnd: operation.previewEnd,
    requiredPeople: operation.requiredPeople,
    assignedPeople: operation.assignedPeople,
    currentAssignments: operation.currentAssignments,
    assignments: operation.assignments,
    qualificationRequirements: operation.qualificationRequirements,
    qualificationRequirementCount: operation.qualificationRequirementCount,
    locked: operation.locked,
    movedHours: 0,
    dataGapWarnings: operation.dataGapWarnings,
  };
}

function operationMatchesTemplateKey(operation: WorkbenchOperation, key: string | null) {
  if (!key) return false;
  const [templateId, templateOperationId] = key.split(':').map(Number);
  return operation.templateId === templateId && operation.operationPlanId > 0 && (
    Number(operation.operationId) === templateOperationId ||
    Number(operation.templateScheduleId) === templateOperationId
  );
}

function buildCombinedOperations(options: {
  batch: WorkbenchBatch | null;
  batchOperations: WorkbenchOperation[];
  upstreamTemplate: WorkbenchTemplate | null;
  downstreamTemplate: WorkbenchTemplate | null;
  handoffConfig: HandoffConfig;
}) {
  const { batch, batchOperations, upstreamTemplate, downstreamTemplate, handoffConfig } = options;
  const warnings: string[] = [];

  if (!batch) {
    return {
      operations: batchOperations,
      dataGapWarnings: ['DATA GAP: 真实批次不足，无法组合 DS timeline。'],
    };
  }

  if (!upstreamTemplate || !downstreamTemplate) {
    warnings.push('DATA GAP: 真实上下游模板不足，甘特图仅展示当前批次已有 batch operation。');
  }

  const selectedTemplates = [upstreamTemplate, downstreamTemplate].filter((template): template is WorkbenchTemplate => Boolean(template));
  const selectedTemplateIds = new Set(selectedTemplates.map((template) => template.id));
  selectedTemplates.forEach((template) => {
    const hasRealBatchOperations = batchOperations.some((operation) => operation.templateId === template.id);
    if (!hasRealBatchOperations) {
      warnings.push(`DATA GAP: ${template.templateCode} 没有当前批次 batch_operation_plans；甘特图不会使用模板 operation 生成临时时间线补齐。`);
    }
  });

  if (batchOperations.length === 0) {
    warnings.push('DATA GAP: 当前批次没有真实 batch_operation_plans，无法渲染批次甘特图。');
  }

  const selectedBatchOperations = selectedTemplateIds.size > 0
    ? batchOperations.filter((operation) => selectedTemplateIds.has(operation.templateId))
    : batchOperations;
  const operations = (selectedBatchOperations.length > 0 ? selectedBatchOperations : batchOperations)
    .map((operation) => ({
      ...operation,
      isHandoffSource: operation.isHandoffSource || operationMatchesTemplateKey(operation, handoffConfig.upstreamOperationId),
      isHandoffTarget: operation.isHandoffTarget || operationMatchesTemplateKey(operation, handoffConfig.downstreamOperationId),
    }))
    .sort((a, b) => dayjs(a.originalStart).valueOf() - dayjs(b.originalStart).valueOf());

  return {
    operations,
    dataGapWarnings: Array.from(new Set([
      ...warnings,
      ...operations.flatMap((operation) => operation.dataGapWarnings),
    ])),
  };
}

function getOperationOptions(operations: WorkbenchOperation[]) {
  return operations.map((operation) => ({
    value: operation.id,
    label: `${operation.source} · ${operation.stageName} · ${operation.operationName}`,
  }));
}

function buildManualSelectionDefault(operations: WorkbenchOperation[], selectedOperationId: string | null) {
  if (!selectedOperationId) return [];
  const selectedIndex = operations.findIndex((operation) => operation.id === selectedOperationId);
  if (selectedIndex < 0) return [];
  return operations.slice(selectedIndex).map((operation) => operation.id);
}

function getTimelineWindow(operations: WorkbenchOperation[], batch: WorkbenchBatch | null) {
  const datedOperations = operations.filter((operation) => operation.operationPlanId > 0);
  const source = datedOperations.length > 0 ? datedOperations : operations;
  const starts = source.map((operation) => dayjs(operation.originalStart)).filter((value) => value.isValid());
  const ends = source.map((operation) => dayjs(operation.previewEnd || operation.originalEnd)).filter((value) => value.isValid());
  const start = starts.reduce((min, current) => (current.isBefore(min) ? current : min), starts[0] ?? dayjs(batch?.plannedStart));
  const end = ends.reduce((max, current) => (current.isAfter(max) ? current : max), ends[0] ?? dayjs(batch?.plannedEnd));
  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
  };
}

function dataModeColor(mode: WorkbenchDataMode | 'LOADING') {
  if (mode === 'LIVE_READONLY') return 'green';
  if (mode === 'MIXED_DATA') return 'amber';
  return 'red';
}

function buildSolverProposal(response: WorkbenchSolverPreviewResponse, activePreview: TimelinePreview): LocalProposal {
  const proposal = response.data!.proposal;
  const affectedSet = new Set(activePreview.affectedOperationIds);
  const affectedOperations = activePreview.operations.filter((operation) => affectedSet.has(operation.id));
  const assignmentByOperation = new Map<number, typeof proposal.assignments>();
  proposal.assignments.forEach((assignment) => {
    if (!assignmentByOperation.has(assignment.operation_plan_id)) {
      assignmentByOperation.set(assignment.operation_plan_id, []);
    }
    assignmentByOperation.get(assignment.operation_plan_id)!.push(assignment);
  });

  return {
    mode: 'SOLVER_V4',
    sourceLabel: `真实 solver_v4 preview · ${proposal.status}`,
    timelineSummary: {
      affectedOperationCount: activePreview.affectedOperationIds.length,
      maxMoveHours: activePreview.maxMoveHours,
      crossHandoff: activePreview.crossHandoff,
      nightShiftOperationCount: activePreview.nightShiftOperationIds.length,
      crossShiftOperationCount: activePreview.crossShiftOperationIds.length,
      lockedConflictCount: activePreview.lockedConflictIds.length,
      dataGapCount: activePreview.dataGapWarnings.length,
    },
    scheduleSummary: {
      stillValidAssignments: activePreview.operations
        .filter((operation) => !activePreview.movedOperationIds.includes(operation.id) && !operation.isInserted)
        .reduce((sum, operation) => sum + operation.assignedPeople, 0),
      invalidAssignments: affectedOperations.reduce((sum, operation) => sum + operation.assignedPeople, 0),
      newVacancies: proposal.vacant_positions,
      solverCovered: proposal.assigned_positions,
      uncoveredPositions: proposal.vacant_positions,
      supervisorAttention: proposal.vacant_positions > 0 || activePreview.lockedConflictIds.length > 0,
      expandScopeSuggested: activePreview.crossHandoff || proposal.vacant_positions > 0,
    },
    changes: affectedOperations.slice(0, 8).map((operation) => {
      const assignments = assignmentByOperation.get(operation.operationPlanId) ?? [];
      return {
        id: operation.id,
        operationName: operation.operationName,
        originalPersonnel: operation.currentAssignments.join(', ') || '暂无当前分配',
        proposedPersonnel: assignments.length > 0
          ? assignments.map((assignment) => `Employee ${assignment.employee_id}`).join(', ')
          : '真实 solver 未返回该 operation 的建议人员',
        reason: operation.movedHours === 0 ? '临时时间线未移动' : '临时时间线改变后由 solver_v4 重新匹配',
        qualificationStatus: assignments.length > 0 ? '由 solver_v4 输入候选人过滤' : '未覆盖',
        shiftStatus: assignments.length > 0 ? '由真实班次输入求解' : '无建议班次',
        timeConflict: operation.locked ? '存在 locked conflict' : '未发现 locked conflict',
        overtimeRisk: activePreview.crossShiftOperationIds.includes(operation.id) ? '跨班风险' : '低',
      };
    }),
    vacancies: affectedOperations
      .filter((operation) => (assignmentByOperation.get(operation.operationPlanId) ?? []).length < operation.requiredPeople)
      .slice(0, 8)
      .map((operation) => ({
        id: operation.id,
        operationName: operation.operationName,
        time: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
        requiredQualification: operation.qualificationRequirements && operation.qualificationRequirements.length > 0
          ? '真实 operation qualification requirements'
          : 'DATA GAP: 缺少 operation qualification requirements',
        reason: '真实 solver_v4 preview 未覆盖足够岗位',
        action: '扩大重排范围、调整策略或主管人工介入',
      })),
    suggestions: [
      '保持当前平移并采用真实 solver proposal',
      '扩大影响范围重新求解',
      '调整平移策略',
      '主管人工介入',
      '暂不应用，仅保存或导出预览',
    ],
    risks: [
      {
        constraint_code: 'WORKFORCE_COVERAGE_PREVIEW_ONLY',
        severity: proposal.vacant_positions > 0 ? 'warning' : 'info',
        hard_or_soft: 'soft',
        violation_message_template: '真实 solver_v4 preview 返回未覆盖岗位。',
      },
    ],
  };
}

const BatchManagementWorkbenchV2Page: React.FC = () => {
  const palette = useWxbPalette();
  const [context, setContext] = useState<WorkbenchLiveContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [upstreamTemplateId, setUpstreamTemplateId] = useState<number | null>(null);
  const [downstreamTemplateId, setDownstreamTemplateId] = useState<number | null>(null);
  const [handoffConfig, setHandoffConfig] = useState<HandoffConfig>({
    upstreamOperationId: null,
    downstreamOperationId: null,
    rule: 'immediate_handoff',
    manualOffsetHours: 2,
    manualAnchor: null,
  });
  const [timelineGenerated, setTimelineGenerated] = useState(true);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [strategy, setStrategy] = useState<ShiftStrategy>('current_remaining_and_following');
  const [manualOperationIds, setManualOperationIds] = useState<string[]>([]);
  const [exceptionDraft, setExceptionDraft] = useState<ExceptionDraft | null>(null);
  const [solverState, setSolverState] = useState<SolverState>('idle');
  const [solverMessage, setSolverMessage] = useState('未调用');
  const [proposal, setProposal] = useState<LocalProposal | null>(null);

  const loadContext = useCallback(async (batchId?: number | null) => {
    setLoading(true);
    try {
      const response = await batchWorkbenchV2Api.getLiveContext(batchId ?? undefined);
      setContext(response);
      setLoadError(response.success ? null : response.error ?? 'DATA GAP: 真实只读接口不可用');
      const nextBatchId = response.selectedBatchId ?? response.batches[0]?.id ?? null;
      setSelectedBatchId(nextBatchId);
      setUpstreamTemplateId(response.defaultUpstreamTemplateId);
      setDownstreamTemplateId(response.defaultDownstreamTemplateId);
    } catch (error: any) {
      setContext(null);
      setLoadError(`DATA GAP: 真实只读接口不可用：${error?.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const selectedLiveBatch = useMemo(
    () => context?.batches.find((batch) => batch.id === selectedBatchId) ?? context?.batches[0] ?? null,
    [context, selectedBatchId],
  );

  const templates = useMemo(
    () => (context?.templates ?? []).map(toWorkbenchTemplate),
    [context],
  );
  const upstreamTemplates = useMemo(() => templates.filter((template) => template.domain === 'USP'), [templates]);
  const downstreamTemplates = useMemo(() => templates.filter((template) => template.domain === 'DSP'), [templates]);
  const upstreamTemplate = useMemo(
    () => upstreamTemplates.find((template) => template.id === upstreamTemplateId) ?? upstreamTemplates[0] ?? null,
    [upstreamTemplateId, upstreamTemplates],
  );
  const downstreamTemplate = useMemo(
    () => downstreamTemplates.find((template) => template.id === downstreamTemplateId) ?? downstreamTemplates[0] ?? null,
    [downstreamTemplateId, downstreamTemplates],
  );

  const selectedBatch = useMemo(
    () => selectedLiveBatch ? toWorkbenchBatch(selectedLiveBatch, upstreamTemplate?.id ?? null, downstreamTemplate?.id ?? null) : null,
    [downstreamTemplate, selectedLiveBatch, upstreamTemplate],
  );

  const realBatchOperations = useMemo(
    () => (context?.batchOperations ?? []).map(toWorkbenchOperation).filter((operation): operation is WorkbenchOperation => operation !== null),
    [context],
  );

  useEffect(() => {
    setHandoffConfig((current) => ({
      ...current,
      upstreamOperationId: findDefaultHandoffOperation(upstreamTemplate ?? undefined, 'USP'),
      downstreamOperationId: findDefaultHandoffOperation(downstreamTemplate ?? undefined, 'DSP'),
    }));
    setPreviewGenerated(false);
    setProposal(null);
  }, [upstreamTemplate, downstreamTemplate]);

  const combined = useMemo(
    () => buildCombinedOperations({
      batch: selectedBatch,
      batchOperations: realBatchOperations,
      upstreamTemplate,
      downstreamTemplate,
      handoffConfig,
    }),
    [downstreamTemplate, handoffConfig, realBatchOperations, selectedBatch, upstreamTemplate],
  );

  const baseOperations = combined.operations;
  const defaultOperation = useMemo(
    () => baseOperations.find((operation) => operation.operationName.toLowerCase().includes('harvest')) ?? baseOperations[0],
    [baseOperations],
  );

  useEffect(() => {
    if (!selectedBatch || !defaultOperation) {
      setExceptionDraft(null);
      return;
    }

    setExceptionDraft((current) => {
      if (current?.affectedBatchId === selectedBatch.id && baseOperations.some((operation) => operation.id === current.affectedOperationId)) {
        return current;
      }
      return createExceptionDraft(selectedBatch, defaultOperation);
    });
    setManualOperationIds(buildManualSelectionDefault(baseOperations, defaultOperation.id));
  }, [baseOperations, defaultOperation, selectedBatch]);

  const preview: TimelinePreview = useMemo(() => {
    if (!selectedBatch || !defaultOperation) {
      return {
        operations: baseOperations,
        affectedOperationIds: [],
        movedOperationIds: [],
        unchangedOperationIds: baseOperations.map((operation) => operation.id),
        insertedOperationIds: [],
        maxMoveHours: 0,
        crossHandoff: false,
        nightShiftOperationIds: [],
        crossShiftOperationIds: [],
        lockedConflictIds: [],
        dataGapWarnings: combined.dataGapWarnings,
      };
    }

    return buildPreviewTimeline(
      baseOperations,
      exceptionDraft ?? createExceptionDraft(selectedBatch, defaultOperation),
      strategy,
      manualOperationIds,
    );
  }, [baseOperations, combined.dataGapWarnings, defaultOperation, exceptionDraft, manualOperationIds, selectedBatch, strategy]);

  const displayOperations = previewGenerated ? preview.operations : baseOperations;
  const ganttOrigin = useMemo(
    () => dayjs(displayOperations[0]?.originalStart ?? selectedBatch?.plannedStart ?? undefined).startOf('day'),
    [displayOperations, selectedBatch],
  );
  const ganttModel = useMemo(
    () => buildGanttModel(displayOperations, ganttOrigin, previewGenerated, palette),
    [displayOperations, ganttOrigin, palette, previewGenerated],
  );

  const selectedOperation = useMemo(
    () => baseOperations.find((operation) => operation.id === exceptionDraft?.affectedOperationId) ?? defaultOperation,
    [baseOperations, defaultOperation, exceptionDraft],
  );

  const operationOptions = useMemo(() => getOperationOptions(baseOperations), [baseOperations]);

  const updateExceptionOperation = useCallback((operationId: string) => {
    if (!selectedBatch) return;
    const operation = baseOperations.find((item) => item.id === operationId);
    if (!operation) return;
    setExceptionDraft((current) => ({
      ...(current ?? createExceptionDraft(selectedBatch, operation)),
      affectedOperationId: operation.id,
      originalStart: operation.originalStart,
      originalEnd: operation.originalEnd,
      expectedStart: operation.originalStart,
      expectedEnd: dayjs(operation.originalEnd).add(6, 'hour').toISOString(),
    }));
    setManualOperationIds(buildManualSelectionDefault(baseOperations, operation.id));
    setPreviewGenerated(false);
    setProposal(null);
  }, [baseOperations, selectedBatch]);

  const handleGenerateTimeline = useCallback(() => {
    setTimelineGenerated(true);
    setPreviewGenerated(true);
    setSolverState('idle');
    setSolverMessage('临时时间线已生成，尚未调用 solver_v4');
    setProposal(null);
  }, []);

  const applySolverResponseToProposal = useCallback((response: WorkbenchSolverPreviewResponse, activePreview: TimelinePreview) => {
    if (response.success && response.data?.proposal) {
      const noWorkforcePositions = response.data.proposal.total_positions === 0 && activePreview.operations.some((operation) => operation.operationPlanId > 0);
      if (noWorkforcePositions) {
        const gap = 'solver capability gap: 真实 solver_v4 preview 返回 0 个岗位需求，请检查 batch_operation_plans、operation_qualification_requirements、员工班次和资质输入。';
        setProposal(buildLocalProposal(activePreview, gap));
        setSolverState('gap');
        setSolverMessage(gap);
        return;
      }

      setProposal(buildSolverProposal(response, activePreview));
      setSolverState('done');
      setSolverMessage(`真实 solver_v4 preview 完成：${response.data.proposal.status}`);
      return;
    }

    const gap = response.capability_gap?.message ?? response.error ?? 'solver_v4 preview adapter returned no proposal';
    setProposal(buildLocalProposal(activePreview, gap));
    setSolverState('gap');
    setSolverMessage(gap);
  }, []);

  const runSolverPreview = useCallback(async (kind: 'initial' | 'reschedule') => {
    if (!selectedBatch || baseOperations.length === 0) {
      const gap = 'DATA GAP: 没有真实 batch operation timeline，无法调用 solver_v4 preview。';
      setProposal(buildLocalProposal(preview, gap));
      setSolverState('gap');
      setSolverMessage(gap);
      return;
    }

    const activePreview = kind === 'reschedule'
      ? preview
      : buildPreviewTimeline(baseOperations, exceptionDraft ?? createExceptionDraft(selectedBatch, defaultOperation ?? baseOperations[0]), 'record_only', []);
    const realOperationsForSolver = activePreview.operations.filter((operation) => operation.operationPlanId > 0 && !operation.isInserted);
    if (realOperationsForSolver.length === 0) {
      const gap = 'DATA GAP: 当前组合 timeline 没有真实 batch_operation_plan_id，无法构造 solver_v4 输入。';
      setProposal(buildLocalProposal(activePreview, gap));
      setSolverState('gap');
      setSolverMessage(gap);
      return;
    }

    const movedOperations = kind === 'reschedule'
      ? activePreview.operations.filter((operation) => activePreview.movedOperationIds.includes(operation.id) && !operation.isInserted && operation.operationPlanId > 0)
      : [];
    const affectedRealOperations = kind === 'reschedule'
      ? activePreview.operations.filter((operation) => activePreview.affectedOperationIds.includes(operation.id) && !operation.isInserted && operation.operationPlanId > 0)
      : [];
    const solverScopeOperations = kind === 'reschedule' && affectedRealOperations.length > 0
      ? affectedRealOperations
      : realOperationsForSolver;
    const window = getTimelineWindow(solverScopeOperations, selectedBatch);

    setSolverState('running');
    setSolverMessage(kind === 'reschedule' ? '正在请求真实 solver_v4 局部重排 preview...' : '正在请求真实 solver_v4 初始排班 preview...');

    try {
      const response = await batchWorkbenchV2Api.previewProposal({
        start_date: window.startDate,
        end_date: window.endDate,
        batch_ids: [selectedBatch.id],
        time_overrides: movedOperations.map((operation) => ({
          operation_plan_id: operation.operationPlanId,
          planned_start: operation.previewStart,
          planned_end: operation.previewEnd,
        })),
        affected_operation_plan_ids: activePreview.affectedOperationIds
          .map((id) => activePreview.operations.find((operation) => operation.id === id)?.operationPlanId)
          .filter((id): id is number => Number.isFinite(id) && Number(id) > 0),
        solve_range: {
          start_date: window.startDate,
          end_date: window.endDate,
        },
        config: {
          enable_standalone_tasks: false,
          preview_source: 'batch_workbench_v2_live_readonly',
        },
      });

      applySolverResponseToProposal(response, activePreview);
    } catch (error: any) {
      const gap = `solver capability gap: ${error?.response?.status === 404 ? '真实 preview endpoint 未注册或后端进程未重启' : error?.message ?? 'preview adapter unavailable'}`;
      setProposal(buildLocalProposal(activePreview, gap));
      setSolverState('gap');
      setSolverMessage(gap);
    }
  }, [applySolverResponseToProposal, baseOperations, defaultOperation, exceptionDraft, preview, selectedBatch]);

  const selectedRule = SHIFT_STRATEGY_OPTIONS.find((item) => item.value === strategy);
  const allDataGaps = useMemo(
    () => Array.from(new Set([...(context?.dataGaps.map((gap) => gap.message) ?? []), ...combined.dataGapWarnings, ...preview.dataGapWarnings])),
    [combined.dataGapWarnings, context, preview.dataGapWarnings],
  );

  const demandRows = useMemo(
    () => displayOperations.map((operation) => ({
      key: operation.id,
      operationName: operation.operationName,
      sourceKind: operation.sourceKind === 'BATCH_OPERATION' ? 'LIVE batch operation' : 'Preview-only inserted row',
      scope: `${operation.source} / ${operation.stageName}`,
      time: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
      requiredPeople: operation.requiredPeople,
      assignedPeople: operation.assignedPeople,
      qualificationCount: operation.qualificationRequirementCount ?? 0,
      status: operation.operationPlanId <= 0
        ? 'DATA GAP'
        : operation.locked
          ? 'Locked'
          : operation.requiredPeople <= operation.assignedPeople
            ? '覆盖'
            : '缺口',
    })),
    [displayOperations],
  );

  const assignmentRows = useMemo(
    () => displayOperations.flatMap((operation) =>
      operation.currentAssignments.length > 0
        ? operation.currentAssignments.map((person, index) => ({
          key: `${operation.id}-${person}-${index}`,
          operationName: operation.operationName,
          person,
          time: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
          state: previewGenerated && preview.movedOperationIds.includes(operation.id) ? '需重排确认' : '真实当前分配',
        }))
        : [{
          key: `${operation.id}-no-assignment`,
          operationName: operation.operationName,
          person: '暂无当前分配',
          time: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
          state: operation.operationPlanId > 0 ? 'DATA GAP' : '模板 preview 无分配',
        }],
    ),
    [displayOperations, preview.movedOperationIds, previewGenerated],
  );

  const instanceRows = useMemo(
    () => displayOperations.map((operation) => ({
      key: operation.id,
      templateName: operation.templateName,
      domain: operation.source,
      sourceKind: operation.sourceKind === 'BATCH_OPERATION' ? 'LIVE_READONLY' : 'DATA_GAP',
      stageName: operation.stageName,
      operationName: operation.operationName,
      operationPlanId: operation.operationPlanId > 0 ? operation.operationPlanId : '无实例',
      original: `${formatDateTime(operation.originalStart)} - ${formatDateTime(operation.originalEnd)}`,
      preview: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
      movedHours: operation.movedHours.toFixed(1),
    })),
    [displayOperations],
  );

  const auditRows = useMemo(
    () => context?.dataSourceAudit.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      currentSource: item.currentSource,
      targetSource: item.targetSource,
      gap: item.gap ?? '无',
      affectsBusinessCredibility: item.affectsBusinessCredibility ? '是' : '否',
    })) ?? [],
    [context],
  );

  const gapRows = useMemo(
    () => allDataGaps.map((message, index) => ({ key: `${index}-${message}`, message })),
    [allDataGaps],
  );

  const demandColumns: ColumnsType<any> = [
    { title: 'operation', dataIndex: 'operationName', key: 'operationName' },
    { title: '数据源', dataIndex: 'sourceKind', key: 'sourceKind', width: 160 },
    { title: '范围', dataIndex: 'scope', key: 'scope' },
    { title: '时间', dataIndex: 'time', key: 'time' },
    { title: '需求', dataIndex: 'requiredPeople', key: 'requiredPeople', width: 72 },
    { title: '资质规则', dataIndex: 'qualificationCount', key: 'qualificationCount', width: 92 },
    { title: '当前', dataIndex: 'assignedPeople', key: 'assignedPeople', width: 72 },
    {
      title: '覆盖',
      dataIndex: 'status',
      key: 'status',
      width: 108,
      render: (value: string) => <WxbTag color={value === '覆盖' ? 'green' : value === 'DATA GAP' ? 'amber' : value === 'Locked' ? 'amber' : 'red'}>{value}</WxbTag>,
    },
  ];

  const assignmentColumns: ColumnsType<any> = [
    { title: 'operation', dataIndex: 'operationName', key: 'operationName' },
    { title: '人员', dataIndex: 'person', key: 'person', width: 160 },
    { title: '时间', dataIndex: 'time', key: 'time' },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 150,
      render: (value: string) => <WxbTag color={value.includes('真实') ? 'green' : 'amber'}>{value}</WxbTag>,
    },
  ];

  const instanceColumns: ColumnsType<any> = [
    { title: '模板', dataIndex: 'templateName', key: 'templateName' },
    { title: '段', dataIndex: 'domain', key: 'domain', width: 72 },
    { title: '数据模式', dataIndex: 'sourceKind', key: 'sourceKind', width: 120 },
    { title: 'operation plan', dataIndex: 'operationPlanId', key: 'operationPlanId', width: 120 },
    { title: 'stage', dataIndex: 'stageName', key: 'stageName' },
    { title: 'operation', dataIndex: 'operationName', key: 'operationName' },
    { title: 'Original timeline', dataIndex: 'original', key: 'original' },
    { title: 'Preview timeline', dataIndex: 'preview', key: 'preview' },
    { title: '移动(h)', dataIndex: 'movedHours', key: 'movedHours', width: 96 },
  ];

  const auditColumns: ColumnsType<any> = [
    { title: '数据项', dataIndex: 'label', key: 'label', width: 180 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 130, render: (value: string) => <WxbTag color={value === 'LIVE_READONLY' ? 'green' : value === 'MIXED_DATA' ? 'amber' : 'red'}>{value}</WxbTag> },
    { title: '当前来源', dataIndex: 'currentSource', key: 'currentSource' },
    { title: '目标真实来源', dataIndex: 'targetSource', key: 'targetSource' },
    { title: '缺口', dataIndex: 'gap', key: 'gap' },
    { title: '影响可信度', dataIndex: 'affectsBusinessCredibility', key: 'affectsBusinessCredibility', width: 100 },
  ];

  const changeColumns: ColumnsType<any> = [
    { title: 'operation', dataIndex: 'operationName', key: 'operationName' },
    { title: '原人员', dataIndex: 'originalPersonnel', key: 'originalPersonnel' },
    { title: '新建议人员', dataIndex: 'proposedPersonnel', key: 'proposedPersonnel' },
    { title: '变更原因', dataIndex: 'reason', key: 'reason' },
    { title: '资质', dataIndex: 'qualificationStatus', key: 'qualificationStatus' },
    { title: '在班', dataIndex: 'shiftStatus', key: 'shiftStatus' },
    { title: '时间冲突', dataIndex: 'timeConflict', key: 'timeConflict' },
    { title: '加班风险', dataIndex: 'overtimeRisk', key: 'overtimeRisk' },
  ];

  const vacancyColumns: ColumnsType<any> = [
    { title: 'operation', dataIndex: 'operationName', key: 'operationName' },
    { title: '时间', dataIndex: 'time', key: 'time' },
    { title: '需要资质', dataIndex: 'requiredQualification', key: 'requiredQualification' },
    { title: '未覆盖原因', dataIndex: 'reason', key: 'reason' },
    { title: '建议动作', dataIndex: 'action', key: 'action' },
  ];

  const currentMode: WorkbenchDataMode | 'LOADING' = loading ? 'LOADING' : context?.dataMode ?? 'DATA_GAP';
  const canGeneratePreview = baseOperations.length > 0 && Boolean(exceptionDraft);
  const canRunSolver = previewGenerated && baseOperations.some((operation) => operation.operationPlanId > 0);

  return (
    <div className="batch-workbench-v2">
      <section className="batch-workbench-v2__header">
        <div>
          <div className="batch-workbench-v2__eyebrow">Batch Management Workbench V2</div>
          <h1>批次管理工作台 V2</h1>
          <p>真实只读数据工作台：批次、模板、operation、人员需求、当前分配和 solver preview 均从现有数据库/API 读取；缺失时显示 DATA GAP。</p>
        </div>
        <div className="batch-workbench-v2__header-tags">
          <WxbTag color="amber">Preview only</WxbTag>
          <WxbTag color={dataModeColor(currentMode)}>{currentMode}</WxbTag>
          <WxbTag color={proposal?.mode === 'SOLVER_V4' ? 'green' : solverState === 'gap' ? 'amber' : 'neutral'}>{solverMessage}</WxbTag>
        </div>
      </section>

      <WxbAlert title="Preview only，不会修改正式计划或排班">
        本页只读取真实数据并在内存中生成 preview；不写入 batch_operation_plans、batch_personnel_assignments、employee_shift_plans 或 scheduling_results。
      </WxbAlert>

      {loadError && (
        <WxbAlert title="Data Gap Warning">
          {loadError}
        </WxbAlert>
      )}

      {gapRows.length > 0 && (
        <WxbAlert title="Data Gap Warning">
          {gapRows.slice(0, 4).map((gap) => gap.message).join('；')}
        </WxbAlert>
      )}

      <section className="batch-workbench-v2__top-grid">
        <WxbCard className="batch-workbench-v2__panel">
          <div className="batch-workbench-v2__panel-title">
            <WxbIcon name="lot" size={18} />
            <span>批次选择与总览</span>
          </div>
          {context && selectedLiveBatch && selectedBatch ? (
            <div className="batch-workbench-v2__control-grid">
              <WxbSelect
                label="批次"
                value={selectedLiveBatch.id}
                options={context.batches.map((batch) => ({ value: batch.id, label: `${batch.batchCode} · ${batch.batchStatus}` }))}
                onChange={(value) => {
                  const nextId = Number(value);
                  setSelectedBatchId(nextId);
                  setPreviewGenerated(false);
                  setProposal(null);
                  loadContext(nextId);
                }}
              />
              <div className="batch-workbench-v2__summary-list">
                <span>批次号：{selectedLiveBatch.batchCode}</span>
                <span>批次状态：{selectedLiveBatch.batchStatus}</span>
                <span>计划：{formatDateTime(selectedBatch.plannedStart)} - {formatDateTime(selectedBatch.plannedEnd)}</span>
                <span>模板来源：{selectedBatch.templateSource}</span>
                <span>当前排班状态：{selectedBatch.scheduleStatus}</span>
                <span>当前求解状态：{proposal ? proposal.sourceLabel : selectedBatch.solveStatus}</span>
                <span>异常预览：{previewGenerated ? '存在' : '无'}</span>
                <span>未应用 proposal：{proposal ? '存在' : '无'}</span>
              </div>
            </div>
          ) : (
            <WxbEmpty description={loading ? '正在加载真实只读批次数据' : 'DATA GAP: 没有真实批次可选'} />
          )}
        </WxbCard>

        <WxbCard className="batch-workbench-v2__panel batch-workbench-v2__panel--wide">
          <div className="batch-workbench-v2__panel-title">
            <WxbIcon name="flow-divert" size={18} />
            <span>上下游模板联动</span>
          </div>
          <div className="batch-workbench-v2__linkage-grid">
            <WxbSelect
              label="上游模板"
              value={upstreamTemplate?.id}
              options={upstreamTemplates.map((template) => ({ value: template.id, label: `${template.templateCode} · ${template.templateName}` }))}
              onChange={(value) => setUpstreamTemplateId(Number(value))}
              disabled={upstreamTemplates.length === 0}
            />
            <WxbSelect
              label="下游模板"
              value={downstreamTemplate?.id}
              options={downstreamTemplates.map((template) => ({ value: template.id, label: `${template.templateCode} · ${template.templateName}` }))}
              onChange={(value) => setDownstreamTemplateId(Number(value))}
              disabled={downstreamTemplates.length === 0}
            />
            <WxbSelect
              label="上游连接 operation"
              value={handoffConfig.upstreamOperationId ?? undefined}
              options={(upstreamTemplate?.operations ?? []).map((operation) => ({
                value: toTemplateOperationKey(upstreamTemplate!.id, operation.templateOperationId),
                label: `${operation.stageName} · ${operation.operationName}`,
              }))}
              onChange={(value) => setHandoffConfig((current) => ({ ...current, upstreamOperationId: String(value) }))}
              disabled={!upstreamTemplate?.operations.length}
            />
            <WxbSelect
              label="下游连接 operation"
              value={handoffConfig.downstreamOperationId ?? undefined}
              options={(downstreamTemplate?.operations ?? []).map((operation) => ({
                value: toTemplateOperationKey(downstreamTemplate!.id, operation.templateOperationId),
                label: `${operation.stageName} · ${operation.operationName}`,
              }))}
              onChange={(value) => setHandoffConfig((current) => ({ ...current, downstreamOperationId: String(value) }))}
              disabled={!downstreamTemplate?.operations.length}
            />
            <WxbSelect
              label="连接规则"
              value={handoffConfig.rule}
              options={CONNECTION_RULE_OPTIONS}
              onChange={(value) => setHandoffConfig((current) => ({ ...current, rule: value as ConnectionRule }))}
            />
            <WxbInput
              label="Manual Offset (hours)"
              type="number"
              min={0}
              value={handoffConfig.manualOffsetHours}
              onChange={(event) => setHandoffConfig((current) => ({ ...current, manualOffsetHours: Number(event.target.value || 0) }))}
            />
          </div>
          <div className="batch-workbench-v2__action-row">
            <WxbButton type="button" onClick={() => { setTimelineGenerated(true); setPreviewGenerated(false); setProposal(null); }}>
              <WxbIcon name="recipe" size={16} />
              生成组合 DS 甘特图
            </WxbButton>
            <WxbButton type="button" variant="secondary" onClick={() => runSolverPreview('initial')} disabled={!selectedBatch || solverState === 'running'}>
              <WxbIcon name="kanban" size={16} />
              生成初始排班预览
            </WxbButton>
            <WxbTag color={upstreamTemplate && downstreamTemplate ? 'green' : 'amber'}>
              {upstreamTemplate && downstreamTemplate ? '真实模板链路已配置' : 'DATA GAP: 只能查看单段或等待数据补齐'}
            </WxbTag>
          </div>
        </WxbCard>
      </section>

      <section className="batch-workbench-v2__workspace">
        <div className="batch-workbench-v2__gantt-zone">
          <WxbCard noPadding className="batch-workbench-v2__gantt-card">
            <div className="batch-workbench-v2__gantt-header">
              <div>
                <h2>完整 DS 批次甘特图</h2>
                <p>复用现有 WxbGanttChart；只展示真实 batch operation，缺少下游批次实例时显示 DATA GAP。</p>
              </div>
              <div className="batch-workbench-v2__legend">
                <span><i className="batch-workbench-v2__legend-dot batch-workbench-v2__legend-dot--usp" />USP operations</span>
                <span><i className="batch-workbench-v2__legend-dot batch-workbench-v2__legend-dot--dsp" />DSP operations</span>
                <span><i className="batch-workbench-v2__legend-dot batch-workbench-v2__legend-dot--preview" />Preview timeline</span>
                <span><i className="batch-workbench-v2__legend-dot batch-workbench-v2__legend-dot--handoff" />handoff 点</span>
              </div>
            </div>
            {timelineGenerated && ganttModel.tasks.length > 0 ? (
              <div className="batch-workbench-v2__gantt-frame" data-testid="batch-workbench-v2-gantt">
                <WxbGanttChart
                  tasks={ganttModel.tasks}
                  groups={ganttModel.groups}
                  dependencies={ganttModel.dependencies}
                  timeUnit="day"
                  rowHeight={34}
                  sidebarWidth={280}
                  showMinimap
                  showSelectionPanel={false}
                  readOnly
                  initialDayWidth={130}
                  onTaskClick={(task) => {
                    const operationId = task.data?.operationId;
                    if (typeof operationId === 'string' && baseOperations.some((operation) => operation.id === operationId)) {
                      updateExceptionOperation(operationId);
                    }
                  }}
                />
              </div>
            ) : (
              <WxbEmpty description="DATA GAP: 没有真实 operation 可渲染甘特图" />
            )}
          </WxbCard>
        </div>

        <aside className="batch-workbench-v2__side-panel">
          <WxbCard className="batch-workbench-v2__panel">
            <div className="batch-workbench-v2__panel-title">
              <WxbIcon name="harvest" size={18} />
              <span>生产异常录入</span>
            </div>
            {exceptionDraft && selectedOperation ? (
              <div className="batch-workbench-v2__form-stack">
                <WxbSelect
                  label="异常 operation"
                  value={exceptionDraft.affectedOperationId ?? undefined}
                  options={operationOptions}
                  onChange={(value) => updateExceptionOperation(String(value))}
                />
                <WxbSelect
                  label="异常类型"
                  value={exceptionDraft.exceptionType}
                  options={EXCEPTION_TYPE_OPTIONS}
                  onChange={(value) => setExceptionDraft((current) => current ? { ...current, exceptionType: value as ExceptionDraft['exceptionType'] } : current)}
                />
                <div className="batch-workbench-v2__time-pair">
                  <WxbInput label="原计划开始" value={formatDateTime(exceptionDraft.originalStart)} disabled />
                  <WxbInput label="原计划结束" value={formatDateTime(exceptionDraft.originalEnd)} disabled />
                </div>
                <div className="batch-workbench-v2__time-pair">
                  <WxbInput
                    label="新预计开始"
                    type="datetime-local"
                    value={toDateTimeLocalValue(exceptionDraft.expectedStart)}
                    onChange={(event) => setExceptionDraft((current) => current ? { ...current, expectedStart: fromDateTimeLocalValue(event.target.value) } : current)}
                  />
                  <WxbInput
                    label="新预计结束"
                    type="datetime-local"
                    value={toDateTimeLocalValue(exceptionDraft.expectedEnd)}
                    onChange={(event) => setExceptionDraft((current) => current ? { ...current, expectedEnd: fromDateTimeLocalValue(event.target.value) } : current)}
                  />
                </div>
                <WxbTextarea
                  label="异常说明"
                  value={exceptionDraft.description}
                  onChange={(event) => setExceptionDraft((current) => current ? { ...current, description: event.target.value } : current)}
                />
                <WxbCheckbox
                  checked={exceptionDraft.callSolver}
                  onChange={(checked) => setExceptionDraft((current) => current ? { ...current, callSolver: checked } : current)}
                >
                  调用 solver_v4 生成局部重排 preview
                </WxbCheckbox>
                <WxbCheckbox checked={exceptionDraft.previewOnly} disabled>
                  只做 preview，不直接应用
                </WxbCheckbox>
              </div>
            ) : (
              <WxbEmpty description="DATA GAP: 需要真实 operation 才能录入异常" />
            )}
          </WxbCard>

          <WxbCard className="batch-workbench-v2__panel">
            <div className="batch-workbench-v2__panel-title">
              <WxbIcon name="flow-divert" size={18} />
              <span>平移策略</span>
            </div>
            <div className="batch-workbench-v2__form-stack">
              <WxbSelect
                label="策略"
                value={strategy}
                options={SHIFT_STRATEGY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={(value) => { setStrategy(value as ShiftStrategy); setPreviewGenerated(false); setProposal(null); }}
                disabled={!canGeneratePreview}
              />
              {selectedRule && <p className="batch-workbench-v2__helper">{selectedRule.description}</p>}
              {strategy === 'manual_operations' && (
                <div className="batch-workbench-v2__manual-list">
                  {baseOperations.map((operation) => (
                    <WxbCheckbox
                      key={operation.id}
                      checked={manualOperationIds.includes(operation.id)}
                      onChange={(checked) => {
                        setManualOperationIds((current) => checked
                          ? Array.from(new Set([...current, operation.id]))
                          : current.filter((id) => id !== operation.id));
                      }}
                    >
                      {operation.source} · {operation.operationName}
                    </WxbCheckbox>
                  ))}
                </div>
              )}
              <div className="batch-workbench-v2__action-column">
                <WxbButton type="button" onClick={handleGenerateTimeline} disabled={!canGeneratePreview}>
                  生成 before / after 临时时间线
                </WxbButton>
                <WxbButton
                  type="button"
                  variant="secondary"
                  disabled={!canRunSolver || solverState === 'running'}
                  onClick={() => runSolverPreview('reschedule')}
                >
                  调用 solver_v4 局部重排 preview
                </WxbButton>
                <WxbButton type="button" variant="ghost" disabled>
                  Apply 后续功能，当前禁用
                </WxbButton>
              </div>
            </div>
          </WxbCard>
        </aside>
      </section>

      <section className="batch-workbench-v2__summary-grid">
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">受影响 operation 数量</span>
          <strong>{previewGenerated ? preview.affectedOperationIds.length : 0}</strong>
        </WxbCard>
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">最大平移时长</span>
          <strong>{previewGenerated ? `${preview.maxMoveHours.toFixed(1)}h` : '0h'}</strong>
        </WxbCard>
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">跨上下游 handoff</span>
          <strong>{previewGenerated && preview.crossHandoff ? '是' : '否'}</strong>
        </WxbCard>
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">进入夜班 / 跨班</span>
          <strong>{previewGenerated ? `${preview.nightShiftOperationIds.length} / ${preview.crossShiftOperationIds.length}` : '0 / 0'}</strong>
        </WxbCard>
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">locked conflict</span>
          <strong>{previewGenerated ? preview.lockedConflictIds.length : 0}</strong>
        </WxbCard>
        <WxbCard>
          <span className="batch-workbench-v2__metric-label">Data Gap</span>
          <strong>{allDataGaps.length}</strong>
        </WxbCard>
      </section>

      <section className="batch-workbench-v2__bottom-grid">
        <WxbCard className="batch-workbench-v2__panel">
          <div className="batch-workbench-v2__panel-title">
            <WxbIcon name="recipe" size={18} />
            <span>模板到批次实例视图</span>
          </div>
          <WxbDataTable columns={instanceColumns} dataSource={instanceRows} pagination={false} size="small" rowKey="key" scroll={{ x: 1180 }} />
        </WxbCard>

        <WxbCard className="batch-workbench-v2__panel">
          <div className="batch-workbench-v2__panel-title">
            <WxbIcon name="kanban" size={18} />
            <span>人员需求与当前排班</span>
          </div>
          <div className="batch-workbench-v2__table-stack">
            <WxbDataTable columns={demandColumns} dataSource={demandRows} pagination={false} size="small" rowKey="key" scroll={{ x: 980 }} />
            <WxbDivider />
            <WxbDataTable columns={assignmentColumns} dataSource={assignmentRows} pagination={false} size="small" rowKey="key" scroll={{ x: 760 }} />
          </div>
        </WxbCard>
      </section>

      <WxbCard className="batch-workbench-v2__panel">
        <div className="batch-workbench-v2__panel-title">
          <WxbIcon name="released" size={18} />
          <span>数据源审计</span>
        </div>
        <WxbDataTable columns={auditColumns} dataSource={auditRows} pagination={false} size="small" rowKey="key" scroll={{ x: 1120 }} />
      </WxbCard>

      <WxbCard className="batch-workbench-v2__panel">
        <div className="batch-workbench-v2__panel-title">
          <WxbIcon name="warning" size={18} />
          <span>Data Gap</span>
        </div>
        {gapRows.length > 0 ? (
          <WxbDataTable
            columns={[{ title: '缺口说明', dataIndex: 'message', key: 'message' }]}
            dataSource={gapRows}
            pagination={false}
            size="small"
            rowKey="key"
          />
        ) : (
          <WxbEmpty description="当前核心数据源为 LIVE_READONLY" />
        )}
      </WxbCard>

      <section className="batch-workbench-v2__proposal">
        <WxbCard className="batch-workbench-v2__panel">
          <div className="batch-workbench-v2__proposal-header">
            <div className="batch-workbench-v2__panel-title">
              <WxbIcon name="released" size={18} />
              <span>重排 proposal</span>
            </div>
            <WxbTag color={proposal?.mode === 'SOLVER_V4' ? 'green' : proposal?.mode === 'CAPABILITY_GAP' ? 'amber' : 'neutral'}>
              {proposal ? proposal.sourceLabel : '尚未生成'}
            </WxbTag>
          </div>

          {proposal ? (
            <>
              <div className="batch-workbench-v2__proposal-metrics">
                <span>原 assignment 仍有效：<strong>{proposal.scheduleSummary.stillValidAssignments}</strong></span>
                <span>原 assignment 失效：<strong>{proposal.scheduleSummary.invalidAssignments}</strong></span>
                <span>新增 vacancy：<strong>{proposal.scheduleSummary.newVacancies}</strong></span>
                <span>solver 覆盖：<strong>{proposal.scheduleSummary.solverCovered}</strong></span>
                <span>未覆盖岗位：<strong>{proposal.scheduleSummary.uncoveredPositions}</strong></span>
                <span>主管关注：<strong>{proposal.scheduleSummary.supervisorAttention ? '需要' : '暂不需要'}</strong></span>
                <span>建议扩大范围：<strong>{proposal.scheduleSummary.expandScopeSuggested ? '是' : '否'}</strong></span>
              </div>

              {proposal.capabilityGap && (
                <WxbAlert title="solver capability gap">
                  {proposal.capabilityGap}
                </WxbAlert>
              )}

              <div className="batch-workbench-v2__proposal-tables">
                <WxbDataTable columns={changeColumns} dataSource={proposal.changes} pagination={false} size="small" rowKey="id" scroll={{ x: 1160 }} />
                <WxbDataTable columns={vacancyColumns} dataSource={proposal.vacancies} pagination={false} size="small" rowKey="id" scroll={{ x: 960 }} />
              </div>

              <div className="batch-workbench-v2__suggestions">
                {proposal.suggestions.map((suggestion) => (
                  <WxbTag key={suggestion} color="blue">{suggestion}</WxbTag>
                ))}
              </div>
            </>
          ) : (
            <WxbEmpty description="先生成临时时间线，再触发真实 solver_v4 preview 或查看 capability gap。" />
          )}
        </WxbCard>
      </section>
    </div>
  );
};

export default BatchManagementWorkbenchV2Page;
