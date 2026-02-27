/**
 * 历史求解列表组件
 * 
 * 显示过往的 V3 求解记录
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Table,
    Tag,
    Space,
    Button,
    Tooltip,
    Empty,
    Spin,
    message,
} from 'antd';
import {
    HistoryOutlined,
    ReloadOutlined,
    EyeOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const API_BASE = '/api/v3/scheduling';

interface RunRecord {
    id: number;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    stage: string;
    window_start: string;
    window_end: string;
    created_at: string;
    completed_at: string | null;
}

interface HistoryRunListProps {
    onViewResult: (runId: number) => void;
    refreshTrigger?: number;
}

const HistoryRunList: React.FC<HistoryRunListProps> = ({
    onViewResult,
    refreshTrigger,
}) => {
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [loading, setLoading] = useState(false);

    // 加载历史记录
    const loadRuns = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/runs`);
            const data = await response.json();
            if (data.success) {
                setRuns(data.data || []);
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRuns();
    }, [loadRuns, refreshTrigger]);

    // 状态标签
    const renderStatus = (status: string) => {
        const config: Record<string, { color: string; icon: React.ReactNode }> = {
            QUEUED: { color: 'default', icon: <ClockCircleOutlined /> },
            RUNNING: { color: 'processing', icon: <SyncOutlined spin /> },
            COMPLETED: { color: 'success', icon: <CheckCircleOutlined /> },
            FAILED: { color: 'error', icon: <CloseCircleOutlined /> },
            CANCELLED: { color: 'warning', icon: <CloseCircleOutlined /> },
        };
        const { color, icon } = config[status] || config.QUEUED;
        return (
            <Tag color={color} icon={icon} style={{ fontSize: 11 }}>
                {status}
            </Tag>
        );
    };

    // 表格列
    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
        },
        {
            title: '时间范围',
            key: 'window',
            width: 180,
            render: (_: any, record: RunRecord) => (
                <span style={{ fontSize: 12 }}>
                    {dayjs(record.window_start).format('MM-DD')} ~ {dayjs(record.window_end).format('MM-DD')}
                </span>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: renderStatus,
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 11 }}>
                    {dayjs(v).format('MM-DD HH:mm')}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: any, record: RunRecord) => (
                <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => onViewResult(record.id)}
                    disabled={record.status !== 'COMPLETED'}
                >
                    查看
                </Button>
            ),
        },
    ];

    return (
        <Card
            size="small"
            title={
                <Space>
                    <HistoryOutlined />
                    <span>历史记录</span>
                </Space>
            }
            extra={
                <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={loadRuns}
                    loading={loading}
                >
                    刷新
                </Button>
            }
        >
            <Spin spinning={loading}>
                {runs.length > 0 ? (
                    <Table
                        dataSource={runs}
                        columns={columns}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 5, simple: true }}
                        style={{ fontSize: 12 }}
                    />
                ) : (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="暂无历史记录"
                    />
                )}
            </Spin>
        </Card>
    );
};

export default HistoryRunList;
