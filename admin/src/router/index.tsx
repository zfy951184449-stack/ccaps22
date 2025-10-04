import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from '../layouts/AdminLayout'
import LoginPage from '../pages/Login'
import DashboardPage from '../pages/Dashboard'
import TemplatesPage from '../pages/Templates'
import PersonnelPage from '../pages/Personnel'
import SchedulingPage from '../pages/Scheduling'
import SchedulingHealthPage from '../pages/SchedulingHealth'
import NotFoundPage from '../pages/NotFound'

const AppRouter = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="personnel" element={<PersonnelPage />} />
        <Route path="scheduling" element={<SchedulingPage />} />
        <Route path="scheduling/health" element={<SchedulingHealthPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </BrowserRouter>
)

export default AppRouter
