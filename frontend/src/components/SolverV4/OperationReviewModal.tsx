import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Badge, message, Tag } from 'antd';
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

    useEffect(() => {
        if (visible && batchIds.length > 0) {
            fetchOperations();
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
                message.error('Failed to load operation details');
            }
        } catch (error) {
            console.error('Error fetching operations:', error);
            message.error('Error fetching operations');
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
                message.success('Scheduling started!');
                const runId = result.data ? (result.data.id || result.data.runId) : result.runId;
                if (runId) {
                    onSuccess(runId);
                } else {
                    // Fallback if structure unsure
                    console.warn("Run ID not found in response", result);
                    onSuccess(0);
                }
            } else {
                message.error('Failed to start scheduling: ' + result.error);
            }
        } catch (error) {
            console.error('Error starting schedule:', error);
            message.error('Error starting schedule');
        } finally {
            setLoading(false);
        }
    };

    const columns: ColumnsType<OperationOperation> = [
        {
            title: 'Batch Code',
            dataIndex: 'batch_code',
            key: 'batch_code',
            width: 120,
        },
        {
            title: 'Operation',
            dataIndex: 'operation_name',
            key: 'operation_name',
            width: 180,
            ellipsis: true,
        },
        {
            title: 'Time',
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
            title: 'Positions & Quals',
            key: 'positions',
            render: (_, record) => {
                if (!record.positions || record.positions.length === 0) {
                    return <span style={{ color: '#ccc' }}>No specific reqs</span>;
                }

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {record.positions.map(pos => {
                            // Scarcity Logic: Qualified / Total Team Count
                            const total = pos.total_count || 1; // Prevent div by zero
                            const ratio = pos.available_count / total;

                            let color = 'success'; // Default Green (>= 50%)
                            if (ratio < 0.2) color = 'error'; // < 20% Red
                            else if (ratio < 0.5) color = 'warning'; // < 50% Orange

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
                                    Pos {pos.position_number}: {pos.available_count} Qualified
                                </Tag>
                            );
                        })}
                    </div>
                );
            },
        },
        {
            title: 'Status',
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
                title={`Review Operations to Schedule - ${month.format('MMMM YYYY')}`}
                open={visible}
                onCancel={onCancel}
                width={900}
                footer={[
                    <Button key="cancel" onClick={onCancel}>
                        Cancel
                    </Button>,
                    <Button key="confirm" type="primary" onClick={handleConfirm} loading={loading}>
                        Confirm & Schedule
                    </Button>,
                ]}
                styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
            >
                <div style={{ marginBottom: 16 }}>
                    Selected Batches: <strong>{batchIds.length}</strong> |
                    Total Operations: <strong>{data.length}</strong> |
                    Total Positions: <strong>{data.reduce((sum, op) => sum + (op.positions?.length || op.required_people || 1), 0)}</strong>
                </div>

                {loading && data.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>Loading...</div>
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
                                    Share Group: {groupData.name}
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
                                    Independent Operations
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
                                No operations found for the selected batches in this period.
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
