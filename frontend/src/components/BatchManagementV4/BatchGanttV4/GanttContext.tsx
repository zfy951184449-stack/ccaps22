import React, { createContext, useContext, useState, ReactNode } from 'react';
import dayjs from 'dayjs';
import { GanttBatch, GanttContextType, LayoutMode, ViewMode } from './types';

const GanttContext = createContext<GanttContextType | undefined>(undefined);

export const GanttProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Dates
    const [startDate, setStartDate] = useState(dayjs().subtract(7, 'day').startOf('day'));
    const [endDate, setEndDate] = useState(dayjs().add(3, 'month').endOf('week'));

    // View Settings
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [layoutModeInternal, setLayoutModeInternal] = useState<LayoutMode>('standard');
    const [zoomLevel, setZoomLevel] = useState(100); // Default 100px per day

    // Wrapper to clear expandedStages when switching to compact mode
    const setLayoutMode = (mode: LayoutMode) => {
        if (mode === 'compact') {
            setExpandedStages(new Set()); // Compact 模式不需要 Stage 展开状态
        }
        setLayoutModeInternal(mode);
    };
    const layoutMode = layoutModeInternal;

    // Expansion State
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

    const expandAll = (batches: GanttBatch[]) => {
        if (batches && batches.length > 0) {
            const batchIds = new Set(batches.map(b => b.id));
            setExpandedBatches(batchIds);
            const stageKeys = new Set<string>();
            batches.forEach(batch => {
                batch.stages.forEach(stage => {
                    stageKeys.add(`batch-${batch.id}-stage-${stage.id}`);
                });
            });
            setExpandedStages(stageKeys);
        } else {
            clearExpansionState();
        }
    };

    const enterSingleDayMode = (date: dayjs.Dayjs, batches?: GanttBatch[]) => {
        // Save current state before switching
        setSavedViewState({
            startDate,
            endDate,
            zoomLevel,
            viewMode
        });

        // 单日模式下自动展开所有批次和阶段到操作层
        expandAll(batches || []);

        // Switch to single day mode
        setStartDate(date.startOf('day'));
        setEndDate(date.endOf('day'));
        setZoomLevel(1440); // 60px per hour * 24 = 1440px
        setViewMode('day');
    };

    const exitSingleDayMode = () => {
        if (savedViewState) {
            setStartDate(savedViewState.startDate);
            setEndDate(savedViewState.endDate);
            setZoomLevel(savedViewState.zoomLevel);
            setViewMode(savedViewState.viewMode);
            setSavedViewState(null);
        } else {
            // Fallback default
            const today = dayjs();
            setStartDate(today.subtract(1, 'week').startOf('week'));
            setEndDate(today.add(3, 'week').endOf('week'));
            setViewMode('week');
        }
    };

    // 单日模式内导航 - 切换日期并重新展开所有层级
    const navigateSingleDay = (direction: 'prev' | 'next', batches?: GanttBatch[]) => {
        const offset = direction === 'prev' ? -1 : 1;
        const newDate = startDate.add(offset, 'day');

        // 更新日期
        setStartDate(newDate.startOf('day'));
        setEndDate(newDate.endOf('day'));

        // 重新展开所有批次和阶段到操作层
        expandAll(batches || []);
    };

    return (
        <GanttContext.Provider value={{
            startDate,
            endDate,
            viewMode,
            layoutMode,
            zoomLevel,
            setStartDate,
            setEndDate,
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
            clearExpansionState
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
