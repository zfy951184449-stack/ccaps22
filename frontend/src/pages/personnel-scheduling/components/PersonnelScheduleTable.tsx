import React, { useRef, useEffect } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ScheduleV2GridEmployee, ShiftStyleV2, ScheduleV2GridShift } from '../types';

interface PersonnelScheduleTableProps {
    currentMonth: Dayjs;
    employees: ScheduleV2GridEmployee[];
    styles: Record<string, ShiftStyleV2>;
    loading: boolean;
}

// Configuration
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 24;
// COL_WIDTH: Now responsive via CSS Grid `minmax(32px, 1fr)`
const MIN_COL_WIDTH = 32; // Minimum width per day column
const SIDEBAR_WIDTH = 140;

// Setup Dayjs
dayjs.locale('zh-cn');

/**
 * PersonnelScheduleTable
 * 
 * A high-performance, Apple HIG styled table using native CSS sticky positioning.
 * Features:
 * - Glassmorphism headers and sidebar
 * - Sticky top header for dates
 * - Sticky left sidebar for employees
 * - Pill-shaped shift indicators
 * - Compact Mode: 24px Row Height, 32px Col Width
 */
const PersonnelScheduleTable: React.FC<PersonnelScheduleTableProps> = ({
    currentMonth,
    employees,
    styles,
    loading
}) => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const daysInMonth = currentMonth.daysInMonth();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => currentMonth.date(i + 1));
    const today = dayjs().format('YYYY-MM-DD');

    // Helper to get shift style
    const getShiftStyle = (shift: ScheduleV2GridShift | undefined) => {
        if (!shift) return null;

        // Base classes: Compact pill shape (h-4 to fit, 20px was tight), smaller text (9px)
        let baseClasses = "flex items-center justify-center w-full h-[20px] rounded-sm text-[9px] font-medium transition-all duration-200 shadow-sm hover:shadow-md cursor-default border border-transparent leading-none";

        // 1. Determine Display Label
        let hoursLabel = '';
        if (shift.shiftId && styles[shift.shiftId]) {
            hoursLabel = styles[shift.shiftId].label;
        }

        // Prioritize hoursLabel for display
        let displayLabel = hoursLabel;
        if (!displayLabel && shift.shiftName) {
            displayLabel = shift.shiftName;
        }

        // Format: Remove decimals if integer (e.g. "8.00" -> "8")
        let formattedLabel = displayLabel;
        const num = parseFloat(displayLabel);
        if (!isNaN(num)) {
            formattedLabel = Number(num).toString();
        }

        // 2. Determine Color/Style Logic using Name key
        const logicKey = (shift.shiftName || '').toLowerCase();

        // Check hours content
        const isZeroHours = hoursLabel === '0.00' || hoursLabel === '0' || (shift.hours === 0);

        if (shift.type === 'WORK') {
            // Handle 0.00 as Rest/Warning
            if (isZeroHours) {
                return {
                    className: `${baseClasses} bg-gray-100/50 text-gray-300 border-gray-200/60 font-normal scale-90`,
                    label: formattedLabel || '0'
                };
            }

            if (logicKey.includes('夜') || logicKey.includes('night')) {
                // Night -> Red
                return {
                    className: `${baseClasses} bg-red-600 text-white shadow-red-200`,
                    label: formattedLabel
                };
            } else if (logicKey.includes('长白') || logicKey.includes('long')) {
                // Long Day -> Blue
                return {
                    className: `${baseClasses} bg-blue-600 text-white shadow-blue-200`,
                    label: formattedLabel
                };
            } else {
                // Standard -> Green
                return {
                    className: `${baseClasses} bg-emerald-600 text-white shadow-emerald-200`,
                    label: formattedLabel
                };
            }
        } else if (shift.type === 'REST' || isZeroHours) {
            return {
                className: `${baseClasses} bg-gray-50 text-gray-300 border-gray-100 font-normal scale-90`,
                label: '休'
            };
        } else if (shift.type === 'LEAVE') {
            return {
                className: `${baseClasses} bg-amber-50 text-amber-600 border-amber-100`,
                label: '假'
            };
        }

        return null;
    };

    // Loading State
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white/40 backdrop-blur-xl rounded-3xl h-full border border-white/20 shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none" />
                <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/30 shadow-lg border border-white/40">
                    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-gray-500 font-medium tracking-wide">正在加载排班数据...</span>
                </div>
            </div>
        );
    }

    // Empty State
    if (employees.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white/40 backdrop-blur-xl rounded-3xl h-full border border-white/20 shadow-xl">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <span className="text-5xl opacity-50">📅</span>
                    <span className="text-lg font-medium">暂无排班数据</span>
                    <span className="text-sm">请尝试调整筛选条件</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-white/40 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl overflow-hidden relative">
            {/* Scrollable Container */}
            <div
                ref={tableContainerRef}
                className="flex-1 overflow-auto relative w-full h-full no-scrollbar"
                style={{ scrollBehavior: 'smooth' }}
            >
                {/* 
                  Grid Layout using CSS Grid for perfect alignment.
                  - Responsive Mode: Columns expand to fill, min 32px each
                  - Fallback to scroll if screen too narrow
                */}
                <div
                    className="grid relative"
                    style={{
                        gridTemplateColumns: `${SIDEBAR_WIDTH}px repeat(${daysInMonth}, minmax(${MIN_COL_WIDTH}px, 1fr))`,
                        gridTemplateRows: `${HEADER_HEIGHT}px repeat(${employees.length}, ${ROW_HEIGHT}px)`,
                        minWidth: `${SIDEBAR_WIDTH + daysInMonth * MIN_COL_WIDTH}px`
                    }}
                >
                    {/* --- Top Left Corner (Fixed) --- */}
                    <div
                        className="sticky top-0 left-0 z-40 bg-white/80 backdrop-blur-xl border-r border-b border-gray-200/50 flex items-center justify-center shadow-sm"
                        style={{ gridColumn: '1 / 2', gridRow: '1 / 2' }}
                    >
                        <span className="text-xs font-semibold text-gray-400 tracking-wide">员工</span>
                    </div>

                    {/* --- Date Headers (Sticky Top) --- */}
                    {daysArray.map((day, index) => {
                        const isToday = day.format('YYYY-MM-DD') === today;
                        const isWeekend = day.day() === 0 || day.day() === 6;
                        const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

                        return (
                            <div
                                key={`header-${index}`}
                                className={`
                                    sticky top-0 z-20 
                                    flex flex-col items-center justify-center
                                    border-b border-r border-gray-200/30 
                                    bg-white/70 backdrop-blur-xl
                                    transition-colors duration-200
                                    ${isWeekend ? 'bg-gray-50/50' : ''}
                                `}
                                style={{ gridColumn: `${index + 2} / ${index + 3}`, gridRow: '1 / 2' }}
                            >
                                <div className={`
                                    flex flex-col items-center justify-center w-6 h-8 rounded-lg transition-all
                                    ${isToday ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105' : ''}
                                `}>
                                    <span className={`text-[10px] font-bold leading-none mb-0.5 ${!isToday && isWeekend ? 'text-gray-400 italic' : ''} ${!isToday && !isWeekend ? 'text-gray-600' : ''}`}>
                                        {day.format('D')}
                                    </span>
                                    <span className={`text-[8px] leading-none ${!isToday ? 'text-gray-400' : 'text-blue-100'}`}>
                                        {weekdayNames[day.day()]}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {/* --- Employee Rows --- */}
                    {employees.map((emp, empIndex) => {
                        const rowIndex = empIndex + 2;

                        return (
                            <React.Fragment key={emp.id}>
                                {/* Sidebar Cell (Sticky Left) */}
                                <div
                                    className="sticky left-0 z-30 flex flex-col justify-center px-4 border-b border-r border-gray-200/50 bg-white/60 backdrop-blur-xl group hover:bg-white/80 transition-colors"
                                    style={{ gridColumn: '1 / 2', gridRow: `${rowIndex} / ${rowIndex + 1}` }}
                                >
                                    <div className="flex items-baseline justify-between w-full">
                                        <span className="text-xs font-medium text-gray-800 truncate" title={emp.name}>
                                            {emp.name}
                                        </span>
                                        <span className="text-[9px] text-gray-400 font-normal truncate ml-1 max-w-[50px] text-right">
                                            {emp.teamName || emp.code}
                                        </span>
                                    </div>
                                </div>

                                {/* Shift Cells */}
                                {daysArray.map((day, dayIndex) => {
                                    const dateStr = day.format('YYYY-MM-DD');
                                    const shift = emp.shifts[dateStr];
                                    const isWeekend = day.day() === 0 || day.day() === 6;
                                    const shiftStyle = getShiftStyle(shift);

                                    return (
                                        <div
                                            key={`${emp.id}-${dateStr}`}
                                            className={`
                                                relative p-[2px]
                                                border-b border-r border-gray-100/30
                                                flex items-center justify-center
                                                transition-colors duration-150
                                                ${isWeekend ? 'bg-gray-50/30' : ''}
                                                hover:bg-white/40
                                            `}
                                            style={{ gridColumn: `${dayIndex + 2} / ${dayIndex + 3}`, gridRow: `${rowIndex} / ${rowIndex + 1}` }}
                                        >
                                            {shiftStyle && (
                                                <div className={shiftStyle.className}>
                                                    {shiftStyle.label}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .no-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .no-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0,0,0,0.1);
                    border-radius: 3px;
                }
                .no-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0,0,0,0.2);
                }
             `}</style>
        </div>
    );
};

export default PersonnelScheduleTable;
