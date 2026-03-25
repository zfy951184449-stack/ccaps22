import React, { Suspense, lazy } from 'react';
import { Layout, Typography, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
const ProcessTemplatesV2Page = lazy(() => import('./pages/ProcessTemplatesV2Page'));
const BatchManagementV4Page = lazy(() => import('./pages/BatchManagementV4Page'));
const PersonnelSchedulingPage = lazy(() => import('./pages/PersonnelSchedulingPage'));
const SolverV4Page = lazy(() => import('./pages/SolverV4Page'));
const ShiftDefinitionsPage = lazy(() => import('./pages/ShiftDefinitionsPage'));

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith('/process-templates-v2/')) {
    return '工艺模版 V2';
  }

  return pathToTitle[pathname] || '应用';
};

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
  '/process-templates-v2': '工艺模版 V2',
  '/batch-management-v4': '批次管理 V4',
  '/personnel-scheduling': '人员排班',
  '/solver-v4': 'V4 自动排班',
  '/shift-definitions': '班次定义',
};

const mvpRedirects: Record<string, string> = {
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

const AppLayout: React.FC = () => {
  const location = useLocation();
  const currentTitle = getPageTitle(location.pathname);

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
                <Route path="/process-templates-v2" element={<ProcessTemplatesV2Page />} />
                <Route path="/process-templates-v2/:templateId" element={<ProcessTemplatesV2Page />} />
                <Route path="/batch-management-v4" element={<BatchManagementV4Page />} />
                <Route path="/personnel-scheduling" element={<PersonnelSchedulingPage />} />
                <Route path="/solver-v4" element={<SolverV4Page />} />
                <Route path="/shift-definitions" element={<ShiftDefinitionsPage />} />
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
