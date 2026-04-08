import React, { createContext, useContext, useState, ReactNode, useRef, useCallback, startTransition, useEffect } from 'react';
import dayjs from 'dayjs';
import { GanttBatch, GanttContextType, LayoutMode, ViewMode, DatePreset } from './types';

const GanttContext = createContext<GanttContextType | undefined>(undefined);

// ─── URL 参数工具函数 ───────────────────────────────────────────────
const GANTT_FROM_PARAM = 'gantt_from';
const GANTT_TO_PARAM = 'gantt_to';

function readDateFromUrl(param: string): dayjs.Dayjs | null {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get(param);
    if (!value) return null;
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
}

function writeDatesToUrl(from: dayjs.Dayjs, to: dayjs.Dayjs) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set(GANTT_FROM_PARAM, from.format('YYYY-MM-DD'));
    url.searchParams.set(GANTT_TO_PARAM, to.format('YYYY-MM-DD'));
    window.history.replaceState(null, '', url.toString());
}

// ─── 智能初始日期策略 ──────────────────────────────────────────────
// 1. URL 参数优先（分享链接 / 刷新保持）
// 2. 否则使用"包含今天"的合理默认值
function getInitialDates(): { start: dayjs.Dayjs; end: dayjs.Dayjs; fromUrl: boolean } {
    const urlFrom = readDateFromUrl(GANTT_FROM_PARAM);
    const urlTo = readDateFromUrl(GANTT_TO_PARAM);

    if (urlFrom && urlTo && urlTo.isAfter(urlFrom)) {
        return { start: urlFrom, end: urlTo, fromUrl: true };
    }

    // 默认：本周一 ~ +4周末（确保包含今天）
    return {
        start: dayjs().startOf('week'),
        end: dayjs().add(4, 'week').endOf('week'),
        fromUrl: false,
    };
}

// ─── 日期预设计算 ──────────────────────────────────────────────────
function computeDatePreset(preset: Exclude<DatePreset, 'autoFit'>): { start: dayjs.Dayjs; end: dayjs.Dayjs } {
    const today = dayjs();
    switch (preset) {
        case 'thisWeek':
            return { start: today.startOf('week'), end: today.endOf('week') };
        case 'next2Weeks':
            return { start: today.startOf('week'), end: today.add(2, 'week').endOf('week') };
        case 'thisMonth':
            return { start: today.startOf('month'), end: today.endOf('month') };
        case 'next3Months':
            return { start: today.startOf('week'), end: today.add(3, 'month').endOf('week') };
    }
}

export const GanttProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // ─── 初始日期（URL > 默认值）───────────────────────────────────
    const initialDates = getInitialDates();
    const [startDate, setStartDate] = useState(initialDates.start);
    const [endDate, setEndDate] = useState(initialDates.end);

    // ─── 竞态防御：用户手动操作日期后，auto-fit 不再覆盖 ──────────
    // URL 来源视为用户主动意图，同样阻止 auto-fit 覆盖
    const userInteractedRef = useRef(initialDates.fromUrl);
    const [hasUserInteracted, setHasUserInteracted] = useState(initialDates.fromUrl);

    const markUserInteracted = useCallback(() => {
        userInteractedRef.current = true;
        setHasUserInteracted(true);
    }, []);

    // ─── View Settings ────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [layoutModeInternal, setLayoutModeInternal] = useState<LayoutMode>('dense');
    const [zoomLevel, setZoomLevel] = useState(100); // Default 100px per day

    // Wrapper to clear expandedStages when switching layout mode
    const setLayoutMode = (mode: LayoutMode) => {
        if (mode === 'compact' || mode === 'dense') {
            // compact 和 dense 模式切换时重置 Stage 展开状态
            // dense 进入时从 batch→stage 两层视图开始，避免从 standard 模式带入脏状态
            setExpandedStages(new Set());
        }
        setLayoutModeInternal(mode);
    };
    const layoutMode = layoutModeInternal;

    // ─── Expansion State ──────────────────────────────────────────
    const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

    // Share Group Lines Visibility
    const [showShareGroupLines, setShowShareGroupLines] = useState(true);

    // Saved View State for restoration
    const [savedViewState, setSavedViewState] = useState<{
        startDate: dayjs.Dayjs;
        endDate: dayjs.Dayjs;
        zoomLevel: number;
        viewMode: ViewMode;
    } | null>(null);

    // 单日模式导航防抖 ref：防止快速连续切换日期导致 N+1 次 API 请求
    const navigateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── URL 同步：日期变化时回写 URL ─────────────────────────────
    useEffect(() => {
        writeDatesToUrl(startDate, endDate);
    }, [startDate, endDate]);

    // ─── Wrapped setters（标记用户交互）──────────────────────────
    const setStartDateWithInteraction = useCallback((date: dayjs.Dayjs) => {
        markUserInteracted();
        setStartDate(date);
    }, [markUserInteracted]);

    const setEndDateWithInteraction = useCallback((date: dayjs.Dayjs) => {
        markUserInteracted();
        setEndDate(date);
    }, [markUserInteracted]);

    // ─── 日期预设快捷方法 ─────────────────────────────────────────
    const applyDatePreset = useCallback((preset: DatePreset) => {
        if (preset === 'autoFit') {
            // autoFit 重置用户交互标记，让 auto-fit 逻辑重新运行
            userInteractedRef.current = false;
            setHasUserInteracted(false);
            return;
        }

        const { start, end } = computeDatePreset(preset);
        markUserInteracted();
        setStartDate(start);
        setEndDate(end);
    }, [markUserInteracted]);

    const toggleBatch = (batchId: number) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchId)) next.delete(batchId);
            else next.add(batchId);
            return next;
        });
    };

    const toggleStage = (stageKey: string) => {
        setExpandedStages(prev => {
            const next = new Set(prev);
            if (next.has(stageKey)) next.delete(stageKey);
            else next.add(stageKey);
            return next;
        });
    };

    // Helper to clear all expansion state
    const clearExpansionState = () => {
        setExpandedBatches(new Set());
        setExpandedStages(new Set());
    };

    const expandAll = useCallback((batches: GanttBatch[]) => {
        if (batches && batches.length > 0) {
            const batchIds = new Set(batches.map(b => b.id));
            const stageKeys = new Set<string>();
            batches.forEach(batch => {
                batch.stages.forEach(stage => {
                    stageKeys.add(`batch-${batch.id}-stage-${stage.id}`);
                });
            });
            // 使用 startTransition 包裹批量展开，避免阻塞高优先级的 loading 状态更新
            startTransition(() => {
                setExpandedBatches(batchIds);
                setExpandedStages(stageKeys);
            });
        } else {
            startTransition(() => {
                setExpandedBatches(new Set());
                setExpandedStages(new Set());
            });
        }
    }, []);

    const enterSingleDayMode = (date: dayjs.Dayjs, batches?: GanttBatch[]) => {
        // Save current state before switching
        setSavedViewState({
            startDate,
            endDate,
            zoomLevel,
            viewMode
        });

        // 单日模式下自动展开所有批次和阶段到操作层（低优先级）
        expandAll(batches || []);

        // Switch to single day mode（高优先级，立即更新）
        setStartDate(date.startOf('day'));
        setEndDate(date.endOf('day'));
        setZoomLevel(1440); // 60px per hour * 24 = 1440px
        setViewMode('day');
    };

    const exitSingleDayMode = () => {
        // 清除防抖计时器
        if (navigateDebounceRef.current) {
            clearTimeout(navigateDebounceRef.current);
            navigateDebounceRef.current = null;
        }

        if (savedViewState) {
            setStartDate(savedViewState.startDate);
            setEndDate(savedViewState.endDate);
            setZoomLevel(savedViewState.zoomLevel);
            setViewMode(savedViewState.viewMode);
            setSavedViewState(null);
        } else {
            // Fallback：与初始默认值保持一致（包含今天的本周~+4周）
            setStartDate(dayjs().startOf('week'));
            setEndDate(dayjs().add(4, 'week').endOf('week'));
            setViewMode('week');
        }
    };

    // 单日模式内导航 - 使用防抖避免快速切换触发多次 API
    const navigateSingleDay = useCallback((direction: 'prev' | 'next', batches?: GanttBatch[]) => {
        const offset = direction === 'prev' ? -1 : 1;

        // 清除上一个防抖计时器
        if (navigateDebounceRef.current) {
            clearTimeout(navigateDebounceRef.current);
        }

        navigateDebounceRef.current = setTimeout(() => {
            setStartDate(prev => {
                const newDate = prev.add(offset, 'day').startOf('day');
                setEndDate(newDate.endOf('day'));
                return newDate;
            });
            navigateDebounceRef.current = null;
        }, 80); // 80ms 防抖：足够短以保持响应性，又能防止快速点击 N+1 次请求
    }, []);

    return (
        <GanttContext.Provider value={{
            startDate,
            endDate,
            viewMode,
            layoutMode,
            zoomLevel,
            setStartDate: setStartDateWithInteraction,
            setEndDate: setEndDateWithInteraction,
            setViewMode,
            setLayoutMode,
            setZoomLevel,
            expandedBatches,
            toggleBatch,
            expandedStages,
            toggleStage,
            showShareGroupLines,
            setShowShareGroupLines,
            enterSingleDayMode,
            exitSingleDayMode,
            navigateSingleDay,
            expandAll,
            clearExpansionState,
            applyDatePreset,
            markUserInteracted,
            hasUserInteracted,
        }}>
            {children}
        </GanttContext.Provider>
    );
};

export const useGantt = () => {
    const context = useContext(GanttContext);
    if (!context) {
        throw new Error('useGantt must be used within a GanttProvider');
    }
    return context;
};
