import React, { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import SolveResultV5Page from './SolveResultV5Page';
import { WxbButton, WxbDataTable, WxbIcon, WxbTag, WxbTooltip } from '../wxb-ui';

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
        return <WxbTag color="blue">求解中</WxbTag>;
    }

    if (record.status === 'APPLIED') {
        return <WxbTag color="green">已应用</WxbTag>;
    }

    // 失败 / 无解
    if (record.status === 'FAILED' && !record.solver_status) {
        return <WxbTag color="red">无解</WxbTag>;
    }

    // 根据 solver_status 判断
    if (record.solver_status === 'OPTIMAL') {
        return <WxbTag color="green">最优解</WxbTag>;
    }

    if (record.solver_status === 'FEASIBLE' || record.solver_status === 'FEASIBLE (Forced)') {
        const gapStr = record.gap !== null ? ` (Gap ${record.gap}%)` : '';
        return (
            <WxbTooltip title={`与最优解的理论差距: ${record.gap ?? '未知'}%`}>
                <WxbTag color="amber">可行解{gapStr}</WxbTag>
            </WxbTooltip>
        );
    }

    if (record.solver_status === 'INFEASIBLE') {
        return <WxbTag color="red">无解</WxbTag>;
    }

    // 兜底
    if (record.status === 'COMPLETED') {
        return <WxbTag color="green">已完成</WxbTag>;
    }

    return <WxbTag>{record.status}</WxbTag>;
};

const RunHistoryTab: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<RunRecord[]>([]);
    const [resultVisible, setResultVisible] = useState(false);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

    const fetchRuns = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/v5/scheduling/runs');
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
                <span className="solver-v5-code-text">
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
                return <span className="solver-v5-time-cell">{start} ~ {end}</span>;
            },
        },
        {
            title: '岗位填充率',
            dataIndex: 'fill_rate',
            key: 'fill_rate',
            width: 120,
            render: (val) => val !== null ? (
                <span className={`solver-v5-rate solver-v5-rate-${val >= 90 ? 'good' : val >= 70 ? 'warn' : 'bad'}`}>
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
            render: (text) => (
                <span className="solver-v5-time-cell">
                    {text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'}
                </span>
            ),
            sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
            defaultSortOrder: 'descend',
        },
        {
            title: '操作',
            key: 'actions',
            width: 130,
            fixed: 'right',
            render: (_, record) => (
                <div className="solver-v5-table-actions">
                    {['COMPLETED', 'APPLIED'].includes(record.status) && (
                        <WxbButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="solver-v5-nowrap-button"
                            onClick={() => handleViewResult(record.id)}
                        >
                            <WxbIcon name="inspect" size={14} />
                            查看结果
                        </WxbButton>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="solver-v5-tab-panel">
            <div className="solver-v5-action-footer solver-v5-action-footer-top">
                <span className="solver-v5-selection-text">
                    共 <strong>{data.length}</strong> 条历史记录
                </span>
                <WxbButton
                    type="button"
                    variant="secondary"
                    onClick={fetchRuns}
                    disabled={loading}
                    aria-busy={loading || undefined}
                >
                    <WxbIcon name="flow-divert" size={15} />
                    {loading ? '刷新中...' : '刷新'}
                </WxbButton>
            </div>

            <WxbDataTable<RunRecord>
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                density="standard"
                emptyState={{ description: '暂无求解历史记录' }}
                pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                scroll={{ x: 1100 }}
                size="middle"
            />

            <SolveResultV5Page
                visible={resultVisible}
                runId={selectedRunId}
                onClose={() => setResultVisible(false)}
            />
        </div>
    );
};

export default RunHistoryTab;
