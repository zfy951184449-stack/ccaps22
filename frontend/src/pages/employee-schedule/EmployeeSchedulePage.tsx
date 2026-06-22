/**
 * EmployeeSchedulePage —— 我的排班(/my-schedule)。
 *
 * 当前无账户体系,不靠登录认人:顶部用 部门/Team/组 + 员工 筛选器自己选,
 * 选定员工后展示其月/周日历 + 每日「班次 + 对应工作」+ 当日明细。
 * 数据走免登录的 /api/personnel-schedules/v2/calendar(与排班日历同源)。
 */
import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { WxbCard, WxbSpinner, WxbEmpty } from '../../components/wxb-ui';
import { useRosterCalendar } from '../personnel-scheduling/hooks/useRosterCalendar';
import RosterFilterBar from '../personnel-scheduling/components/RosterFilterBar';
import EmployeeSummary from '../personnel-scheduling/components/EmployeeSummary';
import EmployeeCalendar from '../personnel-scheduling/components/EmployeeCalendar';
import DayDetailPanel from '../personnel-scheduling/components/DayDetailPanel';
import '../personnel-scheduling/RosterCalendar.css';

const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;

const EmployeeSchedulePage: React.FC = () => {
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

    useEffect(() => {
        fetchCalendar(startStr, endStr, unitId);
    }, [startStr, endStr, unitId, fetchCalendar]);

    const handleOrgChange = (path: number[]) => {
        setOrgPath(path);
        setSelectedEmployeeId(null);
    };

    useEffect(() => {
        if (selectedEmployeeId == null || !data) return;
        if (!data.employees.some((e) => e.id === selectedEmployeeId)) {
            setSelectedEmployeeId(null);
        }
    }, [data, selectedEmployeeId]);

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
            <WxbCard className="rc-cal-card">
                <div className="rc-state">
                    <WxbEmpty description="请在上方选择员工(可直接在「员工」框输入姓名搜索),查看其排班日历" />
                </div>
            </WxbCard>
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

export default EmployeeSchedulePage;
