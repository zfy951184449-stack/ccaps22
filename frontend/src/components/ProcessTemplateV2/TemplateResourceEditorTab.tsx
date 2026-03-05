import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Tabs,
  Tooltip,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import OperationConstraintsPanel from '../OperationConstraintsPanel';
import { TemplateResourceRulesTabContent } from '../ProcessTemplateGantt/components/modals/TemplateResourceRulesTabContent';
import { processTemplateV2Api } from '../../services';
import OperationCoreForm, { validateOperationCoreDraft } from './OperationCoreForm';
import {
  OperationAdvancedTabKey,
  OperationCreateContext,
  OperationCoreDraft,
  OperationCreatedResult,
  PlannerOperation,
  ResourceNode,
  ResourceNodeFilterScope,
  TemplateConstraintLink,
  TemplateResourceEditorResponse,
  TemplateShareGroupSummary,
  TemplateStageSummary,
} from './types';
import TemplateOperationCreateModal from './TemplateOperationCreateModal';

const LEFT_PANEL_WIDTH = 360;
const RESOURCE_TREE_WIDTH = 320;
const ROW_HEIGHT = 64;
const STAGE_COLORS = ['#0f766e', '#0369a1', '#7c3aed', '#ea580c', '#b91c1c', '#15803d'];

type TimelineRow = {
  node: ResourceNode;
  depth: number;
  isLeaf: boolean;
  expanded: boolean;
  isCollapsedAggregate: boolean;
};

type RenderBar = {
  key: string;
  operation: PlannerOperation;
  title: string;
  subtitle?: string;
  startHour: number;
  endHour: number;
  color: string;
  statusTone: 'default' | 'warning' | 'danger';
  hasShareGroup: boolean;
};

type StageDraft = {
  id?: number;
  stageName: string;
  stageOrder: number;
  startDay: number;
  description: string;
};

type OperationDraft = {
  scheduleId: number;
  stageId: number | null;
  resourceNodeId: number | null;
  durationHours: number;
  windowMode: OperationCoreDraft['windowMode'];
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset: number;
  windowStartTime: number;
  windowStartDayOffset: number;
  windowEndTime: number;
  windowEndDayOffset: number;
  absoluteStartHour?: number;
};

type PendingOperationCreatedAction = OperationCreatedResult & {
  token: number;
};

type LastMoveState = {
  scheduleId: number;
  previousNodeId: number | null;
  previousPayload: {
    operationDay: number;
    recommendedTime: number;
    recommendedDayOffset?: number;
    windowStartTime?: number;
    windowStartDayOffset?: number;
    windowEndTime?: number;
    windowEndDayOffset?: number;
  };
};

type PersistedEditorState = {
  scope?: ResourceNodeFilterScope;
  searchValue?: string;
  showUnplacedOnly?: boolean;
  showIssuesOnly?: boolean;
  showAllConstraints?: boolean;
  hourWidth?: number;
  expandedKeys?: number[];
  selectedStageId?: number | null;
  selectedOperationId?: number | null;
};

interface TemplateResourceEditorTabProps {
  templateId: number;
  templateTeamId: number | null;
  active?: boolean;
  refreshKey?: number;
  onOpenNodes?: () => void;
  focusRequest?: {
    focus: 'all' | 'unbound' | 'conflict' | 'invalid';
    scheduleId?: number | null;
    token: number;
  } | null;
  validateRequestToken?: number;
  onFocusHandled?: () => void;
  onEditorMetricsChange?: (metrics: {
    nodeCount: number;
    operationCount: number;
    unplacedCount: number;
    invalidCount: number;
    conflictCount: number;
  }) => void;
  onOperationSelectionChange?: (operation: PlannerOperation | null) => void;
}

const normalizeText = (value: string) => value.trim().toLowerCase();

const buildEditorStorageKey = (templateId: number) => `process-template-v2-resource-editor:${templateId}`;

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

const buildParentMap = (nodes: ResourceNode[]) => {
  const map = new Map<number, number | null>();
  const walk = (items: ResourceNode[]) => {
    items.forEach((item) => {
      map.set(item.id, item.parentId);
      walk(item.children ?? []);
    });
  };
  walk(nodes);
  return map;
};

const collectAncestorIds = (id: number, parentMap: Map<number, number | null>) => {
  const result = new Set<number>([id]);
  let current = parentMap.get(id) ?? null;
  while (current) {
    result.add(current);
    current = parentMap.get(current) ?? null;
  }
  return result;
};

const collectDescendantIds = (node: ResourceNode): Set<number> => {
  const result = new Set<number>([node.id]);
  const walk = (current: ResourceNode) => {
    current.children.forEach((child) => {
      result.add(child.id);
      walk(child);
    });
  };
  walk(node);
  return result;
};

const pruneTree = (nodes: ResourceNode[], includeIds: Set<number>, query: string): ResourceNode[] => {
  const normalizedQuery = normalizeText(query);
  return nodes
    .map((node) => {
      const nextChildren = pruneTree(node.children ?? [], includeIds, query);
      const matchedQuery =
        !normalizedQuery ||
        normalizeText(node.nodeName).includes(normalizedQuery) ||
        normalizeText(node.nodeCode).includes(normalizedQuery) ||
        normalizeText(node.boundResourceCode ?? '').includes(normalizedQuery) ||
        normalizeText(node.boundResourceName ?? '').includes(normalizedQuery);

      if (!includeIds.has(node.id) || (!matchedQuery && nextChildren.length === 0 && normalizedQuery)) {
        return null;
      }

      return {
        ...node,
        children: nextChildren,
      };
    })
    .filter((item): item is ResourceNode => Boolean(item));
};

const flattenVisibleRows = (nodes: ResourceNode[], expandedKeys: Set<number>, depth = 0): TimelineRow[] => {
  const rows: TimelineRow[] = [];
  nodes.forEach((node) => {
    const isLeaf = node.children.length === 0;
    const expanded = expandedKeys.has(node.id);
    rows.push({
      node,
      depth,
      isLeaf,
      expanded,
      isCollapsedAggregate: !isLeaf && !expanded,
    });
    if (!isLeaf && expanded) {
      rows.push(...flattenVisibleRows(node.children, expandedKeys, depth + 1));
    }
  });
  return rows;
};

const getStageColor = (stageOrder: number) => STAGE_COLORS[(Math.max(stageOrder, 1) - 1) % STAGE_COLORS.length];

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

const getAbsoluteStartHour = (operation: PlannerOperation) =>
  (Number(operation.stage_start_day ?? 0) +
    Number(operation.operation_day ?? 0) +
    Number(operation.recommended_day_offset ?? 0)) *
    24 +
  Number(operation.recommended_time ?? 0);

const getAbsoluteEndHour = (operation: PlannerOperation) =>
  getAbsoluteStartHour(operation) + Math.max(Number(operation.standard_time ?? 2), 1);

const buildSchedulePayloadFromAbsoluteHour = (
  stageStartDay: number,
  absoluteStartHour: number,
  durationHours: number,
) => {
  const absoluteDay = Math.floor(absoluteStartHour / 24);
  const operationDay = Math.max(0, absoluteDay - stageStartDay);
  const recommendedDayOffset = absoluteDay - stageStartDay - operationDay;
  const recommendedTime = toHourValue(absoluteStartHour);

  const windowStartAbsolute = absoluteStartHour - 2;
  const windowEndAbsolute = absoluteStartHour + Math.max(durationHours, 2);

  return {
    operationDay,
    recommendedTime,
    recommendedDayOffset,
    windowStartTime: toHourValue(windowStartAbsolute),
    windowStartDayOffset: Math.floor(windowStartAbsolute / 24) - stageStartDay - operationDay,
    windowEndTime: toHourValue(windowEndAbsolute),
    windowEndDayOffset: Math.floor(windowEndAbsolute / 24) - stageStartDay - operationDay,
  };
};

const createDefaultStageDraft = (stages: TemplateStageSummary[]): StageDraft => {
  const maxOrder = stages.reduce((max, stage) => Math.max(max, stage.stage_order), 0);
  const maxStartDay = stages.reduce((max, stage) => Math.max(max, stage.start_day), 0);
  return {
    stageName: '',
    stageOrder: maxOrder + 1,
    startDay: maxStartDay + 1,
    description: '',
  };
};

const sanitizeStageDraft = (draft: StageDraft | null) =>
  draft
    ? {
        id: draft.id ?? null,
        stageName: draft.stageName.trim(),
        stageOrder: Number(draft.stageOrder ?? 0),
        startDay: Number(draft.startDay ?? 0),
        description: draft.description.trim(),
      }
    : null;

const sanitizeOperationDraft = (draft: OperationDraft | null) =>
  draft
    ? {
        scheduleId: Number(draft.scheduleId),
        stageId: draft.stageId ?? null,
        resourceNodeId: draft.resourceNodeId ?? null,
        durationHours: Number(draft.durationHours ?? 0),
        windowMode: draft.windowMode,
        operationDay: Number(draft.operationDay ?? 0),
        recommendedTime: Number(draft.recommendedTime ?? 0),
        recommendedDayOffset: Number(draft.recommendedDayOffset ?? 0),
        windowStartTime: Number(draft.windowStartTime ?? 0),
        windowStartDayOffset: Number(draft.windowStartDayOffset ?? 0),
        windowEndTime: Number(draft.windowEndTime ?? 0),
        windowEndDayOffset: Number(draft.windowEndDayOffset ?? 0),
        absoluteStartHour:
          draft.absoluteStartHour !== undefined && draft.absoluteStartHour !== null
            ? Number(draft.absoluteStartHour)
            : undefined,
      }
    : null;

const toConstraintPanelData = (
  links: TemplateConstraintLink[],
  scheduleId: number,
): {
  predecessors: any[];
  successors: any[];
} => ({
  predecessors: links
    .filter((item) => Number(item.fromScheduleId) === Number(scheduleId))
    .map((item) => ({
      constraint_id: item.constraintId,
      related_schedule_id: item.toScheduleId,
      related_operation_name: item.toOperationName,
      related_operation_code: item.toOperationCode,
      constraint_type: item.constraintType,
      lag_time: item.lagTime,
      lag_type: item.lagType ?? undefined,
      lag_min: item.lagMin ?? undefined,
      lag_max: item.lagMax ?? undefined,
      share_mode: item.shareMode ?? 'NONE',
      constraint_name: item.constraintName ?? undefined,
      constraint_level: item.constraintLevel ?? undefined,
      description: item.description ?? undefined,
      relation_type: 'predecessor',
    })),
  successors: links
    .filter((item) => Number(item.toScheduleId) === Number(scheduleId))
    .map((item) => ({
      constraint_id: item.constraintId,
      related_schedule_id: item.fromScheduleId,
      related_operation_name: item.fromOperationName,
      related_operation_code: item.fromOperationCode,
      constraint_type: item.constraintType,
      lag_time: item.lagTime,
      lag_type: item.lagType ?? undefined,
      lag_min: item.lagMin ?? undefined,
      lag_max: item.lagMax ?? undefined,
      share_mode: item.shareMode ?? 'NONE',
      constraint_name: item.constraintName ?? undefined,
      constraint_level: item.constraintLevel ?? undefined,
      description: item.description ?? undefined,
      relation_type: 'successor',
    })),
});

const TemplateResourceEditorTab: React.FC<TemplateResourceEditorTabProps> = ({
  templateId,
  templateTeamId,
  active = true,
  refreshKey = 0,
  onOpenNodes,
  focusRequest = null,
  validateRequestToken,
  onFocusHandled,
  onEditorMetricsChange,
  onOperationSelectionChange,
}) => {
  const lastValidateTokenRef = useRef<number | undefined>(undefined);
  const storageKey = useMemo(() => buildEditorStorageKey(templateId), [templateId]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<TemplateResourceEditorResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<ResourceNodeFilterScope>('referenced');
  const [searchValue, setSearchValue] = useState('');
  const [showUnplacedOnly, setShowUnplacedOnly] = useState(false);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [showAllConstraints, setShowAllConstraints] = useState(false);
  const [hourWidth, setHourWidth] = useState(18);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null);
  const [createOperationModalOpen, setCreateOperationModalOpen] = useState(false);
  const [createOperationContext, setCreateOperationContext] = useState<OperationCreateContext | null>(null);
  const [operationDrawerOpen, setOperationDrawerOpen] = useState(false);
  const [operationAdvancedDrawerOpen, setOperationAdvancedDrawerOpen] = useState(false);
  const [operationAdvancedTab, setOperationAdvancedTab] = useState<OperationAdvancedTabKey>('rules');
  const [pendingCreatedAction, setPendingCreatedAction] = useState<PendingOperationCreatedAction | null>(null);
  const [operationDraft, setOperationDraft] = useState<OperationDraft | null>(null);
  const [initialOperationDraft, setInitialOperationDraft] = useState<OperationDraft | null>(null);
  const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState<StageDraft | null>(null);
  const [initialStageDraft, setInitialStageDraft] = useState<StageDraft | null>(null);
  const [stageSaving, setStageSaving] = useState(false);
  const [operationSaving, setOperationSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastMove, setLastMove] = useState<LastMoveState | null>(null);
  const [inlineStageEditId, setInlineStageEditId] = useState<number | null>(null);
  const [inlineStageName, setInlineStageName] = useState('');
  const [shareGroupName, setShareGroupName] = useState('');
  const [shareGroupMode, setShareGroupMode] = useState<'SAME_TEAM' | 'DIFFERENT'>('SAME_TEAM');
  const [shareGroupMembers, setShareGroupMembers] = useState<number[]>([]);
  const [assignShareGroupId, setAssignShareGroupId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const persisted = JSON.parse(raw) as PersistedEditorState;
      setScope(persisted.scope ?? 'referenced');
      setSearchValue(persisted.searchValue ?? '');
      setShowUnplacedOnly(Boolean(persisted.showUnplacedOnly));
      setShowIssuesOnly(Boolean(persisted.showIssuesOnly));
      setShowAllConstraints(Boolean(persisted.showAllConstraints));
      setHourWidth(Number(persisted.hourWidth ?? 18));
      setExpandedKeys(new Set((persisted.expandedKeys ?? []).map((item) => Number(item))));
      setSelectedStageId(persisted.selectedStageId ?? null);
      setSelectedOperationId(persisted.selectedOperationId ?? null);
    } catch (error) {
      console.warn('Failed to restore resource editor state:', error);
    }
  }, [storageKey]);

  const loadEditor = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await processTemplateV2Api.getResourceEditor(templateId);
      setEditor(response);
      setExpandedKeys((current) => {
        if (!current.size) {
          return new Set((response.resourceTree ?? []).map((node: ResourceNode) => node.id));
        }
        const validIds = new Set(flattenNodes(response.resourceTree ?? []).map((node) => Number(node.id)));
        const next = new Set<number>();
        current.forEach((id) => {
          if (validIds.has(Number(id))) {
            next.add(Number(id));
          }
        });
        return next.size ? next : new Set((response.resourceTree ?? []).map((node: ResourceNode) => node.id));
      });
      setSelectedStageId((current) => current ?? response.stages[0]?.id ?? null);
    } catch (error) {
      console.error('Failed to load template resource editor:', error);
      setEditor(null);
      const apiMessage =
        typeof (error as any)?.response?.data?.detail === 'string'
          ? (error as any).response.data.detail
          : typeof (error as any)?.response?.data?.error === 'string'
            ? (error as any).response.data.error
          : typeof (error as Error)?.message === 'string'
            ? (error as Error).message
            : '';
      setErrorMessage(
        apiMessage
          ? `资源主编辑视图加载失败：${apiMessage}`
          : '资源主编辑视图加载失败，请确认模板与资源节点接口正常。',
      );
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void loadEditor();
  }, [active, loadEditor, refreshKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          scope,
          searchValue,
          showUnplacedOnly,
          showIssuesOnly,
          showAllConstraints,
          hourWidth,
          expandedKeys: Array.from(expandedKeys),
          selectedStageId,
          selectedOperationId,
        } satisfies PersistedEditorState),
      );
    } catch (error) {
      console.warn('Failed to persist resource editor state:', error);
    }
  }, [
    expandedKeys,
    hourWidth,
    scope,
    searchValue,
    selectedOperationId,
    selectedStageId,
    showAllConstraints,
    showIssuesOnly,
    showUnplacedOnly,
    storageKey,
  ]);

  const nodeList = useMemo(() => flattenNodes(editor?.resourceTree ?? []), [editor?.resourceTree]);
  const leafNodes = useMemo(
    () => nodeList.filter((node) => node.children.length === 0 && node.boundResourceId && node.isActive),
    [nodeList],
  );
  const parentMap = useMemo(() => buildParentMap(editor?.resourceTree ?? []), [editor?.resourceTree]);

  const issueScheduleIdSet = useMemo(() => {
    const result = new Set<number>();
    (editor?.validation.unplacedOperationIds ?? []).forEach((item) => result.add(Number(item)));
    (editor?.validation.resourceRuleMismatchIds ?? []).forEach((item) => result.add(Number(item)));
    (editor?.validation.invalidBindings ?? []).forEach((item) => result.add(Number(item.scheduleId)));
    (editor?.validation.constraintConflicts ?? []).forEach((conflict) => {
      (conflict.operationScheduleIds ?? []).forEach((scheduleId) => result.add(Number(scheduleId)));
    });
    return result;
  }, [editor?.validation]);

  const operations = useMemo(() => editor?.operations ?? [], [editor?.operations]);
  const stages = useMemo(() => editor?.stages ?? [], [editor?.stages]);

  const selectedOperation = useMemo(
    () => operations.find((item) => Number(item.id) === Number(selectedOperationId)) ?? null,
    [operations, selectedOperationId],
  );

  useEffect(() => {
    onOperationSelectionChange?.(selectedOperation);
  }, [onOperationSelectionChange, selectedOperation]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    onEditorMetricsChange?.({
      nodeCount: Number(editor.metrics.resourceNodeCount ?? 0),
      operationCount: Number(editor.metrics.totalOperations ?? 0),
      unplacedCount: Number(editor.validation.summary.unplacedCount ?? 0),
      invalidCount: Number(editor.validation.summary.invalidBindingCount ?? 0),
      conflictCount: Number(editor.validation.summary.constraintConflictCount ?? 0),
    });
  }, [editor, onEditorMetricsChange]);

  const stageDraftDirty = useMemo(
    () => JSON.stringify(sanitizeStageDraft(stageDraft)) !== JSON.stringify(sanitizeStageDraft(initialStageDraft)),
    [initialStageDraft, stageDraft],
  );

  const operationDraftDirty = useMemo(
    () =>
      JSON.stringify(sanitizeOperationDraft(operationDraft)) !==
      JSON.stringify(sanitizeOperationDraft(initialOperationDraft)),
    [initialOperationDraft, operationDraft],
  );

  const boundNodeIds = useMemo(
    () =>
      new Set(
        operations
          .filter((operation) => operation.defaultResourceNodeId)
          .map((operation) => Number(operation.defaultResourceNodeId)),
      ),
    [operations],
  );

  const scopedIds = useMemo(() => {
    if (!editor) {
      return new Set<number>();
    }

    if (scope === 'all') {
      return new Set(nodeList.map((node) => node.id));
    }

    if (scope === 'department') {
      const result = new Set<number>();
      nodeList.forEach((node) => {
        if (node.nodeScope === 'DEPARTMENT') {
          collectAncestorIds(node.id, parentMap).forEach((id) => result.add(id));
          collectDescendantIds(node).forEach((id) => result.add(id));
        }
      });
      return result;
    }

    const result = new Set<number>();
    boundNodeIds.forEach((nodeId) => {
      collectAncestorIds(nodeId, parentMap).forEach((id) => result.add(id));
    });
    return result;
  }, [boundNodeIds, editor, nodeList, parentMap, scope]);

  const filteredTree = useMemo(
    () => pruneTree(editor?.resourceTree ?? [], scopedIds, searchValue),
    [editor?.resourceTree, scopedIds, searchValue],
  );

  const visibleRows = useMemo(
    () => flattenVisibleRows(filteredTree, expandedKeys),
    [expandedKeys, filteredTree],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (selectedStageId && !stages.some((stage) => Number(stage.id) === Number(selectedStageId))) {
      setSelectedStageId(stages[0]?.id ?? null);
    }
    if (selectedOperationId && !operations.some((operation) => Number(operation.id) === Number(selectedOperationId))) {
      setSelectedOperationId(null);
    }
  }, [editor, operations, selectedOperationId, selectedStageId, stages]);

  useEffect(() => {
    if (!selectedOperation) {
      return;
    }
    setSelectedStageId(Number(selectedOperation.stage_id));
  }, [selectedOperation]);

  const startDay = useMemo(() => {
    if (!operations.length) {
      return Math.min(...stages.map((stage) => stage.start_day), 0);
    }
    return Math.min(...operations.map((operation) => Math.floor(getAbsoluteStartHour(operation) / 24)));
  }, [operations, stages]);

  const endDay = useMemo(() => {
    if (!operations.length) {
      return Math.max(startDay, (editor?.template.total_days ?? 1) - 1);
    }
    const maxAbsoluteEnd = operations.reduce((max, operation) => Math.max(max, getAbsoluteEndHour(operation)), 0);
    return Math.max(startDay, Math.ceil(maxAbsoluteEnd / 24), startDay + Math.max((editor?.template.total_days ?? 1) - 1, 0));
  }, [editor?.template.total_days, operations, startDay]);

  const totalDays = Math.max(1, endDay - startDay + 1);
  const timelineWidth = totalDays * 24 * hourWidth;

  const operationsByNodeId = useMemo(() => {
    const map = new Map<number, PlannerOperation[]>();
    operations.forEach((operation) => {
      if (!operation.defaultResourceNodeId) {
        return;
      }

      if (showIssuesOnly && !issueScheduleIdSet.has(Number(operation.id))) {
        return;
      }

      const key = Number(operation.defaultResourceNodeId);
      const current = map.get(key) ?? [];
      current.push(operation);
      map.set(key, current);
    });
    return map;
  }, [issueScheduleIdSet, operations, showIssuesOnly]);

  const shareGroupsByScheduleId = useMemo(() => {
    const result = new Map<number, TemplateShareGroupSummary[]>();
    (editor?.shareGroups ?? []).forEach((group) => {
      group.memberIds.forEach((scheduleId) => {
        const current = result.get(Number(scheduleId)) ?? [];
        current.push(group);
        result.set(Number(scheduleId), current);
      });
    });
    return result;
  }, [editor?.shareGroups]);

  const stageStats = useMemo(() => {
    const result = new Map<number, { total: number; unplaced: number; invalid: number }>();
    stages.forEach((stage) => {
      const stageOperations = operations.filter((item) => Number(item.stage_id) === Number(stage.id));
      result.set(stage.id, {
        total: stageOperations.length,
        unplaced: stageOperations.filter((item) => item.bindingStatus === 'UNBOUND').length,
        invalid: stageOperations.filter((item) => item.bindingStatus !== 'BOUND').length,
      });
    });
    return result;
  }, [operations, stages]);

  const unplacedOperations = useMemo(
    () =>
      operations.filter((item) => {
        if (item.bindingStatus !== 'UNBOUND') {
          return false;
        }
        if (showIssuesOnly) {
          return issueScheduleIdSet.has(Number(item.id));
        }
        return true;
      }),
    [issueScheduleIdSet, operations, showIssuesOnly],
  );

  const operationSuggestions = useCallback(
    (operation: PlannerOperation) => {
      const requirementTypes = new Set<string>((operation.resource_requirements ?? []).map((item) => item.resource_type));
      return leafNodes.filter((node) => {
        if (!requirementTypes.size) {
          return true;
        }
        return requirementTypes.has(node.boundResourceType ?? '');
      });
    },
    [leafNodes],
  );

  const selectedOperationConstraints = useMemo(
    () => toConstraintPanelData(editor?.constraints ?? [], Number(selectedOperation?.id ?? 0)),
    [editor?.constraints, selectedOperation?.id],
  );

  const availableConstraintOperations = useMemo(
    () =>
      operations.map((item) => ({
        schedule_id: item.id,
        stage_name: item.stage_name,
        operation_name: item.operation_name,
        operation_code: item.operation_code,
        operation_day: item.operation_day,
        recommended_time: item.recommended_time,
      })),
    [operations],
  );

  const editDraftStage = useMemo(
    () => stages.find((item) => Number(item.id) === Number(operationDraft?.stageId)) ?? null,
    [operationDraft?.stageId, stages],
  );

  const editDraftNode = useMemo(
    () => (operationDraft?.resourceNodeId ? leafNodes.find((item) => Number(item.id) === Number(operationDraft.resourceNodeId)) ?? null : null),
    [leafNodes, operationDraft?.resourceNodeId],
  );

  const editDraftIssueGroups = useMemo(() => {
    const blocking: string[] = [];
    const warnings: string[] = [];
    if (!operationDraft) {
      return { blocking, warnings };
    }

    const validation = validateOperationCoreDraft({
      draft: {
        stageId: operationDraft.stageId,
        resourceNodeId: operationDraft.resourceNodeId,
        operationDay: operationDraft.operationDay,
        recommendedTime: operationDraft.recommendedTime,
        recommendedDayOffset: operationDraft.recommendedDayOffset,
        windowMode: operationDraft.windowMode,
        windowStartTime: operationDraft.windowStartTime,
        windowStartDayOffset: operationDraft.windowStartDayOffset,
        windowEndTime: operationDraft.windowEndTime,
        windowEndDayOffset: operationDraft.windowEndDayOffset,
      },
      stageStartDay: Number(editDraftStage?.start_day ?? 0),
      requireStage: true,
      warnUnbound: true,
      bindingWarning:
        selectedOperation?.bindingStatus && selectedOperation.bindingStatus !== 'BOUND'
          ? `当前绑定状态：${selectedOperation.bindingStatus}${selectedOperation.bindingReason ? `，${selectedOperation.bindingReason}` : ''}`
          : null,
    });

    blocking.push(...validation.errors);
    warnings.push(...validation.warnings);
    if (!editDraftNode && operationDraft.resourceNodeId) {
      warnings.push('已选择资源节点，但当前节点不可用');
    }

    return { blocking, warnings };
  }, [editDraftNode, editDraftStage?.start_day, operationDraft, selectedOperation?.bindingReason, selectedOperation?.bindingStatus]);

  useEffect(() => {
    if (!operationDraft || operationDraft.windowMode !== 'auto') {
      return;
    }
    const stageStartDay = Number(editDraftStage?.start_day ?? 0);
    const absoluteStart =
      (stageStartDay + Number(operationDraft.operationDay ?? 0) + Number(operationDraft.recommendedDayOffset ?? 0)) * 24 +
      Number(operationDraft.recommendedTime ?? 0);
    const absoluteWindowStart = absoluteStart - 2;
    const absoluteWindowEnd = absoluteStart + Math.max(Number(operationDraft.durationHours ?? 2), 2);
    const nextWindowStartTime = toHourValue(absoluteWindowStart);
    const nextWindowStartOffset = Math.floor(absoluteWindowStart / 24) - stageStartDay - Number(operationDraft.operationDay ?? 0);
    const nextWindowEndTime = toHourValue(absoluteWindowEnd);
    const nextWindowEndOffset = Math.floor(absoluteWindowEnd / 24) - stageStartDay - Number(operationDraft.operationDay ?? 0);

    if (
      nextWindowStartTime === operationDraft.windowStartTime &&
      nextWindowStartOffset === operationDraft.windowStartDayOffset &&
      nextWindowEndTime === operationDraft.windowEndTime &&
      nextWindowEndOffset === operationDraft.windowEndDayOffset
    ) {
      return;
    }

    setOperationDraft((current) =>
      current
        ? {
            ...current,
            windowStartTime: nextWindowStartTime,
            windowStartDayOffset: nextWindowStartOffset,
            windowEndTime: nextWindowEndTime,
            windowEndDayOffset: nextWindowEndOffset,
          }
        : current,
    );
  }, [editDraftStage?.start_day, operationDraft]);

  const visibleConstraintLinks = useMemo(() => {
    const allLinks = editor?.constraints ?? [];
    if (showAllConstraints) {
      return allLinks;
    }
    if (!selectedOperation) {
      return [];
    }
    return allLinks.filter(
      (item) =>
        Number(item.fromScheduleId) === Number(selectedOperation.id) ||
        Number(item.toScheduleId) === Number(selectedOperation.id),
    );
  }, [editor?.constraints, selectedOperation, showAllConstraints]);

  const barPositions = useMemo(() => {
    const result = new Map<number, { x: number; y: number; width: number; height: number }>();
    visibleRows.forEach((row, rowIndex) => {
      if (!row.isLeaf) {
        return;
      }
      const rowOperations = operationsByNodeId.get(row.node.id) ?? [];
      rowOperations.forEach((operation) => {
        const left = (getAbsoluteStartHour(operation) - startDay * 24) * hourWidth;
        const width = Math.max((getAbsoluteEndHour(operation) - getAbsoluteStartHour(operation)) * hourWidth, 24);
        result.set(Number(operation.id), {
          x: left,
          y: rowIndex * ROW_HEIGHT + 10,
          width,
          height: ROW_HEIGHT - 20,
        });
      });
    });
    return result;
  }, [hourWidth, operationsByNodeId, startDay, visibleRows]);

  const getRowBars = useCallback(
    (row: TimelineRow): RenderBar[] => {
      if (!row.isLeaf) {
        return [];
      }
      return (operationsByNodeId.get(row.node.id) ?? []).map((operation) => {
        const inConflict = issueScheduleIdSet.has(Number(operation.id)) && operation.bindingStatus === 'BOUND';
        const hasBindingProblem = operation.bindingStatus !== 'BOUND';
        return {
          key: `operation-${operation.id}`,
          operation,
          title: operation.operation_name,
          subtitle: operation.stage_name,
          startHour: getAbsoluteStartHour(operation),
          endHour: getAbsoluteEndHour(operation),
          color: getStageColor(operation.stage_order),
          statusTone: inConflict ? 'danger' : hasBindingProblem ? 'warning' : 'default',
          hasShareGroup: (shareGroupsByScheduleId.get(Number(operation.id)) ?? []).length > 0,
        };
      });
    },
    [issueScheduleIdSet, operationsByNodeId, shareGroupsByScheduleId],
  );

  const openStageDrawer = useCallback(
    (stage?: TemplateStageSummary | null) => {
      const nextDraft = stage
        ? {
            id: stage.id,
            stageName: stage.stage_name,
            stageOrder: stage.stage_order,
            startDay: stage.start_day,
            description: stage.description ?? '',
          }
        : createDefaultStageDraft(stages);

      setInitialStageDraft(nextDraft);
      if (stage) {
        setStageDraft(nextDraft);
      } else {
        setStageDraft(nextDraft);
      }
      setStageDrawerOpen(true);
    },
    [stages],
  );

  const openCreateOperationModal = useCallback(
    (defaults?: Partial<OperationDraft>) => {
      setCreateOperationContext({
        source: defaults?.absoluteStartHour !== undefined ? 'canvas' : defaults?.stageId ? 'stage' : 'toolbar',
        stageId: defaults?.stageId ?? null,
        resourceNodeId: defaults?.resourceNodeId ?? null,
        absoluteStartHour: defaults?.absoluteStartHour,
        operationDay: defaults?.operationDay,
        recommendedTime: defaults?.recommendedTime,
        recommendedDayOffset: defaults?.recommendedDayOffset,
        windowStartTime: defaults?.windowStartTime,
        windowStartDayOffset: defaults?.windowStartDayOffset,
        windowEndTime: defaults?.windowEndTime,
        windowEndDayOffset: defaults?.windowEndDayOffset,
      });
      setSelectedOperationId(null);
      setCreateOperationModalOpen(true);
    },
    [],
  );

  const openEditOperationDrawer = useCallback(
    (
      operation: PlannerOperation,
      options?: { openAdvanced?: boolean; initialAdvancedTab?: OperationAdvancedTabKey },
    ) => {
      const hasWindow =
        operation.window_start_time !== undefined &&
        operation.window_start_time !== null &&
        operation.window_end_time !== undefined &&
        operation.window_end_time !== null;
      const nextDraft: OperationDraft = {
        scheduleId: operation.id,
        stageId: operation.stage_id,
        resourceNodeId: operation.defaultResourceNodeId ?? null,
        durationHours: Number(operation.standard_time ?? 4),
        windowMode: hasWindow ? 'manual' : 'auto',
        operationDay: Number(operation.operation_day ?? 0),
        recommendedTime: Number(operation.recommended_time ?? 9),
        recommendedDayOffset: Number(operation.recommended_day_offset ?? 0),
        windowStartTime: Number(operation.window_start_time ?? Math.max(Number(operation.recommended_time ?? 9) - 2, 0)),
        windowStartDayOffset: Number(operation.window_start_day_offset ?? 0),
        windowEndTime: Number(
          operation.window_end_time ??
            Number(operation.recommended_time ?? 9) + Math.max(Number(operation.standard_time ?? 2), 2),
        ),
        windowEndDayOffset: Number(operation.window_end_day_offset ?? 0),
      };
      setSelectedOperationId(operation.id);
      setShareGroupName('');
      setShareGroupMembers([]);
      setShareGroupMode('SAME_TEAM');
      setAssignShareGroupId(null);
      setInitialOperationDraft(nextDraft);
      setOperationDraft(nextDraft);
      setOperationAdvancedDrawerOpen(Boolean(options?.openAdvanced));
      setOperationAdvancedTab(options?.initialAdvancedTab ?? 'rules');
      setOperationDrawerOpen(true);
    },
    [],
  );

  const handleSaveStage = async () => {
    if (!stageDraft) {
      return;
    }

    if (!stageDraft.stageName.trim()) {
      message.error('请输入阶段名称');
      return;
    }

    try {
      setStageSaving(true);
      if (stageDraft.id) {
        await processTemplateV2Api.updateStage(stageDraft.id, {
          stageName: stageDraft.stageName.trim(),
          stageOrder: stageDraft.stageOrder,
          startDay: stageDraft.startDay,
          description: stageDraft.description.trim() || null,
        });
        message.success('阶段已更新');
      } else {
        const createdStage = await processTemplateV2Api.createStage(templateId, {
          stageName: stageDraft.stageName.trim(),
          stageOrder: stageDraft.stageOrder,
          startDay: stageDraft.startDay,
          description: stageDraft.description.trim() || undefined,
        });
        setSelectedStageId(createdStage.id);
        message.success('阶段已创建');
      }
      setStageDrawerOpen(false);
      setInitialStageDraft(null);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to save stage:', error);
      message.error(error?.response?.data?.error || '保存阶段失败');
    } finally {
      setStageSaving(false);
    }
  };

  const handleDeleteStage = async (stageId: number) => {
    try {
      await processTemplateV2Api.deleteStage(stageId);
      message.success('阶段已删除');
      if (selectedStageId === stageId) {
        setSelectedStageId(null);
      }
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to delete stage:', error);
      message.error(error?.response?.data?.error || '删除阶段失败');
    }
  };

  const handleMoveStage = async (stageId: number, direction: 'up' | 'down') => {
    const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);
    const currentIndex = sortedStages.findIndex((item) => Number(item.id) === Number(stageId));
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentStage = sortedStages[currentIndex];
    const targetStage = sortedStages[targetIndex];

    if (!currentStage || !targetStage) {
      return;
    }

    try {
      await processTemplateV2Api.updateStage(currentStage.id, { stageOrder: targetStage.stage_order });
      await processTemplateV2Api.updateStage(targetStage.id, { stageOrder: currentStage.stage_order });
      message.success(direction === 'up' ? '阶段已上移' : '阶段已下移');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to reorder stage:', error);
      message.error(error?.response?.data?.error || '调整阶段顺序失败');
    }
  };

  const handleSaveInlineStageName = async (stageId: number) => {
    if (!inlineStageName.trim()) {
      message.error('阶段名称不能为空');
      return;
    }

    try {
      await processTemplateV2Api.updateStage(stageId, {
        stageName: inlineStageName.trim(),
      });
      setInlineStageEditId(null);
      message.success('阶段名称已更新');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to rename stage:', error);
      message.error(error?.response?.data?.error || '更新阶段名称失败');
    }
  };

  const handleSaveOperation = async () => {
    if (!operationDraft) {
      return;
    }
    const stageStartDay = Number(editDraftStage?.start_day ?? 0);
    const validation = validateOperationCoreDraft({
      draft: {
        stageId: operationDraft.stageId,
        resourceNodeId: operationDraft.resourceNodeId,
        operationDay: operationDraft.operationDay,
        recommendedTime: operationDraft.recommendedTime,
        recommendedDayOffset: operationDraft.recommendedDayOffset,
        windowMode: operationDraft.windowMode,
        windowStartTime: operationDraft.windowStartTime,
        windowStartDayOffset: operationDraft.windowStartDayOffset,
        windowEndTime: operationDraft.windowEndTime,
        windowEndDayOffset: operationDraft.windowEndDayOffset,
      },
      stageStartDay,
      requireStage: true,
      warnUnbound: false,
      bindingWarning: null,
    });
    if (validation.errors.length > 0) {
      message.error(validation.errors[0]);
      return;
    }

    try {
      setOperationSaving(true);

      if (selectedOperation && Number(selectedOperation.stage_id) !== Number(operationDraft.stageId)) {
        await processTemplateV2Api.moveStageOperationToStage(operationDraft.scheduleId, Number(operationDraft.stageId));
      }

      const nextWindow =
        operationDraft.windowMode === 'auto'
          ? (() => {
              const absoluteStart =
                (stageStartDay +
                  Number(operationDraft.operationDay ?? 0) +
                  Number(operationDraft.recommendedDayOffset ?? 0)) *
                  24 +
                Number(operationDraft.recommendedTime ?? 0);
              const absoluteWindowStart = absoluteStart - 2;
              const absoluteWindowEnd = absoluteStart + Math.max(Number(operationDraft.durationHours ?? 2), 2);
              return {
                windowStartTime: toHourValue(absoluteWindowStart),
                windowStartDayOffset:
                  Math.floor(absoluteWindowStart / 24) - stageStartDay - Number(operationDraft.operationDay ?? 0),
                windowEndTime: toHourValue(absoluteWindowEnd),
                windowEndDayOffset:
                  Math.floor(absoluteWindowEnd / 24) - stageStartDay - Number(operationDraft.operationDay ?? 0),
              };
            })()
          : {
              windowStartTime: operationDraft.windowStartTime,
              windowStartDayOffset: operationDraft.windowStartDayOffset,
              windowEndTime: operationDraft.windowEndTime,
              windowEndDayOffset: operationDraft.windowEndDayOffset,
            };

      await processTemplateV2Api.updateStageOperation(operationDraft.scheduleId, {
        operationDay: operationDraft.operationDay,
        recommendedTime: operationDraft.recommendedTime,
        recommendedDayOffset: operationDraft.recommendedDayOffset,
        windowStartTime: nextWindow.windowStartTime,
        windowStartDayOffset: nextWindow.windowStartDayOffset,
        windowEndTime: nextWindow.windowEndTime,
        windowEndDayOffset: nextWindow.windowEndDayOffset,
      });

      await processTemplateV2Api.updateTemplateScheduleBinding(operationDraft.scheduleId, operationDraft.resourceNodeId ?? null);
      message.success('工序已更新');

      setOperationDrawerOpen(false);
      setOperationAdvancedDrawerOpen(false);
      setInitialOperationDraft(null);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to save operation draft:', error);
      message.error(error?.response?.data?.error || '保存工序失败');
    } finally {
      setOperationSaving(false);
    }
  };

  const handleDeleteOperation = async (scheduleId: number) => {
    try {
      await processTemplateV2Api.deleteStageOperation(scheduleId);
      message.success('工序已删除');
      if (selectedOperationId === scheduleId) {
        setSelectedOperationId(null);
        setOperationDrawerOpen(false);
        setOperationAdvancedDrawerOpen(false);
      }
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to delete operation:', error);
      message.error(error?.response?.data?.error || '删除工序失败');
    }
  };

  const handleCopyOperation = async (operation: PlannerOperation) => {
    try {
      const createdId = await processTemplateV2Api.createStageOperation(operation.stage_id, {
        operationId: operation.operation_id,
        operationDay: Number(operation.operation_day ?? 0),
        recommendedTime: Number(operation.recommended_time ?? 9),
        recommendedDayOffset: Number(operation.recommended_day_offset ?? 0),
        windowStartTime: Number(operation.window_start_time ?? 7),
        windowStartDayOffset: Number(operation.window_start_day_offset ?? 0),
        windowEndTime: Number(operation.window_end_time ?? 13),
        windowEndDayOffset: Number(operation.window_end_day_offset ?? 0),
      });

      if (operation.defaultResourceNodeId) {
        await processTemplateV2Api.updateTemplateScheduleBinding(createdId, operation.defaultResourceNodeId);
      }

      message.success('工序已复制');
      setSelectedOperationId(createdId);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to copy operation:', error);
      message.error(error?.response?.data?.error || '复制工序失败');
    }
  };

  const handleValidate = useCallback(async () => {
    try {
      setValidating(true);
      await processTemplateV2Api.validateResourceEditor(templateId);
      message.success('资源主编辑视图已重新校验');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to validate editor:', error);
      message.error(error?.response?.data?.error || '校验失败');
    } finally {
      setValidating(false);
    }
  }, [loadEditor, templateId]);

  const handleAssignNode = async (operation: PlannerOperation, nodeId: number | null) => {
    try {
      await processTemplateV2Api.updateTemplateScheduleBinding(operation.id, nodeId);
      message.success(nodeId ? '默认资源节点已绑定' : '默认资源节点已解绑');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to assign node:', error);
      message.error(error?.response?.data?.error || '更新默认资源节点失败');
    }
  };

  const handleDropOnLeafRow = async (
    event: React.DragEvent<HTMLDivElement>,
    row: TimelineRow,
  ) => {
    event.preventDefault();
    if (!row.isLeaf) {
      return;
    }

    const payloadRaw = event.dataTransfer.getData('application/x-mfg8-process-op');
    if (!payloadRaw) {
      return;
    }

    try {
      const payload = JSON.parse(payloadRaw) as { scheduleId: number };
      const operation = operations.find((item) => Number(item.id) === Number(payload.scheduleId));
      if (!operation) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const absoluteStartHour = startDay * 24 + Math.floor(offsetX / hourWidth);
      const nextFields = buildSchedulePayloadFromAbsoluteHour(
        Number(operation.stage_start_day ?? 0),
        absoluteStartHour,
        Number(operation.standard_time ?? 2),
      );

      await processTemplateV2Api.updateStageOperation(operation.id, nextFields);
      await processTemplateV2Api.updateTemplateScheduleBinding(operation.id, row.node.id);

      setLastMove({
        scheduleId: operation.id,
        previousNodeId: operation.defaultResourceNodeId ?? null,
        previousPayload: {
          operationDay: Number(operation.operation_day ?? 0),
          recommendedTime: Number(operation.recommended_time ?? 9),
          recommendedDayOffset: Number(operation.recommended_day_offset ?? 0),
          windowStartTime: Number(operation.window_start_time ?? 7),
          windowStartDayOffset: Number(operation.window_start_day_offset ?? 0),
          windowEndTime: Number(operation.window_end_time ?? 13),
          windowEndDayOffset: Number(operation.window_end_day_offset ?? 0),
        },
      });

      message.success(`已将 ${operation.operation_name} 放置到 ${row.node.nodeName}`);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to drop operation on row:', error);
      message.error(error?.response?.data?.error || '拖放工序失败');
    }
  };

  const handleUndoLastMove = async () => {
    if (!lastMove) {
      return;
    }

    try {
      await processTemplateV2Api.updateStageOperation(lastMove.scheduleId, lastMove.previousPayload);
      await processTemplateV2Api.updateTemplateScheduleBinding(lastMove.scheduleId, lastMove.previousNodeId);
      message.success('已撤销上一次条块移动');
      setLastMove(null);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to undo last move:', error);
      message.error(error?.response?.data?.error || '撤销失败');
    }
  };

  const currentOperationShareGroups = useMemo(
    () => (selectedOperation ? shareGroupsByScheduleId.get(Number(selectedOperation.id)) ?? [] : []),
    [selectedOperation, shareGroupsByScheduleId],
  );

  const existingShareGroups = useMemo(
    () =>
      (editor?.shareGroups ?? []).filter(
        (group) => !selectedOperation || !group.memberIds.includes(Number(selectedOperation.id)),
      ),
    [editor?.shareGroups, selectedOperation],
  );

  const handleCreateShareGroup = async () => {
    if (!selectedOperation) {
      return;
    }
    if (!shareGroupName.trim() || shareGroupMembers.length === 0) {
      message.error('请输入共享组名称并至少选择一个额外工序');
      return;
    }

    try {
      await processTemplateV2Api.createTemplateShareGroup(templateId, {
        groupName: shareGroupName.trim(),
        shareMode: shareGroupMode,
        memberIds: [selectedOperation.id, ...shareGroupMembers],
      });
      message.success('共享组已创建');
      setShareGroupName('');
      setShareGroupMembers([]);
      setShareGroupMode('SAME_TEAM');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to create share group:', error);
      message.error(error?.response?.data?.error || '创建共享组失败');
    }
  };

  const handleAssignShareGroup = async () => {
    if (!selectedOperation || !assignShareGroupId) {
      return;
    }

    try {
      await processTemplateV2Api.assignOperationToShareGroup(selectedOperation.id, assignShareGroupId);
      message.success('工序已加入共享组');
      setAssignShareGroupId(null);
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to assign share group:', error);
      message.error(error?.response?.data?.error || '加入共享组失败');
    }
  };

  const handleRemoveShareGroup = async (groupId: number) => {
    if (!selectedOperation) {
      return;
    }

    try {
      await processTemplateV2Api.removeOperationFromShareGroup(selectedOperation.id, groupId);
      message.success('已从共享组移除');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to remove share group:', error);
      message.error(error?.response?.data?.error || '移出共享组失败');
    }
  };

  const handleMoveOperationToStage = async (scheduleId: number, targetStageId: number) => {
    try {
      await processTemplateV2Api.moveStageOperationToStage(scheduleId, targetStageId);
      message.success('工序已移动到目标阶段');
      await loadEditor();
    } catch (error: any) {
      console.error('Failed to move operation to stage:', error);
      message.error(error?.response?.data?.error || '移动工序失败');
    }
  };

  const focusOperation = useCallback(
    (
      scheduleId: number,
      options?: {
        openDrawer?: boolean;
        showIssues?: boolean;
        showUnplaced?: boolean;
        openAdvanced?: boolean;
        initialAdvancedTab?: OperationAdvancedTabKey;
      },
    ) => {
      const operation = operations.find((item) => Number(item.id) === Number(scheduleId));
      if (!operation) {
        return;
      }
      setSelectedStageId(Number(operation.stage_id));
      setSelectedOperationId(Number(operation.id));
      if (options?.showIssues) {
        setShowIssuesOnly(true);
      }
      if (options?.showUnplaced) {
        setShowUnplacedOnly(true);
      }
      if (options?.openDrawer) {
        openEditOperationDrawer(operation, {
          openAdvanced: options.openAdvanced,
          initialAdvancedTab: options.initialAdvancedTab,
        });
      }
    },
    [openEditOperationDrawer, operations],
  );

  const resetViewportFilters = useCallback(() => {
    setShowUnplacedOnly(false);
    setShowIssuesOnly(false);
    setShowAllConstraints(false);
    setSearchValue('');
  }, []);

  useEffect(() => {
    if (!focusRequest || !editor) {
      return;
    }

    if (focusRequest.focus === 'all') {
      resetViewportFilters();
      onFocusHandled?.();
      return;
    }

    if (focusRequest.focus === 'unbound') {
      setShowUnplacedOnly(true);
      setShowIssuesOnly(false);
      const targetScheduleId = focusRequest.scheduleId ?? editor.validation.unplacedOperationIds[0];
      if (targetScheduleId) {
        focusOperation(targetScheduleId, { showUnplaced: true });
      }
      onFocusHandled?.();
      return;
    }

    if (focusRequest.focus === 'invalid') {
      setShowUnplacedOnly(false);
      setShowIssuesOnly(true);
      const targetScheduleId = focusRequest.scheduleId ?? editor.validation.invalidBindings[0]?.scheduleId;
      if (targetScheduleId) {
        focusOperation(targetScheduleId, { showIssues: true });
      }
      onFocusHandled?.();
      return;
    }

    if (focusRequest.focus === 'conflict') {
      setShowUnplacedOnly(false);
      setShowIssuesOnly(true);
      const targetScheduleId =
        focusRequest.scheduleId ?? editor.validation.constraintConflicts[0]?.operationScheduleIds?.[0];
      if (targetScheduleId) {
        focusOperation(targetScheduleId, { showIssues: true });
      }
      onFocusHandled?.();
    }
  }, [editor, focusOperation, focusRequest, onFocusHandled, resetViewportFilters]);

  useEffect(() => {
    if (validateRequestToken === undefined || validateRequestToken === null) {
      return;
    }

    if (lastValidateTokenRef.current === validateRequestToken) {
      return;
    }

    lastValidateTokenRef.current = validateRequestToken;
    void handleValidate();
  }, [handleValidate, validateRequestToken]);

  const closeStageDrawer = useCallback(() => {
    if (!stageDraftDirty) {
      setStageDrawerOpen(false);
      return;
    }

    Modal.confirm({
      title: '阶段草稿尚未保存',
      content: '关闭后会丢失当前阶段编辑内容，是否继续？',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: () => setStageDrawerOpen(false),
    });
  }, [stageDraftDirty]);

  const closeOperationDrawer = useCallback(() => {
    if (!operationDraftDirty) {
      setOperationDrawerOpen(false);
      setOperationAdvancedDrawerOpen(false);
      return;
    }

    Modal.confirm({
      title: '工序草稿尚未保存',
      content: '关闭后会丢失当前工序编辑内容，是否继续？',
      okText: '放弃修改',
      cancelText: '继续编辑',
      onOk: () => {
        setOperationDrawerOpen(false);
        setOperationAdvancedDrawerOpen(false);
      },
    });
  }, [operationDraftDirty]);

  const closeCreateOperationModal = useCallback(() => {
    setCreateOperationModalOpen(false);
    setCreateOperationContext(null);
  }, []);

  const handleCreatedOperation = useCallback(
    async (result: OperationCreatedResult) => {
      setSelectedStageId(result.stageId);
      setSelectedOperationId(result.scheduleId);
      setPendingCreatedAction({
        ...result,
        token: Date.now(),
      });
      await loadEditor();
    },
    [loadEditor],
  );

  useEffect(() => {
    if (!pendingCreatedAction) {
      return;
    }
    const operation = operations.find((item) => Number(item.id) === Number(pendingCreatedAction.scheduleId));
    if (!operation) {
      return;
    }
    openEditOperationDrawer(operation, {
      openAdvanced: pendingCreatedAction.openAdvanced,
      initialAdvancedTab: pendingCreatedAction.initialAdvancedTab,
    });
    setPendingCreatedAction(null);
  }, [openEditOperationDrawer, operations, pendingCreatedAction]);

  useEffect(() => {
    if (!selectedOperationId) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(`resource-editor-operation-${selectedOperationId}`);
      element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedOperationId, editor]);

  if (loading) {
    return (
      <div className="flex min-h-[620px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Spin size="large" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <Alert
        type="error"
        showIcon
        message="资源主编辑视图加载失败"
        description={errorMessage}
        action={
          <Space wrap>
            <Button size="small" onClick={() => void loadEditor()}>
              重试
            </Button>
            {onOpenNodes ? (
              <Button size="small" type="link" onClick={onOpenNodes}>
                打开节点管理
              </Button>
            ) : null}
          </Space>
        }
      />
    );
  }

  if (!editor) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16">
        <Empty description="当前模板暂无资源主编辑数据" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">
              资源主编辑视图
            </span>
            <Tag color="blue">V2 主编辑器</Tag>
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">资源节点时间轴建模</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            左侧建立工艺阶段和工序，中间完成资源落位与调时，右侧统一编辑资源规则、约束和共享组。
          </p>
          {editor.warnings.length ? (
            <div className="mt-4 space-y-2">
              {editor.warnings.map((warning) => (
                <Alert key={warning} type="warning" showIcon message={warning} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">阶段</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{editor.stages.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">工序</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{editor.metrics.totalOperations}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">未落位</div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{editor.validation.summary.unplacedCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-400">逻辑冲突</div>
            <div className="mt-2 text-2xl font-semibold text-rose-700">{editor.validation.summary.constraintConflictCount}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">工艺结构</div>
              <Space size={8}>
                <Button size="small" icon={<PlusOutlined />} onClick={() => openStageDrawer()}>
                  新增阶段
                </Button>
                <Button size="small" onClick={() => openCreateOperationModal({ stageId: selectedStageId ?? undefined })}>
                  新增工序
                </Button>
              </Space>
            </div>

            {!editor.stages.length ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
                <div className="text-base font-semibold text-slate-900">从空模板开始</div>
                <div className="text-sm leading-6 text-slate-600">
                  1. 先新增阶段
                  <br />
                  2. 再新增工序
                  <br />
                  3. 最后把工序拖到资源节点时间轴
                </div>
                <Space wrap>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openStageDrawer()}>
                    创建第一个阶段
                  </Button>
                  <Button onClick={onOpenNodes}>切换到节点管理</Button>
                </Space>
              </div>
            ) : (
              <div className="space-y-3">
                {editor.stages.map((stage) => {
                  const stats = stageStats.get(stage.id) ?? { total: 0, unplaced: 0, invalid: 0 };
                  const stageOperations = operations.filter((item) => Number(item.stage_id) === Number(stage.id));
                  return (
                    <div
                      key={stage.id}
                      className={`rounded-2xl border px-3 py-3 transition-colors ${
                        Number(selectedStageId) === Number(stage.id)
                          ? 'border-sky-300 bg-sky-50/60'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        const payloadRaw = event.dataTransfer.getData('application/x-mfg8-process-op');
                        if (!payloadRaw) {
                          return;
                        }
                        try {
                          const payload = JSON.parse(payloadRaw) as { scheduleId: number };
                          void handleMoveOperationToStage(Number(payload.scheduleId), stage.id);
                        } catch (error) {
                          console.error('Failed to parse stage move payload:', error);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => setSelectedStageId(stage.id)}
                        >
                          {inlineStageEditId === stage.id ? (
                            <Input
                              size="small"
                              autoFocus
                              value={inlineStageName}
                              onChange={(event) => setInlineStageName(event.target.value)}
                              onPressEnter={() => void handleSaveInlineStageName(stage.id)}
                              onBlur={() => {
                                if (inlineStageEditId === stage.id) {
                                  void handleSaveInlineStageName(stage.id);
                                }
                              }}
                            />
                          ) : (
                            <>
                              <div className="truncate text-sm font-semibold text-slate-900">{stage.stage_name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                                <Tag>{stage.stage_code}</Tag>
                                <span>起始 Day {stage.start_day}</span>
                              </div>
                            </>
                          )}
                        </div>
                        <Space size={4}>
                          <Tooltip title="上移阶段">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowUpOutlined />}
                              disabled={stage.stage_order === Math.min(...stages.map((item) => item.stage_order))}
                              onClick={() => void handleMoveStage(stage.id, 'up')}
                            />
                          </Tooltip>
                          <Tooltip title="下移阶段">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowDownOutlined />}
                              disabled={stage.stage_order === Math.max(...stages.map((item) => item.stage_order))}
                              onClick={() => void handleMoveStage(stage.id, 'down')}
                            />
                          </Tooltip>
                          <Tooltip title="快速重命名">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setInlineStageEditId(stage.id);
                                setInlineStageName(stage.stage_name);
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="编辑阶段">
                            <Button type="text" size="small" icon={<ClusterOutlined />} onClick={() => openStageDrawer(stage)} />
                          </Tooltip>
                          <Tooltip title="新增工序">
                            <Button
                              type="text"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() => openCreateOperationModal({ stageId: stage.id })}
                            />
                          </Tooltip>
                        </Space>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <Tag color="blue">工序 {stats.total}</Tag>
                        {stats.unplaced > 0 ? <Tag color="orange">未落位 {stats.unplaced}</Tag> : null}
                        {stats.invalid > 0 ? <Tag color="red">异常 {stats.invalid}</Tag> : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {stageOperations.length ? (
                          stageOperations.map((operation) => (
                            <div
                              key={operation.id}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  'application/x-mfg8-process-op',
                                  JSON.stringify({ scheduleId: operation.id }),
                                );
                              }}
                              onDoubleClick={() => openEditOperationDrawer(operation)}
                              className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition-colors ${
                                Number(selectedOperationId) === Number(operation.id)
                                  ? 'border-sky-300 bg-sky-50'
                                  : 'border-slate-200 bg-white hover:border-sky-200'
                              }`}
                            >
                              <div className="min-w-0 flex-1" onClick={() => openEditOperationDrawer(operation)}>
                                <div className="truncate text-sm font-medium text-slate-800">{operation.operation_name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                                  <span>{operation.operation_code}</span>
                                  <span>Day {operation.operation_day}</span>
                                  <span>{operation.bindingStatus}</span>
                                </div>
                              </div>
                              <Space size={4}>
                                <Tooltip title="复制">
                                  <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => void handleCopyOperation(operation)} />
                                </Tooltip>
                                <Popconfirm
                                  title="删除当前工序？"
                                  description="删除后会移除该阶段操作安排。"
                                  okText="删除"
                                  cancelText="取消"
                                  onConfirm={() => void handleDeleteOperation(operation.id)}
                                >
                                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </Space>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-400">
                            该阶段还没有工序
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">未落位工序池</div>
              <Tag color="orange">{unplacedOperations.length}</Tag>
            </div>
            <List
              dataSource={showUnplacedOnly ? unplacedOperations : unplacedOperations.slice(0, 8)}
              locale={{ emptyText: '当前没有未落位工序' }}
              renderItem={(operation) => {
                const suggestions = operationSuggestions(operation).slice(0, 3);
                return (
                  <List.Item
                    key={operation.id}
                    className="!px-0"
                    actions={[
                      <Button key="edit" type="link" onClick={() => openEditOperationDrawer(operation)}>
                        编辑
                      </Button>,
                      suggestions[0] ? (
                        <Button
                          key="bind"
                          type="link"
                          onClick={() => void handleAssignNode(operation, suggestions[0].id)}
                        >
                          一键绑定
                        </Button>
                      ) : null,
                    ]}
                  >
                    <div
                      className="w-full rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-3"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-mfg8-process-op',
                          JSON.stringify({ scheduleId: operation.id }),
                        );
                      }}
                    >
                      <div className="text-sm font-medium text-slate-900">{operation.operation_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {operation.stage_name} / Day {operation.operation_day} / {operation.bindingReason || '拖到资源时间轴即可落位'}
                      </div>
                      {suggestions.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {suggestions.map((node) => (
                            <Tag key={node.id}>{node.nodeName}</Tag>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </List.Item>
                );
              }}
            />
            {unplacedOperations.length > 8 && !showUnplacedOnly ? (
              <Button type="link" className="!px-0" onClick={() => setShowUnplacedOnly(true)}>
                展开全部未落位工序
              </Button>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">校验摘要</div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowUnplacedOnly(true);
                  setShowIssuesOnly(false);
                  if (editor.validation.unplacedOperationIds[0]) {
                    focusOperation(editor.validation.unplacedOperationIds[0], { showUnplaced: true });
                  }
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <ExclamationCircleOutlined className="text-amber-500" />
                  未落位工序
                </span>
                <span className="text-lg font-semibold text-amber-700">{editor.validation.summary.unplacedCount}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIssuesOnly(true);
                  setShowUnplacedOnly(false);
                  if (editor.validation.invalidBindings[0]?.scheduleId) {
                    focusOperation(editor.validation.invalidBindings[0].scheduleId, { showIssues: true });
                  }
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left transition-colors hover:border-rose-300 hover:bg-rose-50"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <ExclamationCircleOutlined className="text-rose-500" />
                  绑定异常
                </span>
                <span className="text-lg font-semibold text-rose-700">{editor.validation.summary.invalidBindingCount}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIssuesOnly(true);
                  setShowUnplacedOnly(false);
                  if (editor.validation.resourceRuleMismatchIds[0]) {
                    focusOperation(editor.validation.resourceRuleMismatchIds[0], { showIssues: true });
                  }
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <NodeIndexOutlined className="text-orange-500" />
                  资源规则异常
                </span>
                <span className="text-lg font-semibold text-orange-700">
                  {editor.validation.summary.resourceRuleMismatchCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIssuesOnly(true);
                  setShowUnplacedOnly(false);
                  if (editor.validation.constraintConflicts[0]?.operationScheduleIds?.[0]) {
                    focusOperation(editor.validation.constraintConflicts[0].operationScheduleIds[0], {
                      showIssues: true,
                      openDrawer: true,
                    });
                  }
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left transition-colors hover:border-red-300 hover:bg-red-50"
              >
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <LinkOutlined className="text-red-500" />
                  约束冲突
                </span>
                <span className="text-lg font-semibold text-red-700">{editor.validation.summary.constraintConflictCount}</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Space wrap>
              <Segmented
                value={scope}
                onChange={(value) => setScope(value as ResourceNodeFilterScope)}
                options={[
                  { label: '已引用节点', value: 'referenced' },
                  { label: '部门域节点', value: 'department' },
                  { label: '全部节点', value: 'all' },
                ]}
              />
              <Input.Search
                allowClear
                placeholder="搜索节点 / 资源"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                style={{ width: 240 }}
              />
            </Space>

            <Space wrap>
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Switch checked={showUnplacedOnly} onChange={setShowUnplacedOnly} />
                仅看未落位
              </span>
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Switch checked={showIssuesOnly} onChange={setShowIssuesOnly} />
                仅看异常
              </span>
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Switch checked={showAllConstraints} onChange={setShowAllConstraints} />
                显示全部连接线
              </span>
              <Button onClick={() => setExpandedKeys(new Set(nodeList.map((node) => node.id)))}>展开全部</Button>
              <Button onClick={() => setExpandedKeys(new Set(filteredTree.map((node) => node.id)))}>折叠到根节点</Button>
              <Button icon={<CheckCircleOutlined />} loading={validating} onClick={() => void handleValidate()}>
                自动排程校验
              </Button>
              <Button onClick={resetViewportFilters}>恢复全部</Button>
              <Button icon={<UndoOutlined />} disabled={!lastMove} onClick={() => void handleUndoLastMove()}>
                撤销上次移动
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadEditor()}>
                刷新
              </Button>
            </Space>
          </div>

          <div className="flex items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-sm text-slate-500">缩放</span>
            <Slider min={10} max={28} step={2} value={hourWidth} onChange={setHourWidth} style={{ width: 180 }} />
            <Button onClick={onOpenNodes}>切换到节点管理</Button>
          </div>

          {showUnplacedOnly ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Empty
                description="当前处于“仅看未落位”模式，请在左侧未落位工序池中拖工序到资源时间轴。"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : !visibleRows.length ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Empty description="当前筛选条件下没有可展示的资源节点" />
            </div>
          ) : (
            <div className="overflow-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div style={{ minWidth: LEFT_PANEL_WIDTH + RESOURCE_TREE_WIDTH + timelineWidth }}>
                <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
                  <div style={{ display: 'flex' }}>
                    <div
                      className="sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                      style={{ width: RESOURCE_TREE_WIDTH }}
                    >
                      资源节点
                    </div>
                    <div style={{ width: timelineWidth }}>
                      <div className="flex border-b border-slate-200 bg-slate-50">
                        {Array.from({ length: totalDays }, (_, index) => {
                          const day = startDay + index;
                          return (
                            <div
                              key={`editor-day-${day}`}
                              className="border-r border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
                              style={{ width: 24 * hourWidth }}
                            >
                              Day {day}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex bg-white">
                        {Array.from({ length: totalDays * 24 }, (_, index) => (
                          <div
                            key={`editor-hour-${index}`}
                            className="border-r border-slate-100 px-0.5 py-1 text-center text-[10px] text-slate-400"
                            style={{ width: hourWidth }}
                          >
                            {index % 4 === 0 ? index % 24 : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex' }}>
                  <div style={{ width: RESOURCE_TREE_WIDTH }}>
                    {visibleRows.map((row) => (
                      <div
                        key={`tree-row-${row.node.id}`}
                        className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3"
                        style={{ width: RESOURCE_TREE_WIDTH, minHeight: ROW_HEIGHT }}
                      >
                        <div className="flex items-center gap-2" style={{ paddingLeft: row.depth * 18 }}>
                          {!row.isLeaf ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedKeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.node.id)) {
                                    next.delete(row.node.id);
                                  } else {
                                    next.add(row.node.id);
                                  }
                                  return next;
                                })
                              }
                              className="h-6 w-6 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-500"
                            >
                              {row.expanded ? '-' : '+'}
                            </button>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">
                              <ApartmentOutlined />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">{row.node.nodeName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                              <Tag>{row.node.nodeClass}</Tag>
                              {row.node.boundResourceCode ? <span>{row.node.boundResourceCode}</span> : <span>未挂资源</span>}
                              {!row.node.isActive ? <Tag color="red">停用</Tag> : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="relative" style={{ width: timelineWidth }}>
                    <svg
                      width={timelineWidth}
                      height={visibleRows.length * ROW_HEIGHT}
                      className="pointer-events-none absolute inset-0 z-10"
                    >
                      {visibleConstraintLinks.map((link) => {
                        const from = barPositions.get(Number(link.fromScheduleId));
                        const to = barPositions.get(Number(link.toScheduleId));
                        if (!from || !to) {
                          return null;
                        }
                        const startX = from.x + from.width;
                        const startY = from.y + from.height / 2;
                        const endX = to.x;
                        const endY = to.y + to.height / 2;
                        const midX = startX + (endX - startX) / 2;
                        const stroke =
                          link.constraintLevel && Number(link.constraintLevel) > 1 ? '#f59e0b' : '#ef4444';
                        return (
                          <path
                            key={`constraint-${link.constraintId}`}
                            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={2}
                            strokeDasharray={link.constraintType === 2 ? '4 4' : undefined}
                            opacity={0.7}
                          />
                        );
                      })}
                    </svg>

                    {visibleRows.map((row, rowIndex) => {
                      const bars = getRowBars(row);
                      return (
                        <div
                          key={`timeline-row-${row.node.id}`}
                          className={`relative border-b border-slate-100 ${row.isLeaf ? 'cursor-crosshair' : ''}`}
                          style={{
                            width: timelineWidth,
                            height: ROW_HEIGHT,
                            backgroundImage: `linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px)`,
                            backgroundSize: `${hourWidth}px 100%`,
                            backgroundColor: row.isLeaf ? '#fff' : '#f8fafc',
                          }}
                          onDragOver={(event) => {
                            if (row.isLeaf) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={(event) => void handleDropOnLeafRow(event, row)}
                          onDoubleClick={(event) => {
                            if (!row.isLeaf) {
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                            const absoluteStartHour = startDay * 24 + Math.floor(offsetX / hourWidth);
                            const stageId = selectedStageId ?? stages[0]?.id ?? null;
                            if (!stageId) {
                              message.warning('请先创建并选择阶段');
                              return;
                            }
                            const stage = stages.find((item) => Number(item.id) === Number(stageId));
                            if (!stage) {
                              return;
                            }
                            const timing = buildSchedulePayloadFromAbsoluteHour(
                              stage.start_day,
                              absoluteStartHour,
                              4,
                            );
                            openCreateOperationModal({
                              stageId,
                              resourceNodeId: row.node.id,
                              absoluteStartHour,
                              operationDay: timing.operationDay,
                              recommendedTime: timing.recommendedTime,
                              recommendedDayOffset: timing.recommendedDayOffset,
                              windowStartTime: timing.windowStartTime,
                              windowStartDayOffset: timing.windowStartDayOffset,
                              windowEndTime: timing.windowEndTime,
                              windowEndDayOffset: timing.windowEndDayOffset,
                            });
                          }}
                        >
                          {bars.map((bar) => {
                            const left = (bar.startHour - startDay * 24) * hourWidth;
                            const width = Math.max((bar.endHour - bar.startHour) * hourWidth, 24);
                            return (
                              <Tooltip
                                key={bar.key}
                                title={`${bar.title}${bar.subtitle ? ` / ${bar.subtitle}` : ''} / ${bar.operation.bindingStatus}`}
                              >
                                <button
                                  id={`resource-editor-operation-${bar.operation.id}`}
                                  type="button"
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                      'application/x-mfg8-process-op',
                                      JSON.stringify({ scheduleId: bar.operation.id }),
                                    );
                                  }}
                                  onClick={() => openEditOperationDrawer(bar.operation)}
                                  className="absolute top-2 z-20 rounded-xl px-2 py-1 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5"
                                  style={{
                                    left,
                                    width,
                                    height: ROW_HEIGHT - 16,
                                    background:
                                      bar.statusTone === 'danger'
                                        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                                        : bar.statusTone === 'warning'
                                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                          : bar.color,
                                    border: bar.hasShareGroup ? '2px dashed rgba(255,255,255,0.85)' : 'none',
                                    opacity: 0.95,
                                  }}
                                >
                                  <div className="truncate text-xs font-semibold">{bar.title}</div>
                                  <div className="mt-1 flex items-center gap-1 text-[10px] opacity-85">
                                    <span>{bar.operation.stage_name}</span>
                                    {bar.hasShareGroup ? <span>共享组</span> : null}
                                  </div>
                                </button>
                              </Tooltip>
                            );
                          })}

                          {row.isLeaf && bars.length === 0 ? (
                            <div className="absolute inset-y-0 left-3 flex items-center text-[11px] text-slate-300">
                              双击创建工序，或把左侧工序拖到这里
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        title={stageDraft?.id ? '编辑阶段' : '新增阶段'}
        open={stageDrawerOpen}
        centered
        width={640}
        onCancel={closeStageDrawer}
        maskClosable={false}
        footer={[
          <Button key="cancel" onClick={closeStageDrawer}>
            取消
          </Button>,
          <Button key="save" type="primary" loading={stageSaving} onClick={() => void handleSaveStage()}>
            保存阶段
          </Button>,
        ]}
      >
        {stageDraft ? (
          <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">阶段名称</label>
              <Input
                value={stageDraft.stageName}
                onChange={(event) => setStageDraft((current) => (current ? { ...current, stageName: event.target.value } : current))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">阶段顺序</label>
                <InputNumber
                  min={1}
                  value={stageDraft.stageOrder}
                  onChange={(value) =>
                    setStageDraft((current) => (current ? { ...current, stageOrder: Number(value ?? 1) } : current))
                  }
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">开始天</label>
                <InputNumber
                  min={0}
                  value={stageDraft.startDay}
                  onChange={(value) =>
                    setStageDraft((current) => (current ? { ...current, startDay: Number(value ?? 0) } : current))
                  }
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">说明</label>
              <Input.TextArea
                rows={4}
                value={stageDraft.description}
                onChange={(event) =>
                  setStageDraft((current) => (current ? { ...current, description: event.target.value } : current))
                }
              />
            </div>
            {stageDraft.id ? (
              <Popconfirm
                title="删除当前阶段？"
                description="删除后将移除该阶段下所有工序安排。"
                okText="删除"
                cancelText="取消"
                onConfirm={() => void handleDeleteStage(stageDraft.id!)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除阶段
                </Button>
              </Popconfirm>
            ) : null}
            </Space>
          </div>
        ) : null}
      </Modal>

      <TemplateOperationCreateModal
        open={createOperationModalOpen}
        templateId={templateId}
        templateName={editor.template.template_name}
        templateTeamId={templateTeamId}
        stages={stages}
        operations={operations}
        resourceNodes={nodeList}
        operationLibrary={editor.operationLibrary ?? []}
        shareGroups={editor.shareGroups ?? []}
        capabilities={editor.capabilities}
        context={createOperationContext}
        onCancel={closeCreateOperationModal}
        onCreated={handleCreatedOperation}
      />

      <Modal
        title={
          selectedOperation ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">编辑工序</div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedOperation.operation_code} / {selectedOperation.operation_name}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Tag color="blue">{selectedOperation.stage_name}</Tag>
                  <Tag color={selectedOperation.bindingStatus === 'BOUND' ? 'green' : 'orange'}>
                    {selectedOperation.bindingStatus}
                  </Tag>
                  {selectedOperation.standard_time ? <Tag>标准时长 {selectedOperation.standard_time}h</Tag> : null}
                  {selectedOperation.required_people ? <Tag>所需人数 {selectedOperation.required_people}</Tag> : null}
                </div>
              </div>
              <Button onClick={() => setOperationAdvancedDrawerOpen(true)}>高级配置</Button>
            </div>
          ) : (
            '编辑工序'
          )
        }
        open={operationDrawerOpen}
        centered
        width="min(1180px, calc(100vw - 24px))"
        onCancel={closeOperationDrawer}
        maskClosable={false}
        footer={[
          <Button key="cancel" onClick={closeOperationDrawer}>
            取消
          </Button>,
          <Button key="save" type="primary" loading={operationSaving} onClick={() => void handleSaveOperation()}>
            保存工序
          </Button>,
        ]}
      >
        {operationDraft ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2.1fr)_320px]" style={{ maxHeight: '76vh' }}>
            <div className="space-y-4 overflow-y-auto pr-1">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-900">核心编辑</div>
                  <div className="mt-1 text-xs text-slate-500">仅编辑所属阶段、资源落位和排程时间，高级逻辑在右侧抽屉维护。</div>
                </div>
                {selectedOperation ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">
                      {selectedOperation.operation_code} / {selectedOperation.operation_name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Tag>标准时长 {selectedOperation.standard_time ?? '-'}h</Tag>
                      <Tag>所需人数 {selectedOperation.required_people ?? '-'}</Tag>
                      {selectedOperation.resource_summary ? <Tag color="cyan">{selectedOperation.resource_summary}</Tag> : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <OperationCoreForm
                    value={{
                      stageId: operationDraft.stageId,
                      resourceNodeId: operationDraft.resourceNodeId,
                      operationDay: operationDraft.operationDay,
                      recommendedTime: operationDraft.recommendedTime,
                      recommendedDayOffset: operationDraft.recommendedDayOffset,
                      windowMode: operationDraft.windowMode,
                      windowStartTime: operationDraft.windowStartTime,
                      windowStartDayOffset: operationDraft.windowStartDayOffset,
                      windowEndTime: operationDraft.windowEndTime,
                      windowEndDayOffset: operationDraft.windowEndDayOffset,
                    }}
                    stages={stages}
                    leafNodes={leafNodes}
                    durationHours={operationDraft.durationHours}
                    onChange={(patch) =>
                      setOperationDraft((current) =>
                        current
                          ? {
                              ...current,
                              stageId: patch.stageId === undefined ? current.stageId : patch.stageId,
                              resourceNodeId:
                                patch.resourceNodeId === undefined ? current.resourceNodeId : patch.resourceNodeId,
                              operationDay: patch.operationDay ?? current.operationDay,
                              recommendedTime: patch.recommendedTime ?? current.recommendedTime,
                              recommendedDayOffset: patch.recommendedDayOffset ?? current.recommendedDayOffset,
                              windowMode: patch.windowMode ?? current.windowMode,
                              windowStartTime: patch.windowStartTime ?? current.windowStartTime,
                              windowStartDayOffset: patch.windowStartDayOffset ?? current.windowStartDayOffset,
                              windowEndTime: patch.windowEndTime ?? current.windowEndTime,
                              windowEndDayOffset: patch.windowEndDayOffset ?? current.windowEndDayOffset,
                            }
                          : current,
                      )
                    }
                  />
                </div>

                {selectedOperation?.bindingReason ? (
                  <Alert className="mt-4" type="warning" showIcon message={selectedOperation.bindingReason} />
                ) : null}
              </section>
            </div>

            <aside className="space-y-4 overflow-y-auto pl-1">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">编辑预览</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                    <span>阶段</span>
                    <span className="font-medium text-slate-900">{editDraftStage?.stage_name ?? '未选择'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                    <span>资源节点</span>
                    <span className="font-medium text-slate-900">{editDraftNode?.nodeName ?? '未绑定'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                    <span>推荐开始</span>
                    <span className="font-medium text-slate-900">
                      Day {operationDraft.operationDay} / {formatHourLabel(operationDraft.recommendedTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-3">
                    <span>时间窗</span>
                    <span className="font-medium text-slate-900">
                      {formatHourLabel(operationDraft.windowStartTime)} - {formatHourLabel(operationDraft.windowEndTime)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">状态与诊断</div>
                <div className="mt-3 space-y-2">
                  <Alert
                    type={selectedOperation?.bindingStatus === 'BOUND' ? 'success' : 'warning'}
                    showIcon
                    message={`绑定状态：${selectedOperation?.bindingStatus ?? 'UNKNOWN'}`}
                    description={selectedOperation?.bindingReason ?? '当前默认绑定有效'}
                  />
                  {editDraftIssueGroups.blocking.length ? (
                    editDraftIssueGroups.blocking.map((issue) => <Alert key={`block-${issue}`} type="error" showIcon message={issue} />)
                  ) : null}
                  {editDraftIssueGroups.warnings.length ? (
                    editDraftIssueGroups.warnings.map((issue) => <Alert key={`warn-${issue}`} type="warning" showIcon message={issue} />)
                  ) : null}
                  {!editDraftIssueGroups.blocking.length && !editDraftIssueGroups.warnings.length ? (
                    <Alert type="success" showIcon message="当前编辑内容没有发现明显问题" />
                  ) : null}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">快捷操作</div>
                <div className="mt-3 space-y-2">
                  <Button block onClick={() => setOperationAdvancedDrawerOpen(true)}>
                    打开高级配置
                  </Button>
                  {selectedOperation ? (
                    <Button block icon={<PlusOutlined />} onClick={() => void handleCopyOperation(selectedOperation)}>
                      复制当前工序
                    </Button>
                  ) : null}
                  <Button block onClick={() => void handleValidate()}>
                    重新校验模板
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </Modal>

      <Drawer
        title="高级配置"
        open={operationDrawerOpen && operationAdvancedDrawerOpen}
        onClose={() => setOperationAdvancedDrawerOpen(false)}
        width="min(920px, calc(100vw - 24px))"
        destroyOnClose={false}
      >
        <Tabs
          activeKey={operationAdvancedTab}
          onChange={(key) => setOperationAdvancedTab(key as OperationAdvancedTabKey)}
          items={[
            {
              key: 'rules',
              label: '资源规则',
              children: selectedOperation ? (
                editor.capabilities.resourceRulesEnabled ? (
                  <TemplateResourceRulesTabContent
                    scheduleId={selectedOperation.id}
                    visible={operationDrawerOpen && operationAdvancedDrawerOpen}
                    onRulesChanged={loadEditor}
                  />
                ) : (
                  <Alert type="info" showIcon message="模板资源规则功能当前未启用" />
                )
              ) : null,
            },
            {
              key: 'constraints',
              label: '约束',
              children: selectedOperation ? (
                <OperationConstraintsPanel
                  scheduleId={selectedOperation.id}
                  constraints={selectedOperationConstraints}
                  availableOperations={availableConstraintOperations}
                  onConstraintAdded={loadEditor}
                  onConstraintUpdated={loadEditor}
                  onConstraintDeleted={loadEditor}
                />
              ) : null,
            },
            {
              key: 'share',
              label: '共享组',
              children: (
                <div className="space-y-4">
                  <div>
                    <div className="mb-3 text-sm font-semibold text-slate-800">当前共享组</div>
                    {currentOperationShareGroups.length ? (
                      <div className="space-y-2">
                        {currentOperationShareGroups.map((group) => (
                          <div
                            key={group.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-900">{group.groupName}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {group.shareMode} / 成员 {group.memberCount}
                              </div>
                            </div>
                            <Button type="link" danger onClick={() => void handleRemoveShareGroup(group.id)}>
                              移出
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工序还没有加入共享组" />
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-700">加入已有共享组</div>
                    <Space.Compact style={{ width: '100%' }}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        value={assignShareGroupId ?? undefined}
                        onChange={(value) => setAssignShareGroupId(value ?? null)}
                        options={existingShareGroups.map((group) => ({
                          value: group.id,
                          label: `${group.groupName} / ${group.shareMode}`,
                        }))}
                        style={{ width: '100%' }}
                      />
                      <Button type="primary" onClick={() => void handleAssignShareGroup()}>
                        加入
                      </Button>
                    </Space.Compact>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 text-sm font-semibold text-slate-700">新建共享组</div>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input
                        placeholder="共享组名称"
                        value={shareGroupName}
                        onChange={(event) => setShareGroupName(event.target.value)}
                      />
                      <Select
                        value={shareGroupMode}
                        onChange={(value) => setShareGroupMode(value)}
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
                        placeholder="选择至少一个额外工序"
                        value={shareGroupMembers}
                        onChange={(value) => setShareGroupMembers(value)}
                        options={operations
                          .filter((item) => Number(item.id) !== Number(selectedOperation?.id))
                          .map((item) => ({
                            value: item.id,
                            label: `${item.stage_name} / ${item.operation_name}`,
                          }))}
                        style={{ width: '100%' }}
                      />
                      <Button type="primary" onClick={() => void handleCreateShareGroup()}>
                        创建并加入
                      </Button>
                    </Space>
                  </div>
                </div>
              ),
            },
            {
              key: 'danger',
              label: '危险操作',
              children: (
                <div className="space-y-3">
                  <Button block onClick={() => void handleValidate()}>
                    重新校验模板
                  </Button>
                  {selectedOperation ? (
                    <Popconfirm
                      title="删除当前工序？"
                      description="删除后将移除该阶段操作安排。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void handleDeleteOperation(selectedOperation.id)}
                    >
                      <Button block danger icon={<DeleteOutlined />}>
                        删除工序
                      </Button>
                    </Popconfirm>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </section>
  );
};

export default TemplateResourceEditorTab;
