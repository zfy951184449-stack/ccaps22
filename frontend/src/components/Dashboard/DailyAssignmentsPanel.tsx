/**
 * DailyAssignmentsPanel
 * 
 * 每日操作人员分配面板 - 展示所有批次的操作及人员分配
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WxbOverlay, WxbEmpty, WxbButton, WxbTooltip, WxbDatePicker, WxbChartShell } from '../wxb-ui';
import { Dayjs } from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardService } from '../../services/dashboardService';
import { DailyAssignmentsData, BatchData } from '../../types/dashboard';
import './DailyAssignmentsPanel.css';

/* ── Inline SVG icons ── */
const IconUsers = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
);
const IconClock = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
);
const IconChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);
const IconChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);
const IconCheckSquare = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" />
    </svg>
);
const IconSquare = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
);

// 批次颜色列表
const BATCH_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96',
    '#13c2c2', '#fa541c', '#2f54eb', '#a0d911', '#f5222d',
];

interface DailyAssignmentsPanelProps {
    date: Dayjs;
}

const DailyAssignmentsPanel: React.FC<DailyAssignmentsPanelProps> = ({ date }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DailyAssignmentsData | null>(null);
    const [selectedBatches, setSelectedBatches] = useState<number[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 滚动状态：是否可以向左/右滚动
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // 检查滚动状态
    const updateScrollState = React.useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) {
            setCanScrollLeft(false);
            setCanScrollRight(false);
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } = container;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }, []);

    // 监听滚动事件和窗口大小变化
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // 初始检查
        updateScrollState();

        // 监听滚动
        container.addEventListener('scroll', updateScrollState);
        // 监听窗口大小变化
        window.addEventListener('resize', updateScrollState);

        return () => {
            container.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
        };
    }, [updateScrollState, data, selectedBatches]);

    // 批次颜色映射
    const safeBatches = React.useMemo(() => (
        Array.isArray(data?.batches) ? (data?.batches ?? []) : []
    ), [data?.batches]);

    const batchColorMap = React.useMemo(() => {
        const map: Record<number, string> = {};
        safeBatches.forEach((batch, index) => {
            map[batch.batch_id] = BATCH_COLORS[index % BATCH_COLORS.length];
        });
        return map;
    }, [safeBatches]);

    const [selectedDate, setSelectedDate] = useState<Dayjs>(date);

    // Sync selectedDate when prop date (month) changes
    useEffect(() => {
        // If the month changes, reset selectedDate to the first day of that month
        if (!selectedDate.isSame(date, 'month')) {
            setSelectedDate(date.startOf('month'));
        }
    }, [date, selectedDate]);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const resData = await dashboardService.getDailyAssignments(selectedDate.format('YYYY-MM-DD'));
                setData(resData);
                // 每次日期变化时，自动选中所有批次
                const batches = Array.isArray(resData?.batches) ? resData.batches : [];
                if (batches.length > 0) {
                    setSelectedBatches(batches.map((b: BatchData) => b.batch_id));
                } else {
                    setSelectedBatches([]);
                }
            } catch (error) {
                console.error('Failed to load daily assignments:', error);
                setData(null);
                setSelectedBatches([]);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedDate]);


    // 过滤后的批次数据
    const filteredBatches = safeBatches.filter(b =>
        selectedBatches.includes(b.batch_id)
    );

    // 左右滚动卡片区域
    const scrollLeft = useCallback(() => {
        scrollContainerRef.current?.scrollBy({ left: -340, behavior: 'smooth' });
    }, []);

    const scrollRight = useCallback(() => {
        scrollContainerRef.current?.scrollBy({ left: 340, behavior: 'smooth' });
    }, []);

    // 全选 / 清空
    const allSelected = safeBatches.length > 0 && selectedBatches.length === safeBatches.length;
    const toggleAll = useCallback(() => {
        if (allSelected) {
            setSelectedBatches([]);
        } else {
            setSelectedBatches(safeBatches.map(b => b.batch_id));
        }
    }, [allSelected, safeBatches]);

    // 单个 Chip 点击
    const toggleBatch = useCallback((batchId: number) => {
        setSelectedBatches(prev =>
            prev.includes(batchId)
                ? prev.filter(id => id !== batchId)
                : [...prev, batchId]
        );
    }, []);

    return (
        <WxbChartShell
            icon={<IconUsers />}
            iconColor="green"
            title="每日操作人员分配"
            subtitle={`${selectedDate.format('YYYY-MM-DD')} · 批次操作与人员`}
            actions={
                <>
                    {/* Date Picker */}
                    <WxbDatePicker
                        value={selectedDate}
                        onChange={(d: any) => { if (d) setSelectedDate(d); }}
                        allowClear={false}
                        style={{ width: 120 }}
                        format="MM-DD"
                        showToday={false}
                        disabledDate={(current: any) => !current.isSame(date, 'month')}
                    />
                    {/* 左右滚动按钮 */}
                    <div style={{ display: 'flex', gap: 2 }}>
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={scrollLeft}
                            disabled={!canScrollLeft}
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronLeft />
                        </WxbButton>
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={scrollRight}
                            disabled={!canScrollRight}
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronRight />
                        </WxbButton>
                    </div>
                </>
            }
            className="daily-assignments-panel"
        >

            {/* 下行： Chip 批次筛选行 */}
            {safeBatches.length > 0 && (
                <div className="batch-filter-bar" style={{ marginBottom: 16 }}>
                    {/* 全选 / 清空按钮 */}
                    <WxbTooltip title={allSelected ? '清空选择' : '全部选中'} placement="top">
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={toggleAll}
                            className="batch-filter-toggle-btn-wxb"
                        >
                            {allSelected
                                ? <><IconCheckSquare /> <span style={{ marginLeft: 4 }}>全选</span></>
                                : <><IconSquare /> <span style={{ marginLeft: 4 }}>全选</span></>
                            }
                        </WxbButton>
                    </WxbTooltip>

                    <div className="batch-filter-divider" />

                    {/* 批次 Chip 列表 */}
                    {safeBatches.map(batch => {
                        const color = batchColorMap[batch.batch_id];
                        const isSelected = selectedBatches.includes(batch.batch_id);
                        return (
                            <WxbTooltip
                                key={batch.batch_id}
                                title={isSelected ? '点击取消筛选' : '点击筛选该批次'}
                                placement="top"
                            >
                                <div
                                    className={`batch-chip ${isSelected ? 'selected' : 'unselected'}`}
                                    style={isSelected ? {
                                        background: color,
                                        borderColor: color,
                                    } : {
                                        borderColor: `${color}30`,
                                    }}
                                    onClick={() => toggleBatch(batch.batch_id)}
                                >
                                    <span
                                        className="batch-chip-dot"
                                        style={{ background: isSelected ? 'rgba(255,255,255,0.8)' : color }}
                                    />
                                    {batch.batch_code}
                                </div>
                            </WxbTooltip>
                        );
                    })}
                </div>
            )}

            <WxbOverlay loading={loading}>
                {filteredBatches.length > 0 ? (
                    <div
                        className="batch-scroll-container"
                        ref={scrollContainerRef}
                    >
                        <AnimatePresence>
                            {filteredBatches.map(batch => {
                                const batchColor = batchColorMap[batch.batch_id];
                                const totalOps = batch.stages.reduce((sum, s) => sum + s.operations.length, 0);
                                return (
                                    <motion.div
                                        key={batch.batch_id}
                                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.96 }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                                        layout
                                        className="batch-card-premium"
                                        style={{ borderTop: `3px solid ${batchColor}` }}
                                    >
                                        {/* 批次标题 */}
                                        <div className="batch-card-header-premium">
                                            <span
                                                className="batch-tag-premium"
                                                style={{
                                                    color: batchColor,
                                                    background: `${batchColor}14`,
                                                    border: `1px solid ${batchColor}30`
                                                }}
                                            >
                                                {batch.batch_code}
                                            </span>
                                            <span style={{ fontSize: 12, color: 'var(--wx-fg-4, #8898A8)' }}>
                                                {totalOps} 项操作
                                            </span>
                                        </div>

                                        {/* 阶段列表 */}
                                        <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                                            {batch.stages.map(stage => (
                                                <div key={stage.stage_id} className="stage-section-premium">
                                                    <div className="stage-header-premium">
                                                        <span className="stage-name-premium">{stage.stage_name}</span>
                                                        <span className="stage-count-badge">{stage.operations.length}项</span>
                                                    </div>

                                                    {stage.operations.map(op => (
                                                        <div key={op.operation_plan_id} className="operation-item-premium">
                                                            <div className="operation-meta">
                                                                <span className="operation-time-premium">
                                                                    <IconClock />
                                                                    {op.start_time}
                                                                </span>
                                                                <span className="operation-headcount">{op.required_people}人</span>
                                                            </div>
                                                            <div className="operation-name-premium">{op.operation_name}</div>
                                                            <div className="assignments-flex">
                                                                {op.assignments.map(a => (
                                                                    <WxbTooltip
                                                                        key={a.position}
                                                                        title={a.employee_name ? `位置${a.position}: ${a.employee_name}` : `位置${a.position}: 待分配`}
                                                                    >
                                                                        <span className={`assignment-chip ${a.employee_name ? 'assigned' : 'unassigned'}`}>
                                                                            {a.position}. {a.employee_name || '--'}
                                                                        </span>
                                                                    </WxbTooltip>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                ) : (
                    !loading && <WxbEmpty />
                )}
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default DailyAssignmentsPanel;
