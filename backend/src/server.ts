import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import solverProgressService from './services/solverProgressService';
import employeeRoutes from './routes/employees';
import qualificationRoutes from './routes/qualifications';
import employeeQualificationRoutes from './routes/employeeQualifications';
import qualificationMatrixRoutes from './routes/qualificationMatrix';
import operationRoutes from './routes/operations';
import operationQualificationRoutes from './routes/operationQualifications';
import operationQualificationRequirementRoutes from './routes/operationQualificationRequirements';
import processTemplateRoutes from './routes/processTemplates';
import processStageRoutes from './routes/processStages';
import stageOperationRoutes from './routes/stageOperations';

import personnelScheduleRoutes from './routes/personnelSchedules';
import batchPlanningRoutes from './routes/batchPlanning';
import calendarRoutes from './routes/calendar';
import constraintRoutes from './routes/constraintRoutes';
import shareGroupRoutes from './routes/shareGroupRoutes';
import organizationRoutes from './routes/organization';
import organizationHierarchyRoutes from './routes/organizationHierarchy';
import shiftDefinitionRoutes from './routes/shiftDefinitions';
import HolidayScheduler from './scheduler/holidayScheduler';
import HolidayService from './services/holidayService';
import SystemSettingsService from './services/systemSettingsService';
import systemRoutes from './routes/system';
import schedulingV4Routes from './routes/schedulingV4';
import schedulingRoutes from './routes/scheduling';
import dashboardRoutes from './routes/dashboard';
import operationTypesRoutes from './routes/operationTypes';
import batchConstraintsRoutes from './routes/batchConstraints';
import batchGanttV4Routes from './routes/batchGanttV4';
import batchGanttV5Routes from './routes/batchGanttV5';
import personnelSchedulesV2Routes from './routes/personnelSchedulesV2';
import unavailabilityRoutes from './routes/unavailabilityRoutes';
import resourcesRoutes from './routes/resources';
import templateStageOperationResourceRoutes from './routes/templateStageOperationResources';
import batchOperationResourceRoutes from './routes/batchOperationResources';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsEnv
  ? allowedOriginsEnv.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!allowedOrigins || !allowedOrigins.length) {
        callback(null, true);
        return;
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// 系统路由放在最前面
app.use('/api/system', systemRoutes);

app.use('/api/employees', employeeRoutes);
app.use('/api/qualifications', qualificationRoutes);
app.use('/api/employee-qualifications', employeeQualificationRoutes);
app.use('/api/qualification-matrix', qualificationMatrixRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/operation-qualifications', operationQualificationRoutes);
app.use('/api/operation-qualification-requirements', operationQualificationRequirementRoutes);
app.use('/api/process-templates', processTemplateRoutes);
app.use('/api/process-stages', processStageRoutes);
app.use('/api/stage-operations', stageOperationRoutes);

app.use('/api/personnel-schedules', personnelScheduleRoutes);
app.use('/api/batch-plans', batchPlanningRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/constraints', constraintRoutes);
app.use('/api/share-groups', shareGroupRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/org-structure', organizationHierarchyRoutes);
app.use('/api/shift-definitions', shiftDefinitionRoutes);
app.use('/api/v4/scheduling', schedulingV4Routes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/operation-types', operationTypesRoutes);
app.use('/api', batchConstraintsRoutes);
app.use('/api/personnel-schedules/v2', personnelSchedulesV2Routes);
app.use('/api/unavailability', unavailabilityRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/template-stage-operations', templateStageOperationResourceRoutes);
app.use('/api/batch-operations', batchOperationResourceRoutes);

// V4 Gantt API
app.use('/api/v4/gantt', batchGanttV4Routes);
// V5 Gantt API (Includes Operation Windows)
app.use('/api/v5/gantt', batchGanttV5Routes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'APS Backend API is running' });
});

const frontendBuildPath = path.resolve(__dirname, '../../frontend/build');
if (fs.existsSync(frontendBuildPath)) {
  console.log('Serving frontend build from', frontendBuildPath);
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  app.use('*', (req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      error: 'Route not found',
      method: req.method,
      url: req.originalUrl,
    });
  });
}

// Create HTTP server and attach WebSocket
const server = http.createServer(app);

if (process.env.NODE_ENV !== 'test') {
  // Initialize WebSocket service
  solverProgressService.initialize(server);

  server.listen(Number(PORT), HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
    console.log(`WebSocket available at ws://${HOST}:${PORT}/ws/solver-progress`);
  });

  HolidayScheduler.start();

  // 启动节假日服务缓存清理定时器（每小时清理一次过期缓存）
  setInterval(() => {
    HolidayService.cleanupExpiredCache();
  }, 60 * 60 * 1000); // 1小时

  console.log('节假日API缓存清理定时器已启动');
}

export { server };
export default app
