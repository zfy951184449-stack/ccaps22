import dayjs from 'dayjs';

export type ViewMode = 'day' | 'week' | 'month';
export type LayoutMode = 'dense' | 'standard' | 'compact';

export interface GanttOperation {
    id: number;
    stage_id: number;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    color: string;
    progress: number;
    duration: number;
    requiredPeople: number;
    assignedPeople: number;
    windowStartDate?: string;
    windowEndDate?: string;
    // Off-screen metadata for connection lines
    isOffScreen?: boolean;
    offScreenDirection?: 'left' | 'right';
    batch_id?: number; // Added for context lookup
}

export interface GanttStage {
    id: number;
    batch_id: number;
    name: string;
    startDate: string;
    endDate: string;
    progress: number;
    operations: GanttOperation[];
}

export interface GanttBatch {
    id: number;
    name: string;
    code: string;
    startDate: string;
    endDate: string;
    status: string;
    color: string;
    stages: GanttStage[];
}

export interface GanttDependency {
    id: number;
    from: number; // Predecessor Operation ID
    to: number;   // Successor Operation ID
    type: string;
    // Optional: time_lag, lag_type if needed for rendering
}

export interface GanttShareGroup {
    id: number;
    group_name: string;
    share_mode: 'SAME_TEAM' | 'DIFFERENT_PEOPLE';
    member_operation_ids: number[];
}

// V2: Separate off-screen operation data for cross-day connection lines
export interface OffScreenOperation {
    id: number;
    direction: 'left' | 'right';
    linkedToOpId: number; // ID of the visible operation this connects to
}

/** 日期快捷预设类型 */
export type DatePreset = 'thisWeek' | 'next2Weeks' | 'thisMonth' | 'next3Months' | 'autoFit';

export interface GanttContextType {
    startDate: dayjs.Dayjs;
    endDate: dayjs.Dayjs;
    viewMode: ViewMode;
    layoutMode: LayoutMode;
    zoomLevel: number; // 1-100
    setStartDate: (date: dayjs.Dayjs) => void;
    setEndDate: (date: dayjs.Dayjs) => void;
    setViewMode: (mode: ViewMode) => void;
    setLayoutMode: (mode: LayoutMode) => void;
    setZoomLevel: (level: number) => void;
    expandedStages: Set<string>;
    toggleStage: (stageKey: string) => void;
    expandedBatches: Set<number>;
    toggleBatch: (batchId: number) => void;
    showShareGroupLines: boolean;
    setShowShareGroupLines: (show: boolean) => void;
    enterSingleDayMode: (date: dayjs.Dayjs, batches?: GanttBatch[]) => void;
    exitSingleDayMode: () => void;
    navigateSingleDay: (direction: 'prev' | 'next', batches?: GanttBatch[]) => void; // 单日模式翻页
    expandAll: (batches: GanttBatch[]) => void; // 展开所有批次和阶段
    clearExpansionState: () => void; // 清理展开状态
    applyDatePreset: (preset: DatePreset) => void; // 快捷日期预设
    markUserInteracted: () => void; // 标记用户已手动操作日期（阻止 auto-fit 覆盖）
    hasUserInteracted: boolean; // 是否已手动操作过日期
    onOperationDoubleClick?: (operation: GanttOperation) => void;
}
