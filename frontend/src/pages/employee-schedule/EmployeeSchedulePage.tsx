/**
 * EmployeeSchedulePage —— 员工自助"我的排班"(/my-schedule)。
 *
 * 只看自己:数据来自 GET /api/me/shift-plans,后端按登录身份强制过滤,前端不传 employee_id。
 * 月度班次列表 + 上/下月切换。账号未关联员工(403 NO_EMPLOYEE_LINK)时给出引导文案。
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
} from '../../components/wxb-ui';
import { employeeScheduleApi, MyShiftPlan, MyEmployee } from '../../services/employeeScheduleApi';

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

const EmployeeSchedulePage: React.FC = () => {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [employee, setEmployee] = useState<MyEmployee | null>(null);
  const [plans, setPlans] = useState<MyShiftPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: dayjs.Dayjs) => {
    setLoading(true);
    setError(null);
    try {
      const start = m.startOf('month').format('YYYY-MM-DD');
      const end = m.endOf('month').format('YYYY-MM-DD');
      const res = await employeeScheduleApi.myShiftPlans(start, end);
      setEmployee(res.employee);
      setPlans(res.shiftPlans);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { code?: string } } };
      const code = e?.response?.data?.code;
      if (code === 'NO_EMPLOYEE_LINK') {
        setError('你的账号还没有关联到员工档案,无法查看排班。请联系管理员绑定。');
      } else if (e?.response?.status === 401) {
        setError('请先登录后再查看。');
      } else {
        setError('加载排班失败,请稍后重试。');
      }
      setPlans([]);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const columns: ColumnsType<MyShiftPlan> = useMemo(
    () => [
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
        render: (_: unknown, r: MyShiftPlan) =>
          r.shift_name ? `${r.shift_name}${r.shift_code ? ` (${r.shift_code})` : ''}` : '—',
      },
      {
        title: '时间',
        key: 'time',
        render: (_: unknown, r: MyShiftPlan) =>
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
        render: (_: unknown, r: MyShiftPlan) =>
          r.operation_name ? `${r.operation_name}${r.batch_code ? ` · ${r.batch_code}` : ''}` : '—',
      },
    ],
    [],
  );

  const totalHours = useMemo(
    () => plans.reduce((s, p) => s + (Number(p.plan_hours) || 0), 0),
    [plans],
  );

  const renderBody = () => {
    if (loading) return <WxbSpinner />;
    if (error) return <WxbEmpty description={error} />;
    if (plans.length === 0) return <WxbEmpty description="本月暂无排班" />;
    return (
      <WxbDataTable<MyShiftPlan> rowKey="plan_id" columns={columns} dataSource={plans} pagination={false} />
    );
  };

  return (
    <WxbPageShell>
      <WxbPageHeader
        eyebrow="员工自助"
        title="我的排班"
        description={
          employee ? `${employee.employeeName}（${employee.employeeCode}）的班次日历` : '查看本人的班次日历'
        }
        meta={
          !loading && !error ? (
            <WxbBadge variant="bar" status="info" label={`本月 ${plans.length} 班 · 合计 ${totalHours}h`} />
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
            <WxbButton variant="primary" onClick={() => load(month)}>
              刷新
            </WxbButton>
          </div>
        }
      />
      <div style={{ marginTop: 'var(--wx-space-16)' }}>{renderBody()}</div>
    </WxbPageShell>
  );
};

export default EmployeeSchedulePage;
