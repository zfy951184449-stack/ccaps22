import React from 'react';
import { Layout, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { fluentDesignTokens } from './styles/fluentDesignTokens';
import './App.css';
import TopNavigation from './components/Navigation/TopNavigation';
import Dashboard from './components/Dashboard';
import OrganizationWorkbenchPage from './pages/OrganizationWorkbenchPage';
import QualificationsPage from './pages/QualificationsPage';
import QualificationMatrixPage from './pages/QualificationMatrixPage';
import OperationsPage from './pages/OperationsPage';
import OperationTypesPage from './pages/OperationTypesPage';
import ProcessTemplatesPage from './pages/ProcessTemplatesPage';
import ProcessTemplatesV2Page from './pages/ProcessTemplatesV2Page';
import BatchManagementV4Page from './pages/BatchManagementV4Page';
import PersonnelSchedulingPage from './pages/PersonnelSchedulingPage';
import SolverV4Page from './pages/SolverV4Page';
import ShiftDefinitionsPage from './pages/ShiftDefinitionsPage';
import UiKitShowcasePage from './pages/UiKitShowcasePage';
import ProcessTemplatesV3Page from './pages/ProcessTemplatesV3Page';
import EquipmentManagementPage from './pages/EquipmentManagementPage';

const { Content } = Layout;

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
          <Route path="/process-templates-v3" element={<ProcessTemplatesV3Page />} />
          <Route path="/process-templates-v3/:templateId" element={<ProcessTemplatesV3Page />} />
          <Route path="/equipment-management" element={<EquipmentManagementPage />} />
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
