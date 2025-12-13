import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Button, Space, Spin, message, Empty, Tooltip, Tag, Select, Modal } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import './RoleBasedPersonnelScheduling.css';
import RosterCell from './RosterCell';
import { ShiftPlan, SHIFT_PRIORITY, ROLE_PRIORITY, selectPrimaryPlan } from './PersonnelSchedulingUtils';

const { Option } = Select;

const API_BASE_URL = 'http://localhost:3001/api';



interface RosterEmployee {
  id: number;
  name: string;
  code: string;
  orgRole: string;
  teamName: string;
  directLeaderId: number | null;
  plansByDate: Record<string, ShiftPlan[]>;
  warningDates: Set<string>; // Dates that are part of 7+ consecutive workdays
}

// Helper function to detect consecutive workdays
const detectConsecutiveWorkdays = (plansByDate: Record<string, ShiftPlan[]>, monthDays: Dayjs[]): Set<string> => {
  const warningDates = new Set<string>();

  // Sort all dates
  const sortedDates = monthDays.map(d => d.format('YYYY-MM-DD')).sort();

  let consecutiveStart = -1;
  let consecutiveCount = 0;

  for (let i = 0; i < sortedDates.length; i++) {
    const dateKey = sortedDates[i];
    const plans = plansByDate[dateKey] || [];
    const primaryPlan = selectPrimaryPlan(plans);

    // Check if this is a work day (not REST and has a plan)
    const isWorkDay = primaryPlan && primaryPlan.plan_category !== 'REST';

    if (isWorkDay) {
      if (consecutiveStart === -1) {
        consecutiveStart = i;
        consecutiveCount = 1;
      } else {
        consecutiveCount++;
      }

      // If we've reached 7 or more consecutive days, mark all of them
      if (consecutiveCount >= 7) {
        for (let j = consecutiveStart; j <= i; j++) {
          warningDates.add(sortedDates[j]);
        }
      }
    } else {
      // Reset on rest day or no plan
      consecutiveStart = -1;
      consecutiveCount = 0;
    }
  }

  return warningDates;
};



const RoleBasedPersonnelScheduling: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [shiftPlans, setShiftPlans] = useState<ShiftPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageApi, messageContext] = message.useMessage();

  // Filter states
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [leaderFilter, setLeaderFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Filter options
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: number; name: string; departmentId?: number }>>([]);
  const [leaders, setLeaders] = useState<Array<{ id: number; name: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; code: string }>>([]);

  // Load filter options
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [deptRes, teamRes, empRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/organization/departments`),
          axios.get(`${API_BASE_URL}/organization/teams`),
          axios.get(`${API_BASE_URL}/employees`),
        ]);

        setDepartments((deptRes.data || []).map((d: any) => ({
          id: d.id,
          name: d.deptName || d.dept_name || d.unit_name || d.unitName
        })));

        setTeams((teamRes.data || []).map((t: any) => ({
          id: t.id,
          name: t.teamName || t.team_name || t.unit_name || t.unitName,
          departmentId: t.departmentId || t.department_id
        })));

        const empList = (empRes.data || []).map((e: any) => ({
          id: e.id,
          name: e.employee_name || e.employeeName,
          code: e.employee_code || e.employeeCode,
          orgRole: e.org_role || e.orgRole
        }));

        setEmployees(empList);
        setLeaders(empList.filter((e: any) => ['GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER', 'SHIFT_LEADER'].includes(e.orgRole)));
      } catch (error) {
        console.error('Failed to load filter options:', error);
      }
    };

    loadFilterOptions();
  }, []);

  // Reset team filter when department filter changes
  useEffect(() => {
    if (departmentFilter !== 'all') {
      setTeamFilter('all');
    }
  }, [departmentFilter]);

  const clearFilters = () => {
    setDepartmentFilter('all');
    setTeamFilter('all');
    setLeaderFilter('all');
    setEmployeeFilter('all');
  };

  const loadShiftPlans = useCallback(async (month: Dayjs) => {
    setLoading(true);
    const monthStart = month.startOf('month');
    const monthEnd = month.endOf('month');
    try {
      const params: any = {
        start_date: monthStart.format('YYYY-MM-DD'),
        end_date: monthEnd.format('YYYY-MM-DD'),
      };

      if (departmentFilter !== 'all') params.department_id = departmentFilter;
      if (teamFilter !== 'all') params.team_id = teamFilter;
      if (leaderFilter !== 'all') params.leader_id = leaderFilter;
      if (employeeFilter !== 'all') params.employee_id = employeeFilter;

      const response = await axios.get(`${API_BASE_URL}/personnel-schedules/shift-plans`, { params });
      setShiftPlans(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to load shift plans:', error);
      messageApi.error('加载排班数据失败');
      setShiftPlans([]);
    } finally {
      setLoading(false);
    }
  }, [messageApi, departmentFilter, teamFilter, leaderFilter, employeeFilter]);

  useEffect(() => {
    loadShiftPlans(currentMonth);
  }, [currentMonth, loadShiftPlans]);

  const monthDays = useMemo(() => {
    const days: Dayjs[] = [];
    const start = currentMonth.startOf('month');
    const end = currentMonth.endOf('month');
    let cursor = start;
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }
    return days;
  }, [currentMonth]);

  const rosterEmployees: RosterEmployee[] = useMemo(() => {
    const employeeMap = new Map<number, RosterEmployee>();

    shiftPlans.forEach((plan) => {
      const dateKey = dayjs(plan.plan_date).format('YYYY-MM-DD');
      if (!employeeMap.has(plan.employee_id)) {
        employeeMap.set(plan.employee_id, {
          id: plan.employee_id,
          name: plan.employee_name,
          code: plan.employee_code,
          orgRole: plan.org_role || plan.employee_org_role || '',
          teamName: plan.team_name || '',
          directLeaderId: plan.direct_leader_id || null,
          plansByDate: {},
          warningDates: new Set(),
        });
      }
      const entry = employeeMap.get(plan.employee_id)!;
      if (!entry.plansByDate[dateKey]) {
        entry.plansByDate[dateKey] = [];
      }
      entry.plansByDate[dateKey].push(plan);
    });



    const allEmployees = Array.from(employeeMap.values());

    // Calculate warning dates for each employee
    allEmployees.forEach(emp => {
      emp.warningDates = detectConsecutiveWorkdays(emp.plansByDate, monthDays);
    });

    const leaders = allEmployees.filter(e => ['GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER', 'SHIFT_LEADER'].includes(e.orgRole));
    const subordinates = allEmployees.filter(e => !['GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER', 'SHIFT_LEADER'].includes(e.orgRole));

    // Sort leaders first
    leaders.sort((a, b) => {
      const roleA = ROLE_PRIORITY[a.orgRole] || 0;
      const roleB = ROLE_PRIORITY[b.orgRole] || 0;
      if (roleA !== roleB) return roleB - roleA;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    const result: RosterEmployee[] = [];
    const processedIds = new Set<number>();

    // Helper to add employee and their subordinates recursively (if needed, but 1 level is enough for now)
    const addEmployeeAndSubordinates = (leader: RosterEmployee) => {
      if (processedIds.has(leader.id)) return;
      result.push(leader);
      processedIds.add(leader.id);

      // Find direct subordinates
      const mySubordinates = subordinates.filter(sub => sub.directLeaderId === leader.id);
      mySubordinates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

      mySubordinates.forEach(sub => {
        if (!processedIds.has(sub.id)) {
          result.push(sub);
          processedIds.add(sub.id);
        }
      });
    };

    // Add leaders and their teams
    leaders.forEach(leader => addEmployeeAndSubordinates(leader));

    // Add any remaining employees (orphans or those whose leaders are not in the list)
    const remaining = allEmployees.filter(e => !processedIds.has(e.id));
    remaining.sort((a, b) => {
      const roleA = ROLE_PRIORITY[a.orgRole] || 0;
      const roleB = ROLE_PRIORITY[b.orgRole] || 0;
      if (roleA !== roleB) return roleB - roleA;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    return [...result, ...remaining];
  }, [shiftPlans, monthDays]);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const base = prev.startOf('month');
      return direction === 'prev' ? base.subtract(1, 'month') : base.add(1, 'month');
    });
  };

  const handleMonthSelect = (date: Dayjs | null) => {
    if (date) {
      setCurrentMonth(date.startOf('month'));
    }
  };

  const deleteMonthlySchedule = () => {
    Modal.confirm({
      title: '确认删除当月排班？',
      content: `您将删除 ${currentMonth.format('YYYY年MM月')} 的所有排班数据，该操作不可恢复！`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true);
          const year = currentMonth.year();
          const month = currentMonth.month() + 1;

          await axios.delete(`${API_BASE_URL}/personnel-schedules/monthly`, {
            params: { year, month }
          });

          messageApi.success('已成功删除当月排班');
          await loadShiftPlans(currentMonth);
        } catch (error) {
          console.error('Failed to delete monthly schedule:', error);
          messageApi.error('删除排班失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };



  return (
    <>
      {messageContext}
      <div className="role-scheduling">
        <Card className="role-scheduling-toolbar">
          <div className="toolbar-left">
            <Space size={12}>
              <CalendarOutlined style={{ fontSize: 18 }} />
              <span className="toolbar-title">人力总览 · {currentMonth.format('YYYY年MM月')}</span>
              <Tag color="blue">按月视图</Tag>
            </Space>
          </div>
          <Space size={8} wrap>
            <Select
              value={departmentFilter}
              onChange={setDepartmentFilter}
              style={{ width: 120 }}
              placeholder="部门"
            >
              <Option value="all">全部部门</Option>
              {departments.map(d => (
                <Option key={d.id} value={d.id}>{d.name}</Option>
              ))}
            </Select>

            <Select
              value={teamFilter}
              onChange={setTeamFilter}
              style={{ width: 120 }}
              placeholder="Team"
            >
              <Option value="all">全部Team</Option>
              {teams
                .filter(t => departmentFilter === 'all' || t.departmentId === Number(departmentFilter))
                .map(t => (
                  <Option key={t.id} value={t.id}>{t.name}</Option>
                ))}
            </Select>

            <Select
              value={leaderFilter}
              onChange={setLeaderFilter}
              style={{ width: 120 }}
              placeholder="组长"
              showSearch
              optionFilterProp="children"
            >
              <Option value="all">全部组长</Option>
              {leaders.map(l => (
                <Option key={l.id} value={l.id}>{l.name}</Option>
              ))}
            </Select>

            <Select
              value={employeeFilter}
              onChange={setEmployeeFilter}
              style={{ width: 120 }}
              placeholder="员工"
              showSearch
              optionFilterProp="children"
            >
              <Option value="all">全部员工</Option>
              {employees.map(e => (
                <Option key={e.id} value={e.id}>{e.name}</Option>
              ))}
            </Select>

            <Button
              onClick={clearFilters}
              disabled={departmentFilter === 'all' && teamFilter === 'all' && leaderFilter === 'all' && employeeFilter === 'all'}
            >
              清除筛选
            </Button>

            <Button icon={<LeftOutlined />} onClick={() => handleMonthChange('prev')}>上一月</Button>
            <DatePicker
              picker="month"
              allowClear={false}
              value={currentMonth}
              onChange={handleMonthSelect}
              format="YYYY-MM"
            />
            <Button icon={<RightOutlined />} onClick={() => handleMonthChange('next')}>下一月</Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadShiftPlans(currentMonth)}>刷新</Button>
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={deleteMonthlySchedule}
            >
              删除当月排班
            </Button>
          </Space>
        </Card>

        <Card className="role-scheduling-table-card">
          <Spin spinning={loading}>
            <div className="roster-table-wrapper">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th className="roster-employee-col">人员</th>
                    {monthDays.map((day) => {
                      const isWeekend = day.day() === 0 || day.day() === 6;
                      return (
                        <th key={day.format('YYYY-MM-DD')} className={isWeekend ? 'is-weekend' : ''}>
                          <div className="roster-day">{day.format('DD')}</div>
                          <div className="roster-weekday">{day.format('ddd')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rosterEmployees.length === 0 ? (
                    <tr>
                      <td className="roster-empty" colSpan={monthDays.length + 1}>
                        <Empty description="暂无排班数据" />
                      </td>
                    </tr>
                  ) : (
                    rosterEmployees.map((emp) => (
                      <tr
                        key={emp.id}
                        className={
                          emp.orgRole === 'GROUP_LEADER'
                            ? 'row-group-leader'
                            : emp.orgRole === 'TEAM_LEADER'
                              ? 'row-team-leader'
                              : ''
                        }
                      >
                        <td className="roster-employee-col">
                          <div className="emp-name" style={{ paddingLeft: emp.directLeaderId ? '8px' : '0' }}>
                            {emp.name}
                          </div>
                          <div className="emp-code" style={{ paddingLeft: emp.directLeaderId ? '8px' : '0' }}>
                            {emp.code}
                          </div>
                        </td>
                        {monthDays.map((day) => {
                          const dateKey = day.format('YYYY-MM-DD');
                          const plans = emp.plansByDate[dateKey] || [];
                          const isWeekend = day.day() === 0 || day.day() === 6;
                          const isWarning = emp.warningDates.has(dateKey);
                          return (
                            <td
                              key={dateKey}
                              className={`${isWeekend ? 'is-weekend' : ''} ${isWarning ? 'consecutive-warning' : ''}`}
                            >
                              <RosterCell plans={plans} allPlans={shiftPlans} />
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Spin>
        </Card>
      </div>
    </>
  );
};

export default RoleBasedPersonnelScheduling;
