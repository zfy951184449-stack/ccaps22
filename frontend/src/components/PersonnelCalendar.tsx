import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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

const { Option } = Select;
const API_BASE_URL = 'http://localhost:3001/api';

interface ShiftPlan {
  plan_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
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

type ViewType = 'week' | 'month';

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

const CATEGORY_ORDER: Array<ShiftPlan['plan_category']> = ['REST', 'BASE', 'PRODUCTION', 'OVERTIME'];

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
  renderChip: (plan: ShiftPlanWithRelations) => React.ReactNode
) => {
  const employeeMap = new Map<number, { employeeName: string; employeeCode: string; shifts: Record<string, ShiftPlan[]> }>();

  shiftPlans.forEach((plan) => {
    if (!employeeMap.has(plan.employee_id)) {
      employeeMap.set(plan.employee_id, {
        employeeName: plan.employee_name,
        employeeCode: plan.employee_code,
        shifts: {},
      });
    }
    const employeeData = employeeMap.get(plan.employee_id)!;
    if (!employeeData.shifts[plan.plan_date]) {
      employeeData.shifts[plan.plan_date] = [];
    }
    employeeData.shifts[plan.plan_date].push(plan);
  });

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

      const hasOvertime = overtimePlans.length > 0;
      const hasProduction = productionPlans.length > 0;
      const allRest = plans.length > 0 && plans.every((p) => p.plan_category === 'REST');

      baseRow[day.date] = {
        key: `${employeeId}-${day.date}`,
        content: displayPlans.length ? displayPlans.map((item) => renderChip(item)) : <div className="shift-empty">—</div>,
        status: hasOvertime
          ? 'overtime'
          : hasProduction
            ? 'production'
            : allRest
              ? 'rest'
              : displayPlans.length
                ? 'scheduled'
                : 'empty',
        plans,
      };
    });

    return {
      key: employeeId,
      employeeId,
      employeeName: data.employeeName,
      employeeCode: data.employeeCode,
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
  const [viewType, setViewType] = useState<ViewType>('week');
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [shiftPlans, setShiftPlans] = useState<ShiftPlan[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | undefined>();
  const [selectedPlan, setSelectedPlan] = useState<ShiftPlanWithRelations | null>(null);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [days, setDays] = useState<DayColumn[]>([]);
  const [autoCentered, setAutoCentered] = useState(false);
  const [lockShiftLoading, setLockShiftLoading] = useState(false);

  const startOfRange = useMemo(() => (
    viewType === 'week'
      ? currentDate.startOf('isoWeek')
      : currentDate.startOf('month')
  ), [viewType, currentDate]);

  const endOfRange = useMemo(() => (
    viewType === 'week'
      ? currentDate.endOf('isoWeek')
      : currentDate.endOf('month')
  ), [viewType, currentDate]);

  useEffect(() => {
    setDays(getDayColumns(startOfRange, endOfRange));
  }, [startOfRange, endOfRange]);

  const handlePlanClick = useCallback((plan: ShiftPlanWithRelations) => {
    setSelectedPlan(plan);
    setDetailDrawerVisible(true);
  }, []);

  const renderShiftChip = useCallback((plan: ShiftPlanWithRelations) => {
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

    const operationLabel = plan.operation_name
      ? `${plan.stage_name ? `${plan.stage_name} · ` : ''}${plan.operation_name}`
      : null;

    const relatedProductions = plan.relatedProduction || [];
    const relatedOvertimes = plan.relatedOvertime || [];

    const hasTasks = plan.plan_category === 'BASE' && relatedProductions.length > 0;

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
          className={`shift-chip category-${plan.plan_category.toLowerCase()} status-${plan.plan_state.toLowerCase()}${hasTasks ? ' has-tasks' : ''}${isLocked ? ' is-locked' : ''}`}
          onClick={() => handlePlanClick(plan)}
        >
          <div className="shift-chip-header">
            <span>{displayName}</span>
            {plan.plan_category === 'OVERTIME' ? <Tag color="volcano">加班</Tag> : null}
            {plan.plan_category === 'PRODUCTION' && plan.batch_code ? <Tag color="blue">{plan.batch_code}</Tag> : null}
            {plan.plan_category === 'BASE' && relatedProductions.length ? <Tag color="geekblue">任务 {relatedProductions.length}</Tag> : null}
            {isLocked && <Tag color="gold">锁定</Tag>}
          </div>
          <div className="shift-chip-time">{timeRange}</div>
          {operationLabel ? (
            <div className="shift-chip-operation">
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              <span>{operationLabel}</span>
            </div>
          ) : null}
          {plan.plan_category === 'BASE' && relatedProductions.length ? (
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
  }, [handlePlanClick]);

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

        let responseData: any[] | null = null;
        try {
          const primaryResponse = await axios.get(`${API_BASE_URL}/personnel-schedules/overview`, {
            params,
          });
          responseData = primaryResponse.data;
        } catch (error: any) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            const legacyResponse = await axios.get(`${API_BASE_URL}/personnel-schedules`, {
              params,
            });
            responseData = legacyResponse.data.map((item: any) => ({
              plan_id: item.id || item.plan_id || 0,
              employee_id: item.employee_id,
              employee_name: item.employee_name,
              employee_code: item.employee_code,
              plan_date: item.schedule_date,
              plan_category: item.is_overtime ? 'OVERTIME' : 'PRODUCTION',
              plan_state: item.status || 'SCHEDULED',
              plan_hours: item.work_hours !== undefined && item.work_hours !== null ? Number(item.work_hours) : undefined,
              overtime_hours: item.overtime_hours !== undefined && item.overtime_hours !== null ? Number(item.overtime_hours) : undefined,
              is_generated: false,
              shift_code: null,
              shift_name: item.shift_name || null,
              shift_start_time: item.start_time || null,
              shift_end_time: item.end_time || null,
              shift_nominal_hours: item.work_hours !== undefined && item.work_hours !== null ? Number(item.work_hours) : null,
              shift_is_cross_day: null,
              operation_plan_id: null,
              operation_start: null,
              operation_end: null,
              operation_required_people: null,
              operation_code: null,
              operation_name: null,
              batch_plan_id: null,
              batch_code: null,
              batch_name: null,
              stage_code: null,
              stage_name: null,
            }));
          } else {
            throw error;
          }
        }

        let plans = normalizePlans(responseData || []);

        if (!plans.length && !autoCentered && !selectedEmployee) {
          const fallbackStart = dayjs().subtract(6, 'month');
          const fallbackEnd = dayjs().add(12, 'month');
          const fallbackResponse = await axios.get(`${API_BASE_URL}/personnel-schedules/overview`, {
            params: {
              start_date: fallbackStart.format('YYYY-MM-DD'),
              end_date: fallbackEnd.format('YYYY-MM-DD'),
            },
          });
          const fallbackPlans = normalizePlans(fallbackResponse.data);
          if (fallbackPlans.length) {
            setCurrentDate(dayjs(fallbackPlans[0].plan_date));
            setAutoCentered(true);
            plans = fallbackPlans;
          }
        }

        setShiftPlans(plans);
      } catch (error) {
        console.error('Error fetching personnel schedules:', error);
        message.error('获取排班数据失败');
      } finally {
        setLoading(false);
      }
  }, [autoCentered, endOfRange, selectedEmployee, startOfRange]);

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
    () => buildEmployeeData(shiftPlans, days, renderShiftChip),
    [shiftPlans, days, renderShiftChip]
  );

  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: '员工',
        dataIndex: 'employeeName',
        key: 'employeeName',
        fixed: 'left' as const,
        width: 200,
        render: (_: any, row: any) => (
          <div className="employee-cell">
            <div className="employee-name">{row.employeeName}</div>
            <div className="employee-code">{row.employeeCode}</div>
          </div>
        ),
      },
    ];

    const dayColumns = days.map((day) => ({
      title: (
        <div className="day-header">
          <div>{day.dayLabel}</div>
          <div>{day.weekday}</div>
        </div>
      ),
      dataIndex: day.date,
      key: day.date,
      width: 180,
      render: (_: any, row: any) => {
        const cell: ShiftCell = row.cells[day.date];
        return (
          <div className={`shift-cell cell-${cell.status}`}>{cell.content}</div>
        );
      },
    }));

    return [...baseColumns, ...dayColumns];
  }, [days]);

  const dataSource = useMemo(() => employeeData.map((employee) => ({
    key: employee.key,
    employeeName: employee.employeeName,
    employeeCode: employee.employeeCode,
    cells: employee.cells,
    ...employee.cells,
  })), [employeeData]);

  const handleDateChange = (direction: 'prev' | 'next') => {
    if (viewType === 'week') {
      setCurrentDate(direction === 'prev' ? currentDate.subtract(1, 'week') : currentDate.add(1, 'week'));
    } else {
      setCurrentDate(direction === 'prev' ? currentDate.subtract(1, 'month') : currentDate.add(1, 'month'));
    }
  };

  const handleViewTypeChange = (value: ViewType) => {
    setViewType(value);
    if (value === 'week') {
      setCurrentDate(dayjs());
    } else {
      setCurrentDate(dayjs().startOf('month'));
    }
  };

  const renderToolbar = () => (
    <Space size="middle">
      <Select value={viewType} onChange={handleViewTypeChange} style={{ width: 120 }}>
        <Option value="week">周视图</Option>
        <Option value="month">月视图</Option>
      </Select>
      <Select
        allowClear
        placeholder="筛选员工"
        style={{ width: 200 }}
        value={selectedEmployee}
        onChange={(value) => setSelectedEmployee(value)}
      >
        {Array.from(new Map(shiftPlans.map((plan) => [plan.employee_id, plan])).values()).map((plan) => (
          <Option key={plan.employee_id} value={plan.employee_id}>
            {plan.employee_name} ({plan.employee_code})
          </Option>
        ))}
      </Select>
      <Button icon={<LeftOutlined />} onClick={() => handleDateChange('prev')} />
      <DatePicker
        picker={viewType === 'week' ? 'week' : 'month'}
        value={currentDate}
        onChange={(date) => date && setCurrentDate(date)}
      />
      <Button icon={<RightOutlined />} onClick={() => handleDateChange('next')} />
      <Button onClick={() => setCurrentDate(dayjs())}>今天</Button>
      <Divider type="vertical" />
      <Tooltip title="切换视图模式">
        <Select value={viewMode} onChange={setViewMode} style={{ width: 120 }}>
          <Option value="grid">栅格视图</Option>
          <Option value="list">列表视图</Option>
        </Select>
      </Tooltip>
    </Space>
  );

  const renderGrid = () => (
    <Table
      className="schedule-grid"
      columns={columns as any}
      dataSource={dataSource}
      pagination={false}
      loading={loading}
      scroll={{ x: 'max-content', y: 600 }}
      bordered
    />
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
        extra={renderToolbar()}
        styles={{ body: { padding: 0 } }}
      >
        <Spin spinning={loading}>
          {shiftPlans.length === 0 ? (
            <div className="schedule-empty">
              <Empty description="所选范围内没有排班数据" />
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
