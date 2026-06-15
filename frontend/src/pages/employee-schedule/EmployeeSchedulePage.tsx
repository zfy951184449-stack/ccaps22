/**
 * EmployeeSchedulePage —— 排班日历（/my-schedule）。
 *
 * 当前系统无人员账户、不强制登录，故本页改为「人员选择」模式：选择一个或多个员工，
 * 查看其班次日历、每天参与的任务，以及同任务的同伴（含未被选中的人，名单完整）。
 * 数据走 personnelScheduleApi（/api/personnel-schedules/*，影子模式匿名可访问），
 * 不再依赖登录身份的 /api/me/*。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  WxbPageShell,
  WxbPageHeader,
  WxbButton,
  WxbDataTable,
  WxbBadge,
  WxbSpinner,
  WxbEmpty,
  WxbSelect,
  WxbTag,
} from '../../components/wxb-ui';
import { employeeApi } from '../../services/api';
import { Employee } from '../../types';
import {
  personnelScheduleApi,
  ShiftCalendarRow,
  PartnersMap,
} from '../../services/personnelScheduleApi';

const CATEGORY_LABEL: Record<string, string> = {
  BASE: '基础班',
  PRODUCTION: '生产班',
  OVERTIME: '加班',
  REST: '休息',
  LEAVE: '请假',
  WORK: '工作',
};

const WEEK = '日一二三四五六';
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '');

const empName = (e: Employee) => e.employee_name ?? e.employeeName ?? '';
const empCode = (e: Employee) => e.employee_code ?? e.employeeCode ?? '';
const empActive = (e: Employee) =>
  (e.employment_status ?? e.employmentStatus ?? 'ACTIVE') === 'ACTIVE';

const EmployeeSchedulePage: React.FC = () => {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));

  // 员工选择器
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);

  // 排班数据
  const [rows, setRows] = useState<ShiftCalendarRow[]>([]);
  const [partnersMap, setPartnersMap] = useState<PartnersMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 启动拉员工列表（仅在职），默认预选第一个，避免首屏空白。
  useEffect(() => {
    let cancelled = false;
    employeeApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        const active = (res.data ?? []).filter(empActive);
        setEmployees(active);
        setSelectedEmployeeIds((current) => {
          if (current.length > 0) return current;
          const first = active[0]?.id;
          return first ? [Number(first)] : [];
        });
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      })
      .finally(() => {
        if (!cancelled) setEmployeesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCalendar = useCallback(async (m: dayjs.Dayjs, ids: number[]) => {
    if (ids.length === 0) {
      setRows([]);
      setPartnersMap({});
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const start = m.startOf('month').format('YYYY-MM-DD');
      const end = m.endOf('month').format('YYYY-MM-DD');
      const data = await personnelScheduleApi.shiftCalendar({
        employeeIds: ids,
        startDate: start,
        endDate: end,
      });
      setRows(data);
      const opIds = Array.from(
        new Set(
          data
            .map((r) => r.operation_plan_id)
            .filter((v): v is number => typeof v === 'number' && v > 0),
        ),
      );
      const pm = await personnelScheduleApi.partners(opIds);
      setPartnersMap(pm);
    } catch {
      setError('加载排班失败，请稍后重试。');
      setRows([]);
      setPartnersMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendar(month, selectedEmployeeIds);
  }, [month, selectedEmployeeIds, loadCalendar]);

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        label: `${empName(e)}（${empCode(e)}）`,
        value: Number(e.id),
      })),
    [employees],
  );

  // 多员工时按「员工→日期」分组阅读，单员工时等价于按日期。
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.employee_code !== b.employee_code) {
        return (a.employee_code ?? '').localeCompare(b.employee_code ?? '');
      }
      if (a.plan_date !== b.plan_date) return a.plan_date < b.plan_date ? -1 : 1;
      return a.plan_id - b.plan_id;
    });
  }, [rows]);

  const showEmployeeColumn = selectedEmployeeIds.length > 1;

  const columns: ColumnsType<ShiftCalendarRow> = useMemo(() => {
    const cols: ColumnsType<ShiftCalendarRow> = [];
    if (showEmployeeColumn) {
      cols.push({
        title: '员工',
        key: 'employee',
        render: (_: unknown, r: ShiftCalendarRow) =>
          `${r.employee_name}（${r.employee_code}）`,
      });
    }
    cols.push(
      {
        title: '日期',
        dataIndex: 'plan_date',
        key: 'plan_date',
        render: (d: string) => {
          const dj = dayjs(d);
          return `${dj.format('MM-DD')} 周${WEEK[dj.day()]}`;
        },
      },
      {
        title: '类别',
        dataIndex: 'plan_category',
        key: 'plan_category',
        render: (c: string) => CATEGORY_LABEL[c] ?? c,
      },
      {
        title: '班次',
        key: 'shift',
        render: (_: unknown, r: ShiftCalendarRow) =>
          r.shift_name ? `${r.shift_name}${r.shift_code ? ` (${r.shift_code})` : ''}` : '—',
      },
      {
        title: '时间',
        key: 'time',
        render: (_: unknown, r: ShiftCalendarRow) =>
          r.shift_start_time
            ? `${fmtTime(r.shift_start_time)}–${fmtTime(r.shift_end_time)}${r.shift_is_cross_day ? ' (次日)' : ''}`
            : '—',
      },
      {
        title: '工时',
        dataIndex: 'plan_hours',
        key: 'plan_hours',
        render: (h: number | null) => (h != null ? `${h}h` : '—'),
      },
      {
        title: '关联任务',
        key: 'task',
        render: (_: unknown, r: ShiftCalendarRow) =>
          r.operation_name ? `${r.operation_name}${r.batch_code ? ` · ${r.batch_code}` : ''}` : '—',
      },
      {
        title: '同伴',
        key: 'partners',
        render: (_: unknown, r: ShiftCalendarRow) => {
          const list = (r.operation_plan_id ? partnersMap[r.operation_plan_id] : undefined) ?? [];
          const others = list.filter((p) => p.employeeId !== r.employee_id);
          if (others.length === 0) return '—';
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--wx-space-8)' }}>
              {others.map((p) => (
                <WxbTag key={p.employeeId} color="cyan">
                  {p.employeeName}
                </WxbTag>
              ))}
            </div>
          );
        },
      },
    );
    return cols;
  }, [showEmployeeColumn, partnersMap]);

  const totalHours = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.plan_hours) || 0), 0),
    [rows],
  );

  const description = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return '请选择员工查看其班次、任务与同伴';
    if (selectedEmployeeIds.length === 1) {
      const e = employees.find((emp) => Number(emp.id) === selectedEmployeeIds[0]);
      return e ? `${empName(e)}（${empCode(e)}）的班次日历` : '班次日历';
    }
    return `已选 ${selectedEmployeeIds.length} 名员工`;
  }, [selectedEmployeeIds, employees]);

  const renderBody = () => {
    if (employeesLoading) return <WxbSpinner tip="加载员工" />;
    if (selectedEmployeeIds.length === 0)
      return <WxbEmpty description="请选择员工查看其班次、任务与同伴" />;
    if (loading) return <WxbSpinner />;
    if (error) return <WxbEmpty description={error} />;
    if (sortedRows.length === 0) return <WxbEmpty description="所选员工本月暂无排班" />;
    return (
      <WxbDataTable<ShiftCalendarRow>
        rowKey="plan_id"
        columns={columns}
        dataSource={sortedRows}
        pagination={false}
      />
    );
  };

  return (
    <WxbPageShell>
      <WxbPageHeader
        eyebrow="排班查看"
        title="排班日历"
        description={description}
        meta={
          !loading && !error && sortedRows.length > 0 ? (
            <WxbBadge
              variant="bar"
              status="info"
              label={`共 ${rows.length} 条 · 合计 ${totalHours}h`}
            />
          ) : undefined
        }
        actions={
          <div style={{ display: 'flex', gap: 'var(--wx-space-8)', alignItems: 'center' }}>
            <WxbButton variant="ghost" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
              上一月
            </WxbButton>
            <span style={{ minWidth: 110, textAlign: 'center', fontWeight: 600 }}>
              {month.format('YYYY 年 MM 月')}
            </span>
            <WxbButton variant="ghost" onClick={() => setMonth((m) => m.add(1, 'month'))}>
              下一月
            </WxbButton>
            <WxbButton variant="primary" onClick={() => loadCalendar(month, selectedEmployeeIds)}>
              刷新
            </WxbButton>
          </div>
        }
      />

      <div style={{ marginTop: 'var(--wx-space-16)', maxWidth: 560 }}>
        <WxbSelect
          label="选择员工（可多选）"
          placeholder="按姓名或工号搜索，可选一个或多个员工"
          mode="multiple"
          maxTagCount="responsive"
          showSearch
          optionFilterProp="label"
          loading={employeesLoading}
          value={selectedEmployeeIds}
          options={employeeOptions}
          onChange={(value) => {
            const ids = (Array.isArray(value) ? value : [value])
              .map((item) => Number(item))
              .filter((item) => Number.isFinite(item) && item > 0);
            setSelectedEmployeeIds(Array.from(new Set(ids)));
          }}
          notFoundContent={
            employeesLoading ? (
              <WxbSpinner size={16} tip="加载中" />
            ) : (
              <WxbEmpty description="暂无员工" />
            )
          }
        />
      </div>

      <div style={{ marginTop: 'var(--wx-space-16)' }}>{renderBody()}</div>
    </WxbPageShell>
  );
};

export default EmployeeSchedulePage;
