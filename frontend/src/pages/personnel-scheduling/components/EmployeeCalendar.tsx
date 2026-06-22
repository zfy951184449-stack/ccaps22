import React from 'react';
import { Dayjs } from 'dayjs';
import { WxbCard } from '../../../components/wxb-ui';
import { RosterCalendarDay, RosterCalendarEmployee, RosterCalendarOperation, WorkdayMap, DayTypeInfo } from '../types';
import { shiftKindClass, shiftPillLabel, batchColorClass } from '../shiftVisual';
import ShiftIcon from './ShiftIcon';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
/** Monday-start 周内序号:dayjs day() 0=周日…6=周六。 */
const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;
const HOUR_MAX = 12;

interface Props {
    employee: RosterCalendarEmployee;
    anchor: Dayjs;          // 月视图=该月任意日;周视图=该周任意日
    viewMode: 'month' | 'week';
    selectedDate: string;
    today: string;
    dayTypes: WorkdayMap;
    onSelectDay: (date: string) => void;
    onJumpMonth?: (delta: number) => void;   // 点淡化的相邻月日期 → 跳月
}

const LockIcon = () => (
    <svg className="rc-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
);

/** 班次药丸:图标 + 文字。 */
const ShiftPill: React.FC<{ shift: NonNullable<RosterCalendarDay['shift']> }> = ({ shift }) => (
    <span className={`rc-pill ${shiftKindClass(shift)}`}>
        <ShiftIcon kind={shift.kind} />
        <span className="rc-pill-tx">{shiftPillLabel(shift)}</span>
    </span>
);

/** 日类型角标:节假日"休"(红)/ 调休补班"班"(琥珀)。 */
const DayTag: React.FC<{ info?: DayTypeInfo }> = ({ info }) => {
    if (!info) return null;
    if (info.dayType === 'holiday') {
        return <span className="rc-daytag rc-daytag--holiday" title={info.holidayName || '法定节假日'}>休</span>;
    }
    if (info.dayType === 'makeup') {
        return <span className="rc-daytag rc-daytag--makeup" title={info.holidayName ? `${info.holidayName} · 调休补班` : '调休补班'}>班</span>;
    }
    return null;
};

/** 当天是否存在岗位空缺(任一操作 已配人数 < 需求人数)。 */
const dayHasVacancy = (ops: RosterCalendarOperation[]): boolean =>
    ops.some((op) => (op.requiredPeople || 0) > (op.team ? op.team.length : 0));

const EmployeeCalendar: React.FC<Props> = ({ employee, anchor, viewMode, selectedDate, today, dayTypes, onSelectDay, onJumpMonth }) => {
    if (viewMode === 'week') {
        const weekStart = anchor.subtract(mondayIndex(anchor), 'day');
        const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

        return (
            <WxbCard className="rc-cal-card">
                <div className="rc-week-grid">
                    {days.map((d) => {
                        const dateStr = d.format('YYYY-MM-DD');
                        const data: RosterCalendarDay | undefined = employee.days[dateStr];
                        const shift = data?.shift || null;
                        const ops = data?.operations || [];
                        const dt = dayTypes[dateStr];
                        const isToday = dateStr === today;
                        const isSel = dateStr === selectedDate;
                        return (
                            <div
                                key={dateStr}
                                className={`rc-week-col ${isToday ? 'rc-week-col--today' : ''} ${isSel ? 'rc-week-col--selected' : ''}`}
                                onClick={() => onSelectDay(dateStr)}
                            >
                                <div className="rc-week-head">
                                    <span className="rc-week-date">{d.date()}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                        <DayTag info={dt} />
                                        <span className={`rc-week-dow ${dt?.dayType === 'holiday' ? 'rc-dow--weekend' : ''}`}>周{WEEKDAYS[mondayIndex(d)]}</span>
                                    </span>
                                </div>
                                {dt?.holidayName && (dt.dayType === 'holiday' || dt.dayType === 'makeup') && (
                                    <div className="rc-week-holiday">{dt.holidayName}{dt.dayType === 'makeup' ? '·补班' : ''}</div>
                                )}
                                <div className="rc-week-body">
                                    {shift && <ShiftPill shift={shift} />}
                                    {!shift && <span className="rc-week-rest">未排班</span>}
                                    {shift && shift.type !== 'REST' && ops.length === 0 && (
                                        <div className="rc-week-rest">无排产工作</div>
                                    )}
                                    {ops.map((op) => (
                                        <div key={op.operationPlanId} className={`rc-week-op ${batchColorClass(op.batchCode)}`}>
                                            <div className="rc-week-op-time">{op.startTime}–{op.endTime}</div>
                                            <div className="rc-week-op-name">{op.operationName}</div>
                                            <div className="rc-week-op-meta">
                                                {[op.batchCode, op.stageName].filter(Boolean).join(' · ')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </WxbCard>
        );
    }

    // ── 月视图 ──
    const monthStart = anchor.startOf('month');
    const daysInMonth = monthStart.daysInMonth();
    const lead = mondayIndex(monthStart);
    const prevLast = monthStart.subtract(1, 'month').daysInMonth();
    const used = lead + daysInMonth;
    const trail = (7 - (used % 7)) % 7;

    const leading = Array.from({ length: lead }, (_, i) => prevLast - lead + 1 + i);
    const trailing = Array.from({ length: trail }, (_, i) => i + 1);

    const renderRealCell = (d: Dayjs) => {
        const dateStr = d.format('YYYY-MM-DD');
        const data = employee.days[dateStr];
        const shift = data?.shift || null;
        const ops = data?.operations || [];
        const dt = dayTypes[dateStr];
        const isToday = dateStr === today;
        const isSel = dateStr === selectedDate;
        const isHoliday = dt?.dayType === 'holiday';
        const isMakeup = dt?.dayType === 'makeup';
        const isWeekend = mondayIndex(d) >= 5 && !isMakeup;
        const vacancy = dayHasVacancy(ops);
        const firstOp = ops[0];
        const hoursPct = shift && shift.hours > 0 ? Math.min(100, Math.round((shift.hours / HOUR_MAX) * 100)) : 0;

        return (
            <div
                key={dateStr}
                className={`rc-cell ${isWeekend ? 'rc-cell--weekend' : ''} ${isHoliday ? 'rc-cell--holiday' : ''} ${isSel ? 'rc-cell--selected' : ''}`}
                onClick={() => onSelectDay(dateStr)}
                title={dt?.holidayName || undefined}
            >
                <div className="rc-cell-date">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {isToday
                            ? <span className="rc-today-badge">{d.date()}</span>
                            : <span className={`rc-date-num ${isHoliday ? 'rc-date-num--holiday' : ''}`}>{d.date()}</span>}
                        {shift?.isLocked ? <LockIcon /> : null}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <DayTag info={dt} />
                        {vacancy && <span className="rc-vac-dot" title="有岗位空缺" />}
                    </span>
                </div>
                {shift && <ShiftPill shift={shift} />}
                {ops.length > 0 && (
                    <div className="rc-works">
                        <div className={`rc-work ${batchColorClass(firstOp.batchCode)}`} title={`${firstOp.batchCode} · ${firstOp.operationName}`}>
                            <span className="rc-work-dot" />
                            <span className="rc-work-tx">{firstOp.batchCode ? `${firstOp.batchCode}·` : ''}{firstOp.operationName}</span>
                        </div>
                        {ops.length > 1 && <span className="rc-work-more">+{ops.length - 1} 项工作</span>}
                    </div>
                )}
                {hoursPct > 0 && <span className={`rc-hours-bar rc-bar--${shift!.kind}`} style={{ width: `${hoursPct}%` }} />}
            </div>
        );
    };

    return (
        <WxbCard className="rc-cal-card">
            <div className="rc-dow">
                {WEEKDAYS.map((w, i) => (
                    <span key={w} className={i >= 5 ? 'rc-dow--weekend' : ''}>{w}</span>
                ))}
            </div>
            <div className="rc-month-grid">
                {leading.map((n, i) => (
                    <div key={`lead${i}`} className="rc-cell rc-cell--out" onClick={() => onJumpMonth?.(-1)} title="上月">
                        <span className="rc-date-num">{n}</span>
                    </div>
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => renderRealCell(monthStart.date(i + 1)))}
                {trailing.map((n, i) => (
                    <div key={`trail${i}`} className="rc-cell rc-cell--out" onClick={() => onJumpMonth?.(1)} title="下月">
                        <span className="rc-date-num">{n}</span>
                    </div>
                ))}
            </div>
        </WxbCard>
    );
};

export default EmployeeCalendar;
