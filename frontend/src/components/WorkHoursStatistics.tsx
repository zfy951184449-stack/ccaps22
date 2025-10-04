import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Table, 
  DatePicker, 
  Select, 
  Button,
  Progress,
  Tag,
  Space,
  Tooltip,
  Divider
} from 'antd';
import { 
  ClockCircleOutlined, 
  UserOutlined, 
  CalendarOutlined, 
  BarChartOutlined,
  DownloadOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { WorkHoursStatistics as WorkHoursStats, Employee } from '../types';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const WorkHoursStatistics: React.FC = () => {
  const [statistics, setStatistics] = useState<WorkHoursStats[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const columns = [
    {
      title: '员工姓名',
      dataIndex: 'employee_name',
      key: 'employee_name',
      fixed: 'left' as const,
      width: 120,
    },
    {
      title: '统计周期',
      dataIndex: 'period',
      key: 'period',
      width: 120,
    },
    {
      title: '总工时',
      dataIndex: 'total_work_hours',
      key: 'total_work_hours',
      render: (hours: number) => (
        <Tooltip title={`${hours}小时`}>
          <span style={{ fontWeight: 'bold' }}>{hours}h</span>
        </Tooltip>
      ),
      sorter: (a: WorkHoursStats, b: WorkHoursStats) => a.total_work_hours - b.total_work_hours,
    },
    {
      title: '标准工时',
      dataIndex: 'standard_hours',
      key: 'standard_hours',
      render: (hours: number) => `${hours}h`,
    },
    {
      title: '工时完成率',
      dataIndex: 'work_hours_ratio',
      key: 'work_hours_ratio',
      render: (ratio: number) => (
        <div style={{ width: 100 }}>
          <Progress 
            percent={ratio} 
            size="small" 
            status={ratio >= 100 ? 'success' : ratio >= 80 ? 'normal' : 'exception'}
            format={(percent) => `${percent}%`}
          />
        </div>
      ),
      sorter: (a: WorkHoursStats, b: WorkHoursStats) => a.work_hours_ratio - b.work_hours_ratio,
    },
    {
      title: '加班工时',
      dataIndex: 'overtime_hours',
      key: 'overtime_hours',
      render: (hours: number) => (
        <Tag color={hours > 36 ? 'red' : hours > 20 ? 'orange' : 'green'}>
          {hours}h
        </Tag>
      ),
      sorter: (a: WorkHoursStats, b: WorkHoursStats) => a.overtime_hours - b.overtime_hours,
    },
    {
      title: '平均日工时',
      dataIndex: 'average_daily_hours',
      key: 'average_daily_hours',
      render: (hours: number) => `${hours.toFixed(1)}h/天`,
    },
    {
      title: '工作天数',
      dataIndex: 'work_days',
      key: 'work_days',
      render: (days: number) => `${days}天`,
    },
    {
      title: '休息天数',
      dataIndex: 'rest_days',
      key: 'rest_days',
      render: (days: number) => `${days}天`,
    },
  ];

  // 计算汇总统计
  const getSummaryStats = () => {
    if (statistics.length === 0) return null;

    const totalWorkHours = statistics.reduce((sum, stat) => sum + stat.total_work_hours, 0);
    const totalStandardHours = statistics.reduce((sum, stat) => sum + stat.standard_hours, 0);
    const totalOvertimeHours = statistics.reduce((sum, stat) => sum + stat.overtime_hours, 0);
    const avgCompletionRate = statistics.reduce((sum, stat) => sum + stat.work_hours_ratio, 0) / statistics.length;

    return {
      totalWorkHours,
      totalStandardHours,
      totalOvertimeHours,
      avgCompletionRate,
      employeeCount: statistics.length,
    };
  };

  const summaryStats = getSummaryStats();

  // TODO: 从API加载数据
  useEffect(() => {
    // TODO: 加载员工数据
    // setEmployees([]);
    
    // TODO: 加载工时统计数据
    // setStatistics([]);
  }, []);

  return (
    <div>
      {/* 查询工具栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <span>统计周期：</span>
              <RangePicker
                value={dateRange}
                onChange={(dates) => dates && dates[0] && dates[1] && setDateRange([dates[0], dates[1]])}
                format="YYYY-MM-DD"
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span>员工：</span>
              <Select
                placeholder="选择员工（可选）"
                style={{ width: 150 }}
                allowClear
                value={selectedEmployee}
                onChange={setSelectedEmployee}
              >
                {employees.map(emp => (
                  <Option key={emp.id} value={emp.id}>
                    {emp.employee_name}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<BarChartOutlined />}>
              查询统计
            </Button>
          </Col>
          <Col>
            <Button icon={<DownloadOutlined />}>
              导出报表
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 汇总统计卡片 */}
      {summaryStats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总工时"
                value={summaryStats.totalWorkHours}
                suffix="小时"
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均完成率"
                value={summaryStats.avgCompletionRate}
                suffix="%"
                prefix={<TrophyOutlined />}
                precision={1}
                valueStyle={{ 
                  color: summaryStats.avgCompletionRate >= 100 ? '#52c41a' : '#faad14' 
                }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总加班时长"
                value={summaryStats.totalOvertimeHours}
                suffix="小时"
                prefix={<CalendarOutlined />}
                valueStyle={{ 
                  color: summaryStats.totalOvertimeHours > 100 ? '#ff4d4f' : '#52c41a' 
                }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="统计员工数"
                value={summaryStats.employeeCount}
                suffix="人"
                prefix={<UserOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 工时排行榜 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="工时完成率排行" size="small">
            {statistics
              .sort((a, b) => b.work_hours_ratio - a.work_hours_ratio)
              .slice(0, 5)
              .map((stat, index) => (
                <div key={stat.employee_id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: index < 4 ? '1px solid #f0f0f0' : 'none'
                }}>
                  <Space>
                    <Tag color={index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? '#cd7f32' : 'default'}>
                      {index + 1}
                    </Tag>
                    <span>{stat.employee_name}</span>
                  </Space>
                  <span style={{ fontWeight: 'bold' }}>
                    {stat.work_hours_ratio.toFixed(1)}%
                  </span>
                </div>
              ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="加班时长排行" size="small">
            {statistics
              .sort((a, b) => b.overtime_hours - a.overtime_hours)
              .slice(0, 5)
              .map((stat, index) => (
                <div key={stat.employee_id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: index < 4 ? '1px solid #f0f0f0' : 'none'
                }}>
                  <Space>
                    <Tag color={stat.overtime_hours > 30 ? 'red' : stat.overtime_hours > 15 ? 'orange' : 'green'}>
                      {index + 1}
                    </Tag>
                    <span>{stat.employee_name}</span>
                  </Space>
                  <span style={{ fontWeight: 'bold' }}>
                    {stat.overtime_hours}h
                  </span>
                </div>
              ))}
          </Card>
        </Col>
      </Row>

      {/* 详细数据表格 */}
      <Card title="工时统计详情">
        <Table
          columns={columns}
          dataSource={statistics}
          rowKey="employee_id"
          loading={loading}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
          scroll={{ x: 1200 }}
          summary={() => (
            summaryStats ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ backgroundColor: '#fafafa' }}>
                  <Table.Summary.Cell index={0}>
                    <strong>汇总</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>-</Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>
                    <strong>{summaryStats.totalWorkHours}h</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>
                    <strong>{summaryStats.totalStandardHours}h</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4}>
                    <strong>{summaryStats.avgCompletionRate.toFixed(1)}%</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5}>
                    <strong>{summaryStats.totalOvertimeHours}h</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6}>-</Table.Summary.Cell>
                  <Table.Summary.Cell index={7}>-</Table.Summary.Cell>
                  <Table.Summary.Cell index={8}>-</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          )}
        />
      </Card>
    </div>
  );
};

export default WorkHoursStatistics;