import React from 'react';
import { Card, Progress, Tag, Table, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface ComprehensiveWorkTimeStatusProps {
  employees: Array<{
    employeeId: number;
    employeeName: string;
    quarterHours: number;
    quarterStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    monthlyStatus: Array<{
      month: string;
      hours: number;
      status: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
    }>;
    restDays: number;
    restDaysStatus: 'COMPLIANT' | 'WARNING' | 'VIOLATION';
  }>;
  quarterTargetHours?: number;
  monthToleranceHours?: number;
}

const ComprehensiveWorkTimeStatus: React.FC<ComprehensiveWorkTimeStatusProps> = ({
  employees,
  quarterTargetHours,
  monthToleranceHours,
}) => {
  const quarterTarget = quarterTargetHours ?? 0;
  const monthTolerance = monthToleranceHours ?? 8;

  const columns: ColumnsType<ComprehensiveWorkTimeStatusProps['employees'][0]> = [
    {
      title: '员工',
      dataIndex: 'employeeName',
      key: 'employeeName',
    },
    {
      title: '季度工时',
      key: 'quarterHours',
      render: (_, record) => {
        const percent = quarterTarget > 0 ? (record.quarterHours / quarterTarget) * 100 : 0;
        const statusColor = 
          record.quarterStatus === 'COMPLIANT' ? 'success' :
          record.quarterStatus === 'WARNING' ? 'normal' : 'exception';
        
        return (
          <div>
            <Progress 
              percent={Math.min(percent, 100)} 
              status={statusColor}
              format={() =>
                `${record.quarterHours.toFixed(1)}h / ≥${
                  quarterTarget > 0 ? quarterTarget.toFixed(0) : '--'
                }h`
              }
            />
            <Tag color={
              record.quarterStatus === 'COMPLIANT' ? 'green' :
              record.quarterStatus === 'WARNING' ? 'orange' : 'red'
            }>
              {record.quarterStatus === 'COMPLIANT' ? '合规' :
               record.quarterStatus === 'WARNING' ? '警告' : '违规'}
            </Tag>
          </div>
        );
      },
    },
    {
      title: '月度工时',
      key: 'monthlyStatus',
      render: (_, record) => (
        <div>
          {record.monthlyStatus.map((month, idx) => {
            const statusColor = 
              month.status === 'COMPLIANT' ? 'green' :
              month.status === 'WARNING' ? 'orange' : 'red';
            return (
              <Tag key={idx} color={statusColor} style={{ marginBottom: 4 }}>
                {month.month}: {month.hours.toFixed(1)}h
              </Tag>
            );
          })}
        </div>
      ),
    },
    {
      title: '休息天数',
      key: 'restDays',
      render: (_, record) => {
        const statusColor = 
          record.restDaysStatus === 'COMPLIANT' ? 'green' :
          record.restDaysStatus === 'WARNING' ? 'orange' : 'red';
        return (
          <Tag color={statusColor}>
            {record.restDays}天
            {record.restDaysStatus === 'COMPLIANT' ? ' ✓' :
             record.restDaysStatus === 'WARNING' ? ' ⚠' : ' ✗'}
          </Tag>
        );
      },
    },
  ];

  const compliantCount = employees.filter(e => e.quarterStatus === 'COMPLIANT').length;
  const warningCount = employees.filter(e => e.quarterStatus === 'WARNING').length;
  const violationCount = employees.filter(e => e.quarterStatus === 'VIOLATION').length;

  return (
    <Card title="综合工时制合规状态" bordered={false}>
      <div style={{ marginBottom: 16 }}>
        <Alert
          message={`合规: ${compliantCount} | 警告: ${warningCount} | 违规: ${violationCount}`}
          description={`季度要求：≥${
            quarterTarget > 0 ? quarterTarget.toFixed(0) : '标准'
          }h；月度容差：±${monthTolerance.toFixed(0)}h`}
          type={violationCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success'}
          showIcon
        />
      </div>
      <Table
        columns={columns}
        dataSource={employees}
        rowKey="employeeId"
        pagination={{ pageSize: 10 }}
        size="small"
      />
    </Card>
  );
};

export default ComprehensiveWorkTimeStatus;
