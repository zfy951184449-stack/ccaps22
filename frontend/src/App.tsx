import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, Space } from 'antd';
import {
  UserOutlined,
  SafetyOutlined,
  SettingOutlined,
  ProjectOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TableOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  HeartOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import EmployeeTable from './components/EmployeeTable';
import QualificationTable from './components/QualificationTable';
import QualificationMatrix from './components/QualificationMatrix';
import OperationTable from './components/OperationTable';
import ProcessTemplate from './components/ProcessTemplate';
import PersonnelCalendar from './components/PersonnelCalendar';
import SchedulingHealthDashboard from './components/SchedulingHealthDashboard';
import SchedulingHealthSummaryCard from './components/SchedulingHealthSummaryCard';
import BatchManagement from './components/BatchManagement';
import OrganizationManagement from './components/OrganizationManagement';
import './App.css';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState('employees');
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      key: 'employees',
      icon: <UserOutlined />,
      label: '人员管理',
    },
    {
      key: 'qualifications',
      icon: <SafetyOutlined />,
      label: '资质管理',
    },
    {
      key: 'qualification-matrix',
      icon: <TableOutlined />,
      label: '资质矩阵',
    },
    {
      key: 'operations',
      icon: <SettingOutlined />,
      label: '操作管理',
    },
    {
      key: 'process-templates',
      icon: <ProjectOutlined />,
      label: '工艺模版',
    },
    {
      key: 'batch-management',
      icon: <AppstoreOutlined />,
      label: '批次管理',
    },
    {
      key: 'organization',
      icon: <ApartmentOutlined />,
      label: '组织管理',
    },
    {
      key: 'personnel-scheduling',
      icon: <ClockCircleOutlined />,
      label: '人员排班',
    },
    {
      key: 'scheduling-health',
      icon: <HeartOutlined />,
      label: '排班健康',
    },
    {
      key: 'operation-constraints',
      icon: <LinkOutlined />,
      label: '操作约束',
    },
  ];

  const renderContent = () => {
    switch (selectedMenu) {
      case 'employees':
        return <EmployeeTable />;
      case 'qualifications':
        return <QualificationTable />;
      case 'qualification-matrix':
        return <QualificationMatrix />;
      case 'operations':
        return <OperationTable />;
      case 'process-templates':
        return <ProcessTemplate />;
      case 'batch-management':
        return <BatchManagement />;
      case 'organization':
        return <OrganizationManagement />;
      case 'personnel-scheduling':
        return (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <SchedulingHealthSummaryCard onViewDetails={() => setSelectedMenu('scheduling-health')} />
            <PersonnelCalendar />
          </Space>
        );
      case 'scheduling-health':
        return <SchedulingHealthDashboard />;
      default:
        return (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Title level={3}>功能开发中...</Title>
            <p>当前选择：{menuItems.find(item => item.key === selectedMenu)?.label}</p>
          </div>
        );
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        width={250} 
        theme="dark" 
        collapsible 
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
      >
        <div style={{ 
          padding: collapsed ? '16px 8px' : '16px', 
          color: 'white', 
          textAlign: 'center',
          borderBottom: '1px solid #404040'
        }}>
          {!collapsed && (
            <Title level={4} style={{ color: 'white', margin: 0 }}>
              APS系统管理
            </Title>
          )}
          {collapsed && (
            <Title level={4} style={{ color: 'white', margin: 0 }}>
              APS
            </Title>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          items={menuItems}
          onClick={({ key }) => setSelectedMenu(key)}
          inlineCollapsed={collapsed}
        />
      </Sider>
      
      <Layout className={`main-layout ${collapsed ? 'collapsed' : ''}`}>
        <Header style={{ 
          padding: '0 24px', 
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ marginRight: '16px' }}
            />
            <Title level={3} style={{ margin: 0 }}>
              {menuItems.find(item => item.key === selectedMenu)?.label}
            </Title>
          </div>
        </Header>
        
        <Content style={{ 
          margin: '16px',
          padding: '24px',
          background: '#fff',
          borderRadius: '6px'
        }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
