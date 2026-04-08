import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Badge, message, Tag, Alert } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import QualifiedPersonnelModal from './QualifiedPersonnelModal';
import { SolverConfig, DEFAULT_SOLVER_CONFIG } from './SolverConfigurationModal';

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
                <div style={{ fontSize: '12px' }}>
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
                    return <span style={{ color: '#ccc' }}>无特殊要求</span>;
                }

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {record.positions.map(pos => {
                            // Scarcity Logic based on candidate count
                            const available = pos.available_count;

                            let color = 'success'; // >= 4 candidates
                            if (available === 0) color = 'error';
                            else if (available === 1) color = 'warning';
                            else if (available <= 3) color = 'gold';

                            return (
                                <Tag
                                    key={pos.position_number}
                                    color={color}
                                    style={{ cursor: 'pointer', margin: 0, width: 'fit-content' }}
                                    onClick={() => setSelectedPos({
                                        operationId: record.operation_plan_id,
                                        positionNumber: pos.position_number,
                                        requirements: pos.qualifications
                                    })}
                                >
                                    Pos {pos.position_number}: {pos.available_count} 人合格
                                </Tag>
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
                let color = 'default';
                if (status === 'READY') color = 'success';
                if (status === 'LOCKED') color = 'warning';
                if (status === 'PENDING') color = 'processing';

                return <Badge status={color as any} text={status} />;
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
            <Modal
                title={`审查待排班操作 - ${month.format('YYYY年MM月')}`}
                open={visible}
                onCancel={onCancel}
                width={900}
                footer={[
                    <Button key="cancel" onClick={onCancel}>
                        取消
                    </Button>,
                    <Button
                        key="precheck"
                        onClick={handlePrecheck}
                        loading={precheckLoading}
                        disabled={data.length === 0}
                    >
                        预检
                    </Button>,
                    <Button key="confirm" type="primary" onClick={handleConfirm} loading={loading}>
                        确认并排班
                    </Button>,
                ]}
                styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
            >
                {/* Precheck Results Panel */}
                {precheckResults && (
                    <Alert
                        type={precheckResults.status === 'PASS' ? 'success' : precheckResults.status === 'WARNING' ? 'warning' : 'error'}
                        message={`预检${precheckResults.status === 'PASS' ? '通过' : precheckResults.status === 'WARNING' ? '有警告' : '有错误'}`}
                        description={
                            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                {precheckResults.checks
                                    .filter(c => c.status !== 'PASS')
                                    .map((c, i) => (
                                        <div key={i} style={{ marginBottom: 4 }}>
                                            {c.status === 'ERROR' ? '🔴' : '⚠️'} {c.message}
                                        </div>
                                    ))}
                                {precheckResults.checks.every(c => c.status === 'PASS') && (
                                    <div>✅ 所有 {precheckResults.checks.length} 项检查均通过</div>
                                )}
                            </div>
                        }
                        showIcon
                        closable
                        onClose={() => setPrecheckResults(null)}
                        style={{ marginBottom: 16 }}
                    />
                )}
                <div style={{ marginBottom: 16 }}>
                    已选批次：<strong>{batchIds.length}</strong> |
                    总操作数：<strong>{data.length}</strong> |
                    总岗位数：<strong>{data.reduce((sum, op) => sum + (op.positions?.length || op.required_people || 1), 0)}</strong>
                </div>

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="本次 V4 排班会保留已锁定的操作人员和班次"
                    description="求解器会把锁定数据当作硬约束，应用结果时也不会覆盖这些人工锁定记录。"
                />

                {loading && data.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>加载中...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* 1. Share Groups */}
                        {Object.entries(groupedData.groups).map(([key, groupData]) => (
                            <div key={key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{
                                    background: '#fafafa',
                                    padding: '8px 16px',
                                    fontWeight: 600,
                                    borderBottom: '1px solid #f0f0f0',
                                    color: '#666'
                                }}>
                                    共享组：{groupData.name}
                                </div>
                                <Table
                                    columns={columns}
                                    dataSource={groupData.ops}
                                    rowKey="operation_plan_id"
                                    pagination={false}
                                    size="small"
                                />
                            </div>
                        ))}

                        {/* 2. Independent Operations */}
                        {groupedData.independent.length > 0 && (
                            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{
                                    background: '#fafafa',
                                    padding: '8px 16px',
                                    fontWeight: 600,
                                    borderBottom: '1px solid #f0f0f0',
                                    color: '#666'
                                }}>
                                    独立操作
                                </div>
                                <Table
                                    columns={columns}
                                    dataSource={groupedData.independent}
                                    rowKey="operation_plan_id"
                                    pagination={false}
                                    size="small"
                                />
                            </div>
                        )}

                        {data.length === 0 && !loading && (
                            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                                所选批次在该时段内没有找到操作。
                            </div>
                        )}
                    </div>
                )}
            </Modal>

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
