import React, { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ScheduleV2GridEmployee, ShiftStyleV2, ScheduleV2GridShift } from '../types';
import {
    WxbBadge,
    WxbButton,
    WxbEmpty,
    WxbSpinner,
    WxbTableWrapper,
    WxbTooltip
} from '../../../components/wxb-ui';
import { usePinnedEmployees } from '../hooks/usePinnedEmployees';
import './PersonnelScheduleTable.css';

/** 表头高度，与 CSS 中 thead th 的 height 保持一致（置顶行 sticky 偏移的基准） */
const HEADER_HEIGHT = 48;
/** 数据行高度，与 CSS 中 tbody th/td 的 height 保持一致 */
const ROW_HEIGHT = 34;

const PinIcon = () => (
    <svg className="personnel-schedule-pin-icon" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="12" y1="17" x2="12" y2="22" />
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
);

interface PersonnelScheduleTableProps {
    currentMonth: Dayjs;
    employees: ScheduleV2GridEmployee[];
    styles: Record<string, ShiftStyleV2>;
    loading: boolean;
}

type ShiftStatus = 'success' | 'info' | 'warning' | 'error' | 'neutral';

interface ShiftDisplay {
    label: string;
    status: ShiftStatus;
    modifier: string;
    title: string;
}

dayjs.locale('zh-cn');

/**
 * PersonnelScheduleTable
 * 
 * Readable wxb-ui schedule matrix with native table semantics.
 */
const PersonnelScheduleTable: React.FC<PersonnelScheduleTableProps> = ({
    currentMonth,
    employees,
    styles,
    loading
}) => {
    const daysInMonth = currentMonth.daysInMonth();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => currentMonth.date(i + 1));
    const today = dayjs().format('YYYY-MM-DD');

    const { pinnedSet, togglePin, clearPins } = usePinnedEmployees();

    // 置顶员工排到最前（保持各自原有相对顺序），其余员工在后。
    const orderedEmployees = useMemo(() => {
        if (pinnedSet.size === 0) return employees;
        const pinned: ScheduleV2GridEmployee[] = [];
        const rest: ScheduleV2GridEmployee[] = [];
        employees.forEach(emp => (pinnedSet.has(emp.id) ? pinned : rest).push(emp));
        return [...pinned, ...rest];
    }, [employees, pinnedSet]);

    // 当前筛选结果中实际可见的置顶员工数（被搜索过滤掉的不计入）——置顶行恰好是前 N 行。
    const pinnedVisibleCount = useMemo(
        () => employees.reduce((acc, emp) => (pinnedSet.has(emp.id) ? acc + 1 : acc), 0),
        [employees, pinnedSet]
    );

    const getShiftDisplay = (shift: ScheduleV2GridShift | undefined): ShiftDisplay | null => {
        if (!shift) return null;

        let hoursLabel = '';
        if (shift.shiftId && styles[shift.shiftId]) {
            hoursLabel = styles[shift.shiftId].label;
        }

        let displayLabel = hoursLabel;
        if (!displayLabel && shift.shiftName) {
            displayLabel = shift.shiftName;
        }

        let formattedLabel = displayLabel;
        const num = Number(displayLabel);
        if (Number.isFinite(num)) {
            formattedLabel = Number(num).toString();
        }

        const logicKey = (shift.shiftName || '').toLowerCase();
        const isZeroHours = hoursLabel === '0.00' || hoursLabel === '0' || (shift.hours === 0);
        const baseTitle = shift.shiftName || '排班';

        if (shift.type === 'WORK') {
            if (isZeroHours) {
                return {
                    label: formattedLabel || '0',
                    status: 'neutral',
                    modifier: 'is-zero',
                    title: baseTitle
                };
            }

            if (logicKey.includes('夜') || logicKey.includes('night')) {
                return {
                    label: formattedLabel,
                    status: 'error',
                    modifier: 'is-night',
                    title: baseTitle
                };
            }

            if (logicKey.includes('长白') || logicKey.includes('long')) {
                return {
                    label: formattedLabel,
                    status: 'info',
                    modifier: 'is-long-day',
                    title: baseTitle
                };
            }

            return {
                label: formattedLabel,
                status: 'success',
                modifier: 'is-standard-day',
                title: baseTitle
            };
        } else if (shift.type === 'REST' || isZeroHours) {
            return {
                label: '休',
                status: 'neutral',
                modifier: 'is-rest',
                title: baseTitle
            };
        } else if (shift.type === 'LEAVE') {
            return {
                label: '假',
                status: 'warning',
                modifier: 'is-leave',
                title: baseTitle
            };
        }

        return null;
    };

    if (loading) {
        return (
            <div className="personnel-schedule-state">
                <WxbSpinner size={32} tip="正在加载排班数据..." />
            </div>
        );
    }

    if (employees.length === 0) {
        return (
            <div className="personnel-schedule-state">
                <WxbEmpty
                    description="暂无排班数据"
                    action={<span className="personnel-schedule-empty-help">请尝试调整筛选条件</span>}
                />
            </div>
        );
    }

    return (
        <WxbTableWrapper className="personnel-schedule-table-shell">
            <caption className="personnel-schedule-sr-only">
                {currentMonth.format('YYYY年 M月')}人员排班矩阵
            </caption>
            <colgroup>
                <col className="personnel-schedule-employee-col" />
                {daysArray.map(day => (
                    <col key={day.format('YYYY-MM-DD')} className="personnel-schedule-day-col" />
                ))}
            </colgroup>
            <thead>
                <tr>
                    <th scope="col" className="personnel-schedule-employee-header">
                        <div className="personnel-schedule-employee-header-inner">
                            <span className="personnel-schedule-employee-header-label">员工</span>
                            {pinnedVisibleCount > 0 && (
                                <WxbTooltip title="取消全部置顶">
                                    <WxbButton
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="personnel-schedule-unpin-all"
                                        onClick={clearPins}
                                        aria-label={`取消全部置顶，当前 ${pinnedVisibleCount} 人`}
                                    >
                                        <PinIcon />
                                        <span className="personnel-schedule-unpin-all-count">{pinnedVisibleCount}</span>
                                    </WxbButton>
                                </WxbTooltip>
                            )}
                        </div>
                    </th>
                    {daysArray.map((day, index) => {
                        const isToday = day.format('YYYY-MM-DD') === today;
                        const isWeekend = day.day() === 0 || day.day() === 6;
                        const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

                        return (
                            <th
                                key={day.format('YYYY-MM-DD')}
                                scope="col"
                                className={`personnel-schedule-day-header ${isWeekend ? 'is-weekend' : ''}`}
                            >
                                <span className={`personnel-schedule-day-chip ${isToday ? 'is-today' : ''}`}>
                                    <span className="personnel-schedule-day-number">
                                        {day.format('D')}
                                    </span>
                                    <span className="personnel-schedule-weekday">
                                        {weekdayNames[day.day()]}
                                    </span>
                                </span>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {orderedEmployees.map((emp, rowIndex) => {
                    const pinned = pinnedSet.has(emp.id);
                    // 置顶行恰好是前 pinnedVisibleCount 行，故 rowIndex 即其在置顶栈中的层级。
                    const stickyTop = pinned ? HEADER_HEIGHT + rowIndex * ROW_HEIGHT : undefined;
                    const isLastPinned = pinned && rowIndex === pinnedVisibleCount - 1;
                    const cellStyle = stickyTop !== undefined ? { top: stickyTop } : undefined;
                    const rowClassName = [
                        'personnel-schedule-row',
                        pinned ? 'is-pinned' : '',
                        isLastPinned ? 'is-last-pinned' : ''
                    ].filter(Boolean).join(' ');

                    return (
                        <tr key={emp.id} className={rowClassName}>
                            <th scope="row" className="personnel-schedule-employee-cell" style={cellStyle}>
                                <div className="personnel-schedule-employee-cell-inner">
                                    <span className="personnel-schedule-employee-info">
                                        <span className="personnel-schedule-employee-name" title={emp.name}>
                                            {emp.name}
                                        </span>
                                        <span className="personnel-schedule-employee-team" title={emp.teamName || emp.code}>
                                            {emp.teamName || emp.code}
                                        </span>
                                    </span>
                                    <WxbTooltip title={pinned ? '取消置顶' : '置顶'}>
                                        <WxbButton
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className={`personnel-schedule-pin-btn ${pinned ? 'is-pinned' : ''}`}
                                            onClick={() => togglePin(emp.id)}
                                            aria-label={pinned ? `取消置顶 ${emp.name}` : `置顶 ${emp.name}`}
                                            aria-pressed={pinned}
                                        >
                                            <PinIcon />
                                        </WxbButton>
                                    </WxbTooltip>
                                </div>
                            </th>
                            {daysArray.map((day) => {
                                const dateStr = day.format('YYYY-MM-DD');
                                const shift = emp.shifts[dateStr];
                                const isWeekend = day.day() === 0 || day.day() === 6;
                                const shiftDisplay = getShiftDisplay(shift);
                                const specialCoverageTitle = (shift?.specialCoverageCodes || []).join(', ');

                                return (
                                    <td
                                        key={`${emp.id}-${dateStr}`}
                                        className={`personnel-schedule-cell ${isWeekend ? 'is-weekend' : ''}`}
                                        style={cellStyle}
                                    >
                                        {shiftDisplay && (
                                            <span className="personnel-schedule-shift-wrap">
                                                <WxbBadge
                                                    variant="outline"
                                                    status={shiftDisplay.status}
                                                    label={shiftDisplay.label}
                                                    className={`personnel-schedule-shift ${shiftDisplay.modifier}`}
                                                    title={shiftDisplay.title}
                                                />
                                                {(shift?.specialCoverageCount || 0) > 0 && (
                                                    <WxbTooltip title={specialCoverageTitle || '特殊覆盖'}>
                                                        <span
                                                            className="personnel-schedule-special-dot"
                                                            aria-label="特殊覆盖"
                                                        />
                                                    </WxbTooltip>
                                                )}
                                            </span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
            </tbody>
        </WxbTableWrapper>
    );
};

export default PersonnelScheduleTable;
