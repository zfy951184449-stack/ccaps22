/**
 * 班次配色 / 文案 —— 与排班矩阵语义一致:
 *   白班=绿、夜班=红、长白班=蓝、休息=灰、请假=琥珀。
 */
import { RosterCalendarShift, ShiftKind } from './types';

export const SHIFT_KIND_CLASS: Record<ShiftKind, string> = {
    day: 'rc-shift--day',
    night: 'rc-shift--night',
    long: 'rc-shift--long',
    rest: 'rc-shift--rest',
    leave: 'rc-shift--leave'
};

export const SHIFT_KIND_LABEL: Record<ShiftKind, string> = {
    day: '白班',
    night: '夜班',
    long: '长白班',
    rest: '休息',
    leave: '请假'
};

/** 单元格/明细里的完整班次文案,如「白班 11.5h」「夜班 12h」「休息」。 */
export const shiftPillLabel = (shift: RosterCalendarShift | null): string => {
    if (!shift) return '';
    if (shift.kind === 'rest') return '休息';
    if (shift.kind === 'leave') return '请假';
    const name = shift.shiftName || SHIFT_KIND_LABEL[shift.kind];
    const hours = shift.hours ? ` ${shift.hours}h` : '';
    return `${name}${hours}`;
};

/** 总览矩阵里的极简班次标识(工时数 / 休 / 假)。 */
export const shiftShortLabel = (shift: RosterCalendarShift | null): string => {
    if (!shift) return '';
    if (shift.kind === 'rest') return '休';
    if (shift.kind === 'leave') return '假';
    if (shift.hours) return String(shift.hours);
    return shift.shiftName || '班';
};

export const shiftKindClass = (shift: RosterCalendarShift | null): string =>
    shift ? SHIFT_KIND_CLASS[shift.kind] : '';

/** 批次色编码:按批次号稳定散列到 6 色板之一(色板在 RosterCalendar.css 的 .rc-batch-N)。 */
const BATCH_PALETTE = 6;
export const batchColorClass = (code: string): string => {
    if (!code) return 'rc-batch-0';
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return `rc-batch-${h % BATCH_PALETTE}`;
};
