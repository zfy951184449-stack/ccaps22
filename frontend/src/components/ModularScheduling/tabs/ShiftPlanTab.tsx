import React, { useMemo, useState } from 'react';
import { Table, Tag, Input, Select, DatePicker, Space, Tooltip } from 'antd';
import {
  UserOutlined,
  SearchOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import minMax from 'dayjs/plugin/minMax';
import type {
  SolveResult,
  ShiftPlan,
  ShiftDefinitionInfo,
  ShiftPlanRow,
} from '../types';

dayjs.extend(minMax);

const { RangePicker } = DatePicker;

interface ShiftPlanTabProps {
  result: SolveResult;
}

/**
 * 解析时间字符串为分钟数
 */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * 检查实际工作时间是否超出班次时间范围
 */
function checkTimeWarning(
  actualStart: string | undefined,
  actualEnd: string | undefined,
  shiftDef: ShiftDefinitionInfo | undefined
): boolean {
  if (!actualStart || !actualEnd || !shiftDef) return false;

  const startTime = dayjs(actualStart);
  const endTime = dayjs(actualEnd);

  // 获取班次定义的开始和结束时间
  const shiftStartMinutes = parseTimeToMinutes(shiftDef.start_time);
  const shiftEndMinutes = parseTimeToMinutes(shiftDef.end_time);

  // 获取实际工作的开始和结束时间（转为当天分钟数）
  const actualStartMinutes = startTime.hour() * 60 + startTime.minute();
  const actualEndMinutes = endTime.hour() * 60 + endTime.minute();

  // 对于跨天班次，需要特殊处理
  if (shiftDef.is_cross_day) {
    // 跨天班次：开始时间在当天晚上，结束时间在次日早上
    // 允许范围：当天 shiftStartMinutes 到次日 shiftEndMinutes
    if (actualStartMinutes < shiftStartMinutes && actualStartMinutes >= shiftEndMinutes) {
      return true; // 开始时间在允许范围外
    }
    // 结束时间检查需要考虑跨天
    const endDaysDiff = endTime.diff(startTime, 'day');
    if (endDaysDiff === 0 && actualEndMinutes < shiftStartMinutes) {
      // 同一天结束，但结束时间在班次开始前
      return true;
    }
    if (endDaysDiff === 1 && actualEndMinutes > shiftEndMinutes) {
      // 次日结束，但超过了班次结束时间
      return true;
    }
  } else {
    // 非跨天班次：正常比较
    if (actualStartMinutes < shiftStartMinutes - 30) {
      return true; // 开始时间早于班次开始30分钟以上
    }
    if (actualEndMinutes > shiftEndMinutes + 30) {
      return true; // 结束时间晚于班次结束30分钟以上
    }
  }

  return false;
}

const ShiftPlanTab: React.FC<ShiftPlanTabProps> = ({ result }) => {
  const [searchText, setSearchText] = useState('');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [warningFilter, setWarningFilter] = useState<string>('all');

  // 构建班次定义映射
  const shiftDefMap = useMemo(() => {
    const map = new Map<number, ShiftDefinitionInfo>();
    result.shift_definitions?.forEach(def => {
      map.set(def.shift_id, def);
    });
    return map;
  }, [result.shift_definitions]);

  // 构建班次计划展示数据
  const shiftPlanRows = useMemo(() => {
    const plans = result.shift_plans || [];
    
    return plans.map((plan): ShiftPlanRow => {
      const operations = plan.operations || [];
      let actualStart: string | undefined;
      let actualEnd: string | undefined;
      
      if (operations.length > 0) {
        // 找到最早开始和最晚结束时间
        const starts = operations.map(op => dayjs(op.planned_start));
        const ends = operations.map(op => dayjs(op.planned_end));
        actualStart = dayjs.min(starts)?.toISOString();
        actualEnd = dayjs.max(ends)?.toISOString();
      }

      const shiftDef = plan.shift_id ? shiftDefMap.get(plan.shift_id) : undefined;
      const isTimeWarning = checkTimeWarning(actualStart, actualEnd, shiftDef);

      return {
        ...plan,
        actual_start_time: actualStart,
        actual_end_time: actualEnd,
        is_time_warning: isTimeWarning,
        operation_count: operations.length,
      };
    });
  }, [result.shift_plans, shiftDefMap]);

  // 获取班次列表（用于筛选）
  const shiftOptions = useMemo(() => {
    const shifts = new Map<string, string>();
    shiftPlanRows.forEach(row => {
      if (row.shift_name) {
        shifts.set(row.shift_name, row.shift_name);
      }
    });
    return Array.from(shifts.keys()).map(name => ({
      value: name,
      label: name,
    }));
  }, [shiftPlanRows]);

  // 筛选数据
  const filteredRows = useMemo(() => {
    return shiftPlanRows.filter(row => {
      // 只显示工作日（排除 REST 类型）
      // plan_type 可能是: BASE, PRODUCTION, OVERTIME, REST, WORK
      if (row.plan_type === 'REST' || row.plan_type === 'UNAVAILABLE') return false;

      // 搜索过滤
      if (searchText) {
        const search = searchText.toLowerCase();
        const employeeName = row.employee_name || row.employee_code || '';
        if (!employeeName.toLowerCase().includes(search)) {
          return false;
        }
      }
      // 班次过滤
      if (shiftFilter !== 'all' && row.shift_name !== shiftFilter) {
        return false;
      }
      // 日期范围过滤
      if (dateRange && dateRange[0] && dateRange[1]) {
        const planDate = dayjs(row.date);
        if (planDate.isBefore(dateRange[0], 'day') || planDate.isAfter(dateRange[1], 'day')) {
          return false;
        }
      }
      // 警告过滤
      if (warningFilter === 'warning' && !row.is_time_warning) {
        return false;
      }
      if (warningFilter === 'normal' && row.is_time_warning) {
        return false;
      }
      return true;
    });
  }, [shiftPlanRows, searchText, shiftFilter, dateRange, warningFilter]);

  // 格式化实际工作时间
  const formatActualTime = (row: ShiftPlanRow) => {
    if (!row.actual_start_time || !row.actual_end_time) {
      return '-';
    }
    const start = dayjs(row.actual_start_time);
    const end = dayjs(row.actual_end_time);
    const planDate = dayjs(row.date);

    // 检查是否跨天
    const startStr = start.format('HH:mm');
    let endStr = end.format('HH:mm');
    
    if (!end.isSame(planDate, 'day')) {
      const dayDiff = end.diff(planDate, 'day');
      endStr += `(+${dayDiff})`;
    }

    return `${startStr} - ${endStr}`;
  };

  // 表格列定义
  const columns: ColumnsType<ShiftPlanRow> = [
    {
      title: '员工',
      key: 'employee',
      width: 120,
      fixed: 'left',
      render: (_, record) => (
        <span>
          <UserOutlined style={{ marginRight: 4 }} />
          {record.employee_name || record.employee_code || `员工${record.employee_id}`}
        </span>
      ),
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      render: (date) => dayjs(date).format('MM-DD (ddd)'),
    },
    {
      title: '班次名称',
      dataIndex: 'shift_name',
      key: 'shift_name',
      width: 120,
      render: (name, record) => {
        if (!name) return '-';
        return (
          <span>
            {name}
            {record.is_night_shift && <Tag color="purple" style={{ marginLeft: 4 }}>夜</Tag>}
          </span>
        );
      },
    },
    {
      title: '班次时间',
      key: 'shift_time',
      width: 120,
      render: (_, record) => {
        if (!record.shift_id) return '-';
        const shiftDef = shiftDefMap.get(record.shift_id);
        if (!shiftDef) return '-';
        return (
          <span style={{ color: '#666' }}>
            {shiftDef.start_time} - {shiftDef.end_time}
            {shiftDef.is_cross_day && ' (+1)'}
          </span>
        );
      },
    },
    {
      title: '实际工作时间',
      key: 'actual_time',
      width: 150,
      render: (_, record) => {
        const timeStr = formatActualTime(record);
        return (
          <span style={record.is_time_warning ? { color: '#ff4d4f', fontWeight: 500 } : undefined}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {timeStr}
            {record.is_time_warning && (
              <Tooltip title="实际工作时间超出班次定义范围">
                <WarningOutlined style={{ marginLeft: 4, color: '#ff4d4f' }} />
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: '操作数',
      key: 'operation_count',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Tag color={record.operation_count > 0 ? 'blue' : 'default'}>
          {record.operation_count}
        </Tag>
      ),
    },
    {
      title: '工时',
      dataIndex: 'plan_hours',
      key: 'plan_hours',
      width: 80,
      render: (hours) => (hours != null ? `${Number(hours).toFixed(1)}h` : '-'),
    },
    {
      title: '标记',
      key: 'flags',
      width: 100,
      render: (_, record) => (
        <span>
          {record.is_overtime && <Tag color="orange">加班</Tag>}
          {record.is_buffer && <Tag color="cyan">缓冲</Tag>}
        </span>
      ),
    },
  ];

  // 统计信息
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const warning = filteredRows.filter(r => r.is_time_warning).length;
    return { total, warning };
  }, [filteredRows]);

  return (
    <div className="shift-plan-tab">
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
          value={shiftFilter}
          onChange={setShiftFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: '全部班次' },
            ...shiftOptions,
          ]}
        />
        <RangePicker
          value={dateRange}
          onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
          style={{ width: 240 }}
        />
        <Select
          value={warningFilter}
          onChange={setWarningFilter}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'warning', label: '超时警告' },
            { value: 'normal', label: '正常' },
          ]}
        />
        <Space style={{ marginLeft: 'auto' }}>
          <Tag>总计: {stats.total}</Tag>
          {stats.warning > 0 && <Tag color="error">超时: {stats.warning}</Tag>}
        </Space>
      </div>

      {/* 数据表格 */}
      <Table
        dataSource={filteredRows}
        columns={columns}
        rowKey={(r) => `${r.employee_id}-${r.date}`}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 1000, y: 400 }}
        rowClassName={(record) => record.is_time_warning ? 'row-warning' : ''}
      />
    </div>
  );
};

export default ShiftPlanTab;

