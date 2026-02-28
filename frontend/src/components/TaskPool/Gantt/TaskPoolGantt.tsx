import React, { useState, useEffect, useMemo } from 'react';
import { Spin, Empty, message, DatePicker, Space, Button, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import GanttSidebar from './GanttSidebar';
import GanttTimeline from './GanttTimeline';
import { StandaloneTask } from '../types';

const { Text } = Typography;

export interface TaskAssignment {
    id: number;
    task_id: number;
    position_number: number;
    employee_id: number;
    employee_name?: string;
    assigned_date: string;
    assigned_shift_id: number;
    shift_name?: string;
    start_time?: string;
    end_time?: string;
}

const TaskPoolGantt: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [currentMonth, setCurrentMonth] = useState<dayjs.Dayjs>(dayjs());
    const [tasks, setTasks] = useState<StandaloneTask[]>([]);
    const [assignments, setAssignments] = useState<TaskAssignment[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const monthStr = currentMonth.format('YYYY-MM');
            const startDate = currentMonth.startOf('month').format('YYYY-MM-DD');
            const endDate = currentMonth.endOf('month').format('YYYY-MM-DD');

            const [tasksRes, assignmentsRes] = await Promise.all([
                axios.get('/api/standalone-tasks', {
                    params: { earliest_start_after: startDate, deadline_before: endDate }
                }),
                axios.get('/api/standalone-tasks/assignments', {
                    params: { month: monthStr }
                })
            ]);

            // Also include tasks that span across this month
            const allTasks: StandaloneTask[] = tasksRes.data.filter((t: StandaloneTask) => {
                const tStart = t.earliest_start ? dayjs(t.earliest_start) : dayjs(t.deadline);
                const tEnd = dayjs(t.deadline);
                const mStart = currentMonth.startOf('month');
                const mEnd = currentMonth.endOf('month');
                return tStart.isBefore(mEnd) && tEnd.isAfter(mStart);
            });

            setTasks(allTasks);
            setAssignments(assignmentsRes.data);
        } catch (error) {
            console.error('Failed to fetch gantt data:', error);
            message.error('加载任务数据失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentMonth]);

    // Group assignments by task_id
    const assignmentsByTask = useMemo(() => {
        const map = new Map<number, TaskAssignment[]>();
        for (const a of assignments) {
            if (!map.has(a.task_id)) map.set(a.task_id, []);
            map.get(a.task_id)!.push(a);
        }
        return map;
    }, [assignments]);

    const startDate = currentMonth.startOf('month').format('YYYY-MM-DD');
    const endDate = currentMonth.endOf('month').format('YYYY-MM-DD');

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header Toolbar */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
                <Space size="large">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-medium text-sm">月份:</span>
                        <DatePicker
                            picker="month"
                            value={currentMonth}
                            onChange={val => val && setCurrentMonth(val)}
                            allowClear={false}
                            bordered={false}
                            className="bg-white border border-slate-200 rounded-lg shadow-sm"
                        />
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-2 rounded-sm bg-orange-200 border border-orange-400" />
                            <span>弹性窗口</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-2 rounded-sm bg-purple-200 border border-purple-400" />
                            <span>周期性</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-2 rounded-sm bg-sky-200 border border-sky-400" />
                            <span>临时</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-1.5 rounded-sm bg-emerald-500" />
                            <span>已分配</span>
                        </div>
                    </div>
                </Space>

                <Button
                    icon={<SyncOutlined />}
                    onClick={fetchData}
                    loading={loading}
                    type="text"
                    className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                    刷新
                </Button>
            </div>

            {/* Gantt Area */}
            <Spin spinning={loading} wrapperClassName="flex-1 overflow-hidden">
                {tasks.length === 0 ? (
                    <div className="flex items-center justify-center bg-slate-50/30" style={{ minHeight: 400 }}>
                        <Empty description="该月份暂无独立任务" />
                    </div>
                ) : (
                    <div className="flex h-full w-full overflow-hidden">
                        <GanttSidebar tasks={tasks} assignmentsByTask={assignmentsByTask} />
                        <GanttTimeline
                            startDate={startDate}
                            endDate={endDate}
                            tasks={tasks}
                            assignmentsByTask={assignmentsByTask}
                        />
                    </div>
                )}
            </Spin>
        </div>
    );
};

export default TaskPoolGantt;
