import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  message,
  Space,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Typography,
  Popconfirm,
  Divider,
  Collapse,
  Descriptions,
  Alert,
  List,
  Switch,
  Timeline,
  Progress,
  Spin,
  Checkbox
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  PlayCircleOutlined,
  ProjectOutlined,
  EyeOutlined,
  FileTextOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  StopOutlined,
  DotChartOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import ActivatedBatchGantt, { ActivatedBatchGanttActionRequest } from './ActivatedBatchGantt';
import ActivatedBatchGanttAligned from './ActivatedBatchGanttAligned';
import V3SchedulingModal from './V3SchedulingModal';
import V4SchedulingModal from './V4SchedulingModal';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import axios from 'axios';
import { schedulingRunApi, mlSchedulingApi } from '../services/api';
import type { SchedulingRunEvent, SchedulingRunStage, SchedulingRunEventStatus } from '../types';

const STAGE_LABELS: Record<SchedulingRunStage, string> = {
  QUEUED: '等待执行',
  PREPARING: '准备环境',
  LOADING_DATA: '加载数据',
  PLANNING: '生成排班',
  PERSISTING: '写入结果',
  COMPLETED: '已完成',
  FAILED: '执行失败',
};

const STATUS_COLOR_MAP: Record<SchedulingRunEventStatus, string> = {
  INFO: 'blue',
  WARN: 'orange',
  ERROR: 'red',
  SUCCESS: 'green',
  PROGRESS: 'cyan',
};

const ORG_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FRONTLINE', label: '一线员工' },
  { value: 'SHIFT_LEADER', label: '班长（Shift Leader）' },
  { value: 'GROUP_LEADER', label: '组长（Group Leader）' },
  { value: 'TEAM_LEADER', label: '团队主管（Team Leader）' },
  { value: 'DEPT_MANAGER', label: '部门经理' },
];

const SUB_STAGE_LABELS: Record<string, string> = {
  BASE_ROSTER: '生成基础班表',
  BASE_ROSTER_SKIPPED: '组合模式跳过基础班表',
  CANDIDATES_PREPARED: '构建候选画像',
  ITERATION_IN_PROGRESS: '迭代排班中',
  ITERATION_COMPLETE: '迭代排班完成',
  COMBINATIONAL_IN_PROGRESS: '组合排班中',
  COMBINATIONAL_COMPLETE: '组合排班完成',
  POST_PROCESSING: '执行工时校验',
  PERSISTING_START: '写入排班结果',
  PERSISTING_SKIP: '跳过写入（干跑）',
};

const { Option } = Select;
const { Text } = Typography;
const { RangePicker } = DatePicker;

const API_BASE_URL = 'http://localhost:3001/api';

interface BatchPlan {
  id: number;
  batch_code: string;
  batch_name: string;
  template_id: number;
  template_name?: string;
  project_code?: string;
  planned_start_date: string;
  planned_end_date: string;
  template_duration_days: number;
  plan_status: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'ACTIVATED' | 'COMPLETED' | 'CANCELLED';
  description?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  operation_count?: number;
  total_required_people?: number;
  assigned_people_count?: number;
}

interface ProcessTemplate {
  id: number;
  template_code: string;
  template_name: string;
  total_days?: number;
}

interface AutoPlanSummary {
  employeesTouched: number;
  operationsCovered: number;
  overtimeEntries: number;
  baseRosterRows: number;
  operationsAssigned: number;
}

interface CoverageGap {
  operationPlanId: number;
  operationId: number;
  operationName: string;
  batchPlanId: number;
  batchCode: string;
  stageName: string;
  planDate: string;
  requiredPeople: number;
  assignedPeople: number;
  availableHeadcount: number;
  availableQualified: number;
  qualifiedPoolSize: number;
  category: 'HEADCOUNT' | 'QUALIFICATION' | 'OTHER';
  status: 'UNASSIGNED' | 'PARTIAL';
  notes: string[];
  suggestions: string[];
}

interface HeuristicHotspot {
  id: string;
  operationPlanId: number;
  operationName: string;
  planDate: string;
  deficit: number;
  attempts: number;
  reason: string;
  notes: string[];
  relatedOperations: number[];
  createdAt: string;
}

interface CoverageSummary {
  totalOperations: number;
  fullyCovered: number;
  coverageRate: number;
  gaps: CoverageGap[];
  gapTotals: {
    headcount: number;
    qualification: number;
    other: number;
  };
}

interface ShareGroupOperationView {
  operationPlanId: number;
  operationName: string;
  planDate: string;
  assignedEmployees: string[];
  reusedEmployees: string[];
  missingPreferredEmployees: string[];
  reason?: string;
}

interface ShareGroupSummary {
  groupId: number;
  groupName?: string | null;
  color?: string | null;
  reuseSatisfied: boolean;
  totalPreferred: number;
  totalReused: number;
  operations: ShareGroupOperationView[];
  unmetReasons: string[];
}

interface SharePreferenceSummary {
  operationPlanId: number;
  operationName: string;
  planDate: string;
  preferredEmployees: string[];
  assignedEmployees: string[];
  unmetEmployees: string[];
  reason?: string;
}

interface ShareStatsSummary {
  totalGroupOperations: number;
  groupReuseSuccess: number;
  groupReusePartial: number;
  totalPreferenceOperations: number;
  preferenceReuseSuccess: number;
  preferenceReusePartial: number;
  trackedOperations: number;
  activeGroups: number;
  groupDetails: ShareGroupSummary[];
  preferenceDetails: SharePreferenceSummary[];
}

interface IterationSummary {
  totalIterations: number;
  evaluatedOperations: number;
  bestScore?: number;
  bestIteration?: number;
  bestOperationPlanId?: number;
  bestOperationName?: string;
  bestPlanDate?: string;
  scores?: number[];
}

interface MetricsSummary {
  coverageRate: number;
  totalOperations: number;
  fullyCovered: number;
  gapTotals: {
    headcount: number;
    qualification: number;
    other: number;
  };
  warnings: number;
  overtimeEntries: number;
  employeesTouched: number;
  shareStats?: ShareStatsSummary;
  generatedAt: string;
  iterationSummary?: IterationSummary;
}

interface HeuristicSummary {
  hotspotCount: number;
  weights: Record<string, number>;
  generatedAt: string;
}

interface AutoPlanBatchWindow {
  batchPlanId: number;
  batchCode: string;
  start: string | null;
  end: string | null;
  totalOperations: number;
}

interface AutoPlanResultData {
  message: string;
  period: {
    startDate: string;
    endDate: string;
    quarter: string;
  };
  batches: AutoPlanBatchWindow[];
  warnings: string[];
  run: {
    id: number;
    key: string;
    status: 'RUNNING' | 'DRAFT' | 'PENDING_PUBLISH' | 'PUBLISHED' | 'ROLLED_BACK' | 'FAILED';
    resultId: number;
  };
  summary: AutoPlanSummary;
  diagnostics: {
    missingCalendar?: boolean;
  };
  logs: string[];
  coverage: CoverageSummary;
  metricsSummary?: MetricsSummary;
  heuristicSummary?: HeuristicSummary;
  heuristicHotspots?: HeuristicHotspot[];
  iterationSummary?: IterationSummary;
  async?: boolean;
  comprehensiveWorkTimeStatus?: {
    employees: Array<{
      employeeId: number;
      employeeName: string;
      quarterHours: number;
      quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      monthlyStatus: Array<{
        month: string;
        hours: number;
        status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
      }>;
      restDays: number;
      restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    }>;
    quarterTargetHours: number;
    quarterMinHours: number;
    quarterMaxHours: number;
    monthToleranceHours?: number;
  };
}

const BatchManagement: React.FC = () => {
  const [batches, setBatches] = useState<BatchPlan[]>([]);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchPlan | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchPlan | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [ganttVisible, setGanttVisible] = useState(false);
  const [useAlignedGantt, setUseAlignedGantt] = useState(false);
  const [ganttActionRequest, setGanttActionRequest] =
    useState<ActivatedBatchGanttActionRequest | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [autoPlanLoading, setAutoPlanLoading] = useState(false);
  const [autoPlanMode, setAutoPlanMode] = useState<'classic' | 'combo' | 'v3'>('classic');
  const [autoPlanModalVisible, setAutoPlanModalVisible] = useState(false);
  const [v3ModalVisible, setV3ModalVisible] = useState(false);
  const [v4ModalVisible, setV4ModalVisible] = useState(false);
  const [autoPlanResult, setAutoPlanResult] = useState<AutoPlanResultData | null>(null);
  const [autoPlanLaunching, setAutoPlanLaunching] = useState(false);
  const [iterationProgress, setIterationProgress] = useState<
    | {
        current: number;
        total: number;
        comboScore?: number;
        bestScore?: number;
        bestIteration?: number;
        operationName?: string;
      }
    | null
  >(null);
  const [currentSubStage, setCurrentSubStage] = useState<string | null>(null);
  const [currentSubStageMessage, setCurrentSubStageMessage] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [autoPlanForm] = Form.useForm();
  const [autoPlanConfigVisible, setAutoPlanConfigVisible] = useState(false);
  const [publishingRun, setPublishingRun] = useState(false);
  const [rollingBackRun, setRollingBackRun] = useState(false);
  const [runEvents, setRunEvents] = useState<SchedulingRunEvent[]>([]);
  const [progressConnected, setProgressConnected] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventIdRef = useRef<number | undefined>(undefined);
  const trackingRunIdRef = useRef<number | null>(null);

  const planStatusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: '草稿', disabled: false },
      { value: 'PLANNED', label: '已计划', disabled: false },
      { value: 'APPROVED', label: '已批准', disabled: false },
      { value: 'COMPLETED', label: '已完成', disabled: false },
      { value: 'CANCELLED', label: '已取消', disabled: false },
      // 激活态需要通过生命周期接口处理，这里禁用以避免创建时触发后端校验错误
      { value: 'ACTIVATED', label: '已激活', disabled: true },
    ],
    [],
  );


const latestEvent = runEvents.length ? runEvents[runEvents.length - 1] : null;
const latestStage = latestEvent?.stage;

const formatMetadata = useCallback((metadata: any) => {
  if (metadata === null || metadata === undefined) {
    return '';
  }
  if (typeof metadata === 'string') {
    return metadata;
  }
  if (typeof metadata === 'object') {
    const type = metadata.type ?? metadata.eventType;
    if (type === 'ITERATION_PROGRESS') {
      const iteration = metadata.iteration ?? metadata.current;
      const total = metadata.totalIterations ?? metadata.total;
      const comboScore = metadata.comboScore ?? metadata.score;
      const bestScore = metadata.bestOverallScore ?? metadata.bestScore;
      return `迭代 ${iteration}/${total} · 当前 ${Number(comboScore ?? 0).toFixed(2)} · 最佳 ${Number(bestScore ?? comboScore ?? 0).toFixed(2)}`;
    }
  }
  try {
    return JSON.stringify(metadata);
  } catch (error) {
    return '';
  }
}, []);

const progressPercent = useMemo(() => {
  if (!latestStage) {
    return runEvents.length ? 10 : 5;
  }

  let value: number;

  switch (latestStage) {
    case 'QUEUED':
      value = 5;
      break;
    case 'PREPARING':
      value = 15;
      break;
    case 'LOADING_DATA':
      value = latestEvent?.status === 'SUCCESS' ? 40 : 25;
      break;
    case 'PLANNING': {
      value = 45;
      const subStage = currentSubStage ?? '';
      // v3模式的阶段进度 - 根据日志中的阶段信息更新进度
      if (latestEvent?.message) {
        if (latestEvent.message.includes('阶段3') || latestEvent.message.includes('候选筛选')) {
          value = 50;
          // 如果有进度信息（如"候选筛选进度: 30/72"），计算更精确的进度
          const progressMatch = latestEvent.message.match(/进度:\s*(\d+)\/(\d+)/);
          if (progressMatch) {
            const current = parseInt(progressMatch[1], 10);
            const total = parseInt(progressMatch[2], 10);
            if (total > 0) {
              value = 50 + Math.round((current / total) * 10); // 50-60
            }
          }
        } else if (latestEvent.message.includes('阶段4') || latestEvent.message.includes('多目标优化')) {
          value = 60;
        } else if (latestEvent.message.includes('阶段5') || latestEvent.message.includes('选择最优方案')) {
          value = 70;
        } else if (latestEvent.message.includes('阶段6') || latestEvent.message.includes('约束验证')) {
          value = 75;
        } else if (latestEvent.message.includes('阶段7') || latestEvent.message.includes('工时均衡')) {
          value = 80;
        } else if (latestEvent.message.includes('阶段8') || latestEvent.message.includes('综合工时制')) {
          value = 85;
        }
      }
      if (subStage === 'BASE_ROSTER') {
        value = 55;
      } else if (subStage === 'CANDIDATES_PREPARED') {
        value = 58;
      } else if (subStage === 'ITERATION_IN_PROGRESS') {
        if (iterationProgress?.total) {
          const ratio = Math.min(
            1,
            Math.max(0, iterationProgress.current / iterationProgress.total),
          );
          value = 60 + Math.round(ratio * 20);
        } else {
          value = 60;
        }
      } else if (subStage === 'ITERATION_COMPLETE') {
        value = 80;
      } else if (subStage === 'POST_PROCESSING') {
        value = 85;
      } else if (iterationProgress?.total) {
        const ratio = Math.min(
          1,
          Math.max(0, iterationProgress.current / iterationProgress.total),
        );
        value = 60 + Math.round(ratio * 20);
      }
      break;
    }
    case 'PERSISTING':
      if (latestEvent?.status === 'SUCCESS') {
        value = 95;
      } else if (currentSubStage === 'PERSISTING_SKIP') {
        value = 92;
      } else {
        value = 90;
      }
      break;
    case 'COMPLETED':
      value = 100;
      break;
    case 'FAILED':
      value = 100;
      break;
    default:
      value = 50;
  }

  return Math.min(100, Math.max(0, value));
}, [
  latestStage,
  latestEvent,
  runEvents.length,
  iterationProgress,
  currentSubStage,
]);

type ProgressStatus = 'normal' | 'active' | 'exception' | 'success';
const progressStatus = useMemo<ProgressStatus>(() => {
  if (latestStage === 'FAILED') {
    return 'exception';
  }
  if (latestStage === 'COMPLETED') {
    return 'success';
  }
  return progressConnected ? 'active' : 'normal';
}, [latestStage, progressConnected]);

const currentStageLabel = useMemo(() => {
  if (latestStage === 'COMPLETED') {
    return '已完成';
  }
  if (latestStage === 'FAILED') {
    return '执行失败';
  }
  if (currentSubStage && SUB_STAGE_LABELS[currentSubStage]) {
    return SUB_STAGE_LABELS[currentSubStage];
  }
  if (latestStage) {
    return STAGE_LABELS[latestStage] ?? latestStage;
  }
  return '等待执行';
}, [latestStage, currentSubStage]);

  const stopProgressTracking = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    trackingRunIdRef.current = null;
    setProgressConnected(false);
    setIterationProgress(null);
  }, []);

  const appendEvents = useCallback(
    (incoming: SchedulingRunEvent[]) => {
      if (!incoming.length) {
        return;
      }

      let latestIteration: {
        current: number;
        total: number;
        comboScore?: number;
        bestScore?: number;
        bestIteration?: number;
        operationName?: string;
      } | null = null;
      let latestSubStage: { code: string; message?: string } | undefined;

      setRunEvents((prev) => {
        const map = new Map<number, SchedulingRunEvent>();
        prev.forEach((event) => {
          map.set(event.id, event);
        });
        incoming.forEach((event) => {
          map.set(event.id, event);
          const meta = event.metadata;
          if (meta && (meta.type === 'ITERATION_PROGRESS' || meta.eventType === 'ITERATION_PROGRESS')) {
            latestIteration = {
              current: Number(meta.iteration ?? meta.current ?? 0),
              total: Number(meta.totalIterations ?? meta.total ?? 0),
              comboScore: typeof meta.comboScore === 'number' ? meta.comboScore : typeof meta.score === 'number' ? meta.score : undefined,
              bestScore: typeof meta.bestOverallScore === 'number' ? meta.bestOverallScore : typeof meta.bestScore === 'number' ? meta.bestScore : undefined,
              bestIteration: typeof meta.bestIteration === 'number' ? meta.bestIteration : undefined,
              operationName: meta.operationName || meta.operation_plan_name || undefined,
            };
          }
          if (meta && (meta.type === 'SUB_STAGE' || meta.eventType === 'SUB_STAGE')) {
            const codeRaw = meta.code ?? meta.subStage ?? meta.stage ?? meta.step;
            if (codeRaw) {
              latestSubStage = {
                code: String(codeRaw).toUpperCase(),
                message: event.message || (typeof meta.message === 'string' ? meta.message : undefined),
              };
            }
          }
        });
        const merged = Array.from(map.values()).sort((a, b) => a.id - b.id);
        const last = merged[merged.length - 1];
        lastEventIdRef.current = last.id;
        if (last.stage === 'COMPLETED' || last.stage === 'FAILED') {
          stopProgressTracking();
        }
        return merged;
      });

      if (latestIteration) {
        setIterationProgress(latestIteration);
      }
      if (latestSubStage) {
        setCurrentSubStage(latestSubStage.code);
        setCurrentSubStageMessage(latestSubStage.message ?? null);
      }
    },
    [stopProgressTracking],
  );

  const fetchRunEvents = useCallback(
    async (runId: number, sinceId?: number) => {
      try {
        const events: SchedulingRunEvent[] = await schedulingRunApi.events(
          runId,
          sinceId,
          200,
        );
        if (events.length) {
          appendEvents(events);
        }
      } catch (error: any) {
        console.error('Failed to fetch run events', error);
        setProgressError(error?.response?.data?.error || error?.message || '事件获取失败');
      }
    },
    [appendEvents],
  );

  const startPolling = useCallback(
    (runId: number) => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      pollTimerRef.current = setInterval(() => {
        fetchRunEvents(runId, lastEventIdRef.current);
      }, 1000);
    },
    [fetchRunEvents],
  );

  const startProgressTracking = useCallback(
    async (runId: number) => {
      if (!runId) {
        return;
      }
      if (trackingRunIdRef.current !== runId) {
        stopProgressTracking();
        trackingRunIdRef.current = runId;
        setRunEvents([]);
        lastEventIdRef.current = undefined;
        setProgressError(null);
        setCurrentSubStage(null);
        setCurrentSubStageMessage(null);
        setIterationProgress(null);
        await fetchRunEvents(runId);
      } else {
        await fetchRunEvents(runId, lastEventIdRef.current);
      }

      if (typeof window === 'undefined' || !('EventSource' in window)) {
        startPolling(runId);
        return;
      }

      if (eventSourceRef.current) {
        return;
      }

      const source = new EventSource(`/api/scheduling/runs/${runId}/progress`);
      eventSourceRef.current = source;

      source.onopen = () => {
        setProgressConnected(true);
        setProgressError(null);
      };

      source.addEventListener('progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as SchedulingRunEvent;
          appendEvents([data]);
        } catch (err) {
          console.error('Failed to parse progress event', err);
        }
      });

      source.onerror = (err) => {
        console.error('Progress SSE error', err);
        setProgressConnected(false);
        setProgressError(null);
        source.close();
        eventSourceRef.current = null;
        startPolling(runId);
      };
    },
    [appendEvents, fetchRunEvents, startPolling, stopProgressTracking],
  );

  const renderShareStats = (shareStats?: ShareStatsSummary) => {
    if (!shareStats) {
      return null;
    }

    const hasGroupDetails = shareStats.groupDetails?.length > 0;
    const hasPreferenceDetails = shareStats.preferenceDetails?.length > 0;

    if (!hasGroupDetails && !hasPreferenceDetails) {
      return (
        <Text type="secondary">
          共享组跟踪 {shareStats.trackedOperations} · 活跃 {shareStats.activeGroups}
        </Text>
      );
    }

    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text type="secondary">
          共享组跟踪 {shareStats.trackedOperations} · 活跃 {shareStats.activeGroups}
        </Text>
        {hasGroupDetails &&
          shareStats.groupDetails.map((detail) => {
            const label = detail.groupName || `共享组 ${detail.groupId}`;
            const statusColor = detail.reuseSatisfied ? 'green' : 'volcano';
            return (
              <Space
                direction="vertical"
                size={2}
                key={`share-group-${detail.groupId}`}
                style={{ width: '100%' }}
              >
                <Space size={8} wrap>
                  <Text strong>{label}</Text>
                  <Tag color={statusColor}>
                    复用 {detail.totalReused}/{detail.totalPreferred || '—'}
                  </Tag>
                </Space>
                {detail.operations.map((op) => (
                  <Text
                    type="secondary"
                    key={`share-group-${detail.groupId}-op-${op.operationPlanId}`}
                  >
                    {op.planDate} {op.operationName} · 复用[{op.reusedEmployees.join('、') || '无'}]
                    {op.missingPreferredEmployees.length
                      ? ` · 未复用[${op.missingPreferredEmployees.join('、')}]`
                      : ''}
                    {op.reason ? ` · ${op.reason}` : ''}
                  </Text>
                ))}
                {detail.unmetReasons.length ? (
                  <Text type="secondary">
                    原因：{detail.unmetReasons.join('；')}
                  </Text>
                ) : null}
              </Space>
            );
          })}
        {hasPreferenceDetails &&
          shareStats.preferenceDetails.map((item) => (
            <Space
              direction="vertical"
              size={2}
              key={`share-preference-${item.operationPlanId}`}
              style={{ width: '100%' }}
            >
              <Space size={8} wrap>
                <Text strong>
                  偏好未满足 · {item.planDate} {item.operationName}
                </Text>
              </Space>
              <Text type="secondary">
                期望[{item.preferredEmployees.join('、') || '无'}] · 已分配[{item.assignedEmployees.join('、') || '无'}]
              </Text>
              {item.unmetEmployees.length ? (
                <Text type="secondary">
                  未命中[{item.unmetEmployees.join('、')}]
                </Text>
              ) : null}
              {item.reason ? <Text type="secondary">原因：{item.reason}</Text> : null}
            </Space>
          ))}
      </Space>
    );
  };

  const renderMetricsSummary = (metrics?: MetricsSummary) => {
    if (!metrics) {
      return <Text type="secondary">暂无指标数据</Text>;
    }

    // 兼容v3 API：gapTotals可能在coverage中，也可能在metrics中
    const gapTotals = metrics.gapTotals || { headcount: 0, qualification: 0, other: 0 };

    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size={8} wrap>
          <Tag color={metrics.coverageRate >= 1 ? 'green' : metrics.coverageRate >= 0.95 ? 'blue' : 'red'}>
            覆盖率 {(metrics.coverageRate * 100).toFixed(2)}%
          </Tag>
          <Tag color="cyan">
            操作 {metrics.fullyCovered}/{metrics.totalOperations}
          </Tag>
          <Tag color={metrics.warnings > 0 ? 'volcano' : 'default'}>提醒 {metrics.warnings}</Tag>
          <Tag color={metrics.overtimeEntries > 0 ? 'magenta' : 'default'}>
            加班 {metrics.overtimeEntries}
          </Tag>
          <Tag color="geekblue">触达人 {metrics.employeesTouched}</Tag>
        </Space>
        <Space size={8} wrap>
          <Tag color="volcano">人数缺口 {gapTotals.headcount}</Tag>
          <Tag color="purple">资质缺口 {gapTotals.qualification}</Tag>
          <Tag color="default">其他缺口 {gapTotals.other}</Tag>
        </Space>
        {renderShareStats(metrics.shareStats)}
        <Text type="secondary">
          生成时间：{dayjs(metrics.generatedAt).format('YYYY-MM-DD HH:mm')}
        </Text>
      </Space>
    );
  };

  const renderHeuristicSummary = (heuristic?: HeuristicSummary) => {
    if (!heuristic) {
      return <Text type="secondary">暂无启发式数据</Text>;
    }

    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space size={8} wrap>
          <Tag color={heuristic.hotspotCount > 0 ? 'volcano' : 'green'}>
            热点 {heuristic.hotspotCount}
          </Tag>
        </Space>
        <Space size={8} wrap>
          {Object.entries(heuristic.weights || {}).map(([key, value]) => (
            <Tag key={key}>{key}: {value.toFixed(2)}</Tag>
          ))}
        </Space>
        <Text type="secondary">
          生成时间：{dayjs(heuristic.generatedAt).format('YYYY-MM-DD HH:mm')}
        </Text>
      </Space>
    );
  };

  const renderIterationSummary = (summary?: IterationSummary) => {
    if (!summary || summary.totalIterations <= 1) {
      return <Text type="secondary">未启用迭代搜索</Text>;
    }

    const completed = summary.scores?.length
      ? Math.min(summary.scores.length, summary.totalIterations)
      : summary.totalIterations;
    const percent = Math.min(100, Math.round((completed / summary.totalIterations) * 100));
    const steps = Math.min(summary.totalIterations, 40);

    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Progress
          percent={percent}
          steps={steps}
          showInfo={false}
          strokeColor="#1890ff"
          style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}
        />
        <Space size={8} wrap>
          <Tag color="blue">迭代 {completed}/{summary.totalIterations}</Tag>
          <Tag color="geekblue">评估操作 {summary.evaluatedOperations}</Tag>
          {summary.bestIteration ? (
            <Tag color="purple">最佳迭代 {summary.bestIteration}</Tag>
          ) : null}
          {summary.bestScore !== undefined ? (
            <Tag color="gold">最高评分 {summary.bestScore.toFixed(2)}</Tag>
          ) : null}
        </Space>
        {summary.bestOperationName ? (
          <Text type="secondary">
            最佳组合：{summary.bestOperationName}
            {summary.bestPlanDate ? `（${summary.bestPlanDate}）` : ''}
          </Text>
        ) : null}
      </Space>
    );
  };

  // 获取数据
  useEffect(() => {
    fetchBatchPlans();
    fetchTemplates();
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (!autoPlanModalVisible || !autoPlanResult?.run?.id) {
      return () => {};
    }

    const runId = autoPlanResult.run.id;
    startProgressTracking(runId);

    return () => {
      stopProgressTracking();
    };
  }, [autoPlanModalVisible, autoPlanResult?.run?.id, startProgressTracking, stopProgressTracking]);

  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, [stopProgressTracking]);

  const fetchBatchPlans = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans`);
      setBatches(response.data);
    } catch (error) {
      console.error('Error fetching batch plans:', error);
      message.error('获取批次计划失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans/templates`);
      const templateData = response.data.map((t: any) => ({
        id: t.id,
        template_code: t.template_code,
        template_name: t.template_name,
        total_days: t.calculated_duration || t.total_days
      }));
      setTemplates(templateData);
    } catch (error) {
      console.error('Error fetching templates:', error);
      message.error('获取模版列表失败');
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/batch-plans/statistics`);
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  // 状态标签渲染
  const renderStatus = (status: string) => {
    const statusConfig = {
      DRAFT: { color: 'default', text: '草稿' },
      PLANNED: { color: 'processing', text: '已计划' },
      APPROVED: { color: 'success', text: '已批准' },
      ACTIVATED: { color: 'warning', text: '已激活' },
      COMPLETED: { color: 'default', text: '已完成' },
      CANCELLED: { color: 'error', text: '已取消' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列定义
  const columns: ColumnsType<BatchPlan> = [
    {
      title: '批次编号',
      dataIndex: 'batch_code',
      key: 'batch_code',
      fixed: 'left',
      width: 150,
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: '批次名称',
      dataIndex: 'batch_name',
      key: 'batch_name',
      width: 200
    },
    {
      title: '项目代码',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 120
    },
    {
      title: '工艺模版',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 180,
      render: (text) => (
        <Tooltip title={text}>
          <ProjectOutlined /> {text}
        </Tooltip>
      )
    },
    {
      title: '计划开始日期',
      dataIndex: 'planned_start_date',
      key: 'planned_start_date',
      width: 120,
      render: (text) => (
        <Space>
          <CalendarOutlined />
          {text}
        </Space>
      )
    },
    {
      title: '计划结束日期',
      dataIndex: 'planned_end_date',
      key: 'planned_end_date',
      width: 120,
      render: (text) => text
    },
    {
      title: '工期(天)',
      dataIndex: 'template_duration_days',
      key: 'template_duration_days',
      width: 100,
      align: 'center',
      render: (days) => <Tag color="blue">{days}天</Tag>
    },
    {
      title: '状态',
      dataIndex: 'plan_status',
      key: 'plan_status',
      width: 100,
      align: 'center',
      render: (status) => renderStatus(status)
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button 
              icon={<EyeOutlined />} 
              size="small"
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button 
              icon={<EditOutlined />} 
              size="small"
              onClick={() => handleEdit(record)}
              disabled={record.plan_status === 'ACTIVATED' || record.plan_status === 'COMPLETED'}
            />
          </Tooltip>
          {record.plan_status === 'APPROVED' && (
            <Tooltip title="激活批次">
              <Button 
                icon={<PlayCircleOutlined />} 
                size="small"
                type="primary"
                onClick={() => handleActivate(record)}
              />
            </Tooltip>
          )}
          {record.plan_status === 'ACTIVATED' && (
            <Tooltip title="人员安排">
              <Button 
                icon={<TeamOutlined />} 
                size="small"
                onClick={() => message.info('请在人员排班日历中安排人员')}
              />
            </Tooltip>
          )}
          {record.plan_status === 'ACTIVATED' && (
            <Tooltip title="撤销激活">
              <Button
                icon={<StopOutlined />}
                size="small"
                danger
                onClick={() => handleDeactivate(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="确定删除这个批次计划吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.plan_status === 'ACTIVATED'}
          >
            <Tooltip title="删除">
              <Button 
                icon={<DeleteOutlined />} 
                size="small"
                danger
                disabled={record.plan_status === 'ACTIVATED'}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys.map((key) => Number(key))),
    getCheckboxProps: (record: BatchPlan) => ({
      disabled: record.plan_status !== 'ACTIVATED',
    }),
  };

  // 处理新增
  const handleAdd = () => {
    setEditingBatch(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  // 处理编辑
  const handleEdit = (record: BatchPlan) => {
    setEditingBatch(record);
    form.setFieldsValue({
      ...record,
      planned_start_date: dayjs(record.planned_start_date)
    });
    setIsModalVisible(true);
  };

  // 处理删除
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE_URL}/batch-plans/${id}`, {
        params: { force: true },
      });
      message.success('删除成功');
      fetchBatchPlans();
      fetchStatistics();
    } catch (error) {
      console.error('Error deleting batch plan:', error);
      message.error('删除批次计划失败');
    }
  };

  // 处理查看详情
  const handleViewDetail = (record: BatchPlan) => {
    setSelectedBatch(record);
    setDetailModalVisible(true);
  };

  // 处理激活批次
  const handleActivate = async (record: BatchPlan) => {
    Modal.confirm({
      title: '确认激活批次',
      content: `确定要激活批次 "${record.batch_code}" 吗？激活后将在人员排班日历中显示。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.post(`${API_BASE_URL}/calendar/batch/${record.id}/activate`, {
            color: '#' + Math.floor(Math.random()*16777215).toString(16)
          });
          message.success('批次激活成功');
          fetchBatchPlans();
          fetchStatistics();
        } catch (error) {
          console.error('Error activating batch:', error);
          message.error('激活批次失败');
        }
      }
    });
  };

  // 撤销激活
  const handleDeactivate = async (record: BatchPlan) => {
    Modal.confirm({
      title: '确认撤销激活',
      content: `撤销后批次 "${record.batch_code}" 将从排班日历中移除，所有已安排人员会被清除。确定继续？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.post(`${API_BASE_URL}/calendar/batch/${record.id}/deactivate`);
          message.success('批次激活已撤销');
          fetchBatchPlans();
          fetchStatistics();
        } catch (error) {
          console.error('Error deactivating batch:', error);
          message.error('撤销批次激活失败');
        }
      }
    });
  };

  const triggerGanttAction = (
    operationPlanId: number,
    action: 'focus' | 'assign',
    batchPlanId?: number,
  ) => {
    if (batchPlanId) {
      setSelectedRowKeys((prev) =>
        prev.length === 1 && prev[0] === batchPlanId ? prev : [batchPlanId],
      );
    }
    setGanttVisible(true);
    setGanttActionRequest({
      operationPlanId,
      action,
      requestedAt: Date.now(),
    });
  };

  const handleAutoPlan = () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择至少一个已激活批次');
      return;
    }
    setAutoPlanMode('classic');
    autoPlanForm.setFieldsValue({
      dateRange: null,
      includeBaseRoster: true,
      dryRun: true,
      publishNow: false,
      iterationCount: 100,
      randomizationStrength: 0.15,
      randomSeed: null,
      allowedOrgRoles: ORG_ROLE_OPTIONS.map((item) => item.value),
    });
    setAutoPlanConfigVisible(true);
  };

  const handleAutoPlanV3 = () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择至少一个已激活批次');
      return;
    }
    setV3ModalVisible(true);
  };

  const handleAutoPlanV4 = () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择至少一个已激活批次');
      return;
    }
    setV4ModalVisible(true);
  };

  const handleAutoPlanNew = () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择至少一个已激活批次');
      return;
    }
    setAutoPlanMode('combo');
    autoPlanForm.setFieldsValue({
      dateRange: null,
      includeBaseRoster: true,
      dryRun: true,
      publishNow: false,
      iterationCount: 1,
      randomizationStrength: 0,
      randomSeed: null,
      allowedOrgRoles: ORG_ROLE_OPTIONS.map((item) => item.value),
    });
    setAutoPlanConfigVisible(true);
  };

  const executeAutoPlan = async () => {
    try {
      const values = await autoPlanForm.validateFields();
      const targetBatches = batches.filter((batch) => selectedRowKeys.includes(batch.id));
      const years = Array.from(
        new Set<number>(
          targetBatches.flatMap((batch) => {
            const result: number[] = [];
            if (batch.planned_start_date) {
              result.push(dayjs(batch.planned_start_date).year());
            }
            if (batch.planned_end_date) {
              result.push(dayjs(batch.planned_end_date).year());
            }
            return result;
          })
        )
      );

      for (const year of years) {
        try {
          await axios.post(`${API_BASE_URL}/calendar/holidays/import`, { year });
        } catch (importError: any) {
          console.error('Holiday import failed:', importError);
          message.warning(`同步 ${year} 年节假日失败：${importError?.response?.data?.error || importError?.message}`);
        }
      }

      setAutoPlanLoading(true);
      setAutoPlanLaunching(true);
      stopProgressTracking();
      setRunEvents([]);
      setProgressError(null);
      setAutoPlanResult(null);
      setIterationProgress(null);
      setAutoPlanModalVisible(true);
      const dateRange = values.dateRange as [dayjs.Dayjs, dayjs.Dayjs] | null;
      const payload: Record<string, any> = {
        batchIds: selectedRowKeys,
        options: {
          ...(autoPlanMode !== 'v3' && { includeBaseRoster: values.includeBaseRoster }),
          dryRun: values.dryRun,
          ...(autoPlanMode !== 'v3' && { publishNow: !values.dryRun && values.publishNow }),
          asyncProgress: autoPlanMode === 'classic',
        },
      };
      if (
        autoPlanMode === 'classic' &&
        typeof values.iterationCount === 'number' &&
        Number.isFinite(values.iterationCount)
      ) {
        payload.options.iterationCount = Math.max(1, Math.floor(values.iterationCount));
      }
      if (
        autoPlanMode === 'classic' &&
        typeof values.randomizationStrength === 'number' &&
        Number.isFinite(values.randomizationStrength)
      ) {
        payload.options.randomizationStrength = Math.max(0, values.randomizationStrength);
      }
      if (
        autoPlanMode === 'classic' &&
        values.randomSeed !== undefined &&
        values.randomSeed !== null &&
        values.randomSeed !== ''
      ) {
        const seedNumber = Number(values.randomSeed);
        if (!Number.isNaN(seedNumber)) {
          payload.options.randomSeed = Math.floor(seedNumber);
        }
      }
      if (Array.isArray(values.allowedOrgRoles)) {
        const normalizedRoles = values.allowedOrgRoles
          .map((role: string) => String(role).trim())
          .filter((role: string) => Boolean(role));
        if (normalizedRoles.length) {
          payload.options.allowedOrgRoles = Array.from(new Set(normalizedRoles));
        }
      }
      if (dateRange) {
        payload.startDate = dateRange[0].format('YYYY-MM-DD');
        payload.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      // v3算法使用独立模态框，这里只处理classic和combo
      const endpoint =
        autoPlanMode === 'combo'
          ? `${API_BASE_URL}/scheduling/auto-plan/v2`
          : `${API_BASE_URL}/scheduling/auto-plan`;
      const axiosResponse = await axios.post(endpoint, payload);
      const response = axiosResponse.data;
      const result: AutoPlanResultData = response;
      // 日志转换为进度事件（仅classic和combo模式）
      if (autoPlanMode !== 'v3' && result.logs && Array.isArray(result.logs)) {
        const logs = result.logs;
        const events: SchedulingRunEvent[] = logs.map((log: string, index: number) => {
          // 解析日志文本，提取阶段信息
          let stage: SchedulingRunStage = 'QUEUED';
          let status: SchedulingRunEventStatus = 'INFO';
          let message = log;

          // 解析耗时信息
          const timeMatch = log.match(/耗时\s+([\d.]+)\s+秒/);
          const timeTaken = timeMatch ? `${timeMatch[1]}秒` : '';

          if (log.includes('阶段1') || log.includes('上下文准备')) {
            stage = 'PREPARING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段1: 上下文准备与数据加载完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段1: 上下文准备与数据加载`;
            }
          } else if (log.includes('阶段2') || log.includes('工作负载预测')) {
            stage = 'LOADING_DATA';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段2: 工作负载预测完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段2: 工作负载预测`;
            }
          } else if (log.includes('阶段3') || log.includes('操作排序') || log.includes('候选筛选')) {
            stage = 'PLANNING';
            if (log.includes('进度')) {
              status = 'INFO';
            } else if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段3: 候选筛选完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段3: 操作排序与候选筛选`;
            }
          } else if (log.includes('阶段4') || log.includes('多目标优化')) {
            stage = 'PLANNING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段4: 多目标优化完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段4: 多目标优化排班`;
            }
          } else if (log.includes('阶段5') || log.includes('选择最优方案')) {
            stage = 'PLANNING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段5: 选择最优方案完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段5: 选择最优方案`;
            }
          } else if (log.includes('阶段6') || log.includes('约束验证')) {
            stage = 'PLANNING';
            if (log.includes('完成') || log.includes('修复')) {
              status = 'SUCCESS';
            } else {
              message = `阶段6: 约束验证与修复`;
            }
          } else if (log.includes('阶段7') || log.includes('工时均衡')) {
            stage = 'PLANNING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段7: 工时均衡优化完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段7: 工时均衡优化`;
            }
          } else if (log.includes('阶段8') || log.includes('综合工时制')) {
            stage = 'PLANNING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段8: 综合工时制适配完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段8: 综合工时制适配`;
            }
          } else if (log.includes('阶段9') || log.includes('结果持久化')) {
            stage = 'PERSISTING';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段9: 结果持久化完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段9: 结果持久化`;
            }
          } else if (log.includes('阶段10') || log.includes('质量评估')) {
            stage = 'COMPLETED';
            if (log.includes('完成')) {
              status = 'SUCCESS';
              message = `阶段10: 质量评估完成${timeTaken ? ` (${timeTaken})` : ''}`;
            } else {
              message = `阶段10: 质量评估`;
            }
          } else if (log.includes('错误') || log.includes('失败')) {
            status = 'ERROR';
            stage = 'FAILED';
          } else if (log.includes('警告')) {
            status = 'WARN';
          }

          return {
            id: index,
            run_id: result.run?.id || 0,
            event_key: `log-${index}`,
            stage,
            status,
            message,
            metadata: null,
            created_at: new Date().toISOString(),
          };
        });
        setRunEvents(events);
        
        // 更新进度状态
        if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          if (lastEvent.stage === 'COMPLETED') {
            setProgressConnected(true);
          }
        }
      }
      setAutoPlanResult(result);
      setAutoPlanConfigVisible(false);
      setAutoPlanModalVisible(true); // 确保结果模态框显示

      const planLabel = 
        autoPlanMode === 'combo' 
          ? '自动人员安排（新算法）' 
          : '自动人员安排';

      if (result.async) {
        message.info(`${planLabel}任务已启动，正在生成排班草案。`);
      } else if (result.run.status === 'PUBLISHED') {
        message.success(`${planLabel}已发布到生产。`);
        fetchBatchPlans();
        fetchStatistics();
      } else {
        message.success(`${planLabel}草案已生成，请在弹窗内确认。`);
      }

      setSelectedRowKeys([]);
    } catch (error: any) {
      console.error('Error executing auto plan:', error);
      const planLabel = 
        autoPlanMode === 'combo' 
          ? '自动人员安排（新算法）' 
          : '自动人员安排';
      message.error(error.response?.data?.error || `${planLabel}失败`);
      setAutoPlanModalVisible(false);
      stopProgressTracking();
    } finally {
      setAutoPlanLoading(false);
      setAutoPlanLaunching(false);
    }
  };

  const publishCurrentRun = async (runId: number) => {
    setPublishingRun(true);
    try {
      await schedulingRunApi.publish(runId);
      await refreshCurrentRun(runId, 'PUBLISHED');
      message.success('排班草案已发布。');
      fetchBatchPlans();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error publishing run:', error);
      message.error(error.response?.data?.error || '发布排班失败');
    } finally {
      setPublishingRun(false);
    }
  };

  const rollbackCurrentRun = async (runId: number) => {
    setRollingBackRun(true);
    try {
      await schedulingRunApi.rollback(runId);
      await refreshCurrentRun(runId, 'ROLLED_BACK');
      message.success('已撤销本次自动排班结果。');
      fetchBatchPlans();
      fetchStatistics();
    } catch (error: any) {
      console.error('Error rolling back run:', error);
      message.error(error.response?.data?.error || '撤销排班失败');
    } finally {
      setRollingBackRun(false);
    }
  };

  const handleRetryOperation = async (operationPlanId: number) => {
    const hide = message.loading('正在分析候选人...', 0);
    try {
      const result = await schedulingRunApi.retryOperation(operationPlanId);
      hide();
      if (!result?.candidates?.length) {
        Modal.info({
          title: '局部重排结果',
          content: '暂无可用候选人，请尝试调整班次或手工指派。'
        });
        return;
      }
      Modal.info({
        title: `候选名单 - ${result.operationName}`,
        width: 480,
        content: (
          <List
            size="small"
            dataSource={result.candidates}
            renderItem={(item: any) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong>{item.employeeName} ({item.employeeCode})</Text>
                  <Text type="secondary">匹配分 {item.matchScore}</Text>
                  <Text type="secondary">计划工时 {item.plannedHours}h · 加班风险 {item.overtimeRisk ? '是' : '否'}</Text>
                </Space>
              </List.Item>
            )}
          />
        )
      });
    } catch (error: any) {
      hide();
      console.error('Error retrying operation plan:', error);
      message.error(error.response?.data?.error || '局部重排失败');
    }
  };

  const handleViewInGantt = (gap: CoverageGap) => {
    setAutoPlanModalVisible(false);
    triggerGanttAction(gap.operationPlanId, 'focus', gap.batchPlanId);
  };

  const handleManualAssign = (gap: CoverageGap) => {
    setAutoPlanModalVisible(false);
    triggerGanttAction(gap.operationPlanId, 'assign', gap.batchPlanId);
  };

  const handleExportCoverage = async (runId: number) => {
    try {
      const blob: Blob = await schedulingRunApi.exportGaps(runId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `coverage-gaps-run-${runId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('缺口数据导出完成。');
    } catch (error: any) {
      console.error('Error exporting coverage gaps:', error);
      message.error(error.response?.data?.error || '导出缺口失败');
    }
  };

const refreshCurrentRun = useCallback(async (
    runId: number,
    statusOverride?: 'PUBLISHED' | 'ROLLED_BACK',
  ) => {
    try {
      const data = await schedulingRunApi.get(runId);
      if (!data?.run || !data?.result) {
        return;
      }

      const coverage = data.result.coverage_payload ?? autoPlanResult?.coverage;
      const metricsSummary = data.run.metrics_summary_json ?? autoPlanResult?.metricsSummary;
      const heuristicSummary = data.run.heuristic_summary_json ?? autoPlanResult?.heuristicSummary;
      const hotspots = Array.isArray(data.result.hotspots_payload)
        ? data.result.hotspots_payload
        : autoPlanResult?.heuristicHotspots ?? [];
      const logsPayload = data.result.logs_payload;
      const logs = Array.isArray(logsPayload)
        ? logsPayload
        : Array.isArray(logsPayload?.logs)
          ? logsPayload.logs
          : autoPlanResult?.logs ?? [];

      const batches: AutoPlanBatchWindow[] = Array.isArray(data.batches)
        ? data.batches.map((batch: any) => ({
            batchPlanId: Number(batch.batch_plan_id),
            batchCode: String(batch.batch_code),
            start: batch.window_start ?? null,
            end: batch.window_end ?? null,
            totalOperations: Number(batch.total_operations ?? 0),
          }))
        : autoPlanResult?.batches ?? [];

      const summary = data.run.summary_json ?? autoPlanResult?.summary;
      const warnings = Array.isArray(data.run.warnings_json)
        ? data.run.warnings_json
        : autoPlanResult?.warnings ?? [];
      const iterationSummary = metricsSummary?.iterationSummary ?? autoPlanResult?.iterationSummary;

      setAutoPlanResult((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          period: {
            startDate: data.run.period_start ?? prev.period.startDate,
            endDate: data.run.period_end ?? prev.period.endDate,
            quarter: prev.period.quarter,
          },
          batches,
          warnings,
          run: {
            id: data.run.id,
            key: data.run.run_key,
            status: statusOverride ?? data.run.status,
            resultId: data.result.id,
          },
          summary: summary ?? prev.summary,
          coverage: coverage ?? prev.coverage,
          metricsSummary: metricsSummary ?? prev.metricsSummary,
          heuristicSummary: heuristicSummary ?? prev.heuristicSummary,
          heuristicHotspots: hotspots,
          logs,
          iterationSummary: iterationSummary ?? prev.iterationSummary,
        };
      });

      startProgressTracking(runId);
      if (iterationSummary?.bestScore !== undefined) {
        setIterationProgress({
          current: iterationSummary.bestIteration ?? iterationSummary.totalIterations,
          total: iterationSummary.totalIterations,
          comboScore: iterationSummary.bestScore,
          bestScore: iterationSummary.bestScore,
          bestIteration: iterationSummary.bestIteration,
        });
      } else if (!autoPlanResult?.async) {
        setIterationProgress(null);
      }
    } catch (error: any) {
      console.error('Error refreshing run context:', error);
      message.error(error.response?.data?.error || '刷新运行信息失败');
    }
  }, [autoPlanResult, startProgressTracking]);

  useEffect(() => {
    if (!autoPlanModalVisible || !autoPlanResult?.run?.id) {
      return;
    }
    if (
      autoPlanResult.run.status === 'RUNNING' &&
      (latestStage === 'COMPLETED' || latestStage === 'FAILED')
    ) {
      refreshCurrentRun(autoPlanResult.run.id);
      if (latestStage === 'COMPLETED') {
        message.success('自动人员安排已完成。');
      }
      if (latestStage === 'FAILED') {
        message.error('自动人员安排执行失败，详情请查看日志。');
      }
    } else if (autoPlanResult.run.status !== 'RUNNING') {
      const summary = autoPlanResult.iterationSummary ?? autoPlanResult.metricsSummary?.iterationSummary;
      if (summary?.bestScore !== undefined) {
        setIterationProgress({
          current: summary.bestIteration ?? summary.totalIterations,
          total: summary.totalIterations,
          comboScore: summary.bestScore,
          bestScore: summary.bestScore,
          bestIteration: summary.bestIteration,
        });
      }
    }
  }, [autoPlanModalVisible, autoPlanResult?.run?.id, autoPlanResult?.run?.status, latestStage, refreshCurrentRun, autoPlanResult?.iterationSummary, autoPlanResult?.metricsSummary?.iterationSummary]);

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const formData = {
        ...values,
        planned_start_date: values.planned_start_date.format('YYYY-MM-DD')
      };

      if (editingBatch) {
        // 编辑
        try {
          await axios.put(`${API_BASE_URL}/batch-plans/${editingBatch.id}`, formData);
          message.success('更新成功');
        } catch (error) {
          console.error('Error updating batch plan:', error);
          message.error('更新批次计划失败');
          return;
        }
      } else {
        // 新增
        try {
          await axios.post(`${API_BASE_URL}/batch-plans`, formData);
          message.success('创建成功');
        } catch (error: any) {
          console.error('Error creating batch plan:', error);
          if (error.response?.data?.error === 'Batch code already exists') {
            message.error('批次编号已存在');
          } else {
            message.error('创建批次计划失败');
          }
          return;
        }
      }
      
      setIsModalVisible(false);
      form.resetFields();
      fetchBatchPlans();
      fetchStatistics();
    } catch (error) {
      message.error('请填写所有必填字段');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总批次数"
              value={statistics?.total_batches || 0}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已批准"
              value={statistics?.approved_count || 0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="计划中"
              value={statistics?.planned_count || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="草稿"
              value={statistics?.draft_count || 0}
              valueStyle={{ color: '#666' }}
              prefix={<EditOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 主卡片 */}
      <Card
        title={
          <Space>
            <AppstoreOutlined />
            <span>批次管理</span>
          </Space>
        }
      >
        <div
          style={{
            marginBottom: 16,
          }}
        >
          <Space
            wrap
            size={8}
            style={{
              width: '100%',
              justifyContent: 'flex-start',
            }}
          >
            <Space align="center" size={8}>
              <Text type="secondary">新甘特视图</Text>
              <Switch
                checked={useAlignedGantt}
                onChange={setUseAlignedGantt}
                checkedChildren="ON"
                unCheckedChildren="OFF"
              />
            </Space>
            <Button
              icon={<DotChartOutlined />}
              type={ganttVisible ? 'primary' : 'default'}
              onClick={() => setGanttVisible((prev) => !prev)}
            >
              {ganttVisible ? '隐藏激活甘特' : '激活批次甘特'}
            </Button>
            {autoPlanResult && (
              <Button
                icon={<FileTextOutlined />}
                onClick={() => setAutoPlanModalVisible(true)}
              >
                查看排班结果
              </Button>
            )}
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              disabled={!selectedRowKeys.length}
              loading={autoPlanLoading && autoPlanMode === 'combo'}
              onClick={handleAutoPlanNew}
            >
              自动人员安排（新算法）
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              disabled={!selectedRowKeys.length}
              loading={autoPlanLoading && autoPlanMode === 'classic'}
              onClick={handleAutoPlan}
            >
              自动人员安排
            </Button>
            <Button
              type="primary"
              icon={<AppstoreOutlined />}
              disabled={!selectedRowKeys.length}
              onClick={handleAutoPlanV3}
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderColor: '#667eea' }}
            >
              智能排班v3（ML）
            </Button>
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              disabled={!selectedRowKeys.length}
              onClick={handleAutoPlanV4}
              style={{ background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)', borderColor: '#52c41a' }}
            >
              智能排班v4（综合工时制优化）
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              新建批次
            </Button>
            <Button 
              icon={<ExportOutlined />}
              onClick={() => message.info('导出功能开发中')}
            >
              导出
            </Button>
          </Space>
        </div>
        <Table
          columns={columns}
          dataSource={batches}
          rowKey="id"
          rowSelection={rowSelection}
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      {/* 新增/编辑模态框 */}
      <Modal
        title={editingBatch ? '编辑批次' : '新建批次'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            plan_status: 'DRAFT'
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="batch_code"
                label="批次编号"
                rules={[{ required: true, message: '请输入批次编号' }]}
              >
                <Input placeholder="如：BATCH-2024-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="project_code"
                label="项目代码"
              >
                <Input placeholder="如：PRJ-2024-A" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="batch_name"
            label="批次名称"
            rules={[{ required: true, message: '请输入批次名称' }]}
          >
            <Input placeholder="请输入批次名称" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="template_id"
                label="工艺模版"
                rules={[{ required: true, message: '请选择工艺模版' }]}
              >
                <Select placeholder="请选择工艺模版">
                  {templates.map(t => (
                    <Option key={t.id} value={t.id}>
                      {t.template_name} ({t.total_days || 0}天)
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="planned_start_date"
                label="计划开始日期"
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="plan_status" label="状态">
            <Select>
              {planStatusOptions.map(({ value, label, disabled }) => (
                <Option key={value} value={value} disabled={disabled}>
                  {label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="批次描述"
          >
            <Input.TextArea rows={3} placeholder="请输入批次描述" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="备注"
          >
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情模态框 */}
      <Modal
        title="批次详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button 
            key="schedule" 
            type="primary" 
            icon={<CalendarOutlined />}
            onClick={() => message.info('查看排程功能开发中')}
          >
            查看排程
          </Button>
        ]}
        width={700}
      >
        {selectedBatch && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">批次编号</Text>
                <div><Text strong>{selectedBatch.batch_code}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">批次名称</Text>
                <div><Text strong>{selectedBatch.batch_name}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">项目代码</Text>
                <div><Text strong>{selectedBatch.project_code || '-'}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">工艺模版</Text>
                <div><Text strong>{selectedBatch.template_name}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">计划开始日期</Text>
                <div><Text strong>{selectedBatch.planned_start_date}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">计划结束日期</Text>
                <div><Text strong>{selectedBatch.planned_end_date}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">工期</Text>
                <div><Text strong>{selectedBatch.template_duration_days}天</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">状态</Text>
                <div>{renderStatus(selectedBatch.plan_status)}</div>
              </Col>
              <Col span={24}>
                <Text type="secondary">描述</Text>
                <div><Text>{selectedBatch.description || '-'}</Text></div>
              </Col>
              <Col span={24}>
                <Text type="secondary">备注</Text>
                <div><Text>{selectedBatch.notes || '-'}</Text></div>
              </Col>
            </Row>

            <Divider />

            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="操作数"
                    value={selectedBatch?.operation_count || 0}
                    prefix={<CheckCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="需要人员"
                    value={selectedBatch?.total_required_people || 0}
                    prefix={<TeamOutlined />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="已安排"
                    value={selectedBatch?.assigned_people_count || 0}
                    suffix={`/ ${selectedBatch?.total_required_people || 0}`}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      <Modal
        title={
          autoPlanMode === 'combo'
            ? '自动人员安排（新算法）配置'
            : '自动人员安排配置'
        }
        open={autoPlanConfigVisible}
        onCancel={() => setAutoPlanConfigVisible(false)}
        onOk={executeAutoPlan}
        okText="执行排班"
        confirmLoading={autoPlanLoading}
        destroyOnClose
      >
        <Form
          form={autoPlanForm}
          layout="vertical"
          initialValues={{
            includeBaseRoster: true,
            dryRun: true,
            publishNow: false,
            iterationCount: 100,
            randomizationStrength: 0.15,
            randomSeed: null,
            allowedOrgRoles: ORG_ROLE_OPTIONS.map((item) => item.value),
          }}
        >
          <Form.Item label="排程周期" name="dateRange">
            <RangePicker format="YYYY-MM-DD" allowClear style={{ width: '100%' }} />
          </Form.Item>
          {autoPlanMode !== 'v3' && (
            <Form.Item label="生成基础班表" name="includeBaseRoster" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Form.Item label="干跑（仅生成草案）" name="dryRun" valuePropName="checked">
            <Switch
              onChange={(checked) => {
                if (checked) {
                  autoPlanForm.setFieldsValue({ publishNow: false });
                }
              }}
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => (
              <Form.Item
                label="执行后立即发布"
                name="publishNow"
                valuePropName="checked"
              >
                <Switch disabled={autoPlanForm.getFieldValue('dryRun')} />
              </Form.Item>
            )}
          </Form.Item>
          {autoPlanMode !== 'v3' && (
            <Form.Item
              label="迭代次数"
              name="iterationCount"
              rules={[{ required: true, message: '请输入迭代次数' }]}
            >
              <InputNumber
                min={1}
                max={1000}
                precision={0}
                style={{ width: '100%' }}
                disabled={autoPlanMode === 'combo'}
              />
            </Form.Item>
          )}
          <Form.Item
            label="参与角色"
            name="allowedOrgRoles"
            tooltip="仅在勾选的组织角色中寻找候选人"
          >
            <Checkbox.Group options={ORG_ROLE_OPTIONS} />
          </Form.Item>
          {autoPlanMode !== 'v3' && (
            <Form.Item
              label="随机扰动强度"
              name="randomizationStrength"
              tooltip="控制迭代搜索时的随机扰动幅度，范围 0~5，建议 0.05~0.5"
            >
              <InputNumber
                min={0}
                max={5}
                step={0.05}
                style={{ width: '100%' }}
                disabled={autoPlanMode === 'combo'}
              />
            </Form.Item>
          )}
          {autoPlanMode !== 'v3' && (
            <Form.Item
              label="随机种子（可选）"
              name="randomSeed"
              tooltip="填写后可以复现相同的迭代结果，留空则每次随机"
            >
              <InputNumber
                precision={0}
                style={{ width: '100%' }}
                disabled={autoPlanMode === 'combo'}
              />
            </Form.Item>
          )}
          <Alert
            type="info"
            showIcon
            message="说明"
            description="干跑模式下仅生成草案，不会写入正式排班数据；如需立即生效，请关闭干跑并启用即时发布。迭代次数越多越耗时，建议在资源允许时再尝试更高次数。"
          />
        </Form>
      </Modal>

      <Modal
        title="自动人员安排结果"
        open={autoPlanModalVisible}
        onCancel={() => setAutoPlanModalVisible(false)}
        footer={[
          autoPlanResult ? (
            <Button
              key="refresh"
              icon={<ReloadOutlined />}
              onClick={() => refreshCurrentRun(autoPlanResult.run.id)}
            >
              刷新
            </Button>
          ) : null,
          autoPlanResult && (autoPlanResult.run.status === 'DRAFT' || autoPlanResult.run.status === 'PENDING_PUBLISH')
            ? (
                <Button
                  key="publish"
                  type="primary"
                  loading={publishingRun}
                  onClick={() => publishCurrentRun(autoPlanResult.run.id)}
                  disabled={publishingRun}
                >
                  发布到生产
                </Button>
              )
            : null,
          autoPlanResult && autoPlanResult.run.status === 'PUBLISHED'
            ? (
                <Button
                  key="rollback"
                  danger
                  loading={rollingBackRun}
                  onClick={() => rollbackCurrentRun(autoPlanResult.run.id)}
                  disabled={rollingBackRun}
                >
                  撤销发布
                </Button>
              )
            : null,
          <Button key="close" onClick={() => setAutoPlanModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={720}
      >
        {autoPlanResult ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space align="center" size={8} wrap>
                  <Text strong>执行进度</Text>
                  <Tag color={progressConnected ? 'green' : 'default'}>
                    {progressConnected ? '实时' : '轮询'}
                  </Tag>
                </Space>
                {progressError && (
                  <Alert type="warning" message={progressError} showIcon />
                )}
                <Progress percent={progressPercent} status={progressStatus} />
                <Text type="secondary">
                  当前步骤：{currentStageLabel}
                </Text>
                {currentSubStageMessage && currentSubStageMessage !== currentStageLabel && (
                  <Text type="secondary">{currentSubStageMessage}</Text>
                )}
                {iterationProgress && (
                  <Space size={8} wrap>
                    <Tag color="geekblue">
                      迭代 {iterationProgress.current}/{iterationProgress.total}
                    </Tag>
                    {typeof iterationProgress.comboScore === 'number' && (
                      <Tag color="blue">
                        当前评分 {iterationProgress.comboScore.toFixed(2)}
                      </Tag>
                    )}
                    {typeof iterationProgress.bestScore === 'number' && (
                      <Tag color="gold">
                        最高评分 {iterationProgress.bestScore.toFixed(2)}
                        {iterationProgress.bestIteration ? `（迭代 ${iterationProgress.bestIteration}）` : ''}
                      </Tag>
                    )}
                    {iterationProgress.operationName && (
                      <Text type="secondary">
                        当前操作：{iterationProgress.operationName}
                      </Text>
                    )}
                  </Space>
                )}
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {runEvents.length ? (
                    <Timeline
                      style={{ marginTop: 8 }}
                      items={runEvents.map((event) => {
                        const metadataText = formatMetadata(event.metadata);
                        return {
                          key: event.id,
                          color: STATUS_COLOR_MAP[event.status] || 'blue',
                          children: (
                            <Space direction="vertical" size={2} style={{ width: '100%' }}>
                              <Space size={8} wrap>
                                <Text strong>{STAGE_LABELS[event.stage] ?? event.stage}</Text>
                                <Tag color={STATUS_COLOR_MAP[event.status] || 'blue'}>
                                  {event.status}
                                </Tag>
                                {event.created_at && (
                                  <Text type="secondary">
                                    {dayjs(event.created_at).format('YYYY-MM-DD HH:mm:ss')}
                                  </Text>
                                )}
                              </Space>
                              {event.message && <Text>{event.message}</Text>}
                              {metadataText && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {metadataText}
                                </Text>
                              )}
                            </Space>
                          ),
                        };
                      })}
                    />
                  ) : (
                    <Space size={8}>
                      <Spin size="small" />
                      <Text type="secondary">等待执行事件...</Text>
                    </Space>
                  )}
                </div>
              </Space>
            </Card>
            <Descriptions
              size="small"
              bordered
              column={1}
              styles={{ label: { width: 120 } }}
            >
              <Descriptions.Item label="周期">
                {autoPlanResult.period.startDate} ~ {autoPlanResult.period.endDate}
              </Descriptions.Item>
              <Descriptions.Item label="季度">{autoPlanResult.period.quarter}</Descriptions.Item>
              <Descriptions.Item label="结果">{autoPlanResult.message}</Descriptions.Item>
              <Descriptions.Item label="运行状态">
                <Space size={12} wrap>
                  <Tag color={(() => {
                    switch (autoPlanResult.run.status) {
                      case 'PUBLISHED':
                        return 'green';
                      case 'ROLLED_BACK':
                        return 'default';
                      case 'FAILED':
                        return 'red';
                      case 'RUNNING':
                        return 'blue';
                      default:
                        return 'orange';
                    }
                  })()}>
                    {(() => {
                      switch (autoPlanResult.run.status) {
                        case 'PUBLISHED':
                          return '已发布';
                        case 'ROLLED_BACK':
                          return '已回滚';
                        case 'FAILED':
                          return '失败';
                        case 'RUNNING':
                          return '执行中';
                        default:
                          return '草案';
                      }
                    })()}
                  </Tag>
                  <Text type="secondary">运行ID {autoPlanResult.run.id}</Text>
                  <Text type="secondary">Key {autoPlanResult.run.key}</Text>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="摘要">
                <Space size={12} wrap>
                  <Tag color="blue">员工 {autoPlanResult.summary.employeesTouched}</Tag>
                  <Tag color="cyan">操作 {autoPlanResult.summary.operationsAssigned}/{autoPlanResult.summary.operationsCovered}</Tag>
                  <Tag color="purple">基础班次 {autoPlanResult.summary.baseRosterRows}</Tag>
                  <Tag color="red">加班 {autoPlanResult.summary.overtimeEntries}</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="覆盖率">
                <Space size={12} direction="vertical" style={{ width: '100%' }}>
                  <Tag color={autoPlanResult.coverage.coverageRate >= 1 ? 'green' : 'red'}>
                    覆盖率 {(autoPlanResult.coverage.coverageRate * 100).toFixed(2)}%
                  </Tag>
                  <span>
                    满足 {autoPlanResult.coverage.fullyCovered}/{autoPlanResult.coverage.totalOperations} 个操作
                  </span>
                  <Space size={8} wrap>
                    <Tag color="volcano">人数缺口 {autoPlanResult.coverage.gapTotals.headcount}</Tag>
                    <Tag color="geekblue">资质缺口 {autoPlanResult.coverage.gapTotals.qualification}</Tag>
                    <Tag color="default">其他缺口 {autoPlanResult.coverage.gapTotals.other}</Tag>
                  </Space>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="指标摘要">
                {renderMetricsSummary(autoPlanResult.metricsSummary)}
              </Descriptions.Item>
              <Descriptions.Item label="启发式摘要">
                {renderHeuristicSummary(autoPlanResult.heuristicSummary)}
              </Descriptions.Item>
              <Descriptions.Item label="迭代搜索">
                {renderIterationSummary(
                  autoPlanResult.iterationSummary ?? autoPlanResult.metricsSummary?.iterationSummary,
                )}
              </Descriptions.Item>
            </Descriptions>

            {autoPlanResult.diagnostics?.missingCalendar && (
              <Alert
                type="warning"
                message="节假日数据缺失"
                description="请先导入节假日/调休数据，以保证综合工时计算准确。"
                showIcon
              />
            )}

            {autoPlanResult.warnings.length > 0 && (
              <Alert
                type="warning"
                message="提醒"
                description={(
                  <List
                    size="small"
                    dataSource={autoPlanResult.warnings}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                )}
                showIcon
              />
            )}

            <Collapse
              defaultActiveKey={['coverage', 'hotspots', 'batches', 'logs', 'comprehensive']}
              items={[
                {
                  key: 'coverage',
                  label: `覆盖缺口 (${autoPlanResult.coverage.gaps.length})`,
                  children: autoPlanResult.run.status === 'RUNNING' ? (
                    <Alert type="info" message="排班任务进行中，覆盖数据将在完成后更新。" showIcon />
                  ) : autoPlanResult.coverage.gaps.length === 0 ? (
                    <Alert type="success" message="所有操作均已覆盖" showIcon />
                  ) : (
                    <>
                      <Space style={{ marginBottom: 12 }} wrap>
                        <Button
                          size="small"
                          icon={<ExportOutlined />}
                          onClick={() => handleExportCoverage(autoPlanResult.run.id)}
                        >
                          导出缺口
                        </Button>
                      </Space>
                      <List
                        size="small"
                        dataSource={autoPlanResult.coverage.gaps}
                        renderItem={(gap) => (
                          <List.Item
                            actions={[
                              <Button size="small" type="link" onClick={() => handleViewInGantt(gap)} key="view">查看详情</Button>,
                              <Button size="small" type="link" onClick={() => handleManualAssign(gap)} key="manual">手工指派</Button>,
                              <Button size="small" type="link" onClick={() => handleRetryOperation(gap.operationPlanId)} key="retry">局部重排</Button>,
                            ]}
                          >
                            <Space direction="vertical" style={{ width: '100%' }} size={4}>
                              <Space size={8} wrap>
                                <Tag color="volcano">{gap.category === 'HEADCOUNT' ? '人数缺口' : gap.category === 'QUALIFICATION' ? '资质缺口' : '其他缺口'}</Tag>
                                <Tag color="blue">{gap.batchCode}</Tag>
                                <Text strong>{gap.operationName}</Text>
                                <Tag color="gold">{gap.planDate}</Tag>
                                <span>
                                  需 {gap.requiredPeople} 人，已分配 {gap.assignedPeople} 人
                                </span>
                              </Space>
                              <Space direction="vertical" size={2}>
                                {gap.notes.map((note, index) => (
                                  <Text type="secondary" key={`note-${gap.operationPlanId}-${index}`}>
                                    • {note}
                                  </Text>
                                ))}
                              </Space>
                              <Space direction="vertical" size={2}>
                                {gap.suggestions.map((sugg, index) => (
                                  <Text key={`sugg-${gap.operationPlanId}-${index}`}>建议：{sugg}</Text>
                                ))}
                              </Space>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </>
                  ),
                },
                {
                  key: 'hotspots',
                  label: `启发式热点 (${autoPlanResult.heuristicSummary?.hotspotCount ?? autoPlanResult.heuristicHotspots?.length ?? 0})`,
                  children: (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {renderHeuristicSummary(autoPlanResult.heuristicSummary)}
                      {autoPlanResult.heuristicHotspots && autoPlanResult.heuristicHotspots.length > 0 ? (
                        <List
                          size="small"
                          dataSource={autoPlanResult.heuristicHotspots}
                          renderItem={(hotspot) => (
                            <List.Item>
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space size={8} wrap>
                                  <Tag color="volcano">缺口 {hotspot.deficit}</Tag>
                                  <Text strong>{hotspot.operationName}</Text>
                                  <Tag color="gold">{hotspot.planDate}</Tag>
                                  {hotspot.attempts > 0 && (
                                    <Tag color="purple">回溯 {hotspot.attempts} 次</Tag>
                                  )}
                                </Space>
                                <Text type="secondary">原因：{hotspot.reason}</Text>
                                {hotspot.notes?.length ? (
                                  <Space direction="vertical" size={2}>
                                    {hotspot.notes.map((note, index) => (
                                      <Text type="secondary" key={`hotspot-note-${hotspot.id}-${index}`}>
                                        • {note}
                                      </Text>
                                    ))}
                                  </Space>
                                ) : null}
                                {hotspot.relatedOperations?.length ? (
                                  <Text type="secondary">
                                    相关操作：{hotspot.relatedOperations.join(', ')}
                                  </Text>
                                ) : null}
                                <Text type="secondary">
                                  记录时间：{dayjs(hotspot.createdAt).format('YYYY-MM-DD HH:mm')}
                                </Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Alert type="info" message="暂无热点记录" showIcon />
                      )}
                    </Space>
                  ),
                },
                {
                  key: 'batches',
                  label: '覆盖批次',
                  children: (
                    <List
                      size="small"
                      dataSource={autoPlanResult.batches}
                      renderItem={(item) => (
                        <List.Item>
                          <Space size={12} wrap>
                            <Tag color="blue">{item.batchCode}</Tag>
                            <span>操作 {item.totalOperations}</span>
                            {item.start && <span>开始 {item.start}</span>}
                            {item.end && <span>结束 {item.end}</span>}
                          </Space>
                        </List.Item>
                      )}
                      locale={{ emptyText: '无批次数据' }}
                    />
                  ),
                },
                {
                  key: 'logs',
                  label: '执行日志',
                  children: (
                    <List
                      size="small"
                      dataSource={autoPlanResult.logs}
                      renderItem={(item, index) => <List.Item>{index + 1}. {item}</List.Item>}
                      locale={{ emptyText: '暂无日志' }}
                    />
                  ),
                },
                {
                  key: 'comprehensive',
                  label: `综合工时制合规 (${autoPlanResult.comprehensiveWorkTimeStatus?.employees.length || 0})`,
                  children: autoPlanResult.comprehensiveWorkTimeStatus ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Alert
                        type={autoPlanResult.comprehensiveWorkTimeStatus.employees.filter(e => e.quarterStatus === 'VIOLATION').length > 0 ? 'error' : 'success'}
                        message={`合规: ${autoPlanResult.comprehensiveWorkTimeStatus.employees.filter(e => e.quarterStatus === 'COMPLIANT').length} | 警告: ${autoPlanResult.comprehensiveWorkTimeStatus.employees.filter(e => e.quarterStatus === 'WARNING').length} | 违规: ${autoPlanResult.comprehensiveWorkTimeStatus.employees.filter(e => e.quarterStatus === 'VIOLATION').length}`}
                        description={`季度要求：≥${
                          autoPlanResult.comprehensiveWorkTimeStatus.quarterTargetHours
                            ? autoPlanResult.comprehensiveWorkTimeStatus.quarterTargetHours.toFixed(0)
                            : '标准'
                        }h；月度容差：±${
                          (autoPlanResult.comprehensiveWorkTimeStatus.monthToleranceHours ?? 8).toFixed(0)
                        }h`}
                        showIcon
                      />
                      <Table
                        size="small"
                        dataSource={autoPlanResult.comprehensiveWorkTimeStatus.employees}
                        rowKey="employeeId"
                        pagination={{ pageSize: 10 }}
                        columns={[
                          {
                            title: '员工',
                            dataIndex: 'employeeName',
                            key: 'employeeName',
                          },
                          {
                            title: '季度工时',
                            key: 'quarterHours',
                            render: (_, record) => {
                              const targetHours = autoPlanResult.comprehensiveWorkTimeStatus?.quarterTargetHours || 0;
                              const percent = targetHours > 0 ? (record.quarterHours / targetHours) * 100 : 0;
                              const statusColor = 
                                record.quarterStatus === 'COMPLIANT' ? 'success' :
                                record.quarterStatus === 'WARNING' ? 'normal' : 'exception';
                              
                              return (
                                <div>
                                  <Progress 
                                    percent={Math.min(percent, 100)} 
                                    status={statusColor}
                                    format={() => `${record.quarterHours.toFixed(1)}h / ≥${targetHours > 0 ? targetHours.toFixed(0) : '--'}h`}
                                  />
                                  <Tag color={
                                    record.quarterStatus === 'COMPLIANT' ? 'green' :
                                    record.quarterStatus === 'WARNING' ? 'orange' : 'red'
                                  }>
                                    {record.quarterStatus === 'COMPLIANT' ? '合规' :
                                     record.quarterStatus === 'WARNING' ? '警告' : '违规'}
                                  </Tag>
                                </div>
                              );
                            },
                          },
                          {
                            title: '月度工时',
                            key: 'monthlyStatus',
                            render: (_, record) => (
                              <div>
                                {record.monthlyStatus.map((month, idx) => {
                                  const statusColor = 
                                    month.status === 'COMPLIANT' ? 'green' :
                                    month.status === 'WARNING' ? 'orange' : 'red';
                                  return (
                                    <Tag key={idx} color={statusColor} style={{ marginBottom: 4 }}>
                                      {month.month}: {month.hours.toFixed(1)}h
                                    </Tag>
                                  );
                                })}
                              </div>
                            ),
                          },
                          {
                            title: '休息天数',
                            key: 'restDays',
                            render: (_, record) => {
                              const statusColor = 
                                record.restDaysStatus === 'COMPLIANT' ? 'green' :
                                record.restDaysStatus === 'WARNING' ? 'orange' : 'red';
                              return (
                                <Tag color={statusColor}>
                                  {record.restDays}天
                                  {record.restDaysStatus === 'COMPLIANT' ? ' ✓' :
                                   record.restDaysStatus === 'WARNING' ? ' ⚠' : ' ✗'}
                                </Tag>
                              );
                            },
                          },
                        ]}
                      />
                    </Space>
                  ) : (
                    <Alert type="info" message="暂无综合工时制合规数据" showIcon />
                  ),
                },
              ]}
            />
          </Space>
        ) : (
          <Space
            direction="vertical"
            size={16}
            style={{ width: '100%', alignItems: 'center', padding: '48px 0' }}
          >
            <Spin size="large" />
            <Text type="secondary">
              {autoPlanLaunching ? '正在启动自动人员安排，请稍候…' : '正在获取排班结果…'}
            </Text>
          </Space>
        )}
      </Modal>

      <ActivatedBatchGanttAligned
        visible={ganttVisible && useAlignedGantt}
        onClose={() => {
          setGanttVisible(false);
          setGanttActionRequest(null);
        }}
        actionRequest={ganttActionRequest}
        onActionHandled={() => setGanttActionRequest(null)}
      />
      <ActivatedBatchGantt
        visible={ganttVisible && !useAlignedGantt}
        onClose={() => {
          setGanttVisible(false);
          setGanttActionRequest(null);
        }}
        actionRequest={ganttActionRequest}
        onActionHandled={() => setGanttActionRequest(null)}
      />

      {/* V3智能排班专用模态框 */}
      <V3SchedulingModal
        visible={v3ModalVisible}
        batchIds={selectedRowKeys}
        onClose={() => setV3ModalVisible(false)}
        onSuccess={() => {
          // 排班成功后刷新批次列表
          fetchBatchPlans();
          fetchStatistics();
        }}
      />

      {/* V4智能排班专用模态框 */}
      <V4SchedulingModal
        visible={v4ModalVisible}
        batchIds={selectedRowKeys}
        onClose={() => setV4ModalVisible(false)}
        onSuccess={() => {
          // 排班成功后刷新批次列表
          fetchBatchPlans();
          fetchStatistics();
        }}
      />
    </div>
  );
};

export default BatchManagement;
