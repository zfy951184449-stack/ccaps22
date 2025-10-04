import React, { useState, useEffect } from 'react';
import { Card, Tabs, DatePicker, Button, Space, message } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, UserOutlined, BarChartOutlined } from '@ant-design/icons';
import ShiftTypeManagement from './ShiftTypeManagement';
import ScheduleCalendar from './ScheduleCalendar';
import WorkHoursStatistics from './WorkHoursStatistics';
import ScheduleRulesManagement from './ScheduleRulesManagement';

const { TabPane } = Tabs;

const PersonnelScheduling: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('calendar');

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="人员排班管理系统"
        extra={
          <Space>
            <Button type="primary" icon={<CalendarOutlined />}>
              快速排班
            </Button>
            <Button icon={<BarChartOutlined />}>
              导出报表
            </Button>
          </Space>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane 
            tab={
              <span>
                <CalendarOutlined />
                排班日历
              </span>
            } 
            key="calendar"
          >
            <ScheduleCalendar />
          </TabPane>
          
          <TabPane 
            tab={
              <span>
                <ClockCircleOutlined />
                班次管理
              </span>
            } 
            key="shifts"
          >
            <ShiftTypeManagement />
          </TabPane>
          
          <TabPane 
            tab={
              <span>
                <UserOutlined />
                工时统计
              </span>
            } 
            key="statistics"
          >
            <WorkHoursStatistics />
          </TabPane>
          
          <TabPane 
            tab={
              <span>
                <BarChartOutlined />
                排班规则
              </span>
            } 
            key="rules"
          >
            <ScheduleRulesManagement />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default PersonnelScheduling;