/**
 * DailyAssignmentsPanel
 * 
 * 每日操作人员分配面板 - 展示所有批次的操作及人员分配
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, DatePicker, Select, Spin, Empty, Button, Tooltip, Tag } from 'antd';
import {
    CalendarOutlined,
    LeftOutlined,
    RightOutlined,
    FilterOutlined,
    TeamOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import './DailyAssignmentsPanel.css';

const API_BASE = '/api';

// 批次颜色列表
const BATCH_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96',
    '#13c2c2', '#fa541c', '#2f54eb', '#a0d911', '#f5222d',
];

interface Assignment {
    position: number;
    employee_name: string | null;
}

interface Operation {
    operation_plan_id: number;
    operation_name: string;
    start_time: string;
    end_time: string;
    required_people: number;
    assignments: Assignment[];
}

interface Stage {
    stage_id: number;
    stage_name: string;
    operations: Operation[];
}

interface BatchData {
    batch_id: number;
    batch_code: string;
    stages: Stage[];
}

interface DailyAssignmentsData {
    date: string;
    batches: BatchData[];
}


const DailyAssignmentsPanel: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [data, setData] = useState<DailyAssignmentsData | null>(null);
    const [selectedBatches, setSelectedBatches] = useState<number[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 批次颜色映射
    const batchColorMap = React.useMemo(() => {
        const map: Record<number, string> = {};
        data?.batches.forEach((batch, index) => {
            map[batch.batch_id] = BATCH_COLORS[index % BATCH_COLORS.length];
        });
        return map;
    }, [data?.batches]);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${API_BASE}/dashboard/daily-assignments`, {
                    params: { date: selectedDate.format('YYYY-MM-DD') },
                });
                setData(res.data);
                // 每次日期变化时，自动选中所有批次
                if (res.data?.batches?.length > 0) {
                    setSelectedBatches(res.data.batches.map((b: BatchData) => b.batch_id));
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


    // 日期导航
    const handlePrevDay = () => setSelectedDate(prev => prev.subtract(1, 'day'));
    const handleNextDay = () => setSelectedDate(prev => prev.add(1, 'day'));

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
            scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
        }
    };

    return (
        <Card
            className="daily-assignments-panel"
            title={
                <div className="panel-header">
                    <span className="panel-title">
                        <TeamOutlined /> 每日操作人员分配
                    </span>
                    <div className="panel-controls">
                        <div className="date-nav">
                            <Button
                                icon={<LeftOutlined />}
                                size="small"
                                onClick={handlePrevDay}
                            />
                            <DatePicker
                                value={selectedDate}
                                onChange={(date) => date && setSelectedDate(date)}
                                allowClear={false}
                                suffixIcon={<CalendarOutlined />}
                            />
                            <Button
                                icon={<RightOutlined />}
                                size="small"
                                onClick={handleNextDay}
                            />
                        </div>
                        <Select
                            mode="multiple"
                            placeholder="筛选批次"
                            value={selectedBatches}
                            onChange={setSelectedBatches}
                            options={batchOptions}
                            style={{ minWidth: 200 }}
                            maxTagCount={2}
                            suffixIcon={<FilterOutlined />}
                            allowClear
                        />
                    </div>
                </div>
            }
        >
            <Spin spinning={loading}>
                {filteredBatches.length > 0 ? (
                    <div className="batch-cards-wrapper">
                        <Button
                            className="scroll-btn scroll-btn-left"
                            icon={<LeftOutlined />}
                            onClick={scrollLeft}
                        />
                        <div className="batch-cards-container" ref={scrollContainerRef}>
                            {filteredBatches.map(batch => {
                                const totalOps = batch.stages.reduce((sum, s) => sum + s.operations.length, 0);
                                return (
                                    <div
                                        key={batch.batch_id}
                                        className="batch-card"
                                        style={{ borderTopColor: batchColorMap[batch.batch_id] }}
                                    >
                                        <div className="batch-card-header">
                                            <Tag color={batchColorMap[batch.batch_id]}>
                                                {batch.batch_code}
                                            </Tag>
                                            <span className="operation-count">
                                                {totalOps} 项操作
                                            </span>
                                        </div>
                                        <div className="stages-list">
                                            {batch.stages.map(stage => (
                                                <div key={stage.stage_id} className="stage-section">
                                                    <div className="stage-header">
                                                        <span className="stage-name">{stage.stage_name}</span>
                                                        <span className="stage-op-count">{stage.operations.length}项</span>
                                                    </div>
                                                    <div className="operations-list">
                                                        {stage.operations.map(op => (
                                                            <div key={op.operation_plan_id} className="operation-item">
                                                                <div className="operation-header">
                                                                    <span className="operation-time">
                                                                        <ClockCircleOutlined /> {op.start_time}
                                                                    </span>
                                                                    <span className="operation-name">{op.operation_name}</span>
                                                                    <span className="operation-people">{op.required_people}人</span>
                                                                </div>
                                                                <div className="assignments-row">
                                                                    {op.assignments.map(a => (
                                                                        <Tooltip
                                                                            key={a.position}
                                                                            title={a.employee_name ? `位置${a.position}: ${a.employee_name}` : `位置${a.position}: 待分配`}
                                                                        >
                                                                            <span
                                                                                className={`assignment-tag ${a.employee_name ? 'assigned' : 'unassigned'}`}
                                                                            >
                                                                                {a.position}. {a.employee_name || '--'}
                                                                            </span>
                                                                        </Tooltip>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Button
                            className="scroll-btn scroll-btn-right"
                            icon={<RightOutlined />}
                            onClick={scrollRight}
                        />
                    </div>
                ) : (
                    !loading && <Empty description="暂无数据" />
                )}
            </Spin>
        </Card>
    );
};

export default DailyAssignmentsPanel;
