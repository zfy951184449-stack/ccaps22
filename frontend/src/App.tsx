import React, { useState } from 'react';
import { Layout, Typography, ConfigProvider } from 'antd';
import type { MenuProps } from 'antd';
import {
  SafetyOutlined,
  SettingOutlined,
  ProjectOutlined,
  LinkOutlined,
  TableOutlined,
  ClockCircleOutlined,
  ApartmentOutlined,
  ScheduleOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  ControlOutlined,
  BugOutlined,
  RobotOutlined,
  RocketOutlined,
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
import BatchManagementV4Page from './pages/BatchManagementV4Page';
import ShiftDefinitionsPage from './pages/ShiftDefinitionsPage';
import OperationConstraintsPage from './pages/OperationConstraintsPage';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import SystemMonitorPage from './pages/SystemMonitorPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import AutoSchedulingDebugPage from './pages/AutoSchedulingDebugPage';
import AutoSchedulingPage from './pages/AutoSchedulingPage';
import ModularSchedulingPage from './pages/ModularSchedulingPage';
import SchedulingV3Page from './pages/SchedulingV3Page';
import SolverV4Page from './pages/SolverV4Page';
import Dashboard from './components/Dashboard';
import OperationTypesPage from './pages/OperationTypesPage';
import CommandRail from './components/Navigation/CommandRail';

const { Header, Content } = Layout;
const { Title } = Typography;

// Mapping for title display
const pathToTitle: { [key: string]: string } = {
  '/': '调度中心',
  '/dashboard': '调度中心',
  '/organization-workbench': '组织与人员',
  '/qualifications': '资质管理',
  '/qualification-matrix': '资质矩阵',
  '/operations': '操作管理',
  '/operation-types': '操作类型',
  '/process-templates': '工艺模版',
  '/batch-management': '批次管理',
  '/batch-management-v4': '批次管理 V4',
  '/personnel-scheduling': '人员排班',
  '/auto-scheduling': '自动排班',
  '/modular-scheduling': '自动排班（模块化）',
  '/scheduling-v3': 'V3 自动排班',
  '/solver-v4': 'V4 自动排班',
  '/shift-definitions': '班次定义',
  '/operation-constraints': '操作约束',
  '/system-monitor': '系统监控',
  '/system-settings': '系统设置',
  '/auto-scheduling-debug': '排班调试',
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const currentTitle = pathToTitle[location.pathname] || '应用';

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
        <CommandRail width={64} />

        <Layout className="main-layout" style={{ marginLeft: 64, transition: 'all 0.3s ease' }}>
          <Header
            className="fluent-header"
            style={{
              padding: `0 ${fluentDesignTokens.spacing.xxl}`,
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(12px)',
              borderBottom: `1px solid ${fluentDesignTokens.colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: 'none', // Removed shadow for cleaner look
              height: 64,
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Title
                level={3}
                style={{
                  margin: 0,
                  fontSize: fluentDesignTokens.typography.fontSize.title,
                  fontWeight: fluentDesignTokens.typography.fontWeight.semibold,
                  color: fluentDesignTokens.colors.textPrimary,
                }}
              >
                {currentTitle}
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
              <Route path="/operation-types" element={<OperationTypesPage />} />
              <Route path="/process-templates" element={<ProcessTemplatesPage />} />
              <Route path="/batch-management" element={<BatchManagementPage />} />
              <Route path="/batch-management-v4" element={<BatchManagementV4Page />} />
              <Route path="/personnel-scheduling" element={<PersonnelSchedulingPage />} />
              <Route path="/auto-scheduling" element={<AutoSchedulingPage />} />
              <Route path="/modular-scheduling" element={<ModularSchedulingPage />} />
              <Route path="/scheduling-v3" element={<SchedulingV3Page />} />
              <Route path="/solver-v4" element={<SolverV4Page />} />
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
