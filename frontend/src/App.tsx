import React, { Suspense, lazy } from 'react';
import { Layout, Typography, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import CommandRail from './components/Navigation/CommandRail';

const { Header, Content } = Layout;
const { Title } = Typography;

const Dashboard = lazy(() => import('./components/Dashboard'));
const OrganizationWorkbenchPage = lazy(() => import('./pages/OrganizationWorkbenchPage'));
const QualificationsPage = lazy(() => import('./pages/QualificationsPage'));
const QualificationMatrixPage = lazy(() => import('./pages/QualificationMatrixPage'));
const OperationsPage = lazy(() => import('./pages/OperationsPage'));
const OperationTypesPage = lazy(() => import('./pages/OperationTypesPage'));
const ProcessTemplatesPage = lazy(() => import('./pages/ProcessTemplatesPage'));
const BatchManagementPage = lazy(() => import('./pages/BatchManagementPage'));
const BatchManagementV4Page = lazy(() => import('./pages/BatchManagementV4Page'));
const TaskPoolPage = lazy(() => import('./pages/TaskPoolPage'));
const ScheduleOverviewPage = lazy(() => import('./pages/ScheduleOverviewPage'));
const PersonnelSchedulingPage = lazy(() => import('./pages/PersonnelSchedulingPage'));
const AutoSchedulingPage = lazy(() => import('./pages/AutoSchedulingPage'));
const ModularSchedulingPage = lazy(() => import('./pages/ModularSchedulingPage'));
const SchedulingV3Page = lazy(() => import('./pages/SchedulingV3Page'));
const SolverV4Page = lazy(() => import('./pages/SolverV4Page'));
const ShiftDefinitionsPage = lazy(() => import('./pages/ShiftDefinitionsPage'));
const OperationConstraintsPage = lazy(() => import('./pages/OperationConstraintsPage'));
const SystemMonitorPage = lazy(() => import('./pages/SystemMonitorPage'));
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage'));
const AutoSchedulingDebugPage = lazy(() => import('./pages/AutoSchedulingDebugPage'));
const PlatformOverviewPage = lazy(() => import('./pages/PlatformOverviewPage'));
const ResourceCenterPage = lazy(() => import('./pages/ResourceCenterPage'));
const ProjectPlanningCenterPage = lazy(() => import('./pages/ProjectPlanningCenterPage'));
const MaintenanceWindowsPage = lazy(() => import('./pages/MaintenanceWindowsPage'));
const BusinessRulesCenterPage = lazy(() => import('./pages/BusinessRulesCenterPage'));
const PlatformRunMonitorPage = lazy(() => import('./pages/PlatformRunMonitorPage'));

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
  '/task-pool': '任务池',
  '/schedule-overview': '排班总览',
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
  '/platform-overview': '平台总览',
  '/resource-center': '资源中心',
  '/project-planning-center': '项目排产中心',
  '/maintenance-windows': '维护窗口',
  '/business-rules-center': '业务规则中心',
  '/platform-run-monitor': '运行监控',
};

const RouteFallback: React.FC = () => (
  <div
    style={{
      minHeight: 320,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: fluentDesignTokens.colors.textSecondary,
      fontSize: fluentDesignTokens.typography.fontSize.body,
    }}
  >
    页面加载中...
  </div>
);

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
            <Suspense fallback={<RouteFallback />}>
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
                <Route path="/task-pool" element={<TaskPoolPage />} />
                <Route path="/schedule-overview" element={<ScheduleOverviewPage />} />
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
                <Route path="/platform-overview" element={<PlatformOverviewPage />} />
                <Route path="/resource-center" element={<ResourceCenterPage />} />
                <Route path="/project-planning-center" element={<ProjectPlanningCenterPage />} />
                <Route path="/maintenance-windows" element={<MaintenanceWindowsPage />} />
                <Route path="/business-rules-center" element={<BusinessRulesCenterPage />} />
                <Route path="/platform-run-monitor" element={<PlatformRunMonitorPage />} />
              </Routes>
            </Suspense>
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
