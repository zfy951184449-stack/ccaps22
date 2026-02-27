import React, { useRef } from 'react';
import { FixedSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ScheduleV2GridEmployee, ShiftStyleV2 } from '../types';
import ScheduleCell from './ScheduleCell';

interface VirtualGridProps {
    currentMonth: Dayjs;
    employees: ScheduleV2GridEmployee[];
    styles: Record<string, ShiftStyleV2>;
    loading: boolean;
}

const SIDEBAR_WIDTH = 200;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 48;

dayjs.locale('zh-cn');

/**
 * Generates a 2-letter initial avatar background color based on name hash
 */
const getAvatarColor = (name: string): string => {
    const colors = [
        'from-blue-400 to-blue-500',
        'from-emerald-400 to-emerald-500',
        'from-violet-400 to-violet-500',
        'from-amber-400 to-amber-500',
        'from-rose-400 to-rose-500',
        'from-cyan-400 to-cyan-500',
        'from-indigo-400 to-indigo-500',
        'from-teal-400 to-teal-500',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
};

const VirtualGrid: React.FC<VirtualGridProps> = ({ currentMonth, employees, styles, loading }) => {
    const daysInMonth = currentMonth.daysInMonth();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => currentMonth.date(i + 1));
    const today = dayjs().format('YYYY-MM-DD');

    const headerRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<any>(null);

    // Sync scroll between grid, header, and sidebar
    const handleScroll = ({ scrollLeft, scrollTop }: any) => {
        if (headerRef.current) headerRef.current.scrollLeft = scrollLeft;
        if (sidebarRef.current) sidebarRef.current.scrollTop = scrollTop;
    };

    // Render each cell via react-window
    const Cell = ({ columnIndex, rowIndex, style }: any) => {
        const employee = employees[rowIndex];
        const date = daysArray[columnIndex];
        const dateStr = date.format('YYYY-MM-DD');
        const shiftData = employee.shifts[dateStr];
        const isWeekend = date.day() === 0 || date.day() === 6;

        let styleDef: ShiftStyleV2 | undefined;
        if (shiftData?.shiftId) {
            styleDef = styles[shiftData.shiftId];
        }

        return (
            <div
                style={style}
                className={`p-0.5 box-border ${isWeekend ? 'bg-gray-50/30' : ''}`}
            >
                <ScheduleCell
                    date={dateStr}
                    data={shiftData}
                    styleDef={styleDef}
                    isWeekend={isWeekend}
                />
            </div>
        );
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white/50 backdrop-blur-xl rounded-3xl h-full border border-white/30 shadow-lg">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500 font-medium">正在加载排班数据...</span>
                </div>
            </div>
        );
    }

    // Empty state
    if (employees.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white/50 backdrop-blur-xl rounded-3xl h-full border border-white/30 shadow-lg">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-4xl">📅</span>
                    <span className="text-gray-400 font-medium">本月无排班数据</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-white/50 backdrop-blur-xl rounded-3xl border border-white/30 shadow-lg overflow-hidden h-full">
            {/* ===== Top Header Row ===== */}
            <div className="flex border-b border-gray-200/60 bg-gradient-to-b from-gray-50/80 to-white/60 backdrop-blur-md z-10" style={{ height: HEADER_HEIGHT }}>
                {/* Top-Left Corner */}
                <div
                    className="flex-shrink-0 border-r border-gray-200/60 flex items-center justify-center"
                    style={{ width: SIDEBAR_WIDTH }}
                >
                    <span className="text-sm font-semibold text-gray-500 tracking-wide">员工</span>
                </div>

                {/* Date Headers */}
                <div ref={headerRef} className="flex flex-1 overflow-hidden">
                    <AutoSizer disableHeight>
                        {({ width }: any) => {
                            const colWidth = width / daysInMonth;
                            return (
                                <div style={{ width, height: HEADER_HEIGHT, display: 'flex' }}>
                                    {daysArray.map((day, index) => {
                                        const isWeekend = day.day() === 0 || day.day() === 6;
                                        const isToday = day.format('YYYY-MM-DD') === today;
                                        const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

                                        return (
                                            <div
                                                key={index}
                                                className={`
                                                    flex flex-col items-center justify-center text-xs flex-shrink-0
                                                    ${isWeekend ? 'bg-gray-100/50 text-gray-400' : 'text-gray-600'}
                                                    ${isToday ? 'relative' : ''}
                                                `}
                                                style={{ width: colWidth }}
                                            >
                                                {/* Today indicator */}
                                                {isToday && (
                                                    <div className="absolute inset-x-1 inset-y-1 border-2 border-blue-500 rounded-xl pointer-events-none" />
                                                )}
                                                <span className={`font-bold ${isWeekend ? 'italic' : ''}`}>
                                                    {day.format('D')}
                                                </span>
                                                <span className={`text-[10px] mt-0.5 ${isWeekend ? 'text-rose-400' : 'text-gray-400'}`}>
                                                    {weekdayNames[day.day()]}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }}
                    </AutoSizer>
                </div>
            </div>

            {/* ===== Main Content Area ===== */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Sidebar - Employee List */}
                <div
                    ref={sidebarRef}
                    className="overflow-hidden bg-white/40 backdrop-blur-sm border-r border-gray-200/60 z-10"
                    style={{ width: SIDEBAR_WIDTH }}
                >
                    {employees.map((emp) => {
                        const initials = emp.name.slice(0, 1);
                        const avatarColor = getAvatarColor(emp.name);

                        return (
                            <div
                                key={emp.id}
                                className="flex items-center gap-3 px-3 border-b border-gray-100/60 hover:bg-white/70 transition-colors cursor-pointer group"
                                style={{ height: ROW_HEIGHT }}
                            >
                                {/* Avatar */}
                                <div className={`
                                    w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold
                                    bg-gradient-to-br ${avatarColor}
                                    shadow-sm group-hover:shadow-md transition-shadow
                                `}>
                                    {initials}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-800 truncate">{emp.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-100/80 text-gray-500 rounded-full truncate">
                                            {emp.teamName || emp.code}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Main Grid */}
                <div className="flex-1 h-full">
                    <AutoSizer>
                        {({ height, width }: any) => {
                            const colWidth = width / daysInMonth;
                            return (
                                <FixedSizeGrid
                                    ref={gridRef}
                                    columnCount={daysInMonth}
                                    columnWidth={colWidth}
                                    height={height}
                                    rowCount={employees.length}
                                    rowHeight={ROW_HEIGHT}
                                    width={width}
                                    onScroll={handleScroll}
                                    className="no-scrollbar"
                                >
                                    {Cell}
                                </FixedSizeGrid>
                            );
                        }}
                    </AutoSizer>
                </div>
            </div>
        </div>
    );
};

export default VirtualGrid;
