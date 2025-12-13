import React, { useMemo, useState } from 'react';
import { Table, Tag, Input, Select, Space, Tooltip } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type {
  SolveResult,
  OperationAssignment,
  OperationDemand,
  OperationAssignmentRow,
} from '../types';

interface OperationAssignmentTabProps {
  result: SolveResult;
}

const OperationAssignmentTab: React.FC<OperationAssignmentTabProps> = ({ result }) => {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');

  // 构建操作分配展示数据
  const operationRows = useMemo(() => {
    const demands = result.operation_demands || [];
    const assignments = result.assignments || [];

    // 按操作ID分组分配记录
    const assignmentMap = new Map<number, OperationAssignment[]>();
    for (const assignment of assignments) {
      const list = assignmentMap.get(assignment.operation_plan_id) || [];
      list.push(assignment);
      assignmentMap.set(assignment.operation_plan_id, list);
    }

    // 构建展示数据
    const rows: OperationAssignmentRow[] = demands.map((demand) => {
      const opAssignments = assignmentMap.get(demand.operation_plan_id) || [];
      
      // 构建岗位列表
      const positions = [];
      for (let i = 1; i <= demand.required_people; i++) {
        const assignment = opAssignments.find(a => a.position_number === i);
        positions.push({
          position_number: i,
          employee_id: assignment?.employee_id,
          employee_name: assignment?.employee_name,
          employee_code: assignment?.employee_code,
          is_assigned: !!assignment,
        });
      }

      const assignedCount = positions.filter(p => p.is_assigned).length;
      let assignmentStatus: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
      if (assignedCount === 0) {
        assignmentStatus = 'UNASSIGNED';
      } else if (assignedCount < demand.required_people) {
        assignmentStatus = 'PARTIAL';
      } else {
        assignmentStatus = 'COMPLETE';
      }

      return {
        operation_plan_id: demand.operation_plan_id,
        batch_code: demand.batch_code,
        batch_name: demand.batch_name,
        operation_name: demand.operation_name,
        planned_start: demand.planned_start_datetime,
        planned_end: demand.planned_end_datetime,
        required_people: demand.required_people,
        positions,
        assigned_count: assignedCount,
        assignment_status: assignmentStatus,
      };
    });

    return rows;
  }, [result]);

  // 获取批次列表（用于筛选）
  const batchOptions = useMemo(() => {
    const batches = new Map<string, string>();
    operationRows.forEach(row => {
      batches.set(row.batch_code, row.batch_name);
    });
    return Array.from(batches.entries()).map(([code, name]) => ({
      value: code,
      label: `${code} - ${name}`,
    }));
  }, [operationRows]);

  // 筛选数据
  const filteredRows = useMemo(() => {
    return operationRows.filter(row => {
      // 搜索过滤
      if (searchText) {
        const search = searchText.toLowerCase();
        if (!row.operation_name.toLowerCase().includes(search) &&
            !row.batch_code.toLowerCase().includes(search) &&
            !row.batch_name.toLowerCase().includes(search)) {
          return false;
        }
      }
      // 状态过滤
      if (statusFilter !== 'all' && row.assignment_status !== statusFilter) {
        return false;
      }
      // 批次过滤
      if (batchFilter !== 'all' && row.batch_code !== batchFilter) {
        return false;
      }
      return true;
    });
  }, [operationRows, searchText, statusFilter, batchFilter]);

  // 表格列定义
  const columns: ColumnsType<OperationAssignmentRow> = [
    {
      title: '批次',
      key: 'batch',
      width: 150,
      render: (_, record) => (
        <Tooltip title={record.batch_name}>
          <Tag color="blue">{record.batch_code}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '操作名称',
      dataIndex: 'operation_name',
      key: 'operation_name',
      ellipsis: true,
      width: 180,
    },
    {
      title: '岗位分配',
      key: 'positions',
      width: 300,
      render: (_, record) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {record.positions.map((pos) => (
            <Tag
              key={pos.position_number}
              color={pos.is_assigned ? 'green' : 'default'}
              style={!pos.is_assigned ? { color: '#ff4d4f', borderColor: '#ff4d4f' } : undefined}
            >
              <span style={{ marginRight: 4 }}>岗{pos.position_number}:</span>
              {pos.is_assigned ? (
                <>
                  <UserOutlined style={{ marginRight: 2 }} />
                  {pos.employee_name || pos.employee_code || `员工${pos.employee_id}`}
                </>
              ) : (
                <span style={{ color: '#ff4d4f' }}>
                  <ExclamationCircleOutlined style={{ marginRight: 2 }} />
                  未分配
                </span>
              )}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: '分配状态',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, record) => {
        const statusConfig = {
          COMPLETE: { color: 'success', text: '已完成' },
          PARTIAL: { color: 'warning', text: '部分分配' },
          UNASSIGNED: { color: 'error', text: '未分配' },
        };
        const config = statusConfig[record.assignment_status];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '计划时间',
      key: 'time',
      width: 180,
      render: (_, record) => {
        if (!record.planned_start) return '-';
        const start = dayjs(record.planned_start);
        const end = record.planned_end ? dayjs(record.planned_end) : null;
        return (
          <span>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {start.format('MM-DD HH:mm')}
            {end && ` - ${end.format(end.isSame(start, 'day') ? 'HH:mm' : 'MM-DD HH:mm')}`}
          </span>
        );
      },
    },
  ];

  // 统计信息
  const stats = useMemo(() => {
    const total = operationRows.length;
    const complete = operationRows.filter(r => r.assignment_status === 'COMPLETE').length;
    const partial = operationRows.filter(r => r.assignment_status === 'PARTIAL').length;
    const unassigned = operationRows.filter(r => r.assignment_status === 'UNASSIGNED').length;
    return { total, complete, partial, unassigned };
  }, [operationRows]);

  return (
    <div className="operation-assignment-tab">
      {/* 筛选区域 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder="搜索操作或批次"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 200 }}
          allowClear
        />
        <Select
          value={batchFilter}
          onChange={setBatchFilter}
          style={{ width: 200 }}
          options={[
            { value: 'all', label: '全部批次' },
            ...batchOptions,
          ]}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'COMPLETE', label: '已完成' },
            { value: 'PARTIAL', label: '部分分配' },
            { value: 'UNASSIGNED', label: '未分配' },
          ]}
        />
        <Space style={{ marginLeft: 'auto' }}>
          <Tag>总计: {stats.total}</Tag>
          <Tag color="success">完成: {stats.complete}</Tag>
          <Tag color="warning">部分: {stats.partial}</Tag>
          <Tag color="error">未分配: {stats.unassigned}</Tag>
        </Space>
      </div>

      {/* 数据表格 */}
      <Table
        dataSource={filteredRows}
        columns={columns}
        rowKey="operation_plan_id"
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ y: 400 }}
      />
    </div>
  );
};

export default OperationAssignmentTab;


