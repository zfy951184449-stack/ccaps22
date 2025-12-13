import React, { useMemo, useState, useCallback } from 'react';
import { Table, Tag, Button, Modal, Select, Space, message, Alert, Spin, Input } from 'antd';
import {
  UserAddOutlined,
  UserOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import axios from 'axios';
import type {
  SolveResult,
  OperationAssignment,
  OperationDemand,
  OperationAssignmentRow,
} from '../types';

interface UnassignedOperationsTabProps {
  result: SolveResult;
  onAssignmentComplete?: () => void;
}

interface RecommendedEmployee {
  id: number;
  employee_name: string;
  employee_code: string;
  qualifications: string | string[] | null;  // API 返回字符串（GROUP_CONCAT）
  has_conflict: boolean;
}

interface AssignModalState {
  visible: boolean;
  operation: OperationAssignmentRow | null;
  positionNumber: number;
  loading: boolean;
  employees: RecommendedEmployee[];
  selectedEmployeeId: number | null;
}

const UnassignedOperationsTab: React.FC<UnassignedOperationsTabProps> = ({ 
  result,
  onAssignmentComplete,
}) => {
  const [searchText, setSearchText] = useState('');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  
  const [assignModal, setAssignModal] = useState<AssignModalState>({
    visible: false,
    operation: null,
    positionNumber: 0,
    loading: false,
    employees: [],
    selectedEmployeeId: null,
  });

  // 构建操作分配展示数据（只显示未完全分配的）
  const unassignedRows = useMemo(() => {
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
    const rows: OperationAssignmentRow[] = demands
      .map((demand) => {
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
      })
      // 只保留未完全分配的
      .filter(row => row.assignment_status !== 'COMPLETE');

    return rows;
  }, [result]);

  // 获取批次列表（用于筛选）
  const batchOptions = useMemo(() => {
    const batches = new Map<string, string>();
    unassignedRows.forEach(row => {
      batches.set(row.batch_code, row.batch_name);
    });
    return Array.from(batches.entries()).map(([code, name]) => ({
      value: code,
      label: `${code} - ${name}`,
    }));
  }, [unassignedRows]);

  // 筛选数据
  const filteredRows = useMemo(() => {
    return unassignedRows.filter(row => {
      // 搜索过滤
      if (searchText) {
        const search = searchText.toLowerCase();
        if (!row.operation_name.toLowerCase().includes(search) &&
            !row.batch_code.toLowerCase().includes(search)) {
          return false;
        }
      }
      // 批次过滤
      if (batchFilter !== 'all' && row.batch_code !== batchFilter) {
        return false;
      }
      return true;
    });
  }, [unassignedRows, searchText, batchFilter]);

  // 打开分配对话框
  const openAssignModal = useCallback(async (row: OperationAssignmentRow, positionNumber: number) => {
    setAssignModal({
      visible: true,
      operation: row,
      positionNumber,
      loading: true,
      employees: [],
      selectedEmployeeId: null,
    });

    try {
      // 获取推荐人员
      const response = await axios.get(`/api/calendar/operations/${row.operation_plan_id}/recommended-personnel`);
      setAssignModal(prev => ({
        ...prev,
        loading: false,
        employees: response.data || [],
      }));
    } catch (error) {
      console.error('Failed to load recommended personnel:', error);
      message.error('加载推荐人员失败');
      setAssignModal(prev => ({
        ...prev,
        loading: false,
        employees: [],
      }));
    }
  }, []);

  // 执行分配
  const handleAssign = useCallback(async () => {
    if (!assignModal.operation || !assignModal.selectedEmployeeId) {
      message.warning('请选择要分配的员工');
      return;
    }

    setAssignModal(prev => ({ ...prev, loading: true }));

    try {
      const response = await axios.post(
        `/api/calendar/operations/${assignModal.operation.operation_plan_id}/assign-position`,
        {
          position_number: assignModal.positionNumber,
          employee_id: assignModal.selectedEmployeeId,
        }
      );

      if (response.data.success) {
        // 显示警告（如有）
        if (response.data.warnings?.length > 0) {
          Modal.warning({
            title: '分配成功，但存在以下警告',
            content: (
              <ul style={{ paddingLeft: 20 }}>
                {response.data.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ),
          });
        } else {
          message.success('分配成功');
        }

        // 关闭对话框
        setAssignModal({
          visible: false,
          operation: null,
          positionNumber: 0,
          loading: false,
          employees: [],
          selectedEmployeeId: null,
        });

        // 通知父组件刷新
        onAssignmentComplete?.();
      } else {
        message.error(response.data.error || '分配失败');
      }
    } catch (error: any) {
      console.error('Failed to assign:', error);
      message.error(error.response?.data?.error || '分配失败');
    } finally {
      setAssignModal(prev => ({ ...prev, loading: false }));
    }
  }, [assignModal, onAssignmentComplete]);

  // 关闭对话框
  const closeAssignModal = useCallback(() => {
    setAssignModal({
      visible: false,
      operation: null,
      positionNumber: 0,
      loading: false,
      employees: [],
      selectedEmployeeId: null,
    });
  }, []);

  // 表格列定义
  const columns: ColumnsType<OperationAssignmentRow> = [
    {
      title: '批次',
      key: 'batch',
      width: 120,
      render: (_, record) => <Tag color="blue">{record.batch_code}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: 150,
      ellipsis: true,
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
    {
      title: '需求/分配',
      key: 'people',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <span style={{ color: record.assigned_count < record.required_people ? '#ff4d4f' : '#52c41a' }}>
          {record.assigned_count} / {record.required_people}
        </span>
      ),
    },
    {
      title: '岗位分配情况',
      key: 'positions',
      width: 350,
      render: (_, record) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {record.positions.map((pos) => (
            <Tag
              key={pos.position_number}
              color={pos.is_assigned ? 'green' : 'default'}
              style={!pos.is_assigned ? { 
                color: '#ff4d4f', 
                borderColor: '#ff4d4f',
                cursor: 'pointer',
              } : undefined}
              onClick={!pos.is_assigned ? () => openAssignModal(record, pos.position_number) : undefined}
            >
              <span style={{ marginRight: 4 }}>岗{pos.position_number}:</span>
              {pos.is_assigned ? (
                <>
                  <UserOutlined style={{ marginRight: 2 }} />
                  {pos.employee_name || pos.employee_code}
                </>
              ) : (
                <span style={{ color: '#ff4d4f' }}>
                  <ExclamationCircleOutlined style={{ marginRight: 2 }} />
                  点击分配
                </span>
              )}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => {
        // 找到第一个未分配的岗位
        const unassignedPos = record.positions.find(p => !p.is_assigned);
        if (!unassignedPos) return null;
        
        return (
          <Button
            type="primary"
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => openAssignModal(record, unassignedPos.position_number)}
          >
            分配
          </Button>
        );
      },
    },
  ];

  // 统计信息
  const stats = useMemo(() => {
    const total = unassignedRows.length;
    const unassigned = unassignedRows.filter(r => r.assignment_status === 'UNASSIGNED').length;
    const partial = unassignedRows.filter(r => r.assignment_status === 'PARTIAL').length;
    const missingPositions = unassignedRows.reduce(
      (sum, r) => sum + (r.required_people - r.assigned_count), 
      0
    );
    return { total, unassigned, partial, missingPositions };
  }, [unassignedRows]);

  if (unassignedRows.length === 0) {
    return (
      <Alert
        type="success"
        message="所有操作已完成分配"
        description="当前没有需要分配人员的操作。"
        showIcon
      />
    );
  }

  return (
    <div className="unassigned-operations-tab">
      {/* 提示信息 */}
      <Alert
        type="warning"
        message={`共有 ${stats.total} 个操作需要分配人员，缺员 ${stats.missingPositions} 人`}
        description="点击未分配的岗位标签或【分配】按钮为其分配人员。"
        showIcon
        icon={<WarningOutlined />}
        style={{ marginBottom: 16 }}
      />

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
        <Space style={{ marginLeft: 'auto' }}>
          <Tag color="error">未分配: {stats.unassigned}</Tag>
          <Tag color="warning">部分分配: {stats.partial}</Tag>
        </Space>
      </div>

      {/* 数据表格 */}
      <Table
        dataSource={filteredRows}
        columns={columns}
        rowKey="operation_plan_id"
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 1000, y: 400 }}
      />

      {/* 分配人员对话框 */}
      <Modal
        title={
          <>
            <UserAddOutlined style={{ marginRight: 8 }} />
            分配人员 - {assignModal.operation?.operation_name} (岗位{assignModal.positionNumber})
          </>
        }
        open={assignModal.visible}
        onCancel={closeAssignModal}
        onOk={handleAssign}
        okText="确认分配"
        cancelText="取消"
        confirmLoading={assignModal.loading}
        width={500}
      >
        {assignModal.loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载推荐人员..." />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <strong>操作信息：</strong>
              <div style={{ color: '#666', marginTop: 8 }}>
                <div>批次：{assignModal.operation?.batch_code}</div>
                <div>时间：{assignModal.operation?.planned_start && (
                  <>
                    {dayjs(assignModal.operation.planned_start).format('MM-DD HH:mm')}
                    {assignModal.operation.planned_end && (
                      ` - ${dayjs(assignModal.operation.planned_end).format('HH:mm')}`
                    )}
                  </>
                )}</div>
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <strong>选择员工：</strong>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择员工"
              value={assignModal.selectedEmployeeId}
              onChange={(value) => setAssignModal(prev => ({ ...prev, selectedEmployeeId: value }))}
              optionLabelProp="label"
              showSearch
              filterOption={(input, option) => {
                const label = option?.label as string || '';
                return label.toLowerCase().includes(input.toLowerCase());
              }}
            >
              {assignModal.employees.map((emp) => (
                <Select.Option 
                  key={emp.id} 
                  value={emp.id}
                  label={`${emp.employee_name} (${emp.employee_code})`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <UserOutlined style={{ marginRight: 8 }} />
                      {emp.employee_name} ({emp.employee_code})
                    </span>
                    {emp.has_conflict && (
                      <Tag color="warning" style={{ fontSize: 12 }}>有冲突</Tag>
                    )}
                  </div>
                  {emp.qualifications && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      资质：{typeof emp.qualifications === 'string' ? emp.qualifications : (Array.isArray(emp.qualifications) ? emp.qualifications.join(', ') : '')}
                    </div>
                  )}
                </Select.Option>
              ))}
            </Select>

            {assignModal.employees.length === 0 && !assignModal.loading && (
              <Alert
                type="info"
                message="没有找到推荐人员"
                description="可能所有员工都存在时间冲突或不满足资质要求。"
                style={{ marginTop: 16 }}
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default UnassignedOperationsTab;

