import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, ConfigProvider } from 'antd';
import {
  SafetyOutlined,
  SettingOutlined,
  ProjectOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TableOutlined,
  ClockCircleOutlined,
  ApartmentOutlined,
  ScheduleOutlined,
  AppstoreOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import OrganizationWorkbenchPage from './pages/OrganizationWorkbenchPage';
import QualificationsPage from './pages/QualificationsPage';
import QualificationMatrixPage from './pages/QualificationMatrixPage';
import OperationsPage from './pages/OperationsPage';
import ProcessTemplatesPage from './pages/ProcessTemplatesPage';
import PersonnelSchedulingPage from './pages/PersonnelSchedulingPage';
import BatchManagementPage from './pages/BatchManagementPage';
import ShiftDefinitionsPage from './pages/ShiftDefinitionsPage';
import OperationConstraintsPage from './pages/OperationConstraintsPage';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import SystemMonitorPage from './pages/SystemMonitorPage';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

// 路由路径映射到菜单key
const pathToMenuKey: { [key: string]: string } = {
  '/': 'organization-workbench',
  '/qualifications': 'qualifications',
  '/qualification-matrix': 'qualification-matrix',
  '/operations': 'operations',
  '/process-templates': 'process-templates',
  '/batch-management': 'batch-management',
  '/personnel-scheduling': 'personnel-scheduling',
  '/shift-definitions': 'shift-definitions',
  '/operation-constraints': 'operation-constraints',
  '/system-monitor': 'system-monitor',
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  // 根据当前路径确定选中的菜单项
  const selectedMenu = pathToMenuKey[location.pathname] || 'organization-workbench';

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
      key: 'operation-constraints',
      icon: <LinkOutlined />,
      label: '操作约束',
    },
    {
      key: 'system-monitor',
      icon: <DashboardOutlined />,
      label: '系统监控',
    },
  ];

  // 处理菜单点击
  const handleMenuClick = ({ key }: { key: string }) => {
    // 找到对应的路径
    const path = Object.keys(pathToMenuKey).find(path => pathToMenuKey[path] === key) || '/';
    navigate(path);
  };

  return (
    <ConfigProvider
      locale={zhCN}
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
            onClick={handleMenuClick}
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
            <Routes>
              <Route path="/" element={<OrganizationWorkbenchPage />} />
              <Route path="/qualifications" element={<QualificationsPage />} />
              <Route path="/qualification-matrix" element={<QualificationMatrixPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/process-templates" element={<ProcessTemplatesPage />} />
              <Route path="/batch-management" element={<BatchManagementPage />} />
              <Route path="/personnel-scheduling" element={<PersonnelSchedulingPage />} />
              <Route path="/shift-definitions" element={<ShiftDefinitionsPage />} />
              <Route path="/operation-constraints" element={<OperationConstraintsPage />} />
              <Route path="/system-monitor" element={<SystemMonitorPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

const App: React.FC = () => (
  <Router>
    <AppLayout />
  </Router>
);

export default App;
