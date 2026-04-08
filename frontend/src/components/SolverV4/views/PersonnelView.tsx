import React, { useMemo } from 'react';
import { WarningOutlined, EditOutlined } from '@ant-design/icons';
import '../SolverV4.css';

interface ShiftAssignment {
    employee_id: number;
    employee_name?: string;
    employee_code?: string;
    date: string;
    nominal_hours?: number;
}

interface Assignment {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    planned_start: string;
    planned_end: string;
}

interface PersonnelViewProps {
    shiftAssignments: ShiftAssignment[];
    assignments: Assignment[];
    calendarDays?: { date: string; is_workday: boolean }[];
    standardHours?: number;
    onEditShift?: (shiftAssignment: any) => void;
}

const PersonnelView: React.FC<PersonnelViewProps> = ({ shiftAssignments, assignments, calendarDays = [], standardHours = 0, onEditShift }) => {
    const stats = useMemo(() => {
        const allDates = calendarDays.map(d => d.date);

        interface EmpStats {
            id: number;
            name: string;
            code: string;
            shiftCount: number;
            shiftHours: number; // Total Shift Nominal Hours
            operationHours: number; // Total Operation Duration Hours
            maxConsecutiveWork: number;
            weekendWorkDays: number; // Work shifts on non-working days (weekends/holidays)
            dates: Map<string, boolean>;
        }

        // Build non-working day set from calendar
        const nonWorkdaySet = new Set(calendarDays.filter(d => !d.is_workday).map(d => d.date));

        const empMap = new Map<number, EmpStats>();

        // 1. Process Shifts (Denominator)
        shiftAssignments.forEach(s => {
            const hours = Number(s.nominal_hours) || 0;
            const isWorkShift = hours > 0;

            if (!empMap.has(s.employee_id)) {
                empMap.set(s.employee_id, {
                    id: s.employee_id,
                    name: s.employee_name || `员工 ${s.employee_id}`,
                    code: s.employee_code || '',
                    shiftCount: 0,
                    shiftHours: 0,
                    operationHours: 0,
                    maxConsecutiveWork: 0,
                    weekendWorkDays: 0,
                    dates: new Map()
                });
            }
            const emp = empMap.get(s.employee_id)!;
            emp.dates.set(s.date, isWorkShift);
            if (isWorkShift) {
                emp.shiftCount++;
                if (nonWorkdaySet.has(s.date)) {
                    emp.weekendWorkDays++;
                }
            }
            emp.shiftHours += hours;
        });

        // 2. Process Assignments (Numerator)
        assignments.forEach(a => {
            const start = new Date(a.planned_start).getTime();
            const end = new Date(a.planned_end).getTime();
            const durationHours = (end - start) / 3600000; // ms -> hours

            // Note: Assignments might be for employees not in shiftAssignments if data is weird, 
            // but usually they should match. Check existence.
            if (empMap.has(a.employee_id)) {
                empMap.get(a.employee_id)!.operationHours += durationHours;
            }
        });

        empMap.forEach(emp => {
            let consecutiveWork = 0;
            let maxWork = 0;

            allDates.forEach(dateStr => {
                const isWork = emp.dates.get(dateStr) ?? false;
                if (isWork) {
                    consecutiveWork++;
                    maxWork = Math.max(maxWork, consecutiveWork);
                } else {
                    consecutiveWork = 0;
                }
            });

            emp.maxConsecutiveWork = maxWork;
        });

        return Array.from(empMap.values());
    }, [shiftAssignments, assignments, calendarDays]);

    const totalShiftHours = stats.reduce((sum, s) => sum + s.shiftHours, 0);
    const totalOpHours = stats.reduce((sum, s) => sum + s.operationHours, 0);

    // Global Utilization = Total Op / Total Shift
    const avgUtilization = totalShiftHours > 0
        ? (totalOpHours / totalShiftHours) * 100
        : 0;

    const getUtilizationColor = (ratio: number) => {
        if (ratio > 0.85) return 'var(--v4-color-error)';
        if (ratio < 0.5) return 'var(--v4-color-warning)'; // Adjusted threshold
        return 'var(--v4-color-success)';
    };

    const getUtilizationPercent = (op: number, shift: number) => {
        if (shift === 0) return 0;
        return (op / shift) * 100; // Allow > 100% just in case, or cap? Usually utilization shouldn't > 100 unless OT.
    };

    const weekendAvg = stats.length > 0
        ? stats.reduce((sum, s) => sum + s.weekendWorkDays, 0) / stats.length
        : 0;

    return (
        <div style={{ display: 'flex', gap: 'var(--v4-space-xl)' }}>
            {/* Left: Ring Chart */}
            <div className="v4-content-card" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="70" fill="none" stroke="var(--v4-bg-section)" strokeWidth="16" />
                    <circle
                        cx="90" cy="90" r="70"
                        fill="none"
                        stroke="var(--v4-color-success)"
                        strokeWidth="16"
                        strokeLinecap="round"
                        strokeDasharray={`${Math.min(avgUtilization, 100) * 4.4} 440`}
                        transform="rotate(-90 90 90)"
                        style={{ transition: 'stroke-dasharray var(--v4-transition-slow)' }}
                    />
                    <text x="90" y="85" textAnchor="middle" fontSize="28" fontWeight="600" fill="var(--v4-text-primary)">
                        {Math.round(avgUtilization)}%
                    </text>
                    <text x="90" y="108" textAnchor="middle" fontSize="12" fill="var(--v4-text-secondary)">
                        平均利用率
                    </text>
                </svg>
                <div style={{ marginTop: 'var(--v4-space-lg)', display: 'flex', gap: 'var(--v4-space-xl)', fontSize: 'var(--v4-font-size-sm)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'var(--v4-text-secondary)' }}>参与人数</div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--v4-font-size-lg)' }}>{stats.length}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'var(--v4-text-secondary)' }}>总工时</div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--v4-font-size-lg)' }}>{totalShiftHours.toFixed(0)}h</div>
                    </div>
                </div>
            </div>

            {/* Right: Employee List */}
            <div className="v4-content-card" style={{ flex: 1, padding: 0 }}>
                {/* Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 80px 80px 80px 100px',
                    padding: 'var(--v4-space-md) var(--v4-space-lg)',
                    background: 'var(--v4-bg-section)',
                    fontSize: 'var(--v4-font-size-xs)',
                    color: 'var(--v4-text-secondary)',
                    fontWeight: 500
                }}>
                    <div>员工</div>
                    <div>利用率 (操作/排班)</div>
                    <div style={{ textAlign: 'center' }}>排班工时</div>
                    <div style={{ textAlign: 'center' }}>排班天数</div>
                    <div style={{ textAlign: 'center' }}>周末工作</div>
                    <div style={{ textAlign: 'center' }}>最大连续工作</div>
                </div>

                {/* Rows */}
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {stats.map(emp => {
                        const utilPercent = getUtilizationPercent(emp.operationHours, emp.shiftHours);
                        const ratio = emp.shiftHours > 0 ? emp.operationHours / emp.shiftHours : 0;
                        const isWeekendOverloaded = weekendAvg > 0 && emp.weekendWorkDays > weekendAvg * 1.5;

                        return (
                            <div key={emp.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '160px 1fr 80px 80px 80px 100px',
                                padding: 'var(--v4-space-md) var(--v4-space-lg)',
                                borderBottom: '1px solid var(--v4-border-color)',
                                alignItems: 'center'
                            }}>
                                <div
                                    style={{ cursor: onEditShift ? 'pointer' : undefined }}
                                    onClick={() => {
                                        if (!onEditShift) return;
                                        // Find the first work shift for this employee
                                        const firstShift = shiftAssignments.find(
                                            s => s.employee_id === emp.id && (s.nominal_hours || 0) > 0
                                        );
                                        if (firstShift) onEditShift(firstShift);
                                    }}
                                >
                                    <div style={{ fontWeight: 500, fontSize: 'var(--v4-font-size-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {emp.name}
                                        {onEditShift && <EditOutlined style={{ fontSize: 11, color: 'var(--v4-text-tertiary)', opacity: 0.5 }} />}
                                    </div>
                                    <div style={{ fontSize: 'var(--v4-font-size-xs)', color: 'var(--v4-text-tertiary)' }}>{emp.code}</div>
                                </div>
                                <div style={{ paddingRight: 'var(--v4-space-lg)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--v4-space-xs)' }}>
                                        <span style={{ fontSize: 'var(--v4-font-size-xs)', color: getUtilizationColor(ratio) }}>
                                            {Math.round(utilPercent)}% <span style={{ color: 'var(--v4-text-tertiary)', fontSize: '10px' }}>({emp.operationHours.toFixed(1)}h / {emp.shiftHours}h)</span>
                                        </span>
                                    </div>
                                    <div className="v4-progress-bar">
                                        <div
                                            className="v4-progress-fill"
                                            style={{
                                                width: `${Math.min(utilPercent, 100)}%`,
                                                background: getUtilizationColor(ratio)
                                            }}
                                        />
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center', fontSize: 'var(--v4-font-size-sm)' }}>{emp.shiftHours}h</div>
                                <div style={{ textAlign: 'center', fontSize: 'var(--v4-font-size-sm)' }}>{emp.shiftCount}天</div>
                                <div style={{ textAlign: 'center', fontSize: 'var(--v4-font-size-sm)', color: isWeekendOverloaded ? 'var(--v4-color-error)' : undefined, fontWeight: isWeekendOverloaded ? 600 : undefined }}>{emp.weekendWorkDays}天{isWeekendOverloaded ? ' ⚠' : ''}</div>
                                <div style={{ textAlign: 'center' }}>
                                    {emp.maxConsecutiveWork > 6 ? (
                                        <span style={{ color: 'var(--v4-color-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--v4-space-xs)' }}>
                                            <WarningOutlined /> {emp.maxConsecutiveWork}天
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 'var(--v4-font-size-sm)' }}>{emp.maxConsecutiveWork}天</span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default PersonnelView;
