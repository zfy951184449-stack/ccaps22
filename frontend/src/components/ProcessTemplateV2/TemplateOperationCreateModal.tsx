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
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  CopyOutlined,
  EnterOutlined,
  NodeIndexOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { processTemplateV2Api } from '../../services';
import { ResourceRequirementRule } from '../ProcessTemplateGantt/types';
import OperationCoreForm, { validateOperationCoreDraft } from './OperationCoreForm';
import {
  OperationCreateContext,
  OperationCreateFormState,
  OperationCreatedResult,
  OperationCreatePreview,
  OperationCreateValidationIssue,
  OperationLibraryItem,
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
  onCreated: (result: OperationCreatedResult) => Promise<void> | void;
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
  const [formState, setFormState] = useState<OperationCreateFormState | null>(null);
  const [initialStateSignature, setInitialStateSignature] = useState<string | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState('');
  const [operationTypes, setOperationTypes] = useState<OperationTypeOption[]>([]);
  const [apiIssues, setApiIssues] = useState<OperationCreateValidationIssue[]>([]);
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
        const [nextOperationCode, nextOperationTypes] = await Promise.all([
          processTemplateV2Api.getNextOperationCode(),
          processTemplateV2Api.listOperationTypes(templateTeamId),
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
        setFormState(nextState);
        setInitialStateSignature(sanitizeFormState(nextState));
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
      if (currentFilter === 'department' && selectedNode && !departmentOperationIds.has(Number(item.id))) {
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
    selectedNode,
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
      return '同部门工序';
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

    const coreValidation = validateOperationCoreDraft({
      draft: {
        stageId: formState.placementDraft.stageId,
        resourceNodeId: formState.placementDraft.resourceNodeId,
        operationDay: Number(formState.timingDraft.operationDay ?? 0),
        recommendedTime: Number(formState.timingDraft.recommendedTime ?? 0),
        recommendedDayOffset: Number(formState.timingDraft.recommendedDayOffset ?? 0),
        windowMode: formState.timingDraft.windowMode,
        windowStartTime: Number(formState.timingDraft.windowStartTime ?? 0),
        windowStartDayOffset: Number(formState.timingDraft.windowStartDayOffset ?? 0),
        windowEndTime: Number(formState.timingDraft.windowEndTime ?? 0),
        windowEndDayOffset: Number(formState.timingDraft.windowEndDayOffset ?? 0),
      },
      stageStartDay: Number(selectedStage?.start_day ?? 0),
      requireStage: true,
      warnUnbound: true,
    });

    coreValidation.errors.forEach((item, index) => {
      issues.push({
        key: `core-error-${index}`,
        level: 'error',
        section: 'timing',
        message: item,
      });
    });
    coreValidation.warnings.forEach((item, index) => {
      issues.push({
        key: `core-warning-${index}`,
        level: 'warning',
        section: 'placement',
        message: item === '当前工序未绑定默认资源节点' ? '当前工序将以未落位状态创建' : item,
      });
    });

    return [...issues, ...apiIssues];
  }, [apiIssues, formState, operationById, selectedStage]);

  const canSave = useMemo(
    () => validationIssues.every((item) => item.level !== 'error') && Boolean(formState),
    [formState, validationIssues],
  );

  const dirty = useMemo(
    () => sanitizeFormState(formState) !== initialStateSignature,
    [formState, initialStateSignature],
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
    message.success('已沿用同阶段上一个工序的时间与落位');
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

  const handleCreate = async (
    keepOpen: boolean,
    options?: { openAdvanced?: boolean; initialAdvancedTab?: OperationCreatedResult['initialAdvancedTab'] },
  ) => {
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

      persistLastConfig(formState, resolvedOperationId);
      await onCreated({
        scheduleId: createdScheduleId,
        stageId: Number(formState.placementDraft.stageId),
        openAdvanced: Boolean(options?.openAdvanced),
        initialAdvancedTab: options?.initialAdvancedTab,
      });
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
      width="min(1180px, calc(100vw - 24px))"
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
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            将创建到：{preview.stageName} / {preview.nodeName} / {preview.dayLabel}
            {savingStep ? <span className="ml-3 text-sky-600">处理中：{savingStep}</span> : null}
            <span className="ml-3 text-slate-400">快捷键：Ctrl/Cmd + Enter 保存并继续创建</span>
          </div>
          <Space>
            <Button onClick={closeWithConfirm}>取消</Button>
            <Button loading={saving} disabled={!canSave} onClick={() => void handleCreate(true)}>
              保存并继续创建
            </Button>
            <Button loading={saving} disabled={!canSave} onClick={() => void handleCreate(false)}>
              创建工序
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={!canSave}
              onClick={() => void handleCreate(false, { openAdvanced: true, initialAdvancedTab: 'rules' })}
            >
              创建并进入高级配置
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
                    <div className="mt-1 text-xs text-slate-500">支持从工序库选择现有工序，或新建工序主数据。</div>
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
                            { label: '同部门工序', value: 'department' },
                            { label: '全部', value: 'all' },
                          ]}
                        />
                      </div>
                    </div>

                    {!selectedNode && formState.sourceDraft.filter === 'department' ? (
                      <Alert
                        type="info"
                        showIcon
                        message="未选择资源节点，当前先展示全部工序；选择节点后会自动切换为同部门筛选。"
                      />
                    ) : null}

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
                          <div className="mt-2 text-xs text-slate-500">尚未选择工艺，请从工序列表中选择。</div>
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
                  <div className="text-sm font-semibold text-slate-900">阶段 / 资源 / 时间</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {context?.source === 'canvas'
                      ? '从时间轴创建，节点和开始时间已自动带入。'
                      : context?.source === 'stage'
                        ? '从阶段列表创建，阶段已自动选中。'
                        : context?.source === 'unplaced'
                          ? '从未落位工序上下文创建。'
                          : '当前可自由指定阶段、默认资源节点和时间窗。'}
                  </div>
                </div>

                <OperationCoreForm
                  value={{
                    stageId: formState.placementDraft.stageId,
                    resourceNodeId: formState.placementDraft.resourceNodeId,
                    operationDay: formState.timingDraft.operationDay,
                    recommendedTime: formState.timingDraft.recommendedTime,
                    recommendedDayOffset: formState.timingDraft.recommendedDayOffset,
                    windowMode: formState.timingDraft.windowMode,
                    windowStartTime: formState.timingDraft.windowStartTime,
                    windowStartDayOffset: formState.timingDraft.windowStartDayOffset,
                    windowEndTime: formState.timingDraft.windowEndTime,
                    windowEndDayOffset: formState.timingDraft.windowEndDayOffset,
                  }}
                  stages={stages}
                  leafNodes={leafNodes}
                  durationHours={formState.timingDraft.durationHours}
                  timingExtra={
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        时长(h)
                        {formState.sourceDraft.mode === 'existing' ? <Tag className="ml-2">来自工序主数据</Tag> : null}
                      </label>
                      <InputNumber
                        min={1}
                        value={formState.timingDraft.durationHours}
                        disabled={formState.sourceDraft.mode === 'existing'}
                        onChange={(next) =>
                          setFormState((current) =>
                            current
                              ? {
                                  ...current,
                                  timingDraft: {
                                    ...current.timingDraft,
                                    durationHours: Number(next ?? 1),
                                  },
                                  sourceDraft:
                                    current.sourceDraft.mode === 'new'
                                      ? {
                                          ...current.sourceDraft,
                                          standardTime: Number(next ?? 1),
                                        }
                                      : current.sourceDraft,
                                }
                              : current,
                          )
                        }
                        style={{ width: '100%' }}
                      />
                    </div>
                  }
                  onChange={(patch) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            placementDraft: {
                              ...current.placementDraft,
                              stageId: patch.stageId === undefined ? current.placementDraft.stageId : patch.stageId,
                              resourceNodeId:
                                patch.resourceNodeId === undefined ? current.placementDraft.resourceNodeId : patch.resourceNodeId,
                            },
                            timingDraft: {
                              ...current.timingDraft,
                              operationDay: patch.operationDay ?? current.timingDraft.operationDay,
                              recommendedTime: patch.recommendedTime ?? current.timingDraft.recommendedTime,
                              recommendedDayOffset: patch.recommendedDayOffset ?? current.timingDraft.recommendedDayOffset,
                              windowMode: patch.windowMode ?? current.timingDraft.windowMode,
                              windowStartTime: patch.windowStartTime ?? current.timingDraft.windowStartTime,
                              windowStartDayOffset: patch.windowStartDayOffset ?? current.timingDraft.windowStartDayOffset,
                              windowEndTime: patch.windowEndTime ?? current.timingDraft.windowEndTime,
                              windowEndDayOffset: patch.windowEndDayOffset ?? current.timingDraft.windowEndDayOffset,
                            },
                          }
                        : current,
                    )
                  }
                />

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
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">智能提示</div>
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
