/**
 * 约束相关常量
 * 从 GanttModals.tsx 提取
 */

export const CONSTRAINT_TYPE_OPTIONS = [
    { value: 1, label: 'FS (Finish-to-Start)' },
    { value: 2, label: 'SS (Start-to-Start)' },
    { value: 3, label: 'FF (Finish-to-Finish)' },
    { value: 4, label: 'SF (Start-to-Finish)' }
];

export const LAG_TYPE_OPTIONS = [
    { value: 'ASAP', label: '尽早开始', color: 'green' },
    { value: 'FIXED', label: '固定延迟', color: 'blue' },
    { value: 'WINDOW', label: '时间窗口', color: 'cyan' },
    { value: 'NEXT_DAY', label: '次日开始', color: 'gold' },
    { value: 'NEXT_SHIFT', label: '下一班次', color: 'orange' },
    { value: 'COOLING', label: '冷却/培养', color: 'purple' },
    { value: 'BATCH_END', label: '批次结束后', color: 'magenta' }
];
