import React, { useMemo } from 'react';
import { Empty } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import '../SolverV4.css';

interface Position {
    position_number: number;
    status: 'ASSIGNED' | 'UNASSIGNED';
    employee?: { id: number; name: string; code: string };
}

interface Operation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    required_people?: number;
    status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
    positions?: Position[];
}

interface CalendarDay {
    date: string;
    is_workday: boolean;
}

interface AssignmentCalendarViewProps {
    operations: Operation[];
    calendarDays: CalendarDay[];
    selectedOpId: number | null;
    onSelectDate: (date: string) => void;
    onSelectOperation: (opId: number, date: string) => void;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MAX_EVENTS_PER_CELL = 3;

const countVacancies = (op: Operation): number => {
    const total = op.positions?.length || op.required_people || 1;
    const assigned = op.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
    return Math.max(0, total - assigned);
};

/** Monday-based week offset (dayjs .day() is Sunday-based) */
const mondayOffset = (d: Dayjs): number => (d.day() + 6) % 7;

const AssignmentCalendarView: React.FC<AssignmentCalendarViewProps> = ({
    operations, calendarDays, selectedOpId, onSelectDate, onSelectOperation
}) => {
    const workdayMap = useMemo(() => {
        const m = new Map<string, boolean>();
        calendarDays.forEach(d => m.set(d.date, d.is_workday));
        return m;
    }, [calendarDays]);

    const opsByDate = useMemo(() => {
        const m = new Map<string, Operation[]>();
        operations.forEach(op => {
            if (!op.planned_start) return;
            const key = dayjs(op.planned_start).format('YYYY-MM-DD');
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(op);
        });
        m.forEach(ops => ops.sort((a, b) => (a.planned_start || '').localeCompare(b.planned_start || '')));
        return m;
    }, [operations]);

    const undatedCount = useMemo(() =>
        operations.filter(op => !op.planned_start).length, [operations]);

    // Calendar range: scheduling window (calendar_days), falling back to operation dates
    const weeks = useMemo(() => {
        let datePool = calendarDays.map(d => d.date);
        if (datePool.length === 0) datePool = Array.from(opsByDate.keys());
        if (datePool.length === 0) return [];

        const sorted = [...datePool].sort();
        const rangeStart = dayjs(sorted[0]);
        const rangeEnd = dayjs(sorted[sorted.length - 1]);

        const gridStart = rangeStart.subtract(mondayOffset(rangeStart), 'day');
        const gridEnd = rangeEnd.add(6 - mondayOffset(rangeEnd), 'day');

        const result: { date: string; inRange: boolean }[][] = [];
        let cursor = gridStart;
        while (!cursor.isAfter(gridEnd)) {
            const week: { date: string; inRange: boolean }[] = [];
            for (let i = 0; i < 7; i++) {
                const dateStr = cursor.format('YYYY-MM-DD');
                const inRange = !cursor.isBefore(rangeStart) && !cursor.isAfter(rangeEnd);
                week.push({ date: dateStr, inRange });
                cursor = cursor.add(1, 'day');
            }
            result.push(week);
        }
        return result;
    }, [calendarDays, opsByDate]);

    if (weeks.length === 0) {
        return <Empty description="暂无排程区间数据" style={{ padding: 40 }} />;
    }

    const today = dayjs().format('YYYY-MM-DD');

    const renderCell = (cell: { date: string; inRange: boolean }) => {
        const d = dayjs(cell.date);
        const ops = cell.inRange ? (opsByDate.get(cell.date) || []) : [];
        const total = ops.length;
        const vacancies = ops.reduce((s, op) => s + countVacancies(op), 0);
        const hasUnassigned = ops.some(op => op.status === 'UNASSIGNED');
        const counts = {
            complete: ops.filter(op => op.status === 'COMPLETE').length,
            partial: ops.filter(op => op.status === 'PARTIAL').length,
            unassigned: ops.filter(op => op.status === 'UNASSIGNED').length,
        };

        const isWorkday = workdayMap.has(cell.date)
            ? workdayMap.get(cell.date)!
            : !(d.day() === 0 || d.day() === 6);
        const isToday = cell.date === today;

        // Problem operations first, then covered ones
        const ordered = [
            ...ops.filter(op => op.status !== 'COMPLETE'),
            ...ops.filter(op => op.status === 'COMPLETE'),
        ];
        const visibleEvents = ordered.slice(0, MAX_EVENTS_PER_CELL);
        const overflow = ordered.length - visibleEvents.length;

        const cellCls = [
            'asgn-cal-cell',
            cell.inRange ? '' : 'out',
            cell.inRange && !isWorkday ? 'off' : '',
            isToday ? 'today' : '',
        ].filter(Boolean).join(' ');

        return (
            <div key={cell.date} className={cellCls}
                onClick={() => cell.inRange && onSelectDate(cell.date)}>
                <div className="asgn-cal-cell-top">
                    <span className="asgn-cal-date">
                        {d.date()}
                        {isToday && <span className="asgn-cal-today-tag">今</span>}
                    </span>
                    {vacancies > 0 && (
                        <span className={`asgn-cal-vac ${hasUnassigned ? 'error' : 'warning'}`}>
                            缺{vacancies}
                        </span>
                    )}
                </div>
                {cell.inRange && total > 0 && (
                    <>
                        <div className="asgn-cal-events">
                            {visibleEvents.map(op => {
                                const dotCls = op.status === 'COMPLETE' ? 'success'
                                    : op.status === 'PARTIAL' ? 'warning' : 'error';
                                return (
                                    <div key={op.operation_plan_id}
                                        className={`asgn-cal-event ${selectedOpId === op.operation_plan_id ? 'selected' : ''}`}
                                        title={`${op.operation_name} (${dayjs(op.planned_start).format('HH:mm')}-${dayjs(op.planned_end).format('HH:mm')})`}
                                        onClick={e => {
                                            e.stopPropagation();
                                            onSelectOperation(op.operation_plan_id, cell.date);
                                        }}>
                                        <span className={`asgn-list-dot ${dotCls}`} />
                                        <span className="asgn-cal-event-time">{dayjs(op.planned_start).format('HH:mm')}</span>
                                        <span className="asgn-cal-event-name">{op.operation_name}</span>
                                    </div>
                                );
                            })}
                            {overflow > 0 && <div className="asgn-cal-more">+{overflow} 项</div>}
                        </div>
                        <div className="asgn-cal-bar">
                            {counts.complete > 0 && <div className="seg success" style={{ flex: counts.complete }} />}
                            {counts.partial > 0 && <div className="seg warning" style={{ flex: counts.partial }} />}
                            {counts.unassigned > 0 && <div className="seg error" style={{ flex: counts.unassigned }} />}
                        </div>
                    </>
                )}
                {cell.inRange && total === 0 && <div className="asgn-cal-empty">无操作</div>}
            </div>
        );
    };

    return (
        <div className="asgn-cal-container">
            <div className="asgn-cal-grid asgn-cal-head">
                {WEEKDAY_LABELS.map(w => <div key={w} className="asgn-cal-head-cell">{w}</div>)}
            </div>
            {weeks.map((week, i) => (
                <div key={i} className="asgn-cal-grid">
                    {week.map(renderCell)}
                </div>
            ))}
            <div className="asgn-cal-legend">
                <span className="asgn-cal-legend-item"><span className="bar success" />已覆盖</span>
                <span className="asgn-cal-legend-item"><span className="bar warning" />部分覆盖</span>
                <span className="asgn-cal-legend-item"><span className="bar error" />未覆盖</span>
                {undatedCount > 0 && (
                    <span className="asgn-cal-legend-note">另有 {undatedCount} 个未定时间的任务,请在清单视图查看</span>
                )}
                <span className="asgn-cal-legend-hint">点击日期定位下方清单,点击操作直达详情</span>
            </div>
        </div>
    );
};

export default React.memo(AssignmentCalendarView);
