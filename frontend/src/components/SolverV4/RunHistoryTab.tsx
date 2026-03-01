import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, message, Space, Tooltip } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import SolveResultV4Page from './SolveResultV4Page';

interface RunRecord {
    id: number;
    run_code: string;
    status: string;         // QUEUED / RUNNING / COMPLETED / FAILED
    stage: string;
    solver_status: string | null;  // OPTIMAL / FEASIBLE / null
    gap: number | null;
    fill_rate: number | null;
    solve_time: number | null;
    window_start: string;
    window_end: string;
    created_at: string;
    completed_at: string | null;
}

/** 求解质量展示 */
const SolverQualityTag: React.FC<{ record: RunRecord }> = ({ record }) => {
    // 正在运行
    if (['QUEUED', 'RUNNING'].includes(record.status)) {
        return <Tag color="processing">🔵 求解中</Tag>;
    }

    if (record.status === 'APPLIED') {
        return <Tag color="success">✅ 已应用</Tag>;
    }

    // 失败 / 无解
    if (record.status === 'FAILED' && !record.solver_status) {
        return <Tag color="error">❌ 无解</Tag>;
    }

    // 根据 solver_status 判断
    if (record.solver_status === 'OPTIMAL') {
        return <Tag color="success">✅ 最优解</Tag>;
    }

    if (record.solver_status === 'FEASIBLE' || record.solver_status === 'FEASIBLE (Forced)') {
        const gapStr = record.gap !== null ? ` (Gap ${record.gap}%)` : '';
        return (
            <Tooltip title={`与最优解的理论差距: ${record.gap ?? '未知'}%`}>
                <Tag color="warning">🟡 可行解{gapStr}</Tag>
            </Tooltip>
        );
    }

    if (record.solver_status === 'INFEASIBLE') {
        return <Tag color="error">❌ 无解</Tag>;
    }

    // 兜底
    if (record.status === 'COMPLETED') {
        return <Tag color="success">✅ 已完成</Tag>;
    }

    return <Tag color="default">{record.status}</Tag>;
};

const RunHistoryTab: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<RunRecord[]>([]);
    const [resultVisible, setResultVisible] = useState(false);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

    const fetchRuns = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/v4/scheduling/runs');
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                setData(result.data);
            } else {
                message.error('获取历史记录失败');
            }
        } catch (error) {
            console.error('Failed to fetch runs:', error);
            message.error('获取历史记录失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRuns();
    }, [fetchRuns]);

    const handleViewResult = (runId: number) => {
        setSelectedRunId(runId);
        setResultVisible(true);
    };

    const columns: ColumnsType<RunRecord> = [
        {
            title: '运行编号',
            dataIndex: 'run_code',
            key: 'run_code',
            width: 180,
            render: (text) => (
                <span style={{ fontFamily: 'SF Mono, monospace', fontSize: 12, color: '#86868B' }}>
                    {text}
                </span>
            ),
        },
        {
            title: '求解质量',
            key: 'quality',
            width: 180,
            render: (_, record) => <SolverQualityTag record={record} />,
        },
        {
            title: '时间窗口',
            key: 'window',
            width: 200,
            render: (_, record) => {
                const start = record.window_start ? dayjs(record.window_start).format('YYYY-MM-DD') : '-';
                const end = record.window_end ? dayjs(record.window_end).format('YYYY-MM-DD') : '-';
                return <span>{start} ~ {end}</span>;
            },
        },
        {
            title: '岗位填充率',
            dataIndex: 'fill_rate',
            key: 'fill_rate',
            width: 120,
            render: (val) => val !== null ? (
                <span style={{ fontWeight: 600, color: val >= 90 ? '#34C759' : val >= 70 ? '#FF9500' : '#FF3B30' }}>
                    {val}%
                </span>
            ) : '-',
        },
        {
            title: '求解耗时',
            dataIndex: 'solve_time',
            key: 'solve_time',
            width: 100,
            render: (val) => val !== null ? `${val}s` : '-',
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 170,
            render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
            sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
            defaultSortOrder: 'descend',
        },
        {
            title: '操作',
            key: 'actions',
            width: 150,
            render: (_, record) => (
                <Space>
                    {['COMPLETED', 'APPLIED'].includes(record.status) && (
                        <Button
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => handleViewResult(record.id)}
                        >
                            查看结果
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#86868B', fontSize: 13 }}>
                    共 <strong style={{ color: '#1D1D1F' }}>{data.length}</strong> 条历史记录
                </span>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchRuns}
                    loading={loading}
                >
                    刷新
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                size="middle"
            />

            <SolveResultV4Page
                visible={resultVisible}
                runId={selectedRunId}
                onClose={() => setResultVisible(false)}
            />
        </>
    );
};

export default RunHistoryTab;
