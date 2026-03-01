import React from 'react';
import { Typography, Badge } from 'antd';
import { StandaloneTask, TaskType, TaskStatus } from '../types';
import { TaskAssignment } from './TaskPoolGantt';

const { Text } = Typography;

interface GanttSidebarProps {
    tasks: StandaloneTask[];
    assignmentsByTask: Map<number, TaskAssignment[]>;
}

const TYPE_DOT: Record<TaskType, string> = {
    FLEXIBLE: 'bg-orange-400',
    RECURRING: 'bg-purple-500',
    AD_HOC: 'bg-sky-500',
};

const STATUS_CONFIG: Record<TaskStatus, { status: 'processing' | 'success' | 'default' | 'error'; text: string }> = {
    PENDING: { status: 'processing', text: '待排班' },
    SCHEDULED: { status: 'success', text: '已排班' },
    COMPLETED: { status: 'default', text: '已完成' },
    CANCELLED: { status: 'error', text: '已取消' },
};

const GanttSidebar: React.FC<GanttSidebarProps> = ({ tasks, assignmentsByTask }) => {
    return (
        <div className="w-60 flex-none border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">
            {/* Header row — must match timeline header height */}
            <div className="h-10 border-b border-slate-200 bg-slate-50 flex items-center px-4 shrink-0">
                <Text strong className="text-slate-600 text-xs">任务信息</Text>
            </div>

            {/* Task rows */}
            <div className="flex-1 overflow-y-auto">
                {tasks.map(task => {
                    const isCompleted = task.status === 'COMPLETED';
                    const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.PENDING;
                    const assigns = assignmentsByTask.get(task.id) || [];

                    return (
                        <div
                            key={task.id}
                            className={`px-3 py-2 border-b border-slate-100 flex flex-col justify-center min-h-[56px]
                                ${isCompleted ? 'opacity-40' : ''}`}
                        >
                            {/* Row 1: Type dot + Name */}
                            <div className="flex items-start gap-1.5 overflow-hidden">
                                <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${TYPE_DOT[task.task_type]}`} />
                                <div className="flex flex-col overflow-hidden w-full">
                                    <Text
                                        className="text-sm font-medium truncate leading-tight"
                                        title={task.task_name}
                                    >
                                        {task.task_name}
                                    </Text>
                                    {task.related_batch_code && (
                                        <Text type="secondary" className="text-xs truncate opacity-75 leading-none mt-1">
                                            ← {task.related_batch_code} {task.trigger_operation_name ? `· ${task.trigger_operation_name}后` : ''}
                                        </Text>
                                    )}
                                </div>
                            </div>
                            {/* Row 2: Status + People */}
                            <div className="flex items-center justify-between mt-1 pl-3.5">
                                <Badge status={statusCfg.status} text={<span className="text-xs text-slate-400">{statusCfg.text}</span>} />
                                <Text type="secondary" className="text-xs">{task.required_people}人</Text>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GanttSidebar;
