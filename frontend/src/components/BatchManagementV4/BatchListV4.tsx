import React, { useState } from 'react';
import { Table, Tag, Space, Button, Typography, Tooltip, Popconfirm } from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    StopOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { BatchPlan } from '../../types';
import { fluentDesignTokens } from '../../styles/fluentDesignTokens';

const { Text } = Typography;

interface BatchListV4Props {
    data: BatchPlan[];
    loading: boolean;
    onEdit: (batch: BatchPlan) => void;
    onDelete: (batch: BatchPlan) => void;
    onActivate: (batch: BatchPlan) => void;
    onDeactivate: (batch: BatchPlan) => void;
}

const BatchListV4: React.FC<BatchListV4Props> = ({
    data,
    loading,
    onEdit,
    onDelete,
    onActivate,
    onDeactivate
}) => {
    // Custom row styles for "striped" effect or hover focus
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'ACTIVATED': return { color: '#34C759', bg: 'rgba(52, 199, 89, 0.1)', text: 'Activated' };
            case 'DRAFT': return { color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.1)', text: 'Draft' };
            case 'PAUSED': return { color: '#FF9500', bg: 'rgba(255, 149, 0, 0.1)', text: 'Paused' };
            case 'COMPLETED': return { color: '#007AFF', bg: 'rgba(0, 122, 255, 0.1)', text: 'Completed' };
            default: return { color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.1)', text: status };
        }
    };

    const columns = [
        {
            title: '批次编码',
            dataIndex: 'batch_code',
            key: 'batch_code',
            render: (text: string, record: BatchPlan) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text strong style={{ fontSize: '15px', color: '#1d1d1f' }}>{text}</Text>
                    <Text type="secondary" style={{ fontSize: '13px' }}>{record.batch_name}</Text>
                </div>
            ),
        },
        {
            title: '工艺模板',
            dataIndex: 'template_name',
            key: 'template_name',
            render: (text: string) => (
                <Text style={{ fontSize: '14px', color: '#1d1d1f' }}>{text || '—'}</Text>
            ),
        },
        {
            title: '计划日期',
            key: 'dates',
            render: (_: any, record: BatchPlan) => (
                <div style={{ display: 'flex', alignItems: 'center', color: '#666' }}>
                    <CalendarOutlined style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: '13px' }}>
                        {record.planned_start_date}
                        {record.planned_end_date ? ` - ${record.planned_end_date}` : ''}
                    </Text>
                </div>
            ),
        },
        {
            title: '状态',
            key: 'status',
            dataIndex: 'plan_status',
            render: (status: string) => {
                const config = getStatusConfig(status);
                return (
                    <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '100px',
                        backgroundColor: config.bg,
                        color: config.color,
                        fontSize: '12px',
                        fontWeight: 600,
                    }}>
                        {config.text}
                    </span>
                );
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 150,
            render: (_: any, record: BatchPlan) => (
                <Space size="small" style={{ opacity: hoveredRow === record.id ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                    {record.plan_status === 'DRAFT' ? (
                        <Tooltip title="激活">
                            <Button
                                type="text"
                                shape="circle"
                                icon={<PlayCircleOutlined style={{ color: '#34C759' }} />}
                                onClick={() => onActivate(record)}
                            />
                        </Tooltip>
                    ) : record.plan_status === 'ACTIVATED' ? (
                        <Tooltip title="撤销激活">
                            <Button
                                type="text"
                                shape="circle"
                                icon={<StopOutlined style={{ color: '#FF9500' }} />}
                                onClick={() => onDeactivate(record)}
                            />
                        </Tooltip>
                    ) : null}

                    <Tooltip title="编辑">
                        <Button
                            type="text"
                            shape="circle"
                            icon={<EditOutlined style={{ color: '#007AFF' }} />}
                            onClick={() => onEdit(record)}
                        />
                    </Tooltip>

                    <Popconfirm
                        title="删除批次"
                        description="确定要删除该批次吗？"
                        onConfirm={() => onDelete(record)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Button
                            type="text"
                            shape="circle"
                            icon={<DeleteOutlined style={{ color: '#FF3B30' }} />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="batch-list-v4-container">
            <style>
                {`
                    .batch-list-v4 .ant-table {
                        background: transparent !important;
                    }
                    .batch-list-v4 .ant-table-thead > tr > th {
                        background: rgba(255, 255, 255, 0.5) !important;
                        border-bottom: 1px solid rgba(0,0,0,0.05) !important;
                        color: #8E8E93 !important;
                        font-weight: 500 !important;
                        font-size: 13px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.5px !important;
                    }
                    .batch-list-v4 .ant-table-tbody > tr > td {
                        border-bottom: 1px solid rgba(0,0,0,0.03) !important;
                        transition: background 0.2s;
                    }
                    .batch-list-v4 .ant-table-tbody > tr:hover > td {
                        background: rgba(255, 255, 255, 0.4) !important;
                    }
                    .batch-list-v4 .ant-pagination-item-active {
                        border-color: transparent !important;
                        background: #007AFF !important;
                    }
                     .batch-list-v4 .ant-pagination-item-active a {
                        color: white !important;
                    }
                `}
            </style>
            <Table
                className="batch-list-v4"
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                pagination={{
                    pageSize: 8,
                    size: 'small',
                }}
                onRow={(record) => ({
                    onMouseEnter: () => setHoveredRow(record.id),
                    onMouseLeave: () => setHoveredRow(null),
                })}
            />
        </div>
    );
};

export default BatchListV4;
