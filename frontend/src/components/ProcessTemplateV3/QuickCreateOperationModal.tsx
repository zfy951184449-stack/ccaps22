import React, { useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import {
  WxbButton,
  WxbCollapse,
  WxbEmpty,
  WxbInput,
  WxbInputNumber,
  WxbList,
  WxbModal,
  WxbSearchInput,
  WxbSegmented,
  WxbSelect,
  WxbSpinner,
  WxbSwitch,
  WxbTag,
  WxbTextarea,
} from '../wxb-ui';
import { processTemplateV2Api } from '../../services';
import type {
  OperationCreateContext,
  OperationCreatedResult,
  OperationLibraryItem,
  OperationPositionQualificationPayload,
  OperationTypeOption,
  PlannerOperation,
  QualificationOption,
  ResourceNode,
  TemplateEditorCapabilities,
  TemplateStageSummary,
} from '../ProcessTemplateV2/types';
import './QuickCreateOperationModal.css';

type SourceMode = 'existing' | 'new';
type WindowMode = 'auto' | 'manual';
type TeamFilterValue = string;
type QualificationScope = 'all' | 'position';

type DraftQualificationRequirement = {
  clientId: string;
  qualificationId: number | null;
  minLevel: number;
  isMandatory: boolean;
  scope: QualificationScope;
  positionNumber: number;
};

/**
 * Identifies an existing scheduled operation to edit. Name / people / qualifications
 * belong to the shared operation definition (edited elsewhere); this modal's edit mode
 * only adjusts this schedule row's timing.
 */
export type EditOperationTarget = {
  scheduleId: number;
  operationId: number;
  operationName: string;
  operationCode: string;
  stageId: number;
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset: number;
  windowStartTime: number;
  windowStartDayOffset: number;
  windowEndTime: number;
  windowEndDayOffset: number;
  durationHours: number;
  requiredPeople: number;
};

type QuickCreateOperationModalProps = {
  open: boolean;
  templateId: number;
  templateName: string;
  templateTeamId: number | null;
  templateTeamName?: string | null;
  stages: TemplateStageSummary[];
  operations: PlannerOperation[];
  resourceNodes: ResourceNode[];
  operationLibrary: OperationLibraryItem[];
  capabilities: TemplateEditorCapabilities;
  context: OperationCreateContext | null;
  onCancel: () => void;
  onCreated: (result: OperationCreatedResult) => Promise<void> | void;
  /** 'create' (default) opens the new-operation flow; 'edit' edits an existing schedule's timing. */
  mode?: 'create' | 'edit';
  /** Required when mode === 'edit': the schedule row to edit. */
  editTarget?: EditOperationTarget | null;
  /** Called after a successful edit save. */
  onUpdated?: (result: { scheduleId: number; stageId: number }) => Promise<void> | void;
  /** Grouped equipment options for the edit-mode 设备绑定 field (by team, current team first). */
  bindingOptions?: Array<{ label: string; options: Array<{ label: string; value: number }> }>;
};

type QuickCreateDraft = {
  sourceMode: SourceMode;
  stageId: number | null;
  resourceNodeId: number | null;
  operationId: number | null;
  searchValue: string;
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset: number;
  durationHours: number;
  requiredPeople: number;
  windowMode: WindowMode;
  windowStartTime: number;
  windowStartDayOffset: number;
  windowEndTime: number;
  windowEndDayOffset: number;
  newOperationName: string;
  nextOperationCode: string;
  operationTypeId: number | null;
  description: string;
  qualificationRequirements: DraftQualificationRequirement[];
};

type SavedQuickCreateConfig = {
  recentOperationIds: number[];
  resourceNodeId: number | null;
};

const STORAGE_PREFIX = 'process-template-v3-quick-create-operation';
const MAX_VISIBLE_OPERATIONS = 80;
const ALL_TEAMS_VALUE = 'all';
const UNASSIGNED_TEAM_VALUE = 'unassigned';

const getStorageKey = (templateId: number) => `${STORAGE_PREFIX}:${templateId}`;

const createDraftQualificationRequirement = (): DraftQualificationRequirement => ({
  clientId: `qualification-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  qualificationId: null,
  minLevel: 1,
  isMandatory: true,
  scope: 'all',
  positionNumber: 1,
});

const normalizeQualificationRequirementsForPeople = (
  requirements: DraftQualificationRequirement[],
  requiredPeople: number,
): DraftQualificationRequirement[] => {
  const positionCount = Math.max(1, Math.floor(Number(requiredPeople) || 1));
  return requirements.map((requirement) =>
    requirement.scope === 'position' && Number(requirement.positionNumber) > positionCount
      ? { ...requirement, scope: 'all', positionNumber: 1 }
      : requirement,
  );
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const toTeamFilterValue = (teamId?: number | null): TeamFilterValue =>
  teamId ? String(teamId) : ALL_TEAMS_VALUE;

const getOperationTeamId = (item: OperationLibraryItem): number | null =>
  item.team_id !== undefined && item.team_id !== null ? Number(item.team_id) : null;

const matchesTeamFilter = (
  item: OperationLibraryItem,
  teamFilterValue: TeamFilterValue,
  includeUnassignedForSpecificTeam = false,
) => {
  const teamId = getOperationTeamId(item);
  if (teamFilterValue === ALL_TEAMS_VALUE) return true;
  if (teamFilterValue === UNASSIGNED_TEAM_VALUE) return teamId === null;
  return teamId === Number(teamFilterValue) || (includeUnassignedForSpecificTeam && teamId === null);
};

const toHourValue = (value: number) => {
  const remainder = value % 24;
  return remainder < 0 ? remainder + 24 : remainder;
};

const formatHourLabel = (value: number) => {
  const totalMinutes = Math.round(Number(value ?? 0) * 60);
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const flattenNodes = (nodes: ResourceNode[]): ResourceNode[] => {
  const result: ResourceNode[] = [];
  const walk = (items: ResourceNode[]) => {
    items.forEach((item) => {
      result.push(item);
      walk(item.children ?? []);
    });
  };
  walk(nodes);
  return result;
};

const getStageStartDay = (stage: TemplateStageSummary | null | undefined) => Number(stage?.start_day ?? 0);

const getAbsoluteStartHour = (stage: TemplateStageSummary | null | undefined, draft: QuickCreateDraft) =>
  (getStageStartDay(stage) + Number(draft.operationDay ?? 0) + Number(draft.recommendedDayOffset ?? 0)) * 24 +
  Number(draft.recommendedTime ?? 0);

const getWindowAbsoluteHour = (
  stage: TemplateStageSummary | null | undefined,
  operationDay: number,
  dayOffset: number,
  time: number,
) => (getStageStartDay(stage) + Number(operationDay ?? 0) + Number(dayOffset ?? 0)) * 24 + Number(time ?? 0);

const buildTimingFromContext = (
  stage: TemplateStageSummary | null | undefined,
  context: OperationCreateContext | null,
) => {
  const stageStartDay = getStageStartDay(stage);
  const absoluteStartHour = context?.absoluteStartHour ?? stageStartDay * 24 + 9;
  const absoluteDay = Math.floor(absoluteStartHour / 24);
  const operationDay = context?.operationDay ?? Math.max(0, absoluteDay - stageStartDay);
  const recommendedTime = context?.recommendedTime ?? toHourValue(absoluteStartHour);
  const recommendedDayOffset =
    context?.recommendedDayOffset ?? absoluteDay - stageStartDay - operationDay;

  return {
    operationDay,
    recommendedTime,
    recommendedDayOffset,
  };
};

const buildAutomaticWindow = (
  stage: TemplateStageSummary | null | undefined,
  draft: Pick<
    QuickCreateDraft,
    'operationDay' | 'recommendedTime' | 'recommendedDayOffset' | 'durationHours'
  >,
) => {
  const stageStartDay = getStageStartDay(stage);
  const operationDay = Number(draft.operationDay ?? 0);
  const absoluteStartHour =
    (stageStartDay + operationDay + Number(draft.recommendedDayOffset ?? 0)) * 24 +
    Number(draft.recommendedTime ?? 0);
  const windowStartAbsolute = absoluteStartHour - 2;
  const windowEndAbsolute = absoluteStartHour + Math.max(Number(draft.durationHours ?? 1), 1);

  return {
    windowStartTime: toHourValue(windowStartAbsolute),
    windowStartDayOffset: Math.floor(windowStartAbsolute / 24) - stageStartDay - operationDay,
    windowEndTime: toHourValue(windowEndAbsolute),
    windowEndDayOffset: Math.floor(windowEndAbsolute / 24) - stageStartDay - operationDay,
  };
};

const buildPositionQualificationPayloads = (
  requiredPeople: number,
  requirements: DraftQualificationRequirement[],
) => {
  const positionCount = Math.max(1, Math.floor(Number(requiredPeople) || 1));
  const byPosition = new Map<number, Map<number, OperationPositionQualificationPayload>>();

  requirements.forEach((requirement) => {
    if (!requirement.qualificationId) return;
    const positions =
      requirement.scope === 'all'
        ? Array.from({ length: positionCount }, (_, index) => index + 1)
        : [Math.min(Math.max(1, Number(requirement.positionNumber) || 1), positionCount)];

    positions.forEach((position) => {
      const positionPayloads = byPosition.get(position) ?? new Map<number, OperationPositionQualificationPayload>();
      positionPayloads.set(Number(requirement.qualificationId), {
        qualification_id: Number(requirement.qualificationId),
        min_level: Math.min(Math.max(1, Number(requirement.minLevel) || 1), 5),
        is_mandatory: requirement.isMandatory ? 1 : 0,
      });
      byPosition.set(position, positionPayloads);
    });
  });

  return Array.from(byPosition.entries()).map(([positionNumber, payloadMap]) => ({
    positionNumber,
    qualifications: Array.from(payloadMap.values()),
  }));
};

const readSavedConfig = (templateId: number): SavedQuickCreateConfig | null => {
  try {
    const raw = window.localStorage.getItem(getStorageKey(templateId));
    return raw ? (JSON.parse(raw) as SavedQuickCreateConfig) : null;
  } catch (error) {
    console.error('Failed to read quick create operation cache:', error);
    return null;
  }
};

const writeSavedConfig = (
  templateId: number,
  operationId: number,
  draft: QuickCreateDraft,
  previousRecentOperationIds: number[],
) => {
  const nextRecentOperationIds = [
    operationId,
    ...previousRecentOperationIds.filter((item) => Number(item) !== Number(operationId)),
  ].slice(0, 8);

  try {
    window.localStorage.setItem(
      getStorageKey(templateId),
      JSON.stringify({
        recentOperationIds: nextRecentOperationIds,
        resourceNodeId: draft.resourceNodeId,
      }),
    );
  } catch (error) {
    console.error('Failed to persist quick create operation cache:', error);
  }

  return nextRecentOperationIds;
};

const buildInitialDraft = ({
  stages,
  leafNodes,
  context,
  savedConfig,
  nextOperationCode,
  operationLibrary,
  operationTypes,
}: {
  stages: TemplateStageSummary[];
  leafNodes: ResourceNode[];
  context: OperationCreateContext | null;
  savedConfig: SavedQuickCreateConfig | null;
  nextOperationCode: string;
  operationLibrary: OperationLibraryItem[];
  operationTypes: OperationTypeOption[];
}): QuickCreateDraft => {
  const fallbackStageId = context?.stageId ?? stages[0]?.id ?? null;
  const selectedStage =
    stages.find((item) => Number(item.id) === Number(fallbackStageId)) ?? stages[0] ?? null;
  const savedNode = savedConfig?.resourceNodeId
    ? leafNodes.find((item) => Number(item.id) === Number(savedConfig.resourceNodeId))
    : null;
  const contextNode = context?.resourceNodeId
    ? leafNodes.find((item) => Number(item.id) === Number(context.resourceNodeId))
    : null;
  const selectedNode = contextNode ?? savedNode ?? null;
  const firstRecentOperationId = savedConfig?.recentOperationIds.find((id) =>
    operationLibrary.some((item) => Number(item.id) === Number(id)),
  );
  const selectedOperationId =
    operationLibrary.length === 1 ? operationLibrary[0].id : firstRecentOperationId ?? null;
  const selectedOperation =
    operationLibrary.find((item) => Number(item.id) === Number(selectedOperationId)) ?? null;
  const durationHours = Number(selectedOperation?.standard_time ?? 2);
  const timing = buildTimingFromContext(selectedStage, context);
  const baseDraft: QuickCreateDraft = {
    sourceMode: 'existing',
    stageId: selectedStage?.id ?? null,
    resourceNodeId: selectedNode?.id ?? null,
    operationId: selectedOperation?.id ?? null,
    searchValue: '',
    operationDay: Number(timing.operationDay ?? 0),
    recommendedTime: Number(timing.recommendedTime ?? 9),
    recommendedDayOffset: Number(timing.recommendedDayOffset ?? 0),
    durationHours,
    requiredPeople: Number(selectedOperation?.required_people ?? 1),
    windowMode: 'auto',
    windowStartTime: 0,
    windowStartDayOffset: 0,
    windowEndTime: 0,
    windowEndDayOffset: 0,
    newOperationName: '',
    nextOperationCode,
    operationTypeId: selectedOperation?.operation_type_id ?? operationTypes[0]?.id ?? null,
    description: '',
    qualificationRequirements: [],
  };

  return {
    ...baseDraft,
    ...buildAutomaticWindow(selectedStage, baseDraft),
  };
};

/**
 * Seed a draft from an existing schedule row for edit mode. windowMode is 'manual' so the
 * stored time window is preserved (not auto-recomputed) until the user opts into 'auto'.
 */
const buildEditDraft = (editTarget: EditOperationTarget): QuickCreateDraft => ({
  sourceMode: 'existing',
  stageId: editTarget.stageId,
  resourceNodeId: null,
  operationId: editTarget.operationId,
  searchValue: '',
  operationDay: Number(editTarget.operationDay ?? 0),
  recommendedTime: Number(editTarget.recommendedTime ?? 9),
  recommendedDayOffset: Number(editTarget.recommendedDayOffset ?? 0),
  durationHours: Number(editTarget.durationHours ?? 2),
  requiredPeople: Number(editTarget.requiredPeople ?? 1),
  windowMode: 'manual',
  windowStartTime: Number(editTarget.windowStartTime ?? 0),
  windowStartDayOffset: Number(editTarget.windowStartDayOffset ?? 0),
  windowEndTime: Number(editTarget.windowEndTime ?? 0),
  windowEndDayOffset: Number(editTarget.windowEndDayOffset ?? 0),
  newOperationName: '',
  nextOperationCode: editTarget.operationCode,
  operationTypeId: null,
  description: '',
  qualificationRequirements: [],
});

const QuickCreateOperationModal: React.FC<QuickCreateOperationModalProps> = ({
  open,
  templateId,
  templateName,
  templateTeamId,
  templateTeamName,
  stages,
  operations,
  resourceNodes,
  operationLibrary,
  capabilities,
  context,
  onCancel,
  onCreated,
  mode = 'create',
  editTarget = null,
  onUpdated,
  bindingOptions = [],
}) => {
  const [draft, setDraft] = useState<QuickCreateDraft | null>(null);
  const [editInitialResourceNodeId, setEditInitialResourceNodeId] = useState<number | null>(null);
  const [operationTypes, setOperationTypes] = useState<OperationTypeOption[]>([]);
  const [qualifications, setQualifications] = useState<QualificationOption[]>([]);
  const [recentOperationIds, setRecentOperationIds] = useState<number[]>([]);
  const [teamFilterValue, setTeamFilterValue] = useState<TeamFilterValue>(toTeamFilterValue(templateTeamId));
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  // 编辑模式下「替换操作」：展开操作库列表，选另一个操作原地替换本排程。
  const [replaceMode, setReplaceMode] = useState(false);

  const allNodes = useMemo(() => flattenNodes(resourceNodes), [resourceNodes]);
  const leafNodes = useMemo(
    () => allNodes.filter((item) => item.isActive && (item.children ?? []).length === 0),
    [allNodes],
  );
  const selectedStage = useMemo(
    () => stages.find((item) => Number(item.id) === Number(draft?.stageId)) ?? null,
    [draft?.stageId, stages],
  );
  const selectedNode = useMemo(
    () => leafNodes.find((item) => Number(item.id) === Number(draft?.resourceNodeId)) ?? null,
    [draft?.resourceNodeId, leafNodes],
  );
  const selectedOperation = useMemo(
    () => operationLibrary.find((item) => Number(item.id) === Number(draft?.operationId)) ?? null,
    [draft?.operationId, operationLibrary],
  );
  const selectedOperationType = useMemo(
    () => operationTypes.find((item) => Number(item.id) === Number(draft?.operationTypeId)) ?? null,
    [draft?.operationTypeId, operationTypes],
  );
  const defaultOperationTypeId = useMemo(
    () =>
      operationTypes.find((item) => templateTeamId && Number(item.teamId) === Number(templateTeamId))?.id ??
      operationTypes[0]?.id ??
      null,
    [operationTypes, templateTeamId],
  );
  const qualificationOptions = useMemo(
    () =>
      qualifications.map((item) => ({
        value: item.id,
        label: item.qualification_name,
      })),
    [qualifications],
  );
  const positionScopeOptions = useMemo(() => {
    const requiredPeople = Math.max(1, Math.floor(Number(draft?.requiredPeople ?? 1) || 1));
    return [
      { value: 'all', label: '全部岗位' },
      ...Array.from({ length: requiredPeople }, (_, index) => ({
        value: String(index + 1),
        label: `岗位 ${index + 1}`,
      })),
    ];
  }, [draft?.requiredPeople]);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setApiError(null);
      setSavingStep('');
      setEditInitialResourceNodeId(null);
      setReplaceMode(false);
      return;
    }

    let cancelled = false;
    const savedConfig = readSavedConfig(templateId);
    setRecentOperationIds(savedConfig?.recentOperationIds ?? []);
    setTeamFilterValue(toTeamFilterValue(templateTeamId));

    const initialize = async () => {
      try {
        setReferenceLoading(true);
        const [nextOperationCode, nextOperationTypes, nextQualifications] = await Promise.all([
          processTemplateV2Api.getNextOperationCode(),
          processTemplateV2Api.listOperationTypes(templateTeamId),
          processTemplateV2Api.listAvailableQualifications(),
        ]);
        if (cancelled) return;
        setOperationTypes(nextOperationTypes);
        setQualifications(nextQualifications);
        if (mode === 'edit' && editTarget) {
          setDraft(buildEditDraft(editTarget));
          // Prefill current equipment binding (authoritative single fetch — avoids
          // depending on resource-view load timing).
          try {
            const bindingResp = await processTemplateV2Api.getTemplateScheduleBinding(editTarget.scheduleId);
            const nodeId = bindingResp.binding?.resourceNodeId ?? null;
            if (!cancelled) {
              setEditInitialResourceNodeId(nodeId);
              setDraft((current) => (current ? { ...current, resourceNodeId: nodeId } : current));
            }
          } catch (bindingError) {
            console.error('Failed to load current binding:', bindingError);
          }
        } else {
          setEditInitialResourceNodeId(null);
          setDraft(
            buildInitialDraft({
              stages,
              leafNodes,
              context,
              savedConfig,
              nextOperationCode,
              operationLibrary,
              operationTypes: nextOperationTypes,
            }),
          );
        }
      } catch (error: any) {
        console.error('Failed to initialize quick create operation modal:', error);
        message.error(error?.response?.data?.error || '初始化新增操作弹窗失败');
      } finally {
        if (!cancelled) {
          setReferenceLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [context, editTarget, leafNodes, mode, open, operationLibrary, stages, templateId, templateTeamId]);

  const stageOperationIds = useMemo(
    () =>
      new Set(
        operations
          .filter((item) => Number(item.stage_id) === Number(selectedStage?.id))
          .map((item) => Number(item.operation_id)),
      ),
    [operations, selectedStage?.id],
  );

  const stageOptions = useMemo(
    () =>
      stages.map((stage) => ({
        value: stage.id,
        label: `${stage.stage_code} / ${stage.stage_name}`,
      })),
    [stages],
  );

  const resourceOptions = useMemo(
    () =>
      leafNodes.map((node) => ({
        value: node.id,
        label: `${node.nodeName}${node.nodeClass ? ` / ${node.nodeClass}` : ''}`,
      })),
    [leafNodes],
  );

  const operationTypeOptions = useMemo(
    () =>
      operationTypes.map((item) => ({
        value: item.id,
        label: `${item.typeCode} / ${item.typeName}${item.teamName ? ` · ${item.teamName}` : ''}`,
      })),
    [operationTypes],
  );

  const teamOptions = useMemo(() => {
    const teamMap = new Map<number, string>();
    if (templateTeamId) {
      teamMap.set(Number(templateTeamId), templateTeamName || '当前模板团队');
    }
    operationLibrary.forEach((item) => {
      const teamId = getOperationTeamId(item);
      if (!teamId) return;
      teamMap.set(
        teamId,
        item.team_name || item.team_code || (teamId === templateTeamId ? templateTeamName || '当前模板团队' : `团队 ${teamId}`),
      );
    });

    const orderedTeams = Array.from(teamMap.entries()).sort(([leftId, leftName], [rightId, rightName]) => {
      if (templateTeamId && leftId === Number(templateTeamId)) return -1;
      if (templateTeamId && rightId === Number(templateTeamId)) return 1;
      return leftName.localeCompare(rightName, 'zh-Hans-CN');
    });

    const hasUnassignedOperations = operationLibrary.some((item) => getOperationTeamId(item) === null);

    return [
      { value: ALL_TEAMS_VALUE, label: '全部团队' },
      ...orderedTeams.map(([teamId, teamName]) => ({
        value: String(teamId),
        label: teamId === Number(templateTeamId) ? `${teamName}（当前模板）` : teamName,
      })),
      ...(hasUnassignedOperations ? [{ value: UNASSIGNED_TEAM_VALUE, label: '未归属团队' }] : []),
    ];
  }, [operationLibrary, templateTeamId, templateTeamName]);

  const selectedTeamLabel = useMemo(
    () => teamOptions.find((item) => item.value === teamFilterValue)?.label ?? '全部团队',
    [teamFilterValue, teamOptions],
  );

  const includeUnassignedForCurrentTeam = useMemo(() => {
    if (teamFilterValue === ALL_TEAMS_VALUE || teamFilterValue === UNASSIGNED_TEAM_VALUE) return false;
    const selectedTeamId = Number(teamFilterValue);
    return !operationLibrary.some((item) => getOperationTeamId(item) === selectedTeamId);
  }, [operationLibrary, teamFilterValue]);

  const filteredOperations = useMemo(() => {
    const searchValue = normalizeText(draft?.searchValue ?? '');
    return operationLibrary
      .filter((item) => {
        if (!matchesTeamFilter(item, teamFilterValue, includeUnassignedForCurrentTeam)) return false;
        if (!searchValue) return true;
        return `${normalizeText(item.operation_code)} ${normalizeText(item.operation_name)}`.includes(searchValue);
      })
      .sort((left, right) => {
        const leftStageScore = stageOperationIds.has(Number(left.id)) ? 0 : 1;
        const rightStageScore = stageOperationIds.has(Number(right.id)) ? 0 : 1;
        if (leftStageScore !== rightStageScore) return leftStageScore - rightStageScore;

        const leftRecentIndex = recentOperationIds.indexOf(Number(left.id));
        const rightRecentIndex = recentOperationIds.indexOf(Number(right.id));
        const leftRecentScore = leftRecentIndex >= 0 ? leftRecentIndex : Number.MAX_SAFE_INTEGER;
        const rightRecentScore = rightRecentIndex >= 0 ? rightRecentIndex : Number.MAX_SAFE_INTEGER;
        if (leftRecentScore !== rightRecentScore) return leftRecentScore - rightRecentScore;

        return left.operation_name.localeCompare(right.operation_name, 'zh-Hans-CN');
      });
  }, [draft?.searchValue, includeUnassignedForCurrentTeam, operationLibrary, recentOperationIds, stageOperationIds, teamFilterValue]);

  const visibleOperations = filteredOperations.slice(0, MAX_VISIBLE_OPERATIONS);
  const hiddenOperationCount = Math.max(filteredOperations.length - visibleOperations.length, 0);

  const updateDraft = (recipe: (current: QuickCreateDraft) => QuickCreateDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = recipe(current);
      if (next.windowMode !== 'auto') return next;
      const nextStage = stages.find((item) => Number(item.id) === Number(next.stageId)) ?? null;
      return {
        ...next,
        ...buildAutomaticWindow(nextStage, next),
      };
    });
    setApiError(null);
  };

  useEffect(() => {
    // Create-only: edit mode keeps the draft deterministic from editTarget.
    if (mode !== 'create') return;
    if (!draft || draft.sourceMode !== 'existing' || !selectedOperation) {
      return;
    }
    setDraft((current) => {
      if (!current || current.sourceMode !== 'existing') return current;
      const durationHours = Number(selectedOperation.standard_time ?? current.durationHours);
      const requiredPeople = Number(selectedOperation.required_people ?? current.requiredPeople);
      if (
        current.durationHours === durationHours &&
        current.requiredPeople === requiredPeople &&
        current.operationTypeId === (selectedOperation.operation_type_id ?? null)
      ) {
        return current;
      }
      const next = {
        ...current,
        durationHours,
        requiredPeople,
        operationTypeId: selectedOperation.operation_type_id ?? null,
      };
      return next.windowMode === 'auto'
        ? {
            ...next,
            ...buildAutomaticWindow(selectedStage, next),
          }
        : next;
    });
  }, [draft, mode, selectedOperation, selectedStage]);

  useEffect(() => {
    // Create-only: never clear the fixed operation while editing.
    if (mode !== 'create') return;
    if (!draft || draft.sourceMode !== 'existing' || !selectedOperation) return;
    if (matchesTeamFilter(selectedOperation, teamFilterValue, includeUnassignedForCurrentTeam)) return;

    setDraft((current) =>
      current
        ? {
            ...current,
            operationId: null,
          }
        : current,
    );
  }, [draft, includeUnassignedForCurrentTeam, mode, selectedOperation, teamFilterValue]);

  const startLabel = draft && selectedStage
    ? `Day ${getStageStartDay(selectedStage) + draft.operationDay + draft.recommendedDayOffset} / ${formatHourLabel(draft.recommendedTime)}`
    : 'Day - / --:--';
  const windowLabel = draft
    ? `${formatHourLabel(draft.windowStartTime)}${draft.windowStartDayOffset ? ` (${draft.windowStartDayOffset > 0 ? '+' : ''}${draft.windowStartDayOffset}d)` : ''} - ${formatHourLabel(draft.windowEndTime)}${draft.windowEndDayOffset ? ` (${draft.windowEndDayOffset > 0 ? '+' : ''}${draft.windowEndDayOffset}d)` : ''}`
    : '--:-- - --:--';

  const validationIssues = useMemo(() => {
    if (!draft) return [];
    const issues: string[] = [];
    if (!draft.stageId) {
      issues.push('必须选择所属阶段');
    }
    if (draft.sourceMode === 'existing' && !draft.operationId) {
      issues.push('请选择操作库中的现有操作');
    }
    if (draft.sourceMode === 'new' && !draft.newOperationName.trim()) {
      issues.push('请输入操作名称');
    }
    if (draft.sourceMode === 'new' && operationTypes.length > 0 && !draft.operationTypeId) {
      issues.push('请选择操作类型');
    }
    if (draft.sourceMode === 'new') {
      draft.qualificationRequirements.forEach((requirement, index) => {
        if (!requirement.qualificationId) {
          issues.push(`第 ${index + 1} 条资质要求未选择资质`);
        }
        if (Number(requirement.minLevel ?? 0) < 1 || Number(requirement.minLevel ?? 0) > 5) {
          issues.push(`第 ${index + 1} 条资质要求等级必须在 1 到 5 之间`);
        }
        if (
          requirement.scope === 'position' &&
          (Number(requirement.positionNumber) < 1 || Number(requirement.positionNumber) > Number(draft.requiredPeople ?? 1))
        ) {
          issues.push(`第 ${index + 1} 条资质要求适用岗位无效`);
        }
      });
    }
    if (Number(draft.durationHours ?? 0) <= 0) {
      issues.push('标准时长必须大于 0');
    }
    if (Number(draft.requiredPeople ?? 0) <= 0) {
      issues.push('人员需求必须大于 0');
    }
    if (Number(draft.recommendedTime ?? 0) < 0 || Number(draft.recommendedTime ?? 0) >= 24) {
      issues.push('开始时刻必须在 0 到 24 小时之间');
    }

    const startAbsolute = getAbsoluteStartHour(selectedStage, draft);
    const windowStartAbsolute = getWindowAbsoluteHour(
      selectedStage,
      draft.operationDay,
      draft.windowStartDayOffset,
      draft.windowStartTime,
    );
    const windowEndAbsolute = getWindowAbsoluteHour(
      selectedStage,
      draft.operationDay,
      draft.windowEndDayOffset,
      draft.windowEndTime,
    );
    if (windowStartAbsolute > startAbsolute) {
      issues.push('时间窗开始不能晚于推荐开始');
    }
    if (windowEndAbsolute < startAbsolute + Number(draft.durationHours ?? 0)) {
      issues.push('时间窗结束不能早于操作结束');
    }

    return issues;
  }, [draft, operationTypes.length, selectedStage]);

  const canSave = Boolean(draft) && validationIssues.length === 0 && !saving && !referenceLoading;

  // 编辑模式下，摘要展示「当前指向的操作」(可能已被替换)，并标记是否已替换。
  const isReplaced =
    Boolean(editTarget) && Number(draft?.operationId) !== Number(editTarget?.operationId);
  const currentOperationName = selectedOperation?.operation_name ?? editTarget?.operationName ?? '';
  const currentOperationCode = selectedOperation?.operation_code ?? editTarget?.operationCode ?? '';

  // 选中替换操作：同步工时/人数，并切到自动时间窗按新工时重算，保证保存校验通过。
  const applyReplacementSelection = (item: OperationLibraryItem) => {
    updateDraft((current) => ({
      ...current,
      operationId: Number(item.id),
      durationHours: Number(item.standard_time ?? current.durationHours),
      requiredPeople: Number(item.required_people ?? current.requiredPeople),
      operationTypeId: item.operation_type_id ?? null,
      windowMode: 'auto',
    }));
  };

  // 取消替换：还原为原操作及其原始时间窗 (用户对位置/时间的编辑保留)。
  const handleCancelReplace = () => {
    setReplaceMode(false);
    if (!editTarget) return;
    updateDraft((current) => ({
      ...current,
      operationId: editTarget.operationId,
      durationHours: Number(editTarget.durationHours ?? current.durationHours),
      requiredPeople: Number(editTarget.requiredPeople ?? current.requiredPeople),
      windowMode: 'manual',
      windowStartTime: Number(editTarget.windowStartTime ?? current.windowStartTime),
      windowStartDayOffset: Number(editTarget.windowStartDayOffset ?? current.windowStartDayOffset),
      windowEndTime: Number(editTarget.windowEndTime ?? current.windowEndTime),
      windowEndDayOffset: Number(editTarget.windowEndDayOffset ?? current.windowEndDayOffset),
      searchValue: '',
    }));
  };

  const handleCreate = async (options?: { openAdvanced?: boolean; initialAdvancedTab?: OperationCreatedResult['initialAdvancedTab'] }) => {
    if (!draft || !selectedStage) return;
    if (!canSave) {
      setApiError(validationIssues[0] ?? '请先补齐必填信息');
      return;
    }

    let resolvedOperationId = Number(draft.operationId ?? 0);
    let createdScheduleId: number | null = null;
    let completedStep = '准备创建';

    try {
      setSaving(true);
      setApiError(null);

      if (draft.sourceMode === 'new') {
        completedStep = '创建操作主数据';
        setSavingStep(completedStep);
        const createdOperation = await processTemplateV2Api.createOperationLibraryItem({
          operationName: draft.newOperationName.trim(),
          standardTime: Number(draft.durationHours),
          requiredPeople: Number(draft.requiredPeople),
          operationTypeId: draft.operationTypeId,
          description: draft.description.trim() || undefined,
        });
        resolvedOperationId = Number(createdOperation.id);

        const qualificationPayloads = buildPositionQualificationPayloads(
          Number(draft.requiredPeople),
          draft.qualificationRequirements,
        );
        if (qualificationPayloads.length > 0) {
          completedStep = '保存资质要求';
          setSavingStep(completedStep);
          await Promise.all(
            qualificationPayloads.map((item) =>
              processTemplateV2Api.setOperationPositionQualifications(
                resolvedOperationId,
                item.positionNumber,
                item.qualifications,
              ),
            ),
          );
        }
      }

      if (!resolvedOperationId) {
        throw new Error('请选择操作');
      }

      completedStep = '创建模板操作安排';
      setSavingStep(completedStep);
      createdScheduleId = await processTemplateV2Api.createStageOperationFromCanvas(templateId, {
        stageId: Number(draft.stageId),
        operationId: resolvedOperationId,
        resourceNodeId: draft.resourceNodeId ?? null,
        operationDay: Number(draft.operationDay ?? 0),
        recommendedTime: Number(draft.recommendedTime ?? 0),
        recommendedDayOffset: Number(draft.recommendedDayOffset ?? 0),
        windowStartTime: Number(draft.windowStartTime ?? 0),
        windowStartDayOffset: Number(draft.windowStartDayOffset ?? 0),
        windowEndTime: Number(draft.windowEndTime ?? 0),
        windowEndDayOffset: Number(draft.windowEndDayOffset ?? 0),
        absoluteStartHour: getAbsoluteStartHour(selectedStage, draft),
      });

      setRecentOperationIds(
        writeSavedConfig(templateId, resolvedOperationId, draft, recentOperationIds),
      );
      message.success('操作已创建');
      onCancel();
      // 刷新视图不应阻塞提交完成与弹窗关闭：旧实现 `await onCreated(...)`
      // 在 onCreated 内某刷新挂起时会让 finally 永不执行 → saving 卡死、
      // 弹窗（含取消按钮）全禁用、只能刷新页面（审计 DYN-B2）。
      // 改为后台触发并独立兜底，提交在 createStageOperationFromCanvas 成功即完成。
      void Promise.resolve(
        onCreated({
          scheduleId: createdScheduleId,
          stageId: Number(draft.stageId),
          openAdvanced: Boolean(options?.openAdvanced),
          initialAdvancedTab: options?.initialAdvancedTab,
        }),
      ).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('刷新视图失败:', err);
      });
    } catch (error: any) {
      console.error('Failed to quick create operation:', error);
      const rawMessage = error?.response?.data?.error || error?.message || '创建操作失败';
      const detail = createdScheduleId
        ? `操作已创建，但刷新视图失败：${rawMessage}`
        : completedStep === '创建操作主数据'
          ? `操作主数据创建失败：${rawMessage}`
          : completedStep === '保存资质要求'
            ? `操作主数据已创建，但资质要求保存失败：${rawMessage}`
          : rawMessage;
      setApiError(detail);
      message.error(detail);
    } finally {
      setSaving(false);
      setSavingStep('');
    }
  };

  const handleUpdate = async () => {
    if (!draft || !editTarget || !selectedStage) return;
    if (!canSave) {
      setApiError(validationIssues[0] ?? '请先补齐必填信息');
      return;
    }
    try {
      setSaving(true);
      setApiError(null);
      const replaced = Number(draft.operationId) !== Number(editTarget.operationId);
      setSavingStep(replaced ? '替换操作' : '保存排程参数');
      await processTemplateV2Api.updateStageOperation(editTarget.scheduleId, {
        operationId: replaced ? Number(draft.operationId) : undefined,
        operationDay: Number(draft.operationDay ?? 0),
        recommendedTime: Number(draft.recommendedTime ?? 0),
        recommendedDayOffset: Number(draft.recommendedDayOffset ?? 0),
        windowStartTime: Number(draft.windowStartTime ?? 0),
        windowStartDayOffset: Number(draft.windowStartDayOffset ?? 0),
        windowEndTime: Number(draft.windowEndTime ?? 0),
        windowEndDayOffset: Number(draft.windowEndDayOffset ?? 0),
      });
      // Persist equipment binding only when it changed (null = unbind).
      const nextResourceNodeId = draft.resourceNodeId ?? null;
      if (nextResourceNodeId !== editInitialResourceNodeId) {
        setSavingStep('更新设备绑定');
        await processTemplateV2Api.batchUpdateBindings([editTarget.scheduleId], nextResourceNodeId, 'PRIMARY');
      }
      await onUpdated?.({ scheduleId: editTarget.scheduleId, stageId: Number(draft.stageId) });
      message.success(replaced ? '操作已替换' : '操作已更新');
      onCancel();
    } catch (error: any) {
      const detail = error?.response?.data?.error || error?.message || '更新操作失败';
      setApiError(detail);
      message.error(detail);
    } finally {
      setSaving(false);
      setSavingStep('');
    }
  };

  const renderOperationItem = (item: OperationLibraryItem) => {
    const selected = Number(draft?.operationId) === Number(item.id);
    const recentlyUsed = recentOperationIds.includes(Number(item.id));
    const usedInStage = stageOperationIds.has(Number(item.id));

    return (
      <button
        type="button"
        className={`qcom-operation-card ${selected ? 'is-selected' : ''}`}
        data-testid={`quick-operation-item-${item.id}`}
        aria-pressed={selected}
        onClick={() => {
          if (mode === 'edit') {
            applyReplacementSelection(item);
            setReplaceMode(false);
            return;
          }
          updateDraft((current) => ({
            ...current,
            sourceMode: 'existing',
            operationId: item.id,
            durationHours: Number(item.standard_time ?? current.durationHours),
            requiredPeople: Number(item.required_people ?? current.requiredPeople),
            operationTypeId: item.operation_type_id ?? null,
          }));
        }}
      >
        <span className="qcom-operation-main">
          <span className="qcom-operation-name">{item.operation_name}</span>
          <span className="qcom-operation-code">{item.operation_code}</span>
        </span>
        <span className="qcom-operation-meta">
          <WxbTag color="neutral">{Number(item.standard_time ?? 0)}h</WxbTag>
          <WxbTag color="neutral">{Number(item.required_people ?? 1)}人</WxbTag>
          {item.operation_type_name ? <WxbTag color="cyan">{item.operation_type_name}</WxbTag> : null}
          {item.team_name ? <WxbTag color="neutral">{item.team_name}</WxbTag> : <WxbTag color="amber">未归属团队</WxbTag>}
          {usedInStage ? <WxbTag color="blue">本阶段用过</WxbTag> : null}
          {recentlyUsed ? <WxbTag color="green">最近使用</WxbTag> : null}
        </span>
      </button>
    );
  };

  const footer = (
    <div className="qcom-footer">
      <div className="qcom-footer-summary">
        {savingStep
          ? `处理中：${savingStep}`
          : mode === 'edit'
            ? `保存到 ${selectedStage?.stage_name ?? '未选择阶段'} / ${startLabel}`
            : `创建到 ${selectedStage?.stage_name ?? '未选择阶段'} / ${startLabel}`}
      </div>
      <div className="qcom-footer-actions">
        <WxbButton variant="ghost" onClick={onCancel} disabled={saving}>
          取消
        </WxbButton>
        <WxbButton disabled={!canSave} onClick={() => void (mode === 'edit' ? handleUpdate() : handleCreate())}>
          {mode === 'edit' ? (saving ? '保存中...' : '保存修改') : saving ? '创建中...' : '创建操作'}
        </WxbButton>
      </div>
    </div>
  );

  return (
    <WxbModal
      open={open}
      title={mode === 'edit' ? '编辑操作' : '新增操作'}
      width="min(920px, calc(100vw - 32px))"
      centered
      maskClosable={false}
      destroyOnClose
      className="quick-create-operation-modal"
      footer={footer}
      onCancel={onCancel}
    >
      <div className="quick-create-operation">
        {referenceLoading || !draft ? (
          <div className="qcom-loading">
            <WxbSpinner tip="正在准备操作创建信息" />
          </div>
        ) : (
          <>
            <div className="qcom-context-strip">
              <div className="qcom-context-title">{templateName}</div>
              <div className="qcom-context-tags">
                <WxbTag color="blue">模板 #{templateId}</WxbTag>
                <WxbTag color="cyan">{selectedStage?.stage_name ?? '未选择阶段'}</WxbTag>
                <WxbTag color="green">{startLabel}</WxbTag>
                {mode !== 'edit' && (
                  <WxbTag color={selectedNode ? 'neutral' : 'amber'}>{selectedNode?.nodeName ?? '未绑定资源节点'}</WxbTag>
                )}
              </div>
            </div>

            {apiError ? (
              <div className="qcom-error" role="alert">
                {apiError}
              </div>
            ) : null}

            <div className="qcom-layout">
              <section className="qcom-section qcom-section-source" aria-labelledby="qcom-source-title">
                <div className="qcom-section-header">
                  <div>
                    <h3 id="qcom-source-title">
                      {mode === 'edit' ? (replaceMode ? '替换操作' : '操作') : '选择操作'}
                    </h3>
                  </div>
                  {mode === 'edit' &&
                    (replaceMode ? (
                      <WxbButton variant="ghost" size="sm" onClick={handleCancelReplace}>
                        取消替换
                      </WxbButton>
                    ) : (
                      <WxbButton variant="secondary" size="sm" onClick={() => setReplaceMode(true)}>
                        替换操作
                      </WxbButton>
                    ))}
                  {mode !== 'edit' && (
                    <WxbSegmented
                      size="sm"
                      value={draft.sourceMode}
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          sourceMode: value as SourceMode,
                          operationTypeId:
                            value === 'new'
                              ? operationTypes.some((item) => Number(item.id) === Number(current.operationTypeId))
                                ? current.operationTypeId
                                : defaultOperationTypeId
                              : current.operationTypeId,
                        }))
                      }
                      options={[
                        { label: '现有操作', value: 'existing' },
                        { label: '新建主数据', value: 'new' },
                      ]}
                    />
                  )}
                </div>

                {mode === 'edit' ? (
                  replaceMode ? (
                    <div className="qcom-source-existing">
                      <div className="qcom-muted">
                        选择要替换成的操作；当前排程的位置、时间窗、约束、共享组、设备绑定保持不变。
                      </div>
                      <div className="qcom-source-tools">
                        <WxbSelect
                          className="qcom-team-filter"
                          label="操作团队"
                          value={teamFilterValue}
                          options={teamOptions}
                          onChange={(value) => setTeamFilterValue(String(value ?? ALL_TEAMS_VALUE))}
                        />
                        <WxbSearchInput
                          className="qcom-search"
                          value={draft.searchValue}
                          placeholder="搜索操作名称或编码"
                          onChange={(value) =>
                            updateDraft((current) => ({
                              ...current,
                              searchValue: value,
                            }))
                          }
                        />
                      </div>
                      <div className="qcom-operation-list">
                        {visibleOperations.length ? (
                          <WxbList
                            bordered={false}
                            dataSource={visibleOperations}
                            renderItem={renderOperationItem}
                          />
                        ) : (
                          <WxbEmpty description={draft.searchValue.trim() ? '未找到匹配操作' : `${selectedTeamLabel}暂无操作`} />
                        )}
                      </div>
                      {hiddenOperationCount > 0 ? (
                        <div className="qcom-muted">已显示前 {MAX_VISIBLE_OPERATIONS} 条，另有 {hiddenOperationCount} 条。</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="qcom-source-existing">
                      <div className="qcom-master-summary">
                        <div className="qcom-master-identity">
                          <span className="qcom-master-label">
                            名称 / 人数 / 资格属于操作库（跨模板共享），此处仅调整本排程的时间安排
                          </span>
                          <span className="qcom-master-code">{currentOperationName}</span>
                        </div>
                        <div className="qcom-master-tags">
                          <WxbTag color="neutral">{currentOperationCode}</WxbTag>
                          <WxbTag color="neutral">{Number(draft.durationHours ?? 0)}h</WxbTag>
                          <WxbTag color="neutral">{Number(draft.requiredPeople ?? 1)}人</WxbTag>
                          {isReplaced ? (
                            <WxbTag color="amber">已替换（原 {editTarget?.operationName}）</WxbTag>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                ) : draft.sourceMode === 'existing' ? (
                  <div className="qcom-source-existing">
                    <div className="qcom-source-tools">
                      <WxbSelect
                        className="qcom-team-filter"
                        label="操作团队"
                        value={teamFilterValue}
                        options={teamOptions}
                        onChange={(value) => setTeamFilterValue(String(value ?? ALL_TEAMS_VALUE))}
                      />
                      <WxbSearchInput
                        className="qcom-search"
                        value={draft.searchValue}
                        placeholder="搜索操作名称或编码"
                        onChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            searchValue: value,
                          }))
                        }
                      />
                    </div>
                    <div className="qcom-operation-list">
                      {visibleOperations.length ? (
                        <WxbList
                          bordered={false}
                          dataSource={visibleOperations}
                          renderItem={renderOperationItem}
                        />
                      ) : (
                        <WxbEmpty description={draft.searchValue.trim() ? '未找到匹配操作' : `${selectedTeamLabel}暂无操作`} />
                      )}
                    </div>
                    {hiddenOperationCount > 0 ? (
                      <div className="qcom-muted">已显示前 {MAX_VISIBLE_OPERATIONS} 条，另有 {hiddenOperationCount} 条。</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="qcom-new-operation">
                    <div className="qcom-master-summary">
                      <div className="qcom-master-identity">
                        <span className="qcom-master-label">操作库字段</span>
                        <span className="qcom-master-code">{draft.nextOperationCode}</span>
                      </div>
                      <div className="qcom-master-tags">
                        <WxbTag color={selectedOperationType?.teamName || templateTeamName ? 'cyan' : 'amber'}>
                          {selectedOperationType?.teamName ?? templateTeamName ?? '未归属团队'}
                        </WxbTag>
                        <WxbTag color={selectedOperationType ? 'blue' : 'amber'}>
                          {selectedOperationType?.typeName ?? '未选择类型'}
                        </WxbTag>
                      </div>
                    </div>

                    <div className="qcom-master-grid">
                      <div className="qcom-master-span-2">
                        <WxbInput
                          label="操作名称"
                          value={draft.newOperationName}
                          placeholder="例如：缓冲液配制"
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              newOperationName: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <WxbInput
                        label="操作编码"
                        value={draft.nextOperationCode}
                        disabled
                      />
                      <WxbSelect
                        label="操作类型"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        value={draft.operationTypeId ?? undefined}
                        options={operationTypeOptions}
                        placeholder="选择操作类型"
                        onChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            operationTypeId: value ? Number(value) : null,
                          }))
                        }
                      />
                      <WxbInputNumber
                        label="标准耗时(h)"
                        min={0.25}
                        step={0.25}
                        value={draft.durationHours}
                        onChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            durationHours: Number(value ?? 1),
                          }))
                        }
                      />
                      <WxbInputNumber
                        label="所需人数"
                        min={1}
                        step={1}
                        value={draft.requiredPeople}
                        onChange={(value) =>
                          updateDraft((current) => {
                            const nextRequiredPeople = Number(value ?? 1);
                            return {
                              ...current,
                              requiredPeople: nextRequiredPeople,
                              qualificationRequirements: normalizeQualificationRequirementsForPeople(
                                current.qualificationRequirements,
                                nextRequiredPeople,
                              ),
                            };
                          })
                        }
                      />
                      <div className="qcom-master-span-2">
                        <WxbTextarea
                          label="描述"
                          rows={3}
                          value={draft.description}
                          placeholder="可选"
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="qcom-qualification-panel">
                      <div className="qcom-qualification-header">
                        <span className="qcom-master-meta-title">资质要求</span>
                        <div className="qcom-qualification-actions">
                          <WxbTag color={draft.qualificationRequirements.length > 0 ? 'blue' : 'neutral'}>
                            {draft.qualificationRequirements.length > 0
                              ? `${draft.qualificationRequirements.length} 项`
                              : '未设置'}
                          </WxbTag>
                          <WxbButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={qualificationOptions.length === 0}
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                qualificationRequirements: [
                                  ...current.qualificationRequirements,
                                  createDraftQualificationRequirement(),
                                ],
                              }))
                            }
                          >
                            添加资质
                          </WxbButton>
                        </div>
                      </div>

                      {draft.qualificationRequirements.length > 0 ? (
                        <div className="qcom-qualification-list">
                          {draft.qualificationRequirements.map((requirement, index) => (
                            <div className="qcom-qualification-row" key={requirement.clientId}>
                              <WxbSelect
                                label={index === 0 ? '资质' : undefined}
                                showSearch
                                optionFilterProp="label"
                                value={requirement.qualificationId ?? undefined}
                                options={qualificationOptions}
                                placeholder="选择资质"
                                onChange={(value) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    qualificationRequirements: current.qualificationRequirements.map((item) =>
                                      item.clientId === requirement.clientId
                                        ? { ...item, qualificationId: value ? Number(value) : null }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <WxbInputNumber
                                label={index === 0 ? '最低等级' : undefined}
                                min={1}
                                max={5}
                                step={1}
                                value={requirement.minLevel}
                                onChange={(value) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    qualificationRequirements: current.qualificationRequirements.map((item) =>
                                      item.clientId === requirement.clientId
                                        ? { ...item, minLevel: Number(value ?? 1) }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <WxbSelect
                                label={index === 0 ? '适用岗位' : undefined}
                                value={requirement.scope === 'all' ? 'all' : String(requirement.positionNumber)}
                                options={positionScopeOptions}
                                onChange={(value) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    qualificationRequirements: current.qualificationRequirements.map((item) =>
                                      item.clientId === requirement.clientId
                                        ? String(value) === 'all'
                                          ? { ...item, scope: 'all', positionNumber: 1 }
                                          : { ...item, scope: 'position', positionNumber: Number(value) || 1 }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <div className="qcom-qualification-required">
                                {index === 0 ? <span className="qcom-field-label">必须</span> : null}
                                <WxbSwitch
                                  size="sm"
                                  checked={requirement.isMandatory}
                                  checkedChildren="是"
                                  unCheckedChildren="否"
                                  onChange={(checked) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      qualificationRequirements: current.qualificationRequirements.map((item) =>
                                        item.clientId === requirement.clientId
                                          ? { ...item, isMandatory: checked }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <div className="qcom-qualification-remove">
                                {index === 0 ? <span className="qcom-field-label">操作</span> : null}
                                <WxbButton
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    updateDraft((current) => ({
                                      ...current,
                                      qualificationRequirements: current.qualificationRequirements.filter(
                                        (item) => item.clientId !== requirement.clientId,
                                      ),
                                    }))
                                  }
                                >
                                  删除
                                </WxbButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="qcom-qualification-empty">
                          {qualificationOptions.length > 0 ? '未设置资质要求' : '暂无可用资质'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section className="qcom-section qcom-section-arrange" aria-labelledby="qcom-arrange-title">
                <div className="qcom-section-header">
                  <div>
                    <h3 id="qcom-arrange-title">安排信息</h3>
                  </div>
                </div>

                <div className="qcom-form-grid">
                  <WxbSelect
                    label="所属阶段"
                    value={draft.stageId ?? undefined}
                    options={stageOptions}
                    showSearch
                    optionFilterProp="label"
                    disabled={mode === 'edit'}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        stageId: value ? Number(value) : null,
                      }))
                    }
                  />
                  {mode === 'edit' ? (
                    <WxbSelect
                      label="设备绑定"
                      value={draft.resourceNodeId ?? undefined}
                      options={bindingOptions}
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      placeholder="未绑定"
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          resourceNodeId: value ? Number(value) : null,
                        }))
                      }
                    />
                  ) : (
                    <WxbSelect
                      label="默认资源节点"
                      value={draft.resourceNodeId ?? undefined}
                      options={resourceOptions}
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      placeholder="可不绑定"
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          resourceNodeId: value ? Number(value) : null,
                        }))
                      }
                    />
                  )}
                  <WxbInputNumber
                    label="阶段内 Day"
                    value={draft.operationDay}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        operationDay: Number(value ?? 0),
                      }))
                    }
                  />
                  <WxbInputNumber
                    label="开始时刻(h)"
                    min={0}
                    max={23.75}
                    step={0.5}
                    value={draft.recommendedTime}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        recommendedTime: Number(value ?? 0),
                      }))
                    }
                  />
                  <WxbInputNumber
                    label="标准时长(h)"
                    min={0.25}
                    step={0.25}
                    value={draft.durationHours}
                    disabled={draft.sourceMode === 'existing'}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        durationHours: Number(value ?? 1),
                      }))
                    }
                  />
                  <WxbInputNumber
                    label="人员需求"
                    min={1}
                    step={1}
                    value={draft.requiredPeople}
                    disabled={draft.sourceMode === 'existing'}
                    onChange={(value) =>
                      updateDraft((current) => {
                        const nextRequiredPeople = Number(value ?? 1);
                        return {
                          ...current,
                          requiredPeople: nextRequiredPeople,
                          qualificationRequirements: normalizeQualificationRequirementsForPeople(
                            current.qualificationRequirements,
                            nextRequiredPeople,
                          ),
                        };
                      })
                    }
                  />
                </div>

                <div className="qcom-auto-band">
                  <div>
                    <span className="qcom-band-label">自动带入</span>
                    <span className="qcom-band-value">开始 {startLabel}</span>
                  </div>
                  <div>
                    <span className="qcom-band-label">默认时间窗</span>
                    <span className="qcom-band-value">{windowLabel}</span>
                  </div>
                </div>

                {validationIssues.length > 0 ? (
                  <div className="qcom-validation-list">
                    {validationIssues.map((issue) => (
                      <div key={issue}>{issue}</div>
                    ))}
                  </div>
                ) : null}

                <WxbCollapse
                  className="qcom-advanced"
                  items={[
                    {
                      key: 'advanced',
                      label: (
                        <span className="qcom-collapse-label">
                          高级设置
                          <span>
                            {[
                              capabilities.resourceRulesEnabled ? '资源规则' : null,
                              capabilities.constraintEditEnabled ? '约束' : null,
                              capabilities.shareGroupEnabled ? '共享组' : null,
                            ].filter(Boolean).join(' / ') || '时间窗'}
                          </span>
                        </span>
                      ),
                      children: (
                        <div className="qcom-advanced-content">
                          <div className="qcom-window-mode">
                            <span className="qcom-field-label">时间窗</span>
                            <WxbSegmented
                              size="sm"
                              value={draft.windowMode}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  windowMode: value as WindowMode,
                                }))
                              }
                              options={[
                                { label: '自动', value: 'auto' },
                                { label: '手动', value: 'manual' },
                              ]}
                            />
                          </div>
                          <div className="qcom-form-grid qcom-form-grid-compact">
                            <WxbInputNumber
                              label="跨日偏移"
                              value={draft.recommendedDayOffset}
                              disabled={draft.windowMode === 'auto'}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  recommendedDayOffset: Number(value ?? 0),
                                }))
                              }
                            />
                            <WxbInputNumber
                              label="窗开始(h)"
                              min={0}
                              max={23.75}
                              step={0.5}
                              value={draft.windowStartTime}
                              disabled={draft.windowMode === 'auto'}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  windowStartTime: Number(value ?? 0),
                                }))
                              }
                            />
                            <WxbInputNumber
                              label="窗开始偏移"
                              value={draft.windowStartDayOffset}
                              disabled={draft.windowMode === 'auto'}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  windowStartDayOffset: Number(value ?? 0),
                                }))
                              }
                            />
                            <WxbInputNumber
                              label="窗结束(h)"
                              min={0}
                              max={23.75}
                              step={0.5}
                              value={draft.windowEndTime}
                              disabled={draft.windowMode === 'auto'}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  windowEndTime: Number(value ?? 0),
                                }))
                              }
                            />
                            <WxbInputNumber
                              label="窗结束偏移"
                              value={draft.windowEndDayOffset}
                              disabled={draft.windowMode === 'auto'}
                              onChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  windowEndDayOffset: Number(value ?? 0),
                                }))
                              }
                            />
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </WxbModal>
  );
};

export default QuickCreateOperationModal;
