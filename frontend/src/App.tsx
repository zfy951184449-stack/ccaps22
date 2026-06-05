import React from 'react';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import TopNavigation from './components/Navigation/TopNavigation';
import Dashboard from './components/Dashboard';
import OrganizationWorkbenchPage from './pages/OrganizationWorkbenchPage';
import QualificationsPage from './pages/QualificationsPage';
import QualificationMatrixPage from './pages/QualificationMatrixPage';
import OperationsPage from './pages/OperationsPage';
import OperationTypesPage from './pages/OperationTypesPage';
import BatchManagementV4Page from './pages/BatchManagementV4Page';
import BatchManagementWorkbenchV2Page from './pages/BatchManagementWorkbenchV2Page';
import PersonnelSchedulingPage from './pages/PersonnelSchedulingPage';
import SolverV4Page from './pages/SolverV4Page';
import ShiftDefinitionsPage from './pages/ShiftDefinitionsPage';
import UiKitShowcasePage from './pages/UiKitShowcasePage';
import ProcessTemplatesV3Page from './pages/ProcessTemplatesV3Page';
import EquipmentManagementPage from './pages/EquipmentManagementPage';
import RosterLeadershipCockpitPage from './pages/roster/RosterLeadershipCockpitPage';
import RosterExceptionRepairPage from './pages/roster/RosterExceptionRepairPage';
import LoginPage from './pages/LoginPage';
import RoleManagementPage from './pages/governance/RoleManagementPage';
import UserManagementPage from './pages/governance/UserManagementPage';
import PermissionCatalogPage from './pages/governance/PermissionCatalogPage';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

const { Content } = Layout;

const ProcessTemplateLegacyRedirect: React.FC = () => {
  const location = useLocation();
  const { templateId } = useParams<{ templateId?: string }>();
  const target = templateId ? `/process-templates/${templateId}` : '/process-templates';

  return (
    <Navigate
      to={`${target}${location.search}`}
      replace
    />
  );
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
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="SYSTEM_DASHBOARD_READ">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="SYSTEM_DASHBOARD_READ">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organization-workbench"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_EMPLOYEE_READ">
                <OrganizationWorkbenchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/qualifications"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_QUALIFICATION_READ">
                <QualificationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/qualification-matrix"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_QUALIFICATION_READ">
                <QualificationMatrixPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operations"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_OPERATION_READ">
                <OperationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operation-types"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_OPERATION_READ">
                <OperationTypesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/process-templates"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="APS_TEMPLATE_READ">
                <ProcessTemplatesV3Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/process-templates/:templateId"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="APS_TEMPLATE_READ">
                <ProcessTemplatesV3Page />
              </ProtectedRoute>
            }
          />
          <Route path="/process-templates-v2" element={<ProcessTemplateLegacyRedirect />} />
          <Route path="/process-templates-v2/:templateId" element={<ProcessTemplateLegacyRedirect />} />
          <Route
            path="/batch-management-v4"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="APS_BATCH_READ">
                <BatchManagementV4Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batch-management-workbench-v2"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="APS_BATCH_READ">
                <BatchManagementWorkbenchV2Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personnel-scheduling"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="ROSTER_SCHEDULE_READ">
                <PersonnelSchedulingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roster/leadership-cockpit"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="ROSTER_COCKPIT_READ">
                <RosterLeadershipCockpitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roster/exceptions"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="ROSTER_EXCEPTION_PREVIEW">
                <RosterExceptionRepairPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/solver-v4"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="SOLVER_RUN_READ">
                <SolverV4Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shift-definitions"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_SHIFT_DEF_READ">
                <ShiftDefinitionsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/process-templates-v3" element={<ProcessTemplateLegacyRedirect />} />
          <Route path="/process-templates-v3/:templateId" element={<ProcessTemplateLegacyRedirect />} />
          <Route
            path="/equipment-management"
            element={
              <ProtectedRoute allowAnonymousInShadow requiredPermission="MASTER_RESOURCE_READ">
                <EquipmentManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance/roles"
            element={
              <ProtectedRoute requiredPermission="GOVERNANCE_ROLE_READ">
                <RoleManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance/users"
            element={
              <ProtectedRoute requiredPermission="GOVERNANCE_USER_READ">
                <UserManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/governance/permissions"
            element={
              <ProtectedRoute requiredPermission="GOVERNANCE_ROLE_READ">
                <PermissionCatalogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ui-kit"
            element={
              <ProtectedRoute allowAnonymousInShadow>
                <UiKitShowcasePage />
              </ProtectedRoute>
            }
          />
          {Object.entries(mvpRedirects).map(([path, target]) => (
            <Route
              key={path}
              path={path}
              element={<Navigate to={target} replace />}
            />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Content>
    </Layout>
  </ConfigProvider>
);

const App: React.FC = () => (
  <AuthProvider>
    <Router>
      <Routes>
        {/* 登录页在 AppLayout 之外，不套顶部导航 */}
        <Route path="/login" element={<LoginPage />} />
        {/* 其余路由统一经 ProtectedRoute 守卫，再进 AppLayout。
            影子模式（REACT_APP_AUTH_ENFORCE !== 'true'，默认）下允许匿名访问，
            避免未登录的现有前端被整站重定向到 /login（与后端 AUTH_ENFORCE 影子语义对齐）；
            敏感页（/governance/*）在 AppLayout 内各自带 requiredPermission，仍按权限把关。
            切到强制模式后整站需登录。 */}
        <Route
          path="/*"
          element={
            <ProtectedRoute allowAnonymousInShadow>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  </AuthProvider>
);

export default App;
