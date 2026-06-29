import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { employeeApi } from '../../services/api';
import {
  rosterExceptionApi,
  ImpactedAssignmentDto,
  ImpactedShiftPlanDto,
  RosterExceptionApplyResponse,
  RosterExceptionPreviewResponse,
  RosterRepairMode,
  RosterVacancyDto,
  SolverRepairAssignmentChangeDto,
  SolverRepairProposalDto,
} from '../../services/rosterExceptionApi';
import type { Employee } from '../../types';
import {
  WxbAlert,
  WxbButton,
  WxbCheckbox,
  WxbDataTable,
  WxbCollapse,
  WxbDivider,
  WxbEmpty,
  WxbInput,
  WxbKpiCard,
  WxbModal,
  WxbPageGrid,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbProgress,
  WxbRangePicker,
  WxbSegmented,
  WxbSelect,
  WxbSpinner,
  WxbTag,
  WxbTooltip,
  useWxbToast,
} from '../../components/wxb-ui';
import './RosterExceptionRepair.css';

const DEFAULT_REASON_CODE = 'TEMP_UNAVAILABLE';
const ALL_TEAM_SCOPE = 'ALL';
type PreviewRequestKind = 'IMPACT_ONLY' | 'SOLVER_REPAIR';
type OperationFeedbackKind = 'success' | 'warning' | 'error' | 'info';
type OperationFeedback = {
  kind: OperationFeedbackKind;
  title: string;
  description: string;
  details?: string[];
};
type FeedbackToastApi = {
  success: (content: string, duration?: number) => void;
  warning: (content: string, duration?: number) => void;
  error: (content: string, duration?: number) => void;
  info: (content: string, duration?: number) => void;
};
type ImpactedRoleDetailRow = ImpactedAssignmentDto & {
  vacancy?: RosterVacancyDto;
  requiredQualificationNames: string[];
};
type ShiftCalendarDay = {
  key: string;
  date: dayjs.Dayjs;
  inMonth: boolean;
  shifts: ImpactedShiftPlanDto[];
};
type ShiftCalendarMonth = {
  key: string;
  label: string;
  impactedDayCount: number;
  lockedCount: number;
  shiftCount: number;
  days: ShiftCalendarDay[];
};

const PREVIEW_TIMEOUT_SECONDS: Record<PreviewRequestKind, number> = {
  IMPACT_ONLY: 15,
  SOLVER_REPAIR: 90,
};

const IMPACT_PROGRESS_STEPS = [
  '校验不可用时间窗',
  '读取受影响排班',
  '识别释放岗位 demand',
  '汇总影响分析',
] as const;

const SOLVER_PROGRESS_STEPS = [
  '校验影响范围',
  '冻结未受影响 assignment',
  '组装局部求解输入',
  '调用 solver_v4',
  '汇总修复方案',
] as const;
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

const getPreviewProgress = (elapsedSeconds: number, requestKind: PreviewRequestKind | null) => {
  if (requestKind === 'IMPACT_ONLY') {
    if (elapsedSeconds < 1) return { percent: 20, activeIndex: 0, label: '正在校验输入' };
    if (elapsedSeconds < 2) return { percent: 48, activeIndex: 1, label: '正在读取受影响 shift plans 和 assignments' };
    if (elapsedSeconds < 4) return { percent: 74, activeIndex: 2, label: '正在识别释放出来的岗位 demand' };
    return { percent: 90, activeIndex: 3, label: '正在汇总影响分析' };
  }

  if (elapsedSeconds < 1) {
    return { percent: 12, activeIndex: 0, label: '正在校验输入' };
  }
  if (elapsedSeconds < 2) {
    return { percent: 30, activeIndex: 1, label: '正在读取受影响 assignments' };
  }
  if (elapsedSeconds < 4) {
    return { percent: 52, activeIndex: 2, label: '正在组装 solver_v4 preview 输入' };
  }
  if (elapsedSeconds < 8) {
    return { percent: 74, activeIndex: 3, label: '正在等待 solver_v4 返回 proposal' };
  }
  return { percent: 88, activeIndex: 3, label: 'solver_v4 仍在求解，页面会保留当前结果' };
};

const repairModeLabel = (mode: RosterRepairMode | string) => {
  if (mode === 'MINIMAL_CHANGE') return '最小变更';
  if (mode === 'MAX_COVERAGE') return '最大覆盖';
  return mode;
};

const getEmployeeTeamScopeName = (employee: Employee) =>
  employee.primary_team_name
  ?? employee.primaryTeamName
  ?? employee.unit_name
  ?? employee.unitName
  ?? employee.department_name
  ?? employee.departmentName
  ?? '未配置 Team';

const getEmployeeId = (employee: Employee) => Number(employee.id);

const getEmployeeTeamScopeKey = (employee: Employee) => {
  const teamId = employee.primary_team_id
    ?? employee.primaryTeamId
    ?? employee.unit_id
    ?? employee.unitId
    ?? employee.department_id
    ?? employee.departmentId;
  if (teamId !== null && teamId !== undefined) return `team-${teamId}`;
  return `team-name-${getEmployeeTeamScopeName(employee)}`;
};

const toEmployeeOption = (employee: Employee) => ({
  label: `${employee.employee_name ?? employee.employeeName} (${employee.employee_code ?? employee.employeeCode}) · ${getEmployeeTeamScopeName(employee)}`,
  value: getEmployeeId(employee),
});

const formatDateTime = (value?: string | null) => (
  value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'
);

const formatShiftTimeRange = (shift: ImpactedShiftPlanDto) => {
  if (!shift.shiftStart || !shift.shiftEnd) return '-';
  const start = dayjs(shift.shiftStart);
  const end = dayjs(shift.shiftEnd);
  if (!start.isValid() || !end.isValid()) return '-';
  if (start.isSame(end, 'day')) return `${start.format('HH:mm')}-${end.format('HH:mm')}`;
  return `${start.format('MM-DD HH:mm')}-${end.format('MM-DD HH:mm')}`;
};

const formatCompactShiftTimeRange = (shift: ImpactedShiftPlanDto) => {
  if (!shift.shiftStart || !shift.shiftEnd) return '-';
  const start = dayjs(shift.shiftStart);
  const end = dayjs(shift.shiftEnd);
  if (!start.isValid() || !end.isValid()) return '-';
  const startText = start.minute() === 0 ? start.format('HH') : start.format('HH:mm');
  const endText = end.minute() === 0 ? end.format('HH') : end.format('HH:mm');
  if (start.isSame(end, 'day')) return `${startText}-${endText}`;
  return `${startText}-次日`;
};

const shiftCalendarToneClass = (shift: ImpactedShiftPlanDto) => {
  const code = String(shift.shiftCode ?? '').toUpperCase();
  if (code.includes('NIGHT')) return 'is-night';
  if (code.includes('REST')) return 'is-rest';
  if (code.includes('DAY')) return 'is-day';
  if (code.includes('BASE')) return 'is-base';
  return 'is-base';
};

const startOfCalendarWeek = (date: dayjs.Dayjs) => {
  const day = date.day();
  return date.add(day === 0 ? -6 : 1 - day, 'day').startOf('day');
};

const buildShiftCalendarMonths = (shifts: ImpactedShiftPlanDto[]): ShiftCalendarMonth[] => {
  const shiftsByDay = new Map<string, ImpactedShiftPlanDto[]>();
  shifts.forEach((shift) => {
    const date = dayjs(shift.planDate || shift.shiftStart);
    if (!date.isValid()) return;
    const key = date.format('YYYY-MM-DD');
    if (!shiftsByDay.has(key)) shiftsByDay.set(key, []);
    shiftsByDay.get(key)!.push(shift);
  });

  const monthKeys = Array.from(new Set(Array.from(shiftsByDay.keys()).map((key) => key.slice(0, 7))))
    .sort((left, right) => left.localeCompare(right));

  return monthKeys.map((monthKey) => {
    const monthStart = dayjs(`${monthKey}-01`).startOf('month');
    const monthEnd = monthStart.endOf('month');
    const calendarStart = startOfCalendarWeek(monthStart);
    const calendarEnd = startOfCalendarWeek(monthEnd).add(6, 'day');
    const days: ShiftCalendarDay[] = [];

    for (
      let cursor = calendarStart;
      cursor.isBefore(calendarEnd) || cursor.isSame(calendarEnd, 'day');
      cursor = cursor.add(1, 'day')
    ) {
      const key = cursor.format('YYYY-MM-DD');
      const inMonth = cursor.isSame(monthStart, 'month');
      days.push({
        key,
        date: cursor,
        inMonth,
        shifts: inMonth
          ? (shiftsByDay.get(key) ?? []).sort((left, right) =>
            String(left.shiftStart ?? '').localeCompare(String(right.shiftStart ?? '')),
          )
          : [],
      });
    }

    const monthShifts = days.flatMap((day) => day.shifts);
    return {
      key: monthKey,
      label: monthStart.format('YYYY年MM月'),
      impactedDayCount: days.filter((day) => day.inMonth && day.shifts.length > 0).length,
      lockedCount: monthShifts.filter((shift) => shift.isLocked).length,
      shiftCount: monthShifts.length,
      days,
    };
  });
};

const booleanTag = (
  value: boolean,
  yes = '是',
  no = '否',
  yesColor: React.ComponentProps<typeof WxbTag>['color'] = 'green',
  noColor: React.ComponentProps<typeof WxbTag>['color'] = 'neutral',
) => (
  <WxbTag color={value ? yesColor : noColor}>{value ? yes : no}</WxbTag>
);

const proposalStatusTag = (status?: string | null) => {
  if (status === 'IMPACT_ONLY') return <WxbTag color="blue">影响已识别</WxbTag>;
  if (status === 'READY') return <WxbTag color="green">可应用</WxbTag>;
  if (status === 'PARTIAL') return <WxbTag color="amber">部分覆盖</WxbTag>;
  if (status === 'UNCOVERED') return <WxbTag color="amber">未覆盖</WxbTag>;
  if (status === 'NO_IMPACT') return <WxbTag color="neutral">无影响</WxbTag>;
  if (status === 'DATA_GAP') return <WxbTag color="amber">DATA GAP</WxbTag>;
  if (status === 'SOLVER_UNAVAILABLE' || status === 'SOLVER_FAILED' || status === 'INFEASIBLE') {
    return <WxbTag color="red">{status}</WxbTag>;
  }
  return <WxbTag color="neutral">{status ?? '等待生成'}</WxbTag>;
};

const proposalStatusLabel = (status?: string | null) => {
  if (status === 'IMPACT_ONLY') return '影响已识别';
  if (status === 'READY') return '可应用';
  if (status === 'PARTIAL') return '部分覆盖';
  if (status === 'UNCOVERED') return '未覆盖';
  if (status === 'NO_IMPACT') return '无影响';
  if (status === 'DATA_GAP') return 'DATA GAP';
  if (status === 'SOLVER_UNAVAILABLE') return 'solver 不可用';
  if (status === 'SOLVER_FAILED') return 'solver 失败';
  if (status === 'INFEASIBLE') return '不可行';
  return status ?? '等待生成';
};

const warningLabel = (warning: string) => {
  const labels: Record<string, string> = {
    SKILL_REQUIREMENT_MISSING: '岗位资质规则缺失，只能给出低可信推荐',
    LOCKED_ASSIGNMENT_AFFECTED: '受影响分配包含锁定项，需要主管确认',
    CANDIDATE_CONTENTION: '多个空缺可能争抢同一候选人',
    ONLY_RISKY_REPLACEMENTS: '至少一个空缺只有高风险候选人',
    DEPARTMENT_SCOPE_MISSING: '员工 Team 级部门归属缺失，已阻止跨部门替换',
    QUALIFICATION_INSUFFICIENT: '候选人资质不足',
    TIME_CONFLICT: '候选人在该时间窗已有任务',
    UNAVAILABILITY_CONFLICT: '候选人在该时间窗不可用',
    SOLVER_CAPABILITY_GAP: 'solver_v4 当前能力存在 adapter 边界说明',
  };
  return labels[warning] ?? warning;
};

const joinNames = (names?: string[]) => (names && names.length ? names.join('，') : '未配置');

const isTimeoutError = (err: any) =>
  err?.code === 'ECONNABORTED'
  || /timeout|exceeded|aborted/i.test(err?.message ?? '');

const isCanceledRequest = (err: any) =>
  err?.code === 'ERR_CANCELED'
  || err?.name === 'CanceledError'
  || err?.message === 'canceled';

const previewFailureMessage = (err: any, previewMode: PreviewRequestKind) => {
  if (isTimeoutError(err)) {
    const timeoutSeconds = PREVIEW_TIMEOUT_SECONDS[previewMode];
    return previewMode === 'IMPACT_ONLY'
      ? `查看影响超过 ${timeoutSeconds} 秒未返回，页面已停止本次请求；请重试。`
      : `生成修复方案超过 ${timeoutSeconds} 秒未返回，页面已停止等待并保留下方上一次 proposal；请稍后重试。`;
  }

  return err?.response?.data?.message || err?.message || (
    previewMode === 'IMPACT_ONLY' ? '影响分析失败' : 'solver repair proposal 生成失败'
  );
};

const isImpactOnlyProposal = (proposal?: SolverRepairProposalDto | null) =>
  !proposal || proposal.status === 'IMPACT_ONLY' || proposal.proposalId?.startsWith('impact-');

const feedbackTagColor = (kind: OperationFeedbackKind): React.ComponentProps<typeof WxbTag>['color'] => {
  if (kind === 'success') return 'green';
  if (kind === 'warning') return 'amber';
  if (kind === 'error') return 'red';
  return 'blue';
};

const feedbackLabel = (kind: OperationFeedbackKind) => {
  if (kind === 'success') return '成功';
  if (kind === 'warning') return '需确认';
  if (kind === 'error') return '失败';
  return '提示';
};

const emitFeedbackToast = (feedback: OperationFeedback, toast: FeedbackToastApi) => {
  const message = feedback.description;
  if (feedback.kind === 'success') toast.success(message, 3);
  else if (feedback.kind === 'warning') toast.warning(message, 3.5);
  else if (feedback.kind === 'error') toast.error(message, 4);
  else toast.info(message, 3);
};

const buildPreviewFeedback = (
  previewMode: PreviewRequestKind,
  result: RosterExceptionPreviewResponse,
): OperationFeedback => {
  const proposal = result.solverRepairProposal;
  const impactedCount = result.summary.impactedAssignmentCount;
  const vacancyCount = result.summary.vacancyCount;

  if (previewMode === 'IMPACT_ONLY') {
    if (impactedCount === 0) {
      return {
        kind: 'info',
        title: '影响分析完成',
        description: '当前时间窗没有受影响 assignment，无需生成修复方案。',
      };
    }

    return {
      kind: 'success',
      title: '影响分析完成',
      description: `已识别 ${impactedCount} 条受影响 assignment 和 ${vacancyCount} 个释放岗位，可继续生成 solver_v4 修复方案。`,
    };
  }

  const commonDetails = [
    ...proposal.supervisorAttentionItems.slice(0, 2),
    ...proposal.capabilityGaps.slice(0, 1).map((gap) => gap.message),
  ];

  if (proposal.status === 'READY') {
    return {
      kind: 'success',
      title: '修复方案生成完成',
      description: `solver_v4 已返回 ${proposal.changedAssignmentCount} 条可检查的人员替换，覆盖率 ${proposal.coverageRate}%。`,
      details: commonDetails,
    };
  }

  if (proposal.status === 'PARTIAL') {
    return {
      kind: 'warning',
      title: '修复方案部分覆盖',
      description: `solver_v4 已生成 ${proposal.changedAssignmentCount} 条人员替换，仍有 ${proposal.uncoveredVacancyCount} 个岗位未覆盖。`,
      details: commonDetails,
    };
  }

  if (proposal.status === 'UNCOVERED') {
    return {
      kind: 'warning',
      title: '修复方案未覆盖',
      description: `solver_v4 本次没有可应用人员替换，仍有 ${proposal.uncoveredVacancyCount} 个岗位未覆盖。`,
      details: commonDetails,
    };
  }

  if (proposal.status === 'NO_IMPACT') {
    return {
      kind: 'info',
      title: '无需修复',
      description: '当前时间窗没有受影响 assignment，未调用 solver_v4。',
      details: commonDetails,
    };
  }

  if (proposal.status === 'DATA_GAP') {
    return {
      kind: 'error',
      title: '修复方案生成受阻',
      description: proposal.applyDisabledReason ?? '数据缺口阻止生成可应用的 solver_v4 修复方案。',
      details: commonDetails,
    };
  }

  if (proposal.status === 'SOLVER_UNAVAILABLE') {
    return {
      kind: 'error',
      title: 'solver_v4 不可用',
      description: 'solver_v4 预览服务当前不可用，本次未生成可应用修复方案。',
      details: commonDetails,
    };
  }

  if (proposal.status === 'SOLVER_FAILED') {
    return {
      kind: 'error',
      title: '修复方案生成失败',
      description: 'solver_v4 返回失败，本次未生成可应用修复方案。',
      details: commonDetails,
    };
  }

  if (proposal.status === 'INFEASIBLE') {
    return {
      kind: 'error',
      title: '修复方案不可行',
      description: 'solver_v4 判断当前局部修复不可行，请扩大影响范围或调整人员约束后重试。',
      details: commonDetails,
    };
  }

  return {
    kind: 'info',
    title: '修复方案已返回',
    description: `solver_v4 返回状态 ${proposal.status}，请查看下方 proposal 详情。`,
    details: commonDetails,
  };
};

const buildApplyFeedback = (result: RosterExceptionApplyResponse): OperationFeedback => {
  if (result.appliedCount > 0) {
    return {
      kind: 'success',
      title: '方案应用完成',
      description: `已应用 ${result.appliedCount} 条 assignment-only 人员替换，跳过 ${result.skippedCount} 条。`,
    };
  }

  return {
    kind: 'warning',
    title: '方案未应用',
    description: `没有写入人员替换，已跳过 ${result.skippedCount} 条选择项。`,
    details: result.skippedChanges.slice(0, 3).map((item) => `${item.changeId}: ${item.reason}`),
  };
};

const ShiftPlanCalendar: React.FC<{ shifts: ImpactedShiftPlanDto[] }> = ({ shifts }) => {
  const months = useMemo(() => buildShiftCalendarMonths(shifts), [shifts]);

  if (months.length === 0) {
    return <WxbEmpty description="该时间窗内没有受影响 shift plans" />;
  }

  return (
    <div className="roster-exception-calendar" aria-label="受影响班次计划日历">
      <div className="roster-exception-calendar-toolbar">
        <div>
          <div className="roster-exception-calendar-title">受影响班次日历</div>
          <div className="roster-exception-calendar-subtitle">
            仅显示日期、班次、时间和锁定状态，完整计划信息悬停查看。
          </div>
        </div>
        <div className="roster-exception-calendar-legend" aria-label="日历图例">
          <span><span className="roster-exception-calendar-dot is-planned" />计划班次</span>
          <span><span className="roster-exception-calendar-dot is-locked" />锁定</span>
        </div>
      </div>
      <div className="roster-exception-calendar-months">
        {months.map((month) => (
          <section key={month.key} className="roster-exception-calendar-month" aria-label={month.label}>
            <div className="roster-exception-calendar-month-header">
              <strong>{month.label}</strong>
              <div className="roster-exception-calendar-month-meta">
                <WxbTag color="blue">{month.shiftCount} 班次</WxbTag>
                <WxbTag color={month.lockedCount > 0 ? 'red' : 'green'}>{month.lockedCount} 锁定</WxbTag>
                <WxbTag color="neutral">{month.impactedDayCount} 天</WxbTag>
              </div>
            </div>
            <div className="roster-exception-calendar-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="roster-exception-calendar-grid">
              {month.days.map((day) => {
                const dayClasses = [
                  'roster-exception-calendar-day',
                  day.inMonth ? '' : 'is-outside-month',
                  day.shifts.length > 0 ? 'has-shift' : '',
                  day.shifts.some((shift) => shift.isLocked) ? 'has-locked-shift' : '',
                ].filter(Boolean).join(' ');

                return (
                  <div key={day.key} className={dayClasses} aria-label={`${day.date.format('YYYY-MM-DD')} ${day.shifts.length} 个受影响班次`}>
                    <div className="roster-exception-calendar-date">
                      <span>{day.date.date()}</span>
                      {day.shifts.some((shift) => shift.isLocked) && (
                        <span className="roster-exception-calendar-lock-dot" aria-label="锁定" />
                      )}
                    </div>
                    <div className="roster-exception-calendar-shifts">
                      {day.shifts.map((shift) => {
                        const shiftClasses = [
                          'roster-exception-calendar-shift',
                          shiftCalendarToneClass(shift),
                          shift.isLocked ? 'is-locked' : '',
                        ].filter(Boolean).join(' ');
                        const shiftLabel = shift.shiftCode ?? '未配置班次';

                        return (
                          <WxbTooltip
                            key={shift.shiftPlanId}
                            title={(
                              <div className="roster-exception-calendar-tip">
                                <strong>{shiftLabel}</strong>
                                <span>计划 #{shift.shiftPlanId}</span>
                                <span>{formatShiftTimeRange(shift)}</span>
                                <span>状态：{shift.planState}</span>
                                {shift.isLocked && <span>锁定</span>}
                              </div>
                            )}
                          >
                            <div
                              className={shiftClasses}
                              aria-label={`${day.date.format('YYYY-MM-DD')} ${shiftLabel} ${formatCompactShiftTimeRange(shift)} ${shift.isLocked ? '锁定' : ''}`}
                            >
                              <span className="roster-exception-calendar-shift-label">{shiftLabel}</span>
                              <span className="roster-exception-calendar-shift-time">
                                {formatCompactShiftTimeRange(shift)}
                              </span>
                            </div>
                          </WxbTooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export interface RosterExceptionRepairProps {
  /** 在 V4/V5 求解器界面 tab 内嵌入时为 true：隐藏页面级 header、收紧外层间距 */
  embedded?: boolean;
}

const RosterExceptionRepair: React.FC<RosterExceptionRepairProps> = ({ embedded = false }) => {
  const requestSeqRef = useRef(0);
  const activePreviewAbortRef = useRef<AbortController | null>(null);
  const [feedbackToast, feedbackToastContextHolder] = useWxbToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedTeamScope, setSelectedTeamScope] = useState(ALL_TEAM_SCOPE);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [repairMode, setRepairMode] = useState<RosterRepairMode>('MINIMAL_CHANGE');
  const [protectLockedAssignments, setProtectLockedAssignments] = useState(true);
  const [allowOvertimeSuggestions, setAllowOvertimeSuggestions] = useState(false);
  const [preview, setPreview] = useState<RosterExceptionPreviewResponse | null>(null);
  const [activeRequest, setActiveRequest] = useState<PreviewRequestKind | null>(null);
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const [previewElapsedSec, setPreviewElapsedSec] = useState(0);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applySummary, setApplySummary] = useState<RosterExceptionApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationFeedback, setOperationFeedback] = useState<OperationFeedback | null>(null);

  useEffect(() => {
    let mounted = true;
    setEmployeesLoading(true);

    employeeApi.getAll()
      .then((response) => {
        if (!mounted) return;
        const activeEmployees = response.data.filter((employee) =>
          (employee.employment_status ?? employee.employmentStatus ?? 'ACTIVE') === 'ACTIVE',
        );
        setEmployees(activeEmployees);
        setSelectedEmployeeIds((current) =>
          current.length > 0 ? current : (activeEmployees[0]?.id ? [Number(activeEmployees[0].id)] : []),
        );
      })
      .catch(() => {
        if (mounted) setError('员工列表加载失败');
      })
      .finally(() => {
        if (mounted) setEmployeesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeRequest || !previewStartedAt) return undefined;

    const updateElapsed = () => {
      setPreviewElapsedSec(Math.max(0, Math.floor((Date.now() - previewStartedAt) / 1000)));
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 500);

    return () => window.clearInterval(intervalId);
  }, [activeRequest, previewStartedAt]);

  const impactedRoleRows = useMemo<ImpactedRoleDetailRow[]>(() => {
    if (!preview) return [];
    const vacancyById = new Map(preview.vacancies.map((vacancy) => [vacancy.vacancyId, vacancy]));

    return preview.impactedAssignments.map((assignment) => {
      const vacancyId = `vacancy-${assignment.assignmentId}-${assignment.positionNumber}`;
      const vacancy = vacancyById.get(vacancyId);
      return {
        ...assignment,
        vacancy,
        requiredQualificationNames: vacancy?.requiredQualificationNames ?? [],
      };
    });
  }, [preview]);

  const teamOptions = useMemo(() => {
    const countByScope = new Map<string, { label: string; count: number }>();
    employees.forEach((employee) => {
      const key = getEmployeeTeamScopeKey(employee);
      const current = countByScope.get(key);
      countByScope.set(key, {
        label: current?.label ?? getEmployeeTeamScopeName(employee),
        count: (current?.count ?? 0) + 1,
      });
    });

    return [
      { label: `全部 Team (${employees.length})`, value: ALL_TEAM_SCOPE },
      ...Array.from(countByScope.entries())
        .sort(([, left], [, right]) => left.label.localeCompare(right.label))
        .map(([value, item]) => ({
          value,
          label: `${item.label} (${item.count})`,
        })),
    ];
  }, [employees]);
  const filteredEmployees = useMemo(() => (
    selectedTeamScope === ALL_TEAM_SCOPE
      ? employees
      : employees.filter((employee) => getEmployeeTeamScopeKey(employee) === selectedTeamScope)
  ), [employees, selectedTeamScope]);
  const employeeOptions = useMemo(() => filteredEmployees.map(toEmployeeOption), [filteredEmployees]);
  const selectedEmployeeCount = selectedEmployeeIds.length;
  const proposal = preview?.solverRepairProposal ?? null;
  const previewLoading = activeRequest !== null;
  const hasSolverProposal = Boolean(proposal && !isImpactOnlyProposal(proposal));
  const previewProgress = useMemo(() => getPreviewProgress(previewElapsedSec, activeRequest), [activeRequest, previewElapsedSec]);
  const activeProgressSteps = activeRequest === 'IMPACT_ONLY' ? IMPACT_PROGRESS_STEPS : SOLVER_PROGRESS_STEPS;
  const unavailableWindowValue = useMemo(() => {
    if (!windowStart || !windowEnd) return null;
    return [dayjs(windowStart), dayjs(windowEnd)] as any;
  }, [windowEnd, windowStart]);
  const canAnalyzeImpact = Boolean(selectedEmployeeIds.length > 0 && windowStart && windowEnd && !previewLoading);
  const canGenerateProposal = Boolean(
    selectedEmployeeIds.length > 0
    && windowStart
    && windowEnd
    && preview
    && preview.summary.impactedAssignmentCount > 0
    && !previewLoading,
  );
  // 不可用员工名单 —— 用于把变更分成「直接顶替」(不可用者原岗被回填) 与「连带重排」(其他人被牵动)。
  const unavailableIds = useMemo(
    () => new Set((preview?.employees ?? []).map((employee) => employee.employeeId)),
    [preview?.employees],
  );
  const allChanges = proposal?.assignmentChanges ?? [];
  const directChanges = allChanges.filter((change) => unavailableIds.has(change.originalEmployeeId));
  const knockOnChanges = allChanges.filter((change) => !unavailableIds.has(change.originalEmployeeId));
  const allChangeIds = allChanges.map((change) => change.changeId);
  const applyableChangeCount = allChanges.filter((change) => change.canApply).length;
  const changedCount = proposal?.changedAssignmentCount ?? 0;
  const uncoveredCount = proposal?.uncoveredVacancyCount ?? 0;
  const affectedSlotCount = directChanges.length + uncoveredCount;

  // 应用 = 全有或全无：发送方案全部 changeId，不允许樱桃式挑选(防双占)。
  const applyDisabledReason = !proposal || !hasSolverProposal
    ? '先查看影响并生成 Solver 修复方案'
    : !proposal.applyAllowed
      ? proposal.applyDisabledReason ?? '方案没有可应用的人员变更'
      : '';
  const canApply = Boolean(hasSolverProposal && proposal?.applyAllowed && !applyLoading);

  const clearPreviewState = () => {
    requestSeqRef.current += 1;
    activePreviewAbortRef.current?.abort();
    activePreviewAbortRef.current = null;
    setActiveRequest(null);
    setPreviewStartedAt(null);
    setPreviewElapsedSec(0);
    setPreview(null);
    setApplySummary(null);
    setOperationFeedback(null);
    setError(null);
  };

  const runPreview = async (previewMode: PreviewRequestKind) => {
    if (selectedEmployeeIds.length === 0 || !windowStart || !windowEnd) {
      setError('请选择至少一名员工并填写开始、结束时间');
      feedbackToast.warning('请选择至少一名员工并填写开始、结束时间');
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    activePreviewAbortRef.current?.abort();
    const controller = new AbortController();
    activePreviewAbortRef.current = controller;
    setActiveRequest(previewMode);
    setPreviewStartedAt(Date.now());
    setPreviewElapsedSec(0);
    setError(null);
    setApplySummary(null);
    setOperationFeedback(null);

    try {
      const result = await rosterExceptionApi.previewEmployeeUnavailable({
        exceptionType: 'EMPLOYEE_UNAVAILABLE',
        employeeId: selectedEmployeeIds[0],
        employeeIds: selectedEmployeeIds,
        windowStart: dayjs(windowStart).format(),
        windowEnd: dayjs(windowEnd).format(),
        reasonCode: reasonCode.trim() || DEFAULT_REASON_CODE,
        repairMode,
        previewMode,
        protectLockedAssignments,
        protectDepartmentBoundary: true,
        allowOvertimeSuggestions,
        previewOnly: true,
      }, {
        signal: controller.signal,
      });
      if (requestSeq !== requestSeqRef.current || controller.signal.aborted) return;
      setPreview(result);
      const feedback = buildPreviewFeedback(previewMode, result);
      setOperationFeedback(feedback);
      emitFeedbackToast(feedback, feedbackToast);
    } catch (err: any) {
      if (controller.signal.aborted || isCanceledRequest(err)) return;
      if (requestSeq !== requestSeqRef.current) return;
      const failureMessage = previewFailureMessage(err, previewMode);
      setError(failureMessage);
      feedbackToast.error(failureMessage, 4);
    } finally {
      if (requestSeq === requestSeqRef.current && activePreviewAbortRef.current === controller) {
        activePreviewAbortRef.current = null;
        setActiveRequest(null);
        setPreviewStartedAt(null);
        setPreviewElapsedSec(0);
      }
    }
  };

  const handleAnalyzeImpact = async () => {
    await runPreview('IMPACT_ONLY');
  };

  const handleGenerateProposal = async () => {
    await runPreview('SOLVER_REPAIR');
  };

  const handleApplyConfirmed = async () => {
    if (!preview || !canApply) return;
    setApplyLoading(true);
    setError(null);
    setOperationFeedback(null);

    try {
      const result = await rosterExceptionApi.applySelectedProposal(
        preview,
        allChangeIds,
        reasonCode.trim() || DEFAULT_REASON_CODE,
      );
      setApplySummary(result);
      setApplyConfirmOpen(false);
      const feedback = buildApplyFeedback(result);
      setOperationFeedback(feedback);
      emitFeedbackToast(feedback, feedbackToast);
    } catch (err: any) {
      const failureMessage = err?.response?.data?.message || err?.message || '应用人员替换失败';
      setError(failureMessage);
      feedbackToast.error(failureMessage, 4);
    } finally {
      setApplyLoading(false);
    }
  };

  const impactedRoleColumns: ColumnsType<ImpactedRoleDetailRow> = [
    { title: '批次', dataIndex: 'batchCode', key: 'batchCode', width: 120 },
    { title: '工序', dataIndex: 'operationName', key: 'operationName' },
    { title: '当前员工', key: 'employee', render: (_, item) => `${item.employeeName} (${item.employeeCode})` },
    { title: '原部门(Team)', key: 'department', width: 140, render: (_, item) => item.departmentName ?? 'DATA GAP' },
    { title: '开始', dataIndex: 'plannedStart', key: 'plannedStart', render: formatDateTime },
    { title: '结束', dataIndex: 'plannedEnd', key: 'plannedEnd', render: formatDateTime },
    { title: '释放岗位', key: 'releasedRole', width: 130, render: (_, item) => `${item.role} #${item.positionNumber}` },
    { title: '资质要求', dataIndex: 'requiredQualificationNames', key: 'requiredQualificationNames', render: joinNames },
    { title: '锁定', dataIndex: 'isLocked', key: 'isLocked', width: 90, render: (value) => booleanTag(value, '是', '否', 'red', 'green') },
    {
      title: '影响状态',
      key: 'impactState',
      width: 130,
      render: (_, item) => (item.vacancy?.hardToCoverReason === 'PROTECTED_LOCKED_ASSIGNMENT'
        ? <WxbTag color="red">锁定保护</WxbTag>
        : <WxbTag color="neutral">待修复</WxbTag>),
    },
  ];

  const changeColumns: ColumnsType<SolverRepairAssignmentChangeDto> = [
    { title: '工序', key: 'operation', render: (_, item) => `${item.batchCode} / ${item.operationName}` },
    {
      title: '原 → 新员工',
      key: 'beforeAfter',
      render: (_, item) => (
        <div className="roster-exception-before-after">
          <span>{item.originalEmployeeName} ({item.originalEmployeeCode})</span>
          <span className="roster-exception-arrow">-&gt;</span>
          <span>{item.proposedEmployeeName} ({item.proposedEmployeeCode})</span>
        </div>
      ),
    },
    { title: '岗位', key: 'role', width: 110, render: (_, item) => `${item.role} #${item.positionNumber}` },
    {
      title: '校验',
      key: 'check',
      render: (_, item) => {
        const flags: string[] = [];
        if (!item.sameDepartment) flags.push(item.proposedDepartmentName ? '跨部门' : '部门缺失');
        if (!item.proposedEmployeeHasQualification) flags.push('资质不足');
        if (!item.proposedShiftCode) flags.push('无对应班次');
        if (item.hasTimeConflict) flags.push('时间冲突');
        if (!item.canApply && item.applyBlockReason && flags.length === 0) flags.push(item.applyBlockReason);
        if (flags.length === 0) {
          return <WxbTag color="green">同部门 · 资质 · 在班</WxbTag>;
        }
        return (
          <div className="roster-exception-check-flags">
            {flags.map((flag) => <WxbTag key={flag} color="red">{flag}</WxbTag>)}
          </div>
        );
      },
    },
  ];

  return (
    <WxbPageShell
      size="full"
      gap="lg"
      className={embedded ? 'roster-exception-page roster-exception-page--embedded' : 'roster-exception-page'}
    >
      {feedbackToastContextHolder}
      {!embedded && (
        <WxbPageHeader
          eyebrow="排班异常修复"
          title="异常排班快速修复"
          meta={<WxbTag color="blue">Solver 修复方案</WxbTag>}
        />
      )}

      <WxbPageSection title="异常录入" description="选择人员临时不可用时间窗和局部修复策略。">
        <div className="roster-exception-form">
          <WxbSelect
            label="异常类型"
            value="EMPLOYEE_UNAVAILABLE"
            disabled
            options={[{ label: '人员临时不可用', value: 'EMPLOYEE_UNAVAILABLE' }]}
          />
          <WxbSelect
            label="Team 筛选"
            placeholder="全部 Team"
            showSearch
            optionFilterProp="label"
            loading={employeesLoading}
            value={selectedTeamScope}
            options={teamOptions}
            onChange={(value) => {
              const nextScope = String(value ?? ALL_TEAM_SCOPE);
              const nextSelectedIds = nextScope === ALL_TEAM_SCOPE
                ? selectedEmployeeIds
                : selectedEmployeeIds.filter((employeeId) => {
                  const employee = employees.find((item) => getEmployeeId(item) === Number(employeeId));
                  return Boolean(employee && getEmployeeTeamScopeKey(employee) === nextScope);
                });
              setSelectedTeamScope(nextScope);
              setSelectedEmployeeIds(nextSelectedIds);
              clearPreviewState();
            }}
            notFoundContent={employeesLoading ? <WxbSpinner size={16} tip="加载中" /> : <WxbEmpty description="暂无 Team" />}
          />
          <WxbSelect
            label="员工（可多选）"
            placeholder="选择一名或多名真实员工"
            mode="multiple"
            maxTagCount="responsive"
            maxTagPlaceholder={() => `${selectedEmployeeCount} 人已选`}
            showSearch
            optionFilterProp="label"
            loading={employeesLoading}
            value={selectedEmployeeIds}
            options={employeeOptions}
            onChange={(value) => {
              const nextIds = (Array.isArray(value) ? value : [value])
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0);
              setSelectedEmployeeIds(Array.from(new Set(nextIds)));
              clearPreviewState();
            }}
            notFoundContent={employeesLoading ? <WxbSpinner size={16} tip="加载中" /> : <WxbEmpty description="暂无员工" />}
          />
          <WxbRangePicker
            className="roster-exception-window-picker"
            label="不可用时间窗"
            showTime={{ format: 'HH:mm', minuteStep: 15 }}
            format="YYYY-MM-DD HH:mm"
            allowClear
            value={unavailableWindowValue}
            placeholder={['开始日期时间', '结束日期时间']}
            onChange={(dates) => {
              const [start, end] = dates ?? [];
              setWindowStart(start ? start.format('YYYY-MM-DDTHH:mm') : '');
              setWindowEnd(end ? end.format('YYYY-MM-DDTHH:mm') : '');
              clearPreviewState();
            }}
          />
          <WxbInput
            label="原因"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          />
        </div>
        <div className="roster-exception-controls">
          <div className="roster-exception-control-group">
            <span className="roster-exception-control-label">修复模式</span>
            <WxbSegmented
              value={repairMode}
              onChange={(value) => {
                setRepairMode(value as RosterRepairMode);
                clearPreviewState();
              }}
              options={[
                { label: '最小变更', value: 'MINIMAL_CHANGE' },
                { label: '最大覆盖', value: 'MAX_COVERAGE' },
              ]}
            />
          </div>
          <WxbCheckbox checked={protectLockedAssignments} onChange={(checked) => {
            setProtectLockedAssignments(checked);
            clearPreviewState();
          }}>
            保护锁定 assignment
          </WxbCheckbox>
          <WxbCheckbox checked disabled>
            同 Team 替换
          </WxbCheckbox>
          <WxbCheckbox checked={allowOvertimeSuggestions} onChange={(checked) => {
            setAllowOvertimeSuggestions(checked);
            clearPreviewState();
          }}>
            允许加班建议
          </WxbCheckbox>
          <WxbCheckbox checked disabled>
            只预览不写入
          </WxbCheckbox>
          <WxbButton
            type="button"
            variant="secondary"
            onClick={handleAnalyzeImpact}
            disabled={!canAnalyzeImpact}
            aria-busy={activeRequest === 'IMPACT_ONLY' || undefined}
          >
            {activeRequest === 'IMPACT_ONLY' ? (
              <span className="roster-exception-action-content">
                <WxbSpinner size={14} />
                <span>正在查看影响</span>
              </span>
            ) : preview ? '重新查看影响' : '查看影响'}
          </WxbButton>
          <WxbButton
            type="button"
            onClick={handleGenerateProposal}
            disabled={!canGenerateProposal}
            aria-busy={activeRequest === 'SOLVER_REPAIR' || undefined}
          >
            {activeRequest === 'SOLVER_REPAIR' ? (
              <span className="roster-exception-action-content">
                <WxbSpinner size={14} />
                <span>正在生成方案</span>
              </span>
            ) : hasSolverProposal ? '重新生成修复方案' : '生成修复方案'}
          </WxbButton>
          <span className="roster-exception-action-hint">
            {preview
              ? preview.summary.impactedAssignmentCount > 0
                ? `已显示 ${selectedEmployeeCount} 名员工的影响范围，确认后再生成 solver proposal。`
                : '当前时间窗没有受影响人员分配，无需生成方案。'
              : selectedEmployeeCount > 1
                ? `已选择 ${selectedEmployeeCount} 名员工；先查看影响，再生成修复方案。`
                : '先查看影响，再生成修复方案。'}
          </span>
        </div>
        {previewLoading && (
          <div className="roster-exception-progress-panel" role="status" aria-live="polite">
            <div className="roster-exception-progress-heading">
              <WxbSpinner size={18} />
              <div>
                <div className="roster-exception-progress-title">
                  {activeRequest === 'IMPACT_ONLY' ? '正在查看影响范围' : '正在生成 Solver 修复方案'}
                </div>
                <div className="roster-exception-progress-subtitle">
                  已运行 {previewElapsedSec}s · {previewProgress.label}
                </div>
              </div>
            </div>
            <WxbProgress
              percent={previewProgress.percent}
              status="normal"
              label={previewProgress.label}
            />
            <div className="roster-exception-progress-steps">
              {activeProgressSteps.map((step, index) => {
                const stateClass = index < previewProgress.activeIndex
                  ? 'is-done'
                  : index === previewProgress.activeIndex
                    ? 'is-active'
                    : '';
                return (
                  <div key={step} className={`roster-exception-progress-step ${stateClass}`}>
                    <span>{index + 1}</span>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
            <p className="roster-exception-progress-note">
              {activeRequest === 'IMPACT_ONLY'
                ? '影响分析只读取真实 shift plans、personnel assignments 和岗位 demand，不调用 solver_v4。'
                : '如果页面下方已有上一次 proposal，生成期间会先保留旧结果；新结果返回后会刷新覆盖率、人员变更和未覆盖岗位。'}
            </p>
          </div>
        )}
        {operationFeedback && (
          <div
            className={`roster-exception-feedback roster-exception-feedback-${operationFeedback.kind}`}
            role={operationFeedback.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="roster-exception-feedback-heading">
              <WxbTag color={feedbackTagColor(operationFeedback.kind)}>
                {feedbackLabel(operationFeedback.kind)}
              </WxbTag>
              <strong>{operationFeedback.title}</strong>
            </div>
            <p>{operationFeedback.description}</p>
            {operationFeedback.details && operationFeedback.details.length > 0 && (
              <ul>
                {operationFeedback.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <WxbAlert variant="error" title="操作失败">
            {error}
          </WxbAlert>
        )}
      </WxbPageSection>

      {!preview && (
        <WxbPageSection title="修复方案">
          <WxbEmpty description="选择不可用人员与时间窗后，点「生成修复方案」生成一份最小重排方案。" />
        </WxbPageSection>
      )}

      {preview && proposal && (!hasSolverProposal ? (
        <>
          <WxbPageGrid minItemWidth="170px" mode="auto-fit">
            <WxbKpiCard title="影响状态" value={proposalStatusLabel(proposal.status)} />
            <WxbKpiCard title="受影响人员分配" value={preview.summary.impactedAssignmentCount} />
            <WxbKpiCard title="受影响班次计划" value={preview.summary.impactedShiftPlanCount} />
            <WxbKpiCard title="释放岗位需求" value={preview.summary.vacancyCount} />
          </WxbPageGrid>

          <WxbPageSection title="影响分析" description="真实 shift plans，以及每条受影响人员分配释放出的岗位 demand。">
            <ShiftPlanCalendar shifts={preview.impactedShiftPlans} />
            <WxbDivider />
            <WxbDataTable
              rowKey="assignmentId"
              columns={impactedRoleColumns}
              dataSource={impactedRoleRows}
              pagination={false}
              density="compact"
              emptyState={{ description: '该时间窗内没有受影响 batch personnel assignments 或释放岗位 demand' }}
            />
          </WxbPageSection>

          <WxbAlert title="下一步">影响范围已显示。点「生成修复方案」调用 solver_v4 生成一份最小重排方案。</WxbAlert>
        </>
      ) : (
        <>
          {proposal.status === 'INFEASIBLE' ? (
            <WxbAlert variant="error" title="无法生成可行方案">
              求解器未能为本次不可用生成可行的修复方案；下方诊断可查看求解信息。
            </WxbAlert>
          ) : proposal.status === 'READY' ? (
            <p className="roster-exception-strategy">
              为覆盖 {affectedSlotCount} 个受影响岗位，本方案共调整 {changedCount} 处人员安排（直接顶替 {directChanges.length} · 连带调整 {knockOnChanges.length}），全部岗位已覆盖。
            </p>
          ) : (
            <WxbAlert variant="warning" title="修复方案总览">
              为覆盖 <strong>{affectedSlotCount}</strong> 个受影响岗位，本方案共调整 <strong>{changedCount}</strong> 处人员安排（直接顶替 {directChanges.length} · 连带调整 {knockOnChanges.length}），仍有 <strong>{uncoveredCount}</strong> 个岗位无法覆盖。
            </WxbAlert>
          )}

          {proposal.supervisorAttentionItems.length > 0 && (
            <div className="roster-exception-warning-list">
              {proposal.supervisorAttentionItems.map((item) => (
                <WxbAlert key={item} title="主管关注项">{item}</WxbAlert>
              ))}
            </div>
          )}

          <WxbPageSection title={`直接顶替 (${directChanges.length})`} description="不可用人员原本占的岗位，被替补回填。">
            <WxbDataTable
              rowKey="changeId"
              columns={changeColumns}
              dataSource={directChanges}
              pagination={{ pageSize: 8 }}
              density="compact"
              emptyState={{ description: '没有可直接顶替的变更（这些岗位可能落入下方“无法覆盖”）' }}
            />
          </WxbPageSection>

          <WxbPageSection
            title={`连带调整 (${knockOnChanges.length})`}
            description="这些人未被标记不可用，是为了腾出岗位、保住覆盖而被连带调动。"
          >
            <WxbDataTable
              rowKey="changeId"
              columns={changeColumns}
              dataSource={knockOnChanges}
              pagination={{ pageSize: 8 }}
              density="compact"
              emptyState={{ description: '无连带调整，其他人保持原样' }}
            />
          </WxbPageSection>

          <WxbPageSection
            title={`无法覆盖 (${uncoveredCount})`}
            description={uncoveredCount > 0 ? '当天可用人手不足，这些岗位需另行报增援。' : undefined}
          >
            {uncoveredCount > 0 ? (
              <div className="roster-exception-uncovered-chips">
                {proposal.uncoveredVacancies.map((vacancy) => (
                  <WxbTag key={vacancy.vacancyId} color="red">
                    {vacancy.batchCode} / {vacancy.operationName} #{vacancy.positionNumber}
                  </WxbTag>
                ))}
              </div>
            ) : (
              <WxbEmpty description="全部受影响岗位均已覆盖" />
            )}
          </WxbPageSection>

          {applySummary && (
            <WxbPageSection title="应用结果">
              <div className="roster-exception-applied-summary">
                <WxbKpiCard title="已应用" value={applySummary.appliedCount} />
                <WxbKpiCard title="已跳过" value={applySummary.skippedCount} />
                <WxbKpiCard title="写入字段" value={applySummary.writeBoundary.wrote.join(', ')} />
              </div>
              {applySummary.appliedChanges.length > 0 && (
                <ul className="roster-exception-receipt-list">
                  {applySummary.appliedChanges.map((applied) => {
                    const change = allChanges.find((item) => item.changeId === applied.changeId);
                    return (
                      <li key={applied.changeId}>
                        {change
                          ? `${change.batchCode}/${change.operationName} #${change.positionNumber}：${change.originalEmployeeName} → ${change.proposedEmployeeName}`
                          : `分配 ${applied.assignmentId}：员工 ${applied.before.employeeId ?? '-'} → ${applied.after.employeeId ?? '-'}`}
                      </li>
                    );
                  })}
                </ul>
              )}
              {applySummary.skippedChanges.length > 0 && (
                <WxbAlert variant="warning" title={`${applySummary.skippedChanges.length} 处被跳过`}>
                  {applySummary.skippedChanges.map((skipped) => {
                    const change = allChanges.find((item) => item.changeId === skipped.changeId);
                    return (
                      <div key={skipped.changeId}>
                        {change ? `${change.originalEmployeeName} → ${change.proposedEmployeeName}` : skipped.changeId}：{skipped.reason}
                      </div>
                    );
                  })}
                </WxbAlert>
              )}
              <WxbAlert title="写入边界">
                应用只更新受影响 batch_personnel_assignments 的 employee_id / shift_plan_id；未写入 batch_operation_plans、scheduling_results、employee_shift_plans 或 database schema。
              </WxbAlert>
            </WxbPageSection>
          )}

          <WxbCollapse
            className="roster-exception-diagnostic"
            items={[{
              key: 'diagnostic',
              label: '影响详情与求解诊断',
              children: (
                <>
                  <div className="roster-exception-impact-grid">
                    <WxbKpiCard title="受影响班次计划" value={preview.summary.impactedShiftPlanCount} />
                    <WxbKpiCard title="受影响人员分配" value={preview.summary.impactedAssignmentCount} />
                    <WxbKpiCard title="释放岗位需求" value={preview.summary.vacancyCount} />
                    <WxbKpiCard title="是否影响锁定分配" value={preview.impactedAssignments.some((item) => item.isLocked) ? '是' : '否'} />
                  </div>
                  <ShiftPlanCalendar shifts={preview.impactedShiftPlans} />
                  <div className="roster-exception-proposal-bar">
                    {proposalStatusTag(proposal.status)}
                    <WxbTag color={proposal.solverInvocation.called ? 'green' : 'amber'}>
                      {proposal.solverInvocation.called ? '已调用 solver_v4' : '未调用 solver_v4'}
                    </WxbTag>
                    <WxbTag color="blue">{repairModeLabel(proposal.repairMode)}</WxbTag>
                    <WxbTag color="green">同 Team 边界</WxbTag>
                    <WxbTag color="neutral">solver 状态 {proposal.solverStatus ?? '-'}</WxbTag>
                  </div>
                  <p className="roster-exception-strategy">{proposal.localRepairStrategy} · request {proposal.solverRequestId ?? '-'}</p>
                  {proposal.capabilityGaps.map((gap) => (
                    <WxbAlert key={gap.code} title={`solver 能力边界 · ${gap.code}`}>{gap.message}</WxbAlert>
                  ))}
                  {preview.warnings.map((warning) => (
                    <WxbAlert key={warning} title={warning}>{warningLabel(warning)}</WxbAlert>
                  ))}
                </>
              ),
            }]}
          />

          <div className="roster-exception-applybar">
            <span className="roster-exception-applybar-note">
              {canApply
                ? `整套应用 ${changedCount} 处变更（可应用 ${applyableChangeCount}${applyableChangeCount < changedCount ? ` · 跳过 ${changedCount - applyableChangeCount}` : ''}）`
                : applyDisabledReason}
            </span>
            <WxbButton
              type="button"
              variant="primary"
              onClick={() => setApplyConfirmOpen(true)}
              disabled={!canApply}
            >
              {canApply ? `整套应用 · ${changedCount} 处` : '整套应用'}
            </WxbButton>
          </div>
        </>
      ))}

      <WxbModal
        open={applyConfirmOpen}
        title="确认应用完整修复方案"
        okText="确认应用"
        cancelText="返回检查"
        confirmLoading={applyLoading}
        onOk={handleApplyConfirmed}
        onCancel={() => setApplyConfirmOpen(false)}
      >
        <div className="roster-exception-confirm">
          <p>将整套应用本方案，共 {changedCount} 处变更（直接顶替 {directChanges.length} · 连带调整 {knockOnChanges.length}）。这是一份互相咬合的方案，只能整套应用，不能单独勾选某一条（否则会有人被排到两个岗）。</p>
          {applyableChangeCount < changedCount && (
            <p>其中 {changedCount - applyableChangeCount} 处因跨部门或排班失效被阻止，应用时将自动跳过，不影响其余变更。</p>
          )}
          {uncoveredCount > 0 && (
            <p>仍有 {uncoveredCount} 个岗位无人可补，需另行报增援。</p>
          )}
          <p>本操作只更新受影响 batch_personnel_assignments 的 employee_id / shift_plan_id，且 apply 前会再次校验同部门边界；不修改 operation 时间、生产计划或 scheduling_results。</p>
        </div>
      </WxbModal>
    </WxbPageShell>
  );
};

export default RosterExceptionRepair;
