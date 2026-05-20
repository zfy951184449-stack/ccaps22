import dayjs, { Dayjs } from 'dayjs';
import type { GanttDependency, GanttGroup, GanttTask } from '../../components/wxb-ui/GanttChart/types';

export type TemplateDomain = 'USP' | 'DSP' | 'UNKNOWN';

export type ConnectionRule =
  | 'manual_offset'
  | 'immediate_handoff'
  | 'next_shift'
  | 'next_day'
  | 'manual_anchor';

export type ShiftStrategy =
  | 'current_operation'
  | 'current_stage'
  | 'current_stage_remaining'
  | 'following_stages'
  | 'current_remaining_and_following'
  | 'manual_operations'
  | 'insert_wait'
  | 'insert_extra_task'
  | 'record_only'
  | 'confirmed_pull_forward';

export type ExceptionType =
  | 'harvest_delay'
  | 'operation_overtime'
  | 'early_finish'
  | 'deep_filter_transfer_block'
  | 'capture_chrom_interrupt'
  | 'buffer_not_ready'
  | 'cip_sip_incomplete'
  | 'uf_df_flux_drop'
  | 'qc_ipc_pending'
  | 'single_use_leak'
  | 'utility_interruption'
  | 'other';

export interface WorkbenchBatch {
  id: number;
  batchCode: string;
  batchStatus: string;
  plannedStart: string;
  plannedEnd: string;
  templateSource: string;
  upstreamTemplateId: number;
  downstreamTemplateId: number;
  scheduleStatus: string;
  solveStatus: string;
}

export interface WorkbenchTemplateOperation {
  templateOperationId: number;
  operationId?: number;
  operationCode?: string | null;
  operationName: string;
  stageName: string;
  stageId?: number | null;
  stageOrder: number;
  sequence: number;
  offsetHours: number;
  durationHours: number;
  requiredPeople: number;
  assignedPeople: number;
  currentAssignments: string[];
  qualificationRequirementCount?: number;
  locked?: boolean;
}

export interface WorkbenchTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  domain: TemplateDomain;
  sourceLabel: string;
  operations: WorkbenchTemplateOperation[];
}

export interface HandoffConfig {
  upstreamOperationId: string | null;
  downstreamOperationId: string | null;
  rule: ConnectionRule;
  manualOffsetHours: number;
  manualAnchor?: string | null;
}

export interface WorkbenchOperation {
  id: string;
  operationPlanId: number;
  batchId: number;
  batchCode: string;
  templateId: number;
  templateName: string;
  source: TemplateDomain | 'PREVIEW';
  sourceKind?: 'BATCH_OPERATION' | 'TEMPLATE_OPERATION' | 'PREVIEW_INSERT';
  templateScheduleId?: number | null;
  operationId?: number;
  operationCode?: string | null;
  stageName: string;
  stageId?: number | null;
  stageOrder: number;
  sequence: number;
  operationName: string;
  originalStart: string;
  originalEnd: string;
  previewStart: string;
  previewEnd: string;
  requiredPeople: number;
  assignedPeople: number;
  currentAssignments: string[];
  assignments?: unknown[];
  qualificationRequirements?: unknown[];
  qualificationRequirementCount?: number;
  locked: boolean;
  movedHours: number;
  isHandoffSource?: boolean;
  isHandoffTarget?: boolean;
  isInserted?: boolean;
  dataGapWarnings: string[];
}

export interface ExceptionDraft {
  exceptionType: ExceptionType;
  affectedBatchId: number;
  affectedOperationId: string | null;
  originalStart: string;
  originalEnd: string;
  expectedStart: string;
  expectedEnd: string;
  description: string;
  callSolver: boolean;
  previewOnly: boolean;
}

export interface TimelinePreview {
  operations: WorkbenchOperation[];
  affectedOperationIds: string[];
  movedOperationIds: string[];
  unchangedOperationIds: string[];
  insertedOperationIds: string[];
  maxMoveHours: number;
  crossHandoff: boolean;
  nightShiftOperationIds: string[];
  crossShiftOperationIds: string[];
  lockedConflictIds: string[];
  dataGapWarnings: string[];
}

export interface ProposalChange {
  id: string;
  operationName: string;
  originalPersonnel: string;
  proposedPersonnel: string;
  reason: string;
  qualificationStatus: string;
  shiftStatus: string;
  timeConflict: string;
  overtimeRisk: string;
}

export interface VacancyItem {
  id: string;
  operationName: string;
  time: string;
  requiredQualification: string;
  reason: string;
  action: string;
}

export interface LocalProposal {
  mode: 'LOCAL_PREVIEW' | 'SOLVER_V4' | 'CAPABILITY_GAP';
  sourceLabel: string;
  timelineSummary: {
    affectedOperationCount: number;
    maxMoveHours: number;
    crossHandoff: boolean;
    nightShiftOperationCount: number;
    crossShiftOperationCount: number;
    lockedConflictCount: number;
    dataGapCount: number;
  };
  scheduleSummary: {
    stillValidAssignments: number;
    invalidAssignments: number;
    newVacancies: number;
    solverCovered: number;
    uncoveredPositions: number;
    supervisorAttention: boolean;
    expandScopeSuggested: boolean;
  };
  changes: ProposalChange[];
  vacancies: VacancyItem[];
  suggestions: string[];
  risks: Array<{
    constraint_code: string;
    severity: 'info' | 'warning' | 'critical';
    hard_or_soft: 'hard' | 'soft';
    violation_message_template: string;
  }>;
  capabilityGap?: string;
}

export interface WorkbenchGanttModel {
  tasks: GanttTask[];
  groups: GanttGroup[];
  dependencies: GanttDependency[];
}

export interface WorkbenchPalette {
  usp: string;
  dsp: string;
  original: string;
  preview: string;
  conflict: string;
  handoff: string;
  inserted: string;
}

export const DEFAULT_WORKBENCH_PALETTE: WorkbenchPalette = {
  usp: '',
  dsp: '',
  original: '',
  preview: '',
  conflict: '',
  handoff: '',
  inserted: '',
};

export const CONNECTION_RULE_OPTIONS: Array<{ value: ConnectionRule; label: string }> = [
  { value: 'manual_offset', label: 'Manual Offset' },
  { value: 'immediate_handoff', label: 'Immediate Handoff' },
  { value: 'next_shift', label: 'Next Shift' },
  { value: 'next_day', label: 'Next Day' },
  { value: 'manual_anchor', label: 'Manual Anchor' },
];

export const SHIFT_STRATEGY_OPTIONS: Array<{ value: ShiftStrategy; label: string; description: string }> = [
  { value: 'current_operation', label: '仅当前 operation 平移', description: '只移动异常节点本身。' },
  { value: 'current_stage', label: '当前 stage 整体平移', description: '移动当前 stage 内所有 operation。' },
  { value: 'current_stage_remaining', label: '当前 stage 剩余 operation 平移', description: '从异常节点开始移动当前 stage 剩余节点。' },
  { value: 'following_stages', label: '仅后续 stage 平移', description: '保留当前 stage，只移动后续 stage。' },
  { value: 'current_remaining_and_following', label: '当前 stage 剩余 + 后续 stage', description: '跨上下游边界移动剩余链路。' },
  { value: 'manual_operations', label: '用户手动勾选 operation 平移', description: '只移动人工选择的 operation。' },
  { value: 'insert_wait', label: '插入等待后平移', description: '插入等待窗口后移动后续链路。' },
  { value: 'insert_extra_task', label: '插入额外任务后平移', description: '插入临时任务后移动后续链路。' },
  { value: 'record_only', label: '不自动平移，仅记录异常', description: '只展示异常节点新预计时间。' },
  { value: 'confirmed_pull_forward', label: '可选前拉：用户确认后前拉', description: '提前完成时才允许前拉后续链路。' },
];

export const EXCEPTION_TYPE_OPTIONS: Array<{ value: ExceptionType; label: string }> = [
  { value: 'harvest_delay', label: 'Harvest 延迟' },
  { value: 'operation_overtime', label: '当前 operation 超时' },
  { value: 'early_finish', label: '操作提前完成' },
  { value: 'deep_filter_transfer_block', label: '深层过滤 / transfer 堵塞' },
  { value: 'capture_chrom_interrupt', label: 'Capture / 层析中断' },
  { value: 'buffer_not_ready', label: 'Buffer 未 ready' },
  { value: 'cip_sip_incomplete', label: 'CIP / SIP 未完成或失败' },
  { value: 'uf_df_flux_drop', label: 'UF/DF 通量下降或超时' },
  { value: 'qc_ipc_pending', label: 'QC / IPC 外部状态 pending' },
  { value: 'single_use_leak', label: '一次性系统泄漏或连接异常' },
  { value: 'utility_interruption', label: '公用工程中断' },
  { value: 'other', label: '其他' },
];

export function findDefaultHandoffOperation(template: WorkbenchTemplate | undefined, domain: TemplateDomain): string | null {
  if (!template) return null;
  const patterns = domain === 'USP'
    ? ['harvest', 'clarification end']
    : ['capture start', 'capture'];
  const match = template.operations.find((operation) => {
    const name = operation.operationName.toLowerCase();
    return patterns.some((pattern) => name.includes(pattern));
  });
  return match ? toTemplateOperationKey(template.id, match.templateOperationId) : null;
}

export function toTemplateOperationKey(templateId: number, operationId: number) {
  return `${templateId}:${operationId}`;
}

export function formatDateTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

export function toDateTimeLocalValue(value: string) {
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}

export function fromDateTimeLocalValue(value: string) {
  return dayjs(value).format('YYYY-MM-DDTHH:mm:ss');
}

export function composeTimeline(
  batch: WorkbenchBatch,
  upstreamTemplate: WorkbenchTemplate,
  downstreamTemplate: WorkbenchTemplate,
  handoffConfig: HandoffConfig,
): { operations: WorkbenchOperation[]; dataGapWarnings: string[] } {
  const batchStart = dayjs(batch.plannedStart);
  const warnings: string[] = [];

  const upstreamOperations = instantiateTemplate(batch, upstreamTemplate, batchStart, 0, 'USP');
  const upstreamOperation = upstreamOperations.find((operation) => operation.id === handoffConfig.upstreamOperationId);

  let downstreamAnchor = upstreamOperation ? dayjs(upstreamOperation.originalEnd) : batchStart.add(72, 'hour');
  if (!upstreamOperation) {
    warnings.push('DATA GAP: 系统无法自动识别上游连接点，请手动选择 Harvest / Clarification End。');
  }

  downstreamAnchor = applyConnectionRule(downstreamAnchor, handoffConfig);

  const downstreamTemplateOperation = downstreamTemplate.operations.find(
    (operation) => toTemplateOperationKey(downstreamTemplate.id, operation.templateOperationId) === handoffConfig.downstreamOperationId,
  );

  if (!downstreamTemplateOperation) {
    warnings.push('DATA GAP: 系统无法自动识别下游连接点，请手动选择 Capture Start。');
  }

  const downstreamAnchorOffset = downstreamTemplateOperation?.offsetHours ?? downstreamTemplate.operations[0]?.offsetHours ?? 0;
  const downstreamOperations = instantiateTemplate(
    batch,
    downstreamTemplate,
    downstreamAnchor,
    -downstreamAnchorOffset,
    'DSP',
  );

  const allOperations = [...upstreamOperations, ...downstreamOperations]
    .map((operation) => ({
      ...operation,
      isHandoffSource: operation.id === handoffConfig.upstreamOperationId,
      isHandoffTarget: operation.id === handoffConfig.downstreamOperationId,
      dataGapWarnings: warnings,
    }))
    .sort((a, b) => dayjs(a.originalStart).valueOf() - dayjs(b.originalStart).valueOf());

  return { operations: allOperations, dataGapWarnings: warnings };
}

function instantiateTemplate(
  batch: WorkbenchBatch,
  template: WorkbenchTemplate,
  anchor: Dayjs,
  anchorOffsetHours: number,
  source: TemplateDomain,
): WorkbenchOperation[] {
  return template.operations.map((operation, index) => {
    const start = anchor.add(operation.offsetHours + anchorOffsetHours, 'hour');
    const end = start.add(operation.durationHours, 'hour');
    const id = toTemplateOperationKey(template.id, operation.templateOperationId);
    return {
      id,
      operationPlanId: Number(`${batch.id}${String(template.id).slice(-2)}${String(index + 1).padStart(2, '0')}`),
      batchId: batch.id,
      batchCode: batch.batchCode,
      templateId: template.id,
      templateName: template.templateName,
      source,
      sourceKind: 'TEMPLATE_OPERATION',
      templateScheduleId: operation.templateOperationId,
      operationId: operation.operationId,
      operationCode: operation.operationCode,
      stageName: operation.stageName,
      stageId: operation.stageId,
      stageOrder: operation.stageOrder,
      sequence: operation.sequence,
      operationName: operation.operationName,
      originalStart: start.toISOString(),
      originalEnd: end.toISOString(),
      previewStart: start.toISOString(),
      previewEnd: end.toISOString(),
      requiredPeople: operation.requiredPeople,
      assignedPeople: operation.assignedPeople,
      currentAssignments: operation.currentAssignments,
      assignments: [],
      qualificationRequirements: [],
      qualificationRequirementCount: operation.qualificationRequirementCount ?? 0,
      locked: Boolean(operation.locked),
      movedHours: 0,
      dataGapWarnings: [],
    };
  });
}

function applyConnectionRule(anchor: Dayjs, config: HandoffConfig): Dayjs {
  switch (config.rule) {
    case 'manual_offset':
      return anchor.add(config.manualOffsetHours, 'hour');
    case 'next_shift':
      return nextShiftStart(anchor);
    case 'next_day':
      return anchor.add(1, 'day').hour(8).minute(0).second(0);
    case 'manual_anchor': {
      const manualAnchor = dayjs(config.manualAnchor);
      return manualAnchor.isValid() ? manualAnchor : anchor;
    }
    case 'immediate_handoff':
    default:
      return anchor;
  }
}

function nextShiftStart(value: Dayjs) {
  const hour = value.hour();
  if (hour < 8) return value.hour(8).minute(0).second(0);
  if (hour < 20) return value.hour(20).minute(0).second(0);
  return value.add(1, 'day').hour(8).minute(0).second(0);
}

export function createExceptionDraft(batch: WorkbenchBatch, operation: WorkbenchOperation): ExceptionDraft {
  return {
    exceptionType: 'harvest_delay',
    affectedBatchId: batch.id,
    affectedOperationId: operation.id,
    originalStart: operation.originalStart,
    originalEnd: operation.originalEnd,
    expectedStart: operation.originalStart,
    expectedEnd: dayjs(operation.originalEnd).add(6, 'hour').toISOString(),
    description: 'Preview only: 运营计划异常时间覆盖，不修改模板或正式计划。',
    callSolver: true,
    previewOnly: true,
  };
}

export function buildPreviewTimeline(
  operations: WorkbenchOperation[],
  exceptionDraft: ExceptionDraft,
  strategy: ShiftStrategy,
  manualOperationIds: string[] = [],
): TimelinePreview {
  const selectedOperation = operations.find((operation) => operation.id === exceptionDraft.affectedOperationId) ?? operations[0];
  if (!selectedOperation) {
    return emptyPreview(operations);
  }

  const selectedOriginalEnd = dayjs(selectedOperation.originalEnd);
  const expectedEnd = dayjs(exceptionDraft.expectedEnd);
  const expectedStart = dayjs(exceptionDraft.expectedStart);
  const selectedDurationHours = Math.max(dayjs(selectedOperation.originalEnd).diff(dayjs(selectedOperation.originalStart), 'hour', true), 0.25);
  const normalizedExpectedStart = expectedStart.isValid() ? expectedStart : selectedOriginalEnd.add(-selectedDurationHours, 'hour');
  const normalizedExpectedEnd = expectedEnd.isValid() && expectedEnd.isAfter(normalizedExpectedStart)
    ? expectedEnd
    : normalizedExpectedStart.add(selectedDurationHours, 'hour');
  const deltaHours = normalizedExpectedEnd.diff(selectedOriginalEnd, 'hour', true);
  const allowNegativeCascade = strategy === 'confirmed_pull_forward';
  const cascadeDeltaHours = deltaHours < 0 && !allowNegativeCascade ? 0 : deltaHours;
  const affectedIds = deriveAffectedOperationIds(operations, selectedOperation, strategy, manualOperationIds);
  const affectedSet = new Set(affectedIds);
  const insertedOperations: WorkbenchOperation[] = [];

  const updatedOperations = operations.map((operation) => {
    if (operation.id === selectedOperation.id) {
      return {
        ...operation,
        previewStart: normalizedExpectedStart.toISOString(),
        previewEnd: normalizedExpectedEnd.toISOString(),
        movedHours: normalizedExpectedEnd.diff(dayjs(operation.originalEnd), 'hour', true),
      };
    }

    if (!affectedSet.has(operation.id) || strategy === 'record_only') {
      return { ...operation, previewStart: operation.originalStart, previewEnd: operation.originalEnd, movedHours: 0 };
    }

    return shiftOperation(operation, cascadeDeltaHours);
  });

  if (strategy === 'insert_wait' || strategy === 'insert_extra_task') {
    const insertStart = normalizedExpectedEnd;
    const insertDuration = strategy === 'insert_extra_task' ? 4 : 2;
    const insertEnd = insertStart.add(insertDuration, 'hour');
    insertedOperations.push({
      ...selectedOperation,
      id: `inserted-${strategy}-${selectedOperation.id}`,
      operationPlanId: -selectedOperation.operationPlanId,
      source: 'PREVIEW',
      sourceKind: 'PREVIEW_INSERT',
      stageName: selectedOperation.stageName,
      stageId: selectedOperation.stageId,
      operationName: strategy === 'insert_extra_task' ? 'Preview Extra Task' : 'Preview Wait Window',
      originalStart: insertStart.toISOString(),
      originalEnd: insertEnd.toISOString(),
      previewStart: insertStart.toISOString(),
      previewEnd: insertEnd.toISOString(),
      requiredPeople: strategy === 'insert_extra_task' ? 2 : 0,
      assignedPeople: 0,
      currentAssignments: [],
      assignments: [],
      qualificationRequirements: [],
      qualificationRequirementCount: 0,
      locked: false,
      movedHours: 0,
      isInserted: true,
      dataGapWarnings: ['DATA GAP: 插入等待或额外任务仅用于本次 preview，不写入正式 operation。'],
    });
  }

  const operationsWithInserted = [...updatedOperations, ...insertedOperations].sort(
    (a, b) => dayjs(a.previewStart).valueOf() - dayjs(b.previewStart).valueOf(),
  );

  const movedOperationIds = operationsWithInserted
    .filter((operation) => Math.abs(operation.movedHours) > 0.01)
    .map((operation) => operation.id);
  const unchangedOperationIds = operationsWithInserted
    .filter((operation) => !operation.isInserted && Math.abs(operation.movedHours) <= 0.01)
    .map((operation) => operation.id);
  const nightShiftOperationIds = operationsWithInserted.filter(isNightShiftOperation).map((operation) => operation.id);
  const crossShiftOperationIds = operationsWithInserted.filter(crossesShiftBoundary).map((operation) => operation.id);
  const lockedConflictIds = operationsWithInserted
    .filter((operation) => operation.locked && Math.abs(operation.movedHours) > 0.01)
    .map((operation) => operation.id);
  const dataGapWarnings = Array.from(new Set(operationsWithInserted.flatMap((operation) => operation.dataGapWarnings)));
  const movedSources = new Set(operationsWithInserted.filter((operation) => movedOperationIds.includes(operation.id)).map((operation) => operation.source));

  return {
    operations: operationsWithInserted,
    affectedOperationIds: affectedIds,
    movedOperationIds,
    unchangedOperationIds,
    insertedOperationIds: insertedOperations.map((operation) => operation.id),
    maxMoveHours: Math.max(0, ...operationsWithInserted.map((operation) => Math.abs(operation.movedHours))),
    crossHandoff: movedSources.has('USP') && movedSources.has('DSP'),
    nightShiftOperationIds,
    crossShiftOperationIds,
    lockedConflictIds,
    dataGapWarnings,
  };
}

function emptyPreview(operations: WorkbenchOperation[]): TimelinePreview {
  return {
    operations,
    affectedOperationIds: [],
    movedOperationIds: [],
    unchangedOperationIds: operations.map((operation) => operation.id),
    insertedOperationIds: [],
    maxMoveHours: 0,
    crossHandoff: false,
    nightShiftOperationIds: [],
    crossShiftOperationIds: [],
    lockedConflictIds: [],
    dataGapWarnings: [],
  };
}

function deriveAffectedOperationIds(
  operations: WorkbenchOperation[],
  selectedOperation: WorkbenchOperation,
  strategy: ShiftStrategy,
  manualOperationIds: string[],
): string[] {
  const selectedIndex = operations.findIndex((operation) => operation.id === selectedOperation.id);
  switch (strategy) {
    case 'current_operation':
    case 'record_only':
      return [selectedOperation.id];
    case 'current_stage':
      return operations.filter((operation) => operation.stageName === selectedOperation.stageName).map((operation) => operation.id);
    case 'current_stage_remaining':
      return operations
        .filter((operation) => operation.stageName === selectedOperation.stageName && operation.sequence >= selectedOperation.sequence)
        .map((operation) => operation.id);
    case 'following_stages':
      return operations.filter((operation) => operation.stageOrder > selectedOperation.stageOrder).map((operation) => operation.id);
    case 'manual_operations':
      return manualOperationIds.length > 0 ? manualOperationIds : [selectedOperation.id];
    case 'insert_wait':
    case 'insert_extra_task':
    case 'confirmed_pull_forward':
    case 'current_remaining_and_following':
    default:
      return operations
        .filter((operation, index) => index >= selectedIndex || operation.stageOrder > selectedOperation.stageOrder)
        .map((operation) => operation.id);
  }
}

function shiftOperation(operation: WorkbenchOperation, deltaHours: number): WorkbenchOperation {
  const previewStart = dayjs(operation.originalStart).add(deltaHours, 'hour');
  const previewEnd = dayjs(operation.originalEnd).add(deltaHours, 'hour');
  return {
    ...operation,
    previewStart: previewStart.toISOString(),
    previewEnd: previewEnd.toISOString(),
    movedHours: deltaHours,
  };
}

function isNightShiftOperation(operation: WorkbenchOperation) {
  const startHour = dayjs(operation.previewStart).hour();
  const endHour = dayjs(operation.previewEnd).hour();
  return startHour >= 20 || startHour < 8 || endHour >= 20 || endHour < 8;
}

function crossesShiftBoundary(operation: WorkbenchOperation) {
  const start = dayjs(operation.previewStart);
  const end = dayjs(operation.previewEnd);
  const boundary08 = start.hour(8).minute(0).second(0);
  const boundary20 = start.hour(20).minute(0).second(0);
  return (start.isBefore(boundary08) && end.isAfter(boundary08)) || (start.isBefore(boundary20) && end.isAfter(boundary20)) || !start.isSame(end, 'day');
}

export function buildLocalProposal(preview: TimelinePreview, capabilityGap?: string): LocalProposal {
  const movedOperations = preview.operations.filter((operation) => preview.movedOperationIds.includes(operation.id));
  const movedAssignmentCount = movedOperations.reduce((sum, operation) => sum + operation.assignedPeople, 0);
  const stillValidAssignments = preview.operations
    .filter((operation) => !preview.movedOperationIds.includes(operation.id) && !operation.isInserted)
    .reduce((sum, operation) => sum + operation.assignedPeople, 0);
  const newVacancies = movedOperations.reduce(
    (sum, operation, index) => sum + Math.max(operation.requiredPeople - operation.assignedPeople + (index === 0 ? 1 : 0), 0),
    0,
  );
  const solverCovered = Math.max(movedAssignmentCount - Math.ceil(newVacancies / 2), 0);
  const uncoveredPositions = Math.max(newVacancies - Math.max(solverCovered - movedAssignmentCount, 0), 0);

  const changes = movedOperations.slice(0, 6).map((operation, index) => ({
    id: operation.id,
    operationName: operation.operationName,
    originalPersonnel: operation.currentAssignments.join(', ') || '未分配',
    proposedPersonnel: capabilityGap ? '等待真实 solver_v4 preview' : '仅真实 solver_v4 返回后显示',
    reason: operation.movedHours > 0 ? '时间后移导致班次覆盖重新匹配' : '用户确认前拉后重新匹配',
    qualificationStatus: '待 solver 校验',
    shiftStatus: isNightShiftOperation(operation) ? '进入夜班窗口' : '在班次窗口内',
    timeConflict: operation.locked ? '存在 locked conflict' : '未发现时间冲突',
    overtimeRisk: crossesShiftBoundary(operation) ? '跨班风险' : '低',
  }));

  const vacancies = movedOperations
    .filter((operation) => operation.requiredPeople > operation.assignedPeople || operation.isInserted)
    .slice(0, 6)
    .map((operation) => ({
      id: operation.id,
      operationName: operation.operationName,
      time: `${formatDateTime(operation.previewStart)} - ${formatDateTime(operation.previewEnd)}`,
      requiredQualification: '按 operation qualification rules',
      reason: capabilityGap ? 'solver capability gap，暂不能确认覆盖' : '预览窗口内候选人不足或班次不匹配',
      action: '扩大重排范围或主管人工介入',
    }));

  return {
    mode: capabilityGap ? 'CAPABILITY_GAP' : 'LOCAL_PREVIEW',
    sourceLabel: capabilityGap ? 'solver capability gap summary' : 'preview timeline summary',
    timelineSummary: {
      affectedOperationCount: preview.affectedOperationIds.length,
      maxMoveHours: preview.maxMoveHours,
      crossHandoff: preview.crossHandoff,
      nightShiftOperationCount: preview.nightShiftOperationIds.length,
      crossShiftOperationCount: preview.crossShiftOperationIds.length,
      lockedConflictCount: preview.lockedConflictIds.length,
      dataGapCount: preview.dataGapWarnings.length,
    },
    scheduleSummary: {
      stillValidAssignments,
      invalidAssignments: movedAssignmentCount,
      newVacancies,
      solverCovered,
      uncoveredPositions,
      supervisorAttention: uncoveredPositions > 0 || preview.lockedConflictIds.length > 0 || Boolean(capabilityGap),
      expandScopeSuggested: preview.crossHandoff || uncoveredPositions > 0,
    },
    changes,
    vacancies,
    suggestions: [
      '保持当前平移并采用 solver proposal',
      '扩大影响范围重新求解',
      '调整平移策略',
      '主管人工介入',
      '暂不应用，仅保存或导出预览',
    ],
    risks: [
      {
        constraint_code: 'WORKFORCE_COVERAGE_PREVIEW_ONLY',
        severity: uncoveredPositions > 0 ? 'warning' : 'info',
        hard_or_soft: 'soft',
        violation_message_template: 'Temporary timeline has {uncoveredPositions} uncovered positions before formal application.',
      },
      {
        constraint_code: 'FLOW_WINDOW_DATA_GAP',
        severity: preview.dataGapWarnings.length > 0 ? 'warning' : 'info',
        hard_or_soft: 'soft',
        violation_message_template: 'Current dataset does not fully model process dependency, hold time, utility, material, and equipment-state impact.',
      },
    ],
    capabilityGap,
  };
}

export function buildGanttModel(
  operations: WorkbenchOperation[],
  origin: Dayjs,
  showPreview: boolean,
  palette: WorkbenchPalette = DEFAULT_WORKBENCH_PALETTE,
): WorkbenchGanttModel {
  const batchGroupId = 'combined-ds-batch';
  const groups: GanttGroup[] = [
    {
      id: batchGroupId,
      label: 'Combined DS batch operation timeline',
      type: 'batch',
      color: palette.original,
    },
  ];
  const stageGroupIds = new Set<string>();
  const tasks: GanttTask[] = [];

  operations.forEach((operation) => {
    const stageGroupId = `${operation.source}-${operation.stageName}`;
    if (!stageGroupIds.has(stageGroupId)) {
      stageGroupIds.add(stageGroupId);
      groups.push({
        id: stageGroupId,
        parentId: batchGroupId,
        label: `${operation.source} · ${operation.stageName}`,
        type: 'stage',
        color: operation.source === 'DSP' ? palette.dsp : palette.usp,
      });
    }

    const operationColor = operation.source === 'DSP' ? palette.dsp : operation.source === 'PREVIEW' ? palette.inserted : palette.usp;
    tasks.push({
      id: `original-${operation.id}`,
      label: `Original · ${operation.operationName}`,
      start: toHourOffset(origin, operation.originalStart),
      end: toHourOffset(origin, operation.originalEnd),
      groupId: stageGroupId,
      color: palette.original || operationColor,
      type: 'operation',
      readOnly: true,
      draggable: false,
      requiredPeople: operation.requiredPeople,
      assignedPeople: operation.assignedPeople,
      status: operation.locked ? 'locked' : operation.source,
      data: {
        lane: 'original',
        operationId: operation.id,
        operationPlanId: operation.operationPlanId,
        source: operation.source,
        stageName: operation.stageName,
        displayStart: formatDateTime(operation.originalStart),
        displayEnd: formatDateTime(operation.originalEnd),
      },
    });

    if (showPreview) {
      const previewColor = operation.locked && Math.abs(operation.movedHours) > 0.01
        ? palette.conflict
        : operation.isInserted
          ? palette.inserted
          : palette.preview;
      tasks.push({
        id: `preview-${operation.id}`,
        label: `Preview · ${operation.operationName}`,
        start: toHourOffset(origin, operation.previewStart),
        end: Math.max(toHourOffset(origin, operation.previewEnd), toHourOffset(origin, operation.previewStart) + 0.25),
        groupId: stageGroupId,
        color: previewColor || operationColor,
        type: 'operation',
        readOnly: true,
        draggable: false,
        requiredPeople: operation.requiredPeople,
        assignedPeople: operation.assignedPeople,
        status: Math.abs(operation.movedHours) > 0.01 ? `${operation.movedHours.toFixed(1)}h` : 'unchanged',
        conflictType: operation.locked && Math.abs(operation.movedHours) > 0.01 ? 'OVERLAP' : undefined,
        data: {
          lane: 'preview',
          operationId: operation.id,
          operationPlanId: operation.operationPlanId,
          source: operation.source,
          stageName: operation.stageName,
          displayStart: formatDateTime(operation.previewStart),
          displayEnd: formatDateTime(operation.previewEnd),
        },
      });
    }

    if (operation.isHandoffSource || operation.isHandoffTarget) {
      tasks.push({
        id: `handoff-${operation.id}`,
        label: operation.isHandoffSource ? 'USP handoff point' : 'DSP handoff point',
        start: toHourOffset(origin, operation.originalEnd),
        end: toHourOffset(origin, operation.originalEnd) + 0.5,
        groupId: stageGroupId,
        color: palette.handoff,
        type: 'timeWindow',
        readOnly: true,
        draggable: false,
        data: {
          lane: 'handoff',
          operationId: operation.id,
          source: operation.source,
        },
      });
    }
  });

  return {
    tasks,
    groups,
    dependencies: buildSequentialDependencies(operations),
  };
}

function buildSequentialDependencies(operations: WorkbenchOperation[]): GanttDependency[] {
  return operations
    .filter((operation) => !operation.isInserted)
    .slice(1)
    .map((operation, index) => {
      const previous = operations.filter((item) => !item.isInserted)[index];
      return {
        id: `dep-${previous.id}-${operation.id}`,
        from: `original-${previous.id}`,
        to: `original-${operation.id}`,
        type: 'FS',
        label: previous.source !== operation.source ? 'USP/DSP handoff' : 'FS',
      };
    });
}

function toHourOffset(origin: Dayjs, value: string) {
  return dayjs(value).diff(origin, 'hour', true);
}
