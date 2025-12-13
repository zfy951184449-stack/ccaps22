import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  Button,
  Spin,
  Empty,
  Alert,
  Tag,
  Space,
  Typography,
  Tree,
  Tooltip,
  Divider,
  Select,
  DatePicker,
  Input,
  Checkbox,
  Slider,
  Modal,
  Drawer,
  Form,
  InputNumber,
  Descriptions,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import dayjs from 'dayjs';
import axios from 'axios';
import classNames from 'classnames';
import './ActivatedBatchGantt.css';
import { SyncOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

const TOKENS = {
  primary: '#2563EB',
  secondary: '#64748B',
  alert: '#DC2626',
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#374151'
} as const;

type DayjsInstance = ReturnType<typeof dayjs>;

const { RangePicker } = DatePicker;

const { Text } = Typography;

interface ActiveOperation {
  operation_plan_id: number;
  batch_id: number;
  batch_code: string;
  batch_name: string;
  batch_color?: string;
  plan_status: string;
  stage_name: string;
  stage_id?: number;
  stage_start_day?: number | null;
  operation_name: string;
  planned_start_datetime: string;
  planned_end_datetime: string;
  planned_duration: number;
  window_start_datetime?: string | null;
  window_end_datetime?: string | null;
  required_people: number;
  assigned_people: number;
  assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED' | string;
  operation_type?: string;
  is_locked?: number | boolean;
  lock_reason?: string | null;
  locked_at?: string | null;
  locked_by?: number | null;
}

interface OperationDetailAssignedPersonnel {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  assignment_status: string;
  role: string;
  is_primary: 0 | 1 | boolean;
}

interface OperationDetailResponse extends ActiveOperation {
  assigned_personnel: OperationDetailAssignedPersonnel[];
}

interface RecommendedPersonnel {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  department?: string;
  qualifications?: string;
  match_score: number;
  recommendation: string;
  has_conflict?: boolean;
}

export interface ActivatedBatchGanttActionRequest {
  operationPlanId: number;
  action: 'focus' | 'assign';
  requestedAt?: number;
}

interface ActivatedBatchGanttProps {
  visible: boolean;
  onClose: () => void;
  actionRequest?: ActivatedBatchGanttActionRequest | null;
  onActionHandled?: () => void;
}

interface BatchConstraintEdge {
  constraint_id: number;
  batch_plan_id: number;
  batch_operation_plan_id: number;
  predecessor_batch_operation_plan_id: number;
  constraint_type: number;
  time_lag: number;
  constraint_level?: number | null;
  share_personnel?: number | null;
  constraint_name?: string | null;
  description?: string | null;
}

type NodeType = 'batch' | 'stage' | 'lane';

type LaneType = 'PREP' | 'PROCESS' | 'MONITOR';

interface LaneData {
  laneType: LaneType;
  laneIndex: number;
  operations: ActiveOperation[];
}

type StageGrouping = {
  stageId?: number;
  stageName: string;
  startDay: number | null;
  operations: ActiveOperation[];
  earliestOperationMs: number;
  order: number;
};

interface TreeNodeMeta {
  key: string;
  type: NodeType;
  batchId: number;
  stageKey?: string;
  stageName?: string;
  laneData?: LaneData;
}

interface StageRow {
  key: string;
  batchId: number;
  batchCode: string;
  batchName: string;
  batchColor?: string;
  stageName: string;
  operations: ActiveOperation[];
  start: DayjsInstance;
  end: DayjsInstance;
}

interface LaneRow {
  key: string;
  batchId: number;
  batchCode: string;
  batchName: string;
  batchColor: string;
  stageKey: string;
  stageName: string;
  laneType: LaneType;
  laneIndex: number;
  operations: ActiveOperation[];
  start: DayjsInstance;
  end: DayjsInstance;
}

interface BatchRow {
  key: string;
  batchId: number;
  batchCode: string;
  batchName: string;
  batchColor: string;
  start: DayjsInstance;
  end: DayjsInstance;
  stageCount: number;
  operationCount: number;
}

const ROW_HEIGHT = 28;
const BASE_DAY_WIDTH = 120;

const DEFAULT_COLORS = ['#2563EB', '#0F766E', '#D97706', '#B91C1C', '#7C3AED'];

const applyAlpha = (hexColor: string, alpha = 0.15) => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return `rgba(37, 99, 235, ${alpha})`;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const assignLanes = (operations: ActiveOperation[]) => {
  const lanes: ActiveOperation[][] = [];
  const sortedOps = [...operations].sort((a, b) =>
    dayjs(a.planned_start_datetime).valueOf() - dayjs(b.planned_start_datetime).valueOf()
  );

  sortedOps.forEach(op => {
    let placed = false;
    const opStart = dayjs(op.planned_start_datetime).valueOf();

    for (let i = 0; i < lanes.length; i++) {
      const lastOp = lanes[i][lanes[i].length - 1];
      const lastEnd = dayjs(lastOp.planned_end_datetime).valueOf();
      if (lastEnd <= opStart) {
        lanes[i].push(op);
        placed = true;
        break;
      }
    }

    if (!placed) {
      lanes.push([op]);
    }
  });

  return lanes;
};

// Helper function to calculate effective hours between two times, skipping non-work hours (21:00-09:00)
const getEffectiveHours = (
  from: DayjsInstance,
  to: DayjsInstance,
  hideNonWorkHours: boolean,
): number => {
  if (!hideNonWorkHours) {
    return to.diff(from, 'hour', true);
  }

  let effectiveHours = 0;
  let current = from.clone();

  while (current.isBefore(to)) {
    const hour = current.hour();
    const minute = current.minute();

    // Work hours: 09:00-21:00
    if (hour >= 9 && hour < 21) {
      // Calculate how much time until end of work day or target time
      const endOfWorkDay = current.clone().hour(21).minute(0).second(0);
      const nextBoundary = endOfWorkDay.isBefore(to) ? endOfWorkDay : to;

      effectiveHours += nextBoundary.diff(current, 'hour', true);
      current = nextBoundary;
    } else {
      // Skip to next work period
      if (hour < 9 || (hour === 9 && minute === 0)) {
        // Before 9am, skip to 9am same day
        current = current.hour(9).minute(0).second(0).millisecond(0);
      } else {
        // After 9pm, skip to 9am next day
        current = current.add(1, 'day').hour(9).minute(0).second(0).millisecond(0);
      }

      // If we skipped past the target, break
      if (current.isAfter(to)) {
        break;
      }
    }
  }

  return effectiveHours;
};

const addEffectiveHours = (
  time: DayjsInstance,
  hoursToAdd: number,
  hideNonWorkHours: boolean,
): DayjsInstance => {
  if (!hideNonWorkHours) {
    return time.add(hoursToAdd, 'hour');
  }

  let remaining = Math.abs(hoursToAdd);
  const isAdding = hoursToAdd >= 0;
  let current = time.clone();

  // Normalize start
  const h = current.hour();
  if (h >= 21) {
    current = isAdding
      ? current.add(1, 'day').hour(9).minute(0).second(0).millisecond(0)
      : current.hour(21).minute(0).second(0).millisecond(0);
  } else if (h < 9) {
    current = isAdding
      ? current.hour(9).minute(0).second(0).millisecond(0)
      : current.subtract(1, 'day').hour(21).minute(0).second(0).millisecond(0);
  }

  while (remaining > 0.001) {
    if (isAdding) {
      const endOfDay = current.clone().hour(21).minute(0).second(0).millisecond(0);
      const available = endOfDay.diff(current, 'hour', true);

      if (remaining <= available) {
        return current.add(remaining, 'hour');
      }

      remaining -= available;
      current = current.add(1, 'day').hour(9).minute(0).second(0).millisecond(0);
    } else {
      const startOfDay = current.clone().hour(9).minute(0).second(0).millisecond(0);
      const available = current.diff(startOfDay, 'hour', true);

      if (remaining <= available) {
        return current.subtract(remaining, 'hour');
      }

      remaining -= available;
      current = current.subtract(1, 'day').hour(21).minute(0).second(0).millisecond(0);
    }
  }

  return current;
};

const buildTreeData = (operations: ActiveOperation[]) => {
  const batchMap = new Map<
    number,
    {
      sample: ActiveOperation;
      stageMap: Map<string, StageGrouping>;
    }
  >();

  operations.forEach((op) => {
    if (!batchMap.has(op.batch_id)) {
      batchMap.set(op.batch_id, {
        sample: op,
        stageMap: new Map<
          string,
          {
            stageId?: number;
            stageName: string;
            startDay: number | null;
            operations: ActiveOperation[];
            earliestOperationMs: number;
            order: number;
          }
        >(),
      });
    }
    const stageMap = batchMap.get(op.batch_id)!.stageMap;
    const stageId =
      op.stage_id !== undefined && op.stage_id !== null
        ? Number(op.stage_id)
        : undefined;
    const stageKeyBase =
      stageId !== undefined ? `id-${stageId}` : `name-${op.stage_name}`;
    if (!stageMap.has(stageKeyBase)) {
      const insertionOrder = stageMap.size;
      const startDayRaw =
        op.stage_start_day !== undefined && op.stage_start_day !== null
          ? Number(op.stage_start_day)
          : null;
      stageMap.set(stageKeyBase, {
        stageId,
        stageName: op.stage_name,
        startDay:
          typeof startDayRaw === 'number' && Number.isFinite(startDayRaw)
            ? startDayRaw
            : null,
        operations: [],
        earliestOperationMs: Number.POSITIVE_INFINITY,
        order: insertionOrder,
      });
    }
    const stageEntry = stageMap.get(stageKeyBase)!;
    if (
      stageEntry.startDay === null &&
      op.stage_start_day !== undefined &&
      op.stage_start_day !== null
    ) {
      const candidateStartDay = Number(op.stage_start_day);
      if (Number.isFinite(candidateStartDay)) {
        stageEntry.startDay = candidateStartDay;
      }
    }
    stageEntry.operations.push(op);
    const opStartMs = dayjs(op.planned_start_datetime).valueOf();
    stageEntry.earliestOperationMs = Math.min(
      stageEntry.earliestOperationMs,
      opStartMs,
    );
  });

  const nodes: DataNode[] = [];
  const stageRowMap = new Map<string, StageRow>();
  const laneRowMap = new Map<string, LaneRow>();
  const batchRowMap = new Map<string, BatchRow>();
  const nodeMeta = new Map<string, TreeNodeMeta>();
  const expandedKeys: string[] = [];

  Array.from(batchMap.entries())
    .map(([batchId, value]) => ({
      batchId,
      ...value,
    }))
    .sort((a, b) =>
      dayjs(a.sample.planned_start_datetime).valueOf() -
      dayjs(b.sample.planned_start_datetime).valueOf(),
    )
    .forEach(({ batchId, sample, stageMap }, batchIndex) => {
      const batchKey = `batch-${batchId}`;
      nodeMeta.set(batchKey, {
        key: batchKey,
        type: 'batch',
        batchId,
      });

      const stageNodes: DataNode[] = [];
      let batchStart: DayjsInstance | null = null;
      let batchEnd: DayjsInstance | null = null;
      let opCount = 0;

      const stageEntries = Array.from(stageMap.entries()).map(
        ([mapKey, entry]) => ({
          mapKey,
          stageId: entry.stageId,
          stageName: entry.stageName,
          startDay: entry.startDay,
          operations: entry.operations,
          earliestOperationMs: entry.earliestOperationMs,
          order: entry.order,
        }),
      );

      stageEntries
        .sort((a, b) => {
          const aStart = Number.isFinite(a.startDay ?? NaN)
            ? (a.startDay as number)
            : Number.POSITIVE_INFINITY;
          const bStart = Number.isFinite(b.startDay ?? NaN)
            ? (b.startDay as number)
            : Number.POSITIVE_INFINITY;
          if (aStart !== bStart) {
            return aStart - bStart;
          }
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.stageName.localeCompare(b.stageName, 'zh-CN');
        })
        .forEach((stageEntry, stageIndex) => {
          const stageIdentifier =
            stageEntry.stageId !== undefined
              ? stageEntry.stageId
              : stageEntry.mapKey;
          const stageKey = `${batchKey}-stage-${stageIdentifier}`;
          const stageName = stageEntry.stageName;
          nodeMeta.set(stageKey, {
            key: stageKey,
            type: 'stage',
            batchId,
            stageName,
          });

          // Group operations by type - strict type checking
          const prepOps = stageEntry.operations.filter(op => op.operation_type === 'PREP');
          const processOps = stageEntry.operations.filter(op =>
            op.operation_type === null ||
            op.operation_type === undefined ||
            op.operation_type === '' ||
            op.operation_type === 'PROCESS'
          );
          const monitorOps = stageEntry.operations.filter(op => op.operation_type === 'MONITOR');

          // Assign lanes for each group
          const prepLanes = assignLanes(prepOps);
          const processLanes = assignLanes(processOps);
          const monitorLanes = assignLanes(monitorOps);

          const laneNodes: DataNode[] = [];

          // Helper to create lane nodes
          const createLaneNodes = (lanes: ActiveOperation[][], type: LaneType, labelPrefix: string) => {
            lanes.forEach((laneOps, index) => {
              const laneKey = `${stageKey}-lane-${type}-${index}`;
              const laneLabel = lanes.length > 1 ? `${labelPrefix} ${index + 1}` : labelPrefix;

              nodeMeta.set(laneKey, {
                key: laneKey,
                type: 'lane',
                batchId,
                stageKey,
                stageName,
                laneData: {
                  laneType: type,
                  laneIndex: index,
                  operations: laneOps
                }
              });

              // Calculate lane start/end
              let laneStart = dayjs(laneOps[0].planned_start_datetime);
              let laneEnd = dayjs(laneOps[0].planned_end_datetime);
              laneOps.forEach(op => {
                const s = dayjs(op.planned_start_datetime);
                const e = dayjs(op.planned_end_datetime);
                if (s.isBefore(laneStart)) laneStart = s;
                if (e.isAfter(laneEnd)) laneEnd = e;
              });

              laneRowMap.set(laneKey, {
                key: laneKey,
                batchId,
                batchCode: sample.batch_code,
                batchName: sample.batch_name,
                batchColor: sample.batch_color || DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
                stageKey,
                stageName,
                laneType: type,
                laneIndex: index,
                operations: laneOps,
                start: laneStart,
                end: laneEnd
              });

              laneNodes.push({
                key: laneKey,
                title: (
                  <div className="abg-tree-node">
                    <div className="abg-tree-line abg-tree-line-primary">
                      <span className="abg-tree-status-dot" style={{ background: 'transparent' }} />
                      <span className="abg-tree-operation-name" style={{ fontWeight: 400, color: '#666' }}>
                        {laneLabel}
                      </span>
                      <span className="abg-tree-line-spacer" />
                      <span className="abg-tree-chip abg-tree-chip-muted">
                        {laneOps.length}
                      </span>
                    </div>
                  </div>
                ),
                isLeaf: true,
              });
            });
          };

          if (prepLanes.length > 0) createLaneNodes(prepLanes, 'PREP', '准备');
          if (processLanes.length > 0) createLaneNodes(processLanes, 'PROCESS', '工艺');
          if (monitorLanes.length > 0) createLaneNodes(monitorLanes, 'MONITOR', '监控');

          // Calculate stage bounds
          const allOps = [...prepOps, ...processOps, ...monitorOps];
          if (allOps.length > 0) {
            const sortedAll = [...allOps].sort((a, b) =>
              dayjs(a.planned_start_datetime).valueOf() - dayjs(b.planned_start_datetime).valueOf()
            );
            const stageStartDay = dayjs(sortedAll[0].planned_start_datetime).startOf('day');
            const stageEndDay = dayjs(sortedAll[sortedAll.length - 1].planned_end_datetime).endOf('day');

            if (!batchStart || stageStartDay.isBefore(batchStart)) batchStart = stageStartDay;
            if (!batchEnd || stageEndDay.isAfter(batchEnd)) batchEnd = stageEndDay;

            stageRowMap.set(stageKey, {
              key: stageKey,
              batchId,
              batchCode: sample.batch_code,
              batchName: sample.batch_name,
              batchColor: sample.batch_color || DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
              stageName,
              operations: allOps,
              start: stageStartDay,
              end: stageEndDay,
            });
          }

          opCount += allOps.length;

          stageNodes.push({
            key: stageKey,
            title: (
              <div className="abg-tree-node">
                <div className="abg-tree-line abg-tree-line-primary">
                  <span
                    className="abg-tree-stage-dot"
                    style={{
                      background:
                        sample.batch_color ||
                        DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
                    }}
                  />
                  <span className="abg-tree-stage-name">{stageName}</span>
                  <span className="abg-tree-line-spacer" />
                  <span className="abg-tree-chip abg-tree-chip-muted">
                    {allOps.length} 操作
                  </span>
                </div>
                <div className="abg-tree-line abg-tree-line-secondary">
                  {allOps.length > 0 && (
                    <span>
                      {dayjs(allOps[0].planned_start_datetime).format('MM/DD')} - {dayjs(allOps[allOps.length - 1].planned_end_datetime).format('MM/DD')}
                    </span>
                  )}
                </div>
              </div>
            ),
            children: laneNodes,
          });
        });

      const batchStartText = batchStart
        ? (batchStart as DayjsInstance).startOf('day').format('MM/DD')
        : null;
      const batchEndText = batchEnd
        ? (batchEnd as DayjsInstance).endOf('day').format('MM/DD')
        : null;

      nodes.push({
        key: batchKey,
        title: (
          <div className="abg-tree-node">
            <div className="abg-tree-line abg-tree-line-primary">
              <span
                className="abg-tree-color-dot"
                style={{
                  background:
                    sample.batch_color ||
                    DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
                }}
              />
              <span className="abg-tree-batch-code">{sample.batch_code}</span>
              <span className="abg-tree-meta-divider">｜</span>
              <span className="abg-tree-batch-name">{sample.batch_name}</span>
            </div>
            <div className="abg-tree-line abg-tree-line-secondary">
              {batchStartText && batchEndText && (
                <>
                  <span>
                    {batchStartText} - {batchEndText}
                  </span>
                </>
              )}
              <span className="abg-tree-meta-divider">｜</span>
              <span>阶段 {stageNodes.length}</span>
              <span className="abg-tree-meta-divider">｜</span>
              <span>操作 {opCount}</span>
            </div>
          </div>
        ),
        children: stageNodes,
      });

      if (batchStart && batchEnd) {
        batchRowMap.set(batchKey, {
          key: batchKey,
          batchId,
          batchCode: sample.batch_code,
          batchName: sample.batch_name,
          batchColor:
            sample.batch_color ||
            DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
          start: batchStart,
          end: batchEnd,
          stageCount: stageNodes.length,
          operationCount: opCount,
        });
      }

      expandedKeys.push(batchKey);
      stageNodes.forEach((stageNode) =>
        expandedKeys.push(stageNode.key as string),
      );
    });

  const uniqueExpanded = Array.from(new Set(expandedKeys));
  return {
    treeData: nodes,
    stageRowMap,
    laneRowMap,
    batchRowMap,
    nodeMeta,
    expandedKeys: uniqueExpanded,
  };
};

const ActivatedBatchGantt: React.FC<ActivatedBatchGanttProps> = ({
  visible,
  onClose,
  actionRequest,
  onActionHandled,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<ActiveOperation[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [visibleRows, setVisibleRows] = useState<string[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingOperationId, setDraggingOperationId] = useState<number | null>(null);
  const [dragPreviewStart, setDragPreviewStart] = useState<DayjsInstance | null>(null);
  const operationDragStateRef = useRef<{
    startX: number;
    originalStart: DayjsInstance;
    duration: number;
  } | null>(null);
  const [timelineViewportHeight, setTimelineViewportHeight] = useState(600);
  const [timelineScrollTop, setTimelineScrollTop] = useState(0);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[DayjsInstance, DayjsInstance] | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState({
    unassigned: true,
    partial: true,
    complete: true,
  });
  const [zoom, setZoom] = useState(1);
  const [hideNonWorkHours, setHideNonWorkHours] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOperationRow, setEditingOperationRow] = useState<ActiveOperation | null>(
    null,
  );
  const [savingOperation, setSavingOperation] = useState(false);
  const [editForm] = Form.useForm();
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const axisScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [batchConstraints, setBatchConstraints] = useState<BatchConstraintEdge[]>([]);
  const [operationDetail, setOperationDetail] = useState<OperationDetailResponse | null>(null);
  const [operationDetailLoading, setOperationDetailLoading] = useState(false);
  const [operationDetailError, setOperationDetailError] = useState<string | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignCandidates, setAssignCandidates] = useState<RecommendedPersonnel[]>([]);
  const [assignSelectedIds, setAssignSelectedIds] = useState<number[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const [operationDetailDrawerVisible, setOperationDetailDrawerVisible] = useState(false);
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
  const [laborHover, setLaborHover] = useState<{
    dayIndex: number;
    label: string;
    required: number;
    assigned: number;
    x: number;
    y: number;
  } | null>(null);

  const actionRequestRef = useRef<ActivatedBatchGanttActionRequest | null>(null);
  const pendingAssignRef = useRef(false);

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<ActiveOperation[]>(
        '/api/calendar/operations/active',
      );
      console.log('Loaded operations:', response.data.length);
      setOperations(response.data);
    } catch (err) {
      console.error('Failed to load active batch operations', err);
      setError('加载激活批次操作数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    loadOperations();
  }, [loadOperations]);

  const handleResetFilters = useCallback(() => {
    setSelectedBatchIds([]);
    setDateRange(null);
    setStatusFilter({ unassigned: true, partial: true, complete: true });
    setZoom(1);
  }, []);

  useEffect(() => {
    if (!visible) {
      setBatchConstraints([]);
      return;
    }
    loadOperations();
  }, [visible, loadOperations]);

  useEffect(() => {
    if (!visible) {
      setEditModalVisible(false);
      setEditingOperationRow(null);
      editForm.resetFields();
    }
  }, [visible, editForm]);

  const batchOptions = useMemo(
    () =>
      Array.from(
        operations.reduce(
          (map, op) => map.set(op.batch_id, op.batch_code),
          new Map<number, string>(),
        ),
      ).map(([value, label]) => ({ value, label })),
    [operations],
  );

  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      const matchBatch =
        selectedBatchIds.length === 0 || selectedBatchIds.includes(op.batch_id);

      const opStart = dayjs(op.planned_start_datetime);
      const opEnd = dayjs(op.planned_end_datetime);
      let matchDate = true;
      if (dateRange) {
        const [start, end] = dateRange;
        const rangeStart = start.startOf('day');
        const rangeEnd = end.endOf('day');
        matchDate = !opEnd.isBefore(rangeStart) && !opStart.isAfter(rangeEnd);
      }

      const normalizedStatus = (op.assignment_status || '').toUpperCase();
      let statusAllowed = false;
      if (normalizedStatus === 'UNASSIGNED') {
        statusAllowed = statusFilter.unassigned;
      } else if (normalizedStatus === 'PARTIAL') {
        statusAllowed = statusFilter.partial;
      } else if (normalizedStatus === 'COMPLETE') {
        statusAllowed = statusFilter.complete;
      } else {
        statusAllowed = true;
      }

      return matchBatch && matchDate && statusAllowed;
    });
  }, [
    operations,
    selectedBatchIds,
    dateRange,
    statusFilter.unassigned,
    statusFilter.partial,
    statusFilter.complete,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const uniqueBatchIds = Array.from(
      filteredOperations.reduce((set, op) => set.add(op.batch_id), new Set<number>()),
    );
    if (!uniqueBatchIds.length) {
      setBatchConstraints([]);
      return;
    }
    let cancelled = false;
    const loadConstraints = async () => {
      try {
        const responses = await Promise.all(
          uniqueBatchIds.map((id) => axios.get<BatchConstraintEdge[]>(`/api/constraints/batch/${id}/gantt`)),
        );
        if (!cancelled) {
          const normalized = responses.flatMap((res) =>
            res.data.map((edge) => ({
              ...edge,
              constraint_type: Number(edge.constraint_type) || 1,
              time_lag:
                edge.time_lag === null || edge.time_lag === undefined
                  ? 0
                  : Number(edge.time_lag),
            })),
          );
          setBatchConstraints(normalized);
        }
      } catch (error) {
        console.error('Failed to load batch constraints', error);
        if (!cancelled) {
          setBatchConstraints([]);
        }
      }
    };
    loadConstraints();
    return () => {
      cancelled = true;
    };
  }, [visible, filteredOperations]);

  const {
    treeData,
    stageRowMap,
    laneRowMap,
    batchRowMap,
    nodeMeta,
    expandedKeys: defaultExpanded,
  } = useMemo(() => buildTreeData(filteredOperations), [filteredOperations]);

  const dayWidth = useMemo(() => BASE_DAY_WIDTH * zoom, [zoom]);

  const handleZoomChange = (value: number | number[]) => {
    const numeric = Array.isArray(value) ? value[0] : value;
    setZoom(numeric);
  };

  const handleDragMouseMove = useCallback(
    (event: MouseEvent) => {
      const state = dragStateRef.current;
      const timelineEl = timelineScrollRef.current;
      if (!state || !timelineEl) {
        return;
      }

      const deltaX = state.startX - event.clientX;
      const deltaY = state.startY - event.clientY;

      if (!state.dragging) {
        if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) {
          return;
        }
        state.dragging = true;
        setIsDragging(true);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      const nextLeft = state.startScrollLeft + deltaX;
      const nextTop = state.startScrollTop + deltaY;

      syncingRef.current = true;
      timelineEl.scrollLeft = nextLeft;
      timelineEl.scrollTop = nextTop;

      if (treeScrollRef.current) {
        treeScrollRef.current.scrollTop = nextTop;
      }
      if (axisScrollRef.current) {
        axisScrollRef.current.scrollLeft = nextLeft;
      }

      event.preventDefault();
    },
    [axisScrollRef, setIsDragging, timelineScrollRef, treeScrollRef],
  );

  const handleDragMouseUp = useCallback(
    (event: MouseEvent) => {
      const state = dragStateRef.current;
      window.removeEventListener('mousemove', handleDragMouseMove);
      window.removeEventListener('mouseup', handleDragMouseUp);

      dragStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (state?.dragging) {
        suppressClickRef.current = true;
        event.preventDefault();
      }
      setIsDragging(false);
    },
    [handleDragMouseMove],
  );

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', handleDragMouseMove);
      window.removeEventListener('mouseup', handleDragMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    [handleDragMouseMove, handleDragMouseUp],
  );



  useEffect(() => {
    setExpandedKeys(defaultExpanded);
    setSelectedKeys([]);
    if (treeScrollRef.current) {
      treeScrollRef.current.scrollTop = 0;
    }
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = 0;
      timelineScrollRef.current.scrollLeft = 0;
    }
    if (axisScrollRef.current) {
      axisScrollRef.current.scrollLeft = 0;
    }
  }, [defaultExpanded]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const element = timelineScrollRef.current;
    if (!element) {
      return;
    }

    const updateViewport = () => {
      setTimelineViewportHeight(element.clientHeight || 600);
    };

    updateViewport();
    setTimelineScrollTop(element.scrollTop || 0);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateViewport);
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleWindowResize = () => updateViewport();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [visible]);

  const batchRows = useMemo(() => Array.from(batchRowMap.values()), [batchRowMap]);
  const stageRows = useMemo(() => Array.from(stageRowMap.values()), [stageRowMap]);

  const batchLegend = useMemo(() => {
    const legend = new Map<
      number,
      { code: string; name: string; color: string }
    >();

    stageRows.forEach((row, index) => {
      legend.set(row.batchId, {
        code: row.batchCode,
        name: row.batchName,
        color: row.batchColor || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      });
    });

    return Array.from(legend.values());
  }, [stageRows]);

  const summaryStats = useMemo(() => {
    let fullyStaffed = 0;
    let locked = 0;
    filteredOperations.forEach((operation) => {
      if ((operation.assigned_people ?? 0) >= (operation.required_people ?? 0)) {
        fullyStaffed += 1;
      }
      if (operation.is_locked) {
        locked += 1;
      }
    });
    const total = filteredOperations.length;
    const conflict = Math.max(total - fullyStaffed, 0);
    const completion = total ? Math.round((fullyStaffed / total) * 100) : 0;
    return {
      total,
      fullyStaffed,
      conflict,
      locked,
      completion,
    };
  }, [filteredOperations]);

  const totalBatchCount = batchLegend.length;

  const selectedKey = selectedKeys[0];
  const selectedMeta = selectedKey ? nodeMeta.get(selectedKey) : null;
  const selectedOperationRow = useMemo(() => {
    if (selectedKey && selectedKey.startsWith('operation-')) {
      const id = parseInt(selectedKey.replace('operation-', ''), 10);
      return operations.find((op) => op.operation_plan_id === id) || null;
    }
    return null;
  }, [selectedKey, operations]);
  const selectedStageRow =
    selectedMeta?.type === 'stage'
      ? stageRowMap.get(selectedMeta.key)
      : selectedOperationRow
        ? stageRowMap.get(`${selectedOperationRow.batch_id}-${selectedOperationRow.stage_name}`) // Assuming stage key format
        : null;

  useEffect(() => {
    let cancelled = false;
    if (selectedMeta?.type === 'lane' && selectedOperationRow) {
      // Lane selection logic if needed
      return;
    }

    if (selectedOperationRow) {
      setOperationDetailLoading(true);
      setOperationDetailError(null);

      axios.get(`/api/calendar/operations/${selectedOperationRow.operation_plan_id}/detail`)
        .then(response => {
          if (!cancelled) {
            setOperationDetail(response.data);
          }
        })
        .catch(err => {
          if (!cancelled) {
            setOperationDetailError('加载详情失败');
            console.error(err);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setOperationDetailLoading(false);
          }
        });
    } else {
      setOperationDetail(null);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedMeta?.type, selectedOperationRow]);

  useEffect(() => {
    if (assignModalVisible && operationDetail?.assigned_personnel) {
      setAssignSelectedIds(
        operationDetail.assigned_personnel.map((person) => person.employee_id),
      );
    }
  }, [assignModalVisible, operationDetail]);

  useEffect(() => {
    if (actionRequest) {
      actionRequestRef.current = actionRequest;
    }
  }, [actionRequest]);

  useEffect(() => {
    const request = actionRequestRef.current;
    if (!request || !visible) {
      return;
    }
    if (!operations.length) {
      return;
    }

    const operationKey = `operation-${request.operationPlanId}`;
    const meta = nodeMeta.get(operationKey);
    if (!meta) {
      pendingAssignRef.current = false;
      actionRequestRef.current = null;
      message.warning('未在激活批次中找到该操作');
      onActionHandled?.();
      return;
    }

    const stageKey = meta.stageKey;
    const batchKey = stageKey ? stageKey.split('-stage-')[0] : `batch-${meta.batchId}`;

    setSelectedBatchIds([meta.batchId]);
    setDateRange(null);
    setStatusFilter({ unassigned: true, partial: true, complete: true });

    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.add(batchKey);
      if (stageKey) {
        next.add(stageKey);
      }
      return Array.from(next);
    });

    setSelectedKeys([operationKey]);
    setPendingScrollKey(operationKey);

    if (request.action === 'assign') {
      pendingAssignRef.current = true;
    } else {
      pendingAssignRef.current = false;
    }

    actionRequestRef.current = null;
    onActionHandled?.();
  }, [
    visible,
    operations,
    nodeMeta,
    onActionHandled,
  ]);

  const timeMetrics = useMemo(() => {
    if (!filteredOperations.length) {
      return null;
    }
    const sorted = [...filteredOperations].sort(
      (a, b) =>
        dayjs(a.planned_start_datetime).valueOf() -
        dayjs(b.planned_start_datetime).valueOf(),
    );
    const minStart = dayjs(sorted[0].planned_start_datetime).startOf('day');
    const maxEnd = sorted.reduce((max, op) => {
      const end = dayjs(op.planned_end_datetime);
      return end.isAfter(max) ? end : max;
    }, dayjs(sorted[0].planned_end_datetime));
    const totalDays = Math.max(maxEnd.endOf('day').diff(minStart, 'day') + 1, 1);
    return {
      minStart,
      maxEnd,
      totalDays,
    };
  }, [filteredOperations]);

  const handleDateRangeChange = (values: null | (DayjsInstance | null)[]) => {
    if (!values || values.length !== 2 || !values[0] || !values[1]) {
      setDateRange(null);
    } else {
      setDateRange([values[0], values[1]]);
    }
  };

  const resourceSummary = useMemo(() => {
    if (!timeMetrics) {
      return [] as {
        day: string;
        required: number;
        assigned: number;
      }[];
    }
    const summary = new Map<
      string,
      {
        required: number;
        assigned: number;
      }
    >();

    filteredOperations.forEach((op) => {
      const start = dayjs(op.planned_start_datetime).startOf('day');
      const end = dayjs(op.planned_end_datetime).startOf('day');
      const days = Math.max(end.diff(start, 'day'), 0);
      for (let i = 0; i <= days; i += 1) {
        const currentDay = start.add(i, 'day');
        const key = currentDay.format('YYYY-MM-DD');
        if (!summary.has(key)) {
          summary.set(key, { required: 0, assigned: 0 });
        }
        const entry = summary.get(key)!;
        entry.required += op.required_people;
        entry.assigned += Math.min(op.assigned_people, op.required_people);
      }
    });

    return Array.from(summary.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({ day, ...value }));
  }, [filteredOperations, timeMetrics]);

  const maxDailyRequired = useMemo(() => {
    return resourceSummary.reduce(
      (max, item) => Math.max(max, item.required),
      0,
    );
  }, [resourceSummary]);

  const collectVisibleRows = useCallback(
    (nodes: DataNode[]) => {
      const rows: string[] = [];
      const traverse = (items: DataNode[]) => {
        items.forEach((item) => {
          const key = item.key!.toString();
          rows.push(key);
          if (
            item.children &&
            expandedKeys.includes(key)
          ) {
            traverse(item.children as DataNode[]);
          }
        });
      };
      traverse(nodes);
      return rows;
    },
    [expandedKeys],
  );

  useEffect(() => {
    setVisibleRows(collectVisibleRows(treeData));
  }, [treeData, collectVisibleRows]);

  const laneKeys = useMemo(() => {
    return visibleRows.filter((key) => {
      const meta = nodeMeta.get(key);
      return meta?.type === 'batch' || meta?.type === 'stage' || meta?.type === 'lane';
    });
  }, [visibleRows, nodeMeta]);

  const hourWidth = useMemo(() => {
    if (!timeMetrics) return 0;
    // When hiding non-work hours (21:00-09:00), effective hours per day = 12 hours (09:00-21:00)
    // Otherwise, full 24 hours
    const hoursPerDay = hideNonWorkHours ? 12 : 24;
    return (dayWidth * zoom) / hoursPerDay;
  }, [dayWidth, zoom, timeMetrics, hideNonWorkHours]);

  const handleOperationDragMove = useCallback(
    (event: MouseEvent) => {
      const state = operationDragStateRef.current;
      if (!state) return;

      const deltaX = event.clientX - state.startX;
      const deltaHours = deltaX / hourWidth;

      const newStart = addEffectiveHours(
        state.originalStart,
        deltaHours,
        hideNonWorkHours,
      );

      setDragPreviewStart(newStart);
    },
    [hourWidth, hideNonWorkHours],
  );

  const handleOperationDragEnd = useCallback(
    async (event: MouseEvent) => {
      const state = operationDragStateRef.current;
      window.removeEventListener('mousemove', handleOperationDragMove);
      window.removeEventListener('mouseup', handleOperationDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (state && draggingOperationId) {
        const deltaX = event.clientX - state.startX;
        if (Math.abs(deltaX) > 5) {
          const deltaHours = deltaX / hourWidth;
          const newStart = addEffectiveHours(
            state.originalStart,
            deltaHours,
            hideNonWorkHours,
          );

          const op = operations.find(
            (o) => o.operation_plan_id === draggingOperationId,
          );
          if (op) {
            const originalStart = dayjs(op.planned_start_datetime);
            const originalEnd = dayjs(op.planned_end_datetime);
            let finalEnd: DayjsInstance;

            if (hideNonWorkHours) {
              const effectiveDuration = getEffectiveHours(
                originalStart,
                originalEnd,
                true,
              );
              finalEnd = addEffectiveHours(newStart, effectiveDuration, true);
            } else {
              const duration = originalEnd.diff(originalStart, 'hour', true);
              finalEnd = newStart.add(duration, 'hour');
            }

            try {
              console.log('Sending update schedule:', {
                id: draggingOperationId,
                start: newStart.format('YYYY-MM-DD HH:mm:ss'),
                end: finalEnd.format('YYYY-MM-DD HH:mm:ss')
              });
              await axios.put(
                `/api/calendar/operations/${draggingOperationId}/schedule`,
                {
                  planned_start_datetime: newStart.format('YYYY-MM-DD HH:mm:ss'),
                  planned_end_datetime: finalEnd.format('YYYY-MM-DD HH:mm:ss'),
                  required_people: op.required_people,
                },
              );
              message.success('操作已重新排程');
              console.log('Update success, reloading operations...');
              await loadOperations();
              console.log('Operations reloaded');
            } catch (e) {
              console.error('Update failed', e);
              message.error('排程更新失败');
            }
          }
        }
      }

      setDraggingOperationId(null);
      setDragPreviewStart(null);
      operationDragStateRef.current = null;
    },
    [
      draggingOperationId,
      operations,
      hourWidth,
      hideNonWorkHours,
      handleOperationDragMove,
      loadOperations,
    ],
  );

  const handleOperationDragStart = useCallback(
    (event: React.MouseEvent, op: ActiveOperation) => {
      event.preventDefault();
      event.stopPropagation();

      const start = dayjs(op.planned_start_datetime);

      setDraggingOperationId(op.operation_plan_id);
      setDragPreviewStart(start);

      operationDragStateRef.current = {
        startX: event.clientX,
        originalStart: start,
        duration: op.planned_duration,
      };

      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', handleOperationDragMove);
      window.addEventListener('mouseup', handleOperationDragEnd);
    },
    [handleOperationDragMove, handleOperationDragEnd],
  );

  const timelineWidth = useMemo(() => {
    if (!timeMetrics) {
      return 0;
    }
    return timeMetrics.totalDays * dayWidth;
  }, [timeMetrics, dayWidth]);

  const scrollToDay = useCallback(
    (dayIndex: number) => {
      if (!timelineScrollRef.current || !timeMetrics) {
        return;
      }
      const container = timelineScrollRef.current;
      const axis = axisScrollRef.current;
      const targetLeft = Math.max(dayIndex * dayWidth - container.clientWidth / 2, 0);
      syncingRef.current = true;
      container.scrollLeft = targetLeft;
      if (axis) {
        syncingRef.current = true;
        axis.scrollLeft = targetLeft;
      }
    },
    [dayWidth, timeMetrics],
  );

  const operationPositions = useMemo(() => {
    if (!timeMetrics) {
      return new Map<string, { centerY: number; left: number; right: number }>();
    }
    const map = new Map<string, { centerY: number; left: number; right: number }>();
    laneKeys.forEach((key, index) => {
      const meta = nodeMeta.get(key);
      if (meta?.type !== 'lane') {
        return;
      }
      const laneRow = laneRowMap.get(key);
      if (!laneRow || !laneRow.operations || laneRow.operations.length === 0) {
        return;
      }
      // Use first operation for lane position calculation
      const op = laneRow.operations[0];
      const start = dayjs(op.planned_start_datetime);
      const end = dayjs(op.planned_end_datetime);
      const left = start.diff(timeMetrics.minStart, 'hour', true) * hourWidth;
      const width = Math.max(end.diff(start, 'hour', true), 0.3) * hourWidth;
      map.set(key, {
        centerY: index * ROW_HEIGHT + ROW_HEIGHT / 2,
        left,
        right: left + width,
      });
    });
    return map;
  }, [laneKeys, nodeMeta, laneRowMap, timeMetrics, hourWidth]);

  useEffect(() => {
    if (!pendingScrollKey) {
      return;
    }

    const key = pendingScrollKey;
    const rowIndex = laneKeys.findIndex((laneKey) => laneKey === key);
    const containerHeight = timelineScrollRef.current?.clientHeight ?? 0;
    if (rowIndex >= 0) {
      const targetTop =
        rowIndex * ROW_HEIGHT -
        Math.max(containerHeight / 2 - ROW_HEIGHT / 2, 0);
      const normalizedTop = Math.max(targetTop, 0);
      if (timelineScrollRef.current) {
        syncingRef.current = true;
        timelineScrollRef.current.scrollTop = normalizedTop;
      }
      if (treeScrollRef.current) {
        syncingRef.current = true;
        treeScrollRef.current.scrollTop = normalizedTop;
      }
    }

    const position = operationPositions.get(key);
    if (position) {
      const container = timelineScrollRef.current;
      const axis = axisScrollRef.current;
      const center = (position.left + position.right) / 2;
      const viewWidth = container?.clientWidth ?? 0;
      const targetLeft = Math.max(center - viewWidth / 2, 0);
      if (container) {
        syncingRef.current = true;
        container.scrollLeft = targetLeft;
      }
      if (axis) {
        syncingRef.current = true;
        axis.scrollLeft = targetLeft;
      }
    }

    if (treeScrollRef.current) {
      const element = treeScrollRef.current.querySelector(
        `[data-key="${key}"]`,
      ) as HTMLElement | null;
      if (element?.scrollIntoView) {
        element.scrollIntoView({ block: 'center' });
      }
    }

    if (timelineScrollRef.current) {
      const rowElement = timelineScrollRef.current.querySelector(
        `[data-row-key="${key}"]`,
      ) as HTMLElement | null;
      if (rowElement?.scrollIntoView) {
        rowElement.scrollIntoView({ block: 'center', inline: 'center' });
      }
    }

    setPendingScrollKey(null);
  }, [pendingScrollKey, laneKeys, operationPositions]);

  const constraintLines = useMemo(() => {
    if (!timeMetrics || !batchConstraints.length) {
      return [] as {
        id: number;
        path: string;
        type: number;
        lag: number;
        labelX: number;
        labelY: number;
      }[];
    }
    const lines: {
      id: number;
      path: string;
      type: number;
      lag: number;
      labelX: number;
      labelY: number;
    }[] = [];
    batchConstraints.forEach((edge) => {
      const fromKey = `operation-${edge.predecessor_batch_operation_plan_id}`;
      const toKey = `operation-${edge.batch_operation_plan_id}`;
      const fromPos = operationPositions.get(fromKey);
      const toPos = operationPositions.get(toKey);
      if (!fromPos || !toPos) {
        return;
      }
      let startX = fromPos.right;
      let endX = toPos.left;
      switch (edge.constraint_type) {
        case 2: // SS
          startX = fromPos.left;
          endX = toPos.left;
          break;
        case 3: // FF
          startX = fromPos.right;
          endX = toPos.right;
          break;
        case 4: // SF
          startX = fromPos.left;
          endX = toPos.right;
          break;
        default: // FS
          startX = fromPos.right;
          endX = toPos.left;
          break;
      }
      const startY = fromPos.centerY;
      const endY = toPos.centerY;
      const baseOffset = 24;
      let firstCornerX: number;
      let secondCornerX: number;
      if (startX <= endX) {
        const available = Math.max(endX - startX, baseOffset);
        const offset = Math.min(available / 2, 48);
        firstCornerX = startX + Math.max(baseOffset, offset);
        secondCornerX = firstCornerX;
      } else {
        firstCornerX = startX + baseOffset;
        secondCornerX = endX - baseOffset;
        if (secondCornerX > firstCornerX) {
          const mid = (startX + endX) / 2;
          firstCornerX = mid;
          secondCornerX = mid;
        }
      }
      const path = `M ${startX} ${startY} L ${firstCornerX} ${startY} L ${secondCornerX} ${endY} L ${endX} ${endY}`;
      const labelX = startX <= endX
        ? (secondCornerX + endX) / 2
        : Math.min(secondCornerX, startX) - 12;
      const labelY = (startY + endY) / 2 - 6;
      lines.push({
        id: edge.constraint_id,
        path,
        type: edge.constraint_type,
        lag: edge.time_lag,
        labelX,
        labelY,
      });
    });
    return lines;
  }, [batchConstraints, operationPositions, timeMetrics]);

  const editingStage = undefined; // Temporarily disabled

  const renderTimelineAxis = () => {
    if (!timeMetrics || !resourceSummary.length) {
      return null;
    }

    const totalWidth = timeMetrics.totalDays * dayWidth;
    const chartHeight = 72;
    const averageRequired =
      resourceSummary.reduce((sum, item) => sum + item.required, 0) /
      Math.max(resourceSummary.length, 1);
    const baselineValue = Math.max(1, Math.round(averageRequired));
    const capacityValue = Math.max(baselineValue, maxDailyRequired || 1);
    const scaleY = (value: number) => {
      const normalized = Math.max(0, value) / Math.max(capacityValue, 1);
      return chartHeight - 16 - normalized * (chartHeight - 32);
    };

    const points = Array.from({ length: timeMetrics.totalDays }).map((_, index) => {
      const date = timeMetrics.minStart.add(index, 'day');
      const summary = resourceSummary.find((item) =>
        dayjs(item.day).isSame(date, 'day')
      );
      const required = summary?.required ?? 0;
      const assigned = summary?.assigned ?? 0;
      const x = index * dayWidth;
      return {
        dayIndex: index,
        label: date.format('MM/DD'),
        week: date.format('ddd'),
        required,
        assigned,
        x,
        y: scaleY(required)
      };
    });

    const strokePath = points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ');
    const areaPath = [
      `M ${points[0].x} ${chartHeight - 16}`,
      ...points.map((pt) => `L ${pt.x} ${pt.y}`),
      `L ${points[points.length - 1].x} ${chartHeight - 16}`,
      'Z'
    ].join(' ');
    const exceedPath = [
      `M ${points[0].x} ${scaleY(capacityValue)}`,
      ...points.map((pt) => `L ${pt.x} ${scaleY(Math.max(pt.required, capacityValue))}`),
      `L ${points[points.length - 1].x} ${scaleY(capacityValue)}`,
      'Z'
    ].join(' ');
    const peakPoint = points.reduce(
      (best, pt) => (pt.required > best.required ? pt : best),
      points[0]
    );

    return (
      <div style={{ width: totalWidth, background: TOKENS.card }}>
        <svg
          width={totalWidth}
          height={chartHeight}
          style={{ display: 'block' }}
          onMouseLeave={() => setLaborHover(null)}
        >
          <rect x={0} y={0} width={totalWidth} height={chartHeight} fill="transparent" />

          {points.map((pt) => (
            <line
              key={`axis-grid-${pt.dayIndex}`}
              x1={pt.x}
              y1={12}
              x2={pt.x}
              y2={chartHeight - 16}
              stroke={pt.dayIndex === 0 ? TOKENS.primary : 'rgba(148, 163, 184, 0.3)'}
              strokeDasharray={pt.dayIndex === 0 ? undefined : '4 6'}
              strokeWidth={pt.dayIndex === 0 ? 1.2 : 1}
              opacity={pt.dayIndex === 0 ? 0.85 : 0.35}
            />
          ))}

          <path d={areaPath} fill="rgba(37, 99, 235, 0.18)" stroke="none" />
          <path d={exceedPath} fill="rgba(234, 88, 12, 0.25)" stroke="none" />
          <path d={strokePath} fill="none" stroke={TOKENS.primary} strokeWidth={2} />

          <line
            x1={0}
            y1={scaleY(baselineValue)}
            x2={totalWidth}
            y2={scaleY(baselineValue)}
            stroke="#CBD5E1"
            strokeWidth={1}
            strokeDasharray="6 6"
          />
          <text x={8} y={scaleY(baselineValue) - 6} fill={TOKENS.textSecondary} fontSize={11}>
            基线 {baselineValue} 人
          </text>

          <line
            x1={0}
            y1={scaleY(capacityValue)}
            x2={totalWidth}
            y2={scaleY(capacityValue)}
            stroke="#F97316"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x={totalWidth - 96}
            y={scaleY(capacityValue) - 6}
            fill="#F97316"
            fontSize={11}
          >
            上限 {capacityValue} 人
          </text>

          <g transform={`translate(${peakPoint.x}, ${peakPoint.y - 14})`}>
            <rect
              x={-16}
              y={-18}
              width={80}
              height={22}
              rx={8}
              fill="rgba(37, 99, 235, 0.12)"
            />
            <text x={0} y={-4} fill={TOKENS.primary} fontSize={12} fontWeight={600}>
              {peakPoint.required} 人
            </text>
          </g>

          {points.map((pt) => (
            <rect
              key={`hover-day-${pt.dayIndex}`}
              x={pt.x - dayWidth / 2}
              y={0}
              width={dayWidth}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() =>
                setLaborHover({
                  dayIndex: pt.dayIndex,
                  label: `${pt.label} ${pt.week}`,
                  required: pt.required,
                  assigned: pt.assigned,
                  x: pt.x,
                  y: pt.y
                })
              }
              onClick={() => scrollToDay(pt.dayIndex)}
            />
          ))}
        </svg>

        {laborHover && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(Math.max(laborHover.x - 72, 8), totalWidth - 140),
              top: Math.max(laborHover.y - 60, 8),
              background: '#0F172A',
              color: '#F8FAFC',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              pointerEvents: 'none',
              boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)'
            }}
          >
            <div style={{ fontWeight: 600 }}>{laborHover.label}</div>
            <div style={{ marginTop: 4 }}>需求：{laborHover.required} 人</div>
            <div>已分配：{laborHover.assigned} 人</div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            borderTop: `1px solid ${TOKENS.border}`,
            background: TOKENS.card
          }}
        >
          {Array.from({ length: timeMetrics.totalDays }).map((_, index) => {
            const date = timeMetrics.minStart.add(index, 'day');
            return (
              <div key={`hour-block-${index}`} style={{ width: dayWidth }}>
                <div
                  style={{
                    padding: '6px 0',
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    color: index === 0 ? TOKENS.primary : TOKENS.textSecondary
                  }}
                >
                  {date.format('MM-DD')} · {date.format('ddd')}
                </div>
                <div style={{ display: 'flex' }}>
                  {Array.from({ length: 24 }).map((__, hourIndex) => {
                    const isMajor = hourIndex % 6 === 0;
                    return (
                      <div
                        key={`hour-${index}-${hourIndex}`}
                        style={{
                          width: hourWidth,
                          fontSize: 10,
                          color: isMajor ? TOKENS.textSecondary : '#94A3B8',
                          textAlign: 'center',
                          borderLeft: '1px solid rgba(148, 163, 184, 0.2)',
                        }}
                      >
                        {isMajor ? hourIndex.toString().padStart(2, '0') : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Temporarily disabled - needs refactoring for lane-based structure
  const openOperationEditModal = (op: ActiveOperation) => {
    setEditingOperationRow(op);
    editForm.setFieldsValue({
      plannedRange: [
        dayjs(op.planned_start_datetime),
        dayjs(op.planned_end_datetime),
      ],
      requiredPeople: op.required_people,
    });
    setEditModalVisible(true);
  };

  const recommendationLabel = (value: string) => {
    switch ((value || '').toUpperCase()) {
      case 'HIGHLY_RECOMMENDED':
        return '优先';
      case 'RECOMMENDED':
        return '推荐';
      case 'POSSIBLE':
        return '可选';
      case 'CURRENT':
        return '已分配';
      case 'CONFLICT':
        return '冲突';
      default:
        return value || '未评级';
    }
  };

  const recommendationColor = (value: string) => {
    switch ((value || '').toUpperCase()) {
      case 'HIGHLY_RECOMMENDED':
        return 'green';
      case 'RECOMMENDED':
        return 'blue';
      case 'POSSIBLE':
        return 'default';
      case 'CURRENT':
        return 'geekblue';
      case 'CONFLICT':
        return 'red';
      default:
        return 'default';
    }
  };

  const handleAssignModalClose = useCallback(() => {
    setAssignModalVisible(false);
    setAssignCandidates([]);
    setAssignSelectedIds([]);
    setAssignError(null);
    setAssignSearch('');
  }, []);

  const handleAssignSelectionChange = useCallback(
    (values: Array<string | number>) => {
      setAssignSelectedIds(values.map((value) => Number(value)));
    },
    [],
  );

  const handleOperationDetailDrawerClose = useCallback(() => {
    setOperationDetailDrawerVisible(false);
    setSelectedKeys([]);
    setOperationDetail(null);
  }, []);

  const handleOpenAssignModal = useCallback(async () => {
    if (!selectedOperationRow) {
      return;
    }

    setAssignLoading(true);
    setAssignError(null);
    try {
      const response = await axios.get(
        `/api/calendar/operations/${selectedOperationRow.operation_plan_id}/assignment-candidates`
      );
      setAssignCandidates(response.data);

      // Initial selection from operation detail if available
      if (operationDetail?.assigned_personnel) {
        setAssignSelectedIds(operationDetail.assigned_personnel.map(p => p.employee_id));
      } else {
        setAssignSelectedIds([]);
      }

      setAssignModalVisible(true);
    } catch (error) {
      console.error(error);
      setAssignError('获取分配候选人失败');
      message.error('获取分配候选人失败');
    } finally {
      setAssignLoading(false);
    }
  }, [selectedOperationRow, operationDetail]);

  useEffect(() => {
    if (!pendingAssignRef.current) {
      return;
    }
    if (operationDetailError) {
      pendingAssignRef.current = false;
      message.error('无法加载操作详情，请稍后再试');
      return;
    }
    if (operationDetailLoading || !selectedOperationRow || !operationDetail) {
      return;
    }

    pendingAssignRef.current = false;
    void handleOpenAssignModal();
  }, [
    operationDetail,
    operationDetailLoading,
    operationDetailError,
    selectedOperationRow,
    handleOpenAssignModal,
  ]);

  const handleAssignSubmit = useCallback(async () => {
    if (!selectedOperationRow) {
      return;
    }

    setAssignSubmitting(true);
    try {
      await axios.post(
        `/api/calendar/operations/${selectedOperationRow.operation_plan_id}/assign`,
        { employee_ids: assignSelectedIds }
      );
      message.success('人员分配已更新');
      setAssignModalVisible(false);
      await loadOperations();
      // Trigger detail refresh by clearing and re-setting selected row or just let the effect handle it if we force update
      // But simpler is to just fetch detail again manually if needed, or rely on loadOperations to update the main view
      // The detail view useEffect depends on selectedOperationRow, which might not change reference.
      // We can force detail reload:
      setOperationDetailLoading(true);
      const detailRes = await axios.get(`/api/calendar/operations/${selectedOperationRow.operation_plan_id}/detail`);
      setOperationDetail(detailRes.data);
      setOperationDetailLoading(false);
    } catch (error) {
      console.error(error);
      message.error('保存分配失败');
    } finally {
      setAssignSubmitting(false);
    }
  }, [selectedOperationRow, assignSelectedIds, loadOperations]);

  const handleToggleLock = useCallback(async () => {
    if (!selectedOperationRow) {
      return;
    }

    const isLocked = Boolean(operationDetail?.is_locked);
    const action = isLocked ? 'unlock' : 'lock';

    setLockLoading(true);
    try {
      await axios.post(
        `/api/calendar/operations/${selectedOperationRow.operation_plan_id}/${action}`
      );
      message.success(isLocked ? '操作已解锁' : '操作已锁定');
      await loadOperations();

      // Refresh detail
      setOperationDetailLoading(true);
      const detailRes = await axios.get(`/api/calendar/operations/${selectedOperationRow.operation_plan_id}/detail`);
      setOperationDetail(detailRes.data);
      setOperationDetailLoading(false);
    } catch (error) {
      console.error(error);
      message.error('操作失败');
    } finally {
      setLockLoading(false);
    }
  }, [selectedOperationRow, operationDetail, loadOperations]);

  const filteredAssignCandidates = useMemo(() => {
    if (!assignSearch.trim()) {
      return assignCandidates;
    }
    const keyword = assignSearch.trim().toLowerCase();
    return assignCandidates.filter((candidate) => {
      const fields = [
        candidate.employee_name,
        candidate.employee_code,
        candidate.department,
        candidate.qualifications,
      ]
        .filter(Boolean)
        .map((item) => String(item).toLowerCase());
      return fields.some((field) => field.includes(keyword));
    });
  }, [assignCandidates, assignSearch]);

  const categorizedAssignCandidates = useMemo(() => {
    const recommended: RecommendedPersonnel[] = [];
    const available: RecommendedPersonnel[] = [];
    const conflicted: RecommendedPersonnel[] = [];

    filteredAssignCandidates.forEach((candidate) => {
      if (candidate.has_conflict) {
        conflicted.push(candidate);
        return;
      }

      const recommendation = (candidate.recommendation || '').toUpperCase();
      if (
        recommendation === 'HIGHLY_RECOMMENDED' ||
        recommendation === 'RECOMMENDED' ||
        recommendation === 'CURRENT'
      ) {
        recommended.push(candidate);
      } else {
        available.push(candidate);
      }
    });

    return {
      recommended,
      available,
      conflicted,
    };
  }, [filteredAssignCandidates]);

  const renderAssignCandidate = useCallback(
    (candidate: RecommendedPersonnel) => (
      <div key={candidate.employee_id} className="abg-assign-item">
        <Checkbox value={candidate.employee_id} disabled={candidate.has_conflict}>
          <Space size={8} wrap>
            <Text>{candidate.employee_name}</Text>
            {candidate.employee_code && (
              <Text type="secondary">({candidate.employee_code})</Text>
            )}
            {candidate.recommendation && (
              <Tag color={recommendationColor(candidate.recommendation)}>
                {recommendationLabel(candidate.recommendation)}
              </Tag>
            )}
            {candidate.has_conflict && <Tag color="red">冲突</Tag>}
          </Space>
        </Checkbox>
        {candidate.qualifications && (
          <div className="abg-assign-desc">{candidate.qualifications}</div>
        )}
      </div>
    ),
    [],
  );

  const assignGroupConfigs = useMemo(
    () => [
      {
        key: 'recommended',
        title: '推荐候选',
        description: '优先、推荐、已分配',
        data: categorizedAssignCandidates.recommended,
        emptyText: '暂无推荐人员',
      },
      {
        key: 'available',
        title: '可用候选',
        description: '符合条件的其他可用人员',
        data: categorizedAssignCandidates.available,
        emptyText: '暂无可用人员',
      },
      {
        key: 'conflicted',
        title: '存在冲突',
        description: '当前时间段存在冲突或已排班',
        data: categorizedAssignCandidates.conflicted,
        emptyText: '暂无冲突人员',
      },
    ],
    [categorizedAssignCandidates],
  );

  const handleEditModalCancel = () => {
    setEditModalVisible(false);
    setEditingOperationRow(null);
    editForm.resetFields();
  };

  const handleEditModalSubmit = async () => {
    if (!editingOperationRow) {
      return;
    }

    let values: { plannedRange: [DayjsInstance, DayjsInstance]; requiredPeople: number };
    try {
      values = await editForm.validateFields();
    } catch (validationError) {
      return;
    }

    const [start, end] = values.plannedRange;
    const payload = {
      planned_start_datetime: start.format('YYYY-MM-DD HH:mm:ss'),
      planned_end_datetime: end.format('YYYY-MM-DD HH:mm:ss'),
      required_people: values.requiredPeople,
    };

    setSavingOperation(true);
    const operationPlanId = editingOperationRow.operation_plan_id;
    try {
      await axios.put(
        `/api/calendar/operations/${operationPlanId}/schedule`,
        payload,
      );
      message.success('操作计划已更新');
      await loadOperations();
      setEditModalVisible(false);
      setEditingOperationRow(null);
      editForm.resetFields();
      setSelectedKeys([`operation-${operationPlanId}`]);
    } catch (error: any) {
      console.error('Failed to update operation schedule', error);
      const serverMessage = error?.response?.data?.error;
      message.error(serverMessage || '更新操作计划失败');
    } finally {
      setSavingOperation(false);
    }
  };

  const renderOperationWindow = (
    op: ActiveOperation,
    batchColor: string,
  ) => {
    if (!timeMetrics || !op.window_start_datetime || !op.window_end_datetime) {
      return null;
    }

    const windowStart = dayjs(op.window_start_datetime);
    const windowEnd = dayjs(op.window_end_datetime);
    if (!windowStart.isValid() || !windowEnd.isValid()) {
      return null;
    }

    const effectiveStart = windowStart.isBefore(timeMetrics.minStart)
      ? timeMetrics.minStart
      : windowStart;
    const effectiveEnd = windowEnd.isAfter(timeMetrics.maxEnd)
      ? timeMetrics.maxEnd
      : windowEnd;

    if (!effectiveEnd.isAfter(effectiveStart)) {
      return null;
    }

    const startOffsetHours = Math.max(
      0,
      effectiveStart.diff(timeMetrics.minStart, 'hour', true),
    );
    const endOffsetHours = Math.max(
      startOffsetHours,
      effectiveEnd.diff(timeMetrics.minStart, 'hour', true),
    );
    const left = startOffsetHours * hourWidth;
    const width = Math.max((endOffsetHours - startOffsetHours) * hourWidth, 4);

    return (
      <div
        className="abg-operation-window"
        style={{
          left,
          width,
          borderColor: batchColor,
          backgroundColor: applyAlpha(batchColor, 0.1),
        }}
      />
    );
  };

  const renderOperationBlock = (
    operation: ActiveOperation,
    batchColor: string,
    isActive: boolean,
    conflict = false,
  ) => {
    if (!timeMetrics) {
      return null;
    }
    const op = operation;
    const isDraggingThis = draggingOperationId === op.operation_plan_id;
    const start = isDraggingThis && dragPreviewStart
      ? dragPreviewStart
      : dayjs(op.planned_start_datetime);

    let durationHours: number;
    if (isDraggingThis) {
      const originalStart = dayjs(op.planned_start_datetime);
      const originalEnd = dayjs(op.planned_end_datetime);
      durationHours = Math.max(getEffectiveHours(originalStart, originalEnd, hideNonWorkHours), 0.3);
    } else {
      const end = dayjs(op.planned_end_datetime);
      durationHours = Math.max(getEffectiveHours(start, end, hideNonWorkHours), 0.3);
    }

    const offsetHours = getEffectiveHours(timeMetrics.minStart, start, hideNonWorkHours);
    const left = offsetHours * hourWidth;
    const width = Math.max(durationHours * hourWidth, 6);
    const isLocked = Boolean(op.is_locked);
    const showFlagIcons = isLocked || conflict;

    let statusColor: string | undefined;
    if (op.assignment_status === 'COMPLETE') {
      statusColor = '#52c41a';
    } else if (op.assignment_status === 'PARTIAL') {
      statusColor = '#faad14';
    } else if (op.assignment_status === 'UNASSIGNED') {
      statusColor = '#ff4d4f';
    }

    const tip = (
      <div style={{ fontSize: 12 }}>
        <div>
          <b>{op.operation_name}</b>
        </div>
        <div>
          {start.format('MM/DD HH:mm')} -{' '}
          {isDraggingThis
            ? addEffectiveHours(start, durationHours, hideNonWorkHours).format('MM/DD HH:mm')
            : dayjs(op.planned_end_datetime).format('MM/DD HH:mm')}
        </div>
        <div>
          人员: {op.assigned_people}/{op.required_people}
        </div>
        <div>状态: {op.assignment_status}</div>
        {isLocked && <div>🔒 已锁定</div>}
      </div>
    );

    const gradientStart = applyAlpha(batchColor, 0.32);
    const gradientEnd = applyAlpha(batchColor, 0.55);
    const borderColor = statusColor || applyAlpha(batchColor, 0.65);
    const durationLabel =
      durationHours >= 1
        ? `${Math.round(durationHours * 10) / 10} 小时`
        : `${Math.max(Math.round(durationHours * 60), 1)} 分钟`;
    const peopleGap = op.required_people - op.assigned_people;

    return (
      <Tooltip key={`op-${op.operation_plan_id}`} title={tip} placement="top" open={isDraggingThis ? false : undefined}>
        <div
          className={classNames('abg-operation-block', {
            'abg-operation-block-active': isActive,
            'abg-operation-block-conflict': conflict,
            'is-locked': isLocked,
            'is-dragging': isDraggingThis,
          })}
          style={{
            left,
            width,
            background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`,
            borderColor,
            zIndex: isDraggingThis ? 1000 : undefined,
            boxShadow: isDraggingThis ? '0 8px 24px rgba(0,0,0,0.2)' : undefined,
            cursor: isDraggingThis ? 'grabbing' : 'grab',
          }}
          onMouseDown={(e) => handleOperationDragStart(e, op)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedKeys([`operation-${op.operation_plan_id}`]);
          }}
          onDoubleClick={() => {
            openOperationEditModal(op);
          }}
        >
          <div className="abg-operation-block-header">
            <span className="abg-operation-name">{op.operation_name}</span>
            {showFlagIcons && (
              <Space size={4}>
                {isLocked && (
                  <span className="abg-operation-flag is-lock" title="已锁定">
                    🔒
                  </span>
                )}
                {conflict && (
                  <span className="abg-operation-flag is-conflict" title="缺员">
                    ⚠
                  </span>
                )}
              </Space>
            )}
          </div>
          <div className="abg-operation-block-meta">
            <span>
              {start.format('MM/DD HH:mm')} · {durationLabel}
            </span>
            <span>
              人员 {op.assigned_people}/{op.required_people}
              {peopleGap > 0 ? `（缺 ${peopleGap}）` : ''}
            </span>
          </div>
        </div>
      </Tooltip>
    );
  };

  const renderTimelineRows = () => {
    if (!timeMetrics) {
      return null;
    }
    const totalHeight = laneKeys.length * ROW_HEIGHT;
    const headers: React.ReactNode[] = [];
    let current = timeMetrics.minStart.clone().startOf('hour');
    const endTime = timeMetrics.maxEnd.clone();
    let xPosition = 0;

    while (current.isBefore(endTime) || current.isSame(endTime)) {
      const hour = current.hour();

      // Skip non-work hours when hideNonWorkHours is true
      if (hideNonWorkHours && (hour < 9 || hour >= 21)) {
        current = current.add(1, 'hour');
        continue;
      }

      const isDayStart = hour === (hideNonWorkHours ? 9 : 0);
      const isEveningStart = !hideNonWorkHours && hour === 18;

      headers.push(
        <div
          key={`hour-${current.valueOf()}`}
          className={classNames('abg-axis-hour', {
            'is-day-start': isDayStart,
            'is-evening': isEveningStart,
          })}
          style={{
            left: xPosition,
            width: hourWidth,
          }}
        >
          {isDayStart && (
            <div className="abg-axis-day-label">
              {current.format('MM/DD')}
            </div>
          )}
          <div className="abg-axis-hour-label">{current.format('HH:mm')}</div>
        </div>,
      );

      xPosition += hourWidth;
      current = current.add(1, 'hour');
    }
    const hourLines: React.ReactNode[] = [];
    const shiftBands: React.ReactNode[] = [];

    // Calculate shift bands based on effective hours
    let currentTime = timeMetrics.minStart.clone().startOf('hour');
    let xPos = 0;

    while (currentTime.isBefore(timeMetrics.maxEnd)) {
      const hour = currentTime.hour();

      // Skip non-work hours when hideNonWorkHours is true
      if (hideNonWorkHours && (hour < 9 || hour >= 21)) {
        currentTime = currentTime.add(1, 'hour');
        continue;
      }

      // Determine shift type based on hour
      let shiftType: 'day' | 'evening' | 'night' | null = null;
      if (!hideNonWorkHours) {
        if (hour >= 9 && hour < 17) {
          shiftType = 'day';
        } else if (hour >= 17 && hour < 21) {
          shiftType = 'evening';
        } else if (hour >= 21 || hour < 9) {
          shiftType = 'night';
        }
      } else {
        // When hiding non-work hours, only day and evening shifts are visible
        if (hour >= 9 && hour < 17) {
          shiftType = 'day';
        } else if (hour >= 17 && hour < 21) {
          shiftType = 'evening';
        }
      }

      if (shiftType) {
        shiftBands.push(
          <div
            key={`shift-${currentTime.valueOf()}`}
            className={`abg-shift-band abg-shift-${shiftType}`}
            style={{
              left: xPos,
              width: hourWidth,
              height: totalHeight,
            }}
          />
        );
      }

      // Add hour grid line
      hourLines.push(
        <div
          key={`line-${currentTime.valueOf()}`}
          className={classNames('abg-hour-line', {
            'is-day-boundary': hour === 0,
            'is-major': hour % 6 === 0,
          })}
          style={{
            left: xPos,
            height: totalHeight,
          }}
        />
      );

      xPos += hourWidth;
      currentTime = currentTime.add(1, 'hour');
    }

    const viewportHeight = timelineViewportHeight || 600;
    const overscan = 6;
    const estimatedVisible =
      Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2;
    const startIndex = Math.max(
      Math.floor(timelineScrollTop / ROW_HEIGHT) - overscan,
      0,
    );
    const endIndex = Math.min(
      startIndex + estimatedVisible,
      laneKeys.length,
    );

    const rows: React.ReactNode[] = [];

    for (let index = startIndex; index < endIndex; index += 1) {
      const key = laneKeys[index];
      const laneClass = index % 2 === 0 ? 'abg-lane-even' : 'abg-lane-odd';
      const meta = nodeMeta.get(key);
      if (!meta) {
        continue;
      }
      const top = index * ROW_HEIGHT;

      if (meta.type === 'batch') {
        const batch = batchRowMap.get(key);
        if (!batch || !timeMetrics) {
          continue;
        }
        const batchColor = batch.batchColor;
        const batchActive = selectedKeys.includes(batch.key);
        const batchLeft = Math.max(
          0,
          getEffectiveHours(timeMetrics.minStart, batch.start, hideNonWorkHours) * hourWidth,
        );
        const batchWidth = Math.max(
          8,
          getEffectiveHours(batch.start, batch.end, hideNonWorkHours) * hourWidth,
        );

        rows.push(
          <div
            key={batch.key}
            className={classNames('abg-batch-row', laneClass, {
              'abg-batch-row-active': batchActive,
            })}
            style={{ top, height: ROW_HEIGHT }}
            onClick={() => setSelectedKeys([batch.key])}
            onMouseEnter={() => setHoveredKey(batch.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <div className="abg-batch-background" />
            <div
              className="abg-batch-block"
              style={{
                left: batchLeft,
                width: batchWidth,
                borderColor: batchColor,
                background: applyAlpha(batchColor, 0.2),
              }}
            >
              <span className="abg-batch-label">
                {batch.batchCode}｜{batch.stageCount} 阶段｜{batch.operationCount} 操作
              </span>
            </div>
          </div>,
        );
        continue;
      }

      if (meta.type === 'stage') {
        const stage = stageRowMap.get(key);
        if (!stage) {
          continue;
        }
        const batchColor = stage.batchColor || DEFAULT_COLORS[0];
        const stageActive =
          selectedKeys.includes(stage.key) ||
          (selectedMeta?.type === 'lane' &&
            selectedMeta.stageKey === stage.key);

        const stageLeft = Math.max(
          0,
          getEffectiveHours(timeMetrics.minStart, stage.start, hideNonWorkHours) * hourWidth,
        );
        const stageWidth = Math.max(
          6,
          getEffectiveHours(stage.start, stage.end, hideNonWorkHours) * hourWidth,
        );

        rows.push(
          <div
            key={stage.key}
            className={classNames('abg-stage-row', laneClass, {
              'abg-stage-row-active': stageActive,
            })}
            style={{ top, height: ROW_HEIGHT }}
            onClick={() => setSelectedKeys([stage.key])}
            onMouseEnter={() => setHoveredKey(stage.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <div className="abg-stage-background" />
            <div
              className="abg-stage-block"
              style={{
                left: stageLeft,
                width: stageWidth,
                background: applyAlpha(batchColor, 0.18),
                borderColor: batchColor,
              }}
            >
              <span className="abg-stage-label">{stage.stageName}</span>
            </div>
          </div>,
        );
        continue;
      }

      if (meta.type === 'lane') {
        const laneRow = laneRowMap.get(key);
        if (!laneRow || !laneRow.operations || laneRow.operations.length === 0) {
          continue;
        }
        const batchColor = laneRow.batchColor || DEFAULT_COLORS[0];

        rows.push(
          <div
            key={laneRow.key}
            className={classNames('abg-operation-row', laneClass)}
            style={{ top, height: ROW_HEIGHT }}
            onMouseEnter={() => setHoveredKey(laneRow.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <div className="abg-lane-row-background" />
            {laneRow.operations.map(op => {
              const conflict = op.assigned_people < op.required_people;
              const isActive = selectedKeys.includes(`operation-${op.operation_plan_id}`);

              return (
                <React.Fragment key={`op-${op.operation_plan_id}`}>
                  {renderOperationWindow(op, batchColor)}
                  {renderOperationBlock(op, batchColor, isActive, conflict)}
                </React.Fragment>
              );
            })}
          </div>,
        );
      }
    }

    return (
      <div
        className="abg-timeline-body"
        style={{
          width: timelineWidth,
          height: totalHeight,
        }}
      >
        <div className="abg-shift-bands">{shiftBands}</div>
        <div className="abg-hour-lines">{hourLines}</div>
        <svg
          className="abg-constraint-svg"
          width={timelineWidth}
          height={totalHeight}
          viewBox={`0 0 ${timelineWidth} ${totalHeight}`}
        >
          <defs>
            <marker
              id="abg-constraint-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {constraintLines.map((line) => (
            <g key={line.id} className={classNames('abg-constraint-line', `type-${line.type}`)}>
              <path d={line.path} markerEnd="url(#abg-constraint-arrow)" />
              {line.lag !== 0 && (
                <text x={line.labelX} y={line.labelY} className="abg-constraint-label">
                  {line.lag > 0 ? `+${line.lag}` : `${line.lag}`}h
                </text>
              )}
            </g>
          ))}
        </svg>
        <div
          className="abg-timeline-rows"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: totalHeight,
            zIndex: 2,
          }}
        >
          {rows}
        </div>
      </div>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      <div className="abg-container">
        <div className="abg-header">
          <div className="abg-header-left">
            <Text className="abg-header-title">激活批次甘特</Text>
            <Text className="abg-header-subtitle" type="secondary">
              监控激活批次的人力覆盖、锁定状态与依赖关系
            </Text>
            <Space size={12} wrap className="abg-header-metrics">
              <div className="abg-metric">
                <span className="abg-metric-label">激活批次</span>
                <span className="abg-metric-value">{totalBatchCount}</span>
              </div>
              <div className="abg-metric">
                <span className="abg-metric-label">操作总数</span>
                <span className="abg-metric-value">{summaryStats.total}</span>
              </div>
              <div className="abg-metric">
                <span className="abg-metric-label">人员覆盖率</span>
                <span className="abg-metric-value">
                  {summaryStats.total ? `${summaryStats.completion}%` : '--'}
                </span>
              </div>
              <div className="abg-metric">
                <span className="abg-metric-label">冲突操作</span>
                <span className="abg-metric-value">{summaryStats.conflict}</span>
              </div>
            </Space>
          </div>
          <Space size={16} align="center" wrap className="abg-header-actions">
            <div className="abg-zoom-control">
              <Text className="abg-filter-label">缩放</Text>
              <Slider
                min={0.5}
                max={2.5}
                step={0.1}
                value={zoom}
                onChange={handleZoomChange}
                style={{ width: 140 }}
              />
              <Text className="abg-zoom-value">{Math.round(zoom * 100)}%</Text>
            </div>
            <Button icon={<SyncOutlined />} onClick={handleRefresh} loading={loading}>
              刷新数据
            </Button>
            <Button
              icon={hideNonWorkHours ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => setHideNonWorkHours(!hideNonWorkHours)}
            >
              {hideNonWorkHours ? '显示非工作时间' : '隐藏非工作时间'}
            </Button>
            <Button onClick={handleResetFilters}>重置筛选</Button>
            <Button type="text" onClick={onClose}>
              收起
            </Button>
          </Space>
        </div>

        <div className="abg-filter-bar">
          <div className="abg-filter-group">
            <span className="abg-filter-label">批次</span>
            <Select
              mode="multiple"
              allowClear
              placeholder="选择批次"
              style={{ minWidth: 220 }}
              options={batchOptions}
              value={selectedBatchIds}
              onChange={(values) => setSelectedBatchIds(values as number[])}
            />
          </div>
          <div className="abg-filter-group">
            <span className="abg-filter-label">时间窗口</span>
            <RangePicker
              value={dateRange || undefined}
              onChange={handleDateRangeChange}
              allowClear
            />
          </div>
          <div className="abg-filter-group abg-status-group">
            <span className="abg-filter-label">人员状态</span>
            <Checkbox
              checked={statusFilter.unassigned}
              onChange={(e) =>
                setStatusFilter((prev) => ({ ...prev, unassigned: e.target.checked }))
              }
            >
              未分配
            </Checkbox>
            <Checkbox
              checked={statusFilter.partial}
              onChange={(e) =>
                setStatusFilter((prev) => ({ ...prev, partial: e.target.checked }))
              }
            >
              部分
            </Checkbox>
            <Checkbox
              checked={statusFilter.complete}
              onChange={(e) =>
                setStatusFilter((prev) => ({ ...prev, complete: e.target.checked }))
              }
            >
              完成
            </Checkbox>
          </div>
        </div>

        <div className="abg-legend-row">
          <Text className="abg-filter-label">激活批次</Text>
          <Space size={8} wrap>
            {batchLegend.map((batch) => (
              <Tag key={batch.code} color={batch.color}>
                {batch.code}
              </Tag>
            ))}
          </Space>
          {summaryStats.locked > 0 && (
            <Tag color="gold" style={{ marginLeft: 12 }}>
              锁定 {summaryStats.locked}
            </Tag>
          )}
        </div>

        <div className="abg-layout">
          <div className="abg-grid">
            <div className="abg-side-header abg-grid-side-header">
              <span className="abg-side-header-title">批次结构</span>
              <span className="abg-side-header-sub">批次 / 阶段 / 操作</span>
            </div>
            <div
              className="abg-timeline-axis abg-grid-axis"
              ref={axisScrollRef}
              onScroll={(event) => {
                if (syncingRef.current) {
                  syncingRef.current = false;
                  return;
                }
                syncingRef.current = true;
                if (timelineScrollRef.current) {
                  timelineScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }
              }}
            >
              {renderTimelineAxis()}
            </div>
            <div
              className="abg-side-body abg-grid-side-body"
              ref={treeScrollRef}
              onScroll={(event) => {
                if (syncingRef.current) {
                  syncingRef.current = false;
                  return;
                }
                syncingRef.current = true;
                if (timelineScrollRef.current) {
                  timelineScrollRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
            >
              <Tree
                blockNode
                showLine={{ showLeafIcon: false }}
                titleRender={(node) => {
                  const keyString = node.key?.toString?.() ?? '';
                  const renderedTitle =
                    typeof node.title === 'function' ? node.title(node) : node.title;
                  return (
                    <div
                      className={classNames('abg-tree-title', {
                        'is-hovered': hoveredKey === keyString,
                      })}
                    >
                      {renderedTitle}
                    </div>
                  );
                }}
                treeData={treeData}
                expandedKeys={expandedKeys}
                selectedKeys={selectedKeys}
                onExpand={(keys) =>
                  setExpandedKeys(keys.map((k) => k.toString()))
                }
                onSelect={(keys) =>
                  setSelectedKeys(keys.map((k) => k.toString()))
                }
              />
            </div>
            <div
              className={classNames('abg-timeline-scroll', 'abg-grid-timeline', {
                'is-dragging': isDragging,
              })}
              ref={timelineScrollRef}
              onScroll={(event) => {
                setTimelineScrollTop(event.currentTarget.scrollTop);
                if (syncingRef.current) {
                  syncingRef.current = false;
                  return;
                }
                syncingRef.current = true;
                if (treeScrollRef.current) {
                  treeScrollRef.current.scrollTop = event.currentTarget.scrollTop;
                }
                if (axisScrollRef.current) {
                  axisScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                const container = timelineScrollRef.current;
                if (!container) {
                  return;
                }
                dragStateRef.current = {
                  startX: event.clientX,
                  startY: event.clientY,
                  startScrollLeft: container.scrollLeft,
                  startScrollTop: container.scrollTop,
                  dragging: false,
                };
                suppressClickRef.current = false;
                window.addEventListener('mousemove', handleDragMouseMove);
                window.addEventListener('mouseup', handleDragMouseUp);
              }}
              onClickCapture={(event) => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  event.stopPropagation();
                  event.preventDefault();
                }
              }}
              onMouseLeave={() => {
                setHoveredKey(null);
              }}
            >
              {renderTimelineRows()}
            </div>
          </div>
        </div>

        {loading && (
          <div className="abg-loading">
            <Spin size="large" />
            <div className="abg-loading-text">加载中...</div>
          </div>
        )}

        {!loading && error && (
          <div className="abg-error">
            <Alert type="error" message={error} showIcon />
          </div>
        )}

        {!loading && !error && operations.length === 0 && (
          <div className="abg-empty">
            <Empty description="暂无激活批次" />
          </div>
        )}

        {selectedMeta && (() => {
          if (selectedMeta.type === 'lane') {
            return null;
          }
          if (selectedStageRow) {
            return (
              <div className="abg-selection-info">
                <Space size={12} wrap>
                  <Text strong>已选阶段：</Text>
                  <Text>
                    {selectedStageRow.stageName}（批次 {selectedStageRow.batchCode}）
                  </Text>
                  <Divider type="vertical" />
                  <Text>
                    时间：
                    {selectedStageRow.start.format('MM/DD')} -
                    {selectedStageRow.end.format('MM/DD')}
                  </Text>
                  <Text>操作数：{selectedStageRow.operations.length}</Text>
                </Space>
              </div>
            );
          }
          if (selectedMeta.type === 'batch') {
            const info = batchRows.find(
              (row) => row.batchId === selectedMeta.batchId,
            );
            return (
              <div className="abg-selection-info">
                <Space size={12} wrap>
                  <Text strong>已选批次：</Text>
                  <Text>
                    {info
                      ? `${info.batchCode}｜${info.batchName}`
                      : '批次信息'}
                  </Text>
                  {info && (
                    <>
                      <Divider type="vertical" />
                      <Text>
                        时间：{info.start.format('MM/DD')} - {info.end.format('MM/DD')}
                      </Text>
                      <Text>
                        阶段/操作：{info.stageCount} / {info.operationCount}
                      </Text>
                    </>
                  )}
                </Space>
              </div>
            );
          }
          return null;
        })()}
      </div>
      <Drawer
        title="操作详情"
        width={520}
        open={operationDetailDrawerVisible}
        destroyOnClose
        onClose={handleOperationDetailDrawerClose}
        extra={
          selectedOperationRow ? (
            <Space size={8}>
              <Button size="small" onClick={handleOpenAssignModal}>
                手动分配
              </Button>
              <Button
                size="small"
                onClick={handleToggleLock}
                loading={lockLoading}
                type={Boolean(operationDetail?.is_locked ?? false) ? 'default' : 'primary'}
              >
                {Boolean(operationDetail?.is_locked ?? false)
                  ? '解锁操作'
                  : '锁定操作'}
              </Button>
            </Space>
          )
            : undefined
        }
      >
        {selectedOperationRow ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {operationDetailError && <Alert type="error" message={operationDetailError} showIcon />}
            {operationDetailLoading && (
              <Space>
                <Spin size="small" />
                <Text type="secondary">人员信息加载中...</Text>
              </Space>
            )}
            {(() => {
              const op = operationDetail;
              const conflict =
                (op?.assigned_people ?? 0) < (op?.required_people ?? 0);
              const windowStartText = op?.window_start_datetime
                ? dayjs(op.window_start_datetime).format('YYYY-MM-DD HH:mm')
                : null;
              const windowEndText = op?.window_end_datetime
                ? dayjs(op.window_end_datetime).format('YYYY-MM-DD HH:mm')
                : null;
              const status = (op?.assignment_status || '').toUpperCase();
              const isLocked = Boolean(op?.is_locked);

              return (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="操作">
                    {op?.operation_name || '加载中...'}
                  </Descriptions.Item>
                  <Descriptions.Item label="批次">
                    {selectedOperationRow.batch_code}｜{selectedOperationRow.batch_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="阶段">
                    {selectedOperationRow.stage_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="计划时间">
                    {op?.planned_start_datetime ? dayjs(op.planned_start_datetime).format('YYYY-MM-DD HH:mm') : '-'} -
                    {' '}
                    {op?.planned_end_datetime ? dayjs(op.planned_end_datetime).format('YYYY-MM-DD HH:mm') : '-'}
                  </Descriptions.Item>
                  {windowStartText && windowEndText && (
                    <Descriptions.Item label="允许窗口">
                      {windowStartText} - {windowEndText}
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="人员">
                    {(op?.assigned_people ?? 0)}/{op?.required_people ?? 0}
                    {conflict ? '（未满足）' : ''}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={
                      status === 'COMPLETE' ? 'green' : status === 'PARTIAL' ? 'orange' : status === 'UNASSIGNED' ? 'red' : 'default'
                    }>
                      {status || '未知'}
                    </Tag>
                  </Descriptions.Item>
                  {isLocked && (
                    <Descriptions.Item label="锁定信息">
                      <Space direction="vertical" size={2}>
                        <span>状态：已锁定</span>
                        {op?.lock_reason ? <span>原因：{op.lock_reason}</span> : null}
                        {op?.locked_at ? <span>时间：{dayjs(op.locked_at).format('YYYY-MM-DD HH:mm')}</span> : null}
                      </Space>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              );
            })()}
            <div>
              <Divider orientation="left">已分配人员</Divider>
              {operationDetail?.assigned_personnel?.length ? (
                <Space size={6} wrap>
                  {operationDetail.assigned_personnel.map((person) => (
                    <Tag
                      key={`${person.employee_id}-${person.employee_code}`}
                      color={person.is_primary ? 'blue' : undefined}
                    >
                      {person.employee_name}
                      {person.employee_code ? `(${person.employee_code})` : ''}
                      {person.is_primary ? '★' : ''}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">
                  {operationDetailLoading ? '加载中…' : '暂无分配人员'}
                </Text>
              )}
            </div>
          </Space>
        ) : (
          <Empty description="请选择操作" />
        )}
      </Drawer>
      <Modal
        open={editModalVisible}
        title={
          editingOperationRow
            ? `调整操作：${editingOperationRow.operation_name}`
            : '调整操作'
        }
        onCancel={handleEditModalCancel}
        onOk={handleEditModalSubmit}
        confirmLoading={savingOperation}
        destroyOnClose
        maskClosable={false}
        okText="保存"
        cancelText="取消"
      >
        {editingOperationRow && (
          <Space
            direction="vertical"
            size={6}
            style={{ width: '100%', marginBottom: 12 }}
          >
            <Text type="secondary">
              批次：{editingOperationRow.batch_code}｜{editingOperationRow.batch_name}
            </Text>
            <Text type="secondary">阶段：{editingOperationRow.stage_name}</Text>
            {editingOperationRow.window_start_datetime &&
              editingOperationRow.window_end_datetime && (
                <Text type="secondary">
                  允许窗口：
                  {dayjs(editingOperationRow.window_start_datetime).format(
                    'MM/DD HH:mm',
                  )}{' '}
                  -{' '}
                  {dayjs(editingOperationRow.window_end_datetime).format(
                    'MM/DD HH:mm',
                  )}
                </Text>
              )}
          </Space>
        )}
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="计划时间段"
            name="plannedRange"
            rules={[{ required: true, message: '请选择计划时间段' }]}
          >
            <RangePicker
              showTime={{ format: 'HH:mm', minuteStep: 15 }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              allowClear={false}
            />
          </Form.Item>
          <Form.Item
            label="需求人数"
            name="requiredPeople"
            rules={[{ required: true, message: '请输入需求人数' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={assignModalVisible}
        title="手动人员分配"
        onCancel={handleAssignModalClose}
        onOk={handleAssignSubmit}
        okText="保存"
        cancelText="取消"
        confirmLoading={assignSubmitting}
        destroyOnClose
        maskClosable={false}
      >
        {assignLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin />
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {assignError && <Alert type="error" message={assignError} showIcon />}
            {assignCandidates.length > 0 ? (
              <>
                <Input.Search
                  placeholder="搜索姓名 / 工号 / 部门"
                  allowClear
                  value={assignSearch}
                  onChange={(event) => setAssignSearch(event.target.value)}
                  onSearch={(value) => setAssignSearch(value)}
                />
                <Checkbox.Group
                  style={{ width: '100%' }}
                  value={assignSelectedIds}
                  onChange={handleAssignSelectionChange}
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: 16,
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    }}
                  >
                    {assignGroupConfigs.map((group) => (
                      <div key={group.key} className="abg-assign-column">
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <div>
                            <Text strong>{group.title}</Text>
                            <div className="abg-assign-column-desc">{group.description}</div>
                          </div>
                          {group.data.length ? (
                            <Space
                              direction="vertical"
                              size={6}
                              style={{ width: '100%' }}
                            >
                              {group.data.map((candidate) =>
                                renderAssignCandidate(candidate),
                              )}
                            </Space>
                          ) : (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={group.emptyText}
                            />
                          )}
                        </Space>
                      </div>
                    ))}
                  </div>
                  {filteredAssignCandidates.length === 0 && (
                    <div style={{ paddingTop: 8 }}>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="未找到匹配的人员"
                      />
                    </div>
                  )}
                </Checkbox.Group>
              </>
            ) : (
              <Empty description="暂无推荐人员" />
            )}
          </Space>
        )}
      </Modal>
    </>
  );
};

export default ActivatedBatchGantt;
