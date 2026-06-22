import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { WxbCard, WxbSpinner } from '../../components/wxb-ui';
import { useRosterCalendar } from './hooks/useRosterCalendar';
import RosterFilterBar from './components/RosterFilterBar';
import EmployeeSummary from './components/EmployeeSummary';
import EmployeeCalendar from './components/EmployeeCalendar';
import GroupOverviewCalendar from './components/GroupOverviewCalendar';
import DayDetailPanel from './components/DayDetailPanel';
import ShiftLegend from './components/ShiftLegend';
import './RosterCalendar.css';

const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;

/**
 * 排班日历 —— 顶部按 部门/Team/组/员工 逐级筛选,以日历汇总所选员工的班次与对应工作。
 *   · 选到员工 → 个人月/周详历 + 当日工作明细
 *   · 仅选到组织 → 组级多人总览(点员工名展开个人详历)
 */
const PersonnelSchedulingPage: React.FC = () => {
    const { orgOptions, orgLoading, data, dayTypes, loading, fetchCalendar } = useRosterCalendar();

    const [orgPath, setOrgPath] = useState<number[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [anchor, setAnchor] = useState<Dayjs>(dayjs());
    const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));

    const unitId = orgPath.length ? orgPath[orgPath.length - 1] : null;

    const { start, end, startStr, endStr, periodLabel } = useMemo(() => {
        if (viewMode === 'week') {
            const ws = anchor.subtract(mondayIndex(anchor), 'day');
            const we = ws.add(6, 'day');
            return {
                start: ws, end: we,
                startStr: ws.format('YYYY-MM-DD'),
                endStr: we.format('YYYY-MM-DD'),
                periodLabel: `${ws.format('YYYY年M月D日')} – ${we.format('M月D日')}`
            };
        }
        const ms = anchor.startOf('month');
        const me = anchor.endOf('month');
        return {
            start: ms, end: me,
            startStr: ms.format('YYYY-MM-DD'),
            endStr: me.format('YYYY-MM-DD'),
            periodLabel: anchor.format('YYYY年 M月')
        };
    }, [anchor, viewMode]);

    // 拉数据:范围或组织变化时
    useEffect(() => {
        fetchCalendar(startStr, endStr, unitId);
    }, [startStr, endStr, unitId, fetchCalendar]);

    // 组织切换后清空已选员工(可能不在新范围内)
    const handleOrgChange = (path: number[]) => {
        setOrgPath(path);
        setSelectedEmployeeId(null);
    };

    // 已选员工若不在最新数据里则清除
    useEffect(() => {
        if (selectedEmployeeId == null || !data) return;
        if (!data.employees.some((e) => e.id === selectedEmployeeId)) {
            setSelectedEmployeeId(null);
        }
    }, [data, selectedEmployeeId]);

    // 选中日期落在可视范围之外时,重新落点(优先今天)
    useEffect(() => {
        const sel = dayjs(selectedDate);
        if (sel.isBefore(start, 'day') || sel.isAfter(end, 'day')) {
            const today = dayjs();
            const inRange = !today.isBefore(start, 'day') && !today.isAfter(end, 'day');
            setSelectedDate((inRange ? today : start).format('YYYY-MM-DD'));
        }
    }, [start, end, selectedDate]);

    const today = dayjs().format('YYYY-MM-DD');
    const employees = data?.employees ?? [];
    const employeeOptions = useMemo(
        () => employees.map((e) => ({ label: `${e.name}(${e.code})`, value: e.id })),
        [employees]
    );
    const selectedEmployee = useMemo(
        () => employees.find((e) => e.id === selectedEmployeeId) || null,
        [employees, selectedEmployeeId]
    );

    const handlePrev = () => setAnchor((a) => a.subtract(1, viewMode === 'week' ? 'week' : 'month'));
    const handleNext = () => setAnchor((a) => a.add(1, viewMode === 'week' ? 'week' : 'month'));

    const renderBody = () => {
        if (loading && !data) {
            return <WxbCard className="rc-cal-card"><div className="rc-state"><WxbSpinner size={32} tip="正在加载排班数据..." /></div></WxbCard>;
        }

        if (selectedEmployee) {
            return (
                <>
                    <EmployeeSummary employee={selectedEmployee} />
                    <div className="rc-two">
                        <div className="rc-main">
                            <EmployeeCalendar
                                employee={selectedEmployee}
                                anchor={anchor}
                                viewMode={viewMode}
                                selectedDate={selectedDate}
                                today={today}
                                dayTypes={dayTypes}
                                onSelectDay={setSelectedDate}
                                onJumpMonth={(delta) => setAnchor((a) => a.add(delta, 'month'))}
                            />
                        </div>
                        <div className="rc-rail-col">
                            <DayDetailPanel
                                date={selectedDate}
                                day={selectedEmployee.days[selectedDate] || null}
                                focalEmployeeId={selectedEmployee.id}
                                employeeName={selectedEmployee.name}
                                dayInfo={dayTypes[selectedDate]}
                            />
                        </div>
                    </div>
                </>
            );
        }

        return (
            <>
                <GroupOverviewCalendar
                    employees={employees}
                    anchor={anchor}
                    viewMode={viewMode}
                    today={today}
                    dayTypes={dayTypes}
                    selectedEmployeeId={selectedEmployeeId}
                    onSelectEmployee={setSelectedEmployeeId}
                />
                <div className="rc-below">
                    <WxbCard className="rc-detail">
                        <div className="rc-detail-empty">
                            {employees.length
                                ? '点击左侧员工姓名,展开其个人月/周详历与每日工作明细。'
                                : '请在顶部选择部门 / Team / 组,查看该范围下的排班总览。'}
                        </div>
                    </WxbCard>
                    <ShiftLegend />
                </div>
            </>
        );
    };

    return (
        <div className="rc-page">
            <RosterFilterBar
                orgOptions={orgOptions}
                orgPath={orgPath}
                onOrgChange={handleOrgChange}
                orgLoading={orgLoading}
                employeeOptions={employeeOptions}
                selectedEmployeeId={selectedEmployeeId}
                onEmployeeChange={setSelectedEmployeeId}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                periodLabel={periodLabel}
                onPrev={handlePrev}
                onNext={handleNext}
            />
            {renderBody()}
        </div>
    );
};

export default PersonnelSchedulingPage;
