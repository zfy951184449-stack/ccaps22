import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  CopyOutlined,
  EnterOutlined,
  InfoCircleOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { processTemplateV2Api } from '../../services';
import { Resource } from '../../types/platform';
import { ResourceRequirementRule } from '../ProcessTemplateGantt/types';
import {
  OperationCreateConstraintDraft,
  OperationCreateContext,
  OperationCreateFormState,
  OperationCreatePreview,
  OperationCreateValidationIssue,
  OperationCreateWindowMode,
  OperationLibraryItem,
  OperationSourceRecommendation,
  OperationTypeOption,
  PlannerOperation,
  ResourceNode,
  TemplateEditorCapabilities,
  TemplateShareGroupSummary,
  TemplateStageSummary,
} from './types';

type TemplateOperationCreateModalProps = {
  open: boolean;
  templateId: number;
  templateName: string;
  templateTeamId: number | null;
  stages: TemplateStageSummary[];
  operations: PlannerOperation[];
  resourceNodes: ResourceNode[];
  operationLibrary: OperationLibraryItem[];
  shareGroups: TemplateShareGroupSummary[];
  capabilities: TemplateEditorCapabilities;
  context: OperationCreateContext | null;
  onCancel: () => void;
  onCreated: (scheduleId: number, stageId: number) => Promise<void> | void;
};

type SavedCreateConfig = {
  placementDraft: OperationCreateFormState['placementDraft'];
  timingDraft: Pick<
    OperationCreateFormState['timingDraft'],
    | 'operationDay'
    | 'recommendedTime'
    | 'recommendedDayOffset'
    | 'durationHours'
    | 'windowMode'
    | 'windowStartTime'
    | 'windowStartDayOffset'
    | 'windowEndTime'
    | 'windowEndDayOffset'
  >;
  rulesDraft: OperationCreateFormState['rulesDraft'];
  shareGroupDraft: Pick<OperationCreateFormState['shareGroupDraft'], 'assignGroupId' | 'createNew'>;
  sourceDraft: Pick<OperationCreateFormState['sourceDraft'], 'mode' | 'operationTypeId'>;
  recentOperationIds: number[];
};

const STORAGE_PREFIX = 'process-template-v2-create-operation';
const OPERATION_ROW_HEIGHT = 86;
const RESOURCE_TYPE_OPTIONS: Array<ResourceRequirementRule['resource_type']> = [
  'ROOM',
  'EQUIPMENT',
  'VESSEL_CONTAINER',
  'TOOLING',
  'STERILIZATION_RESOURCE',
];

const CONSTRAINT_TYPE_OPTIONS = [
  { value: 1 as const, label: 'FS' },
  { value: 2 as const, label: 'SS' },
  { value: 3 as const, label: 'FF' },
  { value: 4 as const, label: 'SF' },
];

const LAG_TYPE_OPTIONS: Array<NonNullable<OperationCreateConstraintDraft['lagType']>> = [
  'ASAP',
  'FIXED',
  'WINDOW',
  'NEXT_DAY',
  'NEXT_SHIFT',
  'COOLING',
  'BATCH_END',
];

const normalizeText = (value: string) => value.trim().toLowerCase();

const isKeyboardEditableTarget = (target: HTMLElement | null) => {
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'OPTION') {
    return true;
  }

  return Boolean(
    target.closest(
      '.ant-input, .ant-input-number, .ant-select, .ant-picker, .ant-mentions, .ant-segmented, .ant-select-dropdown, [role="combobox"]',
    ),
  );
};

type OperationListRowData = {
  items: OperationLibraryItem[];
  selectedOperationId: number | null;
  activeIndex: number;
  stageOperationIds: Set<number>;
  onSelect: (operationId: number) => void;
  onHover: (index: number) => void;
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

const getStorageKey = (templateId: number) => `${STORAGE_PREFIX}:${templateId}`;

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

const getAbsoluteStartHour = (
  stage: TemplateStageSummary | null | undefined,
  timingDraft: OperationCreateFormState['timingDraft'],
) => {
  if (!stage) {
    return timingDraft.operationDay * 24 + timingDraft.recommendedTime;
  }
  return (
    (Number(stage.start_day ?? 0) +
      Number(timingDraft.operationDay ?? 0) +
      Number(timingDraft.recommendedDayOffset ?? 0)) *
      24 +
    Number(timingDraft.recommendedTime ?? 0)
  );
};

const buildAutomaticWindow = (
  stage: TemplateStageSummary | null | undefined,
  timingDraft: OperationCreateFormState['timingDraft'],
) => {
  const absoluteStartHour = getAbsoluteStartHour(stage, timingDraft);
  const windowStartAbsolute = absoluteStartHour - 2;
  const windowEndAbsolute = absoluteStartHour + Math.max(Number(timingDraft.durationHours ?? 2), 2);
  const stageStartDay = Number(stage?.start_day ?? 0);
  const operationDay = Number(timingDraft.operationDay ?? 0);

  return {
    windowStartTime: toHourValue(windowStartAbsolute),
    windowStartDayOffset: Math.floor(windowStartAbsolute / 24) - stageStartDay - operationDay,
    windowEndTime: toHourValue(windowEndAbsolute),
    windowEndDayOffset: Math.floor(windowEndAbsolute / 24) - stageStartDay - operationDay,
  };
};

const buildTimingFromAbsoluteStart = (
  stage: TemplateStageSummary | null | undefined,
  absoluteStartHour: number,
  durationHours: number,
) => {
  const stageStartDay = Number(stage?.start_day ?? 0);
  const absoluteDay = Math.floor(absoluteStartHour / 24);
  const operationDay = Math.max(0, absoluteDay - stageStartDay);
  const recommendedDayOffset = absoluteDay - stageStartDay - operationDay;

  return {
    operationDay,
    recommendedTime: toHourValue(absoluteStartHour),
    recommendedDayOffset,
    durationHours,
    ...buildAutomaticWindow(stage, {
      operationDay,
      recommendedTime: toHourValue(absoluteStartHour),
      recommendedDayOffset,
      durationHours,
      windowMode: 'auto',
      windowStartTime: 0,
      windowStartDayOffset: 0,
      windowEndTime: 0,
      windowEndDayOffset: 0,
      absoluteStartHour,
    }),
  };
};

const inferRuleTypeFromNode = (node: ResourceNode | null | undefined): ResourceRequirementRule['resource_type'] => {
  const resourceType = node?.boundResourceType as ResourceRequirementRule['resource_type'] | undefined;
  if (resourceType && RESOURCE_TYPE_OPTIONS.includes(resourceType)) {
    return resourceType;
  }
  if (node?.nodeClass === 'ROOM') {
    return 'ROOM';
  }
  return 'EQUIPMENT';
};

const createRequirementFromNode = (node: ResourceNode | null | undefined): ResourceRequirementRule => ({
  id: null,
  resource_type: inferRuleTypeFromNode(node),
  required_count: 1,
  is_mandatory: true,
  requires_exclusive_use: true,
  prep_minutes: 0,
  changeover_minutes: 0,
  cleanup_minutes: 0,
  candidate_resource_ids: node?.boundResourceId ? [Number(node.boundResourceId)] : [],
  candidate_resources:
    node?.boundResourceId && node.boundResourceCode
      ? [
          {
            id: Number(node.boundResourceId),
            resource_code: node.boundResourceCode,
            resource_name: node.boundResourceName ?? node.boundResourceCode,
            resource_type: node.boundResourceType ?? inferRuleTypeFromNode(node),
          },
        ]
      : [],
  source_scope: 'TEMPLATE_OVERRIDE',
});

const createConstraintDraft = (): OperationCreateConstraintDraft => ({
  tempId: `constraint-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  relationType: 'predecessor',
  relatedScheduleId: null,
  constraintType: 1,
  lagTime: 0,
  lagType: 'FIXED',
  lagMin: 0,
  lagMax: null,
  constraintLevel: 1,
  constraintName: '',
  description: '',
});

const buildOperationUsageMap = (operations: PlannerOperation[]) => {
  const stageMap = new Map<number, Map<number, number>>();
  operations.forEach((operation) => {
    const stageId = Number(operation.stage_id);
    const operationId = Number(operation.operation_id);
    if (!stageMap.has(stageId)) {
      stageMap.set(stageId, new Map<number, number>());
    }
    const current = stageMap.get(stageId)!;
    current.set(operationId, Number(current.get(operationId) ?? 0) + 1);
  });
  return stageMap;
};

const buildNodeMap = (nodes: ResourceNode[]) => new Map(nodes.map((node) => [Number(node.id), node]));

const buildInitialFormState = ({
  stages,
  operations,
  operationLibrary,
  leafNodes,
  context,
  lastConfig,
  nextOperationCode,
}: {
  stages: TemplateStageSummary[];
  operations: PlannerOperation[];
  operationLibrary: OperationLibraryItem[];
  leafNodes: ResourceNode[];
  context: OperationCreateContext | null;
  lastConfig: SavedCreateConfig | null;
  nextOperationCode: string;
}): OperationCreateFormState => {
  const fallbackStageId = context?.stageId ?? lastConfig?.placementDraft.stageId ?? stages[0]?.id ?? null;
  const selectedStage = stages.find((item) => Number(item.id) === Number(fallbackStageId)) ?? stages[0] ?? null;
  const selectedNodeId = context?.resourceNodeId ?? lastConfig?.placementDraft.resourceNodeId ?? null;
  const selectedNode = leafNodes.find((item) => Number(item.id) === Number(selectedNodeId)) ?? null;
  const stageOperations = operations
    .filter((item) => Number(item.stage_id) === Number(selectedStage?.id))
    .sort((left, right) => {
      const leftValue =
        (Number(left.stage_start_day ?? 0) + Number(left.operation_day ?? 0) + Number(left.recommended_day_offset ?? 0)) * 24 +
        Number(left.recommended_time ?? 0);
      const rightValue =
        (Number(right.stage_start_day ?? 0) + Number(right.operation_day ?? 0) + Number(right.recommended_day_offset ?? 0)) * 24 +
        Number(right.recommended_time ?? 0);
      return leftValue - rightValue;
    });
  const previousOperation = stageOperations[stageOperations.length - 1];
  const fallbackDuration = Number(lastConfig?.timingDraft.durationHours ?? 4);
  const fallbackAbsoluteStart =
    context?.absoluteStartHour ??
    (previousOperation
      ? (Number(previousOperation.stage_start_day ?? 0) +
          Number(previousOperation.operation_day ?? 0) +
          Number(previousOperation.recommended_day_offset ?? 0)) *
          24 +
        Number(previousOperation.recommended_time ?? 0) +
        Math.max(Number(previousOperation.standard_time ?? 2), 1)
      : Number(selectedStage?.start_day ?? 0) * 24 + 9);

  const timing = context?.absoluteStartHour
    ? buildTimingFromAbsoluteStart(selectedStage, context.absoluteStartHour, fallbackDuration)
    : {
        ...buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration),
        operationDay: context?.operationDay ?? lastConfig?.timingDraft.operationDay ?? buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).operationDay,
        recommendedTime:
          context?.recommendedTime ??
          lastConfig?.timingDraft.recommendedTime ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).recommendedTime,
        recommendedDayOffset:
          context?.recommendedDayOffset ??
          lastConfig?.timingDraft.recommendedDayOffset ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).recommendedDayOffset,
        windowStartTime:
          context?.windowStartTime ??
          lastConfig?.timingDraft.windowStartTime ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).windowStartTime,
        windowStartDayOffset:
          context?.windowStartDayOffset ??
          lastConfig?.timingDraft.windowStartDayOffset ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).windowStartDayOffset,
        windowEndTime:
          context?.windowEndTime ??
          lastConfig?.timingDraft.windowEndTime ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).windowEndTime,
        windowEndDayOffset:
          context?.windowEndDayOffset ??
          lastConfig?.timingDraft.windowEndDayOffset ??
          buildTimingFromAbsoluteStart(selectedStage, fallbackAbsoluteStart, fallbackDuration).windowEndDayOffset,
      };

  const defaultOperation =
    operationLibrary.find((item) => Number(item.id) === Number(lastConfig?.recentOperationIds?.[0])) ?? null;
  const hasStageHistory = operations.some((item) => Number(item.stage_id) === Number(selectedStage?.id));

  return {
    sourceDraft: {
      mode: lastConfig?.sourceDraft.mode ?? 'existing',
      filter: hasStageHistory ? 'stage' : 'all',
      searchValue: '',
      operationId: defaultOperation?.id ?? null,
      newOperationName: '',
      nextOperationCode,
      standardTime: Number(defaultOperation?.standard_time ?? fallbackDuration),
      requiredPeople: Number(defaultOperation?.required_people ?? 1),
      operationTypeId: defaultOperation?.operation_type_id ?? lastConfig?.sourceDraft.operationTypeId ?? null,
      description: '',
    },
    placementDraft: {
      stageId: selectedStage?.id ?? null,
      resourceNodeId: selectedNode?.id ?? null,
    },
    timingDraft: {
      operationDay: Number(timing.operationDay ?? 0),
      recommendedTime: Number(timing.recommendedTime ?? 9),
      recommendedDayOffset: Number(timing.recommendedDayOffset ?? 0),
      durationHours: Number(timing.durationHours ?? fallbackDuration),
      windowMode: lastConfig?.timingDraft.windowMode ?? 'auto',
      windowStartTime: Number(timing.windowStartTime ?? 7),
      windowStartDayOffset: Number(timing.windowStartDayOffset ?? 0),
      windowEndTime: Number(timing.windowEndTime ?? 13),
      windowEndDayOffset: Number(timing.windowEndDayOffset ?? 0),
      absoluteStartHour: context?.absoluteStartHour,
    },
    rulesDraft: {
      requirements:
        lastConfig?.rulesDraft.requirements?.length
          ? lastConfig.rulesDraft.requirements
          : selectedNode
            ? [createRequirementFromNode(selectedNode)]
            : [],
    },
    constraintsDraft: {
      items: [],
    },
    shareGroupDraft: {
      assignGroupId: lastConfig?.shareGroupDraft.assignGroupId ?? null,
      createNew: lastConfig?.shareGroupDraft.createNew ?? false,
      newGroupName: '',
      newGroupMode: 'SAME_TEAM',
      memberIds: [],
    },
  };
};

const sanitizeFormState = (formState: OperationCreateFormState | null) =>
  formState
    ? JSON.stringify({
        sourceDraft: {
          ...formState.sourceDraft,
          searchValue: formState.sourceDraft.searchValue.trim(),
          newOperationName: formState.sourceDraft.newOperationName.trim(),
          description: formState.sourceDraft.description.trim(),
        },
        placementDraft: formState.placementDraft,
        timingDraft: formState.timingDraft,
        rulesDraft: formState.rulesDraft,
        constraintsDraft: formState.constraintsDraft,
        shareGroupDraft: {
          ...formState.shareGroupDraft,
          newGroupName: formState.shareGroupDraft.newGroupName.trim(),
        },
      })
    : null;

const OperationListRow: React.FC<ListChildComponentProps<OperationListRowData>> = ({ index, style, data }) => {
  const item = data.items[index];
  const selected = Number(data.selectedOperationId) === Number(item.id);
  const isActive = index === data.activeIndex;
  const inCurrentStage = data.stageOperationIds.has(Number(item.id));

  return (
    <div style={style} className="px-2 py-1">
      <button
        type="button"
        aria-pressed={selected}
        data-testid={`operation-list-item-${item.id}`}
        onFocus={() => data.onHover(index)}
        onMouseEnter={() => data.onHover(index)}
        onClick={() => data.onSelect(item.id)}
        className={`flex h-[76px] w-full items-start justify-between rounded-xl border px-3 py-2 text-left transition-all ${
          selected
            ? 'border-sky-500 bg-sky-50 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]'
            : isActive
              ? 'border-slate-300 bg-white'
              : 'border-transparent bg-white hover:border-slate-200'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{item.operation_name}</div>
          <div className="mt-1 text-xs text-slate-500">{item.operation_code}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Tag>标准时长 {item.standard_time}h</Tag>
            <Tag>所需人数 {item.required_people}</Tag>
            {item.operation_type_name ? <Tag color="geekblue">{item.operation_type_name}</Tag> : null}
            {inCurrentStage ? <Tag color="gold">本阶段已使用</Tag> : null}
          </div>
        </div>
      </button>
    </div>
  );
};

const TemplateOperationCreateModal: React.FC<TemplateOperationCreateModalProps> = ({
  open,
  templateId,
  templateName,
  templateTeamId,
  stages,
  operations,
  resourceNodes,
  operationLibrary,
  shareGroups,
  capabilities,
  context,
  onCancel,
  onCreated,
}) => {
  const allNodes = useMemo(() => flattenNodes(resourceNodes), [resourceNodes]);
  const leafNodes = useMemo(() => allNodes.filter((item) => (item.children ?? []).length === 0), [allNodes]);
  const nodeMap = useMemo(() => buildNodeMap(allNodes), [allNodes]);
  const stageUsageMap = useMemo(() => buildOperationUsageMap(operations), [operations]);
  const [formState, setFormState] = useState<OperationCreateFormState | null>(null);
  const [initialStateSignature, setInitialStateSignature] = useState<string | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationTypeOption[]>([]);
  const [apiIssues, setApiIssues] = useState<OperationCreateValidationIssue[]>([]);
  const [newConstraintDraft, setNewConstraintDraft] = useState<OperationCreateConstraintDraft>(createConstraintDraft());
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const [activeOperationIndex, setActiveOperationIndex] = useState(0);

  const lastConfig = useMemo<SavedCreateConfig | null>(() => {
    try {
      const raw = window.localStorage.getItem(getStorageKey(templateId));
      return raw ? (JSON.parse(raw) as SavedCreateConfig) : null;
    } catch (error) {
      console.error('Failed to read create-operation cache:', error);
      return null;
    }
  }, [templateId]);

  const initialRecentOperationIds = useMemo(() => lastConfig?.recentOperationIds ?? [], [lastConfig]);
  const [recentOperationIdsState, setRecentOperationIdsState] = useState<number[]>(initialRecentOperationIds);
  const operationById = useMemo(
    () => new Map(operationLibrary.map((item) => [Number(item.id), item])),
    [operationLibrary],
  );
  const normalizedSearchIndex = useMemo(
    () =>
      new Map(
        operationLibrary.map((item) => [
          Number(item.id),
          `${normalizeText(item.operation_code)} ${normalizeText(item.operation_name)}`,
        ]),
      ),
    [operationLibrary],
  );
  const operationListRef = useRef<FixedSizeList<OperationListRowData> | null>(null);
  const openSeed = useMemo(() => (open ? `${templateId}:${JSON.stringify(context ?? {})}` : null), [context, open, templateId]);
  const deferredSearchValue = useDeferredValue(formState?.sourceDraft.searchValue ?? '');

  useEffect(() => {
    if (!open) {
      setApiIssues([]);
      setSavingStep('');
      setInitializedKey(null);
      return;
    }

    if (initializedKey && initializedKey === openSeed) {
      return;
    }

    let cancelled = false;

    const loadReferenceData = async () => {
      try {
        setLoadingReference(true);
        const [nextOperationCode, nextOperationTypes, nextResources] = await Promise.all([
          processTemplateV2Api.getNextOperationCode(),
          processTemplateV2Api.listOperationTypes(templateTeamId),
          capabilities.resourceRulesEnabled ? processTemplateV2Api.listResources() : Promise.resolve([]),
        ]);

        if (cancelled) {
          return;
        }

        const nextState = buildInitialFormState({
          stages,
          operations,
          operationLibrary,
          leafNodes,
          context,
          lastConfig,
          nextOperationCode,
        });

        setOperationTypes(nextOperationTypes);
        setResources(nextResources);
        setFormState(nextState);
        setInitialStateSignature(sanitizeFormState(nextState));
        setNewConstraintDraft(createConstraintDraft());
        setInitializedKey(openSeed);
      } catch (error: any) {
        console.error('Failed to prepare operation create modal:', error);
        message.error(error?.response?.data?.error || '初始化新增工序弹窗失败');
      } finally {
        if (!cancelled) {
          setLoadingReference(false);
        }
      }
    };

    void loadReferenceData();

    return () => {
      cancelled = true;
    };
  }, [
    capabilities.resourceRulesEnabled,
    context,
    initializedKey,
    lastConfig,
    leafNodes,
    open,
    openSeed,
    operationLibrary,
    operations,
    stages,
    templateTeamId,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRecentOperationIdsState(initialRecentOperationIds);
    setActiveOperationIndex(0);
  }, [initialRecentOperationIds, open, openSeed]);

  const selectedStage = useMemo(
    () => stages.find((item) => Number(item.id) === Number(formState?.placementDraft.stageId)) ?? null,
    [formState?.placementDraft.stageId, stages],
  );

  const selectedNode = useMemo(
    () => (formState?.placementDraft.resourceNodeId ? nodeMap.get(Number(formState.placementDraft.resourceNodeId)) ?? null : null),
    [formState?.placementDraft.resourceNodeId, nodeMap],
  );

  const selectedExistingOperation = useMemo(
    () => (formState?.sourceDraft.operationId ? operationById.get(Number(formState.sourceDraft.operationId)) ?? null : null),
    [formState?.sourceDraft.operationId, operationById],
  );

  const matchingHistoricalOperation = useMemo(() => {
    if (!selectedExistingOperation) {
      return null;
    }
    return (
      operations.find((item) => Number(item.operation_id) === Number(selectedExistingOperation.id) && item.resource_requirements?.length) ??
      null
    );
  }, [operations, selectedExistingOperation]);

  useEffect(() => {
    if (!selectedExistingOperation) {
      return;
    }
    setFormState((current) =>
      current?.sourceDraft.mode === 'existing'
        ? {
            ...current,
            sourceDraft: {
              ...current.sourceDraft,
              standardTime: Number(selectedExistingOperation.standard_time ?? current.sourceDraft.standardTime),
              requiredPeople: Number(selectedExistingOperation.required_people ?? current.sourceDraft.requiredPeople),
              operationTypeId: selectedExistingOperation.operation_type_id ?? current.sourceDraft.operationTypeId,
            },
            timingDraft: {
              ...current.timingDraft,
              durationHours: Number(selectedExistingOperation.standard_time ?? current.timingDraft.durationHours),
            },
          }
        : current,
    );
  }, [selectedExistingOperation]);

  useEffect(() => {
    if (!formState || formState.timingDraft.windowMode !== 'auto') {
      return;
    }
    const nextWindow = buildAutomaticWindow(selectedStage, formState.timingDraft);
    if (
      nextWindow.windowStartTime === formState.timingDraft.windowStartTime &&
      nextWindow.windowStartDayOffset === formState.timingDraft.windowStartDayOffset &&
      nextWindow.windowEndTime === formState.timingDraft.windowEndTime &&
      nextWindow.windowEndDayOffset === formState.timingDraft.windowEndDayOffset
    ) {
      return;
    }
    setFormState((current) =>
      current
        ? {
            ...current,
            timingDraft: {
              ...current.timingDraft,
              ...nextWindow,
            },
          }
        : current,
    );
  }, [
    formState,
    formState?.timingDraft.durationHours,
    formState?.timingDraft.operationDay,
    formState?.timingDraft.recommendedDayOffset,
    formState?.timingDraft.recommendedTime,
    formState?.timingDraft.windowMode,
    selectedStage,
  ]);

  useEffect(() => {
    setFormState((current) =>
      current && selectedNode && current.rulesDraft.requirements.length === 0
        ? {
            ...current,
            rulesDraft: {
              requirements: [createRequirementFromNode(selectedNode)],
            },
          }
        : current,
    );
  }, [selectedNode]);

  const stageOperationIds = useMemo(
    () => new Set((operations.filter((item) => Number(item.stage_id) === Number(selectedStage?.id)) ?? []).map((item) => Number(item.operation_id))),
    [operations, selectedStage?.id],
  );

  const departmentOperationIds = useMemo(() => {
    if (!selectedNode) {
      return new Set<number>();
    }
    const matchingNodeIds = new Set(
      allNodes
        .filter((item) => item.departmentCode === selectedNode.departmentCode)
        .map((item) => Number(item.id)),
    );
    return new Set(
      operations
        .filter((item) => item.defaultResourceNodeId && matchingNodeIds.has(Number(item.defaultResourceNodeId)))
        .map((item) => Number(item.operation_id)),
    );
  }, [allNodes, operations, selectedNode]);

  const recommendedOperations = useMemo<OperationSourceRecommendation[]>(() => {
    const seen = new Set<number>();
    const recommendations: OperationSourceRecommendation[] = [];

    const push = (operationId: number, reason: string, badge?: string) => {
      if (!operationId || seen.has(operationId)) {
        return;
      }
      seen.add(operationId);
      recommendations.push({ operationId, reason, badge });
    };

    const stageUsage = Array.from(stageUsageMap.get(Number(selectedStage?.id))?.entries() ?? [])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
    stageUsage.forEach(([operationId]) => push(operationId, '当前阶段常用', '阶段'));
    recentOperationIdsState.slice(0, 4).forEach((operationId) => push(operationId, '最近使用', '最近'));
    departmentOperationIds.forEach((operationId) => push(operationId, '同部门域常见', '部门域'));

    return recommendations
      .filter((item) => operationById.has(Number(item.operationId)))
      .slice(0, 6);
  }, [departmentOperationIds, operationById, recentOperationIdsState, selectedStage?.id, stageUsageMap]);

  const filteredOperationLibrary = useMemo(() => {
    const searchValue = normalizeText(deferredSearchValue);
    const currentFilter = formState?.sourceDraft.filter ?? 'all';
    return operationLibrary.filter((item) => {
      if (currentFilter === 'recent' && !recentOperationIdsState.includes(Number(item.id))) {
        return false;
      }
      if (currentFilter === 'stage' && !stageOperationIds.has(Number(item.id))) {
        return false;
      }
      if (currentFilter === 'department' && !departmentOperationIds.has(Number(item.id))) {
        return false;
      }
      if (!searchValue) {
        return true;
      }
      return (normalizedSearchIndex.get(Number(item.id)) ?? '').includes(searchValue);
    });
  }, [
    deferredSearchValue,
    departmentOperationIds,
    formState?.sourceDraft.filter,
    normalizedSearchIndex,
    operationLibrary,
    recentOperationIdsState,
    stageOperationIds,
  ]);

  const selectExistingOperation = (operationId: number) => {
    setFormState((current) =>
      current
        ? {
            ...current,
            sourceDraft: {
              ...current.sourceDraft,
              operationId,
            },
          }
        : current,
    );
  };

  const selectedOperationVisibleInFilteredList = useMemo(
    () =>
      Boolean(
        selectedExistingOperation &&
          filteredOperationLibrary.some((item) => Number(item.id) === Number(selectedExistingOperation.id)),
      ),
    [filteredOperationLibrary, selectedExistingOperation],
  );

  const operationFilterLabel = useMemo(() => {
    if (formState?.sourceDraft.filter === 'recent') {
      return '最近使用';
    }
    if (formState?.sourceDraft.filter === 'stage') {
      return '当前阶段常用';
    }
    if (formState?.sourceDraft.filter === 'department') {
      return '同部门域';
    }
    return '全部';
  }, [formState?.sourceDraft.filter]);
  const sourceMode = formState?.sourceDraft.mode;
  const sourceOperationId = formState?.sourceDraft.operationId;

  useEffect(() => {
    if (sourceMode !== 'existing') {
      return;
    }

    setActiveOperationIndex((current) => {
      if (!filteredOperationLibrary.length) {
        return 0;
      }
      const selectedIndex = filteredOperationLibrary.findIndex(
        (item) => Number(item.id) === Number(sourceOperationId),
      );
      const nextIndex = selectedIndex >= 0 ? selectedIndex : Math.min(current, filteredOperationLibrary.length - 1);
      return nextIndex === current ? current : nextIndex;
    });
  }, [filteredOperationLibrary, sourceMode, sourceOperationId]);

  useEffect(() => {
    if (!filteredOperationLibrary.length) {
      return;
    }
    operationListRef.current?.scrollToItem(activeOperationIndex, 'smart');
  }, [activeOperationIndex, filteredOperationLibrary.length]);

  const operationListData: OperationListRowData = {
    items: filteredOperationLibrary,
    selectedOperationId: Number(formState?.sourceDraft.operationId ?? 0) || null,
    activeIndex: activeOperationIndex,
    stageOperationIds,
    onSelect: selectExistingOperation,
    onHover: setActiveOperationIndex,
  };

  const preview = useMemo<OperationCreatePreview>(() => {
    if (!formState) {
      return {
        stageName: '未选择阶段',
        nodeName: '未绑定资源节点',
        dayLabel: 'Day - / --:--',
        durationHours: 0,
        isUnplaced: true,
        hasRules: false,
      };
    }

    return {
      stageName: selectedStage?.stage_name ?? '未选择阶段',
      nodeName: selectedNode?.nodeName ?? '未绑定资源节点',
      dayLabel: `Day ${formState.timingDraft.operationDay} / ${formatHourLabel(formState.timingDraft.recommendedTime)}`,
      durationHours: Number(formState.timingDraft.durationHours ?? 0),
      isUnplaced: !selectedNode,
      hasRules: formState.rulesDraft.requirements.length > 0,
    };
  }, [formState, selectedNode, selectedStage]);

  const validationIssues = useMemo<OperationCreateValidationIssue[]>(() => {
    if (!formState) {
      return [];
    }

    const issues: OperationCreateValidationIssue[] = [];

    if (!formState.placementDraft.stageId) {
      issues.push({ key: 'stage', level: 'error', section: 'placement', message: '必须选择所属阶段' });
    }

    if (formState.sourceDraft.mode === 'existing') {
      if (!formState.sourceDraft.operationId) {
        issues.push({ key: 'operation', level: 'error', section: 'source', message: '请选择现有工序' });
      } else if (!operationById.has(Number(formState.sourceDraft.operationId))) {
        issues.push({ key: 'operation-invalid', level: 'error', section: 'source', message: '工艺已失效，请重新选择' });
      }
    } else {
      if (!formState.sourceDraft.newOperationName.trim()) {
        issues.push({ key: 'new-name', level: 'error', section: 'source', message: '请输入工序名称' });
      }
      if (Number(formState.sourceDraft.standardTime ?? 0) <= 0) {
        issues.push({ key: 'new-duration', level: 'error', section: 'source', message: '标准时长必须大于 0' });
      }
    }

    const stageStartDay = Number(selectedStage?.start_day ?? 0);
    const absoluteWindowStart =
      (stageStartDay + Number(formState.timingDraft.operationDay ?? 0) + Number(formState.timingDraft.windowStartDayOffset ?? 0)) * 24 +
      Number(formState.timingDraft.windowStartTime ?? 0);
    const absoluteWindowEnd =
      (stageStartDay + Number(formState.timingDraft.operationDay ?? 0) + Number(formState.timingDraft.windowEndDayOffset ?? 0)) * 24 +
      Number(formState.timingDraft.windowEndTime ?? 0);
    if (absoluteWindowStart > absoluteWindowEnd) {
      issues.push({ key: 'window-range', level: 'error', section: 'timing', message: '最早开始不能晚于最晚开始' });
    }

    if (!selectedNode) {
      issues.push({ key: 'unplaced', level: 'warning', section: 'placement', message: '当前工序将以未落位状态创建' });
    }

    formState.constraintsDraft.items.forEach((item) => {
      if (!item.relatedScheduleId) {
        issues.push({
          key: `constraint-${item.tempId}`,
          level: 'error',
          section: 'constraints',
          message: '约束必须选择关联工序',
        });
      }
    });

    if (selectedNode && formState.rulesDraft.requirements.length) {
      const invalidRequirement = formState.rulesDraft.requirements.find((item) => {
        const boundType = selectedNode.boundResourceType;
        return boundType && RESOURCE_TYPE_OPTIONS.includes(boundType as ResourceRequirementRule['resource_type'])
          ? item.resource_type !== boundType
          : false;
      });
      if (invalidRequirement) {
        issues.push({
          key: 'rule-node-mismatch',
          level: 'warning',
          section: 'rules',
          message: `当前节点绑定资源类型与规则 ${invalidRequirement.resource_type} 不一致`,
        });
      }
    }

    return [...issues, ...apiIssues];
  }, [apiIssues, formState, operationById, selectedNode, selectedStage]);

  const canSave = useMemo(
    () => validationIssues.every((item) => item.level !== 'error') && Boolean(formState),
    [formState, validationIssues],
  );

  const dirty = useMemo(
    () => sanitizeFormState(formState) !== initialStateSignature,
    [formState, initialStateSignature],
  );

  const existingOperationOptions = useMemo(
    () =>
      operations.map((item) => ({
        value: item.id,
        label: `${item.stage_name} / ${item.operation_name}`,
      })),
    [operations],
  );

  const recentNodes = useMemo(
    () =>
      [selectedNode, ...(lastConfig?.placementDraft.resourceNodeId ? [nodeMap.get(lastConfig.placementDraft.resourceNodeId) ?? null] : [])]
        .filter((item): item is ResourceNode => Boolean(item))
        .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
        .slice(0, 3),
    [lastConfig?.placementDraft.resourceNodeId, nodeMap, selectedNode],
  );

  const applySavedConfig = () => {
    if (!formState || !lastConfig) {
      return;
    }
    setFormState({
      ...formState,
      placementDraft: {
        stageId:
          stages.find((item) => Number(item.id) === Number(lastConfig.placementDraft.stageId))?.id ??
          formState.placementDraft.stageId,
        resourceNodeId:
          leafNodes.find((item) => Number(item.id) === Number(lastConfig.placementDraft.resourceNodeId))?.id ??
          formState.placementDraft.resourceNodeId,
      },
      timingDraft: {
        ...formState.timingDraft,
        ...lastConfig.timingDraft,
      },
      rulesDraft: lastConfig.rulesDraft,
      shareGroupDraft: {
        ...formState.shareGroupDraft,
        assignGroupId: lastConfig.shareGroupDraft.assignGroupId,
        createNew: lastConfig.shareGroupDraft.createNew,
      },
      sourceDraft: {
        ...formState.sourceDraft,
        mode: lastConfig.sourceDraft.mode,
        operationTypeId: lastConfig.sourceDraft.operationTypeId,
      },
    });
    message.success('已带入上一次创建配置');
  };

  const applyStageLastOperationTemplate = () => {
    if (!formState || !selectedStage) {
      return;
    }
    const stageOperations = operations
      .filter((item) => Number(item.stage_id) === Number(selectedStage.id))
      .sort((left, right) => {
        const leftValue =
          (Number(left.stage_start_day ?? 0) + Number(left.operation_day ?? 0) + Number(left.recommended_day_offset ?? 0)) * 24 +
          Number(left.recommended_time ?? 0);
        const rightValue =
          (Number(right.stage_start_day ?? 0) + Number(right.operation_day ?? 0) + Number(right.recommended_day_offset ?? 0)) * 24 +
          Number(right.recommended_time ?? 0);
        return rightValue - leftValue;
      });
    const latest = stageOperations[0];
    if (!latest) {
      message.warning('当前阶段还没有可复用的工序');
      return;
    }
    setFormState({
      ...formState,
      placementDraft: {
        ...formState.placementDraft,
        resourceNodeId: latest.defaultResourceNodeId ?? formState.placementDraft.resourceNodeId,
      },
      timingDraft: {
        ...formState.timingDraft,
        operationDay: Number(latest.operation_day ?? formState.timingDraft.operationDay),
        recommendedTime: Number(latest.recommended_time ?? formState.timingDraft.recommendedTime),
        recommendedDayOffset: Number(latest.recommended_day_offset ?? formState.timingDraft.recommendedDayOffset),
        durationHours: Number(latest.standard_time ?? formState.timingDraft.durationHours),
        windowMode: 'manual',
        windowStartTime: Number(latest.window_start_time ?? formState.timingDraft.windowStartTime),
        windowStartDayOffset: Number(latest.window_start_day_offset ?? formState.timingDraft.windowStartDayOffset),
        windowEndTime: Number(latest.window_end_time ?? formState.timingDraft.windowEndTime),
        windowEndDayOffset: Number(latest.window_end_day_offset ?? formState.timingDraft.windowEndDayOffset),
      },
      rulesDraft: {
        requirements: latest.resource_requirements?.length ? latest.resource_requirements : formState.rulesDraft.requirements,
      },
    });
    message.success('已沿用同阶段上一个工序的时间与规则');
  };

  const updateRequirement = (index: number, patch: Partial<ResourceRequirementRule>) => {
    setFormState((current) => {
      if (!current) {
        return current;
      }
      const nextRequirements = current.rulesDraft.requirements.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }
        const next = { ...item, ...patch };
        if (patch.resource_type && patch.resource_type !== item.resource_type) {
          next.candidate_resource_ids = [];
          next.candidate_resources = [];
        }
        return next;
      });
      return {
        ...current,
        rulesDraft: {
          requirements: nextRequirements,
        },
      };
    });
  };

  const closeWithConfirm = () => {
    if (!dirty) {
      onCancel();
      return;
    }
    Modal.confirm({
      title: '新增工序草稿尚未保存',
      content: '关闭后会丢失当前创建内容，是否继续？',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: onCancel,
    });
  };

  const persistLastConfig = (state: OperationCreateFormState, operationId: number) => {
    const nextRecentOperationIds = [
      operationId,
      ...recentOperationIdsState.filter((item) => Number(item) !== Number(operationId)),
    ].slice(0, 8);
    setRecentOperationIdsState(nextRecentOperationIds);

    const nextValue: SavedCreateConfig = {
      placementDraft: state.placementDraft,
      timingDraft: {
        operationDay: state.timingDraft.operationDay,
        recommendedTime: state.timingDraft.recommendedTime,
        recommendedDayOffset: state.timingDraft.recommendedDayOffset,
        durationHours: state.timingDraft.durationHours,
        windowMode: state.timingDraft.windowMode,
        windowStartTime: state.timingDraft.windowStartTime,
        windowStartDayOffset: state.timingDraft.windowStartDayOffset,
        windowEndTime: state.timingDraft.windowEndTime,
        windowEndDayOffset: state.timingDraft.windowEndDayOffset,
      },
      rulesDraft: state.rulesDraft,
      shareGroupDraft: {
        assignGroupId: state.shareGroupDraft.assignGroupId,
        createNew: state.shareGroupDraft.createNew,
      },
      sourceDraft: {
        mode: state.sourceDraft.mode,
        operationTypeId: state.sourceDraft.operationTypeId,
      },
      recentOperationIds: nextRecentOperationIds,
    };

    try {
      window.localStorage.setItem(getStorageKey(templateId), JSON.stringify(nextValue));
    } catch (error) {
      console.error('Failed to persist create-operation cache:', error);
    }
  };

  const handleCreate = async (keepOpen: boolean) => {
    if (!formState || !selectedStage) {
      return;
    }
    if (!canSave) {
      message.error('请先修正弹窗中的必填项');
      return;
    }
    if (formState.sourceDraft.mode === 'existing') {
      const selectedOperationId = Number(formState.sourceDraft.operationId ?? 0);
      if (!selectedOperationId || !operationById.has(selectedOperationId)) {
        message.error('工艺已失效，请重新选择');
        return;
      }
    }

    let resolvedOperationId = Number(formState.sourceDraft.operationId ?? 0);
    let createdScheduleId: number | null = null;
    let completedStep = '准备创建';

    try {
      setSaving(true);
      setApiIssues([]);

      if (formState.sourceDraft.mode === 'new') {
        completedStep = '创建工序主数据';
        setSavingStep(completedStep);
        const createdOperation = await processTemplateV2Api.createOperationLibraryItem({
          operationName: formState.sourceDraft.newOperationName.trim(),
          standardTime: Number(formState.sourceDraft.standardTime ?? 1),
          requiredPeople: Number(formState.sourceDraft.requiredPeople ?? 1),
          operationTypeId: formState.sourceDraft.operationTypeId,
          description: formState.sourceDraft.description.trim() || undefined,
        });
        resolvedOperationId = Number(createdOperation.id);
      }

      if (!resolvedOperationId) {
        throw new Error('请选择工序');
      }

      completedStep = '创建模板工序安排';
      setSavingStep(completedStep);
      createdScheduleId = await processTemplateV2Api.createStageOperationFromCanvas(templateId, {
        stageId: Number(formState.placementDraft.stageId),
        operationId: resolvedOperationId,
        resourceNodeId: formState.placementDraft.resourceNodeId ?? null,
        operationDay: Number(formState.timingDraft.operationDay ?? 0),
        recommendedTime: Number(formState.timingDraft.recommendedTime ?? 0),
        recommendedDayOffset: Number(formState.timingDraft.recommendedDayOffset ?? 0),
        windowStartTime: Number(formState.timingDraft.windowStartTime ?? 0),
        windowStartDayOffset: Number(formState.timingDraft.windowStartDayOffset ?? 0),
        windowEndTime: Number(formState.timingDraft.windowEndTime ?? 0),
        windowEndDayOffset: Number(formState.timingDraft.windowEndDayOffset ?? 0),
        absoluteStartHour: formState.timingDraft.absoluteStartHour,
      });

      if (capabilities.resourceRulesEnabled && formState.rulesDraft.requirements.length > 0) {
        completedStep = '保存资源规则';
        setSavingStep(completedStep);
        await processTemplateV2Api.updateTemplateStageOperationResources(createdScheduleId, formState.rulesDraft.requirements);
      }

      for (const constraint of formState.constraintsDraft.items) {
        completedStep = '保存约束';
        setSavingStep(completedStep);
        await processTemplateV2Api.createConstraint({
          from_schedule_id:
            constraint.relationType === 'predecessor' ? createdScheduleId : Number(constraint.relatedScheduleId),
          to_schedule_id:
            constraint.relationType === 'predecessor' ? Number(constraint.relatedScheduleId) : createdScheduleId,
          constraint_type: constraint.constraintType,
          constraint_level: constraint.constraintLevel ?? 1,
          lag_time: Number(constraint.lagTime ?? 0),
          lag_type: constraint.lagType ?? 'FIXED',
          lag_min: Number(constraint.lagMin ?? 0),
          lag_max: constraint.lagMax ?? null,
          share_mode: 'NONE',
          constraint_name: constraint.constraintName?.trim() || null,
          description: constraint.description?.trim() || null,
        });
      }

      if (capabilities.shareGroupEnabled && formState.shareGroupDraft.assignGroupId) {
        completedStep = '加入共享组';
        setSavingStep(completedStep);
        await processTemplateV2Api.assignOperationToShareGroup(createdScheduleId, formState.shareGroupDraft.assignGroupId);
      }

      if (
        capabilities.shareGroupEnabled &&
        formState.shareGroupDraft.createNew &&
        formState.shareGroupDraft.newGroupName.trim() &&
        formState.shareGroupDraft.memberIds.length > 0
      ) {
        completedStep = '创建共享组';
        setSavingStep(completedStep);
        await processTemplateV2Api.createTemplateShareGroup(templateId, {
          groupName: formState.shareGroupDraft.newGroupName.trim(),
          shareMode: formState.shareGroupDraft.newGroupMode,
          memberIds: [createdScheduleId, ...formState.shareGroupDraft.memberIds],
        });
      }

      persistLastConfig(formState, resolvedOperationId);
      await onCreated(createdScheduleId, Number(formState.placementDraft.stageId));
      message.success('工序已创建');

      if (!keepOpen) {
        onCancel();
        return;
      }

      const nextCode = formState.sourceDraft.mode === 'new' ? await processTemplateV2Api.getNextOperationCode() : formState.sourceDraft.nextOperationCode;
      const nextAbsoluteStart =
        getAbsoluteStartHour(selectedStage, formState.timingDraft) + Math.max(Number(formState.timingDraft.durationHours ?? 1), 1);
      const nextTiming = buildTimingFromAbsoluteStart(selectedStage, nextAbsoluteStart, Number(formState.timingDraft.durationHours ?? 1));

      const nextState: OperationCreateFormState = {
        ...formState,
        sourceDraft:
          formState.sourceDraft.mode === 'new'
            ? {
                ...formState.sourceDraft,
                newOperationName: '',
                nextOperationCode: nextCode,
                description: '',
              }
            : {
                ...formState.sourceDraft,
                searchValue: '',
              },
        timingDraft: {
          ...formState.timingDraft,
          ...nextTiming,
          windowMode: formState.timingDraft.windowMode,
          absoluteStartHour: nextAbsoluteStart,
        },
        constraintsDraft: {
          items: [],
        },
        shareGroupDraft: {
          ...formState.shareGroupDraft,
          createNew: false,
          newGroupName: '',
          memberIds: [],
        },
      };
      setFormState(nextState);
      setInitialStateSignature(sanitizeFormState(nextState));
      setNewConstraintDraft(createConstraintDraft());
      message.success('已保留上下文，可继续创建下一道工序');
    } catch (error: any) {
      console.error('Failed to create operation:', error);
      const errorMessage = error?.response?.data?.error || error?.message || '创建工序失败';
      const detail =
        createdScheduleId && completedStep !== '创建模板工序安排'
          ? `工序已创建，但${completedStep}失败：${errorMessage}`
          : completedStep === '创建工序主数据'
            ? `工序主数据创建失败：${errorMessage}`
            : errorMessage;
      setApiIssues([{ key: `save-${Date.now()}`, level: 'error', section: 'source', message: detail }]);
      message.error(detail);
    } finally {
      setSaving(false);
      setSavingStep('');
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      width={1180}
      centered
      maskClosable={false}
      onCancel={closeWithConfirm}
      title={
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">新增工序</div>
            <div className="mt-1 text-xs text-slate-500">
              {templateName} / {selectedStage?.stage_name ?? '未选择阶段'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Tag color="blue">当前阶段 {selectedStage?.stage_name ?? '待选'}</Tag>
              <Tag color={selectedNode ? 'green' : 'orange'}>当前资源节点 {selectedNode?.nodeName ?? '未落位'}</Tag>
              <Tag>推荐开始 {preview.dayLabel}</Tag>
              <Tag>{formState?.sourceDraft.mode === 'new' ? '来源模式：新建工序' : '来源模式：现有工序'}</Tag>
            </div>
          </div>
          <Space>
            <Tooltip title="恢复当前上下文默认值">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  if (!formState) {
                    return;
                  }
                  const nextState = buildInitialFormState({
                    stages,
                    operations,
                    operationLibrary,
                    leafNodes,
                    context,
                    lastConfig,
                    nextOperationCode: formState.sourceDraft.nextOperationCode,
                  });
                  setFormState(nextState);
                  setInitialStateSignature(sanitizeFormState(nextState));
                }}
              >
                恢复默认
              </Button>
            </Tooltip>
            <Button icon={<CopyOutlined />} disabled={!lastConfig} onClick={applySavedConfig}>
              复制上一个创建配置
            </Button>
          </Space>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            将创建到：{preview.stageName} / {preview.nodeName} / {preview.dayLabel}
            {savingStep ? <span className="ml-3 text-sky-600">处理中：{savingStep}</span> : null}
          </div>
          <Space>
            <Button onClick={closeWithConfirm}>取消</Button>
            <Button loading={saving} disabled={!canSave} onClick={() => void handleCreate(true)}>
              保存并继续创建
            </Button>
            <Button type="primary" loading={saving} disabled={!canSave} onClick={() => void handleCreate(false)}>
              创建工序
            </Button>
          </Space>
        </div>
      }
    >
      <div
        className="grid min-w-0 gap-4 overflow-x-hidden lg:grid-cols-[minmax(0,2.1fr)_360px]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeWithConfirm();
            return;
          }

          if (event.key !== 'Enter') {
            return;
          }

          const target = event.target as HTMLElement | null;
          if (isKeyboardEditableTarget(target) && !(event.metaKey || event.ctrlKey)) {
            return;
          }

          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            void handleCreate(true);
          }
        }}
      >
        <div className="min-w-0 space-y-4 overflow-y-auto pr-1" style={{ maxHeight: '68vh' }}>
          {loadingReference || !formState ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-16 text-center text-slate-500">
              正在准备新增工序工作台...
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">工序来源</div>
                    <div className="mt-1 text-xs text-slate-500">优先使用推荐卡片，减少搜索和重复输入。</div>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[260px]">
                    <Segmented
                      block
                      value={formState.sourceDraft.mode}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                sourceDraft: {
                                  ...current.sourceDraft,
                                  mode: value as OperationCreateFormState['sourceDraft']['mode'],
                                },
                              }
                            : current,
                        )
                      }
                      options={[
                        { label: '选现有工序', value: 'existing' },
                        { label: '新建工序主数据', value: 'new' },
                      ]}
                    />
                  </div>
                </div>

                {formState.sourceDraft.mode === 'existing' ? (
                  <div className="space-y-4">
                    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(340px,auto)]">
                      <Input
                        autoFocus
                        data-testid="operation-search-input"
                        placeholder="按工序编码或工序名称搜索"
                        value={formState.sourceDraft.searchValue}
                        suffix={<EnterOutlined className="text-slate-300" />}
                        onKeyDown={(event) => {
                          if (!filteredOperationLibrary.length) {
                            return;
                          }
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActiveOperationIndex((current) => Math.min(current + 1, filteredOperationLibrary.length - 1));
                            return;
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActiveOperationIndex((current) => Math.max(current - 1, 0));
                            return;
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            const candidate = filteredOperationLibrary[activeOperationIndex];
                            if (candidate) {
                              selectExistingOperation(candidate.id);
                            }
                          }
                        }}
                        onChange={(event) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    searchValue: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                      <div className="min-w-0">
                        <Segmented
                          block
                          value={formState.sourceDraft.filter}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    sourceDraft: {
                                      ...current.sourceDraft,
                                      filter: value as OperationCreateFormState['sourceDraft']['filter'],
                                    },
                                  }
                                : current,
                            )
                          }
                          options={[
                            { label: '最近使用', value: 'recent' },
                            { label: '当前阶段常用', value: 'stage' },
                            { label: '同部门域', value: 'department', disabled: !selectedNode },
                            { label: '全部', value: 'all' },
                          ]}
                        />
                      </div>
                    </div>

                    {!selectedNode && formState.sourceDraft.filter === 'department' ? (
                      <Alert
                        type="info"
                        showIcon
                        message="同部门域筛选依赖默认资源节点，请先在“阶段与落位”里选择资源节点。"
                      />
                    ) : null}

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">推荐工序</div>
                      {recommendedOperations.length ? (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {recommendedOperations.map((recommendation) => {
                            const item = operationById.get(Number(recommendation.operationId));
                            if (!item) {
                              return null;
                            }
                            const selected = Number(formState.sourceDraft.operationId) === Number(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => selectExistingOperation(item.id)}
                                className={`rounded-2xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                                  selected
                                    ? 'border-sky-500 bg-sky-50 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]'
                                    : 'border-slate-200 bg-slate-50 hover:border-sky-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="truncate text-sm font-semibold text-slate-900">{item.operation_name}</div>
                                  <div className="flex items-center gap-1">
                                    {recommendation.badge ? <Tag color="blue">{recommendation.badge}</Tag> : null}
                                    {selected ? <Tag color="cyan">已选</Tag> : null}
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{item.operation_code}</div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <Tag>时长 {item.standard_time}h</Tag>
                                  <Tag>人数 {item.required_people}</Tag>
                                </div>
                                <div className="mt-2 text-xs text-slate-500">{recommendation.reason}</div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前上下文下没有推荐工序" />
                      )}
                    </div>

                    <div>
                      <div className="mb-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">当前已选工艺</div>
                        {selectedExistingOperation ? (
                          <div className="mt-2 space-y-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{selectedExistingOperation.operation_name}</div>
                                <div className="mt-1 text-xs text-slate-500">{selectedExistingOperation.operation_code}</div>
                              </div>
                              <Tag color="cyan">已选择</Tag>
                            </div>
                            {!selectedOperationVisibleInFilteredList ? (
                              <Alert
                                type="warning"
                                showIcon
                                message={`当前筛选“${operationFilterLabel}”隐藏了已选工艺`}
                                action={
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      setFormState((current) =>
                                        current
                                          ? {
                                              ...current,
                                              sourceDraft: {
                                                ...current.sourceDraft,
                                                filter: 'all',
                                              },
                                            }
                                          : current,
                                      )
                                    }
                                  >
                                    切到全部
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-slate-500">尚未选择工艺，请从推荐区或工序列表中选择。</div>
                        )}
                      </div>

                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">工序列表</div>
                        <div className="text-xs text-slate-500">
                          {operationFilterLabel} · {filteredOperationLibrary.length} 条
                        </div>
                      </div>
                      <div className="h-80 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {filteredOperationLibrary.length ? (
                          <AutoSizer>
                            {({ height, width }: { height: number; width: number }) => (
                              <FixedSizeList
                                ref={operationListRef}
                                height={height}
                                width={width}
                                itemCount={filteredOperationLibrary.length}
                                itemSize={OPERATION_ROW_HEIGHT}
                                itemData={operationListData}
                                overscanCount={6}
                              >
                                {OperationListRow}
                              </FixedSizeList>
                            )}
                          </AutoSizer>
                        ) : (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                              formState.sourceDraft.searchValue.trim()
                                ? `未找到匹配“${formState.sourceDraft.searchValue.trim()}”的工序`
                                : `筛选“${operationFilterLabel}”下暂无工序`
                            }
                          >
                            <Space wrap>
                              {formState.sourceDraft.searchValue.trim() ? (
                                <Button
                                  size="small"
                                  onClick={() =>
                                    setFormState((current) =>
                                      current
                                        ? {
                                            ...current,
                                            sourceDraft: {
                                              ...current.sourceDraft,
                                              searchValue: '',
                                            },
                                          }
                                        : current,
                                    )
                                  }
                                >
                                  清空搜索
                                </Button>
                              ) : null}
                              {formState.sourceDraft.filter !== 'all' ? (
                                <Button
                                  size="small"
                                  type="primary"
                                  ghost
                                  onClick={() =>
                                    setFormState((current) =>
                                      current
                                        ? {
                                            ...current,
                                            sourceDraft: {
                                              ...current.sourceDraft,
                                              filter: 'all',
                                            },
                                          }
                                        : current,
                                    )
                                  }
                                >
                                  查看全部工序
                                </Button>
                              ) : null}
                            </Space>
                          </Empty>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">工序名称</label>
                      <Input
                        value={formState.sourceDraft.newOperationName}
                        onChange={(event) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    newOperationName: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">操作编码预览</label>
                      <Input value={formState.sourceDraft.nextOperationCode} disabled />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">标准时长(h)</label>
                      <InputNumber
                        min={1}
                        value={formState.sourceDraft.standardTime}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    standardTime: Number(value ?? 1),
                                  },
                                  timingDraft: {
                                    ...current.timingDraft,
                                    durationHours: Number(value ?? 1),
                                  },
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">所需人数</label>
                      <InputNumber
                        min={1}
                        value={formState.sourceDraft.requiredPeople}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    requiredPeople: Number(value ?? 1),
                                  },
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">操作类型</label>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        value={formState.sourceDraft.operationTypeId ?? undefined}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    operationTypeId: value ?? null,
                                  },
                                }
                              : current,
                          )
                        }
                        options={operationTypes.map((item) => ({
                          value: item.id,
                          label: `${item.typeCode} / ${item.typeName}`,
                        }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-slate-700">描述</label>
                      <Input.TextArea
                        rows={3}
                        value={formState.sourceDraft.description}
                        onChange={(event) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  sourceDraft: {
                                    ...current.sourceDraft,
                                    description: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-900">阶段与落位</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {context?.source === 'canvas'
                      ? '从时间轴创建，节点和开始时间已自动带入。'
                      : context?.source === 'stage'
                        ? '从阶段列表创建，阶段已自动选中。'
                        : context?.source === 'unplaced'
                          ? '从未落位工序上下文创建。'
                          : '当前可自由指定阶段与默认资源节点。'}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">所属阶段</label>
                    <Select
                      value={formState.placementDraft.stageId ?? undefined}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                placementDraft: {
                                  ...current.placementDraft,
                                  stageId: value ?? null,
                                },
                              }
                            : current,
                        )
                      }
                      options={stages.map((stage) => ({
                        value: stage.id,
                        label: `${stage.stage_name} / Day ${stage.start_day}`,
                      }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">默认资源节点</label>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={formState.placementDraft.resourceNodeId ?? undefined}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                placementDraft: {
                                  ...current.placementDraft,
                                  resourceNodeId: value ?? null,
                                },
                              }
                            : current,
                        )
                      }
                      options={leafNodes.map((node) => ({
                        value: node.id,
                        label: `${node.nodeName} / ${node.boundResourceCode ?? '未挂资源'}`,
                      }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentNodes.map((node) => (
                    <Button
                      key={node.id}
                      size="small"
                      onClick={() =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                placementDraft: {
                                  ...current.placementDraft,
                                  resourceNodeId: node.id,
                                },
                              }
                            : current,
                        )
                      }
                    >
                      {node.nodeName}
                    </Button>
                  ))}
                  {formState.placementDraft.resourceNodeId ? (
                    <Button
                      size="small"
                      danger
                      onClick={() =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                placementDraft: {
                                  ...current.placementDraft,
                                  resourceNodeId: null,
                                },
                              }
                            : current,
                        )
                      }
                    >
                      清空绑定
                    </Button>
                  ) : null}
                </div>
                {!leafNodes.length ? (
                  <Alert className="mt-3" type="warning" showIcon message="当前模板还没有资源节点，工序会以未落位状态创建。" />
                ) : null}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">时间设置</div>
                    <div className="mt-1 text-xs text-slate-500">默认使用业务时间模式，偏移字段仅在高级设置中展开。</div>
                  </div>
                  <Segmented
                    value={formState.timingDraft.windowMode}
                    onChange={(value) =>
                      setFormState((current) =>
                        current
                          ? {
                              ...current,
                              timingDraft: {
                                ...current.timingDraft,
                                windowMode: value as OperationCreateWindowMode,
                              },
                            }
                          : current,
                      )
                    }
                    options={[
                      { label: '自动时间窗', value: 'auto' },
                      { label: '手动时间窗', value: 'manual' },
                    ]}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">推荐开始 Day</label>
                    <InputNumber
                      min={0}
                      value={formState.timingDraft.operationDay}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                timingDraft: {
                                  ...current.timingDraft,
                                  operationDay: Number(value ?? 0),
                                },
                              }
                            : current,
                        )
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">推荐开始时间</label>
                    <InputNumber
                      min={0}
                      max={23.5}
                      step={0.5}
                      value={formState.timingDraft.recommendedTime}
                      formatter={(value) => formatHourLabel(Number(value ?? 0))}
                      parser={(value) => Number(value?.replace(':', '.') ?? 0)}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                timingDraft: {
                                  ...current.timingDraft,
                                  recommendedTime: Number(value ?? 0),
                                },
                              }
                            : current,
                        )
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      时长(h)
                      {formState.sourceDraft.mode === 'existing' ? <Tag className="ml-2">来自工序主数据</Tag> : null}
                    </label>
                    <InputNumber
                      min={1}
                      value={formState.timingDraft.durationHours}
                      disabled={formState.sourceDraft.mode === 'existing'}
                      onChange={(value) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                timingDraft: {
                                  ...current.timingDraft,
                                  durationHours: Number(value ?? 1),
                                },
                                sourceDraft:
                                  current.sourceDraft.mode === 'new'
                                    ? {
                                        ...current.sourceDraft,
                                        standardTime: Number(value ?? 1),
                                      }
                                    : current.sourceDraft,
                              }
                            : current,
                        )
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {formState.timingDraft.windowMode === 'manual' ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-800">最早开始</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <InputNumber
                          min={0}
                          max={23.5}
                          step={0.5}
                          value={formState.timingDraft.windowStartTime}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    timingDraft: {
                                      ...current.timingDraft,
                                      windowStartTime: Number(value ?? 0),
                                    },
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%' }}
                        />
                        <InputNumber
                          min={-7}
                          max={7}
                          value={formState.timingDraft.windowStartDayOffset}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    timingDraft: {
                                      ...current.timingDraft,
                                      windowStartDayOffset: Number(value ?? 0),
                                    },
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-800">最晚开始</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <InputNumber
                          min={0}
                          max={23.5}
                          step={0.5}
                          value={formState.timingDraft.windowEndTime}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    timingDraft: {
                                      ...current.timingDraft,
                                      windowEndTime: Number(value ?? 0),
                                    },
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%' }}
                        />
                        <InputNumber
                          min={-7}
                          max={7}
                          value={formState.timingDraft.windowEndDayOffset}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    timingDraft: {
                                      ...current.timingDraft,
                                      windowEndDayOffset: Number(value ?? 0),
                                    },
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    自动时间窗：最早开始 {formatHourLabel(formState.timingDraft.windowStartTime)} / 偏移 {formState.timingDraft.windowStartDayOffset}
                    ，最晚开始 {formatHourLabel(formState.timingDraft.windowEndTime)} / 偏移 {formState.timingDraft.windowEndDayOffset}
                  </div>
                )}

                <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">高级时间设置</summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">推荐偏移</label>
                      <InputNumber
                        min={-7}
                        max={7}
                        value={formState.timingDraft.recommendedDayOffset}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  timingDraft: {
                                    ...current.timingDraft,
                                    recommendedDayOffset: Number(value ?? 0),
                                  },
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">开始窗口偏移</label>
                      <InputNumber
                        min={-7}
                        max={7}
                        value={formState.timingDraft.windowStartDayOffset}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  timingDraft: {
                                    ...current.timingDraft,
                                    windowStartDayOffset: Number(value ?? 0),
                                  },
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">结束窗口偏移</label>
                      <InputNumber
                        min={-7}
                        max={7}
                        value={formState.timingDraft.windowEndDayOffset}
                        onChange={(value) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  timingDraft: {
                                    ...current.timingDraft,
                                    windowEndDayOffset: Number(value ?? 0),
                                  },
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </details>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">资源规则</div>
                    <div className="mt-1 text-xs text-slate-500">支持直接在创建弹窗里完成轻量规则配置。</div>
                  </div>
                  {capabilities.resourceRulesEnabled ? (
                    <Space>
                      <Button
                        size="small"
                        onClick={() =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  rulesDraft: {
                                    requirements: [...current.rulesDraft.requirements, createRequirementFromNode(selectedNode)],
                                  },
                                }
                              : current,
                          )
                        }
                      >
                        添加需求
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  rulesDraft: {
                                    requirements: [createRequirementFromNode(selectedNode)],
                                  },
                                }
                              : current,
                          )
                        }
                      >
                        按当前节点自动生成
                      </Button>
                    </Space>
                  ) : null}
                </div>

                {!capabilities.resourceRulesEnabled ? (
                  <Alert type="info" showIcon message="模板资源规则功能当前未启用" />
                ) : formState.rulesDraft.requirements.length ? (
                  <div className="space-y-3">
                    {matchingHistoricalOperation?.resource_requirements?.length ? (
                      <Alert
                        type="info"
                        showIcon
                        message={`已识别到同类工序历史规则 ${matchingHistoricalOperation.resource_requirements.length} 条，可直接沿用`}
                        action={
                          <Button
                            size="small"
                            onClick={() =>
                              setFormState((current) =>
                                current
                                  ? {
                                      ...current,
                                      rulesDraft: {
                                        requirements: matchingHistoricalOperation.resource_requirements ?? [],
                                      },
                                    }
                                  : current,
                              )
                            }
                          >
                            复制历史规则
                          </Button>
                        }
                      />
                    ) : null}
                    {formState.rulesDraft.requirements.map((rule, index) => (
                      <div key={`rule-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-800">需求 {index + 1}</div>
                          <Space size={6}>
                            <Button
                              size="small"
                              onClick={() =>
                                setFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        rulesDraft: {
                                          requirements: [...current.rulesDraft.requirements, { ...rule, id: null }],
                                        },
                                      }
                                    : current,
                                )
                              }
                            >
                              复制上一条
                            </Button>
                            <Button
                              size="small"
                              onClick={() => updateRequirement(index, { candidate_resource_ids: [], candidate_resources: [] })}
                            >
                              清空候选资源
                            </Button>
                            <Button
                              size="small"
                              danger
                              onClick={() =>
                                setFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        rulesDraft: {
                                          requirements: current.rulesDraft.requirements.filter((_, itemIndex) => itemIndex !== index),
                                        },
                                      }
                                    : current,
                                )
                              }
                            >
                              删除
                            </Button>
                          </Space>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <Select
                            value={rule.resource_type}
                            onChange={(value) => updateRequirement(index, { resource_type: value })}
                            options={RESOURCE_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))}
                          />
                          <InputNumber
                            min={1}
                            value={rule.required_count}
                            onChange={(value) => updateRequirement(index, { required_count: Number(value ?? 1) })}
                            style={{ width: '100%' }}
                          />
                          <Select
                            mode="multiple"
                            allowClear
                            optionFilterProp="label"
                            value={rule.candidate_resource_ids}
                            onChange={(value) =>
                              updateRequirement(index, {
                                candidate_resource_ids: value,
                                candidate_resources: resources
                                  .filter((resource) => value.includes(Number(resource.id)))
                                  .map((resource) => ({
                                    id: Number(resource.id),
                                    resource_code: resource.resourceCode,
                                    resource_name: resource.resourceName,
                                    resource_type: resource.resourceType,
                                  })),
                              })
                            }
                            options={resources
                              .filter((resource) => resource.resourceType === rule.resource_type)
                              .map((resource) => ({
                                value: Number(resource.id),
                                label: `${resource.resourceCode} / ${resource.resourceName}`,
                              }))}
                          />
                          <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rule.is_mandatory}
                                onChange={(event) => updateRequirement(index, { is_mandatory: event.target.checked })}
                              />
                              必须
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rule.requires_exclusive_use}
                                onChange={(event) =>
                                  updateRequirement(index, { requires_exclusive_use: event.target.checked })
                                }
                              />
                              独占
                            </label>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <InputNumber
                            min={0}
                            addonBefore="prep"
                            value={rule.prep_minutes}
                            onChange={(value) => updateRequirement(index, { prep_minutes: Number(value ?? 0) })}
                            style={{ width: '100%' }}
                          />
                          <InputNumber
                            min={0}
                            addonBefore="changeover"
                            value={rule.changeover_minutes}
                            onChange={(value) => updateRequirement(index, { changeover_minutes: Number(value ?? 0) })}
                            style={{ width: '100%' }}
                          />
                          <InputNumber
                            min={0}
                            addonBefore="cleanup"
                            value={rule.cleanup_minutes}
                            onChange={(value) => updateRequirement(index, { cleanup_minutes: Number(value ?? 0) })}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    当前还没有资源规则，保存后工序会按默认绑定节点落位。
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">约束与共享组</div>
                    <div className="mt-1 text-xs text-slate-500">一次建全时可直接补充核心逻辑，不必创建后再跳回编辑。</div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">轻量约束创建器</div>
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!newConstraintDraft.relatedScheduleId) {
                            message.warning('请先选择关联工序');
                            return;
                          }
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  constraintsDraft: {
                                    items: [...current.constraintsDraft.items, newConstraintDraft],
                                  },
                                }
                              : current,
                          );
                          setNewConstraintDraft(createConstraintDraft());
                        }}
                      >
                        添加约束
                      </Button>
                    </div>
                    {operations.length ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            value={newConstraintDraft.relationType}
                            onChange={(value) =>
                              setNewConstraintDraft((current) => ({
                                ...current,
                                relationType: value,
                              }))
                            }
                            options={[
                              { value: 'predecessor', label: '当前工序作为前置' },
                              { value: 'successor', label: '当前工序作为后续' },
                            ]}
                          />
                          <Select
                            showSearch
                            optionFilterProp="label"
                            value={newConstraintDraft.relatedScheduleId ?? undefined}
                            onChange={(value) =>
                              setNewConstraintDraft((current) => ({
                                ...current,
                                relatedScheduleId: value ?? null,
                              }))
                            }
                            options={existingOperationOptions}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            value={newConstraintDraft.constraintType}
                            onChange={(value) =>
                              setNewConstraintDraft((current) => ({
                                ...current,
                                constraintType: value,
                              }))
                            }
                            options={CONSTRAINT_TYPE_OPTIONS.map((item) => ({
                              value: item.value,
                              label: item.label,
                            }))}
                          />
                          <InputNumber
                            min={0}
                            addonBefore="lag(h)"
                            value={newConstraintDraft.lagTime}
                            onChange={(value) =>
                              setNewConstraintDraft((current) => ({
                                ...current,
                                lagTime: Number(value ?? 0),
                              }))
                            }
                            style={{ width: '100%' }}
                          />
                        </div>
                        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <summary className="cursor-pointer text-sm text-slate-600">高级约束字段</summary>
                          <div className="mt-3 grid gap-3">
                            <Select
                              value={newConstraintDraft.lagType}
                              onChange={(value) =>
                                setNewConstraintDraft((current) => ({
                                  ...current,
                                  lagType: value,
                                }))
                              }
                              options={LAG_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))}
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <InputNumber
                                min={0}
                                addonBefore="lag min"
                                value={newConstraintDraft.lagMin}
                                onChange={(value) =>
                                  setNewConstraintDraft((current) => ({
                                    ...current,
                                    lagMin: Number(value ?? 0),
                                  }))
                                }
                                style={{ width: '100%' }}
                              />
                              <InputNumber
                                min={0}
                                addonBefore="lag max"
                                value={newConstraintDraft.lagMax ?? undefined}
                                onChange={(value) =>
                                  setNewConstraintDraft((current) => ({
                                    ...current,
                                    lagMax: value === null || value === undefined ? null : Number(value),
                                  }))
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                            <Input
                              placeholder="约束名称"
                              value={newConstraintDraft.constraintName}
                              onChange={(event) =>
                                setNewConstraintDraft((current) => ({
                                  ...current,
                                  constraintName: event.target.value,
                                }))
                              }
                            />
                            <Input.TextArea
                              rows={2}
                              placeholder="说明"
                              value={newConstraintDraft.description}
                              onChange={(event) =>
                                setNewConstraintDraft((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </details>

                        {formState.constraintsDraft.items.length ? (
                          <div className="space-y-2">
                            {formState.constraintsDraft.items.map((item) => {
                              const relatedOperation = operations.find((candidate) => Number(candidate.id) === Number(item.relatedScheduleId));
                              return (
                                <div
                                  key={item.tempId}
                                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">
                                      {item.relationType === 'predecessor' ? '当前工序作为前置' : '当前工序作为后续'} /{' '}
                                      {relatedOperation?.operation_name ?? '未选择'}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {CONSTRAINT_TYPE_OPTIONS.find((option) => option.value === item.constraintType)?.label} / lag {item.lagTime}h
                                    </div>
                                  </div>
                                  <Button
                                    type="link"
                                    danger
                                    onClick={() =>
                                      setFormState((current) =>
                                        current
                                          ? {
                                              ...current,
                                              constraintsDraft: {
                                                items: current.constraintsDraft.items.filter((constraint) => constraint.tempId !== item.tempId),
                                              },
                                            }
                                          : current,
                                      )
                                    }
                                  >
                                    删除
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有待创建约束" />
                        )}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="模板里还没有其他工序，暂时无法添加约束" />
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-800">共享组</div>
                    {!capabilities.shareGroupEnabled ? (
                      <Alert type="info" showIcon message="共享组功能当前未启用" />
                    ) : (
                      <div className="space-y-3">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          value={formState.shareGroupDraft.assignGroupId ?? undefined}
                          onChange={(value) =>
                            setFormState((current) =>
                              current
                                ? {
                                    ...current,
                                    shareGroupDraft: {
                                      ...current.shareGroupDraft,
                                      assignGroupId: value ?? null,
                                    },
                                  }
                                : current,
                            )
                          }
                          options={shareGroups.map((group) => ({
                            value: group.id,
                            label: `${group.groupName} / ${group.shareMode} / 成员 ${group.memberCount}`,
                          }))}
                          placeholder="加入已有共享组"
                        />
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={formState.shareGroupDraft.createNew}
                            onChange={(event) =>
                              setFormState((current) =>
                                current
                                  ? {
                                      ...current,
                                      shareGroupDraft: {
                                        ...current.shareGroupDraft,
                                        createNew: event.target.checked,
                                      },
                                    }
                                  : current,
                              )
                            }
                          />
                          同时创建新共享组
                        </label>
                        {formState.shareGroupDraft.createNew ? (
                          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                            <Input
                              placeholder="共享组名称"
                              value={formState.shareGroupDraft.newGroupName}
                              onChange={(event) =>
                                setFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        shareGroupDraft: {
                                          ...current.shareGroupDraft,
                                          newGroupName: event.target.value,
                                        },
                                      }
                                    : current,
                                )
                              }
                            />
                            <Select
                              value={formState.shareGroupDraft.newGroupMode}
                              onChange={(value) =>
                                setFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        shareGroupDraft: {
                                          ...current.shareGroupDraft,
                                          newGroupMode: value,
                                        },
                                      }
                                    : current,
                                )
                              }
                              options={[
                                { value: 'SAME_TEAM', label: '同组执行' },
                                { value: 'DIFFERENT', label: '不同人员' },
                              ]}
                            />
                            <Select
                              mode="multiple"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              value={formState.shareGroupDraft.memberIds}
                              onChange={(value) =>
                                setFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        shareGroupDraft: {
                                          ...current.shareGroupDraft,
                                          memberIds: value,
                                        },
                                      }
                                    : current,
                                )
                              }
                              options={existingOperationOptions}
                              placeholder="选择共享组已有成员"
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4 overflow-y-auto pl-1" style={{ maxHeight: '68vh' }}>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">创建预览</div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <span>阶段</span>
                <span className="font-medium text-slate-900">{preview.stageName}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <span>资源节点</span>
                <span className="font-medium text-slate-900">{preview.nodeName}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <span>时间轴落点</span>
                <span className="font-medium text-slate-900">{preview.dayLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                <span>标准时长</span>
                <span className="font-medium text-slate-900">{preview.durationHours}h</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Tag color={preview.isUnplaced ? 'orange' : 'green'}>{preview.isUnplaced ? '未落位' : '已绑定节点'}</Tag>
                <Tag color={preview.hasRules ? 'blue' : 'default'}>{preview.hasRules ? '已配置规则' : '未配置规则'}</Tag>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">智能推荐</div>
            <div className="mt-3 space-y-3">
              {selectedNode ? (
                <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <NodeIndexOutlined />
                    推荐资源类型
                  </div>
                  <div className="mt-2">
                    {selectedNode.boundResourceType ?? inferRuleTypeFromNode(selectedNode)} / 节点 {selectedNode.nodeName}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <ClockCircleOutlined />
                  推荐开始时间
                </div>
                <div className="mt-2">{preview.dayLabel}</div>
              </div>
              <div className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <InfoCircleOutlined />
                  当前阶段常用工序
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {recommendedOperations.length ? (
                    recommendedOperations.map((item) => {
                      const operation = operationById.get(Number(item.operationId));
                      return operation ? <Tag key={item.operationId}>{operation.operation_name}</Tag> : null;
                    })
                  ) : (
                    <span className="text-slate-400">暂无推荐</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">实时校验</div>
            <div className="mt-3 space-y-2">
              {validationIssues.length ? (
                validationIssues.map((issue) => (
                  <Alert
                    key={issue.key}
                    type={issue.level === 'error' ? 'error' : 'warning'}
                    showIcon
                    message={issue.message}
                  />
                ))
              ) : (
                <Alert type="success" showIcon message="当前配置已可创建" />
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">快捷模板</div>
            <div className="mt-3 space-y-2">
              <Button block icon={<CopyOutlined />} disabled={!lastConfig} onClick={applySavedConfig}>
                复用上一条创建配置
              </Button>
              <Button block icon={<ReloadOutlined />} onClick={applyStageLastOperationTemplate}>
                沿用同阶段上一个工序的时间/资源规则
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
};

export default TemplateOperationCreateModal;
