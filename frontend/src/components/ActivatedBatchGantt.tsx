import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  Card,
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
import { SyncOutlined } from '@ant-design/icons';

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
  operation_name: string;
  planned_start_datetime: string;
  planned_end_datetime: string;
  planned_duration: number;
  window_start_datetime?: string | null;
  window_end_datetime?: string | null;
  required_people: number;
  assigned_people: number;
  assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED' | string;
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

interface ActivatedBatchGanttProps {
  visible: boolean;
  onClose: () => void;
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

type NodeType = 'batch' | 'stage' | 'operation';

interface TreeNodeMeta {
  key: string;
  type: NodeType;
  batchId: number;
  stageKey?: string;
  stageName?: string;
  operation?: ActiveOperation;
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

interface OperationRow {
  key: string;
  batchId: number;
  batchCode: string;
  batchName: string;
  batchColor: string;
  stageKey: string;
  stageName: string;
  operation: ActiveOperation;
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

const ROW_HEIGHT = 48;
const BASE_DAY_WIDTH = 120;

const DEFAULT_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#13c2c2', '#722ed1'];

const applyAlpha = (hexColor: string, alpha = 0.15) => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return `rgba(24, 144, 255, ${alpha})`;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildTreeData = (operations: ActiveOperation[]) => {
  const batchMap = new Map<
    number,
    {
      sample: ActiveOperation;
      stageMap: Map<string, ActiveOperation[]>;
    }
  >();

  operations.forEach((op) => {
    if (!batchMap.has(op.batch_id)) {
      batchMap.set(op.batch_id, {
        sample: op,
        stageMap: new Map<string, ActiveOperation[]>(),
      });
    }
    const stageMap = batchMap.get(op.batch_id)!.stageMap;
    if (!stageMap.has(op.stage_name)) {
      stageMap.set(op.stage_name, []);
    }
    stageMap.get(op.stage_name)!.push(op);
  });

  const nodes: DataNode[] = [];
  const stageRowMap = new Map<string, StageRow>();
  const operationRowMap = new Map<string, OperationRow>();
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

      Array.from(stageMap.entries())
        .map(([stageName, ops]) => ({ stageName, ops }))
        .sort((a, b) =>
          dayjs(a.ops[0].planned_start_datetime).valueOf() -
          dayjs(b.ops[0].planned_start_datetime).valueOf(),
        )
        .forEach(({ stageName, ops }, stageIndex) => {
          const stageKey = `${batchKey}-stage-${stageIndex}`;
          nodeMeta.set(stageKey, {
            key: stageKey,
            type: 'stage',
            batchId,
            stageName,
          });

          const sortedOps = ops
            .slice()
            .sort((a, b) =>
              dayjs(a.planned_start_datetime).valueOf() -
              dayjs(b.planned_start_datetime).valueOf(),
            );

          const operationNodes: DataNode[] = sortedOps.map((op) => {
            const operationKey = `operation-${op.operation_plan_id}`;
            nodeMeta.set(operationKey, {
              key: operationKey,
              type: 'operation',
              batchId,
              stageKey,
              stageName,
              operation: op,
            });

            const opStart = dayjs(op.planned_start_datetime);
            const opEnd = dayjs(op.planned_end_datetime);
            operationRowMap.set(operationKey, {
              key: operationKey,
              batchId,
              batchCode: sample.batch_code,
              batchName: sample.batch_name,
              batchColor:
                sample.batch_color ||
                DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
              stageKey,
              stageName,
              operation: op,
              start: opStart,
              end: opEnd,
            });
            const normalizedStatus = (op.assignment_status || '').toUpperCase();
            const conflict = op.assigned_people < op.required_people;
            const isLocked = Boolean(op.is_locked);
            const statusLabel = conflict
              ? '缺员'
              : normalizedStatus === 'COMPLETE'
              ? '完成'
              : normalizedStatus === 'PARTIAL'
              ? '部分'
              : normalizedStatus === 'UNASSIGNED'
              ? '未分'
              : normalizedStatus || '未知';
            const statusClassName = classNames(
              'abg-tree-chip',
              'abg-tree-chip-status',
              {
                'is-complete': normalizedStatus === 'COMPLETE' && !conflict,
                'is-partial': normalizedStatus === 'PARTIAL' && !conflict,
                'is-unassigned': normalizedStatus === 'UNASSIGNED' && !conflict,
                'is-conflict': conflict,
              },
            );
            const statusDotClass = classNames('abg-tree-status-dot', {
              'is-complete': normalizedStatus === 'COMPLETE' && !conflict,
              'is-partial': normalizedStatus === 'PARTIAL' && !conflict,
              'is-unassigned': normalizedStatus === 'UNASSIGNED' && !conflict,
              'is-conflict': conflict,
            });
            return {
              key: operationKey,
              title: (
                <div className="abg-tree-node">
                  <div className="abg-tree-line abg-tree-line-primary">
                    <span className={statusDotClass} />
                    <span className="abg-tree-operation-name">{op.operation_name}</span>
                    <span className="abg-tree-line-spacer" />
                    <span className={statusClassName}>{statusLabel}</span>
                    {isLocked && <Tag color="gold">锁定</Tag>}
                    {conflict && (
                      <span className="abg-tree-conflict-flag">⚠</span>
                    )}
                  </div>
                  <div className="abg-tree-line abg-tree-line-secondary">
                    <span>
                      {opStart.format('MM/DD HH:mm')} - {opEnd.format('HH:mm')}
                    </span>
                  </div>
                </div>
              ),
              isLeaf: true,
            };
          });

          const stageStart = dayjs(sortedOps[0].planned_start_datetime);
          const stageEnd = dayjs(
            sortedOps[sortedOps.length - 1].planned_end_datetime,
          );
          const stageStartDay = stageStart.startOf('day');
          const stageEndDay = stageEnd.endOf('day');

          if (!batchStart || stageStartDay.isBefore(batchStart)) {
            batchStart = stageStartDay;
          }
          if (!batchEnd || stageEndDay.isAfter(batchEnd)) {
            batchEnd = stageEndDay;
          }
          opCount += sortedOps.length;

          stageRowMap.set(stageKey, {
            key: stageKey,
            batchId,
            batchCode: sample.batch_code,
            batchName: sample.batch_name,
            batchColor: sample.batch_color || DEFAULT_COLORS[batchIndex % DEFAULT_COLORS.length],
            stageName,
            operations: sortedOps,
            start: stageStartDay,
            end: stageEndDay,
          });

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
                    {sortedOps.length} 操作
                  </span>
                </div>
                <div className="abg-tree-line abg-tree-line-secondary">
                  <span>
                    {stageStartDay.format('MM/DD')} - {stageEndDay.format('MM/DD')}
                  </span>
                </div>
              </div>
            ),
            children: operationNodes,
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
    operationRowMap,
    batchRowMap,
    nodeMeta,
    expandedKeys: uniqueExpanded,
  };
};

const ActivatedBatchGantt: React.FC<ActivatedBatchGanttProps> = ({
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<ActiveOperation[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [visibleRows, setVisibleRows] = useState<string[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<[DayjsInstance, DayjsInstance] | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState({
    unassigned: true,
    partial: true,
    complete: true,
  });
  const [zoom, setZoom] = useState(1);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingOperationRow, setEditingOperationRow] = useState<OperationRow | null>(
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
  const [lockLoading, setLockLoading] = useState(false);
  const [operationDetailDrawerVisible, setOperationDetailDrawerVisible] = useState(false);

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<ActiveOperation[]>(
        '/api/calendar/operations/active',
      );
      setOperations(response.data);
    } catch (err) {
      console.error('Failed to load active batch operations', err);
      setError('加载激活批次操作数据失败');
    } finally {
      setLoading(false);
    }
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
    operationRowMap,
    batchRowMap,
    nodeMeta,
    expandedKeys: defaultExpanded,
  } = useMemo(() => buildTreeData(filteredOperations), [filteredOperations]);

  const dayWidth = useMemo(() => BASE_DAY_WIDTH * zoom, [zoom]);
  const hourWidth = useMemo(() => dayWidth / 24, [dayWidth]);

  const handleZoomChange = (value: number | number[]) => {
    const numeric = Array.isArray(value) ? value[0] : value;
    setZoom(numeric);
  };

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

  const selectedKey = selectedKeys[0];
  const selectedMeta = selectedKey ? nodeMeta.get(selectedKey) : null;
  const selectedOperationRow =
    selectedMeta?.type === 'operation'
      ? operationRowMap.get(selectedMeta.key)
      : null;
  const selectedStageRow =
    selectedMeta?.type === 'stage'
      ? stageRowMap.get(selectedMeta.key)
      : selectedOperationRow
      ? stageRowMap.get(selectedOperationRow.stageKey)
      : null;

  useEffect(() => {
    let cancelled = false;
    if (selectedMeta?.type === 'operation' && selectedOperationRow) {
      const operationPlanId = selectedOperationRow.operation.operation_plan_id;
      setOperationDetail(null);
      setOperationDetailError(null);
      setOperationDetailLoading(true);
      setOperationDetailDrawerVisible(true);
      axios
        .get<OperationDetailResponse>(`/api/calendar/operations/${operationPlanId}`)
        .then((response) => {
          if (!cancelled) {
            setOperationDetail(response.data);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch operation detail', err);
          if (!cancelled) {
            setOperationDetailError('加载操作人员信息失败');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setOperationDetailLoading(false);
          }
        });
    } else {
      setOperationDetail(null);
      setOperationDetailError(null);
      setOperationDetailLoading(false);
      setOperationDetailDrawerVisible(false);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedMeta?.type, selectedOperationRow?.operation.operation_plan_id, selectedOperationRow]);

  useEffect(() => {
    if (assignModalVisible && operationDetail?.assigned_personnel) {
      setAssignSelectedIds(
        operationDetail.assigned_personnel.map((person) => person.employee_id),
      );
    }
  }, [assignModalVisible, operationDetail]);

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

  const resourceSummaryMap = useMemo(() => {
    const map = new Map<string, { required: number; assigned: number }>();
    resourceSummary.forEach((item) => {
      map.set(item.day, { required: item.required, assigned: item.assigned });
    });
    return map;
  }, [resourceSummary]);

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
      return meta?.type === 'batch' || meta?.type === 'stage' || meta?.type === 'operation';
    });
  }, [visibleRows, nodeMeta]);

  const timelineWidth = useMemo(() => {
    if (!timeMetrics) {
      return 0;
    }
    return timeMetrics.totalDays * dayWidth;
  }, [timeMetrics, dayWidth]);

  const operationPositions = useMemo(() => {
    if (!timeMetrics) {
      return new Map<string, { centerY: number; left: number; right: number }>();
    }
    const map = new Map<string, { centerY: number; left: number; right: number }>();
    laneKeys.forEach((key, index) => {
      const meta = nodeMeta.get(key);
      if (meta?.type !== 'operation') {
        return;
      }
      const opRow = operationRowMap.get(key);
      if (!opRow) {
        return;
      }
      const start = dayjs(opRow.operation.planned_start_datetime);
      const end = dayjs(opRow.operation.planned_end_datetime);
      const left = start.diff(timeMetrics.minStart, 'hour', true) * hourWidth;
      const width = Math.max(end.diff(start, 'hour', true), 0.3) * hourWidth;
      map.set(key, {
        centerY: index * ROW_HEIGHT + ROW_HEIGHT / 2,
        left,
        right: left + width,
      });
    });
    return map;
  }, [laneKeys, nodeMeta, operationRowMap, timeMetrics, hourWidth]);

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

  const editingStage = editingOperationRow
    ? stageRowMap.get(editingOperationRow.stageKey)
    : undefined;

  const renderTimelineAxis = () => {
    if (!timeMetrics) {
      return null;
    }
    const days: React.ReactNode[] = [];
    for (let i = 0; i < timeMetrics.totalDays; i += 1) {
      const date = timeMetrics.minStart.add(i, 'day');
      const dayKey = date.format('YYYY-MM-DD');
      const summary = resourceSummaryMap.get(dayKey);
      const required = summary?.required ?? 0;
      const scale = maxDailyRequired > 0 ? required / maxDailyRequired : 0;
      const barHeight = Math.max(scale * 100, 4);
      const hours = Array.from({ length: 24 }).map((_, hourIndex) => {
        const isMajor = hourIndex % 6 === 0;
        return (
          <div
            key={`hour-${i}-${hourIndex}`}
            className={classNames('abg-axis-hour', {
              'abg-axis-hour-major': isMajor,
            })}
            style={{ width: hourWidth }}
          >
            {isMajor ? hourIndex.toString().padStart(2, '0') : ''}
          </div>
        );
      });
      days.push(
        <div key={date.toString()} className="abg-axis-day" style={{ width: dayWidth }}>
          <div className="abg-axis-day-stat">
            <div className="abg-axis-day-bar-wrapper">
              <div
                className="abg-axis-day-bar"
                style={{ height: `${barHeight}%`, opacity: required ? 1 : 0 }}
              >
                {required ? (
                  <span className="abg-axis-day-bar-value">{required}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="abg-axis-day-head">
            <div className="abg-axis-day-label">{date.format('MM-DD')}</div>
            <div className="abg-axis-day-week">{date.format('ddd')}</div>
          </div>
          <div className="abg-axis-hours">{hours}</div>
        </div>,
      );
    }
    return (
      <div className="abg-axis" style={{ width: timeMetrics.totalDays * dayWidth }}>
        {days}
      </div>
    );
  };

  const openOperationEditModal = (operationRow: OperationRow) => {
    setEditingOperationRow(operationRow);
    setEditModalVisible(true);
    editForm.setFieldsValue({
      plannedRange: [
        dayjs(operationRow.operation.planned_start_datetime),
        dayjs(operationRow.operation.planned_end_datetime),
      ],
      requiredPeople: operationRow.operation.required_people,
    });
    setSelectedKeys([operationRow.key]);
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
    const operationPlanId = selectedOperationRow.operation.operation_plan_id;
    setAssignModalVisible(true);
    setAssignLoading(true);
    setAssignError(null);

    try {
      const { data } = await axios.get<RecommendedPersonnel[]>(
        `/api/calendar/operations/${operationPlanId}/recommended-personnel`,
      );

      const enrichedList = [...data];
      if (operationDetail?.assigned_personnel?.length) {
        const existing = new Set(enrichedList.map((item) => item.employee_id));
        operationDetail.assigned_personnel.forEach((person) => {
          if (!existing.has(person.employee_id)) {
            enrichedList.push({
              employee_id: person.employee_id,
              employee_name: person.employee_name,
              employee_code: person.employee_code,
              match_score: 0,
              recommendation: 'CURRENT',
              has_conflict: false,
            });
          }
        });
      }

      setAssignCandidates(enrichedList);

      if (operationDetail?.assigned_personnel?.length) {
        setAssignSelectedIds(
          operationDetail.assigned_personnel.map(
            (person) => person.employee_id,
          ),
        );
      } else {
        const initial = enrichedList
          .filter((item) =>
            ['HIGHLY_RECOMMENDED', 'RECOMMENDED'].includes(
              (item.recommendation || '').toUpperCase(),
            ),
          )
          .map((item) => item.employee_id);
        setAssignSelectedIds(initial);
      }
    } catch (err) {
      console.error('Failed to load recommended personnel', err);
      setAssignError('加载推荐人员失败');
    } finally {
      setAssignLoading(false);
    }
  }, [operationDetail, selectedOperationRow]);

  const handleAssignSubmit = useCallback(async () => {
    if (!selectedOperationRow) {
      return;
    }
    if (!assignSelectedIds.length) {
      message.warning('请选择至少一名人员');
      return;
    }

    const operationPlanId = selectedOperationRow.operation.operation_plan_id;
    setAssignSubmitting(true);
    try {
      await axios.post(`/api/calendar/operations/${operationPlanId}/assign`, {
        employeeIds: assignSelectedIds,
      });
      message.success('人员分配成功');
      handleAssignModalClose();
      await loadOperations();
      const { data } = await axios.get<OperationDetailResponse>(
        `/api/calendar/operations/${operationPlanId}`,
      );
      setOperationDetail(data);
    } catch (err) {
      console.error('Failed to assign personnel', err);
      message.error('人员分配失败');
    } finally {
      setAssignSubmitting(false);
    }
  }, [
    assignSelectedIds,
    loadOperations,
    selectedOperationRow,
    handleAssignModalClose,
  ]);

  const handleToggleLock = useCallback(async () => {
    if (!selectedOperationRow) {
      return;
    }
    const operationPlanId = selectedOperationRow.operation.operation_plan_id;
    setLockLoading(true);
    try {
      if (selectedOperationRow.operation.is_locked) {
        await axios.delete(`/api/calendar/operations/${operationPlanId}/lock`);
        message.success('操作已解锁');
      } else {
        await axios.post(`/api/calendar/operations/${operationPlanId}/lock`);
        message.success('操作已锁定');
      }
      await loadOperations();
      const { data } = await axios.get<OperationDetailResponse>(
        `/api/calendar/operations/${operationPlanId}`,
      );
      setOperationDetail(data);
    } catch (err) {
      console.error('Failed to toggle operation lock', err);
      message.error('操作锁定状态更新失败');
    } finally {
      setLockLoading(false);
    }
  }, [loadOperations, selectedOperationRow]);

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
    const operationPlanId = editingOperationRow.operation.operation_plan_id;
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
    operationRow: OperationRow,
    stage: StageRow,
    batchColor: string,
    isActive: boolean,
    conflict = false,
  ) => {
    if (!timeMetrics) {
      return null;
    }
    const op = operationRow.operation;
    const start = dayjs(op.planned_start_datetime);
    const end = dayjs(op.planned_end_datetime);
    const offsetHours = start.diff(timeMetrics.minStart, 'hour', true);
    const durationHours = Math.max(end.diff(start, 'hour', true), 0.3);
    const left = offsetHours * hourWidth;
    const width = Math.max(durationHours * hourWidth, 6);
    const isLocked = Boolean(op.is_locked);

    let statusColor: string | undefined;
    if (op.assignment_status === 'UNASSIGNED') statusColor = '#ff4d4f';
    else if (op.assignment_status === 'PARTIAL') statusColor = '#faad14';
    else if (op.assignment_status === 'COMPLETE') statusColor = '#52c41a';

    const tip = (
      <div className="abg-operation-tip">
        <div className="abg-operation-tip-title">{op.operation_name}</div>
        <div>批次：{op.batch_code}</div>
        <div>阶段：{stage.stageName}</div>
        <div>
          时间：
          {start.format('YYYY-MM-DD HH:mm')} ~ {end.format('YYYY-MM-DD HH:mm')}
        </div>
        {op.window_start_datetime && op.window_end_datetime && (
          <div>
            窗口：
            {dayjs(op.window_start_datetime).format('YYYY-MM-DD HH:mm')} ~
            {dayjs(op.window_end_datetime).format('YYYY-MM-DD HH:mm')}
          </div>
        )}
        <div>
          人员：需求 {op.required_people} 人，已分配 {op.assigned_people} 人
        </div>
        <div>
          状态：
          {op.assignment_status || '未知'}
          {conflict ? '（未满足）' : ''}
        </div>
      </div>
    );

    return (
      <Tooltip key={operationRow.key} title={tip} placement="top">
        <div
          className={classNames('abg-operation-block', {
            'abg-operation-block-active': isActive,
            'abg-operation-block-conflict': conflict,
            'is-locked': isLocked,
          })}
          style={{
            left,
            width,
            backgroundColor: batchColor,
            borderColor: statusColor || batchColor,
          }}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedKeys([operationRow.key]);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            openOperationEditModal(operationRow);
          }}
        >
          <span className="abg-operation-text">{op.operation_name}</span>
          {isLocked && <span className="abg-operation-lock" title="已锁定">🔒</span>}
          {conflict && <span className="abg-operation-conflict">⚠</span>}
        </div>
      </Tooltip>
    );
  };

  const renderTimelineRows = () => {
    if (!timeMetrics) {
      return null;
    }
    const totalHeight = laneKeys.length * ROW_HEIGHT;
    const hourLines: React.ReactNode[] = [];
    const shiftBands: React.ReactNode[] = [];
    const totalHours = timeMetrics.totalDays * 24;
    for (let i = 0; i <= totalHours; i += 1) {
      const isDayBoundary = i % 24 === 0;
      const isMajor = i % 6 === 0;
      hourLines.push(
        <div
          key={`hour-line-${i}`}
          className={classNames('abg-hour-line', {
            'is-day-boundary': isDayBoundary,
            'is-major': isMajor && !isDayBoundary,
          })}
          style={{
            left: i * hourWidth,
            height: totalHeight,
          }}
        />
      );
    }

    for (let dayIndex = 0; dayIndex < timeMetrics.totalDays; dayIndex += 1) {
      const dayStartOffset = dayIndex * 24 * hourWidth;
      const segments = [
        { start: 0, end: 8.5, type: 'night' },
        { start: 8.5, end: 17, type: 'day' },
        { start: 17, end: 21, type: 'evening' },
        { start: 21, end: 24, type: 'night' },
      ];
      segments.forEach((segment, idx) => {
        const left = dayStartOffset + segment.start * hourWidth;
        const width = Math.max((segment.end - segment.start) * hourWidth, 0);
        shiftBands.push(
          <div
            key={`shift-${dayIndex}-${idx}`}
            className={classNames('abg-shift-band', `is-${segment.type}`)}
            style={{ left, width, height: totalHeight }}
          />,
        );
      });
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
        {laneKeys.map((key, index) => {
          const laneClass = index % 2 === 0 ? 'abg-lane-even' : 'abg-lane-odd';
          const meta = nodeMeta.get(key);
          if (!meta) {
            return null;
          }
          const top = index * ROW_HEIGHT;

          if (meta.type === 'batch') {
            const batch = batchRowMap.get(key);
            if (!batch || !timeMetrics) {
              return null;
            }
            const batchColor = batch.batchColor;
            const batchActive = selectedKeys.includes(batch.key);
            const batchLeft = Math.max(
              0,
              batch.start.diff(timeMetrics.minStart, 'hour', true) * hourWidth,
            );
            const batchWidth = Math.max(
              8,
              batch.end.diff(batch.start, 'hour', true) * hourWidth,
            );

            return (
              <div
                key={batch.key}
                className={classNames('abg-batch-row', laneClass, {
                  'abg-batch-row-active': batchActive,
                })}
                style={{ top, height: ROW_HEIGHT }}
                onClick={() => setSelectedKeys([batch.key])}
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
              </div>
            );
          }

          if (meta.type === 'stage') {
            const stage = stageRowMap.get(key);
            if (!stage) {
              return null;
            }
            const batchColor = stage.batchColor || DEFAULT_COLORS[0];
            const stageActive =
              selectedKeys.includes(stage.key) ||
              (selectedMeta?.type === 'operation' &&
                selectedMeta.stageKey === stage.key);

            const stageLeft = Math.max(
              0,
              stage.start.diff(timeMetrics.minStart, 'hour', true) * hourWidth,
            );
            const stageWidth = Math.max(
              6,
              stage.end.diff(stage.start, 'hour', true) * hourWidth,
            );

            return (
              <div
                key={stage.key}
                className={classNames('abg-stage-row', laneClass, {
                  'abg-stage-row-active': stageActive,
                })}
                style={{ top, height: ROW_HEIGHT }}
                onClick={() => setSelectedKeys([stage.key])}
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
              </div>
            );
          }

          if (meta.type === 'operation') {
            const opRow = operationRowMap.get(key);
            if (!opRow) {
              return null;
            }
            const stage = stageRowMap.get(opRow.stageKey);
            const batchColor =
              opRow.batchColor || stage?.batchColor || DEFAULT_COLORS[0];
            const conflict =
              opRow.operation.assigned_people <
              opRow.operation.required_people;

            return (
              <div
                key={opRow.key}
                className={classNames('abg-operation-row', laneClass)}
                style={{ top, height: ROW_HEIGHT }}
              >
                <div className="abg-operation-row-background" />
                {renderOperationWindow(opRow.operation, batchColor)}
                {renderOperationBlock(
                  opRow,
                  stage || {
                    key: opRow.stageKey,
                    batchId: opRow.batchId,
                    batchCode: opRow.batchCode,
                    batchName: opRow.batchName,
                    batchColor,
                    stageName: opRow.stageName,
                    operations: [opRow.operation],
                    start: opRow.start,
                    end: opRow.end,
                  },
                  batchColor,
                  selectedKeys.includes(opRow.key),
                  conflict,
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      <Card
      className="abg-card"
      title="激活批次甘特图（测试版）"
      variant="borderless"
      extra={
        <Button onClick={onClose} size="small">
          收起
        </Button>
      }
    >
      <div className="abg-toolbar">
        <Space size={16} wrap align="center">
          <Space size={6} align="center">
            <Text strong>批次：</Text>
            <Select
              mode="multiple"
              allowClear
              placeholder="选择批次"
              style={{ minWidth: 180 }}
              options={batchOptions}
              value={selectedBatchIds}
              onChange={(values) => setSelectedBatchIds(values as number[])}
            />
          </Space>
          <Space size={6} align="center">
            <Text strong>时间：</Text>
            <RangePicker
              value={dateRange || undefined}
              onChange={handleDateRangeChange}
              allowClear
            />
          </Space>
          <Space size={6} align="center">
            <Text strong>状态：</Text>
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
          </Space>
          <Space size={6} align="center">
            <Text strong>缩放：</Text>
            <Slider
              min={0.5}
              max={2.5}
              step={0.1}
              value={zoom}
              onChange={handleZoomChange}
              style={{ width: 130 }}
            />
            <Text type="secondary">x{zoom.toFixed(1)}</Text>
          </Space>
          <Space size={6}>
            <Button
              icon={<SyncOutlined />}
              onClick={() => {
                setSelectedBatchIds([]);
                setDateRange(null);
                setStatusFilter({ unassigned: true, partial: true, complete: true });
                setZoom(1);
              }}
            >
              重置
            </Button>
          </Space>
        </Space>
        <div className="abg-toolbar-legend">
          <Text strong>激活批次：</Text>
          <Space size={8} wrap>
            {batchLegend.map((batch) => (
              <Tag key={batch.code} color={batch.color}>
                {batch.code}
              </Tag>
            ))}
          </Space>
        </div>
      </div>
      <div className="abg-layout">
        <div className="abg-main">
          <div className="abg-side">
            <div className="abg-side-header">
              <span className="abg-side-header-title">批次结构</span>
              <span className="abg-side-header-sub">批次 / 阶段 / 操作</span>
            </div>
            <div
              className="abg-side-body"
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
          </div>
          <div className="abg-timeline-wrapper">
            <div
              className="abg-timeline-axis"
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
              className="abg-timeline-scroll"
              ref={timelineScrollRef}
              onScroll={(event) => {
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
      </div>

      {selectedMeta && (() => {
        if (selectedMeta.type === 'operation') {
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
      </Card>
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
                type={Boolean(operationDetail?.is_locked ?? selectedOperationRow.operation.is_locked) ? 'default' : 'primary'}
              >
                {Boolean(operationDetail?.is_locked ?? selectedOperationRow.operation.is_locked)
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
              const op = operationDetail ?? selectedOperationRow.operation;
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
                    {op?.operation_name || selectedOperationRow.operation.operation_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="批次">
                    {selectedOperationRow.batchCode}｜{selectedOperationRow.batchName}
                  </Descriptions.Item>
                  <Descriptions.Item label="阶段">
                    {selectedOperationRow.stageName}
                  </Descriptions.Item>
                  <Descriptions.Item label="计划时间">
                    {dayjs(selectedOperationRow.operation.planned_start_datetime).format('YYYY-MM-DD HH:mm')} -
                    {' '}
                    {dayjs(selectedOperationRow.operation.planned_end_datetime).format('YYYY-MM-DD HH:mm')}
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
            ? `调整操作：${editingOperationRow.operation.operation_name}`
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
              批次：{editingOperationRow.batchCode}｜{editingOperationRow.batchName}
            </Text>
            <Text type="secondary">阶段：{editingOperationRow.stageName}</Text>
            {editingStage && (
              <Text type="secondary">
                阶段范围：
                {editingStage.start.format('MM/DD')} - {editingStage.end.format('MM/DD')}
              </Text>
            )}
            {editingOperationRow.operation.window_start_datetime &&
              editingOperationRow.operation.window_end_datetime && (
                <Text type="secondary">
                  允许窗口：
                  {dayjs(editingOperationRow.operation.window_start_datetime).format(
                    'MM/DD HH:mm',
                  )}{' '}
                  -{' '}
                  {dayjs(editingOperationRow.operation.window_end_datetime).format(
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
            {assignCandidates.length ? (
              <Checkbox.Group
                style={{ width: '100%' }}
                value={assignSelectedIds}
                onChange={handleAssignSelectionChange}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  {assignCandidates.map((candidate) => (
                    <div key={candidate.employee_id} className="abg-assign-item">
                      <Checkbox
                        value={candidate.employee_id}
                        disabled={candidate.has_conflict}
                      >
                        <Space size={8} wrap>
                          <Text>{candidate.employee_name}</Text>
                          {candidate.employee_code && (
                            <Text type="secondary">
                              ({candidate.employee_code})
                            </Text>
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
                        <div className="abg-assign-desc">
                          {candidate.qualifications}
                        </div>
                      )}
                    </div>
                  ))}
                </Space>
              </Checkbox.Group>
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
