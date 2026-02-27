/**
 * DailyAssignmentsPanel
 * 
 * 每日操作人员分配面板 - 展示所有批次的操作及人员分配
 */

import React, { useState, useEffect, useRef } from 'react';
import { Select, Spin, Empty, Button, Tooltip, Tag, DatePicker } from 'antd';
import {
    LeftOutlined,
    RightOutlined,
    FilterOutlined,
    TeamOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../common/GlassCard';
import { dashboardService } from '../../services/dashboardService';
import { DailyAssignmentsData, BatchData } from '../../types/dashboard';
import './DailyAssignmentsPanel.css';

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
    const batchColorMap = React.useMemo(() => {
        const map: Record<number, string> = {};
        data?.batches.forEach((batch, index) => {
            map[batch.batch_id] = BATCH_COLORS[index % BATCH_COLORS.length];
        });
        return map;
    }, [data?.batches]);

    const [selectedDate, setSelectedDate] = useState<Dayjs>(date);

    // Sync selectedDate when prop date (month) changes
    useEffect(() => {
        // If the month changes, reset selectedDate to the first day of that month
        if (!selectedDate.isSame(date, 'month')) {
            setSelectedDate(date.startOf('month'));
        }
    }, [date]);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const resData = await dashboardService.getDailyAssignments(selectedDate.format('YYYY-MM-DD'));
                setData(resData);
                // 每次日期变化时，自动选中所有批次
                if (resData.batches?.length > 0) {
                    setSelectedBatches(resData.batches.map((b: BatchData) => b.batch_id));
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

    // 批次筛选选项
    const batchOptions = data?.batches.map(b => ({
        value: b.batch_id,
        label: b.batch_code,
    })) || [];

    // 过滤后的批次数据
    const filteredBatches = data?.batches.filter(b =>
        selectedBatches.includes(b.batch_id)
    ) || [];

    // 左右滚动卡片区域
    const scrollLeft = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: -340, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: 340, behavior: 'smooth' });
        }
    };

    return (
        <GlassCard className="daily-assignments-panel">
            <div className="panel-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="panel-title" style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                    <div className="icon-wrapper" style={{
                        background: 'rgba(56, 158, 13, 0.1)', // customized green
                        padding: 8,
                        borderRadius: 12,
                        marginRight: 12,
                        color: '#52c41a'
                    }}>
                        <TeamOutlined />
                    </div>
                    每日操作人员分配
                </span>

                <div className="panel-controls" style={{ display: 'flex', gap: 12 }}>
                    {/* Date Picker (Day) */}
                    <div className="filter-item">
                        <DatePicker
                            value={selectedDate}
                            onChange={(d) => {
                                if (d) setSelectedDate(d);
                            }}
                            allowClear={false}
                            className="glass-input"
                            style={{ width: 130 }}
                            format="MM-DD"
                            showToday={false}
                            disabledDate={(current) => {
                                // Disable dates outside the selected month
                                return !current.isSame(date, 'month');
                            }}
                        />
                    </div>

                    {/* Batch Filter */}
                    <Select
                        mode="multiple"
                        placeholder="筛选批次"
                        value={selectedBatches}
                        onChange={setSelectedBatches}
                        options={batchOptions}
                        style={{ minWidth: 160 }}
                        maxTagCount={1}
                        suffixIcon={<FilterOutlined />}
                        allowClear
                        bordered={false}
                        className="glass-input"
                    />

                    {/* Scroll Controls (Only show if needed) */}
                    <div className="scroll-controls" style={{ display: 'flex', gap: 4 }}>
                        <Button
                            icon={<LeftOutlined />}
                            size="small"
                            onClick={scrollLeft}
                            disabled={!canScrollLeft}
                            shape="circle"
                            type="text"
                        />
                        <Button
                            icon={<RightOutlined />}
                            size="small"
                            onClick={scrollRight}
                            disabled={!canScrollRight}
                            shape="circle"
                            type="text"
                        />
                    </div>
                </div>
            </div>

            <Spin spinning={loading}>
                {filteredBatches.length > 0 ? (
                    <div className="batch-cards-wrapper" style={{ position: 'relative' }}>
                        <div
                            className="batch-cards-container"
                            ref={scrollContainerRef}
                            style={{
                                display: 'flex',
                                gap: 24,
                                overflowX: 'auto',
                                paddingBottom: 16,
                                paddingLeft: 4,
                                paddingRight: 4,
                                scrollBehavior: 'smooth',
                                scrollSnapType: 'x mandatory',
                                // Hide scrollbar but keep functionality
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none'
                            }}
                        >
                            <AnimatePresence>
                                {filteredBatches.map(batch => {
                                    const totalOps = batch.stages.reduce((sum, s) => sum + s.operations.length, 0);
                                    return (
                                        <motion.div
                                            key={batch.batch_id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            layout
                                            className="batch-card"
                                            style={{
                                                flex: '0 0 320px',
                                                background: '#fff',
                                                borderRadius: 16,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                                border: '1px solid rgba(0,0,0,0.04)',
                                                borderTop: `4px solid ${batchColorMap[batch.batch_id]}`,
                                                scrollSnapAlign: 'start',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <div className="batch-card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Tag color={batchColorMap[batch.batch_id]} style={{ margin: 0, fontSize: 14, padding: '4px 10px', borderRadius: 6 }}>
                                                    {batch.batch_code}
                                                </Tag>
                                                <span className="operation-count" style={{ color: '#8c8c8c', fontSize: 12 }}>
                                                    {totalOps} 项操作
                                                </span>
                                            </div>

                                            <div className="stages-list" style={{ padding: '12px 0', overflowY: 'auto', maxHeight: 400 }}>
                                                {batch.stages.map(stage => (
                                                    <div key={stage.stage_id} className="stage-section" style={{ marginBottom: 16 }}>
                                                        <div className="stage-header" style={{ padding: '0 20px 8px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                                            <span className="stage-name" style={{ fontWeight: 600, color: '#262626' }}>{stage.stage_name}</span>
                                                            <span className="stage-op-count" style={{ color: '#8c8c8c' }}>{stage.operations.length}项</span>
                                                        </div>
                                                        <div className="operations-list">
                                                            {stage.operations.map(op => (
                                                                <div key={op.operation_plan_id} className="operation-item" style={{
                                                                    padding: '8px 20px',
                                                                    borderLeft: '2px solid transparent',
                                                                    transition: 'all 0.3s'
                                                                }}>
                                                                    <div className="operation-header" style={{ marginBottom: 6 }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                            <span className="operation-time" style={{ color: '#1890ff', fontSize: 12 }}>
                                                                                <ClockCircleOutlined /> {op.start_time}
                                                                            </span>
                                                                            <span className="operation-people" style={{ color: '#8c8c8c', fontSize: 12 }}>{op.required_people}人</span>
                                                                        </div>
                                                                        <div className="operation-name" style={{ color: '#595959', fontSize: 13 }}>{op.operation_name}</div>
                                                                    </div>
                                                                    <div className="assignments-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                                        {op.assignments.map(a => (
                                                                            <Tooltip
                                                                                key={a.position}
                                                                                title={a.employee_name ? `位置${a.position}: ${a.employee_name}` : `位置${a.position}: 待分配`}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        fontSize: 12,
                                                                                        padding: '2px 8px',
                                                                                        borderRadius: 4,
                                                                                        background: a.employee_name ? '#f6ffed' : '#f5f5f5',
                                                                                        border: `1px solid ${a.employee_name ? '#b7eb8f' : '#d9d9d9'}`,
                                                                                        color: a.employee_name ? '#389e0d' : '#8c8c8c',
                                                                                        cursor: 'default'
                                                                                    }}
                                                                                >
                                                                                    {a.position}. {a.employee_name || '--'}
                                                                                </div>
                                                                            </Tooltip>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </div>
                ) : (
                    !loading && <Empty description="暂无数据" />
                )}
            </Spin>
        </GlassCard>
    );
};

export default DailyAssignmentsPanel;
