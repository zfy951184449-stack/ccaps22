import React from 'react';
import { Dayjs } from 'dayjs';
import { WxbCard, WxbEmpty, WxbTooltip } from '../../../components/wxb-ui';
import { RosterCalendarEmployee, WorkdayMap } from '../types';
import { shiftKindClass, shiftShortLabel, shiftPillLabel } from '../shiftVisual';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;

const ROLE_LABEL: Record<string, string> = {
    FRONTLINE: '一线', SHIFT_LEADER: '班长', GROUP_LEADER: '组长',
    TEAM_LEADER: 'Team 主管', DEPT_MANAGER: '部门经理'
};

interface Props {
    employees: RosterCalendarEmployee[];
    anchor: Dayjs;
    viewMode: 'month' | 'week';
    today: string;
    dayTypes: WorkdayMap;
    selectedEmployeeId: number | null;
    onSelectEmployee: (id: number) => void;
}

/** 组级多人总览:员工 × 日 的紧凑矩阵,每格班次+工作圆点;点员工名展开个人详历。 */
const GroupOverviewCalendar: React.FC<Props> = ({
    employees, anchor, viewMode, today, dayTypes, selectedEmployeeId, onSelectEmployee
}) => {
    const days: Dayjs[] = React.useMemo(() => {
        if (viewMode === 'week') {
            const weekStart = anchor.subtract(mondayIndex(anchor), 'day');
            return Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
        }
        const monthStart = anchor.startOf('month');
        return Array.from({ length: monthStart.daysInMonth() }, (_, i) => monthStart.date(i + 1));
    }, [anchor, viewMode]);

    if (employees.length === 0) {
        return (
            <WxbCard className="rc-cal-card">
                <div className="rc-state"><WxbEmpty description="该范围下暂无在职员工" /></div>
            </WxbCard>
        );
    }

    return (
        <WxbCard className="rc-cal-card">
            <div className="rc-overview-wrap">
                <table className="rc-ov-table">
                    <thead className="rc-ov-head">
                        <tr>
                            <th className="rc-ov-name-col">员工 / 日期</th>
                            {days.map((d) => {
                                const wd = mondayIndex(d);
                                const dt = dayTypes[d.format('YYYY-MM-DD')];
                                const cls = dt?.dayType === 'holiday' ? 'rc-ov-day-h--holiday'
                                    : dt?.dayType === 'makeup' ? 'rc-ov-day-h--makeup'
                                        : (wd >= 5 ? 'rc-ov-day-h--weekend' : '');
                                return (
                                    <th key={d.format('YYYY-MM-DD')} className={`rc-ov-day-h ${cls}`} title={dt?.holidayName || undefined}>
                                        {d.date()}
                                        {dt?.dayType === 'holiday' && <span className="rc-ov-h-mark">休</span>}
                                        {dt?.dayType === 'makeup' && <span className="rc-ov-h-mark rc-ov-h-mark--makeup">班</span>}
                                        {viewMode === 'week' && <div className="rc-week-dow">周{WEEKDAYS[wd]}</div>}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((emp) => (
                            <tr key={emp.id} className={selectedEmployeeId === emp.id ? 'rc-ov-row--selected' : ''}>
                                <td
                                    className="rc-ov-name-col"
                                    onClick={() => onSelectEmployee(emp.id)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className="rc-ov-emp">
                                        <span className="rc-ov-emp-name">{emp.name}</span>
                                        <span className="rc-ov-emp-meta">
                                            {[ROLE_LABEL[emp.role] || emp.role, emp.groupName].filter(Boolean).join(' · ')}
                                        </span>
                                    </div>
                                </td>
                                {days.map((d) => {
                                    const dateStr = d.format('YYYY-MM-DD');
                                    const data = emp.days[dateStr];
                                    const shift = data?.shift || null;
                                    const opCount = data?.operations?.length || 0;
                                    if (!shift) return <td key={dateStr} className="rc-ov-cell" />;
                                    const tip = `${shiftPillLabel(shift)}${opCount ? ` · ${opCount} 项工作` : ''}`;
                                    return (
                                        <td key={dateStr} className="rc-ov-cell">
                                            <WxbTooltip title={tip}>
                                                <span
                                                    className={`rc-ov-pill ${shiftKindClass(shift)}`}
                                                    onClick={() => onSelectEmployee(emp.id)}
                                                >
                                                    {shiftShortLabel(shift)}
                                                    {opCount > 0 && <span className="rc-ov-workdot" />}
                                                </span>
                                            </WxbTooltip>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </WxbCard>
    );
};

export default GroupOverviewCalendar;
