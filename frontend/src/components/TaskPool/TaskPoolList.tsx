import React, { useState, useEffect } from 'react';
import {
    Table, Button, Space, Tag, Popconfirm, Select, DatePicker, message, Badge
} from 'antd';
import {
    EditOutlined, DeleteOutlined, CheckCircleOutlined,
    CalendarOutlined, SyncOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { StandaloneTask, TaskType, TaskStatus } from './types';
import axios from 'axios';

const { RangePicker } = DatePicker;

interface TaskPoolListProps {
    onEditTask: (task: StandaloneTask) => void;
    onRefreshTriggered?: number;
}

const TaskPoolList: React.FC<TaskPoolListProps> = ({ onEditTask, onRefreshTriggered }) => {
    const [tasks, setTasks] = useState<StandaloneTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterType, setFilterType] = useState<string>('ALL');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
    const [batchDeleting, setBatchDeleting] = useState(false);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (filterType !== 'ALL') params.type = filterType;
            if (filterStatus !== 'ALL') params.status = filterStatus;
            if (dateRange && dateRange[1]) {
                params.deadline_before = dateRange[1].format('YYYY-MM-DD');
            }

            const response = await axios.get(`/api/standalone-tasks`, { params });
            const payload = response.data;
            const rows = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);
            setTasks(rows);
            setSelectedTaskIds((prev) => prev.filter((id) => rows.some((task: StandaloneTask) => task.id === id)));
        } catch (error) {
            console.error('Failed to fetch tasks', error);
            message.error('获取任务列表失败');
            setTasks([]);
            setSelectedTaskIds([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [filterType, filterStatus, dateRange, onRefreshTriggered]);

    const handleDelete = async (id: number) => {
        try {
            await axios.delete(`/api/standalone-tasks/${id}`);
            message.success('删除成功');
            setSelectedTaskIds((prev) => prev.filter((taskId) => taskId !== id));
            fetchTasks();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleComplete = async (id: number) => {
        try {
            await axios.post(`/api/standalone-tasks/${id}/complete`);
            message.success('任务已标记为完成');
            fetchTasks();
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleSelectAllFiltered = () => {
        setSelectedTaskIds(tasks.map((task) => task.id));
    };

    const handleClearSelection = () => {
        setSelectedTaskIds([]);
    };

    const handleBatchDelete = async () => {
        if (selectedTaskIds.length === 0) {
            return;
        }

        setBatchDeleting(true);
        try {
            const deleteResults = await Promise.allSettled(
                selectedTaskIds.map((id) => axios.delete(`/api/standalone-tasks/${id}`))
            );

            const failedCount = deleteResults.filter((result) => result.status === 'rejected').length;
            const successCount = deleteResults.length - failedCount;

            if (successCount > 0) {
                message.success(`已删除 ${successCount} 个任务`);
            }
            if (failedCount > 0) {
                message.warning(`${failedCount} 个任务删除失败，请刷新后重试`);
            }

            setSelectedTaskIds([]);
            fetchTasks();
        } catch (error) {
            message.error('批量删除失败');
        } finally {
            setBatchDeleting(false);
        }
    };

    const getTypeTag = (type: TaskType) => {
        switch (type) {
            case 'FLEXIBLE': return <Tag color="orange" icon={<CalendarOutlined />}>弹性窗口</Tag>;
            case 'RECURRING': return <Tag color="purple" icon={<SyncOutlined />}>周期性</Tag>;
            case 'AD_HOC': return <Tag color="blue" icon={<ClockCircleOutlined />}>临时</Tag>;
            default: return null;
        }
    };

    const getStatusBadge = (status: TaskStatus) => {
        switch (status) {
            case 'PENDING': return <Badge status="processing" text="待排班" />;
            case 'SCHEDULED': return <Badge status="success" text="已排班" />;
            case 'COMPLETED': return <Badge status="default" text="已完成" />;
            case 'CANCELLED': return <Badge status="error" text="已取消" />;
            default: return status;
        }
    };

    const renderTimeConstraint = (record: StandaloneTask) => {
        if (record.task_type === 'RECURRING') {
            // Simplified recurrence display for now
            return '依周期规则';
        }

        if (record.earliest_start && record.deadline) {
            return `${dayjs(record.earliest_start).format('MM-DD')} 至 ${dayjs(record.deadline).format('MM-DD')}`;
        }

        return `截止 ${dayjs(record.deadline).format('YYYY-MM-DD')}`;
    };

    const columns = [
        {
            title: '任务编号',
            dataIndex: 'task_code',
            key: 'task_code',
            width: 120,
            render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
        },
        {
            title: '任务名称',
            dataIndex: 'task_name',
            key: 'task_name',
        },
        {
            title: '类型',
            dataIndex: 'task_type',
            key: 'task_type',
            width: 120,
            render: (type: TaskType) => getTypeTag(type),
        },
        {
            title: '时间约束',
            key: 'time_constraint',
            render: (_: any, record: StandaloneTask) => renderTimeConstraint(record),
        },
        {
            title: '需求人数',
            dataIndex: 'required_people',
            key: 'required_people',
            width: 100,
            render: (num: number) => `${num} 人`,
        },
        {
            title: '预计工时',
            dataIndex: 'duration_minutes',
            key: 'duration_minutes',
            width: 100,
            render: (mins: number) => `${Math.round(mins / 60 * 10) / 10}h`,
        },
        {
            title: '所属部门',
            dataIndex: 'team_name',
            key: 'team_name',
            width: 120,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status: TaskStatus) => getStatusBadge(status),
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_: any, record: StandaloneTask) => (
                <Space size="middle">
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => onEditTask(record)}
                        disabled={record.status === 'COMPLETED'}
                    >
                        编辑
                    </Button>

                    {(record.status === 'PENDING' || record.status === 'SCHEDULED') && (
                        <Popconfirm
                            title="确认标记为已完成？"
                            onConfirm={() => handleComplete(record.id)}
                        >
                            <Button type="link" size="small" style={{ color: '#52c41a' }} icon={<CheckCircleOutlined />}>
                                完成
                            </Button>
                        </Popconfirm>
                    )}

                    <Popconfirm
                        title="确认删除该任务？"
                        onConfirm={() => handleDelete(record.id)}
                        okButtonProps={{ danger: true }}
                    >
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const rowSelection = {
        selectedRowKeys: selectedTaskIds,
        onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedTaskIds(newSelectedRowKeys.map((key) => Number(key)));
        },
    };

    return (
        <div className="task-pool-list bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                <Space size="middle">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm">类型:</span>
                        <Select
                            value={filterType}
                            onChange={setFilterType}
                            style={{ width: 120 }}
                            options={[
                                { value: 'ALL', label: '所有类型' },
                                { value: 'FLEXIBLE', label: '弹性窗口' },
                                { value: 'RECURRING', label: '周期性' },
                                { value: 'AD_HOC', label: '临时' },
                            ]}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm">状态:</span>
                        <Select
                            value={filterStatus}
                            onChange={setFilterStatus}
                            style={{ width: 120 }}
                            options={[
                                { value: 'ALL', label: '所有状态' },
                                { value: 'PENDING', label: '待排班' },
                                { value: 'SCHEDULED', label: '已排班' },
                                { value: 'COMPLETED', label: '已完成' },
                            ]}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm">截止日期:</span>
                        <RangePicker
                            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                            style={{ width: 250 }}
                        />
                    </div>
                </Space>

                <Space size="small">
                    <span className="text-slate-500 text-sm">已选 {selectedTaskIds.length} 项</span>
                    <Button
                        size="small"
                        onClick={handleSelectAllFiltered}
                        disabled={tasks.length === 0 || selectedTaskIds.length === tasks.length}
                    >
                        全选当前筛选 ({tasks.length})
                    </Button>
                    <Button
                        size="small"
                        onClick={handleClearSelection}
                        disabled={selectedTaskIds.length === 0}
                    >
                        清空选择
                    </Button>
                    <Popconfirm
                        title={`确认删除已选中的 ${selectedTaskIds.length} 个任务？`}
                        onConfirm={handleBatchDelete}
                        okButtonProps={{ danger: true, loading: batchDeleting }}
                        disabled={selectedTaskIds.length === 0}
                    >
                        <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            loading={batchDeleting}
                            disabled={selectedTaskIds.length === 0}
                        >
                            批量删除
                        </Button>
                    </Popconfirm>
                    <Button icon={<SyncOutlined />} onClick={fetchTasks} loading={loading || batchDeleting}>
                        刷新
                    </Button>
                </Space>
            </div>

            <Table
                columns={columns}
                dataSource={tasks}
                rowKey="id"
                rowSelection={rowSelection}
                loading={loading}
                pagination={{ pageSize: 15 }}
            />
        </div>
    );
};

export default TaskPoolList;
