import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, Space, ConfigProvider } from 'antd';
import {
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
  ApartmentOutlined,
  ScheduleOutlined
} from '@ant-design/icons';
import QualificationTable from './components/QualificationTable';
import QualificationMatrix from './components/QualificationMatrix';
import OperationTable from './components/OperationTable';
import ProcessTemplate from './components/ProcessTemplate';
import PersonnelCalendar from './components/PersonnelCalendar';
import SchedulingHealthDashboard from './components/SchedulingHealthDashboard';
import SchedulingHealthSummaryCard from './components/SchedulingHealthSummaryCard';
import BatchManagement from './components/BatchManagement';
import OrganizationWorkbench from './components/OrganizationWorkbench';
import ShiftDefinitionManagement from './components/ShiftDefinitionManagement';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState('organization-workbench');
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
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
      key: 'organization-workbench',
      icon: <ApartmentOutlined />,
      label: '组织与人员',
    },
    {
      key: 'personnel-scheduling',
      icon: <ClockCircleOutlined />,
      label: '人员排班',
    },
    {
      key: 'shift-definitions',
      icon: <ScheduleOutlined />,
      label: '班次定义',
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
      case 'organization-workbench':
        return <OrganizationWorkbench />;
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
      case 'personnel-scheduling':
        return (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <SchedulingHealthSummaryCard onViewDetails={() => setSelectedMenu('scheduling-health')} />
            <PersonnelCalendar />
          </Space>
        );
      case 'scheduling-health':
        return <SchedulingHealthDashboard />;
      case 'shift-definitions':
        return <ShiftDefinitionManagement />;
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
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: fluentDesignTokens.colors.accent,
          borderRadius: Number.parseInt(fluentDesignTokens.borderRadius.md),
          fontFamily: `${fluentDesignTokens.typography.fontFamily.zh}, ${fluentDesignTokens.typography.fontFamily.en}`,
          fontSize: Number.parseInt(fluentDesignTokens.typography.fontSize.body),
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: fluentDesignTokens.colors.backgroundAlt }}>
        <Sider 
          width={250} 
          theme="dark" 
          collapsible 
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          style={{
            background: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%)',
            boxShadow: fluentDesignTokens.elevation.level3,
          }}
        >
          <div 
            className="fluent-sidebar-header"
            style={{ 
              padding: collapsed ? `${fluentDesignTokens.spacing.lg} ${fluentDesignTokens.spacing.sm}` : fluentDesignTokens.spacing.lg, 
              color: 'white', 
              textAlign: 'center',
              borderBottom: `1px solid rgba(255, 255, 255, 0.1)`,
              transition: `all ${fluentDesignTokens.animation.duration.standard} ${fluentDesignTokens.animation.easing.standard}`,
            }}
          >
            {!collapsed && (
              <Title level={4} style={{ 
                color: 'white', 
                margin: 0,
                fontSize: fluentDesignTokens.typography.fontSize.title,
                fontWeight: fluentDesignTokens.typography.fontWeight.semibold,
              }}>
                APS系统管理
              </Title>
            )}
            {collapsed && (
              <Title level={4} style={{ 
                color: 'white', 
                margin: 0,
                fontSize: fluentDesignTokens.typography.fontSize.bodyLarge,
                fontWeight: fluentDesignTokens.typography.fontWeight.bold,
              }}>
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
            style={{
              border: 'none',
              background: 'transparent',
            }}
            className="fluent-sidebar-menu"
          />
        </Sider>
        
        <Layout className={`main-layout ${collapsed ? 'collapsed' : ''}`}>
          <Header 
            className="fluent-header"
            style={{ 
              padding: `0 ${fluentDesignTokens.spacing.xxl}`, 
              background: fluentDesignTokens.colors.background,
              borderBottom: `1px solid ${fluentDesignTokens.colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: fluentDesignTokens.elevation.level1,
              height: 64,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ 
                  marginRight: fluentDesignTokens.spacing.lg,
                  borderRadius: fluentDesignTokens.borderRadius.md,
                  transition: `all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard}`,
                }}
                className="fluent-button"
              />
              <Title 
                level={3} 
                style={{ 
                  margin: 0,
                  fontSize: fluentDesignTokens.typography.fontSize.title,
                  fontWeight: fluentDesignTokens.typography.fontWeight.semibold,
                  color: fluentDesignTokens.colors.textPrimary,
                }}
              >
                {menuItems.find(item => item.key === selectedMenu)?.label}
              </Title>
            </div>
          </Header>
          
          <Content 
            className="fluent-content"
            style={{ 
              margin: fluentDesignTokens.spacing.lg,
              padding: fluentDesignTokens.spacing.xxl,
              background: fluentDesignTokens.colors.background,
              borderRadius: fluentDesignTokens.borderRadius.lg,
              boxShadow: fluentDesignTokens.elevation.level1,
              minHeight: 'calc(100vh - 64px - 32px)',
            }}
          >
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
