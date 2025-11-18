import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Card,
  Space,
  Select,
  DatePicker,
  Table,
  Spin,
  Empty,
  Button,
  Tooltip,
  Drawer,
  Descriptions,
  Tag,
  Badge,
  Divider,
  message,
  AutoComplete,
  Input,
  Checkbox,
  Segmented,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import './ScheduleCalendar.css';

dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text } = Typography;
const API_BASE_URL = 'http://localhost:3001/api';

interface ShiftPlan {
  plan_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  primary_role_id?: number | null;
  primary_role_name?: string | null;
  primary_role_code?: string | null;
  employee_org_role?: string | null;
  plan_date: string;
  plan_category: 'BASE' | 'REST' | 'PRODUCTION' | 'OVERTIME';
  plan_state: string;
  plan_hours?: number;
  overtime_hours?: number;
  is_generated: boolean;
  shift_code?: string | null;
  shift_name?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  shift_nominal_hours?: number | null;
  shift_is_cross_day?: boolean | null;
  is_locked?: number | null;
  lock_reason?: string | null;
  locked_at?: string | null;
  locked_by?: number | null;
  operation_plan_id?: number | null;
  operation_start?: string | null;
  operation_end?: string | null;
  operation_required_people?: number | null;
  operation_code?: string | null;
  operation_name?: string | null;
  batch_plan_id?: number | null;
  batch_code?: string | null;
  batch_name?: string | null;
  stage_code?: string | null;
  stage_name?: string | null;
}

type ShiftPlanWithRelations = ShiftPlan & {
  relatedProduction?: ShiftPlan[];
  relatedOvertime?: ShiftPlan[];
};

type ViewType = 'week' | 'month' | 'custom';

interface DayColumn {
  date: string;
  dayLabel: string;
  weekday: string;
}

interface ShiftCell {
  key: string;
  content: React.ReactNode;
  status: string;
  plans: ShiftPlan[];
}

interface EmployeeWorkloadMetrics {
  employeeId: number;
  quarterHours: number;
  quarterShopHours: number;
  monthHours: number;
  monthShopHours: number;
  quarterStandardHours: number;
  monthStandardHours: number;
  quarterDeviation: number;
  monthDeviation: number;
  monthToleranceHours?: number;
}

const CATEGORY_ORDER: Array<ShiftPlan['plan_category']> = ['REST', 'BASE', 'PRODUCTION', 'OVERTIME'];

const ORG_ROLE_LABELS: Record<string, string> = {
  FRONTLINE: '一线人员',
  SHIFT_LEADER: 'Shift Leader',
  GROUP_LEADER: 'Group Leader',
  TEAM_LEADER: 'Team Leader',
  DEPT_MANAGER: 'Dept Manager',
};

const ORG_ROLE_CLASS_MAP: Record<string, string> = {
  FRONTLINE: 'role-frontline',
  SHIFT_LEADER: 'role-shift-leader',
  GROUP_LEADER: 'role-group-leader',
  TEAM_LEADER: 'role-team-leader',
  DEPT_MANAGER: 'role-dept-manager',
};

const SHIFT_CATEGORY_COLORS: Record<ShiftPlan['plan_category'], { background: string; border: string }> = {
  REST: { background: '#f5f5f5', border: '#d9d9d9' },
  BASE: { background: '#e6f4ff', border: '#91caff' },
  PRODUCTION: { background: '#fff7e6', border: '#ffd591' },
  OVERTIME: { background: '#fff1f0', border: '#ffccc7' },
};

const LEGEND_ITEMS: Array<{ key: ShiftPlan['plan_category']; label: string; color: string }> = [
  { key: 'BASE', label: '基础班次', color: '#1890ff' },
  { key: 'PRODUCTION', label: '生产任务', color: '#fa8c16' },
  { key: 'OVERTIME', label: '加班', color: '#f5222d' },
  { key: 'REST', label: '休息', color: '#8c8c8c' },
];

const FRONTLINE_ROLES = new Set(['FRONTLINE']);
const LEADER_ROLES = new Set(['SHIFT_LEADER', 'GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER']);
const MONTH_TOLERANCE_HOURS = Number(process.env.REACT_APP_MONTH_TOLERANCE_HOURS ?? 8);

interface DaySummary {
  date: string;
  isHoliday: boolean;
  holidayLabel?: string | null;
  isTripleSalary: boolean;
  salaryMultiplier: number;
  operationCount: number;
  totalOperationHours: number;
  attendanceFrontline: number;
  attendanceLeaders: number;
  operationEmployees: number;
  attendanceTotal: number;
  operationRatio: number;
}

interface SearchOptionItem {
  type: 'employee' | 'operation';
  employeeId: number;
  date?: string;
  label: string;
}

const parseHourFromTime = (time?: string | null): number | null => {
  if (!time) {
    return null;
  }
  const normalized = time.slice(-5);
  const [hourStr] = normalized.split(':');
  const hour = Number(hourStr);
  return Number.isFinite(hour) ? hour : null;
};

const isNightShiftPlan = (plan: ShiftPlan): boolean => {
  const code = (plan.shift_code ?? '').toUpperCase();
  if (code.includes('NIGHT')) {
    return true;
  }
  if (plan.shift_is_cross_day) {
    return true;
  }
  const shiftHour = parseHourFromTime(plan.shift_start_time);
  if (shiftHour !== null && (shiftHour >= 20 || shiftHour < 6)) {
    return true;
  }
  if (plan.operation_start) {
    const operationHour = dayjs(plan.operation_start).hour();
    if (operationHour >= 20 || operationHour < 6) {
      return true;
    }
  }
  return false;
};

const getDayColumns = (start: Dayjs, end: Dayjs): DayColumn[] => {
  const days: DayColumn[] = [];
  let cursor = start.startOf('day');
  while (cursor.isSameOrBefore(end, 'day')) {
    days.push({
      date: cursor.format('YYYY-MM-DD'),
      dayLabel: cursor.format('MM-DD'),
      weekday: cursor.format('ddd'),
    });
    cursor = cursor.add(1, 'day');
  }
  return days;
};

const buildEmployeeData = (
  shiftPlans: ShiftPlan[],
  days: DayColumn[],
  renderChip: (plan: ShiftPlanWithRelations) => React.ReactNode | null,
  filterPlan?: (plan: ShiftPlanWithRelations) => boolean,
  allEmployees: Array<{id: number, name: string, code: string, org_role?: string, primary_role_name?: string, primary_role_code?: string}> = [],
) => {
  const employeeMap = new Map<
    number,
    {
      employeeName: string;
      employeeCode: string;
      orgRole: string | null;
      primaryRoleName: string | null;
      primaryRoleCode: string | null;
      shifts: Record<string, ShiftPlan[]>;
    }
  >();

  // 如果有排班数据，从排班数据构建员工信息
  shiftPlans.forEach((plan) => {
    if (!employeeMap.has(plan.employee_id)) {
      const orgRole = ((plan.employee_org_role ?? '') as string).toUpperCase() || null;
      employeeMap.set(plan.employee_id, {
        employeeName: plan.employee_name,
        employeeCode: plan.employee_code,
        orgRole,
        primaryRoleName: plan.primary_role_name ?? null,
        primaryRoleCode: plan.primary_role_code ?? null,
        shifts: {},
      });
    }
    const employeeData = employeeMap.get(plan.employee_id)!;
    if (!employeeData.orgRole && plan.employee_org_role) {
      employeeData.orgRole = (plan.employee_org_role as string).toUpperCase();
    }
    if (!employeeData.primaryRoleName && plan.primary_role_name) {
      employeeData.primaryRoleName = plan.primary_role_name;
    }
    if (!employeeData.primaryRoleCode && plan.primary_role_code) {
      employeeData.primaryRoleCode = plan.primary_role_code;
    }
    if (!employeeData.shifts[plan.plan_date]) {
      employeeData.shifts[plan.plan_date] = [];
    }
    employeeData.shifts[plan.plan_date].push(plan);
  });

  // 如果没有排班数据但有员工列表，从员工列表创建空行
  if (shiftPlans.length === 0 && allEmployees.length > 0) {
    allEmployees.forEach((emp) => {
      if (!employeeMap.has(emp.id)) {
        const orgRole = ((emp.org_role ?? '') as string).toUpperCase() || null;
        employeeMap.set(emp.id, {
          employeeName: emp.name,
          employeeCode: emp.code,
          orgRole,
          primaryRoleName: emp.primary_role_name ?? null,
          primaryRoleCode: emp.primary_role_code ?? null,
          shifts: {},
        });
      }
    });
  }

  return Array.from(employeeMap.entries()).map(([employeeId, data]) => {
    const baseRow: Record<string, ShiftCell> = {};
    days.forEach((day) => {
      const plans = (data.shifts[day.date] || []).slice().sort((a, b) => {
        const orderA = CATEGORY_ORDER.indexOf(a.plan_category);
        const orderB = CATEGORY_ORDER.indexOf(b.plan_category);
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return (a.plan_id || 0) - (b.plan_id || 0);
      });

      const basePlan = plans.find((p) => p.plan_category === 'BASE') || null;
      const restPlans = plans.filter((p) => p.plan_category === 'REST');
      const productionPlans = plans.filter((p) => p.plan_category === 'PRODUCTION');
      const overtimePlans = plans.filter((p) => p.plan_category === 'OVERTIME');

      const displayPlans: ShiftPlanWithRelations[] = [];

      if (basePlan) {
        displayPlans.push({
          ...basePlan,
          relatedProduction: productionPlans,
          relatedOvertime: overtimePlans,
        });
      } else {
        if (productionPlans.length) {
          displayPlans.push(...productionPlans);
        }
        if (overtimePlans.length) {
          displayPlans.push(...overtimePlans);
        }
      }

      if (restPlans.length && !basePlan && !productionPlans.length && !overtimePlans.length) {
        displayPlans.push(...restPlans);
      } else if (restPlans.length && basePlan) {
        displayPlans.push(...restPlans);
      }

      const filteredPlans = filterPlan
        ? displayPlans.filter(filterPlan)
        : displayPlans;
      const renderedChips = filteredPlans
        .map((item) => renderChip(item))
        .filter((node): node is React.ReactNode => Boolean(node));

      const hasOvertime = filteredPlans.some((p) => p.plan_category === 'OVERTIME');
      const hasProduction = filteredPlans.some((p) => p.plan_category === 'PRODUCTION');
      const allRest = filteredPlans.length > 0 && filteredPlans.every((p) => p.plan_category === 'REST');

      baseRow[day.date] = {
        key: `${employeeId}-${day.date}`,
        content: renderedChips.length ? renderedChips : <div className="shift-empty">—</div>,
        status: hasOvertime
          ? 'overtime'
          : hasProduction
            ? 'production'
            : allRest
              ? 'rest'
              : renderedChips.length
                ? 'scheduled'
                : 'empty',
        plans: filteredPlans,
      };
    });

    return {
      key: employeeId,
      employeeId,
      employeeName: data.employeeName,
      employeeCode: data.employeeCode,
      employeeOrgRole: data.orgRole,
      employeePrimaryRoleName: data.primaryRoleName,
      employeePrimaryRoleCode: data.primaryRoleCode,
      cells: baseRow,
    };
  });
};

const stateToBadge = (state: string): 'default' | 'success' | 'processing' | 'warning' | 'error' => {
  const normalized = (state || '').toUpperCase();
  switch (normalized) {
    case 'COMPLETED':
    case 'LOCKED':
      return 'success';
    case 'CONFIRMED':
    case 'PLANNED':
      return 'processing';
    case 'VOID':
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
};

const PersonnelCalendar: React.FC = () => {
  const [viewType, setViewType] = useState<ViewType>('month');
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [customDateRange, setCustomDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().startOf('isoWeek'),
    dayjs().startOf('isoWeek').add(13, 'day'), // 默认显示两周
  ]);
  const [loading, setLoading] = useState(false);
  const [shiftPlans, setShiftPlans] = useState<ShiftPlan[]>([]);
  const [employeeMetrics, setEmployeeMetrics] = useState<Record<number, EmployeeWorkloadMetrics>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<number | undefined>();
  const [selectedPlan, setSelectedPlan] = useState<ShiftPlanWithRelations | null>(null);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [days, setDays] = useState<DayColumn[]>([]);
  const [autoCentered, setAutoCentered] = useState(false);
  const [lockShiftLoading, setLockShiftLoading] = useState(false);
  const [showNightOnly, setShowNightOnly] = useState(false);
  const [density, setDensity] = useState<'compact' | 'detailed'>('compact');
  const [showProductionDetails, setShowProductionDetails] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<number | null>(null);
  const [workdayMap, setWorkdayMap] = useState<Record<string, {
    isWorkday: boolean;
    holidayName?: string | null;
    isTripleSalary?: boolean;
    salaryMultiplier?: number;
  }>>({});
  const [gridWidth, setGridWidth] = useState<number>(0);
  const [allEmployees, setAllEmployees] = useState<Array<{id: number, name: string, code: string, org_role?: string, primary_role_name?: string, primary_role_code?: string}>>([]);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const startOfRange = useMemo(() => {
    if (viewType === 'week') {
      return currentDate.startOf('isoWeek');
    } else if (viewType === 'custom' && customDateRange[0]) {
      return customDateRange[0].startOf('day');
    } else {
      // 默认显示两周，而不是整个月
      return currentDate.startOf('isoWeek');
    }
  }, [viewType, currentDate, customDateRange]);

  const endOfRange = useMemo(() => {
    if (viewType === 'week') {
      return currentDate.endOf('isoWeek');
    } else if (viewType === 'custom' && customDateRange[1]) {
      return customDateRange[1].endOf('day');
    } else {
      // 默认显示两周，而不是整个月
      return currentDate.startOf('isoWeek').add(13, 'day').endOf('day');
    }
  }, [viewType, currentDate, customDateRange]);

  useEffect(() => {
    setDays(getDayColumns(startOfRange, endOfRange));
  }, [startOfRange, endOfRange]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGridWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setGridWidth(container.clientWidth || container.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [viewMode, density, viewType, days.length]);

  const employeeIds = useMemo(() => {
    const ids = Array.from(new Set(shiftPlans.map((plan) => plan.employee_id)));
    ids.sort((a, b) => a - b);
    return ids;
  }, [shiftPlans]);

  const searchOptions = useMemo(() => {
    const employeeMap = new Map<number, SearchOptionItem>();
    shiftPlans.forEach((plan) => {
      if (!employeeMap.has(plan.employee_id)) {
        employeeMap.set(plan.employee_id, {
          type: 'employee',
          employeeId: plan.employee_id,
          label: `${plan.employee_name} (${plan.employee_code})`,
        });
      }
    });

    const operationMap = new Map<number, SearchOptionItem>();
    shiftPlans.forEach((plan) => {
      if (plan.operation_plan_id && plan.operation_name) {
        const opId = Number(plan.operation_plan_id);
        if (!operationMap.has(opId)) {
          operationMap.set(opId, {
            type: 'operation',
            employeeId: plan.employee_id,
            date: plan.plan_date,
            label: `${plan.operation_name} · ${plan.plan_date}`,
          });
        }
      }
    });

    const options: Array<{ value: string; label: string; item: SearchOptionItem }> = [];
    Array.from(employeeMap.values()).forEach((item) => {
      options.push({ value: `employee-${item.employeeId}`, label: item.label, item });
    });
    Array.from(operationMap.entries()).forEach(([operationId, item]) => {
      options.push({ value: `operation-${operationId}`, label: item.label, item });
    });

    options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
    return options;
  }, [shiftPlans]);

  const handleSearchSelect = useCallback(
    (_value: string, option: any) => {
      const item = option?.item as SearchOptionItem | undefined;
      if (!item) {
        return;
      }
      setSearchValue('');
      setHighlightedEmployeeId(item.employeeId);
      if (item.date) {
        const nextDate = dayjs(item.date);
        if (nextDate.isValid()) {
          setCurrentDate(nextDate);
        }
      }
    },
    [setCurrentDate],
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      const lower = trimmed.toLowerCase();
      const matchedOption = searchOptions.find((option) => option.label.toLowerCase().includes(lower));
      if (matchedOption) {
        handleSearchSelect(matchedOption.value, matchedOption);
      } else {
        message.info('未找到匹配结果');
      }
    },
    [handleSearchSelect, searchOptions],
  );

  const formatHours = useCallback((value?: number) => {
    if (value === undefined || value === null) {
      return '--';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '--';
    }
    return Math.abs(numeric - Math.round(numeric)) < 0.05
      ? String(Math.round(numeric))
      : numeric.toFixed(1);
  }, []);

  const formatDiff = useCallback((value?: number) => {
    if (value === undefined || value === null) {
      return '--';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '--';
    }
    if (Math.abs(numeric) < 0.05) {
      return '0';
    }
    const formatted =
      Math.abs(numeric - Math.round(numeric)) < 0.05
        ? Math.round(numeric).toString()
        : numeric.toFixed(1);
    return numeric > 0 ? `+${formatted}` : formatted;
  }, []);

  const handlePlanClick = useCallback((plan: ShiftPlanWithRelations) => {
    setSelectedPlan(plan);
    setDetailDrawerVisible(true);
  }, []);

  const renderShiftChip = useCallback((plan: ShiftPlanWithRelations) => {
    if (showNightOnly && !isNightShiftPlan(plan)) {
      return null;
    }

    const displayName = plan.plan_category === 'REST'
      ? '休息'
      : plan.shift_name || plan.shift_code || '未定义班次';
    const timeRange = plan.plan_category === 'REST'
      ? '--'
      : plan.shift_start_time && plan.shift_end_time
        ? `${plan.shift_start_time} - ${plan.shift_end_time}`
        : plan.operation_start && plan.operation_end
          ? `${plan.operation_start.slice(11)} - ${plan.operation_end.slice(11)}`
          : plan.shift_nominal_hours
            ? `${plan.shift_nominal_hours}h`
            : '';
    const isLocked = plan.plan_state === 'LOCKED' || Number(plan.is_locked) === 1;

    const colors = SHIFT_CATEGORY_COLORS[plan.plan_category] || SHIFT_CATEGORY_COLORS.BASE;
    const showDetailed = density === 'detailed';
    const showProductionInfo = showDetailed && showProductionDetails;

    const operationLabel = plan.operation_name
      ? `${plan.stage_name ? `${plan.stage_name} · ` : ''}${plan.operation_name}`
      : null;

    const relatedProductions = plan.relatedProduction || [];
    const relatedOvertimes = plan.relatedOvertime || [];

    const hasTasks = showProductionInfo && plan.plan_category === 'BASE' && relatedProductions.length > 0;

    const tooltip = (
      <div>
        <div><strong>{displayName}</strong>（{plan.plan_category}）</div>
        {timeRange && timeRange !== '--' ? <div>班次时间：{timeRange}</div> : null}
        {plan.plan_hours ? <div>计划工时：{plan.plan_hours}h</div> : null}
        {plan.overtime_hours ? <div>加班：{plan.overtime_hours}h</div> : null}
        <div>状态：{plan.plan_state}{isLocked ? '（已锁定）' : ''}</div>
        {isLocked && (
          <div>
            {plan.lock_reason ? <div>锁定原因：{plan.lock_reason}</div> : null}
            {plan.locked_at ? <div>锁定时间：{plan.locked_at}</div> : null}
          </div>
        )}
        {plan.batch_code || operationLabel || relatedProductions.length ? (
          <>
            <Divider style={{ margin: '8px 0' }} />
            {plan.batch_code ? <div>批次：{plan.batch_code}{plan.batch_name ? `（${plan.batch_name}）` : ''}</div> : null}
            {operationLabel ? (
              <>
                <div>操作：{operationLabel}</div>
                {plan.operation_start || plan.operation_end ? (
                  <div>操作时间：{plan.operation_start || '--'} ~ {plan.operation_end || '--'}</div>
                ) : null}
              </>
            ) : null}
            {relatedProductions.map((prod) => (
              <div key={`prod-${prod.plan_id}`} style={{ marginTop: 4 }}>
                {prod.batch_code ? <div>批次：{prod.batch_code}{prod.batch_name ? `（${prod.batch_name}）` : ''}</div> : null}
                <div>操作：{prod.stage_name ? `${prod.stage_name} · ` : ''}{prod.operation_name || '生产任务'}</div>
                {prod.operation_start || prod.operation_end ? (
                  <div>时间：{prod.operation_start || '--'} ~ {prod.operation_end || '--'}</div>
                ) : null}
              </div>
            ))}
          </>
        ) : null}
        {relatedOvertimes.length ? (
          <div style={{ marginTop: 8 }}>
            <Divider style={{ margin: '8px 0' }} />
            <div>加班记录：{relatedOvertimes.reduce((total, item) => total + (item.plan_hours || 0), 0)}h</div>
          </div>
        ) : null}
      </div>
    );

    return (
      <Tooltip key={plan.plan_id} title={tooltip} placement="top">
        <div
          className={`shift-chip category-${plan.plan_category.toLowerCase()} status-${plan.plan_state.toLowerCase()} ${showDetailed ? 'density-detailed' : 'density-compact'}${hasTasks ? ' has-tasks' : ''}${isLocked ? ' is-locked' : ''}`}
          style={{ backgroundColor: colors.background, borderColor: colors.border }}
          onClick={() => handlePlanClick(plan)}
        >
          <div className="shift-chip-header">
            <span>{displayName}</span>
            {showProductionInfo && plan.plan_category === 'OVERTIME' ? <Tag color="volcano">加班</Tag> : null}
            {showProductionInfo && plan.plan_category === 'PRODUCTION' && plan.batch_code ? <Tag color="blue">{plan.batch_code}</Tag> : null}
            {hasTasks ? <Tag color="geekblue">任务 {relatedProductions.length}</Tag> : null}
            {isLocked && <Tag color="gold">锁定</Tag>}
          </div>
          <div className="shift-chip-time">{timeRange}</div>
          {showProductionInfo && operationLabel ? (
            <div className="shift-chip-operation">
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              <span>{operationLabel}</span>
            </div>
          ) : null}
          {showProductionInfo && plan.plan_category === 'BASE' && relatedProductions.length ? (
            <div className="shift-chip-task-list">
              {relatedProductions.map((prod) => (
                <div key={`task-${prod.plan_id}`} className="shift-chip-task">
                  <ThunderboltOutlined style={{ marginRight: 4 }} />
                  <span>{prod.stage_name ? `${prod.stage_name} · ` : ''}{prod.operation_name || '生产任务'}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Tooltip>
    );
  }, [density, handlePlanClick, showNightOnly, showProductionDetails]);

  const filterPlanForView = useCallback(
    (plan: ShiftPlanWithRelations) => {
      if (showNightOnly) {
        return isNightShiftPlan(plan);
      }
      return true;
    },
    [showNightOnly],
  );

  useEffect(() => {
    if (!employeeIds.length) {
      setEmployeeMetrics({});
      return;
    }

    const initialMetrics: Record<number, EmployeeWorkloadMetrics> = {};
    employeeIds.forEach((employeeId) => {
      initialMetrics[employeeId] = {
        employeeId,
        quarterHours: 0,
        quarterShopHours: 0,
        monthHours: 0,
        monthShopHours: 0,
        quarterStandardHours: 0,
        monthStandardHours: 0,
        quarterDeviation: 0,
        monthDeviation: 0,
      };
    });
    setEmployeeMetrics(initialMetrics);

    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/personnel-schedules/metrics`, {
          params: {
            reference_date: currentDate.format('YYYY-MM-DD'),
            employee_ids: employeeIds.join(','),
          },
        });
        if (cancelled) {
          return;
        }

        const metricsMap: Record<number, EmployeeWorkloadMetrics> = { ...initialMetrics };
        const payload = Array.isArray(response.data) ? response.data : [];

        payload.forEach((item: any) => {
          const employeeId = Number(item.employeeId);
          if (!Number.isFinite(employeeId) || !metricsMap[employeeId]) {
            return;
          }
          const quarterStandard = Number(item.quarterStandardHours ?? 0);
          const monthStandard = Number(item.monthStandardHours ?? 0);
          const quarterHours = Number(item.quarterHours ?? 0);
          const monthHours = Number(item.monthHours ?? 0);
          metricsMap[employeeId] = {
            employeeId,
            quarterHours,
            quarterShopHours: Number(item.quarterShopHours ?? 0),
            monthHours,
            monthShopHours: Number(item.monthShopHours ?? 0),
            quarterStandardHours: quarterStandard,
            monthStandardHours: monthStandard,
            quarterDeviation: quarterHours - quarterStandard,
            monthDeviation: monthHours - monthStandard,
            monthToleranceHours: MONTH_TOLERANCE_HOURS,
          };
        });

        setEmployeeMetrics(metricsMap);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load employee workload metrics:', error);
        }
      }
    };

    fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [employeeIds, currentDate]);

  const loadShiftPlans = useCallback(async () => {
    setLoading(true);
    try {
        const normalizePlans = (plans: any[]): ShiftPlan[] => plans.map((plan) => {
          const rawCategory = (plan.plan_category || 'BASE').toString().toUpperCase();
          const category = (['BASE', 'REST', 'PRODUCTION', 'OVERTIME'] as const).includes(rawCategory as any)
            ? (rawCategory as ShiftPlan['plan_category'])
            : 'BASE';

          return {
            plan_id: plan.plan_id,
            employee_id: plan.employee_id,
            employee_name: plan.employee_name,
            employee_code: plan.employee_code,
            primary_role_id: plan.primary_role_id !== undefined && plan.primary_role_id !== null ? Number(plan.primary_role_id) : null,
            primary_role_name: plan.primary_role_name ?? plan.primaryRoleName ?? null,
            primary_role_code: plan.primary_role_code ?? plan.primaryRoleCode ?? null,
            employee_org_role: plan.org_role ?? plan.employee_org_role ?? plan.employeeOrgRole ?? null,
            plan_date: dayjs(plan.plan_date).format('YYYY-MM-DD'),
            plan_category: category,
            plan_state: plan.plan_state || 'PLANNED',
            plan_hours: plan.plan_hours !== null && plan.plan_hours !== undefined ? Number(plan.plan_hours) : undefined,
            overtime_hours: plan.overtime_hours !== null && plan.overtime_hours !== undefined ? Number(plan.overtime_hours) : undefined,
            is_generated: Boolean(plan.is_generated),
            shift_code: plan.shift_code || null,
            shift_name: plan.shift_name || null,
            shift_start_time: plan.shift_start_time || null,
            shift_end_time: plan.shift_end_time || null,
            shift_nominal_hours: plan.shift_nominal_hours !== null && plan.shift_nominal_hours !== undefined ? Number(plan.shift_nominal_hours) : null,
            shift_is_cross_day: plan.shift_is_cross_day !== null && plan.shift_is_cross_day !== undefined ? Boolean(plan.shift_is_cross_day) : null,
            is_locked: plan.is_locked !== undefined && plan.is_locked !== null ? Number(plan.is_locked) : null,
            lock_reason: plan.lock_reason || null,
            locked_at: plan.locked_at ? dayjs(plan.locked_at).format('YYYY-MM-DD HH:mm:ss') : null,
            locked_by: plan.locked_by !== undefined && plan.locked_by !== null ? Number(plan.locked_by) : null,
            operation_plan_id: plan.operation_plan_id || null,
            operation_start: plan.operation_start ? dayjs(plan.operation_start).format('YYYY-MM-DD HH:mm') : null,
            operation_end: plan.operation_end ? dayjs(plan.operation_end).format('YYYY-MM-DD HH:mm') : null,
            operation_required_people: plan.operation_required_people !== null && plan.operation_required_people !== undefined ? Number(plan.operation_required_people) : null,
            operation_code: plan.operation_code || null,
            operation_name: plan.operation_name || null,
            batch_plan_id: plan.batch_plan_id || null,
            batch_code: plan.batch_code || null,
            batch_name: plan.batch_name || null,
            stage_code: plan.stage_code || null,
            stage_name: plan.stage_name || null,
          };
        });

        const params = {
          start_date: startOfRange.format('YYYY-MM-DD'),
          end_date: endOfRange.format('YYYY-MM-DD'),
          employee_id: selectedEmployee,
        };

        const [scheduleResponse, workdayResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/personnel-schedules/overview`, { params }),
          axios
            .get(`${API_BASE_URL}/calendar/workdays`, {
              params: {
                start_date: startOfRange.format('YYYY-MM-DD'),
                end_date: endOfRange.format('YYYY-MM-DD'),
              },
            })
            .catch((error) => {
              console.error('Error fetching workday information:', error);
              return { data: [] } as { data: any[] };
            }),
        ]);

        const responseData = Array.isArray(scheduleResponse.data) ? scheduleResponse.data : [];
        setShiftPlans(normalizePlans(responseData));

        const workdayRecords = Array.isArray(workdayResponse.data)
          ? workdayResponse.data
          : [];
        const workdayMapPayload: Record<string, {
          isWorkday: boolean;
          holidayName?: string | null;
          isTripleSalary?: boolean;
          salaryMultiplier?: number;
        }> = {};
        workdayRecords.forEach((item: any) => {
          const dateKey = dayjs(item.calendar_date).format('YYYY-MM-DD');
          workdayMapPayload[dateKey] = {
            isWorkday: Number(item.is_workday ?? 1) === 1,
            holidayName: item.holiday_name ?? null,
            isTripleSalary: Boolean(item.is_triple_salary),
            salaryMultiplier: Number(item.salary_multiplier || 0),
          };
        });
        setWorkdayMap(workdayMapPayload);
      } catch (error) {
        console.error('Error fetching personnel schedules:', error);
        message.error('获取排班数据失败');
        setWorkdayMap({});
      } finally {
        setLoading(false);
      }
  }, [autoCentered, endOfRange, selectedEmployee, startOfRange]);

  // 加载员工数据
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/employees`);
        const employeesData = Array.isArray(response.data) ? response.data : [];
        setAllEmployees(employeesData.map((emp: any) => ({
          id: emp.id,
          name: emp.name,
          code: emp.code,
          org_role: emp.org_role,
          primary_role_name: emp.primary_role_name,
          primary_role_code: emp.primary_role_code,
        })));
      } catch (error) {
        console.error('Error loading employees:', error);
      }
    };

    loadEmployees();
  }, []);

  useEffect(() => {
    loadShiftPlans();
  }, [loadShiftPlans]);

  const handleToggleShiftLock = useCallback(async () => {
    if (!selectedPlan) {
      return;
    }
    setLockShiftLoading(true);
    try {
      const planId = selectedPlan.plan_id;
      const isLocked =
        selectedPlan.plan_state === 'LOCKED' || Number(selectedPlan.is_locked) === 1;
      if (isLocked) {
        await axios.delete(`${API_BASE_URL}/scheduling/shift-plans/${planId}/lock`);
        message.success('已解锁班次');
      } else {
        await axios.post(`${API_BASE_URL}/scheduling/shift-plans/${planId}/lock`, {
          reason: '手动锁定',
        });
        message.success('班次已锁定');
      }
      await loadShiftPlans();
    } catch (error) {
      console.error('Failed to toggle shift lock', error);
      message.error('更新锁定状态失败');
    } finally {
      setLockShiftLoading(false);
    }
  }, [loadShiftPlans, selectedPlan]);

  useEffect(() => {
    if (!selectedPlan) {
      return;
    }
    const updated = shiftPlans.find((plan) => plan.plan_id === selectedPlan.plan_id);
    if (updated && updated !== selectedPlan) {
      setSelectedPlan(updated);
    } else if (!updated) {
      setSelectedPlan(null);
      setDetailDrawerVisible(false);
    }
  }, [selectedPlan, shiftPlans]);

  const employeeData = useMemo(
    () => buildEmployeeData(shiftPlans, days, renderShiftChip, filterPlanForView, allEmployees),
    [shiftPlans, days, renderShiftChip, filterPlanForView, allEmployees]
  );

  const daySummaries = useMemo(() => {
    const summaryMap: Record<string, DaySummary> = {};
    const operationsByDay = new Map<string, Map<number, { duration: number; required: number | null; employees: Set<number> }>>();
    const attendanceFrontline = new Map<string, Set<number>>();
    const attendanceLeaders = new Map<string, Set<number>>();
    const operationEmployeesPerDay = new Map<string, Set<number>>();

    const ensureSet = (map: Map<string, Set<number>>, key: string) => {
      let set = map.get(key);
      if (!set) {
        set = new Set<number>();
        map.set(key, set);
      }
      return set;
    };

    days.forEach((day) => {
      const workdayInfo = workdayMap[day.date];
      const isHoliday = workdayInfo
        ? !workdayInfo.isWorkday
        : [0, 6].includes(dayjs(day.date).day());
      const isTripleSalary = workdayInfo?.isTripleSalary ?? false;
      const salaryMultiplier = workdayInfo?.salaryMultiplier ?? 0;

      summaryMap[day.date] = {
        date: day.date,
        isHoliday,
        holidayLabel: isHoliday ? workdayInfo?.holidayName ?? '节假日' : undefined,
        isTripleSalary,
        salaryMultiplier,
        operationCount: 0,
        totalOperationHours: 0,
        attendanceFrontline: 0,
        attendanceLeaders: 0,
        operationEmployees: 0,
        attendanceTotal: 0,
        operationRatio: 0,
      };
    });

    const computeDurationHours = (plan: ShiftPlan): number => {
      if (plan.operation_start && plan.operation_end) {
        const start = dayjs(plan.operation_start);
        const end = dayjs(plan.operation_end);
        if (start.isValid() && end.isValid() && end.isAfter(start)) {
          return Number((end.diff(start, 'minute') / 60).toFixed(2));
        }
      }
      if (plan.plan_hours !== undefined && plan.plan_hours !== null) {
        return Number(plan.plan_hours);
      }
      if (plan.shift_nominal_hours !== undefined && plan.shift_nominal_hours !== null) {
        return Number(plan.shift_nominal_hours);
      }
      return 0;
    };

    shiftPlans.forEach((plan) => {
      const date = plan.plan_date;
      const summary = summaryMap[date];
      if (!summary) {
        return;
      }

      const upperRole = (plan.employee_org_role ?? '').toUpperCase();
      const isAttendance = plan.plan_category !== 'REST' && (plan.plan_hours ?? 0) >= 0;
      if (isAttendance) {
        if (FRONTLINE_ROLES.has(upperRole) || !LEADER_ROLES.has(upperRole)) {
          ensureSet(attendanceFrontline, date).add(plan.employee_id);
        } else {
          ensureSet(attendanceLeaders, date).add(plan.employee_id);
        }
      }

      if (plan.plan_category === 'PRODUCTION' || plan.plan_category === 'OVERTIME') {
        ensureSet(operationEmployeesPerDay, date).add(plan.employee_id);
        const dayOperations = operationsByDay.get(date) ?? new Map<number, { duration: number; required: number | null; employees: Set<number> }>();
        if (!operationsByDay.has(date)) {
          operationsByDay.set(date, dayOperations);
        }
        const operationKey = plan.operation_plan_id ? Number(plan.operation_plan_id) : Number(plan.plan_id);
        const entry = dayOperations.get(operationKey) ?? {
          duration: 0,
          required: plan.operation_required_people ?? null,
          employees: new Set<number>(),
        };
        entry.employees.add(plan.employee_id);
        if (!dayOperations.has(operationKey)) {
          dayOperations.set(operationKey, entry);
        }
        if (!entry.duration) {
          entry.duration = computeDurationHours(plan);
        }
        if (entry.required === null && plan.operation_required_people) {
          entry.required = plan.operation_required_people;
        }
      }
    });

    days.forEach((day) => {
      const summary = summaryMap[day.date];
      const frontlineSet = attendanceFrontline.get(day.date) ?? new Set<number>();
      const leaderSet = attendanceLeaders.get(day.date) ?? new Set<number>();
      summary.attendanceFrontline = frontlineSet.size;
      summary.attendanceLeaders = leaderSet.size;
      summary.attendanceTotal = summary.attendanceFrontline + summary.attendanceLeaders;

      const operationEmployeeSet = operationEmployeesPerDay.get(day.date) ?? new Set<number>();
      summary.operationEmployees = operationEmployeeSet.size;

      const operations = operationsByDay.get(day.date);
      if (operations) {
        operations.forEach((entry) => {
          summary.operationCount += 1;
          const participants = entry.required ?? entry.employees.size;
          if (entry.duration > 0) {
            summary.totalOperationHours += entry.duration * participants;
          }
        });
      }
      summary.totalOperationHours = Number(summary.totalOperationHours.toFixed(2));
      summary.operationRatio =
        summary.attendanceTotal > 0
          ? Number((summary.operationEmployees / summary.attendanceTotal).toFixed(2))
          : 0;
    });

    return summaryMap;
  }, [days, shiftPlans, workdayMap]);

  useEffect(() => {
    if (highlightedEmployeeId === null || !tableContainerRef.current) {
      return;
    }
    const row = tableContainerRef.current.querySelector(
      `tr[data-row-key="${highlightedEmployeeId}"]`,
    );
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedEmployeeId]);

  useEffect(() => {
    if (highlightedEmployeeId === null) {
      return;
    }
    const timer = window.setTimeout(() => setHighlightedEmployeeId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightedEmployeeId]);

  const columns = useMemo(() => {
    const availableWidth = gridWidth > 0 ? Math.max(gridWidth - 220, 400) : undefined;
    // 优化列宽计算：确保在合理范围内
    const compactWidth = density === 'compact' ? 90 : 150;
    const dynamicDayWidth = availableWidth && days.length > 0
      ? Math.max(compactWidth, Math.min(compactWidth, Math.floor(availableWidth / Math.max(days.length, 1))))
      : compactWidth;

    const baseColumns = [
      {
        title: '员工',
        dataIndex: 'employeeName',
        key: 'employeeName',
        fixed: 'left' as const,
        width: 200,
        render: (_: any, row: any) => {
          const metrics = employeeMetrics[row.employeeId] || {
            quarterHours: 0,
            quarterShopHours: 0,
            monthHours: 0,
            monthShopHours: 0,
            quarterStandardHours: 0,
            monthStandardHours: 0,
            quarterDeviation: 0,
            monthDeviation: 0,
          };
          const quarterDiffValue = metrics.quarterDeviation ?? 0;
          const monthDiffValue = metrics.monthDeviation ?? 0;
          const monthTolerance = metrics.monthToleranceHours ?? MONTH_TOLERANCE_HOURS;
          const quarterDeficit =
            metrics.quarterStandardHours > 0 &&
            (metrics.quarterHours ?? 0) + 0.01 < metrics.quarterStandardHours;
          const monthOver =
            metrics.monthStandardHours > 0 &&
            (metrics.monthHours ?? 0) >
              metrics.monthStandardHours + monthTolerance;
          const monthUnder =
            metrics.monthStandardHours > 0 &&
            (metrics.monthHours ?? 0) + monthTolerance <
              metrics.monthStandardHours;
          const diffClass = (value: number) =>
            value > 0.05 ? 'positive' : value < -0.05 ? 'negative' : 'neutral';
          const quarterDiffText = formatDiff(metrics.quarterDeviation);
          const monthDiffText = formatDiff(metrics.monthDeviation);
          const orgRole: string = (row.employeeOrgRole || '').toUpperCase();
          const roleClassName = ORG_ROLE_CLASS_MAP[orgRole] || 'role-default';
          const roleLabel =
            ORG_ROLE_LABELS[orgRole] ||
            row.employeePrimaryRoleName ||
            row.employeePrimaryRoleCode ||
            '未标注角色';
          const complianceTags: React.ReactNode[] = [];
          if (quarterDeficit) {
            complianceTags.push(
              <Tag color="red" key="quarter-deficit">
                季度工时不足
              </Tag>,
            );
          }
          if (monthOver) {
            complianceTags.push(
              <Tag color="volcano" key="month-over">
                月度超标
              </Tag>,
            );
          } else if (monthUnder) {
            complianceTags.push(
              <Tag color="orange" key="month-under">
                月度不足
              </Tag>,
            );
          }

          return (
            <div className={`employee-cell ${roleClassName}`}>
              <div className="employee-header">
                <div className="employee-info">
                  <div className="employee-name">{row.employeeName}</div>
                  <div className="employee-code">{row.employeeCode}</div>
                </div>
                <div className="employee-role-tag">{roleLabel}</div>
              </div>
              <div className="employee-metrics">
                <div className="employee-metrics-line">
                  <span className="employee-metrics-label">季度</span>
                  <span className="employee-metrics-value">{formatHours(metrics.quarterHours)}h</span>
                  <span className="employee-metrics-divider">/</span>
                  <span className="employee-metrics-note">车间 {formatHours(metrics.quarterShopHours)}h</span>
                </div>
                <div className="employee-metrics-sub">
                  <span className="employee-metrics-note">标准 {formatHours(metrics.quarterStandardHours)}h</span>
                  <span className="employee-metrics-divider">|</span>
                  <span className={`employee-metrics-diff ${diffClass(quarterDiffValue)}`}>
                    差 {quarterDiffText}{quarterDiffText === '--' ? '' : 'h'}
                  </span>
                </div>
                <div className="employee-metrics-line">
                  <span className="employee-metrics-label">月度</span>
                  <span className="employee-metrics-value">{formatHours(metrics.monthHours)}h</span>
                  <span className="employee-metrics-divider">/</span>
                  <span className="employee-metrics-note">车间 {formatHours(metrics.monthShopHours)}h</span>
                </div>
                <div className="employee-metrics-sub">
                  <span className="employee-metrics-note">标准 {formatHours(metrics.monthStandardHours)}h</span>
                  <span className="employee-metrics-divider">|</span>
                  <span className={`employee-metrics-diff ${diffClass(monthDiffValue)}`}>
                    差 {monthDiffText}{monthDiffText === '--' ? '' : 'h'}
                  </span>
                  <span className="employee-metrics-divider">|</span>
                  <span className="employee-metrics-note">容差 ±{monthTolerance}h</span>
                </div>
                {complianceTags.length ? (
                  <div className="employee-metrics-tags">{complianceTags}</div>
                ) : null}
              </div>
            </div>
          );
        },
      },
    ];

    const dayColumns = days.map((day) => {
      const summary = daySummaries[day.date];
      const ratioPercent = summary && summary.attendanceTotal > 0
        ? Math.round((summary.operationRatio ?? 0) * 100)
        : 0;

      return {
        title: (
          <div className={`day-header${summary?.isHoliday ? ' holiday' : ''}${summary?.isTripleSalary ? ' triple-salary' : ''}`}>
            <div className="day-header-top">
              <span className="day-header-date">{day.dayLabel}</span>
              {summary?.isHoliday ? (
                <Tag color="red">
                  {summary?.holidayLabel || '休'}
                </Tag>
              ) : null}
              {summary?.isTripleSalary && !summary?.isHoliday ? (
                <Tag color="gold">
                  💰{summary.salaryMultiplier}倍
                </Tag>
              ) : null}
              {summary?.isTripleSalary && summary?.isHoliday ? (
                <Tag color="orange" style={{ marginLeft: 4 }}>
                  💰{summary.salaryMultiplier}倍
                </Tag>
              ) : null}
            </div>
            <div className="day-header-week">{day.weekday}</div>
            {density === 'detailed' && (
              <div className="day-header-stats">
                <span className="stat-chip">操作 {summary?.operationCount ?? 0}</span>
                <span className="stat-chip">工时 {Number(summary?.totalOperationHours ?? 0).toFixed(1)}</span>
                <span className="stat-chip">一线 {summary?.attendanceFrontline ?? 0}</span>
                <span className="stat-chip">主管 {summary?.attendanceLeaders ?? 0}</span>
              </div>
            )}
          </div>
        ),
      dataIndex: day.date,
      key: day.date,
      width: dynamicDayWidth,
      render: (_: any, row: any) => {
        const cell: ShiftCell = row.cells[day.date];
        return (
          <div className={`shift-cell cell-${cell.status}`}>{cell.content}</div>
        );
      },
      };
    });

    return [...baseColumns, ...dayColumns];
  }, [daySummaries, days, density, employeeMetrics, formatDiff, formatHours, gridWidth]);

  const dataSource = useMemo(() => employeeData.map((employee) => ({
    key: employee.key,
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    employeeCode: employee.employeeCode,
    employeeOrgRole: employee.employeeOrgRole,
    employeePrimaryRoleName: employee.employeePrimaryRoleName,
    employeePrimaryRoleCode: employee.employeePrimaryRoleCode,
    cells: employee.cells,
    ...employee.cells,
  })), [employeeData]);

  const handleDateChange = (direction: 'prev' | 'next') => {
    if (viewType === 'week') {
      setCurrentDate(direction === 'prev' ? currentDate.subtract(1, 'week') : currentDate.add(1, 'week'));
    } else if (viewType === 'custom') {
      const daysDiff = customDateRange[1] && customDateRange[0] 
        ? customDateRange[1].diff(customDateRange[0], 'day') + 1
        : 14;
      if (direction === 'prev') {
        const newStart = customDateRange[0]?.subtract(daysDiff, 'day') || dayjs();
        setCustomDateRange([newStart, newStart.add(daysDiff - 1, 'day')]);
        setCurrentDate(newStart);
      } else {
        const newStart = customDateRange[0]?.add(daysDiff, 'day') || dayjs();
        setCustomDateRange([newStart, newStart.add(daysDiff - 1, 'day')]);
        setCurrentDate(newStart);
      }
    } else {
      // 默认两周视图，按两周移动
      const newDate = direction === 'prev' 
        ? currentDate.subtract(2, 'week')
        : currentDate.add(2, 'week');
      setCurrentDate(newDate);
    }
  };

  const handleViewTypeChange = (value: ViewType) => {
    setViewType(value);
    if (value === 'week') {
      setCurrentDate(dayjs());
    } else if (value === 'custom') {
      const today = dayjs();
      setCustomDateRange([today.startOf('isoWeek'), today.startOf('isoWeek').add(13, 'day')]);
    } else {
      setCurrentDate(dayjs().startOf('isoWeek'));
    }
  };

  const handleCustomDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setCustomDateRange(dates);
      setCurrentDate(dates[0]);
    }
  };

  const renderToolbar = () => (
    <div className="calendar-toolbar">
      <Space size="middle" wrap className="toolbar-row">
        <Segmented
          value={viewType}
          onChange={(value) => handleViewTypeChange(value as ViewType)}
          options={[
            { label: '周视图', value: 'week' },
            { label: '两周视图', value: 'month' },
            { label: '自定义范围', value: 'custom' },
          ]}
        />
        {viewType === 'custom' ? (
          <>
            <RangePicker
              value={customDateRange}
              onChange={handleCustomDateRangeChange}
              format="YYYY-MM-DD"
              style={{ width: 280 }}
            />
            <Button icon={<LeftOutlined />} onClick={() => handleDateChange('prev')} />
            <Button icon={<RightOutlined />} onClick={() => handleDateChange('next')} />
          </>
        ) : (
          <>
            <Button icon={<LeftOutlined />} onClick={() => handleDateChange('prev')} />
            <DatePicker
              picker={viewType === 'week' ? 'week' : 'month'}
              value={currentDate}
              onChange={(date) => date && setCurrentDate(date)}
            />
            <Button icon={<RightOutlined />} onClick={() => handleDateChange('next')} />
          </>
        )}
        <Button onClick={() => {
          const today = dayjs();
          if (viewType === 'custom') {
            setCustomDateRange([today.startOf('isoWeek'), today.startOf('isoWeek').add(13, 'day')]);
          }
          setCurrentDate(today);
        }}>今天</Button>
        <Select
          allowClear
          placeholder="筛选员工"
          style={{ width: 200 }}
          value={selectedEmployee}
          onChange={(value) => setSelectedEmployee(value)}
        >
          {(shiftPlans.length > 0
            ? Array.from(new Map(shiftPlans.map((plan) => [plan.employee_id, {
                id: plan.employee_id,
                name: plan.employee_name,
                code: plan.employee_code,
                org_role: plan.employee_org_role,
                primary_role_name: plan.primary_role_name,
                primary_role_code: plan.primary_role_code,
              }])).values())
            : allEmployees
          ).map((item) => (
            <Option key={item.id} value={item.id}>
              {item.name} ({item.code})
            </Option>
          ))}
        </Select>
        <AutoComplete
          className="calendar-search"
          value={searchValue}
          options={searchOptions}
          onChange={(value) => setSearchValue(value)}
          onSearch={(value) => setSearchValue(value)}
          onSelect={handleSearchSelect}
          filterOption={(inputValue, option) =>
            (option?.label as string)?.toLowerCase().includes(inputValue.toLowerCase()) ?? false
          }
        >
          <Input.Search
            allowClear
            placeholder="搜索员工 / 操作"
            onSearch={handleSearchSubmit}
            value={searchValue}
          />
        </AutoComplete>
      </Space>
      <Space size="middle" wrap className="toolbar-row">
        <Button
          type={showNightOnly ? 'primary' : 'default'}
          onClick={() => setShowNightOnly((prev) => !prev)}
        >
          {showNightOnly ? '显示全部班次' : '仅看夜班'}
        </Button>
        <Segmented
          value={density}
          onChange={(value) => setDensity(value as 'compact' | 'detailed')}
          options={[
            { label: '精简', value: 'compact' },
            { label: '详细', value: 'detailed' },
          ]}
        />
        <Checkbox
          checked={showProductionDetails}
          onChange={(event) => setShowProductionDetails(event.target.checked)}
        >
          显示生产详情
        </Checkbox>
        <Tooltip title="切换呈现模式">
          <Select value={viewMode} onChange={setViewMode} style={{ width: 120 }}>
            <Option value="grid">栅格视图</Option>
            <Option value="list">列表视图</Option>
          </Select>
        </Tooltip>
      </Space>
    </div>
  );

  const renderGrid = () => (
    <div ref={tableContainerRef} className={`schedule-grid-wrapper density-${density}`}>
      <Table
        className="schedule-grid"
        columns={columns as any}
        dataSource={dataSource}
        pagination={false}
        loading={false}
        scroll={{ 
          x: gridWidth > 0 && days.length > 0 
            ? Math.max(gridWidth - 220, Math.min(200 + days.length * (density === 'compact' ? 90 : 150), days.length * (density === 'compact' ? 90 : 150) + 220))
            : undefined, 
          y: 600 
        }}
        bordered
        rowClassName={(record: any) =>
          record.employeeId === highlightedEmployeeId ? 'row-highlight' : ''
        }
      />
    </div>
  );

  const renderDetailDrawer = () => (
    <Drawer
      title="班次详情"
      width={420}
      open={detailDrawerVisible}
      onClose={() => {
        setDetailDrawerVisible(false);
        setSelectedPlan(null);
      }}
    >
      {selectedPlan ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="员工">{selectedPlan.employee_name} ({selectedPlan.employee_code})</Descriptions.Item>
          <Descriptions.Item label="日期">{selectedPlan.plan_date}</Descriptions.Item>
          <Descriptions.Item label="类别">{selectedPlan.plan_category}</Descriptions.Item>
          <Descriptions.Item label="班次">
            {selectedPlan.plan_category === 'REST' ? '休息' : selectedPlan.shift_name || selectedPlan.shift_code || '未定义班次'}
          </Descriptions.Item>
          <Descriptions.Item label="班次时间">
            {selectedPlan.shift_start_time || '--'} ~ {selectedPlan.shift_end_time || '--'}
          </Descriptions.Item>
          <Descriptions.Item label="计划工时">{selectedPlan.plan_hours ?? selectedPlan.shift_nominal_hours ?? 0} h</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Badge status={stateToBadge(selectedPlan.plan_state)} text={selectedPlan.plan_state} />
          </Descriptions.Item>
          <Descriptions.Item label="是否自动生成">{selectedPlan.is_generated ? '是' : '否'}</Descriptions.Item>
          <Descriptions.Item label="加班小时">{selectedPlan.overtime_hours || 0} h</Descriptions.Item>
          {(selectedPlan.plan_state === 'LOCKED' || Number(selectedPlan.is_locked) === 1) && (
            <Descriptions.Item label="锁定信息">
              <Space direction="vertical" size={2}>
                <span>状态：已锁定</span>
                {selectedPlan.lock_reason ? <span>原因：{selectedPlan.lock_reason}</span> : null}
                {selectedPlan.locked_at ? <span>时间：{selectedPlan.locked_at}</span> : null}
              </Space>
            </Descriptions.Item>
          )}
          {selectedPlan.batch_code || selectedPlan.operation_name ? (
            <Descriptions.Item label="生产任务">
              <Space direction="vertical" size={4}>
                {selectedPlan.batch_code ? (
                  <span>批次：{selectedPlan.batch_code}{selectedPlan.batch_name ? `（${selectedPlan.batch_name}）` : ''}</span>
                ) : null}
                {selectedPlan.operation_name ? (
                  <span>操作：{selectedPlan.stage_name ? `${selectedPlan.stage_name} · ` : ''}{selectedPlan.operation_name}</span>
                ) : null}
                {selectedPlan.operation_start || selectedPlan.operation_end ? (
                  <span>操作时间：{selectedPlan.operation_start || '--'} ~ {selectedPlan.operation_end || '--'}</span>
                ) : null}
              </Space>
            </Descriptions.Item>
          ) : null}
          {selectedPlan.relatedProduction && selectedPlan.relatedProduction.length ? (
            <Descriptions.Item label="任务列表">
              <Space direction="vertical" size={4}>
                {selectedPlan.relatedProduction.map((prod) => (
                  <div key={`drawer-task-${prod.plan_id}`}>
                    {prod.batch_code ? <div>批次：{prod.batch_code}{prod.batch_name ? `（${prod.batch_name}）` : ''}</div> : null}
                    <div>操作：{prod.stage_name ? `${prod.stage_name} · ` : ''}{prod.operation_name || '生产任务'}</div>
                    {prod.operation_start || prod.operation_end ? (
                      <div>时间：{prod.operation_start || '--'} ~ {prod.operation_end || '--'}</div>
                    ) : null}
                  </div>
                ))}
              </Space>
            </Descriptions.Item>
          ) : null}
          {selectedPlan.relatedOvertime && selectedPlan.relatedOvertime.length ? (
            <Descriptions.Item label="加班明细">
              <Space direction="vertical" size={4}>
                {selectedPlan.relatedOvertime.map((ot) => (
                  <div key={`drawer-ot-${ot.plan_id}`}>
                    <span>加班：{ot.plan_hours || 0}h</span>
                    {ot.operation_start || ot.operation_end ? (
                      <span> （{ot.operation_start || '--'} ~ {ot.operation_end || '--'}）</span>
                    ) : null}
                  </div>
                ))}
              </Space>
            </Descriptions.Item>
          ) : null}
        </Descriptions>
          <Divider style={{ margin: 0 }} />
          <Space>
            <Button
              type={selectedPlan.plan_state === 'LOCKED' || Number(selectedPlan.is_locked) === 1 ? 'default' : 'primary'}
              onClick={handleToggleShiftLock}
              loading={lockShiftLoading}
            >
              {selectedPlan.plan_state === 'LOCKED' || Number(selectedPlan.is_locked) === 1 ? '解锁班次' : '锁定班次'}
            </Button>
          </Space>
        </Space>
      ) : (
        <Empty description="请选择班次" />
      )}
    </Drawer>
  );

  return (
    <div className="personnel-calendar">
      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>人员排班日历</span>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div className="calendar-principles-alert">
          <Alert
            type="info"
            showIcon
            message="排班原则提示"
            description={`季度工时需达到标准值，月度工时默认允许上下浮动 ±${MONTH_TOLERANCE_HOURS} 小时；夜班后优先安排连续两天休息。更多细则见 docs/scheduling_principles.md。`}
          />
        </div>
        <div className="calendar-toolbar-container">{renderToolbar()}</div>
        <div className="calendar-legend">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.key} className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <Spin spinning={loading}>
          {(shiftPlans.length === 0 && allEmployees.length === 0) ? (
            <div className="schedule-empty">
              <Empty description="正在加载数据..." />
            </div>
          ) : (
            <div className={`schedule-view ${viewMode}`}>
              {viewMode === 'grid' ? renderGrid() : <div className="schedule-list">列表视图开发中</div>}
            </div>
          )}
        </Spin>
      </Card>

      {renderDetailDrawer()}
    </div>
  );
};

export default PersonnelCalendar;
