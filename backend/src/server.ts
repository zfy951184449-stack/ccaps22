import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import employeeRoutes from './routes/employees';
import qualificationRoutes from './routes/qualifications';
import employeeQualificationRoutes from './routes/employeeQualifications';
import qualificationMatrixRoutes from './routes/qualificationMatrix';
import operationRoutes from './routes/operations';
import operationQualificationRoutes from './routes/operationQualifications';
import processTemplateRoutes from './routes/processTemplates';
import processStageRoutes from './routes/processStages';
import stageOperationRoutes from './routes/stageOperations';
import shiftTypeRoutes from './routes/shiftTypes';
import personnelScheduleRoutes from './routes/personnelSchedules';
import batchPlanningRoutes from './routes/batchPlanning';
import calendarRoutes from './routes/calendar';
import constraintRoutes from './routes/constraintRoutes';
import shareGroupRoutes from './routes/shareGroupRoutes';
import schedulingRoutes from './routes/scheduling';
import organizationRoutes from './routes/organization';
import organizationHierarchyRoutes from './routes/organizationHierarchy';
import shiftDefinitionRoutes from './routes/shiftDefinitions';
import HolidayScheduler from './scheduler/holidayScheduler';

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
    credentials: true
  })
);
app.use(express.json());

app.use('/api/employees', employeeRoutes);
app.use('/api/qualifications', qualificationRoutes);
app.use('/api/employee-qualifications', employeeQualificationRoutes);
app.use('/api/qualification-matrix', qualificationMatrixRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/operation-qualifications', operationQualificationRoutes);
app.use('/api/process-templates', processTemplateRoutes);
app.use('/api/process-stages', processStageRoutes);
app.use('/api/stage-operations', stageOperationRoutes);
app.use('/api/shift-types', shiftTypeRoutes);
app.use('/api/personnel-schedules', personnelScheduleRoutes);
app.use('/api/batch-plans', batchPlanningRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/constraints', constraintRoutes);
app.use('/api/share-groups', shareGroupRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/org-structure', organizationHierarchyRoutes);
app.use('/api/shift-definitions', shiftDefinitionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'APS Backend API is running' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
  });

  HolidayScheduler.start();
}

export default app
