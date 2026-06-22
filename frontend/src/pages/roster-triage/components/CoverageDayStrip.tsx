import React from 'react';
import { Dayjs } from 'dayjs';
import { WorkdayMap } from '../../personnel-scheduling/types';
import { vacancySeverity, SeverityLevel } from '../triageModel';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;

/** 严重度 → 迷你条底色/字色(全令牌)。 */
const SEV_STYLE: Record<SeverityLevel, { bg: string; fg: string }> = {
    none: { bg: 'var(--wx-surface-2)', fg: 'var(--wx-fg-4)' },
    s1: { bg: 'var(--wx-amber-100)', fg: 'var(--wx-amber-700)' },
    s2: { bg: 'var(--wx-amber-500)', fg: 'var(--wx-fg-1)' },
    s3: { bg: 'var(--wx-red-100)', fg: 'var(--wx-red-700)' },
    s4: { bg: 'var(--wx-red-500)', fg: 'var(--wx-bg)' }
};

interface Props {
    days: Dayjs[];
    dayTotals: Record<string, number>;
    dayTypes: WorkdayMap;
    selectedDate: string | null;
    onSelectDate: (date: string | null) => void;
}

/** 每日缺口迷你条:每天一格,底色随当日缺口合计加深;点某天=把工单流过滤到该天。 */
const CoverageDayStrip: React.FC<Props> = ({ days, dayTotals, dayTypes, selectedDate, onSelectDate }) => (
    <div className="rt-daystrip">
        {days.map((d) => {
            const dateStr = d.format('YYYY-MM-DD');
            const total = dayTotals[dateStr] || 0;
            const sev = vacancySeverity(total);
            const dt = dayTypes[dateStr];
            const isHoliday = dt?.dayType === 'holiday';
            const isMakeup = dt?.dayType === 'makeup';
            const isWeekend = mondayIndex(d) >= 5 && !isMakeup;
            const sel = selectedDate === dateStr;
            const style = total > 0 ? { background: SEV_STYLE[sev].bg } : undefined;

            return (
                <button
                    type="button"
                    key={dateStr}
                    className={`rt-day ${sel ? 'rt-day--selected' : ''}`}
                    style={style}
                    aria-pressed={sel}
                    aria-label={`${d.format('M月D日')} 缺口 ${total} 人次`}
                    onClick={() => onSelectDate(sel ? null : dateStr)}
                >
                    <div className={`rt-day-dow ${isHoliday || isWeekend ? 'rt-day-dow--off' : ''}`}>周{WEEKDAYS[mondayIndex(d)]}</div>
                    <div className="rt-day-date">{d.date()}</div>
                    {isHoliday || isMakeup ? (
                        <div className="rt-day-mark">{isHoliday ? '休' : '班'}</div>
                    ) : total > 0 ? (
                        <div className="rt-day-val" style={{ color: SEV_STYLE[sev].fg }}>缺{total}</div>
                    ) : (
                        <div className="rt-day-val rt-day-val--ok">—</div>
                    )}
                </button>
            );
        })}
    </div>
);

export default CoverageDayStrip;
