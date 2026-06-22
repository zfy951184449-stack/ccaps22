import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Popover } from 'antd';
import { CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { FixedSizeList as List } from 'react-window';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';


// ── Shared configuration matching PersonnelScheduleTable ──
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 24;
const MIN_COL_WIDTH = 32;
const SIDEBAR_WIDTH = 140;
const STAT_WIDTH = 80;
const OVERSCAN_COUNT = 5;

dayjs.locale('zh-cn');

interface ScheduleMatrixProps {
    shiftAssignments: any[];
    assignments: any[];
    calendarDays: { date: string; is_workday: boolean }[];
    operations?: any[];
    onEditShift: (shiftAssignment: any) => void;
}

type MatrixMode = 'shift' | 'operation';

interface PopoverTarget {
    empId: number;
    date: string;
    rect: { top: number; left: number; width: number; height: number };
}

/**
 * getShiftStyle — Replicates PersonnelScheduleTable's getShiftStyle logic exactly.
 * Returns Tailwind class names and label for cell rendering.
 */
function getShiftStyle(shiftName: string | undefined, nominalHours: number, planType: string, hasOp: boolean = true) {
    const baseClasses = "flex items-center justify-center w-full h-[20px] rounded-sm text-[9px] font-medium shadow-sm cursor-default border border-transparent leading-none";

    if (planType === 'REST' || (!shiftName && nominalHours === 0)) {
        return {
            className: `${baseClasses} bg-gray-50 text-gray-300 border-gray-100 font-normal scale-90`,
            label: '休',
        };
    }

    const logicKey = (shiftName || '').toLowerCase();
    const isZeroHours = nominalHours === 0;
    const hoursLabel = isZeroHours ? '0' : Number(nominalHours).toString();

    if (isZeroHours) {
        return {
            className: `${baseClasses} bg-gray-100/50 text-gray-300 border-gray-200/60 font-normal scale-90`,
            label: hoursLabel,
        };
    }

    // 工作班次:有操作 = 实心色块;在岗无操作(空转)= 同色系空心(浅底 + 描边)
    let solid: string, ghost: string;
    if (logicKey.includes('夜') || logicKey.includes('night')) {
        solid = 'bg-red-600 text-white shadow-red-200';
        ghost = 'bg-red-50 text-red-600 border-red-200 shadow-none';
    } else if (logicKey.includes('长白') || logicKey.includes('long')) {
        solid = 'bg-blue-600 text-white shadow-blue-200';
        ghost = 'bg-blue-50 text-blue-600 border-blue-200 shadow-none';
    } else {
        solid = 'bg-emerald-600 text-white shadow-emerald-200';
        ghost = 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-none';
    }
    return {
        className: `${baseClasses} ${hasOp ? solid : ghost}`,
        label: hoursLabel,
    };
}

// ── Employee data type ──
interface EmployeeRowData {
    id: number;
    name: string;
    code: string;
    shifts: Record<string, {
        shift_name: string;
        shift_code: string;
        nominal_hours: number;
        plan_type: string;
        start_time?: string;
        end_time?: string;
        is_night: boolean;
    }>;
    ops: Map<string, string[]>;
    totalHours: number;
    nightCount: number;
    weekendCount: number;
    hasIssue: boolean;
}

interface DateInfo {
    date: string;
    isWorkday: boolean;
    dayOfWeek: number;
}

// ── Memoized Row Component ──
interface EmployeeRowProps {
    emp: EmployeeRowData;
    dates: DateInfo[];
    mode: MatrixMode;
    idleOnly: boolean;
    today: string;
    gridTemplateColumns: string;
    datesLength: number;
    onCellClick: (empId: number, date: string, e: React.MouseEvent<HTMLDivElement>) => void;
}

const EmployeeRow = React.memo<EmployeeRowProps>(({
    emp, dates, mode, idleOnly, today, gridTemplateColumns, datesLength, onCellClick,
}) => {
    const rowIndex = 2; // Not used for grid-row in virtualized mode
    return (
        <div
            className="grid"
            style={{ gridTemplateColumns, height: ROW_HEIGHT }}
        >
            {/* Sidebar Cell (Sticky Left) */}
            <div
                className={`sticky left-0 z-30 flex flex-col justify-center px-4 border-b border-r border-gray-200/50 bg-white/90 group ${emp.hasIssue ? 'border-l-2 border-l-red-400' : ''}`}
                style={{ gridColumn: '1 / 2' }}
            >
                <div className="flex items-baseline justify-between w-full">
                    <span className="text-xs font-medium text-gray-800 truncate" title={emp.name}>
                        {emp.name}
                    </span>
                    <span className="text-[9px] text-gray-400 font-normal truncate ml-1 max-w-[50px] text-right">
                        {emp.code}
                    </span>
                </div>
            </div>

            {/* Shift Cells */}
            {dates.map((d, dayIndex) => {
                const shift = emp.shifts[d.date];
                const ops = emp.ops.get(d.date) || [];
                const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;

                // Orphaned operation detection: employee has ops but no covering work shift
                const hasOrphanedOps = ops.length > 0 && (!shift || shift.plan_type === 'REST' || shift.nominal_hours <= 0.01);

                // 有操作 / 在岗无操作(空岗)判定
                const hasOp = ops.length > 0;
                const isWorkShift = !!shift && shift.plan_type !== 'REST' && (shift.nominal_hours || 0) > 0.01;
                const isIdleShift = isWorkShift && !hasOp;

                let cellContent: React.ReactNode = null;

                if (mode === 'shift') {
                    if (shift) {
                        const style = getShiftStyle(shift.shift_name, shift.nominal_hours, shift.plan_type, hasOp);
                        // 「只看空岗」聚光:空岗高亮,其余淡化
                        const spotlight = idleOnly
                            ? (isIdleShift ? ' ring-2 ring-amber-400 z-10' : ' opacity-25')
                            : '';
                        cellContent = (
                            <div className="relative w-full">
                                <div className={style.className + spotlight}>{style.label}</div>
                                {hasOp && ops.length > 1 && (
                                    <span className="schedule-op-count" title={`${ops.length} 个操作`}>{ops.length}</span>
                                )}
                            </div>
                        );
                    }
                } else {
                    // Operation mode
                    if (ops.length > 0) {
                        const display = ops.length <= 2
                            ? ops.map(o => o.length > 3 ? o.slice(0, 3) : o).join('/')
                            : `${ops[0].slice(0, 3)}+${ops.length - 1}`;
                        cellContent = (
                            <div className="flex items-center justify-center w-full h-[20px] rounded-sm text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                {display}
                            </div>
                        );
                    }
                }

                return (
                    <div
                        key={`${emp.id}-${d.date}`}
                        className={`
                            relative p-[2px]
                            border-b border-r border-gray-100/30
                            flex items-center justify-center
                            ${isWeekend ? 'bg-gray-50/30' : ''}
                            ${hasOrphanedOps ? 'schedule-cell-orphan' : ''}
                            hover:bg-white/40
                        `}
                        style={{ gridColumn: `${dayIndex + 2} / ${dayIndex + 3}` }}
                    >
                        <div
                            style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => onCellClick(emp.id, d.date, e)}
                        >
                            {cellContent}
                            {hasOrphanedOps && <span className="schedule-cell-orphan-badge" title="此操作无覆盖班次">!</span>}
                        </div>
                    </div>
                );
            })}

            {/* Stats Column (Sticky Right) */}
            <div
                className="sticky right-0 z-10 flex items-center justify-center px-1 border-b border-l border-gray-200/50 bg-white/90"
                style={{ gridColumn: `${datesLength + 2} / ${datesLength + 3}` }}
            >
                <span className="text-[9px] text-gray-500 whitespace-nowrap">
                    {emp.totalHours}h/{emp.nightCount}夜
                </span>
            </div>
        </div>
    );
});

EmployeeRow.displayName = 'EmployeeRow';

/**
 * ScheduleMatrix — Employee × Date scheduling matrix
 *
 * Uses the SAME rendering style as PersonnelScheduleTable for visual consistency:
 * - CSS Grid layout with sticky headers/sidebar
 * - Compact 24px row height with colored pill shift indicators
 * - Green(日班) / Blue(长白) / Red(夜班) color scheme
 *
 * Performance optimizations:
 * - react-window FixedSizeList for row-level virtualization
 * - Singleton Popover (only 1 instance, not 1 per cell)
 * - No backdrop-blur, minimal transitions
 * - React.memo on EmployeeRow + ScheduleMatrix
 *
 * Adds solver-specific features: mode toggle, operation overlay, edit popover, stats column.
 */
const ScheduleMatrix: React.FC<ScheduleMatrixProps> = ({
    shiftAssignments,
    assignments,
    calendarDays,
    operations,
    onEditShift,
}) => {
    const [mode, setMode] = useState<MatrixMode>('shift');
    const [idleOnly, setIdleOnly] = useState(false);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<List>(null);

    // ── Singleton Popover state ──
    const [popoverTarget, setPopoverTarget] = useState<PopoverTarget | null>(null);
    const popoverAnchorRef = useRef<HTMLDivElement>(null);

    // Build sorted dates from calendar
    const dates = useMemo(() => {
        return (calendarDays || [])
            .map(d => ({ date: d.date, isWorkday: d.is_workday, dayOfWeek: dayjs(d.date).day() }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [calendarDays]);
    const today = dayjs().format('YYYY-MM-DD');

    // Build employee list with stats + shifts
    const employeeData = useMemo(() => {
        const empMap = new Map<number, EmployeeRowData>();

        const nonWorkDays = new Set(dates.filter(d => !d.isWorkday).map(d => d.date));

        // Populate shifts
        (shiftAssignments || []).forEach((s: any) => {
            if (!empMap.has(s.employee_id)) {
                empMap.set(s.employee_id, {
                    id: s.employee_id,
                    name: s.employee_name || `员工${s.employee_id}`,
                    code: s.employee_code || '',
                    shifts: {},
                    ops: new Map(),
                    totalHours: 0,
                    nightCount: 0,
                    weekendCount: 0,
                    hasIssue: false,
                });
            }
            const emp = empMap.get(s.employee_id)!;
            emp.shifts[s.date] = {
                shift_name: s.shift_name || '',
                shift_code: s.shift_code || '',
                nominal_hours: s.shift_nominal_hours || s.nominal_hours || 0,
                plan_type: s.plan_type || 'WORK',
                start_time: s.start_time,
                end_time: s.end_time,
                is_night: !!s.is_night_shift,
            };
            emp.totalHours += (s.shift_nominal_hours || s.nominal_hours || 0);
            if (s.is_night_shift) emp.nightCount++;
            if (nonWorkDays.has(s.date)) emp.weekendCount++;
        });

        // Populate operations
        (assignments || []).forEach((a: any) => {
            const emp = empMap.get(a.employee_id);
            if (!emp) return;
            const startDate = typeof a.planned_start === 'string' ? a.planned_start.slice(0, 10) : '';
            if (!emp.ops.has(startDate)) emp.ops.set(startDate, []);
            emp.ops.get(startDate)!.push(a.operation_name || '未知操作');
        });

        // Detect issues (weekend work above average)
        const allWeekends = Array.from(empMap.values()).map(e => e.weekendCount);
        const avgWeekend = allWeekends.length > 0 ? allWeekends.reduce((a, b) => a + b, 0) / allWeekends.length : 0;
        empMap.forEach(emp => {
            if (emp.weekendCount > avgWeekend * 1.5 && emp.weekendCount > 2) {
                emp.hasIssue = true;
            }
        });

        return Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }, [shiftAssignments, assignments, dates]);

    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

    // Grid template columns — shared between header and body rows
    const gridTemplateColumns = useMemo(() => {
        return `${SIDEBAR_WIDTH}px repeat(${dates.length}, minmax(${MIN_COL_WIDTH}px, 1fr)) ${STAT_WIDTH}px`;
    }, [dates.length]);

    // ── Singleton Popover: cell click handler ──
    const handleCellClick = useCallback((empId: number, date: string, e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        setPopoverTarget({ empId, date, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
    }, []);

    // Close popover on scroll
    const handleScroll = useCallback(() => {
        if (popoverTarget) setPopoverTarget(null);
    }, [popoverTarget]);

    // Close popover on click outside
    useEffect(() => {
        if (!popoverTarget) return;
        const handleClickOutside = (e: MouseEvent) => {
            const popoverEl = document.querySelector('.ant-popover');
            if (popoverEl && popoverEl.contains(e.target as Node)) return;
            setPopoverTarget(null);
        };
        // Delay to avoid catching the triggering click
        const timer = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [popoverTarget]);

    // Popover content (computed only when target changes)
    const popoverContent = useMemo(() => {
        if (!popoverTarget) return null;
        const emp = employeeData.find(e => e.id === popoverTarget.empId);
        if (!emp) return null;
        const { date } = popoverTarget;
        const shift = emp.shifts[date];
        const ops = emp.ops.get(date) || [];
        const dow = weekdayNames[dayjs(date).day()];

        return (
            <div style={{ minWidth: 200, maxWidth: 280 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                    {emp.name} · {dayjs(date).format('M/D')} 周{dow}
                </div>
                {shift ? (
                    <>
                        <div style={{ color: '#666', marginBottom: 4 }}>
                            班次: {shift.shift_name || shift.shift_code || '未知'}
                            {shift.nominal_hours > 0 && ` (${shift.nominal_hours}h)`}
                        </div>
                        {ops.length > 0 ? (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>操作分配 ({ops.length}):</div>
                                {ops.map((op, i) => (
                                    <div key={i} style={{ paddingLeft: 8, color: '#333', fontSize: 13 }}>· {op}</div>
                                ))}
                            </div>
                        ) : (
                            shift.nominal_hours > 0 && (
                                <div style={{ marginTop: 8, color: '#d97706', fontSize: 12 }}>在岗无操作分配(空岗)</div>
                            )
                        )}
                    </>
                ) : (
                    <div style={{ color: '#999' }}>休息 / 无排班</div>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const original = (shiftAssignments || []).find(
                                (s: any) => s.employee_id === emp.id && s.date === date
                            );
                            if (original) onEditShift(original);
                            setPopoverTarget(null);
                        }}
                        style={{
                            flex: 1, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                            background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 4, color: '#1677ff',
                        }}
                    >
                        编辑班次
                    </button>
                </div>
            </div>
        );
    }, [popoverTarget, employeeData, shiftAssignments, onEditShift]);

    // ── Virtual list item renderer ──
    const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const emp = employeeData[index];
        if (!emp) return null;
        return (
            <div style={style}>
                <EmployeeRow
                    emp={emp}
                    dates={dates}
                    mode={mode}
                    idleOnly={idleOnly}
                    today={today}
                    gridTemplateColumns={gridTemplateColumns}
                    datesLength={dates.length}
                    onCellClick={handleCellClick}
                />
            </div>
        );
    }, [employeeData, dates, mode, idleOnly, today, gridTemplateColumns, handleCellClick]);

    // Container height for virtual list
    const listHeight = useMemo(() => {
        // Cap at viewport minus header area
        return Math.min(employeeData.length * ROW_HEIGHT, window.innerHeight - 340);
    }, [employeeData.length]);

    return (
        <div className="schedule-matrix-container">
            {/* Mode Toggle */}
            <div className="schedule-matrix-toolbar">
                <div className="schedule-matrix-mode-toggle">
                    <button
                        className={`mode-btn ${mode === 'shift' ? 'active' : ''}`}
                        onClick={() => setMode('shift')}
                    >
                        <CalendarOutlined style={{ marginRight: 4 }} />班次
                    </button>
                    <button
                        className={`mode-btn ${mode === 'operation' ? 'active' : ''}`}
                        onClick={() => setMode('operation')}
                    >
                        <UnorderedListOutlined style={{ marginRight: 4 }} />操作
                    </button>
                </div>
                {mode === 'shift' && (
                    <div className="schedule-matrix-legend">
                        <span className="sml-item"><span className="sml-swatch solid" />有操作</span>
                        <span className="sml-item"><span className="sml-swatch ghost" />在岗无操作</span>
                        <span className="sml-item"><span className="sml-swatch rest" />休息</span>
                        <button
                            className={`sml-toggle ${idleOnly ? 'active' : ''}`}
                            onClick={() => setIdleOnly(v => !v)}
                            title="高亮在岗但无操作的格子,其余淡化"
                        >
                            只看空岗
                        </button>
                    </div>
                )}
            </div>

            {/* === CSS Grid Table — Virtualized === */}
            <div className="flex-1 flex flex-col bg-white/90 rounded-b-2xl overflow-hidden relative">
                <div
                    ref={tableContainerRef}
                    className="flex-1 overflow-auto relative w-full"
                    style={{ scrollBehavior: 'smooth' }}
                    onScroll={handleScroll}
                >
                    {/* Sticky Header Row (non-virtualized) */}
                    <div
                        className="grid sticky top-0 z-20"
                        style={{
                            gridTemplateColumns,
                            minWidth: `${SIDEBAR_WIDTH + dates.length * MIN_COL_WIDTH + STAT_WIDTH}px`,
                        }}
                    >
                        {/* Top Left Corner (Fixed) */}
                        <div
                            className="sticky top-0 left-0 z-40 bg-white/95 border-r border-b border-gray-200/50 flex items-center justify-center shadow-sm"
                            style={{ gridColumn: '1 / 2', height: HEADER_HEIGHT }}
                        >
                            <span className="text-xs font-semibold text-gray-400 tracking-wide">员工</span>
                        </div>

                        {/* Date Headers */}
                        {dates.map((d, index) => {
                            const isToday = d.date === today;
                            const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
                            return (
                                <div
                                    key={`header-${d.date}`}
                                    className={`
                                        sticky top-0 z-20 
                                        flex flex-col items-center justify-center
                                        border-b border-r border-gray-200/30 
                                        bg-white/95
                                        ${isWeekend ? 'bg-gray-50/50' : ''}
                                    `}
                                    style={{ gridColumn: `${index + 2} / ${index + 3}`, height: HEADER_HEIGHT }}
                                >
                                    <div className={`
                                        flex flex-col items-center justify-center w-6 h-8 rounded-lg
                                        ${isToday ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105' : ''}
                                    `}>
                                        <span className={`text-[10px] font-bold leading-none mb-0.5 ${!isToday && isWeekend ? 'text-gray-400 italic' : ''} ${!isToday && !isWeekend ? 'text-gray-600' : ''}`}>
                                            {dayjs(d.date).format('D')}
                                        </span>
                                        <span className={`text-[8px] leading-none ${!isToday ? 'text-gray-400' : 'text-blue-100'}`}>
                                            {weekdayNames[d.dayOfWeek]}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Stats Header (Sticky Top + Right) */}
                        <div
                            className="sticky top-0 right-0 z-30 bg-white/95 border-b border-l border-gray-200/50 flex items-center justify-center shadow-sm"
                            style={{ gridColumn: `${dates.length + 2} / ${dates.length + 3}`, height: HEADER_HEIGHT }}
                        >
                            <span className="text-[9px] font-semibold text-gray-400">统计</span>
                        </div>
                    </div>

                    {/* Virtualized Employee Rows */}
                    <div style={{ minWidth: `${SIDEBAR_WIDTH + dates.length * MIN_COL_WIDTH + STAT_WIDTH}px` }}>
                        <List
                            ref={listRef}
                            height={listHeight}
                            itemCount={employeeData.length}
                            itemSize={ROW_HEIGHT}
                            width="100%"
                            overscanCount={OVERSCAN_COUNT}
                        >
                            {Row}
                        </List>
                    </div>
                </div>

                {/* Singleton Popover — only 1 instance for entire matrix */}
                {popoverTarget && (
                    <Popover
                        content={popoverContent}
                        open={!!popoverTarget}
                        trigger={[]}
                        placement="bottom"
                        onOpenChange={(open) => { if (!open) setPopoverTarget(null); }}
                    >
                        <div
                            ref={popoverAnchorRef}
                            style={{
                                position: 'fixed',
                                top: popoverTarget.rect.top + popoverTarget.rect.height,
                                left: popoverTarget.rect.left + popoverTarget.rect.width / 2,
                                width: 1,
                                height: 1,
                                pointerEvents: 'none',
                            }}
                        />
                    </Popover>
                )}

                <style>{`
                    .schedule-matrix-container .no-scrollbar::-webkit-scrollbar {
                        width: 6px;
                        height: 6px;
                    }
                    .schedule-matrix-container .no-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .schedule-matrix-container .no-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(0,0,0,0.1);
                        border-radius: 3px;
                    }
                    .schedule-matrix-toolbar { display: flex; align-items: center; }
                    .schedule-matrix-legend {
                        display: flex; align-items: center; gap: 12px;
                        margin-left: 16px; font-size: 11px; color: #6b7280;
                    }
                    .schedule-matrix-legend .sml-item { display: inline-flex; align-items: center; gap: 5px; }
                    .schedule-matrix-legend .sml-swatch { width: 16px; height: 12px; border-radius: 3px; display: inline-block; box-sizing: border-box; }
                    .schedule-matrix-legend .sml-swatch.solid { background: #059669; }
                    .schedule-matrix-legend .sml-swatch.ghost { background: #ecfdf5; border: 1px solid #6ee7b7; }
                    .schedule-matrix-legend .sml-swatch.rest { background: #f9fafb; border: 1px solid #e5e7eb; }
                    .schedule-matrix-legend .sml-toggle {
                        font-size: 11px; padding: 2px 10px; border: 1px solid #e5e7eb;
                        border-radius: 12px; background: #fff; color: #6b7280; cursor: pointer; line-height: 16px;
                    }
                    .schedule-matrix-legend .sml-toggle.active { background: #fffbeb; border-color: #fbbf24; color: #b45309; }
                    .schedule-op-count {
                        position: absolute; top: -3px; right: -3px;
                        min-width: 11px; height: 11px; padding: 0 2px;
                        background: #0f172a; color: #fff; font-size: 7px; line-height: 11px;
                        text-align: center; border-radius: 6px; box-sizing: border-box;
                    }
                `}
                </style>
            </div>

        </div>
    );
};

export default React.memo(ScheduleMatrix);
