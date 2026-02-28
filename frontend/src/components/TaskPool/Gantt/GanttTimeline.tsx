import React, { useMemo, useState } from 'react';
import { Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { StandaloneTask, TaskType } from '../types';
import { TaskAssignment } from './TaskPoolGantt';

const { Text } = Typography;

interface GanttTimelineProps {
    startDate: string;
    endDate: string;
    tasks: StandaloneTask[];
    assignmentsByTask: Map<number, TaskAssignment[]>;
}

// Color palette per task type
const TYPE_COLORS: Record<TaskType, { window: string; windowBorder: string; pin: string }> = {
    FLEXIBLE: {
        window: 'bg-orange-100/70',
        windowBorder: 'border-orange-300',
        pin: 'bg-orange-500',
    },
    RECURRING: {
        window: 'bg-purple-100/70',
        windowBorder: 'border-purple-300',
        pin: 'bg-purple-500',
    },
    AD_HOC: {
        window: 'bg-sky-100/70',
        windowBorder: 'border-sky-300',
        pin: 'bg-sky-500',
    },
};

const CELL_WIDTH = 44; // px per day
const ROW_HEIGHT = 56; // h-14 = 56px, must match sidebar

const GanttTimeline: React.FC<GanttTimelineProps> = ({ startDate, endDate, tasks, assignmentsByTask }) => {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    const days = useMemo(() => {
        const arr: { date: dayjs.Dayjs; isWeekend: boolean; isToday: boolean }[] = [];
        let current = start.startOf('day');
        const endDay = end.startOf('day');
        while (current.isBefore(endDay) || current.isSame(endDay)) {
            arr.push({
                date: current,
                isWeekend: current.day() === 0 || current.day() === 6,
                isToday: current.isSame(dayjs(), 'day'),
            });
            current = current.add(1, 'day');
        }
        return arr;
    }, [startDate, endDate]);

    const totalWidth = days.length * CELL_WIDTH;

    // Calculate pixel position for a given date
    const dateToX = (dateStr: string) => {
        const d = dayjs(dateStr).startOf('day');
        const offset = d.diff(start, 'day', true);
        return Math.max(0, offset * CELL_WIDTH);
    };

    // Render the day headers
    const renderHeader = () => (
        <div
            className="flex h-10 border-b border-slate-200 bg-slate-50 sticky top-0 z-20"
            style={{ width: totalWidth }}
        >
            {days.map((day, i) => (
                <div
                    key={i}
                    className={`flex-none flex items-center justify-center border-r border-slate-200 text-xs
                        ${day.isWeekend ? 'bg-slate-100/60 text-slate-400' : 'text-slate-500'}
                        ${day.isToday ? 'bg-red-50 !text-red-500 font-semibold' : ''}`}
                    style={{ width: CELL_WIDTH }}
                >
                    {day.date.format('D')}
                </div>
            ))}
        </div>
    );

    // Today line
    const todayIdx = days.findIndex(d => d.isToday);

    return (
        <div className="flex-1 overflow-auto bg-white relative">
            <div style={{ minWidth: totalWidth }}>
                {renderHeader()}

                <div className="relative">
                    {/* Vertical grid lines */}
                    <div className="absolute inset-0 flex pointer-events-none" style={{ width: totalWidth }}>
                        {days.map((day, i) => (
                            <div
                                key={i}
                                className={`flex-none border-r border-slate-100 ${day.isWeekend ? 'bg-slate-50/40' : ''}`}
                                style={{ width: CELL_WIDTH }}
                            />
                        ))}
                    </div>

                    {/* Today indicator */}
                    {todayIdx !== -1 && (
                        <div
                            className="absolute top-0 bottom-0 border-l-2 border-red-400 border-dashed z-10 pointer-events-none"
                            style={{ left: (todayIdx + 0.5) * CELL_WIDTH }}
                        />
                    )}

                    {/* Task rows */}
                    <div className="relative z-0">
                        {tasks.map(task => {
                            const isCompleted = task.status === 'COMPLETED';
                            const colors = TYPE_COLORS[task.task_type] || TYPE_COLORS.FLEXIBLE;
                            const assigns = assignmentsByTask.get(task.id) || [];

                            // Window bar position
                            const windowStart = task.earliest_start || task.deadline;
                            const windowEnd = task.deadline;

                            const ws = dayjs(windowStart).startOf('day');
                            const we = dayjs(windowEnd).endOf('day');

                            // Clamp to visible range
                            const effectiveStart = ws.isBefore(start) ? start : ws;
                            const effectiveEnd = we.isAfter(end) ? end : we;

                            const left = effectiveStart.diff(start, 'day', true) * CELL_WIDTH;
                            const width = Math.max(CELL_WIDTH, effectiveEnd.diff(effectiveStart, 'day', true) * CELL_WIDTH);

                            // Build tooltip content
                            const tooltipContent = (
                                <div className="text-xs space-y-1 max-w-[240px]">
                                    <div className="font-semibold text-sm">{task.task_name}</div>
                                    <div className="text-slate-400">
                                        窗口: {dayjs(windowStart).format('MM-DD')} → {dayjs(windowEnd).format('MM-DD')}
                                    </div>
                                    {assigns.length > 0 ? (
                                        <div className="border-t border-slate-200 pt-1 mt-1">
                                            {assigns.map((a, i) => (
                                                <div key={i} className="flex justify-between gap-2">
                                                    <span>{a.employee_name || `Emp#${a.employee_id}`}</span>
                                                    <span className="text-slate-400">
                                                        {dayjs(a.assigned_date).format('MM-DD')} {a.shift_name || ''}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-slate-400 italic">尚未分配</div>
                                    )}
                                </div>
                            );

                            return (
                                <Tooltip
                                    key={task.id}
                                    title={tooltipContent}
                                    placement="bottomLeft"
                                    color="white"
                                    overlayInnerStyle={{ color: '#334155', padding: '10px 14px', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                                >
                                    <div
                                        className={`relative group hover:bg-slate-50/80 transition-colors border-b border-slate-100
                                            ${isCompleted ? 'opacity-35' : ''}`}
                                        style={{ height: ROW_HEIGHT }}
                                    >
                                        {/* Window bar */}
                                        <div
                                            className={`absolute top-2 rounded-md border ${colors.window} ${colors.windowBorder}
                                                transition-all duration-200 group-hover:shadow-sm`}
                                            style={{
                                                left,
                                                width,
                                                height: ROW_HEIGHT - 16,
                                            }}
                                        >
                                            {/* Task name inside window */}
                                            <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                                                <span className="text-xs text-slate-500 truncate font-medium">
                                                    {task.task_name}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Assignment pins */}
                                        {assigns.map((a, i) => {
                                            const pinLeft = dateToX(a.assigned_date);
                                            return (
                                                <div
                                                    key={`pin-${a.id || i}`}
                                                    className={`absolute rounded ${colors.pin} shadow-sm z-10`}
                                                    style={{
                                                        left: pinLeft + 2,
                                                        width: CELL_WIDTH - 4,
                                                        top: ROW_HEIGHT - 14,
                                                        height: 6,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GanttTimeline;
