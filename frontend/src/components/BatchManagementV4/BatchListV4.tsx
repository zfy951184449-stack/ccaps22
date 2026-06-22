import React, { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
    WxbBadge,
    WxbBulkActionBar,
    WxbDataTable,
    WxbIcon,
    WxbTableActionCell,
    WxbTooltip,
} from '../wxb-ui';
import type { BatchPlan } from '../../types';

interface BatchListV4Props {
    data: BatchPlan[];
    loading: boolean;
    onEdit: (batch: BatchPlan) => void;
    onDelete: (batch: BatchPlan) => void;
    onActivate: (batch: BatchPlan) => void;
    onDeactivate: (batch: BatchPlan) => void;
    onRefresh: (batch: BatchPlan) => void;
    selectedRowKeys: React.Key[];
    selectedDraftCount: number;
    selectedActivatedCount: number;
    onSelectionChange: (keys: React.Key[]) => void;
    onBulkActivate: () => void;
    onBulkDeactivate: () => void;
    onBulkDelete: () => void;
}

const getStatusConfig = (status: BatchPlan['plan_status'] | string) => {
    switch (status) {
        case 'ACTIVATED':
            return { status: 'success' as const, label: 'Activated' };
        case 'DRAFT':
            return { status: 'neutral' as const, label: 'Draft' };
        default:
            return { status: 'info' as const, label: status };
    }
};

const BatchListV4: React.FC<BatchListV4Props> = ({
    data,
    loading,
    onEdit,
    onDelete,
    onActivate,
    onDeactivate,
    onRefresh,
    selectedRowKeys,
    selectedDraftCount,
    selectedActivatedCount,
    onSelectionChange,
    onBulkActivate,
    onBulkDeactivate,
    onBulkDelete,
}) => {
    const columns = useMemo<ColumnsType<BatchPlan>>(() => [
        {
            title: '批次编码',
            dataIndex: 'batch_code',
            key: 'batch_code',
            render: (text: string, record) => (
                <div className="batch-list-v4__identity">
                    <span className="batch-list-v4__code">{text}</span>
                    <span className="batch-list-v4__name">{record.batch_name}</span>
                </div>
            ),
        },
        {
            title: '计划来源',
            dataIndex: 'template_name',
            key: 'template_name',
            render: (text: string | undefined, record) => (
                <span className="batch-list-v4__template">
                    {record.mfg_package_name ? `总包 · ${record.mfg_package_name}` : text || '-'}
                </span>
            ),
        },
        {
            title: '计划日期',
            key: 'dates',
            render: (_, record) => (
                <span className="batch-list-v4__date">
                    <WxbIcon name="hold-time" size={14} />
                    {record.planned_start_date}
                    {record.planned_end_date ? ` - ${record.planned_end_date}` : ''}
                </span>
            ),
        },
        {
            title: '状态',
            key: 'status',
            dataIndex: 'plan_status',
            render: (status: BatchPlan['plan_status']) => {
                const config = getStatusConfig(status);
                return <WxbBadge status={config.status} variant="bar" label={config.label} />;
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 290,
            render: (_, record) => (
                <WxbTableActionCell
                    maxInline={4}
                    actions={[
                        record.plan_status === 'DRAFT'
                            ? {
                                key: 'activate',
                                label: (
                                    <WxbTooltip title="激活批次">
                                        <span><WxbIcon name="release" size={13} /> 激活</span>
                                    </WxbTooltip>
                                ),
                                onClick: () => onActivate(record),
                            }
                            : {
                                key: 'deactivate',
                                label: (
                                    <WxbTooltip title="撤销激活">
                                        <span><WxbIcon name="quarantine" size={13} /> 撤销</span>
                                    </WxbTooltip>
                                ),
                                onClick: () => onDeactivate(record),
                            },
                        {
                            key: 'edit',
                            label: (
                                <WxbTooltip title="编辑批次">
                                    <span><WxbIcon name="batch-record" size={13} /> 编辑</span>
                                </WxbTooltip>
                            ),
                            onClick: () => onEdit(record),
                        },
                        ...(record.plan_status === 'DRAFT'
                            ? [{
                                key: 'refresh',
                                label: (
                                    <WxbTooltip title="按当前模版重新对比并刷新该批次工序">
                                        <span><WxbIcon name="recipe" size={13} /> 刷新</span>
                                    </WxbTooltip>
                                ),
                                onClick: () => onRefresh(record),
                            }]
                            : []),
                        {
                            key: 'delete',
                            label: (
                                <WxbTooltip title={record.plan_status === 'DRAFT' ? '删除草稿批次' : '删除并清理排班数据'}>
                                    <span><WxbIcon name="rejected" size={13} /> 删除</span>
                                </WxbTooltip>
                            ),
                            variant: 'danger',
                            onClick: () => onDelete(record),
                            confirm: record.plan_status === 'DRAFT'
                                ? {
                                    title: '删除批次',
                                    description: `确定要删除草稿批次 ${record.batch_code} 吗？`,
                                    okText: '删除',
                                    cancelText: '取消',
                                }
                                : undefined,
                        },
                    ]}
                />
            ),
        },
    ], [onActivate, onDeactivate, onDelete, onEdit, onRefresh]);

    return (
        <>
            <WxbBulkActionBar
                className="batch-list-v4__bulk-actions"
                selectedCount={selectedRowKeys.length}
                clearLabel="清除选择"
                onClear={() => onSelectionChange([])}
                actions={[
                    {
                        key: 'activate',
                        label: (
                            <span><WxbIcon name="release" size={13} /> 批量激活</span>
                        ),
                        disabled: selectedDraftCount === 0,
                        onClick: onBulkActivate,
                    },
                    {
                        key: 'deactivate',
                        label: (
                            <span><WxbIcon name="quarantine" size={13} /> 批量撤销</span>
                        ),
                        disabled: selectedActivatedCount === 0,
                        onClick: onBulkDeactivate,
                    },
                    {
                        key: 'delete',
                        label: (
                            <span><WxbIcon name="rejected" size={13} /> 批量删除</span>
                        ),
                        variant: 'danger',
                        onClick: onBulkDelete,
                        confirm: {
                            title: '批量删除批次',
                            description: `确定删除已选择的 ${selectedRowKeys.length} 个批次吗？已激活批次会同步清理排班数据。`,
                            okText: '删除',
                            cancelText: '取消',
                        },
                    },
                ]}
            />
            <WxbDataTable<BatchPlan>
                className="batch-list-v4"
                density="standard"
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                rowSelection={{
                    selectedRowKeys,
                    onChange: onSelectionChange,
                    columnWidth: 44,
                }}
                pagination={{
                    pageSize: 8,
                    size: 'small',
                }}
                emptyState={{
                    description: '暂无批次数据',
                }}
            />
        </>
    );
};

export default BatchListV4;
