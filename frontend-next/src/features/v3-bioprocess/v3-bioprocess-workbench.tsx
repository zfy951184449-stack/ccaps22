"use client";

import { Badge } from "@/design-system/primitives/badge";
import { Button } from "@/design-system/primitives/button";
import { EmptyState } from "@/design-system/primitives/empty-state";
import { Panel } from "@/design-system/primitives/panel";
import { Tabs } from "@/design-system/primitives/tabs";
import { PageHeader } from "@/design-system/patterns/page-header";
import { cn } from "@/lib/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AuxOperationBar,
  DraftMainOperationOverride,
  DraftNodeBindingOverride,
  DraftStateSegment,
  EquipmentStateValue,
  EquipmentTimelineRow,
  LegacyResource,
  MainOperationBar,
  RiskMarker,
  StateBandSegment,
  TimelineContextWindow,
  TimelineZoomLevel,
  V3TemplateDetail,
} from "./contracts";
import {
  createLegacyResource,
  getLegacyResourceNodes,
  getLegacyResources,
  getMaintenanceWindows,
  getV3SyncStatus,
  getV3TemplateDetail,
  getV3Templates,
  previewV3Projection,
  syncV3MasterData,
  updateLegacyResourceNode,
  v3BioprocessQueryKeys,
} from "./service";

type OperationLikeBar = MainOperationBar | AuxOperationBar;
type WorkbenchTab = "sandbox" | "equipment" | "logic";

type SelectionState =
  | {
      body: string;
      eyebrow: string;
      tone: "accent" | "warning" | "danger" | "success" | "neutral";
      title: string;
      type: "context" | "operation" | "risk";
    }
  | {
      segmentKey: string;
      type: "manual-state";
    }
  | null;

type TimelineConfig = {
  majorMinutes: number;
  minorMinutes: number;
  pixelsPerMinute: number;
};

type TimelineHeaderCell = {
  key: string;
  label: string;
  left: number;
  width: number;
};

type SandboxDraft = {
  draftMainOperationOverrides: DraftMainOperationOverride[];
  draftNodeBindings: DraftNodeBindingOverride[];
  draftStateSegments: DraftStateSegment[];
  pinnedEquipmentCodes: string[];
};

const emptyDraft = (): SandboxDraft => ({
  draftMainOperationOverrides: [],
  draftNodeBindings: [],
  draftStateSegments: [],
  pinnedEquipmentCodes: [],
});

const workbenchTabOptions: Array<{
  description: string;
  label: string;
  value: WorkbenchTab;
}> = [
  {
    value: "sandbox",
    label: "沙盘",
    description: "统一甘特图 + 本地草稿 + 手动重算",
  },
  {
    value: "equipment",
    label: "设备管理",
    description: "正式设备、节点绑定和 pin 到沙盘",
  },
  {
    value: "logic",
    label: "工艺逻辑",
    description: "主工艺节点、设备覆盖和触发规则摘要",
  },
];

const zoomOptions: Array<{
  description: string;
  label: string;
  value: TimelineZoomLevel;
}> = [
  { value: "week", label: "周 / 天", description: "纵览全局冲突与状态分布" },
  { value: "day", label: "天 / 小时", description: "默认工作层，查看日内承接关系" },
  { value: "hour", label: "小时 / 15分", description: "检查切换与辅助操作节拍" },
  { value: "minute", label: "小时 / 5分", description: "微调层，5 分钟吸附粒度" },
];

const stateOptions: Array<{
  label: string;
  value: EquipmentStateValue;
}> = [
  { value: "setup", label: "setup" },
  { value: "media_holding", label: "media_holding" },
  { value: "processing", label: "processing" },
  { value: "dirty_hold", label: "dirty_hold" },
  { value: "cleaning_cip", label: "cleaning_cip" },
  { value: "sterilizing_sip", label: "sterilizing_sip" },
  { value: "clean_hold", label: "clean_hold" },
  { value: "changeover", label: "changeover" },
  { value: "maintenance", label: "maintenance" },
];

const timelineConfigByZoom: Record<TimelineZoomLevel, TimelineConfig> = {
  week: {
    majorMinutes: 24 * 60,
    minorMinutes: 6 * 60,
    pixelsPerMinute: 0.1,
  },
  day: {
    majorMinutes: 12 * 60,
    minorMinutes: 60,
    pixelsPerMinute: 0.35,
  },
  hour: {
    majorMinutes: 60,
    minorMinutes: 15,
    pixelsPerMinute: 1.3,
  },
  minute: {
    majorMinutes: 30,
    minorMinutes: 5,
    pixelsPerMinute: 3.8,
  },
};

const stateToneClassName: Record<StateBandSegment["state_code"], string> = {
  setup: "bg-[rgba(191,124,45,0.18)] text-[#8b5f18]",
  media_holding: "bg-[rgba(11,106,162,0.16)] text-[var(--pl-accent-strong)]",
  processing: "bg-[rgba(24,121,78,0.2)] text-[var(--pl-success)]",
  dirty_hold: "bg-[rgba(180,35,24,0.16)] text-[var(--pl-danger)]",
  cleaning_cip: "bg-[rgba(154,103,0,0.16)] text-[var(--pl-warning)]",
  sterilizing_sip: "bg-[rgba(123,92,179,0.18)] text-[#5d438f]",
  clean_hold: "bg-[rgba(42,121,126,0.16)] text-[#246d71]",
  changeover: "bg-[rgba(112,120,138,0.16)] text-[#4c5566]",
  maintenance: "bg-[rgba(180,35,24,0.12)] text-[var(--pl-danger)]",
};

const riskToneClassName: Record<RiskMarker["severity"], string> = {
  INFO: "border-[rgba(11,106,162,0.28)] bg-[rgba(11,106,162,0.08)] text-[var(--pl-accent-strong)]",
  WARNING:
    "border-[rgba(154,103,0,0.26)] bg-[rgba(154,103,0,0.08)] text-[var(--pl-warning)]",
  BLOCKING:
    "border-[rgba(180,35,24,0.3)] bg-[rgba(180,35,24,0.08)] text-[var(--pl-danger)]",
};

const contextWindowClassName: Record<
  TimelineContextWindow["window_type"],
  string
> = {
  MAINTENANCE:
    "border-[rgba(180,35,24,0.18)] bg-[repeating-linear-gradient(135deg,rgba(180,35,24,0.08),rgba(180,35,24,0.08)_8px,transparent_8px,transparent_16px)]",
  EXISTING_ASSIGNMENT:
    "border-[rgba(11,106,162,0.16)] bg-[repeating-linear-gradient(135deg,rgba(11,106,162,0.05),rgba(11,106,162,0.05)_8px,transparent_8px,transparent_16px)]",
};

const operationBarClassName = {
  MAIN:
    "border-[rgba(11,106,162,0.22)] bg-[linear-gradient(135deg,rgba(11,106,162,0.14),rgba(11,106,162,0.28))] text-[var(--pl-text-primary)]",
  AUXILIARY:
    "border-[rgba(154,103,0,0.22)] bg-[linear-gradient(135deg,rgba(154,103,0,0.14),rgba(154,103,0,0.26))] text-[var(--pl-text-primary)]",
};

const headerFormatterByZoom: Record<
  TimelineZoomLevel,
  {
    major: Intl.DateTimeFormat;
    minor: Intl.DateTimeFormat;
  }
> = {
  week: {
    major: new Intl.DateTimeFormat("zh-CN", {
      month: "short",
      day: "numeric",
      weekday: "short",
    }),
    minor: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  },
  day: {
    major: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
    }),
    minor: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  },
  hour: {
    major: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    minor: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  },
  minute: {
    major: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    minor: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  },
};

const controlClassName =
  "h-11 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 text-sm text-[var(--pl-text-primary)] shadow-[var(--pl-shadow-soft)] outline-none transition-colors focus:border-[var(--pl-accent)]";

const storageKeyPrefix = "v3-bioprocess-draft";

function parseDateTime(value: string) {
  return new Date(value.replace(" ", "T"));
}

function formatDateTime(value: Date) {
  const pad = (segment: number) => String(segment).padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function toDatetimeLocalValue(value: Date) {
  const pad = (segment: number) => String(segment).padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function alignToNextHour(value: Date) {
  const next = new Date(value.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function diffMinutes(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (60 * 1000);
}

function formatRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(parseDateTime(start))} - ${formatter.format(parseDateTime(end))}`;
}

function formatSyncStatus(
  status: "RUNNING" | "SUCCESS" | "FAILED" | null,
  storageMode: "schema" | "fallback" | undefined,
) {
  if (storageMode === "fallback") {
    return { label: "Fallback 模式", tone: "warning" as const };
  }
  if (status === "RUNNING") {
    return { label: "同步中", tone: "warning" as const };
  }
  if (status === "SUCCESS") {
    return { label: "已同步", tone: "success" as const };
  }
  if (status === "FAILED") {
    return { label: "同步失败", tone: "danger" as const };
  }

  return { label: "未同步", tone: "neutral" as const };
}

function formatDomainLabel(domain: "USP" | "DSP" | "SPI" | "CROSS") {
  if (domain === "CROSS") {
    return "Cross";
  }

  return domain;
}

function buildTimelineCells(
  zoomLevel: TimelineZoomLevel,
  horizonStart: Date,
  horizonEnd: Date,
  stepMinutes: number,
  pixelsPerMinute: number,
  formatter: Intl.DateTimeFormat,
) {
  const cells: TimelineHeaderCell[] = [];
  let cursor = new Date(horizonStart.getTime());
  let index = 0;

  while (cursor < horizonEnd) {
    const cellEnd = addMinutes(cursor, stepMinutes);
    const boundedEnd = cellEnd > horizonEnd ? horizonEnd : cellEnd;
    const left = diffMinutes(horizonStart, cursor) * pixelsPerMinute;
    const width = diffMinutes(cursor, boundedEnd) * pixelsPerMinute;

    cells.push({
      key: `${zoomLevel}-${stepMinutes}-${index}`,
      label: formatter.format(cursor),
      left,
      width,
    });

    cursor = boundedEnd;
    index += 1;
  }

  return cells;
}

function summarizeAuxOperations(
  operations: AuxOperationBar[],
  zoomLevel: TimelineZoomLevel,
) {
  if (zoomLevel !== "week") {
    return operations;
  }

  const grouped = new Map<string, AuxOperationBar[]>();

  operations.forEach((operation) => {
    const date = parseDateTime(operation.start_datetime);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(operation);
    grouped.set(key, bucket);
  });

  return [...grouped.entries()].map(([key, group]) => {
    if (group.length === 1) {
      return group[0];
    }

    const sorted = [...group].sort(
      (left, right) =>
        parseDateTime(left.start_datetime).getTime() -
        parseDateTime(right.start_datetime).getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    return {
      ...first,
      operation_key: `SUMMARY__${key}`,
      operation_name: `${group.length}项辅助`,
      start_datetime: first.start_datetime,
      end_datetime: last.end_datetime,
      metadata: {
        ...first.metadata,
        summary_count: group.length,
      },
    };
  });
}

function buildSelectionFromOperation(operation: OperationLikeBar): SelectionState {
  return {
    eyebrow:
      operation.role === "MAIN"
        ? "主工序"
        : operation.generator_package_code
          ? `操作包 ${operation.generator_package_code}`
          : "触发辅助工序",
    title: operation.operation_name,
    body: `${formatRange(operation.start_datetime, operation.end_datetime)} | ${operation.equipment_code ?? "未绑定"}${operation.window_start_datetime && operation.window_end_datetime ? ` | 窗口 ${formatRange(operation.window_start_datetime, operation.window_end_datetime)}` : ""}`,
    tone: operation.role === "MAIN" ? "accent" : "warning",
    type: "operation",
  };
}

function buildSelectionFromRisk(risk: RiskMarker): SelectionState {
  return {
    eyebrow: `风险 ${risk.risk_type}`,
    title: risk.message,
    body: `${risk.equipment_code ?? risk.material_code ?? "未指派对象"}${risk.window_start_datetime && risk.window_end_datetime ? ` | ${formatRange(risk.window_start_datetime, risk.window_end_datetime)}` : ""}`,
    tone:
      risk.severity === "BLOCKING"
        ? "danger"
        : risk.severity === "WARNING"
          ? "warning"
          : "accent",
    type: "risk",
  };
}

function buildSelectionFromContextWindow(
  window: TimelineContextWindow,
): SelectionState {
  return {
    eyebrow: window.window_type === "MAINTENANCE" ? "维护窗口" : "既有占用",
    title: window.label,
    body: formatRange(window.start_datetime, window.end_datetime),
    tone: window.window_type === "MAINTENANCE" ? "danger" : "accent",
    type: "context",
  };
}

function toStorageKey(
  templateId: number | null,
  plannedStartInput: string,
  horizonDays: number,
) {
  if (!templateId) {
    return null;
  }

  return `${storageKeyPrefix}:${templateId}:${plannedStartInput}:${horizonDays}`;
}

function loadDraft(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") {
    return emptyDraft();
  }

  try {
    const payload = window.localStorage.getItem(storageKey);
    if (!payload) {
      return emptyDraft();
    }

    const parsed = JSON.parse(payload) as Partial<SandboxDraft>;
    return {
      draftMainOperationOverrides: Array.isArray(
        parsed.draftMainOperationOverrides,
      )
        ? parsed.draftMainOperationOverrides
        : [],
      draftNodeBindings: Array.isArray(parsed.draftNodeBindings)
        ? parsed.draftNodeBindings
        : [],
      draftStateSegments: Array.isArray(parsed.draftStateSegments)
        ? parsed.draftStateSegments
        : [],
      pinnedEquipmentCodes: Array.isArray(parsed.pinnedEquipmentCodes)
        ? parsed.pinnedEquipmentCodes
        : [],
    };
  } catch {
    return emptyDraft();
  }
}

function serializeDraft(draft: SandboxDraft) {
  return JSON.stringify({
    draftMainOperationOverrides: [...draft.draftMainOperationOverrides].sort(
      (left, right) => left.node_key.localeCompare(right.node_key, "zh-CN"),
    ),
    draftNodeBindings: [...draft.draftNodeBindings].sort((left, right) =>
      left.node_key.localeCompare(right.node_key, "zh-CN"),
    ),
    draftStateSegments: [...draft.draftStateSegments].sort((left, right) =>
      (left.segment_key ?? "").localeCompare(right.segment_key ?? "", "zh-CN"),
    ),
    pinnedEquipmentCodes: [...draft.pinnedEquipmentCodes].sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    ),
  });
}

function buildPreviewRequest(
  templateId: number,
  plannedStartInput: string,
  horizonDays: number,
  draft: SandboxDraft,
) {
  return {
    template_id: templateId,
    planned_start_datetime: plannedStartInput.replace("T", " ") + ":00",
    horizon_days: horizonDays,
    visible_equipment_codes: draft.pinnedEquipmentCodes,
    draft_state_segments: draft.draftStateSegments,
    draft_node_bindings: draft.draftNodeBindings,
    draft_main_operation_overrides: draft.draftMainOperationOverrides,
    persist_run: false,
  } as const;
}

function buildDraftMainOverrideMap(
  overrides: DraftMainOperationOverride[],
) {
  return new Map(overrides.map((override) => [override.node_key, override]));
}

function buildDraftStateSegmentMap(segments: DraftStateSegment[]) {
  const grouped = new Map<string, DraftStateSegment[]>();

  segments.forEach((segment) => {
    const bucket = grouped.get(segment.equipment_code) ?? [];
    bucket.push(segment);
    grouped.set(segment.equipment_code, bucket);
  });

  return grouped;
}

function buildResourceMap(resources: LegacyResource[]) {
  return new Map(resources.map((resource) => [resource.resource_code, resource]));
}

function findNodeKey(operation: MainOperationBar) {
  const nodeKey = operation.metadata.node_key;
  return typeof nodeKey === "string" ? nodeKey : null;
}

function applyDraftMainOverride(
  operation: MainOperationBar,
  override: DraftMainOperationOverride | undefined,
) {
  if (!override) {
    return operation;
  }

  const originalStart = parseDateTime(operation.start_datetime);
  const originalEnd = parseDateTime(operation.end_datetime);
  const nextStart = parseDateTime(override.start_datetime);
  const nextEnd = addMinutes(nextStart, diffMinutes(originalStart, originalEnd));

  return {
    ...operation,
    start_datetime: formatDateTime(nextStart),
    end_datetime: formatDateTime(nextEnd),
    is_user_adjusted: true,
  };
}

function toManualStateBandSegment(
  segment: DraftStateSegment,
  resourcesByCode: Map<string, LegacyResource>,
  fallbackMode: EquipmentTimelineRow["equipment_mode"],
): StateBandSegment {
  const resource = resourcesByCode.get(segment.equipment_code);
  return {
    segment_key:
      segment.segment_key ||
      `DRAFT_STATE__${segment.equipment_code}__${segment.start_datetime}`,
    equipment_code: segment.equipment_code,
    equipment_name: resource?.resource_name ?? segment.equipment_code,
    equipment_mode: segment.equipment_mode ?? fallbackMode,
    state_code: segment.state_code,
    source_mode: "CONFIRMED",
    start_datetime: segment.start_datetime,
    end_datetime: segment.end_datetime,
    metadata: {
      ...(segment.metadata ?? {}),
      origin: "manual_draft",
      locked: segment.locked === true,
    },
  };
}

function buildVisibleRows(args: {
  previewRows: EquipmentTimelineRow[] | undefined;
  draft: SandboxDraft;
  resources: LegacyResource[];
  selectedTemplate: V3TemplateDetail | undefined;
}) {
  const { draft, previewRows, resources, selectedTemplate } = args;
  const resourcesByCode = buildResourceMap(resources);
  const rowMap = new Map<string, EquipmentTimelineRow>();
  const mainOverrideByNodeKey = buildDraftMainOverrideMap(
    draft.draftMainOperationOverrides,
  );
  const draftSegmentsByEquipment = buildDraftStateSegmentMap(
    draft.draftStateSegments,
  );

  (previewRows ?? []).forEach((row) => {
    rowMap.set(row.equipment_code, {
      ...row,
      main_operations: row.main_operations.map((operation) => {
        const nodeKey = findNodeKey(operation);
        return applyDraftMainOverride(
          operation,
          nodeKey ? mainOverrideByNodeKey.get(nodeKey) : undefined,
        );
      }),
      aux_operations: [...row.aux_operations],
      state_segments: row.state_segments.filter(
        (segment) => segment.metadata.origin !== "manual_draft",
      ),
      risk_markers: [...row.risk_markers],
      context_windows: [...row.context_windows],
    });
  });

  const alwaysVisibleCodes = [
    ...(selectedTemplate?.template.main_equipment_codes ?? []),
    ...draft.pinnedEquipmentCodes,
    ...draft.draftStateSegments.map((segment) => segment.equipment_code),
  ];

  [...new Set(alwaysVisibleCodes.filter(Boolean))].forEach((equipmentCode) => {
    if (rowMap.has(equipmentCode)) {
      return;
    }

    const resource = resourcesByCode.get(equipmentCode);
    rowMap.set(equipmentCode, {
      equipment_code: equipmentCode,
      equipment_name: resource?.resource_name ?? equipmentCode,
      equipment_mode: "UNKNOWN",
      domain_code:
        selectedTemplate?.template.domain_code === "USP"
          ? "USP"
          : selectedTemplate?.template.domain_code === "DSP"
            ? "DSP"
            : selectedTemplate?.template.domain_code === "SPI"
              ? "SPI"
              : "CROSS",
      main_operations: [],
      aux_operations: [],
      state_segments: [],
      risk_markers: [],
      context_windows: [],
    });
  });

  rowMap.forEach((row) => {
    const manualSegments = (
      draftSegmentsByEquipment.get(row.equipment_code) ?? []
    ).map((segment) =>
      toManualStateBandSegment(segment, resourcesByCode, row.equipment_mode),
    );
    row.state_segments = [...row.state_segments, ...manualSegments].sort(
      (left, right) =>
        parseDateTime(left.start_datetime).getTime() -
        parseDateTime(right.start_datetime).getTime(),
    );
    row.aux_operations = row.aux_operations.sort(
      (left, right) =>
        parseDateTime(left.start_datetime).getTime() -
        parseDateTime(right.start_datetime).getTime(),
    );
    row.main_operations = row.main_operations.sort(
      (left, right) =>
        parseDateTime(left.start_datetime).getTime() -
        parseDateTime(right.start_datetime).getTime(),
    );
  });

  return [...rowMap.values()].sort((left, right) =>
    left.equipment_code.localeCompare(right.equipment_code, "zh-CN"),
  );
}

function sanitizeResourceCode(value: string) {
  return value.trim().toUpperCase();
}

export function V3BioprocessWorkbench() {
  const queryClient = useQueryClient();
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("sandbox");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [plannedStartInput, setPlannedStartInput] = useState(
    toDatetimeLocalValue(alignToNextHour(new Date())),
  );
  const [horizonDays, setHorizonDays] = useState(7);
  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>("week");
  const [selectedStateCode, setSelectedStateCode] =
    useState<EquipmentStateValue>("media_holding");
  const [selection, setSelection] = useState<SelectionState>(null);
  const [sandboxDraft, setSandboxDraft] = useState<SandboxDraft>(emptyDraft());
  const [submittedRequest, setSubmittedRequest] = useState<ReturnType<
    typeof buildPreviewRequest
  > | null>(null);
  const [submittedDraftSignature, setSubmittedDraftSignature] = useState("[]");
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [operationDragState, setOperationDragState] = useState<{
    initialStart: string;
    nodeKey: string;
    startClientX: number;
  } | null>(null);
  const [stateDragState, setStateDragState] = useState<{
    bandLeft: number;
    bandWidth: number;
    equipmentCode: string;
    equipmentMode: EquipmentTimelineRow["equipment_mode"];
    startMinutes: number;
    totalMinutes: number;
  } | null>(null);
  const [managedResourceId, setManagedResourceId] = useState<number | null>(null);
  const [resourceForm, setResourceForm] = useState({
    clean_level: "",
    department_code: "USP",
    location: "",
    resource_code: "",
    resource_name: "",
    resource_type: "EQUIPMENT",
  });

  const draftStorageKey = toStorageKey(
    selectedTemplateId,
    plannedStartInput,
    horizonDays,
  );

  const templatesQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.templates,
    queryFn: getV3Templates,
  });

  const syncStatusQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.syncStatus,
    queryFn: getV3SyncStatus,
  });

  const templateDetailQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.templateDetail(selectedTemplateId),
    queryFn: () => getV3TemplateDetail(selectedTemplateId!),
    enabled: Boolean(selectedTemplateId),
  });

  const resourcesQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.resources,
    queryFn: () =>
      getLegacyResources({
        is_schedulable: true,
      }),
  });

  const resourceNodesQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.resourceNodes,
    queryFn: getLegacyResourceNodes,
  });

  const maintenanceQuery = useQuery({
    queryKey: v3BioprocessQueryKeys.maintenanceWindows(managedResourceId),
    queryFn: () => getMaintenanceWindows(managedResourceId),
    enabled: Boolean(managedResourceId),
  });

  useEffect(() => {
    if (selectedTemplateId || !templatesQuery.data?.data.length) {
      return;
    }

    startTransition(() => {
      setSelectedTemplateId(templatesQuery.data.data[0].id);
    });
  }, [selectedTemplateId, templatesQuery.data]);

  useEffect(() => {
    const draft = loadDraft(draftStorageKey);
    setSandboxDraft(draft);

    if (!selectedTemplateId) {
      setSubmittedRequest(null);
      return;
    }

    const request = buildPreviewRequest(
      selectedTemplateId,
      plannedStartInput,
      horizonDays,
      draft,
    );
    setSubmittedRequest(request);
    setSubmittedDraftSignature(serializeDraft(draft));
    setPreviewGeneration((previous) => previous + 1);
  }, [draftStorageKey, horizonDays, plannedStartInput, selectedTemplateId]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(sandboxDraft));
  }, [draftStorageKey, sandboxDraft]);

  const previewQuery = useQuery({
    queryKey: submittedRequest
      ? [
          ...v3BioprocessQueryKeys.preview(submittedRequest),
          previewGeneration,
        ]
      : ["v3-bioprocess", "preview", "idle"],
    queryFn: () => previewV3Projection(submittedRequest!),
    enabled: Boolean(submittedRequest),
  });

  const syncMutation = useMutation({
    mutationFn: syncV3MasterData,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: v3BioprocessQueryKeys.syncStatus,
        }),
        queryClient.invalidateQueries({
          queryKey: ["v3-bioprocess", "preview"],
        }),
      ]);
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: createLegacyResource,
    onSuccess: async () => {
      setResourceForm({
        clean_level: "",
        department_code: resourceForm.department_code,
        location: "",
        resource_code: "",
        resource_name: "",
        resource_type: resourceForm.resource_type,
      });
      await queryClient.invalidateQueries({
        queryKey: v3BioprocessQueryKeys.resources,
      });
    },
  });

  const updateResourceNodeMutation = useMutation({
    mutationFn: ({
      nodeId,
      payload,
    }: {
      nodeId: number;
      payload: Record<string, unknown>;
    }) => updateLegacyResourceNode(nodeId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: v3BioprocessQueryKeys.resourceNodes,
      });
    },
  });

  const preview = previewQuery.data;
  const syncStatus = syncStatusQuery.data;
  const selectedTemplate = templateDetailQuery.data;
  const resources = resourcesQuery.data ?? [];
  const resourceNodes = resourceNodesQuery.data ?? [];
  const syncStatusMeta = formatSyncStatus(
    syncStatus?.status ?? null,
    syncStatus?.storage_mode,
  );

  const visibleRows = buildVisibleRows({
    previewRows: preview?.rows,
    draft: sandboxDraft,
    resources,
    selectedTemplate,
  });
  const currentDraftSignature = serializeDraft(sandboxDraft);
  const hasDirtyDraft = currentDraftSignature !== submittedDraftSignature;

  const horizonStart = preview
    ? parseDateTime(preview.planned_start_datetime)
    : parseDateTime(
        submittedRequest?.planned_start_datetime ??
          `${plannedStartInput.replace("T", " ")}:00`,
      );
  const horizonEnd = preview
    ? parseDateTime(preview.horizon_end_datetime)
    : addMinutes(horizonStart, horizonDays * 24 * 60);

  const timelineConfig = timelineConfigByZoom[zoomLevel];
  const totalMinutes = Math.max(diffMinutes(horizonStart, horizonEnd), 60);
  const timelineWidth = Math.max(
    totalMinutes * timelineConfig.pixelsPerMinute,
    1120,
  );
  const majorCells = buildTimelineCells(
    zoomLevel,
    horizonStart,
    horizonEnd,
    timelineConfig.majorMinutes,
    timelineConfig.pixelsPerMinute,
    headerFormatterByZoom[zoomLevel].major,
  );
  const minorCells = buildTimelineCells(
    zoomLevel,
    horizonStart,
    horizonEnd,
    timelineConfig.minorMinutes,
    timelineConfig.pixelsPerMinute,
    headerFormatterByZoom[zoomLevel].minor,
  );

  useEffect(() => {
    if (!operationDragState) {
      return;
    }

    const dragEnabled = zoomLevel === "hour" || zoomLevel === "minute";
    if (!dragEnabled) {
      return;
    }

    const config = timelineConfigByZoom[zoomLevel];
    const handlePointerMove = (event: PointerEvent) => {
      const deltaPixels = event.clientX - operationDragState.startClientX;
      const rawMinutes = deltaPixels / config.pixelsPerMinute;
      const snappedMinutes = Math.round(rawMinutes / 5) * 5;
      const nextStart = addMinutes(
        parseDateTime(operationDragState.initialStart),
        snappedMinutes,
      );

      setSandboxDraft((previous) => ({
        ...previous,
        draftMainOperationOverrides: upsertMainOperationOverride(
          previous.draftMainOperationOverrides,
          {
            node_key: operationDragState.nodeKey,
            start_datetime: formatDateTime(nextStart),
          },
        ),
      }));
    };

    const handlePointerUp = () => {
      setOperationDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [operationDragState, zoomLevel]);

  useEffect(() => {
    if (!stateDragState) {
      return;
    }

    const handlePointerUp = (event: PointerEvent) => {
      const currentMinutes = clampMinutes(
        ((event.clientX - stateDragState.bandLeft) / stateDragState.bandWidth) *
          stateDragState.totalMinutes,
        stateDragState.totalMinutes,
      );
      const startMinutes = Math.min(stateDragState.startMinutes, currentMinutes);
      const endMinutes = Math.max(stateDragState.startMinutes, currentMinutes) || startMinutes + 5;
      const startDate = addMinutes(horizonStart, startMinutes);
      const endDate = addMinutes(horizonStart, Math.max(endMinutes, startMinutes + 5));
      const segmentKey = `manual_${Date.now()}`;

      setSandboxDraft((previous) => ({
        ...previous,
        draftStateSegments: [
          ...previous.draftStateSegments,
          {
            segment_key: segmentKey,
            equipment_code: stateDragState.equipmentCode,
            equipment_mode: stateDragState.equipmentMode,
            state_code: selectedStateCode,
            start_datetime: formatDateTime(startDate),
            end_datetime: formatDateTime(endDate),
            locked: true,
            metadata: {
              created_in_ui: true,
            },
          },
        ],
      }));
      setSelection({
        segmentKey,
        type: "manual-state",
      });
      setStateDragState(null);
    };

    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [horizonStart, selectedStateCode, stateDragState]);

  const selectedManualSegment =
    selection?.type === "manual-state"
      ? sandboxDraft.draftStateSegments.find(
          (segment) => segment.segment_key === selection.segmentKey,
        ) ?? null
      : null;

  const overallCounts = {
    auxOperations: visibleRows.reduce(
      (sum, row) => sum + row.aux_operations.length,
      0,
    ),
    blockingRisks:
      preview?.risks.filter((risk) => risk.severity === "BLOCKING").length ?? 0,
    equipmentRows: visibleRows.length,
    mainOperations: visibleRows.reduce(
      (sum, row) => sum + row.main_operations.length,
      0,
    ),
  };

  const controlsDisabled =
    templatesQuery.isLoading || !templatesQuery.data?.data.length;

  const runRecompute = () => {
    if (!selectedTemplateId) {
      return;
    }

    const request = buildPreviewRequest(
      selectedTemplateId,
      plannedStartInput,
      horizonDays,
      sandboxDraft,
    );
    setSubmittedRequest(request);
    setSubmittedDraftSignature(serializeDraft(sandboxDraft));
    setPreviewGeneration((previous) => previous + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="V3 Resource Planning Sandbox"
        title="资源规划 / 风险沙盘"
        subtitle="同一路由下把沙盘、设备管理和工艺逻辑串起来。正式设备继续来自 legacy 主数据，手工状态段和节点覆盖先保存在本地草稿中，显式点击重算后再刷新派生工序、预测状态和风险。"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={syncStatusMeta.tone}>{syncStatusMeta.label}</Badge>
            <Button
              disabled={
                syncMutation.isPending || syncStatus?.storage_mode === "fallback"
              }
              onClick={() => syncMutation.mutate()}
              variant="secondary"
            >
              {syncStatus?.storage_mode === "fallback"
                ? "V3 schema 未启用"
                : syncMutation.isPending
                  ? "同步中..."
                  : "同步旧库镜像"}
            </Button>
          </div>
        }
      />

      <Tabs
        onChange={setActiveTab}
        options={workbenchTabOptions}
        value={activeTab}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="设备行" value={String(overallCounts.equipmentRows)} />
        <MetricCard label="主工序" value={String(overallCounts.mainOperations)} />
        <MetricCard label="辅助工序" value={String(overallCounts.auxOperations)} />
        <MetricCard
          label="阻断风险"
          tone={overallCounts.blockingRisks ? "danger" : "success"}
          value={String(overallCounts.blockingRisks)}
        />
      </div>

      <Panel
        eyebrow="Planning Controls"
        title="当前沙盘上下文"
        description="模板、起点和窗口切换会自动切换本地草稿缓存；节点设备覆盖、主工序微调和手工状态段需要显式点击重算才会请求后端重新推演。"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(240px,0.85fr)_minmax(180px,0.7fr)_minmax(220px,0.9fr)]">
          <Field label="V3 模板">
            <select
              className={controlClassName}
              disabled={controlsDisabled}
              onChange={(event) => setSelectedTemplateId(Number(event.target.value))}
              value={selectedTemplateId ?? ""}
            >
              <option value="" disabled>
                选择模板
              </option>
              {templatesQuery.data?.data.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.template_name} ({template.domain_code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="计划起点">
            <input
              className={controlClassName}
              onChange={(event) => setPlannedStartInput(event.target.value)}
              type="datetime-local"
              value={plannedStartInput}
            />
          </Field>
          <Field label="观察窗口">
            <select
              className={controlClassName}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              value={horizonDays}
            >
              <option value={3}>3 天</option>
              <option value={5}>5 天</option>
              <option value={7}>7 天</option>
              <option value={10}>10 天</option>
              <option value={14}>14 天</option>
            </select>
          </Field>
          <Field label="当前已 pin 设备">
            <div className="flex h-11 items-center gap-2 overflow-auto rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 shadow-[var(--pl-shadow-soft)]">
              {sandboxDraft.pinnedEquipmentCodes.length ? (
                sandboxDraft.pinnedEquipmentCodes.map((equipmentCode) => (
                  <Badge key={equipmentCode} tone="neutral">
                    {equipmentCode}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-[var(--pl-text-secondary)]">
                  当前没有额外 pin 的设备
                </span>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <Tabs onChange={setZoomLevel} options={zoomOptions} value={zoomLevel} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={hasDirtyDraft ? "warning" : "success"}>
              {hasDirtyDraft ? "草稿待重算" : "草稿已提交"}
            </Badge>
            <Button
              disabled={!selectedTemplateId || previewQuery.isFetching}
              onClick={runRecompute}
            >
              {previewQuery.isFetching ? "重算中..." : "重算"}
            </Button>
          </div>
        </div>
      </Panel>

      {selection && selection.type !== "manual-state" ? (
        <div className="rounded-[var(--pl-radius-lg)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.86)] px-5 py-4 shadow-[var(--pl-shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
                {selection.eyebrow}
              </div>
              <div className="text-base font-semibold text-[var(--pl-text-primary)]">
                {selection.title}
              </div>
              <div className="text-sm leading-6 text-[var(--pl-text-secondary)]">
                {selection.body}
              </div>
            </div>
            <Badge tone={selection.tone}>{selection.tone}</Badge>
          </div>
        </div>
      ) : null}

      {selectedManualSegment ? (
        <Panel
          eyebrow="Manual State Editor"
          title={`手工状态段 · ${selectedManualSegment.equipment_code}`}
          description="手工状态段是高优先级真源。删除只会删本地草稿；系统派生段不能在这里直接改。"
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="状态">
              <select
                className={controlClassName}
                onChange={(event) =>
                  updateDraftStateSegment(
                    setSandboxDraft,
                    selectedManualSegment.segment_key!,
                    {
                      state_code: event.target.value as EquipmentStateValue,
                    },
                  )
                }
                value={selectedManualSegment.state_code}
              >
                {stateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始时间">
              <input
                className={controlClassName}
                onChange={(event) =>
                  updateDraftStateSegment(
                    setSandboxDraft,
                    selectedManualSegment.segment_key!,
                    {
                      start_datetime: `${event.target.value.replace("T", " ")}:00`,
                    },
                  )
                }
                type="datetime-local"
                value={toDatetimeLocalValue(
                  parseDateTime(selectedManualSegment.start_datetime),
                )}
              />
            </Field>
            <Field label="结束时间">
              <input
                className={controlClassName}
                onChange={(event) =>
                  updateDraftStateSegment(
                    setSandboxDraft,
                    selectedManualSegment.segment_key!,
                    {
                      end_datetime: `${event.target.value.replace("T", " ")}:00`,
                    },
                  )
                }
                type="datetime-local"
                value={toDatetimeLocalValue(
                  parseDateTime(selectedManualSegment.end_datetime),
                )}
              />
            </Field>
            <Field label="锁定">
              <div className="flex h-11 items-center gap-3 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 shadow-[var(--pl-shadow-soft)]">
                <input
                  checked={selectedManualSegment.locked === true}
                  onChange={(event) =>
                    updateDraftStateSegment(
                      setSandboxDraft,
                      selectedManualSegment.segment_key!,
                      {
                        locked: event.target.checked,
                      },
                    )
                  }
                  type="checkbox"
                />
                <span className="text-sm text-[var(--pl-text-secondary)]">
                  锁定后只允许系统在未锁定空档补预测状态
                </span>
              </div>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() =>
                removeDraftStateSegment(
                  setSandboxDraft,
                  selectedManualSegment.segment_key!,
                  () => setSelection(null),
                )
              }
              variant="secondary"
            >
              删除此状态段
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeTab === "sandbox" ? (
        <Panel
          eyebrow={
            selectedTemplate
              ? `${selectedTemplate.template.template_code} · ${selectedTemplate.template.domain_code}`
              : "Timeline"
          }
          title="统一资源甘特图"
          description="每台设备一行三层：主工序、辅助工序、设备状态。底部状态带既显示系统预测，也叠加本地手工状态段；拖动主工序和画状态段都只更新本地草稿，点击重算后才刷新派生结果。"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.84)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">5 分钟吸附</Badge>
              <span className="text-sm text-[var(--pl-text-secondary)]">
                画状态段建议在 小时 / 15分 或 小时 / 5分 视图下进行。
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-[var(--pl-text-secondary)]">
                手工状态
              </label>
              <select
                className={controlClassName}
                onChange={(event) =>
                  setSelectedStateCode(event.target.value as EquipmentStateValue)
                }
                value={selectedStateCode}
              >
                {stateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {templatesQuery.isLoading || templateDetailQuery.isLoading ? (
            <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] px-5 py-12 text-sm text-[var(--pl-text-secondary)]">
              正在装载 V3 沙盘...
            </div>
          ) : previewQuery.isError ? (
            <EmptyState
              eyebrow="Preview error"
              title="V3 预演未返回结果"
              description={
                previewQuery.error instanceof Error
                  ? previewQuery.error.message
                  : "Unknown V3 preview error."
              }
            />
          ) : !selectedTemplate || !visibleRows.length ? (
            <EmptyState
              eyebrow="No timeline"
              title="当前没有可绘制的设备时间线"
              description="先选模板，再在设备管理里 pin 设备或新建设备。无 migration 模式下仍可直接使用 legacy 设备主数据和本地草稿。"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm leading-6 text-[var(--pl-text-secondary)]">
                  {selectedTemplate.template.template_name} | 预演起点{" "}
                  {formatRange(
                    preview?.planned_start_datetime ??
                      `${plannedStartInput.replace("T", " ")}:00`,
                    preview?.horizon_end_datetime ??
                      formatDateTime(horizonEnd),
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">
                    {formatDomainLabel(selectedTemplate.template.domain_code)}
                  </Badge>
                  <Badge tone="neutral">
                    {visibleRows.length} 台设备 / {preview?.risks.length ?? 0} 条风险
                  </Badge>
                </div>
              </div>

              <div
                className="overflow-auto rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)]"
                ref={timelineScrollRef}
              >
                <div className="min-w-[980px]">
                  <div className="sticky top-0 z-20 border-b border-[var(--pl-border)] bg-[rgba(255,255,255,0.96)] backdrop-blur">
                    <div className="flex">
                      <div className="sticky left-0 z-30 w-[240px] shrink-0 border-r border-[var(--pl-border)] bg-[rgba(255,255,255,0.98)] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
                          Equipment
                        </div>
                        <div className="mt-1 text-sm text-[var(--pl-text-secondary)]">
                          主工序 / 辅助工序 / 状态带
                        </div>
                      </div>
                      <div className="relative h-[78px]" style={{ width: timelineWidth }}>
                        <div className="absolute inset-x-0 top-0 h-[38px] border-b border-[var(--pl-border)]">
                          {majorCells.map((cell) => (
                            <div
                              className="absolute inset-y-0 border-r border-[var(--pl-border)] px-3 py-2 text-xs font-semibold tracking-[0.04em] text-[var(--pl-text-secondary)]"
                              key={cell.key}
                              style={{ left: cell.left, width: cell.width }}
                            >
                              {cell.label}
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-[40px]">
                          {minorCells.map((cell) => (
                            <div
                              className="absolute inset-y-0 border-r border-dashed border-[rgba(112,120,138,0.18)] px-2 py-2 text-[11px] text-[var(--pl-text-tertiary)]"
                              key={cell.key}
                              style={{ left: cell.left, width: cell.width }}
                            >
                              {cell.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {visibleRows.map((row) => (
                    <EquipmentRow
                      key={row.equipment_code}
                      horizonEnd={horizonEnd}
                      horizonStart={horizonStart}
                      onOperationPointerDown={(event, operation) => {
                        const nodeKey = findNodeKey(operation);
                        if (!nodeKey) {
                          return;
                        }
                        if (zoomLevel !== "hour" && zoomLevel !== "minute") {
                          return;
                        }
                        setOperationDragState({
                          initialStart: operation.start_datetime,
                          nodeKey,
                          startClientX: event.clientX,
                        });
                      }}
                      onSelectContextWindow={(window) =>
                        setSelection(buildSelectionFromContextWindow(window))
                      }
                      onSelectOperation={(operation) =>
                        setSelection(buildSelectionFromOperation(operation))
                      }
                      onSelectRisk={(risk) =>
                        setSelection(buildSelectionFromRisk(risk))
                      }
                      onSelectStateSegment={(segment) => {
                        if (segment.metadata.origin !== "manual_draft") {
                          return;
                        }
                        setSelection({
                          segmentKey: segment.segment_key,
                          type: "manual-state",
                        });
                      }}
                      onStateBandPointerDown={(event) => {
                        if (zoomLevel !== "hour" && zoomLevel !== "minute") {
                          return;
                        }
                        const rect = event.currentTarget.getBoundingClientRect();
                        const startMinutes = clampMinutes(
                          ((event.clientX - rect.left) / rect.width) *
                            totalMinutes,
                          totalMinutes,
                        );

                        setStateDragState({
                          bandLeft: rect.left,
                          bandWidth: rect.width,
                          equipmentCode: row.equipment_code,
                          equipmentMode: row.equipment_mode,
                          startMinutes,
                          totalMinutes,
                        });
                      }}
                      row={{
                        ...row,
                        aux_operations: summarizeAuxOperations(
                          row.aux_operations,
                          zoomLevel,
                        ),
                      }}
                      timelineWidth={timelineWidth}
                      totalMinutes={totalMinutes}
                      zoomLevel={zoomLevel}
                    />
                  ))}
                </div>
              </div>

              {preview?.risks.length ? (
                <div className="flex flex-wrap gap-2">
                  {preview.risks.slice(0, 8).map((risk) => (
                    <button
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        riskToneClassName[risk.severity],
                      )}
                      key={risk.risk_code}
                      onClick={() => setSelection(buildSelectionFromRisk(risk))}
                      type="button"
                    >
                      {risk.risk_type}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[var(--pl-radius-md)] border border-[rgba(24,121,78,0.18)] bg-[var(--pl-success-soft)] px-4 py-3 text-sm text-[var(--pl-success)]">
                  当前预演未发现阻断风险。
                </div>
              )}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "equipment" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Panel
            eyebrow="Legacy Equipment"
            title="正式设备 + pin 到当前沙盘"
            description="设备继续来自 legacy resources。这里不创建 draft 设备；pin 只是把正式设备拉进当前沙盘，使它即使没有主工艺也能显示为空行并定义手工状态。"
          >
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="设备编码">
                  <input
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        resource_code: sanitizeResourceCode(event.target.value),
                      }))
                    }
                    value={resourceForm.resource_code}
                  />
                </Field>
                <Field label="设备名称">
                  <input
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        resource_name: event.target.value,
                      }))
                    }
                    value={resourceForm.resource_name}
                  />
                </Field>
                <Field label="类型">
                  <input
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        resource_type: event.target.value,
                      }))
                    }
                    value={resourceForm.resource_type}
                  />
                </Field>
                <Field label="部门">
                  <select
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        department_code: event.target.value,
                      }))
                    }
                    value={resourceForm.department_code}
                  >
                    <option value="USP">USP</option>
                    <option value="DSP">DSP</option>
                    <option value="SPI">SPI</option>
                    <option value="MAINT">MAINT</option>
                  </select>
                </Field>
                <Field label="位置">
                  <input
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        location: event.target.value,
                      }))
                    }
                    value={resourceForm.location}
                  />
                </Field>
                <Field label="洁净级别">
                  <input
                    className={controlClassName}
                    onChange={(event) =>
                      setResourceForm((previous) => ({
                        ...previous,
                        clean_level: event.target.value,
                      }))
                    }
                    value={resourceForm.clean_level}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    createResourceMutation.isPending ||
                    !resourceForm.resource_code ||
                    !resourceForm.resource_name ||
                    !resourceForm.resource_type
                  }
                  onClick={() => createResourceMutation.mutate(resourceForm)}
                >
                  {createResourceMutation.isPending ? "创建中..." : "新增正式设备"}
                </Button>
              </div>

              <div className="grid gap-3">
                {resourcesQuery.isLoading ? (
                  <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] px-4 py-10 text-sm text-[var(--pl-text-secondary)]">
                    正在读取 legacy 设备...
                  </div>
                ) : resources.length ? (
                  resources.map((resource) => {
                    const pinned = sandboxDraft.pinnedEquipmentCodes.includes(
                      resource.resource_code,
                    );
                    const relatedMaintenance = (maintenanceQuery.data ?? []).filter(
                      (window) => window.resource_id === resource.id,
                    );

                    return (
                      <div
                        className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.84)] px-4 py-4"
                        key={resource.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                              {resource.resource_name}
                            </div>
                            <div className="mt-1 text-xs text-[var(--pl-text-secondary)]">
                              {resource.resource_code} · {resource.resource_type} ·{" "}
                              {resource.department_code ?? "N/A"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() =>
                                togglePinnedEquipment(
                                  setSandboxDraft,
                                  resource.resource_code,
                                )
                              }
                              variant={pinned ? "secondary" : "primary"}
                            >
                              {pinned ? "取消 pin" : "Pin 到沙盘"}
                            </Button>
                            <Button
                              onClick={() => setManagedResourceId(resource.id)}
                              variant="secondary"
                            >
                              查看维护
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone={pinned ? "accent" : "neutral"}>
                            {pinned ? "Pinned" : "Not pinned"}
                          </Badge>
                          <Badge tone="neutral">
                            {resource.status ?? "ACTIVE"}
                          </Badge>
                          {relatedMaintenance.length ? (
                            <Badge tone="warning">
                              {relatedMaintenance.length} 个维护窗口
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    eyebrow="No equipment"
                    title="当前没有可用正式设备"
                    description="先创建一台设备，再 pin 到沙盘。"
                  />
                )}
              </div>
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel
              eyebrow="Resource Nodes"
              title="节点绑定"
              description="resource_nodes 仍是正式层级和 SS/SUS 分类真源。这里调整 bound_resource_id 后，后续新建或重算沙盘可以直接使用。"
            >
              <div className="space-y-3">
                {resourceNodesQuery.isLoading ? (
                  <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] px-4 py-10 text-sm text-[var(--pl-text-secondary)]">
                    正在读取 resource nodes...
                  </div>
                ) : resourceNodes.length ? (
                  resourceNodes.slice(0, 24).map((node) => (
                    <div
                      className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] px-4 py-4"
                      key={node.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                            {node.node_name}
                          </div>
                          <div className="mt-1 text-xs text-[var(--pl-text-secondary)]">
                            {node.node_code} · {node.node_class}
                            {node.equipment_system_type
                              ? ` · ${node.equipment_system_type}`
                              : ""}
                            {node.equipment_class ? ` · ${node.equipment_class}` : ""}
                          </div>
                        </div>
                        <div className="w-full max-w-[280px]">
                          <select
                            className={controlClassName}
                            onChange={(event) =>
                              updateResourceNodeMutation.mutate({
                                nodeId: node.id,
                                payload: {
                                  bound_resource_id: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                },
                              })
                            }
                            value={node.bound_resource_id ?? ""}
                          >
                            <option value="">未绑定</option>
                            {resources.map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.resource_code} · {resource.resource_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    eyebrow="No nodes"
                    title="resource node 模型当前为空"
                    description="这里会直接复用 legacy resource_nodes。"
                  />
                )}
              </div>
            </Panel>

            <Panel
              eyebrow="Maintenance"
              title="维护窗口"
              description="沙盘与设备管理共用同一条 `/api/maintenance-windows` 链路。这里先做读模型，帮助判断设备何时不该进入手工状态或主工艺。"
            >
              {managedResourceId ? (
                maintenanceQuery.isLoading ? (
                  <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] px-4 py-10 text-sm text-[var(--pl-text-secondary)]">
                    正在装载维护窗口...
                  </div>
                ) : maintenanceQuery.data?.length ? (
                  <div className="space-y-3">
                    {maintenanceQuery.data.map((window) => (
                      <div
                        className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] px-4 py-4"
                        key={window.id}
                      >
                        <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                          {window.resource_name} · {window.window_type}
                        </div>
                        <div className="mt-1 text-xs text-[var(--pl-text-secondary)]">
                          {formatRange(window.start_datetime, window.end_datetime)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge tone={window.is_hard_block ? "danger" : "warning"}>
                            {window.is_hard_block ? "Hard block" : "Soft block"}
                          </Badge>
                          {window.notes ? (
                            <Badge tone="neutral">{window.notes}</Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    eyebrow="No maintenance"
                    title="该设备当前没有维护窗口"
                    description="如果后续手工 maintenance 状态段与这里的窗口重叠，沙盘会直接给出阻断风险。"
                  />
                )
              ) : (
                <EmptyState
                  eyebrow="Select equipment"
                  title="先在左侧选择一台正式设备"
                  description="维护窗口会在这里显示，也会叠加到沙盘时间线上。"
                />
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === "logic" ? (
        <div className="space-y-6">
          <Panel
            eyebrow="Main Flow"
            title="主工艺节点与本地覆盖"
            description="这一版先不把规则编辑落库。工艺逻辑 tab 至少把主工艺节点、默认设备绑定、节点设备覆盖和主工序时间微调集中到同一处。"
          >
            {templateDetailQuery.isLoading ? (
              <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] px-4 py-10 text-sm text-[var(--pl-text-secondary)]">
                正在装载模板详情...
              </div>
            ) : !selectedTemplate ? (
              <EmptyState
                eyebrow="No template"
                title="先选择一个模板"
                description="选择模板后才能查看主工艺节点和触发规则。"
              />
            ) : (
              <div className="space-y-3">
                {selectedTemplate.nodes.map((node) => {
                  const bindingOverride =
                    sandboxDraft.draftNodeBindings.find(
                      (item) => item.node_key === node.node_key,
                    ) ?? null;
                  const mainOverride =
                    sandboxDraft.draftMainOperationOverrides.find(
                      (item) => item.node_key === node.node_key,
                    ) ?? null;

                  return (
                    <div
                      className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.84)] px-4 py-4"
                      key={node.id}
                    >
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)_minmax(240px,0.8fr)]">
                        <div>
                          <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                            {node.display_name}
                          </div>
                          <div className="mt-1 text-xs text-[var(--pl-text-secondary)]">
                            {node.node_key} · {node.semantic_key} · 默认时长{" "}
                            {node.default_duration_minutes} 分钟
                          </div>
                        </div>
                        <Field label="节点设备覆盖">
                          <select
                            className={controlClassName}
                            onChange={(event) =>
                              setSandboxDraft((previous) => ({
                                ...previous,
                                draftNodeBindings: upsertNodeBindingOverride(
                                  previous.draftNodeBindings,
                                  {
                                    node_key: node.node_key,
                                    equipment_code: event.target.value || null,
                                  },
                                ),
                              }))
                            }
                            value={bindingOverride?.equipment_code ?? ""}
                          >
                            <option value="">
                              默认: {node.default_equipment_code ?? "未绑定"}
                            </option>
                            {resources.map((resource) => (
                              <option key={resource.id} value={resource.resource_code}>
                                {resource.resource_code} · {resource.resource_name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="主工序开始时间覆盖">
                          <input
                            className={controlClassName}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setSandboxDraft((previous) => ({
                                ...previous,
                                draftMainOperationOverrides: nextValue
                                  ? upsertMainOperationOverride(
                                      previous.draftMainOperationOverrides,
                                      {
                                        node_key: node.node_key,
                                        start_datetime: `${nextValue.replace("T", " ")}:00`,
                                      },
                                    )
                                  : previous.draftMainOperationOverrides.filter(
                                      (item) => item.node_key !== node.node_key,
                                    ),
                              }));
                            }}
                            type="datetime-local"
                            value={
                              mainOverride
                                ? toDatetimeLocalValue(
                                    parseDateTime(mainOverride.start_datetime),
                                  )
                                : ""
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              eyebrow="Trigger Rules"
              title="触发规则摘要"
              description="这里先读模型，不做规则落库编辑。重点是让调度员看清哪些辅助工序、状态门禁和 recurring window 会在重算时生效。"
            >
              {selectedTemplate?.rules.length ? (
                <div className="space-y-3">
                  {selectedTemplate.rules.map((rule) => (
                    <div
                      className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] px-4 py-4"
                      key={rule.id}
                    >
                      <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                        {rule.rule_code}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[var(--pl-text-secondary)]">
                        {rule.trigger_mode} · anchor {rule.anchor_mode}
                        {rule.operation_name ? ` · ${rule.operation_name}` : ""}
                        {rule.target_equipment_state
                          ? ` · 设备态 ${rule.target_equipment_state}`
                          : ""}
                        {rule.target_material_state
                          ? ` · 物料态 ${rule.target_material_state}`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  eyebrow="No rules"
                  title="当前模板没有触发规则"
                  description="规则为空时，沙盘只会画主工序。"
                />
              )}
            </Panel>

            <Panel
              eyebrow="Packages"
              title="操作包摘要"
              description="setup / media fill / CIP-SIP 包的成员顺序、相对日偏移和目标状态在这里可见，帮助理解系统为什么会在某个时间窗自动拉出辅助操作。"
            >
              {selectedTemplate?.packages.length ? (
                <div className="space-y-3">
                  {selectedTemplate.packages.map((pkg) => (
                    <div
                      className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] px-4 py-4"
                      key={pkg.id}
                    >
                      <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                        {pkg.package_name}
                      </div>
                      <div className="mt-1 text-xs text-[var(--pl-text-secondary)]">
                        {pkg.package_code} · {pkg.package_type} ·{" "}
                        {pkg.equipment_mode}
                      </div>
                      <div className="mt-3 space-y-2">
                        {pkg.members.map((member) => (
                          <div
                            className="rounded-[12px] bg-[rgba(11,106,162,0.05)] px-3 py-2 text-xs text-[var(--pl-text-secondary)]"
                            key={member.id}
                          >
                            {member.member_order}. {member.operation_name} · D
                            {member.relative_day_offset >= 0 ? "+" : ""}
                            {member.relative_day_offset} / M
                            {member.relative_minute_offset >= 0 ? "+" : ""}
                            {member.relative_minute_offset}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  eyebrow="No packages"
                  title="当前模板没有操作包"
                  description="没有 package 时，辅助工序只来自 window / recurring rules。"
                />
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function clampMinutes(value: number, totalMinutes: number) {
  const snapped = Math.round(value / 5) * 5;
  return Math.max(0, Math.min(snapped, totalMinutes));
}

function upsertMainOperationOverride(
  overrides: DraftMainOperationOverride[],
  nextOverride: DraftMainOperationOverride,
) {
  const next = overrides.filter((item) => item.node_key !== nextOverride.node_key);
  return [...next, nextOverride];
}

function upsertNodeBindingOverride(
  overrides: DraftNodeBindingOverride[],
  nextOverride: DraftNodeBindingOverride,
) {
  const next = overrides.filter((item) => item.node_key !== nextOverride.node_key);
  if (!nextOverride.equipment_code) {
    return next;
  }

  return [...next, nextOverride];
}

function updateDraftStateSegment(
  setSandboxDraft: React.Dispatch<React.SetStateAction<SandboxDraft>>,
  segmentKey: string,
  patch: Partial<DraftStateSegment>,
) {
  setSandboxDraft((previous) => ({
    ...previous,
    draftStateSegments: previous.draftStateSegments.map((segment) =>
      segment.segment_key === segmentKey ? { ...segment, ...patch } : segment,
    ),
  }));
}

function removeDraftStateSegment(
  setSandboxDraft: React.Dispatch<React.SetStateAction<SandboxDraft>>,
  segmentKey: string,
  onAfter?: () => void,
) {
  setSandboxDraft((previous) => ({
    ...previous,
    draftStateSegments: previous.draftStateSegments.filter(
      (segment) => segment.segment_key !== segmentKey,
    ),
  }));
  onAfter?.();
}

function togglePinnedEquipment(
  setSandboxDraft: React.Dispatch<React.SetStateAction<SandboxDraft>>,
  equipmentCode: string,
) {
  setSandboxDraft((previous) => {
    const nextPinned = previous.pinnedEquipmentCodes.includes(equipmentCode)
      ? previous.pinnedEquipmentCodes.filter((code) => code !== equipmentCode)
      : [...previous.pinnedEquipmentCodes, equipmentCode];

    return {
      ...previous,
      pinnedEquipmentCodes: nextPinned.sort((left, right) =>
        left.localeCompare(right, "zh-CN"),
      ),
    };
  });
}

function EquipmentRow({
  horizonEnd,
  horizonStart,
  onOperationPointerDown,
  onSelectContextWindow,
  onSelectOperation,
  onSelectRisk,
  onSelectStateSegment,
  onStateBandPointerDown,
  row,
  timelineWidth,
  totalMinutes,
  zoomLevel,
}: {
  horizonEnd: Date;
  horizonStart: Date;
  onOperationPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    operation: MainOperationBar,
  ) => void;
  onSelectContextWindow: (window: TimelineContextWindow) => void;
  onSelectOperation: (operation: OperationLikeBar) => void;
  onSelectRisk: (risk: RiskMarker) => void;
  onSelectStateSegment: (segment: StateBandSegment) => void;
  onStateBandPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  row: EquipmentTimelineRow;
  timelineWidth: number;
  totalMinutes: number;
  zoomLevel: TimelineZoomLevel;
}) {
  const config = timelineConfigByZoom[zoomLevel];

  const toPosition = (startDatetime: string, endDatetime: string) => {
    const start = parseDateTime(startDatetime);
    const end = parseDateTime(endDatetime);
    const clippedStart = start < horizonStart ? horizonStart : start;
    const clippedEnd = end > horizonEnd ? horizonEnd : end;
    const left = (diffMinutes(horizonStart, clippedStart) / totalMinutes) * timelineWidth;
    const width = Math.max(
      (diffMinutes(clippedStart, clippedEnd) / totalMinutes) * timelineWidth,
      2,
    );

    return { left, width };
  };

  return (
    <div className="flex border-b border-[var(--pl-border)] last:border-b-0">
      <div className="sticky left-0 z-10 flex w-[240px] shrink-0 flex-col justify-center gap-2 border-r border-[var(--pl-border)] bg-[rgba(255,255,255,0.98)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--pl-text-primary)]">
              {row.equipment_name}
            </div>
            <div className="text-xs leading-5 text-[var(--pl-text-secondary)]">
              {row.equipment_code}
            </div>
          </div>
          <Badge
            tone={
              row.equipment_mode === "SS"
                ? "warning"
                : row.equipment_mode === "SUS"
                  ? "accent"
                  : "neutral"
            }
          >
            {row.equipment_mode}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--pl-text-tertiary)]">
          <span>{formatDomainLabel(row.domain_code)}</span>
          <span>{row.main_operations.length} 主工序</span>
          <span>{row.aux_operations.length} 辅助</span>
          <span>{row.risk_markers.length} 风险</span>
        </div>
      </div>

      <div className="relative h-[122px]" style={{ width: timelineWidth }}>
        {buildTimelineCells(
          zoomLevel,
          horizonStart,
          horizonEnd,
          config.minorMinutes,
          config.pixelsPerMinute,
          headerFormatterByZoom[zoomLevel].minor,
        ).map((cell) => (
          <div
            className="absolute inset-y-0 border-r border-dashed border-[rgba(112,120,138,0.14)]"
            key={`grid-${row.equipment_code}-${cell.key}`}
            style={{ left: cell.left, width: cell.width }}
          />
        ))}

        {row.context_windows.map((window) => {
          const position = toPosition(window.start_datetime, window.end_datetime);
          return (
            <button
              className={cn(
                "absolute inset-y-2 rounded-[10px] border transition-colors",
                contextWindowClassName[window.window_type],
              )}
              key={window.window_key}
              onClick={() => onSelectContextWindow(window)}
              style={{
                left: position.left,
                width: position.width,
              }}
              title={window.label}
              type="button"
            />
          );
        })}

        <div className="absolute inset-x-0 top-0 h-[44px] border-b border-[rgba(112,120,138,0.14)]">
          {row.main_operations.map((operation) => {
            const position = toPosition(
              operation.start_datetime,
              operation.end_datetime,
            );
            const dragEnabled = zoomLevel === "hour" || zoomLevel === "minute";

            return (
              <button
                className={cn(
                  "absolute top-2 inline-flex h-8 items-center rounded-[12px] border px-3 text-left text-xs font-medium shadow-[var(--pl-shadow-soft)] transition-colors",
                  operationBarClassName.MAIN,
                  operation.is_user_adjusted
                    ? "ring-2 ring-[rgba(11,106,162,0.18)]"
                    : "",
                  dragEnabled ? "cursor-grab active:cursor-grabbing" : "",
                )}
                key={operation.operation_key}
                onClick={() => onSelectOperation(operation)}
                onPointerDown={(event) =>
                  dragEnabled ? onOperationPointerDown(event, operation) : undefined
                }
                style={{
                  left: position.left,
                  width: Math.max(position.width, 32),
                }}
                title={`${operation.operation_name} | ${formatRange(operation.start_datetime, operation.end_datetime)}`}
                type="button"
              >
                <span className="truncate">{operation.operation_name}</span>
              </button>
            );
          })}
        </div>

        <div className="absolute inset-x-0 top-[44px] h-[32px] border-b border-[rgba(112,120,138,0.14)]">
          {row.aux_operations.map((operation) => {
            const position = toPosition(operation.start_datetime, operation.end_datetime);

            return (
              <button
                className={cn(
                  "absolute top-2 inline-flex h-[14px] items-center rounded-full border px-2 text-[10px] font-medium shadow-[var(--pl-shadow-soft)] transition-colors",
                  operationBarClassName.AUXILIARY,
                )}
                key={operation.operation_key}
                onClick={() => onSelectOperation(operation)}
                style={{
                  left: position.left,
                  width: Math.max(position.width, 20),
                }}
                title={`${operation.operation_name} | ${formatRange(operation.start_datetime, operation.end_datetime)}`}
                type="button"
              >
                {position.width > 72 ? (
                  <span className="truncate">{operation.operation_name}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          className="absolute inset-x-0 bottom-0 h-[46px] cursor-crosshair"
          onPointerDown={onStateBandPointerDown}
          role="presentation"
        >
          {row.state_segments.map((segment) => {
            const position = toPosition(segment.start_datetime, segment.end_datetime);
            const isManual = segment.metadata.origin === "manual_draft";

            return (
              <button
                className={cn(
                  "absolute top-4 inline-flex h-[12px] items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.08em]",
                  stateToneClassName[segment.state_code],
                  isManual
                    ? "border border-[rgba(11,106,162,0.32)] ring-1 ring-[rgba(11,106,162,0.18)]"
                    : "",
                )}
                key={segment.segment_key}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectStateSegment(segment);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{
                  left: position.left,
                  width: Math.max(position.width, 14),
                }}
                title={`${segment.state_code} | ${formatRange(segment.start_datetime, segment.end_datetime)}`}
                type="button"
              >
                {position.width > 80 ? segment.state_code : null}
              </button>
            );
          })}
        </div>

        {row.risk_markers.map((risk) => {
          const windowStart = risk.window_start_datetime ?? risk.window_end_datetime;
          const windowEnd = risk.window_end_datetime ?? risk.window_start_datetime;

          if (!windowStart || !windowEnd) {
            return null;
          }

          const position = toPosition(windowStart, windowEnd);

          return (
            <button
              className={cn(
                "absolute inset-y-2 rounded-[10px] border-2 transition-colors",
                riskToneClassName[risk.severity],
              )}
              key={risk.risk_code}
              onClick={() => onSelectRisk(risk)}
              style={{
                left: position.left,
                width: Math.max(position.width, 3),
              }}
              title={risk.message}
              type="button"
            >
              <span className="sr-only">{risk.message}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "success" | "danger";
  value: string;
}) {
  return (
    <div className="rounded-[var(--pl-radius-lg)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.84)] px-5 py-4 shadow-[var(--pl-shadow-soft)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
            {label}
          </div>
          <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[var(--pl-text-primary)]">
            {value}
          </div>
        </div>
        <Badge tone={tone}>{tone}</Badge>
      </div>
    </div>
  );
}
