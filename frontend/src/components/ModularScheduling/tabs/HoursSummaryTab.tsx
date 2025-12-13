import React, { useMemo, useState } from 'react';
import { Table, Tag, Input, Select, Space, Typography } from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  SolveResult,
  HoursSummary,
  ShiftDefinitionInfo,
  ShiftPlan,
  HoursSummaryRow,
} from '../types';

const { Text } = Typography;

interface HoursSummaryTabProps {
  result: SolveResult;
}

const HoursSummaryTab: React.FC<HoursSummaryTabProps> = ({ result }) => {
  const [searchText, setSearchText] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 获取激活的班次定义列表（用于固定列）
  const shiftDefinitions = useMemo(() => {
    return result.shift_definitions || [];
  }, [result.shift_definitions]);

  // 构建工时统计展示数据（增加班次数量统计）
  const hoursSummaryRows = useMemo(() => {
    const summaries = result.hours_summaries || [];
    const shiftPlans = result.shift_plans || [];

    // 按员工+月份统计各班次数量
    const shiftCountMap = new Map<string, Record<string, number>>();
    
    shiftPlans.forEach((plan: ShiftPlan) => {
      if (plan.plan_type !== 'WORK' || !plan.shift_name) return;
      
      const month = plan.date.substring(0, 7); // YYYY-MM
      const key = `${plan.employee_id}-${month}`;
      
      if (!shiftCountMap.has(key)) {
        shiftCountMap.set(key, {});
      }
      const counts = shiftCountMap.get(key)!;
      counts[plan.shift_name] = (counts[plan.shift_name] || 0) + 1;
    });

    // 合并到摘要数据
    return summaries.map((summary): HoursSummaryRow => {
      const key = `${summary.employee_id}-${summary.month}`;
      const shiftCounts = shiftCountMap.get(key) || {};
      
      return {
        ...summary,
        shift_counts: shiftCounts,
      };
    });
  }, [result.hours_summaries, result.shift_plans]);

  // 获取月份列表（用于筛选）
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    hoursSummaryRows.forEach(row => {
      months.add(row.month);
    });
    return Array.from(months).sort().map(month => ({
      value: month,
      label: month,
    }));
  }, [hoursSummaryRows]);

  // 筛选数据
  const filteredRows = useMemo(() => {
    return hoursSummaryRows.filter(row => {
      // 搜索过滤
      if (searchText) {
        const search = searchText.toLowerCase();
        const employeeName = row.employee_name || row.employee_code || '';
        if (!employeeName.toLowerCase().includes(search)) {
          return false;
        }
      }
      // 月份过滤
      if (monthFilter !== 'all' && row.month !== monthFilter) {
        return false;
      }
      // 状态过滤
      if (statusFilter === 'normal' && !row.is_within_bounds) {
        return false;
      }
      if (statusFilter === 'exceeded' && row.is_within_bounds) {
        return false;
      }
      return true;
    });
  }, [hoursSummaryRows, searchText, monthFilter, statusFilter]);

  // 基础列定义
  const baseColumns: ColumnsType<HoursSummaryRow> = [
    {
      title: '员工',
      key: 'employee',
      width: 120,
      fixed: 'left',
      render: (_, record) => record.employee_name || record.employee_code || `员工${record.employee_id}`,
    },
    {
      title: '月份',
      dataIndex: 'month',
      key: 'month',
      width: 80,
      fixed: 'left',
    },
    {
      title: '排班工时',
      dataIndex: 'scheduled_hours',
      key: 'scheduled_hours',
      width: 90,
      render: (hours) => `${Number(hours || 0).toFixed(1)}h`,
    },
    {
      title: '标准工时',
      dataIndex: 'standard_hours',
      key: 'standard_hours',
      width: 90,
      render: (hours) => `${Number(hours || 0).toFixed(1)}h`,
    },
    {
      title: '允许范围',
      key: 'hours_range',
      width: 100,
      render: (_, record) => {
        const minHours = record.min_hours ?? (record.standard_hours - 4);
        const maxHours = record.max_hours ?? (record.standard_hours + 32);
        return `${Number(minHours).toFixed(0)}~${Number(maxHours).toFixed(0)}h`;
      },
    },
    {
      title: '偏差',
      dataIndex: 'hours_deviation',
      key: 'hours_deviation',
      width: 80,
      render: (deviation, record) => {
        const color = record.is_within_bounds ? '#52c41a' : '#ff4d4f';
        const dev = Number(deviation || 0);
        const prefix = dev > 0 ? '+' : '';
        return <Text style={{ color }}>{prefix}{dev.toFixed(1)}h</Text>;
      },
    },
    {
      title: '操作工时',
      dataIndex: 'workshop_hours',
      key: 'workshop_hours',
      width: 90,
      render: (hours) => `${Number(hours || 0).toFixed(1)}h`,
    },
    {
      title: '工作日',
      dataIndex: 'work_days',
      key: 'work_days',
      width: 70,
      align: 'center',
    },
    {
      title: '休息日',
      dataIndex: 'rest_days',
      key: 'rest_days',
      width: 70,
      align: 'center',
    },
    {
      title: '3倍日',
      dataIndex: 'triple_salary_days',
      key: 'triple_salary_days',
      width: 70,
      align: 'center',
      render: (days) => days > 0 ? <Tag color="gold">{days}</Tag> : '-',
    },
    {
      title: '状态',
      dataIndex: 'is_within_bounds',
      key: 'is_within_bounds',
      width: 80,
      render: (ok) => ok ? (
        <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
      ) : (
        <Tag color="error" icon={<CloseCircleOutlined />}>超限</Tag>
      ),
    },
  ];

  // 动态生成班次数量列
  const shiftCountColumns: ColumnsType<HoursSummaryRow> = shiftDefinitions.map((def: ShiftDefinitionInfo) => ({
    title: def.shift_name,
    key: `shift_${def.shift_code}`,
    width: 70,
    align: 'center' as const,
    render: (_: any, record: HoursSummaryRow) => {
      const count = record.shift_counts[def.shift_name] || 0;
      return count > 0 ? (
        <Tag color={def.is_night_shift ? 'purple' : 'blue'}>{count}</Tag>
      ) : (
        <span style={{ color: '#ccc' }}>-</span>
      );
    },
  }));

  // 合并所有列
  const columns = [...baseColumns, ...shiftCountColumns];

  // 统计信息
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const exceeded = filteredRows.filter(r => !r.is_within_bounds).length;
    return { total, exceeded };
  }, [filteredRows]);

  // 计算表格宽度
  const tableWidth = 120 + 80 + 90 * 2 + 100 + 80 + 90 + 70 * 3 + 80 + shiftDefinitions.length * 70;

  return (
    <div className="hours-summary-tab">
      {/* 筛选区域 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder="搜索员工"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 160 }}
          allowClear
        />
        <Select
          value={monthFilter}
          onChange={setMonthFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部月份' },
            ...monthOptions,
          ]}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'normal', label: '正常' },
            { value: 'exceeded', label: '超限' },
          ]}
        />
        <Space style={{ marginLeft: 'auto' }}>
          <Tag>总计: {stats.total}</Tag>
          {stats.exceeded > 0 && <Tag color="error">超限: {stats.exceeded}</Tag>}
        </Space>
      </div>

      {/* 数据表格 */}
      <Table
        dataSource={filteredRows}
        columns={columns}
        rowKey={(r) => `${r.employee_id}-${r.month}`}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: tableWidth, y: 400 }}
        rowClassName={(record) => !record.is_within_bounds ? 'row-warning' : ''}
      />
    </div>
  );
};

export default HoursSummaryTab;


