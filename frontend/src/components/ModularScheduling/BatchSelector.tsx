import React from 'react';
import { Card, Checkbox, Input, Empty, Tag, Badge, Tooltip, Row, Col } from 'antd';
import {
  CalendarOutlined,
  TeamOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { BatchCard } from './types';
import './styles.css';

const { Search } = Input;

interface BatchSelectorProps {
  batches: BatchCard[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  loading?: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

const BatchSelector: React.FC<BatchSelectorProps> = ({
  batches,
  selectedIds,
  onSelectionChange,
  loading,
  searchValue,
  onSearchChange,
}) => {
  const filteredBatches = batches.filter(
    (batch) =>
      batch.batchCode.toLowerCase().includes(searchValue.toLowerCase()) ||
      batch.batchName.toLowerCase().includes(searchValue.toLowerCase())
  );

  const handleToggle = (batchId: number) => {
    if (selectedIds.includes(batchId)) {
      onSelectionChange(selectedIds.filter((id) => id !== batchId));
    } else {
      onSelectionChange([...selectedIds, batchId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredBatches.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredBatches.map((b) => b.batchId));
    }
  };

  const getStatusBadge = (batch: BatchCard) => {
    if (batch.unassignedCount === 0 && batch.partialCount === 0) {
      return (
        <Tooltip title="全部已分配">
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
        </Tooltip>
      );
    }
    if (batch.unassignedCount > 0) {
      return (
        <Tooltip title={`${batch.unassignedCount} 个操作未分配`}>
          <Badge count={batch.unassignedCount} size="small" />
        </Tooltip>
      );
    }
    return (
      <Tooltip title={`${batch.partialCount} 个操作部分分配`}>
        <Badge count={batch.partialCount} size="small" color="orange" />
      </Tooltip>
    );
  };

  return (
    <div className="batch-selector">
      <div className="batch-selector-header">
        <Search
          placeholder="搜索批次编号或名称..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
        <Checkbox
          checked={selectedIds.length === filteredBatches.length && filteredBatches.length > 0}
          indeterminate={selectedIds.length > 0 && selectedIds.length < filteredBatches.length}
          onChange={handleSelectAll}
        >
          全选 ({selectedIds.length}/{filteredBatches.length})
        </Checkbox>
      </div>

      {filteredBatches.length === 0 ? (
        <Empty
          description={loading ? '加载中...' : '暂无激活的批次'}
          style={{ padding: '40px 0' }}
        />
      ) : (
        <Row gutter={[16, 16]} className="batch-card-grid">
          {filteredBatches.map((batch) => {
            const isSelected = selectedIds.includes(batch.batchId);
            const startDate = dayjs(batch.startDate);
            const endDate = dayjs(batch.endDate);

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={batch.batchId}>
                <Card
                  className={`batch-card ${isSelected ? 'batch-card-selected' : ''}`}
                  hoverable
                  onClick={() => handleToggle(batch.batchId)}
                  style={{
                    borderColor: isSelected ? (batch.batchColor || '#1890ff') : undefined,
                    borderWidth: isSelected ? 2 : 1,
                  }}
                >
                  <div className="batch-card-header">
                    <Checkbox
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggle(batch.batchId)}
                    />
                    <span
                      className="batch-color-dot"
                      style={{ backgroundColor: batch.batchColor || '#1890ff' }}
                    />
                    <span className="batch-code">{batch.batchCode}</span>
                    {getStatusBadge(batch)}
                  </div>

                  <div className="batch-card-name">{batch.batchName}</div>

                  <div className="batch-card-info">
                    <div className="batch-info-item">
                      <TeamOutlined />
                      <span>{batch.operationCount} 个操作</span>
                    </div>
                    <div className="batch-info-item">
                      <CalendarOutlined />
                      <span>
                        {startDate.format('MM/DD')} ~ {endDate.format('MM/DD')}
                      </span>
                    </div>
                  </div>

                  {batch.unassignedCount > 0 && (
                    <Tag
                      color="warning"
                      icon={<ExclamationCircleOutlined />}
                      className="batch-warning-tag"
                    >
                      {batch.unassignedCount} 待分配
                    </Tag>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
};

export default BatchSelector;

