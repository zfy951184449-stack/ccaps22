import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Drawer,
  Form,
  InputNumber,
  Switch,
  Divider,
  Alert,
  Spin,
  Modal,
} from 'antd';
import {
  ReloadOutlined,
  SettingOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';

import BatchSelector from './BatchSelector';
import SchedulingWindowDisplay from './SchedulingWindow';
import SchedulingSummaryDisplay from './SchedulingSummary';
import SolveProgress from './SolveProgress';
import SolveResultModal from './SolveResultModal';
import type {
  ActiveOperation,
  BatchCard,
  CalendarDay,
  SchedulingWindow,
  SchedulingSummary,
  SolverConfig,
  SolveRun,
  CreateSolveRequest,
} from './types';
import {
  createSolveTask,
  getSolveRunStatus,
  retrySolveRun,
  cancelSolveRun,
  abortSolveRun,
  subscribeToSolveProgress,
  SolverProgressData,
} from '../../services/schedulingV2Api';
import './styles.css';

dayjs.locale('zh-cn');
dayjs.extend(isoWeek);

const DEFAULT_CONFIG: SolverConfig = {
  // 操作分配模块
  enableOperationAssignment: true,
  skipPositionPenalty: 1000,
  sharingViolationPenalty: 1000,

  // 班次一致性模块
  enableShiftConsistency: true,
  shiftMatchingToleranceMinutes: 30,
  workdayRestPenalty: 10,
  nonWorkdayWorkPenalty: 1000,

  // 月度工时模块
  // 下限：标准工时 - 4h，上限：标准工时 + 32h
  enableMonthlyHours: true,
  monthlyHoursLowerOffset: 4,
  monthlyHoursUpperOffset: 32,

  // 连续工作模块
  enableConsecutiveWork: true,
  maxConsecutiveWorkdays: 6,

  // 夜班休息模块
  enableNightRest: true,
  nightRestHardDays: 1,      // x: 夜班后硬约束休息天数
  nightRestSoftDays: 2,      // y: 夜班后软约束休息天数
  nightRestReward: 100,      // 满足软约束奖励分
  nightRestPenalty: 300,     // 不满足软约束惩罚分

  // 主管约束模块
  enableSupervisorConstraints: true,
  groupLeaderOperationPenalty: 300,      // S1a: GROUP_LEADER参与操作罚分（每人每小时）
  noGroupLeaderOperationReward: 100,     // S1b: 操作中无GROUP_LEADER奖励（每操作）
  noSupervisorOnDutyPenalty: 5000,       // S2a: 有操作日无主管在岗罚分（每天）- 硬约束降级
  extraSupervisorNonWorkdayPenalty: 3000, // S2b: 非工作日多余主管罚分（每人次）- 硬约束降级
  teamLeaderNonWorkdayPenalty: 500,      // S4: TEAM_LEADER非工作日上班罚分（每人次）
  rotationViolationPenalty: 200,         // S6: 轮流值班违规罚分（每人次）

  // 公平性约束模块
  enableFairness: true,
  nightShiftUnfairPenalty: 200,          // F1: 夜班数量不公平罚分（每差1次）
  dayShiftUnfairPenalty: 200,            // F2: 长白班数量不公平罚分（每差1次）
  nightIntervalUnfairPenalty: 100,       // F3: 夜班间隔不均匀罚分（每次）
  operationTimeUnfairPenalty: 50,        // F4: 操作时长不公平罚分（每差1小时）

  // 目标函数
  minimizeTripleHolidayStaff: true,

  // 求解器参数
  solverTimeLimit: 60,
  solverImprovementTimeout: 30,
};

const ModularScheduling: React.FC = () => {
  // 批次数据状态
  const [operations, setOperations] = useState<ActiveOperation[]>([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [batchSearch, setBatchSearch] = useState('');

  // 日历数据状态
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // 员工数据状态
  const [employeeCount, setEmployeeCount] = useState(0);

  // 配置状态 - 从 localStorage 读取初始值
  const [config, setConfig] = useState<SolverConfig>(() => {
    try {
      const saved = localStorage.getItem('modularScheduling.config');
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load saved config:', e);
    }
    return DEFAULT_CONFIG;
  });
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false);
  const [configForm] = Form.useForm<SolverConfig>();

  // 保存配置到 localStorage
  const saveConfig = useCallback((newConfig: SolverConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem('modularScheduling.config', JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Failed to save config:', e);
    }
  }, []);

  // 求解状态
  const [solving, setSolving] = useState(false);
  const [currentRun, setCurrentRun] = useState<SolveRun | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const pollCancelRef = useRef<(() => void) | null>(null);

  // 结果弹窗状态
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultRunId, setResultRunId] = useState<number | null>(null);

  // 加载激活批次的操作数据
  const loadOperations = useCallback(async () => {
    setOperationsLoading(true);
    try {
      const response = await axios.get<ActiveOperation[]>('/api/calendar/operations/active');
      setOperations(response.data);
    } catch (error) {
      console.error('Failed to load active batch operations', error);
      message.error('加载激活批次数据失败');
    } finally {
      setOperationsLoading(false);
    }
  }, []);

  // 加载员工数量
  const loadEmployeeCount = useCallback(async () => {
    try {
      const response = await axios.get('/api/employees', {
        params: { employment_status: 'ACTIVE' },
      });
      const employees = response.data?.data || response.data || [];
      setEmployeeCount(Array.isArray(employees) ? employees.length : 0);
    } catch (error) {
      console.error('Failed to load employees', error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadOperations();
    loadEmployeeCount();
  }, [loadOperations, loadEmployeeCount]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollCancelRef.current) {
        pollCancelRef.current();
      }
    };
  }, []);

  // 将操作数据聚合为批次卡片
  const batchCards: BatchCard[] = useMemo(() => {
    const batchMap = new Map<number, BatchCard>();

    for (const op of operations) {
      const existing = batchMap.get(op.batch_id);
      const opStart = dayjs(op.planned_start_datetime);
      const opEnd = dayjs(op.planned_end_datetime);

      if (existing) {
        existing.operationCount += 1;
        if (opStart.isBefore(existing.startDate)) {
          existing.startDate = op.planned_start_datetime;
        }
        if (opEnd.isAfter(existing.endDate)) {
          existing.endDate = op.planned_end_datetime;
        }
        if (op.assignment_status === 'UNASSIGNED') {
          existing.unassignedCount += 1;
        } else if (op.assignment_status === 'PARTIAL') {
          existing.partialCount += 1;
        }
      } else {
        batchMap.set(op.batch_id, {
          batchId: op.batch_id,
          batchCode: op.batch_code,
          batchName: op.batch_name,
          batchColor: op.batch_color,
          operationCount: 1,
          startDate: op.planned_start_datetime,
          endDate: op.planned_end_datetime,
          unassignedCount: op.assignment_status === 'UNASSIGNED' ? 1 : 0,
          partialCount: op.assignment_status === 'PARTIAL' ? 1 : 0,
          planStatus: op.plan_status,
        });
      }
    }

    return Array.from(batchMap.values()).sort((a, b) =>
      dayjs(a.startDate).diff(dayjs(b.startDate))
    );
  }, [operations]);

  // 选中的批次
  const selectedBatches = useMemo(
    () => batchCards.filter((b) => selectedBatchIds.includes(b.batchId)),
    [batchCards, selectedBatchIds]
  );

  // 计算求解区间（扩展到完整月份）
  const schedulingWindow: SchedulingWindow | null = useMemo(() => {
    if (selectedBatches.length === 0) return null;

    // 计算原始日期范围
    let rawStart: Dayjs | null = null;
    let rawEnd: Dayjs | null = null;

    for (const batch of selectedBatches) {
      const batchStart = dayjs(batch.startDate);
      const batchEnd = dayjs(batch.endDate);

      if (!rawStart || batchStart.isBefore(rawStart)) {
        rawStart = batchStart;
      }
      if (!rawEnd || batchEnd.isAfter(rawEnd)) {
        rawEnd = batchEnd;
      }
    }

    if (!rawStart || !rawEnd) return null;

    // 扩展到完整月份
    const startDate = rawStart.startOf('month');
    const endDate = rawEnd.endOf('month');

    // 计算覆盖的月份
    const months: string[] = [];
    let current = startDate.clone();
    while (current.isBefore(endDate) || current.isSame(endDate, 'month')) {
      months.push(current.format('YYYY-MM'));
      current = current.add(1, 'month');
    }

    const totalDays = endDate.diff(startDate, 'day') + 1;

    // 统计工作日和三倍工资日（需要从日历数据获取）
    let workdays = 0;
    let triplePayDays = 0;

    for (const day of calendarDays) {
      const d = dayjs(day.calendar_date);
      if (d.isBefore(startDate) || d.isAfter(endDate)) continue;
      if (day.is_workday) workdays += 1;
      if (day.is_triple_salary) triplePayDays += 1;
    }

    // 如果日历数据还没加载，使用估算值
    if (calendarDays.length === 0) {
      // 粗略估算：约70%是工作日
      workdays = Math.round(totalDays * 0.7);
    }

    return {
      startDate,
      endDate,
      rawStartDate: rawStart,
      rawEndDate: rawEnd,
      totalDays,
      workdays,
      triplePayDays,
      months,
    };
  }, [selectedBatches, calendarDays]);

  // 加载日历数据
  useEffect(() => {
    if (!schedulingWindow) {
      setCalendarDays([]);
      return;
    }

    const loadCalendar = async () => {
      setCalendarLoading(true);
      try {
        const response = await axios.get<CalendarDay[]>('/api/calendar/workdays', {
          params: {
            start_date: schedulingWindow.startDate.format('YYYY-MM-DD'),
            end_date: schedulingWindow.endDate.format('YYYY-MM-DD'),
          },
        });
        setCalendarDays(response.data);
      } catch (error) {
        console.error('Failed to load calendar data', error);
      } finally {
        setCalendarLoading(false);
      }
    };

    loadCalendar();
  }, [schedulingWindow?.startDate.format('YYYY-MM-DD'), schedulingWindow?.endDate.format('YYYY-MM-DD')]);

  // 计算求解摘要
  const schedulingSummary: SchedulingSummary | null = useMemo(() => {
    if (selectedBatches.length === 0) return null;

    const selectedOperations = operations.filter((op) =>
      selectedBatchIds.includes(op.batch_id)
    );

    const totalOperations = selectedOperations.length;
    const totalRequiredPeople = selectedOperations.reduce(
      (sum, op) => sum + (op.required_people || 1),
      0
    );
    const unassignedOperations = selectedOperations.filter(
      (op) => op.assignment_status === 'UNASSIGNED'
    ).length;

    return {
      totalOperations,
      totalRequiredPeople,
      availableEmployees: employeeCount,
      unassignedOperations,
      constraintsSummary: {
        maxConsecutiveWorkdays: config.maxConsecutiveWorkdays,
        monthlyHoursRange: `标准工时 -${config.monthlyHoursLowerBound}h / +${config.monthlyHoursUpperBound}h`,
        nightShiftRest: `必须休息 ${config.nightRestHardDays} 天, 建议休息 ${config.nightRestSoftDays} 天`,
      },
    };
  }, [selectedBatches, operations, selectedBatchIds, employeeCount, config]);

  // 打开配置抽屉
  const openConfigDrawer = () => {
    configForm.setFieldsValue(config);
    setConfigDrawerVisible(true);
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields();
      saveConfig(values);
      setConfigDrawerVisible(false);
      message.success('配置已保存');
    } catch (error) {
      // 表单验证失败
    }
  };

  // 开始求解
  const handleStartSolve = async () => {
    if (selectedBatchIds.length === 0) {
      message.warning('请先选择需要排班的批次');
      return;
    }

    if (!schedulingWindow) {
      message.warning('无法计算求解区间');
      return;
    }

    // 确认对话框
    Modal.confirm({
      title: '确认开始求解',
      content: (
        <div>
          <p>将对以下批次进行排班：</p>
          <ul>
            {selectedBatches.map((b) => (
              <li key={b.batchId}>{b.batchCode} - {b.batchName}</li>
            ))}
          </ul>
          <p style={{ color: '#ff4d4f' }}>
            注意：这将覆盖选中批次的现有排班结果！
          </p>
        </div>
      ),
      okText: '确认求解',
      cancelText: '取消',
      onOk: executeStartSolve,
    });
  };

  // 执行求解
  const executeStartSolve = async () => {
    if (!schedulingWindow) return;

    setSolving(true);
    setShowProgress(true);

    try {
      // 构建请求 - 映射前端配置到后端格式
      const request: CreateSolveRequest = {
        batchIds: selectedBatchIds,
        window: {
          start_date: schedulingWindow.startDate.format('YYYY-MM-DD'),
          end_date: schedulingWindow.endDate.format('YYYY-MM-DD'),
        },
        config: {
          // 操作分配模块
          enable_operation_assignment: config.enableOperationAssignment,
          skip_position_penalty: config.skipPositionPenalty,
          sharing_violation_penalty: config.sharingViolationPenalty,

          // 班次一致性模块
          shift_matching_tolerance_minutes: config.shiftMatchingToleranceMinutes,
          workday_rest_penalty: config.workdayRestPenalty,
          non_workday_work_penalty: config.nonWorkdayWorkPenalty,

          // 月度工时模块
          enforce_monthly_hours: config.enableMonthlyHours,
          monthly_hours_lower_offset: config.monthlyHoursLowerOffset,
          monthly_hours_upper_offset: config.monthlyHoursUpperOffset,

          // 连续工作模块
          enforce_consecutive_limit: config.enableConsecutiveWork,
          max_consecutive_workdays: config.maxConsecutiveWorkdays,

          // 夜班休息模块
          enforce_night_rest: config.enableNightRest,
          night_rest_hard_days: config.nightRestHardDays,
          night_rest_soft_days: config.nightRestSoftDays,
          night_rest_reward: config.nightRestReward,
          night_rest_penalty: config.nightRestPenalty,

          // 主管约束模块
          enforce_supervisor_constraints: config.enableSupervisorConstraints,
          group_leader_operation_penalty: config.groupLeaderOperationPenalty,
          no_group_leader_operation_reward: config.noGroupLeaderOperationReward,
          no_supervisor_on_duty_penalty: config.noSupervisorOnDutyPenalty,
          extra_supervisor_non_workday_penalty: config.extraSupervisorNonWorkdayPenalty,
          team_leader_non_workday_penalty: config.teamLeaderNonWorkdayPenalty,
          rotation_violation_penalty: config.rotationViolationPenalty,

          // 公平性约束模块
          enforce_fairness: config.enableFairness,
          night_shift_unfair_penalty: config.nightShiftUnfairPenalty,
          day_shift_unfair_penalty: config.dayShiftUnfairPenalty,
          night_interval_unfair_penalty: config.nightIntervalUnfairPenalty,
          operation_time_unfair_penalty: config.operationTimeUnfairPenalty,

          // 目标函数
          minimize_triple_holiday_staff: config.minimizeTripleHolidayStaff,

          // 求解器参数
          solver_time_limit_seconds: config.solverTimeLimit,
          solver_improvement_timeout: config.solverImprovementTimeout,
        },
      };

      // 创建任务
      const result = await createSolveTask(request);

      if (!result.success || !result.data) {
        throw new Error(result.error || '创建任务失败');
      }

      message.success(`求解任务已创建: ${result.data.runCode}`);

      // 获取初始状态
      const statusResult = await getSolveRunStatus(result.data.runId);
      if (statusResult.success && statusResult.data) {
        setCurrentRun(statusResult.data);
      }

      // 使用 WebSocket 订阅实时进度
      pollCancelRef.current = subscribeToSolveProgress(
        result.data.runId,
        // 实时进度回调
        (progress: SolverProgressData) => {
          setCurrentRun(prev => prev ? {
            ...prev,
            stage: progress.stage as any,
            solver_progress: {
              solutions_found: progress.solutionsFound || 0,
              best_objective: progress.objective ?? null,
              elapsed_seconds: progress.elapsed || 0,
              time_limit_seconds: config.solverTimeLimit,
              estimated_remaining: Math.max(0, config.solverTimeLimit - (progress.elapsed || 0)),
              progress_percent: progress.progress,
            },
          } : prev);
        },
        // 完成回调
        (run) => {
          setCurrentRun(run);
          setSolving(false);
          setAborting(false);  // 重置中断状态

          if (run.status === 'COMPLETED') {
            message.success('求解完成！');
            // 刷新操作数据以显示最新分配状态
            loadOperations();
            // 打开结果弹窗
            setResultRunId(run.id);
            setResultModalOpen(true);
          } else if (run.status === 'FAILED') {
            message.error(`求解失败: ${run.error_message || '未知错误'}`);
          } else if (run.status === 'CANCELLED') {
            message.warning('任务已取消');
          }
        },
        // 错误回调
        (error) => {
          message.error(error);
          setSolving(false);
          setAborting(false);
        }
      );
    } catch (error: any) {
      console.error('Solve failed', error);
      message.error(error.message || '求解失败');
      setSolving(false);
      setAborting(false);
    }
  };

  // 重试任务
  const handleRetry = async () => {
    if (!currentRun) return;

    const result = await retrySolveRun(currentRun.id);
    if (result.success) {
      message.info('任务已重新开始');
      setSolving(true);
      
      // 使用 WebSocket 订阅实时进度
      pollCancelRef.current = subscribeToSolveProgress(
        currentRun.id,
        (progress: SolverProgressData) => {
          setCurrentRun(prev => prev ? {
            ...prev,
            stage: progress.stage as any,
            solver_progress: {
              solutions_found: progress.solutionsFound || 0,
              best_objective: progress.objective ?? null,
              elapsed_seconds: progress.elapsed || 0,
              time_limit_seconds: config.solverTimeLimit,
              estimated_remaining: Math.max(0, config.solverTimeLimit - (progress.elapsed || 0)),
              progress_percent: progress.progress,
            },
          } : prev);
        },
        (run) => {
          setCurrentRun(run);
          setSolving(false);
          if (run.status === 'COMPLETED') {
            message.success('求解完成！');
            loadOperations();
            // 打开结果弹窗
            setResultRunId(run.id);
            setResultModalOpen(true);
          }
        },
        (error) => {
          message.error(error);
          setSolving(false);
        }
      );
    } else {
      message.error(result.error || '重试失败');
    }
  };

  // 取消任务
  const handleCancel = async () => {
    if (!currentRun) return;

    // 取消轮询
    if (pollCancelRef.current) {
      pollCancelRef.current();
      pollCancelRef.current = null;
    }

    const result = await cancelSolveRun(currentRun.id);
    if (result.success) {
      message.warning('任务已取消');
      setSolving(false);
      setCurrentRun((prev) => prev ? { ...prev, status: 'CANCELLED' } : null);
    } else {
      message.error(result.error || '取消失败');
    }
  };

  // 中断状态
  const [aborting, setAborting] = useState(false);

  // 中断求解并使用当前结果
  const handleAbort = async () => {
    if (!currentRun) return;

    setAborting(true);
    message.info('正在请求中断，将在下次找到解时停止...');

    try {
      const result = await abortSolveRun(currentRun.id, currentRun.run_code);
      if (result.success) {
        message.success('已请求中断，等待求解器返回当前最优解...');
        // 注意：不要立即停止轮询，等待求解器返回结果
      } else {
        message.error(result.error || '中断请求失败');
        setAborting(false);
      }
    } catch (error: any) {
      message.error(error.message || '中断请求失败');
      setAborting(false);
    }
  };

  // 关闭进度面板
  const handleCloseProgress = () => {
    setShowProgress(false);
    setCurrentRun(null);
  };

  return (
    <div className="modular-scheduling-container">
      {/* 进度显示 */}
      {showProgress && (
        <SolveProgress
          run={currentRun}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onAbort={handleAbort}
          onClose={handleCloseProgress}
          aborting={aborting}
        />
      )}

      {/* 步骤1：选择批次 */}
      <Card
        className="step-card"
        title={
          <>
            <span className="step-number">1</span>
            选择需要排班的批次
          </>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={loadOperations}
            loading={operationsLoading}
          >
            刷新批次
          </Button>
        }
      >
        <BatchSelector
          batches={batchCards}
          selectedIds={selectedBatchIds}
          onSelectionChange={setSelectedBatchIds}
          loading={operationsLoading}
          searchValue={batchSearch}
          onSearchChange={setBatchSearch}
        />
      </Card>

      {/* 步骤2：求解区间 */}
      <Card
        className="step-card"
        title={
          <>
            <span className="step-number">2</span>
            求解区间（自动计算）
          </>
        }
      >
        <SchedulingWindowDisplay
          window={schedulingWindow}
          loading={calendarLoading}
        />
      </Card>

      {/* 步骤3：求解摘要 */}
      <Card
        className="step-card"
        title={
          <>
            <span className="step-number">3</span>
            求解摘要
          </>
        }
      >
        <SchedulingSummaryDisplay
          summary={schedulingSummary}
          loading={operationsLoading}
        />
      </Card>

      {/* 操作按钮 */}
      <div className="action-section">
        <Button
          className="config-button"
          icon={<SettingOutlined />}
          onClick={openConfigDrawer}
          disabled={solving}
        >
          高级配置
        </Button>
        <Button
          type="primary"
          className="solve-button"
          icon={solving ? <Spin size="small" /> : <RocketOutlined />}
          onClick={handleStartSolve}
          disabled={selectedBatchIds.length === 0 || solving}
          loading={solving}
        >
          {solving ? '求解中...' : '开始求解'}
        </Button>
      </div>

      {/* 高级配置抽屉 */}
      <Drawer
        title="高级配置"
        placement="right"
        width={400}
        open={configDrawerVisible}
        onClose={() => setConfigDrawerVisible(false)}
        extra={
          <Space>
            <Button onClick={() => setConfigDrawerVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveConfig}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          form={configForm}
          layout="vertical"
          initialValues={config}
        >
          <Alert
            message="按模块配置求解器约束，可单独启用/禁用模块进行测试"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          {/* ==================== 操作分配模块 ==================== */}
          <Divider orientation="left">
            <Space>
              操作分配模块
              <Form.Item name="enableOperationAssignment" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="skipPositionPenalty"
            label="跳过位置罚分"
            tooltip="无法分配岗位时的惩罚分数（软约束）"
          >
            <InputNumber min={0} max={100000} step={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="sharingViolationPenalty"
            label="共享人员不满足罚分"
            tooltip="共享组内人员重叠不足时的惩罚分数（每人次）"
          >
            <InputNumber min={0} max={100000} step={100} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 班次一致性模块 ==================== */}
          <Divider orientation="left">
            <Space>
              班次一致性模块
              <Form.Item name="enableShiftConsistency" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="shiftMatchingToleranceMinutes"
            label="班次匹配容差（分钟）"
            tooltip="操作时间与班次时间的允许偏差"
          >
            <InputNumber min={0} max={60} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="workdayRestPenalty"
            label="工作日休息罚分"
            tooltip="工作日没有操作时安排休息的惩罚分数（软约束）"
          >
            <InputNumber min={0} max={10000} step={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="nonWorkdayWorkPenalty"
            label="非工作日上班罚分"
            tooltip="非工作日没有操作时安排上班的惩罚分数（软约束）"
          >
            <InputNumber min={0} max={10000} step={100} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 月度工时模块 ==================== */}
          <Divider orientation="left">
            <Space>
              月度工时模块
              <Form.Item name="enableMonthlyHours" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="monthlyHoursLowerOffset"
            label="月度工时下限偏移（小时）"
            tooltip="允许少于标准工时的小时数。例如：标准工时184h，偏移4h，则最低工时=180h"
          >
            <InputNumber min={0} max={40} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="monthlyHoursUpperOffset"
            label="月度工时上限偏移（小时）"
            tooltip="允许超过标准工时的小时数。例如：标准工时184h，偏移32h，则最高工时=216h"
          >
            <InputNumber min={0} max={80} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 连续工作模块 ==================== */}
          <Divider orientation="left">
            <Space>
              连续工作模块
              <Form.Item name="enableConsecutiveWork" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="maxConsecutiveWorkdays"
            label="最大连续工作天数"
            tooltip="员工不得连续工作超过此天数（硬约束）"
          >
            <InputNumber min={1} max={14} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 夜班休息模块 ==================== */}
          <Divider orientation="left">
            <Space>
              夜班休息模块
              <Form.Item name="enableNightRest" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="nightRestHardDays"
            label="硬约束休息天数 (x)"
            tooltip="夜班后必须休息的天数（硬约束，违反则无解）"
          >
            <InputNumber min={0} max={3} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="nightRestSoftDays"
            label="软约束休息天数 (y)"
            tooltip="夜班后建议休息的天数（软约束，y >= x）"
          >
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="nightRestReward"
            label="满足软约束奖励"
            tooltip="满足软约束（第 x+1 到 y 天休息）的奖励分（每人次）"
          >
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="nightRestPenalty"
            label="不满足软约束惩罚"
            tooltip="不满足软约束（第 x+1 到 y 天上班）的惩罚分（每人次）"
          >
            <InputNumber min={0} max={2000} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 主管约束模块 ==================== */}
          <Divider orientation="left">
            <Space>
              主管约束模块
              <Form.Item name="enableSupervisorConstraints" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="groupLeaderOperationPenalty"
            label="GROUP_LEADER参与操作罚分"
            tooltip="GROUP_LEADER参与操作时的罚分（每人每小时）"
          >
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="noGroupLeaderOperationReward"
            label="无GROUP_LEADER操作奖励"
            tooltip="操作中无GROUP_LEADER参与时的奖励（每操作）"
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="noSupervisorOnDutyPenalty"
            label="S2a: 无主管在岗罚分"
            tooltip="有操作日无GROUP_LEADER+在岗时的罚分（硬约束降级，每天）"
          >
            <InputNumber min={0} max={10000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="extraSupervisorNonWorkdayPenalty"
            label="S2b: 非工作日多余主管罚分"
            tooltip="非工作日有操作时多于1名主管在岗的罚分（硬约束降级，每人次）"
          >
            <InputNumber min={0} max={10000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="teamLeaderNonWorkdayPenalty"
            label="S4: TEAM_LEADER非工作日上班罚分"
            tooltip="TEAM_LEADER在非工作日上班的罚分（每人次）"
          >
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="rotationViolationPenalty"
            label="S6: 轮流值班违规罚分"
            tooltip="同一主管多次在非工作日值班的额外罚分（每次）"
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 公平性约束模块 ==================== */}
          <Divider orientation="left">
            <Space>
              公平性约束模块
              <Form.Item name="enableFairness" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
            </Space>
          </Divider>

          <Form.Item
            name="nightShiftUnfairPenalty"
            label="F1: 夜班不公平罚分"
            tooltip="同层级员工夜班数量差距每差1次的罚分"
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="dayShiftUnfairPenalty"
            label="F2: 长白班不公平罚分"
            tooltip="同层级员工长白班数量差距每差1次的罚分"
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="nightIntervalUnfairPenalty"
            label="F3: 夜班间隔不均匀罚分"
            tooltip="相邻夜班间隔过近（<3天）的罚分"
          >
            <InputNumber min={0} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="operationTimeUnfairPenalty"
            label="F4: 操作时长不公平罚分"
            tooltip="同层级员工操作时长差距每差1小时的罚分"
          >
            <InputNumber min={0} max={200} style={{ width: '100%' }} />
          </Form.Item>

          {/* ==================== 目标函数 ==================== */}
          <Divider orientation="left">目标函数</Divider>

          <Form.Item
            name="minimizeTripleHolidayStaff"
            label="最小化三倍工资日人数"
            valuePropName="checked"
            tooltip="尽量减少在三倍工资日安排工作的人数"
          >
            <Switch />
          </Form.Item>

          {/* ==================== 求解器参数 ==================== */}
          <Divider orientation="left">求解器参数</Divider>

          <Form.Item
            name="solverTimeLimit"
            label="求解时间限制（秒）"
            tooltip="求解器的最大运行时间"
          >
            <InputNumber min={10} max={600} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="solverImprovementTimeout"
            label="无改进超时（秒）"
            tooltip="连续多少秒无改进时提前停止"
          >
            <InputNumber min={5} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 求解结果弹窗 */}
      <SolveResultModal
        open={resultModalOpen}
        runId={resultRunId}
        onClose={() => {
          setResultModalOpen(false);
          setResultRunId(null);
        }}
      />
    </div>
  );
};

export default ModularScheduling;
