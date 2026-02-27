/**
 * 批次选择面板组件 (增强版)
 * 
 * 按照线稿设计实现:
 * - 搜索框
 * - 全选复选框
 * - 详细批次卡片 (操作数、日期范围、状态)
 * - 分页
 */

import React, { useState, useMemo } from 'react';
import { Card, Checkbox, Input, Tag, Space, Typography, Pagination, Empty, Spin, Badge } from 'antd';
import { SearchOutlined, CalendarOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface BatchInfo {
    id: number;
    batch_code: string;
    batch_name: string;
    plan_status: string;
    planned_start_date?: string;
    planned_end_date?: string;
    operation_count?: number;
}

interface BatchSelectorPanelProps {
    batches: BatchInfo[];
    loading: boolean;
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    disabled?: boolean;
}

const PAGE_SIZE = 5;

const BatchSelectorPanel: React.FC<BatchSelectorPanelProps> = ({
    batches,
    loading,
    selectedIds,
    onChange,
    disabled = false,
}) => {
    const [searchText, setSearchText] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // 过滤批次
    const filteredBatches = useMemo(() => {
        if (!searchText.trim()) return batches;
        const keyword = searchText.toLowerCase();
        return batches.filter(
            (b) =>
                b.batch_code.toLowerCase().includes(keyword) ||
                b.batch_name.toLowerCase().includes(keyword)
        );
    }, [batches, searchText]);

    // 分页数据
    const paginatedBatches = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredBatches.slice(start, start + PAGE_SIZE);
    }, [filteredBatches, currentPage]);

    // 全选状态
    const allSelected = filteredBatches.length > 0 &&
        filteredBatches.every((b) => selectedIds.includes(b.id));

    const handleSelectAll = () => {
        if (allSelected) {
            // 取消全选
            onChange(selectedIds.filter((id) => !filteredBatches.find((b) => b.id === id)));
        } else {
            // 全选: 合并现有选择与过滤后的批次
            const existingIds = selectedIds.filter((id) => !filteredBatches.find((b) => b.id === id));
            const newFilteredIds = filteredBatches.map((b) => b.id);
            onChange([...existingIds, ...newFilteredIds]);
        }
    };

    const handleToggle = (batchId: number, checked: boolean) => {
        if (checked) {
            onChange([...selectedIds, batchId]);
        } else {
            onChange(selectedIds.filter((id) => id !== batchId));
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVATED': return 'green';
            case 'DRAFT': return 'default';
            case 'PAUSED': return 'orange';
            case 'COMPLETED': return 'blue';
            default: return 'default';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'ACTIVATED': return '已激活';
            case 'DRAFT': return '草稿';
            case 'PAUSED': return '暂停';
            case 'COMPLETED': return '已完成';
            default: return status;
        }
    };

    return (
        <div className="batch-selector-panel">
            {/* 搜索框 */}
            <Input
                placeholder="🔍 搜索批次号..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => {
                    setSearchText(e.target.value);
                    setCurrentPage(1);
                }}
                style={{ marginBottom: 12 }}
                disabled={disabled}
            />

            {/* 全选 + 已选统计 */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Checkbox
                    checked={allSelected}
                    indeterminate={selectedIds.length > 0 && !allSelected}
                    onChange={handleSelectAll}
                    disabled={disabled || filteredBatches.length === 0}
                >
                    全选
                </Checkbox>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    已选: {selectedIds.length} / {filteredBatches.length} 个批次
                </Text>
            </div>

            {/* 批次列表 */}
            <Spin spinning={loading}>
                {paginatedBatches.length > 0 ? (
                    <div className="batch-list">
                        {paginatedBatches.map((batch) => (
                            <Card
                                key={batch.id}
                                size="small"
                                hoverable
                                style={{
                                    marginBottom: 8,
                                    borderColor: selectedIds.includes(batch.id) ? '#1890ff' : undefined,
                                    backgroundColor: selectedIds.includes(batch.id) ? '#e6f7ff' : undefined,
                                }}
                                bodyStyle={{ padding: '8px 12px' }}
                            >
                                <Checkbox
                                    checked={selectedIds.includes(batch.id)}
                                    onChange={(e) => handleToggle(batch.id, e.target.checked)}
                                    disabled={disabled}
                                >
                                    <Space direction="vertical" size={2} style={{ marginLeft: 8 }}>
                                        <Space>
                                            <Text strong>{batch.batch_code}</Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                ({batch.batch_name})
                                            </Text>
                                            {batch.operation_count && (
                                                <Badge
                                                    count={`${batch.operation_count}个操作`}
                                                    style={{ backgroundColor: '#52c41a' }}
                                                />
                                            )}
                                        </Space>
                                        <Space style={{ fontSize: 12, color: '#8c8c8c' }}>
                                            <CalendarOutlined />
                                            <span>
                                                {batch.planned_start_date || '?'} ~ {batch.planned_end_date || '?'}
                                            </span>
                                            <Tag color={getStatusColor(batch.plan_status)}>
                                                {getStatusText(batch.plan_status)}
                                            </Tag>
                                        </Space>
                                    </Space>
                                </Checkbox>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Empty description="暂无匹配批次" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
            </Spin>

            {/* 分页 */}
            {filteredBatches.length > PAGE_SIZE && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <Pagination
                        current={currentPage}
                        pageSize={PAGE_SIZE}
                        total={filteredBatches.length}
                        onChange={setCurrentPage}
                        size="small"
                        showSizeChanger={false}
                    />
                </div>
            )}
        </div>
    );
};

export default BatchSelectorPanel;
