import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, ConfigProvider } from 'antd';
import type { MenuProps } from 'antd';
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
  ControlOutlined,
  BugOutlined,
  RobotOutlined,
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
import SystemSettingsPage from './pages/SystemSettingsPage';
import AutoSchedulingDebugPage from './pages/AutoSchedulingDebugPage';
import AutoSchedulingPage from './pages/AutoSchedulingPage';
import ModularSchedulingPage from './pages/ModularSchedulingPage';
import Dashboard from './components/Dashboard';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

// 路由路径映射到菜单key
const pathToMenuKey: { [key: string]: string } = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/organization-workbench': 'organization-workbench',
  '/qualifications': 'qualifications',
  '/qualification-matrix': 'qualification-matrix',
  '/operations': 'operations',
  '/process-templates': 'process-templates',
  '/batch-management': 'batch-management',
  '/personnel-scheduling': 'personnel-scheduling',
  '/auto-scheduling': 'auto-scheduling',
  '/modular-scheduling': 'modular-scheduling',
  '/shift-definitions': 'shift-definitions',
  '/operation-constraints': 'operation-constraints',
  '/system-monitor': 'system-monitor',
  '/system-settings': 'system-settings',
  '/auto-scheduling-debug': 'auto-scheduling-debug',
};

const findMenuLabel = (items: MenuProps['items'], key: string): React.ReactNode | undefined => {
  if (!items) {
    return undefined;
  }
  for (const item of items) {
    if (!item) {
      continue;
    }
    if ('key' in item && item.key === key) {
      if ('label' in item) {
        return item.label as React.ReactNode;
      }
      return undefined;
    }
    if ('children' in item && item.children) {
      const childLabel = findMenuLabel(item.children, key);
      if (childLabel) {
        return childLabel;
      }
    }
  }
  return undefined;
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuProps['items'] = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '调度中心',
    },
    {
      type: 'group',
      label: '基础数据',
      children: [
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
      ],
    },
    {
      type: 'group',
      label: '生产计划',
      children: [
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
      ],
    },
    {
      type: 'group',
      label: '人员管理',
      children: [
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
          key: 'auto-scheduling',
          icon: <RobotOutlined />,
          label: '自动排班',
        },
        {
          key: 'modular-scheduling',
          icon: <RobotOutlined />,
          label: '自动排班（模块化）',
        },
        {
          key: 'shift-definitions',
          icon: <ScheduleOutlined />,
          label: '班次定义',
        },
      ],
    },
    {
      type: 'group',
      label: '约束配置',
      children: [
        {
          key: 'operation-constraints',
          icon: <LinkOutlined />,
          label: '操作约束',
        },
      ],
    },
    {
      type: 'group',
      label: '系统管理',
      children: [
        {
          key: 'system-monitor',
          icon: <DashboardOutlined />,
          label: '系统监控',
        },
        {
          key: 'system-settings',
          icon: <ControlOutlined />,
          label: '系统设置',
        },
        {
          key: 'auto-scheduling-debug',
          icon: <BugOutlined />,
          label: '排班调试',
        },
      ],
    },
  ];

  // 根据当前路径确定选中的菜单项
  const selectedMenu = pathToMenuKey[location.pathname] || 'organization-workbench';
  const currentMenuLabel = findMenuLabel(menuItems, selectedMenu) || '仪表盘';

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
            background: '#1e293b',
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!collapsed ? (
              <img
                src="/wuxibio-logo.svg"
                alt="WuXi Biologics APS"
                style={{
                  height: '50px',
                  width: 'auto',
                }}
              />
            ) : (
              <img
                src="/wuxibio-icon.svg"
                alt="WuXi Biologics"
                style={{
                  height: '32px',
                  width: '32px',
                }}
              />
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
                {currentMenuLabel}
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
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/organization-workbench" element={<OrganizationWorkbenchPage />} />
              <Route path="/qualifications" element={<QualificationsPage />} />
              <Route path="/qualification-matrix" element={<QualificationMatrixPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/process-templates" element={<ProcessTemplatesPage />} />
              <Route path="/batch-management" element={<BatchManagementPage />} />
              <Route path="/personnel-scheduling" element={<PersonnelSchedulingPage />} />
              <Route path="/auto-scheduling" element={<AutoSchedulingPage />} />
              <Route path="/modular-scheduling" element={<ModularSchedulingPage />} />
              <Route path="/shift-definitions" element={<ShiftDefinitionsPage />} />
              <Route path="/operation-constraints" element={<OperationConstraintsPage />} />
              <Route path="/system-monitor" element={<SystemMonitorPage />} />
              <Route path="/system-settings" element={<SystemSettingsPage />} />
              <Route path="/auto-scheduling-debug" element={<AutoSchedulingDebugPage />} />
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
