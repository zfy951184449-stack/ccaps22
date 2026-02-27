import React, { useState, useMemo } from 'react';
import { Tooltip, Empty } from 'antd';
import dayjs from 'dayjs';
import '../SolverV4.css';

interface ShiftAssignment {
    employee_id: number;
    employee_name?: string;
    employee_code?: string;
    date: string;
    shift_id: number;
    shift_name: string;
    shift_code: string;
    start_time: string;
    end_time: string;
}

interface OperationAssignment {
    operation_plan_id: number;
    operation_name: string;
    employee_id: number;
    planned_start: string;
    planned_end: string;
    batch_code: string;
}

interface TimelineViewProps {
    shifts: ShiftAssignment[];
    operations: OperationAssignment[];
    employees: Map<number, { name: string; code: string }>;
}

const TimelineView: React.FC<TimelineViewProps> = ({ shifts, operations, employees }) => {
    const dates = useMemo(() => {
        const set = new Set<string>();
        shifts.forEach(s => set.add(s.date));
        operations.forEach(o => set.add(dayjs(o.planned_start).format('YYYY-MM-DD')));
        return Array.from(set).sort();
    }, [shifts, operations]);

    const [selectedDate, setSelectedDate] = useState<string>(dates[0] || dayjs().format('YYYY-MM-DD'));

    const currentShifts = useMemo(() => shifts.filter(s => s.date === selectedDate), [shifts, selectedDate]);
    const currentOps = useMemo(() => operations.filter(o => dayjs(o.planned_start).format('YYYY-MM-DD') === selectedDate), [operations, selectedDate]);

    const empData = useMemo(() => {
        const empIds = new Set<number>();
        currentShifts.forEach(s => empIds.add(s.employee_id));
        currentOps.forEach(o => empIds.add(o.employee_id));

        return Array.from(empIds).map(id => {
            const shiftInfo = currentShifts.find(s => s.employee_id === id);
            return {
                id,
                name: employees.get(id)?.name || shiftInfo?.employee_name || `员工 ${id}`,
                code: employees.get(id)?.code || shiftInfo?.employee_code || '',
                shift: shiftInfo,
                ops: currentOps.filter(o => o.employee_id === id)
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [currentShifts, currentOps, employees]);

    const START_HOUR = 6;
    const TOTAL_HOURS = 24;
    const PX_PER_HOUR = 50;

    const getXPos = (timeStr: string) => {
        const d = dayjs(timeStr);
        const refStart = dayjs(selectedDate).startOf('day');
        const diffHours = d.diff(refStart, 'minute') / 60;
        return (diffHours - START_HOUR) * PX_PER_HOUR;
    };

    const getWidth = (startStr: string, endStr: string) => {
        const s = dayjs(startStr);
        const e = dayjs(endStr);
        return (e.diff(s, 'minute') / 60) * PX_PER_HOUR;
    };

    if (dates.length === 0) {
        return <Empty description="暂无排班数据" style={{ padding: 'var(--v4-space-2xl)' }} />;
    }

    return (
        <div className="v4-content-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Date Selector */}
            <div style={{
                padding: 'var(--v4-space-lg)',
                borderBottom: '1px solid var(--v4-border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', gap: 'var(--v4-space-sm)', flexWrap: 'wrap' }}>
                    {dates.map(d => (
                        <button
                            key={d}
                            onClick={() => setSelectedDate(d)}
                            style={{
                                padding: 'var(--v4-space-sm) var(--v4-space-lg)',
                                borderRadius: 'var(--v4-radius-full)',
                                border: 'none',
                                background: selectedDate === d ? 'var(--v4-accent-blue)' : 'var(--v4-bg-section)',
                                color: selectedDate === d ? '#fff' : 'var(--v4-text-primary)',
                                fontWeight: 500,
                                fontSize: 'var(--v4-font-size-sm)',
                                cursor: 'pointer',
                                transition: 'all var(--v4-transition-fast)'
                            }}
                        >
                            {dayjs(d).format('MM/DD')}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 'var(--v4-space-lg)', fontSize: 'var(--v4-font-size-xs)', color: 'var(--v4-text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v4-space-xs)' }}>
                        <div style={{ width: 12, height: 12, background: 'var(--v4-accent-blue-light)', border: '1px solid var(--v4-accent-blue)', borderRadius: 2 }} />
                        <span>班次区间</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v4-space-xs)' }}>
                        <div style={{ width: 12, height: 12, background: 'var(--v4-accent-amber)', borderRadius: 'var(--v4-radius-full)' }} />
                        <span>操作任务</span>
                    </div>
                </div>
            </div>

            {/* Gantt Content */}
            <div className="v4-gantt-container" style={{ padding: 'var(--v4-space-lg)' }}>
                {/* Timeline Header */}
                <div style={{ display: 'flex', marginLeft: 120, borderBottom: '1px solid var(--v4-border-color)', paddingBottom: 'var(--v4-space-sm)' }}>
                    {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
                        const h = (START_HOUR + i) % 24;
                        return (
                            <div key={i} style={{
                                width: PX_PER_HOUR,
                                fontSize: 'var(--v4-font-size-xs)',
                                color: 'var(--v4-text-tertiary)',
                                textAlign: 'left',
                                borderLeft: '1px solid var(--v4-border-color)',
                                paddingLeft: 'var(--v4-space-xs)'
                            }}>
                                {h}:00
                            </div>
                        );
                    })}
                </div>

                {/* Rows */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {empData.map(emp => (
                        <div key={emp.id} className="v4-gantt-row">
                            <div className="v4-gantt-employee">
                                <div className="v4-gantt-employee-name">{emp.name}</div>
                                <div className="v4-gantt-employee-code">{emp.code}</div>
                            </div>
                            <div className="v4-gantt-timeline" style={{ width: TOTAL_HOURS * PX_PER_HOUR }}>
                                {/* Shift Block */}
                                {emp.shift && (
                                    <Tooltip title={`${emp.shift.shift_name} (${dayjs(emp.shift.start_time).format('HH:mm')} - ${dayjs(emp.shift.end_time).format('HH:mm')})`}>
                                        <div
                                            className="v4-shift-block"
                                            style={{
                                                left: getXPos(emp.shift.start_time),
                                                width: getWidth(emp.shift.start_time, emp.shift.end_time)
                                            }}
                                        >
                                            {emp.shift.shift_name}
                                        </div>
                                    </Tooltip>
                                )}
                                {/* Task Blocks */}
                                {emp.ops.map(op => (
                                    <Tooltip key={op.operation_plan_id} title={`${op.operation_name} (${dayjs(op.planned_start).format('HH:mm')} - ${dayjs(op.planned_end).format('HH:mm')})`}>
                                        <div
                                            className="v4-task-block"
                                            style={{
                                                left: getXPos(op.planned_start),
                                                width: Math.max(getWidth(op.planned_start, op.planned_end), 60)
                                            }}
                                        >
                                            {op.operation_name}
                                        </div>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TimelineView;
