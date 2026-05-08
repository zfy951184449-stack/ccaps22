import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import QualifiedPersonnelModal from './QualifiedPersonnelModal';
import { SolverConfig, DEFAULT_SOLVER_CONFIG } from './SolverConfigurationModal';
import {
    WxbButton,
    WxbDataTable,
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbTag,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';

interface PositionRequirement {
    position_number: number;
    available_count: number;
    total_count: number;
    qualifications: {
        qualification_name: string;
        required_level: number;
        is_mandatory: boolean;
    }[];
}

interface OperationOperation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    required_people: number;
    status: string;
    share_group_name?: string;
    share_group_code?: string;
    share_group_ids?: string;
    positions: PositionRequirement[];
}

interface OperationReviewModalProps {
    visible: boolean;
    onCancel: () => void;
    batchIds: number[];
    month: Dayjs;
    onSuccess: (runId: number) => void;
    solverConfig?: SolverConfig;
}

const OperationReviewModal: React.FC<OperationReviewModalProps> = ({ visible, onCancel, batchIds, month, onSuccess, solverConfig = DEFAULT_SOLVER_CONFIG }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<OperationOperation[]>([]);

    // State for the detailed popup
    const [selectedPos, setSelectedPos] = useState<{
        operationId: number;
        positionNumber: number;
        requirements: any[];
    } | null>(null);

    // Precheck state
    const [precheckLoading, setPrecheckLoading] = useState(false);
    const [precheckResults, setPrecheckResults] = useState<{
        status: 'PASS' | 'WARNING' | 'ERROR';
        checks: { name: string; status: string; message: string; details?: any[] }[];
    } | null>(null);

    useEffect(() => {
        if (visible && batchIds.length > 0) {
            fetchOperations();
            setPrecheckResults(null); // Reset precheck on reopen
        } else {
            setData([]);
        }
    }, [visible, batchIds]);

    const fetchOperations = async () => {
        setLoading(true);
        try {
            const startDate = month.startOf('month').format('YYYY-MM-DD');
            const endDate = month.endOf('month').format('YYYY-MM-DD');

            const response = await fetch('/api/calendar/batch-operations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    batch_ids: batchIds,
                    start_date: startDate,
                    end_date: endDate,
                }),
            });

            const result = await response.json();

            if (Array.isArray(result)) {
                setData(result);
            } else {
                console.error("Unexpected API response:", result);
                message.error('加载操作详情失败');
            }
        } catch (error) {
            console.error('Error fetching operations:', error);
            message.error('获取操作数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const startDate = month.startOf('month').format('YYYY-MM-DD');
            const endDate = month.endOf('month').format('YYYY-MM-DD');

            const response = await fetch('/api/v4/scheduling/solve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    batch_ids: batchIds,
                    start_date: startDate,
                    end_date: endDate,
                    config: {
                        ...solverConfig
                    } // Optional config
                }),
            });

            const result = await response.json();

            if (result.success) {
                message.success('排班已启动！');
                const runId = result.data ? (result.data.id || result.data.runId) : result.runId;
                if (runId) {
                    onSuccess(runId);
                } else {
                    // Fallback if structure unsure
                    console.warn("Run ID not found in response", result);
                    onSuccess(0);
                }
            } else {
                message.error('启动排班失败：' + result.error);
            }
        } catch (error) {
            console.error('Error starting schedule:', error);
            message.error('启动排班出错');
        } finally {
            setLoading(false);
        }
    };

    const handlePrecheck = async () => {
        setPrecheckLoading(true);
        try {
            const startDate = month.startOf('month').format('YYYY-MM-DD');
            const endDate = month.endOf('month').format('YYYY-MM-DD');

            const response = await fetch('/api/v4/scheduling/precheck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batch_ids: batchIds,
                    start_date: startDate,
                    end_date: endDate,
                    config: { ...solverConfig },
                }),
            });

            const result = await response.json();
            if (result.success) {
                setPrecheckResults(result.data);
                const status = result.data?.status;
                if (status === 'PASS') message.success('预检通过！');
                else if (status === 'WARNING') message.warning('预检有警告，可继续排班');
                else message.error('预检发现错误，建议修正后再排班');
            } else {
                message.error('预检失败：' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('Precheck error:', error);
            message.error('预检请求失败');
        } finally {
            setPrecheckLoading(false);
        }
    };

    const columns: ColumnsType<OperationOperation> = [
        {
            title: '批次编号',
            dataIndex: 'batch_code',
            key: 'batch_code',
            width: 120,
        },
        {
            title: '操作',
            dataIndex: 'operation_name',
            key: 'operation_name',
            width: 180,
            ellipsis: true,
        },
        {
            title: '时间',
            key: 'time',
            width: 200,
            render: (_, record) => (
                <div className="solver-v4-time-cell">
                    <div>{dayjs(record.planned_start).format('MMM DD HH:mm')} -</div>
                    <div>{dayjs(record.planned_end).format('MMM DD HH:mm')}</div>
                </div>
            ),
        },
        {
            title: '岗位 & 资质',
            key: 'positions',
            render: (_, record) => {
                if (!record.positions || record.positions.length === 0) {
                    return <span className="solver-v4-muted-text">无特殊要求</span>;
                }

                return (
                    <div className="solver-v4-position-tags">
                        {record.positions.map(pos => {
                            // Scarcity Logic based on candidate count
                            const available = pos.available_count;

                            let color: WxbTagColor = 'green'; // >= 4 candidates
                            if (available === 0) color = 'red';
                            else if (available <= 3) color = 'amber';

                            return (
                                <WxbTag
                                    key={pos.position_number}
                                    color={color}
                                    className="solver-v4-clickable-tag"
                                    onClick={() => setSelectedPos({
                                        operationId: record.operation_plan_id,
                                        positionNumber: pos.position_number,
                                        requirements: pos.qualifications
                                    })}
                                >
                                    Pos {pos.position_number}: {pos.available_count} 人合格
                                </WxbTag>
                            );
                        })}
                    </div>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status) => {
                let color: WxbTagColor = 'neutral';
                if (status === 'READY') color = 'green';
                if (status === 'LOCKED') color = 'amber';
                if (status === 'PENDING') color = 'blue';

                return <WxbTag color={color}>{status}</WxbTag>;
            },
        },
    ];

    // Grouping Logic
    const groupedData = React.useMemo(() => {
        const groups: Record<string, { name: string, ops: OperationOperation[] }> = {};
        const independent: OperationOperation[] = [];

        data.forEach(op => {
            if (op.share_group_ids) {
                // Use IDs as the unique key for grouping
                const key = op.share_group_ids;
                if (!groups[key]) {
                    groups[key] = {
                        name: op.share_group_name || 'Unknown Group',
                        ops: []
                    };
                }
                groups[key].ops.push(op);
            } else {
                independent.push(op);
            }
        });

        return { groups, independent };
    }, [data]);

    return (
        <>
            <WxbModal
                title={`审查待排班操作 - ${month.format('YYYY年MM月')}`}
                open={visible}
                onCancel={onCancel}
                width={900}
                className="solver-v4-review-modal"
                footer={(
                    <div className="solver-v4-modal-footer">
                    <WxbButton key="cancel" type="button" variant="ghost" onClick={onCancel}>
                        取消
                    </WxbButton>
                    <WxbButton
                        key="precheck"
                        type="button"
                        variant="secondary"
                        onClick={handlePrecheck}
                        disabled={data.length === 0 || precheckLoading}
                        aria-busy={precheckLoading || undefined}
                    >
                        {precheckLoading ? '预检中...' : '预检'}
                    </WxbButton>
                    <WxbButton
                        key="confirm"
                        type="button"
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={loading}
                        aria-busy={loading || undefined}
                    >
                        {loading ? '启动中...' : '确认并排班'}
                    </WxbButton>
                    </div>
                )}
            >
                {/* Precheck Results Panel */}
                {precheckResults && (
                    <div className={`solver-v4-precheck-summary solver-v4-precheck-${precheckResults.status.toLowerCase()}`}>
                        <strong>
                            预检{precheckResults.status === 'PASS' ? '通过' : precheckResults.status === 'WARNING' ? '有警告' : '有错误'}
                        </strong>
                        <div>
                            {precheckResults.checks
                                .filter(c => c.status !== 'PASS')
                                .map((c, i) => (
                                    <p key={i}>{c.status === 'ERROR' ? '错误' : '警告'}：{c.message}</p>
                                ))}
                            {precheckResults.checks.every(c => c.status === 'PASS') && (
                                <p>所有 {precheckResults.checks.length} 项检查均通过</p>
                            )}
                        </div>
                        <WxbButton type="button" variant="ghost" size="sm" onClick={() => setPrecheckResults(null)}>
                            关闭
                        </WxbButton>
                    </div>
                )}
                <div className="solver-v4-review-stats">
                    已选批次：<strong>{batchIds.length}</strong> |
                    总操作数：<strong>{data.length}</strong> |
                    总岗位数：<strong>{data.reduce((sum, op) => sum + (op.positions?.length || op.required_people || 1), 0)}</strong>
                </div>

                <div className="solver-v4-info-panel">
                    <WxbIcon name="review-ok" size={18} />
                    <div>
                        <strong>本次 V4 排班会保留已锁定的操作人员和班次</strong>
                        <p>求解器会把锁定数据当作硬约束，应用结果时也不会覆盖这些人工锁定记录。</p>
                    </div>
                </div>

                {loading && data.length === 0 ? (
                    <div className="solver-v4-loading-text">加载中...</div>
                ) : (
                    <div className="solver-v4-review-groups">
                        {/* 1. Share Groups */}
                        {Object.entries(groupedData.groups).map(([key, groupData]) => (
                            <div key={key} className="solver-v4-review-group">
                                <div className="solver-v4-review-group-title">
                                    共享组：{groupData.name}
                                </div>
                                <WxbDataTable<OperationOperation>
                                    columns={columns}
                                    dataSource={groupData.ops}
                                    rowKey="operation_plan_id"
                                    pagination={false}
                                    size="small"
                                    density="compact"
                                />
                            </div>
                        ))}

                        {/* 2. Independent Operations */}
                        {groupedData.independent.length > 0 && (
                            <div className="solver-v4-review-group">
                                <div className="solver-v4-review-group-title">
                                    独立操作
                                </div>
                                <WxbDataTable<OperationOperation>
                                    columns={columns}
                                    dataSource={groupedData.independent}
                                    rowKey="operation_plan_id"
                                    pagination={false}
                                    size="small"
                                    density="compact"
                                />
                            </div>
                        )}

                        {data.length === 0 && !loading && (
                            <WxbEmpty description="所选批次在该时段内没有找到操作。" />
                        )}
                    </div>
                )}
            </WxbModal>

            <QualifiedPersonnelModal
                visible={!!selectedPos}
                onCancel={() => setSelectedPos(null)}
                operationId={selectedPos?.operationId || 0}
                positionNumber={selectedPos?.positionNumber || 0}
                requirements={selectedPos?.requirements}
            />
        </>
    );
};

export default OperationReviewModal;
