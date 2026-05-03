import React, { Suspense, lazy } from 'react';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import TopNavigation from './components/Navigation/TopNavigation';

const { Content } = Layout;

const Dashboard = lazy(() => import('./components/Dashboard'));
const OrganizationWorkbenchPage = lazy(() => import('./pages/OrganizationWorkbenchPage'));
const QualificationsPage = lazy(() => import('./pages/QualificationsPage'));
const QualificationMatrixPage = lazy(() => import('./pages/QualificationMatrixPage'));
const OperationTypesPage = lazy(() => import('./pages/OperationTypesPage'));
const ProcessTemplatesPage = lazy(() => import('./pages/ProcessTemplatesPage'));
const ProcessTemplatesV2Page = lazy(() => import('./pages/ProcessTemplatesV2Page'));
const BatchManagementV4Page = lazy(() => import('./pages/BatchManagementV4Page'));
const PersonnelSchedulingPage = lazy(() => import('./pages/PersonnelSchedulingPage'));
const SolverV4Page = lazy(() => import('./pages/SolverV4Page'));
const ShiftDefinitionsPage = lazy(() => import('./pages/ShiftDefinitionsPage'));
const UiKitShowcasePage = lazy(() => import('./pages/UiKitShowcasePage'));
const ProcessTemplatesV3Page = lazy(() => import('./pages/ProcessTemplatesV3Page'));

const mvpRedirects: Record<string, string> = {
  '/operations': '/operation-types',
  '/batch-management': '/batch-management-v4',
  '/task-pool': '/dashboard',
  '/schedule-overview': '/dashboard',
  '/special-shift-windows': '/personnel-scheduling',
  '/auto-scheduling': '/solver-v4',
  '/modular-scheduling': '/solver-v4',
  '/scheduling-v3': '/solver-v4',
  '/operation-constraints': '/operations',
  '/system-monitor': '/dashboard',
  '/system-settings': '/dashboard',
  '/auto-scheduling-debug': '/solver-v4',
  '/platform-overview': '/dashboard',
  '/resource-center': '/organization-workbench',
  '/project-planning-center': '/batch-management-v4',
  '/maintenance-windows': '/batch-management-v4',
  '/business-rules-center': '/operations',
  '/platform-run-monitor': '/solver-v4',
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

const AppLayout: React.FC = () => (
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
    <Layout
      className="main-layout"
      style={{ minHeight: '100vh', background: '#F5F8FB' }}
    >
      <TopNavigation />

      <Content
        className="fluent-content"
        style={{
          margin: `8px ${fluentDesignTokens.spacing.xxl} ${fluentDesignTokens.spacing.xxl}`,
          padding: fluentDesignTokens.spacing.xxl,
          background: fluentDesignTokens.colors.background,
          borderRadius: fluentDesignTokens.borderRadius.lg,
          boxShadow: fluentDesignTokens.elevation.level1,
          minHeight: 'calc(100vh - 128px)',
        }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/organization-workbench" element={<OrganizationWorkbenchPage />} />
            <Route path="/qualifications" element={<QualificationsPage />} />
            <Route path="/qualification-matrix" element={<QualificationMatrixPage />} />
            <Route path="/operation-types" element={<OperationTypesPage />} />
            <Route path="/process-templates" element={<ProcessTemplatesPage />} />
            <Route path="/process-templates-v2" element={<ProcessTemplatesV2Page />} />
            <Route path="/process-templates-v2/:templateId" element={<ProcessTemplatesV2Page />} />
            <Route path="/batch-management-v4" element={<BatchManagementV4Page />} />
            <Route path="/personnel-scheduling" element={<PersonnelSchedulingPage />} />
            <Route path="/solver-v4" element={<SolverV4Page />} />
            <Route path="/shift-definitions" element={<ShiftDefinitionsPage />} />
            <Route path="/process-templates-v3" element={<ProcessTemplatesV3Page />} />
            <Route path="/process-templates-v3/:templateId" element={<ProcessTemplatesV3Page />} />
            <Route path="/ui-kit" element={<UiKitShowcasePage />} />
            {Object.entries(mvpRedirects).map(([path, target]) => (
              <Route
                key={path}
                path={path}
                element={<Navigate to={target} replace />}
              />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </Content>
    </Layout>
  </ConfigProvider>
);

const App: React.FC = () => (
  <Router>
    <AppLayout />
  </Router>
);

export default App;
