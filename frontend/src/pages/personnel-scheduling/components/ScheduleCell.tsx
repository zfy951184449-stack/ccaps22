import React from 'react';
import classNames from 'classnames';
import { ShiftStyleV2, ScheduleV2GridShift } from '../types';

interface ScheduleCellProps {
    date: string;
    data?: ScheduleV2GridShift;
    styleDef?: ShiftStyleV2;
    isWeekend?: boolean;
}

/**
 * Apple HIG styled schedule cell with gradient backgrounds and semantic colors.
 * - Day Shift (8h): Emerald gradient
 * - Day Shift (11h+): Indigo gradient
 * - Night Shift: Dark slate gradient
 * - Rest: Subtle gray
 * - Overtime: Rose badge
 */
const ScheduleCell: React.FC<ScheduleCellProps> = ({ date, data, styleDef, isWeekend }) => {
    // Determine visual style based on shift type
    let bgClass = 'bg-white/30'; // Default empty
    let textClass = 'text-gray-300';
    let label = '';
    let icon = '';
    let isNightShift = false;
    let showOvertimeBadge = false;

    if (data?.type === 'WORK' && styleDef) {
        // Parse hours from label if available
        const hours = parseInt(styleDef.label, 10);

        // Check if night shift based on text color hint
        isNightShift = styleDef.textColor.includes('blue') || styleDef.label.includes('夜');

        if (isNightShift) {
            // Night shift - dark elegant style
            bgClass = 'bg-gradient-to-br from-slate-600 to-slate-700';
            textClass = 'text-white';
            icon = '🌙';
            label = styleDef.label;
        } else if (hours >= 11) {
            // Long day shift - indigo
            bgClass = 'bg-gradient-to-br from-indigo-100 to-indigo-200';
            textClass = 'text-indigo-700';
            icon = '☀️';
            label = styleDef.label;
        } else {
            // Standard day shift - emerald
            bgClass = 'bg-gradient-to-br from-emerald-100 to-emerald-200';
            textClass = 'text-emerald-700';
            icon = '☀️';
            label = styleDef.label;
        }

        // Overtime indicator
        if (data.isOvertime) {
            showOvertimeBadge = true;
        }
    } else if (data?.type === 'REST') {
        bgClass = 'bg-gray-100/60';
        textClass = 'text-gray-400';
        label = '休';
    } else if (!data) {
        // Empty cell
        bgClass = isWeekend ? 'bg-gray-50/40' : 'bg-white/30';
        textClass = 'text-gray-300';
    }

    return (
        <div
            className={classNames(
                "h-full w-full flex items-center justify-center",
                "text-[11px] font-semibold",
                "rounded-lg",
                "transition-all duration-200 ease-out",
                "hover:scale-105 hover:shadow-md",
                "relative",
                bgClass,
                textClass
            )}
            title={data?.shiftName || '无排班'}
        >
            {/* Main content */}
            <div className="flex items-center gap-0.5">
                {icon && <span className="text-[10px]">{icon}</span>}
                <span>{label}</span>
            </div>

            {/* Overtime badge */}
            {showOvertimeBadge && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full shadow-sm" />
            )}
        </div>
    );
};

export default ScheduleCell;
